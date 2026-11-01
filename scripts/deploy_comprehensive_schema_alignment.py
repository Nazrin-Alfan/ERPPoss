import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

MIGRATION_SQL = """
-- ==============================================================================
-- 1. STOK_BARANG COMPREHENSIVE FIELDS & SYNC
-- ==============================================================================
ALTER TABLE public.stok_barang
  ADD COLUMN IF NOT EXISTS id_bahan_baku VARCHAR(100),
  ADD COLUMN IF NOT EXISTS id_barang VARCHAR(100),
  ADD COLUMN IF NOT EXISTS stok_akhir NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS sub_kategori VARCHAR(100),
  ADD COLUMN IF NOT EXISTS keterangan TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS icon VARCHAR(100),
  ADD COLUMN IF NOT EXISTS emoji VARCHAR(20),
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

UPDATE public.stok_barang
SET id_bahan_baku = id::text, id_barang = id::text
WHERE id_bahan_baku IS NULL;

UPDATE public.stok_barang
SET stok_akhir = stok
WHERE (stok_akhir IS NULL OR stok_akhir = 0) AND stok IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_stok_barang_advanced()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

    -- Sync stock quantities
    IF NEW.stok IS NOT NULL AND (NEW.stok_akhir IS NULL OR NEW.stok_akhir = 0) THEN
        NEW.stok_akhir := NEW.stok;
    ELSIF NEW.stok_akhir IS NOT NULL AND (NEW.stok IS NULL OR NEW.stok = 0) THEN
        NEW.stok := NEW.stok_akhir;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stok_barang_sync ON public.stok_barang;
CREATE TRIGGER trg_stok_barang_sync
    BEFORE INSERT OR UPDATE ON public.stok_barang
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_stok_barang_advanced();

-- ==============================================================================
-- 2. BARANG_MASUK & BARANG_KELUAR
-- ==============================================================================
ALTER TABLE public.barang_masuk
  ADD COLUMN IF NOT EXISTS id_barang VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nama_barang VARCHAR(255),
  ADD COLUMN IF NOT EXISTS harga_satuan NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS total_harga NUMERIC(18, 4) DEFAULT 0.0000;

CREATE OR REPLACE FUNCTION public.fn_sync_barang_masuk()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id_barang IS NOT NULL AND NEW.id_bahan_baku IS NULL THEN
        NEW.id_bahan_baku := NEW.id_barang;
    ELSIF NEW.id_bahan_baku IS NOT NULL AND NEW.id_barang IS NULL THEN
        NEW.id_barang := NEW.id_bahan_baku;
    END IF;

    IF NEW.nama_barang IS NOT NULL AND NEW.nama_bahan_baku IS NULL THEN
        NEW.nama_bahan_baku := NEW.nama_barang;
    ELSIF NEW.nama_bahan_baku IS NOT NULL AND NEW.nama_barang IS NULL THEN
        NEW.nama_barang := NEW.nama_bahan_baku;
    END IF;

    IF NEW.harga_satuan IS NOT NULL AND (NEW.harga_beli IS NULL OR NEW.harga_beli = 0) THEN
        NEW.harga_beli := NEW.harga_satuan;
    ELSIF NEW.harga_beli IS NOT NULL AND (NEW.harga_satuan IS NULL OR NEW.harga_satuan = 0) THEN
        NEW.harga_satuan := NEW.harga_beli;
    END IF;

    IF NEW.total_harga IS NOT NULL AND (NEW.total_biaya IS NULL OR NEW.total_biaya = 0) THEN
        NEW.total_biaya := NEW.total_harga;
    ELSIF NEW.total_biaya IS NOT NULL AND (NEW.total_harga IS NULL OR NEW.total_harga = 0) THEN
        NEW.total_harga := NEW.total_biaya;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_barang_masuk_sync ON public.barang_masuk;
CREATE TRIGGER trg_barang_masuk_sync
    BEFORE INSERT OR UPDATE ON public.barang_masuk
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_barang_masuk();

ALTER TABLE public.barang_keluar
  ADD COLUMN IF NOT EXISTS id_barang VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nama_barang VARCHAR(255);

CREATE OR REPLACE FUNCTION public.fn_sync_barang_keluar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id_barang IS NOT NULL AND NEW.id_bahan_baku IS NULL THEN
        NEW.id_bahan_baku := NEW.id_barang;
    ELSIF NEW.id_bahan_baku IS NOT NULL AND NEW.id_barang IS NULL THEN
        NEW.id_barang := NEW.id_bahan_baku;
    END IF;

    IF NEW.nama_barang IS NOT NULL AND NEW.nama_bahan_baku IS NULL THEN
        NEW.nama_bahan_baku := NEW.nama_barang;
    ELSIF NEW.nama_bahan_baku IS NOT NULL AND NEW.nama_barang IS NULL THEN
        NEW.nama_barang := NEW.nama_bahan_baku;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_barang_keluar_sync ON public.barang_keluar;
CREATE TRIGGER trg_barang_keluar_sync
    BEFORE INSERT OR UPDATE ON public.barang_keluar
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_barang_keluar();

-- ==============================================================================
-- 3. CAFE COMPREHENSIVE FIELDS & SYNC
-- ==============================================================================
ALTER TABLE public.cafe
  ADD COLUMN IF NOT EXISTS diskon NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS id_detail VARCHAR(100),
  ADD COLUMN IF NOT EXISTS jumlah NUMERIC(18, 4) DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS kategori VARCHAR(100) DEFAULT 'Cafe',
  ADD COLUMN IF NOT EXISTS nama_item VARCHAR(255),
  ADD COLUMN IF NOT EXISTS total_harga NUMERIC(18, 4) DEFAULT 0.0000;

CREATE OR REPLACE FUNCTION public.fn_sync_cafe_advanced()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Sync nama
    IF NEW.nama_item IS NOT NULL AND NEW.nama_menu IS NULL THEN
        NEW.nama_menu := NEW.nama_item;
    ELSIF NEW.nama_menu IS NOT NULL AND NEW.nama_item IS NULL THEN
        NEW.nama_item := NEW.nama_menu;
    END IF;
    IF NEW.daftar_menu IS NOT NULL AND NEW.nama_menu IS NULL THEN
        NEW.nama_menu := NEW.daftar_menu;
    ELSIF NEW.nama_menu IS NOT NULL AND NEW.daftar_menu IS NULL THEN
        NEW.daftar_menu := NEW.nama_menu;
    END IF;

    -- Sync qty/jumlah
    IF NEW.jumlah IS NOT NULL AND (NEW.qty IS NULL OR NEW.qty = 0) THEN
        NEW.qty := NEW.jumlah;
    ELSIF NEW.qty IS NOT NULL AND (NEW.jumlah IS NULL OR NEW.jumlah = 0) THEN
        NEW.jumlah := NEW.qty;
    END IF;

    -- Sync harga
    IF NEW.harga IS NOT NULL AND (NEW.harga_satuan IS NULL OR NEW.harga_satuan = 0) THEN
        NEW.harga_satuan := NEW.harga;
    ELSIF NEW.harga_satuan IS NOT NULL AND (NEW.harga IS NULL OR NEW.harga = 0) THEN
        NEW.harga := NEW.harga_satuan;
    END IF;

    -- Sync total
    IF NEW.total_harga IS NOT NULL AND (NEW.subtotal IS NULL OR NEW.subtotal = 0) THEN
        NEW.subtotal := NEW.total_harga;
    ELSIF NEW.subtotal IS NOT NULL AND (NEW.total_harga IS NULL OR NEW.total_harga = 0) THEN
        NEW.total_harga := NEW.subtotal;
    END IF;
    IF NEW.total IS NOT NULL AND (NEW.subtotal IS NULL OR NEW.subtotal = 0) THEN
        NEW.subtotal := NEW.total;
    ELSIF NEW.subtotal IS NOT NULL AND (NEW.total IS NULL OR NEW.total = 0) THEN
        NEW.total := NEW.subtotal;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cafe_sync ON public.cafe;
CREATE TRIGGER trg_cafe_sync
    BEFORE INSERT OR UPDATE ON public.cafe
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cafe_advanced();

-- ==============================================================================
-- 4. CARWASH COMPREHENSIVE FIELDS & SYNC
-- ==============================================================================
ALTER TABLE public.carwash
  ADD COLUMN IF NOT EXISTS barang_berharga TEXT,
  ADD COLUMN IF NOT EXISTS catatan_kendaraan TEXT,
  ADD COLUMN IF NOT EXISTS diskon NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS id_transaksi VARCHAR(100),
  ADD COLUMN IF NOT EXISTS kondisi_bodi TEXT,
  ADD COLUMN IF NOT EXISTS layanan VARCHAR(100),
  ADD COLUMN IF NOT EXISTS metode VARCHAR(50) DEFAULT 'Cash',
  ADD COLUMN IF NOT EXISTS metode_bayar VARCHAR(50) DEFAULT 'Cash',
  ADD COLUMN IF NOT EXISTS plat_nomor VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status_pengerjaan VARCHAR(50) DEFAULT 'Menunggu';

CREATE OR REPLACE FUNCTION public.fn_sync_carwash_advanced()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Sync id_transaksi
    IF NEW.id_transaksi IS NOT NULL AND NEW.id_struk IS NULL THEN
        NEW.id_struk := NEW.id_transaksi;
    ELSIF NEW.id_struk IS NOT NULL AND NEW.id_transaksi IS NULL THEN
        NEW.id_transaksi := NEW.id_struk;
    END IF;

    -- Sync plat
    IF NEW.plat_nomor IS NOT NULL AND NEW.plat IS NULL THEN
        NEW.plat := NEW.plat_nomor;
    ELSIF NEW.plat IS NOT NULL AND NEW.plat_nomor IS NULL THEN
        NEW.plat_nomor := NEW.plat;
    END IF;

    -- Sync metode
    IF NEW.metode_bayar IS NOT NULL AND NEW.metode IS NULL THEN
        NEW.metode := NEW.metode_bayar;
    ELSIF NEW.metode IS NOT NULL AND NEW.metode_bayar IS NULL THEN
        NEW.metode_bayar := NEW.metode;
    END IF;

    -- Sync layanan / paket
    IF NEW.layanan IS NOT NULL AND NEW.paket IS NULL THEN
        NEW.paket := NEW.layanan;
    ELSIF NEW.paket IS NOT NULL AND NEW.layanan IS NULL THEN
        NEW.layanan := NEW.paket;
    END IF;

    -- Sync status
    IF NEW.status_pengerjaan IS NOT NULL AND NEW.status IS NULL THEN
        NEW.status := NEW.status_pengerjaan;
    ELSIF NEW.status IS NOT NULL AND NEW.status_pengerjaan IS NULL THEN
        NEW.status_pengerjaan := NEW.status;
    END IF;

    -- Sync wages
    IF NEW.gaji_pencuci IS NOT NULL AND (NEW.gaji_anggota IS NULL OR NEW.gaji_anggota = 0) THEN
        NEW.gaji_anggota := NEW.gaji_pencuci;
    ELSIF NEW.gaji_anggota IS NOT NULL AND (NEW.gaji_pencuci IS NULL OR NEW.gaji_pencuci = 0) THEN
        NEW.gaji_pencuci := NEW.gaji_anggota;
    END IF;

    -- Sync harga
    IF NEW.harga_cuci IS NOT NULL AND (NEW.harga IS NULL OR NEW.harga = 0) THEN
        NEW.harga := NEW.harga_cuci;
    ELSIF NEW.harga IS NOT NULL AND (NEW.harga_cuci IS NULL OR NEW.harga_cuci = 0) THEN
        NEW.harga_cuci := NEW.harga;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_carwash_sync ON public.carwash;
CREATE TRIGGER trg_carwash_sync
    BEFORE INSERT OR UPDATE ON public.carwash
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_carwash_advanced();

-- ==============================================================================
-- 5. CASHFLOW & PENGELUARAN
-- ==============================================================================
ALTER TABLE public.cashflow
  ADD COLUMN IF NOT EXISTS id_cashflow VARCHAR(100);

ALTER TABLE public.pengeluaran
  ADD COLUMN IF NOT EXISTS pos VARCHAR(100) DEFAULT 'Kasir';

-- ==============================================================================
-- 6. DAFTAR_HARGA_MENU & RESEP & DISKON
-- ==============================================================================
ALTER TABLE public.daftar_harga_menu
  ADD COLUMN IF NOT EXISTS id_menu VARCHAR(100);

ALTER TABLE public.resep
  ADD COLUMN IF NOT EXISTS id_resep VARCHAR(100),
  ADD COLUMN IF NOT EXISTS jumlah_dibutuhkan NUMERIC(18, 4) DEFAULT 1.0000;

UPDATE public.resep
SET jumlah_dibutuhkan = jumlah
WHERE (jumlah_dibutuhkan IS NULL OR jumlah_dibutuhkan = 0) AND jumlah IS NOT NULL;

ALTER TABLE public.diskon
  ADD COLUMN IF NOT EXISTS nama VARCHAR(255),
  ADD COLUMN IF NOT EXISTS tipe VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nominal NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS kategori VARCHAR(100) DEFAULT 'Umum';

CREATE OR REPLACE FUNCTION public.fn_sync_diskon()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.nama IS NOT NULL AND NEW.nama_diskon IS NULL THEN
        NEW.nama_diskon := NEW.nama;
    ELSIF NEW.nama_diskon IS NOT NULL AND NEW.nama IS NULL THEN
        NEW.nama := NEW.nama_diskon;
    END IF;

    IF NEW.tipe IS NOT NULL AND NEW.tipe_diskon IS NULL THEN
        NEW.tipe_diskon := NEW.tipe;
    ELSIF NEW.tipe_diskon IS NOT NULL AND NEW.tipe IS NULL THEN
        NEW.tipe := NEW.tipe_diskon;
    END IF;

    IF NEW.nominal IS NOT NULL AND (NEW.nilai_diskon IS NULL OR NEW.nilai_diskon = 0) THEN
        NEW.nilai_diskon := NEW.nominal;
    ELSIF NEW.nilai_diskon IS NOT NULL AND (NEW.nominal IS NULL OR NEW.nominal = 0) THEN
        NEW.nominal := NEW.nilai_diskon;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_diskon_sync ON public.diskon;
CREATE TRIGGER trg_diskon_sync
    BEFORE INSERT OR UPDATE ON public.diskon
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_diskon();

-- ==============================================================================
-- 7. KARYAWAN_KANTOR & STRUK & TENANT_LICENSES
-- ==============================================================================
ALTER TABLE public.karyawan_kantor
  ADD COLUMN IF NOT EXISTS source VARCHAR(100) DEFAULT 'manual';

ALTER TABLE public.struk
  ADD COLUMN IF NOT EXISTS no_meja VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "platNomor" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS plat_nomor VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tipe_pesanan VARCHAR(50) DEFAULT 'Dine In';

CREATE OR REPLACE FUNCTION public.fn_sync_struk()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."platNomor" IS NOT NULL AND NEW.plat_nomor IS NULL THEN
        NEW.plat_nomor := NEW."platNomor";
    ELSIF NEW.plat_nomor IS NOT NULL AND NEW."platNomor" IS NULL THEN
        NEW."platNomor" := NEW.plat_nomor;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_struk_sync ON public.struk;
CREATE TRIGGER trg_struk_sync
    BEFORE INSERT OR UPDATE ON public.struk
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_struk();

ALTER TABLE public.tenant_licenses
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS tier VARCHAR(100) DEFAULT 'starter';

UPDATE public.tenant_licenses
SET expires_at = valid_until
WHERE expires_at IS NULL AND valid_until IS NOT NULL;

UPDATE public.tenant_licenses
SET tier = plan
WHERE tier IS NULL AND plan IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_tenant_licenses()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.expires_at IS NOT NULL AND NEW.valid_until IS NULL THEN
        NEW.valid_until := NEW.expires_at;
    ELSIF NEW.valid_until IS NOT NULL AND NEW.expires_at IS NULL THEN
        NEW.expires_at := NEW.valid_until;
    END IF;

    IF NEW.tier IS NOT NULL AND NEW.plan IS NULL THEN
        NEW.plan := NEW.tier;
    ELSIF NEW.plan IS NOT NULL AND NEW.tier IS NULL THEN
        NEW.tier := NEW.plan;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_licenses_sync ON public.tenant_licenses;
CREATE TRIGGER trg_tenant_licenses_sync
    BEFORE INSERT OR UPDATE ON public.tenant_licenses
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_tenant_licenses();

-- ==============================================================================
-- 8. NOTIFY POSTGREST SCHEMA CACHE RELOAD
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
"""

async def run():
    print("Reading Hermes MCP configuration for Supabase...")
    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    if not supabase_cfg:
        print("Error: Supabase MCP server not found.")
        sys.exit(1)

    cmd = supabase_cfg.get('command', 'npx')
    args = supabase_cfg.get('args', [])
    safe_env = _build_safe_env(supabase_cfg.get('env', {}))
    safe_env['PATH'] = os.environ.get('PATH', '')
    safe_env['USERPROFILE'] = os.environ.get('USERPROFILE', '')
    safe_env['LOCALAPPDATA'] = os.environ.get('LOCALAPPDATA', '')

    params = StdioServerParameters(command=cmd, args=args, env=safe_env)
    
    print("Connecting to Supabase Cloud MCP...")
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            print("Executing Comprehensive Schema Alignment Migration SQL...")
            res = await session.call_tool("execute_sql", {"query": MIGRATION_SQL})
            print("Result:")
            print(res.content[0].text if res.content else "No content returned.")

if __name__ == '__main__':
    asyncio.run(run())
