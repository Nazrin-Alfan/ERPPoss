import asyncio
import os
import sys
import json
from pathlib import Path

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

TABLES_TO_INSPECT = [
    'cafe', 'struk', 'carwash', 'karyawan_cuci', 'karyawan_kantor', 
    'stok_barang', 'master_categories', 'cashflow', 'pengeluaran', 'pos_balances'
]

async def inspect():
    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    if not supabase_cfg:
        print("Error: Supabase config not found")
        return

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

            # 1. Inspect columns
            tables_tuple = tuple(TABLES_TO_INSPECT)
            sql_cols = f"""
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name IN {tables_tuple}
            ORDER BY table_name, ordinal_position;
            """
            res = await session.call_tool("execute_sql", {"query": sql_cols})
            print("=== COLUMNS IN SUPABASE CLOUD ===")
            print(res.content)

            # 2. Inspect foreign keys
            sql_fks = """
            SELECT
                tc.table_name AS from_table, 
                kcu.column_name AS from_column, 
                ccu.table_name AS to_table,
                ccu.column_name AS to_column,
                tc.constraint_name
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
            """
            res_fk = await session.call_tool("execute_sql", {"query": sql_fks})
            print("\n=== FOREIGN KEYS IN SUPABASE CLOUD ===")
            print(res_fk.content)

if __name__ == '__main__':
    asyncio.run(inspect())
