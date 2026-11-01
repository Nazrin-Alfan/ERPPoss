import asyncio
import sys
sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SQL_DDL = """
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role TEXT;
    v_tenant_id UUID;
    v_branch_id UUID;
    v_nama_toko TEXT;
    v_business_type TEXT;
    v_nama_user TEXT;
    v_slug TEXT;
    v_trial_key TEXT;
BEGIN
    v_user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'Owner');
    v_nama_toko := COALESCE(NEW.raw_user_meta_data->>'tenant_name', NEW.raw_user_meta_data->>'nama_toko', 'Toko Baru');
    v_business_type := UPPER(COALESCE(NEW.raw_user_meta_data->>'business_type', 'HYBRID'));
    v_nama_user := COALESCE(NEW.raw_user_meta_data->>'nama', split_part(NEW.email, '@', 1));
    v_slug := lower(regexp_replace(v_nama_toko, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
    v_trial_key := 'RLPOS-TRL-' || upper(substr(md5(random()::text), 1, 8));

    IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
        -- Kasir / staf diundang ke tenant yang sudah ada
        v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::UUID;
        SELECT id INTO v_branch_id FROM public.branches WHERE tenant_id = v_tenant_id LIMIT 1;
    ELSE
        -- Owner mendaftar toko baru -> Otomatis Trial 14 Hari
        INSERT INTO public.tenants (nama, slug, plan, status, business_type)
        VALUES (v_nama_toko, v_slug, 'trial', 'active', v_business_type)
        RETURNING id INTO v_tenant_id;

        INSERT INTO public.branches (tenant_id, nama, kode, alamat, is_active)
        VALUES (v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE)
        RETURNING id INTO v_branch_id;

        PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

        -- Buat lisensi uji coba 14 hari
        INSERT INTO public.tenant_licenses (
            tenant_id,
            license_key,
            plan,
            status,
            valid_until,
            max_branches,
            max_users,
            features
        )
        VALUES (
            v_tenant_id,
            v_trial_key,
            'trial',
            'ACTIVE',
            NOW() + INTERVAL '14 days',
            1,
            3,
            jsonb_build_object('trial', true, 'trial_days', 14, 'auto_generated', true)
        );
    END IF;

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES (NEW.id, v_tenant_id, v_branch_id, v_nama_user, NEW.email, v_user_role, TRUE)
    ON CONFLICT (id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = EXCLUDED.role,
        is_active = TRUE;

    RETURN NEW;
END;
$$;
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
