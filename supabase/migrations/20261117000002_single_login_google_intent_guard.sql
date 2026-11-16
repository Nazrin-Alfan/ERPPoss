-- ============================================================================
-- MIGRATION: 20261117000002_single_login_google_intent_guard.sql
-- PURPOSE:
--   1. Prevent handle_new_user_profile() from auto-creating a blank tenant
--      when a new Google OAuth user signs in without tenant_name.
--   2. Add fn_complete_google_oauth_flow() RPC to enforce strict intent:
--      - mode = 'login': reject unregistered Google users & clean up orphan auth user
--      - mode = 'register': atomically provision tenant, branch, COA, 14-day trial, Owner profile
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_tenant_name TEXT;
    v_name TEXT;
    v_business_type TEXT;
    v_clean_slug TEXT;
    v_trial_key TEXT;
    v_existing_role TEXT;
BEGIN
    SELECT role INTO v_existing_role FROM public.profiles WHERE id = NEW.id LIMIT 1;
    IF v_existing_role IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Jalur 1: Undangan / registrasi staf terverifikasi dari RPC backend
    IF NULLIF(NEW.raw_app_meta_data->>'tenant_id', '') IS NOT NULL THEN
        v_tenant_id := (NEW.raw_app_meta_data->>'tenant_id')::UUID;
        v_branch_id := NULLIF(NEW.raw_app_meta_data->>'branch_id', '')::UUID;

        IF COALESCE(NEW.raw_app_meta_data->>'erp_role', '') NOT IN ('Owner', 'Admin', 'Kasir', 'Staff Kantor', 'Karyawan Cuci') THEN
            RAISE EXCEPTION 'Peran staf tidak valid: %', COALESCE(NEW.raw_app_meta_data->>'erp_role', 'NULL');
        END IF;

        IF v_branch_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.branches WHERE id = v_branch_id AND tenant_id = v_tenant_id
        ) THEN
            RAISE EXCEPTION 'Cabang undangan tidak valid atau tidak terdaftar di tenant ini';
        END IF;

        v_name := COALESCE(
            NULLIF(btrim(NEW.raw_user_meta_data->>'nama'), ''),
            NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
            split_part(NEW.email, '@', 1)
        );

        INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
        VALUES (NEW.id, v_tenant_id, v_branch_id, v_name, NEW.email, NEW.raw_app_meta_data->>'erp_role', TRUE)
        ON CONFLICT (id) DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            branch_id = EXCLUDED.branch_id,
            nama = EXCLUDED.nama,
            role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW()
        WHERE public.profiles.role <> 'Super Admin';

        RETURN NEW;
    END IF;

    -- Jalur 2: Registrasi mandiri publik (Owner Baru)
    v_tenant_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'tenant_name'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama_toko'), '')
    );

    -- Google OAuth tanpa tenant_name ditunda ke fn_complete_google_oauth_flow()
    IF NEW.raw_app_meta_data->>'provider' = 'google' AND v_tenant_name IS NULL THEN
        RETURN NEW;
    END IF;

    v_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
        split_part(NEW.email, '@', 1)
    );

    IF v_tenant_name IS NULL THEN
        v_tenant_name := 'Toko ' || v_name;
    END IF;

    v_business_type := UPPER(COALESCE(NEW.raw_user_meta_data->>'business_type', 'HYBRID'));
    IF v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    v_clean_slug := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
    v_trial_key := 'RLPOS-TRL-' || upper(substr(md5(random()::text), 1, 8));

    INSERT INTO public.tenants (id, nama, slug, owner_name, owner_email, plan, status, business_type)
    VALUES (v_tenant_id, v_tenant_name, v_clean_slug, v_name, NEW.email, 'trial', 'active', v_business_type);

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '14 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 14, 'auto_generated', true)
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES (NEW.id, v_tenant_id, v_branch_id, v_name, NEW.email, 'Owner', TRUE)
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW()
    WHERE public.profiles.role <> 'Super Admin';

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_complete_google_oauth_flow(
    p_mode TEXT,
    p_tenant_name TEXT DEFAULT NULL,
    p_business_type TEXT DEFAULT 'HYBRID',
    p_owner_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_existing_profile RECORD;
    v_user_email TEXT;
    v_user_meta JSONB;
    v_name TEXT;
    v_tenant_name TEXT;
    v_business_type TEXT;
    v_tenant_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_clean_slug TEXT;
    v_trial_key TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi tidak ditemukan.';
    END IF;

    SELECT id, tenant_id, role INTO v_existing_profile
    FROM public.profiles
    WHERE id = v_uid
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'EXISTING_USER',
            'tenant_id', v_existing_profile.tenant_id,
            'role', v_existing_profile.role
        );
    END IF;

    IF LOWER(COALESCE(btrim(p_mode), 'login')) <> 'register' THEN
        -- Bersihkan akun auth OAuth yatim agar email tidak terkunci
        DELETE FROM auth.identities WHERE user_id = v_uid;
        DELETE FROM auth.users WHERE id = v_uid;

        RETURN jsonb_build_object(
            'status', 'UNREGISTERED',
            'message', 'email belum memiliki tenant, silahkan klik DAFTAR untuk memulai'
        );
    END IF;

    SELECT email, raw_user_meta_data INTO v_user_email, v_user_meta
    FROM auth.users
    WHERE id = v_uid
    LIMIT 1;

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;

    v_name := COALESCE(
        NULLIF(btrim(p_owner_name), ''),
        NULLIF(btrim(v_user_meta->>'nama'), ''),
        NULLIF(btrim(v_user_meta->>'full_name'), ''),
        split_part(v_user_email, '@', 1)
    );

    v_tenant_name := COALESCE(
        NULLIF(btrim(p_tenant_name), ''),
        v_name || '''s Store'
    );

    v_business_type := UPPER(COALESCE(NULLIF(btrim(p_business_type), ''), 'HYBRID'));
    IF v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    v_clean_slug := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
    v_trial_key := 'RLPOS-TRL-' || upper(substr(md5(random()::text), 1, 8));

    INSERT INTO public.tenants (id, nama, slug, owner_name, owner_email, plan, status, business_type)
    VALUES (v_tenant_id, v_tenant_name, v_clean_slug, v_name, v_user_email, 'trial', 'active', v_business_type);

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '14 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 14, 'auto_generated', true)
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES (v_uid, v_tenant_id, v_branch_id, v_name, v_user_email, 'Owner', TRUE)
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW()
    WHERE public.profiles.role <> 'Super Admin';

    RETURN jsonb_build_object(
        'status', 'REGISTERED_NEW_TENANT',
        'tenant_id', v_tenant_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_complete_google_oauth_flow(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_complete_google_oauth_flow(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
