"""
Real Database Regression Test Suite for Checkout RPC (fn_execute_checkout)
Executes directly against Supabase Cloud PostgreSQL with clean transactional rollback.
Tests:
1. Missing Authentication (UNAUTHORIZED)
2. Cross-Tenant Forbidden (TENANT_FORBIDDEN)
3. Insufficient Stock Rollback (INSUFFICIENT_STOCK)
4. Underpaid Cash Tender (PAYMENT_UNDERPAID)
5. Valid Checkout: Tender Rp 50.000, Bill Rp 36.000, Change Rp 14.000, BOM Stock Deduction, Origin COGS Snapshot
6. Equal Debit/Credit Journal Auto-Posting & Cashflow Net Sale
7. Idempotent Replay (Zero duplicate mutations)
"""
import sys
import subprocess

CHECKOUT_REGRESSION_SQL = """
DO $$
DECLARE
    v_tenant_id UUID := '99999999-9999-9999-9999-999999999999';
    v_tenant_victim UUID := '99999999-8888-9999-8888-999999999999';
    v_branch_id UUID := '99999999-bbbb-9999-bbbb-999999999999';
    v_owner_id UUID := '99999999-0000-9999-0000-999999999999';

    v_stock_id UUID := gen_random_uuid();
    v_checkout_res JSONB;
    v_replay_res JSONB;
    v_err_caught BOOLEAN := FALSE;

    v_stok_rem NUMERIC;
    v_cf_count INT;
    v_cf_amt NUMERIC;
    v_je_status TEXT;
    v_debit_total NUMERIC;
    v_credit_total NUMERIC;
    v_struk_cogs NUMERIC;
    v_bk_count INT;
    v_bk_unit_cost NUMERIC;
    v_bk_tot_cost NUMERIC;
BEGIN
    -- Setup Test Tenants
    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type)
    VALUES
        (v_tenant_id, 'QA Checkout Tenant', 'qa-chk-' || substr(v_tenant_id::text, 1, 8), 'pro', 'active', 'HYBRID'),
        (v_tenant_victim, 'QA Victim Tenant', 'qa-vic-' || substr(v_tenant_victim::text, 1, 8), 'pro', 'active', 'HYBRID');

    INSERT INTO public.branches (id, tenant_id, nama, kode, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama Checkout', 'CAB-CHK-01', TRUE);

    INSERT INTO public.profiles (id, tenant_id, branch_id, role, nama, email, is_active)
    VALUES (v_owner_id, v_tenant_id, v_branch_id, 'owner', 'Owner Checkout', 'owner-chk@qa.local', TRUE);

    INSERT INTO public.chart_of_accounts (id, tenant_id, kode_akun, nama_akun, tipe, kategori, saldo_normal)
    VALUES
        (gen_random_uuid(), v_tenant_id, '1101', 'Kas Tunai', 'ASSET', 'KAS', 'DEBIT'),
        (gen_random_uuid(), v_tenant_id, '1102', 'Bank', 'ASSET', 'BANK', 'DEBIT'),
        (gen_random_uuid(), v_tenant_id, '1103', 'Persediaan', 'ASSET', 'PERSEDIAAN', 'DEBIT'),
        (gen_random_uuid(), v_tenant_id, '4101', 'Pendapatan Carwash', 'REVENUE', 'OPERASIONAL', 'CREDIT'),
        (gen_random_uuid(), v_tenant_id, '4102', 'Pendapatan Cafe', 'REVENUE', 'OPERASIONAL', 'CREDIT'),
        (gen_random_uuid(), v_tenant_id, '5101', 'HPP', 'EXPENSE', 'HPP', 'DEBIT');

    -- Setup Stock & Menu Recipe BOM
    -- 10.00 kg Beans with cost Rp 50.000 / kg (unit cost)
    INSERT INTO public.stok_barang (id, tenant_id, branch_id, nama_barang, nama_produk, satuan, stok, stok_akhir, harga_beli, harga_satuan)
    VALUES (v_stock_id, v_tenant_id, v_branch_id, 'QA Beans', 'QA Beans', 'kg', 10.000, 10.000, 50000.00, 50000.00);

    INSERT INTO public.resep (id, tenant_id, nama_menu, nama_bahan, jumlah, jumlah_dibutuhkan, satuan)
    VALUES (gen_random_uuid(), v_tenant_id, 'QA Coffee', 'QA Beans', 0.020, 0.020, 'kg');

    -- =========================================================================
    -- TEST 1: Missing Authentication
    -- =========================================================================
    PERFORM set_config('request.jwt.claim.sub', '', TRUE);
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_execute_checkout(
            v_tenant_id, v_branch_id,
            jsonb_build_object('id_struk', 'QA-NOAUTH', 'status_bayar', 'Selesai', 'metode_bayar', 'CASH', 'nominal_bayar', 36000, 'uang_diterima', 50000),
            '[]'::jsonb, NULL
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%UNAUTHORIZED%' THEN v_err_caught := TRUE; END IF;
    END;
    IF NOT v_err_caught THEN RAISE EXCEPTION 'ASSERTION FAILED: Missing auth not rejected'; END IF;
    RAISE NOTICE '[PASS] Test 1: Missing authentication rejected';

    -- =========================================================================
    -- TEST 2: Cross-Tenant Access
    -- =========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, TRUE);
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_execute_checkout(
            v_tenant_victim, NULL, -- Calling against victim tenant!
            jsonb_build_object('id_struk', 'QA-CROSS', 'status_bayar', 'Selesai', 'metode_bayar', 'CASH', 'nominal_bayar', 36000, 'uang_diterima', 50000),
            '[]'::jsonb, NULL
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%TENANT_FORBIDDEN%' THEN v_err_caught := TRUE; END IF;
    END;
    IF NOT v_err_caught THEN RAISE EXCEPTION 'ASSERTION FAILED: Cross-tenant access not rejected'; END IF;
    RAISE NOTICE '[PASS] Test 2: Cross-tenant access strictly forbidden';

    -- =========================================================================
    -- TEST 3: Cash Received Underpaid
    -- =========================================================================
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_execute_checkout(
            v_tenant_id, v_branch_id,
            jsonb_build_object('id_struk', 'QA-UNDERPAID', 'status_bayar', 'Selesai', 'metode_bayar', 'CASH', 'nominal_bayar', 36000, 'uang_diterima', 20000),
            jsonb_build_array(jsonb_build_object('nama_menu', 'QA Coffee', 'qty', 2, 'harga_satuan', 18000, 'subtotal', 36000)),
            NULL
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%PAYMENT_UNDERPAID%' THEN v_err_caught := TRUE; END IF;
    END;
    IF NOT v_err_caught THEN RAISE EXCEPTION 'ASSERTION FAILED: Underpaid cash not rejected'; END IF;
    RAISE NOTICE '[PASS] Test 3: Underpaid cash tender rejected';

    -- =========================================================================
    -- TEST 4: Insufficient Stock Failure Rolls Back Receipt
    -- =========================================================================
    UPDATE public.stok_barang SET stok = 0.010, stok_akhir = 0.010 WHERE id = v_stock_id;
    v_err_caught := FALSE;
    BEGIN
        PERFORM public.fn_execute_checkout(
            v_tenant_id, v_branch_id,
            jsonb_build_object('id_struk', 'QA-NOSTOCK', 'status_bayar', 'Selesai', 'metode_bayar', 'CASH', 'nominal_bayar', 36000, 'uang_diterima', 50000),
            jsonb_build_array(jsonb_build_object('nama_menu', 'QA Coffee', 'qty', 2, 'harga_satuan', 18000, 'id_bahan', v_stock_id, 'takaran', 0.020)),
            NULL
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%INSUFFICIENT_STOCK%' OR SQLERRM LIKE '%Stok%' THEN v_err_caught := TRUE; END IF;
    END;
    IF NOT v_err_caught THEN RAISE EXCEPTION 'ASSERTION FAILED: Insufficient stock not rejected'; END IF;
    -- Verify no struk was created
    IF EXISTS(SELECT 1 FROM public.struk WHERE id_struk = 'QA-NOSTOCK') THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Receipt created despite stock error';
    END IF;
    RAISE NOTICE '[PASS] Test 4: Insufficient stock rejected with zero mutation';

    -- Restore stock: 10.000 kg
    UPDATE public.stok_barang SET stok = 10.000, stok_akhir = 10.000 WHERE id = v_stock_id;

    -- =========================================================================
    -- TEST 5: Valid Checkout with Tender, Change, BOM Deduction & COGS Snapshot
    -- Bill: Rp 36.000 (2x Coffee @ 18.000)
    -- Tender: Rp 50.000 -> Change: Rp 14.000
    -- BOM: 2 * 0.020 kg = 0.040 kg beans. Cost: 0.040 * 50.000 = Rp 2.000 HPP
    -- =========================================================================
    v_checkout_res := public.fn_execute_checkout(
        v_tenant_id, v_branch_id,
        jsonb_build_object(
            'id_struk', 'QA-CHK-VALID',
            'status_bayar', 'Selesai',
            'metode_bayar', 'CASH',
            'nominal_bayar', 36000.00,
            'bayar', 36000.00,
            'uang_diterima', 50000.00,
            'kembalian', 14000.00
        ),
        jsonb_build_array(
            jsonb_build_object(
                'nama_menu', 'QA Coffee',
                'qty', 2,
                'harga_satuan', 18000.00,
                'subtotal', 36000.00,
                'id_bahan', v_stock_id,
                'takaran', 0.020
            )
        ),
        NULL
    );

    IF (v_checkout_res->>'status') <> 'COMPLETED' THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Valid checkout failed: %', v_checkout_res;
    END IF;

    -- Verify Tender and Change Persisted
    IF NOT EXISTS(
        SELECT 1 FROM public.struk
        WHERE id_struk = 'QA-CHK-VALID'
          AND total_tagihan = 36000.00
          AND uang_diterima = 50000.00
          AND kembalian = 14000.00
    ) THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Tender and change not properly persisted in struk';
    END IF;

    -- Verify Stock Deduction: 10.000 - 0.040 = 9.960 kg
    SELECT stok INTO v_stok_rem FROM public.stok_barang WHERE id = v_stock_id;
    IF v_stok_rem <> 9.960 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Stock deduction incorrect: %', v_stok_rem;
    END IF;

    -- Verify barang_keluar relation & snapshot: id_struk, biaya_satuan=50000, total_biaya=2000
    SELECT count(*), biaya_satuan, total_biaya INTO v_bk_count, v_bk_unit_cost, v_bk_tot_cost
    FROM public.barang_keluar
    WHERE tenant_id = v_tenant_id AND id_struk = 'QA-CHK-VALID'
    GROUP BY biaya_satuan, total_biaya;

    IF v_bk_count <> 1 OR v_bk_unit_cost <> 50000.00 OR v_bk_tot_cost <> 2000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: barang_keluar snapshot incorrect: count=%, unit=%, tot=%', v_bk_count, v_bk_unit_cost, v_bk_tot_cost;
    END IF;

    -- Verify struk.total_cogs locked at 2000.00
    SELECT total_cogs INTO v_struk_cogs FROM public.struk WHERE id_struk = 'QA-CHK-VALID';
    IF v_struk_cogs <> 2000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: struk.total_cogs incorrect: %', v_struk_cogs;
    END IF;

    -- Verify Cashflow (Net Sale Rp 36.000, not gross tender)
    SELECT count(*), COALESCE(SUM(pemasukan), 0) INTO v_cf_count, v_cf_amt
    FROM public.cashflow WHERE id_sumber LIKE '%QA-CHK-VALID%';
    IF v_cf_count <> 1 OR v_cf_amt <> 36000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Cashflow incorrect: count=%, amt=%', v_cf_count, v_cf_amt;
    END IF;

    -- Verify Journal Entry POSTED with Balanced Debit/Credit:
    -- Debit Kas 36.000, Kredit Cafe 36.000, Debit HPP 2.000, Kredit Persediaan 2.000 -> Total 38.000
    SELECT status INTO v_je_status FROM public.journal_entries WHERE entry_no LIKE '%QA-CHK-VALID%';
    IF v_je_status <> 'POSTED' THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Journal entry status not POSTED: %', v_je_status;
    END IF;

    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO v_debit_total, v_credit_total
    FROM public.journal_entry_lines l
    JOIN public.journal_entries j ON j.id = l.journal_entry_id
    WHERE j.entry_no LIKE '%QA-CHK-VALID%';

    IF v_debit_total <> 38000.00 OR v_credit_total <> 38000.00 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Journal debit/credit unbalanced: Debit=%, Credit=%', v_debit_total, v_credit_total;
    END IF;
    RAISE NOTICE '[PASS] Test 5: Valid checkout verified with exact math and COGS snapshot';

    -- =========================================================================
    -- TEST 6: Idempotent Replay on fn_execute_checkout
    -- =========================================================================
    v_replay_res := public.fn_execute_checkout(
        v_tenant_id, v_branch_id,
        jsonb_build_object(
            'id_struk', 'QA-CHK-VALID',
            'status_bayar', 'Selesai',
            'metode_bayar', 'CASH',
            'nominal_bayar', 36000.00,
            'bayar', 36000.00,
            'uang_diterima', 50000.00,
            'kembalian', 14000.00
        ),
        jsonb_build_array(
            jsonb_build_object(
                'nama_menu', 'QA Coffee',
                'qty', 2,
                'harga_satuan', 18000.00,
                'subtotal', 36000.00,
                'id_bahan', v_stock_id,
                'takaran', 0.020
            )
        ),
        NULL
    );

    IF (v_replay_res->>'status') <> 'ALREADY_COMPLETED' THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Replay did not return ALREADY_COMPLETED: %', v_replay_res;
    END IF;

    -- Ensure no additional cashflow or stock deduction occurred
    SELECT count(*) INTO v_cf_count FROM public.cashflow WHERE id_sumber LIKE '%QA-CHK-VALID%';
    IF v_cf_count <> 1 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Replay duplicated cashflow entry!';
    END IF;

    SELECT stok INTO v_stok_rem FROM public.stok_barang WHERE id = v_stock_id;
    IF v_stok_rem <> 9.960 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Replay deducted stock again!';
    END IF;
    RAISE NOTICE '[PASS] Test 6: Idempotent replay safely verified (Zero duplicates)';

    -- =========================================================================
    -- CLEANUP: Clean transactional rollback of all transient test data
    -- =========================================================================
    RAISE NOTICE '=== ALL 6 REAL DATABASE CHECKOUT REGRESSION SUITES PASSED ===';
    RAISE EXCEPTION 'REGRESSION_ALL_PASSED_TRANSACTION_ROLLED_BACK';
END $$;
"""

if __name__ == '__main__':
    py = "C:/code/hermes-agent/venv/Scripts/python.exe"
    cmd = [py, "scripts/db_inspector.py", CHECKOUT_REGRESSION_SQL]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("STDOUT:\n", res.stdout)
    if res.stderr:
        print("STDERR:\n", res.stderr)
    if "REGRESSION_ALL_PASSED_TRANSACTION_ROLLED_BACK" in res.stdout or "ALL 6 REAL DATABASE CHECKOUT REGRESSION SUITES PASSED" in res.stdout:
        print("\n>>> REGRESSION SUCCESS: Real database checkout regression verified with 100% integrity! <<<")
        sys.exit(0)
    else:
        print("\n>>> REGRESSION FAILED: See logs above. <<<")
        sys.exit(1)
