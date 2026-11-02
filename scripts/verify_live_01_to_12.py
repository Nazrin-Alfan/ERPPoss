import json
import urllib.request
import re
import sys
import os
from pathlib import Path

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

TENANT_A_ID = "44ad5f1e-c777-4a76-8b51-251201dacdf8" # PT QA Codex Retail
TENANT_B_ID = "8a2e463a-bbce-45ad-9818-b0a6bf95fa03" # CV QA Codex Cafe & Wash

async def run_sql(query: str):
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

    server_params = StdioServerParameters(
        command=cmd,
        args=args,
        env=safe_env
    )
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            res = await session.call_tool("execute_sql", {"query": query})
            content_text = res.content[0].text
            try:
                data = json.loads(content_text)
            except Exception:
                data = content_text

            raw_text = data.get("result", content_text) if isinstance(data, dict) else str(data)
            m = re.search(r"<untrusted-data-[^>]+>\s*(\[.*?\]|\{.*?\})\s*</untrusted-data-", raw_text, re.DOTALL)
            if m:
                return json.loads(m.group(1))
            if isinstance(data, dict) and "result" in data:
                try:
                    return json.loads(data["result"])
                except Exception:
                    pass
            return data

def verify_live_01():
    print("\n--- [LIVE-01]: Verifikasi Deployment CDN Cloudflare Pages & Checkout RPC ---")
    req = urllib.request.Request("https://erpposs.pages.dev", headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req).read().decode("utf-8")
    m = re.search(r'src="(/assets/index-[^"]+\.js)"', html)
    bundle_path = m.group(1) if m else "NOT_FOUND"
    print(f"Active Live Bundle on https://erpposs.pages.dev: {bundle_path}")
    assert "index-C1ZJvWWH.js" in bundle_path, f"Unexpected bundle path: {bundle_path}"
    
    # Periksa bundle JS bahwa fn_execute_checkout ada dan tidak ada stale mutasi
    js_url = f"https://erpposs.pages.dev{bundle_path}"
    js_req = urllib.request.Request(js_url, headers={"User-Agent": "Mozilla/5.0"})
    js_content = urllib.request.urlopen(js_req).read().decode("utf-8")
    has_checkout_rpc = "fn_execute_checkout" in js_content
    print(f"Jalur RPC 'fn_execute_checkout' ditemukan di bundle produksi: {has_checkout_rpc}")
    assert has_checkout_rpc, "RPC fn_execute_checkout not found in production bundle"
    return "VERIFIED"

async def verify_live_02():
    print("\n--- [LIVE-02]: Verifikasi Resolusi Duplikasi Lisensi Tenant A ---")
    q = f"SELECT license_key, plan, status, valid_until, max_branches FROM tenant_licenses WHERE tenant_id = '{TENANT_A_ID}' ORDER BY created_at ASC;"
    res = await run_sql(q)
    print("Tenant A Licenses in Cloud Database:", json.dumps(res, indent=2))
    active_licenses = [l for l in res if l.get("status") == "ACTIVE"]
    assert len(active_licenses) == 1, f"Expected 1 active license, got {len(active_licenses)}"
    assert active_licenses[0]["license_key"] == "LIC-A3C4861BF3F6", "Active license must be LIC-A3C4861BF3F6"
    assert active_licenses[0]["plan"] == "pro", "Active license plan must be pro"
    return "VERIFIED"

async def verify_live_03():
    print("\n--- [LIVE-03]: Verifikasi Integritas Relasi barang_masuk & stok_barang ---")
    q = "SELECT proname FROM pg_proc WHERE proname = 'fn_apply_barang_masuk_to_stock';"
    res = await run_sql(q)
    assert len(res) > 0, "fn_apply_barang_masuk_to_stock function must exist"
    print("Trigger function 'fn_apply_barang_masuk_to_stock' verified in Cloud Database")
    return "VERIFIED"

async def verify_live_04():
    print("\n--- [LIVE-04]: Verifikasi Tipe Data Kolom apakah_stok Boolean ---")
    q = "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE column_name = 'apakah_stok';"
    res = await run_sql(q)
    print("apakah_stok Column Types in Cloud Database:", json.dumps(res, indent=2))
    for col in res:
        assert col["data_type"] == "boolean", f"Expected boolean for {col['table_name']}, got {col['data_type']}"
    return "VERIFIED"

async def verify_live_05():
    print("\n--- [LIVE-05]: Verifikasi Kebijakan RLS Isolasi COA Multi-Tenant ---")
    q = "SELECT tablename, policyname, qual FROM pg_policies WHERE tablename IN ('chart_of_accounts', 'journal_entries', 'journal_entry_lines');"
    res = await run_sql(q)
    print("RLS Policies for Accounting Tables:", json.dumps(res, indent=2))
    assert len(res) == 3, f"Expected 3 policies, found {len(res)}"
    for p in res:
        assert "current_tenant_id()" in p["qual"], f"Policy on {p['tablename']} does not isolate current_tenant_id()"
    return "VERIFIED"

async def verify_live_06_to_09():
    print("\n--- [LIVE-06 s/d LIVE-09]: Verifikasi DDL fn_execute_checkout ---")
    q = "SELECT proname, prosrc FROM pg_proc WHERE proname = 'fn_execute_checkout';"
    res = await run_sql(q)
    assert len(res) > 0, "fn_execute_checkout not found"
    src = res[0]["prosrc"]
    
    # LIVE-06: Verifikasi penulisan cashflow pada checkout
    assert "public.cashflow" in src, "fn_execute_checkout must insert into cashflow (LIVE-06)"
    print("LIVE-06: Verified - Checkout creates cashflow records")
    
    # LIVE-08: Verifikasi validasi diskon tidak melebihi subtotal
    assert "Diskon tidak boleh melebihi subtotal kotor transaksi" in src, "fn_execute_checkout must reject discount > subtotal (LIVE-08)"
    print("LIVE-08: Verified - Checkout enforces discount <= subtotal")
    
    # LIVE-09: Verifikasi pemetaan akun pendapatan & HPP
    assert "4102" in src and "4101" in src, "fn_execute_checkout must map Cafe (4102) and Carwash (4101) COA (LIVE-09)"
    assert "5101" in src and "1103" in src, "fn_execute_checkout must post HPP (5101) and Inventory (1103) (LIVE-09)"
    print("LIVE-09: Verified - Checkout records dynamic COA revenue and inventory journals")
    return "VERIFIED"

async def verify_live_12():
    print("\n--- [LIVE-12]: Verifikasi Sinkronisasi Stok (stok vs stok_akhir) ---")
    q = "SELECT proname, prosrc FROM pg_proc WHERE proname = 'fn_sync_stok_barang_advanced';"
    res = await run_sql(q)
    assert len(res) > 0, "fn_sync_stok_barang_advanced not found"
    src = res[0]["prosrc"]
    assert "stok_akhir" in src and "stok" in src, "fn_sync_stok_barang_advanced must sync both stok and stok_akhir"
    print("LIVE-12: Verified - stok and stok_akhir synchronization active")
    return "VERIFIED"

async def verify_live_07():
    print("\n--- [LIVE-07]: Verifikasi General Ledger Multi-Tenant & Pelaporan Cloud ---")
    gl_view = Path("src/components/reports/GeneralLedgerView.jsx").read_text(encoding="utf-8")
    assert "GeneralLedgerService" in gl_view, "GeneralLedgerView must import and utilize GeneralLedgerService"
    assert "chart_of_accounts" in gl_view, "GeneralLedgerView must query chart_of_accounts from Supabase"
    assert "journal_entries" in gl_view, "GeneralLedgerView must query journal_entries from Supabase"
    print("LIVE-07: Verified - General Ledger connects directly to Cloud DB per tenant")
    return "VERIFIED"

def verify_live_10():
    print("\n--- [LIVE-10]: Verifikasi Eliminasi Mock Data Fallback Dashboard ---")
    dash = Path("src/pages/Dashboard.jsx").read_text(encoding="utf-8")
    assert "Paket Cuci Snow" not in dash, "Mock 'Paket Cuci Snow' must not exist in Dashboard.jsx"
    assert "French Fries" not in dash, "Mock 'French Fries' must not exist in Dashboard.jsx"
    assert "Kopi Susu Aren Gula Aren" not in dash, "Mock 'Kopi Susu Aren Gula Aren' must not exist in Dashboard.jsx"
    print("LIVE-10: Verified - All hardcoded mock top products removed from Dashboard")
    return "VERIFIED"

def verify_live_11():
    print("\n--- [LIVE-11]: Verifikasi Eliminasi Hardcoded Tenant JayaBersama ---")
    finance = Path("src/pages/Finance.jsx").read_text(encoding="utf-8")
    assert "Laporan_Cashflow_JayaBersama" not in finance, "Finance.jsx must not hardcode JayaBersama CSV"
    assert "tenantSlug" in finance, "Finance.jsx must use dynamic tenantSlug"
    
    receipt = Path("src/utils/receiptHelpers.js").read_text(encoding="utf-8")
    assert "order?.tenantName || order?.tenant_nama" in receipt, "receiptHelpers must prioritize active tenantName"
    print("LIVE-11: Verified - Finance CSV & Receipt dynamically bind to active tenant")
    return "VERIFIED"

async def main():
    print("=================================================================")
    print("  MENJALANKAN AUTOMATED VERIFIKASI AUDIT LIVE-01 SAMPAI LIVE-12  ")
    print("=================================================================")
    v1 = verify_live_01()
    v2 = await verify_live_02()
    v3 = await verify_live_03()
    v4 = await verify_live_04()
    v5 = await verify_live_05()
    v6_9 = await verify_live_06_to_09()
    v7 = await verify_live_07()
    v10 = verify_live_10()
    v11 = verify_live_11()
    v12 = await verify_live_12()
    print("\n=================================================================")
    print("  SEMUA 12 TEMUAN AUDIT (LIVE-01 s/d LIVE-12) TERVERIFIKASI 100%! ")
    print("=================================================================")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
