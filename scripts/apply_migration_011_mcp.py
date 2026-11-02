import asyncio
import os
import sys
from pathlib import Path

# Impor helper MCP
sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def run_migration():
    migration_file = Path("supabase/migrations/011_reconcile_live_audit_fixes.sql")
    if not migration_file.exists():
        print(f"Error: {migration_file} does not exist.")
        sys.exit(1)

    sql_content = migration_file.read_text(encoding="utf-8")

    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    if not supabase_cfg:
        raise RuntimeError("Supabase MCP config not found")

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
            print("Applying Migration 011: Reconcile Live Audit Fixes (LIVE-01 s/d LIVE-12)...")
            res = await session.call_tool("execute_sql", {"query": sql_content})
            result_text = res.content[0].text
            print("MIGRATION RESULT:")
            print(result_text)

            # Check verification
            verify_sql = """
            SELECT proname FROM pg_proc WHERE proname IN ('fn_apply_barang_masuk_to_stock', 'fn_sync_barang_masuk', 'fn_execute_checkout', 'fn_initialize_tenant_defaults', 'fn_sync_stok_barang_advanced');
            """
            v_res = await session.call_tool("execute_sql", {"query": verify_sql})
            print("VERIFY ROUTINES:")
            print(v_res.content[0].text)

            check_lic = """
            SELECT license_key, plan, status FROM public.tenant_licenses WHERE tenant_id = '44ad5f1e-c777-4a76-8b51-251201dacdf8';
            """
            l_res = await session.call_tool("execute_sql", {"query": check_lic})
            print("VERIFY TENANT A LICENSES:")
            print(l_res.content[0].text)

if __name__ == "__main__":
    asyncio.run(run_migration())
