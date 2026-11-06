-- ==============================================================================
-- MIGRATION 013: PR-3 — GRANULAR RLS REWRITE & BRANCH SCOPING
-- Branch: feat/access-control-rbac-hardening
-- Scope:
--   A. Update context functions (current_tenant_id, current_branch_id) with is_active guard
--   B. Helper function fn_has_branch_access for uniform branch predicates
--   C. Restore operational grants to authenticated and protect POSTED journal immutability
--   D. Drop permissive 'tenant_isolation_policy' on 26 operational tables
--   E. Apply granular policies (SELECT, INSERT, UPDATE, DELETE) per role and branch
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

-- Helper check for branch access:
-- Super Admin: unrestricted
-- Owner / Admin: access all branches within tenant
-- Kasir / Kru: only assigned branch or null branch
CREATE OR REPLACE FUNCTION public.fn_has_branch_access(p_tenant_id UUID, p_branch_id UUID)
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

    -- Non-management (Kasir, Kru): must match assigned branch or table row branch is null
    v_branch := public.current_branch_id();
    IF p_branch_id IS NULL OR p_branch_id = v_branch THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_has_branch_access(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_branch_access(UUID, UUID) TO authenticated, service_role;

-- ==============================================================================
-- B. RECONCILE OPERATIONAL GRANTS & POSTED JOURNAL IMMUTABILITY
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
        'crm_loyalty_programs', 'crm_loyalty_logs', 'customer_reward_claims'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables
    LOOP
        IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r') THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role;', tbl);
        END IF;
    END LOOP;

    -- journal_entries & lines: strictly revoke UPDATE and DELETE from authenticated
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'journal_entries') THEN
        EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.journal_entries FROM authenticated;';
        EXECUTE 'GRANT SELECT, INSERT ON TABLE public.journal_entries TO authenticated, service_role;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'journal_entry_lines') THEN
        EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.journal_entry_lines FROM authenticated;';
        EXECUTE 'GRANT SELECT, INSERT ON TABLE public.journal_entry_lines TO authenticated, service_role;';
    END IF;
END $$;

-- Trigger to guard against mutating POSTED journal entries even by superusers/triggers
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
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_posted_journal_mutation ON public.journal_entries;
CREATE TRIGGER trg_prevent_posted_journal_mutation
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_posted_journal_mutation();

-- ==============================================================================
-- C. DROP BROAD 'tenant_isolation_policy' FROM ALL OPERATIONAL TABLES
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
-- D. GRANULAR RLS POLICIES PER DOMAIN
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- D.1. FINANCIAL CORE & GENERAL LEDGER (chart_of_accounts, journal_entries, lines)
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
-- D.2. BALANCES & ARUS KAS (pos_balances, cashflow, intelligence_daily_snapshots)
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
-- D.3. PENGELUARAN (Management all branches; Kasir own branch only)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS pengeluaran_select_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_select_policy ON public.pengeluaran
FOR SELECT TO authenticated
USING (public.fn_has_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS pengeluaran_insert_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_insert_policy ON public.pengeluaran
FOR INSERT TO authenticated
WITH CHECK (public.fn_has_branch_access(tenant_id, branch_id));

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
-- D.4. SDM & PAYROLL (karyawan_cuci, karyawan_kantor)
-- Zero leakage to Kasir
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
-- D.5. MASTER KATALOG (daftar_harga_menu, carwash_packages, diskon, kasir, metode_bayar)
-- SELECT: active members per branch; WRITE: Owner / Admin only (Kasir DENIED)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS menu_select_policy ON public.daftar_harga_menu;
CREATE POLICY menu_select_policy ON public.daftar_harga_menu
FOR SELECT TO authenticated
USING (public.fn_has_branch_access(tenant_id, branch_id));

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
USING (public.fn_has_branch_access(tenant_id, branch_id));

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
USING (public.fn_has_branch_access(tenant_id, branch_id));

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
USING (public.fn_has_branch_access(tenant_id, branch_id));

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
USING (public.fn_has_branch_access(tenant_id, branch_id));

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
-- D.6. INVENTORI & STOK (stok_barang, barang_masuk, barang_keluar)
-- Kasir branch-scoped read only; direct update blocked
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS stok_select_policy ON public.stok_barang;
CREATE POLICY stok_select_policy ON public.stok_barang
FOR SELECT TO authenticated
USING (public.fn_has_branch_access(tenant_id, branch_id));

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
USING (public.fn_has_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS barang_masuk_write_policy ON public.barang_masuk;
CREATE POLICY barang_masuk_write_policy ON public.barang_masuk
FOR ALL TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin', 'Staff Kantor')
    AND public.fn_has_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin', 'Staff Kantor')
    AND public.fn_has_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS barang_keluar_select_policy ON public.barang_keluar;
CREATE POLICY barang_keluar_select_policy ON public.barang_keluar
FOR SELECT TO authenticated
USING (public.fn_has_branch_access(tenant_id, branch_id));

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
-- D.7. TRANSAKSI POS (struk, cafe, carwash)
-- Read & Insert strictly branch-scoped
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS struk_select_policy ON public.struk;
CREATE POLICY struk_select_policy ON public.struk
FOR SELECT TO authenticated
USING (public.fn_has_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS struk_insert_policy ON public.struk;
CREATE POLICY struk_insert_policy ON public.struk
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS struk_update_policy ON public.struk;
CREATE POLICY struk_update_policy ON public.struk
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
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
USING (public.fn_has_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS cafe_insert_policy ON public.cafe;
CREATE POLICY cafe_insert_policy ON public.cafe
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS cafe_update_policy ON public.cafe;
CREATE POLICY cafe_update_policy ON public.cafe
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
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
USING (public.fn_has_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS carwash_insert_policy ON public.carwash;
CREATE POLICY carwash_insert_policy ON public.carwash
FOR INSERT TO authenticated
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS carwash_update_policy ON public.carwash;
CREATE POLICY carwash_update_policy ON public.carwash
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND public.fn_has_branch_access(tenant_id, branch_id)
);

DROP POLICY IF EXISTS carwash_delete_policy ON public.carwash;
CREATE POLICY carwash_delete_policy ON public.carwash
FOR DELETE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
);

-- ------------------------------------------------------------------------------
-- D.8. CRM & LOYALTY
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
USING (public.fn_has_branch_access(tenant_id, branch_id));

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
USING (public.fn_has_branch_access(tenant_id, branch_id));

DROP POLICY IF EXISTS crm_claims_select_policy ON public.customer_reward_claims;
CREATE POLICY crm_claims_select_policy ON public.customer_reward_claims
FOR SELECT TO authenticated
USING (public.fn_has_branch_access(tenant_id, branch_id));

COMMIT;
