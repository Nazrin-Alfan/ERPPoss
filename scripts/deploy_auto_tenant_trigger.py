import asyncio, sys
sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SQL_DDL = """
-- 1. Fungsi penjamin tenant_id dan branch_id otomatis pada level Database
CREATE OR REPLACE FUNCTION public.fn_auto_set_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Jika tenant_id belum diisi oleh client, otomatis ambil dari profil user aktif
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := current_tenant_id();
    END IF;

    -- Jika branch_id belum diisi dan tenant_id diketahui, cari cabang default
    IF NEW.branch_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
        SELECT branch_id INTO NEW.branch_id 
        FROM public.profiles 
        WHERE id = auth.uid() 
          AND tenant_id = NEW.tenant_id 
        LIMIT 1;

        IF NEW.branch_id IS NULL THEN
            SELECT id INTO NEW.branch_id 
            FROM public.branches 
            WHERE tenant_id = NEW.tenant_id 
            ORDER BY created_at ASC 
            LIMIT 1;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Pasang trigger pada tabel pos_balances
DROP TRIGGER IF EXISTS trg_pos_balances_auto_tenant ON public.pos_balances;
CREATE TRIGGER trg_pos_balances_auto_tenant
BEFORE INSERT ON public.pos_balances
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_set_tenant_id();

-- 3. Pasang trigger pada master_categories
DROP TRIGGER IF EXISTS trg_master_categories_auto_tenant ON public.master_categories;
CREATE TRIGGER trg_master_categories_auto_tenant
BEFORE INSERT ON public.master_categories
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_set_tenant_id();

-- 4. Pasang trigger pada kasir
DROP TRIGGER IF EXISTS trg_kasir_auto_tenant ON public.kasir;
CREATE TRIGGER trg_kasir_auto_tenant
BEFORE INSERT ON public.kasir
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_set_tenant_id();

-- 5. Pasang trigger pada metode_bayar
DROP TRIGGER IF EXISTS trg_metode_bayar_auto_tenant ON public.metode_bayar;
CREATE TRIGGER trg_metode_bayar_auto_tenant
BEFORE INSERT ON public.metode_bayar
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_set_tenant_id();
"""

async def main():
    cfgs = _load_mcp_config()
    cfg = cfgs.get('supabase')
    env = _build_safe_env(cfg.get('env', {}))
    params = StdioServerParameters(command=cfg['command'], args=cfg['args'], env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            res = await session.call_tool('execute_sql', {'query': SQL_DDL})
            print("Response:", res.content[0].text if res.content else 'None')

if __name__ == '__main__':
    asyncio.run(main())
