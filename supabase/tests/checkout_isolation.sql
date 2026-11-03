-- Disposable PostgreSQL only. Uses checkout_fixture.sql and real checkout migrations.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.snapshot() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
 'struk',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM struk t),
 'stock',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM stok_barang t),
 'movements',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM barang_keluar t),
 'cafe',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM cafe t),
 'cashflow',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM cashflow t),
 'journals',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM journal_entries t),
 'lines',(SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM journal_entry_lines t));
$$;
CREATE FUNCTION pg_temp.sale(tenant uuid, branch uuid, receipt text, tender numeric DEFAULT 50000, supplied_change numeric DEFAULT 999) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.fn_execute_checkout(tenant,branch,
 jsonb_build_object('id_struk',receipt,'status_bayar','Selesai','metode_bayar','CASH',
 'nominal_bayar',36000,'bayar',36000,'uang_diterima',tender,'kembalian',supplied_change),
 '[{"nama_menu":"QA Coffee","qty":2,"harga_satuan":18000}]'::jsonb,NULL);
$$;
CREATE FUNCTION pg_temp.expect_denied(label text, expected_code text, user_id text, tenant uuid, branch uuid, receipt text, tender numeric DEFAULT 50000) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state jsonb; rejected boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',user_id,true);
 before_state:=pg_temp.snapshot();
 BEGIN
  PERFORM pg_temp.sale(tenant,branch,receipt,tender);
 EXCEPTION WHEN OTHERS THEN
  IF position(expected_code IN SQLERRM)=0 THEN RAISE EXCEPTION '% wrong error: %',label,SQLERRM; END IF;
  rejected:=true;
 END;
 PERFORM pg_temp.assert_true(rejected,label||' unexpectedly succeeded');
 PERFORM pg_temp.assert_true(before_state=pg_temp.snapshot(),label||' changed persisted data');
 RAISE NOTICE 'PASS % (no mutation)',label;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_denied('cross-tenant write','TENANT_FORBIDDEN','00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','QA-CROSS');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.fn_execute_checkout(uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE'),'anon can execute checkout');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.fn_execute_checkout(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'),'PUBLIC can execute checkout');
SELECT pg_temp.expect_denied('missing auth','UNAUTHORIZED','','11111111-1111-1111-1111-111111111111',NULL,'QA-NOAUTH');
SELECT pg_temp.expect_denied('missing profile','USER_INACTIVE','00000000-0000-0000-0000-000000000099','11111111-1111-1111-1111-111111111111',NULL,'QA-NOPROFILE');
SELECT pg_temp.expect_denied('inactive profile','USER_INACTIVE','00000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111',NULL,'QA-INACTIVE');
SELECT pg_temp.expect_denied('no checkout role','FORBIDDEN','00000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111',NULL,'QA-ROLE');
SELECT pg_temp.expect_denied('foreign tenant branch','BRANCH_FORBIDDEN','00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','QA-BRANCH');
SELECT pg_temp.expect_denied('cashier other branch','BRANCH_FORBIDDEN','00000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','QA-CASHIER-BRANCH');
RESET ROLE;
UPDATE branches SET is_active=false WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_denied('inactive branch','BRANCH_FORBIDDEN','00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','QA-INACTIVE-BRANCH');
RESET ROLE;
UPDATE branches SET is_active=true WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_denied('cash received underpaid','PAYMENT_UNDERPAID','00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',NULL,'QA-UNDERPAID',1000);
RESET ROLE;
UPDATE stok_barang SET stok=0,stok_akhir=0 WHERE tenant_id='22222222-2222-2222-2222-222222222222';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_denied('stock failure rolls back receipt','INSUFFICIENT_STOCK','00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',NULL,'QA-ROLLBACK');
RESET ROLE;
UPDATE stok_barang SET stok=100,stok_akhir=100 WHERE tenant_id='22222222-2222-2222-2222-222222222222';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true(pg_temp.sale('22222222-2222-2222-2222-222222222222',NULL,'QA-VALID')->>'status'='COMPLETED','authorized checkout failed');
SELECT pg_temp.assert_true((SELECT total_tagihan=36000 AND nominal_bayar=36000 AND bayar=36000 AND uang_diterima=50000 AND kembalian=14000 AND branch_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' FROM struk WHERE id_struk='QA-VALID'),'stored tender/change/branch contract');
SELECT pg_temp.assert_true((SELECT stok=99.96 AND stok_akhir=99.96 FROM stok_barang WHERE tenant_id='22222222-2222-2222-2222-222222222222'),'BOM stock deduction');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND sum(pemasukan)=36000 FROM cashflow),'cashflow must equal net sale, not gross tender');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(status='POSTED') FROM journal_entries),'journal not posted');
SELECT pg_temp.assert_true((SELECT count(*)=4 AND sum(debit)=38000 AND sum(credit)=38000 FROM journal_entry_lines),'positive-cost journal totals wrong');
SELECT pg_temp.assert_true((SELECT debit=2000 AND credit=0 FROM journal_entry_lines l JOIN chart_of_accounts c ON c.id=l.account_id WHERE c.kode_akun='5101'),'HPP should debit 2000');
SELECT pg_temp.assert_true((SELECT credit=2000 AND debit=0 FROM journal_entry_lines l JOIN chart_of_accounts c ON c.id=l.account_id WHERE c.kode_akun='1103'),'inventory should credit 2000');
DO $$ DECLARE before_state jsonb; response jsonb; BEGIN
 before_state:=pg_temp.snapshot();
 response:=pg_temp.sale('22222222-2222-2222-2222-222222222222',NULL,'QA-VALID');
 PERFORM pg_temp.assert_true(response->>'status'='ALREADY_COMPLETED' AND (response->>'uang_diterima')::numeric=50000 AND (response->>'kembalian')::numeric=14000,'authorized replay lost payment data');
 PERFORM pg_temp.assert_true(before_state=pg_temp.snapshot(),'replay duplicated mutations');
END $$;
SELECT pg_temp.expect_denied('same tenant cross-branch replay','BRANCH_FORBIDDEN','00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd','QA-VALID');
SELECT pg_temp.expect_denied('cross-tenant replay','TENANT_FORBIDDEN','00000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',NULL,'QA-VALID');
RESET ROLE;
UPDATE profiles SET is_active=false WHERE id='00000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_denied('inactive replay','USER_INACTIVE','00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',NULL,'QA-VALID');
-- Branch-local inventory takes precedence over shared inventory and other branches.
RESET ROLE;
INSERT INTO stok_barang(id,tenant_id,branch_id,nama_produk,nama_barang,stok,stok_akhir,harga_beli,harga_satuan) VALUES
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','QA Beans','QA Beans',2,2,50000,50000),
 ('ffffffff-ffff-ffff-ffff-ffffffffffff','11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','QA Beans','QA Beans',7,7,50000,50000);
SET LOCAL ROLE authenticated;
-- Additional authorized role checks run after the exact single-sale reconciliation.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_true(pg_temp.sale('11111111-1111-1111-1111-111111111111',NULL,'QA-CASHIER-VALID')->>'status'='COMPLETED','authorized cashier failed');
SELECT pg_temp.assert_true((SELECT stok=1.96 FROM stok_barang WHERE id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),'cashier did not deduct its branch stock');
SELECT pg_temp.assert_true((SELECT stok=7 FROM stok_barang WHERE id='ffffffff-ffff-ffff-ffff-ffffffffffff'),'cashier consumed another branch stock');
SELECT pg_temp.assert_true((SELECT stok=100 FROM stok_barang WHERE tenant_id='11111111-1111-1111-1111-111111111111' AND branch_id IS NULL),'branch-specific stock did not take precedence over shared stock');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
SELECT pg_temp.assert_true(pg_temp.sale('11111111-1111-1111-1111-111111111111','cccccccc-cccc-cccc-cccc-cccccccccccc','QA-ADMIN-VALID')->>'status'='COMPLETED','authorized admin failed');
RESET ROLE;
ROLLBACK;
