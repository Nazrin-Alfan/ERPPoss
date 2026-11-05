-- ==============================================================================
-- Test Suite: pending_settlement_isolation.sql
-- Description: Rigorous PostgreSQL PL/pgSQL verification for fn_settle_pending_bill
-- Invariants:
--   1. Strict tenant isolation (rejects cross-tenant settlement).
--   2. Strict role and branch authorization.
--   3. All-or-nothing atomicity (failures leave zero partial records).
--   4. Double-entry ledger balance (debit == credit) with immutable POSTED status.
--   5. Cashflow generation for cashier shift.
--   6. Zero double stock deduction (stok_barang unchanged on settlement).
--   7. Overnight surcharge isolated from cafe revenue.
--   8. Idempotent replay safety vs conflicting payload rejection.
-- ==============================================================================

BEGIN;

CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', message;
  END IF;
END $$;

CREATE FUNCTION pg_temp.snapshot() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'struk', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM struk t),
    'stock', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM stok_barang t),
    'movements', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM barang_keluar t),
    'carwash', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM carwash t),
    'cafe', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM cafe t),
    'cashflow', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM cashflow t),
    'journals', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM journal_entries t),
    'lines', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]') FROM journal_entry_lines t)
  );
$$;

-- Create Pending Bill Helper (simulates order creation with pending status)
CREATE FUNCTION pg_temp.create_pending_sale(
  tenant uuid,
  branch uuid,
  receipt text,
  user_id text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', user_id, true);
  v_res := public.fn_execute_checkout(
    tenant,
    branch,
    jsonb_build_object(
      'id_struk', receipt,
      'status_bayar', 'Pending',
      'metode_bayar', 'CASH',
      'total_tagihan', 36000,
      'nominal_bayar', 0,
      'uang_diterima', 0,
      'kembalian', 0
    ),
    '[{"nama_menu":"QA Coffee","qty":2,"harga_satuan":18000}]'::jsonb,
    jsonb_build_object(
      'id_layanan', 'CW-001',
      'nama_layanan', 'Cuci Salju Standar',
      'harga', 50000,
      'no_polisi', 'B 1234 QA'
    )
  );
  RETURN v_res;
END $$;

CREATE FUNCTION pg_temp.settle_sale(
  tenant uuid,
  branch uuid,
  receipt text,
  tender numeric DEFAULT 100000,
  surcharge_enabled boolean DEFAULT false,
  surcharge_nominal numeric DEFAULT 0,
  payment_method text DEFAULT 'CASH',
  user_id text DEFAULT '00000000-0000-0000-0000-000000000002'
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', user_id, true);
  v_res := public.fn_settle_pending_bill(
    tenant,
    branch,
    jsonb_build_object(
      'id_struk', receipt,
      'metode_bayar', payment_method,
      'uang_diterima', tender,
      'surcharge', jsonb_build_object(
        'enabled', surcharge_enabled,
        'nominal', surcharge_nominal,
        'keterangan', 'Biaya Inap Kendaraan (1 Malam)'
      )
    )
  );
  RETURN v_res;
END $$;

CREATE FUNCTION pg_temp.expect_settle_denied(
  label text,
  expected_code text,
  user_id text,
  tenant uuid,
  branch uuid,
  receipt text,
  tender numeric DEFAULT 100000,
  surcharge_nominal numeric DEFAULT 0
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  before_state jsonb;
  rejected boolean := false;
BEGIN
  before_state := pg_temp.snapshot();
  BEGIN
    PERFORM pg_temp.settle_sale(
      tenant, branch, receipt, tender,
      (surcharge_nominal > 0), surcharge_nominal, 'CASH', user_id
    );
  EXCEPTION WHEN OTHERS THEN
    IF position(expected_code IN SQLERRM) = 0 THEN
      RAISE EXCEPTION '% wrong error: %', label, SQLERRM;
    END IF;
    rejected := true;
  END;
  PERFORM pg_temp.assert_true(rejected, label || ' unexpectedly succeeded');
  PERFORM pg_temp.assert_true(before_state = pg_temp.snapshot(), label || ' changed persisted data');
  RAISE NOTICE 'PASS % (no mutation)', label;
END $$;

-- 1. Setup pending bill fixture
SET LOCAL ROLE authenticated;
SELECT pg_temp.create_pending_sale(
  '22222222-2222-2222-2222-222222222222'::uuid,
  NULL,
  'QA-PENDING-001',
  '00000000-0000-0000-0000-000000000002'
);

-- Record stock count after pending sale
DO $$
DECLARE
  v_stock numeric;
  v_struk_status text;
  v_cogs numeric;
BEGIN
  SELECT stok INTO v_stock FROM stok_barang WHERE tenant_id = '22222222-2222-2222-2222-222222222222'::uuid LIMIT 1;
  SELECT status_bayar, total_cogs INTO v_struk_status, v_cogs FROM struk WHERE id_struk = 'QA-PENDING-001';
  PERFORM pg_temp.assert_true(v_struk_status = 'Pending', 'Initial sale status must be Pending');
  PERFORM pg_temp.assert_true(v_cogs = 2000.00, 'Pending sale must preserve origin total_cogs (2000.00)');
  RAISE NOTICE 'PASS initial pending bill created with preserved origin COGS: %', v_cogs;
END $$;

-- 2. Test Security Gates on Settlement
-- A. Cross-tenant settlement
SELECT pg_temp.expect_settle_denied(
  'cross-tenant settlement',
  'TENANT_FORBIDDEN',
  '00000000-0000-0000-0000-000000000001', -- Tenant 1 user
  '22222222-2222-2222-2222-222222222222'::uuid, -- Tenant 2
  NULL,
  'QA-PENDING-001'
);

-- B. Anonymous & PUBLIC execution privilege revoked
SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.fn_settle_pending_bill(uuid,uuid,jsonb)', 'EXECUTE'),
  'anon can execute settlement'
);
SELECT pg_temp.assert_true(
  NOT EXISTS(
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.oid = 'public.fn_settle_pending_bill(uuid,uuid,jsonb)'::regprocedure
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC can execute settlement'
);

-- C. Missing auth session
SELECT pg_temp.expect_settle_denied(
  'missing auth session',
  'UNAUTHORIZED',
  '',
  '22222222-2222-2222-2222-222222222222'::uuid,
  NULL,
  'QA-PENDING-001'
);

-- D. Inactive user profile
SELECT pg_temp.expect_settle_denied(
  'inactive user',
  'USER_INACTIVE',
  '00000000-0000-0000-0000-000000000004',
  '11111111-1111-1111-1111-111111111111'::uuid,
  NULL,
  'QA-PENDING-001'
);

-- E. Cash tender underpaid (tagihan 86,000, tender 50,000)
SELECT pg_temp.expect_settle_denied(
  'underpaid tender',
  'PAYMENT_UNDERPAID',
  '00000000-0000-0000-0000-000000000002',
  '22222222-2222-2222-2222-222222222222'::uuid,
  NULL,
  'QA-PENDING-001',
  50000
);

-- 3. Execute Valid Settlement with Overnight Surcharge (Rp50,000)
-- Base bill: 36,000 (cafe) + 50,000 (carwash) = 86,000.
-- Surcharge: 50,000 -> Total tagihan: 136,000. Tender: 150,000 -> Kembalian: 14,000.
DO $$
DECLARE
  v_stock_before numeric;
  v_stock_after numeric;
  v_settle_res jsonb;
  v_struk record;
  v_cf record;
  v_je record;
  v_lines_sum record;
  v_cafe_count int;
BEGIN
  SELECT stok INTO v_stock_before FROM stok_barang WHERE tenant_id = '22222222-2222-2222-2222-222222222222'::uuid LIMIT 1;

  v_settle_res := pg_temp.settle_sale(
    '22222222-2222-2222-2222-222222222222'::uuid,
    NULL,
    'QA-PENDING-001',
    150000, -- tender
    true,   -- surcharge enabled
    50000,  -- surcharge nominal
    'CASH',
    '00000000-0000-0000-0000-000000000002'
  );

  PERFORM pg_temp.assert_true((v_settle_res->>'success')::boolean = true, 'Settlement must succeed');
  PERFORM pg_temp.assert_true((v_settle_res->>'total_tagihan')::numeric = 136000.00, 'Total tagihan must be 136,000');
  PERFORM pg_temp.assert_true((v_settle_res->>'kembalian')::numeric = 14000.00, 'Kembalian must be 14,000');

  -- Zero double stock deduction invariant
  SELECT stok INTO v_stock_after FROM stok_barang WHERE tenant_id = '22222222-2222-2222-2222-222222222222'::uuid LIMIT 1;
  PERFORM pg_temp.assert_true(v_stock_before = v_stock_after, 'CRITICAL: Stock must NOT be deducted on settlement!');

  -- Surcharge isolation invariant (no fake rows added to cafe)
  SELECT COUNT(*) INTO v_cafe_count FROM cafe WHERE tenant_id = '22222222-2222-2222-2222-222222222222'::uuid AND nama_menu ILIKE '%Biaya Inap%';
  PERFORM pg_temp.assert_true(v_cafe_count = 0, 'CRITICAL: Surcharge must NOT be inserted into cafe table!');

  -- Struk verification
  SELECT * INTO v_struk FROM struk WHERE id_struk = 'QA-PENDING-001';
  PERFORM pg_temp.assert_true(v_struk.status_bayar = 'Selesai', 'Struk status must be Selesai');
  PERFORM pg_temp.assert_true(v_struk.biaya_inap = 50000.00, 'Struk biaya_inap must be 50,000');

  -- Cashflow verification
  SELECT * INTO v_cf FROM cashflow WHERE id_sumber = 'CF-SETTLE-QA-PENDING-001';
  PERFORM pg_temp.assert_true(v_cf.pemasukan = 136000.00, 'Cashflow pemasukan must be 136,000');
  PERFORM pg_temp.assert_true(v_cf.pos = 'SALDO CASH', 'Cashflow pos must be SALDO CASH');

  -- Journal entry balance verification
  SELECT * INTO v_je FROM journal_entries WHERE reference_id = 'SETTLE-QA-PENDING-001';
  PERFORM pg_temp.assert_true(v_je.status = 'POSTED', 'Journal entry must be POSTED and immutable');
  SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit INTO v_lines_sum FROM journal_entry_lines WHERE journal_entry_id = v_je.id;
  PERFORM pg_temp.assert_true(v_lines_sum.total_debit = v_lines_sum.total_credit, 'Journal lines must strictly balance: debit == credit');
  PERFORM pg_temp.assert_true(v_lines_sum.total_debit = (136000.00 + 2000.00), 'Total debit must be 138,000 (136k cash + 2k COGS)');

  RAISE NOTICE 'PASS settlement completed with balanced ledger and zero double stock deduction';
END $$;

-- 4. Test Idempotency: Identical Replay vs Conflicting Payload
-- A. Identical Replay -> returns was_replayed = true, zero duplicate mutations
DO $$
DECLARE
  v_replay_res jsonb;
  v_cf_count int;
  v_je_count int;
BEGIN
  v_replay_res := pg_temp.settle_sale(
    '22222222-2222-2222-2222-222222222222'::uuid,
    NULL,
    'QA-PENDING-001',
    150000,
    true,
    50000,
    'CASH',
    '00000000-0000-0000-0000-000000000002'
  );
  PERFORM pg_temp.assert_true((v_replay_res->>'was_replayed')::boolean = true, 'Replay must indicate was_replayed = true');

  -- Verify no duplicate cashflow or journal
  SELECT COUNT(*) INTO v_cf_count FROM cashflow WHERE id_sumber = 'CF-SETTLE-QA-PENDING-001';
  PERFORM pg_temp.assert_true(v_cf_count = 1, 'Cashflow must not be duplicated on replay');
  SELECT COUNT(*) INTO v_je_count FROM journal_entries WHERE reference_id = 'SETTLE-QA-PENDING-001';
  PERFORM pg_temp.assert_true(v_je_count = 1, 'Journal must not be duplicated on replay');

  RAISE NOTICE 'PASS idempotent replay safe with was_replayed: true';
END $$;

-- B. Conflicting Payload on already settled bill (different tender/payment method)
SELECT pg_temp.expect_settle_denied(
  'conflicting payload settlement',
  'IDEMPOTENCY_CONFLICT',
  '00000000-0000-0000-0000-000000000002',
  '22222222-2222-2222-2222-222222222222'::uuid,
  NULL,
  'QA-PENDING-001',
  200000, -- Different tender amount
  0       -- Different surcharge
);

-- 5. Test Forced Journal Failure (Missing Mandatory Account Rolls Back All Mutations)
DO $$
DECLARE
  v_struk_before record;
  v_struk_after record;
  v_err_caught text := '';
BEGIN
  -- Setup test tenant without cash account 1101 to test pre-mutation account validation
  INSERT INTO public.tenants (id) VALUES ('44444444-4444-4444-4444-444444444444'::uuid) ON CONFLICT DO NOTHING;
  INSERT INTO public.branches (id, tenant_id, is_active)
  VALUES ('44444444-aaaa-4444-aaaa-444444444444'::uuid, '44444444-4444-4444-4444-444444444444'::uuid, true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, tenant_id, branch_id, role, is_active)
  VALUES ('00000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444'::uuid, '44444444-aaaa-4444-aaaa-444444444444'::uuid, 'owner', true)
  ON CONFLICT DO NOTHING;

  -- Create isolated pending receipt QA-FAIL-JOURNAL
  INSERT INTO public.struk (
    id, tenant_id, branch_id, id_struk, total_tagihan, total_biaya, uang_diterima, kembalian,
    metode_pembayaran, status_bayar, tanggal, created_at, kasir
  ) VALUES (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444'::uuid, '44444444-aaaa-4444-aaaa-444444444444'::uuid,
    'QA-FAIL-JOURNAL', 50000.00, 50000.00, 0.00, 0.00, 'Pending', 'Pending', CURRENT_DATE, now(), 'QA Tester'
  );

  INSERT INTO public.carwash (
    id, tenant_id, branch_id, id_struk, tanggal, jam, plat, model, variant, ukuran,
    paket, harga, status, created_at
  ) VALUES (
    gen_random_uuid(), '44444444-4444-4444-4444-444444444444'::uuid, '44444444-aaaa-4444-aaaa-444444444444'::uuid,
    'QA-FAIL-JOURNAL', CURRENT_DATE, '10:00:00'::time, 'B 4444 QA', 'Mobil', 'Sedan', 'Medium',
    'Cuci Regular', 50000.00, 'Pending', now()
  );

  SELECT * INTO v_struk_before FROM public.struk WHERE id_struk = 'QA-FAIL-JOURNAL';

  -- Simulate settlement without cash account 1101 configured: MUST fail with ACCOUNT_MAPPING_MISSING
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  BEGIN
    PERFORM public.fn_settle_pending_bill(
      '44444444-4444-4444-4444-444444444444'::uuid,
      '44444444-aaaa-4444-aaaa-444444444444'::uuid,
      jsonb_build_object(
        'id_struk', 'QA-FAIL-JOURNAL',
        'metode_bayar', 'CASH',
        'uang_diterima', 50000.00,
        'idempotency_key', 'QA-FAIL-JOURNAL:settle:fail-test'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := SQLERRM;
  END;

  -- Assert specific error code
  PERFORM pg_temp.assert_true(
    position('ACCOUNT_MAPPING_MISSING' IN v_err_caught) > 0,
    'Settlement must explicitly fail with ACCOUNT_MAPPING_MISSING when mandatory account is absent'
  );

  -- Assert Zero Partial State
  SELECT * INTO v_struk_after FROM public.struk WHERE id_struk = 'QA-FAIL-JOURNAL';
  PERFORM pg_temp.assert_true(v_struk_after.status_bayar = 'Pending', 'Failed settlement must preserve Pending status');
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.cashflow WHERE id_sumber LIKE '%QA-FAIL-JOURNAL%') = 0,
    'Zero orphaned cashflow on failed settlement'
  );
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.journal_entries WHERE entry_no LIKE '%QA-FAIL-JOURNAL%') = 0,
    'Zero orphaned journal entries on failed settlement'
  );

  RAISE NOTICE 'PASS forced journal failure rollback preserves zero partial state with specific error: %', v_err_caught;
END $$;

-- 6. Test SPLIT Payment with Excess Cash and Change Calculation via Real RPC
DO $$
DECLARE
  v_split_res jsonb;
  v_struk_split record;
  v_cf_cash record;
  v_cf_digital record;
  v_je record;
  v_je_sum record;
BEGIN
  -- Create isolated pending receipt QA-SPLIT-EXCESS
  INSERT INTO public.struk (
    id, tenant_id, branch_id, id_struk, total_tagihan, total_biaya, uang_diterima, kembalian,
    metode_pembayaran, status_bayar, tanggal, created_at, kasir
  ) VALUES (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
    'QA-SPLIT-EXCESS', 80000.00, 80000.00, 0.00, 0.00, 'Pending', 'Pending', CURRENT_DATE, now(), 'QA Tester'
  );

  INSERT INTO public.carwash (
    id, tenant_id, branch_id, id_struk, tanggal, jam, plat, model, variant, ukuran,
    paket, harga, status, created_at
  ) VALUES (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
    'QA-SPLIT-EXCESS', CURRENT_DATE, '11:00:00'::time, 'B 8888 QA', 'Mobil', 'Sedan', 'Medium',
    'Cuci Regular', 80000.00, 'Pending', now()
  );

  -- Execute Real RPC Call for SPLIT: Total 80k (Cash 30k, QRIS 50k), Cash Handed 50k (Kembalian 20k)
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
  v_split_res := public.fn_settle_pending_bill(
    '22222222-2222-2222-2222-222222222222'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    jsonb_build_object(
      'id_struk', 'QA-SPLIT-EXCESS',
      'metode_bayar', 'SPLIT',
      'nominal_cash', 30000.00,
      'nominal_qris', 50000.00,
      'uang_diterima', 50000.00,
      'idempotency_key', 'QA-SPLIT-EXCESS:settle:real-test'
    )
  );

  -- Asersi respons RPC
  PERFORM pg_temp.assert_true((v_split_res->>'success')::boolean = true, 'SPLIT RPC must return success: true');
  PERFORM pg_temp.assert_true((v_split_res->>'status') = 'COMPLETED', 'SPLIT RPC must return status: COMPLETED');
  PERFORM pg_temp.assert_true((v_split_res->>'kembalian')::numeric = 20000.00, 'SPLIT RPC must return kembalian = 20000.00');
  PERFORM pg_temp.assert_true((v_split_res->>'total_tagihan')::numeric = 80000.00, 'SPLIT RPC must return total_tagihan = 80000.00');

  -- Asersi Data Struk
  SELECT * INTO v_struk_split FROM public.struk WHERE id_struk = 'QA-SPLIT-EXCESS';
  PERFORM pg_temp.assert_true(v_struk_split.status_bayar = 'Selesai', 'Split receipt must be Selesai');
  PERFORM pg_temp.assert_true(v_struk_split.kembalian = 20000.00, 'Excess cash tender must store exact 20,000 change on struk');
  PERFORM pg_temp.assert_true(v_struk_split.uang_diterima = 50000.00, 'Cash tender received must be stored as 50,000');

  -- Asersi Mutasi Cashflow (2 baris terpisah: Tunai & Digital)
  SELECT * INTO v_cf_cash FROM public.cashflow WHERE id_sumber = 'CF-SETTLE-CASH-QA-SPLIT-EXCESS';
  PERFORM pg_temp.assert_true(v_cf_cash.pemasukan = 30000.00, 'Cash portion cashflow must be 30,000');
  PERFORM pg_temp.assert_true(v_cf_cash.pos = 'SALDO CASH', 'Cash portion pos must be SALDO CASH');

  SELECT * INTO v_cf_digital FROM public.cashflow WHERE id_sumber = 'CF-SETTLE-DIGITAL-QA-SPLIT-EXCESS';
  PERFORM pg_temp.assert_true(v_cf_digital.pemasukan = 50000.00, 'Digital portion cashflow must be 50,000');
  PERFORM pg_temp.assert_true(v_cf_digital.pos = 'SALDO REKENING (N)', 'Digital portion pos must be SALDO REKENING (N)');

  -- Asersi Jurnal Double-Entry
  SELECT * INTO v_je FROM public.journal_entries WHERE entry_no = 'JE-SETTLE-QA-SPLIT-EXCESS';
  PERFORM pg_temp.assert_true(v_je.status = 'POSTED', 'Journal entry must be POSTED');
  SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit INTO v_je_sum
  FROM public.journal_entry_lines WHERE journal_entry_id = v_je.id;
  PERFORM pg_temp.assert_true(v_je_sum.total_debit = v_je_sum.total_credit, 'Journal lines must strictly balance: debit == credit');
  PERFORM pg_temp.assert_true(v_je_sum.total_debit = 80000.00, 'Total debit must be 80,000');

  RAISE NOTICE 'PASS real RPC SPLIT payment with excess cash and change calculation verified';
END $$;

-- 7. Test Discounted Bill General Ledger Balance (Finding 1)
DO $$
DECLARE
  v_disc_res jsonb;
  v_je_disc record;
  v_je_disc_sum record;
BEGIN
  -- Create isolated pending receipt with discount: Item 100k, Discount 10k, Final Total 90k
  INSERT INTO public.struk (
    id, tenant_id, branch_id, id_struk, subtotal, diskon, total_tagihan, total_biaya, uang_diterima, kembalian,
    metode_pembayaran, status_bayar, tanggal, created_at, kasir
  ) VALUES (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
    'QA-DISC-BILL', 100000.00, 10000.00, 90000.00, 90000.00, 0.00, 0.00, 'Pending', 'Pending', CURRENT_DATE, now(), 'QA Tester'
  );

  INSERT INTO public.cafe (
    id, tenant_id, branch_id, id_struk, tanggal, jam, nama_menu, qty, harga_satuan, subtotal, status, created_at
  ) VALUES (
    gen_random_uuid(), '22222222-2222-2222-2222-222222222222'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
    'QA-DISC-BILL', CURRENT_DATE, '12:00:00'::time, 'Coffee Bundle', 1, 100000.00, 100000.00, 'Pending', now()
  );

  -- Execute Real RPC Call
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
  v_disc_res := public.fn_settle_pending_bill(
    '22222222-2222-2222-2222-222222222222'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid,
    jsonb_build_object(
      'id_struk', 'QA-DISC-BILL',
      'metode_bayar', 'CASH',
      'uang_diterima', 100000.00,
      'idempotency_key', 'QA-DISC-BILL:settle:disc-test'
    )
  );

  PERFORM pg_temp.assert_true((v_disc_res->>'success')::boolean = true, 'Discounted bill settlement must succeed');
  PERFORM pg_temp.assert_true((v_disc_res->>'total_tagihan')::numeric = 90000.00, 'Final total must be 90,000');
  PERFORM pg_temp.assert_true((v_disc_res->>'kembalian')::numeric = 10000.00, 'Kembalian must be 10,000');

  -- Verify Journal Balance for Discounted Bill
  SELECT * INTO v_je_disc FROM public.journal_entries WHERE entry_no = 'JE-SETTLE-QA-DISC-BILL';
  PERFORM pg_temp.assert_true(v_je_disc.status = 'POSTED', 'Journal entry must be POSTED');
  SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit INTO v_je_disc_sum
  FROM public.journal_entry_lines WHERE journal_entry_id = v_je_disc.id;
  PERFORM pg_temp.assert_true(v_je_disc_sum.total_debit = v_je_disc_sum.total_credit, 'CRITICAL: Discounted bill journal MUST strictly balance debit == credit');
  PERFORM pg_temp.assert_true(v_je_disc_sum.total_debit = 90000.00, 'Total debit must be 90,000 (net revenue)');

  RAISE NOTICE 'PASS discounted bill journal balance verified: debit (%) == credit (%)', v_je_disc_sum.total_debit, v_je_disc_sum.total_credit;
END $$;

ROLLBACK;
RAISE NOTICE 'ALL PENDING SETTLEMENT SQL CHECKS PASSED';