-- ==============================================================================
-- MIGRATION: 20261117000005_backfill_sku_and_harden_starter_stock.sql
-- TUJUAN:
-- 1. Mengisi (backfill) kode SKU unik (id_barang & id_bahan_baku) untuk seluruh
--    stok yang kolom kodenya masih NULL pada tabel public.stok_barang.
-- 2. Memperbarui public.fn_initialize_tenant_defaults & public.fn_complete_store_setup
--    agar setiap barang awal selalu di-generate SKU/kode barang otomatis.
-- ==============================================================================

-- 1. Backfill baris stok_barang yang belum memiliki id_barang / id_bahan_baku
UPDATE public.stok_barang
SET 
    id_barang = COALESCE(
        id_barang,
        id_bahan_baku,
        CASE 
            WHEN UPPER(nama_produk) LIKE '%KOPI%' THEN 'BB-KOPI-' || SUBSTRING(id::text, 1, 4)
            WHEN UPPER(nama_produk) LIKE '%SUSU%' THEN 'BB-SUSU-' || SUBSTRING(id::text, 1, 4)
            WHEN UPPER(nama_produk) LIKE '%SHAMPOO%' OR UPPER(nama_produk) LIKE '%SAMPO%' THEN 'BB-SHM-' || SUBSTRING(id::text, 1, 4)
            WHEN UPPER(gudang) = 'CARWASH' THEN 'CW-' || SUBSTRING(id::text, 1, 6)
            WHEN UPPER(gudang) = 'MERCHANDISE' THEN 'MRC-' || SUBSTRING(id::text, 1, 6)
            ELSE 'SKU-' || SUBSTRING(id::text, 1, 6)
        END
    ),
    id_bahan_baku = COALESCE(
        id_bahan_baku,
        id_barang,
        CASE 
            WHEN UPPER(nama_produk) LIKE '%KOPI%' THEN 'BB-KOPI-' || SUBSTRING(id::text, 1, 4)
            WHEN UPPER(nama_produk) LIKE '%SUSU%' THEN 'BB-SUSU-' || SUBSTRING(id::text, 1, 4)
            WHEN UPPER(nama_produk) LIKE '%SHAMPOO%' OR UPPER(nama_produk) LIKE '%SAMPO%' THEN 'BB-SHM-' || SUBSTRING(id::text, 1, 4)
            WHEN UPPER(gudang) = 'CARWASH' THEN 'CW-' || SUBSTRING(id::text, 1, 6)
            WHEN UPPER(gudang) = 'MERCHANDISE' THEN 'MRC-' || SUBSTRING(id::text, 1, 6)
            ELSE 'SKU-' || SUBSTRING(id::text, 1, 6)
        END
    )
WHERE id_barang IS NULL OR id_bahan_baku IS NULL;

-- 2. Perbarui fn_initialize_tenant_defaults agar starter stock memiliki id_barang & id_bahan_baku
CREATE OR REPLACE FUNCTION public.fn_initialize_tenant_defaults(p_tenant_id UUID, p_branch_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 1. Chart of Accounts (COA) Standar Indonesia
    INSERT INTO public.chart_of_accounts (
        tenant_id, kode_akun, nama_akun, tipe, kategori, saldo_normal, saldo_awal, is_active
    ) VALUES
        (p_tenant_id, '1001', 'Kas Kasir & Operasional Utama', 'ASET', 'Kas & Bank', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '1101', 'Kas Tunai Laci Kasir', 'ASET', 'Kas & Bank', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '1102', 'Bank Rekening Operasional', 'ASET', 'Kas & Bank', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '1103', 'Persediaan Bahan Baku & Barang Dagang', 'ASET', 'Persediaan', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '2101', 'Hutang Usaha & Operasional', 'KEWAJIBAN', 'Hutang Lancar', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '3101', 'Modal Disetor Pemilik', 'EKUITAS', 'Modal', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '3102', 'Prive / Penarikan Modal Pemilik', 'EKUITAS', 'Ekuitas', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '4101', 'Pendapatan Layanan Carwash', 'PENDAPATAN', 'Pendapatan Usaha', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '4102', 'Pendapatan Penjualan Cafe & F&B', 'PENDAPATAN', 'Pendapatan Usaha', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '5101', 'Beban Pokok Pendapatan (HPP)', 'BEBAN', 'Beban Pokok Penjualan', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '6101', 'Beban Gaji & Komisi Cuci', 'BEBAN', 'Beban Operasional', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '6102', 'Beban Operasional & Listrik Air', 'BEBAN', 'Beban Operasional', 'DEBIT', 0.00, TRUE)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING;

    -- 2. Kategori Master Keuangan (master_categories)
    INSERT INTO public.master_categories (tenant_id, nama_kategori, jenis, tipe_arus, boleh_kasir, is_active)
    VALUES
        (p_tenant_id, 'Operasional & Utilitas', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Gaji & Komisi Karyawan', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Bahan Baku & Dapur', 'PENGELUARAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Belanja Perlengkapan Cuci', 'PENGELUARAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Pemeliharaan & Servis Alat', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Sewa Tempat & Bangunan', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Prive & Penarikan Dana', 'PENGELUARAN', 'PENDANAAN', FALSE, TRUE),
        (p_tenant_id, 'Penjualan Cafe & Minuman', 'PEMASUKAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Layanan Jasa Cuci Mobil', 'PEMASUKAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Pendapatan Lain-lain', 'PEMASUKAN', 'OPERASI', FALSE, TRUE)
    ON CONFLICT (tenant_id, nama_kategori) DO NOTHING;

    -- 3. CRM Program Loyalitas Bawaan (crm_loyalty_programs)
    INSERT INTO public.crm_loyalty_programs (
        tenant_id, nama_program, tipe_reward, target_kunjungan, reward_diskon_persen, reward_diskon_nominal, is_active
    ) VALUES
        (p_tenant_id, 'Loyalitas Cuci Mobil (Koleksi Stamp)', 'FREE_PRODUCT', 5, 100, 0, TRUE),
        (p_tenant_id, 'Kopi Gratis Pelanggan Setia Cafe', 'DISCOUNT_PERCENT', 7, 100, 0, TRUE)
    ON CONFLICT DO NOTHING;

    -- 4. Menu Starter Cafe (daftar_harga_menu)
    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.daftar_harga_menu (
            tenant_id, branch_id, daftar_menu, nama_menu, harga, kategori, is_active
        ) VALUES
            (p_tenant_id, p_branch_id, 'Kopi Susu Aren', 'Kopi Susu Aren', 18000.00, 'Kopi', TRUE),
            (p_tenant_id, p_branch_id, 'Americano Dingin', 'Americano Dingin', 15000.00, 'Kopi', TRUE),
            (p_tenant_id, p_branch_id, 'Roti Bakar Cokelat', 'Roti Bakar Cokelat', 15000.00, 'Makanan', TRUE),
            (p_tenant_id, p_branch_id, 'Kentang Goreng Crispy', 'Kentang Goreng Crispy', 16000.00, 'Snack', TRUE)
        ON CONFLICT (tenant_id, branch_id, daftar_menu) DO NOTHING;

        -- 5. Paket Starter Carwash (carwash_packages)
        INSERT INTO public.carwash_packages (
            tenant_id, branch_id, name, nama_paket, price, tarif, is_active
        ) VALUES
            (p_tenant_id, p_branch_id, 'PAKET CUCI BIASA', 'PAKET CUCI BIASA', 35000.00, 35000.00, TRUE),
            (p_tenant_id, p_branch_id, 'PAKET CUCI SALJU / HIDROLIK', 'PAKET CUCI SALJU / HIDROLIK', 50000.00, 50000.00, TRUE),
            (p_tenant_id, p_branch_id, 'PAKET CUCI WAX', 'PAKET CUCI WAX', 75000.00, 75000.00, TRUE)
        ON CONFLICT DO NOTHING;

        -- 6. Starter Stok Bahan Baku & Barang Dagang (stok_barang) dengan ID_BARANG & ID_BAHAN_BAKU terisi
        INSERT INTO public.stok_barang (
            id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_produk, nama_barang, satuan, stok, stok_akhir, min_stok, gudang, kategori, is_active
        ) VALUES
            (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-KOPI', 'BB-KOPI', 'Biji Kopi House Blend', 'Biji Kopi House Blend', 'kg', 100.00, 100.00, 5.00, 'CAFE', 'Bahan Baku', TRUE),
            (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-SUSU', 'BB-SUSU', 'Susu Segar UHT', 'Susu Segar UHT', 'liter', 100.00, 100.00, 10.00, 'CAFE', 'Bahan Baku', TRUE),
            (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-SHM', 'BB-SHM', 'Shampoo Carwash Touchless', 'Shampoo Carwash Touchless', 'liter', 200.00, 200.00, 20.00, 'CARWASH', 'Bahan Baku', TRUE)
        ON CONFLICT DO NOTHING;

        -- 7. Starter Resep BOM (resep)
        INSERT INTO public.resep (
            id, tenant_id, nama_menu, nama_bahan, nama_bahan_baku, jumlah, jumlah_dibutuhkan, satuan
        ) VALUES
            (gen_random_uuid(), p_tenant_id, 'Kopi Susu Aren', 'Biji Kopi House Blend', 'Biji Kopi House Blend', 0.02, 0.02, 'kg'),
            (gen_random_uuid(), p_tenant_id, 'Kopi Susu Aren', 'Susu Segar UHT', 'Susu Segar UHT', 0.15, 0.15, 'liter')
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

-- 3. Perbarui public.fn_complete_store_setup agar stock_items selalu mengisi id_barang & id_bahan_baku
CREATE OR REPLACE FUNCTION public.fn_complete_store_setup(
    p_tenant_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v_uid UUID;
    v_owner_name TEXT;
    v_store_name TEXT;
    v_business_type TEXT;
    v_telepon TEXT;
    v_alamat TEXT;
    v_skip BOOLEAN;
    v_clear_samples BOOLEAN;
    v_branch_id UUID;
    v_has_tx BOOLEAN;
    v_item JSONB;
    v_stock_name TEXT;
    v_stock_sku TEXT;
    v_stock_unit TEXT;
    v_stock_qty NUMERIC(18, 4);
    v_stock_cost NUMERIC(18, 4);
    v_stock_min NUMERIC(18, 4);
    v_stock_gudang TEXT;
    v_pkg_name TEXT;
    v_pkg_price NUMERIC(18, 4);
    v_menu_name TEXT;
    v_menu_cat TEXT;
    v_menu_price NUMERIC(18, 4);
    v_idx INTEGER := 0;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Operasi onboarding memerlukan login autentikasi.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_uid AND tenant_id = p_tenant_id AND role IN ('Owner', 'Super Admin')
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Pemilik Usaha (Owner) yang berhak mengatur konfigurasi toko.'
            USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at ASC
    LIMIT 1;

    v_skip := COALESCE((p_payload->>'skip')::boolean, FALSE);
    v_owner_name := NULLIF(btrim(COALESCE(p_payload->>'owner_name', '')), '');
    v_store_name := NULLIF(btrim(COALESCE(p_payload->>'store_name', '')), '');
    v_business_type := UPPER(NULLIF(btrim(COALESCE(p_payload->>'business_type', '')), ''));
    v_telepon := NULLIF(btrim(COALESCE(p_payload->>'telepon', '')), '');
    v_alamat := NULLIF(btrim(COALESCE(p_payload->>'alamat', '')), '');
    v_clear_samples := COALESCE((p_payload->>'clear_samples')::boolean, FALSE);

    IF v_skip THEN
        UPDATE public.tenants
        SET onboarding_completed = TRUE,
            updated_at = NOW()
        WHERE id = p_tenant_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'tenant_id', p_tenant_id,
            'branch_id', v_branch_id,
            'onboarding_completed', TRUE,
            'skipped', TRUE
        );
    END IF;

    IF v_owner_name IS NOT NULL THEN
        UPDATE public.profiles
        SET nama = v_owner_name,
            updated_at = NOW()
        WHERE id = v_uid;
    END IF;

    IF v_business_type IS NOT NULL AND v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    UPDATE public.tenants
    SET nama = COALESCE(v_store_name, nama),
        business_type = COALESCE(v_business_type, business_type),
        onboarding_completed = TRUE,
        updated_at = NOW()
    WHERE id = p_tenant_id;

    IF v_branch_id IS NOT NULL THEN
        UPDATE public.branches
        SET nama = COALESCE(v_store_name, nama),
            alamat = COALESCE(v_alamat, alamat),
            telepon = COALESCE(v_telepon, telepon),
            updated_at = NOW()
        WHERE id = v_branch_id;
    END IF;

    IF v_clear_samples THEN
        SELECT EXISTS (SELECT 1 FROM public.struk WHERE tenant_id = p_tenant_id LIMIT 1) INTO v_has_tx;
        IF NOT v_has_tx THEN
            DELETE FROM public.resep WHERE tenant_id = p_tenant_id;
            DELETE FROM public.daftar_harga_menu WHERE tenant_id = p_tenant_id;
            DELETE FROM public.carwash_packages WHERE tenant_id = p_tenant_id;
            DELETE FROM public.stok_barang WHERE tenant_id = p_tenant_id;
        END IF;
    END IF;

    -- Simpan Paket Cuci awal
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'carwash_packages', '[]'::jsonb))
    LOOP
        v_pkg_name := NULLIF(btrim(COALESCE(v_item->>'nama_paket', v_item->>'name', '')), '');
        v_pkg_price := GREATEST(0, COALESCE(NULLIF(v_item->>'tarif', '')::numeric, NULLIF(v_item->>'price', '')::numeric, 0));
        IF v_pkg_name IS NOT NULL THEN
            INSERT INTO public.carwash_packages (
                tenant_id, branch_id, name, nama_paket, price, tarif, is_active
            ) VALUES (
                p_tenant_id, v_branch_id, UPPER(v_pkg_name), UPPER(v_pkg_name), v_pkg_price, v_pkg_price, TRUE
            ) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- Simpan Menu Cafe awal
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'cafe_menus', '[]'::jsonb))
    LOOP
        v_menu_name := NULLIF(btrim(COALESCE(v_item->>'nama_menu', v_item->>'daftar_menu', '')), '');
        v_menu_cat := COALESCE(NULLIF(btrim(COALESCE(v_item->>'kategori', '')), ''), 'Minuman');
        v_menu_price := GREATEST(0, COALESCE(NULLIF(v_item->>'harga', '')::numeric, 0));
        IF v_menu_name IS NOT NULL THEN
            INSERT INTO public.daftar_harga_menu (
                tenant_id, branch_id, daftar_menu, nama_menu, harga, kategori, is_active
            ) VALUES (
                p_tenant_id, v_branch_id, v_menu_name, v_menu_name, v_menu_price, v_menu_cat, TRUE
            )
            ON CONFLICT (tenant_id, branch_id, daftar_menu) DO UPDATE SET
                harga = EXCLUDED.harga,
                kategori = EXCLUDED.kategori,
                is_active = TRUE,
                updated_at = NOW();
        END IF;
    END LOOP;

    -- Simpan Bahan Baku / Stok Awal dengan SKU terisi otomatis
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'stock_items', '[]'::jsonb))
    LOOP
        v_idx := v_idx + 1;
        v_stock_name := NULLIF(btrim(COALESCE(v_item->>'nama_barang', v_item->>'nama_produk', '')), '');
        v_stock_unit := COALESCE(NULLIF(btrim(COALESCE(v_item->>'satuan', '')), ''), 'pcs');
        v_stock_qty := GREATEST(0, COALESCE(NULLIF(v_item->>'stok', '')::numeric, 0));
        v_stock_cost := GREATEST(0, COALESCE(NULLIF(v_item->>'harga_satuan', '')::numeric, NULLIF(v_item->>'harga_beli', '')::numeric, 0));
        v_stock_min := GREATEST(0, COALESCE(NULLIF(v_item->>'min_stok', '')::numeric, 5));
        v_stock_gudang := UPPER(COALESCE(NULLIF(btrim(COALESCE(v_item->>'gudang', '')), ''), 'CAFE'));
        IF v_stock_gudang NOT IN ('CAFE', 'CARWASH', 'MERCHANDISE') THEN
            v_stock_gudang := 'CAFE';
        END IF;

        v_stock_sku := COALESCE(
            NULLIF(btrim(COALESCE(v_item->>'id_barang', v_item->>'id_bahan_baku', v_item->>'sku', '')), ''),
            CASE 
                WHEN UPPER(v_stock_name) LIKE '%KOPI%' THEN 'BB-KOPI-' || LPAD(v_idx::text, 2, '0')
                WHEN UPPER(v_stock_name) LIKE '%SUSU%' THEN 'BB-SUSU-' || LPAD(v_idx::text, 2, '0')
                WHEN UPPER(v_stock_name) LIKE '%SHAMPOO%' OR UPPER(v_stock_name) LIKE '%SAMPO%' THEN 'BB-SHM-' || LPAD(v_idx::text, 2, '0')
                WHEN v_stock_gudang = 'CARWASH' THEN 'CW-' || LPAD(v_idx::text, 3, '0')
                WHEN v_stock_gudang = 'MERCHANDISE' THEN 'MRC-' || LPAD(v_idx::text, 3, '0')
                ELSE 'BB-' || LPAD(v_idx::text, 3, '0')
            END
        );

        IF v_stock_name IS NOT NULL THEN
            INSERT INTO public.stok_barang (
                id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_produk, nama_barang, satuan,
                stok, stok_akhir, harga_satuan, harga_beli, min_stok,
                gudang, kategori, is_active
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_branch_id, v_stock_sku, v_stock_sku, v_stock_name, v_stock_name, v_stock_unit,
                v_stock_qty, v_stock_qty, v_stock_cost, v_stock_cost, v_stock_min,
                v_stock_gudang, 'Bahan Baku', TRUE
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'branch_id', v_branch_id,
        'onboarding_completed', TRUE
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_complete_store_setup(UUID, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_complete_store_setup(UUID, JSONB) TO authenticated;
