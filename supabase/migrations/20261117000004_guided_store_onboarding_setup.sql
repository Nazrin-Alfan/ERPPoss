-- ============================================================================
-- MIGRATION: 20261117000004_guided_store_onboarding_setup.sql
-- PURPOSE:
--   1. Add tenants.onboarding_completed (mark pre-existing tenants TRUE;
--      newly registered tenants start FALSE).
--   2. Update handle_new_user_profile() and fn_complete_google_oauth_flow()
--      so newly registered tenants start with onboarding_completed = FALSE and
--      branches.alamat = NULL.
--   3. Create public.fn_complete_store_setup(p_tenant_id UUID, p_payload JSONB)
--      to atomically save Owner name, store name, business type, branch
--      address & WhatsApp phone, optional clean-slate reset of starter samples,
--      and custom carwash packages, cafe menus, and initial stock materials.
-- ============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Tandai tenant yang sudah ada sebelumnya agar tidak terganggu oleh popup wizard
UPDATE public.tenants
SET onboarding_completed = TRUE
WHERE onboarding_completed = FALSE;

-- ============================================================================
-- 1. UPDATE handle_new_user_profile()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_tenant_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_tenant_name TEXT;
    v_name TEXT;
    v_business_type TEXT;
    v_clean_slug TEXT;
    v_trial_key TEXT;
    v_existing_role TEXT;
BEGIN
    SELECT role INTO v_existing_role FROM public.profiles WHERE id = NEW.id LIMIT 1;
    IF v_existing_role IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Jalur 1: Undangan / registrasi staf terverifikasi dari RPC backend
    IF NULLIF(NEW.raw_app_meta_data->>'tenant_id', '') IS NOT NULL THEN
        v_tenant_id := (NEW.raw_app_meta_data->>'tenant_id')::UUID;
        v_branch_id := NULLIF(NEW.raw_app_meta_data->>'branch_id', '')::UUID;

        IF COALESCE(NEW.raw_app_meta_data->>'erp_role', '') NOT IN ('Owner', 'Admin', 'Kasir', 'Staff Kantor', 'Karyawan Cuci') THEN
            RAISE EXCEPTION 'Peran staf tidak valid: %', COALESCE(NEW.raw_app_meta_data->>'erp_role', 'NULL');
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
            updated_at = NOW()
        WHERE public.profiles.role <> 'Super Admin';

        RETURN NEW;
    END IF;

    -- Jalur 2: Registrasi mandiri publik (Owner Baru)
    v_tenant_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'tenant_name'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama_toko'), '')
    );

    -- Google OAuth tanpa tenant_name ditunda ke fn_complete_google_oauth_flow()
    IF NEW.raw_app_meta_data->>'provider' = 'google' AND v_tenant_name IS NULL THEN
        RETURN NEW;
    END IF;

    v_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
        split_part(NEW.email, '@', 1)
    );

    IF v_tenant_name IS NULL THEN
        v_tenant_name := 'Toko ' || v_name;
    END IF;

    v_business_type := UPPER(COALESCE(NEW.raw_user_meta_data->>'business_type', 'HYBRID'));
    IF v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    v_clean_slug := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
    v_trial_key := 'RLPOS-TRL-' || upper(substr(md5(random()::text), 1, 8));

    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type, onboarding_completed)
    VALUES (v_tenant_id, v_tenant_name, v_clean_slug, 'trial', 'active', v_business_type, FALSE);

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_active, is_main)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', NULL, TRUE, TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '14 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 14, 'auto_generated', true)
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES (NEW.id, v_tenant_id, v_branch_id, v_name, NEW.email, 'Owner', TRUE)
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW()
    WHERE public.profiles.role <> 'Super Admin';

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. UPDATE fn_complete_google_oauth_flow()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_complete_google_oauth_flow(
    p_mode TEXT,
    p_tenant_name TEXT DEFAULT NULL,
    p_business_type TEXT DEFAULT 'HYBRID',
    p_owner_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_existing_profile RECORD;
    v_user_email TEXT;
    v_user_meta JSONB;
    v_name TEXT;
    v_tenant_name TEXT;
    v_business_type TEXT;
    v_tenant_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_clean_slug TEXT;
    v_trial_key TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi tidak ditemukan.';
    END IF;

    SELECT id, tenant_id, role INTO v_existing_profile
    FROM public.profiles
    WHERE id = v_uid
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'EXISTING_USER',
            'tenant_id', v_existing_profile.tenant_id,
            'role', v_existing_profile.role
        );
    END IF;

    IF LOWER(COALESCE(btrim(p_mode), 'login')) <> 'register' THEN
        BEGIN
            DELETE FROM auth.identities WHERE user_id = v_uid;
            DELETE FROM auth.users WHERE id = v_uid;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        RETURN jsonb_build_object(
            'status', 'UNREGISTERED',
            'message', 'email belum memiliki tenant, silahkan klik DAFTAR untuk memulai'
        );
    END IF;

    SELECT email, raw_user_meta_data INTO v_user_email, v_user_meta
    FROM auth.users
    WHERE id = v_uid
    LIMIT 1;

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;

    v_name := COALESCE(
        NULLIF(btrim(p_owner_name), ''),
        NULLIF(btrim(v_user_meta->>'nama'), ''),
        NULLIF(btrim(v_user_meta->>'full_name'), ''),
        split_part(v_user_email, '@', 1)
    );

    v_tenant_name := COALESCE(
        NULLIF(btrim(p_tenant_name), ''),
        v_name || '''s Store'
    );

    v_business_type := UPPER(COALESCE(NULLIF(btrim(p_business_type), ''), 'HYBRID'));
    IF v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    v_clean_slug := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
    v_trial_key := 'RLPOS-TRL-' || upper(substr(md5(random()::text), 1, 8));

    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type, onboarding_completed)
    VALUES (v_tenant_id, v_tenant_name, v_clean_slug, 'trial', 'active', v_business_type, FALSE);

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_active, is_main)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', NULL, TRUE, TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '14 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 14, 'auto_generated', true)
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES (v_uid, v_tenant_id, v_branch_id, v_name, v_user_email, 'Owner', TRUE)
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW()
    WHERE public.profiles.role <> 'Super Admin';

    RETURN jsonb_build_object(
        'status', 'REGISTERED_NEW_TENANT',
        'tenant_id', v_tenant_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_complete_google_oauth_flow(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_complete_google_oauth_flow(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 3. CREATE public.fn_complete_store_setup(p_tenant_id UUID, p_payload JSONB)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_complete_store_setup(
    p_tenant_id UUID,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_tenant UUID;
    v_branch_id UUID;
    v_skip BOOLEAN := COALESCE((p_payload->>'skip')::boolean, FALSE);
    v_clear_samples BOOLEAN := COALESCE((p_payload->>'clear_starter_samples')::boolean, FALSE);
    v_owner_name TEXT := NULLIF(btrim(COALESCE(p_payload->>'owner_name', '')), '');
    v_store_name TEXT := NULLIF(btrim(COALESCE(p_payload->>'store_name', '')), '');
    v_business_type TEXT := UPPER(NULLIF(btrim(COALESCE(p_payload->>'business_type', '')), ''));
    v_telepon TEXT := NULLIF(btrim(COALESCE(p_payload->>'telepon', '')), '');
    v_alamat TEXT := NULLIF(btrim(COALESCE(p_payload->>'alamat', '')), '');
    v_has_tx BOOLEAN := FALSE;

    v_item JSONB;
    v_pkg_name TEXT;
    v_pkg_price NUMERIC(15, 2);
    v_menu_name TEXT;
    v_menu_cat TEXT;
    v_menu_price NUMERIC(15, 2);
    v_stock_name TEXT;
    v_stock_unit TEXT;
    v_stock_qty NUMERIC(15, 4);
    v_stock_cost NUMERIC(15, 4);
    v_stock_min NUMERIC(15, 4);
    v_stock_gudang TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT role, tenant_id INTO v_caller_role, v_caller_tenant
    FROM public.profiles
    WHERE id = v_uid AND is_active = TRUE
    LIMIT 1;

    IF v_caller_role NOT IN ('Owner', 'Super Admin')
       OR (v_caller_role <> 'Super Admin' AND v_caller_tenant IS DISTINCT FROM p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Owner toko ini yang berhak mengonfigurasi setup toko.' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
    ORDER BY (is_main = TRUE) DESC, (kode = 'MAIN') DESC, created_at ASC
    LIMIT 1;

    IF v_skip THEN
        UPDATE public.tenants
        SET onboarding_completed = TRUE,
            updated_at = NOW()
        WHERE id = p_tenant_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'tenant_id', p_tenant_id,
            'branch_id', v_branch_id,
            'onboarding_completed', TRUE,
            'skipped', TRUE
        );
    END IF;

    -- 1. Perbarui profil Owner
    IF v_owner_name IS NOT NULL THEN
        UPDATE public.profiles
        SET nama = v_owner_name,
            updated_at = NOW()
        WHERE id = v_uid;
    END IF;

    -- 2. Perbarui identitas Tenant & tandai onboarding selesai
    IF v_business_type IS NOT NULL AND v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    UPDATE public.tenants
    SET nama = COALESCE(v_store_name, nama),
        business_type = COALESCE(v_business_type, business_type),
        onboarding_completed = TRUE,
        updated_at = NOW()
    WHERE id = p_tenant_id;

    -- 3. Perbarui Cabang Utama (Alamat & No. WhatsApp)
    IF v_branch_id IS NOT NULL THEN
        UPDATE public.branches
        SET nama = COALESCE(v_store_name, nama),
            alamat = COALESCE(v_alamat, alamat),
            telepon = COALESCE(v_telepon, telepon),
            updated_at = NOW()
        WHERE id = v_branch_id;
    END IF;

    -- 4. Bersihkan data starter bawaan jika diminta dan belum ada transaksi
    IF v_clear_samples THEN
        SELECT EXISTS (SELECT 1 FROM public.struk WHERE tenant_id = p_tenant_id LIMIT 1) INTO v_has_tx;
        IF NOT v_has_tx THEN
            DELETE FROM public.resep WHERE tenant_id = p_tenant_id;
            DELETE FROM public.daftar_harga_menu WHERE tenant_id = p_tenant_id;
            DELETE FROM public.carwash_packages WHERE tenant_id = p_tenant_id;
            DELETE FROM public.stok_barang WHERE tenant_id = p_tenant_id;
        END IF;
    END IF;

    -- 5. Simpan Paket Cuci awal
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'carwash_packages', '[]'::jsonb))
    LOOP
        v_pkg_name := NULLIF(btrim(COALESCE(v_item->>'nama_paket', v_item->>'name', '')), '');
        v_pkg_price := GREATEST(0, COALESCE(NULLIF(v_item->>'tarif', '')::numeric, NULLIF(v_item->>'price', '')::numeric, 0));
        IF v_pkg_name IS NOT NULL THEN
            INSERT INTO public.carwash_packages (
                tenant_id, branch_id, name, nama_paket, price, tarif, is_active
            ) VALUES (
                p_tenant_id, v_branch_id, UPPER(v_pkg_name), UPPER(v_pkg_name), v_pkg_price, v_pkg_price, TRUE
            ) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- 6. Simpan Menu Cafe awal
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'cafe_menus', '[]'::jsonb))
    LOOP
        v_menu_name := NULLIF(btrim(COALESCE(v_item->>'nama_menu', v_item->>'daftar_menu', '')), '');
        v_menu_cat := COALESCE(NULLIF(btrim(COALESCE(v_item->>'kategori', '')), ''), 'Minuman');
        v_menu_price := GREATEST(0, COALESCE(NULLIF(v_item->>'harga', '')::numeric, 0));
        IF v_menu_name IS NOT NULL THEN
            INSERT INTO public.daftar_harga_menu (
                tenant_id, branch_id, daftar_menu, nama_menu, harga, kategori, is_active
            ) VALUES (
                p_tenant_id, v_branch_id, v_menu_name, v_menu_name, v_menu_price, v_menu_cat, TRUE
            )
            ON CONFLICT (tenant_id, branch_id, daftar_menu) DO UPDATE SET
                harga = EXCLUDED.harga,
                kategori = EXCLUDED.kategori,
                is_active = TRUE,
                updated_at = NOW();
        END IF;
    END LOOP;

    -- 7. Simpan Bahan Baku / Stok Awal
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'stock_items', '[]'::jsonb))
    LOOP
        v_stock_name := NULLIF(btrim(COALESCE(v_item->>'nama_barang', v_item->>'nama_produk', '')), '');
        v_stock_unit := COALESCE(NULLIF(btrim(COALESCE(v_item->>'satuan', '')), ''), 'pcs');
        v_stock_qty := GREATEST(0, COALESCE(NULLIF(v_item->>'stok', '')::numeric, 0));
        v_stock_cost := GREATEST(0, COALESCE(NULLIF(v_item->>'harga_satuan', '')::numeric, NULLIF(v_item->>'harga_beli', '')::numeric, 0));
        v_stock_min := GREATEST(0, COALESCE(NULLIF(v_item->>'min_stok', '')::numeric, 5));
        v_stock_gudang := UPPER(COALESCE(NULLIF(btrim(COALESCE(v_item->>'gudang', '')), ''), 'CAFE'));
        IF v_stock_gudang NOT IN ('CAFE', 'CARWASH', 'MERCHANDISE') THEN
            v_stock_gudang := 'CAFE';
        END IF;

        IF v_stock_name IS NOT NULL THEN
            INSERT INTO public.stok_barang (
                id, tenant_id, branch_id, nama_produk, nama_barang, satuan,
                stok, stok_akhir, harga_satuan, harga_beli, min_stok,
                gudang, kategori, is_active
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_branch_id, v_stock_name, v_stock_name, v_stock_unit,
                v_stock_qty, v_stock_qty, v_stock_cost, v_stock_cost, v_stock_min,
                v_stock_gudang, 'Bahan Baku', TRUE
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'branch_id', v_branch_id,
        'onboarding_completed', TRUE
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_complete_store_setup(UUID, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_complete_store_setup(UUID, JSONB) TO authenticated;
