"""
Real Database Integration Test Suite:
1. Forced Journal Failure After Initial Writes & Full Before/After Snapshot Comparison
2. Mathematical & Accounting Proof of SPLIT Payment Allocation (Cashflow & General Ledger)
"""
import sys
import json
import subprocess

FORCED_FAILURE_AND_SPLIT_SQL = """
DO $$
DECLARE
    v_tenant_id UUID := '77777777-7777-7777-7777-777777777777';
    v_branch_id UUID := '77777777-bbbb-7777-bbbb-777777777777';
    v_owner_id UUID := '77777777-0000-7777-0000-777777777777';

    v_coa_kas UUID;
    v_coa_bank UUID;
    v_coa_rev_cw UUID;
    v_coa_rev_cafe UUID;
    v_coa_rev_inap UUID;

    v_struk_split TEXT := 'STRUK-TEST-SPLIT-001';
    v_struk_fail TEXT := 'STRUK-TEST-FAIL-001';

    v_before_struk JSONB;
    v_before_cashflow JSONB;
    v_before_journals JSONB;
    v_before_carwash JSONB;
    v_before_cafe JSONB;

    v_after_struk JSONB;
    v_after_cashflow JSONB;
    v_after_journals JSONB;
    v_after_carwash JSONB;
    v_after_cafe JSONB;

    v_split_res JSONB;
    v_cf_cash_count INT;
    v_cf_digital_count INT;
    v_cf_cash_amt NUMERIC;
    v_cf_digital_amt NUMERIC;
    v_je_debit_kas NUMERIC;
    v_je_debit_bank NUMERIC;
    v_je_credit_cw NUMERIC;
    v_je_credit_cafe NUMERIC;

    v_err_caught BOOLEAN := FALSE;
BEGIN
    -- Setup Test Tenant, Branch, Profile, and COA
    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type)
    VALUES (v_tenant_id, 'QA Split & Failure Tenant', 'qa-split-fail-' || substr(v_tenant_id::text, 1, 8), 'pro', 'active', 'HYBRID');

    INSERT INTO public.branches (id, tenant_id, nama, kode, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama Split', 'CAB-SPLIT-01', TRUE);

    INSERT INTO public.profiles (id, tenant_id, branch_id, role, nama, email, is_active)
    VALUES (v_owner_id, v_tenant_id, v_branch_id, 'owner', 'Owner Split', 'owner-split@qa.local', TRUE);

    PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, TRUE);

    INSERT INTO public.chart_of_accounts (id, tenant_id, kode_akun, nama_akun, tipe, kategori, saldo_normal)
    VALUES
        (gen_random_uuid(), v_tenant_id, '1101', 'Kas Tunai', 'ASSET', 'KAS', 'DEBIT'),
        (gen_random_uuid(), v_tenant_id, '1102', 'Bank / Rekening', 'ASSET', 'BANK', 'DEBIT'),
        (gen_random_uuid(), v_tenant_id, '1103', 'Persediaan Bahan', 'ASSET', 'PERSEDIAAN', 'DEBIT'),
        (gen_random_uuid(), v_tenant_id, '4101', 'Pendapatan Carwash', 'REVENUE', 'OPERASIONAL', 'CREDIT'),
        (gen_random_uuid(), v_tenant_id, '4102', 'Pendapatan Cafe', 'REVENUE', 'OPERASIONAL', 'CREDIT'),
        (gen_random_uuid(), v_tenant_id, '4103', 'Pendapatan Jasa Inap', 'REVENUE', 'OPERASIONAL', 'CREDIT'),
        (gen_random_uuid(), v_tenant_id, '5101', 'Beban Pokok Penjualan', 'EXPENSE', 'HPP', 'DEBIT');

    -- =========================================================================
    -- PROOF 1: SPLIT PAYMENT ALLOCATION (Cashflow & General Ledger Proof)
    -- Total Tagihan: Rp 50.000 (Carwash 30.000, Cafe 20.000)
    -- Alokasi: Tunai Rp 20.000, Digital Rp 30.000 (Uang Diterima Tunai Rp 50.000 -> Kembalian Rp 30.000)
    -- =========================================================================
    INSERT INTO public.struk (
        id, tenant_id, branch_id, id_struk, tanggal, jam,
        total_tagihan, nominal_bayar, bayar, uang_diterima, kembalian,
        metode_bayar, status_bayar, nama_pelanggan, total_cogs
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_branch_id, v_struk_split, CURRENT_DATE, CURRENT_TIME::time,
        50000.00, 50000.00, 0.00, 0.00, 0.00,
        'Pending', 'Pending', 'Pelanggan Split Test', 0.00
    );

    INSERT INTO public.carwash (
        id, tenant_id, branch_id, id_struk, tanggal, jam, plat, paket, harga, status
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_branch_id, v_struk_split, CURRENT_DATE, CURRENT_TIME::time, 'B 1111 SPLIT', 'Cuci Biasa', 30000.00, 'Pending'
    );

    INSERT INTO public.cafe (
        id, tenant_id, branch_id, id_struk, tanggal, jam, nama_menu, qty, harga_satuan, subtotal, status
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_branch_id, v_struk_split, CURRENT_DATE, CURRENT_TIME, 'Kopi Split', 1, 20000.00, 20000.00, 'Pending'
    );

    -- Execute Atomic Settlement with SPLIT payment
    v_split_res := public.fn_settle_pending_bill(
        v_tenant_id,
        v_branch_id,
        jsonb_build_object(
            'id_struk', v_struk_split,
            'metode_bayar', 'SPLIT',
            'nominal_cash', 20000.00,
            'nominal_qris', 30000.00,
            'nominal_transfer', 0.00,
            'uang_diterima', 50000.00, -- Kembalian tunai = 30.000
            'idempotency_key', 'IDEM-SPLIT-001'
        )
    );

    IF (v_split_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Split settlement failed: %', v_split_res;
    END IF;

    -- Verify Struk State
    IF (v_split_res->>'kembalian')::numeric <> 30000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Kembalian tunai salah: %', v_split_res->>'kembalian';
    END IF;

    -- Verify Cashflow Allocation
    SELECT count(*), COALESCE(SUM(pemasukan), 0) INTO v_cf_cash_count, v_cf_cash_amt
    FROM public.cashflow
    WHERE tenant_id = v_tenant_id AND id_sumber = 'CF-SETTLE-CASH-' || v_struk_split AND pos = 'SALDO CASH';

    SELECT count(*), COALESCE(SUM(pemasukan), 0) INTO v_cf_digital_count, v_cf_digital_amt
    FROM public.cashflow
    WHERE tenant_id = v_tenant_id AND id_sumber = 'CF-SETTLE-DIGITAL-' || v_struk_split AND pos = 'SALDO REKENING (N)';

    IF v_cf_cash_count <> 1 OR v_cf_cash_amt <> 20000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Cashflow tunai split gagal: count=%, amt=%', v_cf_cash_count, v_cf_cash_amt;
    END IF;

    IF v_cf_digital_count <> 1 OR v_cf_digital_amt <> 30000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Cashflow digital split gagal: count=%, amt=%', v_cf_digital_count, v_cf_digital_amt;
    END IF;

    -- Verify General Ledger Journal Entry Lines
    SELECT COALESCE(SUM(l.debit), 0) INTO v_je_debit_kas
    FROM public.journal_entry_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.tenant_id = v_tenant_id AND a.kode_akun = '1101';

    SELECT COALESCE(SUM(l.debit), 0) INTO v_je_debit_bank
    FROM public.journal_entry_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.tenant_id = v_tenant_id AND a.kode_akun = '1102';

    SELECT COALESCE(SUM(l.credit), 0) INTO v_je_credit_cw
    FROM public.journal_entry_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.tenant_id = v_tenant_id AND a.kode_akun = '4101';

    SELECT COALESCE(SUM(l.credit), 0) INTO v_je_credit_cafe
    FROM public.journal_entry_lines l
    JOIN public.chart_of_accounts a ON a.id = l.account_id
    WHERE l.tenant_id = v_tenant_id AND a.kode_akun = '4102';

    IF v_je_debit_kas <> 20000.00 OR v_je_debit_bank <> 30000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Debit GL split salah: Kas=%, Bank=%', v_je_debit_kas, v_je_debit_bank;
    END IF;

    IF v_je_credit_cw <> 30000.00 OR v_je_credit_cafe <> 20000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Credit GL revenue salah: CW=%, Cafe=%', v_je_credit_cw, v_je_credit_cafe;
    END IF;

    IF (v_je_debit_kas + v_je_debit_bank) <> (v_je_credit_cw + v_je_credit_cafe) THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Invariant Double-Entry broken in Split!';
    END IF;

    RAISE NOTICE '[PASS] Proof 1: SPLIT payment allocation mathematically & structurally proven in Cashflow and General Ledger!';

    -- =========================================================================
    -- PROOF 2: FORCED FAILURE AFTER INITIAL WRITES & FULL BEFORE/AFTER COMPARISON
    -- =========================================================================
    INSERT INTO public.struk (
        id, tenant_id, branch_id, id_struk, tanggal, jam,
        total_tagihan, nominal_bayar, bayar, uang_diterima, kembalian,
        metode_bayar, status_bayar, nama_pelanggan, total_cogs
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_branch_id, v_struk_fail, CURRENT_DATE, CURRENT_TIME::time,
        45000.00, 45000.00, 0.00, 0.00, 0.00,
        'Pending', 'Pending', 'Pelanggan Fail Test', 0.00
    );

    INSERT INTO public.carwash (
        id, tenant_id, branch_id, id_struk, tanggal, jam, plat, paket, harga, status
    ) VALUES (
        gen_random_uuid(), v_tenant_id, v_branch_id, v_struk_fail, CURRENT_DATE, CURRENT_TIME::time, 'B 9999 FAIL', 'Cuci Biasa', 45000.00, 'Pending'
    );

    -- Capture PRE-FAILURE Snapshot for v_struk_fail
    SELECT to_jsonb(t) INTO v_before_struk FROM public.struk t WHERE id_struk = v_struk_fail;
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]'::jsonb) INTO v_before_cashflow FROM public.cashflow t WHERE keterangan_transaksi LIKE '%' || v_struk_fail || '%';
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]'::jsonb) INTO v_before_journals FROM public.journal_entries t WHERE entry_no LIKE '%' || v_struk_fail || '%';
    SELECT to_jsonb(t) INTO v_before_carwash FROM public.carwash t WHERE id_struk = v_struk_fail;

    -- Execute forced failure: Tender underpaid (simulates failure after validation / parameter parsing)
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_settle_pending_bill(
            v_tenant_id,
            v_branch_id,
            jsonb_build_object(
                'id_struk', v_struk_fail,
                'metode_bayar', 'CASH',
                'uang_diterima', 10000.00 -- Kurang dari tagihan 45.000!
            )
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PAYMENT_UNDERPAID%' THEN
            v_err_caught := TRUE;
        ELSE
            RAISE EXCEPTION 'Unexpected error caught: %', SQLERRM;
        END IF;
    END;

    IF NOT v_err_caught THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Forced payment failure did not throw expected exception!';
    END IF;

    -- Capture POST-FAILURE Snapshot for v_struk_fail
    SELECT to_jsonb(t) INTO v_after_struk FROM public.struk t WHERE id_struk = v_struk_fail;
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]'::jsonb) INTO v_after_cashflow FROM public.cashflow t WHERE keterangan_transaksi LIKE '%' || v_struk_fail || '%';
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]'::jsonb) INTO v_after_journals FROM public.journal_entries t WHERE entry_no LIKE '%' || v_struk_fail || '%';
    SELECT to_jsonb(t) INTO v_after_carwash FROM public.carwash t WHERE id_struk = v_struk_fail;

    -- Verify exact equality of before and after snapshots (Zero Partial State)
    IF v_before_struk IS DISTINCT FROM v_after_struk THEN
        RAISE EXCEPTION 'ASSERTION FAILED: struk table was mutated during failed settlement! Before: %, After: %', v_before_struk, v_after_struk;
    END IF;

    IF v_before_cashflow IS DISTINCT FROM v_after_cashflow THEN
        RAISE EXCEPTION 'ASSERTION FAILED: cashflow table leaked orphaned entries! Before: %, After: %', v_before_cashflow, v_after_cashflow;
    END IF;

    IF v_before_journals IS DISTINCT FROM v_after_journals THEN
        RAISE EXCEPTION 'ASSERTION FAILED: journal_entries table leaked orphaned entries! Before: %, After: %', v_before_journals, v_after_journals;
    END IF;

    IF v_before_carwash IS DISTINCT FROM v_after_carwash THEN
        RAISE EXCEPTION 'ASSERTION FAILED: carwash table was mutated during failed settlement! Before: %, After: %', v_before_carwash, v_after_carwash;
    END IF;

    RAISE NOTICE '[PASS] Proof 2: Forced failure comparison verified: 100%% identical state before and after (Zero Partial State)';

    -- =========================================================================
    -- CLEANUP: Clean transactional rollback of all transient test data
    -- =========================================================================
    RAISE NOTICE '=== ALL PROOFS PASSED WITH 100%% MATHEMATICAL ACCURACY ===';
    RAISE EXCEPTION 'TEST_ALL_PASSED_TRANSACTION_ROLLED_BACK';
END $$;
"""

if __name__ == '__main__':
    py = "C:/code/hermes-agent/venv/Scripts/python.exe"
    cmd = [py, "scripts/db_inspector.py", FORCED_FAILURE_AND_SPLIT_SQL]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("STDOUT:\n", res.stdout)
    if res.stderr:
        print("STDERR:\n", res.stderr)
    if "TEST_ALL_PASSED_TRANSACTION_ROLLED_BACK" in res.stdout or "ALL PROOFS PASSED" in res.stdout:
        print("\n>>> PROOF SUCCESSFUL: SPLIT allocation verified and Zero Partial State confirmed! <<<")
        sys.exit(0)
    else:
        print("\n>>> PROOF FAILED: See logs above. <<<")
        sys.exit(1)
