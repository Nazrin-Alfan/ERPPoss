-- ==============================================================================
-- MIGRATION 012: RECONCILE REGISTRATION, CHECKOUT PIPELINE & SCHEMA ALIGNMENT
-- Target Supabase Cloud: jutidxobdedygmjngmcq
-- Fixes:
-- 1. Alters 'struk' to add missing columns (pajak, bayar, total_transaksi, total_diskon, updated_at).
-- 2. Rewrites 'fn_initialize_tenant_defaults' to strictly match existing physical tables
--    (chart_of_accounts, master_categories, crm_loyalty_programs, daftar_harga_menu, carwash_packages, stok_barang).
-- 3. Hardens 'fn_execute_checkout' to read both 'harga_satuan' and 'harga', validate catalog price,
--    accurately deduct stock & BOM, record cashflow, and post balanced double-entry accounting journals.
-- ==============================================================================

-- 1. Ensure columns exist on table public.struk and public.barang_keluar
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS pajak NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS bayar NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS total_transaksi NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS total_diskon NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS keterangan TEXT;

-- 2. Re-create fn_initialize_tenant_defaults with exact schema alignment
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
        (p_tenant_id, 'Bahan Baku & Restock', 'PENGELUARAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Pendapatan Carwash', 'PEMASUKAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Pendapatan Cafe', 'PEMASUKAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Pendapatan Lain-lain', 'PEMASUKAN', 'OPERASI', TRUE, TRUE)
    ON CONFLICT DO NOTHING;

    -- 3. Program Loyalitas Bawaan (crm_loyalty_programs)
    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.crm_loyalty_programs (tenant_id, branch_id, target_stamps, reward_type, reward_title, reward_description, is_active)
        VALUES
            (p_tenant_id, p_branch_id, 5, 'FREE_WASH', 'Cuci 5x Gratis 1x', 'Reward loyalitas cuci mobil/motor', TRUE)
        ON CONFLICT DO NOTHING;
    END IF;

    -- 4. Starter Menu Cafe (daftar_harga_menu)
    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.daftar_harga_menu (
            tenant_id, branch_id, daftar_menu, nama_menu, harga, kategori, is_active
        ) VALUES
            (p_tenant_id, p_branch_id, 'Kopi Susu Aren', 'Kopi Susu Aren', 18000.00, 'Minuman', TRUE),
            (p_tenant_id, p_branch_id, 'Americano Dingin', 'Americano Dingin', 15000.00, 'Minuman', TRUE),
            (p_tenant_id, p_branch_id, 'Roti Toast Cokelat', 'Roti Toast Cokelat', 12000.00, 'Makanan', TRUE)
        ON CONFLICT (tenant_id, branch_id, daftar_menu) DO NOTHING;

        -- 5. Starter Paket Carwash (carwash_packages)
        INSERT INTO public.carwash_packages (
            tenant_id, branch_id, name, nama_paket, price, tarif, is_active
        ) VALUES
            (p_tenant_id, p_branch_id, 'PAKET CUCI BIASA', 'PAKET CUCI BIASA', 50000.00, 50000.00, TRUE),
            (p_tenant_id, p_branch_id, 'PAKET CUCI WAX', 'PAKET CUCI WAX', 75000.00, 75000.00, TRUE)
        ON CONFLICT DO NOTHING;

        -- 6. Starter Stok Bahan Baku & Barang Dagang (stok_barang)
        INSERT INTO public.stok_barang (
            id, tenant_id, branch_id, nama_produk, nama_barang, satuan, stok, stok_akhir, min_stok, kategori, is_active
        ) VALUES
            (gen_random_uuid(), p_tenant_id, p_branch_id, 'Biji Kopi House Blend', 'Biji Kopi House Blend', 'kg', 100.00, 100.00, 5.00, 'Bahan Baku', TRUE),
            (gen_random_uuid(), p_tenant_id, p_branch_id, 'Susu Segar UHT', 'Susu Segar UHT', 'liter', 100.00, 100.00, 10.00, 'Bahan Baku', TRUE),
            (gen_random_uuid(), p_tenant_id, p_branch_id, 'Shampoo Carwash Touchless', 'Shampoo Carwash Touchless', 'liter', 200.00, 200.00, 20.00, 'Bahan Baku', TRUE)
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

-- Drop function fn_execute_checkout first to avoid parameter default mismatch
DROP FUNCTION IF EXISTS public.fn_execute_checkout(UUID, UUID, JSONB, JSONB, JSONB);

-- 3. Hardened fn_execute_checkout
CREATE OR REPLACE FUNCTION public.fn_execute_checkout(
    p_tenant_id UUID,
    p_branch_id UUID,
    p_struk_payload JSONB,
    p_cafe_items JSONB,
    p_carwash_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_struk TEXT;
    v_tanggal DATE;
    v_jam TIME;
    v_status_bayar TEXT;
    v_nominal_bayar NUMERIC(15, 2) := 0.00;
    v_kembalian NUMERIC(15, 2) := 0.00;
    v_metode_bayar TEXT;
    v_kasir TEXT;
    v_customer TEXT;
    v_catatan TEXT;
    v_diskon NUMERIC(15, 2) := 0.00;
    v_pajak NUMERIC(15, 2) := 0.00;
    v_subtotal_kotor NUMERIC(15, 2) := 0.00;
    v_total_cafe NUMERIC(15, 2) := 0.00;
    v_total_carwash NUMERIC(15, 2) := 0.00;
    v_total_tagihan NUMERIC(15, 2) := 0.00;
    v_total_cogs NUMERIC(15, 2) := 0.00;

    v_existing_struk RECORD;
    v_item JSONB;
    v_nama_menu TEXT;
    v_qty_menu NUMERIC(15, 4);
    v_harga_menu NUMERIC(15, 2);
    v_menu_record RECORD;

    v_resep_record RECORD;
    v_stock_record RECORD;
    v_needed NUMERIC(15, 4);

    v_cw_record RECORD;
    v_cw_paket TEXT;
    v_cw_harga NUMERIC(15, 2);

    v_current_hash TEXT;
    v_advisory_key BIGINT;

    v_journal_id UUID;
    v_coa_kas UUID;
    v_coa_bank UUID;
    v_coa_inv UUID;
    v_coa_rev_cw UUID;
    v_coa_rev_cafe UUID;
    v_coa_cogs UUID;
    v_pos TEXT;
BEGIN
    -- 1. Validasi Tenant ID
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_TENANT_ID: Tenant ID wajib disertakan.';
    END IF;

    -- 2. Parsing Payload Struk
    v_id_struk := TRIM(COALESCE(p_struk_payload->>'id_struk', p_struk_payload->>'nomor_struk', p_struk_payload->>'no_struk', ''));
    IF v_id_struk = '' THEN
        v_id_struk := 'STRUK-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 4));
    END IF;

    -- 3. Advisory Lock Transaksional untuk Idempotensi
    v_advisory_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk), 1, 15))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_advisory_key);

    -- 4. Hitung Hash Payload Transaksi
    v_current_hash := md5(
        COALESCE(p_struk_payload::text, '') || '|' ||
        COALESCE(p_cafe_items::text, '') || '|' ||
        COALESCE(p_carwash_payload::text, '')
    );

    -- 5. Cek Idempotensi Struk Eksisting
    SELECT id, tenant_id, id_struk, status_bayar, payload_hash, total_tagihan, nominal_bayar, kembalian
    INTO v_existing_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    IF FOUND THEN
        IF v_existing_struk.status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
            IF v_existing_struk.payload_hash IS NOT NULL AND v_existing_struk.payload_hash <> v_current_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Struk "%" telah diselesaikan dengan payload transaksi yang berbeda.', v_id_struk;
            END IF;

            RETURN jsonb_build_object(
                'success', TRUE,
                'status', 'ALREADY_COMPLETED',
                'id_struk', v_id_struk,
                'total_tagihan', v_existing_struk.total_tagihan,
                'nominal_bayar', v_existing_struk.nominal_bayar,
                'kembalian', v_existing_struk.kembalian,
                'was_replayed', TRUE,
                'message', 'Transaksi sudah berstatus selesai, mutasi tidak diulang.'
            );
        END IF;
    END IF;

    -- 6. Ekstraksi Field Tambahan Struk
    v_tanggal := COALESCE(NULLIF(p_struk_payload->>'tanggal', '')::date, CURRENT_DATE);
    v_jam := COALESCE(NULLIF(p_struk_payload->>'jam', '')::time, CURRENT_TIME);
    v_status_bayar := COALESCE(NULLIF(p_struk_payload->>'status_bayar', ''), 'Selesai');
    v_diskon := COALESCE(NULLIF(p_struk_payload->>'diskon', '')::numeric, 0.00);
    v_pajak := COALESCE(NULLIF(p_struk_payload->>'pajak', '')::numeric, 0.00);
    v_nominal_bayar := COALESCE(NULLIF(p_struk_payload->>'nominal_bayar', '')::numeric, 0.00);
    v_kembalian := COALESCE(NULLIF(p_struk_payload->>'kembalian', '')::numeric, 0.00);
    v_metode_bayar := COALESCE(NULLIF(p_struk_payload->>'metode_bayar', ''), 'CASH');
    v_kasir := COALESCE(NULLIF(p_struk_payload->>'kasir', ''), 'Kasir');
    v_customer := COALESCE(NULLIF(p_struk_payload->>'nama_pelanggan', ''), 'Pelanggan Umum');
    v_catatan := COALESCE(p_struk_payload->>'catatan', '');

    IF v_diskon < 0.00 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh negatif.';
    END IF;

    -- 7. Validasi & Kalkulasi Item Cafe (Server-Side Price Validation)
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);

            -- Dukung baik harga_satuan (kontrak UI) maupun harga
            v_harga_menu := COALESCE(
                NULLIF(v_item->>'harga_satuan', '')::numeric,
                NULLIF(v_item->>'harga', '')::numeric,
                0.00
            );

            IF v_nama_menu = '' OR v_qty_menu <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Nama menu dan kuantitas wajib valid.';
            END IF;

            -- Verifikasi harga katalog server dari daftar_harga_menu
            SELECT harga INTO v_menu_record
            FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id
              AND (LOWER(TRIM(COALESCE(nama_menu, ''))) = LOWER(TRIM(v_nama_menu))
                   OR LOWER(TRIM(COALESCE(daftar_menu, ''))) = LOWER(TRIM(v_nama_menu)))
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1;

            IF FOUND THEN
                IF v_harga_menu <> v_menu_record.harga THEN
                    RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga menu "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                        v_nama_menu, v_menu_record.harga, v_harga_menu;
                END IF;
            ELSE
                IF v_harga_menu < 0.00 THEN
                    RAISE EXCEPTION 'INVALID_PRICE: Harga menu tidak boleh negatif.';
                END IF;
            END IF;

            v_total_cafe := v_total_cafe + (v_harga_menu * v_qty_menu);
        END LOOP;
    END IF;

    -- 8. Validasi & Kalkulasi Layanan Carwash
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        v_cw_paket := TRIM(COALESCE(p_carwash_payload->>'paket', ''));
        v_cw_harga := COALESCE(
            NULLIF(p_carwash_payload->>'harga', '')::numeric,
            NULLIF(p_carwash_payload->>'tarif', '')::numeric,
            0.00
        );

        IF v_cw_paket <> '' THEN
            SELECT price, tarif INTO v_cw_record
            FROM public.carwash_packages
            WHERE tenant_id = p_tenant_id
              AND (LOWER(TRIM(COALESCE(nama_paket, ''))) = LOWER(TRIM(v_cw_paket))
                   OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM(v_cw_paket)))
            LIMIT 1;

            IF FOUND THEN
                DECLARE
                    v_catalog_cw_price NUMERIC(15, 2);
                BEGIN
                    v_catalog_cw_price := COALESCE(v_cw_record.tarif, v_cw_record.price);
                    IF v_catalog_cw_price IS NOT NULL AND v_catalog_cw_price > 0.00 THEN
                        IF v_cw_harga <> v_catalog_cw_price THEN
                            RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga paket carwash "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                                v_cw_paket, v_catalog_cw_price, v_cw_harga;
                        END IF;
                    END IF;
                END;
            END IF;
        END IF;

        IF v_cw_harga < 0.00 THEN
            RAISE EXCEPTION 'INVALID_PRICE: Tarif carwash tidak boleh negatif.';
        END IF;

        v_total_carwash := v_cw_harga;
    END IF;

    -- 9. Kalkulasi Tagihan & Validasi Diskon
    v_subtotal_kotor := v_total_cafe + v_total_carwash;

    IF v_diskon > v_subtotal_kotor THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh melebihi subtotal kotor transaksi (Subtotal: %, Diskon: %).',
            v_subtotal_kotor, v_diskon;
    END IF;

    v_total_tagihan := GREATEST(0.00, (v_subtotal_kotor - v_diskon + v_pajak));

    -- 10. Validasi Pembayaran Lunas
    IF v_status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
        IF v_nominal_bayar < v_total_tagihan THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Pembayaran kurang dari total tagihan (Tagihan: %, Dibayar: %).',
                v_total_tagihan, v_nominal_bayar;
        END IF;
    END IF;

    -- 11. Simpan Header Struk Transaksi Terlebih Dahulu (Parent FK untuk cafe dan carwash)
    INSERT INTO public.struk (
        id, tenant_id, branch_id, id_struk, tanggal, jam, kasir,
        nama_pelanggan, catatan, status_bayar, status_pembayaran,
        subtotal, diskon, diskon_cafe, diskon_carwash,
        pajak, nominal_bayar, bayar, kembalian, metode_bayar,
        metode_pembayaran, total_tagihan, total, payload_hash,
        created_at, waktu_dibuat, updated_at
    ) VALUES (
        gen_random_uuid(), p_tenant_id, p_branch_id, v_id_struk, v_tanggal, v_jam, v_kasir,
        v_customer, v_catatan, v_status_bayar, v_status_bayar,
        v_subtotal_kotor, v_diskon, v_diskon, 0.00,
        v_pajak, v_nominal_bayar, v_nominal_bayar, v_kembalian, v_metode_bayar,
        v_metode_bayar, v_total_tagihan, v_total_tagihan, v_current_hash,
        NOW(), NOW(), NOW()
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET
        status_bayar = EXCLUDED.status_bayar,
        status_pembayaran = EXCLUDED.status_pembayaran,
        nominal_bayar = EXCLUDED.nominal_bayar,
        bayar = EXCLUDED.bayar,
        kembalian = EXCLUDED.kembalian,
        pajak = EXCLUDED.pajak,
        total_tagihan = EXCLUDED.total_tagihan,
        total = EXCLUDED.total,
        updated_at = NOW();

    -- 12. Pengurangan Stok Bahan Baku / Produk (BOM Inventory Deduction)
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);

            -- Periksa apakah item memiliki resep BOM
            FOR v_resep_record IN
                SELECT nama_bahan, COALESCE(jumlah_dibutuhkan, jumlah) AS jumlah_per_porsi, satuan
                FROM public.resep
                WHERE tenant_id = p_tenant_id
                  AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu))
            LOOP
                v_needed := v_resep_record.jumlah_per_porsi * v_qty_menu;

                -- Kunci baris stok bahan baku
                SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                INTO v_stock_record
                FROM public.stok_barang
                WHERE tenant_id = p_tenant_id
                  AND (LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_resep_record.nama_bahan))
                       OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_resep_record.nama_bahan)))
                FOR UPDATE;

                IF FOUND THEN
                    IF v_stock_record.stok < v_needed THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_resep_record.nama_bahan, v_stock_record.stok, v_needed;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_needed,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_needed,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id;

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, tanggal, keterangan, alasan, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, p_branch_id, v_stock_record.id::text, v_stock_record.id,
                        v_resep_record.nama_bahan, v_resep_record.nama_bahan, v_resep_record.nama_bahan,
                        v_needed, v_tanggal, 'BOM Pemakaian POS Struk: ' || v_id_struk, 'POS_SALE', NOW()
                    );

                    v_total_cogs := v_total_cogs + (v_needed * v_stock_record.unit_cost);
                END IF;
            END LOOP;

            -- Jika item tidak memiliki resep, cek apakah produk dijual langsung dari stok_barang
            IF NOT EXISTS (
                SELECT 1 FROM public.resep
                WHERE tenant_id = p_tenant_id AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu))
            ) THEN
                SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                INTO v_stock_record
                FROM public.stok_barang
                WHERE tenant_id = p_tenant_id
                  AND (LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_nama_menu))
                       OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_nama_menu)))
                FOR UPDATE;

                IF FOUND THEN
                    IF v_stock_record.stok < v_qty_menu THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_nama_menu, v_stock_record.stok, v_qty_menu;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_qty_menu,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_qty_menu,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id;

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, tanggal, keterangan, alasan, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, p_branch_id, v_stock_record.id::text, v_stock_record.id,
                        v_nama_menu, v_nama_menu, v_nama_menu,
                        v_qty_menu, v_tanggal, 'Penjualan Langsung POS Struk: ' || v_id_struk, 'POS_SALE', NOW()
                    );

                    v_total_cogs := v_total_cogs + (v_qty_menu * v_stock_record.unit_cost);
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 12. Simpan Baris Detail Cafe
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);
            v_harga_menu := COALESCE(
                NULLIF(v_item->>'harga_satuan', '')::numeric,
                NULLIF(v_item->>'harga', '')::numeric,
                0.00
            );

            INSERT INTO public.cafe (
                id, tenant_id, branch_id, id_struk, tanggal, jam,
                nama_menu, qty, harga_satuan, subtotal, status, catatan, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, p_branch_id, v_id_struk, v_tanggal, v_jam,
                v_nama_menu, v_qty_menu, v_harga_menu, (v_harga_menu * v_qty_menu), v_status_bayar, v_catatan, NOW()
            );
        END LOOP;
    END IF;

    -- 13. Simpan Layanan Carwash
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        INSERT INTO public.carwash (
            id, tenant_id, branch_id, id_struk, tanggal, jam, plat, model, variant, ukuran,
            paket, harga, anggota_1, anggota_2, shift, status, gaji_anggota,
            no_telepon, keterangan, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, p_branch_id, v_id_struk, v_tanggal, v_jam,
            COALESCE(p_carwash_payload->>'plat', '-'),
            COALESCE(p_carwash_payload->>'model', 'Mobil'),
            COALESCE(p_carwash_payload->>'variant', 'Regular'),
            COALESCE(p_carwash_payload->>'ukuran', 'Medium'),
            COALESCE(p_carwash_payload->>'paket', 'Cuci Biasa'),
            v_total_carwash,
            p_carwash_payload->>'anggota_1',
            p_carwash_payload->>'anggota_2',
            COALESCE(p_carwash_payload->>'shift', 'Pagi'),
            v_status_bayar,
            COALESCE((p_carwash_payload->>'gaji_anggota')::numeric, 0.00),
            p_carwash_payload->>'no_telepon',
            p_carwash_payload->>'catatan_kendaraan',
            NOW()
        );
    END IF;

    -- 15. Sinkronisasi Cashflow untuk Rekonsiliasi Penjualan
    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
        v_pos := CASE
            WHEN v_metode_bayar ILIKE '%CASH%' OR v_metode_bayar ILIKE '%TUNAI%' THEN 'SALDO CASH'
            ELSE 'SALDO REKENING (N)'
        END;

        INSERT INTO public.cashflow (
            id, tenant_id, branch_id, id_sumber, tanggal,
            keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
            pos, apakah_stok, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, p_branch_id, 'CF-POS-' || v_id_struk, v_tanggal,
            'Penjualan Kasir POS: ' || v_id_struk || ' (' || v_customer || ')',
            'Pemasukan', 'Pendapatan Kasir', v_total_tagihan, 0.00,
            v_pos, FALSE, NOW()
        );
    END IF;

    -- 16. Double-Entry General Ledger Auto-Posting
    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
        -- Ambil UUID akun COA tenant
        SELECT id INTO v_coa_kas FROM public.chart_of_accounts
        WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;

        SELECT id INTO v_coa_bank FROM public.chart_of_accounts
        WHERE tenant_id = p_tenant_id AND kode_akun = '1102' LIMIT 1;

        SELECT id INTO v_coa_inv FROM public.chart_of_accounts
        WHERE tenant_id = p_tenant_id AND kode_akun = '1103' LIMIT 1;

        SELECT id INTO v_coa_rev_cw FROM public.chart_of_accounts
        WHERE tenant_id = p_tenant_id AND kode_akun = '4101' LIMIT 1;

        SELECT id INTO v_coa_rev_cafe FROM public.chart_of_accounts
        WHERE tenant_id = p_tenant_id AND kode_akun = '4102' LIMIT 1;

        SELECT id INTO v_coa_cogs FROM public.chart_of_accounts
        WHERE tenant_id = p_tenant_id AND kode_akun = '5101' LIMIT 1;

        IF v_coa_kas IS NOT NULL AND (v_coa_rev_cw IS NOT NULL OR v_coa_rev_cafe IS NOT NULL) THEN
            v_journal_id := gen_random_uuid();

            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
            ) VALUES (
                v_journal_id, p_tenant_id, p_branch_id, 'JE-POS-' || v_id_struk, v_tanggal,
                'Auto-journal Penjualan POS: ' || v_id_struk, v_total_tagihan, 'DRAFT', NOW()
            );

            -- Debit Kas / Bank
            INSERT INTO public.journal_entry_lines (
                id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_journal_id,
                CASE WHEN v_metode_bayar ILIKE '%CASH%' OR v_metode_bayar ILIKE '%TUNAI%' THEN v_coa_kas ELSE COALESCE(v_coa_bank, v_coa_kas) END,
                v_total_tagihan, 0.00, 'Penerimaan Kasir POS ' || v_id_struk, NOW()
            );

            -- Kredit Pendapatan Carwash
            IF v_total_carwash > 0.00 AND v_coa_rev_cw IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cw,
                    0.00, v_total_carwash, 'Pendapatan Layanan Carwash ' || v_id_struk, NOW()
                );
            END IF;

            -- Kredit Pendapatan Cafe
            IF (v_total_tagihan - v_total_carwash) > 0.00 AND v_coa_rev_cafe IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cafe,
                    0.00, (v_total_tagihan - v_total_carwash), 'Pendapatan Cafe ' || v_id_struk, NOW()
                );
            END IF;

            -- Jurnal HPP / Beban Pokok dan Persediaan (jika ada HPP terhitung)
            IF v_total_cogs > 0.00 AND v_coa_cogs IS NOT NULL AND v_coa_inv IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES
                    (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_cogs, v_total_cogs, 0.00, 'HPP Bahan Baku POS ' || v_id_struk, NOW()),
                    (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_inv, 0.00, v_total_cogs, 'Pengurangan Persediaan POS ' || v_id_struk, NOW());
            END IF;

            -- Finalisasi: ubah status jurnal menjadi POSTED
            UPDATE public.journal_entries
            SET status = 'POSTED'
            WHERE id = v_journal_id;
        END IF;
    END IF;

    -- 17. Kembalikan Respon Sukses JSONB
    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'COMPLETED',
        'id_struk', v_id_struk,
        'subtotal', v_subtotal_kotor,
        'diskon', v_diskon,
        'total_tagihan', v_total_tagihan,
        'nominal_bayar', v_nominal_bayar,
        'kembalian', v_kembalian,
        'was_replayed', FALSE
    );
END;
$$;
