-- ==============================================================================
-- RELAYPOS ENTERPRISE MIGRATION: 20261117000006_sync_pos_expense_to_inventory.sql
-- DESCRIPTION:
--   1. Tambahkan kolom id_pengeluaran pada tabel public.pengeluaran (jika belum ada)
--      dan backfill dari id UUID.
--   2. Buat trigger BEFORE INSERT pada public.pengeluaran untuk memastikan id dan
--      id_pengeluaran selalu terisi identik.
--   3. Buat trigger AFTER INSERT / UPDATE / DELETE pada public.pengeluaran untuk
--      sinkronisasi otomatis ke inventori bahan baku (stok_barang & barang_masuk)
--      DENGAN MEMANFAATKAN trigger fn_apply_barang_masuk_to_stock (Moving Average Cost)
--      sehingga TIDAK TERJADI DOUBLE-COUNTING.
--   4. Perbarui RLS Policy public.pengeluaran agar Kasir dapat mengedit dan menghapus
--      catatan pengeluarannya sendiri pada tanggal berjalan (CURRENT_DATE) sebelum EOD.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Pastikan kolom id_pengeluaran ada di public.pengeluaran & terindeks
-- ------------------------------------------------------------------------------
ALTER TABLE public.pengeluaran
    ADD COLUMN IF NOT EXISTS id_pengeluaran VARCHAR(100);

UPDATE public.pengeluaran
SET id_pengeluaran = id::text
WHERE id_pengeluaran IS NULL OR id_pengeluaran = '';

CREATE INDEX IF NOT EXISTS idx_pengeluaran_id_pengeluaran 
ON public.pengeluaran (tenant_id, id_pengeluaran);

-- ------------------------------------------------------------------------------
-- 2. Trigger BEFORE INSERT: Sinkronisasi ID & ID_Pengeluaran
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_normalize_pengeluaran_identifiers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.id IS NULL AND NEW.id_pengeluaran ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        NEW.id := NEW.id_pengeluaran::uuid;
    ELSIF NEW.id IS NULL THEN
        NEW.id := gen_random_uuid();
    END IF;

    IF NEW.id_pengeluaran IS NULL OR NEW.id_pengeluaran = '' THEN
        NEW.id_pengeluaran := NEW.id::text;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_pengeluaran_identifiers ON public.pengeluaran;
CREATE TRIGGER trg_normalize_pengeluaran_identifiers
BEFORE INSERT ON public.pengeluaran
FOR EACH ROW
EXECUTE FUNCTION public.fn_normalize_pengeluaran_identifiers();

-- ------------------------------------------------------------------------------
-- 3. Trigger Sinkronisasi Stok dari Pengeluaran Bahan Baku
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_pengeluaran_to_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_stock RECORD;
    v_item_name TEXT;
    v_unit_price NUMERIC;
    v_qty_delta NUMERIC;
    v_old_stok NUMERIC;
    v_exp_id_str TEXT;
BEGIN
    -- ==========================================
    -- A. INSERT: Kasir mencatat pembelian bahan baku
    -- ==========================================
    IF TG_OP = 'INSERT' THEN
        IF NEW.apakah_stok IS TRUE AND NEW.id_bahan_baku IS NOT NULL AND COALESCE(NEW.qty, 0) > 0 THEN
            -- Ambil metadata stok_barang
            SELECT id, nama_produk, nama_barang, satuan, COALESCE(harga_beli, harga_satuan, 0) as cost
            INTO v_target_stock
            FROM public.stok_barang
            WHERE id = NEW.id_bahan_baku
            LIMIT 1;

            IF FOUND THEN
                v_item_name := COALESCE(v_target_stock.nama_produk, v_target_stock.nama_barang, NEW.nama_pengeluaran);
                v_unit_price := ROUND(NEW.nominal / NEW.qty, 4);
                v_exp_id_str := COALESCE(NEW.id_pengeluaran, NEW.id::text);

                -- Catat ke tabel barang_masuk.
                -- Trigger 'trg_apply_barang_masuk_to_stock' pada tabel barang_masuk
                -- akan otomatis meng-update stok_barang + menghitung ulang Moving Average Cost.
                INSERT INTO public.barang_masuk (
                    id,
                    tenant_id,
                    branch_id,
                    id_pengeluaran,
                    id_bahan_baku,
                    tanggal,
                    nama_produk,
                    nama_barang,
                    jumlah_masuk,
                    harga_satuan,
                    harga_beli,
                    total_harga,
                    total_biaya,
                    created_at
                ) VALUES (
                    gen_random_uuid(),
                    NEW.tenant_id,
                    NEW.branch_id,
                    v_exp_id_str,
                    NEW.id_bahan_baku,
                    NEW.tanggal,
                    v_item_name,
                    v_item_name,
                    NEW.qty,
                    v_unit_price,
                    v_unit_price,
                    NEW.nominal,
                    NEW.nominal,
                    NOW()
                );
            END IF;
        END IF;
        RETURN NEW;

    -- ==========================================
    -- B. UPDATE: Kasir mengedit qty atau item
    -- ==========================================
    ELSIF TG_OP = 'UPDATE' THEN
        v_exp_id_str := COALESCE(OLD.id_pengeluaran, OLD.id::text);

        -- 1. Jika sebelumnya stok, tapi sekarang diubah jadi non-stok
        IF OLD.apakah_stok IS TRUE AND (NEW.apakah_stok IS NOT TRUE OR NEW.id_bahan_baku IS NULL) THEN
            -- Hapus catatan barang_masuk terkait
            DELETE FROM public.barang_masuk 
            WHERE id_pengeluaran = v_exp_id_str OR id_pengeluaran = OLD.id::text;

            -- Kurangkan kembali stok
            UPDATE public.stok_barang
            SET stok = GREATEST(0, COALESCE(stok, 0) - COALESCE(OLD.qty, 0)),
                stok_akhir = GREATEST(0, COALESCE(stok_akhir, stok, 0) - COALESCE(OLD.qty, 0)),
                updated_at = NOW()
            WHERE id = OLD.id_bahan_baku;

        -- 2. Jika sebelumnya non-stok, sekarang diubah jadi stok
        ELSIF (OLD.apakah_stok IS NOT TRUE OR OLD.id_bahan_baku IS NULL) AND NEW.apakah_stok IS TRUE AND NEW.id_bahan_baku IS NOT NULL THEN
            SELECT id, nama_produk, nama_barang, satuan INTO v_target_stock
            FROM public.stok_barang WHERE id = NEW.id_bahan_baku LIMIT 1;

            IF FOUND THEN
                v_item_name := COALESCE(v_target_stock.nama_produk, v_target_stock.nama_barang, NEW.nama_pengeluaran);
                v_unit_price := ROUND(NEW.nominal / NULLIF(NEW.qty, 0), 4);
                v_exp_id_str := COALESCE(NEW.id_pengeluaran, NEW.id::text);

                INSERT INTO public.barang_masuk (
                    id, tenant_id, branch_id, id_pengeluaran, id_bahan_baku,
                    tanggal, nama_produk, nama_barang, jumlah_masuk, harga_satuan,
                    harga_beli, total_harga, total_biaya, created_at
                ) VALUES (
                    gen_random_uuid(), NEW.tenant_id, NEW.branch_id, v_exp_id_str, NEW.id_bahan_baku,
                    NEW.tanggal, v_item_name, v_item_name, NEW.qty, v_unit_price,
                    v_unit_price, NEW.nominal, NEW.nominal, NOW()
                );
            END IF;

        -- 3. Jika tetap stok pada item yang sama tapi qty berubah
        ELSIF OLD.apakah_stok IS TRUE AND NEW.apakah_stok IS TRUE AND OLD.id_bahan_baku = NEW.id_bahan_baku THEN
            v_qty_delta := COALESCE(NEW.qty, 0) - COALESCE(OLD.qty, 0);
            IF v_qty_delta <> 0 THEN
                -- Sesuaikan record barang_masuk
                UPDATE public.barang_masuk
                SET jumlah_masuk = NEW.qty,
                    harga_satuan = ROUND(NEW.nominal / NULLIF(NEW.qty, 0), 4),
                    harga_beli = ROUND(NEW.nominal / NULLIF(NEW.qty, 0), 4),
                    total_harga = NEW.nominal,
                    total_biaya = NEW.nominal
                WHERE id_pengeluaran = v_exp_id_str OR id_pengeluaran = OLD.id::text;

                -- Sesuaikan selisih stok_barang
                UPDATE public.stok_barang
                SET stok = GREATEST(0, COALESCE(stok, 0) + v_qty_delta),
                    stok_akhir = GREATEST(0, COALESCE(stok_akhir, stok, 0) + v_qty_delta),
                    updated_at = NOW()
                WHERE id = NEW.id_bahan_baku;
            END IF;

        -- 4. Jika ganti item bahan baku yang dibeli
        ELSIF OLD.apakah_stok IS TRUE AND NEW.apakah_stok IS TRUE AND OLD.id_bahan_baku <> NEW.id_bahan_baku THEN
            -- Kembalikan stok item lama
            UPDATE public.stok_barang
            SET stok = GREATEST(0, COALESCE(stok, 0) - COALESCE(OLD.qty, 0)),
                stok_akhir = GREATEST(0, COALESCE(stok_akhir, stok, 0) - COALESCE(OLD.qty, 0)),
                updated_at = NOW()
            WHERE id = OLD.id_bahan_baku;

            DELETE FROM public.barang_masuk 
            WHERE id_pengeluaran = v_exp_id_str OR id_pengeluaran = OLD.id::text;

            -- Tambah stok item baru
            SELECT id, nama_produk, nama_barang, satuan INTO v_target_stock
            FROM public.stok_barang WHERE id = NEW.id_bahan_baku LIMIT 1;

            IF FOUND THEN
                v_item_name := COALESCE(v_target_stock.nama_produk, v_target_stock.nama_barang, NEW.nama_pengeluaran);
                v_unit_price := ROUND(NEW.nominal / NULLIF(NEW.qty, 0), 4);
                v_exp_id_str := COALESCE(NEW.id_pengeluaran, NEW.id::text);

                INSERT INTO public.barang_masuk (
                    id, tenant_id, branch_id, id_pengeluaran, id_bahan_baku,
                    tanggal, nama_produk, nama_barang, jumlah_masuk, harga_satuan,
                    harga_beli, total_harga, total_biaya, created_at
                ) VALUES (
                    gen_random_uuid(), NEW.tenant_id, NEW.branch_id, v_exp_id_str, NEW.id_bahan_baku,
                    NEW.tanggal, v_item_name, v_item_name, NEW.qty, v_unit_price,
                    v_unit_price, NEW.nominal, NEW.nominal, NOW()
                );
            END IF;
        END IF;

        RETURN NEW;

    -- ==========================================
    -- C. DELETE: Kasir menghapus pengeluaran
    -- ==========================================
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.apakah_stok IS TRUE AND OLD.id_bahan_baku IS NOT NULL AND COALESCE(OLD.qty, 0) > 0 THEN
            v_exp_id_str := COALESCE(OLD.id_pengeluaran, OLD.id::text);

            -- Hapus catatan barang_masuk
            DELETE FROM public.barang_masuk 
            WHERE id_pengeluaran = v_exp_id_str OR id_pengeluaran = OLD.id::text;

            -- Kurangkan kembali stok fisik
            UPDATE public.stok_barang
            SET stok = GREATEST(0, COALESCE(stok, 0) - COALESCE(OLD.qty, 0)),
                stok_akhir = GREATEST(0, COALESCE(stok_akhir, stok, 0) - COALESCE(OLD.qty, 0)),
                updated_at = NOW()
            WHERE id = OLD.id_bahan_baku;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pengeluaran_to_inventory ON public.pengeluaran;
CREATE TRIGGER trg_sync_pengeluaran_to_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.pengeluaran
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_pengeluaran_to_inventory();

-- ------------------------------------------------------------------------------
-- 4. Perbarui RLS Policy: Beri izin Kasir UPDATE & DELETE pengeluaran hari ini
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS pengeluaran_update_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_update_policy ON public.pengeluaran
FOR UPDATE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND (
        public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
        OR (
            public.current_user_role() = 'Kasir'
            AND branch_id = public.current_branch_id()
            AND tanggal = CURRENT_DATE
            AND id_cashflow IS NULL
        )
    )
)
WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND (
        public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
        OR (
            public.current_user_role() = 'Kasir'
            AND branch_id = public.current_branch_id()
            AND tanggal = CURRENT_DATE
            AND id_cashflow IS NULL
        )
    )
);

DROP POLICY IF EXISTS pengeluaran_delete_policy ON public.pengeluaran;
CREATE POLICY pengeluaran_delete_policy ON public.pengeluaran
FOR DELETE TO authenticated
USING (
    tenant_id = public.current_tenant_id()
    AND (
        public.current_user_role() IN ('Super Admin', 'Owner', 'Admin')
        OR (
            public.current_user_role() = 'Kasir'
            AND branch_id = public.current_branch_id()
            AND tanggal = CURRENT_DATE
            AND id_cashflow IS NULL
        )
    )
);

COMMIT;
