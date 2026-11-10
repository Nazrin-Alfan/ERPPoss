-- ==============================================================================
-- PR-2 REGRESSION TEST HARNESS
-- Branch: feat/access-control-rbac-hardening
-- Validasi migrasi 20261107000001_pr2_profile_lockdown_and_privilege_containment.sql
--
-- Skema: semua kasus negatif (BASELINE_GAP) → assertion penolakan wajib.
--        Kontrol positif memastikan operasi sah tetap berjalan.
--        Report per kasus: aktor, operasi, expected, actual, DB state.
-- Database target: erpposs_qa_pr2 (Docker disposable, bukan produksi)
-- Prasyarat: fixture + migration 012 sudah di-load ke DB target.
-- ==============================================================================

BEGIN;

-- Bootstrap pg_temp schema (auto-created by first temporary object)
CREATE TEMP TABLE _pg_temp_init (x int) ON COMMIT DROP;

CREATE TABLE pg_temp.pr2_results (
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
    INSERT INTO pg_temp.pr2_results
    VALUES (p_id, p_actor, p_op, p_obj, p_expected, p_actual, p_ok, p_state)
    ON CONFLICT (check_id) DO UPDATE
        SET passed = p_ok, actual = p_actual, db_state_after = p_state;
    IF p_ok THEN
        RAISE NOTICE '[PR2-PASS] % | Actor=% | Op=% | Actual=%', p_id, p_actor, p_op, p_actual;
    ELSE
        RAISE WARNING '[PR2-FAIL] % | Actor=% | Op=% | Expected=% | Actual=%',
            p_id, p_actor, p_op, p_expected, p_actual;
    END IF;
END $$;

-- Grant pg_temp objects ke authenticated agar accessible setelah SET ROLE
GRANT INSERT, UPDATE, SELECT ON pg_temp.pr2_results TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.rec(text,text,text,text,text,text,boolean,text) TO authenticated;

-- Aktifkan RLS enforcement via non-superuser role
SET ROLE authenticated;

-- ============================================================
-- PR2-01 (DENIAL): Kasir dilarang mengubah branch_id diri sendiri
-- ============================================================
DO $$
DECLARE
    v_kasir_a1  UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_branch_a2 UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
    v_original  UUID;
    v_after     UUID;
    v_err       text := '';
    v_mutated   int  := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    SELECT branch_id INTO v_original FROM public.profiles WHERE id = v_kasir_a1;

    BEGIN
        UPDATE public.profiles SET branch_id = v_branch_a2 WHERE id = v_kasir_a1;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    SELECT branch_id INTO v_after FROM public.profiles WHERE id = v_kasir_a1;

    PERFORM pg_temp.rec(
        'PR2-01', 'Kasir A1', 'UPDATE branch_id self', 'profiles',
        'Rejected: FORBIDDEN_BRANCH_MUTATION',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err
             WHEN v_mutated > 0 THEN 'Mutated ' || v_mutated || ' rows - NOT rejected'
             ELSE 'No rows affected, no exception' END,
        v_err ILIKE '%FORBIDDEN_BRANCH_MUTATION%' OR (v_err = '' AND v_mutated = 0),
        CASE WHEN v_after IS NOT DISTINCT FROM v_original
             THEN 'DB_UNCHANGED (branch_id preserved)'
             ELSE 'DB_MUTATED - branch_id changed! FAIL' END
    );
END $$;

-- ============================================================
-- PR2-02 (DENIAL): Kasir dilarang menonaktifkan Owner
-- ============================================================
DO $$
DECLARE
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_owner_a  UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_original boolean;
    v_after    boolean;
    v_err      text := '';
    v_mutated  int  := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);
    SELECT is_active INTO v_original FROM public.profiles WHERE id = v_owner_a;

    BEGIN
        UPDATE public.profiles SET is_active = false WHERE id = v_owner_a;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    SELECT is_active INTO v_after FROM public.profiles WHERE id = v_owner_a;

    PERFORM pg_temp.rec(
        'PR2-02', 'Kasir A1', 'UPDATE is_active=false Owner A', 'profiles',
        'Rejected: FORBIDDEN_STATUS_MUTATION',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err
             WHEN v_mutated > 0 THEN 'Mutated ' || v_mutated || ' rows - NOT rejected'
             ELSE 'No rows affected, no exception' END,
        v_err ILIKE '%FORBIDDEN_STATUS_MUTATION%' OR (v_err = '' AND v_mutated = 0),
        CASE WHEN v_after = v_original THEN 'DB_UNCHANGED (Owner still active)'
             ELSE 'DB_MUTATED - Owner deactivated! FAIL' END
    );
END $$;

-- ============================================================
-- PR2-03 (DENIAL): Last-active-Owner tidak bisa dinonaktifkan
-- ============================================================
DO $$
DECLARE
    v_owner_a  UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_original boolean;
    v_after    boolean;
    v_err      text := '';
    v_mutated  int  := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    SELECT is_active INTO v_original FROM public.profiles WHERE id = v_owner_a;

    BEGIN
        UPDATE public.profiles SET is_active = false WHERE id = v_owner_a;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    SELECT is_active INTO v_after FROM public.profiles WHERE id = v_owner_a;

    PERFORM pg_temp.rec(
        'PR2-03', 'Owner A', 'UPDATE is_active=false self (last owner)', 'profiles',
        'Rejected: LAST_ACTIVE_OWNER_PROTECTED',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err
             WHEN v_mutated > 0 THEN 'Mutated - NOT rejected! FAIL'
             ELSE 'No rows affected, no exception' END,
        v_err ILIKE '%LAST_ACTIVE_OWNER_PROTECTED%' OR (v_err = '' AND v_mutated = 0),
        CASE WHEN v_after = v_original THEN 'DB_UNCHANGED (Owner still active)'
             ELSE 'DB_MUTATED - Last Owner deactivated! CRITICAL FAIL' END
    );
END $$;

-- ============================================================
-- PR2-04 (DENIAL): Last-active-Owner tidak bisa di-downgrade rolenya
-- ============================================================
DO $$
DECLARE
    v_owner_a  UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_original text;
    v_after    text;
    v_err      text := '';
    v_mutated  int  := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    SELECT role INTO v_original FROM public.profiles WHERE id = v_owner_a;

    BEGIN
        UPDATE public.profiles SET role = 'Admin' WHERE id = v_owner_a;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    SELECT role INTO v_after FROM public.profiles WHERE id = v_owner_a;

    PERFORM pg_temp.rec(
        'PR2-04', 'Owner A', 'UPDATE role=Admin on last Owner', 'profiles',
        'Rejected: LAST_ACTIVE_OWNER_PROTECTED',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err
             WHEN v_mutated > 0 THEN 'Role changed - NOT rejected! FAIL'
             ELSE 'No rows affected, no exception' END,
        v_err ILIKE '%LAST_ACTIVE_OWNER_PROTECTED%' OR (v_err = '' AND v_mutated = 0),
        CASE WHEN v_after = v_original THEN 'DB_UNCHANGED (role preserved)'
             ELSE 'DB_MUTATED - role changed! FAIL' END
    );
END $$;

-- ============================================================
-- PR2-05 (DENIAL): Owner A tidak bisa mutasi profil Tenant D (cross-tenant)
-- ============================================================
DO $$
DECLARE
    v_owner_a  UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_owner_d  UUID := '00000000-0000-0000-0000-000000000002'::uuid;
    v_original boolean;
    v_after    boolean;
    v_err      text := '';
    v_mutated  int  := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    SELECT is_active INTO v_original FROM public.profiles WHERE id = v_owner_d;

    BEGIN
        UPDATE public.profiles SET is_active = false WHERE id = v_owner_d;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    RESET ROLE;
    SELECT is_active INTO v_after FROM public.profiles WHERE id = v_owner_d;
    SET ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

    PERFORM pg_temp.rec(
        'PR2-05', 'Owner A', 'UPDATE is_active Owner D (cross-tenant)', 'profiles',
        'Rejected: 0 rows or FORBIDDEN_CROSS_TENANT_UPDATE',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err
             WHEN v_mutated > 0 THEN 'Mutated Tenant D profile - CRITICAL FAIL'
             ELSE 'No rows affected (RLS blocked)' END,
        v_err ILIKE '%FORBIDDEN_CROSS_TENANT%' OR v_mutated = 0,
        -- v_after diquery sebagai superuser; original selalu true (Owner aktif di fixture)
        CASE WHEN v_after = true THEN 'DB_UNCHANGED (Owner D still active)'
             WHEN v_after = false THEN 'DB_MUTATED - cross-tenant succeeded! CRITICAL FAIL'
             ELSE 'DB_STATE_UNKNOWN (verify manually)' END
    );
END $$;

-- ============================================================
-- PR2-06 (DENIAL): INSERT profil dengan branch_id dari Tenant D
-- ============================================================
DO $$
DECLARE
    v_owner_a   UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_tenant_a  UUID := '11111111-1111-1111-1111-111111111111'::uuid;
    v_branch_d1 UUID := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid;
    v_new_id    UUID := gen_random_uuid();
    v_err       text := '';
    v_count     int;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

    BEGIN
        INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
        VALUES (v_new_id, v_tenant_a, v_branch_d1, 'Invalid Staff', 'invalid_qa@test.local', 'Kasir', true);
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    RESET ROLE;
    SELECT COUNT(*) INTO v_count FROM public.profiles WHERE id = v_new_id;
    SET ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

    PERFORM pg_temp.rec(
        'PR2-06', 'Owner A', 'INSERT profile with branch_id from Tenant D', 'profiles',
        'Rejected: INVALID_BRANCH_ASSIGNMENT',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err
             ELSE 'No exception - INSERT may have succeeded' END,
        v_err ILIKE '%INVALID_BRANCH_ASSIGNMENT%',
        CASE WHEN v_count = 0 THEN 'DB_CLEAN (row not inserted)'
             ELSE 'DB_DIRTY (row inserted with invalid branch_id!) FAIL' END
    );
END $$;

-- ============================================================
-- PR2-07: TRUNCATE privilege via metadata (BUKAN jalankan TRUNCATE)
-- ============================================================
DO $$
DECLARE
    v_tp boolean;
    v_ts boolean;
    v_tc boolean;
BEGIN
    RESET ROLE;
    v_tp := has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE');
    v_ts := has_table_privilege('authenticated', 'public.struk', 'TRUNCATE');
    v_tc := has_table_privilege('authenticated', 'public.chart_of_accounts', 'TRUNCATE');
    SET ROLE authenticated;

    PERFORM pg_temp.rec(
        'PR2-07', 'authenticated role', 'has_table_privilege TRUNCATE (metadata check)',
        'profiles, struk, chart_of_accounts',
        'TRUNCATE = false on all verified tables',
        format('profiles=%s struk=%s chart_of_accounts=%s', v_tp, v_ts, v_tc),
        NOT v_tp AND NOT v_ts AND NOT v_tc,
        'Verified via pg_catalog - no destructive op run'
    );
END $$;

-- ============================================================
-- PR2-08 (DENIAL): fn_require_explicit_tenant_context tanpa sesi aktif
-- ============================================================
DO $$
DECLARE
    v_err text := '';
    v_tid UUID;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', '', true);

    BEGIN
        SELECT public.fn_require_explicit_tenant_context() INTO v_tid;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    PERFORM pg_temp.rec(
        'PR2-08', 'Unauthenticated (empty JWT)', 'fn_require_explicit_tenant_context()',
        'profiles',
        'Rejected: MISSING_TENANT_CONTEXT',
        CASE WHEN v_err <> '' THEN 'Exception: ' || v_err
             ELSE 'Returned tenant_id=' || COALESCE(v_tid::text, 'NULL') || ' - NOT rejected' END,
        v_err ILIKE '%MISSING_TENANT_CONTEXT%',
        'No DB mutation attempted'
    );
END $$;

-- ============================================================
-- PR2-09 (POSITIVE): Owner A boleh mengubah nama Kasir A1 (sama tenant)
-- ============================================================
DO $$
DECLARE
    v_owner_a  UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_before   text;
    v_after    text;
    v_err      text := '';
    v_mutated  int  := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    SELECT nama INTO v_before FROM public.profiles WHERE id = v_kasir_a1;

    BEGIN
        UPDATE public.profiles SET nama = 'Kasir Diperbarui PR2' WHERE id = v_kasir_a1;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    SELECT nama INTO v_after FROM public.profiles WHERE id = v_kasir_a1;

    PERFORM pg_temp.rec(
        'PR2-09', 'Owner A', 'UPDATE nama Kasir A1 (sama tenant)', 'profiles',
        'Allowed: 1 row updated',
        CASE WHEN v_err <> '' THEN 'Error: ' || v_err
             ELSE 'Updated ' || v_mutated || ' rows, nama=' || COALESCE(v_after, 'NULL') END,
        v_err = '' AND v_mutated > 0,
        format('nama: "%s" -> "%s"', v_before, v_after)
    );
END $$;

-- ============================================================
-- PR2-10 (POSITIVE): Owner A boleh pindah Kasir ke cabang valid A2
-- ============================================================
DO $$
DECLARE
    v_owner_a   UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_kasir_a1  UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_branch_a2 UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
    v_original  UUID;
    v_after     UUID;
    v_err       text := '';
    v_mutated   int  := 0;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    SELECT branch_id INTO v_original FROM public.profiles WHERE id = v_kasir_a1;

    BEGIN
        UPDATE public.profiles SET branch_id = v_branch_a2 WHERE id = v_kasir_a1;
        GET DIAGNOSTICS v_mutated = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    SELECT branch_id INTO v_after FROM public.profiles WHERE id = v_kasir_a1;

    PERFORM pg_temp.rec(
        'PR2-10', 'Owner A', 'UPDATE branch_id Kasir ke cabang valid A2', 'profiles',
        'Allowed: branch_id berubah ke A2',
        CASE WHEN v_err <> '' THEN 'Error: ' || v_err
             ELSE 'Updated ' || v_mutated || ' rows' END,
        v_err = '' AND v_mutated > 0 AND v_after = v_branch_a2,
        format('branch_id: %s -> %s', v_original, v_after)
    );
END $$;

-- ============================================================
-- PR2-11 (POSITIVE): Owner A boleh INSERT staf baru di tenant sendiri
-- ============================================================
DO $$
DECLARE
    v_owner_a   UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_tenant_a  UUID := '11111111-1111-1111-1111-111111111111'::uuid;
    v_branch_a1 UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;  -- branch Tenant A (bukan bbbbbbbb yang milik Tenant D)
    v_new_id    UUID := gen_random_uuid();
    v_err       text := '';
    v_count     int;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

    BEGIN
        INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
        VALUES (v_new_id, v_tenant_a, v_branch_a1, 'Staff Baru QA', 'staffbaru_pr2@qa.test', 'Kasir', true);
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    RESET ROLE;
    SELECT COUNT(*) INTO v_count FROM public.profiles WHERE id = v_new_id;
    SET ROLE authenticated;

    PERFORM pg_temp.rec(
        'PR2-11', 'Owner A', 'INSERT Kasir baru di tenant sendiri', 'profiles',
        'Allowed: profil baru tersimpan',
        CASE WHEN v_err <> '' THEN 'Error: ' || v_err
             ELSE 'Inserted, count=' || v_count END,
        v_err = '' AND v_count > 0,
        'Profile count after insert: ' || v_count
    );
END $$;

-- ============================================================
-- LAPORAN AKHIR
-- ============================================================
RESET ROLE;

SELECT
    check_id,
    actor,
    operation,
    object,
    expected,
    actual,
    passed,
    db_state_after
FROM pg_temp.pr2_results
ORDER BY check_id;

SELECT
    CASE WHEN bool_and(passed) THEN '*** ALL PR2 CHECKS PASSED ***'
         ELSE '!!! PR2 FAILURES DETECTED - see rows where passed=false !!!'
    END                              AS verdict,
    COUNT(*) FILTER (WHERE passed)   AS passed_count,
    COUNT(*) FILTER (WHERE NOT passed) AS failed_count
FROM pg_temp.pr2_results;

-- Enforce hard non-zero exit on failure
DO $$
DECLARE
    v_fails int;
BEGIN
    SELECT COUNT(*) INTO v_fails FROM pg_temp.pr2_results WHERE NOT passed;
    IF v_fails > 0 THEN
        RAISE EXCEPTION 'PR-2 HARNESS FAILED: % check(s) failed', v_fails;
    END IF;
END $$;

ROLLBACK;
