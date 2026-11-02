-- ==============================================================================
-- BATCH 1: P0 CRITICAL SECURITY & DATABASE RLS LOCKDOWN
-- Fixes: K01 (Role Escalation), K02 (View RLS Bypass), K03 (Registration Injection), K04 (Insecure RPCs)
-- ==============================================================================

BEGIN;

-- 1. FIX HELPER FUNCTIONS (K01)
-- Do NOT check CURRENT_USER in SECURITY DEFINER (avoids postgres owner escalation).
-- Safely resolve tenant, branch, and role strictly from authenticated session (auth.uid()).
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT tenant_id 
    FROM public.profiles 
    WHERE id = auth.uid() AND is_active = TRUE
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT branch_id 
    FROM public.profiles 
    WHERE id = auth.uid() AND is_active = TRUE
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS character varying
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1),
        'Anon'::character varying
    );
$$;

REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role, anon;

REVOKE ALL ON FUNCTION public.current_branch_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_branch_id() TO authenticated, service_role, anon;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role, anon;


-- 2. HARDEN VIEWS WITH SECURITY INVOKER (K02)
-- Enforce underlying table RLS for views so caller permissions are respected.
ALTER VIEW public.akun_keuangan SET (security_invoker = true);
ALTER VIEW public.bahan_baku SET (security_invoker = true);
ALTER VIEW public.transaksi SET (security_invoker = true);
ALTER VIEW public.finance_summary SET (security_invoker = true);

-- Revoke all direct view access from anon
REVOKE ALL ON public.akun_keuangan FROM PUBLIC, anon;
REVOKE ALL ON public.bahan_baku FROM PUBLIC, anon;
REVOKE ALL ON public.transaksi FROM PUBLIC, anon;
REVOKE ALL ON public.finance_summary FROM PUBLIC, anon;

GRANT SELECT ON public.akun_keuangan TO authenticated, service_role;
GRANT SELECT ON public.bahan_baku TO authenticated, service_role;
GRANT SELECT ON public.transaksi TO authenticated, service_role;
GRANT SELECT ON public.finance_summary TO authenticated, service_role;


-- 3. REVOKE BROAD PRIVILEGES FROM ANON ON ALL 30 ERP TABLES (K01, K02)
DO $$
DECLARE
    tbl TEXT;
    all_tables TEXT[] := ARRAY[
        'tenants', 'branches', 'profiles', 'tenant_licenses',
        'pos_balances', 'chart_of_accounts', 'master_categories', 'journal_entries',
        'journal_entry_lines', 'stok_barang', 'daftar_harga_menu', 'resep',
        'carwash_packages', 'diskon', 'kasir', 'metode_bayar', 'struk', 'carwash', 'cafe',
        'barang_keluar', 'barang_masuk', 'cashflow', 'pengeluaran',
        'karyawan_cuci', 'karyawan_kantor', 'crm_customers', 'crm_loyalty_programs',
        'crm_loyalty_logs', 'customer_reward_claims', 'intelligence_daily_snapshots'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_tables
    LOOP
        -- Cabut seluruh izin mutasi dan akses anon
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC;', tbl);
        -- Berikan izin akses yang benar hanya untuk authenticated dan service_role
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role;', tbl);
    END LOOP;
END $$;


-- 4. HARDEN USER REGISTRATION & PROVISIONING TRIGGER (K03)
-- Drop duplicate / old triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_tenant_name TEXT;
    v_name TEXT;
    v_business_type TEXT;
    v_clean_slug TEXT;
    v_trial_key TEXT;
BEGIN
    -- Jalur 1: Undangan staf terverifikasi dari backend terpercaya (hanya via raw_app_meta_data)
    -- Browser client signUp options.data masuk ke raw_user_meta_data dan TIDAK BISA masuk ke sini.
    IF NULLIF(NEW.raw_app_meta_data->>'tenant_id', '') IS NOT NULL THEN
        v_tenant_id := (NEW.raw_app_meta_data->>'tenant_id')::UUID;
        v_branch_id := NULLIF(NEW.raw_app_meta_data->>'branch_id', '')::UUID;

        -- Role undangan tidak boleh Super Admin
        IF COALESCE(NEW.raw_app_meta_data->>'erp_role', '') NOT IN ('Owner', 'Admin', 'Kasir') THEN
            RAISE EXCEPTION 'Peran staf tidak valid';
        END IF;

        IF v_branch_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.branches WHERE id = v_branch_id AND tenant_id = v_tenant_id
        ) THEN
            RAISE EXCEPTION 'Cabang undangan tidak valid atau tidak terdaftar di tenant ini';
        END IF;

        v_name := COALESCE(
            NULLIF(btrim(NEW.raw_user_meta_data->>'nama'), ''),
            NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
            split_part(NEW.email, '@', 1)
        );

        INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
        VALUES (NEW.id, v_tenant_id, v_branch_id, v_name, NEW.email, NEW.raw_app_meta_data->>'erp_role', TRUE)
        ON CONFLICT (id) DO UPDATE SET
            tenant_id = EXCLUDED.tenant_id,
            branch_id = EXCLUDED.branch_id,
            nama = EXCLUDED.nama,
            role = EXCLUDED.role,
            is_active = TRUE,
            updated_at = NOW();

        RETURN NEW;
    END IF;

    -- Jalur 2: Registrasi mandiri publik (Owner Baru)
    -- Role dan tenant_id dari raw_user_meta_data 100% DIABAIKAN.
    v_tenant_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'tenant_name'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama_toko'), '')
    );

    v_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
        split_part(NEW.email, '@', 1)
    );

    IF v_tenant_name IS NULL THEN
        IF NEW.raw_app_meta_data->>'provider' = 'google' THEN
            v_tenant_name := v_name || '''s Store';
        ELSE
            v_tenant_name := 'Toko ' || v_name;
        END IF;
    END IF;

    v_business_type := UPPER(COALESCE(NEW.raw_user_meta_data->>'business_type', 'HYBRID'));
    IF v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    v_clean_slug := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
    v_trial_key := 'RLPOS-TRL-' || upper(substr(md5(random()::text), 1, 8));

    -- Insert Tenant Baru
    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type)
    VALUES (v_tenant_id, v_tenant_name, v_clean_slug, 'trial', 'active', v_business_type);

    -- Insert Cabang Utama
    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE);

    -- Inisialisasi Chart of Accounts & Master Data bawaan
    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    -- Lisensi trial bawaan 14 hari
    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '14 days', 1, 3,
        jsonb_build_object('trial', true, 'trial_days', 14, 'auto_generated', true)
    ) ON CONFLICT DO NOTHING;

    -- Profil Owner (Role DIPAKSA 'Owner' oleh server)
    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES (NEW.id, v_tenant_id, v_branch_id, v_name, NEW.email, 'Owner', TRUE)
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon;

CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();


-- 5. RPC PRIVILEGE LOCKDOWN & CALLER VALIDATION (K04)

-- 5A. fn_initialize_tenant_defaults (Internal Function Only)
REVOKE ALL ON FUNCTION public.fn_initialize_tenant_defaults(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_initialize_tenant_defaults(UUID, UUID) TO service_role;

-- 5B. redeem_customer_reward
REVOKE ALL ON FUNCTION public.redeem_customer_reward(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_customer_reward(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 5C. fn_founder_create_tenant
REVOKE ALL ON FUNCTION public.fn_founder_create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_founder_create_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO authenticated, service_role;

-- Update fn_founder_create_tenant agar tidak mengembalikan password & memvalidasi caller
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
    -- Validasi caller strictly role Super Admin
    v_caller_role := public.current_user_role();
    IF v_caller_role != 'Super Admin' THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Founder / Super Admin yang berwenang menerbitkan tenant baru (Role aktif Anda: %)', v_caller_role;
    END IF;

    v_plan := LOWER(COALESCE(p_plan, 'pro'));
    IF v_plan LIKE '%enterprise%' THEN
        v_plan := 'enterprise';
    ELSIF v_plan LIKE '%basic%' THEN
        v_plan := 'basic';
    ELSE
        v_plan := 'pro';
    END IF;

    v_clean_slug := LOWER(REGEXP_REPLACE(p_store_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_clean_slug := TRIM(BOTH '-' FROM v_clean_slug);
    IF v_clean_slug = '' THEN
        v_clean_slug := 'store';
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        v_clean_slug := v_clean_slug || '-' || SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6);
    END IF;

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

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

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

    -- Hasil tanpa membocorkan plain-text password
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
        'owner_password', '[SECURELY_ENCRYPTED]',
        'license_key', v_license_key,
        'telepon', COALESCE(p_telepon, '-'),
        'alamat', COALESCE(p_alamat, '-')
    );

    RETURN v_result;
END;
$$;

-- 5D. fn_execute_checkout
REVOKE ALL ON FUNCTION public.fn_execute_checkout(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_execute_checkout(UUID, UUID, JSONB, JSONB) TO authenticated, service_role;

COMMIT;
