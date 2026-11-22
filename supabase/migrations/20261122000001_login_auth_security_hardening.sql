-- ============================================================================
-- MIGRATION: 20261122000001_login_auth_security_hardening.sql
-- Purpose: Close login/auth security gaps identified in /ponytail-review:
--   1. Drop anon-callable email enumeration RPC (fn_resolve_login_email).
--   2. Enforce min 8-char passwords, bcrypt cost=10, remove default 'password123'
--      on fn_founder_create_tenant, and lock SET search_path TO '' on auth RPCs.
--   3. Remove unconsented cross-tenant Co-Owner tenant-deletion re-bind in
--      fn_register_tenant_staff.
--   4. Revoke auth.refresh_tokens & auth.sessions immediately on staff
--      DEACTIVATE, and block inactive profiles in fn_complete_google_oauth_flow.
--   5. Revoke PUBLIC/anon/authenticated EXECUTE on internal SECURITY DEFINER
--      trigger functions exposed via PostgREST.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. REMOVE ANON EMAIL ENUMERATION SURFACE (Finding #1)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_resolve_login_email(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.fn_resolve_login_email(TEXT, TEXT);

-- ----------------------------------------------------------------------------
-- 2. HARDEN fn_register_tenant_staff (Findings #2, #5, #7, #9)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_register_tenant_staff(
    p_email text,
    p_password text,
    p_nama text,
    p_role text DEFAULT 'Kasir'::text,
    p_tenant_id uuid DEFAULT NULL::uuid,
    p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

    IF LENGTH(COALESCE(p_password, '')) < 8 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Kata sandi minimal 8 karakter.'
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

    IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(email) = v_clean_email)
       OR EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) THEN
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
        v_clean_email, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), NOW(),
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
            WHERE tenant_id = v_target_tenant_id
              AND (profile_id = v_new_user_id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = v_clean_nama))
        ) THEN
            UPDATE public.kasir
            SET is_active = TRUE,
                profile_id = COALESCE(profile_id, v_new_user_id),
                branch_id = COALESCE(branch_id, v_target_branch_id)
            WHERE tenant_id = v_target_tenant_id
              AND (profile_id = v_new_user_id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = v_clean_nama));
        ELSE
            INSERT INTO public.kasir (tenant_id, branch_id, profile_id, nama, is_active, created_at)
            VALUES (v_target_tenant_id, v_target_branch_id, v_new_user_id, v_clean_nama, TRUE, NOW())
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'karyawan_kantor' AND c.relkind = 'r'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM public.karyawan_kantor
            WHERE tenant_id = v_target_tenant_id
              AND (profile_id = v_new_user_id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = v_clean_nama))
        ) THEN
            UPDATE public.karyawan_kantor
            SET role = v_clean_role,
                email = v_clean_email,
                profile_id = COALESCE(profile_id, v_new_user_id),
                is_active = TRUE,
                status = 'Aktif',
                branch_id = COALESCE(branch_id, v_target_branch_id)
            WHERE tenant_id = v_target_tenant_id
              AND (profile_id = v_new_user_id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = v_clean_nama));
        ELSE
            INSERT INTO public.karyawan_kantor (
                tenant_id, branch_id, profile_id, nama, role, email, source, is_active, status, created_at
            ) VALUES (
                v_target_tenant_id, v_target_branch_id, v_new_user_id, v_clean_nama, v_clean_role, v_clean_email,
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

REVOKE ALL ON FUNCTION public.fn_register_tenant_staff(TEXT, TEXT, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_register_tenant_staff(TEXT, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. HARDEN fn_founder_create_tenant (Findings #2, #5, #9)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_founder_create_tenant(
    p_store_name text,
    p_owner_name text,
    p_owner_email text,
    p_owner_password text DEFAULT NULL::text,
    p_telepon text DEFAULT '-'::text,
    p_alamat text DEFAULT '-'::text,
    p_business_type text DEFAULT 'HYBRID'::text,
    p_plan text DEFAULT 'pro'::text,
    p_license_months integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_caller_role TEXT;
    v_user_id UUID;
    v_tenant_id UUID;
    v_branch_id UUID;
    v_license_id UUID;
    v_license_key TEXT;
    v_clean_slug TEXT;
    v_plan TEXT;
    v_result JSONB;
BEGIN
    v_caller_role := public.current_user_role();
    IF v_caller_role != 'Super Admin' THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Founder / Super Admin yang berwenang menerbitkan tenant baru (Role aktif Anda: %)', v_caller_role;
    END IF;

    IF LENGTH(COALESCE(p_owner_password, '')) < 8 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Kata sandi awal Owner minimal 8 karakter.'
            USING ERRCODE = '23514';
    END IF;

    v_plan := LOWER(COALESCE(p_plan, 'pro'));
    IF v_plan LIKE '%enterprise%' THEN
        v_plan := 'enterprise';
    ELSIF v_plan LIKE '%basic%' THEN
        v_plan := 'basic';
    ELSE
        v_plan := 'pro';
    END IF;

    v_clean_slug := LOWER(REGEXP_REPLACE(p_store_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_clean_slug := TRIM(BOTH '-' FROM v_clean_slug);
    IF v_clean_slug = '' THEN
        v_clean_slug := 'store';
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        v_clean_slug := v_clean_slug || '-' || SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6);
    END IF;

    v_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (
        id, nama, slug, plan, status, business_type, created_at, updated_at
    ) VALUES (
        v_tenant_id,
        TRIM(p_store_name),
        v_clean_slug,
        v_plan,
        'active',
        COALESCE(p_business_type, 'HYBRID'),
        NOW(),
        NOW()
    );

    v_branch_id := gen_random_uuid();
    INSERT INTO public.branches (
        id, tenant_id, nama, kode, alamat, telepon, is_active, created_at, updated_at
    ) VALUES (
        v_branch_id,
        v_tenant_id,
        'Cabang Utama (' || TRIM(p_store_name) || ')',
        'MAIN',
        COALESCE(p_alamat, '-'),
        COALESCE(p_telepon, '-'),
        TRUE,
        NOW(),
        NOW()
    );

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_owner_email));

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            LOWER(TRIM(p_owner_email)),
            extensions.crypt(p_owner_password, extensions.gen_salt('bf', 10)),
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
                'sub', v_user_id::text,
                'nama', COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
                'role', 'Owner',
                'tenant_name', TRIM(p_store_name),
                'business_type', COALESCE(p_business_type, 'HYBRID'),
                'email_verified', true
            ),
            NOW(), NOW(), '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', LOWER(TRIM(p_owner_email))),
            'email',
            NOW(), NOW(), NOW()
        );
    END IF;

    INSERT INTO public.profiles (
        id, tenant_id, branch_id, nama, email, role, is_active, created_at, updated_at
    ) VALUES (
        v_user_id,
        v_tenant_id,
        v_branch_id,
        COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
        LOWER(TRIM(p_owner_email)),
        'Owner',
        TRUE,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW();

    v_license_id := gen_random_uuid();
    v_license_key := 'RLY-' || UPPER(SUBSTR(MD5(RANDOM()::text), 1, 4)) || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 5, 4)) || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 9, 4));

    INSERT INTO public.tenant_licenses (
        id, tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features, created_at, updated_at
    ) VALUES (
        v_license_id,
        v_tenant_id,
        v_license_key,
        v_plan,
        'active',
        NOW() + (COALESCE(p_license_months, 12) || ' months')::interval,
        5,
        15,
        '{"pos": true, "inventory": true, "finance": true, "reports": true}'::jsonb,
        NOW(),
        NOW()
    );

    v_result := jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id,
        'user_id', v_user_id,
        'nama', TRIM(p_store_name),
        'slug', v_clean_slug,
        'plan', v_plan,
        'status', 'active',
        'business_type', COALESCE(p_business_type, 'HYBRID'),
        'owner_name', COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
        'owner_email', LOWER(TRIM(p_owner_email)),
        'owner_password', '[SECURELY_ENCRYPTED]',
        'license_key', v_license_key,
        'telepon', COALESCE(p_telepon, '-'),
        'alamat', COALESCE(p_alamat, '-')
    );

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_founder_create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_founder_create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. REVOKE SESSIONS ON DEACTIVATE IN fn_manage_tenant_staff (Findings #3, #9)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_manage_tenant_staff(
    p_staff_id uuid,
    p_action text,
    p_new_role text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_caller_tenant UUID;
    v_target RECORD;
    v_clean_action TEXT;
    v_clean_role TEXT;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi login tidak ditemukan.'
            USING ERRCODE = '42501';
    END IF;

    v_caller_role := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Role "%" tidak memiliki izin untuk mengelola akun staf.', COALESCE(v_caller_role, 'Unknown')
            USING ERRCODE = '42501';
    END IF;

    SELECT id, tenant_id, branch_id, nama, email, role, is_active
    INTO v_target
    FROM public.profiles
    WHERE id = p_staff_id
    LIMIT 1;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Profil staf tidak ditemukan.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role <> 'Super Admin' AND v_target.tenant_id <> v_caller_tenant THEN
        RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT: Tidak dapat memodifikasi staf dari tenant lain.'
            USING ERRCODE = '42501';
    END IF;

    IF v_target.role IN ('Owner', 'Super Admin') AND v_caller_role <> 'Super Admin' THEN
        RAISE EXCEPTION 'FORBIDDEN_MUTATE_CO_OWNER: Akun dengan role "%" dilindungi dan tidak dapat diubah atau dinonaktifkan oleh sesama Owner/Admin.', v_target.role
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Admin' AND v_target.role = 'Admin' AND v_target.id <> v_caller_uid THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin tidak dapat memodifikasi akun Admin lain.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_action := UPPER(BTRIM(COALESCE(p_action, '')));

    IF v_clean_action = 'UPDATE_ROLE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Owner yang dapat mengubah role akun staf.'
                USING ERRCODE = '42501';
        END IF;

        v_clean_role := BTRIM(COALESCE(p_new_role, ''));
        IF v_clean_role NOT IN ('Kasir', 'Admin', 'Staff Kantor', 'Karyawan Cuci', 'Owner') THEN
            RAISE EXCEPTION 'INVALID_ROLE: Peran baru "%" tidak valid.', v_clean_role
                USING ERRCODE = '23514';
        END IF;

        UPDATE public.profiles
        SET role = v_clean_role,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE auth.users
        SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('erp_role', v_clean_role),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_clean_role),
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE public.karyawan_kantor
        SET role = v_clean_role,
            profile_id = COALESCE(profile_id, v_target.id)
        WHERE tenant_id = v_target.tenant_id
          AND (
              profile_id = v_target.id
              OR (
                  profile_id IS NULL
                  AND (
                      (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
                      OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
                  )
              )
          );

        IF v_clean_role = 'Kasir' AND v_target.is_active IS TRUE THEN
            IF EXISTS (
                SELECT 1 FROM public.kasir
                WHERE tenant_id = v_target.tenant_id
                  AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))))
            ) THEN
                UPDATE public.kasir
                SET is_active = TRUE,
                    profile_id = COALESCE(profile_id, v_target.id)
                WHERE tenant_id = v_target.tenant_id
                  AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))));
            ELSE
                INSERT INTO public.kasir (tenant_id, branch_id, profile_id, nama, is_active, created_at)
                VALUES (v_target.tenant_id, v_target.branch_id, v_target.id, UPPER(BTRIM(v_target.nama)), TRUE, NOW())
                ON CONFLICT DO NOTHING;
            END IF;
        ELSE
            UPDATE public.kasir
            SET is_active = FALSE,
                profile_id = COALESCE(profile_id, v_target.id)
            WHERE tenant_id = v_target.tenant_id
              AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))));
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'UPDATE_ROLE',
            'staff_id', v_target.id,
            'nama', v_target.nama,
            'new_role', v_clean_role,
            'is_active', v_target.is_active
        );

    ELSIF v_clean_action = 'DEACTIVATE' THEN
        UPDATE public.profiles
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE auth.users
        SET banned_until = '2099-12-31 23:59:59+00'::timestamptz,
            updated_at = NOW()
        WHERE id = v_target.id;

        DELETE FROM auth.refresh_tokens WHERE user_id = v_target.id::text;
        DELETE FROM auth.sessions WHERE user_id = v_target.id;

        UPDATE public.kasir
        SET is_active = FALSE,
            profile_id = COALESCE(profile_id, v_target.id)
        WHERE tenant_id = v_target.tenant_id
          AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))));

        UPDATE public.karyawan_kantor
        SET is_active = FALSE,
            status = 'Nonaktif',
            profile_id = COALESCE(profile_id, v_target.id)
        WHERE tenant_id = v_target.tenant_id
          AND (
              profile_id = v_target.id
              OR (
                  profile_id IS NULL
                  AND (
                      (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
                      OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
                  )
              )
          );

        RETURN jsonb_build_object(
            'success', true,
            'action', 'DEACTIVATE',
            'staff_id', v_target.id,
            'nama', v_target.nama,
            'role', v_target.role,
            'is_active', false
        );

    ELSIF v_clean_action = 'ACTIVATE' THEN
        UPDATE public.profiles
        SET is_active = TRUE,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE auth.users
        SET banned_until = NULL,
            updated_at = NOW()
        WHERE id = v_target.id;

        IF v_target.role = 'Kasir' THEN
            IF EXISTS (
                SELECT 1 FROM public.kasir
                WHERE tenant_id = v_target.tenant_id
                  AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))))
            ) THEN
                UPDATE public.kasir
                SET is_active = TRUE,
                    profile_id = COALESCE(profile_id, v_target.id)
                WHERE tenant_id = v_target.tenant_id
                  AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))));
            ELSE
                INSERT INTO public.kasir (tenant_id, branch_id, profile_id, nama, is_active, created_at)
                VALUES (v_target.tenant_id, v_target.branch_id, v_target.id, UPPER(BTRIM(v_target.nama)), TRUE, NOW())
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;

        UPDATE public.karyawan_kantor
        SET is_active = TRUE,
            status = 'Aktif',
            profile_id = COALESCE(profile_id, v_target.id)
        WHERE tenant_id = v_target.tenant_id
          AND (
              profile_id = v_target.id
              OR (
                  profile_id IS NULL
                  AND (
                      (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
                      OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
                  )
              )
          );

        RETURN jsonb_build_object(
            'success', true,
            'action', 'ACTIVATE',
            'staff_id', v_target.id,
            'nama', v_target.nama,
            'role', v_target.role,
            'is_active', true
        );
    ELSE
        RAISE EXCEPTION 'INVALID_ACTION: Aksi "%" tidak dikenali. Gunakan UPDATE_ROLE, DEACTIVATE, atau ACTIVATE.', v_clean_action
            USING ERRCODE = '23514';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_manage_tenant_staff(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_manage_tenant_staff(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. BLOCK INACTIVE USERS IN fn_complete_google_oauth_flow (Finding #3)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_complete_google_oauth_flow(
    p_mode text,
    p_tenant_name text DEFAULT NULL::text,
    p_business_type text DEFAULT 'HYBRID'::text,
    p_owner_name text DEFAULT NULL::text
)
RETURNS jsonb
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

    SELECT id, tenant_id, role, is_active INTO v_existing_profile
    FROM public.profiles
    WHERE id = v_uid
    LIMIT 1;

    IF FOUND THEN
        IF v_existing_profile.is_active IS FALSE THEN
            RETURN jsonb_build_object(
                'status', 'INACTIVE',
                'message', 'ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'
            );
        END IF;
        RETURN jsonb_build_object(
            'status', 'EXISTING_USER',
            'tenant_id', v_existing_profile.tenant_id,
            'role', v_existing_profile.role
        );
    END IF;

    IF LOWER(COALESCE(btrim(p_mode), 'login')) <> 'register' THEN
        BEGIN
            DELETE FROM auth.identities WHERE user_id = v_uid;
            DELETE FROM auth.users WHERE id = v_uid;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

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

    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type, onboarding_completed)
    VALUES (v_tenant_id, v_tenant_name, v_clean_slug, 'trial', 'active', v_business_type, FALSE);

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_main, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE, TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '30 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 30, 'auto_generated', true)
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

-- ----------------------------------------------------------------------------
-- 6. REVOKE PUBLIC/ANON/AUTHENTICATED EXECUTE ON INTERNAL TRIGGER FUNCTIONS (Finding #9)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'public.fn_enforce_license_on_struk_settle()',
        'public.fn_normalize_pengeluaran_identifiers()',
        'public.fn_prevent_delete_referenced_stock()',
        'public.fn_propagate_menu_rename_to_resep()',
        'public.fn_propagate_stock_rename_to_resep()',
        'public.fn_sync_pengeluaran_to_inventory()',
        'public.fn_sync_profile_to_tenant_membership()',
        'public.fn_sync_resep_columns()'
    ]
    LOOP
        BEGIN
            EXECUTE 'REVOKE ALL ON FUNCTION ' || v_fn || ' FROM PUBLIC, anon, authenticated';
        EXCEPTION WHEN undefined_function THEN
            NULL;
        END;
    END LOOP;
END $$;

COMMIT;
