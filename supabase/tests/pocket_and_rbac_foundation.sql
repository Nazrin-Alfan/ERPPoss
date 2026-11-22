-- ==============================================================================
-- VERIFICATION HARNESS: Pocket Balance Relational Foundation + RBAC Admin Pusat
-- Runs inside BEGIN ... ROLLBACK so production/disposable DB stays 100% clean.
-- ==============================================================================

BEGIN;

CREATE TEMP TABLE pg_temp.pf_results (
    check_id TEXT PRIMARY KEY,
    description TEXT,
    passed BOOLEAN,
    detail TEXT
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.pf_assert(
    p_id TEXT,
    p_desc TEXT,
    p_ok BOOLEAN,
    p_detail TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO pg_temp.pf_results VALUES (p_id, p_desc, p_ok, p_detail)
    ON CONFLICT (check_id) DO UPDATE SET passed = p_ok, detail = p_detail;
END;
$$;

GRANT INSERT, UPDATE, SELECT ON pg_temp.pf_results TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.pf_assert(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- Create isolated synthetic fixtures (rolled back at end)
DO $$
DECLARE
    v_t1 UUID := '10000000-0000-4000-8000-000000000001'::uuid;
    v_t2 UUID := '10000000-0000-4000-8000-000000000002'::uuid;
    v_b1 UUID := '20000000-0000-4000-8000-000000000001'::uuid;
    v_b2 UUID := '20000000-0000-4000-8000-000000000002'::uuid;
    v_b3 UUID := '20000000-0000-4000-8000-000000000003'::uuid;
    v_u_owner UUID := '30000000-0000-4000-8000-000000000001'::uuid;
    v_u_pusat UUID := '30000000-0000-4000-8000-000000000002'::uuid;
    v_u_admin_b1 UUID := '30000000-0000-4000-8000-000000000003'::uuid;
    v_u_kasir_b1 UUID := '30000000-0000-4000-8000-000000000004'::uuid;
    v_p_a1 UUID := '40000000-0000-4000-8000-000000000001'::uuid;
    v_p_a2 UUID := '40000000-0000-4000-8000-000000000002'::uuid;
    v_p_hq UUID := '40000000-0000-4000-8000-000000000003'::uuid;
    v_p_b1 UUID := '40000000-0000-4000-8000-000000000004'::uuid;
    v_p_cash UUID := '40000000-0000-4000-8000-000000000005'::uuid;
    v_err TEXT := '';
    v_num NUMERIC;
    v_pos_after TEXT;
    v_cnt INT;
    v_exch JSONB;
BEGIN
    INSERT INTO public.tenants (id, nama, slug, plan, status)
    VALUES
        (v_t1, 'Tenant Uji A', 'tenant-uji-a-pf', 'pro', 'active'),
        (v_t2, 'Tenant Uji B', 'tenant-uji-b-pf', 'pro', 'active');

    INSERT INTO public.tenant_licenses (tenant_id, license_key, plan, tier, status, max_branches, max_users, features, valid_until, expires_at)
    VALUES
        (v_t1, 'PF-TEST-KEY-T1', 'pro', 'PRO', 'ACTIVE', 10, 50, '{}'::jsonb, NOW() + INTERVAL '365 days', NOW() + INTERVAL '365 days'),
        (v_t2, 'PF-TEST-KEY-T2', 'pro', 'PRO', 'ACTIVE', 10, 50, '{}'::jsonb, NOW() + INTERVAL '365 days', NOW() + INTERVAL '365 days');

    INSERT INTO public.branches (id, tenant_id, nama, kode, is_active)
    VALUES
        (v_b1, v_t1, 'Cabang A1', 'A1', TRUE),
        (v_b2, v_t1, 'Cabang A2', 'A2', TRUE),
        (v_b3, v_t2, 'Cabang B1', 'B1', TRUE);

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES
        (v_u_owner, v_t1, v_b1, 'OWNER A', 'owner.pf@test.local', 'Owner', TRUE),
        (v_u_pusat, v_t1, v_b1, 'ADMIN PUSAT A', 'pusat.pf@test.local', 'Admin Pusat', TRUE),
        (v_u_admin_b1, v_t1, v_b1, 'ADMIN CABANG A1', 'admin1.pf@test.local', 'Admin', TRUE),
        (v_u_kasir_b1, v_t1, v_b1, 'KASIR A1', 'kasir1.pf@test.local', 'Kasir', TRUE);

    INSERT INTO public.pos_balances (id, tenant_id, branch_id, pos, label, tipe, balance, is_active)
    VALUES
        (v_p_cash, v_t1, v_b1, 'SALDO CASH', 'Kas Laci A1', 'CASH', 500000, TRUE),
        (v_p_a1, v_t1, v_b1, 'SALDO REKENING Y', 'Mandiri A1', 'BANK', 1000000, TRUE),
        (v_p_a2, v_t1, v_b2, 'SALDO MANDIRI A2', 'Mandiri A2', 'BANK', 200000, TRUE),
        (v_p_hq, v_t1, NULL, 'SALDO HQ MANDIRI', 'Mandiri Pusat', 'BANK', 300000, TRUE),
        (v_p_b1, v_t2, v_b3, 'SALDO BANK B1', 'Bank Tenant B', 'BANK', 999000, TRUE);

    -- CHECK 1: UNIQUE NULLS NOT DISTINCT rejects duplicate NULL-branch pocket
    v_err := '';
    BEGIN
        INSERT INTO public.pos_balances (tenant_id, branch_id, pos, label, tipe, balance)
        VALUES (v_t1, NULL, 'SALDO HQ MANDIRI', 'Duplikat HQ', 'BANK', 0);
    EXCEPTION WHEN unique_violation THEN
        v_err := SQLERRM;
    END;
    PERFORM pg_temp.pf_assert('PF-01', 'UNIQUE NULLS NOT DISTINCT blocks duplicate NULL-branch pocket', v_err <> '', COALESCE(v_err, 'ALLOWED'));

    -- CHECK 2: Composite FK blocks cross-tenant pocket_id on cashflow
    v_err := '';
    BEGIN
        INSERT INTO public.cashflow (tenant_id, branch_id, pocket_id, tanggal, keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran, pos)
        VALUES (v_t1, v_b1, v_p_b1, CURRENT_DATE, 'Cross tenant attack', 'Pengeluaran', 'Test', 0, 1000, 'SALDO BANK B1');
    EXCEPTION WHEN foreign_key_violation THEN
        v_err := SQLERRM;
    END;
    PERFORM pg_temp.pf_assert('PF-02', 'Composite FK blocks cross-tenant pocket_id', v_err <> '', COALESCE(v_err, 'ALLOWED'));

    -- CHECK 3: Legacy alias SALDO REKENING (N) resolves to active BANK pocket_id
    INSERT INTO public.cashflow (id, tenant_id, branch_id, tanggal, keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran, pos)
    VALUES ('50000000-0000-4000-8000-000000000001'::uuid, v_t1, v_b1, CURRENT_DATE, 'POS Digital Legacy', 'Pemasukan', 'Pendapatan Kasir', 50000, 0, 'SALDO REKENING (N)');

    SELECT pos INTO v_pos_after FROM public.cashflow WHERE id = '50000000-0000-4000-8000-000000000001'::uuid;
    PERFORM pg_temp.pf_assert('PF-03', 'Alias SALDO REKENING (N) auto-normalizes to SALDO REKENING Y', v_pos_after = 'SALDO REKENING Y', 'pos=' || COALESCE(v_pos_after, 'NULL'));

    -- CHECK 4: Rename propagation preserves cashflow & v_pocket_balances
    UPDATE public.pos_balances SET pos = 'SALDO MANDIRI OPS A1' WHERE id = v_p_a1;
    SELECT pos INTO v_pos_after FROM public.cashflow WHERE id = '50000000-0000-4000-8000-000000000001'::uuid;
    SELECT current_balance INTO v_num FROM public.v_pocket_balances WHERE id = v_p_a1;
    PERFORM pg_temp.pf_assert('PF-04', 'Rename propagates to cashflow.pos & keeps balance 1,050,000', v_pos_after = 'SALDO MANDIRI OPS A1' AND v_num = 1050000, 'pos=' || v_pos_after || ', bal=' || v_num);

    -- CHECK 5: Hard-delete protected by ON DELETE RESTRICT
    v_err := '';
    BEGIN
        DELETE FROM public.pos_balances WHERE id = v_p_a1;
    EXCEPTION WHEN foreign_key_violation THEN
        v_err := SQLERRM;
    END;
    PERFORM pg_temp.pf_assert('PF-05', 'ON DELETE RESTRICT blocks deleting pocket with cashflow', v_err <> '', COALESCE(v_err, 'DELETED'));

    -- CHECK 6: Money exchange RPC does NOT mutate pos_balances.balance (no double-count)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_kasir_b1::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_kasir_b1::text, true);
    v_exch := public.fn_record_cashier_money_exchange(v_t1, v_b1, 'KASIR A1', 100000, 102000, 'Budi', CURRENT_DATE);
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    SELECT balance INTO v_num FROM public.pos_balances WHERE id = v_p_cash;
    PERFORM pg_temp.pf_assert(
        'PF-06',
        'Money exchange keeps opening balance 500,000 & returns live cash_balance 400,000',
        v_num = 500000 AND (v_exch->>'cash_balance')::numeric = 400000,
        'opening=' || v_num || ', returned_cash=' || COALESCE(v_exch->>'cash_balance', 'NULL')
    );

    -- Seed branch-scoped stock for RBAC checks
    INSERT INTO public.stok_barang (tenant_id, branch_id, nama_produk, satuan, stok, harga_satuan)
    VALUES
        (v_t1, v_b1, 'Shampoo A1', 'ml', 100, 10),
        (v_t1, v_b2, 'Shampoo A2', 'ml', 200, 10),
        (v_t2, v_b3, 'Shampoo B1', 'ml', 300, 10);
END $$;

-- RLS VERIFICATION AS AUTHENTICATED ROLE
SET LOCAL ROLE authenticated;

-- CHECK 7: Admin Cabang A1 sees ONLY Branch A1 pockets (no A2, no HQ null, no Tenant B)
DO $$
DECLARE
    v_u_admin_b1 UUID := '30000000-0000-4000-8000-000000000003'::uuid;
    v_b1 UUID := '20000000-0000-4000-8000-000000000001'::uuid;
    v_total INT;
    v_other INT;
    v_stok_other INT;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_admin_b1::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_admin_b1::text, true);

    SELECT COUNT(*) INTO v_total FROM public.v_pocket_balances;
    SELECT COUNT(*) INTO v_other FROM public.v_pocket_balances WHERE branch_id IS DISTINCT FROM v_b1;
    SELECT COUNT(*) INTO v_stok_other FROM public.stok_barang WHERE branch_id IS DISTINCT FROM v_b1;

    PERFORM pg_temp.pf_assert(
        'PF-07',
        'Admin Cabang A1 strictly isolated to Branch A1 on v_pocket_balances & stok_barang',
        v_total = 2 AND v_other = 0 AND v_stok_other = 0,
        'pockets=' || v_total || ', other_branch_pockets=' || v_other || ', other_branch_stok=' || v_stok_other
    );
END $$;

-- CHECK 8: Admin Pusat sees ALL branches + HQ in Tenant A (4 pockets), 0 rows from Tenant B
DO $$
DECLARE
    v_u_pusat UUID := '30000000-0000-4000-8000-000000000002'::uuid;
    v_t1 UUID := '10000000-0000-4000-8000-000000000001'::uuid;
    v_t2 UUID := '10000000-0000-4000-8000-000000000002'::uuid;
    v_pockets_t1 INT;
    v_pockets_t2 INT;
    v_stok_t1 INT;
    v_stok_t2 INT;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_pusat::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_pusat::text, true);

    SELECT COUNT(*) INTO v_pockets_t1 FROM public.v_pocket_balances WHERE tenant_id = v_t1;
    SELECT COUNT(*) INTO v_pockets_t2 FROM public.v_pocket_balances WHERE tenant_id = v_t2;
    SELECT COUNT(*) INTO v_stok_t1 FROM public.stok_barang WHERE tenant_id = v_t1;
    SELECT COUNT(*) INTO v_stok_t2 FROM public.stok_barang WHERE tenant_id = v_t2;

    PERFORM pg_temp.pf_assert(
        'PF-08',
        'Admin Pusat sees all Tenant A branches+HQ (4 pockets, 2 stocks) and 0 rows from Tenant B',
        v_pockets_t1 = 4 AND v_pockets_t2 = 0 AND v_stok_t1 = 2 AND v_stok_t2 = 0,
        't1_pockets=' || v_pockets_t1 || ', t2_pockets=' || v_pockets_t2 || ', t1_stok=' || v_stok_t1 || ', t2_stok=' || v_stok_t2
    );
END $$;

-- CHECK 9: Admin Pusat blocked from escalating or mutating Owner profile
DO $$
DECLARE
    v_u_pusat UUID := '30000000-0000-4000-8000-000000000002'::uuid;
    v_u_owner UUID := '30000000-0000-4000-8000-000000000001'::uuid;
    v_err TEXT := '';
    v_rows INT := 0;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_pusat::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_pusat::text, true);
    BEGIN
        UPDATE public.profiles SET is_active = FALSE WHERE id = v_u_owner;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    PERFORM pg_temp.pf_assert('PF-09', 'Admin Pusat blocked from deactivating Owner', (v_rows = 0 OR v_err <> ''), 'rows=' || v_rows || ', err=' || v_err);
END $$;

-- CHECK 10: Kasir still gets 0 rows on v_pocket_balances (PR-3 preserved)
DO $$
DECLARE
    v_u_kasir UUID := '30000000-0000-4000-8000-000000000004'::uuid;
    v_cnt INT;
BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_kasir::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_kasir::text, true);

    SELECT COUNT(*) INTO v_cnt FROM public.v_pocket_balances;
    PERFORM pg_temp.pf_assert('PF-10', 'Kasir gets 0 rows from v_pocket_balances (PR-3)', v_cnt = 0, 'cnt=' || v_cnt);
END $$;

RESET ROLE;

SELECT check_id, description, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status, detail
FROM pg_temp.pf_results
ORDER BY check_id;

ROLLBACK;
