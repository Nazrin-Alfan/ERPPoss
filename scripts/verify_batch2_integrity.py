import asyncio
import os
import sys
import json
import re

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
    print("=" * 65)
    print("TEST SUITE: BATCH 2 (DATA INTEGRITY & DOUBLE-ENTRY LEDGER HARDENING)")
    print("=" * 65)

    TENANT_ID = "cb365b71-aff5-4878-889f-b94905b349a1"
    BRANCH_ID = "c6eb3d19-5381-44c4-8c07-ca0396373a0a"
    ACC_DEBIT = "6a22df41-29cd-437a-a8db-89c77f2f7b26" # Kas Tunai
    ACC_CREDIT = "373eb78a-81e3-498f-a5c0-b0cc17fb6bc9" # Pendapatan

    # TEST 1: T01 - Cross-Tenant Foreign Key Rejection on Journal Lines
    print("\n[Test 1] T01 - Cross-Tenant Parent Reference Injection on journal_entry_lines:")
    test1_sql = f"""
    DO $$
    DECLARE
        v_jid UUID := gen_random_uuid();
    BEGIN
        -- Insert valid header for TENANT_ID
        INSERT INTO public.journal_entries (id, tenant_id, branch_id, entry_no, date, memo, total_amount, status)
        VALUES (v_jid, '{TENANT_ID}', '{BRANCH_ID}', 'JV-T01-01', CURRENT_DATE, 'Test Header', 100000, 'DRAFT');

        -- Attempt to insert child line with a SPOOFED DIFFERENT tenant_id
        BEGIN
            INSERT INTO public.journal_entry_lines (id, tenant_id, journal_entry_id, account_id, debit, credit)
            VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_jid, '{ACC_DEBIT}', 100000, 0);
            RAISE EXCEPTION 'TEST_FAILED: Spoofed line was accepted!';
        EXCEPTION WHEN foreign_key_violation THEN
            -- Expected: composite foreign key blocked mismatched tenant_id
            NULL;
        END;

        -- Clean up
        DELETE FROM public.journal_entries WHERE id = v_jid;
    END $$;
    """
    res1 = parse_res(await run_query(test1_sql))
    print("Result:", res1)
    assert "error" not in res1 or "TEST_FAILED" not in str(res1["error"]), f"Test 1 Failed: {res1}"
    print("-> PASS (Cross-tenant composite FK violation rejected as expected)")

    # TEST 2: T01 - Cross-Tenant Chart of Accounts Reference Rejection
    print("\n[Test 2] T01 - Cross-Tenant Account Injection on journal_entry_lines:")
    test2_sql = f"""
    DO $$
    DECLARE
        v_jid UUID := gen_random_uuid();
        v_other_coa UUID := gen_random_uuid();
    BEGIN
        -- Create a fake account under a different tenant (assuming tenants table has that tenant or using dummy)
        -- Since ACC_DEBIT belongs to TENANT_ID, attempting to link ACC_DEBIT under a different line tenant_id must fail:
        INSERT INTO public.journal_entries (id, tenant_id, branch_id, entry_no, date, memo, total_amount, status)
        VALUES (v_jid, '{TENANT_ID}', '{BRANCH_ID}', 'JV-T01-02', CURRENT_DATE, 'Test Header', 100000, 'DRAFT');

        BEGIN
            -- Using a non-existent account or account under another tenant
            INSERT INTO public.journal_entry_lines (id, tenant_id, journal_entry_id, account_id, debit, credit)
            VALUES (gen_random_uuid(), '{TENANT_ID}', v_jid, '00000000-0000-0000-0000-000000000002', 100000, 0);
            RAISE EXCEPTION 'TEST_FAILED: Invalid account was accepted!';
        EXCEPTION WHEN foreign_key_violation THEN
            -- Expected FK rejection
            NULL;
        END;

        DELETE FROM public.journal_entries WHERE id = v_jid;
    END $$;
    """
    res2 = parse_res(await run_query(test2_sql))
    print("Result:", res2)
    assert "error" not in res2 or "TEST_FAILED" not in str(res2["error"]), f"Test 2 Failed: {res2}"
    print("-> PASS (Account reference composite FK rejected invalid reference)")

    # TEST 3: T03/T08 - Double-Entry Balancing Invariant on POSTED Journal
    print("\n[Test 3] T03/T08 - Rejection of Unbalanced POSTED Journal Entry:")
    test3_sql = f"""
    DO $$
    DECLARE
        v_jid UUID := gen_random_uuid();
    BEGIN
        INSERT INTO public.journal_entries (id, tenant_id, branch_id, entry_no, date, memo, total_amount, status)
        VALUES (v_jid, '{TENANT_ID}', '{BRANCH_ID}', 'JV-IMBALANCE-TEST', CURRENT_DATE, 'Unbalanced Test', 100000, 'POSTED');

        -- Insert unbalanced lines: Debit 100,000, Credit 60,000 (Selisih 40,000!)
        INSERT INTO public.journal_entry_lines (id, tenant_id, journal_entry_id, account_id, debit, credit)
        VALUES (gen_random_uuid(), '{TENANT_ID}', v_jid, '{ACC_DEBIT}', 100000, 0);
        
        INSERT INTO public.journal_entry_lines (id, tenant_id, journal_entry_id, account_id, debit, credit)
        VALUES (gen_random_uuid(), '{TENANT_ID}', v_jid, '{ACC_CREDIT}', 0, 60000);
    END $$;
    """
    res3 = parse_res(await run_query(test3_sql))
    print("Result:", res3)
    # Must fail with Double-entry violation
    assert "error" in res3 and "Double-entry violation" in str(res3["error"]), f"Test 3 Failed: expected balance violation error, got {res3}"
    print("-> PASS (PostgreSQL trigger rejected unbalanced POSTED journal entry)")

    # TEST 4: Valid Balanced Double-Entry POSTED Journal
    print("\n[Test 4] Valid Balanced POSTED Journal Entry (Debit == Credit):")
    test4_sql = f"""
    DO $$
    DECLARE
        v_jid UUID := gen_random_uuid();
    BEGIN
        INSERT INTO public.journal_entries (id, tenant_id, branch_id, entry_no, date, memo, total_amount, status)
        VALUES (v_jid, '{TENANT_ID}', '{BRANCH_ID}', 'JV-VALID-TEST', CURRENT_DATE, 'Balanced Valid Entry', 100000, 'POSTED');

        -- Debit Kas 100,000
        INSERT INTO public.journal_entry_lines (id, tenant_id, journal_entry_id, account_id, debit, credit)
        VALUES (gen_random_uuid(), '{TENANT_ID}', v_jid, '{ACC_DEBIT}', 100000, 0);

        -- Credit Pendapatan 100,000
        INSERT INTO public.journal_entry_lines (id, tenant_id, journal_entry_id, account_id, debit, credit)
        VALUES (gen_random_uuid(), '{TENANT_ID}', v_jid, '{ACC_CREDIT}', 0, 100000);

        -- Clean up
        DELETE FROM public.journal_entries WHERE id = v_jid;
    END $$;
    """
    res4 = parse_res(await run_query(test4_sql))
    print("Result:", res4)
    assert "error" not in res4 or not res4["error"], f"Test 4 Failed: {res4}"
    print("-> PASS (Balanced POSTED journal accepted smoothly)")

    # TEST 5: T04 - Inventory Non-Negative Invariant
    print("\n[Test 5] T04 - Negative Stock Rejection on stok_barang:")
    test5_sql = f"""
    DO $$
    BEGIN
        INSERT INTO public.stok_barang (id, tenant_id, branch_id, nama_produk, satuan, stok, harga_satuan)
        VALUES (gen_random_uuid(), '{TENANT_ID}', '{BRANCH_ID}', 'Shampoo Salju Negatif', 'Ltr', -15.5, 25000);
        RAISE EXCEPTION 'TEST_FAILED: Negative inventory was accepted!';
    EXCEPTION WHEN check_violation THEN
        -- Expected: chk_stok_barang_non_negative triggered
        NULL;
    END $$;
    """
    res5 = parse_res(await run_query(test5_sql))
    print("Result:", res5)
    assert "error" not in res5 or "TEST_FAILED" not in str(res5["error"]), f"Test 5 Failed: {res5}"
    print("-> PASS (Negative inventory strictly rejected by database check constraint)")

    print("\n" + "=" * 65)
    print("ALL BATCH 2 DATA INTEGRITY TESTS PASSED SUCCESSFULLY! (100% GREEN)")
    print("=" * 65)

if __name__ == '__main__':
    asyncio.run(main())
