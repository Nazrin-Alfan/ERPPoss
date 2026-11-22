-- ==============================================================================
-- MIGRATION: 20261123000002_rbac_admin_pusat_and_branch_isolation.sql
-- PURPOSE  : Introduce explicit tenant-wide multi-branch role 'Admin Pusat'
--            while preserving platform-wide 'Super Admin' (SaaS Founder) and
--            tightening 'Admin' (Admin Cabang) to strict single-branch isolation:
--            1. Update current_user_role() + add fn_is_tenant_wide_manager() /
--               fn_is_management_role() helpers.
--            2. Restrict fn_has_operational_branch_access() &
--               fn_has_shared_catalog_access() so only Owner & Admin Pusat span
--               all branches in a tenant; Admin is strictly scoped to own branch.
--            3. Update fn_protect_operational_branch_and_tenant() &
--               fn_protect_profile_role_and_tenant() for Admin Pusat hierarchy.
--            4. Update branch-scoped RLS policies across finance, ops, staff,
--               and catalog tables with (SELECT ...) initPlan optimization.
--            5. Update operational & staff lifecycle RPCs for Admin Pusat and
--               strict Admin branch guards.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CENTRALIZED ROLE & BRANCH ACCESS HELPERS
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_canonical_role;
ALTER TABLE public.profiles
    ADD CONSTRAINT chk_profiles_canonical_role
    CHECK (role IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Kasir', 'Staff Kantor', 'Karyawan Cuci'));

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS VARCHAR
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
    v_claims JSONB;
    v_role TEXT;
    v_profile_role VARCHAR(50);
BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    v_role := COALESCE(
        v_claims->>'role',
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        CASE WHEN current_user = 'postgres' THEN 'service_role' ELSE 'anon' END
    );

    IF v_role = 'service_role' THEN
        RETURN 'Super Admin';
    END IF;

    IF auth.uid() IS NOT NULL THEN
        SELECT role INTO v_profile_role
        FROM public.profiles
        WHERE id = auth.uid() AND is_active = TRUE
        LIMIT 1;

        IF v_profile_role IS NOT NULL THEN
            RETURN CASE LOWER(TRIM(v_profile_role))
                WHEN 'super admin'   THEN 'Super Admin'
                WHEN 'superadmin'    THEN 'Super Admin'
                WHEN 'owner'         THEN 'Owner'
                WHEN 'admin pusat'   THEN 'Admin Pusat'
                WHEN 'admin_pusat'   THEN 'Admin Pusat'
                WHEN 'adminpusat'    THEN 'Admin Pusat'
                WHEN 'admin'         THEN 'Admin'
                WHEN 'kasir'         THEN 'Kasir'
                WHEN 'staff kantor'  THEN 'Staff Kantor'
                WHEN 'karyawan cuci' THEN 'Karyawan Cuci'
                ELSE v_profile_role
            END;
        END IF;
    END IF;

    RETURN 'Anon';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_is_tenant_wide_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.current_user_role() IN ('Super Admin', 'Owner', 'Admin Pusat');
$$;

CREATE OR REPLACE FUNCTION public.fn_is_management_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.current_user_role() IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin');
$$;

REVOKE ALL ON FUNCTION public.fn_is_tenant_wide_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_tenant_wide_manager() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_is_management_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_management_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_has_operational_branch_access(
    p_tenant_id UUID,
    p_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_role TEXT;
    v_tenant UUID;
    v_branch UUID;
BEGIN
    v_role := public.current_user_role();
    IF v_role = 'Super Admin' THEN
        RETURN TRUE;
    END IF;

    v_tenant := public.current_tenant_id();
    IF v_tenant IS NULL OR p_tenant_id <> v_tenant THEN
        RETURN FALSE;
    END IF;

    -- Only Owner and Admin Pusat span all branches within the active tenant
    IF v_role IN ('Owner', 'Admin Pusat') THEN
        RETURN TRUE;
    END IF;

    -- Admin (Cabang), Kasir, Staff Kantor, Karyawan Cuci: strictly isolated to own branch
    v_branch := public.current_branch_id();
    IF v_branch IS NOT NULL AND p_branch_id IS NOT NULL AND p_branch_id = v_branch THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_has_shared_catalog_access(
    p_tenant_id UUID,
    p_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_role TEXT;
    v_tenant UUID;
    v_branch UUID;
BEGIN
    v_role := public.current_user_role();
    IF v_role = 'Super Admin' THEN
        RETURN TRUE;
    END IF;

    v_tenant := public.current_tenant_id();
    IF v_tenant IS NULL OR p_tenant_id <> v_tenant THEN
        RETURN FALSE;
    END IF;

    IF v_role IN ('Owner', 'Admin Pusat') THEN
        RETURN TRUE;
    END IF;

    v_branch := public.current_branch_id();
    IF p_branch_id IS NULL OR (v_branch IS NOT NULL AND p_branch_id = v_branch) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2. OPERATIONAL & PROFILE PROTECTION TRIGGERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_auto_set_tenant_and_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_tid UUID;
    v_bid UUID;
    v_role TEXT;
BEGIN
    IF NEW.tenant_id IS NULL THEN
        v_tid := public.current_tenant_id();
        IF v_tid IS NOT NULL THEN
            NEW.tenant_id := v_tid;
        END IF;
    END IF;

    IF NEW.branch_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
        v_role := public.current_user_role();
        -- Tenant-wide managers may intentionally create HQ / tenant-wide pockets (branch_id IS NULL)
        IF TG_TABLE_NAME = 'pos_balances' AND v_role IN ('Super Admin', 'Owner', 'Admin Pusat') THEN
            RETURN NEW;
        END IF;

        v_bid := public.current_branch_id();
        IF v_bid IS NULL THEN
            IF v_role IN ('Super Admin', 'Owner', 'Admin Pusat') THEN
                SELECT id INTO v_bid
                FROM public.branches
                WHERE tenant_id = NEW.tenant_id
                ORDER BY (kode = 'MAIN') DESC, created_at ASC
                LIMIT 1;
            END IF;
        END IF;

        IF v_bid IS NOT NULL THEN
            NEW.branch_id := v_bid;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_auto_set_tenant_and_branch() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_protect_operational_branch_and_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_role TEXT;
    v_tenant UUID;
    v_branch UUID;
BEGIN
    v_role   := public.current_user_role();
    v_tenant := public.current_tenant_id();
    v_branch := public.current_branch_id();

    IF v_role = 'Super Admin' THEN
        RETURN NEW;
    END IF;

    IF NEW.branch_id IS NULL THEN
        RAISE EXCEPTION 'BRANCH_REQUIRED: Transaksi operasional wajib memiliki branch_id yang valid.'
            USING ERRCODE = '23502';
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM v_tenant THEN
        RAISE EXCEPTION 'FORBIDDEN_TENANT_MUTATION: tenant_id tidak sesuai dengan sesi pengguna.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF v_role NOT IN ('Owner', 'Admin Pusat') AND NEW.branch_id IS DISTINCT FROM v_branch THEN
            RAISE EXCEPTION 'FORBIDDEN_BRANCH_MUTATION: Tidak diizinkan membuat transaksi untuk cabang lain.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'FORBIDDEN_TENANT_MUTATION: tenant_id transaksi tidak dapat diubah.'
                USING ERRCODE = '42501';
        END IF;

        IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
            IF v_role NOT IN ('Owner', 'Admin Pusat') THEN
                RAISE EXCEPTION 'FORBIDDEN_BRANCH_MUTATION: Pemindahan cabang transaksi operasional dilarang.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_protect_profile_role_and_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_caller_uid              UUID;
    v_caller_role             VARCHAR(50);
    v_caller_tenant           UUID;
    v_caller_branch           UUID;
    v_active_owner_count      INT;
    v_is_trusted_owner_switch BOOLEAN := FALSE;
BEGIN
    v_caller_uid    := auth.uid();
    v_caller_role   := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();
    v_caller_branch := public.current_branch_id();

    IF TG_OP = 'DELETE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" tidak diizinkan menghapus profil.', v_caller_role
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_DELETE: Owner tidak dapat menghapus profil di luar tenant sendiri.'
                USING ERRCODE = '42501';
        END IF;

        IF OLD.role = 'Owner' AND v_caller_role = 'Owner' THEN
            RAISE EXCEPTION 'FORBIDDEN_MUTATE_CO_OWNER: Sesama Owner tidak dapat menghapus akun Owner satu sama lain.'
                USING ERRCODE = '42501';
        END IF;

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

        IF NEW.role = 'Admin Pusat' AND v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Owner atau Super Admin yang berhak membuat profil Admin Pusat.'
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role = 'Admin Pusat' AND NEW.role IN ('Super Admin', 'Owner', 'Admin Pusat') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Pusat hanya dapat membuat profil Admin Cabang atau staf operasional.'
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role = 'Admin' THEN
            IF NEW.role IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Cabang hanya dapat membuat profil staf operasional (Kasir, Staff Kantor, Karyawan Cuci).'
                    USING ERRCODE = '42501';
            END IF;
            IF v_caller_branch IS NOT NULL AND NEW.branch_id IS DISTINCT FROM v_caller_branch THEN
                RAISE EXCEPTION 'FORBIDDEN_BRANCH_MUTATION: Admin Cabang hanya dapat mendaftarkan staf pada cabangnya sendiri.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        IF v_caller_role IN ('Kasir', 'Staff Kantor', 'Karyawan Cuci') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" dilarang membuat profil pengguna baru.', v_caller_role
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role IN ('Owner', 'Admin Pusat', 'Admin') AND NEW.tenant_id <> v_caller_tenant THEN
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

        IF v_caller_role = 'Admin Pusat' THEN
            IF OLD.tenant_id <> v_caller_tenant THEN
                RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_UPDATE: Admin Pusat tidak dapat memutasi profil di luar tenant sendiri.'
                    USING ERRCODE = '42501';
            END IF;
            IF OLD.role IN ('Owner', 'Super Admin') OR (OLD.role = 'Admin Pusat' AND OLD.id <> v_caller_uid) THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Pusat dilarang memutasi profil Owner, Super Admin, atau Admin Pusat lain.'
                    USING ERRCODE = '42501';
            END IF;
            IF NEW.role IN ('Owner', 'Super Admin') OR (NEW.role = 'Admin Pusat' AND OLD.role <> 'Admin Pusat') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Pusat dilarang menaikkan role menjadi Owner, Super Admin, atau Admin Pusat.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        IF v_caller_role = 'Admin' THEN
            IF OLD.tenant_id <> v_caller_tenant THEN
                RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_UPDATE: Admin Cabang tidak dapat memutasi profil di luar tenant sendiri.'
                    USING ERRCODE = '42501';
            END IF;
            IF v_caller_branch IS NOT NULL AND OLD.branch_id IS DISTINCT FROM v_caller_branch THEN
                RAISE EXCEPTION 'FORBIDDEN_BRANCH_MUTATION: Admin Cabang tidak dapat memutasi profil cabang lain.'
                    USING ERRCODE = '42501';
            END IF;
            IF OLD.role IN ('Owner', 'Super Admin', 'Admin Pusat') OR (OLD.role = 'Admin' AND OLD.id <> v_caller_uid) THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Cabang dilarang memutasi profil Owner, Super Admin, Admin Pusat, atau Admin lain.'
                    USING ERRCODE = '42501';
            END IF;
            IF NEW.role IN ('Owner', 'Super Admin', 'Admin Pusat') OR (NEW.role = 'Admin' AND OLD.role <> 'Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Cabang dilarang menaikkan role menjadi manajemen.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_UPDATE: Owner tidak dapat memutasi profil di luar tenant sendiri.'
                USING ERRCODE = '42501';
        END IF;

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

        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin Pusat') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Role "%" dilarang mengubah role profil (Role saat ini: %).', v_caller_role, OLD.role
                    USING ERRCODE = '42501';
            END IF;

            IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak menetapkan role Super Admin.'
                    USING ERRCODE = '42501';
            END IF;

            IF NEW.role = 'Admin Pusat' AND v_caller_role NOT IN ('Super Admin', 'Owner') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Owner atau Super Admin yang berhak menetapkan role Admin Pusat.'
                    USING ERRCODE = '42501';
            END IF;

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

        IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin Pusat') THEN
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

        IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin') THEN
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
$function$;

-- ------------------------------------------------------------------------------
-- 3. BRANCH-SCOPED RLS POLICIES (WITH (SELECT ...) INITPLAN OPTIMIZATION)
-- ------------------------------------------------------------------------------

-- 3A. Finance & Balances (pos_balances, cashflow, pengeluaran, journal, snapshots, shifts)
DROP POLICY IF EXISTS pos_balances_write_policy ON public.pos_balances;
CREATE POLICY pos_balances_write_policy ON public.pos_balances
FOR ALL TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
    )
)
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
    )
);

DROP POLICY IF EXISTS cashflow_write_policy ON public.cashflow;
CREATE POLICY cashflow_write_policy ON public.cashflow
FOR ALL TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
    )
)
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
    )
);

DROP POLICY IF EXISTS pengeluaran_update_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_update_policy ON public.pengeluaran
FOR UPDATE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
        OR ((SELECT public.current_user_role()) = 'Kasir' AND branch_id = (SELECT public.current_branch_id()) AND tanggal = CURRENT_DATE AND id_cashflow IS NULL)
    )
)
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
        OR ((SELECT public.current_user_role()) = 'Kasir' AND branch_id = (SELECT public.current_branch_id()) AND tanggal = CURRENT_DATE AND id_cashflow IS NULL)
    )
);

DROP POLICY IF EXISTS pengeluaran_delete_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_delete_policy ON public.pengeluaran
FOR DELETE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
        OR ((SELECT public.current_user_role()) = 'Kasir' AND branch_id = (SELECT public.current_branch_id()) AND tanggal = CURRENT_DATE AND id_cashflow IS NULL)
    )
);

DROP POLICY IF EXISTS coa_select_policy ON public.chart_of_accounts;
CREATE POLICY coa_select_policy ON public.chart_of_accounts
FOR SELECT TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_role()) IN ('Super Admin', 'Owner', 'Admin Pusat')
);

DROP POLICY IF EXISTS je_select_policy ON public.journal_entries;
CREATE POLICY je_select_policy ON public.journal_entries
FOR SELECT TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_role()) IN ('Super Admin', 'Owner', 'Admin Pusat')
);

DROP POLICY IF EXISTS je_insert_policy ON public.journal_entries;
CREATE POLICY je_insert_policy ON public.journal_entries
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
    )
);

DROP POLICY IF EXISTS jel_select_policy ON public.journal_entry_lines;
CREATE POLICY jel_select_policy ON public.journal_entry_lines
FOR SELECT TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_role()) IN ('Super Admin', 'Owner', 'Admin Pusat')
);

DROP POLICY IF EXISTS jel_insert_policy ON public.journal_entry_lines;
CREATE POLICY jel_insert_policy ON public.journal_entry_lines
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
);

DROP POLICY IF EXISTS snapshots_select_policy ON public.intelligence_daily_snapshots;
CREATE POLICY snapshots_select_policy ON public.intelligence_daily_snapshots
FOR SELECT TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
        (SELECT public.fn_is_tenant_wide_manager())
        OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
    )
);

DROP POLICY IF EXISTS cashier_shift_closings_select_policy ON public.cashier_shift_closings;
CREATE POLICY cashier_shift_closings_select_policy ON public.cashier_shift_closings
FOR SELECT TO authenticated
USING (
    (SELECT public.current_user_role()) = 'Super Admin'
    OR (
        tenant_id = (SELECT public.current_tenant_id())
        AND (
            (SELECT public.fn_is_tenant_wide_manager())
            OR branch_id = (SELECT public.current_branch_id())
        )
    )
);

-- 3B. Operational Branch-Scoped Tables (struk, cafe, carwash, stok, barang_masuk/keluar, karyawan, profiles)
DROP POLICY IF EXISTS struk_delete_policy ON public.struk;
CREATE POLICY struk_delete_policy ON public.struk
FOR DELETE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS cafe_delete_policy ON public.cafe;
CREATE POLICY cafe_delete_policy ON public.cafe
FOR DELETE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS carwash_delete_policy ON public.carwash;
CREATE POLICY carwash_delete_policy ON public.carwash
FOR DELETE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS stok_select_policy ON public.stok_barang;
CREATE POLICY stok_select_policy ON public.stok_barang
FOR SELECT TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_role()) IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS stok_write_policy_insert ON public.stok_barang;
CREATE POLICY stok_write_policy_insert ON public.stok_barang
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS stok_write_policy_update ON public.stok_barang;
CREATE POLICY stok_write_policy_update ON public.stok_barang
FOR UPDATE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS stok_write_policy_delete ON public.stok_barang;
CREATE POLICY stok_write_policy_delete ON public.stok_barang
FOR DELETE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_keluar_select_policy ON public.barang_keluar;
CREATE POLICY barang_keluar_select_policy ON public.barang_keluar
FOR SELECT TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_role()) IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_keluar_write_policy_insert ON public.barang_keluar;
CREATE POLICY barang_keluar_write_policy_insert ON public.barang_keluar
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_keluar_write_policy_update ON public.barang_keluar;
CREATE POLICY barang_keluar_write_policy_update ON public.barang_keluar
FOR UPDATE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_keluar_write_policy_delete ON public.barang_keluar;
CREATE POLICY barang_keluar_write_policy_delete ON public.barang_keluar
FOR DELETE TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_masuk_write_policy ON public.barang_masuk;
CREATE POLICY barang_masuk_write_policy ON public.barang_masuk
FOR ALL TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_role()) IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.current_user_role()) IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS karyawan_cuci_write_policy ON public.karyawan_cuci;
CREATE POLICY karyawan_cuci_write_policy ON public.karyawan_cuci
FOR ALL TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS karyawan_kantor_write_policy ON public.karyawan_kantor;
CREATE POLICY karyawan_kantor_write_policy ON public.karyawan_kantor
FOR ALL TO authenticated
USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (SELECT public.fn_is_management_role())
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

-- Consolidate profiles policies (removes duplicate permissive SELECT warning)
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
DROP POLICY IF EXISTS profiles_write_policy ON public.profiles;
CREATE POLICY profiles_write_policy ON public.profiles
FOR ALL TO authenticated
USING (
    id = (SELECT auth.uid())
    OR (SELECT public.current_user_role()) = 'Super Admin'
    OR (
        tenant_id = (SELECT public.current_tenant_id())
        AND (
            (SELECT public.fn_is_tenant_wide_manager())
            OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
        )
    )
)
WITH CHECK (
    id = (SELECT auth.uid())
    OR (SELECT public.current_user_role()) = 'Super Admin'
    OR (
        tenant_id = (SELECT public.current_tenant_id())
        AND (
            (SELECT public.fn_is_tenant_wide_manager())
            OR ((SELECT public.current_user_role()) = 'Admin' AND branch_id = (SELECT public.current_branch_id()))
        )
    )
);

-- 3C. Shared Catalog Tables (branch-scoped write check for Admin Cabang)
DROP POLICY IF EXISTS menu_write_policy_insert ON public.daftar_harga_menu;
CREATE POLICY menu_write_policy_insert ON public.daftar_harga_menu
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS menu_write_policy_update ON public.daftar_harga_menu;
CREATE POLICY menu_write_policy_update ON public.daftar_harga_menu
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS menu_write_policy_delete ON public.daftar_harga_menu;
CREATE POLICY menu_write_policy_delete ON public.daftar_harga_menu
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS packages_write_policy_insert ON public.carwash_packages;
CREATE POLICY packages_write_policy_insert ON public.carwash_packages
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS packages_write_policy_update ON public.carwash_packages;
CREATE POLICY packages_write_policy_update ON public.carwash_packages
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS packages_write_policy_delete ON public.carwash_packages;
CREATE POLICY packages_write_policy_delete ON public.carwash_packages
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS diskon_write_policy_insert ON public.diskon;
CREATE POLICY diskon_write_policy_insert ON public.diskon
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS diskon_write_policy_update ON public.diskon;
CREATE POLICY diskon_write_policy_update ON public.diskon
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS diskon_write_policy_delete ON public.diskon;
CREATE POLICY diskon_write_policy_delete ON public.diskon
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS metode_bayar_write_policy_insert ON public.metode_bayar;
CREATE POLICY metode_bayar_write_policy_insert ON public.metode_bayar
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS metode_bayar_write_policy_update ON public.metode_bayar;
CREATE POLICY metode_bayar_write_policy_update ON public.metode_bayar
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS metode_bayar_write_policy_delete ON public.metode_bayar;
CREATE POLICY metode_bayar_write_policy_delete ON public.metode_bayar
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS kasir_write_policy_insert ON public.kasir;
CREATE POLICY kasir_write_policy_insert ON public.kasir
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS kasir_write_policy_update ON public.kasir;
CREATE POLICY kasir_write_policy_update ON public.kasir
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS kasir_write_policy_delete ON public.kasir;
CREATE POLICY kasir_write_policy_delete ON public.kasir
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS crm_loyalty_programs_write_policy_insert ON public.crm_loyalty_programs;
CREATE POLICY crm_loyalty_programs_write_policy_insert ON public.crm_loyalty_programs
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS crm_loyalty_programs_write_policy_update ON public.crm_loyalty_programs;
CREATE POLICY crm_loyalty_programs_write_policy_update ON public.crm_loyalty_programs
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS crm_loyalty_programs_write_policy_delete ON public.crm_loyalty_programs;
CREATE POLICY crm_loyalty_programs_write_policy_delete ON public.crm_loyalty_programs
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()) AND public.fn_has_shared_catalog_access(tenant_id, branch_id));

-- Tenant-wide non-branch tables (resep, master_categories)
DROP POLICY IF EXISTS resep_write_policy_insert ON public.resep;
CREATE POLICY resep_write_policy_insert ON public.resep
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()));

DROP POLICY IF EXISTS resep_write_policy_update ON public.resep;
CREATE POLICY resep_write_policy_update ON public.resep
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()));

DROP POLICY IF EXISTS resep_write_policy_delete ON public.resep;
CREATE POLICY resep_write_policy_delete ON public.resep
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()));

DROP POLICY IF EXISTS categories_write_policy_insert ON public.master_categories;
CREATE POLICY categories_write_policy_insert ON public.master_categories
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()));

DROP POLICY IF EXISTS categories_write_policy_update ON public.master_categories;
CREATE POLICY categories_write_policy_update ON public.master_categories
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()));

DROP POLICY IF EXISTS categories_write_policy_delete ON public.master_categories;
CREATE POLICY categories_write_policy_delete ON public.master_categories
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.fn_is_management_role()));

-- ------------------------------------------------------------------------------
-- 4. OPERATIONAL & STAFF LIFECYCLE RPCs (ADMIN PUSAT + STRICT ADMIN BRANCH GUARD)
-- ------------------------------------------------------------------------------

-- Patched RPC: handle_new_user_profile
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

    IF NULLIF(NEW.raw_app_meta_data->>'tenant_id', '') IS NOT NULL THEN
        v_tenant_id := (NEW.raw_app_meta_data->>'tenant_id')::UUID;
        v_branch_id := NULLIF(NEW.raw_app_meta_data->>'branch_id', '')::UUID;

        IF COALESCE(NEW.raw_app_meta_data->>'erp_role', '') NOT IN ('Owner', 'Admin Pusat', 'Admin', 'Kasir', 'Staff Kantor', 'Karyawan Cuci') THEN
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

    v_tenant_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'tenant_name'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama_toko'), '')
    );

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

-- Patched RPC: fn_register_tenant_staff
CREATE OR REPLACE FUNCTION public.fn_register_tenant_staff(p_email text, p_password text, p_nama text, p_role text DEFAULT 'Kasir'::text, p_tenant_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid)
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

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin') THEN
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
    IF v_clean_role NOT IN ('Kasir', 'Admin', 'Admin Pusat', 'Owner', 'Staff Kantor', 'Karyawan Cuci') THEN
        RAISE EXCEPTION 'INVALID_ROLE: Peran "%" tidak valid.', v_clean_role
            USING ERRCODE = '23514';
    END IF;

    IF v_clean_role = 'Admin Pusat' AND v_caller_role NOT IN ('Super Admin', 'Owner') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Owner atau Super Admin yang dapat mendaftarkan akun Admin Pusat.'
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Admin Pusat' AND v_clean_role IN ('Owner', 'Admin Pusat') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Pusat hanya dapat mendaftarkan Admin Cabang atau staf operasional.'
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Admin' AND v_clean_role IN ('Owner', 'Admin Pusat', 'Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Cabang hanya dapat mendaftarkan akun Kasir atau Staf operasional.'
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Admin' AND v_caller_branch IS NOT NULL AND p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_caller_branch THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Admin Cabang hanya dapat mendaftarkan staf pada cabangnya sendiri.'
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

-- Patched RPC: fn_manage_tenant_staff
CREATE OR REPLACE FUNCTION public.fn_manage_tenant_staff(p_staff_id uuid, p_action text, p_new_role text DEFAULT NULL::text)
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

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin') THEN
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

    IF v_caller_role = 'Admin Pusat' AND v_target.role = 'Admin Pusat' AND v_target.id <> v_caller_uid THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Pusat tidak dapat memodifikasi akun Admin Pusat lain.'
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Admin' AND v_target.role IN ('Admin Pusat', 'Admin') AND v_target.id <> v_caller_uid THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Cabang tidak dapat memodifikasi akun Admin atau Admin Pusat.'
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Admin' AND public.current_branch_id() IS NOT NULL AND v_target.branch_id IS DISTINCT FROM public.current_branch_id() THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Admin Cabang hanya dapat mengelola staf pada cabangnya sendiri.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_action := UPPER(BTRIM(COALESCE(p_action, '')));

    IF v_clean_action = 'UPDATE_ROLE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin Pusat') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Owner atau Admin Pusat yang dapat mengubah role akun staf.'
                USING ERRCODE = '42501';
        END IF;

        v_clean_role := BTRIM(COALESCE(p_new_role, ''));
        IF v_clean_role NOT IN ('Kasir', 'Admin', 'Admin Pusat', 'Staff Kantor', 'Karyawan Cuci', 'Owner') THEN
            RAISE EXCEPTION 'INVALID_ROLE: Peran baru "%" tidak valid.', v_clean_role
                USING ERRCODE = '23514';
        END IF;

        IF v_caller_role = 'Admin Pusat' AND v_clean_role IN ('Owner', 'Admin Pusat') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin Pusat hanya dapat menetapkan role Admin Cabang atau staf operasional.'
                USING ERRCODE = '42501';
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

-- Patched RPC: fn_close_cashier_shift
CREATE OR REPLACE FUNCTION public.fn_close_cashier_shift(p_tenant_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_kasir text DEFAULT 'KASIR'::text, p_tanggal date DEFAULT CURRENT_DATE, p_modal_awal numeric DEFAULT 0, p_kas_fisik numeric DEFAULT 0, p_catatan text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uid               UUID := auth.uid();
    v_prof              RECORD;
    v_branch            UUID;
    v_kasir             TEXT := COALESCE(NULLIF(btrim(p_kasir), ''), 'KASIR');
    v_tanggal           DATE := COALESCE(p_tanggal, CURRENT_DATE);
    v_cash_sales        NUMERIC(15, 2) := 0;
    v_digital_sales     NUMERIC(15, 2) := 0;
    v_expenses          NUMERIC(15, 2) := 0;
    v_exchange_cash_out NUMERIC(15, 2) := 0;
    v_expected          NUMERIC(15, 2) := 0;
    v_physical          NUMERIC(15, 2) := COALESCE(p_kas_fisik, 0);
    v_discrepancy       NUMERIC(15, 2) := 0;
    v_closing_id        UUID := gen_random_uuid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, role, is_active
    INTO v_prof
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND OR v_prof.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF v_prof.role NOT IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Kasir') THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran ini tidak berwenang menutup shift kasir.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL OR (
        v_prof.role <> 'Super Admin'
        AND v_prof.tenant_id IS DISTINCT FROM p_tenant_id
        AND NOT EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.user_id = v_uid AND tm.tenant_id = p_tenant_id
        )
    ) THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses tutup kasir lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    v_branch := COALESCE(p_branch_id, v_prof.branch_id);

    IF v_prof.role IN ('Kasir', 'Admin') AND v_prof.branch_id IS NOT NULL AND v_branch IS DISTINCT FROM v_prof.branch_id THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Kasir hanya dapat menutup shift pada cabangnya sendiri.' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('shift_close:' || p_tenant_id::text || ':' || v_tanggal::text || ':' || UPPER(v_kasir))::bigint);

    SELECT
        COALESCE(SUM(
            CASE
                WHEN UPPER(COALESCE(metode_bayar, '')) = 'SPLIT' THEN COALESCE(nominal_cash, 0)
                WHEN UPPER(COALESCE(metode_bayar, '')) IN ('CASH', 'TUNAI') THEN COALESCE(total_tagihan, 0)
                ELSE 0
            END
        ), 0),
        COALESCE(SUM(
            CASE
                WHEN UPPER(COALESCE(metode_bayar, '')) = 'SPLIT' THEN COALESCE(nominal_qris, 0) + COALESCE(nominal_transfer, 0)
                WHEN UPPER(COALESCE(metode_bayar, '')) NOT IN ('CASH', 'TUNAI') THEN COALESCE(total_tagihan, 0)
                ELSE 0
            END
        ), 0)
    INTO v_cash_sales, v_digital_sales
    FROM public.struk
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND (
          tanggal = v_tanggal
          OR (waktu_dibayar IS NOT NULL AND (waktu_dibayar AT TIME ZONE 'Asia/Jakarta')::date = v_tanggal)
      )
      AND UPPER(COALESCE(status_bayar, '')) IN ('SELESAI', 'LUNAS', 'PAID');

    SELECT COALESCE(SUM(COALESCE(nominal, 0)), 0)
    INTO v_expenses
    FROM public.pengeluaran
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND (pos IS NULL OR UPPER(pos) LIKE '%CASH%');

    SELECT COALESCE(SUM(COALESCE(pengeluaran, 0)), 0)
    INTO v_exchange_cash_out
    FROM public.cashflow
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND kategori = 'Tukar Uang'
      AND UPPER(COALESCE(pos, '')) LIKE '%CASH%';

    v_expected := COALESCE(p_modal_awal, 0) + v_cash_sales - v_expenses - v_exchange_cash_out;
    v_discrepancy := v_physical - v_expected;

    INSERT INTO public.cashier_shift_closings (
        id, tenant_id, branch_id, tanggal, kasir,
        modal_awal, penjualan_tunai, penjualan_digital, pengeluaran_kasir,
        tukar_uang_keluar, ekspektasi_kas, kas_fisik, selisih, catatan, closed_by
    ) VALUES (
        v_closing_id, p_tenant_id, v_branch, v_tanggal, UPPER(v_kasir),
        COALESCE(p_modal_awal, 0), v_cash_sales, v_digital_sales, v_expenses,
        v_exchange_cash_out, v_expected, v_physical, v_discrepancy, NULLIF(btrim(COALESCE(p_catatan, '')), ''), v_uid
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'closing_id', v_closing_id,
        'tanggal', v_tanggal,
        'kasir', UPPER(v_kasir),
        'modal_awal', COALESCE(p_modal_awal, 0),
        'penjualan_tunai', v_cash_sales,
        'penjualan_digital', v_digital_sales,
        'pengeluaran_kasir', v_expenses,
        'tukar_uang_keluar', v_exchange_cash_out,
        'ekspektasi_kas', v_expected,
        'kas_fisik', v_physical,
        'selisih', v_discrepancy
    );
END;
$function$;

-- Patched RPC: fn_get_cashier_shift_preview
CREATE OR REPLACE FUNCTION public.fn_get_cashier_shift_preview(p_tenant_id uuid, p_branch_id uuid DEFAULT NULL::uuid, p_tanggal date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uid               UUID := auth.uid();
    v_prof              RECORD;
    v_branch            UUID;
    v_tanggal           DATE := COALESCE(p_tanggal, CURRENT_DATE);
    v_cash_sales        NUMERIC(15, 2) := 0.00;
    v_digital_sales     NUMERIC(15, 2) := 0.00;
    v_expenses          NUMERIC(15, 2) := 0.00;
    v_exchange_cash_out NUMERIC(15, 2) := 0.00;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, role, is_active
    INTO v_prof
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND OR v_prof.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF v_prof.role NOT IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Kasir') THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran ini tidak berwenang melihat rekap shift kasir.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL OR (
        v_prof.role <> 'Super Admin'
        AND v_prof.tenant_id IS DISTINCT FROM p_tenant_id
        AND NOT EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.user_id = v_uid AND tm.tenant_id = p_tenant_id
        )
    ) THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses rekap kasir lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    v_branch := COALESCE(p_branch_id, v_prof.branch_id);

    IF v_prof.role IN ('Kasir', 'Admin') AND v_prof.branch_id IS NOT NULL AND v_branch IS DISTINCT FROM v_prof.branch_id THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Kasir hanya dapat melihat rekap shift cabangnya sendiri.' USING ERRCODE = '42501';
    END IF;

    SELECT
        COALESCE(SUM(
            CASE
                WHEN UPPER(COALESCE(metode_bayar, '')) = 'SPLIT' THEN COALESCE(nominal_cash, 0)
                WHEN UPPER(COALESCE(metode_bayar, '')) IN ('CASH', 'TUNAI') THEN COALESCE(total_tagihan, 0)
                ELSE 0
            END
        ), 0),
        COALESCE(SUM(
            CASE
                WHEN UPPER(COALESCE(metode_bayar, '')) = 'SPLIT' THEN COALESCE(nominal_qris, 0) + COALESCE(nominal_transfer, 0)
                WHEN UPPER(COALESCE(metode_bayar, '')) NOT IN ('CASH', 'TUNAI') THEN COALESCE(total_tagihan, 0)
                ELSE 0
            END
        ), 0)
    INTO v_cash_sales, v_digital_sales
    FROM public.struk
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND (
          tanggal = v_tanggal
          OR (waktu_dibayar IS NOT NULL AND (waktu_dibayar AT TIME ZONE 'Asia/Jakarta')::date = v_tanggal)
      )
      AND UPPER(COALESCE(status_bayar, '')) IN ('SELESAI', 'LUNAS', 'PAID');

    SELECT COALESCE(SUM(COALESCE(nominal, 0)), 0)
    INTO v_expenses
    FROM public.pengeluaran
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND (pos IS NULL OR UPPER(pos) LIKE '%CASH%');

    SELECT COALESCE(SUM(COALESCE(pengeluaran, 0)), 0)
    INTO v_exchange_cash_out
    FROM public.cashflow
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND kategori = 'Tukar Uang'
      AND UPPER(COALESCE(pos, '')) LIKE '%CASH%';

    RETURN jsonb_build_object(
        'success', TRUE,
        'tanggal', v_tanggal,
        'branch_id', v_branch,
        'cash_sales', v_cash_sales,
        'digital_sales', v_digital_sales,
        'expenses', v_expenses,
        'exchange_cash_out', v_exchange_cash_out
    );
END;
$function$;

-- Patched RPC: redeem_customer_reward
CREATE OR REPLACE FUNCTION public.redeem_customer_reward(p_tenant_id uuid, p_plat text, p_reward_title text DEFAULT NULL::text, p_notes text DEFAULT ''::text, p_nama_pelanggan text DEFAULT ''::text, p_reward_type text DEFAULT NULL::text, p_id_struk text DEFAULT NULL::text, p_request_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_active_branch_programs INT := 0;
    v_active_global_programs INT := 0;
    v_visits_count INT := 0;
    v_logs_count INT := 0;
    v_claims_count INT := 0;
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

    -- 2. Authenticated & Active Caller Verification
    v_caller_role   := COALESCE(public.current_user_role(), 'Anon');
    v_caller_tenant := public.current_tenant_id();
    v_caller_branch := public.current_branch_id();

    IF v_caller_role = 'Anon' OR (v_caller_tenant IS NULL AND v_caller_role <> 'Super Admin') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_OR_INACTIVE';
    END IF;

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Kasir') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_REDEEM: Role "%" tidak memiliki wewenang menukarkan reward.', v_caller_role
            USING ERRCODE = '42501';
    END IF;

    -- 3. Cross-Tenant Isolation Enforcement
    IF v_caller_role <> 'Super Admin' AND p_tenant_id <> v_caller_tenant THEN
        RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_REDEEM';
    END IF;

    -- 4. Concurrency Serialization via Transaction Advisory Lock
    PERFORM pg_advisory_xact_lock(hashtext('reward_claim:' || p_tenant_id::text || ':' || v_clean_plate)::bigint);

    -- 5. Idempotency Protection with Payload Plate Consistency Check (REW-07)
    IF v_effective_id_struk IS NOT NULL OR v_effective_request_key IS NOT NULL THEN
        SELECT id, plat, reward_title, claimed_at INTO v_existing
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
            IF upper(regexp_replace(trim(COALESCE(v_existing.plat, '')), '\s+', '', 'g')) IS DISTINCT FROM v_clean_plate THEN
                RAISE EXCEPTION 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Request key "%" sudah digunakan untuk plat kendaraan lain.', v_effective_request_key
                    USING ERRCODE = '23505';
            END IF;

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

    -- 6. Active Loyalty Program Gate (REW-02: reject ambiguous multiple active programs)
    IF v_caller_branch IS NOT NULL THEN
        SELECT COUNT(*) INTO v_active_branch_programs
        FROM public.crm_loyalty_programs
        WHERE tenant_id = p_tenant_id AND is_active = TRUE AND branch_id = v_caller_branch;

        IF v_active_branch_programs > 1 THEN
            RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LOYALTY_PROGRAMS: Terdapat lebih dari satu program loyalti aktif pada cabang ini.'
                USING ERRCODE = '23505';
        END IF;
    END IF;

    IF v_active_branch_programs = 0 THEN
        SELECT COUNT(*) INTO v_active_global_programs
        FROM public.crm_loyalty_programs
        WHERE tenant_id = p_tenant_id AND is_active = TRUE AND branch_id IS NULL;

        IF v_active_global_programs > 1 THEN
            RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LOYALTY_PROGRAMS: Terdapat lebih dari satu program loyalti aktif pada tenant ini.'
                USING ERRCODE = '23505';
        END IF;
    END IF;

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

    -- REW-01 & REW-04: Always enforce canonical reward from DB; never allow client payload override
    v_canonical_title := COALESCE(NULLIF(trim(v_canonical_title), ''), 'Gratis Cuci Mobil');
    v_canonical_type  := COALESCE(NULLIF(trim(v_canonical_type), ''), 'FREE_SERVICE');

    -- 7. Strict Paid Visits Filter (Qualifying Visits Only)
    SELECT COUNT(DISTINCT s.id_struk) INTO v_visits_count
    FROM public.carwash cw
    INNER JOIN public.struk s ON s.tenant_id = cw.tenant_id AND s.id_struk = cw.id_struk
    WHERE cw.tenant_id = p_tenant_id
      AND upper(regexp_replace(trim(COALESCE(cw.plat, '')), '\s+', '', 'g')) = v_clean_plate
      AND lower(COALESCE(cw.status, '')) NOT IN ('batal', 'void', 'cancelled', 'pending')
      AND s.status_bayar IN ('Selesai', 'Lunas')
      AND COALESCE(s.total_tagihan, 0) > 0;

    -- 8. Count Historical Consumed Redemptions across crm_loyalty_logs & legacy customer_reward_claims (REW-08)
    SELECT COUNT(*) INTO v_logs_count
    FROM public.crm_loyalty_logs
    WHERE tenant_id = p_tenant_id
      AND upper(regexp_replace(trim(COALESCE(plat, '')), '\s+', '', 'g')) = v_clean_plate
      AND (tipe = 'REDEEM' OR (tipe IS NULL AND (claimed_at IS NOT NULL OR reward_title IS NOT NULL)));

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_reward_claims' AND c.relkind = 'r') THEN
        SELECT COUNT(*) INTO v_claims_count
        FROM public.customer_reward_claims
        WHERE tenant_id = p_tenant_id
          AND upper(regexp_replace(trim(COALESCE(plat, '')), '\s+', '', 'g')) = v_clean_plate
          AND UPPER(COALESCE(status, 'COMPLETED')) NOT IN ('BATAL', 'VOID', 'CANCELLED');
    END IF;

    v_redemptions_count := GREATEST(v_logs_count, v_claims_count);

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

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_reward_claims' AND c.relkind = 'r') THEN
        INSERT INTO public.customer_reward_claims (
            tenant_id, branch_id, plat, customer_name, reward_id, id_struk, claimed_at, status
        ) VALUES (
            p_tenant_id, v_caller_branch, upper(trim(p_plat)), p_nama_pelanggan, v_program_id, v_effective_id_struk, NOW(), 'COMPLETED'
        );
    END IF;

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
$function$;

-- Patched RPC: fn_execute_checkout
CREATE OR REPLACE FUNCTION public.fn_execute_checkout(p_tenant_id uuid, p_branch_id uuid, p_struk_payload jsonb, p_cafe_items jsonb, p_carwash_payload jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;
    v_uang_diterima NUMERIC(15, 2) := 0.00;
    v_tender_total NUMERIC(15, 2) := 0.00;
    v_non_cash NUMERIC(15, 2) := 0.00;
    v_nominal_cash NUMERIC(15, 2) := 0.00;
    v_nominal_qris NUMERIC(15, 2) := 0.00;
    v_nominal_transfer NUMERIC(15, 2) := 0.00;
    v_is_cash BOOLEAN;
    v_id_struk TEXT;
    v_tanggal DATE;
    v_jam TIME;
    v_status_bayar TEXT;
    v_nominal_bayar NUMERIC(15, 2) := 0.00;
    v_kembalian NUMERIC(15, 2) := 0.00;
    v_metode_bayar TEXT;
    v_kasir TEXT;
    v_customer TEXT;
    v_catatan TEXT;
    v_diskon NUMERIC(15, 2) := 0.00;
    v_pajak NUMERIC(15, 2) := 0.00;
    v_subtotal_kotor NUMERIC(15, 2) := 0.00;
    v_total_cafe NUMERIC(15, 2) := 0.00;
    v_total_carwash NUMERIC(15, 2) := 0.00;
    v_total_tagihan NUMERIC(15, 2) := 0.00;
    v_total_cogs NUMERIC(15, 2) := 0.00;
    v_redeem_loyalty BOOLEAN := FALSE;
    v_cw_plat TEXT := '';
    v_redeem_res JSONB := NULL;

    v_existing_struk RECORD;
    v_item JSONB;
    v_nama_menu TEXT;
    v_qty_menu NUMERIC(15, 4);
    v_harga_menu NUMERIC(15, 2);
    v_menu_id UUID;
    v_resolved_menu_id UUID;
    v_stok_barang_id UUID;
    v_raw_uuid TEXT;
    v_menu_record RECORD;

    v_resep_record RECORD;
    v_stock_record RECORD;
    v_needed NUMERIC(15, 4);
    v_item_cogs NUMERIC(15, 2);

    v_cw_record RECORD;
    v_cw_paket TEXT;
    v_cw_ukuran TEXT;
    v_cw_variant TEXT;
    v_cw_harga NUMERIC(15, 2);
    v_base_cw_price NUMERIC(15, 2);
    v_catalog_cw_price NUMERIC(15, 2);
    v_anggota_1_name TEXT;
    v_anggota_2_name TEXT;
    v_anggota_1_id UUID;
    v_anggota_2_id UUID;

    v_current_hash TEXT;
    v_advisory_key BIGINT;

    v_journal_id UUID;
    v_coa_kas UUID;
    v_coa_bank UUID;
    v_coa_inv UUID;
    v_coa_rev_cw UUID;
    v_coa_rev_cafe UUID;
    v_coa_cogs UUID;
    v_coa_tax UUID;
    v_net_cw NUMERIC(15, 2) := 0.00;
    v_net_cafe NUMERIC(15, 2) := 0.00;
    v_pos TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;
    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles WHERE id = v_caller_id;
    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Keanggotaan aktif diperlukan.' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses transaksi lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;
    IF v_caller_role NOT IN ('super admin', 'owner', 'admin pusat', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan melakukan checkout.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.fn_assert_active_tenant_license(p_tenant_id);

    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL OR
       (v_caller_role IN ('kasir', 'admin') AND v_caller_branch IS NOT NULL AND v_effective_branch_id IS DISTINCT FROM v_caller_branch) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang transaksi tidak diizinkan.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.branches
                   WHERE id = v_effective_branch_id AND tenant_id = p_tenant_id AND is_active IS TRUE) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang aktif dalam tenant diperlukan.' USING ERRCODE = '42501';
    END IF;
    IF p_struk_payload IS NULL OR jsonb_typeof(p_struk_payload) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Header transaksi wajib berupa object.';
    END IF;

    v_id_struk := TRIM(COALESCE(p_struk_payload->>'id_struk', p_struk_payload->>'nomor_struk', p_struk_payload->>'no_struk', ''));
    IF v_id_struk = '' THEN
        v_id_struk := 'STRUK-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 4));
    END IF;

    v_advisory_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk), 1, 15))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_advisory_key);

    v_current_hash := md5(
        COALESCE(p_struk_payload::text, '') || '|' ||
        COALESCE(p_cafe_items::text, '') || '|' ||
        COALESCE(p_carwash_payload::text, '')
    );

    SELECT id, tenant_id, branch_id, id_struk, status_bayar, payload_hash, total_tagihan, nominal_bayar, uang_diterima, kembalian, total_cogs
    INTO v_existing_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    IF FOUND THEN
        IF v_existing_struk.branch_id IS DISTINCT FROM v_effective_branch_id THEN
            RAISE EXCEPTION 'BRANCH_FORBIDDEN: Transaksi berasal dari cabang berbeda.' USING ERRCODE = '42501';
        END IF;
        IF v_existing_struk.status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
            IF v_existing_struk.payload_hash IS NOT NULL AND v_existing_struk.payload_hash <> v_current_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Struk "%" telah diselesaikan dengan payload transaksi yang berbeda.', v_id_struk;
            END IF;

            RETURN jsonb_build_object(
                'success', TRUE,
                'status', 'ALREADY_COMPLETED',
                'id_struk', v_id_struk,
                'total_tagihan', v_existing_struk.total_tagihan,
                'nominal_bayar', v_existing_struk.nominal_bayar,
                'uang_diterima', v_existing_struk.uang_diterima,
                'kembalian', v_existing_struk.kembalian,
                'total_cogs', COALESCE(v_existing_struk.total_cogs, 0.00),
                'was_replayed', TRUE,
                'message', 'Transaksi sudah berstatus selesai, mutasi tidak diulang.'
            );
        END IF;
    END IF;

    v_tanggal := COALESCE(NULLIF(p_struk_payload->>'tanggal', '')::date, CURRENT_DATE);
    v_jam := COALESCE(NULLIF(p_struk_payload->>'jam', '')::time, CURRENT_TIME);
    v_status_bayar := COALESCE(NULLIF(p_struk_payload->>'status_bayar', ''), 'Selesai');
    v_diskon := COALESCE(NULLIF(p_struk_payload->>'diskon', '')::numeric, 0.00);
    v_pajak := COALESCE(NULLIF(p_struk_payload->>'pajak', '')::numeric, 0.00);
    v_nominal_bayar := COALESCE(NULLIF(p_struk_payload->>'nominal_bayar', '')::numeric, 0.00);
    v_metode_bayar := UPPER(TRIM(COALESCE(NULLIF(p_struk_payload->>'metode_bayar', ''), 'CASH')));
    v_kasir := COALESCE(NULLIF(p_struk_payload->>'kasir', ''), 'Kasir');
    v_customer := COALESCE(NULLIF(p_struk_payload->>'nama_pelanggan', ''), 'Pelanggan Umum');
    v_catatan := COALESCE(p_struk_payload->>'catatan', '');
    v_redeem_loyalty := COALESCE((p_struk_payload->>'redeem_loyalty')::boolean, FALSE);

    IF v_diskon < 0.00 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh negatif.';
    END IF;

    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);
            v_harga_menu := COALESCE(
                NULLIF(v_item->>'harga_satuan', '')::numeric,
                NULLIF(v_item->>'harga', '')::numeric,
                0.00
            );

            v_raw_uuid := TRIM(COALESCE(v_item->>'menu_id', v_item->>'id_menu', ''));
            v_menu_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                              THEN v_raw_uuid::uuid ELSE NULL END;

            IF v_nama_menu = '' OR v_qty_menu <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Nama menu dan kuantitas wajib valid.';
            END IF;

            IF v_menu_id IS NOT NULL THEN
                SELECT harga INTO v_menu_record
                FROM public.daftar_harga_menu
                WHERE tenant_id = p_tenant_id AND id = v_menu_id
                LIMIT 1;
            END IF;

            IF v_menu_id IS NULL OR NOT FOUND THEN
                SELECT harga INTO v_menu_record
                FROM public.daftar_harga_menu
                WHERE tenant_id = p_tenant_id
                  AND (LOWER(TRIM(COALESCE(nama_menu, ''))) = LOWER(TRIM(v_nama_menu))
                       OR LOWER(TRIM(COALESCE(daftar_menu, ''))) = LOWER(TRIM(v_nama_menu)))
                ORDER BY updated_at DESC NULLS LAST
                LIMIT 1;
            END IF;

            IF FOUND THEN
                IF v_harga_menu <> v_menu_record.harga THEN
                    RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga menu "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                        v_nama_menu, v_menu_record.harga, v_harga_menu;
                END IF;
            ELSE
                IF v_harga_menu < 0.00 THEN
                    RAISE EXCEPTION 'INVALID_PRICE: Harga menu tidak boleh negatif.';
                END IF;
            END IF;

            v_total_cafe := v_total_cafe + (v_harga_menu * v_qty_menu);
        END LOOP;
    END IF;

    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        v_cw_paket := TRIM(COALESCE(p_carwash_payload->>'paket', ''));
        v_cw_plat := TRIM(COALESCE(p_carwash_payload->>'plat', p_carwash_payload->>'plat_nomor', ''));
        v_cw_ukuran := COALESCE(NULLIF(TRIM(p_carwash_payload->>'ukuran'), ''), 'Medium');
        v_cw_variant := COALESCE(NULLIF(TRIM(p_carwash_payload->>'variant'), ''), 'Regular');
        v_cw_harga := COALESCE(
            NULLIF(p_carwash_payload->>'harga', '')::numeric,
            NULLIF(p_carwash_payload->>'tarif', '')::numeric,
            0.00
        );

        IF v_cw_paket <> '' THEN
            SELECT price, tarif, tarif_matrix INTO v_cw_record
            FROM public.carwash_packages
            WHERE tenant_id = p_tenant_id
              AND (LOWER(TRIM(COALESCE(nama_paket, ''))) = LOWER(TRIM(v_cw_paket))
                   OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM(v_cw_paket)))
            LIMIT 1;

            IF FOUND AND LOWER(v_cw_ukuran) <> 'custom' THEN
                v_base_cw_price := COALESCE(v_cw_record.tarif, v_cw_record.price);
                IF v_cw_record.tarif_matrix IS NOT NULL AND jsonb_typeof(v_cw_record.tarif_matrix) = 'object' THEN
                    v_catalog_cw_price := COALESCE(
                        NULLIF(v_cw_record.tarif_matrix->v_cw_ukuran->>v_cw_variant, '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->v_cw_ukuran->>'Regular', '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->'Large'->>v_cw_variant, '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->'Large'->>'Regular', '')::numeric,
                        v_base_cw_price
                    );
                ELSE
                    v_catalog_cw_price := v_base_cw_price;
                END IF;

                IF v_catalog_cw_price IS NOT NULL AND v_catalog_cw_price > 0.00
                   AND v_cw_harga <> v_catalog_cw_price
                   AND v_cw_harga <> COALESCE(v_base_cw_price, -1.00) THEN
                    RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga paket carwash "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                        v_cw_paket, v_catalog_cw_price, v_cw_harga;
                END IF;
            END IF;
        END IF;

        IF v_cw_harga < 0.00 THEN
            RAISE EXCEPTION 'INVALID_PRICE: Tarif carwash tidak boleh negatif.';
        END IF;

        v_total_carwash := v_cw_harga;
    END IF;

    IF v_redeem_loyalty THEN
        IF v_cw_plat = '' OR v_total_carwash <= 0 THEN
            RAISE EXCEPTION 'LOYALTY_REWARD_UNAVAILABLE: Klaim hadiah loyalty memerlukan transaksi layanan cuci kendaraan.';
        END IF;

        v_redeem_res := public.redeem_customer_reward(
            p_tenant_id,
            v_cw_plat,
            NULL,
            'Klaim hadiah loyalty saat checkout POS (' || v_id_struk || ')',
            v_customer,
            v_id_struk,
            v_id_struk
        );

        v_diskon := v_diskon + v_total_carwash;
    END IF;

    v_subtotal_kotor := v_total_cafe + v_total_carwash;
    v_total_tagihan := GREATEST(0.00, v_subtotal_kotor - v_diskon + v_pajak);

    v_is_cash := v_metode_bayar IN ('CASH', 'TUNAI', 'SPLIT');
    v_nominal_qris := CASE WHEN v_metode_bayar IN ('SPLIT', 'QRIS') THEN
        COALESCE(NULLIF(p_struk_payload->>'nominal_qris', '')::numeric, 0.00) ELSE 0.00 END;
    v_nominal_transfer := CASE WHEN v_metode_bayar IN ('SPLIT', 'TRANSFER') THEN
        COALESCE(NULLIF(p_struk_payload->>'nominal_transfer', '')::numeric, 0.00) ELSE 0.00 END;

    IF v_metode_bayar = 'QRIS' AND v_nominal_qris = 0.00 THEN
        v_nominal_qris := v_total_tagihan;
    ELSIF v_metode_bayar = 'TRANSFER' AND v_nominal_transfer = 0.00 THEN
        v_nominal_transfer := v_total_tagihan;
    END IF;

    v_non_cash := CASE WHEN v_metode_bayar = 'SPLIT' THEN (v_nominal_qris + v_nominal_transfer) ELSE 0.00 END;
    v_uang_diterima := COALESCE(
        NULLIF(p_struk_payload->>'uang_diterima', '')::numeric,
        CASE WHEN v_metode_bayar = 'SPLIT' THEN COALESCE(NULLIF(p_struk_payload->>'nominal_cash', '')::numeric, v_nominal_bayar - v_non_cash) ELSE v_nominal_bayar END
    );

    IF v_uang_diterima = 'NaN'::numeric OR v_non_cash = 'NaN'::numeric OR
       v_uang_diterima < 0 OR v_non_cash < 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT: Nominal pembayaran wajib valid dan tidak negatif.';
    END IF;

    v_tender_total := v_uang_diterima + v_non_cash;

    IF v_status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
        IF v_tender_total < v_total_tagihan THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Pembayaran kurang dari tagihan.';
        END IF;
        IF NOT v_is_cash AND v_tender_total <> v_total_tagihan THEN
            RAISE EXCEPTION 'INVALID_PAYMENT: Pembayaran non-tunai harus sesuai tagihan.';
        END IF;
        v_nominal_bayar := v_total_tagihan;
        v_kembalian := CASE WHEN v_is_cash THEN v_tender_total - v_total_tagihan ELSE 0.00 END;

        IF v_metode_bayar = 'SPLIT' THEN
            v_nominal_cash := GREATEST(0.00, v_total_tagihan - v_non_cash);
        ELSIF v_is_cash THEN
            v_nominal_cash := v_total_tagihan;
        ELSE
            v_nominal_cash := 0.00;
        END IF;
    ELSE
        v_nominal_bayar := LEAST(v_tender_total, v_total_tagihan);
        v_kembalian := 0.00;
        v_nominal_cash := 0.00;
    END IF;

    INSERT INTO public.struk (
        id, tenant_id, branch_id, id_struk, tanggal, jam, kasir,
        nama_pelanggan, catatan, status_bayar, status_pembayaran,
        subtotal, diskon, diskon_cafe, diskon_carwash,
        pajak, nominal_bayar, bayar, uang_diterima, kembalian,
        nominal_cash, nominal_qris, nominal_transfer,
        metode_bayar, metode_pembayaran, total_tagihan, total, payload_hash,
        created_at, waktu_dibuat, updated_at
    ) VALUES (
        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam, v_kasir,
        v_customer, v_catatan, v_status_bayar, v_status_bayar,
        v_subtotal_kotor, v_diskon, v_diskon, 0.00,
        v_pajak, v_nominal_bayar, v_nominal_bayar, v_uang_diterima, v_kembalian,
        v_nominal_cash, v_nominal_qris, v_nominal_transfer,
        v_metode_bayar, v_metode_bayar, v_total_tagihan, v_total_tagihan, v_current_hash,
        NOW(), NOW(), NOW()
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET
        status_bayar = EXCLUDED.status_bayar,
        status_pembayaran = EXCLUDED.status_pembayaran,
        nominal_bayar = EXCLUDED.nominal_bayar,
        bayar = EXCLUDED.bayar,
        uang_diterima = EXCLUDED.uang_diterima,
        kembalian = EXCLUDED.kembalian,
        nominal_cash = EXCLUDED.nominal_cash,
        nominal_qris = EXCLUDED.nominal_qris,
        nominal_transfer = EXCLUDED.nominal_transfer,
        pajak = EXCLUDED.pajak,
        total_tagihan = EXCLUDED.total_tagihan,
        total = EXCLUDED.total,
        updated_at = NOW();

    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);

            v_raw_uuid := TRIM(COALESCE(v_item->>'menu_id', v_item->>'id_menu', ''));
            v_menu_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                              THEN v_raw_uuid::uuid ELSE NULL END;

            v_raw_uuid := TRIM(COALESCE(v_item->>'stok_barang_id', ''));
            v_stok_barang_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                     THEN v_raw_uuid::uuid ELSE NULL END;

            v_resolved_menu_id := v_menu_id;
            IF v_resolved_menu_id IS NULL AND v_stok_barang_id IS NULL THEN
                SELECT id INTO v_resolved_menu_id
                FROM public.daftar_harga_menu
                WHERE tenant_id = p_tenant_id
                  AND (LOWER(TRIM(COALESCE(nama_menu, ''))) = LOWER(TRIM(v_nama_menu))
                       OR LOWER(TRIM(COALESCE(daftar_menu, ''))) = LOWER(TRIM(v_nama_menu)))
                ORDER BY updated_at DESC NULLS LAST, id ASC
                LIMIT 1;
            END IF;

            FOR v_resep_record IN
                SELECT stok_barang_id, nama_bahan, COALESCE(jumlah_dibutuhkan, jumlah) AS jumlah_per_porsi, satuan
                FROM public.resep
                WHERE tenant_id = p_tenant_id
                  AND (
                      (v_resolved_menu_id IS NOT NULL AND menu_id = v_resolved_menu_id)
                      OR (menu_id IS NULL AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu)))
                  )
            LOOP
                v_needed := v_resep_record.jumlah_per_porsi * v_qty_menu;

                IF v_resep_record.stok_barang_id IS NOT NULL THEN
                    SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                    INTO v_stock_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND (
                          id = v_resep_record.stok_barang_id
                          OR (
                              branch_id = v_effective_branch_id
                              AND id_bahan_baku IS NOT NULL
                              AND id_bahan_baku = (
                                  SELECT s_ref.id_bahan_baku
                                  FROM public.stok_barang s_ref
                                  WHERE s_ref.id = v_resep_record.stok_barang_id
                                    AND s_ref.tenant_id = p_tenant_id
                                  LIMIT 1
                              )
                          )
                      )
                    ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST,
                             (id = v_resep_record.stok_barang_id) DESC
                    LIMIT 1
                    FOR UPDATE;
                ELSE
                    SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                    INTO v_stock_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                      AND (LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_resep_record.nama_bahan))
                           OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_resep_record.nama_bahan)))
                    ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST, id
                    LIMIT 1
                    FOR UPDATE;
                END IF;

                IF FOUND THEN
                    IF v_stock_record.stok < v_needed THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_resep_record.nama_bahan, v_stock_record.stok, v_needed;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_needed,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_needed,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id AND tenant_id = p_tenant_id;

                    v_item_cogs := ROUND(v_needed * v_stock_record.unit_cost, 2);

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, id_struk,
                        nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, biaya_satuan, total_biaya,
                        tanggal, keterangan, alasan, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_stock_record.id::text, v_stock_record.id, v_id_struk,
                        v_resep_record.nama_bahan, v_resep_record.nama_bahan, v_resep_record.nama_bahan,
                        v_needed, v_stock_record.unit_cost, v_item_cogs,
                        v_tanggal, 'BOM Pemakaian POS Struk: ' || v_id_struk, 'POS_SALE', NOW()
                    );

                    v_total_cogs := v_total_cogs + v_item_cogs;
                END IF;
            END LOOP;

            IF NOT EXISTS (
                SELECT 1 FROM public.resep
                WHERE tenant_id = p_tenant_id
                  AND (
                      (v_resolved_menu_id IS NOT NULL AND menu_id = v_resolved_menu_id)
                      OR (menu_id IS NULL AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu)))
                  )
            ) THEN
                IF v_stok_barang_id IS NOT NULL THEN
                    SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                    INTO v_stock_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND id = v_stok_barang_id
                    LIMIT 1
                    FOR UPDATE;
                ELSE
                    SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                    INTO v_stock_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                      AND (LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_nama_menu))
                           OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_nama_menu)))
                    ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST, id
                    LIMIT 1
                    FOR UPDATE;
                END IF;

                IF FOUND THEN
                    IF v_stock_record.stok < v_qty_menu THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_nama_menu, v_stock_record.stok, v_qty_menu;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_qty_menu,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_qty_menu,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id AND tenant_id = p_tenant_id;

                    v_item_cogs := ROUND(v_qty_menu * v_stock_record.unit_cost, 2);

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, id_struk,
                        nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, biaya_satuan, total_biaya,
                        tanggal, keterangan, alasan, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_stock_record.id::text, v_stock_record.id, v_id_struk,
                        v_nama_menu, v_nama_menu, v_nama_menu,
                        v_qty_menu, v_stock_record.unit_cost, v_item_cogs,
                        v_tanggal, 'Penjualan Langsung POS Struk: ' || v_id_struk, 'POS_SALE', NOW()
                    );

                    v_total_cogs := v_total_cogs + v_item_cogs;
                END IF;
            END IF;
        END LOOP;
    END IF;

    UPDATE public.struk
    SET total_cogs = v_total_cogs,
        cogs_status = CASE WHEN v_total_cogs > 0 THEN 'SNAPSHOT_RECORDED' ELSE 'ZERO_OR_SERVICE' END
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);
            v_harga_menu := COALESCE(
                NULLIF(v_item->>'harga_satuan', '')::numeric,
                NULLIF(v_item->>'harga', '')::numeric,
                0.00
            );

            INSERT INTO public.cafe (
                id, tenant_id, branch_id, id_struk, tanggal, jam,
                nama_menu, qty, harga_satuan, subtotal, status, catatan, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam,
                v_nama_menu, v_qty_menu, v_harga_menu, (v_harga_menu * v_qty_menu), v_status_bayar, v_catatan, NOW()
            );
        END LOOP;
    END IF;

    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        v_anggota_1_name := p_carwash_payload->>'anggota_1';
        v_anggota_2_name := p_carwash_payload->>'anggota_2';

        v_raw_uuid := TRIM(COALESCE(p_carwash_payload->>'anggota_1_id', ''));
        v_anggota_1_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                               THEN v_raw_uuid::uuid ELSE NULL END;

        v_raw_uuid := TRIM(COALESCE(p_carwash_payload->>'anggota_2_id', ''));
        v_anggota_2_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                               THEN v_raw_uuid::uuid ELSE NULL END;

        IF v_anggota_1_id IS NULL AND NULLIF(TRIM(COALESCE(v_anggota_1_name, '')), '') IS NOT NULL THEN
            SELECT id INTO v_anggota_1_id
            FROM public.karyawan_cuci
            WHERE tenant_id = p_tenant_id AND UPPER(TRIM(nama)) = UPPER(TRIM(v_anggota_1_name))
            ORDER BY created_at ASC, id ASC
            LIMIT 1;
        END IF;

        IF v_anggota_2_id IS NULL AND NULLIF(TRIM(COALESCE(v_anggota_2_name, '')), '') IS NOT NULL THEN
            SELECT id INTO v_anggota_2_id
            FROM public.karyawan_cuci
            WHERE tenant_id = p_tenant_id AND UPPER(TRIM(nama)) = UPPER(TRIM(v_anggota_2_name))
            ORDER BY created_at ASC, id ASC
            LIMIT 1;
        END IF;

        INSERT INTO public.carwash (
            id, tenant_id, branch_id, id_struk, tanggal, jam, plat, model, variant, ukuran,
            paket, harga, anggota_1, anggota_2, anggota_1_id, anggota_2_id, shift, status, gaji_anggota,
            no_telepon, keterangan, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam,
            COALESCE(p_carwash_payload->>'plat', '-'),
            COALESCE(p_carwash_payload->>'model', 'Mobil'),
            COALESCE(p_carwash_payload->>'variant', 'Regular'),
            COALESCE(p_carwash_payload->>'ukuran', 'Medium'),
            COALESCE(p_carwash_payload->>'paket', 'Cuci Biasa'),
            v_total_carwash,
            v_anggota_1_name,
            v_anggota_2_name,
            v_anggota_1_id,
            v_anggota_2_id,
            COALESCE(p_carwash_payload->>'shift', 'Pagi'),
            v_status_bayar,
            COALESCE((p_carwash_payload->>'gaji_anggota')::numeric, 0.00),
            p_carwash_payload->>'no_telepon',
            p_carwash_payload->>'catatan_kendaraan',
            NOW()
        );
    END IF;

    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
        IF v_metode_bayar = 'SPLIT' THEN
            IF v_nominal_cash > 0.00 THEN
                INSERT INTO public.cashflow (
                    id, tenant_id, branch_id, id_sumber, tanggal,
                    keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                    pos, apakah_stok, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-CASH-' || v_id_struk, v_tanggal,
                    'Penjualan Kasir POS (Tunai Split): ' || v_id_struk || ' (' || v_customer || ')',
                    'Pemasukan', 'Pendapatan Kasir', v_nominal_cash, 0.00,
                    'SALDO CASH', FALSE, NOW()
                );
            END IF;

            IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
                INSERT INTO public.cashflow (
                    id, tenant_id, branch_id, id_sumber, tanggal,
                    keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                    pos, apakah_stok, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-DIGITAL-' || v_id_struk, v_tanggal,
                    'Penjualan Kasir POS (Digital Split): ' || v_id_struk || ' (' || v_customer || ')',
                    'Pemasukan', 'Pendapatan Kasir', (v_nominal_qris + v_nominal_transfer), 0.00,
                    'SALDO REKENING (N)', FALSE, NOW()
                );
            END IF;
        ELSE
            v_pos := CASE
                WHEN v_metode_bayar IN ('CASH', 'TUNAI') THEN 'SALDO CASH'
                ELSE 'SALDO REKENING (N)'
            END;

            INSERT INTO public.cashflow (
                id, tenant_id, branch_id, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                pos, apakah_stok, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-' || v_id_struk, v_tanggal,
                'Penjualan Kasir POS: ' || v_id_struk || ' (' || v_customer || ')',
                'Pemasukan', 'Pendapatan Kasir', v_total_tagihan, 0.00,
                v_pos, FALSE, NOW()
            );
        END IF;
    END IF;

    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
        SELECT id INTO v_coa_kas FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;
        SELECT id INTO v_coa_bank FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1102' LIMIT 1;
        SELECT id INTO v_coa_inv FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1103' LIMIT 1;
        SELECT id INTO v_coa_rev_cw FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4101' LIMIT 1;
        SELECT id INTO v_coa_rev_cafe FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4102' LIMIT 1;
        SELECT id INTO v_coa_cogs FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '5101' LIMIT 1;
        SELECT id INTO v_coa_tax FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun IN ('2102', '2103', '2101') LIMIT 1;

        IF (v_nominal_cash > 0.00 OR (v_is_cash AND v_metode_bayar <> 'SPLIT')) AND v_coa_kas IS NULL THEN
            RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun kas (1101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
        END IF;
        IF ((v_nominal_qris + v_nominal_transfer) > 0.00 OR (NOT v_is_cash AND v_metode_bayar <> 'SPLIT')) AND v_coa_bank IS NULL THEN
            RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun bank (1102) belum dikonfigurasi pada bagan akun (COA) untuk pembayaran digital.' USING ERRCODE = '28000';
        END IF;

        IF (v_coa_rev_cw IS NOT NULL OR v_coa_rev_cafe IS NOT NULL) THEN
            v_journal_id := gen_random_uuid();

            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
            ) VALUES (
                v_journal_id, p_tenant_id, v_effective_branch_id, 'JE-POS-' || v_id_struk, v_tanggal,
                'Auto-journal Penjualan POS: ' || v_id_struk, v_total_tagihan, 'DRAFT', NOW()
            );

            IF v_metode_bayar = 'SPLIT' THEN
                IF v_nominal_cash > 0.00 THEN
                    INSERT INTO public.journal_entry_lines (
                        id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_kas,
                        v_nominal_cash, 0.00, 'Penerimaan Tunai Split POS ' || v_id_struk, NOW()
                    );
                END IF;
                IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
                    INSERT INTO public.journal_entry_lines (
                        id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
                        (v_nominal_qris + v_nominal_transfer), 0.00, 'Penerimaan Digital Split POS ' || v_id_struk, NOW()
                    );
                END IF;
            ELSIF v_is_cash THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_kas,
                    v_total_tagihan, 0.00, 'Penerimaan Tunai POS ' || v_id_struk, NOW()
                );
            ELSE
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
                    v_total_tagihan, 0.00, 'Penerimaan Digital POS ' || v_id_struk, NOW()
                );
            END IF;

            v_net_cw := CASE WHEN v_subtotal_kotor > 0 THEN ROUND((v_total_tagihan - v_pajak) * (v_total_carwash / v_subtotal_kotor), 2) ELSE 0.00 END;
            v_net_cafe := GREATEST(0.00, (v_total_tagihan - v_pajak) - v_net_cw);

            IF v_net_cw > 0.00 AND v_coa_rev_cw IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cw,
                    0.00, v_net_cw, 'Pendapatan Layanan Carwash ' || v_id_struk, NOW()
                );
            END IF;

            IF v_net_cafe > 0.00 AND v_coa_rev_cafe IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cafe,
                    0.00, v_net_cafe, 'Pendapatan Cafe ' || v_id_struk, NOW()
                );
            END IF;

            IF v_pajak > 0.00 THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, COALESCE(v_coa_tax, v_coa_rev_cafe, v_coa_rev_cw),
                    0.00, v_pajak, 'Pajak Penjualan POS ' || v_id_struk, NOW()
                );
            END IF;

            IF v_total_cogs > 0.00 AND v_coa_cogs IS NOT NULL AND v_coa_inv IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES
                    (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_cogs, v_total_cogs, 0.00, 'HPP Bahan Baku POS ' || v_id_struk, NOW()),
                    (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_inv, 0.00, v_total_cogs, 'Pengurangan Persediaan POS ' || v_id_struk, NOW());
            END IF;

            UPDATE public.journal_entries
            SET status = 'POSTED'
            WHERE id = v_journal_id AND tenant_id = p_tenant_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'COMPLETED',
        'id_struk', v_id_struk,
        'subtotal', v_subtotal_kotor,
        'diskon', v_diskon,
        'pajak', v_pajak,
        'total_tagihan', v_total_tagihan,
        'nominal_bayar', v_nominal_bayar,
        'uang_diterima', v_uang_diterima,
        'kembalian', v_kembalian,
        'total_cogs', v_total_cogs,
        'loyalty_redemption', v_redeem_res,
        'was_replayed', FALSE
    );
END;
$function$;

-- Patched RPC: fn_settle_pending_bill
CREATE OR REPLACE FUNCTION public.fn_settle_pending_bill(p_tenant_id uuid, p_branch_id uuid, p_settle_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;

    v_id_struk TEXT;
    v_metode_bayar TEXT;
    v_uang_diterima NUMERIC(15, 2) := 0.00;
    v_nominal_bayar NUMERIC(15, 2) := 0.00;
    v_nominal_cash NUMERIC(15, 2) := 0.00;
    v_nominal_qris NUMERIC(15, 2) := 0.00;
    v_nominal_transfer NUMERIC(15, 2) := 0.00;
    v_kembalian NUMERIC(15, 2) := 0.00;

    v_surcharge_enabled BOOLEAN := FALSE;
    v_surcharge_nominal NUMERIC(15, 2) := 0.00;
    v_surcharge_keterangan TEXT := NULL;
    v_base_total NUMERIC(15, 2) := 0.00;
    v_final_total NUMERIC(15, 2) := 0.00;

    v_struk RECORD;
    v_advisory_key BIGINT;
    v_idempotency_key TEXT;
    v_canonical_settle_payload JSONB;
    v_current_settle_fingerprint TEXT;

    v_total_carwash NUMERIC(15, 2) := 0.00;
    v_total_cafe NUMERIC(15, 2) := 0.00;
    v_item_subtotal NUMERIC(15, 2) := 0.00;
    v_discount NUMERIC(15, 2) := 0.00;
    v_net_cw NUMERIC(15, 2) := 0.00;
    v_net_cafe NUMERIC(15, 2) := 0.00;
    v_total_cogs NUMERIC(15, 2) := NULL;
    v_cogs_status TEXT := 'SNAPSHOT_RECORDED';
    v_cogs_incomplete BOOLEAN := FALSE;

    v_journal_id UUID;
    v_coa_kas UUID;
    v_coa_bank UUID;
    v_coa_inv UUID;
    v_coa_rev_cw UUID;
    v_coa_rev_cafe UUID;
    v_coa_rev_inap UUID;
    v_coa_cogs UUID;
    v_coa_disc UUID;
    v_coa_tax UUID;
    v_tax NUMERIC(15, 2) := 0.00;
    v_pos TEXT;
    v_is_cash BOOLEAN;
BEGIN
    -- 1. Otorisasi Pengguna Aktif & Batas Cabang
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles WHERE id = v_caller_id;

    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Keanggotaan aktif diperlukan.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL OR v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses transaksi lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role NOT IN ('super admin', 'owner', 'admin pusat', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan melakukan pelunasan.' USING ERRCODE = '42501';
    END IF;

    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL OR
       (v_caller_role IN ('kasir', 'admin') AND v_caller_branch IS NOT NULL AND v_effective_branch_id IS DISTINCT FROM v_caller_branch) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang transaksi tidak diizinkan.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.branches
                   WHERE id = v_effective_branch_id AND tenant_id = p_tenant_id AND is_active IS TRUE) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang aktif dalam tenant diperlukan.' USING ERRCODE = '42501';
    END IF;

    IF p_settle_payload IS NULL OR jsonb_typeof(p_settle_payload) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Payload pelunasan wajib berupa object.';
    END IF;

    -- 2. Parsing Payload Struk & Idempotency Key
    v_id_struk := TRIM(COALESCE(p_settle_payload->>'id_struk', ''));
    IF v_id_struk = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Nomor struk wajib disertakan.';
    END IF;

    v_idempotency_key := TRIM(COALESCE(p_settle_payload->>'idempotency_key', p_settle_payload->>'idempotencyKey', ''));
    IF v_idempotency_key = '' THEN
        v_idempotency_key := v_id_struk || ':settle';
    END IF;

    -- 3. Advisory Lock Transaksional untuk Idempotensi
    v_advisory_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk || ':settle'), 1, 15))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_advisory_key);

    -- 4. Kunci Baris Struk (Pessimistic Row Locking)
    SELECT * INTO v_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BILL_NOT_FOUND: Tagihan "%" tidak ditemukan dalam tenant aktif.', v_id_struk USING ERRCODE = 'P0002';
    END IF;

    IF v_struk.branch_id IS DISTINCT FROM v_effective_branch_id THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Tagihan berasal dari cabang berbeda.' USING ERRCODE = '42501';
    END IF;

    -- 5. Ekstraksi Metode & Tender Pembayaran
    v_metode_bayar := UPPER(TRIM(COALESCE(p_settle_payload->>'metode_bayar', 'CASH')));
    v_is_cash := v_metode_bayar IN ('CASH', 'TUNAI', 'SPLIT');

    -- Validasi Biaya Inap (Surcharge Validation)
    v_surcharge_enabled := COALESCE((p_settle_payload->'surcharge'->>'enabled')::boolean, FALSE);
    IF v_surcharge_enabled THEN
        v_surcharge_nominal := COALESCE(NULLIF(p_settle_payload->'surcharge'->>'nominal', '')::numeric, 0.00);
        v_surcharge_keterangan := TRIM(COALESCE(p_settle_payload->'surcharge'->>'keterangan', ''));

        IF v_surcharge_nominal < 0.00 THEN
            RAISE EXCEPTION 'INVALID_SURCHARGE: Biaya inap tidak boleh negatif.' USING ERRCODE = '22023';
        END IF;

        IF v_surcharge_nominal > 0.00 THEN
            IF v_surcharge_keterangan = '' THEN
                RAISE EXCEPTION 'INVALID_SURCHARGE: Keterangan biaya inap wajib disertakan saat nominal lebih dari 0.' USING ERRCODE = '22023';
            END IF;

            -- Batas wajar operasional maksimal Rp 5.000.000
            IF v_surcharge_nominal > 5000000.00 THEN
                RAISE EXCEPTION 'INVALID_SURCHARGE: Biaya inap melebihi batas operasional maksimum (Rp 5.000.000).' USING ERRCODE = '22023';
            END IF;

            -- Otorisasi peran: Kasir hanya dapat menetapkan hingga Rp 500.000
            IF v_caller_role = 'kasir' AND v_surcharge_nominal > 500000.00 THEN
                RAISE EXCEPTION 'SURCHARGE_UNAUTHORIZED: Biaya inap di atas Rp 500.000 memerlukan persetujuan Owner atau Administrator.' USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSE
        v_surcharge_nominal := 0.00;
        v_surcharge_keterangan := NULL;
    END IF;

    -- Hitung Base Tagihan (jika struk sudah pernah lunas, base tagihan = total - biaya_inap sebelumnya)
    v_base_total := CASE
        WHEN v_struk.status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
            (v_struk.total_tagihan - COALESCE(v_struk.biaya_inap, 0.00))
        ELSE
            v_struk.total_tagihan
    END;

    v_final_total := v_base_total + v_surcharge_nominal;

    v_nominal_cash := COALESCE(NULLIF(p_settle_payload->>'nominal_cash', '')::numeric, NULLIF(p_settle_payload->>'split_cash', '')::numeric, 0.00);
    v_nominal_qris := COALESCE(NULLIF(p_settle_payload->>'nominal_qris', '')::numeric, NULLIF(p_settle_payload->>'split_qris', '')::numeric, 0.00);
    v_nominal_transfer := COALESCE(NULLIF(p_settle_payload->>'nominal_transfer', '')::numeric, 0.00);
    v_uang_diterima := COALESCE(NULLIF(p_settle_payload->>'uang_diterima', '')::numeric, 0.00);

    IF v_uang_diterima < 0.00 OR v_nominal_cash < 0.00 OR v_nominal_qris < 0.00 OR v_nominal_transfer < 0.00 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT: Nilai tender pembayaran tidak boleh negatif.';
    END IF;

    -- Normalisasi Tender dan Hitung Kembalian
    IF v_metode_bayar = 'SPLIT' THEN
        IF (v_nominal_cash + v_nominal_qris + v_nominal_transfer) < v_final_total THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Jumlah alokasi tunai dan digital kurang dari total tagihan.';
        END IF;
        IF v_uang_diterima < v_nominal_cash THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Uang tunai yang diserahkan kurang dari alokasi tunai.';
        END IF;
        v_kembalian := v_uang_diterima - v_nominal_cash;
        v_nominal_bayar := v_final_total;
    ELSIF v_is_cash THEN
        IF v_uang_diterima < v_final_total THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Uang yang diterima (%) kurang dari total tagihan (%).',
                v_uang_diterima, v_final_total;
        END IF;
        v_nominal_cash := v_final_total;
        v_nominal_bayar := v_final_total;
        v_kembalian := v_uang_diterima - v_final_total;
    ELSE
        v_nominal_bayar := v_final_total;
        IF v_metode_bayar = 'QRIS' THEN
            v_nominal_qris := v_final_total;
        ELSE
            v_nominal_transfer := v_final_total;
        END IF;
        v_uang_diterima := v_final_total;
        v_kembalian := 0.00;
    END IF;

    -- Hitung Fingerprint Seluruh Input Relevan Secara Terstruktur (Canonical JSONB)
    v_canonical_settle_payload := jsonb_build_object(
        'tenant_id', p_tenant_id,
        'id_struk', v_id_struk,
        'branch_id', v_effective_branch_id,
        'metode_bayar', v_metode_bayar,
        'final_total', ROUND(v_final_total, 2),
        'uang_diterima', ROUND(v_uang_diterima, 2),
        'nominal_cash', ROUND(v_nominal_cash, 2),
        'nominal_qris', ROUND(v_nominal_qris, 2),
        'nominal_transfer', ROUND(v_nominal_transfer, 2),
        'surcharge_nominal', ROUND(v_surcharge_nominal, 2),
        'surcharge_keterangan', COALESCE(v_surcharge_keterangan, ''),
        'idempotency_key', v_idempotency_key
    );
    v_current_settle_fingerprint := md5(v_canonical_settle_payload::text);

    -- 6. Evaluasi Status & Idempotensi
    IF v_struk.status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
        IF v_struk.settle_hash IS NOT NULL AND v_struk.settle_hash = v_current_settle_fingerprint THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'status', 'ALREADY_COMPLETED',
                'id_struk', v_id_struk,
                'total_tagihan', v_struk.total_tagihan,
                'nominal_bayar', v_struk.nominal_bayar,
                'uang_diterima', v_struk.uang_diterima,
                'kembalian', v_struk.kembalian,
                'biaya_inap', v_struk.biaya_inap,
                'idempotency_key', v_struk.idempotency_key,
                'settle_hash', v_struk.settle_hash,
                'cogs_status', COALESCE(v_struk.total_cogs::text, 'UNKNOWN'),
                'was_replayed', TRUE,
                'message', 'Tagihan sudah diselesaikan sebelumnya, mutasi tidak diulang.'
            );
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Tagihan "%" telah dilunasi dengan payload transaksi yang berbeda.', v_id_struk USING ERRCODE = '40900';
        END IF;
    END IF;

    IF v_struk.status_bayar = 'Batal' THEN
        RAISE EXCEPTION 'BILL_CANCELLED: Tagihan "%" telah dibatalkan dan tidak dapat dilunasi.', v_id_struk USING ERRCODE = '42501';
    END IF;

    IF v_struk.status_bayar <> 'Pending' THEN
        RAISE EXCEPTION 'INVALID_BILL_STATUS: Tagihan "%" dalam status "%", tidak dapat dilunasi.', v_id_struk, v_struk.status_bayar;
    END IF;

    -- 8. Penanganan Nilai HPP Asal: Membedakan NULL (Historis Tidak Diketahui) vs 0.00 (Biaya Nol)
    IF v_struk.total_cogs IS NULL THEN
        -- Kasus Data Historis: Periksa catatan mutasi persediaan di barang_keluar HANYA dari snapshot biaya asal
        -- DILARANG fallback ke harga master terbaru (stok_barang.harga_beli) agar tidak mendistorsi pembukuan historis
        SELECT 
            COALESCE(SUM(
                COALESCE(bk.total_biaya, bk.jumlah_keluar * bk.biaya_satuan)
            ), 0.00),
            COALESCE(BOOL_OR(bk.total_biaya IS NULL AND bk.biaya_satuan IS NULL), FALSE)
        INTO v_total_cogs, v_cogs_incomplete
        FROM public.barang_keluar bk
        WHERE bk.tenant_id = p_tenant_id
          AND (
              bk.id_struk = v_id_struk
              OR (
                  v_id_struk IS NOT NULL AND v_id_struk <> '' AND (
                      bk.keterangan ~* ('(^|[^a-zA-Z0-9_-])Struk:\s*' || regexp_replace(v_id_struk, '([^a-zA-Z0-9])', '\\\1', 'g') || '($|[^a-zA-Z0-9_-])')
                      OR
                      bk.alasan ~* ('(^|[^a-zA-Z0-9_-])Struk:\s*' || regexp_replace(v_id_struk, '([^a-zA-Z0-9])', '\\\1', 'g') || '($|[^a-zA-Z0-9_-])')
                  )
              )
          );

        IF v_cogs_incomplete IS TRUE OR v_total_cogs IS NULL OR v_total_cogs <= 0.00 THEN
            -- Jika catatan biaya asal tidak lengkap atau tidak ada, tandai sebagai belum diketahui (pertahankan NULL!)
            v_cogs_status := 'HISTORICAL_UNKNOWN';
            v_total_cogs := NULL;
        ELSE
            v_cogs_status := 'HISTORICAL_RESOLVED';
        END IF;
    ELSIF v_struk.total_cogs = 0.00 THEN
        v_cogs_status := 'ZERO_COST';
        v_total_cogs := 0.00;
    ELSE
        v_cogs_status := 'SNAPSHOT_RECORDED';
        v_total_cogs := v_struk.total_cogs;
    END IF;

    -- 8B. Validasi Pra-Mutasi Konfigurasi Bagan Akun (COA) Terstruktur (Finding 2 & Finding 4)
    -- Ambil seluruh akun COA yang berelasi dan total rincian layanan
    SELECT id INTO v_coa_kas FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;

    SELECT id INTO v_coa_bank FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '1102' LIMIT 1;

    SELECT id INTO v_coa_inv FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '1103' LIMIT 1;

    SELECT id INTO v_coa_rev_cw FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '4101' LIMIT 1;

    SELECT id INTO v_coa_rev_cafe FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '4102' LIMIT 1;

    SELECT id INTO v_coa_rev_inap FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '4103' LIMIT 1;

    SELECT id INTO v_coa_cogs FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '5101' LIMIT 1;

    SELECT id INTO v_coa_disc FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun IN ('4104', '4201') LIMIT 1;

    SELECT id INTO v_coa_tax FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun IN ('2102', '2103') LIMIT 1;

    IF v_coa_tax IS NULL THEN
        SELECT id INTO v_coa_tax FROM public.chart_of_accounts
        WHERE tenant_id = p_tenant_id AND kode_akun = '2101' LIMIT 1;
    END IF;

    SELECT COALESCE(SUM(harga), 0.00) INTO v_total_carwash
    FROM public.carwash WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    SELECT COALESCE(SUM(subtotal), 0.00) INTO v_total_cafe
    FROM public.cafe WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    -- Validasi 1: Akun Pembayaran (Kas / Bank) - Tanpa Fallback Kas untuk Pembayaran Digital
    IF (v_nominal_cash > 0.00 OR v_is_cash) AND v_coa_kas IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun kas (1101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
    END IF;
    IF ((v_nominal_qris + v_nominal_transfer) > 0.00 OR (NOT v_is_cash AND v_metode_bayar <> 'SPLIT')) AND v_coa_bank IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun bank (1102) belum dikonfigurasi pada bagan akun (COA) untuk pembayaran digital.' USING ERRCODE = '28000';
    END IF;

    -- Validasi 2: Akun Pendapatan
    IF v_total_carwash > 0.00 AND v_coa_rev_cw IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun pendapatan carwash (4101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
    END IF;
    IF v_total_cafe > 0.00 AND v_coa_rev_cafe IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun pendapatan cafe (4102) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
    END IF;
    IF v_surcharge_nominal > 0.00 AND COALESCE(v_coa_rev_inap, v_coa_rev_cw) IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun pendapatan biaya inap (4103/4101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
    END IF;

    -- Validasi 3: Akun HPP & Persediaan (hanya jika ada HPP yang perlu dibukukan)
    IF v_total_cogs IS NOT NULL AND v_total_cogs > 0.00 AND v_cogs_status IN ('SNAPSHOT_RECORDED', 'HISTORICAL_RESOLVED') THEN
        IF v_coa_cogs IS NULL OR v_coa_inv IS NULL THEN
            RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun HPP (5101) atau Persediaan (1103) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
        END IF;
    END IF;

    -- Validasi 4: Komponen Diskon & Pajak Tersimpan sebagai Sumber Otoritatif Tunggal
    v_item_subtotal := v_total_carwash + v_total_cafe;

    -- Ekstraksi diskon dan pajak tersimpan langsung dari header struk (Struk Tersimpan adalah Sumber Otoritatif Tunggal)
    v_discount := COALESCE(
        v_struk.diskon,
        (COALESCE(v_struk.diskon_cafe, 0.00) + COALESCE(v_struk.diskon_carwash, 0.00)),
        0.00
    );
    IF v_discount < 0.00 THEN v_discount := 0.00; END IF;

    v_tax := COALESCE(
        v_struk.pajak,
        0.00
    );
    IF v_tax < 0.00 THEN v_tax := 0.00; END IF;

    -- Fallback struk historis tanpa metadata terpisah
    IF v_discount = 0.00 AND v_tax = 0.00 THEN
        IF v_item_subtotal > v_base_total THEN
            v_discount := v_item_subtotal - v_base_total;
        ELSIF v_base_total > v_item_subtotal THEN
            v_tax := v_base_total - v_item_subtotal;
        END IF;
    ELSIF v_discount > 0.00 AND v_tax = 0.00 AND v_base_total > (v_item_subtotal - v_discount) THEN
        v_tax := v_base_total - (v_item_subtotal - v_discount);
    ELSIF v_tax > 0.00 AND v_discount = 0.00 AND (v_item_subtotal + v_tax) > v_base_total THEN
        v_discount := (v_item_subtotal + v_tax) - v_base_total;
    END IF;

    -- Rekonsiliasi batas presisi sen terhadap base_total
    IF v_base_total > (v_item_subtotal - v_discount + v_tax) THEN
        v_tax := v_tax + (v_base_total - (v_item_subtotal - v_discount + v_tax));
    ELSIF (v_item_subtotal - v_discount + v_tax) > v_base_total THEN
        v_discount := v_discount + ((v_item_subtotal - v_discount + v_tax) - v_base_total);
    END IF;

    -- Penegakan Keamanan: Tolak manipulasi diskon atau pajak melalui request payload pelunasan
    IF (p_settle_payload ? 'diskon' AND NULLIF(p_settle_payload->>'diskon', '')::numeric IS DISTINCT FROM v_discount) THEN
        RAISE EXCEPTION 'PRICE_MODIFICATION_FORBIDDEN: Nilai diskon pada pelunasan tidak boleh diubah dari nilai struk tersimpan (tersimpan: %, dikirim: %).' , v_discount, p_settle_payload->>'diskon' USING ERRCODE = '42501';
    END IF;

    IF (p_settle_payload ? 'pajak' AND NULLIF(p_settle_payload->>'pajak', '')::numeric IS DISTINCT FROM v_tax) THEN
        RAISE EXCEPTION 'PRICE_MODIFICATION_FORBIDDEN: Nilai pajak pada pelunasan tidak boleh diubah dari nilai struk tersimpan (tersimpan: %, dikirim: %).' , v_tax, p_settle_payload->>'pajak' USING ERRCODE = '42501';
    END IF;

    IF v_tax > 0.00 AND v_coa_tax IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun kewajiban/utang pajak (2102/2101) belum dikonfigurasi pada bagan akun (COA) untuk komponen tambahan tagihan.' USING ERRCODE = '28000';
    END IF;

    -- 9. Pembaruan Header Struk Lunas (Zero Double Stock Deduction)
    UPDATE public.struk
    SET status_bayar = 'Selesai',
        status_pembayaran = 'Selesai',
        metode_bayar = v_metode_bayar,
        metode_pembayaran = v_metode_bayar,
        total_tagihan = v_final_total,
        total = v_final_total,
        total_biaya = v_final_total,
        nominal_bayar = v_nominal_bayar,
        bayar = v_nominal_bayar,
        nominal_cash = v_nominal_cash,
        nominal_qris = v_nominal_qris,
        nominal_transfer = v_nominal_transfer,
        uang_diterima = v_uang_diterima,
        kembalian = v_kembalian,
        biaya_inap = v_surcharge_nominal,
        catatan_inap = CASE WHEN v_surcharge_nominal > 0 THEN v_surcharge_keterangan ELSE NULL END,
        idempotency_key = v_idempotency_key,
        settle_hash = v_current_settle_fingerprint,
        total_cogs = v_total_cogs,
        cogs_status = v_cogs_status,
        waktu_dibayar = NOW(),
        updated_at = NOW()
    WHERE id = v_struk.id AND tenant_id = p_tenant_id;

    -- 10. Pembaruan Status Rincian Carwash & Cafe Menjadi Selesai
    UPDATE public.carwash
    SET status = 'Selesai'
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    UPDATE public.cafe
    SET status = 'Selesai'
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    -- 11. Pencatatan Mutasi Kas Masuk ke Buku Kas (cashflow) Terstruktur
    IF v_metode_bayar = 'SPLIT' THEN
        -- Alokasi Tunai ke SALDO CASH
        IF v_nominal_cash > 0.00 THEN
            INSERT INTO public.cashflow (
                id, tenant_id, branch_id, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                pos, apakah_stok, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-SETTLE-CASH-' || v_id_struk, CURRENT_DATE,
                'Pelunasan POS (Tunai Split) Struk: ' || v_id_struk || ' (' || COALESCE(v_struk.nama_pelanggan, 'Umum') || ')',
                'Pemasukan', 'Pendapatan Kasir', v_nominal_cash, 0.00,
                'SALDO CASH', FALSE, NOW()
            );
        END IF;

        -- Alokasi Digital (QRIS / Transfer) ke SALDO REKENING (N)
        IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
            INSERT INTO public.cashflow (
                id, tenant_id, branch_id, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                pos, apakah_stok, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-SETTLE-DIGITAL-' || v_id_struk, CURRENT_DATE,
                'Pelunasan POS (Digital Split) Struk: ' || v_id_struk || ' (' || COALESCE(v_struk.nama_pelanggan, 'Umum') || ')',
                'Pemasukan', 'Pendapatan Kasir', (v_nominal_qris + v_nominal_transfer), 0.00,
                'SALDO REKENING (N)', FALSE, NOW()
            );
        END IF;
    ELSE
        v_pos := CASE
            WHEN v_metode_bayar IN ('CASH', 'TUNAI') THEN 'SALDO CASH'
            ELSE 'SALDO REKENING (N)'
        END;

        INSERT INTO public.cashflow (
            id, tenant_id, branch_id, id_sumber, tanggal,
            keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
            pos, apakah_stok, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-SETTLE-' || v_id_struk, CURRENT_DATE,
            'Pelunasan POS Struk: ' || v_id_struk || ' (' || COALESCE(v_struk.nama_pelanggan, 'Umum') || ')',
            'Pemasukan', 'Pendapatan Kasir', v_final_total, 0.00,
            v_pos, FALSE, NOW()
        );
    END IF;

    -- 12. Double-Entry General Ledger Auto-Posting
    -- Gunakan komponen diskon dan pajak tersimpan yang tervalidasi dari langkah 8B
    v_journal_id := gen_random_uuid();

    INSERT INTO public.journal_entries (
        id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
    ) VALUES (
        v_journal_id, p_tenant_id, v_effective_branch_id, 'JE-SETTLE-' || v_id_struk, CURRENT_DATE,
        'Auto-journal Pelunasan POS: ' || v_id_struk || CASE WHEN v_cogs_status = 'HISTORICAL_UNKNOWN' THEN ' (HPP historis tidak diketahui)' ELSE '' END,
        v_final_total, 'DRAFT', NOW()
    );

    -- A. Sisi Debit (Penerimaan Kas / Bank)
    IF v_metode_bayar = 'SPLIT' THEN
        IF v_nominal_cash > 0.00 THEN
            INSERT INTO public.journal_entry_lines (
                id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_kas,
                v_nominal_cash, 0.00, 'Penerimaan Tunai Split POS ' || v_id_struk, NOW()
            );
        END IF;
        IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
            INSERT INTO public.journal_entry_lines (
                id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
                (v_nominal_qris + v_nominal_transfer), 0.00, 'Penerimaan Digital Split POS ' || v_id_struk, NOW()
            );
        END IF;
    ELSIF v_is_cash THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_kas,
            v_final_total, 0.00, 'Penerimaan Tunai POS ' || v_id_struk, NOW()
        );
    ELSE
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
            v_final_total, 0.00, 'Penerimaan Digital POS ' || v_id_struk, NOW()
        );
    END IF;

    -- A2. Sisi Debit Diskon (Jika akun potongan penjualan 4104 tersedia)
    IF v_discount > 0.00 AND v_coa_disc IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_disc,
            v_discount, 0.00, 'Potongan Penjualan POS ' || v_id_struk, NOW()
        );
    END IF;

    -- B. Sisi Kredit (Pendapatan Usaha)
    -- Jika tidak ada akun potongan terpisah, alokasikan diskon langsung mengurangi pos pendapatan (Net Revenue method)
    IF v_discount > 0.00 AND v_coa_disc IS NULL THEN
        IF v_item_subtotal > 0.00 THEN
            v_net_cw := ROUND(v_total_carwash - (v_discount * (v_total_carwash / v_item_subtotal)), 2);
            v_net_cafe := (v_item_subtotal - v_discount) - v_net_cw;
        ELSE
            v_net_cw := 0.00;
            v_net_cafe := 0.00;
        END IF;
    ELSE
        v_net_cw := v_total_carwash;
        v_net_cafe := v_total_cafe;
    END IF;

    IF v_net_cw > 0.00 AND v_coa_rev_cw IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cw,
            0.00, v_net_cw, 'Pendapatan Layanan Carwash ' || v_id_struk, NOW()
        );
    END IF;

    -- Kredit Biaya Inap Kendaraan (Surcharge) dialokasikan ke 4103 atau fallback 4101 (BUKAN ke cafe 4102)
    IF v_surcharge_nominal > 0.00 THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id,
            COALESCE(v_coa_rev_inap, v_coa_rev_cw),
            0.00, v_surcharge_nominal, 'Pendapatan Jasa Inap Kendaraan ' || v_id_struk, NOW()
        );
    END IF;

    -- Kredit Cafe
    IF v_net_cafe > 0.00 AND v_coa_rev_cafe IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cafe,
            0.00, v_net_cafe, 'Pendapatan Cafe ' || v_id_struk, NOW()
        );
    END IF;

    -- B2. Sisi Kredit Pajak & Kewajiban Komponen Tambahan (Finding 5 & Kasus Pajak+Diskon Bersamaan)
    IF v_tax > 0.00 AND v_coa_tax IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_tax,
            0.00, v_tax, 'Pajak & Kewajiban Komponen Tambahan POS ' || v_id_struk, NOW()
        );
    END IF;

    -- C. Jurnal HPP & Persediaan (Hanya jika snapshot HPP > 0 dan status valid)
    IF v_total_cogs IS NOT NULL AND v_total_cogs > 0.00 AND v_cogs_status IN ('SNAPSHOT_RECORDED', 'HISTORICAL_RESOLVED')
       AND v_coa_cogs IS NOT NULL AND v_coa_inv IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES
            (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_cogs, v_total_cogs, 0.00, 'HPP Bahan Baku POS ' || v_id_struk, NOW()),
            (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_inv, 0.00, v_total_cogs, 'Pengurangan Persediaan POS ' || v_id_struk, NOW());
    END IF;

    -- Finalisasi Jurnal: Ubah Status Menjadi POSTED
    UPDATE public.journal_entries
    SET status = 'POSTED'
    WHERE id = v_journal_id AND tenant_id = p_tenant_id;

    -- 13. Kembalikan Hasil Sukses
    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'COMPLETED',
        'id_struk', v_id_struk,
        'total_tagihan', v_final_total,
        'nominal_bayar', v_nominal_bayar,
        'uang_diterima', v_uang_diterima,
        'kembalian', v_kembalian,
        'biaya_inap', v_surcharge_nominal,
        'total_cogs', v_total_cogs,
        'cogs_status', v_cogs_status,
        'idempotency_key', v_idempotency_key,
        'settle_hash', v_current_settle_fingerprint,
        'was_replayed', FALSE
    );
END;
$function$;

-- Patched RPC: fn_void_or_cancel_receipt
CREATE OR REPLACE FUNCTION public.fn_void_or_cancel_receipt(p_tenant_id uuid, p_id_struk text, p_reason text DEFAULT 'Dibatalkan oleh Kasir/Owner'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;

    v_clean_id TEXT := TRIM(COALESCE(p_id_struk, ''));
    v_struk RECORD;
    v_was_paid BOOLEAN;
    v_bk RECORD;
    v_cf RECORD;
    v_orig_je RECORD;
    v_rev_je_id UUID;
    v_line RECORD;
    v_restored_items INT := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles WHERE id = v_caller_id;

    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Keanggotaan aktif diperlukan.' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;
    IF v_caller_role NOT IN ('super admin', 'owner', 'admin pusat', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan membatalkan transaksi.' USING ERRCODE = '42501';
    END IF;
    IF v_clean_id = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: ID Struk wajib diisi.' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(('x' || substr(md5('void:' || p_tenant_id::text || ':' || v_clean_id), 1, 15))::bit(64)::bigint);

    SELECT *
    INTO v_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_clean_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RECEIPT_NOT_FOUND: Struk "%" tidak ditemukan.', v_clean_id USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role IN ('kasir', 'admin') AND v_caller_branch IS NOT NULL AND v_struk.branch_id IS DISTINCT FROM v_caller_branch THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Kasir tidak diizinkan membatalkan struk cabang lain.' USING ERRCODE = '42501';
    END IF;

    IF UPPER(TRIM(COALESCE(v_struk.status_bayar, ''))) = 'BATAL' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'ALREADY_CANCELLED',
            'id_struk', v_clean_id,
            'was_replayed', TRUE
        );
    END IF;

    v_was_paid := UPPER(TRIM(COALESCE(v_struk.status_bayar, ''))) IN ('SELESAI', 'PAID', 'LUNAS');

    -- 1. Restore inventory from barang_keluar
    FOR v_bk IN
        SELECT id, id_bahan_baku, id_barang, jumlah_keluar
        FROM public.barang_keluar
        WHERE tenant_id = p_tenant_id
          AND (
              id_struk = v_clean_id
              OR keterangan LIKE '%Struk: ' || v_clean_id || '%'
          )
    LOOP
        IF v_bk.id_bahan_baku IS NOT NULL AND COALESCE(v_bk.jumlah_keluar, 0) > 0 THEN
            UPDATE public.stok_barang
            SET stok = COALESCE(stok, 0) + v_bk.jumlah_keluar,
                stok_akhir = COALESCE(stok_akhir, stok, 0) + v_bk.jumlah_keluar,
                updated_at = NOW()
            WHERE id = v_bk.id_bahan_baku AND tenant_id = p_tenant_id;
            v_restored_items := v_restored_items + 1;
        END IF;
    END LOOP;

    -- 2. Mark struk, cafe, and carwash (zeroing commission) as Batal
    UPDATE public.struk
    SET status_bayar = 'Batal',
        status_pembayaran = 'Batal',
        catatan = TRIM(BOTH ' | ' FROM COALESCE(catatan, '') || ' | VOID: ' || COALESCE(NULLIF(TRIM(p_reason), ''), 'Dibatalkan')),
        updated_at = NOW()
    WHERE id = v_struk.id AND tenant_id = p_tenant_id;

    UPDATE public.cafe
    SET status = 'Batal'
    WHERE tenant_id = p_tenant_id AND id_struk = v_clean_id;

    UPDATE public.carwash
    SET status = 'Batal',
        gaji_anggota = 0.00,
        gaji_pencuci = 0.00
    WHERE tenant_id = p_tenant_id AND id_struk = v_clean_id;

    -- 3. Reverse Cashflow & General Ledger only if the receipt was previously Paid
    IF v_was_paid THEN
        FOR v_cf IN
            SELECT id_sumber, pocket_id, pos, pemasukan, branch_id
            FROM public.cashflow
            WHERE tenant_id = p_tenant_id
              AND jenis = 'Pemasukan'
              AND COALESCE(pemasukan, 0) > 0
              AND (
                  id_sumber IN (
                      'CF-POS-' || v_clean_id,
                      'CF-POS-CASH-' || v_clean_id,
                      'CF-POS-DIGITAL-' || v_clean_id,
                      'CF-SETTLE-' || v_clean_id,
                      'CF-SETTLE-CASH-' || v_clean_id,
                      'CF-SETTLE-DIGITAL-' || v_clean_id
                  )
              )
        LOOP
            INSERT INTO public.cashflow (
                id, tenant_id, branch_id, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                pocket_id, pos, apakah_stok, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, COALESCE(v_cf.branch_id, v_struk.branch_id),
                'CF-VOID-' || v_cf.id_sumber, CURRENT_DATE,
                'Pembatalan / Void Struk POS: ' || v_clean_id || ' (' || COALESCE(NULLIF(TRIM(p_reason), ''), 'Void') || ')',
                'Pengeluaran', 'Pembatalan / Void POS', 0.00, v_cf.pemasukan,
                v_cf.pocket_id, v_cf.pos, FALSE, NOW()
            );
        END LOOP;

        FOR v_orig_je IN
            SELECT id, branch_id, entry_no, total_amount
            FROM public.journal_entries
            WHERE tenant_id = p_tenant_id
              AND status = 'POSTED'
              AND entry_no IN ('JE-POS-' || v_clean_id, 'JE-SETTLE-' || v_clean_id)
        LOOP
            v_rev_je_id := gen_random_uuid();
            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
            ) VALUES (
                v_rev_je_id, p_tenant_id, COALESCE(v_orig_je.branch_id, v_struk.branch_id),
                'JE-VOID-' || v_orig_je.entry_no, CURRENT_DATE,
                'Reversal / Void ' || v_orig_je.entry_no || ': ' || COALESCE(NULLIF(TRIM(p_reason), ''), 'Dibatalkan'),
                v_orig_je.total_amount, 'DRAFT', NOW()
            );

            FOR v_line IN
                SELECT account_id, debit, credit, memo
                FROM public.journal_entry_lines
                WHERE tenant_id = p_tenant_id AND journal_entry_id = v_orig_je.id
            LOOP
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_rev_je_id, v_line.account_id,
                    v_line.credit, v_line.debit, 'VOID: ' || COALESCE(v_line.memo, v_clean_id), NOW()
                );
            END LOOP;

            UPDATE public.journal_entries
            SET status = 'POSTED'
            WHERE id = v_rev_je_id AND tenant_id = p_tenant_id;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'CANCELLED',
        'id_struk', v_clean_id,
        'was_paid', v_was_paid,
        'restored_stock_items', v_restored_items,
        'was_replayed', FALSE
    );
END;
$function$;

-- Patched RPC: fn_record_stock_purchase
CREATE OR REPLACE FUNCTION public.fn_record_stock_purchase(p_tenant_id uuid, p_branch_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;

    v_item_ref TEXT;
    v_qty NUMERIC(15, 4);
    v_unit_cost NUMERIC(15, 4);
    v_total_cost NUMERIC(15, 2);
    v_tanggal DATE;
    v_pos TEXT;
    v_keterangan TEXT;

    v_stock RECORD;
    v_masuk_id UUID := gen_random_uuid();
    v_cf_id UUID := gen_random_uuid();
    v_journal_id UUID;
    v_coa_inv UUID;
    v_coa_pay UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles WHERE id = v_caller_id;

    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Keanggotaan aktif diperlukan.' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;
    IF v_caller_role NOT IN ('super admin', 'owner', 'admin pusat', 'admin', 'staff kantor') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan mencatat pembelian stok.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.fn_assert_active_tenant_license(p_tenant_id);

    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL OR (v_caller_role IN ('admin', 'staff kantor') AND v_caller_branch IS NOT NULL AND v_effective_branch_id IS DISTINCT FROM v_caller_branch) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang transaksi wajib valid.' USING ERRCODE = '42501';
    END IF;

    v_item_ref := TRIM(COALESCE(p_payload->>'id_bahan_baku', p_payload->>'id_barang', ''));
    v_qty := COALESCE(NULLIF(p_payload->>'jumlah_masuk', '')::numeric, 0);
    v_unit_cost := COALESCE(NULLIF(p_payload->>'harga_satuan', '')::numeric, NULLIF(p_payload->>'harga_beli', '')::numeric, 0);
    v_total_cost := COALESCE(NULLIF(p_payload->>'total_biaya', '')::numeric, ROUND(v_qty * v_unit_cost, 2));
    v_tanggal := COALESCE(NULLIF(p_payload->>'tanggal', '')::date, CURRENT_DATE);
    v_pos := COALESCE(NULLIF(TRIM(p_payload->>'pos'), ''), 'SALDO CASH');
    v_keterangan := COALESCE(NULLIF(TRIM(p_payload->>'keterangan'), ''), 'Pembelian Stok');

    IF v_item_ref = '' OR v_qty <= 0 OR v_unit_cost < 0 OR v_total_cost < 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Item, jumlah (> 0), dan harga (>= 0) wajib valid.' USING ERRCODE = '22023';
    END IF;

    SELECT id, id_barang, COALESCE(nama_produk, nama_barang) AS nama_item
    INTO v_stock
    FROM public.stok_barang
    WHERE tenant_id = p_tenant_id
      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
      AND (
          id::text = v_item_ref
          OR LOWER(TRIM(COALESCE(id_barang, ''))) = LOWER(v_item_ref)
          OR LOWER(TRIM(COALESCE(id_bahan_baku, ''))) = LOWER(v_item_ref)
      )
    ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STOCK_ITEM_NOT_FOUND: Item stok "%" tidak ditemukan.', v_item_ref USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.barang_masuk (
        id, tenant_id, branch_id, id_bahan_baku, id_barang, nama_barang, nama_produk, nama_bahan_baku,
        tanggal, jumlah_masuk, harga_beli, harga_satuan, total_biaya, total_harga, id_cashflow, created_at
    ) VALUES (
        v_masuk_id, p_tenant_id, v_effective_branch_id, v_stock.id, COALESCE(v_stock.id_barang, v_stock.id::text),
        v_stock.nama_item, v_stock.nama_item, v_stock.nama_item,
        v_tanggal, v_qty, v_unit_cost, v_unit_cost, v_total_cost, v_total_cost, v_cf_id::text, NOW()
    );

    INSERT INTO public.cashflow (
        id, tenant_id, branch_id, id_sumber, tanggal,
        keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
        pos, apakah_stok, id_bahan_baku, qty, created_at
    ) VALUES (
        v_cf_id, p_tenant_id, v_effective_branch_id, 'CF-IN-' || v_masuk_id::text, v_tanggal,
        v_keterangan || ': ' || v_stock.nama_item,
        'Pengeluaran', 'Pembelian Stok', 0.00, v_total_cost,
        v_pos, TRUE, v_stock.id, v_qty, NOW()
    );

    IF v_total_cost > 0 THEN
        SELECT id INTO v_coa_inv FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1103' LIMIT 1;
        IF v_pos ILIKE '%CASH%' THEN
            SELECT id INTO v_coa_pay FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;
        ELSE
            SELECT id INTO v_coa_pay FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1102' LIMIT 1;
        END IF;

        IF v_coa_inv IS NOT NULL AND v_coa_pay IS NOT NULL THEN
            v_journal_id := gen_random_uuid();
            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
            ) VALUES (
                v_journal_id, p_tenant_id, v_effective_branch_id, 'JE-IN-' || substr(v_masuk_id::text, 1, 8), v_tanggal,
                'Pembelian Stok: ' || v_stock.nama_item, v_total_cost, 'DRAFT', NOW()
            );

            INSERT INTO public.journal_entry_lines (
                id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
            ) VALUES
                (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_inv, v_total_cost, 0.00, 'Penambahan Persediaan ' || v_stock.nama_item, NOW()),
                (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_pay, 0.00, v_total_cost, 'Pembayaran Stok ' || v_stock.nama_item, NOW());

            UPDATE public.journal_entries SET status = 'POSTED' WHERE id = v_journal_id AND tenant_id = p_tenant_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'barang_masuk_id', v_masuk_id,
        'cashflow_id', v_cf_id,
        'stock_id', v_stock.id,
        'total_cost', v_total_cost
    );
END;
$function$;

COMMIT;
