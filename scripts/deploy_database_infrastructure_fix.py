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
-- 1. STOK_BARANG ENHANCEMENTS & SYNC
-- ==============================================================================
ALTER TABLE public.stok_barang
  ADD COLUMN IF NOT EXISTS nama_barang VARCHAR(255),
  ADD COLUMN IF NOT EXISTS kategori VARCHAR(100) DEFAULT 'Umum',
  ADD COLUMN IF NOT EXISTS gudang VARCHAR(50) DEFAULT 'CAFE',
  ADD COLUMN IF NOT EXISTS harga_beli NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS harga_jual NUMERIC(18, 4) DEFAULT 0.0000;

UPDATE public.stok_barang 
SET nama_barang = nama_produk 
WHERE nama_barang IS NULL AND nama_produk IS NOT NULL;

UPDATE public.stok_barang 
SET harga_beli = harga_satuan 
WHERE harga_beli IS NULL OR harga_beli = 0;

CREATE OR REPLACE FUNCTION public.fn_sync_stok_barang()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.nama_barang IS NOT NULL AND NEW.nama_produk IS NULL THEN
        NEW.nama_produk := NEW.nama_barang;
    ELSIF NEW.nama_produk IS NOT NULL AND NEW.nama_barang IS NULL THEN
        NEW.nama_barang := NEW.nama_produk;
    END IF;

    IF NEW.harga_beli IS NOT NULL AND (NEW.harga_satuan IS NULL OR NEW.harga_satuan = 0) THEN
        NEW.harga_satuan := NEW.harga_beli;
    ELSIF NEW.harga_satuan IS NOT NULL AND (NEW.harga_beli IS NULL OR NEW.harga_beli = 0) THEN
        NEW.harga_beli := NEW.harga_satuan;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stok_barang_sync ON public.stok_barang;
CREATE TRIGGER trg_stok_barang_sync
    BEFORE INSERT OR UPDATE ON public.stok_barang
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_stok_barang();

-- ==============================================================================
-- 2. CAFE ENHANCEMENTS & SYNC
-- ==============================================================================
ALTER TABLE public.cafe
  ADD COLUMN IF NOT EXISTS daftar_menu VARCHAR(255),
  ADD COLUMN IF NOT EXISTS harga NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS total NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS catatan TEXT;

UPDATE public.cafe
SET daftar_menu = nama_menu
WHERE daftar_menu IS NULL AND nama_menu IS NOT NULL;

UPDATE public.cafe
SET harga = harga_satuan
WHERE (harga IS NULL OR harga = 0) AND harga_satuan IS NOT NULL;

UPDATE public.cafe
SET total = subtotal
WHERE (total IS NULL OR total = 0) AND subtotal IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_cafe()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.daftar_menu IS NOT NULL AND NEW.nama_menu IS NULL THEN
        NEW.nama_menu := NEW.daftar_menu;
    ELSIF NEW.nama_menu IS NOT NULL AND NEW.daftar_menu IS NULL THEN
        NEW.daftar_menu := NEW.nama_menu;
    END IF;

    IF NEW.harga IS NOT NULL AND (NEW.harga_satuan IS NULL OR NEW.harga_satuan = 0) THEN
        NEW.harga_satuan := NEW.harga;
    ELSIF NEW.harga_satuan IS NOT NULL AND (NEW.harga = 0 OR NEW.harga IS NULL) THEN
        NEW.harga := NEW.harga_satuan;
    END IF;

    IF NEW.total IS NOT NULL AND (NEW.subtotal IS NULL OR NEW.subtotal = 0) THEN
        NEW.subtotal := NEW.total;
    ELSIF NEW.subtotal IS NOT NULL AND (NEW.total = 0 OR NEW.total IS NULL) THEN
        NEW.total := NEW.subtotal;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cafe_sync ON public.cafe;
CREATE TRIGGER trg_cafe_sync
    BEFORE INSERT OR UPDATE ON public.cafe
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cafe();

-- ==============================================================================
-- 3. CARWASH ENHANCEMENTS & SYNC
-- ==============================================================================
ALTER TABLE public.carwash
  ADD COLUMN IF NOT EXISTS gaji_pencuci NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS harga_cuci NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS harga_paket NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS harga_custom NUMERIC(18, 4) DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS kehadiran VARCHAR(50) DEFAULT 'Hadir';

UPDATE public.carwash
SET gaji_pencuci = gaji_anggota
WHERE (gaji_pencuci IS NULL OR gaji_pencuci = 0) AND gaji_anggota IS NOT NULL;

UPDATE public.carwash
SET harga_cuci = harga
WHERE (harga_cuci IS NULL OR harga_cuci = 0) AND harga IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_carwash()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.gaji_pencuci IS NOT NULL AND (NEW.gaji_anggota IS NULL OR NEW.gaji_anggota = 0) THEN
        NEW.gaji_anggota := NEW.gaji_pencuci;
    ELSIF NEW.gaji_anggota IS NOT NULL AND (NEW.gaji_pencuci IS NULL OR NEW.gaji_pencuci = 0) THEN
        NEW.gaji_pencuci := NEW.gaji_anggota;
    END IF;

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
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_carwash();

-- ==============================================================================
-- 4. FOREIGN KEY RELATIONS (CAFE ⇄ STRUK & CARWASH ⇄ STRUK)
-- ==============================================================================
-- Clean up any orphan rows before enforcing foreign keys
DELETE FROM public.cafe c
WHERE NOT EXISTS (
    SELECT 1 FROM public.struk s 
    WHERE s.tenant_id = c.tenant_id AND s.id_struk = c.id_struk
);

UPDATE public.carwash cw
SET id_struk = NULL
WHERE cw.id_struk IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.struk s 
    WHERE s.tenant_id = cw.tenant_id AND s.id_struk = cw.id_struk
);

ALTER TABLE public.cafe
  DROP CONSTRAINT IF EXISTS fk_cafe_struk;

ALTER TABLE public.cafe
  ADD CONSTRAINT fk_cafe_struk
  FOREIGN KEY (tenant_id, id_struk)
  REFERENCES public.struk(tenant_id, id_struk)
  ON DELETE CASCADE;

ALTER TABLE public.carwash
  DROP CONSTRAINT IF EXISTS fk_carwash_struk;

ALTER TABLE public.carwash
  ADD CONSTRAINT fk_carwash_struk
  FOREIGN KEY (tenant_id, id_struk)
  REFERENCES public.struk(tenant_id, id_struk)
  ON DELETE SET NULL;

-- ==============================================================================
-- 5. UNIVERSAL AUTO-TENANT & AUTO-BRANCH TRIGGER (ENTERPRISE MULTI-TENANCY)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_auto_populate_tenant_and_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_tenant_id UUID;
    v_user_branch_id UUID;
BEGIN
    -- 1. Populate tenant_id if missing or null
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := public.current_tenant_id();
    END IF;

    IF NEW.tenant_id IS NULL THEN
        SELECT tenant_id INTO v_user_tenant_id 
        FROM public.profiles 
        WHERE id = auth.uid() 
        LIMIT 1;
        NEW.tenant_id := v_user_tenant_id;
    END IF;

    -- If still null, fallback to the first active tenant to guarantee no hard failure
    IF NEW.tenant_id IS NULL THEN
        SELECT id INTO v_user_tenant_id 
        FROM public.tenants 
        WHERE status = 'active' 
        ORDER BY created_at ASC 
        LIMIT 1;
        NEW.tenant_id := v_user_tenant_id;
    END IF;

    -- 2. Populate branch_id if table has branch_id column and it is null
    BEGIN
        IF NEW.branch_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
            NEW.branch_id := public.current_branch_id();
            IF NEW.branch_id IS NULL THEN
                SELECT id INTO v_user_branch_id 
                FROM public.branches 
                WHERE tenant_id = NEW.tenant_id AND is_active = true 
                ORDER BY created_at ASC 
                LIMIT 1;
                NEW.branch_id := v_user_branch_id;
            END IF;
        END IF;
    EXCEPTION WHEN undefined_column THEN
        -- Column branch_id does not exist on this table, ignore
        NULL;
    END;

    RETURN NEW;
END;
$$;

-- Apply to all tenant base tables
DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY[
        'pos_balances',
        'master_categories',
        'kasir',
        'metode_bayar',
        'stok_barang',
        'pengeluaran',
        'cashflow',
        'struk',
        'cafe',
        'carwash',
        'karyawan_cuci',
        'karyawan_kantor',
        'daftar_harga_menu',
        'resep',
        'barang_masuk',
        'barang_keluar',
        'diskon',
        'crm_customers',
        'crm_loyalty_programs',
        'crm_loyalty_logs',
        'customer_reward_claims',
        'carwash_packages',
        'journal_entries',
        'chart_of_accounts'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_auto_tenant_and_branch ON public.%I;', tbl);
        EXECUTE format('
            CREATE TRIGGER trg_auto_tenant_and_branch
            BEFORE INSERT ON public.%I
            FOR EACH ROW
            EXECUTE FUNCTION public.fn_auto_populate_tenant_and_branch();
        ', tbl);
    END LOOP;
END $$;

-- ==============================================================================
-- 6. RELOAD POSTGREST SCHEMA CACHE
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
"""

async def run():
    print("Reading Hermes MCP configuration for Supabase...")
    cfg = _load_mcp_config()
    supabase_cfg = cfg.get('supabase')
    if not supabase_cfg:
        print("Error: Supabase MCP server not found in configuration.")
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
            print("Executing Database Infrastructure Migration SQL...")
            res = await session.call_tool("execute_sql", {"query": MIGRATION_SQL})
            print("Result:")
            print(res.content[0].text if res.content else "No content returned.")

if __name__ == '__main__':
    asyncio.run(run())
