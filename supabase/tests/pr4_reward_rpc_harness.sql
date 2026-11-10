-- ==============================================================================
-- PR-4 REWARD RPC HARDENING REGRESSION TEST HARNESS
-- Target: verify public.redeem_customer_reward enforcement of AC-09, AC-10, AC-11, AC-11b, AC-12
-- Execution: psql -v ON_ERROR_STOP=1 -f supabase/tests/pr4_reward_rpc_harness.sql
-- ==============================================================================

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS temp_pr4_test_results (
    test_id TEXT PRIMARY KEY,
    description TEXT,
    status TEXT,
    details TEXT
);

DO $$
DECLARE
    v_tenant_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
    v_tenant_d UUID := '22222222-2222-2222-2222-222222222222'::uuid;
    v_owner_a UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    v_kasir_a UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    v_inactive_a UUID := '00000000-0000-0000-0000-000000000004'::uuid;
    v_res JSONB;
    v_err TEXT;
    v_count INT;
BEGIN
    -- Disable row security during test fixture cleanup to ensure child records are removed
    PERFORM set_config('role', 'postgres', true);
    PERFORM set_config('row_security', 'off', true);

    -- Setup Clean Test Environment for Tenant A (Clean child tables first to respect FK)
    DELETE FROM public.customer_reward_claims WHERE tenant_id = v_tenant_a OR reward_id IN (SELECT id FROM public.crm_loyalty_programs WHERE tenant_id = v_tenant_a);
    DELETE FROM public.crm_loyalty_logs WHERE tenant_id = v_tenant_a;
    DELETE FROM public.crm_loyalty_programs WHERE tenant_id = v_tenant_a;
    DELETE FROM public.carwash WHERE tenant_id = v_tenant_a;
    DELETE FROM public.struk WHERE tenant_id = v_tenant_a;

    -- =========================================================================
    -- TEST 1 (AC-09): Inactive user call must be rejected
    -- =========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_inactive_a::text, true);
    v_res := NULL;
    v_err := '';

    BEGIN
        v_res := public.redeem_customer_reward(
            v_tenant_a,
            'B1234QA',
            'Free Wash',
            'Inactive claim attempt'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    IF v_err ILIKE '%UNAUTHORIZED_OR_INACTIVE%' THEN
        INSERT INTO temp_pr4_test_results VALUES ('TC_01_AC09', 'Inactive user cannot call redeem_customer_reward', 'PASS', v_err);
    ELSE
        INSERT INTO temp_pr4_test_results VALUES ('TC_01_AC09', 'Inactive user cannot call redeem_customer_reward', 'FAIL', 'Expected UNAUTHORIZED_OR_INACTIVE, got: ' || COALESCE(v_err, v_res::text));
    END IF;

    -- =========================================================================
    -- TEST 2 (AC-11): Cross-tenant redemption call by Owner A on Tenant D must be rejected
    -- =========================================================================
    PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);
    v_res := NULL;
    v_err := '';

    BEGIN
        v_res := public.redeem_customer_reward(
            v_tenant_d,
            'D9999QA',
            'Free Wash D',
            'Cross tenant attempt'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    IF v_err ILIKE '%FORBIDDEN_CROSS_TENANT_REDEEM%' THEN
        INSERT INTO temp_pr4_test_results VALUES ('TC_02_AC11', 'Cross-tenant parameter tampering rejected', 'PASS', v_err);
    ELSE
        INSERT INTO temp_pr4_test_results VALUES ('TC_02_AC11', 'Cross-tenant parameter tampering rejected', 'FAIL', 'Expected FORBIDDEN_CROSS_TENANT_REDEEM, got: ' || COALESCE(v_err, v_res::text));
    END IF;

    -- =========================================================================
    -- TEST 3 (AC-10): Loyalty program inactive or missing must be rejected
    -- =========================================================================
    -- Currently Tenant A has no active loyalty program
    v_res := NULL;
    v_err := '';

    BEGIN
        v_res := public.redeem_customer_reward(
            v_tenant_a,
            'B1234QA',
            'Free Wash',
            'No program attempt'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    IF v_err ILIKE '%LOYALTY_PROGRAM_UNAVAILABLE%' THEN
        INSERT INTO temp_pr4_test_results VALUES ('TC_03_AC10', 'Inactive/missing loyalty program rejected', 'PASS', v_err);
    ELSE
        INSERT INTO temp_pr4_test_results VALUES ('TC_03_AC10', 'Inactive/missing loyalty program rejected', 'FAIL', 'Expected LOYALTY_PROGRAM_UNAVAILABLE, got: ' || COALESCE(v_err, v_res::text));
    END IF;

    -- =========================================================================
    -- TEST 4 (AC-11b): Unpaid/Pending visits must not count towards reward
    -- =========================================================================
    -- Create active loyalty program
    INSERT INTO public.crm_loyalty_programs (id, tenant_id, is_active, target_stamps, reward_title)
    VALUES (gen_random_uuid(), v_tenant_a, TRUE, 5, 'Free Cuci Salju Tenant A');

    -- Insert 5 visits linked to pending struk
    FOR i IN 1..5 LOOP
        INSERT INTO public.struk (id, tenant_id, id_struk, kasir, total_tagihan, metode_bayar, status_bayar)
        VALUES (gen_random_uuid(), v_tenant_a, 'STR-PENDING-' || i, 'Kasir A', 50000.00, 'CASH', 'Pending');

        INSERT INTO public.carwash (id, tenant_id, id_struk, plat, paket, harga, status)
        VALUES (gen_random_uuid(), v_tenant_a, 'STR-PENDING-' || i, 'B1234QA', 'Cuci Salju', 50000.00, 'Dalam Antrian');
    END LOOP;

    v_res := NULL;
    v_err := '';

    BEGIN
        v_res := public.redeem_customer_reward(
            v_tenant_a,
            'B1234QA',
            'Free Cuci Salju Tenant A',
            'Pending visits attempt'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    IF v_err ILIKE '%Stamp kunjungan belum cukup atau reward sudah diklaim%' THEN
        INSERT INTO temp_pr4_test_results VALUES ('TC_04_AC11B', 'Pending/unpaid visits do not count towards stamps', 'PASS', v_err);
    ELSE
        INSERT INTO temp_pr4_test_results VALUES ('TC_04_AC11B', 'Pending/unpaid visits do not count towards stamps', 'FAIL', 'Expected stamp belum cukup error, got: ' || COALESCE(v_err, v_res::text));
    END IF;

    -- =========================================================================
    -- TEST 5 (AC-12): Valid paid visits allow claim and idempotent replay
    -- =========================================================================
    -- Mark struk as Selesai (lunas)
    UPDATE public.struk SET status_bayar = 'Selesai' WHERE tenant_id = v_tenant_a;
    UPDATE public.carwash SET status = 'Selesai Dicuci' WHERE tenant_id = v_tenant_a;

    v_res := NULL;
    v_err := '';

    BEGIN
        v_res := public.redeem_customer_reward(
            v_tenant_a,
            'B 1234 QA',
            'Free Cuci Salju Tenant A',
            'Valid claim',
            'Pelanggan Setia A',
            'FREE_SERVICE',
            'STR-POS-REDEEM-001'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;

    IF v_res IS NOT NULL AND (v_res->>'redemption_id') IS NOT NULL THEN
        -- Replay with same id_struk (Idempotency test)
        DECLARE
            v_replay JSONB;
        BEGIN
            v_replay := public.redeem_customer_reward(
                v_tenant_a,
                'B 1234 QA',
                'Free Cuci Salju Tenant A',
                'Valid claim replay',
                'Pelanggan Setia A',
                'FREE_SERVICE',
                'STR-POS-REDEEM-001'
            );

            SELECT COUNT(*) INTO v_count FROM public.crm_loyalty_logs WHERE tenant_id = v_tenant_a;

            IF v_replay->>'redemption_id' = v_res->>'redemption_id' AND v_count = 1 THEN
                INSERT INTO temp_pr4_test_results VALUES ('TC_05_AC12', 'Valid claim succeeds and id_struk replay is idempotent', 'PASS', 'Committed 1 row, returned identical redemption_id');
            ELSE
                INSERT INTO temp_pr4_test_results VALUES ('TC_05_AC12', 'Valid claim succeeds and id_struk replay is idempotent', 'FAIL', 'Replay mismatch or duplicate row created');
            END IF;
        END;
    ELSE
        INSERT INTO temp_pr4_test_results VALUES ('TC_05_AC12', 'Valid claim succeeds and id_struk replay is idempotent', 'FAIL', 'Claim failed: ' || v_err);
    END IF;

END $$;

SELECT test_id, description, status, details FROM temp_pr4_test_results ORDER BY test_id;

-- Fail transaction if any test failed
DO $$
DECLARE
    v_fails INT;
BEGIN
    SELECT COUNT(*) INTO v_fails FROM temp_pr4_test_results WHERE status <> 'PASS';
    IF v_fails > 0 THEN
        RAISE EXCEPTION 'PR-4 HARNESS FAILED: % test(s) failed', v_fails;
    END IF;
END $$;

ROLLBACK;
