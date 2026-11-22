-- ============================================================================
-- MIGRATION: 20261121000001_relational_id_integrity_hardening.sql
-- Purpose: Replace fragile string/name matching with explicit UUID Foreign Keys
--          across payroll (carwash/pengeluaran/cashflow), BOM recipes (resep),
--          menu catalog sync (daftar_harga_menu), restock triggers (barang_masuk),
--          and staff account sync (kasir/karyawan_kantor <-> profiles).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADD MISSING RELATIONAL UUID COLUMNS & COMPOSITE TENANT INDEXES
-- ----------------------------------------------------------------------------

-- 1A. Payroll & Crew Commission FK links
ALTER TABLE public.carwash
    ADD COLUMN IF NOT EXISTS anggota_1_id UUID REFERENCES public.karyawan_cuci(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS anggota_2_id UUID REFERENCES public.karyawan_cuci(id) ON DELETE SET NULL;

ALTER TABLE public.pengeluaran
    ADD COLUMN IF NOT EXISTS karyawan_id UUID;

ALTER TABLE public.cashflow
    ADD COLUMN IF NOT EXISTS karyawan_id UUID;

CREATE INDEX IF NOT EXISTS idx_carwash_tenant_anggota1
    ON public.carwash (tenant_id, anggota_1_id) WHERE anggota_1_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carwash_tenant_anggota2
    ON public.carwash (tenant_id, anggota_2_id) WHERE anggota_2_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pengeluaran_tenant_karyawan_id
    ON public.pengeluaran (tenant_id, karyawan_id) WHERE karyawan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashflow_tenant_karyawan_id
    ON public.cashflow (tenant_id, karyawan_id) WHERE karyawan_id IS NOT NULL;

-- 1B. Recipe (BOM) FK links to stok_barang, daftar_harga_menu & carwash_packages
ALTER TABLE public.resep
    ADD COLUMN IF NOT EXISTS stok_barang_id UUID REFERENCES public.stok_barang(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES public.daftar_harga_menu(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS carwash_package_id UUID REFERENCES public.carwash_packages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_resep_tenant_stok_barang_id
    ON public.resep (tenant_id, stok_barang_id) WHERE stok_barang_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resep_tenant_menu_id
    ON public.resep (tenant_id, menu_id) WHERE menu_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resep_tenant_carwash_pkg_id
    ON public.resep (tenant_id, carwash_package_id) WHERE carwash_package_id IS NOT NULL;

-- 1C. Staff / Cashier login profile FK links
ALTER TABLE public.kasir
    ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.karyawan_kantor
    ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kasir_tenant_profile_id
    ON public.kasir (tenant_id, profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_karyawan_kantor_tenant_profile_id
    ON public.karyawan_kantor (tenant_id, profile_id) WHERE profile_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2. SAFE, IDEMPOTENT BACKFILLS FOR EXISTING CLOUD RECORDS
-- ----------------------------------------------------------------------------

-- 2A. Backfill carwash.anggota_1_id & anggota_2_id (unambiguous tenant match)
UPDATE public.carwash cw
SET anggota_1_id = (
    SELECT kc.id
    FROM public.karyawan_cuci kc
    WHERE kc.tenant_id = cw.tenant_id
      AND UPPER(TRIM(kc.nama)) = UPPER(TRIM(cw.anggota_1))
    ORDER BY kc.created_at ASC, kc.id ASC
    LIMIT 1
)
WHERE cw.anggota_1_id IS NULL
  AND NULLIF(TRIM(COALESCE(cw.anggota_1, '')), '') IS NOT NULL
  AND (
      SELECT COUNT(*)
      FROM public.karyawan_cuci kc2
      WHERE kc2.tenant_id = cw.tenant_id
        AND UPPER(TRIM(kc2.nama)) = UPPER(TRIM(cw.anggota_1))
  ) = 1;

UPDATE public.carwash cw
SET anggota_2_id = (
    SELECT kc.id
    FROM public.karyawan_cuci kc
    WHERE kc.tenant_id = cw.tenant_id
      AND UPPER(TRIM(kc.nama)) = UPPER(TRIM(cw.anggota_2))
    ORDER BY kc.created_at ASC, kc.id ASC
    LIMIT 1
)
WHERE cw.anggota_2_id IS NULL
  AND NULLIF(TRIM(COALESCE(cw.anggota_2, '')), '') IS NOT NULL
  AND (
      SELECT COUNT(*)
      FROM public.karyawan_cuci kc2
      WHERE kc2.tenant_id = cw.tenant_id
        AND UPPER(TRIM(kc2.nama)) = UPPER(TRIM(cw.anggota_2))
  ) = 1;

-- 2B. Backfill resep.stok_barang_id (Pass 1: UUID/SKU match; Pass 2: exact name match)
UPDATE public.resep r
SET stok_barang_id = (
    SELECT s.id
    FROM public.stok_barang s
    WHERE s.tenant_id = r.tenant_id
      AND (
          s.id::text = r.id_bahan_baku
          OR s.id_bahan_baku = r.id_bahan_baku
          OR s.id_barang = r.id_bahan_baku
      )
    ORDER BY s.updated_at DESC NULLS LAST, s.id ASC
    LIMIT 1
)
WHERE r.stok_barang_id IS NULL
  AND NULLIF(TRIM(COALESCE(r.id_bahan_baku, '')), '') IS NOT NULL;

UPDATE public.resep r
SET stok_barang_id = (
    SELECT s.id
    FROM public.stok_barang s
    WHERE s.tenant_id = r.tenant_id
      AND (
          LOWER(TRIM(COALESCE(s.nama_produk, ''))) = LOWER(TRIM(COALESCE(r.nama_bahan, r.nama_bahan_baku, '')))
          OR LOWER(TRIM(COALESCE(s.nama_barang, ''))) = LOWER(TRIM(COALESCE(r.nama_bahan, r.nama_bahan_baku, '')))
      )
    ORDER BY s.updated_at DESC NULLS LAST, s.id ASC
    LIMIT 1
)
WHERE r.stok_barang_id IS NULL
  AND NULLIF(TRIM(COALESCE(r.nama_bahan, r.nama_bahan_baku, '')), '') IS NOT NULL;

-- 2C. Backfill resep.menu_id from daftar_harga_menu (id_menu first, then menu name)
UPDATE public.resep r
SET menu_id = (
    SELECT m.id
    FROM public.daftar_harga_menu m
    WHERE m.tenant_id = r.tenant_id
      AND (
          (NULLIF(TRIM(COALESCE(r.id_menu, '')), '') IS NOT NULL AND m.id_menu = r.id_menu)
          OR LOWER(TRIM(COALESCE(m.daftar_menu, ''))) = LOWER(TRIM(COALESCE(r.nama_menu, r.daftar_menu, '')))
          OR LOWER(TRIM(COALESCE(m.nama_menu, ''))) = LOWER(TRIM(COALESCE(r.nama_menu, r.daftar_menu, '')))
      )
    ORDER BY (m.id_menu = r.id_menu) DESC NULLS LAST, m.updated_at DESC NULLS LAST, m.id ASC
    LIMIT 1
)
WHERE r.menu_id IS NULL;

-- 2D. Backfill resep.carwash_package_id (only when menu_id IS NULL)
UPDATE public.resep r
SET carwash_package_id = (
    SELECT cp.id
    FROM public.carwash_packages cp
    WHERE cp.tenant_id = r.tenant_id
      AND (
          LOWER(TRIM(COALESCE(cp.nama_paket, ''))) = LOWER(TRIM(COALESCE(r.nama_menu, r.daftar_menu, '')))
          OR LOWER(TRIM(COALESCE(cp.name, ''))) = LOWER(TRIM(COALESCE(r.nama_menu, r.daftar_menu, '')))
      )
    ORDER BY cp.sort_order ASC, cp.id ASC
    LIMIT 1
)
WHERE r.menu_id IS NULL
  AND r.carwash_package_id IS NULL;

-- 2E. Backfill karyawan_kantor.profile_id & kasir.profile_id
UPDATE public.karyawan_kantor kk
SET profile_id = (
    SELECT p.id
    FROM public.profiles p
    WHERE p.tenant_id = kk.tenant_id
      AND NULLIF(TRIM(COALESCE(kk.email, '')), '') IS NOT NULL
      AND LOWER(TRIM(p.email)) = LOWER(TRIM(kk.email))
    ORDER BY p.created_at ASC, p.id ASC
    LIMIT 1
)
WHERE kk.profile_id IS NULL
  AND NULLIF(TRIM(COALESCE(kk.email, '')), '') IS NOT NULL;

UPDATE public.karyawan_kantor kk
SET profile_id = (
    SELECT p.id
    FROM public.profiles p
    WHERE p.tenant_id = kk.tenant_id
      AND UPPER(TRIM(p.nama)) = UPPER(TRIM(kk.nama))
    LIMIT 1
)
WHERE kk.profile_id IS NULL
  AND (
      SELECT COUNT(*)
      FROM public.profiles p2
      WHERE p2.tenant_id = kk.tenant_id
        AND UPPER(TRIM(p2.nama)) = UPPER(TRIM(kk.nama))
  ) = 1;

UPDATE public.kasir k
SET profile_id = (
    SELECT p.id
    FROM public.profiles p
    WHERE p.tenant_id = k.tenant_id
      AND p.role = 'Kasir'
      AND UPPER(TRIM(p.nama)) = UPPER(TRIM(k.nama))
    LIMIT 1
)
WHERE k.profile_id IS NULL
  AND (
      SELECT COUNT(*)
      FROM public.profiles p2
      WHERE p2.tenant_id = k.tenant_id
        AND p2.role = 'Kasir'
        AND UPPER(TRIM(p2.nama)) = UPPER(TRIM(k.nama))
  ) = 1;

UPDATE public.kasir k
SET profile_id = (
    SELECT p.id
    FROM public.profiles p
    WHERE p.tenant_id = k.tenant_id
      AND UPPER(TRIM(p.nama)) = UPPER(TRIM(k.nama))
    LIMIT 1
)
WHERE k.profile_id IS NULL
  AND (
      SELECT COUNT(*)
      FROM public.profiles p2
      WHERE p2.tenant_id = k.tenant_id
        AND UPPER(TRIM(p2.nama)) = UPPER(TRIM(k.nama))
  ) = 1;


-- ----------------------------------------------------------------------------
-- 3. UPGRADE STOCK & MENU TRIGGERS (RELATIONAL ID FIRST + RENAME PROPAGATION)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_apply_barang_masuk_to_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_target_id UUID;
    v_old_stok NUMERIC;
    v_old_cost NUMERIC;
    v_unit_cost NUMERIC;
    v_new_stok NUMERIC;
    v_new_cost NUMERIC;
BEGIN
    IF NEW.id_bahan_baku IS NOT NULL THEN
        SELECT id INTO v_target_id
        FROM public.stok_barang
        WHERE id = NEW.id_bahan_baku
          AND (NEW.tenant_id IS NULL OR tenant_id = NEW.tenant_id);
    END IF;

    IF v_target_id IS NULL AND NEW.id_barang IS NOT NULL THEN
        SELECT id INTO v_target_id
        FROM public.stok_barang
        WHERE (NEW.tenant_id IS NULL OR tenant_id = NEW.tenant_id)
          AND (NEW.branch_id IS NULL OR branch_id = NEW.branch_id OR branch_id IS NULL)
          AND (id_barang = NEW.id_barang OR id_bahan_baku = NEW.id_barang)
        ORDER BY (branch_id = NEW.branch_id) DESC NULLS LAST, id
        LIMIT 1;
    END IF;

    IF v_target_id IS NOT NULL THEN
        SELECT COALESCE(stok, 0), COALESCE(harga_beli, harga_satuan, 0)
        INTO v_old_stok, v_old_cost
        FROM public.stok_barang
        WHERE id = v_target_id
        FOR UPDATE;

        v_unit_cost := COALESCE(
            NULLIF(NEW.harga_satuan, 0),
            NULLIF(NEW.harga_beli, 0),
            CASE
                WHEN COALESCE(NEW.jumlah_masuk, 0) > 0 AND COALESCE(NEW.total_biaya, 0) > 0
                THEN NEW.total_biaya / NEW.jumlah_masuk
                ELSE v_old_cost
            END
        );

        v_new_stok := GREATEST(0, v_old_stok) + COALESCE(NEW.jumlah_masuk, 0);
        IF v_new_stok > 0 AND COALESCE(NEW.jumlah_masuk, 0) > 0 AND COALESCE(v_unit_cost, 0) >= 0 THEN
            v_new_cost := ROUND(((GREATEST(0, v_old_stok) * v_old_cost) + (NEW.jumlah_masuk * v_unit_cost)) / v_new_stok, 4);
        ELSE
            v_new_cost := v_old_cost;
        END IF;

        UPDATE public.stok_barang
        SET stok = COALESCE(stok, 0) + NEW.jumlah_masuk,
            stok_akhir = COALESCE(stok_akhir, stok, 0) + NEW.jumlah_masuk,
            harga_beli = v_new_cost,
            harga_satuan = v_new_cost,
            updated_at = NOW()
        WHERE id = v_target_id
          AND (NEW.tenant_id IS NULL OR tenant_id = NEW.tenant_id);
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_prevent_delete_referenced_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.resep r
        WHERE r.tenant_id = OLD.tenant_id
          AND (
              r.stok_barang_id = OLD.id
              OR (
                  r.stok_barang_id IS NULL
                  AND (
                      LOWER(TRIM(COALESCE(r.nama_bahan, ''))) IN (
                          LOWER(TRIM(COALESCE(OLD.nama_produk, ''))),
                          LOWER(TRIM(COALESCE(OLD.nama_barang, '')))
                      )
                      OR LOWER(TRIM(COALESCE(r.nama_bahan_baku, ''))) IN (
                          LOWER(TRIM(COALESCE(OLD.nama_produk, ''))),
                          LOWER(TRIM(COALESCE(OLD.nama_barang, '')))
                      )
                  )
              )
          )
    ) THEN
        RAISE EXCEPTION 'FOREIGN_KEY_VIOLATION: Bahan "%" masih digunakan dalam resep menu aktif dan tidak dapat dihapus.',
            COALESCE(OLD.nama_produk, OLD.nama_barang, OLD.id::text)
            USING ERRCODE = '23503';
    END IF;

    RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_stok_barang_advanced()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Sync id identifiers
    IF NEW.id_barang IS NOT NULL AND NEW.id_bahan_baku IS NULL THEN
        NEW.id_bahan_baku := NEW.id_barang;
    ELSIF NEW.id_bahan_baku IS NOT NULL AND NEW.id_barang IS NULL THEN
        NEW.id_barang := NEW.id_bahan_baku;
    END IF;

    -- Sync names (bidirectional on rename)
    IF TG_OP = 'UPDATE' THEN
        IF NEW.nama_produk IS DISTINCT FROM OLD.nama_produk AND NEW.nama_barang IS NOT DISTINCT FROM OLD.nama_barang THEN
            NEW.nama_barang := NEW.nama_produk;
        ELSIF NEW.nama_barang IS DISTINCT FROM OLD.nama_barang AND NEW.nama_produk IS NOT DISTINCT FROM OLD.nama_produk THEN
            NEW.nama_produk := NEW.nama_barang;
        END IF;
    END IF;
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
        IF (NEW.stok IS DISTINCT FROM OLD.stok) AND (NEW.stok_akhir IS NOT DISTINCT FROM OLD.stok_akhir) THEN
            NEW.stok_akhir := NEW.stok;
        ELSIF (NEW.stok_akhir IS DISTINCT FROM OLD.stok_akhir) AND (NEW.stok IS NOT DISTINCT FROM OLD.stok) THEN
            NEW.stok := NEW.stok_akhir;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_daftar_harga_menu_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.daftar_menu IS DISTINCT FROM OLD.daftar_menu
           AND NEW.nama_menu IS NOT DISTINCT FROM OLD.nama_menu THEN
            NEW.nama_menu := NEW.daftar_menu;
            NEW.nama_item := NEW.daftar_menu;
            NEW.nama := NEW.daftar_menu;
        ELSIF NEW.nama_menu IS DISTINCT FROM OLD.nama_menu
           AND NEW.daftar_menu IS NOT DISTINCT FROM OLD.daftar_menu THEN
            NEW.daftar_menu := NEW.nama_menu;
            NEW.nama_item := NEW.nama_menu;
            NEW.nama := NEW.nama_menu;
        END IF;
    END IF;

    IF NEW.daftar_menu IS NULL THEN
        NEW.daftar_menu := COALESCE(NEW.nama_item, NEW.nama_menu, NEW.nama);
    END IF;
    IF NEW.nama_item IS NULL THEN
        NEW.nama_item := COALESCE(NEW.daftar_menu, NEW.nama_menu, NEW.nama);
    END IF;
    IF NEW.nama_menu IS NULL THEN
        NEW.nama_menu := COALESCE(NEW.daftar_menu, NEW.nama_item, NEW.nama);
    END IF;
    IF NEW.nama IS NULL THEN
        NEW.nama := COALESCE(NEW.daftar_menu, NEW.nama_item, NEW.nama_menu);
    END IF;

    IF NEW.id_menu IS NULL THEN
        NEW.id_menu := 'MNU-' || upper(substr(md5(random()::text), 1, 8));
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_propagate_menu_rename_to_resep()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_new_name TEXT;
    v_old_name TEXT;
BEGIN
    v_new_name := COALESCE(NEW.daftar_menu, NEW.nama_menu);
    v_old_name := COALESCE(OLD.daftar_menu, OLD.nama_menu);

    IF v_new_name IS DISTINCT FROM v_old_name AND v_new_name IS NOT NULL THEN
        UPDATE public.resep
        SET nama_menu = v_new_name,
            daftar_menu = v_new_name
        WHERE tenant_id = NEW.tenant_id
          AND menu_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propagate_menu_rename_to_resep ON public.daftar_harga_menu;
CREATE TRIGGER trg_propagate_menu_rename_to_resep
    AFTER UPDATE ON public.daftar_harga_menu
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_propagate_menu_rename_to_resep();

CREATE OR REPLACE FUNCTION public.fn_propagate_stock_rename_to_resep()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_new_name TEXT;
    v_old_name TEXT;
BEGIN
    v_new_name := COALESCE(NEW.nama_produk, NEW.nama_barang);
    v_old_name := COALESCE(OLD.nama_produk, OLD.nama_barang);

    IF v_new_name IS DISTINCT FROM v_old_name AND v_new_name IS NOT NULL THEN
        UPDATE public.resep
        SET nama_bahan = v_new_name,
            nama_bahan_baku = v_new_name
        WHERE tenant_id = NEW.tenant_id
          AND stok_barang_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propagate_stock_rename_to_resep ON public.stok_barang;
CREATE TRIGGER trg_propagate_stock_rename_to_resep
    AFTER UPDATE ON public.stok_barang
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_propagate_stock_rename_to_resep();

CREATE OR REPLACE FUNCTION public.fn_sync_resep_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_qty NUMERIC;
BEGIN
    NEW.nama_menu := COALESCE(NEW.nama_menu, NEW.daftar_menu, 'Menu');
    NEW.daftar_menu := COALESCE(NEW.daftar_menu, NEW.nama_menu);
    NEW.nama_bahan := COALESCE(NEW.nama_bahan, NEW.nama_bahan_baku, 'Bahan');
    NEW.nama_bahan_baku := COALESCE(NEW.nama_bahan_baku, NEW.nama_bahan);

    v_qty := COALESCE(NEW.jumlah_dibutuhkan, NEW.jumlah, NEW.jumlah_pemakaian, 0.00);
    NEW.jumlah := COALESCE(NEW.jumlah, v_qty);
    NEW.jumlah_pemakaian := COALESCE(NEW.jumlah_pemakaian, v_qty);
    NEW.jumlah_dibutuhkan := COALESCE(NEW.jumlah_dibutuhkan, v_qty);

    IF NEW.tenant_id IS NOT NULL THEN
        IF NEW.menu_id IS NULL AND NEW.carwash_package_id IS NULL THEN
            SELECT m.id INTO NEW.menu_id
            FROM public.daftar_harga_menu m
            WHERE m.tenant_id = NEW.tenant_id
              AND (
                  (NULLIF(TRIM(COALESCE(NEW.id_menu, '')), '') IS NOT NULL AND m.id_menu = NEW.id_menu)
                  OR LOWER(TRIM(COALESCE(m.daftar_menu, ''))) = LOWER(TRIM(NEW.nama_menu))
                  OR LOWER(TRIM(COALESCE(m.nama_menu, ''))) = LOWER(TRIM(NEW.nama_menu))
              )
            ORDER BY (m.id_menu = NEW.id_menu) DESC NULLS LAST, m.updated_at DESC NULLS LAST, m.id ASC
            LIMIT 1;
        END IF;

        IF NEW.menu_id IS NULL AND NEW.carwash_package_id IS NULL THEN
            SELECT cp.id INTO NEW.carwash_package_id
            FROM public.carwash_packages cp
            WHERE cp.tenant_id = NEW.tenant_id
              AND (
                  LOWER(TRIM(COALESCE(cp.nama_paket, ''))) = LOWER(TRIM(NEW.nama_menu))
                  OR LOWER(TRIM(COALESCE(cp.name, ''))) = LOWER(TRIM(NEW.nama_menu))
              )
            ORDER BY cp.sort_order ASC, cp.id ASC
            LIMIT 1;
        END IF;

        IF NEW.stok_barang_id IS NULL THEN
            IF NULLIF(TRIM(COALESCE(NEW.id_bahan_baku, '')), '') IS NOT NULL THEN
                SELECT s.id INTO NEW.stok_barang_id
                FROM public.stok_barang s
                WHERE s.tenant_id = NEW.tenant_id
                  AND (
                      s.id::text = NEW.id_bahan_baku
                      OR s.id_bahan_baku = NEW.id_bahan_baku
                      OR s.id_barang = NEW.id_bahan_baku
                  )
                ORDER BY s.updated_at DESC NULLS LAST, s.id ASC
                LIMIT 1;
            END IF;

            IF NEW.stok_barang_id IS NULL AND NULLIF(TRIM(COALESCE(NEW.nama_bahan, '')), '') IS NOT NULL THEN
                SELECT s.id INTO NEW.stok_barang_id
                FROM public.stok_barang s
                WHERE s.tenant_id = NEW.tenant_id
                  AND (
                      LOWER(TRIM(COALESCE(s.nama_produk, ''))) = LOWER(TRIM(NEW.nama_bahan))
                      OR LOWER(TRIM(COALESCE(s.nama_barang, ''))) = LOWER(TRIM(NEW.nama_bahan))
                  )
                ORDER BY s.updated_at DESC NULLS LAST, s.id ASC
                LIMIT 1;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;


-- ----------------------------------------------------------------------------
-- 4. UPGRADE fn_execute_checkout TO USE RELATIONAL UUIDs (WITH SAFE FALLBACKS)
-- ----------------------------------------------------------------------------

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
    v_nominal_cash NUMERIC(15, 2) := 0.00;
    v_nominal_qris NUMERIC(15, 2) := 0.00;
    v_nominal_transfer NUMERIC(15, 2) := 0.00;
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
    v_redeem_loyalty BOOLEAN := FALSE;
    v_cw_plat TEXT := '';
    v_redeem_res JSONB := NULL;

    v_existing_struk RECORD;
    v_item JSONB;
    v_nama_menu TEXT;
    v_qty_menu NUMERIC(15, 4);
    v_harga_menu NUMERIC(15, 2);
    v_menu_id UUID;
    v_resolved_menu_id UUID;
    v_stok_barang_id UUID;
    v_raw_uuid TEXT;
    v_menu_record RECORD;

    v_resep_record RECORD;
    v_stock_record RECORD;
    v_needed NUMERIC(15, 4);
    v_item_cogs NUMERIC(15, 2);

    v_cw_record RECORD;
    v_cw_paket TEXT;
    v_cw_ukuran TEXT;
    v_cw_variant TEXT;
    v_cw_harga NUMERIC(15, 2);
    v_base_cw_price NUMERIC(15, 2);
    v_catalog_cw_price NUMERIC(15, 2);
    v_anggota_1_name TEXT;
    v_anggota_2_name TEXT;
    v_anggota_1_id UUID;
    v_anggota_2_id UUID;

    v_current_hash TEXT;
    v_advisory_key BIGINT;

    v_journal_id UUID;
    v_coa_kas UUID;
    v_coa_bank UUID;
    v_coa_inv UUID;
    v_coa_rev_cw UUID;
    v_coa_rev_cafe UUID;
    v_coa_cogs UUID;
    v_coa_tax UUID;
    v_net_cw NUMERIC(15, 2) := 0.00;
    v_net_cafe NUMERIC(15, 2) := 0.00;
    v_pos TEXT;
BEGIN
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

    PERFORM public.fn_assert_active_tenant_license(p_tenant_id);

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

    v_id_struk := TRIM(COALESCE(p_struk_payload->>'id_struk', p_struk_payload->>'nomor_struk', p_struk_payload->>'no_struk', ''));
    IF v_id_struk = '' THEN
        v_id_struk := 'STRUK-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 4));
    END IF;

    v_advisory_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk), 1, 15))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_advisory_key);

    v_current_hash := md5(
        COALESCE(p_struk_payload::text, '') || '|' ||
        COALESCE(p_cafe_items::text, '') || '|' ||
        COALESCE(p_carwash_payload::text, '')
    );

    SELECT id, tenant_id, branch_id, id_struk, status_bayar, payload_hash, total_tagihan, nominal_bayar, uang_diterima, kembalian, total_cogs
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
                'total_cogs', COALESCE(v_existing_struk.total_cogs, 0.00),
                'was_replayed', TRUE,
                'message', 'Transaksi sudah berstatus selesai, mutasi tidak diulang.'
            );
        END IF;
    END IF;

    v_tanggal := COALESCE(NULLIF(p_struk_payload->>'tanggal', '')::date, CURRENT_DATE);
    v_jam := COALESCE(NULLIF(p_struk_payload->>'jam', '')::time, CURRENT_TIME);
    v_status_bayar := COALESCE(NULLIF(p_struk_payload->>'status_bayar', ''), 'Selesai');
    v_diskon := COALESCE(NULLIF(p_struk_payload->>'diskon', '')::numeric, 0.00);
    v_pajak := COALESCE(NULLIF(p_struk_payload->>'pajak', '')::numeric, 0.00);
    v_nominal_bayar := COALESCE(NULLIF(p_struk_payload->>'nominal_bayar', '')::numeric, 0.00);
    v_metode_bayar := UPPER(TRIM(COALESCE(NULLIF(p_struk_payload->>'metode_bayar', ''), 'CASH')));
    v_kasir := COALESCE(NULLIF(p_struk_payload->>'kasir', ''), 'Kasir');
    v_customer := COALESCE(NULLIF(p_struk_payload->>'nama_pelanggan', ''), 'Pelanggan Umum');
    v_catatan := COALESCE(p_struk_payload->>'catatan', '');
    v_redeem_loyalty := COALESCE((p_struk_payload->>'redeem_loyalty')::boolean, FALSE);

    IF v_diskon < 0.00 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh negatif.';
    END IF;

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

            v_raw_uuid := TRIM(COALESCE(v_item->>'menu_id', v_item->>'id_menu', ''));
            v_menu_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                              THEN v_raw_uuid::uuid ELSE NULL END;

            IF v_nama_menu = '' OR v_qty_menu <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Nama menu dan kuantitas wajib valid.';
            END IF;

            IF v_menu_id IS NOT NULL THEN
                SELECT harga INTO v_menu_record
                FROM public.daftar_harga_menu
                WHERE tenant_id = p_tenant_id AND id = v_menu_id
                LIMIT 1;
            END IF;

            IF v_menu_id IS NULL OR NOT FOUND THEN
                SELECT harga INTO v_menu_record
                FROM public.daftar_harga_menu
                WHERE tenant_id = p_tenant_id
                  AND (LOWER(TRIM(COALESCE(nama_menu, ''))) = LOWER(TRIM(v_nama_menu))
                       OR LOWER(TRIM(COALESCE(daftar_menu, ''))) = LOWER(TRIM(v_nama_menu)))
                ORDER BY updated_at DESC NULLS LAST
                LIMIT 1;
            END IF;

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

    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        v_cw_paket := TRIM(COALESCE(p_carwash_payload->>'paket', ''));
        v_cw_plat := TRIM(COALESCE(p_carwash_payload->>'plat', p_carwash_payload->>'plat_nomor', ''));
        v_cw_ukuran := COALESCE(NULLIF(TRIM(p_carwash_payload->>'ukuran'), ''), 'Medium');
        v_cw_variant := COALESCE(NULLIF(TRIM(p_carwash_payload->>'variant'), ''), 'Regular');
        v_cw_harga := COALESCE(
            NULLIF(p_carwash_payload->>'harga', '')::numeric,
            NULLIF(p_carwash_payload->>'tarif', '')::numeric,
            0.00
        );

        IF v_cw_paket <> '' THEN
            SELECT price, tarif, tarif_matrix INTO v_cw_record
            FROM public.carwash_packages
            WHERE tenant_id = p_tenant_id
              AND (LOWER(TRIM(COALESCE(nama_paket, ''))) = LOWER(TRIM(v_cw_paket))
                   OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM(v_cw_paket)))
            LIMIT 1;

            IF FOUND AND LOWER(v_cw_ukuran) <> 'custom' THEN
                v_base_cw_price := COALESCE(v_cw_record.tarif, v_cw_record.price);
                IF v_cw_record.tarif_matrix IS NOT NULL AND jsonb_typeof(v_cw_record.tarif_matrix) = 'object' THEN
                    v_catalog_cw_price := COALESCE(
                        NULLIF(v_cw_record.tarif_matrix->v_cw_ukuran->>v_cw_variant, '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->v_cw_ukuran->>'Regular', '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->'Large'->>v_cw_variant, '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->'Large'->>'Regular', '')::numeric,
                        v_base_cw_price
                    );
                ELSE
                    v_catalog_cw_price := v_base_cw_price;
                END IF;

                IF v_catalog_cw_price IS NOT NULL AND v_catalog_cw_price > 0.00
                   AND v_cw_harga <> v_catalog_cw_price
                   AND v_cw_harga <> COALESCE(v_base_cw_price, -1.00) THEN
                    RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga paket carwash "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                        v_cw_paket, v_catalog_cw_price, v_cw_harga;
                END IF;
            END IF;
        END IF;

        IF v_cw_harga < 0.00 THEN
            RAISE EXCEPTION 'INVALID_PRICE: Tarif carwash tidak boleh negatif.';
        END IF;

        v_total_carwash := v_cw_harga;
    END IF;

    IF v_redeem_loyalty THEN
        IF v_cw_plat = '' OR v_total_carwash <= 0 THEN
            RAISE EXCEPTION 'LOYALTY_REWARD_UNAVAILABLE: Klaim hadiah loyalty memerlukan transaksi layanan cuci kendaraan.';
        END IF;

        v_redeem_res := public.redeem_customer_reward(
            p_tenant_id,
            v_cw_plat,
            NULL,
            'Klaim hadiah loyalty saat checkout POS (' || v_id_struk || ')',
            v_customer,
            v_id_struk,
            v_id_struk
        );

        v_diskon := v_diskon + v_total_carwash;
    END IF;

    v_subtotal_kotor := v_total_cafe + v_total_carwash;
    v_total_tagihan := GREATEST(0.00, v_subtotal_kotor - v_diskon + v_pajak);

    v_is_cash := v_metode_bayar IN ('CASH', 'TUNAI', 'SPLIT');
    v_nominal_qris := CASE WHEN v_metode_bayar IN ('SPLIT', 'QRIS') THEN
        COALESCE(NULLIF(p_struk_payload->>'nominal_qris', '')::numeric, 0.00) ELSE 0.00 END;
    v_nominal_transfer := CASE WHEN v_metode_bayar IN ('SPLIT', 'TRANSFER') THEN
        COALESCE(NULLIF(p_struk_payload->>'nominal_transfer', '')::numeric, 0.00) ELSE 0.00 END;

    IF v_metode_bayar = 'QRIS' AND v_nominal_qris = 0.00 THEN
        v_nominal_qris := v_total_tagihan;
    ELSIF v_metode_bayar = 'TRANSFER' AND v_nominal_transfer = 0.00 THEN
        v_nominal_transfer := v_total_tagihan;
    END IF;

    v_non_cash := CASE WHEN v_metode_bayar = 'SPLIT' THEN (v_nominal_qris + v_nominal_transfer) ELSE 0.00 END;
    v_uang_diterima := COALESCE(
        NULLIF(p_struk_payload->>'uang_diterima', '')::numeric,
        CASE WHEN v_metode_bayar = 'SPLIT' THEN COALESCE(NULLIF(p_struk_payload->>'nominal_cash', '')::numeric, v_nominal_bayar - v_non_cash) ELSE v_nominal_bayar END
    );

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
        v_kembalian := CASE WHEN v_is_cash THEN v_tender_total - v_total_tagihan ELSE 0.00 END;

        IF v_metode_bayar = 'SPLIT' THEN
            v_nominal_cash := GREATEST(0.00, v_total_tagihan - v_non_cash);
        ELSIF v_is_cash THEN
            v_nominal_cash := v_total_tagihan;
        ELSE
            v_nominal_cash := 0.00;
        END IF;
    ELSE
        v_nominal_bayar := LEAST(v_tender_total, v_total_tagihan);
        v_kembalian := 0.00;
        v_nominal_cash := 0.00;
    END IF;

    INSERT INTO public.struk (
        id, tenant_id, branch_id, id_struk, tanggal, jam, kasir,
        nama_pelanggan, catatan, status_bayar, status_pembayaran,
        subtotal, diskon, diskon_cafe, diskon_carwash,
        pajak, nominal_bayar, bayar, uang_diterima, kembalian,
        nominal_cash, nominal_qris, nominal_transfer,
        metode_bayar, metode_pembayaran, total_tagihan, total, payload_hash,
        created_at, waktu_dibuat, updated_at
    ) VALUES (
        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam, v_kasir,
        v_customer, v_catatan, v_status_bayar, v_status_bayar,
        v_subtotal_kotor, v_diskon, v_diskon, 0.00,
        v_pajak, v_nominal_bayar, v_nominal_bayar, v_uang_diterima, v_kembalian,
        v_nominal_cash, v_nominal_qris, v_nominal_transfer,
        v_metode_bayar, v_metode_bayar, v_total_tagihan, v_total_tagihan, v_current_hash,
        NOW(), NOW(), NOW()
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET
        status_bayar = EXCLUDED.status_bayar,
        status_pembayaran = EXCLUDED.status_pembayaran,
        nominal_bayar = EXCLUDED.nominal_bayar,
        bayar = EXCLUDED.bayar,
        uang_diterima = EXCLUDED.uang_diterima,
        kembalian = EXCLUDED.kembalian,
        nominal_cash = EXCLUDED.nominal_cash,
        nominal_qris = EXCLUDED.nominal_qris,
        nominal_transfer = EXCLUDED.nominal_transfer,
        pajak = EXCLUDED.pajak,
        total_tagihan = EXCLUDED.total_tagihan,
        total = EXCLUDED.total,
        updated_at = NOW();

    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);

            v_raw_uuid := TRIM(COALESCE(v_item->>'menu_id', v_item->>'id_menu', ''));
            v_menu_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                              THEN v_raw_uuid::uuid ELSE NULL END;

            v_raw_uuid := TRIM(COALESCE(v_item->>'stok_barang_id', ''));
            v_stok_barang_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                     THEN v_raw_uuid::uuid ELSE NULL END;

            v_resolved_menu_id := v_menu_id;
            IF v_resolved_menu_id IS NULL AND v_stok_barang_id IS NULL THEN
                SELECT id INTO v_resolved_menu_id
                FROM public.daftar_harga_menu
                WHERE tenant_id = p_tenant_id
                  AND (LOWER(TRIM(COALESCE(nama_menu, ''))) = LOWER(TRIM(v_nama_menu))
                       OR LOWER(TRIM(COALESCE(daftar_menu, ''))) = LOWER(TRIM(v_nama_menu)))
                ORDER BY updated_at DESC NULLS LAST, id ASC
                LIMIT 1;
            END IF;

            FOR v_resep_record IN
                SELECT stok_barang_id, nama_bahan, COALESCE(jumlah_dibutuhkan, jumlah) AS jumlah_per_porsi, satuan
                FROM public.resep
                WHERE tenant_id = p_tenant_id
                  AND (
                      (v_resolved_menu_id IS NOT NULL AND menu_id = v_resolved_menu_id)
                      OR (menu_id IS NULL AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu)))
                  )
            LOOP
                v_needed := v_resep_record.jumlah_per_porsi * v_qty_menu;

                IF v_resep_record.stok_barang_id IS NOT NULL THEN
                    SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                    INTO v_stock_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND (
                          id = v_resep_record.stok_barang_id
                          OR (
                              branch_id = v_effective_branch_id
                              AND id_bahan_baku IS NOT NULL
                              AND id_bahan_baku = (
                                  SELECT s_ref.id_bahan_baku
                                  FROM public.stok_barang s_ref
                                  WHERE s_ref.id = v_resep_record.stok_barang_id
                                    AND s_ref.tenant_id = p_tenant_id
                                  LIMIT 1
                              )
                          )
                      )
                    ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST,
                             (id = v_resep_record.stok_barang_id) DESC
                    LIMIT 1
                    FOR UPDATE;
                ELSE
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
                END IF;

                IF FOUND THEN
                    IF v_stock_record.stok < v_needed THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_resep_record.nama_bahan, v_stock_record.stok, v_needed;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_needed,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_needed,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id AND tenant_id = p_tenant_id;

                    v_item_cogs := ROUND(v_needed * v_stock_record.unit_cost, 2);

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, id_struk,
                        nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, biaya_satuan, total_biaya,
                        tanggal, keterangan, alasan, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_stock_record.id::text, v_stock_record.id, v_id_struk,
                        v_resep_record.nama_bahan, v_resep_record.nama_bahan, v_resep_record.nama_bahan,
                        v_needed, v_stock_record.unit_cost, v_item_cogs,
                        v_tanggal, 'BOM Pemakaian POS Struk: ' || v_id_struk, 'POS_SALE', NOW()
                    );

                    v_total_cogs := v_total_cogs + v_item_cogs;
                END IF;
            END LOOP;

            IF NOT EXISTS (
                SELECT 1 FROM public.resep
                WHERE tenant_id = p_tenant_id
                  AND (
                      (v_resolved_menu_id IS NOT NULL AND menu_id = v_resolved_menu_id)
                      OR (menu_id IS NULL AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu)))
                  )
            ) THEN
                IF v_stok_barang_id IS NOT NULL THEN
                    SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                    INTO v_stock_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND id = v_stok_barang_id
                    LIMIT 1
                    FOR UPDATE;
                ELSE
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
                END IF;

                IF FOUND THEN
                    IF v_stock_record.stok < v_qty_menu THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_nama_menu, v_stock_record.stok, v_qty_menu;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_qty_menu,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_qty_menu,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id AND tenant_id = p_tenant_id;

                    v_item_cogs := ROUND(v_qty_menu * v_stock_record.unit_cost, 2);

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, id_struk,
                        nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, biaya_satuan, total_biaya,
                        tanggal, keterangan, alasan, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_stock_record.id::text, v_stock_record.id, v_id_struk,
                        v_nama_menu, v_nama_menu, v_nama_menu,
                        v_qty_menu, v_stock_record.unit_cost, v_item_cogs,
                        v_tanggal, 'Penjualan Langsung POS Struk: ' || v_id_struk, 'POS_SALE', NOW()
                    );

                    v_total_cogs := v_total_cogs + v_item_cogs;
                END IF;
            END IF;
        END LOOP;
    END IF;

    UPDATE public.struk
    SET total_cogs = v_total_cogs,
        cogs_status = CASE WHEN v_total_cogs > 0 THEN 'SNAPSHOT_RECORDED' ELSE 'ZERO_OR_SERVICE' END
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

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

    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        v_anggota_1_name := p_carwash_payload->>'anggota_1';
        v_anggota_2_name := p_carwash_payload->>'anggota_2';

        v_raw_uuid := TRIM(COALESCE(p_carwash_payload->>'anggota_1_id', ''));
        v_anggota_1_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                               THEN v_raw_uuid::uuid ELSE NULL END;

        v_raw_uuid := TRIM(COALESCE(p_carwash_payload->>'anggota_2_id', ''));
        v_anggota_2_id := CASE WHEN v_raw_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                               THEN v_raw_uuid::uuid ELSE NULL END;

        IF v_anggota_1_id IS NULL AND NULLIF(TRIM(COALESCE(v_anggota_1_name, '')), '') IS NOT NULL THEN
            SELECT id INTO v_anggota_1_id
            FROM public.karyawan_cuci
            WHERE tenant_id = p_tenant_id AND UPPER(TRIM(nama)) = UPPER(TRIM(v_anggota_1_name))
            ORDER BY created_at ASC, id ASC
            LIMIT 1;
        END IF;

        IF v_anggota_2_id IS NULL AND NULLIF(TRIM(COALESCE(v_anggota_2_name, '')), '') IS NOT NULL THEN
            SELECT id INTO v_anggota_2_id
            FROM public.karyawan_cuci
            WHERE tenant_id = p_tenant_id AND UPPER(TRIM(nama)) = UPPER(TRIM(v_anggota_2_name))
            ORDER BY created_at ASC, id ASC
            LIMIT 1;
        END IF;

        INSERT INTO public.carwash (
            id, tenant_id, branch_id, id_struk, tanggal, jam, plat, model, variant, ukuran,
            paket, harga, anggota_1, anggota_2, anggota_1_id, anggota_2_id, shift, status, gaji_anggota,
            no_telepon, keterangan, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam,
            COALESCE(p_carwash_payload->>'plat', '-'),
            COALESCE(p_carwash_payload->>'model', 'Mobil'),
            COALESCE(p_carwash_payload->>'variant', 'Regular'),
            COALESCE(p_carwash_payload->>'ukuran', 'Medium'),
            COALESCE(p_carwash_payload->>'paket', 'Cuci Biasa'),
            v_total_carwash,
            v_anggota_1_name,
            v_anggota_2_name,
            v_anggota_1_id,
            v_anggota_2_id,
            COALESCE(p_carwash_payload->>'shift', 'Pagi'),
            v_status_bayar,
            COALESCE((p_carwash_payload->>'gaji_anggota')::numeric, 0.00),
            p_carwash_payload->>'no_telepon',
            p_carwash_payload->>'catatan_kendaraan',
            NOW()
        );
    END IF;

    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
        IF v_metode_bayar = 'SPLIT' THEN
            IF v_nominal_cash > 0.00 THEN
                INSERT INTO public.cashflow (
                    id, tenant_id, branch_id, id_sumber, tanggal,
                    keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                    pos, apakah_stok, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-CASH-' || v_id_struk, v_tanggal,
                    'Penjualan Kasir POS (Tunai Split): ' || v_id_struk || ' (' || v_customer || ')',
                    'Pemasukan', 'Pendapatan Kasir', v_nominal_cash, 0.00,
                    'SALDO CASH', FALSE, NOW()
                );
            END IF;

            IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
                INSERT INTO public.cashflow (
                    id, tenant_id, branch_id, id_sumber, tanggal,
                    keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                    pos, apakah_stok, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-DIGITAL-' || v_id_struk, v_tanggal,
                    'Penjualan Kasir POS (Digital Split): ' || v_id_struk || ' (' || v_customer || ')',
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
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-' || v_id_struk, v_tanggal,
                'Penjualan Kasir POS: ' || v_id_struk || ' (' || v_customer || ')',
                'Pemasukan', 'Pendapatan Kasir', v_total_tagihan, 0.00,
                v_pos, FALSE, NOW()
            );
        END IF;
    END IF;

    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
        SELECT id INTO v_coa_kas FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;
        SELECT id INTO v_coa_bank FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1102' LIMIT 1;
        SELECT id INTO v_coa_inv FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1103' LIMIT 1;
        SELECT id INTO v_coa_rev_cw FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4101' LIMIT 1;
        SELECT id INTO v_coa_rev_cafe FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4102' LIMIT 1;
        SELECT id INTO v_coa_cogs FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '5101' LIMIT 1;
        SELECT id INTO v_coa_tax FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun IN ('2102', '2103', '2101') LIMIT 1;

        IF (v_nominal_cash > 0.00 OR (v_is_cash AND v_metode_bayar <> 'SPLIT')) AND v_coa_kas IS NULL THEN
            RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun kas (1101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
        END IF;
        IF ((v_nominal_qris + v_nominal_transfer) > 0.00 OR (NOT v_is_cash AND v_metode_bayar <> 'SPLIT')) AND v_coa_bank IS NULL THEN
            RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun bank (1102) belum dikonfigurasi pada bagan akun (COA) untuk pembayaran digital.' USING ERRCODE = '28000';
        END IF;

        IF (v_coa_rev_cw IS NOT NULL OR v_coa_rev_cafe IS NOT NULL) THEN
            v_journal_id := gen_random_uuid();

            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
            ) VALUES (
                v_journal_id, p_tenant_id, v_effective_branch_id, 'JE-POS-' || v_id_struk, v_tanggal,
                'Auto-journal Penjualan POS: ' || v_id_struk, v_total_tagihan, 'DRAFT', NOW()
            );

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
                    v_total_tagihan, 0.00, 'Penerimaan Tunai POS ' || v_id_struk, NOW()
                );
            ELSE
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
                    v_total_tagihan, 0.00, 'Penerimaan Digital POS ' || v_id_struk, NOW()
                );
            END IF;

            v_net_cw := CASE WHEN v_subtotal_kotor > 0 THEN ROUND((v_total_tagihan - v_pajak) * (v_total_carwash / v_subtotal_kotor), 2) ELSE 0.00 END;
            v_net_cafe := GREATEST(0.00, (v_total_tagihan - v_pajak) - v_net_cw);

            IF v_net_cw > 0.00 AND v_coa_rev_cw IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cw,
                    0.00, v_net_cw, 'Pendapatan Layanan Carwash ' || v_id_struk, NOW()
                );
            END IF;

            IF v_net_cafe > 0.00 AND v_coa_rev_cafe IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cafe,
                    0.00, v_net_cafe, 'Pendapatan Cafe ' || v_id_struk, NOW()
                );
            END IF;

            IF v_pajak > 0.00 THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, COALESCE(v_coa_tax, v_coa_rev_cafe, v_coa_rev_cw),
                    0.00, v_pajak, 'Pajak Penjualan POS ' || v_id_struk, NOW()
                );
            END IF;

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

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'COMPLETED',
        'id_struk', v_id_struk,
        'subtotal', v_subtotal_kotor,
        'diskon', v_diskon,
        'pajak', v_pajak,
        'total_tagihan', v_total_tagihan,
        'nominal_bayar', v_nominal_bayar,
        'uang_diterima', v_uang_diterima,
        'kembalian', v_kembalian,
        'total_cogs', v_total_cogs,
        'loyalty_redemption', v_redeem_res,
        'was_replayed', FALSE
    );
END;
$function$;


-- ----------------------------------------------------------------------------
-- 5. UPGRADE STAFF REGISTRATION & MANAGEMENT RPCs TO LINK BY profile_id
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_register_tenant_staff(
    p_email text,
    p_password text,
    p_nama text,
    p_role text DEFAULT 'Kasir'::text,
    p_tenant_id uuid DEFAULT NULL::uuid,
    p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_target_tenant_id UUID;
    v_target_branch_id UUID;
    v_tenant_slug TEXT;
    v_raw_input TEXT;
    v_username TEXT;
    v_clean_email TEXT;
    v_clean_nama TEXT;
    v_clean_role TEXT;
    v_new_user_id UUID;

    v_existing_prof RECORD;
    v_old_tenant RECORD;
    v_old_tx_count INT := 0;
    v_old_prof_count INT := 0;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi login tidak ditemukan. Silakan login kembali.'
            USING ERRCODE = '42501';
    END IF;

    v_caller_role := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();
    v_caller_branch := public.current_branch_id();

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Role "%" tidak memiliki izin untuk mendaftarkan akun staf baru.', COALESCE(v_caller_role, 'Unknown')
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Super Admin' THEN
        v_target_tenant_id := COALESCE(p_tenant_id, v_caller_tenant);
    ELSE
        IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT: Tidak dapat mendaftarkan staf ke tenant lain.'
                USING ERRCODE = '42501';
        END IF;
        v_target_tenant_id := v_caller_tenant;
    END IF;

    IF v_target_tenant_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_TENANT: Konteks tenant tidak ditemukan untuk akun Anda.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_role := BTRIM(COALESCE(p_role, 'Kasir'));
    IF v_clean_role NOT IN ('Kasir', 'Admin', 'Owner', 'Staff Kantor', 'Karyawan Cuci') THEN
        RAISE EXCEPTION 'INVALID_ROLE: Peran "%" tidak valid.', v_clean_role
            USING ERRCODE = '23514';
    END IF;

    IF v_caller_role = 'Admin' AND v_clean_role IN ('Owner', 'Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin hanya dapat mendaftarkan akun Kasir atau Staf operasional.'
            USING ERRCODE = '42501';
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT id INTO v_target_branch_id
        FROM public.branches
        WHERE id = p_branch_id AND tenant_id = v_target_tenant_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_target_branch_id IS NULL AND v_caller_branch IS NOT NULL THEN
        SELECT id INTO v_target_branch_id
        FROM public.branches
        WHERE id = v_caller_branch AND tenant_id = v_target_tenant_id AND is_active = TRUE
        LIMIT 1;
    END IF;

    IF v_target_branch_id IS NULL THEN
        SELECT id INTO v_target_branch_id
        FROM public.branches
        WHERE tenant_id = v_target_tenant_id AND is_active = TRUE
        ORDER BY (kode = 'MAIN') DESC, created_at ASC
        LIMIT 1;
    END IF;

    IF v_target_branch_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_BRANCH: Cabang aktif tidak ditemukan pada tenant ini.'
            USING ERRCODE = '23503';
    END IF;

    v_clean_nama := UPPER(BTRIM(COALESCE(p_nama, '')));
    IF v_clean_nama = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Nama lengkap staf wajib diisi.'
            USING ERRCODE = '23514';
    END IF;

    v_raw_input := LOWER(BTRIM(COALESCE(p_email, '')));
    IF v_raw_input = '' THEN
        RAISE EXCEPTION 'INVALID_INPUT: Username atau email wajib diisi.'
            USING ERRCODE = '23514';
    END IF;

    IF LENGTH(COALESCE(p_password, '')) < 6 THEN
        RAISE EXCEPTION 'INVALID_INPUT: Kata sandi minimal 6 karakter.'
            USING ERRCODE = '23514';
    END IF;

    SELECT slug INTO v_tenant_slug
    FROM public.tenants
    WHERE id = v_target_tenant_id
    LIMIT 1;

    v_tenant_slug := COALESCE(
        NULLIF(regexp_replace(LOWER(COALESCE(v_tenant_slug, '')), '[^a-z0-9-]', '', 'g'), ''),
        substr(replace(v_target_tenant_id::text, '-', ''), 1, 8)
    );

    IF POSITION('@' IN v_raw_input) = 0 OR v_raw_input LIKE '%@jb.local' THEN
        v_username := split_part(v_raw_input, '@', 1);
        v_username := regexp_replace(v_username, '[^a-z0-9._-]', '', 'g');
        IF v_username = '' THEN
            RAISE EXCEPTION 'INVALID_INPUT: Username tidak valid.'
                USING ERRCODE = '23514';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.tenant_id = v_target_tenant_id
              AND (
                  LOWER(p.email) = v_username || '@jb.local'
                  OR LOWER(p.email) = v_username || '.' || v_tenant_slug || '@pos.internal'
                  OR LOWER(split_part(split_part(p.email, '@', 1), '.', 1)) = v_username
              )
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_USER: Username "%" sudah digunakan oleh staf lain di toko Anda.', v_username
                USING ERRCODE = '23505';
        END IF;

        v_clean_email := v_username || '.' || v_tenant_slug || '@pos.internal';
    ELSE
        v_clean_email := v_raw_input;
        v_username := split_part(v_clean_email, '@', 1);
    END IF;

    SELECT id, tenant_id, branch_id, role
    INTO v_existing_prof
    FROM public.profiles
    WHERE LOWER(email) = v_clean_email
    LIMIT 1;

    IF v_existing_prof.id IS NOT NULL THEN
        IF v_clean_role = 'Owner'
           AND v_existing_prof.role <> 'Super Admin'
           AND v_existing_prof.tenant_id IS DISTINCT FROM v_target_tenant_id THEN

            SELECT id, plan INTO v_old_tenant
            FROM public.tenants
            WHERE id = v_existing_prof.tenant_id
            LIMIT 1;

            SELECT COUNT(*) INTO v_old_tx_count
            FROM public.struk
            WHERE tenant_id = v_existing_prof.tenant_id;

            SELECT COUNT(*) INTO v_old_prof_count
            FROM public.profiles
            WHERE tenant_id = v_existing_prof.tenant_id;

            IF LOWER(COALESCE(v_old_tenant.plan, '')) = 'trial'
               AND v_old_tx_count = 0
               AND v_old_prof_count <= 1 THEN

                UPDATE auth.users
                SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
                    'tenant_id', v_target_tenant_id::text,
                    'branch_id', v_target_branch_id::text,
                    'erp_role', 'Owner'
                ),
                updated_at = NOW()
                WHERE id = v_existing_prof.id;

                UPDATE public.profiles
                SET tenant_id = v_target_tenant_id,
                    branch_id = v_target_branch_id,
                    nama = v_clean_nama,
                    role = 'Owner',
                    is_active = TRUE,
                    updated_at = NOW()
                WHERE id = v_existing_prof.id;

                INSERT INTO public.karyawan_kantor (
                    tenant_id, branch_id, profile_id, nama, role, email, source, is_active, status, created_at
                ) VALUES (
                    v_target_tenant_id, v_target_branch_id, v_existing_prof.id, v_clean_nama, 'Owner', v_clean_email,
                    'staff_registration', TRUE, 'Aktif', NOW()
                ) ON CONFLICT DO NOTHING;

                DELETE FROM public.tenant_licenses WHERE tenant_id = v_existing_prof.tenant_id;
                DELETE FROM public.branches WHERE tenant_id = v_existing_prof.tenant_id;
                DELETE FROM public.tenants WHERE id = v_existing_prof.tenant_id;

                RETURN jsonb_build_object(
                    'success', TRUE,
                    'rebound', TRUE,
                    'user', jsonb_build_object(
                        'id', v_existing_prof.id,
                        'email', v_clean_email,
                        'nama', v_clean_nama,
                        'role', 'Owner',
                        'tenant_id', v_target_tenant_id,
                        'branch_id', v_target_branch_id
                    )
                );
            END IF;
        END IF;

        RAISE EXCEPTION 'DUPLICATE_USER: Username atau email "%" sudah terdaftar. Gunakan username lain.', v_username
            USING ERRCODE = '23505';
    END IF;

    IF EXISTS (SELECT 1 FROM auth.users WHERE LOWER(email) = v_clean_email) THEN
        RAISE EXCEPTION 'DUPLICATE_USER: Username atau email "%" sudah terdaftar. Gunakan username lain.', v_username
            USING ERRCODE = '23505';
    END IF;

    v_new_user_id := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        phone_change, phone_change_token, email_change_token_current,
        email_change_confirm_status, reauthentication_token, is_sso_user, is_anonymous
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_new_user_id, 'authenticated', 'authenticated',
        v_clean_email, extensions.crypt(p_password, extensions.gen_salt('bf')), NOW(),
        jsonb_build_object(
            'provider', 'email',
            'providers', jsonb_build_array('email'),
            'tenant_id', v_target_tenant_id::text,
            'branch_id', v_target_branch_id::text,
            'erp_role', v_clean_role
        ),
        jsonb_build_object(
            'sub', v_new_user_id::text,
            'nama', v_clean_nama,
            'username', v_username,
            'role', v_clean_role,
            'email', v_clean_email,
            'tenant_id', v_target_tenant_id::text,
            'branch_id', v_target_branch_id::text,
            'email_verified', true,
            'phone_verified', false
        ),
        NOW(), NOW(), '', '', '', '', '', '', '', 0, '', FALSE, FALSE
    );

    INSERT INTO auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_new_user_id::text, v_new_user_id,
        jsonb_build_object(
            'sub', v_new_user_id::text,
            'email', v_clean_email,
            'nama', v_clean_nama,
            'username', v_username,
            'role', v_clean_role,
            'tenant_id', v_target_tenant_id::text,
            'email_verified', true,
            'phone_verified', false
        ),
        'email', NOW(), NOW(), NOW()
    );

    INSERT INTO public.profiles (
        id, tenant_id, branch_id, nama, email, role, is_active, created_at, updated_at
    ) VALUES (
        v_new_user_id, v_target_tenant_id, v_target_branch_id, v_clean_nama, v_clean_email, v_clean_role, TRUE, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        is_active = TRUE,
        updated_at = NOW();

    IF v_clean_role = 'Kasir' THEN
        IF EXISTS (
            SELECT 1 FROM public.kasir
            WHERE tenant_id = v_target_tenant_id
              AND (profile_id = v_new_user_id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = v_clean_nama))
        ) THEN
            UPDATE public.kasir
            SET is_active = TRUE,
                profile_id = COALESCE(profile_id, v_new_user_id),
                branch_id = COALESCE(branch_id, v_target_branch_id)
            WHERE tenant_id = v_target_tenant_id
              AND (profile_id = v_new_user_id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = v_clean_nama));
        ELSE
            INSERT INTO public.kasir (tenant_id, branch_id, profile_id, nama, is_active, created_at)
            VALUES (v_target_tenant_id, v_target_branch_id, v_new_user_id, v_clean_nama, TRUE, NOW())
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'karyawan_kantor' AND c.relkind = 'r'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM public.karyawan_kantor
            WHERE tenant_id = v_target_tenant_id
              AND (profile_id = v_new_user_id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = v_clean_nama))
        ) THEN
            UPDATE public.karyawan_kantor
            SET role = v_clean_role,
                email = v_clean_email,
                profile_id = COALESCE(profile_id, v_new_user_id),
                is_active = TRUE,
                status = 'Aktif',
                branch_id = COALESCE(branch_id, v_target_branch_id)
            WHERE tenant_id = v_target_tenant_id
              AND (profile_id = v_new_user_id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = v_clean_nama));
        ELSE
            INSERT INTO public.karyawan_kantor (
                tenant_id, branch_id, profile_id, nama, role, email, source, is_active, status, created_at
            ) VALUES (
                v_target_tenant_id, v_target_branch_id, v_new_user_id, v_clean_nama, v_clean_role, v_clean_email,
                'staff_registration', TRUE, 'Aktif', NOW()
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'user', jsonb_build_object(
            'id', v_new_user_id,
            'email', v_clean_email,
            'username', v_username,
            'nama', v_clean_nama,
            'role', v_clean_role,
            'tenant_id', v_target_tenant_id,
            'branch_id', v_target_branch_id
        )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_manage_tenant_staff(
    p_staff_id uuid,
    p_action text,
    p_new_role text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_caller_tenant UUID;
    v_target RECORD;
    v_clean_action TEXT;
    v_clean_role TEXT;
BEGIN
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi login tidak ditemukan.'
            USING ERRCODE = '42501';
    END IF;

    v_caller_role := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Role "%" tidak memiliki izin untuk mengelola akun staf.', COALESCE(v_caller_role, 'Unknown')
            USING ERRCODE = '42501';
    END IF;

    SELECT id, tenant_id, branch_id, nama, email, role, is_active
    INTO v_target
    FROM public.profiles
    WHERE id = p_staff_id
    LIMIT 1;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Profil staf tidak ditemukan.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role <> 'Super Admin' AND v_target.tenant_id <> v_caller_tenant THEN
        RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT: Tidak dapat memodifikasi staf dari tenant lain.'
            USING ERRCODE = '42501';
    END IF;

    IF v_target.role IN ('Owner', 'Super Admin') AND v_caller_role <> 'Super Admin' THEN
        RAISE EXCEPTION 'FORBIDDEN_MUTATE_CO_OWNER: Akun dengan role "%" dilindungi dan tidak dapat diubah atau dinonaktifkan oleh sesama Owner/Admin.', v_target.role
            USING ERRCODE = '42501';
    END IF;

    IF v_caller_role = 'Admin' AND v_target.role = 'Admin' AND v_target.id <> v_caller_uid THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Admin tidak dapat memodifikasi akun Admin lain.'
            USING ERRCODE = '42501';
    END IF;

    v_clean_action := UPPER(BTRIM(COALESCE(p_action, '')));

    IF v_clean_action = 'UPDATE_ROLE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Owner yang dapat mengubah role akun staf.'
                USING ERRCODE = '42501';
        END IF;

        v_clean_role := BTRIM(COALESCE(p_new_role, ''));
        IF v_clean_role NOT IN ('Kasir', 'Admin', 'Staff Kantor', 'Karyawan Cuci', 'Owner') THEN
            RAISE EXCEPTION 'INVALID_ROLE: Peran baru "%" tidak valid.', v_clean_role
                USING ERRCODE = '23514';
        END IF;

        UPDATE public.profiles
        SET role = v_clean_role,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE auth.users
        SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('erp_role', v_clean_role),
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_clean_role),
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE public.karyawan_kantor
        SET role = v_clean_role,
            profile_id = COALESCE(profile_id, v_target.id)
        WHERE tenant_id = v_target.tenant_id
          AND (
              profile_id = v_target.id
              OR (
                  profile_id IS NULL
                  AND (
                      (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
                      OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
                  )
              )
          );

        IF v_clean_role = 'Kasir' AND v_target.is_active IS TRUE THEN
            IF EXISTS (
                SELECT 1 FROM public.kasir
                WHERE tenant_id = v_target.tenant_id
                  AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))))
            ) THEN
                UPDATE public.kasir
                SET is_active = TRUE,
                    profile_id = COALESCE(profile_id, v_target.id)
                WHERE tenant_id = v_target.tenant_id
                  AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))));
            ELSE
                INSERT INTO public.kasir (tenant_id, branch_id, profile_id, nama, is_active, created_at)
                VALUES (v_target.tenant_id, v_target.branch_id, v_target.id, UPPER(BTRIM(v_target.nama)), TRUE, NOW())
                ON CONFLICT DO NOTHING;
            END IF;
        ELSE
            UPDATE public.kasir
            SET is_active = FALSE,
                profile_id = COALESCE(profile_id, v_target.id)
            WHERE tenant_id = v_target.tenant_id
              AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))));
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'UPDATE_ROLE',
            'staff_id', v_target.id,
            'nama', v_target.nama,
            'new_role', v_clean_role,
            'is_active', v_target.is_active
        );

    ELSIF v_clean_action = 'DEACTIVATE' THEN
        UPDATE public.profiles
        SET is_active = FALSE,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE auth.users
        SET banned_until = '2099-12-31 23:59:59+00'::timestamptz,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE public.kasir
        SET is_active = FALSE,
            profile_id = COALESCE(profile_id, v_target.id)
        WHERE tenant_id = v_target.tenant_id
          AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))));

        UPDATE public.karyawan_kantor
        SET is_active = FALSE,
            status = 'Nonaktif',
            profile_id = COALESCE(profile_id, v_target.id)
        WHERE tenant_id = v_target.tenant_id
          AND (
              profile_id = v_target.id
              OR (
                  profile_id IS NULL
                  AND (
                      (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
                      OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
                  )
              )
          );

        RETURN jsonb_build_object(
            'success', true,
            'action', 'DEACTIVATE',
            'staff_id', v_target.id,
            'nama', v_target.nama,
            'role', v_target.role,
            'is_active', false
        );

    ELSIF v_clean_action = 'ACTIVATE' THEN
        UPDATE public.profiles
        SET is_active = TRUE,
            updated_at = NOW()
        WHERE id = v_target.id;

        UPDATE auth.users
        SET banned_until = NULL,
            updated_at = NOW()
        WHERE id = v_target.id;

        IF v_target.role = 'Kasir' THEN
            IF EXISTS (
                SELECT 1 FROM public.kasir
                WHERE tenant_id = v_target.tenant_id
                  AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))))
            ) THEN
                UPDATE public.kasir
                SET is_active = TRUE,
                    profile_id = COALESCE(profile_id, v_target.id)
                WHERE tenant_id = v_target.tenant_id
                  AND (profile_id = v_target.id OR (profile_id IS NULL AND UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))));
            ELSE
                INSERT INTO public.kasir (tenant_id, branch_id, profile_id, nama, is_active, created_at)
                VALUES (v_target.tenant_id, v_target.branch_id, v_target.id, UPPER(BTRIM(v_target.nama)), TRUE, NOW())
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;

        UPDATE public.karyawan_kantor
        SET is_active = TRUE,
            status = 'Aktif',
            profile_id = COALESCE(profile_id, v_target.id)
        WHERE tenant_id = v_target.tenant_id
          AND (
              profile_id = v_target.id
              OR (
                  profile_id IS NULL
                  AND (
                      (email IS NOT NULL AND LOWER(BTRIM(email)) = LOWER(BTRIM(v_target.email)))
                      OR UPPER(BTRIM(nama)) = UPPER(BTRIM(v_target.nama))
                  )
              )
          );

        RETURN jsonb_build_object(
            'success', true,
            'action', 'ACTIVATE',
            'staff_id', v_target.id,
            'nama', v_target.nama,
            'role', v_target.role,
            'is_active', true
        );
    ELSE
        RAISE EXCEPTION 'INVALID_ACTION: Aksi "%" tidak dikenali. Gunakan UPDATE_ROLE, DEACTIVATE, atau ACTIVATE.', v_clean_action
            USING ERRCODE = '23514';
    END IF;
END;
$function$;
