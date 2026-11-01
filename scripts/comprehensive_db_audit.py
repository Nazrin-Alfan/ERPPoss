import asyncio
import os
import sys
import json
from pathlib import Path

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    if not supabase_cfg:
        print("Error: 'supabase' server not configured.")
        sys.exit(1)
        
    cmd = supabase_cfg.get('command', 'npx')
    args = supabase_cfg.get('args', [])
    safe_env = _build_safe_env(supabase_cfg.get('env', {}))
    safe_env['PATH'] = os.environ.get('PATH', '')
    safe_env['USERPROFILE'] = os.environ.get('USERPROFILE', '')
    safe_env['LOCALAPPDATA'] = os.environ.get('LOCALAPPDATA', '')

    params = StdioServerParameters(command=cmd, args=args, env=safe_env)
    
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # 1. Get all public tables and their columns
            sql_cols = """
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position;
            """
            res_cols = await session.call_tool("execute_sql", {"query": sql_cols})
            raw_cols = res_cols.content[0].text if hasattr(res_cols, 'content') and res_cols.content else str(res_cols)
            
            # 2. Get all Foreign Keys
            sql_fks = """
            SELECT
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public';
            """
            res_fks = await session.call_tool("execute_sql", {"query": sql_fks})
            raw_fks = res_fks.content[0].text if hasattr(res_fks, 'content') and res_fks.content else str(res_fks)

            # 3. Get all triggers
            sql_trg = """
            SELECT event_object_table, trigger_name, action_timing, event_manipulation
            FROM information_schema.triggers
            WHERE trigger_schema = 'public';
            """
            res_trg = await session.call_tool("execute_sql", {"query": sql_trg})
            raw_trg = res_trg.content[0].text if hasattr(res_trg, 'content') and res_trg.content else str(res_trg)

            with open("scripts/audit_output.json", "w", encoding="utf-8") as f:
                json.dump({
                    "columns": json.loads(raw_cols),
                    "fks": json.loads(raw_fks),
                    "triggers": json.loads(raw_trg)
                }, f, indent=2)
            print("Successfully written audit_output.json")

asyncio.run(main())
