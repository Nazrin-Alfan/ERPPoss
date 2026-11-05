import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def run_migration():
    migration_file = Path("supabase/migrations/20261104000001_atomic_pending_bill_settlement.sql")
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
            print("Applying Migration 20261104000001: Atomic Pending Bill Settlement...")
            res = await session.call_tool("execute_sql", {"query": sql_content})
            print("MIGRATION RESULT:", res.content[0].text)

            # Verifikasi kolom struk
            verify_struk_sql = """
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'struk' AND column_name IN ('total_cogs', 'biaya_inap', 'catatan_inap', 'idempotency_key', 'settle_hash');
            """
            v_res = await session.call_tool("execute_sql", {"query": verify_struk_sql})
            print("VERIFY STRUK COLUMNS:", v_res.content[0].text)

            # Verifikasi kolom barang_keluar
            verify_bk_sql = """
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'barang_keluar' AND column_name IN ('id_struk', 'biaya_satuan', 'total_biaya');
            """
            v_bk_res = await session.call_tool("execute_sql", {"query": verify_bk_sql})
            print("VERIFY BARANG_KELUAR COLUMNS:", v_bk_res.content[0].text)

if __name__ == "__main__":
    asyncio.run(run_migration())
