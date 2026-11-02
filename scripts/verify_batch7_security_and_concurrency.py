import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

# Impor helper MCP
sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Pelacak Hasil Pengujian Terstruktur (QA-01)
test_results = []

def record_test(case_id, category, description, passed, details=""):
    test_results.append({
        "case_id": case_id,
        "category": category,
        "description": description,
        "status": "PASS" if passed else "FAIL",
        "details": details
    })
    badge = "[PASS]" if passed else "[FAIL]"
    print(f"  {badge} {case_id}: {description}")
    if not passed or details:
        print(f"         Detail: {details}")

async def execute_query(sql_query):
    cfg = _load_mcp_config()
    supabase_cfg = cfg['supabase']
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
            res = await session.call_tool("execute_sql", {"query": sql_query})
            raw_text = res.content[0].text
            return raw_text

def parse_sql_result(raw_text):
    if "result" not in raw_text:
        return []
    try:
        data = json.loads(raw_text)
        res_str = data.get("result", "")
        if "<untrusted-data-" in res_str:
            lines = res_str.split("\n")
            json_lines = []
            capture = False
            for line in lines:
                if line.startswith("<untrusted-data-"):
                    capture = True
                    continue
                if line.startswith("</untrusted-data-"):
                    capture = False
                    continue
                if capture:
                    json_lines.append(line)
            return json.loads("\n".join(json_lines))
        return json.loads(res_str)
    except Exception as e:
        return [{"raw": raw_text, "error": str(e)}]

async def main():
    print("=" * 80)
    print("=== LIVE RUNTIME AUDIT SUITE: BATCH 7 (SECURITY, IDEMPOTENCY & CONCURRENCY) ===")
    print("=" * 80)

    # 1. SETUP TEST FIXTURES
    t_a_id = "77777777-aaaa-4444-aaaa-aaaaaaaaaaaa"
    t_b_id = "77777777-bbbb-4444-bbbb-bbbbbbbbbbbb"
    t_qa_id = "77777777-cccc-4444-cccc-cccccccccccc"
    br_a1_id = "88888888-aa11-4444-aaaa-aaaaaaaaaaaa"
    br_a2_id = "88888888-aa22-4444-aaaa-aaaaaaaaaaaa"
    usr_owner_a_id = "99999999-aaaa-4444-aaaa-aaaaaaaaaaaa"
    usr_kasir_a1_id = "99999999-aa11-4444-aaaa-aaaaaaaaaaaa"
    usr_inact_a_id = "99999999-aa00-4444-aaaa-aaaaaaaaaaaa"
    usr_kasir_b_id = "99999999-bb11-4444-bbbb-bbbbbbbbbbbb"

    print("[SETUP] Inisialisasi Tenant, Cabang, Pengguna, Katalog & Inventori Pengujian...")
    setup_sql = f"""
    DO $$
    BEGIN
        -- 1. Setup Tenants
        INSERT INTO public.tenants (id, nama, slug, plan, status, is_test_tenant)
        VALUES 
            ('{t_a_id}', 'Tenant A Prod', 'tenant-a-prod', 'pro', 'active', FALSE),
            ('{t_b_id}', 'Tenant B Prod', 'tenant-b-prod', 'pro', 'active', FALSE),
            ('{t_qa_id}', 'Tenant QA Testing', 'tenant-qa-test', 'pro', 'active', TRUE)
        ON CONFLICT (id) DO UPDATE SET is_test_tenant = EXCLUDED.is_test_tenant;

        -- 2. Setup Branches for Tenant A
        INSERT INTO public.branches (id, tenant_id, nama, kode, status)
        VALUES 
            ('{br_a1_id}', '{t_a_id}', 'Cabang A1 Utama', 'CBA1', 'ACTIVE'),
            ('{br_a2_id}', '{t_a_id}', 'Cabang A2 Kedua', 'CBA2', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;

        -- 3. Setup Profiles
        INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
        VALUES 
            ('{usr_owner_a_id}', '{t_a_id}', '{br_a1_id}', 'Owner A', 'owner.a@relaypos.test', 'owner', TRUE),
            ('{usr_kasir_a1_id}', '{t_a_id}', '{br_a1_id}', 'Kasir A1', 'kasir.a1@relaypos.test', 'kasir', TRUE),
            ('{usr_inact_a_id}', '{t_a_id}', '{br_a1_id}', 'Nonaktif A', 'inactive.a@relaypos.test', 'kasir', FALSE),
            ('{usr_kasir_b_id}', '{t_b_id}', NULL, 'Kasir B', 'kasir.b@relaypos.test', 'kasir', TRUE)
        ON CONFLICT (id) DO UPDATE 
        SET tenant_id = EXCLUDED.tenant_id,
            branch_id = EXCLUDED.branch_id,
            role = EXCLUDED.role,
            is_active = EXCLUDED.is_active;

        -- 4. Setup Chart of Accounts
        INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe_akun)
        VALUES 
            ('{t_a_id}', '1101', 'Kas Operasional A', 'Aset Lancar'),
            ('{t_a_id}', '4101', 'Pendapatan Penjualan A', 'Pendapatan')
        ON CONFLICT (tenant_id, kode_akun) DO NOTHING;

        -- 5. Setup Catalog & Inventory for Tenant A
        DELETE FROM public.barang_keluar WHERE tenant_id = '{t_a_id}';
        DELETE FROM public.resep WHERE tenant_id = '{t_a_id}';
        DELETE FROM public.daftar_harga_menu WHERE tenant_id = '{t_a_id}';
        DELETE FROM public.stok_barang WHERE tenant_id = '{t_a_id}';
        DELETE FROM public.carwash_packages WHERE tenant_id = '{t_a_id}';

        INSERT INTO public.daftar_harga_menu (tenant_id, branch_id, nama_menu, kategori, harga, is_active)
        VALUES ('{t_a_id}', '{br_a1_id}', 'Kopi Susu B7', 'Minuman', 25000.00, TRUE);

        INSERT INTO public.stok_barang (tenant_id, branch_id, nama_produk, kategori, satuan, stok, stok_minimum, harga_beli, harga_jual)
        VALUES ('{t_a_id}', '{br_a1_id}', 'Susu Segar B7', 'Bahan Baku', 'Liter', 10.0000, 1.0000, 15000.00, 0.00);

        INSERT INTO public.resep (tenant_id, nama_menu, nama_bahan, jumlah, satuan)
        VALUES ('{t_a_id}', 'Kopi Susu B7', 'Susu Segar B7', 1.0000, 'Liter');

        INSERT INTO public.carwash_packages (tenant_id, branch_id, name, price, is_active)
        VALUES ('{t_a_id}', '{br_a1_id}', 'Cuci Salju B7', 50000.00, TRUE);
    END $$;
    """
    await execute_query(setup_sql)
    print("  [OK] Seluruh Fixture Siap.\n")

    # =========================================================================
    # TEST SUITE 1: SEC-01 OTORISASI PEMANGGIL CHECKOUT (fn_execute_checkout)
    # =========================================================================
    print("--- TEST SUITE 1: SEC-01 OTORISASI PEMANGGIL CHECKOUT ---")

    # 1a. Anonymous Checkout Rejection
    sql_1a = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid,
                '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-ANON-01", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
                '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
                NULL
            );
            RAISE EXCEPTION 'TEST_FAIL: Anonymous checkout seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%UNAUTHORIZED%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_1a = await execute_query(sql_1a)
    p_1a = "SUCCESS_DETECTED" in res_1a and "TEST_FAIL" not in res_1a
    record_test("TC_SEC_01A", "SECURITY", "Panggilan checkout tanpa login (Anonim) ditolak", p_1a, res_1a[:120])

    # 1b. Inactive User Checkout Rejection
    sql_1b = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_inact_a_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid,
                '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-INACT-01", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
                '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
                NULL
            );
            RAISE EXCEPTION 'TEST_FAIL: Inactive user checkout seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%USER_INACTIVE%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_1b = await execute_query(sql_1b)
    p_1b = "SUCCESS_DETECTED" in res_1b and "TEST_FAIL" not in res_1b
    record_test("TC_SEC_01B", "SECURITY", "Panggilan checkout oleh user nonaktif ditolak", p_1b, res_1b[:120])

    # 1c. Cross-Tenant Checkout Rejection (Kasir B memanggil Tenant A)
    sql_1c = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_b_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid,
                '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-X-TENANT-01", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
                '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
                NULL
            );
            RAISE EXCEPTION 'TEST_FAIL: Cross-tenant checkout seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%TENANT_FORBIDDEN%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_1c = await execute_query(sql_1c)
    p_1c = "SUCCESS_DETECTED" in res_1c and "TEST_FAIL" not in res_1c
    record_test("TC_SEC_01C", "SECURITY", "Kasir Tenant B mencoba checkout di Tenant A ditolak (Cross-Tenant)", p_1c, res_1c[:120])

    # 1d. Branch Mismatch Rejection (Kasir A1 memanggil Cabang A2)
    sql_1d = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid,
                '{br_a2_id}'::uuid,
                '{{"id_struk": "STRUK-X-BRANCH-01", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
                '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
                NULL
            );
            RAISE EXCEPTION 'TEST_FAIL: Kasir cabang A1 di cabang A2 seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%BRANCH_FORBIDDEN%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_1d = await execute_query(sql_1d)
    p_1d = "SUCCESS_DETECTED" in res_1d and "TEST_FAIL" not in res_1d
    record_test("TC_SEC_01D", "SECURITY", "Kasir Cabang A1 mencoba checkout di Cabang A2 ditolak (Branch Mismatch)", p_1d, res_1d[:120])

    # 1e. Authorized Checkout Success
    sql_1e = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        DELETE FROM public.struk WHERE tenant_id = '{t_a_id}'::uuid AND id_struk = 'STRUK-AUTH-OK-01';
        v_res := public.fn_execute_checkout(
            '{t_a_id}'::uuid,
            '{br_a1_id}'::uuid,
            '{{"id_struk": "STRUK-AUTH-OK-01", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
            '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
            NULL
        );
        IF v_res->>'status' = 'SUCCESS' THEN
            RAISE NOTICE 'SUCCESS_DETECTED: Checkout berhasil';
        ELSE
            RAISE EXCEPTION 'TEST_FAIL: Checkout gagal: %', v_res;
        END IF;
    END $$;
    """
    res_1e = await execute_query(sql_1e)
    p_1e = "SUCCESS_DETECTED" in res_1e and "TEST_FAIL" not in res_1e
    record_test("TC_SEC_01E", "HAPPY_PATH", "Kasir berwenang pada cabang yang sesuai sukses checkout", p_1e, res_1e[:120])

    # =========================================================================
    # TEST SUITE 2: SEC-02 & API-01 AKTIVASI LISENSI
    # =========================================================================
    print("\n--- TEST SUITE 2: SEC-02 & API-01 AKTIVASI LISENSI ---")

    # Terbitkan Kunci Uji Coba Dinamis Resmi
    key_gen_sql = """
    SELECT public.fn_admin_generate_license_key('pro'::varchar, 5::int, 10::int, 365::int, 'Test Pro Key'::text, FALSE) as k_prod,
           public.fn_admin_generate_license_key('enterprise'::varchar, 20::int, 50::int, 365::int, 'Test QA Key'::text, TRUE) as k_test;
    """
    gen_res = parse_sql_result(await execute_query(key_gen_sql))
    k_prod = gen_res[0]['k_prod']['license_key']
    k_test = gen_res[0]['k_test']['license_key']
    print(f"  [KEY_GEN] Generated Prod Key: {k_prod}, Test Key: {k_test}")

    # 2a. Anon Call Rejection
    sql_2a = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '', true);
        BEGIN
            v_res := public.fn_activate_license_key('{k_prod}', '{t_a_id}'::uuid);
            RAISE EXCEPTION 'TEST_FAIL: Anonymous aktivasi lisensi seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%UNAUTHORIZED%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_2a = await execute_query(sql_2a)
    p_2a = "SUCCESS_DETECTED" in res_2a and "TEST_FAIL" not in res_2a
    record_test("TC_SEC_02A", "SECURITY", "Panggilan aktivasi lisensi tanpa otentikasi ditolak", p_2a, res_2a[:120])

    # 2b. Kasir Role Rejection
    sql_2b = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_activate_license_key('{k_prod}', '{t_a_id}'::uuid);
            RAISE EXCEPTION 'TEST_FAIL: Kasir aktivasi lisensi seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%FORBIDDEN_LICENSE_ACTIVATION%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_2b = await execute_query(sql_2b)
    p_2b = "SUCCESS_DETECTED" in res_2b and "TEST_FAIL" not in res_2b
    record_test("TC_SEC_02B", "SECURITY", "Kasir mencoba mengaktifkan lisensi ditolak (Role Boundary)", p_2b, res_2b[:120])

    # 2c. Cross-Tenant Activation Rejection (Owner A mengaktifkan lisensi Tenant B)
    sql_2c = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_owner_a_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_activate_license_key('{k_prod}', '{t_b_id}'::uuid);
            RAISE EXCEPTION 'TEST_FAIL: Cross-tenant license activation seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%TENANT_FORBIDDEN%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_2c = await execute_query(sql_2c)
    p_2c = "SUCCESS_DETECTED" in res_2c and "TEST_FAIL" not in res_2c
    record_test("TC_SEC_02C", "SECURITY", "Owner Tenant A mencoba aktivasi lisensi Tenant B ditolak", p_2c, res_2c[:120])

    # 2d. Test Key Restriction on Production Tenant
    sql_2d = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_owner_a_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_activate_license_key('{k_test}', '{t_a_id}'::uuid);
            RAISE EXCEPTION 'TEST_FAIL: Test key pada tenant produksi seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%TEST_KEY_RESTRICTED%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_2d = await execute_query(sql_2d)
    p_2d = "SUCCESS_DETECTED" in res_2d and "TEST_FAIL" not in res_2d
    record_test("TC_SEC_02D", "SECURITY", "Kunci lisensi is_test pada tenant produksi ditolak (Bypass Prevention)", p_2d, res_2d[:120])

    # 2e. Authorized Owner Single-Parameter Call Success (API-01 & SEC-02)
    sql_2e = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_owner_a_id}", "role": "authenticated"}}', true);
        -- Panggil tanpa p_tenant_id (default null) sesuai pemanggilan client frontend!
        v_res := public.fn_activate_license_key('{k_prod}');
        IF v_res->>'status' = 'SUCCESS' THEN
            RAISE NOTICE 'SUCCESS_DETECTED: Aktivasi sukses';
        ELSE
            RAISE EXCEPTION 'TEST_FAIL: Aktivasi gagal: %', v_res;
        END IF;
    END $$;
    """
    res_2e = await execute_query(sql_2e)
    p_2e = "SUCCESS_DETECTED" in res_2e and "TEST_FAIL" not in res_2e
    record_test("TC_API_01", "HAPPY_PATH", "Pemanggilan kanonikal 1 parameter dari frontend sukses", p_2e, res_2e[:120])

    # =========================================================================
    # TEST SUITE 3: LIC-01 PENCABUTAN MENYELURUH SERIAL PUBLIK
    # =========================================================================
    print("\n--- TEST SUITE 3: LIC-01 PENCABUTAN MENYELURUH SERIAL PUBLIK ---")
    leaked_keys = [
        'RELAY-STR-2026-ALPHA1', 'RELAY-STR-2026-BETA2',
        'RELAY-PRO-2026-GOLD7', 'RELAY-PRO-2026-PLAT8',
        'RELAY-ENT-2026-CORP9', 'RELAY-ENT-2026-VIP00'
    ]
    all_revoked_pass = True
    for lk in leaked_keys:
        sql_lk = f"""
        DO $$
        DECLARE
            v_res JSONB;
        BEGIN
            PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_owner_a_id}", "role": "authenticated"}}', true);
            BEGIN
                v_res := public.fn_activate_license_key('{lk}', '{t_a_id}'::uuid);
                RAISE EXCEPTION 'TEST_FAIL: Serial bocor % seharusnya ditolak!', '{lk}';
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%REVOKED_LICENSE_KEY%' OR SQLERRM LIKE '%INVALID_LICENSE_KEY%' THEN
                    RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
                ELSE
                    RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
                END IF;
            END;
        END $$;
        """
        res_lk = await execute_query(sql_lk)
        if "SUCCESS_DETECTED" not in res_lk or "TEST_FAIL" in res_lk:
            all_revoked_pass = False
            record_test("TC_LIC_01", "SECURITY", f"Serial publik {lk} berhasil diblokir mutlak", False, res_lk[:120])
            break

    if all_revoked_pass:
        record_test("TC_LIC_01", "SECURITY", "Seluruh 6 serial publik migrasi 008 berhasil diblokir mutlak", True, "Tolak tuntas dengan REVOKED_LICENSE_KEY")

    # =========================================================================
    # TEST SUITE 4: POS-01 & POS-02 VALIDASI KUANTITAS & HARGA KATALOG
    # =========================================================================
    print("\n--- TEST SUITE 4: POS-01 & POS-02 VALIDASI KUANTITAS & HARGA KATALOG ---")

    # 4a. Qty Nol Ditolak
    sql_4a = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-QTY-0", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
                '[{{"nama_menu": "Kopi Susu B7", "qty": 0, "harga": 25000}}]'::jsonb,
                NULL
            );
            RAISE EXCEPTION 'TEST_FAIL: Qty 0 seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%INVALID_QUANTITY%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_4a = await execute_query(sql_4a)
    p_4a = "SUCCESS_DETECTED" in res_4a and "TEST_FAIL" not in res_4a
    record_test("TC_POS_01A", "VALIDATION", "Kuantitas pesanan nol (0) ditolak (INVALID_QUANTITY)", p_4a, res_4a[:120])

    # 4b. Qty Negatif Ditolak
    sql_4b = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-QTY-NEG", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
                '[{{"nama_menu": "Kopi Susu B7", "qty": -2, "harga": 25000}}]'::jsonb,
                NULL
            );
            RAISE EXCEPTION 'TEST_FAIL: Qty negatif seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%INVALID_QUANTITY%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_4b = await execute_query(sql_4b)
    p_4b = "SUCCESS_DETECTED" in res_4b and "TEST_FAIL" not in res_4b
    record_test("TC_POS_01B", "VALIDATION", "Kuantitas pesanan negatif (-2) ditolak (Anti-Stock-Inflation)", p_4b, res_4b[:120])

    # 4c. Carwash Paket Kosong Ditolak
    sql_4c = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-CW-EMPTY", "status_bayar": "Selesai", "nominal_bayar": 50000}}'::jsonb,
                '[]'::jsonb,
                '{{"paket": "", "harga": 50000}}'::jsonb
            );
            RAISE EXCEPTION 'TEST_FAIL: Carwash paket kosong seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%INVALID_CARWASH_PACKAGE%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_4c = await execute_query(sql_4c)
    p_4c = "SUCCESS_DETECTED" in res_4c and "TEST_FAIL" not in res_4c
    record_test("TC_POS_02A", "VALIDATION", "Paket carwash kosong ditolak", p_4c, res_4c[:120])

    # 4d. Carwash Custom Pricing oleh Kasir Ditolak (Bypass Prevention)
    sql_4d = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-CW-BYPASS-01", "status_bayar": "Selesai", "nominal_bayar": 1000}}'::jsonb,
                '[]'::jsonb,
                '{{"paket": "Cuci Salju B7", "ukuran": "custom", "harga": 1000, "catatan": "Diskon kasir"}}'::jsonb
            );
            RAISE EXCEPTION 'TEST_FAIL: Kasir bypass harga carwash via custom seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%CUSTOM_PRICING_UNAUTHORIZED%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_4d = await execute_query(sql_4d)
    p_4d = "SUCCESS_DETECTED" in res_4d and "TEST_FAIL" not in res_4d
    record_test("TC_POS_02B", "SECURITY", "Kasir mencoba bypass harga via ukuran custom ditolak (CUSTOM_PRICING_UNAUTHORIZED)", p_4d, res_4d[:120])

    # 4e. Manipulasi Harga Paket Resmi Ditolak
    sql_4e = f"""
    DO $$
    DECLARE
        v_res JSONB;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        BEGIN
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-CW-MISMATCH", "status_bayar": "Selesai", "nominal_bayar": 1000}}'::jsonb,
                '[]'::jsonb,
                '{{"paket": "Cuci Salju B7", "harga": 1000}}'::jsonb
            );
            RAISE EXCEPTION 'TEST_FAIL: Manipulasi harga carwash seharusnya ditolak!';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%PRICE_MISMATCH%' THEN
                RAISE NOTICE 'SUCCESS_DETECTED: %', SQLERRM;
            ELSE
                RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
            END IF;
        END;
    END $$;
    """
    res_4e = await execute_query(sql_4e)
    p_4e = "SUCCESS_DETECTED" in res_4e and "TEST_FAIL" not in res_4e
    record_test("TC_POS_02C", "INTEGRITY", "Manipulasi tarif resmi carwash ditolak (PRICE_MISMATCH)", p_4e, res_4e[:120])

    # =========================================================================
    # TEST SUITE 5: POS-03 & POS-04 REKONSILIASI RINCIAN DRAFT & IDEMPOTENCY
    # =========================================================================
    print("\n--- TEST SUITE 5: POS-03 & POS-04 REKONSILIASI RINCIAN DRAFT & IDEMPOTENCY ---")

    # 5a. Simpan Draft Bill 3x Berturut-turut
    sql_5a = f"""
    DO $$
    DECLARE
        v_res JSONB;
        v_count INT;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        DELETE FROM public.struk WHERE tenant_id = '{t_a_id}'::uuid AND id_struk = 'STRUK-DRAFT-RECON-01';
        DELETE FROM public.cafe WHERE tenant_id = '{t_a_id}'::uuid AND id_struk = 'STRUK-DRAFT-RECON-01';

        -- Simpan Draft 1
        PERFORM public.fn_execute_checkout(
            '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
            '{{"id_struk": "STRUK-DRAFT-RECON-01", "status_bayar": "Pending", "nominal_bayar": 0}}'::jsonb,
            '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
            NULL
        );

        -- Simpan Draft 2 (Re-save bill)
        PERFORM public.fn_execute_checkout(
            '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
            '{{"id_struk": "STRUK-DRAFT-RECON-01", "status_bayar": "Pending", "nominal_bayar": 0}}'::jsonb,
            '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
            NULL
        );

        -- Simpan Draft 3 (Re-save bill)
        PERFORM public.fn_execute_checkout(
            '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
            '{{"id_struk": "STRUK-DRAFT-RECON-01", "status_bayar": "Pending", "nominal_bayar": 0}}'::jsonb,
            '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
            NULL
        );

        SELECT COUNT(*) INTO v_count FROM public.cafe WHERE tenant_id = '{t_a_id}'::uuid AND id_struk = 'STRUK-DRAFT-RECON-01';
        IF v_count = 1 THEN
            RAISE NOTICE 'SUCCESS_DETECTED: Count adalah 1';
        ELSE
            RAISE EXCEPTION 'TEST_FAIL: Jumlah baris cafe berlipat menjadi %!', v_count;
        END IF;
    END $$;
    """
    res_5a = await execute_query(sql_5a)
    p_5a = "SUCCESS_DETECTED" in res_5a and "TEST_FAIL" not in res_5a
    record_test("TC_POS_03", "RECONCILIATION", "Simpan draft berulang tidak melipatgandakan detail tabel cafe (Count == 1)", p_5a, res_5a[:120])

    # 5b. Finalisasi Draft Bill & Safe-Replay
    sql_5b = f"""
    DO $$
    DECLARE
        v_res1 JSONB;
        v_res2 JSONB;
        v_stok_before NUMERIC;
        v_stok_after NUMERIC;
    BEGIN
        PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
        SELECT stok INTO v_stok_before FROM public.stok_barang WHERE tenant_id = '{t_a_id}'::uuid AND nama_produk = 'Susu Segar B7';

        -- Finalisasi bill (Selesai)
        v_res1 := public.fn_execute_checkout(
            '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
            '{{"id_struk": "STRUK-DRAFT-RECON-01", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
            '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
            NULL
        );

        -- Safe replay request yang sama
        v_res2 := public.fn_execute_checkout(
            '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
            '{{"id_struk": "STRUK-DRAFT-RECON-01", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
            '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
            NULL
        );

        SELECT stok INTO v_stok_after FROM public.stok_barang WHERE tenant_id = '{t_a_id}'::uuid AND nama_produk = 'Susu Segar B7';

        IF v_res1->>'status' = 'SUCCESS' AND v_res2->>'status' = 'ALREADY_COMPLETED' AND (v_stok_before - v_stok_after) = 1.0000 THEN
            RAISE NOTICE 'SUCCESS_DETECTED: Finalisasi & Replay terverifikasi sempurna';
        ELSE
            RAISE EXCEPTION 'TEST_FAIL: res1=%, res2=%, selisih stok=%', v_res1, v_res2, (v_stok_before - v_stok_after);
        END IF;
    END $$;
    """
    res_5b = await execute_query(sql_5b)
    p_5b = "SUCCESS_DETECTED" in res_5b and "TEST_FAIL" not in res_5b
    record_test("TC_POS_04", "IDEMPOTENCY", "Finalisasi draft sukses dan replay safe idempotent (ALREADY_COMPLETED)", p_5b, res_5b[:120])

    # =========================================================================
    # TEST SUITE 6: QA-02 TES KONKURENSI PARALEL NYATA (PARALLEL CONCURRENCY)
    # =========================================================================
    print("\n--- TEST SUITE 6: QA-02 TES KONKURENSI PARALEL NYATA ---")

    # 6a. Double-Spend Struk Race (2 Thread bersamaan mengeksekusi nomor struk yang sama)
    # Setup initial stock
    await execute_query(f"""
        UPDATE public.stok_barang SET stok = 10.0000 WHERE tenant_id = '{t_a_id}'::uuid AND nama_produk = 'Susu Segar B7';
        DELETE FROM public.struk WHERE tenant_id = '{t_a_id}'::uuid AND id_struk = 'STRUK-RACE-CONCUR-01';
        DELETE FROM public.cafe WHERE tenant_id = '{t_a_id}'::uuid AND id_struk = 'STRUK-RACE-CONCUR-01';
    """)

    async def race_checkout_worker(worker_id):
        worker_sql = f"""
        DO $$
        DECLARE
            v_res JSONB;
        BEGIN
            PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
            v_res := public.fn_execute_checkout(
                '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
                '{{"id_struk": "STRUK-RACE-CONCUR-01", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
                '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
                NULL
            );
            RAISE NOTICE 'WORKER_%_RESULT: %', {worker_id}, v_res->>'status';
        END $$;
        """
        return await execute_query(worker_sql)

    race_res1, race_res2 = await asyncio.gather(race_checkout_worker(1), race_checkout_worker(2))
    
    # Cek konsistensi akhir di database
    check_race_sql = f"""
    SELECT 
        (SELECT stok FROM public.stok_barang WHERE tenant_id = '{t_a_id}'::uuid AND nama_produk = 'Susu Segar B7') as s_akhir,
        (SELECT COUNT(*) FROM public.struk WHERE tenant_id = '{t_a_id}'::uuid AND id_struk = 'STRUK-RACE-CONCUR-01') as cnt_struk,
        (SELECT COUNT(*) FROM public.cafe WHERE tenant_id = '{t_a_id}'::uuid AND id_struk = 'STRUK-RACE-CONCUR-01') as cnt_cafe;
    """
    race_check_data = parse_sql_result(await execute_query(check_race_sql))[0]
    stok_akhir = float(race_check_data['s_akhir'])
    cnt_struk = int(race_check_data['cnt_struk'])
    cnt_cafe = int(race_check_data['cnt_cafe'])

    p_6a = (stok_akhir == 9.0) and (cnt_struk == 1) and (cnt_cafe == 1)
    record_test(
        "TC_QA_02A", "CONCURRENCY",
        "Dua worker paralel checkout struk bersamaan ter-serialisasi sempurna (Stok 10->9, zero double-spend)",
        p_6a, f"Stok akhir: {stok_akhir}, Count Struk: {cnt_struk}, Count Cafe: {cnt_cafe}"
    )

    # 6b. Stock Depletion Race (Overselling Prevention: Stok 1.0, 2 transaksi berebut simultan)
    await execute_query(f"""
        UPDATE public.stok_barang SET stok = 1.0000 WHERE tenant_id = '{t_a_id}'::uuid AND nama_produk = 'Susu Segar B7';
        DELETE FROM public.struk WHERE tenant_id = '{t_a_id}'::uuid AND id_struk IN ('STRUK-OVERSOLD-A', 'STRUK-OVERSOLD-B');
    """)

    async def oversell_worker(struk_id):
        os_sql = f"""
        DO $$
        DECLARE
            v_res JSONB;
        BEGIN
            PERFORM set_config('request.jwt.claims', '{{"sub": "{usr_kasir_a1_id}", "role": "authenticated"}}', true);
            BEGIN
                v_res := public.fn_execute_checkout(
                    '{t_a_id}'::uuid, '{br_a1_id}'::uuid,
                    '{{"id_struk": "{struk_id}", "status_bayar": "Selesai", "nominal_bayar": 25000}}'::jsonb,
                    '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
                    NULL
                );
                RAISE NOTICE 'SUCCESS_DETECTED: %', v_res->>'status';
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%INSUFFICIENT_STOCK%' THEN
                    RAISE NOTICE 'INSUFFICIENT_DETECTED: %', SQLERRM;
                ELSE
                    RAISE EXCEPTION 'UNEXPECTED: %', SQLERRM;
                END IF;
            END;
        END $$;
        """
        return await execute_query(os_sql)

    os_res_a, os_res_b = await asyncio.gather(oversell_worker("STRUK-OVERSOLD-A"), oversell_worker("STRUK-OVERSOLD-B"))

    check_os_sql = f"""
    SELECT stok FROM public.stok_barang WHERE tenant_id = '{t_a_id}'::uuid AND nama_produk = 'Susu Segar B7';
    """
    final_os_stok = float(parse_sql_result(await execute_query(check_os_sql))[0]['stok'])

    has_one_success = ("SUCCESS_DETECTED" in os_res_a and "INSUFFICIENT_DETECTED" in os_res_b) or \
                      ("SUCCESS_DETECTED" in os_res_b and "INSUFFICIENT_DETECTED" in os_res_a)
    p_6b = has_one_success and (final_os_stok == 0.0)
    record_test(
        "TC_QA_02B", "CONCURRENCY",
        "Dua transaksi berebut stok sisa 1 secara simultan dicegah dari overselling (1 Menang, 1 Ditolak, Sisa Stok Tepat 0)",
        p_6b, f"Worker A: {os_res_a[:40]}, Worker B: {os_res_b[:40]}, Sisa Stok: {final_os_stok}"
    )

    # =========================================================================
    # REKAPITULASI LAPORAN AUDIT & EXIT CODE (QA-01)
    # =========================================================================
    print("\n" + "=" * 80)
    print("=== REKAPITULASI HASIL AUDIT BATCH 7 ===")
    print("=" * 80)

    total_tests = len(test_results)
    passed_tests = sum(1 for t in test_results if t['status'] == 'PASS')
    failed_tests = total_tests - passed_tests

    print(f"Total Kasus Uji : {total_tests}")
    print(f"Lolos (PASS)    : {passed_tests}")
    print(f"Gagal (FAIL)    : {failed_tests}")

    if failed_tests > 0:
        print("\n[VERDICT: REJECTED] Ada pengujian yang GAGAL. Keluar dengan status 1.")
        sys.exit(1)
    else:
        print("\n>>> [VERDICT: APPROVED] SELURUH PENGUJIAN KEAMANAN, OTORISASI & KONKURENSI LOLOS 100% <<<")
        sys.exit(0)

if __name__ == '__main__':
    asyncio.run(main())
