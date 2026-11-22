-- ==============================================================================
-- MIGRATION: 20261118000001_beta_release_hardening.sql
-- TUJUAN (Beta Release Hardening - Ponytail Edition):
--   1. Beta Gratis 30 Hari + Keselarasan Grace Period 7 Hari antara UI & SQL.
--   2. Multi-Tenant Membership (Opsi B): tenant_memberships, RLS tenants/licenses,
--      fn_switch_active_tenant, fn_create_owner_outlet, fn_get_owner_consolidated_summary.
--   3. Persistensi Konfigurasi Struk di Database (tenants.receipt_config + RPC).
--   4. Audit Tutup Shift Kasir (cashier_shift_closings + fn_close_cashier_shift)
--      tanpa menggandakan omzet ke tabel cashflow.
--   5. Konsumsi Loyalty Atomik di dalam transaksi fn_execute_checkout.
--   6. Filter starter seed di fn_initialize_tenant_defaults sesuai business_type.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. BETA GRATIS 30 HARI & GRACE PERIOD 7 HARI PARITY
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_assert_active_tenant_license(p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lic RECORD;
    v_expiry TIMESTAMPTZ;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN;
    END IF;

    SELECT status, expires_at, valid_until
    INTO v_lic
    FROM public.tenant_licenses
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_expiry := COALESCE(v_lic.expires_at, v_lic.valid_until);

    -- Selaraskan dengan GRACE_PERIOD_DAYS = 7 di frontend (licenseHelpers.js)
    IF UPPER(TRIM(COALESCE(v_lic.status, ''))) NOT IN ('ACTIVE', 'TRIAL')
       OR (v_expiry IS NOT NULL AND (v_expiry + INTERVAL '7 days') < NOW()) THEN
        RAISE EXCEPTION 'LICENSE_EXPIRED: Masa aktif lisensi tenant telah berakhir. Hubungi Owner untuk perpanjangan.'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_assert_active_tenant_license(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- ==============================================================================
-- 2. RECEIPT CONFIG PERSISTENCE PADA TENANTS
-- ==============================================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS receipt_config JSONB DEFAULT '{}'::jsonb;

-- ==============================================================================
-- 3. MULTI-TENANT MEMBERSHIPS (OPSI B)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_memberships (
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    role TEXT NOT NULL DEFAULT 'Owner',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id
    ON public.tenant_memberships (tenant_id);

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_memberships FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.tenant_memberships TO authenticated, service_role;

DROP POLICY IF EXISTS tenant_memberships_select_policy ON public.tenant_memberships;
CREATE POLICY tenant_memberships_select_policy ON public.tenant_memberships
FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'Super Admin'
);

-- Backfill keanggotaan dari seluruh profiles yang sudah ada
INSERT INTO public.tenant_memberships (user_id, tenant_id, branch_id, role, is_default)
SELECT p.id, p.tenant_id, p.branch_id, p.role, TRUE
FROM public.profiles p
WHERE p.tenant_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p.tenant_id)
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- Sinkronisasi otomatis setiap profil baru dibuat (Email Signup, Google OAuth, Staff, Founder Console)
CREATE OR REPLACE FUNCTION public.fn_sync_profile_to_tenant_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        INSERT INTO public.tenant_memberships (user_id, tenant_id, branch_id, role, is_default)
        VALUES (NEW.id, NEW.tenant_id, NEW.branch_id, COALESCE(NEW.role, 'Owner'), TRUE)
        ON CONFLICT (user_id, tenant_id) DO UPDATE SET
            branch_id = COALESCE(EXCLUDED.branch_id, public.tenant_memberships.branch_id),
            role = EXCLUDED.role;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_to_tenant_membership ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_tenant_membership
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_profile_to_tenant_membership();

-- Perbarui RLS SELECT pada tenants & tenant_licenses agar Owner dapat melihat semua tenant di memberships-nya
DROP POLICY IF EXISTS owner_registration_tenant_select ON public.tenants;
DROP POLICY IF EXISTS tenants_select_member_policy ON public.tenants;
CREATE POLICY tenants_select_member_policy ON public.tenants
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'Super Admin'
    OR id = public.current_tenant_id()
    OR EXISTS (
        SELECT 1 FROM public.tenant_memberships m
        WHERE m.tenant_id = tenants.id AND m.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "tenant_licenses_read" ON public.tenant_licenses;
CREATE POLICY "tenant_licenses_read" ON public.tenant_licenses
FOR SELECT TO authenticated
USING (
    (public.current_user_role())::text = 'Super Admin'::text
    OR (
        (public.current_user_role())::text = 'Owner'::text
        AND (
            tenant_id = public.current_tenant_id()
            OR EXISTS (
                SELECT 1 FROM public.tenant_memberships m
                WHERE m.tenant_id = tenant_licenses.tenant_id AND m.user_id = auth.uid()
            )
        )
    )
);

-- RPC: Switch active tenant untuk Owner / Super Admin secara aman di server
CREATE OR REPLACE FUNCTION public.fn_switch_active_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_profile RECORD;
    v_membership RECORD;
    v_target_tenant RECORD;
    v_target_branch UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT id, role, is_active, tenant_id, branch_id
    INTO v_profile
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_TENANT: Tenant ID wajib diisi.';
    END IF;

    SELECT id, nama, status, business_type
    INTO v_target_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Outlet tidak ditemukan.';
    END IF;

    IF v_profile.role <> 'Super Admin' THEN
        IF v_profile.role <> 'Owner' THEN
            RAISE EXCEPTION 'FORBIDDEN: Hanya Owner atau Super Admin yang dapat berpindah outlet.' USING ERRCODE = '42501';
        END IF;

        SELECT tenant_id, branch_id
        INTO v_membership
        FROM public.tenant_memberships
        WHERE user_id = v_uid AND tenant_id = p_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'TENANT_FORBIDDEN: Anda tidak memiliki akses ke outlet ini.' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT id INTO v_target_branch
    FROM public.branches
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
    ORDER BY (id = v_membership.branch_id) DESC NULLS LAST, (is_main = TRUE) DESC, (kode = 'MAIN') DESC, created_at ASC
    LIMIT 1;

    UPDATE public.profiles
    SET tenant_id = p_tenant_id,
        branch_id = v_target_branch,
        updated_at = NOW()
    WHERE id = v_uid;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'branch_id', v_target_branch
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_switch_active_tenant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_switch_active_tenant(UUID) TO authenticated, service_role;

-- RPC: Owner membuat outlet/tenant baru dari Konsolidasi & otomatis terdaftar di tenant_memberships
CREATE OR REPLACE FUNCTION public.fn_create_owner_outlet(
    p_store_name TEXT,
    p_business_type TEXT DEFAULT 'HYBRID',
    p_telepon TEXT DEFAULT '-',
    p_alamat TEXT DEFAULT '-'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_profile RECORD;
    v_tenant_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_clean_name TEXT := NULLIF(btrim(COALESCE(p_store_name, '')), '');
    v_btype TEXT := UPPER(COALESCE(NULLIF(btrim(p_business_type), ''), 'HYBRID'));
    v_slug TEXT;
    v_trial_key TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT id, nama, email, role, is_active
    INTO v_profile
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND OR v_profile.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF v_profile.role NOT IN ('Owner', 'Super Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Owner yang dapat menambah outlet baru.' USING ERRCODE = '42501';
    END IF;

    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'INVALID_STORE_NAME: Nama outlet wajib diisi.';
    END IF;

    IF v_btype NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_btype := 'HYBRID';
    END IF;

    v_slug := lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
    v_trial_key := 'RLPOS-TRL-' || upper(substr(md5(random()::text), 1, 8));

    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type, onboarding_completed)
    VALUES (v_tenant_id, v_clean_name, v_slug, 'trial', 'active', v_btype, TRUE);

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, telepon, is_main, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', COALESCE(NULLIF(btrim(p_alamat), ''), '-'), COALESCE(NULLIF(btrim(p_telepon), ''), '-'), TRUE, TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '30 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 30, 'auto_generated', true)
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.tenant_memberships (user_id, tenant_id, branch_id, role, is_default)
    VALUES (v_uid, v_tenant_id, v_branch_id, v_profile.role, FALSE)
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant', jsonb_build_object(
            'id', v_tenant_id,
            'nama', v_clean_name,
            'slug', v_slug,
            'business_type', v_btype,
            'plan', 'trial',
            'status', 'active',
            'onboarding_completed', TRUE
        ),
        'branch_id', v_branch_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_create_owner_outlet(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_owner_outlet(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- RPC: Ringkasan konsolidasi lintas semua tenant yang dimiliki Owner
CREATE OR REPLACE FUNCTION public.fn_get_owner_consolidated_summary(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_active BOOLEAN;
    v_rows JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT role, is_active INTO v_role, v_active
    FROM public.profiles WHERE id = v_uid;

    IF NOT FOUND OR v_active IS NOT TRUE OR v_role NOT IN ('Owner', 'Super Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Owner dan Super Admin yang berhak mengakses konsolidasi.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_rows
    FROM (
        SELECT
            t.id AS tenant_id,
            t.nama AS tenant_name,
            t.business_type,
            t.plan,
            t.status,
            COALESCE((
                SELECT SUM(COALESCE(s.total_tagihan, 0))
                FROM public.struk s
                WHERE s.tenant_id = t.id
                  AND UPPER(COALESCE(s.status_bayar, '')) IN ('SELESAI', 'LUNAS', 'PAID')
                  AND (p_start_date IS NULL OR s.tanggal >= p_start_date)
                  AND (p_end_date IS NULL OR s.tanggal <= p_end_date)
            ), 0) AS revenue,
            COALESCE((
                SELECT COUNT(*)
                FROM public.struk s
                WHERE s.tenant_id = t.id
                  AND UPPER(COALESCE(s.status_bayar, '')) IN ('SELESAI', 'LUNAS', 'PAID')
                  AND (p_start_date IS NULL OR s.tanggal >= p_start_date)
                  AND (p_end_date IS NULL OR s.tanggal <= p_end_date)
            ), 0) AS transactions_count,
            COALESCE((
                SELECT SUM(COALESCE(e.nominal, 0))
                FROM public.pengeluaran e
                WHERE e.tenant_id = t.id
                  AND (p_start_date IS NULL OR e.tanggal >= p_start_date)
                  AND (p_end_date IS NULL OR e.tanggal <= p_end_date)
            ), 0) AS expenses,
            COALESCE((
                SELECT SUM(COALESCE(pb.balance, 0))
                FROM public.pos_balances pb
                WHERE pb.tenant_id = t.id
            ), 0) AS cash_balance
        FROM public.tenants t
        WHERE COALESCE(UPPER(t.status), 'ACTIVE') <> 'ARCHIVED'
          AND (
              v_role = 'Super Admin'
              OR t.id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = v_uid)
              OR EXISTS (
                  SELECT 1 FROM public.tenant_memberships m
                  WHERE m.tenant_id = t.id AND m.user_id = v_uid
              )
          )
        ORDER BY t.created_at ASC
    ) AS item;

    RETURN jsonb_build_object(
        'success', TRUE,
        'outlets', v_rows
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_owner_consolidated_summary(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_owner_consolidated_summary(DATE, DATE) TO authenticated, service_role;

-- RPC: Simpan konfigurasi struk ke tenants.receipt_config
CREATE OR REPLACE FUNCTION public.fn_update_tenant_receipt_config(
    p_tenant_id UUID,
    p_config JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_active BOOLEAN;
    v_has_access BOOLEAN := FALSE;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT role, is_active INTO v_role, v_active
    FROM public.profiles WHERE id = v_uid;

    IF NOT FOUND OR v_active IS NOT TRUE OR v_role NOT IN ('Owner', 'Super Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Owner yang dapat mengubah pengaturan struk toko.' USING ERRCODE = '42501';
    END IF;

    IF v_role = 'Super Admin' THEN
        v_has_access := TRUE;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.tenant_id = p_tenant_id
            UNION ALL
            SELECT 1 FROM public.tenant_memberships m WHERE m.user_id = v_uid AND m.tenant_id = p_tenant_id
        ) INTO v_has_access;
    END IF;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Anda tidak memiliki akses ke tenant ini.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.tenants
    SET receipt_config = COALESCE(p_config, '{}'::jsonb),
        updated_at = NOW()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'receipt_config', COALESCE(p_config, '{}'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_update_tenant_receipt_config(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_update_tenant_receipt_config(UUID, JSONB) TO authenticated, service_role;

-- ==============================================================================
-- 4. AUDIT TUTUP SHIFT KASIR (ZERO DOUBLE-COUNTING)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cashier_shift_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    tanggal DATE NOT NULL,
    kasir TEXT NOT NULL,
    modal_awal NUMERIC(15, 2) NOT NULL DEFAULT 0,
    penjualan_tunai NUMERIC(15, 2) NOT NULL DEFAULT 0,
    penjualan_digital NUMERIC(15, 2) NOT NULL DEFAULT 0,
    pengeluaran_kasir NUMERIC(15, 2) NOT NULL DEFAULT 0,
    ekspektasi_kas NUMERIC(15, 2) NOT NULL DEFAULT 0,
    kas_fisik NUMERIC(15, 2) NOT NULL DEFAULT 0,
    selisih NUMERIC(15, 2) NOT NULL DEFAULT 0,
    catatan TEXT,
    closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashier_shift_closings_tenant_date
    ON public.cashier_shift_closings (tenant_id, tanggal);

ALTER TABLE public.cashier_shift_closings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cashier_shift_closings FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.cashier_shift_closings TO authenticated, service_role;

DROP POLICY IF EXISTS cashier_shift_closings_select_policy ON public.cashier_shift_closings;
CREATE POLICY cashier_shift_closings_select_policy ON public.cashier_shift_closings
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'Super Admin'
    OR tenant_id = public.current_tenant_id()
);

CREATE OR REPLACE FUNCTION public.fn_close_cashier_shift(
    p_tenant_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_kasir TEXT DEFAULT 'KASIR',
    p_tanggal DATE DEFAULT CURRENT_DATE,
    p_modal_awal NUMERIC DEFAULT 0,
    p_kas_fisik NUMERIC DEFAULT 0,
    p_catatan TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_prof RECORD;
    v_branch UUID;
    v_kasir TEXT := COALESCE(NULLIF(btrim(p_kasir), ''), 'KASIR');
    v_tanggal DATE := COALESCE(p_tanggal, CURRENT_DATE);
    v_cash_sales NUMERIC(15, 2) := 0;
    v_digital_sales NUMERIC(15, 2) := 0;
    v_expenses NUMERIC(15, 2) := 0;
    v_expected NUMERIC(15, 2) := 0;
    v_physical NUMERIC(15, 2) := COALESCE(p_kas_fisik, 0);
    v_discrepancy NUMERIC(15, 2) := 0;
    v_closing_id UUID := gen_random_uuid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, role, is_active
    INTO v_prof
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND OR v_prof.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF v_prof.role NOT IN ('Super Admin', 'Owner', 'Admin', 'Kasir') THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran ini tidak berwenang menutup shift kasir.' USING ERRCODE = '42501';
    END IF;

    IF v_prof.role <> 'Super Admin' AND v_prof.tenant_id IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses tutup kasir lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    v_branch := COALESCE(p_branch_id, v_prof.branch_id);

    PERFORM pg_advisory_xact_lock(hashtext('shift_close:' || p_tenant_id::text || ':' || v_tanggal::text || ':' || UPPER(v_kasir))::bigint);

    -- Hitung penjualan tunai & non-tunai hari ini dari struk lunas (tidak menambah cashflow baru)
    SELECT
        COALESCE(SUM(
            CASE
                WHEN UPPER(COALESCE(metode_bayar, '')) = 'SPLIT' THEN COALESCE(nominal_cash, 0)
                WHEN UPPER(COALESCE(metode_bayar, '')) IN ('CASH', 'TUNAI') THEN COALESCE(total_tagihan, 0)
                ELSE 0
            END
        ), 0),
        COALESCE(SUM(
            CASE
                WHEN UPPER(COALESCE(metode_bayar, '')) = 'SPLIT' THEN COALESCE(nominal_qris, 0) + COALESCE(nominal_transfer, 0)
                WHEN UPPER(COALESCE(metode_bayar, '')) NOT IN ('CASH', 'TUNAI') THEN COALESCE(total_tagihan, 0)
                ELSE 0
            END
        ), 0)
    INTO v_cash_sales, v_digital_sales
    FROM public.struk
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND UPPER(COALESCE(status_bayar, '')) IN ('SELESAI', 'LUNAS', 'PAID');

    SELECT COALESCE(SUM(COALESCE(nominal, 0)), 0)
    INTO v_expenses
    FROM public.pengeluaran
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND (pos IS NULL OR UPPER(pos) LIKE '%CASH%');

    v_expected := COALESCE(p_modal_awal, 0) + v_cash_sales - v_expenses;
    v_discrepancy := v_physical - v_expected;

    INSERT INTO public.cashier_shift_closings (
        id, tenant_id, branch_id, tanggal, kasir,
        modal_awal, penjualan_tunai, penjualan_digital, pengeluaran_kasir,
        ekspektasi_kas, kas_fisik, selisih, catatan, closed_by
    ) VALUES (
        v_closing_id, p_tenant_id, v_branch, v_tanggal, UPPER(v_kasir),
        COALESCE(p_modal_awal, 0), v_cash_sales, v_digital_sales, v_expenses,
        v_expected, v_physical, v_discrepancy, NULLIF(btrim(COALESCE(p_catatan, '')), ''), v_uid
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'closing_id', v_closing_id,
        'tanggal', v_tanggal,
        'kasir', UPPER(v_kasir),
        'modal_awal', COALESCE(p_modal_awal, 0),
        'penjualan_tunai', v_cash_sales,
        'penjualan_digital', v_digital_sales,
        'pengeluaran_kasir', v_expenses,
        'ekspektasi_kas', v_expected,
        'kas_fisik', v_physical,
        'selisih', v_discrepancy
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_close_cashier_shift(UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_close_cashier_shift(UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

-- ==============================================================================
-- 5. STARTER DEFAULTS BERBASIS BUSINESS_TYPE + BETA TRIAL 30 HARI
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_initialize_tenant_defaults(p_tenant_id UUID, p_branch_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_business_type TEXT := 'HYBRID';
    v_has_cafe BOOLEAN := TRUE;
    v_has_carwash BOOLEAN := TRUE;
BEGIN
    SELECT UPPER(COALESCE(business_type, 'HYBRID'))
    INTO v_business_type
    FROM public.tenants
    WHERE id = p_tenant_id;

    v_has_cafe := v_business_type IN ('HYBRID', 'CAFE');
    v_has_carwash := v_business_type IN ('HYBRID', 'CARWASH');

    -- 1. Chart of Accounts (COA) Standar Indonesia
    INSERT INTO public.chart_of_accounts (
        tenant_id, kode_akun, nama_akun, tipe, kategori, saldo_normal, saldo_awal, is_active
    ) VALUES
        (p_tenant_id, '1001', 'Kas Kasir & Operasional Utama', 'ASET', 'Kas & Bank', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '1101', 'Kas Tunai Laci Kasir', 'ASET', 'Kas & Bank', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '1102', 'Bank Rekening Operasional', 'ASET', 'Kas & Bank', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '1103', 'Persediaan Bahan Baku & Barang Dagang', 'ASET', 'Persediaan', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '2101', 'Hutang Usaha & Operasional', 'KEWAJIBAN', 'Hutang Lancar', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '3101', 'Modal Disetor Pemilik', 'EKUITAS', 'Modal', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '3102', 'Prive / Penarikan Modal Pemilik', 'EKUITAS', 'Ekuitas', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '4101', 'Pendapatan Layanan Carwash', 'PENDAPATAN', 'Pendapatan Usaha', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '4102', 'Pendapatan Penjualan Cafe & F&B', 'PENDAPATAN', 'Pendapatan Usaha', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '5101', 'Beban Pokok Pendapatan (HPP)', 'BEBAN', 'Beban Pokok Penjualan', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '6101', 'Beban Gaji & Komisi Cuci', 'BEBAN', 'Beban Operasional', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '6102', 'Beban Operasional & Listrik Air', 'BEBAN', 'Beban Operasional', 'DEBIT', 0.00, TRUE)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING;

    -- 2. Kategori Master Keuangan (master_categories)
    INSERT INTO public.master_categories (tenant_id, nama_kategori, jenis, tipe_arus, boleh_kasir, is_active)
    VALUES
        (p_tenant_id, 'Operasional & Utilitas', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Gaji & Komisi Karyawan', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Bahan Baku & Dapur', 'PENGELUARAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Belanja Perlengkapan Cuci', 'PENGELUARAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Pemeliharaan & Servis Alat', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Sewa Tempat & Bangunan', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Prive & Penarikan Dana', 'PENGELUARAN', 'PENDANAAN', FALSE, TRUE),
        (p_tenant_id, 'Penjualan Cafe & Minuman', 'PEMASUKAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Layanan Jasa Cuci Mobil', 'PEMASUKAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Pendapatan Lain-lain', 'PEMASUKAN', 'OPERASI', FALSE, TRUE)
    ON CONFLICT (tenant_id, nama_kategori) DO NOTHING;

    -- 3. CRM Program Loyalitas Bawaan (menggunakan kolom schema resmi)
    IF p_branch_id IS NOT NULL AND v_has_carwash THEN
        INSERT INTO public.crm_loyalty_programs (
            tenant_id, branch_id, target_stamps, reward_type, reward_title, reward_description, is_active
        ) VALUES (
            p_tenant_id, p_branch_id, 5, 'FREE_WASH', 'Cuci 5x Gratis 1x', 'Reward loyalitas cuci kendaraan', TRUE
        ) ON CONFLICT DO NOTHING;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        -- 4. Menu Starter Cafe (hanya untuk CAFE & HYBRID)
        IF v_has_cafe THEN
            INSERT INTO public.daftar_harga_menu (
                tenant_id, branch_id, daftar_menu, nama_menu, harga, kategori, is_active
            ) VALUES
                (p_tenant_id, p_branch_id, 'Kopi Susu Aren', 'Kopi Susu Aren', 18000.00, 'Kopi', TRUE),
                (p_tenant_id, p_branch_id, 'Americano Dingin', 'Americano Dingin', 15000.00, 'Kopi', TRUE),
                (p_tenant_id, p_branch_id, 'Roti Bakar Cokelat', 'Roti Bakar Cokelat', 15000.00, 'Makanan', TRUE),
                (p_tenant_id, p_branch_id, 'Kentang Goreng Crispy', 'Kentang Goreng Crispy', 16000.00, 'Snack', TRUE)
            ON CONFLICT (tenant_id, branch_id, daftar_menu) DO NOTHING;

            INSERT INTO public.stok_barang (
                id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_produk, nama_barang, satuan, stok, stok_akhir, min_stok, gudang, kategori, is_active
            ) VALUES
                (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-KOPI', 'BB-KOPI', 'Biji Kopi House Blend', 'Biji Kopi House Blend', 'kg', 100.00, 100.00, 5.00, 'CAFE', 'Bahan Baku', TRUE),
                (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-SUSU', 'BB-SUSU', 'Susu Segar UHT', 'Susu Segar UHT', 'liter', 100.00, 100.00, 10.00, 'CAFE', 'Bahan Baku', TRUE)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.resep (
                id, tenant_id, nama_menu, nama_bahan, nama_bahan_baku, jumlah, jumlah_dibutuhkan, satuan
            ) VALUES
                (gen_random_uuid(), p_tenant_id, 'Kopi Susu Aren', 'Biji Kopi House Blend', 'Biji Kopi House Blend', 0.02, 0.02, 'kg'),
                (gen_random_uuid(), p_tenant_id, 'Kopi Susu Aren', 'Susu Segar UHT', 'Susu Segar UHT', 0.15, 0.15, 'liter')
            ON CONFLICT DO NOTHING;
        END IF;

        -- 5. Paket & Stok Starter Carwash (hanya untuk CARWASH & HYBRID)
        IF v_has_carwash THEN
            INSERT INTO public.carwash_packages (
                id, tenant_id, branch_id, name, nama_paket, description, keterangan, price, tarif, sort_order, komisi_skema, tarif_matrix, is_active
            ) VALUES
                (
                    gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET CUCI BIASA', 'PAKET CUCI BIASA',
                    'Cuci bersih body luar dan vakum interior standar', 'Cuci bersih body luar dan vakum interior standar',
                    50000.00, 50000.00, 1, 'TIERED',
                    '{"Small":{"Regular":50000,"Body only":35000},"Medium":{"Regular":55000,"Body only":40000},"Large":{"Regular":60000,"Body only":45000},"Extra Large":{"Regular":80000,"Body only":80000}}'::jsonb,
                    TRUE
                ),
                (
                    gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET KACA BENING (CUCI + JAMUR KACA)', 'PAKET KACA BENING (CUCI + JAMUR KACA)',
                    'Cuci reguler ditambah pembersihan jamur kaca depan/samping', 'Cuci reguler ditambah pembersihan jamur kaca depan/samping',
                    150000.00, 150000.00, 2, 'TIERED',
                    '{"Small":{"Regular":150000,"Body only":135000},"Medium":{"Regular":155000,"Body only":140000},"Large":{"Regular":160000,"Body only":145000},"Extra Large":{"Regular":180000,"Body only":180000}}'::jsonb,
                    TRUE
                ),
                (
                    gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET DAUN TALAS (CUCI + WAX KACA)', 'PAKET DAUN TALAS (CUCI + WAX KACA)',
                    'Cuci reguler ditambah coating efek daun talas pada kaca', 'Cuci reguler ditambah coating efek daun talas pada kaca',
                    100000.00, 100000.00, 3, 'TIERED',
                    '{"Small":{"Regular":100000,"Body only":85000},"Medium":{"Regular":105000,"Body only":90000},"Large":{"Regular":110000,"Body only":95000},"Extra Large":{"Regular":130000,"Body only":130000}}'::jsonb,
                    TRUE
                ),
                (
                    gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET JURAGAN (CUCI + JAMUR KACA + WAX KACA)', 'PAKET JURAGAN (CUCI + JAMUR KACA + WAX KACA)',
                    'Treatment kaca lengkap jamur + wax hydrophobic', 'Treatment kaca lengkap jamur + wax hydrophobic',
                    200000.00, 200000.00, 4, 'TIERED',
                    '{"Small":{"Regular":200000,"Body only":185000},"Medium":{"Regular":205000,"Body only":190000},"Large":{"Regular":210000,"Body only":195000},"Extra Large":{"Regular":230000,"Body only":230000}}'::jsonb,
                    TRUE
                ),
                (
                    gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET GLOW UP (CUCI + WAX BODY)', 'PAKET GLOW UP (CUCI + WAX BODY)',
                    'Cuci reguler ditambah wax kilap body mobil', 'Cuci reguler ditambah wax kilap body mobil',
                    100000.00, 100000.00, 5, 'TIERED',
                    '{"Small":{"Regular":100000,"Body only":85000},"Medium":{"Regular":110000,"Body only":95000},"Large":{"Regular":120000,"Body only":105000},"Extra Large":{"Regular":160000,"Body only":160000}}'::jsonb,
                    TRUE
                ),
                (
                    gen_random_uuid(), p_tenant_id, p_branch_id, 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)', 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)',
                    'Pembersihan jamur body menyeluruh ditambah wax finishing', 'Pembersihan jamur body menyeluruh ditambah wax finishing',
                    180000.00, 180000.00, 6, 'TIERED',
                    '{"Small":{"Regular":180000,"Body only":165000},"Medium":{"Regular":200000,"Body only":185000},"Large":{"Regular":220000,"Body only":205000},"Extra Large":{"Regular":300000,"Body only":300000}}'::jsonb,
                    TRUE
                )
            ON CONFLICT DO NOTHING;

            INSERT INTO public.stok_barang (
                id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_produk, nama_barang, satuan, stok, stok_akhir, min_stok, gudang, kategori, is_active
            ) VALUES
                (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-SHM', 'BB-SHM', 'Shampoo Carwash Touchless', 'Shampoo Carwash Touchless', 'liter', 200.00, 200.00, 20.00, 'CARWASH', 'Bahan Baku', TRUE)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END;
$$;

-- Update handle_new_user_profile() & fn_complete_google_oauth_flow() ke Beta 30 Hari
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

    v_tenant_name := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data->>'tenant_name'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data->>'nama_toko'), '')
    );

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

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_main, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE, TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '30 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 30, 'auto_generated', true)
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

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_main, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE, TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '30 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 30, 'auto_generated', true)
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

-- ==============================================================================
-- 6. KONSUMSI LOYALTY ATOMIK DI DALAM fn_execute_checkout
-- ==============================================================================

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
SET search_path = ''
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
    v_menu_record RECORD;

    v_resep_record RECORD;
    v_stock_record RECORD;
    v_needed NUMERIC(15, 4);
    v_item_cogs NUMERIC(15, 2);

    v_cw_record RECORD;
    v_cw_paket TEXT;
    v_cw_harga NUMERIC(15, 2);

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

            IF v_nama_menu = '' OR v_qty_menu <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Nama menu dan kuantitas wajib valid.';
            END IF;

            SELECT harga INTO v_menu_record
            FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id
              AND (LOWER(TRIM(COALESCE(nama_menu, ''))) = LOWER(TRIM(v_nama_menu))
                   OR LOWER(TRIM(COALESCE(daftar_menu, ''))) = LOWER(TRIM(v_nama_menu)))
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1;

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
        v_cw_harga := COALESCE(
            NULLIF(p_carwash_payload->>'harga', '')::numeric,
            NULLIF(p_carwash_payload->>'tarif', '')::numeric,
            0.00
        );

        IF v_cw_paket <> '' THEN
            SELECT price, tarif INTO v_cw_record
            FROM public.carwash_packages
            WHERE tenant_id = p_tenant_id
              AND (LOWER(TRIM(COALESCE(nama_paket, ''))) = LOWER(TRIM(v_cw_paket))
                   OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM(v_cw_paket)))
            LIMIT 1;

            IF FOUND THEN
                DECLARE
                    v_catalog_cw_price NUMERIC(15, 2);
                BEGIN
                    v_catalog_cw_price := COALESCE(v_cw_record.tarif, v_cw_record.price);
                    IF v_catalog_cw_price IS NOT NULL AND v_catalog_cw_price > 0.00 THEN
                        IF v_cw_harga <> v_catalog_cw_price THEN
                            RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga paket carwash "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                                v_cw_paket, v_catalog_cw_price, v_cw_harga;
                        END IF;
                    END IF;
                END;
            END IF;
        END IF;

        IF v_cw_harga < 0.00 THEN
            RAISE EXCEPTION 'INVALID_PRICE: Tarif carwash tidak boleh negatif.';
        END IF;

        v_total_carwash := v_cw_harga;
    END IF;

    -- Konsumsi Reward Loyalty secara atomik dalam transaksi checkout yang sama
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
            NULL,
            v_id_struk,
            v_id_struk
        );

        -- Pastikan diskon mencakup gratis layanan carwash penuh apabila belum terakumulasi
        IF v_diskon < v_total_carwash THEN
            v_diskon := v_total_carwash;
        END IF;
    END IF;

    v_subtotal_kotor := v_total_cafe + v_total_carwash;

    IF v_diskon > v_subtotal_kotor THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh melebihi subtotal kotor transaksi (Subtotal: %, Diskon: %).',
            v_subtotal_kotor, v_diskon;
    END IF;

    v_total_tagihan := GREATEST(0.00, (v_subtotal_kotor - v_diskon + v_pajak));

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

            FOR v_resep_record IN
                SELECT nama_bahan, COALESCE(jumlah_dibutuhkan, jumlah) AS jumlah_per_porsi, satuan
                FROM public.resep
                WHERE tenant_id = p_tenant_id
                  AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu))
            LOOP
                v_needed := v_resep_record.jumlah_per_porsi * v_qty_menu;

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
                WHERE tenant_id = p_tenant_id AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu))
            ) THEN
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
        INSERT INTO public.carwash (
            id, tenant_id, branch_id, id_struk, tanggal, jam, plat, model, variant, ukuran,
            paket, harga, anggota_1, anggota_2, shift, status, gaji_anggota,
            no_telepon, keterangan, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam,
            COALESCE(p_carwash_payload->>'plat', '-'),
            COALESCE(p_carwash_payload->>'model', 'Mobil'),
            COALESCE(p_carwash_payload->>'variant', 'Regular'),
            COALESCE(p_carwash_payload->>'ukuran', 'Medium'),
            COALESCE(p_carwash_payload->>'paket', 'Cuci Biasa'),
            v_total_carwash,
            p_carwash_payload->>'anggota_1',
            p_carwash_payload->>'anggota_2',
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

COMMIT;
