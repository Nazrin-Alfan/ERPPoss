import asyncio, os, sys
sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

TEST_SQL = """
DO $$
DECLARE
    v_test_tenant_id UUID := 'cb365b71-aff5-4878-889f-b94905b349a1';
    v_test_branch_id UUID;
    v_struk_id VARCHAR(50) := 'STRUK-TEST-LONGTERM';
    v_stok_id UUID;
    v_cafe_id UUID;
    v_cw_id UUID;
    v_cat_id UUID;
BEGIN
    SELECT id INTO v_test_branch_id FROM public.branches WHERE tenant_id = v_test_tenant_id LIMIT 1;
    IF v_test_branch_id IS NULL THEN
        SELECT id INTO v_test_branch_id FROM public.branches LIMIT 1;
    END IF;

    -- 1. Test STRUK
    INSERT INTO public.struk (tenant_id, branch_id, id_struk, tanggal, jam, kasir, total_tagihan)
    VALUES (v_test_tenant_id, v_test_branch_id, v_struk_id, CURRENT_DATE, CURRENT_TIME, 'Tester', 50000)
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET total_tagihan = EXCLUDED.total_tagihan;

    -- 2. Test CAFE with FK to STRUK
    INSERT INTO public.cafe (tenant_id, branch_id, id_struk, nama_item, jumlah, harga, total_harga)
    VALUES (v_test_tenant_id, v_test_branch_id, v_struk_id, 'Kopi Susu Uji', 2, 15000, 30000)
    RETURNING id INTO v_cafe_id;

    -- Verify Cafe sync trigger
    ASSERT (SELECT nama_menu FROM public.cafe WHERE id = v_cafe_id) = 'Kopi Susu Uji', 'Cafe nama_menu sync failed';
    ASSERT (SELECT subtotal FROM public.cafe WHERE id = v_cafe_id) = 30000, 'Cafe subtotal sync failed';

    -- 3. Test CARWASH with FK to STRUK
    INSERT INTO public.carwash (tenant_id, branch_id, id_struk, plat_nomor, layanan, harga_cuci, metode_bayar)
    VALUES (v_test_tenant_id, v_test_branch_id, v_struk_id, 'B 9999 UJI', 'Cuci Salju Uji', 20000, 'QRIS')
    RETURNING id INTO v_cw_id;

    -- Verify Carwash sync trigger
    ASSERT (SELECT plat FROM public.carwash WHERE id = v_cw_id) = 'B 9999 UJI', 'Carwash plat sync failed';
    ASSERT (SELECT paket FROM public.carwash WHERE id = v_cw_id) = 'Cuci Salju Uji', 'Carwash paket sync failed';
    ASSERT (SELECT harga FROM public.carwash WHERE id = v_cw_id) = 20000, 'Carwash harga sync failed';

    -- 4. Test STOK_BARANG
    INSERT INTO public.stok_barang (tenant_id, branch_id, id_barang, nama_barang, kategori, satuan, harga_beli, harga_jual, gudang)
    VALUES (v_test_tenant_id, v_test_branch_id, 'BRG-UJI-01', 'Bubuk Matcha Uji', 'Bahan Baku', 'Kg', 120000, 150000, 'Gudang Cafe')
    RETURNING id INTO v_stok_id;

    -- Verify Stok Barang sync trigger
    ASSERT (SELECT id_bahan_baku FROM public.stok_barang WHERE id = v_stok_id) = 'BRG-UJI-01', 'Stok id_bahan_baku sync failed';
    ASSERT (SELECT nama_produk FROM public.stok_barang WHERE id = v_stok_id) = 'Bubuk Matcha Uji', 'Stok nama_produk sync failed';
    ASSERT (SELECT harga_satuan FROM public.stok_barang WHERE id = v_stok_id) = 120000, 'Stok harga_satuan sync failed';

    -- 5. Test MASTER_CATEGORIES with custom code account_id
    INSERT INTO public.master_categories (tenant_id, nama_kategori, jenis, tipe_arus, account_id, boleh_kasir, is_active)
    VALUES (v_test_tenant_id, 'Kategori Uji Jangka Panjang', 'Pengeluaran Cafe', 'PENGELUARAN', 'acc_6004', true, true)
    RETURNING id INTO v_cat_id;

    ASSERT (SELECT account_id FROM public.master_categories WHERE id = v_cat_id) = 'acc_6004', 'master_categories account_id failed';

    -- CLEANUP test entries
    DELETE FROM public.cafe WHERE id = v_cafe_id;
    DELETE FROM public.carwash WHERE id = v_cw_id;
    DELETE FROM public.struk WHERE tenant_id = v_test_tenant_id AND id_struk = v_struk_id;
    DELETE FROM public.stok_barang WHERE id = v_stok_id;
    DELETE FROM public.master_categories WHERE id = v_cat_id;

    RAISE NOTICE 'ALL TENANT DATA INSERTION AND TRIGGER TESTS PASSED WITH 100%% INTEGRITY!';
END $$;
"""

async def run():
    cfg = _load_mcp_config()
    sc = cfg.get('supabase')
    env = _build_safe_env(sc.get('env', {}))
    for k in ['PATH', 'USERPROFILE', 'LOCALAPPDATA']: env[k] = os.environ.get(k, '')
    params = StdioServerParameters(command=sc['command'], args=sc['args'], env=env)
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            res = await s.call_tool('execute_sql', {'query': TEST_SQL})
            print('Result:', res.content[0].text if res.content else 'None')

if __name__ == '__main__':
    asyncio.run(run())
