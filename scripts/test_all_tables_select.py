import asyncio
import os
import sys
import json
from pathlib import Path

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ALL_TABLES = [
    'akun_keuangan', 'bahan_baku', 'barang_keluar', 'barang_masuk', 'branches',
    'cafe', 'carwash', 'carwash_packages', 'cashflow', 'chart_of_accounts',
    'crm_customers', 'crm_loyalty_programs', 'daftar_harga_menu', 'diskon',
    'finance_summary', 'karyawan_cuci', 'karyawan_kantor', 'kasir',
    'master_categories', 'metode_bayar', 'pengeluaran', 'pos_balances',
    'profiles', 'resep', 'stok_barang', 'struk', 'tenant_licenses',
    'tenants', 'transaksi'
]

async def main():
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
            
            results = {}
            for tbl in ALL_TABLES:
                query = f"SELECT count(*) as count FROM public.{tbl};"
                try:
                    res = await session.call_tool("execute_sql", {"query": query})
                    results[tbl] = {"status": "OK", "response": res.content[0].text[:100]}
                except Exception as e:
                    results[tbl] = {"status": "ERROR", "error": str(e)}
            
            print(json.dumps(results, indent=2))

if __name__ == '__main__':
    asyncio.run(main())
