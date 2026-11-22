-- ==============================================================================
-- MIGRATION: 20261117000007_harden_carwash_packages_and_onboarding_defaults.sql
-- TUJUAN:
-- 1. Pastikan kolom keterangan (TEXT) dan tarif_matrix (JSONB) tersedia pada
--    tabel public.carwash_packages.
-- 2. Perbarui public.fn_initialize_tenant_defaults agar seluruh 6 paket starter
--    carwash langsung di-seed ke DB menggunakan gen_random_uuid() beserta
--    tarif_matrix JSONB dan starter stok_barang yang memiliki id_barang & id_bahan_baku.
-- 3. Perbarui public.fn_complete_store_setup agar konfigurasi paket carwash &
--    stok awal dari onboarding wizard tersimpan dengan UUID sah, keterangan,
--    tarif_matrix JSONB, dan kode SKU otomatis.
-- ==============================================================================

-- 1. Schema Alignment pada public.carwash_packages
ALTER TABLE public.carwash_packages
    ADD COLUMN IF NOT EXISTS keterangan TEXT,
    ADD COLUMN IF NOT EXISTS tarif_matrix JSONB;

-- 2. Perbarui fn_initialize_tenant_defaults
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

        -- 5. Paket Starter Carwash (carwash_packages) dengan UUID dan tarif_matrix lengkap
        INSERT INTO public.carwash_packages (
            id, tenant_id, branch_id, name, nama_paket, description, keterangan, price, tarif, sort_order, komisi_skema, tarif_matrix, is_active
        ) VALUES
            (
                gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET CUCI BIASA', 'PAKET CUCI BIASA',
                'Cuci bersih body luar dan vakum interior standar', 'Cuci bersih body luar dan vakum interior standar',
                50000.00, 50000.00, 1, 'TIERED',
                '{"Small":{"Regular":50000,"Body only":35000},"Medium":{"Regular":55000,"Body only":40000},"Large":{"Regular":60000,"Body only":45000},"Extra Large":{"Regular":80000,"Body only":80000}}'::jsonb,
                TRUE
            ),
            (
                gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET KACA BENING (CUCI + JAMUR KACA)', 'PAKET KACA BENING (CUCI + JAMUR KACA)',
                'Cuci reguler ditambah pembersihan jamur kaca depan/samping', 'Cuci reguler ditambah pembersihan jamur kaca depan/samping',
                150000.00, 150000.00, 2, 'TIERED',
                '{"Small":{"Regular":150000,"Body only":135000},"Medium":{"Regular":155000,"Body only":140000},"Large":{"Regular":160000,"Body only":145000},"Extra Large":{"Regular":180000,"Body only":180000}}'::jsonb,
                TRUE
            ),
            (
                gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET DAUN TALAS (CUCI + WAX KACA)', 'PAKET DAUN TALAS (CUCI + WAX KACA)',
                'Cuci reguler ditambah coating efek daun talas pada kaca', 'Cuci reguler ditambah coating efek daun talas pada kaca',
                100000.00, 100000.00, 3, 'TIERED',
                '{"Small":{"Regular":100000,"Body only":85000},"Medium":{"Regular":105000,"Body only":90000},"Large":{"Regular":110000,"Body only":95000},"Extra Large":{"Regular":130000,"Body only":130000}}'::jsonb,
                TRUE
            ),
            (
                gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET JURAGAN (CUCI + JAMUR KACA + WAX KACA)', 'PAKET JURAGAN (CUCI + JAMUR KACA + WAX KACA)',
                'Treatment kaca lengkap jamur + wax hydrophobic', 'Treatment kaca lengkap jamur + wax hydrophobic',
                200000.00, 200000.00, 4, 'TIERED',
                '{"Small":{"Regular":200000,"Body only":185000},"Medium":{"Regular":205000,"Body only":190000},"Large":{"Regular":210000,"Body only":195000},"Extra Large":{"Regular":230000,"Body only":230000}}'::jsonb,
                TRUE
            ),
            (
                gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET GLOW UP (CUCI + WAX BODY)', 'PAKET GLOW UP (CUCI + WAX BODY)',
                'Cuci reguler ditambah wax kilap body mobil', 'Cuci reguler ditambah wax kilap body mobil',
                100000.00, 100000.00, 5, 'TIERED',
                '{"Small":{"Regular":100000,"Body only":85000},"Medium":{"Regular":110000,"Body only":95000},"Large":{"Regular":120000,"Body only":105000},"Extra Large":{"Regular":160000,"Body only":160000}}'::jsonb,
                TRUE
            ),
            (
                gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)', 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)',
                'Pembersihan jamur body menyeluruh ditambah wax finishing', 'Pembersihan jamur body menyeluruh ditambah wax finishing',
                180000.00, 180000.00, 6, 'TIERED',
                '{"Small":{"Regular":180000,"Body only":165000},"Medium":{"Regular":200000,"Body only":185000},"Large":{"Regular":220000,"Body only":205000},"Extra Large":{"Regular":300000,"Body only":300000}}'::jsonb,
                TRUE
            )
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

-- 3. Perbarui fn_complete_store_setup
CREATE OR REPLACE FUNCTION public.fn_complete_store_setup(
    p_tenant_id UUID,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_tenant UUID;
    v_branch_id UUID;
    v_skip BOOLEAN := COALESCE((p_payload->>'skip')::boolean, FALSE);
    v_clear_samples BOOLEAN := COALESCE((p_payload->>'clear_starter_samples')::boolean, FALSE);
    v_owner_name TEXT := NULLIF(btrim(COALESCE(p_payload->>'owner_name', '')), '');
    v_store_name TEXT := NULLIF(btrim(COALESCE(p_payload->>'store_name', '')), '');
    v_business_type TEXT := UPPER(NULLIF(btrim(COALESCE(p_payload->>'business_type', '')), ''));
    v_telepon TEXT := NULLIF(btrim(COALESCE(p_payload->>'telepon', '')), '');
    v_alamat TEXT := NULLIF(btrim(COALESCE(p_payload->>'alamat', '')), '');
    v_has_tx BOOLEAN := FALSE;

    v_item JSONB;
    v_pkg_name TEXT;
    v_pkg_price NUMERIC(15, 2);
    v_pkg_desc TEXT;
    v_pkg_matrix JSONB;
    v_menu_name TEXT;
    v_menu_cat TEXT;
    v_menu_price NUMERIC(15, 2);
    v_stock_name TEXT;
    v_stock_sku TEXT;
    v_stock_unit TEXT;
    v_stock_qty NUMERIC(15, 4);
    v_stock_cost NUMERIC(15, 4);
    v_stock_min NUMERIC(15, 4);
    v_stock_gudang TEXT;
    v_idx INTEGER := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
    FROM public.profiles
    WHERE id = v_uid AND is_active = TRUE
    LIMIT 1;

    IF v_caller_role NOT IN ('Owner', 'Super Admin')
       OR (v_caller_role <> 'Super Admin' AND v_caller_tenant IS DISTINCT FROM p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Owner toko ini yang berhak mengonfigurasi setup toko.' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
    ORDER BY (is_main = TRUE) DESC, (kode = 'MAIN') DESC, created_at ASC
    LIMIT 1;

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

    -- 1. Perbarui profil Owner
    IF v_owner_name IS NOT NULL THEN
        UPDATE public.profiles
        SET nama = v_owner_name,
            updated_at = NOW()
        WHERE id = v_uid;
    END IF;

    -- 2. Perbarui identitas Tenant & tandai onboarding selesai
    IF v_business_type IS NOT NULL AND v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    UPDATE public.tenants
    SET nama = COALESCE(v_store_name, nama),
        business_type = COALESCE(v_business_type, business_type),
        onboarding_completed = TRUE,
        updated_at = NOW()
    WHERE id = p_tenant_id;

    -- 3. Perbarui Cabang Utama (Alamat & No. WhatsApp)
    IF v_branch_id IS NOT NULL THEN
        UPDATE public.branches
        SET nama = COALESCE(v_store_name, nama),
            alamat = COALESCE(v_alamat, alamat),
            telepon = COALESCE(v_telepon, telepon),
            updated_at = NOW()
        WHERE id = v_branch_id;
    END IF;

    -- 4. Bersihkan data starter bawaan jika diminta dan belum ada transaksi
    IF v_clear_samples THEN
        SELECT EXISTS (SELECT 1 FROM public.struk WHERE tenant_id = p_tenant_id LIMIT 1) INTO v_has_tx;
        IF NOT v_has_tx THEN
            DELETE FROM public.resep WHERE tenant_id = p_tenant_id;
            DELETE FROM public.daftar_harga_menu WHERE tenant_id = p_tenant_id;
            DELETE FROM public.carwash_packages WHERE tenant_id = p_tenant_id;
            DELETE FROM public.stok_barang WHERE tenant_id = p_tenant_id;
        END IF;
    END IF;

    -- 5. Simpan Paket Cuci awal dengan UUID asli dan tarif_matrix
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'carwash_packages', '[]'::jsonb))
    LOOP
        v_pkg_name := NULLIF(btrim(COALESCE(v_item->>'nama_paket', v_item->>'name', '')), '');
        v_pkg_price := GREATEST(0, COALESCE(NULLIF(v_item->>'tarif', '')::numeric, NULLIF(v_item->>'price', '')::numeric, 0));
        v_pkg_desc := COALESCE(NULLIF(btrim(COALESCE(v_item->>'keterangan', v_item->>'description', '')), ''), 'Layanan cuci kendaraan');

        IF v_pkg_name IS NOT NULL THEN
            IF (v_item ? 'tarif_matrix') AND (jsonb_typeof(v_item->'tarif_matrix') = 'object') THEN
                v_pkg_matrix := v_item->'tarif_matrix';
            ELSE
                v_pkg_matrix := jsonb_build_object(
                    'Small', jsonb_build_object('Regular', v_pkg_price, 'Body only', GREATEST(0, v_pkg_price - 15000)),
                    'Medium', jsonb_build_object('Regular', v_pkg_price + 5000, 'Body only', GREATEST(0, v_pkg_price - 10000)),
                    'Large', jsonb_build_object('Regular', v_pkg_price + 10000, 'Body only', GREATEST(0, v_pkg_price - 5000)),
                    'Extra Large', jsonb_build_object('Regular', v_pkg_price + 30000, 'Body only', v_pkg_price + 30000)
                );
            END IF;

            INSERT INTO public.carwash_packages (
                id, tenant_id, branch_id, name, nama_paket, description, keterangan, price, tarif, komisi_skema, tarif_matrix, is_active
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_branch_id, UPPER(v_pkg_name), UPPER(v_pkg_name),
                v_pkg_desc, v_pkg_desc, v_pkg_price, v_pkg_price, 'TIERED', v_pkg_matrix, TRUE
            ) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- 6. Simpan Menu Cafe awal
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

    -- 7. Simpan Bahan Baku / Stok Awal dengan SKU terisi otomatis
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
$$;
