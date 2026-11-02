from pathlib import Path
import asyncio
import json
import os
import sys
import uuid
import time
import re
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(Path(__file__).parent))
from db_inspector import execute_sql

def execute_query(sql_query: str):
    return asyncio.run(execute_sql(sql_query))

def parse_sql_result(raw):
    try:
        if isinstance(raw, str):
            d = json.loads(raw)
            text = d.get('result', raw)
        else:
            text = str(raw)
        candidates = re.findall(r'(\[[\s\S]*?\])', text)
        for c in reversed(candidates):
            try:
                return json.loads(c)
            except Exception:
                continue
    except Exception as e:
        pass
    return []

def run_test_fn(fn_name, sql_body):
    full_sql = f'''
CREATE OR REPLACE FUNCTION pg_temp.{fn_name}() RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $FUNC$
{sql_body}
$FUNC$;
SELECT pg_temp.{fn_name}() as res;
'''
    raw = execute_query(full_sql)
    parsed = parse_sql_result(raw)
    if isinstance(parsed, list) and len(parsed) > 0 and 'res' in parsed[0]:
        return parsed[0]['res']
    return str(parsed)

def main():
    print('=' * 80)
    print('   BATCH 7 ENTERPRISE VERIFICATION SUITE: SEC, LIC, POS, CONCURRENCY')
    print('=' * 80)

    # 1. Pastikan Fixture Dasar Siap
    print('[1/5] Sinkronisasi Fixture Database Cloud...')
    init_sql = '''
DO $$
DECLARE
    v_t_a_id uuid := '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid;
    v_acc_kas uuid;
    v_acc_rev uuid;
    v_acc_cogs uuid;
    v_acc_inv uuid;
BEGIN
    -- Reset stok Susu Segar B7 ke 500 dan reset plan ke free
    UPDATE public.stok_barang 
    SET stok = 500.0000, harga_satuan = 5000.00, harga_beli = 5000.00
    WHERE tenant_id = v_t_a_id AND (nama_barang = 'Susu Segar B7' OR nama_produk = 'Susu Segar B7');

    UPDATE public.tenants SET plan = 'free' WHERE id = v_t_a_id;
    UPDATE public.tenant_licenses SET tier = 'free', plan = 'free' WHERE tenant_id = v_t_a_id;

    -- Pastikan user Kasir B terhubung ke Cabang B1
    UPDATE public.profiles
    SET branch_id = '88888888-bb11-4444-bbbb-bbbbbbbbbbbb'::uuid, role = 'kasir'
    WHERE id = '99999999-bb11-4444-bbbb-bbbbbbbbbbbb'::uuid;

    -- Pastikan Akun COA ada
    SELECT id INTO v_acc_kas FROM public.chart_of_accounts WHERE tenant_id = v_t_a_id AND (account_code = '1101' OR kode_akun = '1101') LIMIT 1;
    IF v_acc_kas IS NULL THEN
        INSERT INTO public.chart_of_accounts (tenant_id, account_code, kode_akun, account_name, nama_akun, account_type, tipe, saldo_normal)
        VALUES (v_t_a_id, '1101', '1101', 'Kas Operasional', 'Kas Operasional', 'Asset', 'ASET', 'DEBIT');
    END IF;

    SELECT id INTO v_acc_rev FROM public.chart_of_accounts WHERE tenant_id = v_t_a_id AND (account_code = '4101' OR kode_akun = '4101') LIMIT 1;
    IF v_acc_rev IS NULL THEN
        INSERT INTO public.chart_of_accounts (tenant_id, account_code, kode_akun, account_name, nama_akun, account_type, tipe, saldo_normal)
        VALUES (v_t_a_id, '4101', '4101', 'Pendapatan Cafe dan Carwash', 'Pendapatan Cafe dan Carwash', 'Revenue', 'PENDAPATAN', 'CREDIT');
    END IF;

    SELECT id INTO v_acc_cogs FROM public.chart_of_accounts WHERE tenant_id = v_t_a_id AND (account_code = '5101' OR kode_akun = '5101') LIMIT 1;
    IF v_acc_cogs IS NULL THEN
        INSERT INTO public.chart_of_accounts (tenant_id, account_code, kode_akun, account_name, nama_akun, account_type, tipe, saldo_normal)
        VALUES (v_t_a_id, '5101', '5101', 'Beban Pokok Penjualan (HPP)', 'Beban Pokok Penjualan (HPP)', 'Expense', 'BEBAN', 'DEBIT');
    END IF;

    SELECT id INTO v_acc_inv FROM public.chart_of_accounts WHERE tenant_id = v_t_a_id AND (account_code = '1105' OR kode_akun = '1105') LIMIT 1;
    IF v_acc_inv IS NULL THEN
        INSERT INTO public.chart_of_accounts (tenant_id, account_code, kode_akun, account_name, nama_akun, account_type, tipe, saldo_normal)
        VALUES (v_t_a_id, '1105', '1105', 'Persediaan Bahan Baku', 'Persediaan Bahan Baku', 'Asset', 'ASET', 'DEBIT');
    END IF;
END $$;
'''
    init_out = execute_query(init_sql)
    if 'error' in str(init_out).lower():
        print('ERROR PADA FIXTURE:', init_out)
        sys.exit(1)
    print('Fixture tersinkronisasi.')

    results = []

    # -------------------------------------------------------------
    # 2. UJI SECURITY & AUTHORIZATION (SEC-01 & SEC-02)
    # -------------------------------------------------------------
    print('\n[2/5] Menjalankan Test Suite SEC-01 & SEC-02...')

    # SEC-01A: Panggilan checkout anonim ditolak
    res = run_test_fn('test_sec_01a', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{"id_struk": "SEC-ANON-01", "status_bayar": "Selesai", "nominal_bayar": 25000}'::jsonb,
        '[{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}]'::jsonb,
        NULL
    );
    RETURN 'FAIL: Seharusnya ditolak';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'UNAUTHORIZED' OR SQLERRM ~* 'tidak terotentikasi' OR SQLERRM ~* 'Akses ditolak' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('SEC-01A (Anon Checkout Blocked)', res))

    # SEC-01B: User nonaktif ditolak checkout
    res = run_test_fn('test_sec_01b', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa00-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{"id_struk": "SEC-INACT-01", "status_bayar": "Selesai", "nominal_bayar": 25000}'::jsonb,
        '[{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}]'::jsonb,
        NULL
    );
    RETURN 'FAIL: Seharusnya ditolak';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'USER_INACTIVE' OR SQLERRM ~* 'dinonaktifkan' OR SQLERRM ~* 'tidak aktif' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('SEC-01B (Inactive User Blocked)', res))

    # SEC-01C: Kasir A1 IDOR ke Cabang B1 ditolak
    res = run_test_fn('test_sec_01c', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-bb11-4444-bbbb-bbbbbbbbbbbb'::uuid,
        '{"id_struk": "SEC-IDOR-BR-01", "status_bayar": "Selesai", "nominal_bayar": 25000}'::jsonb,
        '[{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}]'::jsonb,
        NULL
    );
    RETURN 'FAIL: Seharusnya ditolak';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'BRANCH_FORBIDDEN' OR SQLERRM ~* 'tidak memiliki akses' OR SQLERRM ~* 'tidak terdaftar' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('SEC-01C (Branch IDOR Blocked)', res))

    # SEC-01D: Kasir Tenant A IDOR ke Tenant B ditolak
    res = run_test_fn('test_sec_01d', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_res := public.fn_execute_checkout(
        '77777777-bbbb-4444-bbbb-bbbbbbbbbbbb'::uuid,
        '88888888-bb11-4444-bbbb-bbbbbbbbbbbb'::uuid,
        '{"id_struk": "SEC-IDOR-TN-01", "status_bayar": "Selesai", "nominal_bayar": 25000}'::jsonb,
        '[{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}]'::jsonb,
        NULL
    );
    RETURN 'FAIL: Seharusnya ditolak';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'TENANT_FORBIDDEN' OR SQLERRM ~* 'tidak memiliki akses' OR SQLERRM ~* 'tidak memiliki otorisasi' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('SEC-01D (Tenant IDOR Blocked)', res))

    # SEC-01E: Eskalasi role profil oleh kasir ditolak (Trigger Profiles)
    res = run_test_fn('test_sec_01e', '''
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    UPDATE public.profiles
    SET role = 'superadmin'
    WHERE id = '99999999-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid;
    RETURN 'FAIL: Eskalasi role berhasil lolos';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'FORBIDDEN_ROLE_ESCALATION' OR SQLERRM ~* 'dilarang mengubah role' OR SQLERRM ~* 'Akses ditolak' THEN
        RETURN 'PASS: Eskalasi role ditolak (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('SEC-01E (Profile Role Escalation Blocked)', res))

    # SEC-02: Manipulasi tenant_id profil oleh user ditolak
    res = run_test_fn('test_sec_02', '''
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    UPDATE public.profiles
    SET tenant_id = '77777777-bbbb-4444-bbbb-bbbbbbbbbbbb'::uuid
    WHERE id = '99999999-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid;
    RETURN 'FAIL: Pembajakan tenant_id berhasil lolos';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'FORBIDDEN_TENANT_MUTATION' OR SQLERRM ~* 'Pemindahan tenant_id' OR SQLERRM ~* 'Akses ditolak' THEN
        RETURN 'PASS: Pembajakan tenant_id ditolak (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('SEC-02 (Tenant Hijack Blocked)', res))

    # -------------------------------------------------------------
    # 3. UJI LISENSI & API CANONICAL (LIC-01 & API-01)
    # -------------------------------------------------------------
    print('\n[3/5] Menjalankan Test Suite LIC-01 & API-01...')

    # LIC-01A: Non-Superadmin dilarang generate key
    res = run_test_fn('test_lic_01a', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_res := public.fn_admin_generate_license_key('enterprise'::varchar, 5, 20, 90, 'Test'::text, false);
    RETURN 'FAIL: Kasir berhasil menerbitkan lisensi';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'FORBIDDEN' OR SQLERRM ~* 'Super Admin' OR SQLERRM ~* 'Akses ditolak' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('LIC-01A (License Gen Auth Enforcement)', res))

    # LIC-01B: Kunci lisensi palsu ditolak oleh Owner
    res = run_test_fn('test_lic_01b', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aaaa-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_res := public.fn_activate_license_key('RELAY-FAKE-KEY-9999');
    RETURN 'FAIL: Kunci palsu berhasil lolos';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'tidak terdaftar' OR SQLERRM ~* 'tidak valid' OR SQLERRM ~* 'INVALID_LICENSE_KEY' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('LIC-01B (Invalid License Key Blocked)', res))

    # LIC-01C: Siklus hidup lisensi dinamis & Aktivasi Kanonikal 1-Argumen (API-01)
    res = run_test_fn('test_lic_01c', '''
DECLARE
    v_gen jsonb;
    v_key text;
    v_act jsonb;
    v_tier text;
BEGIN
    -- 1. Service role terbitkan lisensi dinamis
    PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "service_role"}', true);
    v_gen := public.fn_admin_generate_license_key('enterprise'::varchar, 5, 20, 90, 'Dynamic Test Key'::text, false);
    v_key := v_gen->>'license_key';

    IF v_key IS NULL THEN
        RETURN 'FAIL: Gagal menerbitkan lisensi dinamis: ' || v_gen::text;
    END IF;

    -- 2. Owner aktifkan lisensi via 1 parameter kanonikal
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aaaa-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_act := public.fn_activate_license_key(v_key);

    IF (v_act->>'success')::boolean IS NOT TRUE AND (v_act->>'status') <> 'SUCCESS' THEN
        RETURN 'FAIL: Aktivasi lisensi gagal: ' || v_act::text;
    END IF;

    -- 3. Verifikasi tier tenant naik ke enterprise
    SELECT plan INTO v_tier FROM public.tenants WHERE id = '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid;
    IF v_tier ~* 'enterprise' THEN
        RETURN 'PASS: Sukses aktivasi lisensi dinamis dan upgrade tier ke Enterprise';
    ELSE
        RETURN 'FAIL: Tier tenant tidak ter-upgrade (Tier: ' || COALESCE(v_tier, 'NULL') || ')';
    END IF;
END;
''')
    results.append(('LIC-01C (Dynamic License Lifecycle & Canonical RPC)', res))

    # LIC-01D: Kunci yang sudah digunakan ditolak saat coba diaktifkan ulang
    res = run_test_fn('test_lic_01d', '''
DECLARE
    v_key text;
    v_res jsonb;
BEGIN
    SELECT key_code INTO v_key FROM public.license_keys WHERE is_used = true LIMIT 1;
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aaaa-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_res := public.fn_activate_license_key(v_key);
    RETURN 'FAIL: Kunci bekas pakai berhasil diaktifkan ulang';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'sudah pernah diaktifkan' OR SQLERRM ~* 'LICENSE_KEY_ALREADY_USED' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('LIC-01D (Replay License Key Blocked)', res))

    # LIC-01E: Owner Tenant B dilarang aktivasi lisensi milik Tenant A (Cross-Tenant IDOR)
    res = run_test_fn('test_lic_01e', '''
DECLARE
    v_gen jsonb;
    v_key text;
    v_res jsonb;
BEGIN
    -- Terbitkan lisensi dinamis
    PERFORM set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000000", "role": "service_role"}', true);
    v_gen := public.fn_admin_generate_license_key('enterprise'::varchar, 5, 20, 90, 'Bound to Tenant A'::text, false);
    v_key := v_gen->>'license_key';

    -- Owner Tenant B mencoba mengaktifkannya untuk Tenant A
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-bbbb-4444-bbbb-bbbbbbbbbbbb", "role": "authenticated"}', true);
    v_res := public.fn_activate_license_key(v_key, '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid);
    RETURN 'FAIL: Owner B berhasil membajak lisensi untuk Tenant A';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'TENANT_FORBIDDEN' OR SQLERRM ~* 'tidak memiliki wewenang' OR SQLERRM ~* 'Akses ditolak' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('LIC-01E (Cross-Tenant License Hijack Blocked)', res))

    # -------------------------------------------------------------
    # 4. UJI TRANSAKSI POS & INTEGRITAS AKUNTANSI (POS-01 s/d POS-04)
    # -------------------------------------------------------------
    print('\n[4/5] Menjalankan Test Suite POS-01 s/d POS-04...')

    test_id_struk = f"STRUK-B7-{uuid.uuid4().hex[:8].upper()}"

    # POS-01A: Checkout POS valid berhasil (Struk, Jurnal, Pemotongan Stok)
    res = run_test_fn('test_pos_01a', f'''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}}', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{{"id_struk": "{test_id_struk}", "status_bayar": "Selesai", "nominal_bayar": 75000, "metode_pembayaran": "Tunai"}}'::jsonb,
        '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
        '{{"nama_paket": "Cuci Salju B7", "harga": 50000, "kendaraan": "Avanza B 1234 CD"}}'::jsonb
    );
    IF (v_res->>'status') = 'SUCCESS' OR (v_res->>'success')::boolean = true THEN
        RETURN 'PASS: Checkout valid berhasil (Total: ' || (v_res->>'total_tagihan') || ', Struk: ' || (v_res->>'id_struk') || ')';
    ELSE
        RETURN 'FAIL: Checkout valid gagal: ' || v_res::text;
    END IF;
END;
''')
    results.append(('POS-01A (Valid Checkout Transaction)', res))

    # POS-01B: Replay Identik Idempotent aman tanpa duplikasi (is_idempotent = true)
    res = run_test_fn('test_pos_01b', f'''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}}', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{{"id_struk": "{test_id_struk}", "status_bayar": "Selesai", "nominal_bayar": 75000, "metode_pembayaran": "Tunai"}}'::jsonb,
        '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
        '{{"nama_paket": "Cuci Salju B7", "harga": 50000, "kendaraan": "Avanza B 1234 CD"}}'::jsonb
    );
    IF (v_res->>'was_replayed')::boolean = true OR (v_res->>'is_idempotent')::boolean = true THEN
        RETURN 'PASS: Idempotent replay terdeteksi dan dikembalikan tanpa mutasi ulang';
    ELSE
        RETURN 'FAIL: Replay tidak mengembalikan penanda idempoten: ' || v_res::text;
    END IF;
END;
''')
    results.append(('POS-01B (Idempotent Identical Replay Safe)', res))

    # POS-01C: Tampered Replay Payload ditolak (IDEMPOTENCY_TAMPERED)
    res = run_test_fn('test_pos_01c', f'''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}}', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{{"id_struk": "{test_id_struk}", "status_bayar": "Selesai", "nominal_bayar": 999999}}'::jsonb,
        '[{{"nama_menu": "Kopi Susu B7", "qty": 2, "harga": 25000}}]'::jsonb,
        NULL
    );
    RETURN 'FAIL: Tampered payload berhasil lolos';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'IDEMPOTENCY_CONFLICT' OR SQLERRM ~* 'IDEMPOTENCY_TAMPERED' OR SQLERRM ~* 'IDEMPOTENCY' THEN
        RETURN 'PASS: Tampered replay ditolak (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('POS-01C (Anti-Tampering Idempotency)', res))

    # POS-02A: Manipulasi harga menu cafe ditolak (PRICE_MISMATCH)
    res = run_test_fn('test_pos_02a', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{"id_struk": "TAMPER-CAFE-01", "status_bayar": "Selesai", "nominal_bayar": 1000}'::jsonb,
        '[{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 1000}]'::jsonb,
        NULL
    );
    RETURN 'FAIL: Manipulasi harga cafe berhasil lolos';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'PRICE_MISMATCH' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('POS-02A (Cafe Price Tamper Blocked)', res))

    # POS-02B: Manipulasi tarif carwash ditolak (PRICE_MISMATCH)
    res = run_test_fn('test_pos_02b', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{"id_struk": "TAMPER-CW-01", "status_bayar": "Selesai", "nominal_bayar": 5000}'::jsonb,
        NULL,
        '{"nama_paket": "Cuci Salju B7", "harga": 5000}'::jsonb
    );
    RETURN 'FAIL: Manipulasi harga carwash berhasil lolos';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'PRICE_MISMATCH' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('POS-02B (Carwash Price Tamper Blocked)', res))

    # POS-03: Validasi stok tidak mencukupi (INSUFFICIENT_STOCK)
    res = run_test_fn('test_pos_03', '''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}', true);
    -- Minta 600 porsi kopi (stok Susu Segar hanya 500, butuh 600)
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{"id_struk": "STOCK-FAIL-01", "status_bayar": "Selesai", "nominal_bayar": 15000000}'::jsonb,
        '[{"nama_menu": "Kopi Susu B7", "qty": 600, "harga": 25000}]'::jsonb,
        NULL
    );
    RETURN 'FAIL: Order dengan stok tidak cukup berhasil lolos';
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* 'INSUFFICIENT_STOCK' OR SQLERRM ~* 'Stok tidak mencukupi' THEN
        RETURN 'PASS: Ditolak dengan benar (' || SQLERRM || ')';
    ELSE
        RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
    END IF;
END;
''')
    results.append(('POS-03 (BOM Insufficient Stock Blocked)', res))

    # POS-04: Immutability Akuntansi POSTED (Header & Lines)
    res = run_test_fn('test_pos_04', '''
DECLARE
    v_je_id uuid;
    v_acc_id uuid;
BEGIN
    -- Ambil jurnal yang dibuat oleh test_pos_01a
    SELECT id INTO v_je_id FROM public.journal_entries 
    WHERE tenant_id = '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid AND status = 'POSTED'
    ORDER BY created_at DESC LIMIT 1;

    SELECT id INTO v_acc_id FROM public.chart_of_accounts
    WHERE tenant_id = '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid LIMIT 1;

    -- Uji 1: Coba hapus jurnal posted
    BEGIN
        DELETE FROM public.journal_entries WHERE id = v_je_id;
        RETURN 'FAIL: Berhasil menghapus header jurnal posted';
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Ditolak dengan benar
    END;

    -- Uji 2: Coba sisipkan baris ke jurnal posted
    BEGIN
        INSERT INTO public.journal_entry_lines (tenant_id, journal_entry_id, account_id, debit, credit, memo)
        VALUES ('77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid, v_je_id, v_acc_id, 1000, 0, 'Infiltrasi');
        RETURN 'FAIL: Berhasil menyisipkan baris ke jurnal posted';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ~* 'IMMUTABLE_RECORD' OR SQLERRM ~* 'POSTED' THEN
            RETURN 'PASS: Header dan detail jurnal akuntansi POSTED mutlak immutable (' || SQLERRM || ')';
        ELSE
            RETURN 'FAIL: Error tidak sesuai: ' || SQLERRM;
        END IF;
    END;
END;
''')
    results.append(('POS-04 (Accounting Journal Immutability)', res))

    # -------------------------------------------------------------
    # 5. UJI KONKURENSI PARALEL MULTI-THREAD (5 THREAD SERENTAK)
    # -------------------------------------------------------------
    print('\n[5/5] Menjalankan Uji Konkurensi Paralel Multi-Thread (5 Thread Serentak)...')
    conc_struk_id = f"STRUK-CONC-{uuid.uuid4().hex[:8].upper()}"

    def worker_checkout(worker_id):
        worker_sql = f'''
DECLARE
    v_res jsonb;
BEGIN
    PERFORM set_config('request.jwt.claims', '{{"sub": "99999999-aa11-4444-aaaa-aaaaaaaaaaaa", "role": "authenticated"}}', true);
    v_res := public.fn_execute_checkout(
        '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '88888888-aa11-4444-aaaa-aaaaaaaaaaaa'::uuid,
        '{{"id_struk": "{conc_struk_id}", "status_bayar": "Selesai", "nominal_bayar": 25000, "metode_pembayaran": "QRIS"}}'::jsonb,
        '[{{"nama_menu": "Kopi Susu B7", "qty": 1, "harga": 25000}}]'::jsonb,
        NULL
    );
    RETURN 'SUCCESS: ' || (v_res->>'status') || ' (was_replayed: ' || COALESCE(v_res->>'was_replayed', 'false') || ')';
EXCEPTION WHEN OTHERS THEN
    RETURN 'EXCEPTION: ' || SQLERRM;
END;
'''
        return run_test_fn(f"worker_fn_{worker_id}", worker_sql)

    # Catat stok awal via function SECURITY DEFINER
    stok_before_str = run_test_fn('get_stok_before', '''
DECLARE
    v_stok numeric;
BEGIN
    SELECT stok INTO v_stok FROM public.stok_barang 
    WHERE tenant_id = '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid 
      AND (nama_barang = 'Susu Segar B7' OR nama_produk = 'Susu Segar B7');
    RETURN coalesce(v_stok::text, '0');
END;
''')
    stok_before = float(stok_before_str)

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(worker_checkout, i) for i in range(5)]
        thread_outcomes = [f.result() for f in futures]

    # Cek jumlah baris struk dan stok akhir via function SECURITY DEFINER
    audit_res_str = run_test_fn('audit_concurrency', f'''
DECLARE
    v_struk_cnt int;
    v_stok numeric;
BEGIN
    SELECT count(*) INTO v_struk_cnt FROM public.struk WHERE id_struk = '{conc_struk_id}';
    SELECT stok INTO v_stok FROM public.stok_barang 
    WHERE tenant_id = '77777777-aaaa-4444-aaaa-aaaaaaaaaaaa'::uuid 
      AND (nama_barang = 'Susu Segar B7' OR nama_produk = 'Susu Segar B7');
    RETURN json_build_object('struk_count', v_struk_cnt, 'stok_curr', v_stok)::text;
END;
''')
    audit_data = json.loads(audit_res_str)
    struk_count = audit_data['struk_count']
    stok_after = float(audit_data['stok_curr'])

    success_threads = [o for o in thread_outcomes if 'SUCCESS' in o]
    replayed_threads = [o for o in thread_outcomes if 'was_replayed: true' in o or 'was_replayed: True' in o]

    conc_verdict = 'PASS'
    conc_msg = f"5 Thread selesai: {len(success_threads)} sukses, {len(replayed_threads)} teridentifikasi replay, Struk Count={struk_count}, Stok {stok_before} -> {stok_after}"
    if struk_count != 1:
        conc_verdict = 'FAIL'
        conc_msg += f" (ERROR: Struk terbentuk {struk_count} bukan 1!)"
    if (stok_before - stok_after) != 1.0:
        conc_verdict = 'FAIL'
        conc_msg += f" (ERROR: Stok berkurang {stok_before - stok_after} bukan tepat 1!)"

    results.append(('CONCURRENCY-01 (5 Multi-Thread Race Condition Protection)', f"{conc_verdict}: {conc_msg}"))

    # -------------------------------------------------------------
    # CETAK LAPORAN REKAPITULASI HASIL UJI
    # -------------------------------------------------------------
    print('\n' + '=' * 80)
    print('                    HASIL VERIFIKASI BATCH 7 CLOUD SUPABASE')
    print('=' * 80)
    all_pass = True
    for test_name, status in results:
        is_pass = 'PASS' in status
        if not is_pass:
            all_pass = False
        badge = '[ PASS ]' if is_pass else '[ FAIL ]'
        print(f"{badge} {test_name}\n         -> {status}")

    print('=' * 80)
    if all_pass:
        print('SEMUA PENGUJIAN KEAMANAN, LISENSI, POS, DAN KONKURENSI LOLOS (100% GREEN)')
        return True
    else:
        print('TERDAPAT KEGAGALAN PADA UJI COBA DI ATAS!')
        return False

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
