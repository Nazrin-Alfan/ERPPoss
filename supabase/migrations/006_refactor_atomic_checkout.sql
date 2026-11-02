-- ==============================================================================
-- MIGRATION: 006_refactor_atomic_checkout.sql
-- DESCRIPTION: Batch 3 - Backend RPC & POS Frontend Atomicity Refactor
-- Addresses QA Audit Findings:
--   - T02: Multi-step checkout non-atomic race conditions
--   - T04: GREATEST(0, stock - qty) overselling vulnerability
--   - T05: Client-side price tampering (catalog price enforcement)
--   - K04: Parameter & tenant ID tampering prevention in checkout RPC
-- ==============================================================================

BEGIN;

-- Drop prior 4-argument signature if exists
DROP FUNCTION IF EXISTS public.fn_execute_checkout(UUID, UUID, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.fn_execute_checkout(UUID, UUID, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.fn_execute_checkout(
    p_tenant_id UUID,
    p_branch_id UUID,
    p_struk_payload JSONB,
    p_cafe_items JSONB DEFAULT '[]'::jsonb,
    p_carwash_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_struk_id UUID;
    v_id_struk VARCHAR(50);
    v_status_bayar VARCHAR(50);
    v_metode_bayar VARCHAR(50);
    v_kasir VARCHAR(100);
    v_nama_pelanggan VARCHAR(255);
    v_no_meja VARCHAR(100);
    v_catatan TEXT;
    
    v_item JSONB;
    v_nama_menu VARCHAR(255);
    v_qty NUMERIC(18, 4);
    v_item_price NUMERIC(18, 4);
    v_catalog_price NUMERIC(18, 4);
    v_real_price NUMERIC(18, 4);
    v_item_subtotal NUMERIC(18, 4);
    
    v_menu RECORD;
    v_recipe RECORD;
    v_stok RECORD;
    v_has_recipe BOOLEAN;
    v_qty_needed NUMERIC(18, 4);
    
    v_calc_cafe_total NUMERIC(18, 4) := 0.0000;
    v_calc_carwash_total NUMERIC(18, 4) := 0.0000;
    v_diskon_carwash NUMERIC(18, 4) := 0.0000;
    v_diskon_cafe NUMERIC(18, 4) := 0.0000;
    v_total_diskon NUMERIC(18, 4) := 0.0000;
    v_grand_total NUMERIC(18, 4) := 0.0000;
    
    v_nominal_cash NUMERIC(18, 4) := 0.0000;
    v_nominal_qris NUMERIC(18, 4) := 0.0000;
    v_nominal_transfer NUMERIC(18, 4) := 0.0000;
    v_total_paid NUMERIC(18, 4) := 0.0000;
    
    v_items_count INT := 0;
    v_deductions_count INT := 0;
    v_effective_branch_id UUID;
BEGIN
    -- 1. SECURITY & TENANT AUTHORIZATION (K04)
    IF auth.role() = 'authenticated' THEN
        IF p_tenant_id IS NULL OR (p_tenant_id != public.current_tenant_id() AND public.current_user_role() != 'Super Admin') THEN
            RAISE EXCEPTION 'FORBIDDEN: Akses tenant tidak sah (Mismatched tenant_id)';
        END IF;
    END IF;

    -- Resolve branch
    v_effective_branch_id := p_branch_id;
    IF v_effective_branch_id IS NULL THEN
        SELECT id INTO v_effective_branch_id FROM public.branches WHERE tenant_id = p_tenant_id LIMIT 1;
    END IF;

    -- 2. EXTRACT STRUK HEADER METADATA
    v_id_struk := COALESCE(
        p_struk_payload->>'id_struk',
        'TRX-' || to_char(NOW(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6))
    );
    v_status_bayar := COALESCE(p_struk_payload->>'status_bayar', p_struk_payload->>'status_pembayaran', 'Selesai');
    v_metode_bayar := COALESCE(p_struk_payload->>'metode_bayar', p_struk_payload->>'metode_pembayaran', 'CASH');
    v_kasir := COALESCE(p_struk_payload->>'kasir', 'KASIR UTAMA');
    v_nama_pelanggan := COALESCE(p_struk_payload->>'nama_pelanggan', 'Pelanggan');
    v_no_meja := COALESCE(p_struk_payload->>'no_meja', p_struk_payload->>'nomor_meja_antrean', '-');
    v_catatan := COALESCE(p_struk_payload->>'catatan', p_struk_payload->>'keterangan', '');

    v_diskon_carwash := COALESCE((p_struk_payload->>'diskon_carwash')::numeric, 0.0000);
    v_diskon_cafe := COALESCE((p_struk_payload->>'diskon_cafe')::numeric, 0.0000);
    v_total_diskon := COALESCE((p_struk_payload->>'diskon')::numeric, 0.0000);
    IF v_total_diskon <= 0.0000 THEN
        v_total_diskon := v_diskon_carwash + v_diskon_cafe;
    END IF;

    v_nominal_cash := COALESCE((p_struk_payload->>'nominal_cash')::numeric, (p_struk_payload->>'nominal_bayar')::numeric, 0.0000);
    v_nominal_qris := COALESCE((p_struk_payload->>'nominal_qris')::numeric, 0.0000);
    v_nominal_transfer := COALESCE((p_struk_payload->>'nominal_transfer')::numeric, 0.0000);
    v_total_paid := v_nominal_cash + v_nominal_qris + v_nominal_transfer;

    -- 3. PHASE 1: PRE-CALCULATE CAFE TOTALS & VALIDATE PRICES (T05 ANTI-PRICE-TAMPERING)
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := COALESCE(v_item->>'nama_menu', v_item->>'daftar_menu', v_item->>'nama_item');
            v_qty := COALESCE((v_item->>'qty')::numeric, (v_item->>'jumlah')::numeric, 1.0000);
            
            IF v_qty <= 0 THEN
                RAISE EXCEPTION 'INVALID_QTY: Kuantitas item "%" harus lebih besar dari 0', v_nama_menu;
            END IF;

            -- Look up catalog price
            SELECT * INTO v_menu FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id 
              AND (daftar_menu = v_nama_menu OR nama_menu = v_nama_menu OR nama_item = v_nama_menu)
            LIMIT 1;

            IF FOUND AND v_menu.harga IS NOT NULL AND v_menu.harga > 0 THEN
                v_catalog_price := v_menu.harga;
                v_item_price := COALESCE((v_item->>'harga_satuan')::numeric, (v_item->>'harga')::numeric, v_catalog_price);
                
                -- T05 FIX: Anti Price Tampering Detection
                IF v_item_price < (v_catalog_price - 0.01) THEN
                    RAISE EXCEPTION 'PRICE_MISMATCH: Harga item "%" (Rp %) tidak sesuai dengan harga resmi katalog (Rp %)',
                        v_nama_menu, v_item_price, v_catalog_price;
                END IF;
                v_real_price := v_catalog_price;
            ELSE
                v_real_price := COALESCE((v_item->>'harga_satuan')::numeric, (v_item->>'harga')::numeric, 0.0000);
            END IF;

            v_item_subtotal := v_qty * v_real_price;
            v_calc_cafe_total := v_calc_cafe_total + v_item_subtotal;
            v_items_count := v_items_count + 1;
        END LOOP;
    END IF;

    -- 4. PRE-CALCULATE CARWASH SERVICE TOTAL
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload != 'null'::jsonb THEN
        v_calc_carwash_total := COALESCE((p_carwash_payload->>'harga')::numeric, 0.0000);
    END IF;

    -- 5. GRAND TOTAL RECALCULATION & PAYMENT VALIDATION
    v_grand_total := GREATEST(0.0000, v_calc_cafe_total + v_calc_carwash_total - v_total_diskon);

    -- If marked as completed payment, validate that payment covers the bill
    IF v_status_bayar = 'Selesai' THEN
        IF v_metode_bayar = 'CASH' AND v_nominal_cash < (v_grand_total - 0.01) THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Nominal uang tunai (Rp %) kurang dari total tagihan (Rp %)',
                v_nominal_cash, v_grand_total;
        END IF;
    END IF;

    -- 6. PHASE 2: INSERT / UPSERT STRUK HEADER FIRST (ENSURES FK VALIDITY)
    INSERT INTO public.struk (
        tenant_id, branch_id, id_struk, tanggal, jam,
        nama_pelanggan, no_meja, keterangan, catatan,
        metode_bayar, status_bayar, kasir,
        subtotal, total, total_tagihan, total_biaya,
        diskon, diskon_carwash, diskon_cafe,
        nominal_cash, nominal_qris, nominal_transfer,
        nominal_bayar, kembalian,
        waktu_dibuat, waktu_dibayar
    ) VALUES (
        p_tenant_id, v_effective_branch_id, v_id_struk, CURRENT_DATE, CURRENT_TIME,
        v_nama_pelanggan, v_no_meja, v_catatan, v_catatan,
        v_metode_bayar, v_status_bayar, v_kasir,
        (v_calc_cafe_total + v_calc_carwash_total), v_grand_total, v_grand_total, v_grand_total,
        v_total_diskon, v_diskon_carwash, v_diskon_cafe,
        v_nominal_cash, v_nominal_qris, v_nominal_transfer,
        v_total_paid, GREATEST(0.0000, v_total_paid - v_grand_total),
        NOW(), CASE WHEN v_status_bayar = 'Selesai' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET
        metode_bayar = EXCLUDED.metode_bayar,
        status_bayar = EXCLUDED.status_bayar,
        kasir = EXCLUDED.kasir,
        subtotal = EXCLUDED.subtotal,
        total = EXCLUDED.total,
        total_tagihan = EXCLUDED.total_tagihan,
        diskon = EXCLUDED.diskon,
        nominal_cash = EXCLUDED.nominal_cash,
        nominal_qris = EXCLUDED.nominal_qris,
        nominal_transfer = EXCLUDED.nominal_transfer,
        nominal_bayar = EXCLUDED.nominal_bayar,
        kembalian = EXCLUDED.kembalian,
        waktu_dibayar = EXCLUDED.waktu_dibayar
    RETURNING id INTO v_struk_id;

    -- 7. PHASE 3: INSERT CAFE ITEMS & DEDUCT INVENTORY WITH ROW-LEVEL LOCKS (T04 ANTI-OVERSELLING)
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        DELETE FROM public.cafe WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := COALESCE(v_item->>'nama_menu', v_item->>'daftar_menu', v_item->>'nama_item');
            v_qty := COALESCE((v_item->>'qty')::numeric, (v_item->>'jumlah')::numeric, 1.0000);
            
            SELECT * INTO v_menu FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id 
              AND (daftar_menu = v_nama_menu OR nama_menu = v_nama_menu OR nama_item = v_nama_menu)
            LIMIT 1;

            IF FOUND AND v_menu.harga IS NOT NULL AND v_menu.harga > 0 THEN
                v_real_price := v_menu.harga;
            ELSE
                v_real_price := COALESCE((v_item->>'harga_satuan')::numeric, (v_item->>'harga')::numeric, 0.0000);
            END IF;
            v_item_subtotal := v_qty * v_real_price;

            -- Insert cafe detail row (Parent struk already exists!)
            INSERT INTO public.cafe (
                tenant_id, branch_id, id_struk, tanggal, jam,
                nama_menu, daftar_menu, qty, jumlah, harga_satuan, harga,
                subtotal, total, status, catatan, created_at
            ) VALUES (
                p_tenant_id, v_effective_branch_id, v_id_struk, CURRENT_DATE, CURRENT_TIME,
                v_nama_menu, v_nama_menu, v_qty, v_qty, v_real_price, v_real_price,
                v_item_subtotal, v_item_subtotal, v_status_bayar, COALESCE(v_item->>'catatan', ''), NOW()
            );

            -- T04 FIX: Deduct BOM materials with Row-Level Locking (Anti-Overselling)
            v_has_recipe := FALSE;
            IF v_menu.id IS NOT NULL THEN
                FOR v_recipe IN 
                    SELECT * FROM public.resep
                    WHERE tenant_id = p_tenant_id 
                      AND (id_menu = v_menu.id::text OR id_menu = v_menu.id_menu OR nama_menu = v_nama_menu OR daftar_menu = v_nama_menu)
                LOOP
                    v_has_recipe := TRUE;
                    v_qty_needed := v_qty * COALESCE(v_recipe.jumlah_dibutuhkan, v_recipe.jumlah, v_recipe.jumlah_pemakaian, 0.0000);
                    
                    IF v_qty_needed > 0 THEN
                        -- Row-level lock to prevent concurrent overselling race conditions
                        SELECT * INTO v_stok FROM public.stok_barang
                        WHERE tenant_id = p_tenant_id 
                          AND (id::text = v_recipe.id_bahan_baku OR nama_produk = v_recipe.nama_bahan OR nama_produk = v_recipe.nama_bahan_baku)
                        FOR UPDATE;

                        IF FOUND THEN
                            -- CRITICAL T04 INVARIANT: Reject if stock is insufficient
                            IF v_stok.stok < v_qty_needed THEN
                                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan baku "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %)',
                                    v_stok.nama_produk, v_stok.stok, v_qty_needed;
                            END IF;

                            UPDATE public.stok_barang
                            SET stok = stok - v_qty_needed, updated_at = NOW()
                            WHERE id = v_stok.id;

                            INSERT INTO public.barang_keluar (
                                tenant_id, branch_id, id_bahan_baku, tanggal, nama_bahan_baku, jumlah_keluar, alasan
                            ) VALUES (
                                p_tenant_id, v_effective_branch_id, v_stok.id, CURRENT_DATE, v_stok.nama_produk, v_qty_needed, 'PENJUALAN_POS_' || v_id_struk
                            );

                            v_deductions_count := v_deductions_count + 1;
                        END IF;
                    END IF;
                END LOOP;
            END IF;

            -- If item has NO recipe, check if it exists directly as finished goods in stok_barang
            IF NOT v_has_recipe THEN
                SELECT * INTO v_stok FROM public.stok_barang
                WHERE tenant_id = p_tenant_id 
                  AND lower(nama_produk) = lower(v_nama_menu)
                FOR UPDATE;

                IF FOUND THEN
                    IF v_stok.stok < v_qty THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %)',
                            v_stok.nama_produk, v_stok.stok, v_qty;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_qty, updated_at = NOW()
                    WHERE id = v_stok.id;

                    INSERT INTO public.barang_keluar (
                        tenant_id, branch_id, id_bahan_baku, tanggal, nama_bahan_baku, jumlah_keluar, alasan
                    ) VALUES (
                        p_tenant_id, v_effective_branch_id, v_stok.id, CURRENT_DATE, v_stok.nama_produk, v_qty, 'PENJUALAN_POS_' || v_id_struk
                    );

                    v_deductions_count := v_deductions_count + 1;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 8. PHASE 4: INSERT CARWASH SERVICE (IF APPLICABLE)
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload != 'null'::jsonb THEN
        DELETE FROM public.carwash WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

        INSERT INTO public.carwash (
            tenant_id, branch_id, id_struk, tanggal, jam,
            plat, plat_nomor, model, variant, ukuran, paket,
            harga, harga_cuci, harga_paket,
            anggota_1, anggota_2, shift, status, status_pengerjaan,
            gaji_anggota, gaji_pencuci, no_telepon, catatan_kendaraan,
            kehadiran, created_at
        ) VALUES (
            p_tenant_id, v_effective_branch_id, v_id_struk, CURRENT_DATE, CURRENT_TIME,
            COALESCE(p_carwash_payload->>'plat', p_carwash_payload->>'plat_nomor', '-'),
            COALESCE(p_carwash_payload->>'plat_nomor', p_carwash_payload->>'plat', '-'),
            COALESCE(p_carwash_payload->>'model', 'Mobil'),
            COALESCE(p_carwash_payload->>'variant', 'Regular'),
            COALESCE(p_carwash_payload->>'ukuran', 'Medium'),
            COALESCE(p_carwash_payload->>'paket', 'Cuci Bersih'),
            v_calc_carwash_total,
            COALESCE((p_carwash_payload->>'harga_cuci')::numeric, v_calc_carwash_total),
            COALESCE((p_carwash_payload->>'harga_paket')::numeric, 0.0000),
            COALESCE(p_carwash_payload->>'anggota_1', 'Petugas 1'),
            p_carwash_payload->>'anggota_2',
            COALESCE(p_carwash_payload->>'shift', 'Pagi'),
            v_status_bayar,
            COALESCE(p_carwash_payload->>'status_pengerjaan', CASE WHEN v_status_bayar = 'Selesai' THEN 'Siap Diambil' ELSE 'Sedang Dicuci' END),
            COALESCE((p_carwash_payload->>'gaji_anggota')::numeric, 0.0000),
            COALESCE((p_carwash_payload->>'gaji_pencuci')::numeric, 0.0000),
            p_carwash_payload->>'no_telepon',
            p_carwash_payload->>'catatan_kendaraan',
            COALESCE(p_carwash_payload->>'kehadiran', 'Ditunggu'),
            NOW()
        );
    END IF;

    -- 7. RETURN STRUCTURED RESULT
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'struk_id', v_struk_id,
        'id_struk', v_id_struk,
        'status_bayar', v_status_bayar,
        'total_tagihan', v_grand_total,
        'subtotal', (v_calc_cafe_total + v_calc_carwash_total),
        'diskon', v_total_diskon,
        'items_processed', v_items_count,
        'stock_deductions', v_deductions_count
    );
END;
$$;

-- Secure Permissions
REVOKE ALL ON FUNCTION public.fn_execute_checkout(UUID, UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_execute_checkout(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated, service_role;

COMMIT;
