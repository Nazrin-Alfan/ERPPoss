-- ============================================================================
-- MIGRATION: 20261107000008_unified_staff_lifecycle_and_co_owner_protection.sql
-- PURPOSE:
--   1. Enforce Co-Owner Protection (FORBIDDEN_MUTATE_CO_OWNER):
--      An Owner can update roles or deactivate non-Owner staff (Kasir, Admin,
--      Staff Kantor, Karyawan Cuci), but CANNOT delete, deactivate, or change
--      the role of another Owner account.
--   2. Tenant-Scoped Staff Username Pattern (<username>.<tenant_slug>@pos.internal):
--      Allow different tenants to register staff/cashiers with the same username
--      (e.g., 'kasir1' or 'budi') without global email collisions in auth.users,
--      while preserving backward-compatible login for short usernames & @jb.local.
--   3. Unified Atomic Staff Lifecycle RPC (public.fn_manage_tenant_staff):
--      Synchronize UPDATE_ROLE, DEACTIVATE (Soft Delete Opsi A), and ACTIVATE
--      atomically across auth.users, public.profiles, public.kasir, and
--      public.karyawan_kantor.
--   4. Login Email Resolver RPC (public.fn_resolve_login_email):
--      Resolve short usernames or tenant-scoped usernames to their internal email
--      and reject deactivated accounts immediately at login.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. PASTIKAN KOLOM STATUS AKTIF TERSEDIA DI public.karyawan_kantor
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'karyawan_kantor' AND c.relkind = 'r'
    ) THEN
        ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Aktif';
        UPDATE public.karyawan_kantor SET is_active = TRUE WHERE is_active IS NULL;
        UPDATE public.karyawan_kantor SET status = 'Aktif' WHERE status IS NULL;
    END IF;
END $$;

-- ============================================================================
-- 1. UPGRADE public.fn_protect_profile_role_and_tenant
--    Menambahkan aturan FORBIDDEN_MUTATE_CO_OWNER:
--    Sesama Owner tidak dapat menghapus, menonaktifkan, atau menurunkan role
--    akun Owner lainnya.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_protect_profile_role_and_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_uid   UUID;
    v_caller_role  VARCHAR(50);
    v_caller_tenant UUID;
    v_active_owner_count INT;
BEGIN
    v_caller_uid    := auth.uid();
    v_caller_role   := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();

    -- =========================================================================
    -- 1. PROTEKSI DELETE
    -- =========================================================================
    IF TG_OP = 'DELETE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" tidak diizinkan menghapus profil.', v_caller_role
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_DELETE: Owner tidak dapat menghapus profil di luar tenant sendiri.'
                USING ERRCODE = '42501';
        END IF;

        -- Proteksi Sesama Owner: Owner tidak boleh menghapus akun Owner
        IF OLD.role = 'Owner' AND v_caller_role = 'Owner' THEN
            RAISE EXCEPTION 'FORBIDDEN_MUTATE_CO_OWNER: Sesama Owner tidak dapat menghapus akun Owner satu sama lain.'
                USING ERRCODE = '42501';
        END IF;

        -- Serialisasi & proteksi jika menghapus profil Owner (oleh Super Admin)
        IF OLD.role = 'Owner' THEN
            PERFORM pg_advisory_xact_lock(hashtext('profile_owner_guard:' || OLD.tenant_id::text)::bigint);
            SELECT COUNT(*) INTO v_active_owner_count
            FROM public.profiles
            WHERE tenant_id = OLD.tenant_id
              AND role = 'Owner'
              AND is_active = TRUE
              AND id <> OLD.id;

            IF v_active_owner_count = 0 THEN
                RAISE EXCEPTION 'LAST_ACTIVE_OWNER_PROTECTED: Tidak dapat menghapus satu-satunya Owner aktif pada tenant ini.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN OLD;
    END IF;

    -- =========================================================================
    -- 2. PROTEKSI INSERT
    -- =========================================================================
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_active IS NULL THEN
            NEW.is_active := TRUE;
        END IF;

        IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak membuat profil Super Admin.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.role = 'Owner' AND v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            IF EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = NEW.tenant_id LIMIT 1) THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Penambahan Owner hanya oleh Owner atau Super Admin yang ada.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        IF v_caller_role = 'Admin' AND NEW.role IN ('Super Admin', 'Owner', 'Admin') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin hanya dapat membuat profil staf operasional (Kasir, Staff Kantor, Karyawan Cuci).'
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role IN ('Kasir', 'Staff Kantor', 'Karyawan Cuci') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" dilarang membuat profil pengguna baru.', v_caller_role
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role IN ('Owner', 'Admin') AND NEW.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_INSERT: Tidak dapat membuat profil untuk tenant lain.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.branch_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.branches
                WHERE id = NEW.branch_id AND tenant_id = NEW.tenant_id AND is_active = TRUE
            ) THEN
                RAISE EXCEPTION 'INVALID_BRANCH_ASSIGNMENT: branch_id tidak terdaftar atau tidak aktif pada tenant ini.'
                    USING ERRCODE = '23503';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- =========================================================================
    -- 3. PROTEKSI UPDATE
    -- =========================================================================
    IF TG_OP = 'UPDATE' THEN
        IF OLD.id IS DISTINCT FROM NEW.id THEN
            RAISE EXCEPTION 'FORBIDDEN_ID_MUTATION: ID profil bersifat mutlak immutable.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.is_active IS NULL THEN
            RAISE EXCEPTION 'INVALID_PROFILE_STATUS: is_active tidak boleh bernilai NULL.'
                USING ERRCODE = '23502';
        END IF;

        IF v_caller_role IN ('Kasir', 'Staff Kantor', 'Karyawan Cuci') THEN
            IF OLD.id <> v_caller_uid THEN
                RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" tidak dapat memutasi profil pengguna lain.', v_caller_role
                    USING ERRCODE = '42501';
            END IF;
            IF OLD.role IS DISTINCT FROM NEW.role OR
               OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR
               OLD.branch_id IS DISTINCT FROM NEW.branch_id OR
               OLD.is_active IS DISTINCT FROM NEW.is_active OR
               OLD.email IS DISTINCT FROM NEW.email THEN
                RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" hanya diizinkan memperbarui nama profil sendiri.', v_caller_role
                    USING ERRCODE = '42501';
            END IF;
            RETURN NEW;
        END IF;

        IF v_caller_role = 'Admin' THEN
            IF OLD.tenant_id <> v_caller_tenant THEN
                RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_UPDATE: Admin tidak dapat memutasi profil di luar tenant sendiri.'
                    USING ERRCODE = '42501';
            END IF;
            IF OLD.role IN ('Owner', 'Super Admin') OR (OLD.role = 'Admin' AND OLD.id <> v_caller_uid) THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin dilarang memutasi profil Owner, Super Admin, atau Admin lain.'
                    USING ERRCODE = '42501';
            END IF;
            IF NEW.role IN ('Owner', 'Super Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin dilarang mengubah role menjadi Owner atau Super Admin.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_UPDATE: Owner tidak dapat memutasi profil di luar tenant sendiri.'
                USING ERRCODE = '42501';
        END IF;

        IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
            IF v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_TENANT_MUTATION: Pemindahan tenant_id hanya dapat dilakukan oleh Super Admin.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        -- Proteksi Role & Co-Owner Guard
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Role "%" dilarang mengubah role profil (Role saat ini: %).', v_caller_role, OLD.role
                    USING ERRCODE = '42501';
            END IF;

            IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak menetapkan role Super Admin.'
                    USING ERRCODE = '42501';
            END IF;

            -- Sesama Owner tidak boleh mengubah/menurunkan role Owner
            IF OLD.role = 'Owner' AND v_caller_role = 'Owner' THEN
                RAISE EXCEPTION 'FORBIDDEN_MUTATE_CO_OWNER: Owner hanya dapat mengubah role akun staf selain Owner.'
                    USING ERRCODE = '42501';
            END IF;

            IF OLD.role = 'Owner' AND NEW.role <> 'Owner' THEN
                PERFORM pg_advisory_xact_lock(hashtext('profile_owner_guard:' || OLD.tenant_id::text)::bigint);
                SELECT COUNT(*) INTO v_active_owner_count
                FROM public.profiles
                WHERE tenant_id = OLD.tenant_id
                  AND role = 'Owner'
                  AND is_active = TRUE
                  AND id <> OLD.id;

                IF v_active_owner_count = 0 THEN
                    RAISE EXCEPTION 'LAST_ACTIVE_OWNER_PROTECTED: Tidak dapat mengubah role satu-satunya Owner aktif pada tenant ini.'
                        USING ERRCODE = '42501';
                END IF;
            END IF;
        END IF;

        -- Proteksi branch_id
        IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_BRANCH_MUTATION: Role "%" tidak diizinkan mengubah branch_id profil.', v_caller_role
                    USING ERRCODE = '42501';
            END IF;

            IF NEW.branch_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.branches
                    WHERE id = NEW.branch_id AND tenant_id = NEW.tenant_id AND is_active = TRUE
                ) THEN
                    RAISE EXCEPTION 'INVALID_BRANCH_ASSIGNMENT: branch_id tujuan tidak terdaftar atau tidak aktif pada tenant ini.'
                        USING ERRCODE = '23503';
                END IF;
            END IF;
        END IF;

        -- Proteksi is_active & Co-Owner Guard
        IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_STATUS_MUTATION: Role "%" tidak diizinkan mengubah status aktif profil.', v_caller_role
                    USING ERRCODE = '42501';
            END IF;

            IF OLD.role = 'Owner' AND NEW.is_active IS NOT TRUE THEN
                IF v_caller_role = 'Owner' THEN
                    RAISE EXCEPTION 'FORBIDDEN_MUTATE_CO_OWNER: Sesama Owner tidak dapat menonaktifkan akun Owner satu sama lain.'
                        USING ERRCODE = '42501';
                END IF;

                PERFORM pg_advisory_xact_lock(hashtext('profile_owner_guard:' || OLD.tenant_id::text)::bigint);
                SELECT COUNT(*) INTO v_active_owner_count
                FROM public.profiles
                WHERE tenant_id = OLD.tenant_id
                  AND role = 'Owner'
                  AND is_active = TRUE
                  AND id <> OLD.id;

                IF v_active_owner_count = 0 THEN
                    RAISE EXCEPTION 'LAST_ACTIVE_OWNER_PROTECTED: Tidak dapat menonaktifkan satu-satunya Owner aktif pada tenant ini.'
                        USING ERRCODE = '42501';
                END IF;
            END IF;

            IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
                RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_UPDATE: Owner tidak dapat mengubah status profil di luar tenant sendiri.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_protect_profile_role_and_tenant() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. UPGRADE public.fn_register_tenant_staff
--    - Menggunakan format email internal terisolasi per tenant:
--      <username>.<tenant_slug>@pos.internal
--      sehingga dua toko/tenant berbeda dapat memiliki nama username kasir
--      yang sama (misal 'kasir1' atau 'budi') tanpa bentrok di auth.users!
--    - Otomatis menyinkronkan ke public.kasir & public.karyawan_kantor dalam
--      1 transaksi database atomik.
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

    -- Tentukan target branch_id
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

    -- Ambil slug tenant untuk membentuk namespace unik per toko (<username>.<tenant_slug>@pos.internal)
    SELECT slug INTO v_tenant_slug
    FROM public.tenants
    WHERE id = v_target_tenant_id
    LIMIT 1;

    v_tenant_slug := COALESCE(
        NULLIF(regexp_replace(LOWER(COALESCE(v_tenant_slug, '')), '[^a-z0-9-]', '', 'g'), ''),
        substr(replace(v_target_tenant_id::text, '-', ''), 1, 8)
    );

    -- Jika input adalah username tanpa '@' atau masih memakai domain lokal '@jb.local',
    -- ubah ke format tenant-scoped: <username>.<tenant_slug>@pos.internal
    IF POSITION('@' IN v_raw_input) = 0 OR v_raw_input LIKE '%@jb.local' THEN
        v_username := split_part(v_raw_input, '@', 1);
        v_username := regexp_replace(v_username, '[^a-z0-9._-]', '', 'g');
        IF v_username = '' THEN
            RAISE EXCEPTION 'INVALID_INPUT: Username tidak valid.'
                USING ERRCODE = '23514';
        END IF;

        -- Cek duplikasi username di dalam tenant yang SAMA (termasuk format lama @jb.local)
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

    -- Cek duplikasi email secara global di auth.users / public.profiles
    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email)
       OR EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(email) = v_clean_email) THEN
        RAISE EXCEPTION 'DUPLICATE_USER: Username atau email "%" sudah terdaftar. Gunakan username lain.', v_username
            USING ERRCODE = '23505';
    END IF;

    v_new_user_id := gen_random_uuid();

    -- 1. Insert ke auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        phone_change,
        phone_change_token,
        email_change_token_current,
        email_change_confirm_status,
        reauthentication_token,
        is_sso_user,
        is_anonymous
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_new_user_id,
        'authenticated',
        'authenticated',
        v_clean_email,
        extensions.crypt(p_password, extensions.gen_salt('bf')),
        NOW(),
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
        NOW(),
        NOW(),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        0,
        '',
        FALSE,
        FALSE
    );

    -- 2. Insert ke auth.identities
    INSERT INTO auth.identities (
        id,
        provider_id,
        user_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_new_user_id::text,
        v_new_user_id,
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
        'email',
        NOW(),
        NOW(),
        NOW()
    );

    -- 3. Upsert ke public.profiles
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

    -- 4. Sinkronisasi atomik ke public.kasir (jika role = 'Kasir')
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

    -- 5. Sinkronisasi atomik ke public.karyawan_kantor
    IF EXISTS (
        SELECT 1 FROM public.karyawan_kantor
        WHERE tenant_id = v_target_tenant_id AND UPPER(BTRIM(nama)) = v_clean_nama
    ) THEN
        UPDATE public.karyawan_kantor
        SET role = v_clean_role,
            email = v_clean_email,
            source = 'staff_registration',
            is_active = TRUE,
            status = 'Aktif'
        WHERE tenant_id = v_target_tenant_id AND UPPER(BTRIM(nama)) = v_clean_nama;
    ELSE
        INSERT INTO public.karyawan_kantor (
            tenant_id, branch_id, id_karyawan, nama, role, email, source, is_active, status, created_at
        ) VALUES (
            v_target_tenant_id,
            v_target_branch_id,
            'kk_auto_' || substr(replace(v_new_user_id::text, '-', ''), 1, 10),
            v_clean_nama,
            v_clean_role,
            v_clean_email,
            'staff_registration',
            TRUE,
            'Aktif',
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
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

-- ============================================================================
-- 3. RPC: public.fn_manage_tenant_staff
--    Mengelola siklus hidup akun staf secara atomik di 4 tabel:
--    auth.users <-> public.profiles <-> public.kasir <-> public.karyawan_kantor
--    Mendukung p_action: 'UPDATE_ROLE', 'DEACTIVATE' (Opsi A), 'ACTIVATE'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_manage_tenant_staff(
    p_staff_id UUID,
    p_action TEXT,
    p_new_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
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

    -- Proteksi Co-Owner & Super Admin:
    -- Sesama Owner atau Admin tidak dapat memodifikasi role atau menonaktifkan Owner / Super Admin
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

        -- 1. Update public.profiles
        UPDATE public.profiles
        SET role = v_clean_role,
            updated_at = NOW()
        WHERE id = v_target.id;

        -- 2. Update auth.users metadata
        UPDATE auth.users
        SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('erp_role', v_clean_role),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_clean_role),
            updated_at = NOW()
        WHERE id = v_target.id;

        -- 3. Update public.karyawan_kantor
        UPDATE public.karyawan_kantor
        SET role = v_clean_role
        WHERE tenant_id = v_target.tenant_id
          AND (
              (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
              OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
          );

        -- 4. Sinkronisasi tabel public.kasir
        IF v_clean_role = 'Kasir' AND v_target.is_active IS TRUE THEN
            IF EXISTS (
                SELECT 1 FROM public.kasir
                WHERE tenant_id = v_target.tenant_id AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
            ) THEN
                UPDATE public.kasir
                SET is_active = TRUE
                WHERE tenant_id = v_target.tenant_id AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama));
            ELSE
                INSERT INTO public.kasir (tenant_id, branch_id, nama, is_active, created_at)
                VALUES (v_target.tenant_id, v_target.branch_id, UPPER(BTRIM(v_target.nama)), TRUE, NOW());
            END IF;
        ELSE
            UPDATE public.kasir
            SET is_active = FALSE
            WHERE tenant_id = v_target.tenant_id AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama));
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
        -- Soft Delete Opsi A: Nonaktifkan di seluruh 4 tabel terhubung tanpa merusak histori transaksi
        UPDATE public.profiles
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE auth.users
        SET banned_until = '2099-12-31 23:59:59+00'::timestamptz,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE public.kasir
        SET is_active = FALSE
        WHERE tenant_id = v_target.tenant_id
          AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama));

        UPDATE public.karyawan_kantor
        SET is_active = FALSE,
            status = 'Nonaktif'
        WHERE tenant_id = v_target.tenant_id
          AND (
              (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
              OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
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
                WHERE tenant_id = v_target.tenant_id AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
            ) THEN
                UPDATE public.kasir
                SET is_active = TRUE
                WHERE tenant_id = v_target.tenant_id AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama));
            ELSE
                INSERT INTO public.kasir (tenant_id, branch_id, nama, is_active, created_at)
                VALUES (v_target.tenant_id, v_target.branch_id, UPPER(BTRIM(v_target.nama)), TRUE, NOW());
            END IF;
        END IF;

        UPDATE public.karyawan_kantor
        SET is_active = TRUE,
            status = 'Aktif'
        WHERE tenant_id = v_target.tenant_id
          AND (
              (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
              OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
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

-- ============================================================================
-- 4. RPC: public.fn_resolve_login_email
--    Menerjemahkan username pendek (misal 'alexa', 'rita', 'kasir1') atau
--    username spesifik toko ('kasir1.jaya-bersama') ke alamat email internal
--    serta menolak akun yang telah dinonaktifkan (is_active = FALSE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_resolve_login_email(
    p_identifier TEXT,
    p_tenant_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_clean_id TEXT;
    v_clean_slug TEXT;
    v_match RECORD;
BEGIN
    v_clean_id := LOWER(BTRIM(COALESCE(p_identifier, '')));
    v_clean_slug := NULLIF(LOWER(BTRIM(COALESCE(p_tenant_slug, ''))), '');

    IF v_clean_id = '' THEN
        RAISE EXCEPTION 'INVALID_LOGIN: Username atau email wajib diisi.'
            USING ERRCODE = '23514';
    END IF;

    -- Jika input sudah berupa alamat email lengkap (mengandung '@')
    IF POSITION('@' IN v_clean_id) > 0 THEN
        SELECT p.email, p.is_active, p.role
        INTO v_match
        FROM public.profiles p
        WHERE LOWER(BTRIM(p.email)) = v_clean_id
        ORDER BY p.is_active DESC, p.created_at DESC
        LIMIT 1;

        IF v_match.email IS NOT NULL AND v_match.is_active IS FALSE THEN
            RAISE EXCEPTION 'ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'
                USING ERRCODE = '42501';
        END IF;

        RETURN jsonb_build_object(
            'email', COALESCE(v_match.email, v_clean_id),
            'is_active', COALESCE(v_match.is_active, true)
        );
    END IF;

    -- Jika input adalah username tanpa '@'
    SELECT p.email, p.is_active, p.role, t.slug AS tenant_slug
    INTO v_match
    FROM public.profiles p
    LEFT JOIN public.tenants t ON t.id = p.tenant_id
    WHERE (v_clean_slug IS NULL OR LOWER(t.slug) = v_clean_slug)
      AND (
          LOWER(split_part(p.email, '@', 1)) = v_clean_id
          OR LOWER(split_part(split_part(p.email, '@', 1), '.', 1)) = v_clean_id
          OR LOWER(BTRIM(p.nama)) = v_clean_id
      )
    ORDER BY
      (LOWER(split_part(p.email, '@', 1)) = v_clean_id) DESC,
      p.is_active DESC,
      p.created_at DESC
    LIMIT 1;

    IF v_match.email IS NOT NULL THEN
        IF v_match.is_active IS FALSE THEN
            RAISE EXCEPTION 'ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'
                USING ERRCODE = '42501';
        END IF;

        RETURN jsonb_build_object(
            'email', v_match.email,
            'is_active', true,
            'tenant_slug', v_match.tenant_slug
        );
    END IF;

    -- Fallback ke pola legacy
    RETURN jsonb_build_object(
        'email', v_clean_id || '@jb.local',
        'is_active', true
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_resolve_login_email(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_resolve_login_email(TEXT, TEXT) TO anon, authenticated, service_role;

COMMIT;
