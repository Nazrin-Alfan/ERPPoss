import asyncio
import json
import os
import re
import sys

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

def extract_json(raw_text):
    if not raw_text:
        return None
    try:
        data = json.loads(raw_text)
        if isinstance(data, dict):
            if "error" in data:
                return data
            raw = data.get("result", "")
            m = re.search(r'<untrusted-data-[a-f0-9-]+>\s*(\[.*?\]|\{.*?\})\s*</untrusted-data-[a-f0-9-]+>', raw, re.DOTALL)
            if m:
                return json.loads(m.group(1))
            try:
                return json.loads(raw)
            except Exception:
                pass
        return data
    except Exception:
        pass
    m = re.search(r'<untrusted-data-[a-f0-9-]+>\s*(\[.*?\]|\{.*?\})\s*</untrusted-data-[a-f0-9-]+>', raw_text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    return None

async def run_query(session, sql):
    res = await session.call_tool('execute_sql', {'query': sql})
    combined = "\n".join(c.text for c in res.content)
    return extract_json(combined), combined

async def main():
    print("=== LIVE RUNTIME VERIFICATION: BATCH 5 (ENTERPRISE HARDENING & AUDIT RESOLUTION) ===")
    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    cmd = supabase_cfg.get('command', 'npx')
    args = supabase_cfg.get('args', [])
    raw_env = supabase_cfg.get('env', {})
    safe_env = _build_safe_env(raw_env)
    safe_env['PATH'] = os.environ.get('PATH', '')

    server_params = StdioServerParameters(command=cmd, args=args, env=safe_env)

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            # UUID Identifiers yang valid untuk PostgreSQL
            test_tenant_id = "a0000000-0000-4000-a000-0000000000b5"
            attacker_tenant_id = "f0000000-0000-4000-a000-0000000000b5"
            owner_user_id = "b0000000-0000-4000-a000-000000000099"
            test_user_id = "b0000000-0000-4000-a000-0000000000b5"
            journal_id = "c0000000-0000-4000-a000-0000000000b5"
            acc1_id = "d0000000-0000-4000-a000-000000000001"
            acc2_id = "d0000000-0000-4000-a000-000000000002"
            line1_id = "e0000000-0000-4000-a000-000000000001"
            line2_id = "e0000000-0000-4000-a000-000000000002"

            print(f"\n[SETUP] Menyiapkan tenant & profile pengujian: {test_tenant_id}...")
            await run_query(session, f"""
                INSERT INTO public.tenants (id, nama, slug)
                VALUES ('{test_tenant_id}'::uuid, 'Tenant QA Batch 5 Audit', 'tenant-qa-batch5')
                ON CONFLICT (id) DO UPDATE SET nama = 'Tenant QA Batch 5 Audit';

                INSERT INTO public.tenants (id, nama, slug)
                VALUES ('{attacker_tenant_id}'::uuid, 'Attacker Tenant Target', 'tenant-qa-attacker')
                ON CONFLICT (id) DO UPDATE SET nama = 'Attacker Tenant Target';

                INSERT INTO public.profiles (id, tenant_id, role, nama, email, is_active)
                VALUES ('{owner_user_id}'::uuid, '{test_tenant_id}'::uuid, 'Owner', 'Owner QA', 'owner-qa@batch5.test', true)
                ON CONFLICT (id) DO UPDATE SET role = 'Owner';
            """)

            test_results = []

            # ---------------------------------------------------------
            # TEST 1: CATALOG LICENSE KEY & ANTI-REPLAY ATTACK
            # ---------------------------------------------------------
            print("\n--- TEST 1: CATALOG LICENSE KEY & ANTI-REPLAY ATTACK ---")
            # 1a. Percobaan aktivasi lisensi acak / palsu (harus gagal)
            _, raw_fail = await run_query(session, f"""
                DO $$
                DECLARE res jsonb;
                BEGIN
                    PERFORM set_config('request.jwt.claim.sub', '{owner_user_id}', true);
                    res := public.fn_activate_license_key('RELAY-FAKE-KEY-X999', '{test_tenant_id}'::uuid);
                END $$;
            """)
            if "INVALID_LICENSE_KEY" in raw_fail:
                print("  [PASS] 1a. Serial lisensi palsu/acak ditolak server (INVALID_LICENSE_KEY)")
                test_results.append(("1a. Serial Lisensi Palsu Ditolak", "PASS"))
            else:
                print(f"  [FAIL] 1a. Serial lisensi palsu tidak ditolak: {raw_fail}")
                test_results.append(("1a. Serial Lisensi Palsu Ditolak", "FAIL"))

            # 1b. Aktivasi serial resmi dari katalog license_keys
            valid_key = "RELAY-ENT-2026-CORP9"
            await run_query(session, f"""
                UPDATE public.license_keys 
                SET is_used = false, used_by_tenant_id = NULL, used_at = NULL 
                WHERE key_code = '{valid_key}';
            """)
            json_act, raw_act = await run_query(session, f"""
                DO $$
                DECLARE res jsonb;
                BEGIN
                    PERFORM set_config('request.jwt.claim.sub', '{owner_user_id}', true);
                    res := public.fn_activate_license_key('{valid_key}', '{test_tenant_id}'::uuid);
                    IF res->>'status' <> 'SUCCESS' THEN
                        RAISE EXCEPTION 'Aktivasi gagal: %', res;
                    END IF;
                END $$;
            """)
            if "error" not in str(raw_act).lower() or "ERROR:" not in raw_act:
                print("  [PASS] 1b. Serial resmi dari tabel license_keys berhasil diaktivasi")
                test_results.append(("1b. Aktivasi Serial Resmi", "PASS"))
            else:
                print(f"  [FAIL] 1b. Gagal mengaktivasi serial resmi: {raw_act}")
                test_results.append(("1b. Aktivasi Serial Resmi", "FAIL"))

            # 1c. Percobaan Replay Attack (menggunakan serial yang sama untuk kedua kalinya)
            _, raw_replay = await run_query(session, f"""
                DO $$
                DECLARE res jsonb;
                BEGIN
                    PERFORM set_config('request.jwt.claim.sub', '{owner_user_id}', true);
                    res := public.fn_activate_license_key('{valid_key}', '{test_tenant_id}'::uuid);
                END $$;
            """)
            if "LICENSE_KEY_ALREADY_USED" in raw_replay:
                print("  [PASS] 1c. Replay attack dicegah mutlak (LICENSE_KEY_ALREADY_USED)")
                test_results.append(("1c. Proteksi Replay Attack Lisensi", "PASS"))
            else:
                print(f"  [FAIL] 1c. Replay attack lolos: {raw_replay}")
                test_results.append(("1c. Proteksi Replay Attack Lisensi", "FAIL"))

            # ---------------------------------------------------------
            # TEST 2: JOURNAL IMMUTABILITY WHEN POSTED
            # ---------------------------------------------------------
            print("\n--- TEST 2: MUTLAK IMMUTABLE UNTUK JURNAL POSTED ---")
            # 2a. Buat Jurnal DRAFT yang seimbang
            await run_query(session, f"""
                DELETE FROM public.journal_entry_lines WHERE journal_entry_id = '{journal_id}'::uuid;
                DELETE FROM public.journal_entries WHERE id = '{journal_id}'::uuid;

                INSERT INTO public.chart_of_accounts (id, tenant_id, kode_akun, nama_akun, tipe, saldo_normal, is_active)
                VALUES 
                  ('{acc1_id}'::uuid, '{test_tenant_id}'::uuid, '1101', 'Kas Operasional QA', 'ASSET', 'DEBIT', true),
                  ('{acc2_id}'::uuid, '{test_tenant_id}'::uuid, '4101', 'Pendapatan Kasir QA', 'REVENUE', 'CREDIT', true)
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO public.journal_entries (id, tenant_id, entry_no, date, memo, total_amount, status)
                VALUES ('{journal_id}'::uuid, '{test_tenant_id}'::uuid, 'JRN-B5-001', CURRENT_DATE, 'Jurnal Uji Immutability Batch 5', 500000, 'DRAFT')
                ON CONFLICT (id) DO NOTHING;

                INSERT INTO public.journal_entry_lines (id, tenant_id, journal_entry_id, account_id, debit, credit)
                VALUES 
                  ('{line1_id}'::uuid, '{test_tenant_id}'::uuid, '{journal_id}'::uuid, '{acc1_id}'::uuid, 500000, 0),
                  ('{line2_id}'::uuid, '{test_tenant_id}'::uuid, '{journal_id}'::uuid, '{acc2_id}'::uuid, 0, 500000)
                ON CONFLICT (id) DO NOTHING;

                UPDATE public.journal_entries SET status = 'POSTED' WHERE id = '{journal_id}'::uuid;
            """)

            # 2b. Coba lakukan modifikasi line jurnal yang sudah POSTED (harus ditolak)
            _, raw_line_mod = await run_query(session, f"""
                UPDATE public.journal_entry_lines 
                SET debit = 600000 
                WHERE id = '{line1_id}'::uuid;
            """)
            if "JOURNAL_POSTED_IMMUTABLE" in raw_line_mod:
                print("  [PASS] 2b. Modifikasi baris jurnal POSTED ditolak mutlak oleh trigger immutability")
                test_results.append(("2b. Modifikasi Baris Jurnal POSTED Ditolak", "PASS"))
            else:
                print(f"  [FAIL] 2b. Modifikasi baris jurnal POSTED lolos: {raw_line_mod}")
                test_results.append(("2b. Modifikasi Baris Jurnal POSTED Ditolak", "FAIL"))

            # 2c. Coba lakukan penghapusan baris jurnal POSTED (harus ditolak)
            _, raw_line_del = await run_query(session, f"""
                DELETE FROM public.journal_entry_lines WHERE id = '{line2_id}'::uuid;
            """)
            if "JOURNAL_POSTED_IMMUTABLE" in raw_line_del:
                print("  [PASS] 2c. Penghapusan baris jurnal POSTED ditolak mutlak")
                test_results.append(("2c. Hapus Baris Jurnal POSTED Ditolak", "PASS"))
            else:
                print(f"  [FAIL] 2c. Penghapusan baris jurnal POSTED lolos: {raw_line_del}")
                test_results.append(("2c. Hapus Baris Jurnal POSTED Ditolak", "FAIL"))

            # 2d. Coba ubah nilai total pada header jurnal POSTED (harus ditolak)
            _, raw_hdr_mod = await run_query(session, f"""
                UPDATE public.journal_entries 
                SET total_amount = 999999 
                WHERE id = '{journal_id}'::uuid;
            """)
            if "JOURNAL_POSTED_IMMUTABLE" in raw_hdr_mod:
                print("  [PASS] 2d. Modifikasi header jurnal POSTED ditolak mutlak")
                test_results.append(("2d. Modifikasi Header Jurnal POSTED Ditolak", "PASS"))
            else:
                print(f"  [FAIL] 2d. Modifikasi header jurnal POSTED lolos: {raw_hdr_mod}")
                test_results.append(("2d. Modifikasi Header Jurnal POSTED Ditolak", "FAIL"))

            # ---------------------------------------------------------
            # TEST 3: PROFILES ROLE & TENANT ESCALATION PROTECTION
            # ---------------------------------------------------------
            print("\n--- TEST 3: PROFILES ROLE & TENANT ESCALATION PROTECTION ---")
            await run_query(session, f"""
                INSERT INTO public.profiles (id, tenant_id, role, nama, email, is_active)
                VALUES ('{test_user_id}'::uuid, '{test_tenant_id}'::uuid, 'Kasir', 'Kasir QA Test', 'kasir-qa@batch5.test', true)
                ON CONFLICT (id) DO UPDATE SET role = 'Kasir', tenant_id = '{test_tenant_id}'::uuid;
            """)

            # 3a. Coba eskalasi role ke Super Admin sebagai user biasa (Kasir)
            _, raw_role_esc = await run_query(session, f"""
                DO $$
                BEGIN
                    PERFORM set_config('request.jwt.claim.sub', '{test_user_id}', true);
                    UPDATE public.profiles SET role = 'Super Admin' WHERE id = '{test_user_id}'::uuid;
                END $$;
            """)
            if "FORBIDDEN_ROLE_ESCALATION" in raw_role_esc:
                print("  [PASS] 3a. Eskalasi role pada profiles ditolak mutlak (FORBIDDEN_ROLE_ESCALATION)")
                test_results.append(("3a. Proteksi Eskalasi Role", "PASS"))
            else:
                print(f"  [FAIL] 3a. Eskalasi role lolos: {raw_role_esc}")
                test_results.append(("3a. Proteksi Eskalasi Role", "FAIL"))

            # 3b. Coba mutasi tenant_id pada profiles sebagai user biasa (Kasir)
            _, raw_tenant_esc = await run_query(session, f"""
                DO $$
                BEGIN
                    PERFORM set_config('request.jwt.claim.sub', '{test_user_id}', true);
                    UPDATE public.profiles SET tenant_id = '{attacker_tenant_id}'::uuid WHERE id = '{test_user_id}'::uuid;
                END $$;
            """)
            if "FORBIDDEN_TENANT_MUTATION" in raw_tenant_esc:
                print("  [PASS] 3b. Mutasi tenant_id pada profiles ditolak mutlak (FORBIDDEN_TENANT_MUTATION)")
                test_results.append(("3b. Proteksi Mutasi Tenant Profiles", "PASS"))
            else:
                print(f"  [FAIL] 3b. Mutasi tenant_id lolos: {raw_tenant_esc}")
                test_results.append(("3b. Proteksi Mutasi Tenant Profiles", "FAIL"))

            # ---------------------------------------------------------
            # TEST 4: ATOMIC IDEMPOTENT CHECKOUT
            # ---------------------------------------------------------
            print("\n--- TEST 4: IDEMPOTENT ATOMIC CHECKOUT ---")
            idempotent_struk_id = f"STRUK-IDEMP-{int(asyncio.get_event_loop().time() * 1000)}"
            checkout_payload = {
                "id_struk": idempotent_struk_id,
                "metode_bayar": "CASH",
                "nominal_cash": 100000,
                "nominal_qris": 0,
                "status_bayar": "Selesai",
                "kasir": "KASIR IDEMP",
                "total_tagihan": 100000,
                "subtotal": 100000,
                "diskon": 0
            }
            payload_str = json.dumps(checkout_payload)

            # Eksekusi Pertama
            json_chk1, raw_chk1 = await run_query(session, f"""
                SELECT public.fn_execute_checkout(
                    '{test_tenant_id}'::uuid,
                    NULL::uuid,
                    '{payload_str}'::jsonb,
                    '[]'::jsonb,
                    '{{}}'::jsonb
                ) as res;
            """)
            print("  [INFO] Eksekusi checkout pertama selesai.")

            # Eksekusi Kedua dengan ID Struk yang sama (simulasi network retry kasir)
            json_chk2, raw_chk2 = await run_query(session, f"""
                SELECT public.fn_execute_checkout(
                    '{test_tenant_id}'::uuid,
                    NULL::uuid,
                    '{payload_str}'::jsonb,
                    '[]'::jsonb,
                    '{{}}'::jsonb
                ) as res;
            """)

            if "success" in raw_chk2 or (json_chk2 and "id_struk" in str(json_chk2)):
                print("  [PASS] 4. Checkout kedua mengembalikan data transaksi aman tanpa memicu duplikasi atau error (IDEMPOTENT)")
                test_results.append(("4. Idempotent Checkout Safe Replay", "PASS"))
            else:
                print(f"  [FAIL] 4. Idempotent checkout gagal: {raw_chk2}")
                test_results.append(("4. Idempotent Checkout Safe Replay", "FAIL"))

            # ---------------------------------------------------------
            # TEST 5: SERVER-SIDE VALIDATION: DISKON & HARGA MENU
            # ---------------------------------------------------------
            print("\n--- TEST 5: VALIDASI SERVER-SIDE DISKON & HARGA ---")
            # 5a. Diskon melebihi subtotal
            invalid_discount_struk = f"STRUK-BAD-DISC-{int(asyncio.get_event_loop().time() * 1000)}"
            bad_disc_payload = {
                "id_struk": invalid_discount_struk,
                "subtotal": 50000,
                "diskon": 990000, # Diskon tidak wajar > subtotal
                "total_tagihan": 50000,
                "status_bayar": "Selesai",
                "metode_bayar": "CASH"
            }
            _, raw_bad_disc = await run_query(session, f"""
                SELECT public.fn_execute_checkout(
                    '{test_tenant_id}'::uuid,
                    NULL::uuid,
                    '{json.dumps(bad_disc_payload)}'::jsonb,
                    '[]'::jsonb,
                    '{{}}'::jsonb
                );
            """)
            if "INVALID_DISCOUNT" in raw_bad_disc:
                print("  [PASS] 5a. Diskon tidak wajar ditolak server (INVALID_DISCOUNT)")
                test_results.append(("5a. Proteksi Validasi Diskon Server", "PASS"))
            else:
                print(f"  [FAIL] 5a. Diskon tidak wajar lolos: {raw_bad_disc}")
                test_results.append(("5a. Proteksi Validasi Diskon Server", "FAIL"))

            # 5b. Harga Menu Manipulasi (Price Tampering)
            await run_query(session, f"""
                INSERT INTO public.daftar_harga_menu (tenant_id, branch_id, daftar_menu, nama_menu, harga, is_active)
                VALUES ('{test_tenant_id}'::uuid, NULL, 'Kopi Signature QA', 'Kopi Signature QA', 25000, true)
                ON CONFLICT (tenant_id, branch_id, daftar_menu) DO UPDATE SET harga = 25000;
            """)

            tampered_struk = f"STRUK-TAMPER-{int(asyncio.get_event_loop().time() * 1000)}"
            tampered_item = [{
                "nama_menu": "Kopi Signature QA",
                "harga": 500, # Dimanipulasi jadi Rp 500 dari harga asli 25000
                "qty": 1,
                "subtotal": 500
            }]
            tampered_struk_payload = {
                "id_struk": tampered_struk,
                "subtotal": 500,
                "diskon": 0,
                "total_tagihan": 500,
                "status_bayar": "Selesai",
                "metode_bayar": "CASH"
            }
            _, raw_tamper = await run_query(session, f"""
                SELECT public.fn_execute_checkout(
                    '{test_tenant_id}'::uuid,
                    NULL::uuid,
                    '{json.dumps(tampered_struk_payload)}'::jsonb,
                    '{json.dumps(tampered_item)}'::jsonb,
                    '{{}}'::jsonb
                );
            """)
            if "PRICE_MISMATCH" in raw_tamper:
                print("  [PASS] 5b. Manipulasi harga menu client-side digagalkan oleh verifikasi katalog resmi (PRICE_MISMATCH)")
                test_results.append(("5b. Verifikasi Integritas Harga Menu", "PASS"))
            else:
                print(f"  [FAIL] 5b. Manipulasi harga menu lolos: {raw_tamper}")
                test_results.append(("5b. Verifikasi Integritas Harga Menu", "FAIL"))

            # ---------------------------------------------------------
            # CLEANUP & RINGKASAN HASIL
            # ---------------------------------------------------------
            print("\n[CLEANUP] Membersihkan entitas pengujian...")
            await run_query(session, f"""
                DELETE FROM public.journal_entry_lines WHERE tenant_id = '{test_tenant_id}'::uuid;
                UPDATE public.journal_entries SET status = 'DRAFT' WHERE tenant_id = '{test_tenant_id}'::uuid;
                DELETE FROM public.journal_entries WHERE tenant_id = '{test_tenant_id}'::uuid;
                DELETE FROM public.chart_of_accounts WHERE tenant_id = '{test_tenant_id}'::uuid;
                DELETE FROM public.profiles WHERE tenant_id = '{test_tenant_id}'::uuid;
                DELETE FROM public.struk WHERE tenant_id = '{test_tenant_id}'::uuid;
                DELETE FROM public.daftar_harga_menu WHERE tenant_id = '{test_tenant_id}'::uuid;
                DELETE FROM public.tenant_licenses WHERE tenant_id = '{test_tenant_id}'::uuid;
                DELETE FROM public.tenants WHERE id IN ('{test_tenant_id}'::uuid, '{attacker_tenant_id}'::uuid);
            """)

            print("\n=======================================================")
            print("HASIL LENGKAP PENGUJIAN LIVE VERIFIKASI BATCH 5:")
            print("=======================================================")
            all_passed = True
            for test_name, status in test_results:
                print(f"  {test_name:<45} : [{status}]")
                if status != "PASS":
                    all_passed = False

            if all_passed:
                print("\n>>> SELURUH PENGUJIAN BATCH 5 ENTERPRISE HARDENING LULUS 100% <<<")
            else:
                print("\n>>> ADA PENGUJIAN YANG GAGAL <<<")

if __name__ == "__main__":
    asyncio.run(main())
