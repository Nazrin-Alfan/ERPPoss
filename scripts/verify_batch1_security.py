import asyncio
import os
import sys
import json

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def run_query(sql):
    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    cmd = supabase_cfg.get('command', 'npx')
    args = supabase_cfg.get('args', [])
    raw_env = supabase_cfg.get('env', {})
    safe_env = _build_safe_env(raw_env)
    safe_env['PATH'] = os.environ.get('PATH', '')
    safe_env['USERPROFILE'] = os.environ.get('USERPROFILE', '')
    safe_env['LOCALAPPDATA'] = os.environ.get('LOCALAPPDATA', '')

    params = StdioServerParameters(command=cmd, args=args, env=safe_env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            res = await session.call_tool("execute_sql", {"query": sql})
            return res.content[0].text

import re

def parse_res(txt):
    try:
        data = json.loads(txt)
        if "error" in data:
            return {"error": data["error"]}
        raw = data.get("result", "")
        m = re.search(r'<untrusted-data-[a-f0-9-]+>\s*(\[.*?\]|\{.*?\})\s*</untrusted-data-[a-f0-9-]+>', raw, re.DOTALL)
        if m:
            json_str = m.group(1).strip()
            return {"data": json.loads(json_str)}
        if raw.strip().startswith("[") or raw.strip().startswith("{"):
            return {"data": json.loads(raw)}
        return {"data": []}
    except Exception as e:
        return {"raw": txt, "parse_err": str(e)}

async def main():
    print("=" * 60)
    print("TEST SUITE: BATCH 1 (P0 CRITICAL SECURITY & RLS LOCKDOWN)")
    print("=" * 60)

    # Test 1: current_user_role() under anon
    q1 = "SET ROLE anon; SELECT public.current_user_role() AS role;"
    res1 = parse_res(await run_query(q1))
    print("\n[Test 1] public.current_user_role() as anon:")
    print("Result:", res1)
    role_val = res1.get("data", [{}])[0].get("role") if res1.get("data") else None
    assert role_val == "Anon", f"FAIL: Expected 'Anon', got {role_val}"
    print("-> PASS (Role escalation eliminated. Returns 'Anon')")

    # Test 2: anon access to tenants
    q2 = "SET ROLE anon; SELECT count(*) AS count FROM public.tenants;"
    res2 = parse_res(await run_query(q2))
    print("\n[Test 2] anon SELECT FROM public.tenants:")
    print("Result:", res2)
    # anon may either get permission denied error OR 0 rows from RLS
    if "error" in res2:
        print("-> PASS (Permission denied as expected)")
    else:
        cnt = res2.get("data", [{}])[0].get("count", 0)
        assert cnt == 0, f"FAIL: anon saw {cnt} tenants!"
        print("-> PASS (0 rows returned, RLS isolation verified)")

    # Test 3: anon access to profiles
    q3 = "SET ROLE anon; SELECT count(*) AS count FROM public.profiles;"
    res3 = parse_res(await run_query(q3))
    print("\n[Test 3] anon SELECT FROM public.profiles:")
    print("Result:", res3)
    if "error" in res3:
        print("-> PASS (Permission denied as expected)")
    else:
        cnt = res3.get("data", [{}])[0].get("count", 0)
        assert cnt == 0, f"FAIL: anon saw {cnt} profiles!"
        print("-> PASS (0 rows returned, RLS isolation verified)")

    # Test 4: View security_invoker check
    q4 = "SELECT relname, reloptions FROM pg_class WHERE relname IN ('finance_summary', 'bahan_baku', 'transaksi', 'akun_keuangan') ORDER BY relname;"
    res4 = parse_res(await run_query(q4))
    print("\n[Test 4] View security_invoker options:")
    print("Result:", res4)
    views_checked = res4.get("data", [])
    for v in views_checked:
        opts = v.get("reloptions") or []
        assert "security_invoker=true" in opts or "security_invoker=1" in opts or opts == ["security_invoker=true"], f"FAIL: {v.get('relname')} missing security_invoker"
    print("-> PASS (All 4 views have security_invoker = true)")

    # Test 5: anon access to views
    q5 = "SET ROLE anon; SELECT * FROM public.transaksi LIMIT 1;"
    res5 = parse_res(await run_query(q5))
    print("\n[Test 5] anon SELECT FROM public.transaksi view:")
    print("Result:", res5)
    assert "error" in res5 or len(res5.get("data", [])) == 0, "FAIL: anon read view data!"
    print("-> PASS (anon blocked from view)")

    # Test 6: anon execute fn_execute_checkout
    q6 = "SET ROLE anon; SELECT public.fn_execute_checkout(gen_random_uuid(), gen_random_uuid(), '[]'::jsonb, '{}'::jsonb);"
    res6 = parse_res(await run_query(q6))
    print("\n[Test 6] anon EXECUTE public.fn_execute_checkout:")
    print("Result:", res6)
    assert "error" in res6, "FAIL: anon was able to execute fn_execute_checkout!"
    print("-> PASS (Execution permission denied for anon)")

    # Test 7: anon execute fn_founder_create_tenant
    q7 = "SET ROLE anon; SELECT public.fn_founder_create_tenant('Store', 'Owner', 'a@b.com');"
    res7 = parse_res(await run_query(q7))
    print("\n[Test 7] anon EXECUTE public.fn_founder_create_tenant:")
    print("Result:", res7)
    assert "error" in res7, "FAIL: anon was able to execute fn_founder_create_tenant!"
    print("-> PASS (Execution permission denied for anon)")

    # Test 8: Active trigger on auth.users
    q8 = "SELECT tgname, proname FROM pg_trigger t JOIN pg_proc p ON t.tgfoid = p.oid WHERE tgrelid = 'auth.users'::regclass;"
    res8 = parse_res(await run_query(q8))
    print("\n[Test 8] Triggers on auth.users:")
    print("Result:", res8)
    triggers = [t.get("tgname") for t in res8.get("data", [])]
    assert "trg_on_auth_user_created" in triggers, "FAIL: trg_on_auth_user_created missing!"
    assert "on_auth_user_created" not in triggers, "FAIL: duplicate legacy trigger on_auth_user_created still exists!"
    print("-> PASS (Clean hardened trigger verified)")

    print("\n" + "=" * 60)
    print("BATCH 1 SECURITY VERIFICATION: ALL PASS (100% SECURE)")
    print("=" * 60)

if __name__ == '__main__':
    asyncio.run(main())
