-- ==============================================================================
-- Migration: 20261104000001_atomic_pending_bill_settlement.sql
-- Description: Atomic pending bill settlement RPC (fn_settle_pending_bill),
--              origin COGS persistence on struk (total_cogs), origin dispatch cost
--              tracking on barang_keluar, overnight surcharge isolation & validation,
--              canonical idempotency hashing, and double-entry posting.
-- ==============================================================================

-- 1. Tambahkan kolom pendukung pelunasan, HPP asal, dan biaya inap ke tabel struk
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS total_biaya NUMERIC(15, 2);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS total_cogs NUMERIC(15, 2) DEFAULT NULL;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS cogs_status VARCHAR(30) DEFAULT NULL;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS nominal_cash NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS nominal_qris NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS nominal_transfer NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS uang_diterima NUMERIC(15, 2) DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS waktu_dibayar TIMESTAMPTZ;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS biaya_inap NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS catatan_inap TEXT;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS settle_hash TEXT;

-- 2. Tambahkan kolom relasi struk dan snapshot biaya asal ke tabel barang_keluar
ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS id_struk VARCHAR(100);
ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS biaya_satuan NUMERIC(15, 4);
ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS total_biaya NUMERIC(15, 2);

-- 3. Perbarui fn_execute_checkout agar mencatat relasi struk & biaya asal di barang_keluar
--    serta mempersistensikan total_cogs asal ke struk
CREATE OR REPLACE FUNCTION public.fn_execute_checkout(
    p_tenant_id uuid,
    p_branch_id uuid,
    p_struk_payload jsonb,
    p_cafe_items jsonb,
    p_carwash_payload jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;
    v_uang_diterima NUMERIC(15, 2) := 0.00;
    v_tender_total NUMERIC(15, 2) := 0.00;
    v_non_cash NUMERIC(15, 2) := 0.00;
    v_is_cash BOOLEAN;
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
    v_item_cogs NUMERIC(15, 2);

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
    -- 1. Otorisasi Pengguna
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;
    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles WHERE id = v_caller_id;
    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Keanggotaan aktif diperlukan.' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses transaksi lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;
    IF v_caller_role NOT IN ('owner', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan melakukan checkout.' USING ERRCODE = '42501';
    END IF;
    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL OR
       (v_caller_role = 'kasir' AND v_effective_branch_id IS DISTINCT FROM v_caller_branch) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang transaksi tidak diizinkan.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.branches
                   WHERE id = v_effective_branch_id AND tenant_id = p_tenant_id AND is_active IS TRUE) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang aktif dalam tenant diperlukan.' USING ERRCODE = '42501';
    END IF;
    IF p_struk_payload IS NULL OR jsonb_typeof(p_struk_payload) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Header transaksi wajib berupa object.';
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
    SELECT id, tenant_id, branch_id, id_struk, status_bayar, payload_hash, total_tagihan, nominal_bayar, uang_diterima, kembalian
    INTO v_existing_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    IF FOUND THEN
        IF v_existing_struk.branch_id IS DISTINCT FROM v_effective_branch_id THEN
            RAISE EXCEPTION 'BRANCH_FORBIDDEN: Transaksi berasal dari cabang berbeda.' USING ERRCODE = '42501';
        END IF;
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
                'uang_diterima', v_existing_struk.uang_diterima,
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

            v_harga_menu := COALESCE(
                NULLIF(v_item->>'harga_satuan', '')::numeric,
                NULLIF(v_item->>'harga', '')::numeric,
                0.00
            );

            IF v_nama_menu = '' OR v_qty_menu <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Nama menu dan kuantitas wajib valid.';
            END IF;

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

    -- 10. Validasi Pembayaran
    v_is_cash := UPPER(TRIM(v_metode_bayar)) IN ('CASH', 'TUNAI', 'SPLIT');
    v_non_cash := CASE WHEN UPPER(TRIM(v_metode_bayar)) = 'SPLIT' THEN
        COALESCE(NULLIF(p_struk_payload->>'nominal_qris', '')::numeric, 0) +
        COALESCE(NULLIF(p_struk_payload->>'nominal_transfer', '')::numeric, 0) ELSE 0 END;
    v_uang_diterima := COALESCE(NULLIF(p_struk_payload->>'uang_diterima', '')::numeric,
                              v_nominal_bayar - v_non_cash);
    IF v_uang_diterima = 'NaN'::numeric OR v_non_cash = 'NaN'::numeric OR
       v_uang_diterima < 0 OR v_non_cash < 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT: Nominal pembayaran wajib valid dan tidak negatif.';
    END IF;
    v_tender_total := v_uang_diterima + v_non_cash;
    IF v_status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
        IF v_tender_total < v_total_tagihan THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Pembayaran kurang dari tagihan.';
        END IF;
        IF NOT v_is_cash AND v_tender_total <> v_total_tagihan THEN
            RAISE EXCEPTION 'INVALID_PAYMENT: Pembayaran non-tunai harus sesuai tagihan.';
        END IF;
        v_nominal_bayar := v_total_tagihan;
        v_kembalian := CASE WHEN v_is_cash THEN v_tender_total - v_total_tagihan ELSE 0 END;
    ELSE
        v_nominal_bayar := LEAST(v_tender_total, v_total_tagihan);
        v_kembalian := 0;
    END IF;

    -- 11. Pengurangan Stok Bahan Baku / Produk (BOM Inventory Deduction)
    --     Menyimpan id_struk, biaya_satuan, dan total_biaya pada setiap baris barang_keluar
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

                SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                INTO v_stock_record
                FROM public.stok_barang
                WHERE tenant_id = p_tenant_id
                  AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                  AND (LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_resep_record.nama_bahan))
                       OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_resep_record.nama_bahan)))
                ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST, id
                LIMIT 1
                FOR UPDATE;

                IF FOUND THEN
                    IF v_stock_record.stok < v_needed THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_resep_record.nama_bahan, v_stock_record.stok, v_needed;
                    END IF;

                    v_item_cogs := v_needed * v_stock_record.unit_cost;

                    UPDATE public.stok_barang
                    SET stok = stok - v_needed,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_needed,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id AND tenant_id = p_tenant_id;

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, tanggal, keterangan, alasan, id_struk, biaya_satuan, total_biaya, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_stock_record.id::text, v_stock_record.id,
                        v_resep_record.nama_bahan, v_resep_record.nama_bahan, v_resep_record.nama_bahan,
                        v_needed, v_tanggal, 'BOM Pemakaian POS Struk: ' || v_id_struk, 'POS_SALE',
                        v_id_struk, v_stock_record.unit_cost, v_item_cogs, NOW()
                    );

                    v_total_cogs := v_total_cogs + v_item_cogs;
                END IF;
            END LOOP;

            -- Produk tanpa resep (dijual langsung)
            IF NOT EXISTS (
                SELECT 1 FROM public.resep
                WHERE tenant_id = p_tenant_id AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu))
            ) THEN
                SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                INTO v_stock_record
                FROM public.stok_barang
                WHERE tenant_id = p_tenant_id
                  AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                  AND (LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_nama_menu))
                       OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_nama_menu)))
                ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST, id
                LIMIT 1
                FOR UPDATE;

                IF FOUND THEN
                    IF v_stock_record.stok < v_qty_menu THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_nama_menu, v_stock_record.stok, v_qty_menu;
                    END IF;

                    v_item_cogs := v_qty_menu * v_stock_record.unit_cost;

                    UPDATE public.stok_barang
                    SET stok = stok - v_qty_menu,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_qty_menu,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id AND tenant_id = p_tenant_id;

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, tanggal, keterangan, alasan, id_struk, biaya_satuan, total_biaya, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_stock_record.id::text, v_stock_record.id,
                        v_nama_menu, v_nama_menu, v_nama_menu,
                        v_qty_menu, v_tanggal, 'Penjualan Langsung POS Struk: ' || v_id_struk, 'POS_SALE',
                        v_id_struk, v_stock_record.unit_cost, v_item_cogs, NOW()
                    );

                    v_total_cogs := v_total_cogs + v_item_cogs;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 12. Simpan Header Struk Transaksi (Persistensikan snapshot total_cogs asal)
    INSERT INTO public.struk (
        id, tenant_id, branch_id, id_struk, tanggal, jam, kasir,
        nama_pelanggan, catatan, status_bayar, status_pembayaran,
        subtotal, diskon, diskon_cafe, diskon_carwash,
        pajak, nominal_bayar, bayar, uang_diterima, kembalian, metode_bayar,
        metode_pembayaran, total_tagihan, total, payload_hash, total_cogs,
        created_at, waktu_dibuat, updated_at
    ) VALUES (
        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam, v_kasir,
        v_customer, v_catatan, v_status_bayar, v_status_bayar,
        v_subtotal_kotor, v_diskon, v_diskon, 0.00,
        v_pajak, v_nominal_bayar, v_nominal_bayar, v_uang_diterima, v_kembalian, v_metode_bayar,
        v_metode_bayar, v_total_tagihan, v_total_tagihan, v_current_hash, v_total_cogs,
        NOW(), NOW(), NOW()
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET
        status_bayar = EXCLUDED.status_bayar,
        status_pembayaran = EXCLUDED.status_pembayaran,
        nominal_bayar = EXCLUDED.nominal_bayar,
        bayar = EXCLUDED.bayar,
        uang_diterima = EXCLUDED.uang_diterima,
        kembalian = EXCLUDED.kembalian,
        pajak = EXCLUDED.pajak,
        total_tagihan = EXCLUDED.total_tagihan,
        total = EXCLUDED.total,
        total_cogs = EXCLUDED.total_cogs,
        updated_at = NOW();

    -- 13. Simpan Baris Detail Cafe
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
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam,
                v_nama_menu, v_qty_menu, v_harga_menu, (v_harga_menu * v_qty_menu), v_status_bayar, v_catatan, NOW()
            );
        END LOOP;
    END IF;

    -- 14. Simpan Layanan Carwash
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        INSERT INTO public.carwash (
            id, tenant_id, branch_id, id_struk, tanggal, jam, plat, model, variant, ukuran,
            paket, harga, anggota_1, anggota_2, shift, status, gaji_anggota,
            no_telepon, keterangan, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam,
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

    -- 15. Sinkronisasi Cashflow untuk Penjualan Langsung Selesai
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
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-' || v_id_struk, v_tanggal,
            'Penjualan Kasir POS: ' || v_id_struk || ' (' || v_customer || ')',
            'Pemasukan', 'Pendapatan Kasir', v_total_tagihan, 0.00,
            v_pos, FALSE, NOW()
        );
    END IF;

    -- 16. Double-Entry General Ledger Auto-Posting untuk Penjualan Langsung Selesai
    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
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
                v_journal_id, p_tenant_id, v_effective_branch_id, 'JE-POS-' || v_id_struk, v_tanggal,
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

            -- Jurnal HPP & Persediaan
            IF v_total_cogs > 0.00 AND v_coa_cogs IS NOT NULL AND v_coa_inv IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES
                    (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_cogs, v_total_cogs, 0.00, 'HPP Bahan Baku POS ' || v_id_struk, NOW()),
                    (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_inv, 0.00, v_total_cogs, 'Pengurangan Persediaan POS ' || v_id_struk, NOW());
            END IF;

            UPDATE public.journal_entries
            SET status = 'POSTED'
            WHERE id = v_journal_id AND tenant_id = p_tenant_id;
        END IF;
    END IF;

    -- 17. Kembalikan Respon Sukses
    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'COMPLETED',
        'id_struk', v_id_struk,
        'subtotal', v_subtotal_kotor,
        'diskon', v_diskon,
        'total_tagihan', v_total_tagihan,
        'nominal_bayar', v_nominal_bayar,
        'uang_diterima', v_uang_diterima,
        'kembalian', v_kembalian,
        'total_cogs', v_total_cogs,
        'was_replayed', FALSE
    );
END;
$function$;

-- 4. Implementasi RPC Pelunasan Tagihan Tertunda Atomik (fn_settle_pending_bill)
CREATE OR REPLACE FUNCTION public.fn_settle_pending_bill(
    p_tenant_id uuid,
    p_branch_id uuid,
    p_settle_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;

    v_id_struk TEXT;
    v_metode_bayar TEXT;
    v_uang_diterima NUMERIC(15, 2) := 0.00;
    v_nominal_bayar NUMERIC(15, 2) := 0.00;
    v_nominal_cash NUMERIC(15, 2) := 0.00;
    v_nominal_qris NUMERIC(15, 2) := 0.00;
    v_nominal_transfer NUMERIC(15, 2) := 0.00;
    v_kembalian NUMERIC(15, 2) := 0.00;

    v_surcharge_enabled BOOLEAN := FALSE;
    v_surcharge_nominal NUMERIC(15, 2) := 0.00;
    v_surcharge_keterangan TEXT := NULL;
    v_base_total NUMERIC(15, 2) := 0.00;
    v_final_total NUMERIC(15, 2) := 0.00;

    v_struk RECORD;
    v_advisory_key BIGINT;
    v_idempotency_key TEXT;
    v_canonical_settle_payload JSONB;
    v_current_settle_fingerprint TEXT;

    v_total_carwash NUMERIC(15, 2) := 0.00;
    v_total_cafe NUMERIC(15, 2) := 0.00;
    v_item_subtotal NUMERIC(15, 2) := 0.00;
    v_discount NUMERIC(15, 2) := 0.00;
    v_net_cw NUMERIC(15, 2) := 0.00;
    v_net_cafe NUMERIC(15, 2) := 0.00;
    v_total_cogs NUMERIC(15, 2) := NULL;
    v_cogs_status TEXT := 'SNAPSHOT_RECORDED';
    v_cogs_incomplete BOOLEAN := FALSE;

    v_journal_id UUID;
    v_coa_kas UUID;
    v_coa_bank UUID;
    v_coa_inv UUID;
    v_coa_rev_cw UUID;
    v_coa_rev_cafe UUID;
    v_coa_rev_inap UUID;
    v_coa_cogs UUID;
    v_coa_disc UUID;
    v_coa_tax UUID;
    v_tax NUMERIC(15, 2) := 0.00;
    v_pos TEXT;
    v_is_cash BOOLEAN;
BEGIN
    -- 1. Otorisasi Pengguna Aktif & Batas Cabang
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles WHERE id = v_caller_id;

    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Keanggotaan aktif diperlukan.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL OR v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses transaksi lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role NOT IN ('owner', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan melakukan pelunasan.' USING ERRCODE = '42501';
    END IF;

    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL OR
       (v_caller_role = 'kasir' AND v_effective_branch_id IS DISTINCT FROM v_caller_branch) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang transaksi tidak diizinkan.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.branches
                   WHERE id = v_effective_branch_id AND tenant_id = p_tenant_id AND is_active IS TRUE) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang aktif dalam tenant diperlukan.' USING ERRCODE = '42501';
    END IF;

    IF p_settle_payload IS NULL OR jsonb_typeof(p_settle_payload) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Payload pelunasan wajib berupa object.';
    END IF;

    -- 2. Parsing Payload Struk & Idempotency Key
    v_id_struk := TRIM(COALESCE(p_settle_payload->>'id_struk', ''));
    IF v_id_struk = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Nomor struk wajib disertakan.';
    END IF;

    v_idempotency_key := TRIM(COALESCE(p_settle_payload->>'idempotency_key', p_settle_payload->>'idempotencyKey', ''));
    IF v_idempotency_key = '' THEN
        v_idempotency_key := v_id_struk || ':settle';
    END IF;

    -- 3. Advisory Lock Transaksional untuk Idempotensi
    v_advisory_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk || ':settle'), 1, 15))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_advisory_key);

    -- 4. Kunci Baris Struk (Pessimistic Row Locking)
    SELECT * INTO v_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'BILL_NOT_FOUND: Tagihan "%" tidak ditemukan dalam tenant aktif.', v_id_struk USING ERRCODE = 'P0002';
    END IF;

    IF v_struk.branch_id IS DISTINCT FROM v_effective_branch_id THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Tagihan berasal dari cabang berbeda.' USING ERRCODE = '42501';
    END IF;

    -- 5. Ekstraksi Metode & Tender Pembayaran
    v_metode_bayar := UPPER(TRIM(COALESCE(p_settle_payload->>'metode_bayar', 'CASH')));
    v_is_cash := v_metode_bayar IN ('CASH', 'TUNAI', 'SPLIT');

    -- Validasi Biaya Inap (Surcharge Validation)
    v_surcharge_enabled := COALESCE((p_settle_payload->'surcharge'->>'enabled')::boolean, FALSE);
    IF v_surcharge_enabled THEN
        v_surcharge_nominal := COALESCE(NULLIF(p_settle_payload->'surcharge'->>'nominal', '')::numeric, 0.00);
        v_surcharge_keterangan := TRIM(COALESCE(p_settle_payload->'surcharge'->>'keterangan', ''));

        IF v_surcharge_nominal < 0.00 THEN
            RAISE EXCEPTION 'INVALID_SURCHARGE: Biaya inap tidak boleh negatif.' USING ERRCODE = '22023';
        END IF;

        IF v_surcharge_nominal > 0.00 THEN
            IF v_surcharge_keterangan = '' THEN
                RAISE EXCEPTION 'INVALID_SURCHARGE: Keterangan biaya inap wajib disertakan saat nominal lebih dari 0.' USING ERRCODE = '22023';
            END IF;

            -- Batas wajar operasional maksimal Rp 5.000.000
            IF v_surcharge_nominal > 5000000.00 THEN
                RAISE EXCEPTION 'INVALID_SURCHARGE: Biaya inap melebihi batas operasional maksimum (Rp 5.000.000).' USING ERRCODE = '22023';
            END IF;

            -- Otorisasi peran: Kasir hanya dapat menetapkan hingga Rp 500.000
            IF v_caller_role = 'kasir' AND v_surcharge_nominal > 500000.00 THEN
                RAISE EXCEPTION 'SURCHARGE_UNAUTHORIZED: Biaya inap di atas Rp 500.000 memerlukan persetujuan Owner atau Administrator.' USING ERRCODE = '42501';
            END IF;
        END IF;
    ELSE
        v_surcharge_nominal := 0.00;
        v_surcharge_keterangan := NULL;
    END IF;

    -- Hitung Base Tagihan (jika struk sudah pernah lunas, base tagihan = total - biaya_inap sebelumnya)
    v_base_total := CASE
        WHEN v_struk.status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
            (v_struk.total_tagihan - COALESCE(v_struk.biaya_inap, 0.00))
        ELSE
            v_struk.total_tagihan
    END;

    v_final_total := v_base_total + v_surcharge_nominal;

    v_nominal_cash := COALESCE(NULLIF(p_settle_payload->>'nominal_cash', '')::numeric, NULLIF(p_settle_payload->>'split_cash', '')::numeric, 0.00);
    v_nominal_qris := COALESCE(NULLIF(p_settle_payload->>'nominal_qris', '')::numeric, NULLIF(p_settle_payload->>'split_qris', '')::numeric, 0.00);
    v_nominal_transfer := COALESCE(NULLIF(p_settle_payload->>'nominal_transfer', '')::numeric, 0.00);
    v_uang_diterima := COALESCE(NULLIF(p_settle_payload->>'uang_diterima', '')::numeric, 0.00);

    IF v_uang_diterima < 0.00 OR v_nominal_cash < 0.00 OR v_nominal_qris < 0.00 OR v_nominal_transfer < 0.00 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT: Nilai tender pembayaran tidak boleh negatif.';
    END IF;

    -- Normalisasi Tender dan Hitung Kembalian
    IF v_metode_bayar = 'SPLIT' THEN
        IF (v_nominal_cash + v_nominal_qris + v_nominal_transfer) < v_final_total THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Jumlah alokasi tunai dan digital kurang dari total tagihan.';
        END IF;
        IF v_uang_diterima < v_nominal_cash THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Uang tunai yang diserahkan kurang dari alokasi tunai.';
        END IF;
        v_kembalian := v_uang_diterima - v_nominal_cash;
        v_nominal_bayar := v_final_total;
    ELSIF v_is_cash THEN
        IF v_uang_diterima < v_final_total THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Uang yang diterima (%) kurang dari total tagihan (%).',
                v_uang_diterima, v_final_total;
        END IF;
        v_nominal_cash := v_final_total;
        v_nominal_bayar := v_final_total;
        v_kembalian := v_uang_diterima - v_final_total;
    ELSE
        v_nominal_bayar := v_final_total;
        IF v_metode_bayar = 'QRIS' THEN
            v_nominal_qris := v_final_total;
        ELSE
            v_nominal_transfer := v_final_total;
        END IF;
        v_uang_diterima := v_final_total;
        v_kembalian := 0.00;
    END IF;

    -- Hitung Fingerprint Seluruh Input Relevan Secara Terstruktur (Canonical JSONB)
    v_canonical_settle_payload := jsonb_build_object(
        'tenant_id', p_tenant_id,
        'id_struk', v_id_struk,
        'branch_id', v_effective_branch_id,
        'metode_bayar', v_metode_bayar,
        'final_total', ROUND(v_final_total, 2),
        'uang_diterima', ROUND(v_uang_diterima, 2),
        'nominal_cash', ROUND(v_nominal_cash, 2),
        'nominal_qris', ROUND(v_nominal_qris, 2),
        'nominal_transfer', ROUND(v_nominal_transfer, 2),
        'surcharge_nominal', ROUND(v_surcharge_nominal, 2),
        'surcharge_keterangan', COALESCE(v_surcharge_keterangan, ''),
        'idempotency_key', v_idempotency_key
    );
    v_current_settle_fingerprint := md5(v_canonical_settle_payload::text);

    -- 6. Evaluasi Status & Idempotensi
    IF v_struk.status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
        IF v_struk.settle_hash IS NOT NULL AND v_struk.settle_hash = v_current_settle_fingerprint THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'status', 'ALREADY_COMPLETED',
                'id_struk', v_id_struk,
                'total_tagihan', v_struk.total_tagihan,
                'nominal_bayar', v_struk.nominal_bayar,
                'uang_diterima', v_struk.uang_diterima,
                'kembalian', v_struk.kembalian,
                'biaya_inap', v_struk.biaya_inap,
                'idempotency_key', v_struk.idempotency_key,
                'settle_hash', v_struk.settle_hash,
                'cogs_status', COALESCE(v_struk.total_cogs::text, 'UNKNOWN'),
                'was_replayed', TRUE,
                'message', 'Tagihan sudah diselesaikan sebelumnya, mutasi tidak diulang.'
            );
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Tagihan "%" telah dilunasi dengan payload transaksi yang berbeda.', v_id_struk USING ERRCODE = '40900';
        END IF;
    END IF;

    IF v_struk.status_bayar = 'Batal' THEN
        RAISE EXCEPTION 'BILL_CANCELLED: Tagihan "%" telah dibatalkan dan tidak dapat dilunasi.', v_id_struk USING ERRCODE = '42501';
    END IF;

    IF v_struk.status_bayar <> 'Pending' THEN
        RAISE EXCEPTION 'INVALID_BILL_STATUS: Tagihan "%" dalam status "%", tidak dapat dilunasi.', v_id_struk, v_struk.status_bayar;
    END IF;

    -- 8. Penanganan Nilai HPP Asal: Membedakan NULL (Historis Tidak Diketahui) vs 0.00 (Biaya Nol)
    IF v_struk.total_cogs IS NULL THEN
        -- Kasus Data Historis: Periksa catatan mutasi persediaan di barang_keluar HANYA dari snapshot biaya asal
        -- DILARANG fallback ke harga master terbaru (stok_barang.harga_beli) agar tidak mendistorsi pembukuan historis
        SELECT 
            COALESCE(SUM(
                COALESCE(bk.total_biaya, bk.jumlah_keluar * bk.biaya_satuan)
            ), 0.00),
            COALESCE(BOOL_OR(bk.total_biaya IS NULL AND bk.biaya_satuan IS NULL), FALSE)
        INTO v_total_cogs, v_cogs_incomplete
        FROM public.barang_keluar bk
        WHERE bk.tenant_id = p_tenant_id
          AND (
              bk.id_struk = v_id_struk
              OR (
                  v_id_struk IS NOT NULL AND v_id_struk <> '' AND (
                      bk.keterangan ~* ('(^|[^a-zA-Z0-9_-])Struk:\s*' || regexp_replace(v_id_struk, '([^a-zA-Z0-9])', '\\\1', 'g') || '($|[^a-zA-Z0-9_-])')
                      OR
                      bk.alasan ~* ('(^|[^a-zA-Z0-9_-])Struk:\s*' || regexp_replace(v_id_struk, '([^a-zA-Z0-9])', '\\\1', 'g') || '($|[^a-zA-Z0-9_-])')
                  )
              )
          );

        IF v_cogs_incomplete IS TRUE OR v_total_cogs IS NULL OR v_total_cogs <= 0.00 THEN
            -- Jika catatan biaya asal tidak lengkap atau tidak ada, tandai sebagai belum diketahui (pertahankan NULL!)
            v_cogs_status := 'HISTORICAL_UNKNOWN';
            v_total_cogs := NULL;
        ELSE
            v_cogs_status := 'HISTORICAL_RESOLVED';
        END IF;
    ELSIF v_struk.total_cogs = 0.00 THEN
        v_cogs_status := 'ZERO_COST';
        v_total_cogs := 0.00;
    ELSE
        v_cogs_status := 'SNAPSHOT_RECORDED';
        v_total_cogs := v_struk.total_cogs;
    END IF;

    -- 8B. Validasi Pra-Mutasi Konfigurasi Bagan Akun (COA) Terstruktur (Finding 2 & Finding 4)
    -- Ambil seluruh akun COA yang berelasi dan total rincian layanan
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

    SELECT id INTO v_coa_rev_inap FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '4103' LIMIT 1;

    SELECT id INTO v_coa_cogs FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun = '5101' LIMIT 1;

    SELECT id INTO v_coa_disc FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun IN ('4104', '4201') LIMIT 1;

    SELECT id INTO v_coa_tax FROM public.chart_of_accounts
    WHERE tenant_id = p_tenant_id AND kode_akun IN ('2102', '2103') LIMIT 1;

    IF v_coa_tax IS NULL THEN
        SELECT id INTO v_coa_tax FROM public.chart_of_accounts
        WHERE tenant_id = p_tenant_id AND kode_akun = '2101' LIMIT 1;
    END IF;

    SELECT COALESCE(SUM(harga), 0.00) INTO v_total_carwash
    FROM public.carwash WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    SELECT COALESCE(SUM(subtotal), 0.00) INTO v_total_cafe
    FROM public.cafe WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    -- Validasi 1: Akun Pembayaran (Kas / Bank) - Tanpa Fallback Kas untuk Pembayaran Digital
    IF (v_nominal_cash > 0.00 OR v_is_cash) AND v_coa_kas IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun kas (1101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
    END IF;
    IF ((v_nominal_qris + v_nominal_transfer) > 0.00 OR (NOT v_is_cash AND v_metode_bayar <> 'SPLIT')) AND v_coa_bank IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun bank (1102) belum dikonfigurasi pada bagan akun (COA) untuk pembayaran digital.' USING ERRCODE = '28000';
    END IF;

    -- Validasi 2: Akun Pendapatan
    IF v_total_carwash > 0.00 AND v_coa_rev_cw IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun pendapatan carwash (4101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
    END IF;
    IF v_total_cafe > 0.00 AND v_coa_rev_cafe IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun pendapatan cafe (4102) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
    END IF;
    IF v_surcharge_nominal > 0.00 AND COALESCE(v_coa_rev_inap, v_coa_rev_cw) IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun pendapatan biaya inap (4103/4101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
    END IF;

    -- Validasi 3: Akun HPP & Persediaan (hanya jika ada HPP yang perlu dibukukan)
    IF v_total_cogs IS NOT NULL AND v_total_cogs > 0.00 AND v_cogs_status IN ('SNAPSHOT_RECORDED', 'HISTORICAL_RESOLVED') THEN
        IF v_coa_cogs IS NULL OR v_coa_inv IS NULL THEN
            RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun HPP (5101) atau Persediaan (1103) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
        END IF;
    END IF;

    -- Validasi 4: Komponen Diskon & Pajak Tersimpan yang Tervalidasi (Bukan Sekadar Selisih Netted)
    v_item_subtotal := v_total_carwash + v_total_cafe;

    -- Ekstraksi diskon tersimpan eksplisit dari header struk atau payload
    v_discount := COALESCE(
        NULLIF(p_settle_payload->>'diskon', '')::numeric,
        v_struk.diskon,
        (COALESCE(v_struk.diskon_cafe, 0.00) + COALESCE(v_struk.diskon_carwash, 0.00)),
        0.00
    );
    IF v_discount < 0.00 THEN v_discount := 0.00; END IF;

    -- Ekstraksi pajak tersimpan eksplisit dari header struk atau payload
    v_tax := COALESCE(
        NULLIF(p_settle_payload->>'pajak', '')::numeric,
        v_struk.pajak,
        0.00
    );
    IF v_tax < 0.00 THEN v_tax := 0.00; END IF;

    -- Fallback struk historis tanpa metadata terpisah
    IF v_discount = 0.00 AND v_tax = 0.00 THEN
        IF v_item_subtotal > v_base_total THEN
            v_discount := v_item_subtotal - v_base_total;
        ELSIF v_base_total > v_item_subtotal THEN
            v_tax := v_base_total - v_item_subtotal;
        END IF;
    ELSIF v_discount > 0.00 AND v_tax = 0.00 AND v_base_total > (v_item_subtotal - v_discount) THEN
        v_tax := v_base_total - (v_item_subtotal - v_discount);
    ELSIF v_tax > 0.00 AND v_discount = 0.00 AND (v_item_subtotal + v_tax) > v_base_total THEN
        v_discount := (v_item_subtotal + v_tax) - v_base_total;
    END IF;

    -- Rekonsiliasi batas presisi sen terhadap base_total
    IF v_base_total > (v_item_subtotal - v_discount + v_tax) THEN
        v_tax := v_tax + (v_base_total - (v_item_subtotal - v_discount + v_tax));
    ELSIF (v_item_subtotal - v_discount + v_tax) > v_base_total THEN
        v_discount := v_discount + ((v_item_subtotal - v_discount + v_tax) - v_base_total);
    END IF;

    IF v_tax > 0.00 AND v_coa_tax IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun kewajiban/utang pajak (2102/2101) belum dikonfigurasi pada bagan akun (COA) untuk komponen tambahan tagihan.' USING ERRCODE = '28000';
    END IF;

    -- 9. Pembaruan Header Struk Lunas (Zero Double Stock Deduction)
    UPDATE public.struk
    SET status_bayar = 'Selesai',
        status_pembayaran = 'Selesai',
        metode_bayar = v_metode_bayar,
        metode_pembayaran = v_metode_bayar,
        total_tagihan = v_final_total,
        total = v_final_total,
        total_biaya = v_final_total,
        nominal_bayar = v_nominal_bayar,
        bayar = v_nominal_bayar,
        nominal_cash = v_nominal_cash,
        nominal_qris = v_nominal_qris,
        nominal_transfer = v_nominal_transfer,
        uang_diterima = v_uang_diterima,
        kembalian = v_kembalian,
        biaya_inap = v_surcharge_nominal,
        catatan_inap = CASE WHEN v_surcharge_nominal > 0 THEN v_surcharge_keterangan ELSE NULL END,
        idempotency_key = v_idempotency_key,
        settle_hash = v_current_settle_fingerprint,
        total_cogs = v_total_cogs,
        cogs_status = v_cogs_status,
        waktu_dibayar = NOW(),
        updated_at = NOW()
    WHERE id = v_struk.id AND tenant_id = p_tenant_id;

    -- 10. Pembaruan Status Rincian Carwash & Cafe Menjadi Selesai
    UPDATE public.carwash
    SET status = 'Selesai'
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    UPDATE public.cafe
    SET status = 'Selesai'
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    -- 11. Pencatatan Mutasi Kas Masuk ke Buku Kas (cashflow) Terstruktur
    IF v_metode_bayar = 'SPLIT' THEN
        -- Alokasi Tunai ke SALDO CASH
        IF v_nominal_cash > 0.00 THEN
            INSERT INTO public.cashflow (
                id, tenant_id, branch_id, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                pos, apakah_stok, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-SETTLE-CASH-' || v_id_struk, CURRENT_DATE,
                'Pelunasan POS (Tunai Split) Struk: ' || v_id_struk || ' (' || COALESCE(v_struk.nama_pelanggan, 'Umum') || ')',
                'Pemasukan', 'Pendapatan Kasir', v_nominal_cash, 0.00,
                'SALDO CASH', FALSE, NOW()
            );
        END IF;

        -- Alokasi Digital (QRIS / Transfer) ke SALDO REKENING (N)
        IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
            INSERT INTO public.cashflow (
                id, tenant_id, branch_id, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                pos, apakah_stok, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-SETTLE-DIGITAL-' || v_id_struk, CURRENT_DATE,
                'Pelunasan POS (Digital Split) Struk: ' || v_id_struk || ' (' || COALESCE(v_struk.nama_pelanggan, 'Umum') || ')',
                'Pemasukan', 'Pendapatan Kasir', (v_nominal_qris + v_nominal_transfer), 0.00,
                'SALDO REKENING (N)', FALSE, NOW()
            );
        END IF;
    ELSE
        v_pos := CASE
            WHEN v_metode_bayar IN ('CASH', 'TUNAI') THEN 'SALDO CASH'
            ELSE 'SALDO REKENING (N)'
        END;

        INSERT INTO public.cashflow (
            id, tenant_id, branch_id, id_sumber, tanggal,
            keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
            pos, apakah_stok, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-SETTLE-' || v_id_struk, CURRENT_DATE,
            'Pelunasan POS Struk: ' || v_id_struk || ' (' || COALESCE(v_struk.nama_pelanggan, 'Umum') || ')',
            'Pemasukan', 'Pendapatan Kasir', v_final_total, 0.00,
            v_pos, FALSE, NOW()
        );
    END IF;

    -- 12. Double-Entry General Ledger Auto-Posting
    -- Gunakan komponen diskon dan pajak tersimpan yang tervalidasi dari langkah 8B
    v_journal_id := gen_random_uuid();

    INSERT INTO public.journal_entries (
        id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
    ) VALUES (
        v_journal_id, p_tenant_id, v_effective_branch_id, 'JE-SETTLE-' || v_id_struk, CURRENT_DATE,
        'Auto-journal Pelunasan POS: ' || v_id_struk || CASE WHEN v_cogs_status = 'HISTORICAL_UNKNOWN' THEN ' (HPP historis tidak diketahui)' ELSE '' END,
        v_final_total, 'DRAFT', NOW()
    );

    -- A. Sisi Debit (Penerimaan Kas / Bank)
    IF v_metode_bayar = 'SPLIT' THEN
        IF v_nominal_cash > 0.00 THEN
            INSERT INTO public.journal_entry_lines (
                id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_kas,
                v_nominal_cash, 0.00, 'Penerimaan Tunai Split POS ' || v_id_struk, NOW()
            );
        END IF;
        IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
            INSERT INTO public.journal_entry_lines (
                id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
                (v_nominal_qris + v_nominal_transfer), 0.00, 'Penerimaan Digital Split POS ' || v_id_struk, NOW()
            );
        END IF;
    ELSIF v_is_cash THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_kas,
            v_final_total, 0.00, 'Penerimaan Tunai POS ' || v_id_struk, NOW()
        );
    ELSE
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
            v_final_total, 0.00, 'Penerimaan Digital POS ' || v_id_struk, NOW()
        );
    END IF;

    -- A2. Sisi Debit Diskon (Jika akun potongan penjualan 4104 tersedia)
    IF v_discount > 0.00 AND v_coa_disc IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_disc,
            v_discount, 0.00, 'Potongan Penjualan POS ' || v_id_struk, NOW()
        );
    END IF;

    -- B. Sisi Kredit (Pendapatan Usaha)
    -- Jika tidak ada akun potongan terpisah, alokasikan diskon langsung mengurangi pos pendapatan (Net Revenue method)
    IF v_discount > 0.00 AND v_coa_disc IS NULL THEN
        IF v_item_subtotal > 0.00 THEN
            v_net_cw := ROUND(v_total_carwash - (v_discount * (v_total_carwash / v_item_subtotal)), 2);
            v_net_cafe := (v_item_subtotal - v_discount) - v_net_cw;
        ELSE
            v_net_cw := 0.00;
            v_net_cafe := 0.00;
        END IF;
    ELSE
        v_net_cw := v_total_carwash;
        v_net_cafe := v_total_cafe;
    END IF;

    IF v_net_cw > 0.00 AND v_coa_rev_cw IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cw,
            0.00, v_net_cw, 'Pendapatan Layanan Carwash ' || v_id_struk, NOW()
        );
    END IF;

    -- Kredit Biaya Inap Kendaraan (Surcharge) dialokasikan ke 4103 atau fallback 4101 (BUKAN ke cafe 4102)
    IF v_surcharge_nominal > 0.00 THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id,
            COALESCE(v_coa_rev_inap, v_coa_rev_cw),
            0.00, v_surcharge_nominal, 'Pendapatan Jasa Inap Kendaraan ' || v_id_struk, NOW()
        );
    END IF;

    -- Kredit Cafe
    IF v_net_cafe > 0.00 AND v_coa_rev_cafe IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cafe,
            0.00, v_net_cafe, 'Pendapatan Cafe ' || v_id_struk, NOW()
        );
    END IF;

    -- B2. Sisi Kredit Pajak & Kewajiban Komponen Tambahan (Finding 5 & Kasus Pajak+Diskon Bersamaan)
    IF v_tax > 0.00 AND v_coa_tax IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_tax,
            0.00, v_tax, 'Pajak & Kewajiban Komponen Tambahan POS ' || v_id_struk, NOW()
        );
    END IF;

    -- C. Jurnal HPP & Persediaan (Hanya jika snapshot HPP > 0 dan status valid)
    IF v_total_cogs IS NOT NULL AND v_total_cogs > 0.00 AND v_cogs_status IN ('SNAPSHOT_RECORDED', 'HISTORICAL_RESOLVED')
       AND v_coa_cogs IS NOT NULL AND v_coa_inv IS NOT NULL THEN
        INSERT INTO public.journal_entry_lines (
            id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
        ) VALUES
            (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_cogs, v_total_cogs, 0.00, 'HPP Bahan Baku POS ' || v_id_struk, NOW()),
            (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_inv, 0.00, v_total_cogs, 'Pengurangan Persediaan POS ' || v_id_struk, NOW());
    END IF;

    -- Finalisasi Jurnal: Ubah Status Menjadi POSTED
    UPDATE public.journal_entries
    SET status = 'POSTED'
    WHERE id = v_journal_id AND tenant_id = p_tenant_id;

    -- 13. Kembalikan Hasil Sukses
    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'COMPLETED',
        'id_struk', v_id_struk,
        'total_tagihan', v_final_total,
        'nominal_bayar', v_nominal_bayar,
        'uang_diterima', v_uang_diterima,
        'kembalian', v_kembalian,
        'biaya_inap', v_surcharge_nominal,
        'total_cogs', v_total_cogs,
        'cogs_status', v_cogs_status,
        'idempotency_key', v_idempotency_key,
        'settle_hash', v_current_settle_fingerprint,
        'was_replayed', FALSE
    );
END;
$function$;

-- 5. Batasi Hak Eksekusi
REVOKE EXECUTE ON FUNCTION public.fn_settle_pending_bill(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_settle_pending_bill(uuid, uuid, jsonb) TO authenticated;
