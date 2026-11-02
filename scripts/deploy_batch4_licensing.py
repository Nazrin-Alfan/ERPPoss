import asyncio
import os
import sys
from pathlib import Path

# Impor helper MCP
sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters, stdio_client

async def main():
    migration_file = Path(__file__).resolve().parent.parent / 'supabase' / 'migrations' / '007_enforce_server_licensing_and_quotas.sql'
    sql_content = migration_file.read_text(encoding='utf-8')

    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    if not supabase_cfg:
        raise RuntimeError("Supabase MCP config not found")

    cmd = supabase_cfg.get('command', 'npx')
    args = supabase_cfg.get('args', [])
    raw_env = supabase_cfg.get('env', {})
    safe_env = _build_safe_env(raw_env)
    safe_env['PATH'] = os.environ.get('PATH', '')

    server_params = StdioServerParameters(
        command=cmd,
        args=args,
        env=safe_env,
    )

    print(f"Deploying Batch 4 Migration ({migration_file.name}) to Supabase Cloud...")
    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            res = await session.call_tool('execute_sql', {'query': sql_content})
            print("MIGRATION RESULT:")
            for c in res.content:
                print(c.text[:500])

if __name__ == '__main__':
    asyncio.run(main())
