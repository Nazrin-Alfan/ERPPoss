-- ==============================================================================
-- MIGRATION: 20261119000002_fix_owner_tenant_switch_trigger.sql
-- SCOPE    : Fix Cloud live-blocker discovered during rollback verification:
--            fn_switch_active_tenant (Owner multi-outlet switching) failed with
--            42501 FORBIDDEN_TENANT_MUTATION inside fn_protect_profile_role_and_tenant.
-- SECURITY : Preserves PR-2 lockdown for direct UPDATE on public.profiles
--            while permitting self-switch strictly inside fn_switch_active_tenant
--            for active Owners verified against public.tenant_memberships.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_protect_profile_role_and_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_uid              UUID;
    v_caller_role             VARCHAR(50);
    v_caller_tenant           UUID;
    v_active_owner_count      INT;
    v_is_trusted_owner_switch BOOLEAN := FALSE;
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

        -- Izinkan perpindahan tenant_id HANYA untuk self-switch Owner yang sah
        -- melalui RPC fn_switch_active_tenant dan terverifikasi di tenant_memberships
        v_is_trusted_owner_switch := COALESCE((
            v_caller_role = 'Owner'
            AND v_caller_uid IS NOT NULL
            AND OLD.id = v_caller_uid
            AND NEW.id = v_caller_uid
            AND OLD.role = 'Owner'
            AND NEW.role = 'Owner'
            AND OLD.is_active IS TRUE
            AND NEW.is_active IS TRUE
            AND OLD.email IS NOT DISTINCT FROM NEW.email
            AND OLD.nama IS NOT DISTINCT FROM NEW.nama
            AND COALESCE(pg_catalog.current_setting('relaypos.trusted_tenant_switch', TRUE), '')
                = (v_caller_uid::text || ':' || NEW.tenant_id::text)
            AND EXISTS (
                SELECT 1
                FROM public.tenant_memberships tm
                WHERE tm.user_id = v_caller_uid
                  AND tm.tenant_id = NEW.tenant_id
            )
        ), FALSE);

        IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
            IF v_caller_role <> 'Super Admin' AND v_is_trusted_owner_switch IS NOT TRUE THEN
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

CREATE OR REPLACE FUNCTION public.fn_switch_active_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid           UUID := auth.uid();
    v_profile       RECORD;
    v_membership    RECORD;
    v_target_tenant RECORD;
    v_target_branch UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT id, role, is_active, tenant_id, branch_id
    INTO v_profile
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_TENANT: Tenant ID wajib diisi.';
    END IF;

    SELECT id, nama, status, business_type
    INTO v_target_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Outlet tidak ditemukan.';
    END IF;

    IF v_profile.role <> 'Super Admin' THEN
        IF v_profile.role <> 'Owner' THEN
            RAISE EXCEPTION 'FORBIDDEN: Hanya Owner atau Super Admin yang dapat berpindah outlet.' USING ERRCODE = '42501';
        END IF;

        SELECT tenant_id, branch_id
        INTO v_membership
        FROM public.tenant_memberships
        WHERE user_id = v_uid AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'TENANT_FORBIDDEN: Anda tidak memiliki akses ke outlet ini.' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id INTO v_target_branch
    FROM public.branches
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
    ORDER BY (id = v_membership.branch_id) DESC NULLS LAST, (is_main = TRUE) DESC, (kode = 'MAIN') DESC, created_at ASC
    LIMIT 1;

    PERFORM pg_catalog.set_config(
        'relaypos.trusted_tenant_switch',
        v_uid::text || ':' || p_tenant_id::text,
        TRUE
    );

    BEGIN
        UPDATE public.profiles
        SET tenant_id = p_tenant_id,
            branch_id = v_target_branch,
            updated_at = NOW()
        WHERE id = v_uid;
    EXCEPTION WHEN OTHERS THEN
        PERFORM pg_catalog.set_config('relaypos.trusted_tenant_switch', '', TRUE);
        RAISE;
    END;

    PERFORM pg_catalog.set_config('relaypos.trusted_tenant_switch', '', TRUE);

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'branch_id', v_target_branch
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_switch_active_tenant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_switch_active_tenant(UUID) TO authenticated, service_role;
