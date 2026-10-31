-- Disposable PostgreSQL only: run against an EMPTY erpposs_qa_* database.
-- This emulates Supabase Auth JWT helpers, not the hosted Auth HTTP service.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() NOT LIKE 'erpposs_qa_%' THEN
  RAISE EXCEPTION 'Use a disposable erpposs_qa_* database';
 END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
 id UUID PRIMARY KEY, email TEXT,
 raw_user_meta_data JSONB DEFAULT '{}'::JSONB,
 raw_app_meta_data JSONB DEFAULT '{}'::JSONB
);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
END $$;
CREATE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
 SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::JSONB;
$$;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
 SELECT NULLIF(auth.jwt()->>'sub', '')::UUID;
$$;
\ir ../migrations/001_initial_relaypos_cloud_schema.sql
\ir ../migrations/003_owner_auth_provisioning.sql
-- Applying again must retain the trigger/policies and preserve existing objects.
\ir ../migrations/003_owner_auth_provisioning.sql

BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition BOOLEAN, message TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$ BEGIN
 IF condition IS DISTINCT FROM TRUE THEN RAISE EXCEPTION '%', message; END IF;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data) VALUES
 ('00000000-0000-0000-0000-000000000001', 'owner-one@example.test',
 '{"nama":"Owner One","tenant_name":"Store One","business_type":"CAFE","role":"Super Admin","tenant_id":"11111111-1111-1111-1111-111111111111"}', '{"provider":"email"}'),
 ('00000000-0000-0000-0000-000000000002', 'owner-two@example.test',
 '{"nama":"Owner Two","tenant_name":"Store Two","business_type":"CARWASH"}', '{"provider":"email"}');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.tenants), 'Owner signup did not create two tenants');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.branches), 'Owner signup did not create branches');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.profiles WHERE role='Owner'), 'User metadata escalated role');
SELECT pg_temp.assert_true((SELECT count(DISTINCT tenant_id)=2 FROM public.profiles), 'Owners share a tenant');
SELECT pg_temp.assert_true((SELECT bool_and(p.tenant_id=b.tenant_id AND p.branch_id=b.id)
 FROM public.profiles p JOIN public.branches b ON p.branch_id=b.id), 'Owner branch is not in their tenant');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.profiles
 WHERE tenant_id='11111111-1111-1111-1111-111111111111'), 'Untrusted tenant metadata was accepted');
\echo 'PASS owner provisioning, branch membership, and metadata privilege isolation'

DO $$ DECLARE rejected BOOLEAN := FALSE; BEGIN
 BEGIN
  INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-000000000003','invalid@example.test','{"nama":"Invalid","tenant_name":"Invalid Store","business_type":"INVALID"}');
 EXCEPTION WHEN raise_exception THEN rejected := TRUE; END;
 PERFORM pg_temp.assert_true(rejected, 'Invalid business type accepted');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM auth.users WHERE email='invalid@example.test'), 'Failed signup retained user');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.tenants), 'Failed signup retained tenant');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.branches), 'Failed signup retained branch');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.profiles), 'Failed signup retained profile');
END $$;
-- Fail late (profile name length) to verify earlier tenant/branch writes roll back.
DO $$ DECLARE rejected BOOLEAN := FALSE; BEGIN
 BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-000000000004','late-failure@example.test',
   jsonb_build_object('nama',repeat('x',256),'tenant_name','Late failure'));
 EXCEPTION WHEN string_data_right_truncation THEN rejected := TRUE; END;
 PERFORM pg_temp.assert_true(rejected, 'Expected late profile insert failure');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM auth.users), 'Late failure retained user');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.tenants), 'Late failure retained tenant');
 PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.branches), 'Late failure retained branch');
END $$;
\echo 'PASS signup validation and transaction rollback, including late insert failure'

INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
 ('00000000-0000-0000-0000-000000000005','google@example.test','{"full_name":"Google Owner"}','{"provider":"google"}');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000005' AND role='Owner'), 'Google signup missing owner');
\echo 'PASS Google signup provisioning'

INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
SELECT '00000000-0000-0000-0000-000000000006','staff@example.test','{"nama":"Invited Staff","role":"Super Admin"}',
 jsonb_build_object('tenant_id',tenant_id,'branch_id',branch_id,'erp_role','Kasir')
 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.profiles WHERE id='00000000-0000-0000-0000-000000000006' AND role='Kasir'), 'Trusted staff invitation failed');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.tenants), 'Staff invitation created a new tenant');

DO $$ DECLARE rejected BOOLEAN := FALSE; BEGIN
 BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
  SELECT '00000000-0000-0000-0000-000000000007','invalid-invite@example.test','{"nama":"Invalid invite"}',
   jsonb_build_object('tenant_id',p1.tenant_id,'branch_id',p2.branch_id,'erp_role','Kasir')
   FROM public.profiles p1 CROSS JOIN public.profiles p2
   WHERE p1.id='00000000-0000-0000-0000-000000000001'
     AND p2.id='00000000-0000-0000-0000-000000000002';
 EXCEPTION WHEN raise_exception THEN rejected := TRUE; END;
 PERFORM pg_temp.assert_true(rejected, 'Cross-tenant branch invitation accepted');
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM auth.users WHERE email='invalid-invite@example.test'), 'Invalid invitation retained auth user');
END $$;
\echo 'PASS server-controlled staff invitation and role isolation'

-- Supabase normally supplies these privileges; policies must still isolate data.
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON public.tenants,public.branches,public.profiles TO authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',u.id,'role','authenticated',
 'app_metadata',jsonb_build_object('erp_role','Super Admin','tenant_id','11111111-1111-1111-1111-111111111111'),'user_metadata',jsonb_build_object('role','Super Admin'))::TEXT,true)
 FROM auth.users u WHERE id='00000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.tenants), 'RLS exposed another tenant');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.branches), 'RLS exposed another tenant branch');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.profiles), 'RLS exposed other profiles');
SELECT pg_temp.assert_true(public.current_user_role()='Owner', 'Role helper trusted JWT metadata rather than authoritative profile');
SELECT pg_temp.assert_true(public.current_branch_id()=(SELECT branch_id FROM public.profiles), 'Branch claim helper mismatch');
RESET ROLE;
\echo 'PASS authenticated RLS tenant/profile/branch isolation and JWT helpers'
ROLLBACK;
\echo 'ALL OWNER AUTH SQL CHECKS PASSED'
