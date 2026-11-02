import asyncio
import json
import os
import re
import sys

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

def extract_json(raw_text):
    if not raw_text:
        return None
    try:
        data = json.loads(raw_text)
        if isinstance(data, dict):
            if "error" in data:
                return data
            raw = data.get("result", "")
            m = re.search(r'<untrusted-data-[a-f0-9-]+>\s*(\[.*?\]|\{.*?\})\s*</untrusted-data-[a-f0-9-]+>', raw, re.DOTALL)
            if m:
                return json.loads(m.group(1))
            try:
                return json.loads(raw)
            except Exception:
                pass
        return data
    except Exception:
        pass
    m = re.search(r'<untrusted-data-[a-f0-9-]+>\s*(\[.*?\]|\{.*?\})\s*</untrusted-data-[a-f0-9-]+>', raw_text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    return None

async def run_query(session, sql):
    res = await session.call_tool('execute_sql', {'query': sql})
    combined = "\n".join(c.text for c in res.content)
    return extract_json(combined), combined

async def main():
    print("=== LIVE RUNTIME VERIFICATION: BATCH 4 (SERVER-SIDE LICENSING & QUOTA ENFORCEMENT) ===")
    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    cmd = supabase_cfg.get('command', 'npx')
    args = supabase_cfg.get('args', [])
    raw_env = supabase_cfg.get('env', {})
    safe_env = _build_safe_env(raw_env)
    safe_env['PATH'] = os.environ.get('PATH', '')

    server_params = StdioServerParameters(command=cmd, args=args, env=safe_env)

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            # Persiapan Tenant Uji Coba
            test_tenant_id = '44444444-4444-4444-4444-444444444444'
            test_branch_1 = '44444444-1111-1111-1111-111111111111'
            test_branch_2 = '44444444-2222-2222-2222-222222222222'
            test_user_1 = '44444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
            test_user_2 = '44444444-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

            setup_sql = f"""
            DO $$
            BEGIN
                -- Bersihkan sisa pengujian sebelumnya
                DELETE FROM public.branches WHERE tenant_id = '{test_tenant_id}';
                DELETE FROM public.profiles WHERE tenant_id = '{test_tenant_id}';
                DELETE FROM public.tenant_licenses WHERE tenant_id = '{test_tenant_id}';
                DELETE FROM public.tenants WHERE id = '{test_tenant_id}';

                -- Buat tenant pengujian
                INSERT INTO public.tenants (id, nama, slug, plan, status, created_at)
                VALUES ('{test_tenant_id}', 'Test Licensing Tenant', 'test-lic-tenant-4', 'starter', 'active', NOW());

                -- Pasang lisensi starter dengan kuota: max_branches = 1, max_users = 1
                INSERT INTO public.tenant_licenses (
                    id, tenant_id, license_key, plan, tier, status,
                    valid_until, max_branches, max_users, created_at
                ) VALUES (
                    gen_random_uuid(), '{test_tenant_id}', 'STR-TRIAL-01', 'starter', 'STARTER_ANNUAL', 'ACTIVE',
                    NOW() + INTERVAL '30 days', 1, 1, NOW()
                );
            END $$;
            """
            await run_query(session, setup_sql)
            print("Setup tenant pengujian kuota selesai.")

            # TEST 1: Server-side Branch Quota Enforcement (max_branches = 1)
            print("\n[TEST 1] Penegakan Batas Cabang (max_branches = 1)...")
            await run_query(session, "ROLLBACK;")
            branch_test_sql = f"""
            DO $$
            BEGIN
                INSERT INTO public.branches (id, tenant_id, nama, kode, created_at)
                VALUES ('{test_branch_1}', '{test_tenant_id}', 'Cabang 1 (Utama)', 'CB1', NOW());

                INSERT INTO public.branches (id, tenant_id, nama, kode, created_at)
                VALUES ('{test_branch_2}', '{test_tenant_id}', 'Cabang 2 (Ilegal)', 'CB2', NOW());
            END $$;
            """
            _, raw1 = await run_query(session, branch_test_sql)
            await run_query(session, "ROLLBACK;")
            if "branch_limit_exceeded" in raw1.lower():
                print("✅ TEST 1 PASSED: Penambahan cabang melebihi kuota berhasil diblokir server (BRANCH_LIMIT_EXCEEDED)!")
            else:
                print(f"❌ TEST 1 FAILED: {raw1}")
                return

            # TEST 2: Server-side User Quota Enforcement (max_users = 1)
            print("\n[TEST 2] Penegakan Batas Pengguna/Staf (max_users = 1)...")
            user_test_sql = f"""
            DO $$
            BEGIN
                INSERT INTO public.profiles (id, tenant_id, nama, email, role, is_active, created_at)
                VALUES ('{test_user_1}', '{test_tenant_id}', 'Owner User', 'owner@test.com', 'Owner', true, NOW());

                INSERT INTO public.profiles (id, tenant_id, nama, email, role, is_active, created_at)
                VALUES ('{test_user_2}', '{test_tenant_id}', 'Kasir User Extra', 'kasir@test.com', 'Kasir', true, NOW());
            END $$;
            """
            _, raw2 = await run_query(session, user_test_sql)
            await run_query(session, "ROLLBACK;")
            if "user_limit_exceeded" in raw2.lower():
                print("✅ TEST 2 PASSED: Penambahan staf melebihi kuota berhasil diblokir server (USER_LIMIT_EXCEEDED)!")
            else:
                print(f"❌ TEST 2 FAILED: {raw2}")
                return

            # TEST 3: RPC Aktivasi Lisensi Server-Side (Upgrade ke PRO)
            print("\n[TEST 3] Aktivasi Lisensi via RPC fn_activate_license_key...")
            activate_test_sql = f"""
            DO $$
            DECLARE
                v_res JSONB;
                v_new_max INT;
            BEGIN
                -- Masukkan cabang pertama
                INSERT INTO public.branches (id, tenant_id, nama, kode, created_at)
                VALUES ('{test_branch_1}', '{test_tenant_id}', 'Cabang 1 (Utama)', 'CB1', NOW());

                -- Panggil fn_activate_license_key dengan p_tenant_id
                v_res := public.fn_activate_license_key('PRO-RELAYPOS-2026-VIP', '{test_tenant_id}'::uuid);
                
                SELECT max_branches INTO v_new_max
                FROM public.tenant_licenses
                WHERE tenant_id = '{test_tenant_id}'
                ORDER BY valid_until DESC
                LIMIT 1;

                IF v_new_max < 5 THEN
                    RAISE EXCEPTION 'TEST_FAILED: Kuota cabang tidak bertambah setelah aktivasi!';
                END IF;

                -- Sekarang masukkan cabang kedua setelah upgrade kuota ke PRO (max 5)
                INSERT INTO public.branches (id, tenant_id, nama, kode, created_at)
                VALUES ('{test_branch_2}', '{test_tenant_id}', 'Cabang 2 (Resmi Pasca-Upgrade)', 'CB2', NOW());

                RAISE NOTICE 'SUCCESS_ACTIVATION_AND_BRANCH_CREATED: %', v_res;
            END $$;
            """
            _, raw3 = await run_query(session, activate_test_sql)
            if "SUCCESS_ACTIVATION_AND_BRANCH_CREATED" in raw3 or "error" not in raw3.lower():
                # Verifikasi cabang kedua benar-benar tersimpan di database
                verify_branch_sql = f"SELECT count(*) as count FROM public.branches WHERE tenant_id = '{test_tenant_id}';"
                b_res, b_raw = await run_query(session, verify_branch_sql)
                if isinstance(b_res, list) and len(b_res) > 0:
                    b_cnt = int(b_res[0].get('count', 0))
                elif isinstance(b_res, dict):
                    b_cnt = int(b_res.get('count', 0))
                else:
                    m = re.search(r'"count":\s*(\d+)', b_raw)
                    b_cnt = int(m.group(1)) if m else 0
                if b_cnt == 2:
                    print(f"✅ TEST 3 PASSED: Aktivasi lisensi PRO sukses (max_branches = 5)! Jumlah cabang saat ini: {b_cnt}.")
                else:
                    print(f"❌ TEST 3 FAILED: Expected 2 branches, got {b_cnt} (raw: {b_raw})")
                    return
            else:
                print(f"❌ TEST 3 FAILED: {raw3}")
                return

            # TEST 4: Anon Role Execution Denial on fn_activate_license_key
            print("\n[TEST 4] Penolakan Hak Akses Role anon pada RPC Aktivasi...")
            anon_test_sql = "SET ROLE anon; SELECT public.fn_activate_license_key('HACKED-KEY-123');"
            _, raw4 = await run_query(session, anon_test_sql)
            if "permission denied" in raw4.lower() or "insufficient_privilege" in raw4.lower():
                print("✅ TEST 4 PASSED: Role anon dilarang keras memanggil RPC fn_activate_license_key (Permission Denied)!")
            else:
                print(f"❌ TEST 4 FAILED: {raw4}")
                return

            # TEST 5: Direct Table Mutation Lockdown on tenant_licenses
            print("\n[TEST 5] Proteksi Anti-Tampering RLS pada public.tenant_licenses...")
            tamper_test_sql = f"SET ROLE anon; UPDATE public.tenant_licenses SET max_branches = 999 WHERE tenant_id = '{test_tenant_id}';"
            _, raw5 = await run_query(session, tamper_test_sql)
            if "permission denied" in raw5.lower() or "insufficient_privilege" in raw5.lower():
                print("✅ TEST 5 PASSED: Klien dilarang memanipulasi kuota/status lisensi secara langsung via REST/table update!")
            else:
                print(f"❌ TEST 5 FAILED: {raw5}")
                return

            # Cleanup
            cleanup_sql = f"""
            DO $$
            BEGIN
                RESET ROLE;
                DELETE FROM public.branches WHERE tenant_id = '{test_tenant_id}';
                DELETE FROM public.profiles WHERE tenant_id = '{test_tenant_id}';
                DELETE FROM public.tenant_licenses WHERE tenant_id = '{test_tenant_id}';
                DELETE FROM public.tenants WHERE id = '{test_tenant_id}';
            END $$;
            """
            await run_query(session, cleanup_sql)
            print("\nPembersihan data pengujian selesai.")
            print("\n🎉 ALL 5 BATCH 4 RUNTIME TESTS PASSED (100% SUCCESS)!")

if __name__ == '__main__':
    asyncio.run(main())
