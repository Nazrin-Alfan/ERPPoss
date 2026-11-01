import asyncio
import os
import sys
import json
from pathlib import Path

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def execute_sql(sql):
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
            res = await session.call_tool("execute_sql", {"query": sql})
            return res.content[0].text

if __name__ == '__main__':
    sql = sys.argv[1] if len(sys.argv) > 1 else "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    out = asyncio.run(execute_sql(sql))
    print(out)
