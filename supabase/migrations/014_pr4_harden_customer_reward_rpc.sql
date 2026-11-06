-- ==============================================================================
-- MILESTONE PR-4: HARDENING RPC redeem_customer_reward
-- AC-09: Active caller profile verification
-- AC-10: Active loyalty program & positive target_stamps gate
-- AC-11: Cross-tenant execution containment
-- AC-11b: Strict filtering to paid & non-cancelled visits
-- AC-12: Transaction advisory lock & idempotency token handling
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.redeem_customer_reward(
    p_tenant_id UUID,
    p_plat TEXT,
    p_reward_title TEXT,
    p_notes TEXT DEFAULT '',
    p_nama_pelanggan TEXT DEFAULT '',
    p_reward_type TEXT DEFAULT 'FREE_SERVICE',
    p_id_struk TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_plate TEXT := upper(regexp_replace(trim(COALESCE(p_plat, '')), '\s+', '', 'g'));
    v_caller_role VARCHAR(50);
    v_caller_tenant UUID;
    v_program_active BOOLEAN;
    v_target_stamps INT;
    v_visits_count INT := 0;
    v_redemptions_count INT := 0;
    v_available INT := 0;
    v_redemption_id TEXT;
    v_existing_redemption_id TEXT;
    v_record JSONB;
BEGIN
    -- 1. Input Validation
    IF p_tenant_id IS NULL OR v_clean_plate = '' THEN
        RAISE EXCEPTION 'Tenant ID dan Plat nomor kendaraan wajib diisi';
    END IF;

    -- 2. AC-09: Authenticated & Active Caller Verification
    v_caller_role := COALESCE(public.current_user_role(), 'Anon');
    v_caller_tenant := public.current_tenant_id();

    IF v_caller_role = 'Anon' OR (v_caller_tenant IS NULL AND v_caller_role <> 'Super Admin') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_OR_INACTIVE';
    END IF;

    -- 3. AC-11: Cross-Tenant Isolation Enforcement
    IF v_caller_role <> 'Super Admin' AND p_tenant_id <> v_caller_tenant THEN
        RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_REDEEM';
    END IF;

    -- 4. AC-12: Concurrency Serialization via Transaction Advisory Lock
    -- Atomically locks (tenant_id + plate) for the duration of the current transaction
    PERFORM pg_advisory_xact_lock(hashtext('reward_claim:' || p_tenant_id::text || ':' || v_clean_plate)::bigint);

    -- 5. AC-12b: Idempotency Protection (If id_struk already redeemed)
    IF p_id_struk IS NOT NULL AND trim(p_id_struk) <> '' THEN
        SELECT id INTO v_existing_redemption_id
        FROM public.crm_loyalty_logs
        WHERE tenant_id = p_tenant_id
          AND id_struk = trim(p_id_struk)
          AND tipe = 'REDEEM'
        LIMIT 1;

        IF v_existing_redemption_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'redemption_id', v_existing_redemption_id,
                'tenant_id', p_tenant_id,
                'plat', upper(trim(p_plat)),
                'reward_title', p_reward_title,
                'idempotent_replay', true,
                'claimed_at', NOW()
            );
        END IF;
    END IF;

    -- 6. AC-10: Active Loyalty Program Gate
    SELECT is_active, target_stamps INTO v_program_active, v_target_stamps
    FROM public.crm_loyalty_programs
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    IF NOT FOUND OR v_program_active IS NOT TRUE OR COALESCE(v_target_stamps, 0) <= 0 THEN
        RAISE EXCEPTION 'LOYALTY_PROGRAM_UNAVAILABLE';
    END IF;

    -- 7. AC-11b: Strict Paid Visits Filter (Qualifying Visits Only)
    -- Valid stamps require:
    --   - status not in ('batal', 'void', 'cancelled', 'pending')
    --   - status_bayar = 'Selesai' (if populated on carwash)
    --   - if id_struk is linked, struk status_bayar must be 'Selesai'
    SELECT COUNT(*) INTO v_visits_count
    FROM public.carwash cw
    LEFT JOIN public.struk s ON s.tenant_id = cw.tenant_id AND s.id_struk = cw.id_struk
    WHERE cw.tenant_id = p_tenant_id
      AND upper(regexp_replace(trim(COALESCE(cw.plat, '')), '\s+', '', 'g')) = v_clean_plate
      AND lower(COALESCE(cw.status, '')) NOT IN ('batal', 'void', 'cancelled', 'pending')
      AND (cw.status_bayar IS NULL OR cw.status_bayar = 'Selesai')
      AND (cw.id_struk IS NULL OR s.status_bayar = 'Selesai');

    -- 8. Count Historical Consumed Redemptions
    SELECT COUNT(*) INTO v_redemptions_count
    FROM public.crm_loyalty_logs
    WHERE tenant_id = p_tenant_id
      AND upper(regexp_replace(trim(COALESCE(plat, '')), '\s+', '', 'g')) = v_clean_plate
      AND (tipe = 'REDEEM' OR (tipe IS NULL AND (claimed_at IS NOT NULL OR reward_title IS NOT NULL)));

    -- 9. Calculate Available Entitlement
    v_available := floor(v_visits_count / v_target_stamps) - v_redemptions_count;

    IF v_available <= 0 THEN
        RAISE EXCEPTION 'Stamp kunjungan belum cukup atau reward sudah diklaim';
    END IF;

    -- 10. Generate Unique ID and Insert Redemption Log
    v_redemption_id := 'red_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);

    INSERT INTO public.crm_loyalty_logs (
        id, tenant_id, plat, tipe, reward_title, reward_type, id_struk, keterangan, notes, nama_pelanggan, claimed_at, created_at
    ) VALUES (
        v_redemption_id, p_tenant_id, upper(trim(p_plat)), 'REDEEM', p_reward_title, p_reward_type, p_id_struk, p_notes, p_notes, p_nama_pelanggan, NOW(), NOW()
    );

    -- 11. Format JSON Response
    v_record := jsonb_build_object(
        'redemption_id', v_redemption_id,
        'tenant_id', p_tenant_id,
        'plat', upper(trim(p_plat)),
        'reward_title', p_reward_title,
        'claimed_at', NOW()
    );

    RETURN v_record;
END;
$$;

-- Revoke permissions from public/anon, grant only to authenticated and service_role
REVOKE ALL ON FUNCTION public.redeem_customer_reward(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_customer_reward(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
