-- ==============================================================================
-- MIGRATION: 20261107000004_qa_hardening_profile_role_and_secdef_lockdown.sql
-- Purpose:
--   1. Fix P0 Privilege Containment Bypass: Normalize legacy lowercase roles in
--      public.profiles, enforce canonical role CHECK constraint, make
--      public.current_user_role() case-normalizing, and make
--      public.fn_protect_profile_role_and_tenant() fail-closed (whitelist).
--   2. Fix P2 Supabase Security Advisor Warnings:
--      - Revoke anon EXECUTE on all SECURITY DEFINER helper & trigger functions (0028)
--      - Set explicit search_path on all 28 mutable public functions (0011)
--      - Add explicit Super Admin policy on public.license_keys (0008)
-- ==============================================================================

BEGIN;

-- 1. Temporarily disable trigger on profiles to normalize legacy lowercase role rows
ALTER TABLE public.profiles DISABLE TRIGGER trg_protect_profile_role;

-- Fix known QA fixture Owner A row that had legacy 'superadmin' string
UPDATE public.profiles
SET role = 'Owner', updated_at = NOW()
WHERE id = '99999999-aaaa-4444-aaaa-aaaaaaaaaaaa'
  AND role = 'superadmin';

-- Normalize any remaining lowercase/variant role strings to canonical casing
UPDATE public.profiles
SET role = CASE LOWER(TRIM(role))
    WHEN 'super admin' THEN 'Super Admin'
    WHEN 'superadmin'  THEN 'Super Admin'
    WHEN 'owner'       THEN 'Owner'
    WHEN 'admin'       THEN 'Admin'
    WHEN 'kasir'       THEN 'Kasir'
    WHEN 'staff kantor' THEN 'Staff Kantor'
    WHEN 'karyawan cuci' THEN 'Karyawan Cuci'
    ELSE 'Kasir'
END,
updated_at = NOW()
WHERE role NOT IN ('Super Admin', 'Owner', 'Admin', 'Kasir', 'Staff Kantor', 'Karyawan Cuci');

ALTER TABLE public.profiles ENABLE TRIGGER trg_protect_profile_role;

-- Enforce canonical role values at the table constraint level
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_canonical_role;
ALTER TABLE public.profiles
ADD CONSTRAINT chk_profiles_canonical_role
CHECK (role IN ('Super Admin', 'Owner', 'Admin', 'Kasir', 'Staff Kantor', 'Karyawan Cuci'));

-- 2. Harden current_user_role() to always return canonical role casing
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS character varying
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

-- 3. Harden fn_protect_profile_role_and_tenant() with fail-closed whitelist
CREATE OR REPLACE FUNCTION public.fn_protect_profile_role_and_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_uid         UUID;
    v_caller_role        VARCHAR(50);
    v_caller_tenant      UUID;
    v_active_owner_count INT;
BEGIN
    v_caller_uid    := auth.uid();
    v_caller_role   := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();

    -- 1. DELETE PROTECTION
    IF TG_OP = 'DELETE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" tidak diizinkan menghapus profil.', v_caller_role
                USING ERRCODE = '42501';
        END IF;

        IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_DELETE: Owner tidak dapat menghapus profil di luar tenant sendiri.'
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

    -- Validate canonical role on INSERT and UPDATE
    IF NEW.role IS NULL OR NEW.role NOT IN ('Super Admin', 'Owner', 'Admin', 'Kasir', 'Staff Kantor', 'Karyawan Cuci') THEN
        RAISE EXCEPTION 'INVALID_PROFILE_ROLE: Role "%" tidak valid.', COALESCE(NEW.role, 'NULL')
            USING ERRCODE = '23514';
    END IF;

    -- 2. INSERT PROTECTION (Fail-closed whitelist)
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_active IS NULL THEN
            NEW.is_active := TRUE;
        END IF;

        IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" dilarang membuat profil pengguna baru.', v_caller_role
                USING ERRCODE = '42501';
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

    -- 3. UPDATE PROTECTION (Fail-closed whitelist)
    IF TG_OP = 'UPDATE' THEN
        IF OLD.id IS DISTINCT FROM NEW.id THEN
            RAISE EXCEPTION 'FORBIDDEN_ID_MUTATION: ID profil bersifat mutlak immutable.'
                USING ERRCODE = '42501';
        END IF;

        IF NEW.is_active IS NULL THEN
            RAISE EXCEPTION 'INVALID_PROFILE_STATUS: is_active tidak boleh bernilai NULL.'
                USING ERRCODE = '23502';
        END IF;

        -- Fail-closed: ANY caller not in ('Super Admin', 'Owner', 'Admin') can only update their own name
        IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
            IF v_caller_uid IS NULL OR OLD.id <> v_caller_uid THEN
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

        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Role "%" dilarang mengubah role profil (Role saat ini: %).', v_caller_role, OLD.role
                    USING ERRCODE = '42501';
            END IF;

            IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak menetapkan role Super Admin.'
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

        IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_STATUS_MUTATION: Role "%" tidak diizinkan mengubah status aktif profil.', v_caller_role
                    USING ERRCODE = '42501';
            END IF;

            IF OLD.role = 'Owner' AND NEW.is_active IS NOT TRUE THEN
                PERFORM pg_advisory_xact_lock(hashtext('profile_owner_guard:' || OLD.tenant_id::text)::bigint);
                SELECT COUNT(*) INTO v_active_owner_count
                FROM public.profiles
                WHERE tenant_id = OLD.tenant_id
                  AND role = 'Owner'
                  AND is_active = TRUE
                  AND id <> OLD.id;

                IF v_active_owner_count = 0 THEN
                    RAISE EXCEPTION 'LAST_ACTIVE_OWNER_PROTECTED: Tidak dapat menonaktifkan satu-satunya Owner aktif pada tenant ini. Aktifkan Owner lain terlebih dahulu.'
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

-- 4. Revoke anon EXECUTE on all SECURITY DEFINER functions in public (Advisor 0028)
--    and set explicit search_path = public, pg_temp on mutable functions (Advisor 0011)
DO $$
DECLARE
    fn_rec RECORD;
BEGIN
    -- Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions in public
    FOR fn_rec IN
        SELECT p.oid::regprocedure AS fn_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef = TRUE
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon;', fn_rec.fn_sig);
    END LOOP;

    -- Set search_path = public, pg_temp on any function in public that has no proconfig search_path
    FOR fn_rec IN
        SELECT p.oid::regprocedure AS fn_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (p.proconfig IS NULL OR NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
          ))
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', fn_rec.fn_sig);
    END LOOP;
END $$;

-- 5. Add explicit Super Admin policy on public.license_keys (Advisor 0008)
DROP POLICY IF EXISTS license_keys_superadmin_policy ON public.license_keys;
CREATE POLICY license_keys_superadmin_policy ON public.license_keys
FOR ALL TO authenticated
USING (public.current_user_role() = 'Super Admin')
WITH CHECK (public.current_user_role() = 'Super Admin');

COMMIT;
