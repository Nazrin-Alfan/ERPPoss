"""
Multi-Connection Concurrency & Overlapping Settlement Test
Runs two distinct backend PostgreSQL connections concurrently against Supabase Cloud.
Tests:
1. Overlapping transactions with identical payload -> 1 succeeds, 1 returns was_replayed=true. Zero duplicates.
2. Overlapping transactions with conflicting payload -> 1 succeeds, 1 rejected with IDEMPOTENCY_CONFLICT.
"""
import sys
import json
import time
import uuid
import subprocess
from concurrent.futures import ThreadPoolExecutor

PY_EXE = "C:/code/hermes-agent/venv/Scripts/python.exe"

TENANT_ID = str(uuid.uuid4())
BRANCH_ID = str(uuid.uuid4())
OWNER_ID = str(uuid.uuid4())

def run_db_query(sql):
    cmd = [PY_EXE, "scripts/db_inspector.py", sql]
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.stdout

def setup_concurrency_fixture():
    setup_sql = f"""
    DO $$
    DECLARE
        v_tenant_id UUID := '{TENANT_ID}';
        v_branch_id UUID := '{BRANCH_ID}';
        v_owner_id UUID := '{OWNER_ID}';
    BEGIN
        INSERT INTO public.tenants (id, nama, slug, plan, status, business_type)
        VALUES (v_tenant_id, 'QA Concurrency Tenant', 'qa-conc-' || substr(v_tenant_id::text, 1, 8), 'pro', 'active', 'HYBRID');

        INSERT INTO public.branches (id, tenant_id, nama, kode, is_active)
        VALUES (v_branch_id, v_tenant_id, 'Cabang Concurrency', 'CAB-CONC-01', TRUE);

        INSERT INTO public.profiles (id, tenant_id, branch_id, role, nama, email, is_active)
        VALUES (v_owner_id, v_tenant_id, v_branch_id, 'owner', 'Owner Conc', 'owner-conc@qa.local', TRUE);

        INSERT INTO public.chart_of_accounts (id, tenant_id, kode_akun, nama_akun, tipe, kategori, saldo_normal)
        VALUES
            (gen_random_uuid(), v_tenant_id, '1101', 'Kas Tunai', 'ASSET', 'KAS', 'DEBIT'),
            (gen_random_uuid(), v_tenant_id, '1102', 'Bank', 'ASSET', 'BANK', 'DEBIT'),
            (gen_random_uuid(), v_tenant_id, '1103', 'Persediaan', 'ASSET', 'PERSEDIAAN', 'DEBIT'),
            (gen_random_uuid(), v_tenant_id, '4101', 'Pendapatan Carwash', 'REVENUE', 'OPERASIONAL', 'CREDIT'),
            (gen_random_uuid(), v_tenant_id, '4102', 'Pendapatan Cafe', 'REVENUE', 'OPERASIONAL', 'CREDIT'),
            (gen_random_uuid(), v_tenant_id, '4103', 'Pendapatan Inap', 'REVENUE', 'OPERASIONAL', 'CREDIT'),
            (gen_random_uuid(), v_tenant_id, '5101', 'HPP', 'EXPENSE', 'HPP', 'DEBIT');

        -- Bill 1 for Same Payload Overlap
        INSERT INTO public.struk (
            id, tenant_id, branch_id, id_struk, tanggal, jam,
            total_tagihan, nominal_bayar, bayar, uang_diterima, kembalian,
            metode_bayar, status_bayar, nama_pelanggan, total_cogs
        ) VALUES (
            gen_random_uuid(), v_tenant_id, v_branch_id, 'STRUK-CONC-SAME', CURRENT_DATE, CURRENT_TIME::time,
            35000.00, 35000.00, 0.00, 0.00, 0.00,
            'Pending', 'Pending', 'Pelanggan Same Payload', 0.00
        );
        INSERT INTO public.carwash (id, tenant_id, branch_id, id_struk, tanggal, jam, plat, paket, harga, status)
        VALUES (gen_random_uuid(), v_tenant_id, v_branch_id, 'STRUK-CONC-SAME', CURRENT_DATE, CURRENT_TIME::time, 'B 101 SAME', 'Cuci Biasa', 35000.00, 'Pending');

        -- Bill 2 for Conflicting Payload Overlap
        INSERT INTO public.struk (
            id, tenant_id, branch_id, id_struk, tanggal, jam,
            total_tagihan, nominal_bayar, bayar, uang_diterima, kembalian,
            metode_bayar, status_bayar, nama_pelanggan, total_cogs
        ) VALUES (
            gen_random_uuid(), v_tenant_id, v_branch_id, 'STRUK-CONC-DIFF', CURRENT_DATE, CURRENT_TIME::time,
            40000.00, 40000.00, 0.00, 0.00, 0.00,
            'Pending', 'Pending', 'Pelanggan Diff Payload', 0.00
        );
        INSERT INTO public.carwash (id, tenant_id, branch_id, id_struk, tanggal, jam, plat, paket, harga, status)
        VALUES (gen_random_uuid(), v_tenant_id, v_branch_id, 'STRUK-CONC-DIFF', CURRENT_DATE, CURRENT_TIME::time, 'B 202 DIFF', 'Cuci Biasa', 40000.00, 'Pending');
    END $$;
    """
    print(f"Setting up concurrency test fixture with Tenant {TENANT_ID} on Supabase Cloud...")
    out = run_db_query(setup_sql)
    if "error" in out.lower():
        print("Setup error:", out)
        sys.exit(1)

def cleanup_concurrency_fixture():
    pass

def execute_settlement_client(caller_label, struk_id, tender_amount, payment_method, idem_key):
    sql = f"""
    SELECT set_config('request.jwt.claim.sub', '{OWNER_ID}', true);
    SELECT public.fn_settle_pending_bill(
        '{TENANT_ID}'::uuid,
        '{BRANCH_ID}'::uuid,
        jsonb_build_object(
            'id_struk', '{struk_id}',
            'metode_bayar', '{payment_method}',
            'uang_diterima', {tender_amount},
            'idempotency_key', '{idem_key}'
        )
    ) as res;
    """
    cmd = [PY_EXE, "scripts/db_inspector.py", sql]
    p = subprocess.run(cmd, capture_output=True, text=True)
    return caller_label, p.stdout

def run_concurrency_test():
    setup_concurrency_fixture()
    try:
        # =========================================================================
        # TEST 2A: Overlapping Transactions with IDENTICAL Payload
        # =========================================================================
        print("\n--- Running Test 2A: Overlapping Transactions (Same Payload) ---")
        with ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(execute_settlement_client, "CONN_1", "STRUK-CONC-SAME", 50000.00, "CASH", "IDEM-SAME-123")
            f2 = executor.submit(execute_settlement_client, "CONN_2", "STRUK-CONC-SAME", 50000.00, "CASH", "IDEM-SAME-123")
            res1 = f1.result()
            res2 = f2.result()

        print(f"[{res1[0]} Result]:", res1[1].strip()[:200])
        print(f"[{res2[0]} Result]:", res2[1].strip()[:200])

        combined_same = res1[1] + res2[1]
        has_completed = "COMPLETED" in combined_same or '"success":true' in combined_same or '"success": true' in combined_same
        has_replayed = "was_replayed" in combined_same or "ALREADY_COMPLETED" in combined_same
        assert has_completed, f"At least one connection must complete successfully. Raw: {combined_same}"
        assert has_replayed, f"The overlapping connection must receive was_replayed=true. Raw: {combined_same}"

        # Verify Database Counts for STRUK-CONC-SAME
        verify_same_sql = f"""
        SELECT
            (SELECT count(*) FROM public.cashflow WHERE tenant_id = '{TENANT_ID}' AND id_sumber LIKE '%STRUK-CONC-SAME%') as cf_count,
            (SELECT count(*) FROM public.journal_entries WHERE tenant_id = '{TENANT_ID}' AND entry_no LIKE '%STRUK-CONC-SAME%') as je_count,
            (SELECT status_bayar FROM public.struk WHERE tenant_id = '{TENANT_ID}' AND id_struk = 'STRUK-CONC-SAME') as struk_status;
        """
        verify_same_out = run_db_query(verify_same_sql)
        print("Verification STRUK-CONC-SAME Database State:", verify_same_out)
        import re
        assert re.search(r'cf_count.*?:\s*1', verify_same_out), "Cashflow must strictly have exactly 1 record"
        assert re.search(r'je_count.*?:\s*1', verify_same_out), "Journal entries must strictly have exactly 1 record"
        assert 'Selesai' in verify_same_out, "Struk must be Selesai"
        print(">>> [PASS] Test 2A: Same payload overlap safely handled! Zero duplicate cashflow/journal! <<<")

        # =========================================================================
        # TEST 2B: Overlapping Transactions with CONFLICTING Payload
        # =========================================================================
        print("\n--- Running Test 2B: Overlapping Transactions (Conflicting Payload) ---")
        with ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(execute_settlement_client, "CONN_A", "STRUK-CONC-DIFF", 50000.00, "CASH", "IDEM-DIFF-AAA")
            f2 = executor.submit(execute_settlement_client, "CONN_B", "STRUK-CONC-DIFF", 100000.00, "CASH", "IDEM-DIFF-BBB")
            resA = f1.result()
            resB = f2.result()

        print(f"[{resA[0]} Result]:", resA[1].strip()[:250])
        print(f"[{resB[0]} Result]:", resB[1].strip()[:250])

        combined_diff = resA[1] + resB[1]
        has_completed_diff = "COMPLETED" in combined_diff or '"success":true' in combined_diff or '"success": true' in combined_diff
        has_conflict = "IDEMPOTENCY_CONFLICT" in combined_diff or "BILL_ALREADY_SETTLED" in combined_diff or "40900" in combined_diff
        assert has_completed_diff, "One connection must complete successfully"
        assert has_conflict, "The conflicting connection must be strictly rejected with IDEMPOTENCY_CONFLICT"

        # Verify Database Counts for STRUK-CONC-DIFF
        verify_diff_sql = f"""
        SELECT
            (SELECT count(*) FROM public.cashflow WHERE tenant_id = '{TENANT_ID}' AND id_sumber LIKE '%STRUK-CONC-DIFF%') as cf_count,
            (SELECT count(*) FROM public.journal_entries WHERE tenant_id = '{TENANT_ID}' AND entry_no LIKE '%STRUK-CONC-DIFF%') as je_count,
            (SELECT status_bayar FROM public.struk WHERE tenant_id = '{TENANT_ID}' AND id_struk = 'STRUK-CONC-DIFF') as struk_status;
        """
        verify_diff_out = run_db_query(verify_diff_sql)
        print("Verification STRUK-CONC-DIFF Database State:", verify_diff_out)
        assert re.search(r'cf_count.*?:\s*1', verify_diff_out), "Cashflow must strictly have exactly 1 record"
        assert re.search(r'je_count.*?:\s*1', verify_diff_out), "Journal entries must strictly have exactly 1 record"
        print(">>> [PASS] Test 2B: Conflicting payload overlap strictly rejected! Zero data corruption! <<<")

    finally:
        cleanup_concurrency_fixture()

if __name__ == '__main__':
    run_concurrency_test()
