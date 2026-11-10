-- =============================================================================
-- MIGRATION: 20261107000006_consolidate_permissive_rls_policies.sql
-- DESCRIPTION:
--   Consolidates overlapping FOR SELECT and FOR ALL permissive RLS policies
--   across 17 tables (Supabase Performance Advisor lint 0006_multiple_permissive_policies)
--   so PostgreSQL only evaluates a single policy on SELECT queries.
-- =============================================================================

-- barang_keluar: split barang_keluar_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates barang_keluar_select_policy
DROP POLICY IF EXISTS barang_keluar_write_policy ON public.barang_keluar;
DROP POLICY IF EXISTS barang_keluar_write_policy_insert ON public.barang_keluar;
DROP POLICY IF EXISTS barang_keluar_write_policy_update ON public.barang_keluar;
DROP POLICY IF EXISTS barang_keluar_write_policy_delete ON public.barang_keluar;
CREATE POLICY barang_keluar_write_policy_insert ON public.barang_keluar FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY barang_keluar_write_policy_update ON public.barang_keluar FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY barang_keluar_write_policy_delete ON public.barang_keluar FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- barang_masuk: identical SELECT and ALL qual -> keep barang_masuk_write_policy (FOR ALL)
DROP POLICY IF EXISTS barang_masuk_select_policy ON public.barang_masuk;

-- carwash_packages: split packages_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates packages_select_policy
DROP POLICY IF EXISTS packages_write_policy ON public.carwash_packages;
DROP POLICY IF EXISTS packages_write_policy_insert ON public.carwash_packages;
DROP POLICY IF EXISTS packages_write_policy_update ON public.carwash_packages;
DROP POLICY IF EXISTS packages_write_policy_delete ON public.carwash_packages;
CREATE POLICY packages_write_policy_insert ON public.carwash_packages FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY packages_write_policy_update ON public.carwash_packages FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY packages_write_policy_delete ON public.carwash_packages FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- cashflow: identical SELECT and ALL qual -> keep cashflow_write_policy (FOR ALL)
DROP POLICY IF EXISTS cashflow_select_policy ON public.cashflow;

-- crm_customers: identical SELECT and ALL qual -> keep crm_customers_write_policy (FOR ALL)
DROP POLICY IF EXISTS crm_customers_select_policy ON public.crm_customers;

-- crm_loyalty_programs: split crm_loyalty_programs_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates crm_loyalty_programs_select_policy
DROP POLICY IF EXISTS crm_loyalty_programs_write_policy ON public.crm_loyalty_programs;
DROP POLICY IF EXISTS crm_loyalty_programs_write_policy_insert ON public.crm_loyalty_programs;
DROP POLICY IF EXISTS crm_loyalty_programs_write_policy_update ON public.crm_loyalty_programs;
DROP POLICY IF EXISTS crm_loyalty_programs_write_policy_delete ON public.crm_loyalty_programs;
CREATE POLICY crm_loyalty_programs_write_policy_insert ON public.crm_loyalty_programs FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY crm_loyalty_programs_write_policy_update ON public.crm_loyalty_programs FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY crm_loyalty_programs_write_policy_delete ON public.crm_loyalty_programs FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- daftar_harga_menu: split menu_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates menu_select_policy
DROP POLICY IF EXISTS menu_write_policy ON public.daftar_harga_menu;
DROP POLICY IF EXISTS menu_write_policy_insert ON public.daftar_harga_menu;
DROP POLICY IF EXISTS menu_write_policy_update ON public.daftar_harga_menu;
DROP POLICY IF EXISTS menu_write_policy_delete ON public.daftar_harga_menu;
CREATE POLICY menu_write_policy_insert ON public.daftar_harga_menu FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY menu_write_policy_update ON public.daftar_harga_menu FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY menu_write_policy_delete ON public.daftar_harga_menu FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- diskon: split diskon_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates diskon_select_policy
DROP POLICY IF EXISTS diskon_write_policy ON public.diskon;
DROP POLICY IF EXISTS diskon_write_policy_insert ON public.diskon;
DROP POLICY IF EXISTS diskon_write_policy_update ON public.diskon;
DROP POLICY IF EXISTS diskon_write_policy_delete ON public.diskon;
CREATE POLICY diskon_write_policy_insert ON public.diskon FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY diskon_write_policy_update ON public.diskon FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY diskon_write_policy_delete ON public.diskon FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- karyawan_cuci: identical SELECT and ALL qual -> keep karyawan_cuci_write_policy (FOR ALL)
DROP POLICY IF EXISTS karyawan_cuci_select_policy ON public.karyawan_cuci;

-- karyawan_kantor: identical SELECT and ALL qual -> keep karyawan_kantor_write_policy (FOR ALL)
DROP POLICY IF EXISTS karyawan_kantor_select_policy ON public.karyawan_kantor;

-- kasir: split kasir_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates kasir_select_policy
DROP POLICY IF EXISTS kasir_write_policy ON public.kasir;
DROP POLICY IF EXISTS kasir_write_policy_insert ON public.kasir;
DROP POLICY IF EXISTS kasir_write_policy_update ON public.kasir;
DROP POLICY IF EXISTS kasir_write_policy_delete ON public.kasir;
CREATE POLICY kasir_write_policy_insert ON public.kasir FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY kasir_write_policy_update ON public.kasir FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY kasir_write_policy_delete ON public.kasir FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- master_categories: split categories_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates categories_select_policy
DROP POLICY IF EXISTS categories_write_policy ON public.master_categories;
DROP POLICY IF EXISTS categories_write_policy_insert ON public.master_categories;
DROP POLICY IF EXISTS categories_write_policy_update ON public.master_categories;
DROP POLICY IF EXISTS categories_write_policy_delete ON public.master_categories;
CREATE POLICY categories_write_policy_insert ON public.master_categories FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY categories_write_policy_update ON public.master_categories FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY categories_write_policy_delete ON public.master_categories FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- metode_bayar: split metode_bayar_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates metode_bayar_select_policy
DROP POLICY IF EXISTS metode_bayar_write_policy ON public.metode_bayar;
DROP POLICY IF EXISTS metode_bayar_write_policy_insert ON public.metode_bayar;
DROP POLICY IF EXISTS metode_bayar_write_policy_update ON public.metode_bayar;
DROP POLICY IF EXISTS metode_bayar_write_policy_delete ON public.metode_bayar;
CREATE POLICY metode_bayar_write_policy_insert ON public.metode_bayar FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY metode_bayar_write_policy_update ON public.metode_bayar FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY metode_bayar_write_policy_delete ON public.metode_bayar FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- pos_balances: identical SELECT and ALL qual -> keep pos_balances_write_policy (FOR ALL)
DROP POLICY IF EXISTS pos_balances_select_policy ON public.pos_balances;

-- resep: split resep_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates resep_select_policy
DROP POLICY IF EXISTS resep_write_policy ON public.resep;
DROP POLICY IF EXISTS resep_write_policy_insert ON public.resep;
DROP POLICY IF EXISTS resep_write_policy_update ON public.resep;
DROP POLICY IF EXISTS resep_write_policy_delete ON public.resep;
CREATE POLICY resep_write_policy_insert ON public.resep FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY resep_write_policy_update ON public.resep FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY resep_write_policy_delete ON public.resep FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- stok_barang: split stok_write_policy into INSERT/UPDATE/DELETE so SELECT only evaluates stok_select_policy
DROP POLICY IF EXISTS stok_write_policy ON public.stok_barang;
DROP POLICY IF EXISTS stok_write_policy_insert ON public.stok_barang;
DROP POLICY IF EXISTS stok_write_policy_update ON public.stok_barang;
DROP POLICY IF EXISTS stok_write_policy_delete ON public.stok_barang;
CREATE POLICY stok_write_policy_insert ON public.stok_barang FOR INSERT TO authenticated WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY stok_write_policy_update ON public.stok_barang FOR UPDATE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[])))) WITH CHECK (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));
CREATE POLICY stok_write_policy_delete ON public.stok_barang FOR DELETE TO authenticated USING (((tenant_id = current_tenant_id()) AND ((current_user_role())::text = ANY ((ARRAY['Super Admin'::character varying, 'Owner'::character varying, 'Admin'::character varying])::text[]))));

-- tenant_licenses: split tenant_licenses_write into INSERT/UPDATE/DELETE so SELECT only evaluates tenant_licenses_read
DROP POLICY IF EXISTS tenant_licenses_write ON public.tenant_licenses;
DROP POLICY IF EXISTS tenant_licenses_write_insert ON public.tenant_licenses;
DROP POLICY IF EXISTS tenant_licenses_write_update ON public.tenant_licenses;
DROP POLICY IF EXISTS tenant_licenses_write_delete ON public.tenant_licenses;
CREATE POLICY tenant_licenses_write_insert ON public.tenant_licenses FOR INSERT TO authenticated WITH CHECK (((current_user_role())::text = 'Super Admin'::text));
CREATE POLICY tenant_licenses_write_update ON public.tenant_licenses FOR UPDATE TO authenticated USING (((current_user_role())::text = 'Super Admin'::text)) WITH CHECK (((current_user_role())::text = 'Super Admin'::text));
CREATE POLICY tenant_licenses_write_delete ON public.tenant_licenses FOR DELETE TO authenticated USING (((current_user_role())::text = 'Super Admin'::text));
