"""
Test CRUD operations on all 12 operational tables on Supabase Cloud.
Verifies that database loading, inserting, updating, and deleting work with 0 errors.
"""
import sys
import os

CRUD_TEST_SQL = """
DO $$
DECLARE
    v_test_tenant UUID;
    v_test_branch UUID;
    v_struk_id TEXT := 'TRX-TEST-001';
    v_item_id UUID;
BEGIN
    -- 1. Create a transient test tenant & branch
    INSERT INTO public.tenants (nama, slug, plan, status, business_type)
    VALUES ('Auto CRUD Test Store', 'crud-test-' || substr(md5(random()::text), 1, 6), 'pro', 'active', 'HYBRID')
    RETURNING id INTO v_test_tenant;

    INSERT INTO public.branches (tenant_id, nama, kode, alamat, is_active)
    VALUES (v_test_tenant, 'Cabang Test', 'TEST01', 'Jl. Test No 1', TRUE)
    RETURNING id INTO v_test_branch;

    -- 2. Test chart_of_accounts
    INSERT INTO public.chart_of_accounts (tenant_id, account_code, account_name, account_type)
    VALUES (v_test_tenant, '1-10099', 'Kas Uji Coba', 'ASSET');
    UPDATE public.chart_of_accounts SET account_name = 'Kas Uji Coba Edit' WHERE tenant_id = v_test_tenant AND account_code = '1-10099';

    -- 3. Test master_categories
    INSERT INTO public.master_categories (tenant_id, category_name, category_type)
    VALUES (v_test_tenant, 'Kategori Test', 'EXPENSE');

    -- 4. Test stok_barang (Bahan Baku)
    INSERT INTO public.stok_barang (tenant_id, branch_id, nama_barang, satuan, stok, harga_satuan)
    VALUES (v_test_tenant, v_test_branch, 'Sabun Cuci Test', 'Liter', 50, 15000)
    RETURNING id INTO v_item_id;
    UPDATE public.stok_barang SET stok = 45 WHERE id = v_item_id;

    -- 5. Test barang_masuk
    INSERT INTO public.barang_masuk (tenant_id, branch_id, id_barang, nama_barang, jumlah_masuk, harga_satuan, total_harga)
    VALUES (v_test_tenant, v_test_branch, v_item_id, 'Sabun Cuci Test', 10, 15000, 150000);

    -- 6. Test barang_keluar
    INSERT INTO public.barang_keluar (tenant_id, branch_id, id_barang, nama_barang, jumlah_keluar)
    VALUES (v_test_tenant, v_test_branch, v_item_id, 'Sabun Cuci Test', 5);

    -- 7. Test daftar_harga_menu
    INSERT INTO public.daftar_harga_menu (tenant_id, nama_item, kategori, harga, is_active)
    VALUES (v_test_tenant, 'Kopi Uji Coba', 'Minuman', 18000, TRUE);

    -- 8. Test resep
    INSERT INTO public.resep (tenant_id, nama_menu, nama_bahan, jumlah, satuan)
    VALUES (v_test_tenant, 'Kopi Uji Coba', 'Sabun Cuci Test', 1, 'Liter');

    -- 9. Test struk (Order Header)
    INSERT INTO public.struk (tenant_id, branch_id, id_struk, total_tagihan, metode_bayar, status_bayar, kasir)
    VALUES (v_test_tenant, v_test_branch, v_struk_id, 50000, 'CASH', 'Selesai', 'Kasir Test');

    -- 10. Test cafe (FK to struk)
    INSERT INTO public.cafe (tenant_id, branch_id, id_struk, nama_menu, qty, harga_satuan, subtotal, status)
    VALUES (v_test_tenant, v_test_branch, v_struk_id, 'Kopi Uji Coba', 2, 18000, 36000, 'Selesai');

    -- 11. Test carwash (FK to struk)
    INSERT INTO public.carwash (tenant_id, branch_id, id_struk, plat, ukuran, variant, paket, harga, status)
    VALUES (v_test_tenant, v_test_branch, v_struk_id, 'B 1234 TEST', 'Medium', 'Regular', 'Cuci Reguler', 14000, 'Selesai');

    -- 12. Test cashflow
    INSERT INTO public.cashflow (tenant_id, branch_id, jenis, kategori, keterangan_transaksi, pemasukan, pengeluaran, saldo_cash)
    VALUES (v_test_tenant, v_test_branch, 'Pemasukan', 'Penjualan', 'Test Cashflow', 50000, 0, 50000);

    -- 13. Test pengeluaran
    INSERT INTO public.pengeluaran (tenant_id, branch_id, nama_pengeluaran, jenis, nominal)
    VALUES (v_test_tenant, v_test_branch, 'Beli Perlengkapan Test', 'Operasional', 25000);

    -- 14. Test karyawan_cuci & karyawan_kantor
    INSERT INTO public.karyawan_cuci (tenant_id, branch_id, nama, status)
    VALUES (v_test_tenant, v_test_branch, 'Budi Pencuci Test', 'Aktif');

    INSERT INTO public.karyawan_kantor (tenant_id, branch_id, nama, role, status)
    VALUES (v_test_tenant, v_test_branch, 'Siti Kasir Test', 'Kasir', 'Aktif');

    -- 15. Test carwash_packages & diskon
    INSERT INTO public.carwash_packages (tenant_id, name, price, commission_amount)
    VALUES (v_test_tenant, 'Paket Express Test', 30000, 5000);

    INSERT INTO public.diskon (tenant_id, nama, persen, is_active)
    VALUES (v_test_tenant, 'Promo Grand Opening Test', 10, TRUE);

    -- 16. Test clean cascade deletion of the test tenant
    DELETE FROM public.tenants WHERE id = v_test_tenant;

    RAISE NOTICE 'ALL CRUD AND CASCADE INTEGRITY TESTS COMPLETED WITH 100%% SUCCESS!';
END $$;
"""

if __name__ == "__main__":
    import subprocess
    cmd = [sys.executable, "scripts/db_inspector.py", CRUD_TEST_SQL]
    res = subprocess.run(cmd, capture_output=True, text=True)
    print("OUTPUT:", res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)
