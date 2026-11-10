-- =============================================================================
-- MIGRATION: 20261107000005_qa_performance_fk_indexes_and_rpc_acl.sql
-- DESCRIPTION:
--   1. Adds covering B-tree indexes for all 38 unindexed foreign keys flagged
--      by Supabase Performance Advisor (lint 0001_unindexed_foreign_keys) to
--      prevent sequential scans on JOINs and ON DELETE/UPDATE cascades.
--   2. Revokes direct PostgREST RPC execution from `PUBLIC` and `anon` on
--      internal trigger and RLS helper SECURITY DEFINER functions (lint
--      0029_authenticated_security_definer_function_executable), while keeping
--      required EXECUTE permissions for `authenticated` on RLS helpers and
--      canonical frontend RPC endpoints.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: Covering Indexes for Unindexed Foreign Keys (38 indexes)
-- -----------------------------------------------------------------------------

-- 1. barang_keluar
CREATE INDEX IF NOT EXISTS idx_barang_keluar_tenant_id ON public.barang_keluar (tenant_id);
CREATE INDEX IF NOT EXISTS idx_barang_keluar_branch_id ON public.barang_keluar (branch_id);
CREATE INDEX IF NOT EXISTS idx_barang_keluar_id_bahan_baku ON public.barang_keluar (id_bahan_baku);

-- 2. barang_masuk
CREATE INDEX IF NOT EXISTS idx_barang_masuk_tenant_id ON public.barang_masuk (tenant_id);
CREATE INDEX IF NOT EXISTS idx_barang_masuk_branch_id ON public.barang_masuk (branch_id);
CREATE INDEX IF NOT EXISTS idx_barang_masuk_id_bahan_baku ON public.barang_masuk (id_bahan_baku);

-- 3. cafe
CREATE INDEX IF NOT EXISTS idx_cafe_branch_id ON public.cafe (branch_id);

-- 4. carwash
CREATE INDEX IF NOT EXISTS idx_carwash_branch_id ON public.carwash (branch_id);
CREATE INDEX IF NOT EXISTS idx_carwash_tenant_id_struk ON public.carwash (tenant_id, id_struk);

-- 5. carwash_packages
CREATE INDEX IF NOT EXISTS idx_carwash_packages_tenant_id ON public.carwash_packages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_carwash_packages_branch_id ON public.carwash_packages (branch_id);

-- 6. cashflow
CREATE INDEX IF NOT EXISTS idx_cashflow_branch_id ON public.cashflow (branch_id);

-- 7. crm_loyalty_logs
CREATE INDEX IF NOT EXISTS idx_crm_loyalty_logs_branch_id ON public.crm_loyalty_logs (branch_id);

-- 8. crm_loyalty_programs
CREATE INDEX IF NOT EXISTS idx_crm_loyalty_programs_tenant_id ON public.crm_loyalty_programs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_loyalty_programs_branch_id ON public.crm_loyalty_programs (branch_id);

-- 9. customer_reward_claims
CREATE INDEX IF NOT EXISTS idx_customer_reward_claims_tenant_id ON public.customer_reward_claims (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_reward_claims_branch_id ON public.customer_reward_claims (branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_reward_claims_reward_id ON public.customer_reward_claims (reward_id);

-- 10. daftar_harga_menu
CREATE INDEX IF NOT EXISTS idx_daftar_harga_menu_branch_id ON public.daftar_harga_menu (branch_id);

-- 11. diskon
CREATE INDEX IF NOT EXISTS idx_diskon_tenant_id ON public.diskon (tenant_id);
CREATE INDEX IF NOT EXISTS idx_diskon_branch_id ON public.diskon (branch_id);

-- 12. intelligence_daily_snapshots
CREATE INDEX IF NOT EXISTS idx_intelligence_daily_snapshots_branch_id ON public.intelligence_daily_snapshots (branch_id);

-- 13. journal_entries
CREATE INDEX IF NOT EXISTS idx_journal_entries_branch_id ON public.journal_entries (branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by ON public.journal_entries (created_by);

-- 14. journal_entry_lines
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_tenant_id ON public.journal_entry_lines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_tenant_entry ON public.journal_entry_lines (tenant_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_tenant_account ON public.journal_entry_lines (tenant_id, account_id);

-- 15. karyawan_cuci
CREATE INDEX IF NOT EXISTS idx_karyawan_cuci_tenant_id ON public.karyawan_cuci (tenant_id);
CREATE INDEX IF NOT EXISTS idx_karyawan_cuci_branch_id ON public.karyawan_cuci (branch_id);

-- 16. karyawan_kantor
CREATE INDEX IF NOT EXISTS idx_karyawan_kantor_tenant_id ON public.karyawan_kantor (tenant_id);
CREATE INDEX IF NOT EXISTS idx_karyawan_kantor_branch_id ON public.karyawan_kantor (branch_id);

-- 17. kasir
CREATE INDEX IF NOT EXISTS idx_kasir_branch_id ON public.kasir (branch_id);

-- 18. license_keys
CREATE INDEX IF NOT EXISTS idx_license_keys_used_by_tenant_id ON public.license_keys (used_by_tenant_id);

-- 19. metode_bayar
CREATE INDEX IF NOT EXISTS idx_metode_bayar_branch_id ON public.metode_bayar (branch_id);

-- 20. pengeluaran
CREATE INDEX IF NOT EXISTS idx_pengeluaran_branch_id ON public.pengeluaran (branch_id);
CREATE INDEX IF NOT EXISTS idx_pengeluaran_tenant_cashflow ON public.pengeluaran (tenant_id, id_cashflow);

-- 21. profiles
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON public.profiles (branch_id);

-- 22. struk
CREATE INDEX IF NOT EXISTS idx_struk_branch_id ON public.struk (branch_id);

-- -----------------------------------------------------------------------------
-- SECTION 2: Revoke Direct RPC Execution on Trigger-Only Functions (Lint 0029)
-- -----------------------------------------------------------------------------
-- Trigger functions are invoked by the Postgres table owner context when table
-- DML fires; they should never be directly callable via `/rest/v1/rpc/<fn>` by
-- `PUBLIC`, `anon`, or `authenticated`.
REVOKE EXECUTE ON FUNCTION public.fn_apply_barang_masuk_to_stock() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_populate_tenant_and_branch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_set_tenant_and_branch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_journal_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_journal_lines_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_tenant_branch_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_enforce_tenant_user_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_prevent_posted_journal_line_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_prevent_posted_journal_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_protect_operational_branch_and_tenant() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_protect_profile_role_and_tenant() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_require_explicit_tenant_context() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_barang_masuk() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_stok_barang_advanced() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
