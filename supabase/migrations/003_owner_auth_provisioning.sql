-- Requires the multi-tenant schema in 001_initial_relaypos_cloud_schema.sql.
-- Apply with the database migration role, never from the public browser client.
BEGIN;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'HYBRID';

-- A signup creates its OWN tenant. Never accept tenant IDs or privileged roles
-- from raw_user_meta_data: users can edit that metadata themselves.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_tenant_name TEXT := NULLIF(btrim(NEW.raw_user_meta_data->>'tenant_name'), '');
    v_name TEXT := COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'nama'), ''),
                            NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email);
    v_business_type TEXT := COALESCE(NEW.raw_user_meta_data->>'business_type', 'HYBRID');
BEGIN
    -- Privileged Auth Admin invitations may assign staff via app_metadata.
    -- Browser signUp options.data is user_metadata and cannot enter this path.
    IF NULLIF(NEW.raw_app_meta_data->>'tenant_id', '') IS NOT NULL THEN
        v_tenant_id := (NEW.raw_app_meta_data->>'tenant_id')::UUID;
        v_branch_id := NULLIF(NEW.raw_app_meta_data->>'branch_id', '')::UUID;
        IF COALESCE(NEW.raw_app_meta_data->>'erp_role', '') NOT IN ('Owner', 'Admin', 'Kasir') THEN
            RAISE EXCEPTION 'Peran undangan tidak valid';
        END IF;
        IF v_branch_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.branches WHERE id = v_branch_id AND tenant_id = v_tenant_id
        ) THEN
            RAISE EXCEPTION 'Cabang undangan tidak sesuai tenant';
        END IF;
        INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role)
        VALUES (NEW.id, v_tenant_id, v_branch_id, v_name, NEW.email, NEW.raw_app_meta_data->>'erp_role');
        RETURN NEW;
    END IF;
    -- Google owner registration has no form metadata. Password signup must
    -- explicitly name a store; staff should be provisioned by a trusted server.
    IF v_tenant_name IS NULL THEN
        IF NEW.raw_app_meta_data->>'provider' = 'google' THEN
            v_tenant_name := v_name || '''s Store';
        ELSE
            RAISE EXCEPTION 'Nama toko wajib diisi untuk registrasi Owner';
        END IF;
    END IF;
    IF v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        RAISE EXCEPTION 'Tipe bisnis tidak valid';
    END IF;
    IF NEW.email IS NULL OR v_name IS NULL THEN
        RAISE EXCEPTION 'Email Owner wajib tersedia';
    END IF;

    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type)
    VALUES (v_tenant_id, v_tenant_name, 'store-' || v_tenant_id::TEXT, 'trial', 'active', v_business_type);
    INSERT INTO public.branches (id, tenant_id, nama, kode)
    VALUES (v_branch_id, v_tenant_id, v_tenant_name, 'MAIN');
    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role)
    VALUES (NEW.id, v_tenant_id, v_branch_id, v_name, NEW.email, 'Owner');

    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Resolve membership from the authoritative profile, not client-editable
-- metadata or stale JWT role claims. SECURITY DEFINER avoids recursive profile
-- RLS; the migration role must own these functions and bypass profile RLS.
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.current_branch_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), 'Kasir');
$$;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_registration_profile_select ON public.profiles;
CREATE POLICY owner_registration_profile_select ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() AND tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS owner_registration_tenant_select ON public.tenants;
CREATE POLICY owner_registration_tenant_select ON public.tenants FOR SELECT TO authenticated
USING (id = public.current_tenant_id());
DROP POLICY IF EXISTS owner_registration_branch_select ON public.branches;
CREATE POLICY owner_registration_branch_select ON public.branches FOR SELECT TO authenticated
USING (tenant_id = public.current_tenant_id());

COMMIT;
