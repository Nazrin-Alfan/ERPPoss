-- ==============================================================================
-- MIGRATION: 007_enforce_server_licensing_and_quotas.sql
-- DESCRIPTION: Batch 4 - Server-Side Licensing Enforcement & Quota Protections
-- ==============================================================================

-- 1. LOCKDOWN RLS PADA TABEL TENANT_LICENSES
-- Mencegah manipulasi kuota atau perpanjangan sepihak oleh klien tenant
ALTER TABLE public.tenant_licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_licenses ON public.tenant_licenses;
DROP POLICY IF EXISTS tenant_licenses_read ON public.tenant_licenses;
DROP POLICY IF EXISTS tenant_licenses_write ON public.tenant_licenses;

-- Policy Baca: Tenant hanya dapat membaca lisensinya sendiri; Super Admin dapat membaca semua
CREATE POLICY tenant_licenses_read ON public.tenant_licenses
    FOR SELECT
    TO authenticated
    USING (
        tenant_id = public.current_tenant_id() 
        OR (public.current_user_role())::text = 'Super Admin'::text
    );

-- Policy Tulis: HANYA Super Admin yang dapat insert/update/delete via REST API
CREATE POLICY tenant_licenses_write ON public.tenant_licenses
    FOR ALL
    TO authenticated
    USING ((public.current_user_role())::text = 'Super Admin'::text)
    WITH CHECK ((public.current_user_role())::text = 'Super Admin'::text);

-- 2. RPC AKTIVASI LISENSI AMAN SISI SERVER
CREATE OR REPLACE FUNCTION public.fn_activate_license_key(
    p_license_key TEXT,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID;
    v_caller_role TEXT;
    v_clean_key TEXT;
    v_new_expiry TIMESTAMPTZ;
    v_plan TEXT := 'pro';
    v_max_branches INT := 5;
    v_max_users INT := 10;
    v_existing_lic_id UUID;
    v_curr_expiry TIMESTAMPTZ;
BEGIN
    v_tenant_id := public.current_tenant_id();
    v_caller_role := (public.current_user_role())::text;

    -- Jika dipanggil oleh Super Admin atau proses superuser
    IF v_caller_role = 'Super Admin' OR SESSION_USER IN ('postgres', 'service_role') THEN
        v_tenant_id := COALESCE(p_tenant_id, v_tenant_id);
    ELSE
        -- Jika dipanggil oleh tenant reguler, pastikan tenant_id sesuai sesi aktif
        IF p_tenant_id IS NOT NULL AND p_tenant_id != v_tenant_id THEN
            RAISE EXCEPTION 'FORBIDDEN: Tidak dapat mengaktivasi lisensi tenant lain.';
        END IF;
        IF v_caller_role NOT IN ('Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN: Hanya peran Owner atau Super Admin yang berhak mengaktivasi lisensi (Role aktif: %).', v_caller_role;
        END IF;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Sesi tidak valid atau tenant_id tidak ditemukan.';
    END IF;

    v_clean_key := UPPER(TRIM(COALESCE(p_license_key, '')));
    IF LENGTH(v_clean_key) < 8 THEN
        RAISE EXCEPTION 'INVALID_LICENSE_KEY: Format kunci lisensi tidak valid (minimal 8 karakter).';
    END IF;

    -- Penentuan paket dan kuota berdasarkan tier
    IF v_clean_key LIKE '%ENT%' OR v_clean_key LIKE 'ENT-%' THEN
        v_plan := 'enterprise';
        v_max_branches := 25;
        v_max_users := 50;
    ELSIF v_clean_key LIKE '%STR%' OR v_clean_key LIKE 'STR-%' THEN
        v_plan := 'starter';
        v_max_branches := 1;
        v_max_users := 3;
    ELSE
        v_plan := 'pro';
        v_max_branches := 5;
        v_max_users := 10;
    END IF;

    -- Periksa lisensi saat ini untuk perpanjangan kumulatif
    SELECT id, valid_until INTO v_existing_lic_id, v_curr_expiry
    FROM public.tenant_licenses
    WHERE tenant_id = v_tenant_id
    ORDER BY valid_until DESC
    LIMIT 1;

    IF v_curr_expiry IS NOT NULL AND v_curr_expiry > NOW() THEN
        v_new_expiry := v_curr_expiry + INTERVAL '1 year';
    ELSE
        v_new_expiry := NOW() + INTERVAL '1 year';
    END IF;

    IF v_existing_lic_id IS NOT NULL THEN
        UPDATE public.tenant_licenses
        SET license_key = v_clean_key,
            plan = v_plan,
            tier = UPPER(v_plan) || '_ANNUAL',
            status = 'ACTIVE',
            valid_until = v_new_expiry,
            expires_at = v_new_expiry,
            max_branches = v_max_branches,
            max_users = v_max_users,
            notes = 'Diaktivasi via fn_activate_license_key pada ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            updated_at = NOW()
        WHERE id = v_existing_lic_id;
    ELSE
        INSERT INTO public.tenant_licenses (
            id, tenant_id, license_key, plan, tier, status,
            valid_until, expires_at, max_branches, max_users,
            features, notes, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_tenant_id, v_clean_key, v_plan, UPPER(v_plan) || '_ANNUAL', 'ACTIVE',
            v_new_expiry, v_new_expiry, v_max_branches, v_max_users,
            '{"pos": true, "inventory": true, "general_ledger": true, "multi_branch": true}'::jsonb,
            'Diaktivasi via fn_activate_license_key pada ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            NOW(), NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lisensi ' || UPPER(v_plan) || ' berhasil diaktifkan hingga ' || TO_CHAR(v_new_expiry, 'YYYY-MM-DD'),
        'plan', v_plan,
        'valid_until', v_new_expiry,
        'max_branches', v_max_branches,
        'max_users', v_max_users
    );
END;
$$;

DROP FUNCTION IF EXISTS public.fn_activate_license_key(TEXT);
REVOKE ALL ON FUNCTION public.fn_activate_license_key(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_activate_license_key(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_activate_license_key(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_activate_license_key(TEXT, UUID) TO service_role;

-- 3. TRIGGER PENEGAKAN SERVER-SIDE KUOTA CABANG (MAX_BRANCHES)
CREATE OR REPLACE FUNCTION public.fn_enforce_tenant_branch_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_role TEXT;
    v_max_branches INT;
    v_valid_until TIMESTAMPTZ;
    v_status TEXT;
    v_branch_count INT;
BEGIN
    -- Super Admin bypass limit check for system provisioning
    v_caller_role := (public.current_user_role())::text;
    IF v_caller_role = 'Super Admin' THEN
        RETURN NEW;
    END IF;

    -- Ambil lisensi aktif terbaru milik tenant
    SELECT max_branches, valid_until, status
    INTO v_max_branches, v_valid_until, v_status
    FROM public.tenant_licenses
    WHERE tenant_id = NEW.tenant_id
    ORDER BY
        CASE WHEN UPPER(status) = 'ACTIVE' THEN 1 ELSE 2 END,
        valid_until DESC
    LIMIT 1;

    -- Fallback default jika belum ada record lisensi: trial 1 branch
    v_max_branches := COALESCE(v_max_branches, 1);

    -- Cek masa berlaku lisensi
    IF v_valid_until IS NOT NULL AND v_valid_until < NOW() THEN
        RAISE EXCEPTION 'LICENSE_EXPIRED: Masa aktif lisensi tenant telah berakhir pada %. Silakan perpanjang lisensi Anda.', TO_CHAR(v_valid_until, 'YYYY-MM-DD');
    END IF;

    -- Hitung jumlah cabang yang saat ini aktif untuk tenant
    SELECT COUNT(*) INTO v_branch_count
    FROM public.branches
    WHERE tenant_id = NEW.tenant_id;

    -- Tolak jika sudah mencapai batas
    IF v_branch_count >= v_max_branches THEN
        RAISE EXCEPTION 'BRANCH_LIMIT_EXCEEDED: Batas maksimal cabang (% cabang) untuk paket lisensi Anda telah tercapai. Upgrade lisensi untuk menambah cabang.', v_max_branches;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_branch_limit ON public.branches;
CREATE TRIGGER trg_enforce_branch_limit
    BEFORE INSERT ON public.branches
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_tenant_branch_limit();

-- 4. TRIGGER PENEGAKAN SERVER-SIDE KUOTA PENGGUNA (MAX_USERS)
CREATE OR REPLACE FUNCTION public.fn_enforce_tenant_user_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_role TEXT;
    v_max_users INT;
    v_valid_until TIMESTAMPTZ;
    v_status TEXT;
    v_user_count INT;
BEGIN
    -- Super Admin bypass limit check for system provisioning
    v_caller_role := (public.current_user_role())::text;
    IF v_caller_role = 'Super Admin' THEN
        RETURN NEW;
    END IF;

    -- Ambil lisensi aktif terbaru milik tenant
    SELECT max_users, valid_until, status
    INTO v_max_users, v_valid_until, v_status
    FROM public.tenant_licenses
    WHERE tenant_id = NEW.tenant_id
    ORDER BY
        CASE WHEN UPPER(status) = 'ACTIVE' THEN 1 ELSE 2 END,
        valid_until DESC
    LIMIT 1;

    -- Fallback default jika belum ada record lisensi: 3 users
    v_max_users := COALESCE(v_max_users, 3);

    -- Cek masa berlaku lisensi
    IF v_valid_until IS NOT NULL AND v_valid_until < NOW() THEN
        RAISE EXCEPTION 'LICENSE_EXPIRED: Masa aktif lisensi tenant telah berakhir pada %. Silakan perpanjang lisensi Anda.', TO_CHAR(v_valid_until, 'YYYY-MM-DD');
    END IF;

    -- Hitung jumlah pengguna aktif saat ini untuk tenant
    SELECT COUNT(*) INTO v_user_count
    FROM public.profiles
    WHERE tenant_id = NEW.tenant_id
      AND is_active = TRUE;

    -- Tolak jika sudah mencapai batas
    IF v_user_count >= v_max_users THEN
        RAISE EXCEPTION 'USER_LIMIT_EXCEEDED: Batas maksimal pengguna (% pengguna) untuk paket lisensi Anda telah tercapai. Upgrade lisensi untuk menambah staf.', v_max_users;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_limit ON public.profiles;
CREATE TRIGGER trg_enforce_user_limit
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_tenant_user_limit();
