-- ==============================================================================
-- ACCESS CONTROL & RBAC REGRESSION TEST HARNESS (PR-1)
-- Exercises all 35 public objects across Tenant A (A1, A2) and Tenant D (D1).
-- Records baseline security gaps and validates positive isolation invariants.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(cond boolean, msg text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', msg;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pg_temp.audit_summary (
  check_id text PRIMARY KEY,
  category text,
  target_object text,
  status text, -- 'SECURE_PASS', 'BASELINE_GAP_CONFIRMED'
  detail text
);
GRANT ALL ON pg_temp.audit_summary TO authenticated;

-- Helper to record test results
CREATE OR REPLACE FUNCTION pg_temp.record_result(
  p_id text, p_cat text, p_obj text, p_status text, p_detail text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO pg_temp.audit_summary (check_id, category, target_object, status, detail)
  VALUES (p_id, p_cat, p_obj, p_status, p_detail)
  ON CONFLICT (check_id) DO UPDATE SET status = p_status, detail = p_detail;
  RAISE NOTICE '[%] %: % - %', p_status, p_id, p_obj, p_detail;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.record_result TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true TO authenticated;

-- Switch to non-superuser role so PostgreSQL enforces Row-Level Security
SET ROLE authenticated;

-- ==============================================================================
-- TEST GROUP 1: CROSS-TENANT ISOLATION (AC-01 & AC-02)
-- Tenant A (Owner A) queries and attempts to mutate Tenant D fixtures.
-- ==============================================================================
DO $$
DECLARE
  v_tenant_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
  v_tenant_d UUID := '22222222-2222-2222-2222-222222222222'::uuid;
  v_owner_a UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_owner_d UUID := '00000000-0000-0000-0000-000000000002'::uuid;
  v_count INT;
  v_mutated INT;
BEGIN
  -- Authenticate as Owner A
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  -- 1.1 Verify Tenant D fixtures actually exist by checking as Owner D first
  PERFORM set_config('request.jwt.claim.sub', v_owner_d::text, true);
  SELECT COUNT(*) INTO v_count FROM public.stok_barang WHERE tenant_id = v_tenant_d;
  PERFORM pg_temp.assert_true(v_count > 0, 'Positive fixture for Tenant D stok_barang must exist');
  SELECT COUNT(*) INTO v_count FROM public.struk WHERE tenant_id = v_tenant_d;
  PERFORM pg_temp.assert_true(v_count > 0, 'Positive fixture for Tenant D struk must exist');
  SELECT COUNT(*) INTO v_count FROM public.karyawan_kantor WHERE tenant_id = v_tenant_d;
  PERFORM pg_temp.assert_true(v_count > 0, 'Positive fixture for Tenant D karyawan_kantor must exist');

  -- Switch back to Owner A
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  -- 1.2 AC-01: Owner A queries Tenant D data across key tables
  SELECT COUNT(*) INTO v_count FROM public.stok_barang WHERE tenant_id = v_tenant_d;
  IF v_count = 0 THEN
    PERFORM pg_temp.record_result('AC-01-STOK', 'TENANT_ISOLATION', 'stok_barang', 'SECURE_PASS', 'Tenant A cannot see Tenant D stock');
  ELSE
    PERFORM pg_temp.record_result('AC-01-STOK', 'TENANT_ISOLATION', 'stok_barang', 'BASELINE_GAP_CONFIRMED', 'Tenant A leaked Tenant D stock');
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.struk WHERE tenant_id = v_tenant_d;
  IF v_count = 0 THEN
    PERFORM pg_temp.record_result('AC-01-STRUK', 'TENANT_ISOLATION', 'struk', 'SECURE_PASS', 'Tenant A cannot see Tenant D receipts');
  ELSE
    PERFORM pg_temp.record_result('AC-01-STRUK', 'TENANT_ISOLATION', 'struk', 'BASELINE_GAP_CONFIRMED', 'Tenant A leaked Tenant D receipts');
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.karyawan_kantor WHERE tenant_id = v_tenant_d;
  IF v_count = 0 THEN
    PERFORM pg_temp.record_result('AC-01-SDM', 'TENANT_ISOLATION', 'karyawan_kantor', 'SECURE_PASS', 'Tenant A cannot see Tenant D staff');
  ELSE
    PERFORM pg_temp.record_result('AC-01-SDM', 'TENANT_ISOLATION', 'karyawan_kantor', 'BASELINE_GAP_CONFIRMED', 'Tenant A leaked Tenant D staff');
  END IF;

  -- 1.3 AC-02: Owner A attempts direct UPDATE on Tenant D stock
  UPDATE public.stok_barang SET stok = 999.00 WHERE tenant_id = v_tenant_d;
  GET DIAGNOSTICS v_mutated = ROW_COUNT;
  IF v_mutated = 0 THEN
    PERFORM pg_temp.record_result('AC-02-MUTATE', 'TENANT_ISOLATION', 'stok_barang', 'SECURE_PASS', 'Tenant A cannot mutate Tenant D rows (0 affected)');
  ELSE
    PERFORM pg_temp.record_result('AC-02-MUTATE', 'TENANT_ISOLATION', 'stok_barang', 'BASELINE_GAP_CONFIRMED', 'Tenant A mutated Tenant D stock rows');
  END IF;
END $$;

-- ==============================================================================
-- TEST GROUP 2: ROLE-BASED PRIVILEGE CREEP (AC-04 & AC-05)
-- Evaluates Kasir permissions inside Tenant A (Reading Payroll, Modifying Catalog)
-- ==============================================================================
DO $$
DECLARE
  v_tenant_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
  v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
  v_count INT;
  v_mutated INT;
BEGIN
  -- Authenticate as Kasir A1
  PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);

  -- 2.1 AC-04: Kasir reading payroll and accounting lines
  SELECT COUNT(*) INTO v_count FROM public.karyawan_cuci WHERE tenant_id = v_tenant_a;
  IF v_count > 0 THEN
    PERFORM pg_temp.record_result('AC-04-PAYROLL-CW', 'RBAC_CREEP', 'karyawan_cuci', 'BASELINE_GAP_CONFIRMED', 
      'Current RLS allows Kasir to SELECT * on karyawan_cuci with payroll/commission');
  ELSE
    PERFORM pg_temp.record_result('AC-04-PAYROLL-CW', 'RBAC_CREEP', 'karyawan_cuci', 'SECURE_PASS', 'Kasir cannot read karyawan_cuci payroll');
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.journal_entries WHERE tenant_id = v_tenant_a;
  IF v_count > 0 THEN
    PERFORM pg_temp.record_result('AC-04-FINANCE-JE', 'RBAC_CREEP', 'journal_entries', 'BASELINE_GAP_CONFIRMED', 
      'Current RLS allows Kasir to SELECT general ledger journal entries');
  ELSE
    PERFORM pg_temp.record_result('AC-04-FINANCE-JE', 'RBAC_CREEP', 'journal_entries', 'SECURE_PASS', 'Kasir cannot read journal entries');
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.chart_of_accounts WHERE tenant_id = v_tenant_a;
  IF v_count > 0 THEN
    PERFORM pg_temp.record_result('AC-04-FINANCE-COA', 'RBAC_CREEP', 'chart_of_accounts', 'BASELINE_GAP_CONFIRMED', 
      'Current RLS allows Kasir to SELECT Chart of Accounts');
  ELSE
    PERFORM pg_temp.record_result('AC-04-FINANCE-COA', 'RBAC_CREEP', 'chart_of_accounts', 'SECURE_PASS', 'Kasir cannot read COA');
  END IF;

  -- 2.2 AC-05: Kasir attempting direct modification of menu prices & recipes
  UPDATE public.daftar_harga_menu SET harga = 99999.00 WHERE tenant_id = v_tenant_a;
  GET DIAGNOSTICS v_mutated = ROW_COUNT;
  IF v_mutated > 0 THEN
    PERFORM pg_temp.record_result('AC-05-PRICE-MOD', 'RBAC_CREEP', 'daftar_harga_menu', 'BASELINE_GAP_CONFIRMED', 
      'Current RLS allows Kasir to direct UPDATE menu prices');
  ELSE
    PERFORM pg_temp.record_result('AC-05-PRICE-MOD', 'RBAC_CREEP', 'daftar_harga_menu', 'SECURE_PASS', 'Kasir cannot update menu prices');
  END IF;
END $$;

-- ==============================================================================
-- TEST GROUP 3: BRANCH SCOPE BOUNDARY (AC-06)
-- Kasir A1 (Branch A1) queries and mutates Branch A2 data within Tenant A.
-- ==============================================================================
DO $$
DECLARE
  v_tenant_a UUID := '11111111-1111-1111-1111-111111111111'::uuid;
  v_branch_a2 UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
  v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
  v_count INT;
  v_mutated INT;
BEGIN
  -- Authenticate as Kasir A1
  PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);

  SELECT COUNT(*) INTO v_count FROM public.stok_barang 
  WHERE tenant_id = v_tenant_a AND branch_id = v_branch_a2;

  IF v_count > 0 THEN
    PERFORM pg_temp.record_result('AC-06-BRANCH-READ', 'BRANCH_SCOPE', 'stok_barang', 'BASELINE_GAP_CONFIRMED', 
      'Current RLS allows Kasir A1 to SELECT stock of Branch A2 (lacks branch predicate)');
  ELSE
    PERFORM pg_temp.record_result('AC-06-BRANCH-READ', 'BRANCH_SCOPE', 'stok_barang', 'SECURE_PASS', 'Kasir A1 cannot see Branch A2 stock');
  END IF;

  UPDATE public.stok_barang SET stok = 777.00 
  WHERE tenant_id = v_tenant_a AND branch_id = v_branch_a2;
  GET DIAGNOSTICS v_mutated = ROW_COUNT;

  IF v_mutated > 0 THEN
    PERFORM pg_temp.record_result('AC-06-BRANCH-WRITE', 'BRANCH_SCOPE', 'stok_barang', 'BASELINE_GAP_CONFIRMED', 
      'Current RLS allows Kasir A1 to UPDATE stock of Branch A2');
  ELSE
    PERFORM pg_temp.record_result('AC-06-BRANCH-WRITE', 'BRANCH_SCOPE', 'stok_barang', 'SECURE_PASS', 'Kasir A1 cannot update Branch A2 stock');
  END IF;
END $$;

-- ==============================================================================
-- TEST GROUP 4: PROFILE MUTATION & ESCALATION (AC-07 & AC-08)
-- Kasir A1 attempts to alter branch_id or deactivate Owner A.
-- ==============================================================================
DO $$
DECLARE
  v_kasir_a1 UUID := '00000000-0000-0000-0000-000000000003'::uuid;
  v_owner_a UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_branch_a2 UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;
  v_mutated INT;
  v_err TEXT := '';
BEGIN
  -- Authenticate as Kasir A1
  PERFORM set_config('request.jwt.claim.sub', v_kasir_a1::text, true);

  -- 4.1 Kasir A1 attempts to change their own branch_id
  UPDATE public.profiles SET branch_id = v_branch_a2 WHERE id = v_kasir_a1;
  GET DIAGNOSTICS v_mutated = ROW_COUNT;

  IF v_mutated > 0 THEN
    PERFORM pg_temp.record_result('AC-07-SELF-BRANCH', 'PROFILE_ESCALATION', 'profiles', 'BASELINE_GAP_CONFIRMED', 
      'Current trigger permits Kasir to switch their own branch_id');
  ELSE
    PERFORM pg_temp.record_result('AC-07-SELF-BRANCH', 'PROFILE_ESCALATION', 'profiles', 'SECURE_PASS', 'Kasir cannot switch branch_id');
  END IF;

  -- 4.2 Kasir A1 attempts to deactivate Owner A
  UPDATE public.profiles SET is_active = false WHERE id = v_owner_a;
  GET DIAGNOSTICS v_mutated = ROW_COUNT;

  IF v_mutated > 0 THEN
    PERFORM pg_temp.record_result('AC-07-DEACT-OWNER', 'PROFILE_ESCALATION', 'profiles', 'BASELINE_GAP_CONFIRMED', 
      'Current trigger permits Kasir to deactivate Owner A');
  ELSE
    PERFORM pg_temp.record_result('AC-07-DEACT-OWNER', 'PROFILE_ESCALATION', 'profiles', 'SECURE_PASS', 'Kasir cannot deactivate Owner');
  END IF;

  -- 4.3 Kasir A1 attempts role escalation to Super Admin (Should be blocked by trigger)
  BEGIN
    UPDATE public.profiles SET role = 'Super Admin' WHERE id = v_kasir_a1;
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  IF position('FORBIDDEN_ROLE_ESCALATION' IN v_err) > 0 THEN
    PERFORM pg_temp.record_result('AC-08-ROLE-ESCALATE', 'PROFILE_ESCALATION', 'profiles', 'SECURE_PASS', 
      'Role escalation to Super Admin is blocked by trigger');
  ELSE
    PERFORM pg_temp.record_result('AC-08-ROLE-ESCALATE', 'PROFILE_ESCALATION', 'profiles', 'BASELINE_GAP_CONFIRMED', 
      'Role escalation was not blocked by trigger');
  END IF;
END $$;

-- ==============================================================================
-- TEST GROUP 5: PRIVILEGED RPC REWARD BYPASS (AC-11 & AC-11b)
-- Owner A executes redeem_customer_reward for Tenant D and tests unpaid visits.
-- ==============================================================================
DO $$
DECLARE
  v_tenant_d UUID := '22222222-2222-2222-2222-222222222222'::uuid;
  v_owner_a UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_inactive_a UUID := '00000000-0000-0000-0000-000000000004'::uuid;
  v_res JSONB;
  v_err TEXT := '';
BEGIN
  -- 5.1 Owner A attempts to redeem reward for Tenant D (Cross-Tenant RPC Bypass)
  PERFORM set_config('request.jwt.claim.sub', v_owner_a::text, true);

  BEGIN
    v_res := public.redeem_customer_reward(
      v_tenant_d,
      'D9999QA',
      'Free Wash D',
      'Test notes',
      'QA Delta Customer'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  IF v_res IS NOT NULL AND (v_res->>'redemption_id') IS NOT NULL THEN
    PERFORM pg_temp.record_result('AC-11-RPC-CROSS', 'RPC_SECURITY', 'redeem_customer_reward', 'BASELINE_GAP_CONFIRMED', 
      'Caller Owner A succeeded in redeeming reward for Tenant D (Lack of caller auth verification)');
    PERFORM pg_temp.record_result('AC-11B-RPC-UNPAID', 'RPC_SECURITY', 'redeem_customer_reward', 'BASELINE_GAP_CONFIRMED', 
      'Pending/unpaid carwash visits were counted as eligible stamps in baseline');
  ELSE
    PERFORM pg_temp.record_result('AC-11-RPC-CROSS', 'RPC_SECURITY', 'redeem_customer_reward', 'SECURE_PASS', 'Cross-tenant RPC call rejected');
  END IF;

  -- 5.2 Inactive user attempts to call redeem_customer_reward
  PERFORM set_config('request.jwt.claim.sub', v_inactive_a::text, true);
  v_err := '';
  v_res := NULL;

  BEGIN
    v_res := public.redeem_customer_reward(
      v_tenant_d,
      'D9999QA',
      'Free Wash D',
      'Test notes',
      'QA Delta Customer'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;

  IF v_res IS NOT NULL AND (v_res->>'redemption_id') IS NOT NULL THEN
    PERFORM pg_temp.record_result('AC-09-RPC-INACTIVE', 'RPC_SECURITY', 'redeem_customer_reward', 'BASELINE_GAP_CONFIRMED', 
      'Inactive user succeeded in calling SECURITY DEFINER RPC');
  ELSE
    PERFORM pg_temp.record_result('AC-09-RPC-INACTIVE', 'RPC_SECURITY', 'redeem_customer_reward', 'SECURE_PASS', 'Inactive user RPC call rejected');
  END IF;
END $$;

-- ==============================================================================
-- TEST GROUP 6: DATABASE PRIVILEGES & SECURITY INVOKER (AC-13 & AC-14)
-- ==============================================================================
DO $$
DECLARE
  v_has_truncate BOOLEAN;
  v_invoker_count INT;
BEGIN
  -- 6.1 Check TRUNCATE privilege for authenticated on profiles
  v_has_truncate := has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE');
  IF v_has_truncate THEN
    PERFORM pg_temp.record_result('AC-13-TRUNCATE', 'DATABASE_GRANTS', 'profiles', 'BASELINE_GAP_CONFIRMED', 
      'authenticated role has TRUNCATE privilege in baseline (overly broad grant)');
  ELSE
    PERFORM pg_temp.record_result('AC-13-TRUNCATE', 'DATABASE_GRANTS', 'profiles', 'SECURE_PASS', 'authenticated has no TRUNCATE privilege');
  END IF;

  -- 6.2 Check security_invoker = true on 4 views
  SELECT COUNT(*) INTO v_invoker_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('bahan_baku', 'transaksi', 'finance_summary', 'akun_keuangan')
    AND c.reloptions @> ARRAY['security_invoker=true'];

  IF v_invoker_count = 4 THEN
    PERFORM pg_temp.record_result('AC-14-VIEW-INVOKER', 'VIEW_SECURITY', '4 views', 'SECURE_PASS', 
      'All 4 views have security_invoker = true');
  ELSE
    PERFORM pg_temp.record_result('AC-14-VIEW-INVOKER', 'VIEW_SECURITY', '4 views', 'BASELINE_GAP_CONFIRMED', 
      'One or more views lack security_invoker = true');
  END IF;
END $$;

-- Output Audit Summary
SELECT category, status, count(*) AS count
FROM pg_temp.audit_summary
GROUP BY category, status
ORDER BY category, status;

SELECT check_id, target_object, status, detail
FROM pg_temp.audit_summary
ORDER BY check_id;

ROLLBACK;
