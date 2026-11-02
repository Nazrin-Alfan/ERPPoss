import asyncio
import os
import re
import sys
import json
from pathlib import Path

# Impor helper MCP
sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

def extract_json(raw_text):
    try:
        outer = json.loads(raw_text)
        if isinstance(outer, dict) and "result" in outer:
            raw_text = outer["result"]
    except Exception:
        pass
    match = re.search(r'<untrusted-data-[a-f0-9-]+>\s*(\[.*?\]|\{.*?\})\s*</untrusted-data-[a-f0-9-]+>', raw_text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    clean = re.sub(r'<[^>]+>', '', raw_text).strip()
    return json.loads(clean)

async def run_tests():
    print("=== LIVE RUNTIME VERIFICATION: BATCH 3 (ATOMIC POS CHECKOUT & ANTI-OVERSELLING) ===")
    cfg = _load_mcp_config().get('supabase') or _load_mcp_config().get('mcpServers', {}).get('supabase', {})
    env = _build_safe_env(cfg.get('env', {}))

    server_params = StdioServerParameters(
        command=cfg.get('command'),
        args=cfg.get('args', []),
        env=env
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # Persiapan Data Pengujian
            setup_sql = """
            DO $$
            DECLARE
                v_tenant_id UUID;
                v_branch_id UUID;
                v_raw_id UUID;
                v_menu_id UUID;
            BEGIN
                SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;
                SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = v_tenant_id LIMIT 1;

                -- Buat bahan baku uji coba dengan stok tepat 2
                INSERT INTO public.stok_barang (id, tenant_id, branch_id, nama_produk, satuan, stok, harga_satuan)
                VALUES ('11111111-2222-3333-4444-555555555555', v_tenant_id, v_branch_id, 'Kopi Uji AntiOversell', 'gram', 2.0000, 1000)
                ON CONFLICT (tenant_id, id) DO UPDATE 
                SET stok = 2.0000, nama_produk = 'Kopi Uji AntiOversell';

                -- Buat menu uji coba dengan harga resmi katalog Rp 25.000
                INSERT INTO public.daftar_harga_menu (id, tenant_id, daftar_menu, nama_menu, harga, kategori)
                VALUES ('22222222-3333-4444-5555-666666666666', v_tenant_id, 'Kopi Susu Uji', 'Kopi Susu Uji', 25000, 'Minuman')
                ON CONFLICT (id) DO UPDATE
                SET harga = 25000, daftar_menu = 'Kopi Susu Uji', nama_menu = 'Kopi Susu Uji';

                -- Buat resep yang membutuhkan 1 gram per porsi
                DELETE FROM public.resep WHERE id_menu = '22222222-3333-4444-5555-666666666666' OR nama_menu = 'Kopi Susu Uji';
                INSERT INTO public.resep (tenant_id, id_menu, nama_menu, id_bahan_baku, nama_bahan, jumlah)
                VALUES (v_tenant_id, '22222222-3333-4444-5555-666666666666', 'Kopi Susu Uji', '11111111-2222-3333-4444-555555555555', 'Kopi Uji AntiOversell', 1.0000);
            END;
            $$;
            """
            await session.call_tool("execute_sql", arguments={"query": setup_sql})

            # Ambil tenant_id & branch_id aktif
            info_res = await session.call_tool("execute_sql", arguments={"query": "SELECT id as tenant_id FROM public.tenants LIMIT 1;"})
            tenant_id = extract_json(info_res.content[0].text)[0]['tenant_id']

            # TEST 1: T04 Anti-Overselling Check (Pesanan melebihi stok yang ada)
            print("\n[TEST 1] T04 Anti-Overselling (Pemesanan qty = 5 padahal stok = 2)...")
            test1_sql = f"""
            DO $$
            BEGIN
                PERFORM public.fn_execute_checkout(
                    '{tenant_id}'::uuid,
                    NULL,
                    '{{"id_struk": "TEST-OVERSELL-01", "status_bayar": "Selesai", "nominal_cash": 125000}}'::jsonb,
                    '[{{"nama_menu": "Kopi Susu Uji", "qty": 5, "harga_satuan": 25000}}]'::jsonb
                );
                RAISE EXCEPTION 'TEST_FAILED: Harusnya ditolak karena stok tidak cukup!';
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%INSUFFICIENT_STOCK%' THEN
                    RAISE NOTICE 'SUCCESS_CAUGHT_OVERSELL: %', SQLERRM;
                ELSE
                    RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
                END IF;
            END;
            $$;
            """
            t1_res = await session.call_tool("execute_sql", arguments={"query": test1_sql})
            if t1_res.is_error:
                print(f"❌ TEST 1 FAILED: {t1_res.content[0].text}")
                return
            print("✅ TEST 1 PASSED: Overselling berhasil dicegah mutlak oleh RPC (INSUFFICIENT_STOCK)!")

            # TEST 2: T05 Anti Price-Tampering (Client mengirim harga palsu Rp 1.000 padahal katalog Rp 25.000)
            print("\n[TEST 2] T05 Server-side Price Tampering Check (Client kirim harga Rp 1.000 vs Katalog Rp 25.000)...")
            test2_sql = f"""
            DO $$
            BEGIN
                PERFORM public.fn_execute_checkout(
                    '{tenant_id}'::uuid,
                    NULL,
                    '{{"id_struk": "TEST-TAMPER-01", "status_bayar": "Selesai", "nominal_cash": 1000}}'::jsonb,
                    '[{{"nama_menu": "Kopi Susu Uji", "qty": 1, "harga_satuan": 1000}}]'::jsonb
                );
                RAISE EXCEPTION 'TEST_FAILED: Harusnya ditolak karena manipulasi harga!';
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%PRICE_MISMATCH%' THEN
                    RAISE NOTICE 'SUCCESS_CAUGHT_TAMPER: %', SQLERRM;
                ELSE
                    RAISE EXCEPTION 'UNEXPECTED_ERROR: %', SQLERRM;
                END IF;
            END;
            $$;
            """
            t2_res = await session.call_tool("execute_sql", arguments={"query": test2_sql})
            if t2_res.is_error:
                print(f"❌ TEST 2 FAILED: {t2_res.content[0].text}")
                return
            print("✅ TEST 2 PASSED: Manipulasi harga client-side berhasil digagalkan (PRICE_MISMATCH)!")

            # TEST 3: T02 Atomic Success Execution & BOM Deduction
            print("\n[TEST 3] T02 Atomic Success Execution (Pesan qty = 1, stok awal 2 -> stok akhir 1)...")
            test3_sql = f"""
            SELECT public.fn_execute_checkout(
                '{tenant_id}'::uuid,
                NULL,
                '{{"id_struk": "TEST-SUCCESS-01", "status_bayar": "Selesai", "nominal_cash": 25000, "kasir": "KASIR TEST"}}'::jsonb,
                '[{{"nama_menu": "Kopi Susu Uji", "qty": 1, "harga_satuan": 25000}}]'::jsonb
            );
            """
            t3_res = await session.call_tool("execute_sql", arguments={"query": test3_sql})
            if t3_res.is_error:
                print(f"❌ TEST 3 FAILED: {t3_res.content[0].text}")
                return
            
            # Verifikasi perubahan stok di database
            check_stock_sql = f"""
            SELECT stok FROM public.stok_barang 
            WHERE id = '11111111-2222-3333-4444-555555555555' AND tenant_id = '{tenant_id}';
            """
            stk_res = await session.call_tool("execute_sql", arguments={"query": check_stock_sql})
            stk_val = float(extract_json(stk_res.content[0].text)[0]['stok'])
            assert stk_val == 1.0, f"Expected stok 1.0, got {stk_val}"

            # Verifikasi audit log barang keluar
            bk_res = await session.call_tool("execute_sql", arguments={
                "query": f"SELECT jumlah_keluar FROM public.barang_keluar WHERE alasan = 'PENJUALAN_POS_TEST-SUCCESS-01';"
            })
            bk_val = float(extract_json(bk_res.content[0].text)[0]['jumlah_keluar'])
            assert bk_val == 1.0, f"Expected barang_keluar 1.0, got {bk_val}"
            print(f"✅ TEST 3 PASSED: Transaksi checkout atomik sukses! Stok berkurang akurat: 2.0 -> {stk_val}, Audit trail tercatat: {bk_val}")

            # TEST 4: K04 Security Privilege Check (anon role EXECUTE denial)
            print("\n[TEST 4] K04 Anon Role Execution Denial...")
            test4_sql = f"""
            DO $$
            BEGIN
                SET ROLE anon;
                PERFORM public.fn_execute_checkout(
                    '{tenant_id}'::uuid,
                    NULL,
                    '{{"id_struk": "TEST-ANON-01"}}'::jsonb,
                    '[]'::jsonb
                );
                RAISE EXCEPTION 'TEST_FAILED: Anon seharusnya tidak boleh execute!';
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%permission denied%' THEN
                    RAISE NOTICE 'SUCCESS_DENIED_ANON: %', SQLERRM;
                ELSE
                    RAISE EXCEPTION 'UNEXPECTED_ERROR_ANON: %', SQLERRM;
                END IF;
            END;
            $$;
            """
            t4_res = await session.call_tool("execute_sql", arguments={"query": test4_sql})
            if t4_res.is_error:
                print(f"❌ TEST 4 FAILED: {t4_res.content[0].text}")
                return
            print("✅ TEST 4 PASSED: Role anon dilarang keras mengeksekusi RPC fn_execute_checkout (Permission Denied)!")

            # Cleanup data uji
            cleanup_sql = f"""
            DELETE FROM public.barang_keluar WHERE alasan LIKE 'PENJUALAN_POS_TEST%';
            DELETE FROM public.cafe WHERE id_struk LIKE 'TEST-%';
            DELETE FROM public.struk WHERE id_struk LIKE 'TEST-%';
            DELETE FROM public.resep WHERE id_menu = '22222222-3333-4444-5555-666666666666';
            DELETE FROM public.daftar_harga_menu WHERE id = '22222222-3333-4444-5555-666666666666';
            DELETE FROM public.stok_barang WHERE id = '11111111-2222-3333-4444-555555555555';
            """
            await session.call_tool("execute_sql", arguments={"query": cleanup_sql})
            print("\n🎉 ALL 4 BATCH 3 RUNTIME TESTS PASSED (100% SUCCESS)!")

if __name__ == '__main__':
    asyncio.run(run_tests())
