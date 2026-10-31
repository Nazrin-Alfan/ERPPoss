import asyncio
import sys
from pathlib import Path
import os

sys.path.insert(0, 'C:/code/hermes-agent')
from tools.mcp_tool_config import _load_mcp_config, _build_safe_env
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

sql_script = """
CREATE OR REPLACE FUNCTION public.fn_founder_create_tenant(
    p_store_name TEXT,
    p_owner_name TEXT,
    p_owner_email TEXT,
    p_owner_password TEXT DEFAULT 'password123',
    p_telepon TEXT DEFAULT '-',
    p_alamat TEXT DEFAULT '-',
    p_business_type TEXT DEFAULT 'HYBRID',
    p_plan TEXT DEFAULT 'pro',
    p_license_months INT DEFAULT 12
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_role TEXT;
    v_user_id UUID;
    v_tenant_id UUID;
    v_branch_id UUID;
    v_license_id UUID;
    v_license_key TEXT;
    v_clean_slug TEXT;
    v_plan TEXT;
    v_result JSONB;
BEGIN
    -- 1. Verifikasi bahwa pemanggil adalah Super Admin
    v_caller_role := public.current_user_role();
    IF v_caller_role != 'Super Admin' THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Founder / Super Admin yang berwenang menerbitkan tenant baru (Role aktif Anda: %)', v_caller_role;
    END IF;

    -- 2. Normalisasi Plan
    v_plan := LOWER(COALESCE(p_plan, 'pro'));
    IF v_plan LIKE '%enterprise%' THEN
        v_plan := 'enterprise';
    ELSIF v_plan LIKE '%basic%' THEN
        v_plan := 'basic';
    ELSE
        v_plan := 'pro';
    END IF;

    -- 3. Generate Clean Unique Slug
    v_clean_slug := LOWER(REGEXP_REPLACE(p_store_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_clean_slug := TRIM(BOTH '-' FROM v_clean_slug);
    IF v_clean_slug = '' THEN
        v_clean_slug := 'store';
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        v_clean_slug := v_clean_slug || '-' || SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6);
    END IF;

    -- 4. Insert Tenant ke public.tenants
    v_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (
        id, nama, slug, plan, status, business_type, created_at, updated_at
    ) VALUES (
        v_tenant_id,
        TRIM(p_store_name),
        v_clean_slug,
        v_plan,
        'active',
        COALESCE(p_business_type, 'HYBRID'),
        NOW(),
        NOW()
    );

    -- 5. Insert Branch Utama ke public.branches
    v_branch_id := gen_random_uuid();
    INSERT INTO public.branches (
        id, tenant_id, nama, kode, alamat, telepon, is_active, created_at, updated_at
    ) VALUES (
        v_branch_id,
        v_tenant_id,
        'Cabang Utama (' || TRIM(p_store_name) || ')',
        'MAIN',
        COALESCE(p_alamat, '-'),
        COALESCE(p_telepon, '-'),
        TRUE,
        NOW(),
        NOW()
    );

    -- 6. Inisialisasi Master Data Default
    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    -- 7. Provision Akun Owner di auth.users & auth.identities
    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_owner_email));

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            LOWER(TRIM(p_owner_email)),
            extensions.crypt(COALESCE(p_owner_password, 'password123'), extensions.gen_salt('bf')),
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
                'sub', v_user_id::text,
                'nama', COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
                'role', 'Owner',
                'tenant_name', TRIM(p_store_name),
                'business_type', COALESCE(p_business_type, 'HYBRID'),
                'email_verified', true
            ),
            NOW(), NOW(), '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', LOWER(TRIM(p_owner_email))),
            'email',
            NOW(), NOW(), NOW()
        );
    END IF;

    -- 8. Insert or Update Profil Owner di public.profiles
    INSERT INTO public.profiles (
        id, tenant_id, branch_id, nama, email, role, is_active, created_at, updated_at
    ) VALUES (
        v_user_id,
        v_tenant_id,
        v_branch_id,
        COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
        LOWER(TRIM(p_owner_email)),
        'Owner',
        TRUE,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW();

    -- 9. Insert Tenant License di public.tenant_licenses
    v_license_id := gen_random_uuid();
    v_license_key := 'RLY-' || UPPER(SUBSTR(MD5(RANDOM()::text), 1, 4)) || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 5, 4)) || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 9, 4));

    INSERT INTO public.tenant_licenses (
        id, tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features, created_at, updated_at
    ) VALUES (
        v_license_id,
        v_tenant_id,
        v_license_key,
        v_plan,
        'active',
        NOW() + (COALESCE(p_license_months, 12) || ' months')::interval,
        5,
        15,
        '{"pos": true, "inventory": true, "finance": true, "reports": true}'::jsonb,
        NOW(),
        NOW()
    );

    -- 10. Return Hasil Lengkap
    v_result := jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id,
        'user_id', v_user_id,
        'nama', TRIM(p_store_name),
        'slug', v_clean_slug,
        'plan', v_plan,
        'status', 'active',
        'business_type', COALESCE(p_business_type, 'HYBRID'),
        'owner_name', COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
        'owner_email', LOWER(TRIM(p_owner_email)),
        'owner_password', COALESCE(p_owner_password, 'password123'),
        'license_key', v_license_key,
        'telepon', COALESCE(p_telepon, '-'),
        'alamat', COALESCE(p_alamat, '-')
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_founder_create_tenant TO authenticated, service_role, anon;
"""

async def run():
    cfgs = _load_mcp_config()
    cfg = cfgs.get('supabase')
    env = _build_safe_env(cfg.get('env', {}))
    server_params = StdioServerParameters(
        command=cfg['command'],
        args=cfg.get('args', []),
        env=env
    )
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            res = await session.call_tool('execute_sql', {'query': sql_script})
            print("Response:", res.content[0].text if res.content else 'None')

if __name__ == '__main__':
    asyncio.run(run())
