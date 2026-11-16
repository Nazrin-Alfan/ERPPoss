-- ============================================================================
-- MIGRATION: 20261117000001_google_oauth_co_owner_and_staff_slug_login.sql
-- PURPOSE:
--   1. Protect 'Super Admin' role in handle_new_user_profile() so Google OAuth
--      or profile upserts never downgrade a Super Admin to Owner.
--   2. Smart Co-Owner Re-Bind in fn_register_tenant_staff():
--      If Owner 1 registers an existing Gmail as 'Owner' (Co-Owner) and that
--      Gmail previously accidentally triggered Google OAuth creating an empty
--      trial store (0 rows in struk, 1 profile), re-bind that user into
--      Owner 1's tenant and remove the empty accidental trial tenant.
--   3. Add fn_complete_google_owner_onboarding() RPC so first-time Google OAuth
--      Owners can update their auto-generated store name & business_type.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. PROTECT SUPER ADMIN ROLE IN handle_new_user_profile()
-- ============================================================================
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
    -- Jika profil sudah ada (misal Super Admin yang di-provision manual), jangan buat tenant baru
    SELECT role INTO v_existing_role FROM public.profiles WHERE id = NEW.id LIMIT 1;
    IF v_existing_role IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Jalur 1: Undangan / registrasi staf terverifikasi dari RPC backend terpercaya (via raw_app_meta_data)
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

    v_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
        split_part(NEW.email, '@', 1)
    );

    IF v_tenant_name IS NULL THEN
        IF NEW.raw_app_meta_data->>'provider' = 'google' THEN
            v_tenant_name := v_name || '''s Store';
        ELSE
            v_tenant_name := 'Toko ' || v_name;
        END IF;
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

-- ============================================================================
-- 2. SMART CO-OWNER RE-BIND IN fn_register_tenant_staff()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_register_tenant_staff(
    p_email TEXT,
    p_password TEXT,
    p_nama TEXT,
    p_role TEXT DEFAULT 'Kasir',
    p_tenant_id UUID DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_target_tenant_id UUID;
    v_target_branch_id UUID;
    v_tenant_slug TEXT;
    v_raw_input TEXT;
    v_username TEXT;
    v_clean_email TEXT;
    v_clean_nama TEXT;
    v_clean_role TEXT;
    v_new_user_id UUID;

    -- Re-bind variables
    v_existing_prof RECORD;
    v_old_tenant RECORD;
    v_old_tx_count INT := 0;
    v_old_prof_count INT := 0;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi login tidak ditemukan. Silakan login kembali.'
            USING ERRCODE = '42501';
    END IF;

    v_caller_role := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();
    v_caller_branch := public.current_branch_id();

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Role "%" tidak memiliki izin untuk mendaftarkan akun staf baru.', COALESCE(v_caller_role, 'Unknown')
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Super Admin' THEN
        v_target_tenant_id := COALESCE(p_tenant_id, v_caller_tenant);
    ELSE
        IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT: Tidak dapat mendaftarkan staf ke tenant lain.'
                USING ERRCODE = '42501';
        END IF;
        v_target_tenant_id := v_caller_tenant;
    END IF;

    IF v_target_tenant_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_TENANT: Konteks tenant tidak ditemukan untuk akun Anda.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_role := BTRIM(COALESCE(p_role, 'Kasir'));
    IF v_clean_role NOT IN ('Kasir', 'Admin', 'Owner', 'Staff Kantor', 'Karyawan Cuci') THEN
        RAISE EXCEPTION 'INVALID_ROLE: Peran "%" tidak valid.', v_clean_role
            USING ERRCODE = '23514';
    END IF;

    IF v_caller_role = 'Admin' AND v_clean_role IN ('Owner', 'Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin hanya dapat mendaftarkan akun Kasir atau Staf operasional.'
            USING ERRCODE = '42501';
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT id INTO v_target_branch_id
        FROM public.branches
        WHERE id = p_branch_id AND tenant_id = v_target_tenant_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_target_branch_id IS NULL AND v_caller_branch IS NOT NULL THEN
        SELECT id INTO v_target_branch_id
        FROM public.branches
        WHERE id = v_caller_branch AND tenant_id = v_target_tenant_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_target_branch_id IS NULL THEN
        SELECT id INTO v_target_branch_id
        FROM public.branches
        WHERE tenant_id = v_target_tenant_id AND is_active = TRUE
        ORDER BY (kode = 'MAIN') DESC, created_at ASC
        LIMIT 1;
    END IF;

    IF v_target_branch_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_BRANCH: Cabang aktif tidak ditemukan pada tenant ini.'
            USING ERRCODE = '23503';
    END IF;

    v_clean_nama := UPPER(BTRIM(COALESCE(p_nama, '')));
    IF v_clean_nama = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Nama lengkap staf wajib diisi.'
            USING ERRCODE = '23514';
    END IF;

    v_raw_input := LOWER(BTRIM(COALESCE(p_email, '')));
    IF v_raw_input = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Username atau email wajib diisi.'
            USING ERRCODE = '23514';
    END IF;

    IF LENGTH(COALESCE(p_password, '')) < 6 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Kata sandi minimal 6 karakter.'
            USING ERRCODE = '23514';
    END IF;

    SELECT slug INTO v_tenant_slug
    FROM public.tenants
    WHERE id = v_target_tenant_id
    LIMIT 1;

    v_tenant_slug := COALESCE(
        NULLIF(regexp_replace(LOWER(COALESCE(v_tenant_slug, '')), '[^a-z0-9-]', '', 'g'), ''),
        substr(replace(v_target_tenant_id::text, '-', ''), 1, 8)
    );

    IF POSITION('@' IN v_raw_input) = 0 OR v_raw_input LIKE '%@jb.local' THEN
        v_username := split_part(v_raw_input, '@', 1);
        v_username := regexp_replace(v_username, '[^a-z0-9._-]', '', 'g');
        IF v_username = '' THEN
            RAISE EXCEPTION 'INVALID_INPUT: Username tidak valid.'
                USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.tenant_id = v_target_tenant_id
              AND (
                  LOWER(p.email) = v_username || '@jb.local'
                  OR LOWER(p.email) = v_username || '.' || v_tenant_slug || '@pos.internal'
                  OR LOWER(split_part(split_part(p.email, '@', 1), '.', 1)) = v_username
              )
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_USER: Username "%" sudah digunakan oleh staf lain di toko Anda.', v_username
                USING ERRCODE = '23505';
        END IF;

        v_clean_email := v_username || '.' || v_tenant_slug || '@pos.internal';
    ELSE
        v_clean_email := v_raw_input;
        v_username := split_part(v_clean_email, '@', 1);
    END IF;

    -- Smart Co-Owner Re-Bind Check:
    -- Jika email sudah terdaftar dan role yang didaftarkan adalah 'Owner', cek apakah akun tersebut
    -- hanya memiliki toko trial kosong (0 struk & 1 profil) akibat salah klik Google Login.
    SELECT id, tenant_id, branch_id, role
    INTO v_existing_prof
    FROM public.profiles
    WHERE LOWER(email) = v_clean_email
    LIMIT 1;

    IF v_existing_prof.id IS NOT NULL THEN
        IF v_clean_role = 'Owner'
           AND v_existing_prof.role <> 'Super Admin'
           AND v_existing_prof.tenant_id IS DISTINCT FROM v_target_tenant_id THEN

            SELECT id, plan INTO v_old_tenant
            FROM public.tenants
            WHERE id = v_existing_prof.tenant_id
            LIMIT 1;

            SELECT COUNT(*) INTO v_old_tx_count
            FROM public.struk
            WHERE tenant_id = v_existing_prof.tenant_id;

            SELECT COUNT(*) INTO v_old_prof_count
            FROM public.profiles
            WHERE tenant_id = v_existing_prof.tenant_id;

            IF LOWER(COALESCE(v_old_tenant.plan, '')) = 'trial'
               AND v_old_tx_count = 0
               AND v_old_prof_count <= 1 THEN

                -- Re-bind user ke tenant target & perbarui raw_app_meta_data
                UPDATE auth.users
                SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
                    'tenant_id', v_target_tenant_id::text,
                    'branch_id', v_target_branch_id::text,
                    'erp_role', 'Owner'
                ),
                updated_at = NOW()
                WHERE id = v_existing_prof.id;

                UPDATE public.profiles
                SET tenant_id = v_target_tenant_id,
                    branch_id = v_target_branch_id,
                    nama = v_clean_nama,
                    role = 'Owner',
                    is_active = TRUE,
                    updated_at = NOW()
                WHERE id = v_existing_prof.id;

                -- Sinkronkan ke karyawan_kantor toko target
                INSERT INTO public.karyawan_kantor (
                    tenant_id, branch_id, nama, role, email, source, is_active, status, created_at
                ) VALUES (
                    v_target_tenant_id, v_target_branch_id, v_clean_nama, 'Owner', v_clean_email,
                    'staff_registration', TRUE, 'Aktif', NOW()
                ) ON CONFLICT DO NOTHING;

                -- Bersihkan tenant trial kosong bekas salah klik
                DELETE FROM public.tenant_licenses WHERE tenant_id = v_existing_prof.tenant_id;
                DELETE FROM public.branches WHERE tenant_id = v_existing_prof.tenant_id;
                DELETE FROM public.tenants WHERE id = v_existing_prof.tenant_id;

                RETURN jsonb_build_object(
                    'success', TRUE,
                    'rebound', TRUE,
                    'user', jsonb_build_object(
                        'id', v_existing_prof.id,
                        'email', v_clean_email,
                        'nama', v_clean_nama,
                        'role', 'Owner',
                        'tenant_id', v_target_tenant_id,
                        'branch_id', v_target_branch_id
                    )
                );
            END IF;
        END IF;

        RAISE EXCEPTION 'DUPLICATE_USER: Username atau email "%" sudah terdaftar. Gunakan username lain.', v_username
            USING ERRCODE = '23505';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) THEN
        RAISE EXCEPTION 'DUPLICATE_USER: Username atau email "%" sudah terdaftar. Gunakan username lain.', v_username
            USING ERRCODE = '23505';
    END IF;

    v_new_user_id := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current,
        email_change_confirm_status, reauthentication_token, is_sso_user, is_anonymous
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_new_user_id, 'authenticated', 'authenticated',
        v_clean_email, extensions.crypt(p_password, extensions.gen_salt('bf')), NOW(),
        jsonb_build_object(
            'provider', 'email',
            'providers', jsonb_build_array('email'),
            'tenant_id', v_target_tenant_id::text,
            'branch_id', v_target_branch_id::text,
            'erp_role', v_clean_role
        ),
        jsonb_build_object(
            'sub', v_new_user_id::text,
            'nama', v_clean_nama,
            'username', v_username,
            'role', v_clean_role,
            'email', v_clean_email,
            'tenant_id', v_target_tenant_id::text,
            'branch_id', v_target_branch_id::text,
            'email_verified', true,
            'phone_verified', false
        ),
        NOW(), NOW(), '', '', '', '', '', '', '', 0, '', FALSE, FALSE
    );

    INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_new_user_id::text, v_new_user_id,
        jsonb_build_object(
            'sub', v_new_user_id::text,
            'email', v_clean_email,
            'nama', v_clean_nama,
            'username', v_username,
            'role', v_clean_role,
            'tenant_id', v_target_tenant_id::text,
            'email_verified', true,
            'phone_verified', false
        ),
        'email', NOW(), NOW(), NOW()
    );

    INSERT INTO public.profiles (
        id, tenant_id, branch_id, nama, email, role, is_active, created_at, updated_at
    ) VALUES (
        v_new_user_id, v_target_tenant_id, v_target_branch_id, v_clean_nama, v_clean_email, v_clean_role, TRUE, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_active = TRUE,
        updated_at = NOW();

    IF v_clean_role = 'Kasir' THEN
        IF EXISTS (
            SELECT 1 FROM public.kasir
            WHERE tenant_id = v_target_tenant_id AND UPPER(BTRIM(nama)) = v_clean_nama
        ) THEN
            UPDATE public.kasir
            SET is_active = TRUE,
                branch_id = COALESCE(branch_id, v_target_branch_id)
            WHERE tenant_id = v_target_tenant_id AND UPPER(BTRIM(nama)) = v_clean_nama;
        ELSE
            INSERT INTO public.kasir (tenant_id, branch_id, nama, is_active, created_at)
            VALUES (v_target_tenant_id, v_target_branch_id, v_clean_nama, TRUE, NOW());
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'karyawan_kantor' AND c.relkind = 'r'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM public.karyawan_kantor
            WHERE tenant_id = v_target_tenant_id AND UPPER(BTRIM(nama)) = v_clean_nama
        ) THEN
            UPDATE public.karyawan_kantor
            SET role = v_clean_role,
                email = v_clean_email,
                is_active = TRUE,
                status = 'Aktif',
                branch_id = COALESCE(branch_id, v_target_branch_id)
            WHERE tenant_id = v_target_tenant_id AND UPPER(BTRIM(nama)) = v_clean_nama;
        ELSE
            INSERT INTO public.karyawan_kantor (
                tenant_id, branch_id, nama, role, email, source, is_active, status, created_at
            ) VALUES (
                v_target_tenant_id, v_target_branch_id, v_clean_nama, v_clean_role, v_clean_email,
                'staff_registration', TRUE, 'Aktif', NOW()
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'user', jsonb_build_object(
            'id', v_new_user_id,
            'email', v_clean_email,
            'username', v_username,
            'nama', v_clean_nama,
            'role', v_clean_role,
            'tenant_id', v_target_tenant_id,
            'branch_id', v_target_branch_id
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_register_tenant_staff(TEXT, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_register_tenant_staff(TEXT, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated;

-- ============================================================================
-- 3. COMPLETE GOOGLE OWNER ONBOARDING RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_complete_google_owner_onboarding(
    p_tenant_id UUID,
    p_store_name TEXT,
    p_business_type TEXT DEFAULT 'HYBRID',
    p_telepon TEXT DEFAULT '',
    p_alamat TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_user_tenant UUID;
    v_clean_name TEXT := BTRIM(COALESCE(p_store_name, ''));
    v_clean_type TEXT := UPPER(BTRIM(COALESCE(p_business_type, 'HYBRID')));
    v_clean_slug TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT role, tenant_id INTO v_role, v_user_tenant
    FROM public.profiles
    WHERE id = v_uid;

    IF v_role NOT IN ('Owner', 'Super Admin') OR (v_role <> 'Super Admin' AND v_user_tenant IS DISTINCT FROM p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Owner toko ini yang berhak memperbarui profil toko.' USING ERRCODE = '42501';
    END IF;

    IF v_clean_name = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Nama toko wajib diisi.' USING ERRCODE = '23514';
    END IF;

    IF v_clean_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_clean_type := 'HYBRID';
    END IF;

    v_clean_slug := lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_clean_slug := regexp_replace(v_clean_slug, '(^-|-$)', '', 'g');
    IF v_clean_slug = '' THEN
        v_clean_slug := 'toko-' || substr(md5(p_tenant_id::text), 1, 6);
    ELSE
        v_clean_slug := v_clean_slug || '-' || substr(md5(p_tenant_id::text), 1, 4);
    END IF;

    UPDATE public.tenants
    SET nama = v_clean_name,
        slug = v_clean_slug,
        business_type = v_clean_type,
        telepon = NULLIF(BTRIM(COALESCE(p_telepon, '')), ''),
        alamat = NULLIF(BTRIM(COALESCE(p_alamat, '')), ''),
        updated_at = NOW()
    WHERE id = p_tenant_id;

    UPDATE public.branches
    SET nama = v_clean_name || ' - Pusat',
        alamat = COALESCE(NULLIF(BTRIM(COALESCE(p_alamat, '')), ''), alamat),
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id AND kode = 'MAIN';

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'nama', v_clean_name,
        'slug', v_clean_slug,
        'business_type', v_clean_type
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_complete_google_owner_onboarding(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_complete_google_owner_onboarding(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
