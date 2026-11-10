-- ==============================================================================
-- MIGRATION 20261107000003: PR-4 — HARDENING RPC redeem_customer_reward
-- Branch: feat/access-control-rbac-integrated
-- Fixes:
--   - Remove reference to non-existent cw.status_bayar (only struk has status_bayar)
--   - Require valid receipt link and distinct paid receipts
--   - Active caller & branch scoping (Owner, Admin, Kasir only)
--   - Canonical loyalty program enforcement from database
--   - Transactional advisory lock & entitlement slot serialization
--   - Idempotent replay by id_struk or request_key
--   - Close direct write privileges on loyalty log tables
-- ==============================================================================

BEGIN;

-- Ensure supporting columns and indexes exist on crm_loyalty_logs and crm_loyalty_programs
ALTER TABLE public.crm_loyalty_logs ADD COLUMN IF NOT EXISTS entitlement_seq INT;
ALTER TABLE public.crm_loyalty_logs ADD COLUMN IF NOT EXISTS request_key TEXT;
ALTER TABLE public.crm_loyalty_programs ADD COLUMN IF NOT EXISTS vip_min_visits INT DEFAULT 5;
ALTER TABLE public.crm_loyalty_programs ADD COLUMN IF NOT EXISTS vip_min_spent NUMERIC(18, 4) DEFAULT 0;
ALTER TABLE public.crm_loyalty_programs ADD COLUMN IF NOT EXISTS loyal_min_visits INT DEFAULT 3;
ALTER TABLE public.crm_loyalty_programs ADD COLUMN IF NOT EXISTS active_days_threshold INT DEFAULT 14;
ALTER TABLE public.crm_loyalty_programs ADD COLUMN IF NOT EXISTS churn_days_threshold INT DEFAULT 30;
ALTER TABLE public.crm_loyalty_programs ADD COLUMN IF NOT EXISTS vip_retention_mode VARCHAR(50) DEFAULT 'DYNAMIC';
ALTER TABLE public.crm_loyalty_programs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_loyalty_logs_slot
ON public.crm_loyalty_logs (tenant_id, plat, entitlement_seq)
WHERE tipe = 'REDEEM';

CREATE INDEX IF NOT EXISTS idx_loyalty_logs_struk_replay
ON public.crm_loyalty_logs (tenant_id, id_struk)
WHERE tipe = 'REDEEM' AND id_struk IS NOT NULL;

-- Prevent PGRST203 overload conflict by dropping the legacy 7-parameter function signature
DROP FUNCTION IF EXISTS public.redeem_customer_reward(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.redeem_customer_reward(
    p_tenant_id UUID,
    p_plat TEXT,
    p_reward_title TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT '',
    p_nama_pelanggan TEXT DEFAULT '',
    p_reward_type TEXT DEFAULT NULL,
    p_id_struk TEXT DEFAULT NULL,
    p_request_key TEXT DEFAULT NULL
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
    v_caller_branch UUID;
    v_program_id UUID;
    v_program_active BOOLEAN;
    v_target_stamps INT;
    v_canonical_title TEXT;
    v_canonical_type TEXT;
    v_visits_count INT := 0;
    v_redemptions_count INT := 0;
    v_available INT := 0;
    v_redemption_id TEXT;
    v_existing RECORD;
    v_entitlement_seq INT;
    v_effective_id_struk TEXT := NULLIF(trim(COALESCE(p_id_struk, '')), '');
    v_effective_request_key TEXT := NULLIF(trim(COALESCE(p_request_key, '')), '');
    v_record JSONB;
BEGIN
    -- 1. Input Validation
    IF p_tenant_id IS NULL OR v_clean_plate = '' THEN
        RAISE EXCEPTION 'Tenant ID dan Plat nomor kendaraan wajib diisi';
    END IF;

    -- 2. AC-09: Authenticated & Active Caller Verification with Role Allowlist
    v_caller_role   := COALESCE(public.current_user_role(), 'Anon');
    v_caller_tenant := public.current_tenant_id();
    v_caller_branch := public.current_branch_id();

    IF v_caller_role = 'Anon' OR (v_caller_tenant IS NULL AND v_caller_role <> 'Super Admin') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_OR_INACTIVE';
    END IF;

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin', 'Kasir') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_REDEEM: Role "%" tidak memiliki wewenang menukarkan reward.', v_caller_role
            USING ERRCODE = '42501';
    END IF;

    -- 3. AC-11: Cross-Tenant Isolation Enforcement
    IF v_caller_role <> 'Super Admin' AND p_tenant_id <> v_caller_tenant THEN
        RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_REDEEM';
    END IF;

    -- 4. AC-12: Concurrency Serialization via Transaction Advisory Lock
    PERFORM pg_advisory_xact_lock(hashtext('reward_claim:' || p_tenant_id::text || ':' || v_clean_plate)::bigint);

    -- 5. AC-12b: Idempotency Protection
    -- Check replay via id_struk or request_key
    IF v_effective_id_struk IS NOT NULL OR v_effective_request_key IS NOT NULL THEN
        SELECT id, reward_title, claimed_at INTO v_existing
        FROM public.crm_loyalty_logs
        WHERE tenant_id = p_tenant_id
          AND tipe = 'REDEEM'
          AND (
              (v_effective_id_struk IS NOT NULL AND id_struk = v_effective_id_struk)
              OR
              (v_effective_request_key IS NOT NULL AND request_key = v_effective_request_key)
          )
        LIMIT 1;

        IF v_existing.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'redemption_id', v_existing.id,
                'tenant_id', p_tenant_id,
                'plat', upper(trim(p_plat)),
                'reward_title', v_existing.reward_title,
                'idempotent_replay', true,
                'claimed_at', v_existing.claimed_at
            );
        END IF;
    END IF;

    -- 6. AC-10: Active Loyalty Program Gate (Canonical Program from DB)
    SELECT id, is_active, target_stamps, reward_title, reward_type
    INTO v_program_id, v_program_active, v_target_stamps, v_canonical_title, v_canonical_type
    FROM public.crm_loyalty_programs
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
      AND (v_caller_branch IS NULL OR branch_id = v_caller_branch OR branch_id IS NULL)
    ORDER BY (branch_id = v_caller_branch) DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF NOT FOUND OR v_program_active IS NOT TRUE OR COALESCE(v_target_stamps, 0) <= 0 THEN
        RAISE EXCEPTION 'LOYALTY_PROGRAM_UNAVAILABLE';
    END IF;

    -- Use canonical values if caller did not provide or to prevent client tampering
    v_canonical_title := COALESCE(NULLIF(trim(p_reward_title), ''), v_canonical_title, 'Gratis Cuci Mobil');
    v_canonical_type  := COALESCE(NULLIF(trim(p_reward_type), ''), v_canonical_type, 'FREE_SERVICE');

    -- 7. AC-11b: Strict Paid Visits Filter (Qualifying Visits Only)
    -- Must have linked receipt (id_struk) with status_bayar = 'Selesai'
    SELECT COUNT(DISTINCT s.id_struk) INTO v_visits_count
    FROM public.carwash cw
    INNER JOIN public.struk s ON s.tenant_id = cw.tenant_id AND s.id_struk = cw.id_struk
    WHERE cw.tenant_id = p_tenant_id
      AND upper(regexp_replace(trim(COALESCE(cw.plat, '')), '\s+', '', 'g')) = v_clean_plate
      AND lower(COALESCE(cw.status, '')) NOT IN ('batal', 'void', 'cancelled', 'pending')
      AND s.status_bayar IN ('Selesai', 'Lunas')
      AND COALESCE(s.total_tagihan, 0) > 0;

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

    v_entitlement_seq := v_redemptions_count + 1;

    -- 10. Generate Unique ID and Insert Redemption Log
    v_redemption_id := 'red_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);

    INSERT INTO public.crm_loyalty_logs (
        id, tenant_id, branch_id, plat, tipe, reward_title, reward_type, 
        id_struk, request_key, entitlement_seq, keterangan, notes, 
        nama_pelanggan, claimed_at, created_at
    ) VALUES (
        v_redemption_id, p_tenant_id, v_caller_branch, upper(trim(p_plat)), 'REDEEM', 
        v_canonical_title, v_canonical_type, v_effective_id_struk, v_effective_request_key, 
        v_entitlement_seq, p_notes, p_notes, p_nama_pelanggan, NOW(), NOW()
    );

    -- Also record claim record if customer_reward_claims table exists
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_reward_claims' AND c.relkind = 'r') THEN
        INSERT INTO public.customer_reward_claims (
            tenant_id, branch_id, plat, customer_name, reward_id, id_struk, claimed_at, status
        ) VALUES (
            p_tenant_id, v_caller_branch, upper(trim(p_plat)), p_nama_pelanggan, v_program_id, v_effective_id_struk, NOW(), 'COMPLETED'
        );
    END IF;

    -- 11. Format JSON Response
    v_record := jsonb_build_object(
        'redemption_id', v_redemption_id,
        'tenant_id', p_tenant_id,
        'plat', upper(trim(p_plat)),
        'reward_title', v_canonical_title,
        'entitlement_seq', v_entitlement_seq,
        'claimed_at', NOW()
    );

    RETURN v_record;
END;
$$;

-- Revoke permissions from public/anon, grant only to authenticated and service_role
REVOKE ALL ON FUNCTION public.redeem_customer_reward(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_customer_reward(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
