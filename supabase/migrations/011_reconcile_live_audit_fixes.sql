-- ==============================================================================
-- MIGRATION 011: RECONCILE LIVE AUDIT FIXES (LIVE-01 s/d LIVE-12)
-- Sesuai backlog pengetesan QA:
-- 1. LIVE-02: Single Source of Truth Lisensi Tenant (Cegah lisensi ganda saat registrasi)
-- 2. LIVE-03: Fix Restock UUID Mismatch & Sinkronisasi Otomatis Stok Barang Masuk
-- 3. LIVE-06: Rekonsiliasi Otomatis POS Checkout ke Buku Kas (Tabel cashflow)
-- 4. LIVE-08: Penolakan Diskon Melebihi Subtotal Kotor (INVALID_DISCOUNT)
-- 5. LIVE-09: Jurnal Pendapatan Dinamis (4102 Cafe / 4101 Carwash) & Posting HPP (5101/1103)
-- 6. LIVE-12: Sinkronisasi Dua Arah Kolom Stok (stok <-> stok_akhir) & Rekonsiliasi Drift
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. LIVE-02: INVENTARISASI & SINGLE TRUTH LISENSI TENANT
-- ------------------------------------------------------------------------------

-- Update fn_initialize_tenant_defaults: Hapus hardcoded insert lisensi pro 365 hari
-- agar provisioning lisensi hanya memiliki satu sumber kebenaran (trigger trial atau aktivasi voucher).
CREATE OR REPLACE FUNCTION public.fn_initialize_tenant_defaults(
    p_tenant_id UUID,
    p_branch_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Chart of Accounts (COA) Standar Indonesia
    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe_akun, saldo_normal)
    VALUES
        (p_tenant_id, '1101', 'Kas Tunai Laci Kasir', 'ASET', 'DEBIT'),
        (p_tenant_id, '1102', 'Bank Rekening Operasional', 'ASET', 'DEBIT'),
        (p_tenant_id, '1103', 'Persediaan Bahan Baku & Barang Dagang', 'ASET', 'DEBIT'),
        (p_tenant_id, '3102', 'Prive / Penarikan Modal Pemilik', 'EKUITAS', 'DEBIT'),
        (p_tenant_id, '4101', 'Pendapatan Layanan Carwash', 'PENDAPATAN', 'KREDIT'),
        (p_tenant_id, '4102', 'Pendapatan Penjualan Cafe & F&B', 'PENDAPATAN', 'KREDIT'),
        (p_tenant_id, '5101', 'Beban Pokok Pendapatan (HPP)', 'BEBAN', 'DEBIT'),
        (p_tenant_id, '6101', 'Beban Gaji & Komisi Cuci', 'BEBAN', 'DEBIT'),
        (p_tenant_id, '6102', 'Beban Operasional & Listrik Air', 'BEBAN', 'DEBIT')
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING;

    -- 2. Kategori Keuangan
    INSERT INTO public.kategori_keuangan (tenant_id, jenis, nama_kategori)
    VALUES
        (p_tenant_id, 'PENGELUARAN', 'Operasional & Utilitas'),
        (p_tenant_id, 'PENGELUARAN', 'Gaji & Komisi Karyawan'),
        (p_tenant_id, 'PENGELUARAN', 'Bahan Baku & Restock'),
        (p_tenant_id, 'PEMASUKAN', 'Pendapatan Carwash'),
        (p_tenant_id, 'PEMASUKAN', 'Pendapatan Cafe'),
        (p_tenant_id, 'PEMASUKAN', 'Pendapatan Lain-lain')
    ON CONFLICT DO NOTHING;

    -- 3. Program Loyalitas
    INSERT INTO public.loyalty_programs (tenant_id, nama_program, tipe_reward, poin_dibutuhkan, nilai_reward, status)
    VALUES
        (p_tenant_id, 'Cuci 5x Gratis 1x', 'FREE_WASH', 5, 0, 'ACTIVE')
    ON CONFLICT DO NOTHING;

    -- 4. Kategori Menu / Layanan
    INSERT INTO public.kategori_menu (tenant_id, nama_kategori)
    VALUES
        (p_tenant_id, 'Coffee & Tea'),
        (p_tenant_id, 'Meals & Snacks'),
        (p_tenant_id, 'Wash & Detailing')
    ON CONFLICT DO NOTHING;

    -- Note: Lisensi TIDAK lagi di-insert ganda di sini.
    -- Lisensi trial 14 hari dibuat eksklusif oleh handle_new_user_profile() saat registrasi.
END;
$$;

-- Resolusi Lisensi Ganda Tenant A: Nonaktifkan lisensi trial jika ada lisensi pro aktif
UPDATE public.tenant_licenses
SET status = 'SUPERSEDED'
WHERE tenant_id = '44ad5f1e-c777-4a76-8b51-251201dacdf8'
  AND plan = 'trial'
  AND EXISTS (
      SELECT 1 FROM public.tenant_licenses
      WHERE tenant_id = '44ad5f1e-c777-4a76-8b51-251201dacdf8'
        AND plan = 'pro'
        AND status = 'ACTIVE'
  );


-- ------------------------------------------------------------------------------
-- 2. LIVE-03 & LIVE-12: FIX RESTOCK UUID MISMATCH & SINKRONISASI STOK
-- ------------------------------------------------------------------------------

-- Perbaiki trigger fn_sync_barang_masuk agar tidak me-cast varchar ke UUID jika bukan UUID
CREATE OR REPLACE FUNCTION public.fn_sync_barang_masuk()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Jika id_bahan_baku kosong tapi id_barang ada, lookup UUID stok_barang
    IF NEW.id_bahan_baku IS NULL AND NEW.id_barang IS NOT NULL THEN
        -- Cek apakah id_barang adalah string UUID yang valid
        IF NEW.id_barang ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            NEW.id_bahan_baku := NEW.id_barang::uuid;
        ELSE
            -- Cari UUID di stok_barang berdasarkan kode barang atau nama barang
            SELECT id INTO NEW.id_bahan_baku
            FROM public.stok_barang
            WHERE (tenant_id = NEW.tenant_id OR tenant_id IS NULL)
              AND (id_barang = NEW.id_barang OR id_bahan_baku = NEW.id_barang OR nama_barang = NEW.nama_barang)
            LIMIT 1;
        END IF;
    END IF;

    -- Jika id_barang kosong tapi id_bahan_baku ada, isi id_barang dari stok_barang
    IF NEW.id_barang IS NULL AND NEW.id_bahan_baku IS NOT NULL THEN
        SELECT COALESCE(id_barang, id::text) INTO NEW.id_barang
        FROM public.stok_barang
        WHERE id = NEW.id_bahan_baku
        LIMIT 1;
    END IF;

    -- Sinkronisasi nama
    IF NEW.nama_barang IS NOT NULL AND NEW.nama_bahan_baku IS NULL THEN
        NEW.nama_bahan_baku := NEW.nama_barang;
    ELSIF NEW.nama_bahan_baku IS NOT NULL AND NEW.nama_barang IS NULL THEN
        NEW.nama_barang := NEW.nama_bahan_baku;
    END IF;

    -- Sinkronisasi harga
    IF NEW.harga_satuan IS NOT NULL AND NEW.harga_beli IS NULL THEN
        NEW.harga_beli := NEW.harga_satuan;
    ELSIF NEW.harga_beli IS NOT NULL AND NEW.harga_satuan IS NULL THEN
        NEW.harga_satuan := NEW.harga_beli;
    END IF;

    IF NEW.total_harga IS NOT NULL AND NEW.total_biaya IS NULL THEN
        NEW.total_biaya := NEW.total_harga;
    ELSIF NEW.total_biaya IS NOT NULL AND NEW.total_harga IS NULL THEN
        NEW.total_harga := NEW.total_biaya;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger otomatis increment stok pada tabel stok_barang saat ada barang_masuk
CREATE OR REPLACE FUNCTION public.fn_apply_barang_masuk_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_id UUID;
BEGIN
    v_target_id := NEW.id_bahan_baku;

    IF v_target_id IS NULL AND NEW.id_barang IS NOT NULL THEN
        SELECT id INTO v_target_id
        FROM public.stok_barang
        WHERE (tenant_id = NEW.tenant_id OR tenant_id IS NULL)
          AND (id_barang = NEW.id_barang OR id_bahan_baku = NEW.id_barang)
        LIMIT 1;
    END IF;

    IF v_target_id IS NOT NULL THEN
        UPDATE public.stok_barang
        SET stok = COALESCE(stok, 0) + NEW.jumlah_masuk,
            stok_akhir = COALESCE(stok_akhir, stok, 0) + NEW.jumlah_masuk,
            updated_at = NOW()
        WHERE id = v_target_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_barang_masuk_to_stock ON public.barang_masuk;
CREATE TRIGGER trg_apply_barang_masuk_to_stock
AFTER INSERT ON public.barang_masuk
FOR EACH ROW
EXECUTE FUNCTION public.fn_apply_barang_masuk_to_stock();


-- ------------------------------------------------------------------------------
-- 3. LIVE-12: SINKRONISASI DUA ARAH STOK (stok <-> stok_akhir)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_sync_stok_barang_advanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Sync id identifiers
    IF NEW.id_barang IS NOT NULL AND NEW.id_bahan_baku IS NULL THEN
        NEW.id_bahan_baku := NEW.id_barang;
    ELSIF NEW.id_bahan_baku IS NOT NULL AND NEW.id_barang IS NULL THEN
        NEW.id_barang := NEW.id_bahan_baku;
    END IF;

    -- Sync names
    IF NEW.nama_barang IS NOT NULL AND NEW.nama_produk IS NULL THEN
        NEW.nama_produk := NEW.nama_barang;
    ELSIF NEW.nama_produk IS NOT NULL AND NEW.nama_barang IS NULL THEN
        NEW.nama_barang := NEW.nama_produk;
    END IF;

    -- Sync prices
    IF NEW.harga_beli IS NOT NULL AND (NEW.harga_satuan IS NULL OR NEW.harga_satuan = 0) THEN
        NEW.harga_satuan := NEW.harga_beli;
    ELSIF NEW.harga_satuan IS NOT NULL AND (NEW.harga_beli IS NULL OR NEW.harga_beli = 0) THEN
        NEW.harga_beli := NEW.harga_satuan;
    END IF;

    -- SINKRONISASI PENUH DUA ARAH: stok <-> stok_akhir
    IF TG_OP = 'INSERT' THEN
        IF NEW.stok IS NOT NULL AND NEW.stok_akhir IS NULL THEN
            NEW.stok_akhir := NEW.stok;
        ELSIF NEW.stok_akhir IS NOT NULL AND NEW.stok IS NULL THEN
            NEW.stok := NEW.stok_akhir;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Jika kolom stok berubah tapi stok_akhir tidak disentuh
        IF (NEW.stok IS DISTINCT FROM OLD.stok) AND (NEW.stok_akhir IS NOT DISTINCT FROM OLD.stok_akhir) THEN
            NEW.stok_akhir := NEW.stok;
        -- Jika kolom stok_akhir berubah tapi stok tidak disentuh
        ELSIF (NEW.stok_akhir IS DISTINCT FROM OLD.stok_akhir) AND (NEW.stok IS NOT DISTINCT FROM OLD.stok) THEN
            NEW.stok := NEW.stok_akhir;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Rekonsiliasi data historis yang sempat drift (stok != stok_akhir)
UPDATE public.stok_barang
SET stok_akhir = stok
WHERE stok_akhir IS DISTINCT FROM stok;


-- ------------------------------------------------------------------------------
-- 4. LIVE-06, LIVE-08, LIVE-09, LIVE-12: HARDENED fn_execute_checkout
-- ------------------------------------------------------------------------------

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
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_tenant_id UUID;
    v_is_super_admin BOOLEAN := FALSE;
    v_lock_key BIGINT;
    v_effective_branch_id UUID;

    -- Struk fields
    v_struk_uuid UUID;
    v_id_struk TEXT;
    v_tanggal DATE;
    v_jam TIME;
    v_kasir TEXT;
    v_metode_bayar TEXT;
    v_status_bayar TEXT;
    v_idempotency_hash TEXT;
    v_total_tagihan NUMERIC(15, 2) := 0.00;
    v_nominal_bayar NUMERIC(15, 2) := 0.00;
    v_kembalian NUMERIC(15, 2) := 0.00;
    v_diskon NUMERIC(15, 2) := 0.00;
    v_pajak NUMERIC(15, 2) := 0.00;

    -- Item tallies
    v_total_cafe NUMERIC(15, 2) := 0.00;
    v_total_carwash NUMERIC(15, 2) := 0.00;
    v_total_hpp NUMERIC(15, 2) := 0.00;
    v_subtotal_kotor NUMERIC(15, 2) := 0.00;

    -- Loop variables
    v_item JSONB;
    v_nama_menu TEXT;
    v_qty_menu NUMERIC(15, 2);
    v_harga_menu NUMERIC(15, 2);
    v_menu_record RECORD;
    v_cw_record RECORD;
    v_stok_record RECORD;
    v_recipe RECORD;
    v_needed_qty NUMERIC(15, 2);
    v_has_recipes BOOLEAN;

    -- Accounting accounts
    v_acc_kas UUID;
    v_acc_pendapatan_cafe UUID;
    v_acc_pendapatan_carwash UUID;
    v_acc_hpp UUID;
    v_acc_persediaan UUID;
    v_journal_id UUID;
    v_cashflow_pos TEXT;
    v_cashflow_id TEXT;
BEGIN
    -- 1. Validasi Autentikasi Pengguna & Sesi Aktif
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi otentikasi tidak valid.';
    END IF;

    -- 2. Ambil Profil & Hak Akses Penelepon
    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant_id
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Profil pengguna tidak ditemukan.';
    END IF;

    v_is_super_admin := (v_caller_role = 'super_admin');

    -- Validasi Multi-Tenant IDOR: Super Admin lolos, user lain wajib cocok dengan p_tenant_id
    IF NOT v_is_super_admin AND v_caller_tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'FORBIDDEN_TENANT_ACCESS: Percobaan akses checkout lintas tenant dilarang.';
    END IF;

    -- 3. Ekstrak Header Transaksi Struk
    v_id_struk := TRIM(COALESCE(p_struk_payload->>'id_struk', ''));
    IF v_id_struk = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: id_struk wajib diisi.';
    END IF;

    -- Perhitungan Advisory Lock berbasis tenant dan id_struk untuk serialisasi transaksi
    v_lock_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk), 1, 15))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 4. Idempotensi Hash Check
    v_idempotency_hash := md5(
        p_tenant_id::text || '|' ||
        v_id_struk || '|' ||
        COALESCE(p_struk_payload::text, '') || '|' ||
        COALESCE(p_cafe_items::text, '') || '|' ||
        COALESCE(p_carwash_payload::text, '')
    );

    SELECT id, total_tagihan, nominal_bayar, kembalian INTO v_struk_uuid, v_total_tagihan, v_nominal_bayar, v_kembalian
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk
    LIMIT 1;

    IF FOUND THEN
        -- Transaksi idempotent replay: kembalikan payload transaksi sebelumnya tanpa mutasi ulang
        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'SUCCESS',
            'is_idempotent', TRUE,
            'was_replayed', TRUE,
            'struk_id', v_struk_uuid,
            'id_struk', v_id_struk,
            'total_tagihan', v_total_tagihan,
            'nominal_bayar', v_nominal_bayar,
            'kembalian', v_kembalian,
            'message', 'Transaksi sudah tercatat sebelumnya (Idempotent Replay).'
        );
    END IF;

    -- 5. Validasi Cabang Aktif
    v_effective_branch_id := p_branch_id;
    IF v_effective_branch_id IS NULL AND p_struk_payload->>'branch_id' IS NOT NULL THEN
        BEGIN
            v_effective_branch_id := (p_struk_payload->>'branch_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_effective_branch_id := NULL;
        END;
    END IF;

    IF v_effective_branch_id IS NOT NULL THEN
        PERFORM 1 FROM public.branches
        WHERE tenant_id = p_tenant_id AND id = v_effective_branch_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'BRANCH_ACCESS_DENIED: Cabang tidak terdaftar pada tenant ini.';
        END IF;
    END IF;

    -- Parsing field struk
    v_tanggal := COALESCE((p_struk_payload->>'tanggal')::date, CURRENT_DATE);
    v_jam := COALESCE((p_struk_payload->>'jam')::time, CURRENT_TIME);
    v_kasir := COALESCE(p_struk_payload->>'kasir', 'KASIR');
    v_metode_bayar := UPPER(COALESCE(p_struk_payload->>'metode_bayar', 'CASH'));
    v_status_bayar := COALESCE(p_struk_payload->>'status_bayar', 'Selesai');
    v_diskon := COALESCE((p_struk_payload->>'diskon')::numeric, 0.00);
    v_pajak := COALESCE((p_struk_payload->>'pajak')::numeric, 0.00);

    -- 6. LIVE-08: VALIDASI DISKON NON-NEGATIF
    IF v_diskon < 0.00 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh negatif.';
    END IF;

    -- 7. Validasi & Kalkulasi Item Cafe (Server-Side Price Validation)
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE((v_item->>'qty')::numeric, 1.00);
            v_harga_menu := COALESCE((v_item->>'harga')::numeric, 0.00);

            IF v_nama_menu = '' OR v_qty_menu <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Nama menu dan kuantitas wajib valid.';
            END IF;

            -- Verifikasi harga katalog server
            SELECT harga INTO v_menu_record
            FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id
              AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu))
            LIMIT 1;

            IF FOUND THEN
                IF v_harga_menu <> v_menu_record.harga THEN
                    RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga menu "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                        v_nama_menu, v_menu_record.harga, v_harga_menu;
                END IF;
            END IF;

            v_total_cafe := v_total_cafe + (v_harga_menu * v_qty_menu);
        END LOOP;
    END IF;

    -- 8. Validasi & Kalkulasi Layanan Carwash
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        DECLARE
            v_cw_paket TEXT;
            v_cw_harga NUMERIC(15, 2);
        BEGIN
            v_cw_paket := TRIM(COALESCE(p_carwash_payload->>'paket', ''));
            v_cw_harga := COALESCE((p_carwash_payload->>'harga')::numeric, 0.00);

            IF v_cw_paket <> '' THEN
                SELECT harga INTO v_cw_record
                FROM public.carwash_packages
                WHERE tenant_id = p_tenant_id
                  AND LOWER(TRIM(nama_paket)) = LOWER(TRIM(v_cw_paket))
                LIMIT 1;

                IF FOUND THEN
                    IF v_cw_harga <> v_cw_record.harga THEN
                        RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga paket carwash "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                            v_cw_paket, v_cw_record.harga, v_cw_harga;
                    END IF;
                END IF;

                v_total_carwash := v_cw_harga;
            END IF;
        END;
    END IF;

    -- Subtotal kotor transaksi
    v_subtotal_kotor := v_total_cafe + v_total_carwash;

    -- 9. LIVE-08: VALIDASI DISKON TIDAK BOLEH MELEBIHI SUBTOTAL KOTOR
    IF v_subtotal_kotor > 0.00 AND v_diskon > v_subtotal_kotor THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh melebihi subtotal kotor transaksi (Subtotal: %, Diskon: %).',
            v_subtotal_kotor, v_diskon;
    END IF;

    -- Total akhir tagihan
    v_total_tagihan := GREATEST(0.00, (v_subtotal_kotor - v_diskon + v_pajak));
    v_nominal_bayar := COALESCE((p_struk_payload->>'nominal_bayar')::numeric, v_total_tagihan);

    IF v_status_bayar = 'Selesai' AND v_nominal_bayar < v_total_tagihan THEN
        RAISE EXCEPTION 'INSUFFICIENT_PAYMENT: Nominal pembayaran kurang dari total tagihan.';
    END IF;

    v_kembalian := GREATEST(0.00, v_nominal_bayar - v_total_tagihan);

    -- 10. Persist Struk Header
    INSERT INTO public.struk (
        tenant_id, branch_id, id_struk, total_tagihan, total, diskon,
        pajak, nominal_bayar, bayar, kembalian, metode_bayar,
        status_bayar, kasir, tanggal, jam, created_at
    ) VALUES (
        p_tenant_id, v_effective_branch_id, v_id_struk, v_total_tagihan, v_total_tagihan, v_diskon,
        v_pajak, v_nominal_bayar, v_nominal_bayar, v_kembalian, v_metode_bayar,
        v_status_bayar, v_kasir, v_tanggal, v_jam, NOW()
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE
    SET total_tagihan = EXCLUDED.total_tagihan,
        nominal_bayar = EXCLUDED.nominal_bayar,
        kembalian = EXCLUDED.kembalian,
        status_bayar = EXCLUDED.status_bayar,
        diskon = EXCLUDED.diskon,
        pajak = EXCLUDED.pajak
    RETURNING id INTO v_struk_uuid;

    -- 11. Persist Cafe Items & Carwash Payload
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            INSERT INTO public.cafe (
                tenant_id, branch_id, id_struk, nama_menu, harga, qty,
                subtotal, catatan, created_at
            ) VALUES (
                p_tenant_id, v_effective_branch_id, v_id_struk,
                TRIM(v_item->>'nama_menu'),
                (v_item->>'harga')::numeric,
                (v_item->>'qty')::numeric,
                ((v_item->>'harga')::numeric * (v_item->>'qty')::numeric),
                v_item->>'catatan',
                NOW()
            );
        END LOOP;
    END IF;

    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        INSERT INTO public.carwash (
            tenant_id, branch_id, id_struk, plat_nomor, paket,
            harga, status, created_at
        ) VALUES (
            p_tenant_id, v_effective_branch_id, v_id_struk,
            p_carwash_payload->>'plat_nomor',
            p_carwash_payload->>'paket',
            (p_carwash_payload->>'harga')::numeric,
            COALESCE(p_carwash_payload->>'status', 'PENDING'),
            NOW()
        );
    END IF;

    -- 12. Potong Stok Bahan Baku (BOM) & Retail Fisik Secara Atomik
    IF v_status_bayar = 'Selesai' THEN
        IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
            FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
            LOOP
                v_nama_menu := TRIM(v_item->>'nama_menu');
                v_qty_menu := (v_item->>'qty')::numeric;

                -- Cek resep bahan baku (BOM)
                v_has_recipes := FALSE;
                FOR v_recipe IN 
                    SELECT rb.id_bahan_baku, rb.nama_bahan, rb.jumlah_kebutuhan
                    FROM public.resep_menu rm
                    JOIN public.resep_bahan rb ON rb.resep_id = rm.id
                    WHERE rm.tenant_id = p_tenant_id
                      AND LOWER(TRIM(rm.nama_menu)) = LOWER(TRIM(v_nama_menu))
                LOOP
                    v_has_recipes := TRUE;
                    v_needed_qty := v_recipe.jumlah_kebutuhan * v_qty_menu;

                    SELECT * INTO v_stok_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND (id = v_recipe.id_bahan_baku OR LOWER(TRIM(COALESCE(nama_barang, nama_bahan_baku, ''))) = LOWER(TRIM(v_recipe.nama_bahan)))
                      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                    ORDER BY (branch_id = v_effective_branch_id) DESC, updated_at DESC
                    LIMIT 1
                    FOR UPDATE;

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Bahan baku resep "%" tidak ditemukan pada inventori fisik.',
                            v_recipe.nama_bahan;
                    END IF;

                    IF v_stok_record.stok < v_needed_qty THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan baku "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_recipe.nama_bahan, v_stok_record.stok, v_needed_qty;
                    END IF;

                    -- LIVE-12: Update seragam stok dan stok_akhir
                    UPDATE public.stok_barang
                    SET stok = stok - v_needed_qty,
                        stok_akhir = stok_akhir - v_needed_qty,
                        updated_at = NOW()
                    WHERE id = v_stok_record.id;

                    INSERT INTO public.barang_keluar (
                        tenant_id, branch_id, nama_barang, nama_produk, nama_bahan_baku, jumlah_keluar, alasan, created_at
                    ) VALUES (
                        p_tenant_id, v_effective_branch_id, v_recipe.nama_bahan, v_nama_menu, v_recipe.nama_bahan,
                        v_needed_qty, 'BOM Checkout Struk: ' || v_id_struk, NOW()
                    );

                    v_total_hpp := v_total_hpp + (COALESCE(v_stok_record.harga_beli, v_stok_record.harga_satuan, 0.00) * v_needed_qty);
                END LOOP;

                -- Jika tidak ada resep BOM, kurangi sebagai produk retail langsung
                IF NOT v_has_recipes THEN
                    SELECT * INTO v_stok_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND (
                        LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_nama_menu))
                        OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_nama_menu))
                      )
                      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                    ORDER BY (branch_id = v_effective_branch_id) DESC, updated_at DESC
                    LIMIT 1
                    FOR UPDATE;

                    IF FOUND THEN
                        IF v_stok_record.stok < v_qty_menu THEN
                            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk retail "%" tidak mencukupi (Tersedia: %, Diminta: %).',
                                v_nama_menu, v_stok_record.stok, v_qty_menu;
                        END IF;

                        -- LIVE-12: Update seragam stok dan stok_akhir
                        UPDATE public.stok_barang
                        SET stok = stok - v_qty_menu,
                            stok_akhir = stok_akhir - v_qty_menu,
                            updated_at = NOW()
                        WHERE id = v_stok_record.id;

                        INSERT INTO public.barang_keluar (
                            tenant_id, branch_id, nama_barang, nama_produk, nama_bahan_baku, jumlah_keluar, alasan, created_at
                        ) VALUES (
                            p_tenant_id, v_effective_branch_id, v_nama_menu, v_nama_menu, NULL,
                            v_qty_menu, 'Retail Checkout Struk: ' || v_id_struk, NOW()
                        );

                        v_total_hpp := v_total_hpp + (COALESCE(v_stok_record.harga_beli, v_stok_record.harga_satuan, 0.00) * v_qty_menu);
                    END IF;
                END IF;
            END LOOP;
        END IF;

        -- 13. LIVE-06: REKONSILIASI PENJUALAN POS KE BUKU KAS (Tabel cashflow)
        IF v_total_tagihan > 0.00 THEN
            v_cashflow_pos := CASE 
                WHEN v_metode_bayar = 'QRIS' THEN 'SALDO REKENING Y'
                WHEN v_metode_bayar = 'TRANSFER' THEN 'SALDO REKENING Y'
                ELSE 'SALDO CASH'
            END;

            v_cashflow_id := 'CF-POS-' || v_id_struk;

            INSERT INTO public.cashflow (
                tenant_id, branch_id, id_cashflow, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan,
                pengeluaran, pos, apakah_stok, created_at
            ) VALUES (
                p_tenant_id, v_effective_branch_id, v_cashflow_id, v_id_struk, v_tanggal,
                'Penjualan POS - Struk ' || v_id_struk || ' (' || v_metode_bayar || ')',
                'Pemasukan Kasir',
                CASE 
                    WHEN v_total_cafe > 0 AND v_total_carwash > 0 THEN 'Penjualan Cafe & Carwash'
                    WHEN v_total_cafe > 0 THEN 'Penjualan Cafe'
                    ELSE 'Penjualan Carwash'
                END,
                v_total_tagihan,
                0.00,
                v_cashflow_pos,
                FALSE,
                NOW()
            )
            ON CONFLICT (tenant_id, id_cashflow) DO UPDATE
            SET pemasukan = EXCLUDED.pemasukan,
                pos = EXCLUDED.pos;
        END IF;

        -- 14. LIVE-09: JURNAL AKUNTANSI DINAMIS & POSTING HPP
        IF v_total_tagihan > 0.00 THEN
            -- Akun Kas / Bank
            IF v_metode_bayar IN ('QRIS', 'TRANSFER') THEN
                SELECT id INTO v_acc_kas FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1102' LIMIT 1;
            END IF;
            IF v_acc_kas IS NULL THEN
                SELECT id INTO v_acc_kas FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;
            END IF;

            -- Akun Pendapatan Cafe (4102) & Carwash (4101)
            SELECT id INTO v_acc_pendapatan_cafe FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4102' LIMIT 1;
            SELECT id INTO v_acc_pendapatan_carwash FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4101' LIMIT 1;

            -- Akun HPP (5101) & Persediaan (1103)
            SELECT id INTO v_acc_hpp FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '5101' LIMIT 1;
            SELECT id INTO v_acc_persediaan FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1103' LIMIT 1;

            IF v_acc_kas IS NOT NULL THEN
                INSERT INTO public.journal_entries (
                    tenant_id, branch_id, entry_no, date, memo, status, total_amount, created_by, created_at
                ) VALUES (
                    p_tenant_id, v_effective_branch_id, 'JRN-' || v_id_struk, v_tanggal,
                    'Pendapatan Checkout POS: ' || v_id_struk, 'DRAFT',
                    v_total_tagihan + COALESCE(v_total_hpp, 0.00), v_caller_id, NOW()
                )
                ON CONFLICT (tenant_id, entry_no) DO NOTHING
                RETURNING id INTO v_journal_id;

                IF v_journal_id IS NOT NULL THEN
                    -- Debit Kas
                    INSERT INTO public.journal_entry_lines (
                        tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                    ) VALUES (
                        p_tenant_id, v_journal_id, v_acc_kas, v_total_tagihan, 0.00, 'Penerimaan Kas Kasir (' || v_metode_bayar || ')', NOW()
                    );

                    -- Kredit Pendapatan (Pisahkan 4102 Cafe vs 4101 Carwash)
                    IF v_total_cafe > 0 AND v_total_carwash > 0 THEN
                        -- Proporsional diskon jika ada
                        DECLARE
                            v_net_cafe NUMERIC(15, 2);
                            v_net_cw NUMERIC(15, 2);
                        BEGIN
                            v_net_cafe := ROUND((v_total_cafe / v_subtotal_kotor) * v_total_tagihan, 2);
                            v_net_cw := v_total_tagihan - v_net_cafe;

                            IF v_acc_pendapatan_cafe IS NOT NULL THEN
                                INSERT INTO public.journal_entry_lines (
                                    tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                                ) VALUES (p_tenant_id, v_journal_id, v_acc_pendapatan_cafe, 0.00, v_net_cafe, 'Pendapatan Penjualan Cafe & F&B', NOW());
                            END IF;

                            IF v_acc_pendapatan_carwash IS NOT NULL THEN
                                INSERT INTO public.journal_entry_lines (
                                    tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                                ) VALUES (p_tenant_id, v_journal_id, v_acc_pendapatan_carwash, 0.00, v_net_cw, 'Pendapatan Layanan Carwash', NOW());
                            END IF;
                        END;
                    ELSIF v_total_cafe > 0 THEN
                        -- 100% Cafe: Gunakan 4102
                        IF v_acc_pendapatan_cafe IS NOT NULL THEN
                            INSERT INTO public.journal_entry_lines (
                                tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                            ) VALUES (p_tenant_id, v_journal_id, v_acc_pendapatan_cafe, 0.00, v_total_tagihan, 'Pendapatan Penjualan Cafe & F&B', NOW());
                        ELSIF v_acc_pendapatan_carwash IS NOT NULL THEN
                            INSERT INTO public.journal_entry_lines (
                                tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                            ) VALUES (p_tenant_id, v_journal_id, v_acc_pendapatan_carwash, 0.00, v_total_tagihan, 'Pendapatan Penjualan POS', NOW());
                        END IF;
                    ELSE
                        -- Carwash: Gunakan 4101
                        IF v_acc_pendapatan_carwash IS NOT NULL THEN
                            INSERT INTO public.journal_entry_lines (
                                tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                            ) VALUES (p_tenant_id, v_journal_id, v_acc_pendapatan_carwash, 0.00, v_total_tagihan, 'Pendapatan Layanan Carwash', NOW());
                        END IF;
                    END IF;

                    -- LIVE-09: Posting Jurnal HPP (5101 Debit) dan Persediaan (1103 Kredit)
                    IF v_total_hpp > 0.00 AND v_acc_hpp IS NOT NULL AND v_acc_persediaan IS NOT NULL THEN
                        INSERT INTO public.journal_entry_lines (
                            tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                        ) VALUES 
                            (p_tenant_id, v_journal_id, v_acc_hpp, v_total_hpp, 0.00, 'Beban Pokok Penjualan (HPP)', NOW()),
                            (p_tenant_id, v_journal_id, v_acc_persediaan, 0.00, v_total_hpp, 'Pengurangan Persediaan Bahan Baku (BOM)', NOW());
                    END IF;

                    -- Transisi status ke POSTED (Immutability Enforced)
                    UPDATE public.journal_entries
                    SET status = 'POSTED'
                    WHERE id = v_journal_id;
                END IF;
            END IF;
        END IF;

        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'SUCCESS',
            'is_idempotent', FALSE,
            'was_replayed', FALSE,
            'struk_id', v_struk_uuid,
            'id_struk', v_id_struk,
            'total_tagihan', v_total_tagihan,
            'nominal_bayar', v_nominal_bayar,
            'kembalian', v_kembalian,
            'total_hpp', v_total_hpp,
            'message', 'Transaksi checkout berhasil diselesaikan.'
        );
    ELSE
        -- Transaksi Pending
        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'PENDING',
            'is_idempotent', FALSE,
            'was_replayed', FALSE,
            'struk_id', v_struk_uuid,
            'id_struk', v_id_struk,
            'total_tagihan', v_total_tagihan,
            'nominal_bayar', v_nominal_bayar,
            'kembalian', v_kembalian,
            'message', 'Transaksi draft/pending berhasil disimpan.'
        );
    END IF;
END;
$$;
