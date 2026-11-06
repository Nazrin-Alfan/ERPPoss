-- ==============================================================================
-- PR-3 REGRESSION TEST HARNESS: GRANULAR RLS REWRITE & BRANCH SCOPING
-- Branch: feat/access-control-rbac-hardening
-- Validates: supabase/migrations/013_pr3_granular_rls_and_branch_scoping.sql
-- Target DB: erpposs_qa_pr3 (Docker disposable)
-- ==============================================================================

BEGIN;

CREATE TEMP TABLE _pg_temp_init (x int) ON COMMIT DROP;

CREATE TABLE pg_temp.pr3_results (
    check_id       text PRIMARY KEY,
    actor          text,
    operation      text,
    object         text,
    expected       text,
    actual         text,
    passed         boolean,
    db_state_after text
);

CREATE OR REPLACE FUNCTION pg_temp.rec(
    p_id text, p_actor text, p_op text, p_obj text,
    p_expected text, p_actual text, p_ok boolean, p_state text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO pg_temp.pr3_results
    VALUES (p_id, p_actor, p_op, p_obj, p_expected, p_actual, p_ok, p_state)
    ON CONFLICT (check_id) DO UPDATE
        SET passed = p_ok, actual = p_actual, db_state_after = p_state;
    IF p_ok THEN
        RAISE NOTICE '[PR3-PASS] % | Actor=% | Op=% | Actual=%', p_id, p_actor, p_op, p_actual;
    ELSE
        RAISE WARNING '[PR3-FAIL] % | Actor=% | Op=% | Expected=% | Actual=%',
            p_id, p_actor, p_op, p_expected, p_actual;
    END IF;
END $$;

GRANT INSERT, UPDATE, SELECT ON pg_temp.pr3_results TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.rec(text,text,text,text,text,text,boolean,text) TO authenticated;

-- Switch to authenticated role so RLS is actively enforced
SET ROLE authenticated;

-- ==============================================================================
-- PR3-01: Kasir dilarang membaca payroll (karyawan_cuci, karyawan_kantor)
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_count_cuci INT := 0;
    v_count_kantor INT := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    SELECT COUNT(*) INTO v_count_cuci FROM public.karyawan_cuci;
    SELECT COUNT(*) INTO v_count_kantor FROM public.karyawan_kantor;

    PERFORM pg_temp.rec(
        'PR3-01', 'Kasir A1', 'SELECT payroll', 'karyawan_cuci & karyawan_kantor',
        '0 rows returned',
        'cuci=' || v_count_cuci || ', kantor=' || v_count_kantor,
        (v_count_cuci = 0 AND v_count_kantor = 0),
        'Zero leakage confirmed'
    );
END $$;

-- ==============================================================================
-- PR3-02: Kasir dilarang membaca General Ledger & COA
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_count_je INT := 0;
    v_count_jel INT := 0;
    v_count_coa INT := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    SELECT COUNT(*) INTO v_count_je FROM public.journal_entries;
    SELECT COUNT(*) INTO v_count_jel FROM public.journal_entry_lines;
    SELECT COUNT(*) INTO v_count_coa FROM public.chart_of_accounts;

    PERFORM pg_temp.rec(
        'PR3-02', 'Kasir A1', 'SELECT ledger & coa', 'journal_entries, lines, coa',
        '0 rows returned',
        'je=' || v_count_je || ', jel=' || v_count_jel || ', coa=' || v_count_coa,
        (v_count_je = 0 AND v_count_jel = 0 AND v_count_coa = 0),
        'Zero leakage confirmed'
    );
END $$;

-- ==============================================================================
-- PR3-03: Kasir dilarang membaca Cashflow & Saldo Kas
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_count_cf INT := 0;
    v_count_bal INT := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    SELECT COUNT(*) INTO v_count_cf FROM public.cashflow;
    SELECT COUNT(*) INTO v_count_bal FROM public.pos_balances;

    PERFORM pg_temp.rec(
        'PR3-03', 'Kasir A1', 'SELECT cashflow & balances', 'cashflow, pos_balances',
        '0 rows returned',
        'cashflow=' || v_count_cf || ', balances=' || v_count_bal,
        (v_count_cf = 0 AND v_count_bal = 0),
        'Zero leakage confirmed'
    );
END $$;

-- ==============================================================================
-- PR3-04: Kasir dilarang memodifikasi harga menu / katalog
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_mutated INT := 0;
    v_err TEXT := '';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    BEGIN
        UPDATE public.daftar_harga_menu SET harga = 99999.00;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    PERFORM pg_temp.rec(
        'PR3-04', 'Kasir A1', 'UPDATE harga menu', 'daftar_harga_menu',
        '0 rows affected or RLS error',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err ELSE 'Mutated rows: ' || v_mutated END,
        (v_mutated = 0 OR v_err <> ''),
        'Menu prices unchanged'
    );
END $$;

-- ==============================================================================
-- PR3-05: Kasir A1 dilarang membaca stok Cabang A2
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_branch_a2 UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
    v_count INT := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    SELECT COUNT(*) INTO v_count FROM public.stok_barang WHERE branch_id = v_branch_a2;

    PERFORM pg_temp.rec(
        'PR3-05', 'Kasir A1', 'SELECT stok Branch A2', 'stok_barang',
        '0 rows returned',
        'count=' || v_count,
        (v_count = 0),
        'Branch isolation confirmed'
    );
END $$;

-- ==============================================================================
-- PR3-06: Kasir A1 diizinkan membaca stok Cabang A1
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_branch_a1 UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
    v_count INT := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    SELECT COUNT(*) INTO v_count FROM public.stok_barang WHERE branch_id = v_branch_a1;

    PERFORM pg_temp.rec(
        'PR3-06', 'Kasir A1', 'SELECT stok Branch A1', 'stok_barang',
        '> 0 rows returned',
        'count=' || v_count,
        (v_count > 0),
        'Kasir own branch stock accessible'
    );
END $$;

-- ==============================================================================
-- PR3-07: Kasir dilarang direct UPDATE stok_barang
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_mutated INT := 0;
    v_err TEXT := '';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    BEGIN
        UPDATE public.stok_barang SET stok = 777.00;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    PERFORM pg_temp.rec(
        'PR3-07', 'Kasir A1', 'direct UPDATE stok', 'stok_barang',
        '0 rows affected or RLS error',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err ELSE 'Mutated rows: ' || v_mutated END,
        (v_mutated = 0 OR v_err <> ''),
        'Stock unchanged'
    );
END $$;

-- ==============================================================================
-- PR3-08: Kasir A1 dilarang INSERT struk untuk Cabang A2
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_tenant_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
    v_branch_a2 UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
    v_mutated INT := 0;
    v_err TEXT := '';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    BEGIN
        INSERT INTO public.struk (tenant_id, branch_id, id_struk, total_tagihan, metode_bayar, status_bayar, kasir)
        VALUES (v_tenant_a, v_branch_a2, 'STR-ILLEGAL-A2', 25000, 'CASH', 'Selesai', 'Kasir A1');
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    PERFORM pg_temp.rec(
        'PR3-08', 'Kasir A1', 'INSERT struk Branch A2', 'struk',
        'Blocked by RLS',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err ELSE 'Inserted rows: ' || v_mutated END,
        (v_mutated = 0 OR v_err <> ''),
        'Cross-branch receipt prevented'
    );
END $$;

-- ==============================================================================
-- PR3-09: Kasir A1 diizinkan INSERT struk untuk Cabang A1
-- ==============================================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_tenant_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
    v_branch_a1 UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
    v_mutated INT := 0;
    v_err TEXT := '';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    BEGIN
        INSERT INTO public.struk (tenant_id, branch_id, id_struk, total_tagihan, metode_bayar, status_bayar, kasir)
        VALUES (v_tenant_a, v_branch_a1, 'STR-LEGAL-A1', 35000, 'CASH', 'Selesai', 'Kasir A1');
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    PERFORM pg_temp.rec(
        'PR3-09', 'Kasir A1', 'INSERT struk Branch A1', 'struk',
        '1 row inserted successfully',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err ELSE 'Inserted rows: ' || v_mutated END,
        (v_mutated = 1 AND v_err = ''),
        'Receipt created'
    );
END $$;

-- ==============================================================================
-- PR3-10: Akun nonaktif (Inactive User) ditolak di semua tabel
-- ==============================================================================
DO $$
DECLARE
    v_inactive_a UUID := '00000000-0000-0000-0000-000000000004'::uuid;
    v_count INT := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_inactive_a::text, true);
    SELECT COUNT(*) INTO v_count FROM public.daftar_harga_menu;

    PERFORM pg_temp.rec(
        'PR3-10', 'Inactive User', 'SELECT menu', 'daftar_harga_menu',
        '0 rows returned',
        'count=' || v_count,
        (v_count = 0),
        'Inactive access revoked'
    );
END $$;

-- ==============================================================================
-- PR3-11: Owner A tetap terisolasi dari Tenant D
-- ==============================================================================
DO $$
DECLARE
    v_owner_a UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_tenant_d UUID := '22222222-2222-2222-2222-222222222222'::uuid;
    v_count INT := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    SELECT COUNT(*) INTO v_count FROM public.stok_barang WHERE tenant_id = v_tenant_d;

    PERFORM pg_temp.rec(
        'PR3-11', 'Owner A', 'SELECT Tenant D stock', 'stok_barang',
        '0 rows returned',
        'count=' || v_count,
        (v_count = 0),
        'Cross-tenant isolation preserved'
    );
END $$;

-- ==============================================================================
-- PR3-12: Owner A dapat melihat seluruh cabang Tenant A (A1 dan A2)
-- ==============================================================================
DO $$
DECLARE
    v_owner_a UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_count_a1 INT := 0;
    v_count_a2 INT := 0;
    v_branch_a1 UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
    v_branch_a2 UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    SELECT COUNT(*) INTO v_count_a1 FROM public.stok_barang WHERE branch_id = v_branch_a1;
    SELECT COUNT(*) INTO v_count_a2 FROM public.stok_barang WHERE branch_id = v_branch_a2;

    PERFORM pg_temp.rec(
        'PR3-12', 'Owner A', 'SELECT all branches', 'stok_barang',
        'Both branches visible',
        'A1=' || v_count_a1 || ', A2=' || v_count_a2,
        (v_count_a1 > 0 AND v_count_a2 > 0),
        'Owner multi-branch visibility confirmed'
    );
END $$;

-- ==============================================================================
-- PR3-13: Admin A diizinkan memodifikasi katalog & pengeluaran
-- ==============================================================================
DO $$
DECLARE
    v_admin_a UUID := '00000000-0000-0000-0000-000000000006'::uuid;
    v_tenant_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
    v_branch_a1 UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
    v_mutated INT := 0;
    v_err TEXT := '';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_admin_a::text, true);
    BEGIN
        UPDATE public.daftar_harga_menu SET harga = 22000.00 WHERE branch_id = v_branch_a1;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    PERFORM pg_temp.rec(
        'PR3-13', 'Admin A', 'UPDATE menu price', 'daftar_harga_menu',
        'Updated successfully',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err ELSE 'Updated rows: ' || v_mutated END,
        (v_mutated > 0 AND v_err = ''),
        'Admin management access confirmed'
    );
END $$;

-- ==============================================================================
-- PR3-14: Jurnal berstatus POSTED immutable (tidak bisa dihapus)
-- ==============================================================================
DO $$
DECLARE
    v_owner_a UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_mutated INT := 0;
    v_err TEXT := '';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    BEGIN
        DELETE FROM public.journal_entries WHERE status = 'POSTED';
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    PERFORM pg_temp.rec(
        'PR3-14', 'Owner A', 'DELETE POSTED journal', 'journal_entries',
        'Blocked by trigger or RLS',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err ELSE 'Deleted rows: ' || v_mutated END,
        (v_mutated = 0 OR v_err <> ''),
        'Posted journal immutable'
    );
END $$;

-- Switch back to postgres for reporting
RESET ROLE;

SELECT check_id, actor, operation, object, expected, actual,
       CASE WHEN passed THEN '✅ PASS' ELSE '❌ FAIL' END AS status,
       db_state_after
FROM pg_temp.pr3_results
ORDER BY check_id;

SELECT COUNT(*) FILTER (WHERE passed) AS passed_count,
       COUNT(*) FILTER (WHERE NOT passed) AS failed_count,
       COUNT(*) AS total_count
FROM pg_temp.pr3_results;

-- Selalu rollback agar database disposable tetap bersih
ROLLBACK;
