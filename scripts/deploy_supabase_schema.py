"""
Deploy RelayPOS Unified Cloud Schema to Supabase via Hermes Native MCP Integration.
"""
import asyncio
import os
import re
import sys
from pathlib import Path

# Add hermes-agent to sys.path
sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SCHEMA_FILE = Path(__file__).resolve().parent.parent / 'supabase' / 'relaypos_unified_cloud_schema.sql'

def split_sql_sections(sql_text: str):
    """
    Split SQL script into logical execution sections based on domain headers.
    """
    sections = []
    current_title = "HEADER"
    current_lines = []
    
    for line in sql_text.splitlines():
        if re.match(r'^-- \d+\.', line):
            if current_lines:
                sections.append((current_title, '\n'.join(current_lines).strip()))
                current_lines = []
            current_title = line.strip()
        current_lines.append(line)
        
    if current_lines:
        sections.append((current_title, '\n'.join(current_lines).strip()))
        
    return [(t, s) for t, s in sections if s]

async def run_deployment():
    if not SCHEMA_FILE.exists():
        print(f"Error: Schema file not found at {SCHEMA_FILE}")
        sys.exit(1)
        
    print(f"Reading schema file: {SCHEMA_FILE} ({SCHEMA_FILE.stat().st_size:,} bytes)")
    raw_sql = SCHEMA_FILE.read_text(encoding='utf-8')
    sections = split_sql_sections(raw_sql)
    print(f"Divided schema into {len(sections)} logical execution sections.")

    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    if not supabase_cfg:
        print("Error: 'supabase' server not configured in Hermes config.")
        sys.exit(1)

    cmd = supabase_cfg.get('command', 'npx')
    args = supabase_cfg.get('args', [])
    raw_env = supabase_cfg.get('env', {})
    safe_env = _build_safe_env(raw_env)
    # Merge current PATH so node and npx can execute
    safe_env['PATH'] = os.environ.get('PATH', '')
    safe_env['USERPROFILE'] = os.environ.get('USERPROFILE', '')
    safe_env['LOCALAPPDATA'] = os.environ.get('LOCALAPPDATA', '')

    params = StdioServerParameters(
        command=cmd,
        args=args,
        env=safe_env
    )

    print("\nConnecting to Supabase MCP Server...")
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            init_res = await session.initialize()
            print(f"MCP Session initialized: {init_res.server_info.name} v{init_res.server_info.version}")

            print("\nExecuting schema sections...")
            for idx, (title, sql_block) in enumerate(sections, 1):
                clean_sql = sql_block.strip()
                if not clean_sql:
                    continue
                print(f"  [{idx}/{len(sections)}] Executing: {title} ...", end=" ", flush=True)
                try:
                    res = await session.call_tool("execute_sql", {"query": clean_sql})
                    if res.is_error:
                        print(f"FAILED!\nError details: {res.content}")
                        sys.exit(1)
                    else:
                        print("SUCCESS")
                except Exception as ex:
                    print(f"EXCEPTION: {ex}")
                    sys.exit(1)

            print("\nVerifying database state...")
            table_res = await session.call_tool("list_tables", {"schemas": ["public"]})
            print(f"Tables verification output:\n{table_res.content}")

if __name__ == '__main__':
    asyncio.run(run_deployment())
