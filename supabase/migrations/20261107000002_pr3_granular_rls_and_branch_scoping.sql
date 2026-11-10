-- ==============================================================================
-- MIGRATION 20261107000002: PR-3 — GRANULAR RLS REWRITE & BRANCH SCOPING
-- Branch: feat/access-control-rbac-integrated
-- Fixes & Scope:
--   A. Update context functions (current_tenant_id, current_branch_id) with is_active guard
--   B. Helper functions: fn_has_shared_catalog_access vs fn_has_operational_branch_access
--   C. Safe server-side projections (fn_get_pos_inventory_stock, fn_get_active_carwash_crew)
--   D. Trigger protection on operational branch assignment (anti-NULL bypass)
--   E. Fixed journal immutability (valid UPDATE returns NEW, posted entries immutable)
--   F. Drop broad 'tenant_isolation_policy' on operational tables
--   G. Granular policies per domain, role, and branch scoping
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- A. CONTEXT FUNCTIONS WITH ACTIVE PROFILE GUARD
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT tenant_id 
    FROM public.profiles 
    WHERE id = auth.uid() AND is_active = TRUE 
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT branch_id 
    FROM public.profiles 
    WHERE id = auth.uid() AND is_active = TRUE 
    LIMIT 1;
$$;

-- Helper check for SHARED CATALOG access (Menu, Carwash Packages, Diskon, Metode Bayar, Master Categories):
-- - Super Admin: unrestricted
-- - Owner / Admin: access all catalogs within tenant
-- - Kasir / Staff / Kru: assigned branch or shared catalog (branch_id IS NULL)
CREATE OR REPLACE FUNCTION public.fn_has_shared_catalog_access(p_tenant_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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

    IF v_role IN ('Owner', 'Admin') THEN
        RETURN TRUE;
    END IF;

    v_branch := public.current_branch_id();
    IF p_branch_id IS NULL OR p_branch_id = v_branch THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- Helper check for OPERATIONAL DATA access (Struk, Cafe, Carwash, Pengeluaran, Stok, CRM Logs):
-- - Super Admin: unrestricted
-- - Owner / Admin: access all branches within tenant
-- - Kasir / Staff / Kru: strictly assigned branch; NULL branch is REJECTED for operational rows!
CREATE OR REPLACE FUNCTION public.fn_has_operational_branch_access(p_tenant_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
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

    IF v_role IN ('Owner', 'Admin') THEN
        RETURN TRUE;
    END IF;

    -- Non-management (Kasir, Staff Kantor, Karyawan Cuci):
    -- Operational rows MUST have a non-null branch matching the user's assigned branch.
    v_branch := public.current_branch_id();
    IF v_branch IS NOT NULL AND p_branch_id IS NOT NULL AND p_branch_id = v_branch THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- Alias backward compatibility for legacy references
CREATE OR REPLACE FUNCTION public.fn_has_branch_access(p_tenant_id UUID, p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.fn_has_operational_branch_access(p_tenant_id, p_branch_id);
$$;

REVOKE ALL ON FUNCTION public.fn_has_shared_catalog_access(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_shared_catalog_access(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_has_operational_branch_access(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_operational_branch_access(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_has_branch_access(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_branch_access(UUID, UUID) TO authenticated, service_role;

-- ==============================================================================
-- B. OPERATIONAL BRANCH & TENANT MUTATION GUARD TRIGGER
-- Prevents bypassing branch boundaries by mutating branch_id to NULL or to other branches
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_protect_operational_branch_and_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

    -- 1. Operational transactions must have non-null branch_id
    IF NEW.branch_id IS NULL THEN
        RAISE EXCEPTION 'BRANCH_REQUIRED: Transaksi operasional wajib memiliki branch_id yang valid.'
            USING ERRCODE = '23502';
    END IF;

    -- 2. Tenant isolation check
    IF NEW.tenant_id IS DISTINCT FROM v_tenant THEN
        RAISE EXCEPTION 'FORBIDDEN_TENANT_MUTATION: tenant_id tidak sesuai dengan sesi pengguna.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. On INSERT: non-management can only insert into their assigned branch
    IF TG_OP = 'INSERT' THEN
        IF v_role NOT IN ('Owner', 'Admin') AND NEW.branch_id IS DISTINCT FROM v_branch THEN
            RAISE EXCEPTION 'FORBIDDEN_BRANCH_MUTATION: Tidak diizinkan membuat transaksi untuk cabang lain.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 4. On UPDATE: branch_id and tenant_id cannot be moved by non-management
    IF TG_OP = 'UPDATE' THEN
        IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'FORBIDDEN_TENANT_MUTATION: tenant_id transaksi tidak dapat diubah.'
                USING ERRCODE = '42501';
        END IF;

        IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
            IF v_role NOT IN ('Owner', 'Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_BRANCH_MUTATION: Pemindahan cabang transaksi operasional dilarang.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Attach to operational tables
DROP TRIGGER IF EXISTS trg_protect_struk_branch ON public.struk;
CREATE TRIGGER trg_protect_struk_branch
BEFORE INSERT OR UPDATE ON public.struk
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_operational_branch_and_tenant();

DROP TRIGGER IF EXISTS trg_protect_cafe_branch ON public.cafe;
CREATE TRIGGER trg_protect_cafe_branch
BEFORE INSERT OR UPDATE ON public.cafe
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_operational_branch_and_tenant();

DROP TRIGGER IF EXISTS trg_protect_carwash_branch ON public.carwash;
CREATE TRIGGER trg_protect_carwash_branch
BEFORE INSERT OR UPDATE ON public.carwash
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_operational_branch_and_tenant();

DROP TRIGGER IF EXISTS trg_protect_pengeluaran_branch ON public.pengeluaran;
CREATE TRIGGER trg_protect_pengeluaran_branch
BEFORE INSERT OR UPDATE ON public.pengeluaran
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_operational_branch_and_tenant();

-- ==============================================================================
-- C. RECONCILE OPERATIONAL GRANTS & POSTED JOURNAL IMMUTABILITY
-- ==============================================================================
DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY[
        'karyawan_cuci', 'karyawan_kantor', 'chart_of_accounts',
        'cashflow', 'pengeluaran', 'stok_barang', 'daftar_harga_menu',
        'carwash_packages', 'diskon', 'resep', 'master_categories',
        'kasir', 'metode_bayar', 'struk', 'cafe', 'carwash',
        'barang_masuk', 'barang_keluar', 'crm_customers',
        'crm_loyalty_programs'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role;', tbl);
        END IF;
    END LOOP;

    -- crm_loyalty_logs & customer_reward_claims: strictly revoke direct write from authenticated (must go through RPC)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'crm_loyalty_logs' AND c.relkind = 'r') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.crm_loyalty_logs FROM authenticated, anon, PUBLIC;';
        EXECUTE 'GRANT SELECT ON TABLE public.crm_loyalty_logs TO authenticated;';
        EXECUTE 'GRANT ALL ON TABLE public.crm_loyalty_logs TO service_role;';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_reward_claims' AND c.relkind = 'r') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.customer_reward_claims FROM authenticated, anon, PUBLIC;';
        EXECUTE 'GRANT SELECT ON TABLE public.customer_reward_claims TO authenticated;';
        EXECUTE 'GRANT ALL ON TABLE public.customer_reward_claims TO service_role;';
    END IF;

    -- journal_entries & lines: strictly revoke UPDATE and DELETE from authenticated
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'journal_entries' AND c.relkind = 'r') THEN
        EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.journal_entries FROM authenticated, anon;';
        EXECUTE 'GRANT SELECT, INSERT ON TABLE public.journal_entries TO authenticated, service_role;';
        EXECUTE 'GRANT UPDATE (status) ON TABLE public.journal_entries TO authenticated;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'journal_entry_lines' AND c.relkind = 'r') THEN
        EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.journal_entry_lines FROM authenticated, anon;';
        EXECUTE 'GRANT SELECT, INSERT ON TABLE public.journal_entry_lines TO authenticated, service_role;';
    END IF;
END $$;

-- Trigger to guard against mutating POSTED journal entries
-- Returns NEW on valid UPDATE (e.g. DRAFT -> POSTED) and OLD on DELETE
CREATE OR REPLACE FUNCTION public.fn_prevent_posted_journal_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.status = 'POSTED' THEN
            RAISE EXCEPTION 'IMMUTABLE_POSTED_JOURNAL: Jurnal berstatus POSTED bersifat immutable dan tidak dapat diubah atau dihapus.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RETURN NEW;
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_journal_mutation ON public.journal_entries;
CREATE TRIGGER trg_prevent_posted_journal_mutation
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_posted_journal_mutation();

-- Guard trigger for journal_entry_lines: cannot mutate if parent journal is POSTED
CREATE OR REPLACE FUNCTION public.fn_prevent_posted_journal_line_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_parent_status VARCHAR(50);
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO v_parent_status FROM public.journal_entries WHERE id = NEW.journal_entry_id;
        IF v_parent_status = 'POSTED' THEN
            RAISE EXCEPTION 'IMMUTABLE_POSTED_JOURNAL: Tidak dapat menambah baris pada jurnal yang sudah berstatus POSTED.'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    ELSIF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT status INTO v_parent_status FROM public.journal_entries WHERE id = OLD.journal_entry_id;
        IF v_parent_status = 'POSTED' THEN
            RAISE EXCEPTION 'IMMUTABLE_POSTED_JOURNAL: Tidak dapat mengubah atau menghapus baris pada jurnal yang sudah berstatus POSTED.'
                USING ERRCODE = '42501';
        END IF;
        IF TG_OP = 'UPDATE' THEN
            RETURN NEW;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_journal_line_mutation ON public.journal_entry_lines;
CREATE TRIGGER trg_prevent_posted_journal_line_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_posted_journal_line_mutation();

-- ==============================================================================
-- D. SAFE SERVER-SIDE PROJECTIONS
-- ==============================================================================

-- 1. POS Inventory Stock Projection (Hides HPP / cost from Cashier)
CREATE OR REPLACE FUNCTION public.fn_get_pos_inventory_stock(p_branch_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    branch_id UUID,
    nama_produk VARCHAR(255),
    satuan VARCHAR(50),
    stok NUMERIC(18, 4),
    min_stok NUMERIC(18, 4),
    is_active BOOLEAN,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_target_branch UUID;
BEGIN
    v_caller_role   := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();
    v_caller_branch := public.current_branch_id();

    IF v_caller_role = 'Anon' OR v_caller_tenant IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_OR_INACTIVE' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role IN ('Super Admin', 'Owner') THEN
        v_target_branch := p_branch_id;
    ELSE
        v_target_branch := v_caller_branch;
    END IF;

    RETURN QUERY
    SELECT 
        sb.id,
        sb.tenant_id,
        sb.branch_id,
        sb.nama_produk,
        sb.satuan,
        sb.stok,
        sb.min_stok,
        COALESCE(sb.is_active, TRUE),
        sb.updated_at
    FROM public.stok_barang sb
    WHERE sb.tenant_id = v_caller_tenant
      AND (v_target_branch IS NULL OR sb.branch_id = v_target_branch);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_pos_inventory_stock(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_pos_inventory_stock(UUID) TO authenticated, service_role;

-- 2. Carwash Crew Projection (Provides crew names to POS without leaking payroll/salary)
CREATE OR REPLACE FUNCTION public.fn_get_active_carwash_crew(p_branch_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    branch_id UUID,
    nama VARCHAR(100),
    is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_role TEXT;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_target_branch UUID;
BEGIN
    v_caller_role   := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();
    v_caller_branch := public.current_branch_id();

    IF v_caller_role = 'Anon' OR v_caller_tenant IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_OR_INACTIVE' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role IN ('Super Admin', 'Owner') THEN
        v_target_branch := p_branch_id;
    ELSE
        v_target_branch := v_caller_branch;
    END IF;

    RETURN QUERY
    SELECT 
        kc.id,
        kc.tenant_id,
        kc.branch_id,
        kc.nama,
        kc.is_active
    FROM public.karyawan_cuci kc
    WHERE kc.tenant_id = v_caller_tenant
      AND kc.is_active = TRUE
      AND (v_target_branch IS NULL OR kc.branch_id = v_target_branch OR kc.branch_id IS NULL)
    ORDER BY kc.nama ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_active_carwash_crew(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_active_carwash_crew(UUID) TO authenticated, service_role;

-- ==============================================================================
-- E. DROP BROAD 'tenant_isolation_policy' FROM ALL OPERATIONAL TABLES
-- ==============================================================================
DO $$
DECLARE
    tbl TEXT;
    all_tables TEXT[] := ARRAY[
        'pos_balances', 'chart_of_accounts', 'master_categories', 'journal_entries',
        'journal_entry_lines', 'stok_barang', 'daftar_harga_menu', 'resep',
        'carwash_packages', 'diskon', 'kasir', 'metode_bayar', 'struk', 'carwash', 'cafe',
        'barang_keluar', 'barang_masuk', 'cashflow', 'pengeluaran',
        'karyawan_cuci', 'karyawan_kantor', 'crm_customers', 'crm_loyalty_programs',
        'crm_loyalty_logs', 'customer_reward_claims', 'intelligence_daily_snapshots'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I;', tbl);
    END LOOP;
END $$;

-- ==============================================================================
-- F. GRANULAR RLS POLICIES PER DOMAIN
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- F.1. FINANCIAL CORE & GENERAL LEDGER (chart_of_accounts, journal_entries, lines)
-- Kasir and Staff have 0 rows visibility
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS coa_select_policy ON public.chart_of_accounts;
CREATE POLICY coa_select_policy ON public.chart_of_accounts
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner')
);

DROP POLICY IF EXISTS coa_insert_policy ON public.chart_of_accounts;
CREATE POLICY coa_insert_policy ON public.chart_of_accounts
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner')
);

DROP POLICY IF EXISTS coa_update_policy ON public.chart_of_accounts;
CREATE POLICY coa_update_policy ON public.chart_of_accounts
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner')
);

DROP POLICY IF EXISTS coa_delete_policy ON public.chart_of_accounts;
CREATE POLICY coa_delete_policy ON public.chart_of_accounts
FOR DELETE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner')
);

-- journal_entries
DROP POLICY IF EXISTS je_select_policy ON public.journal_entries;
CREATE POLICY je_select_policy ON public.journal_entries
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner')
);

DROP POLICY IF EXISTS je_insert_policy ON public.journal_entries;
CREATE POLICY je_insert_policy ON public.journal_entries
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- journal_entry_lines
DROP POLICY IF EXISTS jel_select_policy ON public.journal_entry_lines;
CREATE POLICY jel_select_policy ON public.journal_entry_lines
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner')
);

DROP POLICY IF EXISTS jel_insert_policy ON public.journal_entry_lines;
CREATE POLICY jel_insert_policy ON public.journal_entry_lines
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- ------------------------------------------------------------------------------
-- F.2. BALANCES & ARUS KAS (pos_balances, cashflow, intelligence_daily_snapshots)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS pos_balances_select_policy ON public.pos_balances;
CREATE POLICY pos_balances_select_policy ON public.pos_balances
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS pos_balances_write_policy ON public.pos_balances;
CREATE POLICY pos_balances_write_policy ON public.pos_balances
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS cashflow_select_policy ON public.cashflow;
CREATE POLICY cashflow_select_policy ON public.cashflow
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS cashflow_write_policy ON public.cashflow;
CREATE POLICY cashflow_write_policy ON public.cashflow
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS snapshots_select_policy ON public.intelligence_daily_snapshots;
CREATE POLICY snapshots_select_policy ON public.intelligence_daily_snapshots
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- ------------------------------------------------------------------------------
-- F.3. PENGELUARAN (Management all branches; Kasir own branch only)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS pengeluaran_select_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_select_policy ON public.pengeluaran
FOR SELECT TO authenticated
USING (public.fn_has_operational_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS pengeluaran_insert_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_insert_policy ON public.pengeluaran
FOR INSERT TO authenticated
WITH CHECK (public.fn_has_operational_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS pengeluaran_update_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_update_policy ON public.pengeluaran
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS pengeluaran_delete_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_delete_policy ON public.pengeluaran
FOR DELETE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- ------------------------------------------------------------------------------
-- F.4. SDM & PAYROLL (karyawan_cuci, karyawan_kantor)
-- Zero leakage to Kasir; Kasir uses fn_get_active_carwash_crew()
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS karyawan_cuci_select_policy ON public.karyawan_cuci;
CREATE POLICY karyawan_cuci_select_policy ON public.karyawan_cuci
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS karyawan_cuci_write_policy ON public.karyawan_cuci;
CREATE POLICY karyawan_cuci_write_policy ON public.karyawan_cuci
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS karyawan_kantor_select_policy ON public.karyawan_kantor;
CREATE POLICY karyawan_kantor_select_policy ON public.karyawan_kantor
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS karyawan_kantor_write_policy ON public.karyawan_kantor;
CREATE POLICY karyawan_kantor_write_policy ON public.karyawan_kantor
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- ------------------------------------------------------------------------------
-- F.5. MASTER KATALOG (daftar_harga_menu, carwash_packages, diskon, kasir, metode_bayar)
-- Shared catalog access for read; Management only for write
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS menu_select_policy ON public.daftar_harga_menu;
CREATE POLICY menu_select_policy ON public.daftar_harga_menu
FOR SELECT TO authenticated
USING (public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS menu_write_policy ON public.daftar_harga_menu;
CREATE POLICY menu_write_policy ON public.daftar_harga_menu
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS packages_select_policy ON public.carwash_packages;
CREATE POLICY packages_select_policy ON public.carwash_packages
FOR SELECT TO authenticated
USING (public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS packages_write_policy ON public.carwash_packages;
CREATE POLICY packages_write_policy ON public.carwash_packages
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS diskon_select_policy ON public.diskon;
CREATE POLICY diskon_select_policy ON public.diskon
FOR SELECT TO authenticated
USING (public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS diskon_write_policy ON public.diskon;
CREATE POLICY diskon_write_policy ON public.diskon
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS kasir_select_policy ON public.kasir;
CREATE POLICY kasir_select_policy ON public.kasir
FOR SELECT TO authenticated
USING (public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS kasir_write_policy ON public.kasir;
CREATE POLICY kasir_write_policy ON public.kasir
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS metode_bayar_select_policy ON public.metode_bayar;
CREATE POLICY metode_bayar_select_policy ON public.metode_bayar
FOR SELECT TO authenticated
USING (public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS metode_bayar_write_policy ON public.metode_bayar;
CREATE POLICY metode_bayar_write_policy ON public.metode_bayar
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- resep & master_categories
DROP POLICY IF EXISTS resep_select_policy ON public.resep;
CREATE POLICY resep_select_policy ON public.resep
FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS resep_write_policy ON public.resep;
CREATE POLICY resep_write_policy ON public.resep
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS categories_select_policy ON public.master_categories;
CREATE POLICY categories_select_policy ON public.master_categories
FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS categories_write_policy ON public.master_categories;
CREATE POLICY categories_write_policy ON public.master_categories
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- ------------------------------------------------------------------------------
-- F.6. INVENTORI & STOK (stok_barang, barang_masuk, barang_keluar)
-- P1-05: stok_barang cost protection: Direct SELECT only for Owner, Admin, Staff Kantor
-- Kasir accesses stock via fn_get_pos_inventory_stock()
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS stok_select_policy ON public.stok_barang;
CREATE POLICY stok_select_policy ON public.stok_barang
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS stok_write_policy ON public.stok_barang;
CREATE POLICY stok_write_policy ON public.stok_barang
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS barang_masuk_select_policy ON public.barang_masuk;
CREATE POLICY barang_masuk_select_policy ON public.barang_masuk
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_masuk_write_policy ON public.barang_masuk;
CREATE POLICY barang_masuk_write_policy ON public.barang_masuk
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_keluar_select_policy ON public.barang_keluar;
CREATE POLICY barang_keluar_select_policy ON public.barang_keluar
FOR SELECT TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin', 'Staff Kantor')
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_keluar_write_policy ON public.barang_keluar;
CREATE POLICY barang_keluar_write_policy ON public.barang_keluar
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- ------------------------------------------------------------------------------
-- F.7. TRANSAKSI POS (struk, cafe, carwash)
-- Read & Insert strictly operational branch-scoped (NULL rejected for non-management)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS struk_select_policy ON public.struk;
CREATE POLICY struk_select_policy ON public.struk
FOR SELECT TO authenticated
USING (public.fn_has_operational_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS struk_insert_policy ON public.struk;
CREATE POLICY struk_insert_policy ON public.struk
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS struk_update_policy ON public.struk;
CREATE POLICY struk_update_policy ON public.struk
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS struk_delete_policy ON public.struk;
CREATE POLICY struk_delete_policy ON public.struk
FOR DELETE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- cafe transactions
DROP POLICY IF EXISTS cafe_select_policy ON public.cafe;
CREATE POLICY cafe_select_policy ON public.cafe
FOR SELECT TO authenticated
USING (public.fn_has_operational_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS cafe_insert_policy ON public.cafe;
CREATE POLICY cafe_insert_policy ON public.cafe
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS cafe_update_policy ON public.cafe;
CREATE POLICY cafe_update_policy ON public.cafe
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS cafe_delete_policy ON public.cafe;
CREATE POLICY cafe_delete_policy ON public.cafe
FOR DELETE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- carwash transactions
DROP POLICY IF EXISTS carwash_select_policy ON public.carwash;
CREATE POLICY carwash_select_policy ON public.carwash
FOR SELECT TO authenticated
USING (public.fn_has_operational_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS carwash_insert_policy ON public.carwash;
CREATE POLICY carwash_insert_policy ON public.carwash
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS carwash_update_policy ON public.carwash;
CREATE POLICY carwash_update_policy ON public.carwash
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_operational_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS carwash_delete_policy ON public.carwash;
CREATE POLICY carwash_delete_policy ON public.carwash
FOR DELETE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- ------------------------------------------------------------------------------
-- F.8. CRM & LOYALTY
-- crm_customers: readable by authenticated within tenant
-- crm_loyalty_programs: read via operational branch access, write by management
-- crm_loyalty_logs & customer_reward_claims: direct write revoked; read via branch access
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS crm_customers_select_policy ON public.crm_customers;
CREATE POLICY crm_customers_select_policy ON public.crm_customers
FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS crm_customers_write_policy ON public.crm_customers;
CREATE POLICY crm_customers_write_policy ON public.crm_customers
FOR ALL TO authenticated
USING (tenant_id = public.current_tenant_id())
WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS crm_loyalty_programs_select_policy ON public.crm_loyalty_programs;
CREATE POLICY crm_loyalty_programs_select_policy ON public.crm_loyalty_programs
FOR SELECT TO authenticated
USING (public.fn_has_shared_catalog_access(tenant_id, branch_id));

DROP POLICY IF EXISTS crm_loyalty_programs_write_policy ON public.crm_loyalty_programs;
CREATE POLICY crm_loyalty_programs_write_policy ON public.crm_loyalty_programs
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

DROP POLICY IF EXISTS crm_logs_select_policy ON public.crm_loyalty_logs;
CREATE POLICY crm_logs_select_policy ON public.crm_loyalty_logs
FOR SELECT TO authenticated
USING (public.fn_has_operational_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS crm_claims_select_policy ON public.customer_reward_claims;
CREATE POLICY crm_claims_select_policy ON public.customer_reward_claims
FOR SELECT TO authenticated
USING (public.fn_has_operational_branch_access(tenant_id, branch_id));

COMMIT;
