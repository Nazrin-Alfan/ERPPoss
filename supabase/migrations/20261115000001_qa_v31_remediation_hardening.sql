-- ==============================================================================
-- Migration: 20261115000001_qa_v31_remediation_hardening.sql
-- Description: Live QA V3.1 Remediation Hardening (RC-01 to RC-09 DB Layer):
--   - RC-01: Restrict tenant_licenses & profiles RLS, add fn_get_my_tenant_license_status,
--            strip metadata leak from fn_resolve_login_email, enforce license expiry
--            in checkout & pending bill settlement.
--   - RC-02: Drop resep.jumlah_dibutuhkan default, fix fn_sync_resep_columns,
--            repair mismatched resep rows, prevent deleting stok_barang referenced by resep.
--   - RC-03: Add atomic fn_void_or_cancel_receipt RPC (stock restoration, cashflow
--            reversal, POSTED reversal journal, carwash commission reset).
--   - RC-04: Harden redeem_customer_reward (ignore client reward title/type override,
--            reject multiple active loyalty programs, reject idempotency key plate
--            mismatch, reconcile legacy customer_reward_claims).
--   - RC-05: Compute Moving Average Cost in fn_apply_barang_masuk_to_stock and add
--            atomic fn_record_stock_purchase RPC.
--   - RC-06: Fix SPLIT cashflow/journal allocation and disallow Bank->Cash fallback
--            in fn_execute_checkout.
--   - RC-09: Enforce non-negative CHECK constraints on stok_barang prices & min_stok.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. RC-01: RLS HARDENING (tenant_licenses & profiles) + LICENSE RPC & EXPIRY GATE
-- ==============================================================================

DROP POLICY IF EXISTS "tenant_licenses_read" ON public.tenant_licenses;
CREATE POLICY "tenant_licenses_read" ON public.tenant_licenses
    FOR SELECT TO authenticated
    USING (
        ((current_user_role())::text = 'Super Admin'::text)
        OR (
            (tenant_id = current_tenant_id())
            AND ((current_user_role())::text = 'Owner'::text)
        )
    );

DROP POLICY IF EXISTS "tenant_isolation_profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_write_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        (id = auth.uid())
        OR ((current_user_role())::text = 'Super Admin'::text)
        OR (
            (tenant_id = current_tenant_id())
            AND ((current_user_role())::text = ANY (ARRAY['Super Admin'::text, 'Owner'::text, 'Admin'::text]))
        )
    );

CREATE POLICY "profiles_write_policy" ON public.profiles
    FOR ALL TO authenticated
    USING (
        (id = auth.uid())
        OR ((current_user_role())::text = 'Super Admin'::text)
        OR (
            (tenant_id = current_tenant_id())
            AND ((current_user_role())::text = ANY (ARRAY['Super Admin'::text, 'Owner'::text, 'Admin'::text]))
        )
    )
    WITH CHECK (
        (id = auth.uid())
        OR ((current_user_role())::text = 'Super Admin'::text)
        OR (
            (tenant_id = current_tenant_id())
            AND ((current_user_role())::text = ANY (ARRAY['Super Admin'::text, 'Owner'::text, 'Admin'::text]))
        )
    );

-- Safe license status RPC for all authenticated roles (omits license_key & notes)
CREATE OR REPLACE FUNCTION public.fn_get_my_tenant_license_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID;
    v_tenant_id UUID;
    v_role TEXT;
    v_active BOOLEAN;
    v_lic RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, role, is_active
    INTO v_tenant_id, v_role, v_active
    FROM public.profiles
    WHERE id = v_uid;

    IF NOT FOUND OR v_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun pengguna tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF v_tenant_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT id, tenant_id, plan, tier, status, valid_until, expires_at, max_branches, max_users, features, created_at, updated_at
    INTO v_lic
    FROM public.tenant_licenses
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_lic.id,
        'tenant_id', v_lic.tenant_id,
        'plan', v_lic.plan,
        'tier', v_lic.tier,
        'status', v_lic.status,
        'valid_until', v_lic.valid_until,
        'expires_at', v_lic.expires_at,
        'max_branches', v_lic.max_branches,
        'max_users', v_lic.max_users,
        'features', v_lic.features,
        'created_at', v_lic.created_at,
        'updated_at', v_lic.updated_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_my_tenant_license_status() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_my_tenant_license_status() TO authenticated;

-- Internal helper to enforce active license on write operations
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

    IF UPPER(TRIM(COALESCE(v_lic.status, ''))) NOT IN ('ACTIVE', 'TRIAL')
       OR (v_expiry IS NOT NULL AND v_expiry < NOW()) THEN
        RAISE EXCEPTION 'LICENSE_EXPIRED: Masa aktif lisensi tenant telah berakhir. Hubungi Owner untuk perpanjangan.'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_assert_active_tenant_license(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Harden fn_resolve_login_email: omit tenant_slug and is_active metadata disclosure
CREATE OR REPLACE FUNCTION public.fn_resolve_login_email(
    p_identifier TEXT,
    p_tenant_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_id TEXT;
    v_clean_slug TEXT;
    v_match RECORD;
BEGIN
    v_clean_id := LOWER(BTRIM(COALESCE(p_identifier, '')));
    v_clean_slug := NULLIF(LOWER(BTRIM(COALESCE(p_tenant_slug, ''))), '');

    IF v_clean_id = '' THEN
        RAISE EXCEPTION 'INVALID_LOGIN: Username atau email wajib diisi.'
            USING ERRCODE = '23514';
    END IF;

    IF POSITION('@' IN v_clean_id) > 0 THEN
        SELECT p.email, p.is_active
        INTO v_match
        FROM public.profiles p
        WHERE LOWER(BTRIM(p.email)) = v_clean_id
        ORDER BY p.is_active DESC, p.created_at DESC
        LIMIT 1;

        IF v_match.email IS NOT NULL AND v_match.is_active IS FALSE THEN
            RAISE EXCEPTION 'ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'
                USING ERRCODE = '42501';
        END IF;

        RETURN jsonb_build_object(
            'email', COALESCE(v_match.email, v_clean_id)
        );
    END IF;

    SELECT p.email, p.is_active
    INTO v_match
    FROM public.profiles p
    LEFT JOIN public.tenants t ON t.id = p.tenant_id
    WHERE (v_clean_slug IS NULL OR LOWER(t.slug) = v_clean_slug)
      AND (
          LOWER(split_part(p.email, '@', 1)) = v_clean_id
          OR LOWER(split_part(split_part(p.email, '@', 1), '.', 1)) = v_clean_id
          OR LOWER(BTRIM(p.nama)) = v_clean_id
      )
    ORDER BY
      (LOWER(split_part(p.email, '@', 1)) = v_clean_id) DESC,
      p.is_active DESC,
      p.created_at DESC
    LIMIT 1;

    IF v_match.email IS NOT NULL THEN
        IF v_match.is_active IS FALSE THEN
            RAISE EXCEPTION 'ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'
                USING ERRCODE = '42501';
        END IF;

        RETURN jsonb_build_object(
            'email', v_match.email
        );
    END IF;

    RETURN jsonb_build_object(
        'email', v_clean_id || '@jb.local'
    );
END;
$$;

-- ==============================================================================
-- 2. RC-02: BOM RECIPE PRECISION & REFERENTIAL INTEGRITY
-- ==============================================================================

ALTER TABLE public.resep ALTER COLUMN jumlah_dibutuhkan DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_sync_resep_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
    RETURN NEW;
END;
$$;

-- Repair existing corrupted rows where jumlah_dibutuhkan defaulted to 1.0000
UPDATE public.resep
SET jumlah_dibutuhkan = COALESCE(jumlah, jumlah_pemakaian)
WHERE COALESCE(jumlah, jumlah_pemakaian) IS NOT NULL
  AND COALESCE(jumlah, jumlah_pemakaian) <> 1.0000
  AND jumlah_dibutuhkan = 1.0000;

CREATE OR REPLACE FUNCTION public.fn_prevent_delete_referenced_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.resep r
        WHERE r.tenant_id = OLD.tenant_id
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
    ) THEN
        RAISE EXCEPTION 'FOREIGN_KEY_VIOLATION: Bahan "%" masih digunakan dalam resep menu aktif dan tidak dapat dihapus.',
            COALESCE(OLD.nama_produk, OLD.nama_barang, OLD.id::text)
            USING ERRCODE = '23503';
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_referenced_stock ON public.stok_barang;
CREATE TRIGGER trg_prevent_delete_referenced_stock
    BEFORE DELETE ON public.stok_barang
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_prevent_delete_referenced_stock();

-- ==============================================================================
-- 3. RC-09: NON-NEGATIVE CONSTRAINTS ON stok_barang
-- ==============================================================================

UPDATE public.stok_barang
SET harga_beli = GREATEST(COALESCE(harga_beli, 0), 0),
    harga_satuan = GREATEST(COALESCE(harga_satuan, 0), 0),
    harga_jual = GREATEST(COALESCE(harga_jual, 0), 0),
    min_stok = GREATEST(COALESCE(min_stok, 0), 0)
WHERE COALESCE(harga_beli, 0) < 0
   OR COALESCE(harga_satuan, 0) < 0
   OR COALESCE(harga_jual, 0) < 0
   OR COALESCE(min_stok, 0) < 0;

ALTER TABLE public.stok_barang DROP CONSTRAINT IF EXISTS chk_stok_barang_non_negative_prices;
ALTER TABLE public.stok_barang
    ADD CONSTRAINT chk_stok_barang_non_negative_prices
    CHECK (
        COALESCE(harga_beli, 0) >= 0
        AND COALESCE(harga_satuan, 0) >= 0
        AND COALESCE(harga_jual, 0) >= 0
        AND COALESCE(min_stok, 0) >= 0
    );

-- ==============================================================================
-- 4. RC-05: MOVING AVERAGE COST ON RESTOCK + ATOMIC STOCK PURCHASE RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_apply_barang_masuk_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_id UUID;
    v_old_stok NUMERIC;
    v_old_cost NUMERIC;
    v_unit_cost NUMERIC;
    v_new_stok NUMERIC;
    v_new_cost NUMERIC;
BEGIN
    v_target_id := NEW.id_bahan_baku;

    IF v_target_id IS NULL AND NEW.id_barang IS NOT NULL THEN
        SELECT id INTO v_target_id
        FROM public.stok_barang
        WHERE (tenant_id = NEW.tenant_id OR tenant_id IS NULL)
          AND (id_barang = NEW.id_barang OR id_bahan_baku = NEW.id_barang)
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
        WHERE id = v_target_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_record_stock_purchase(
    p_tenant_id UUID,
    p_branch_id UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;

    v_item_ref TEXT;
    v_qty NUMERIC(15, 4);
    v_unit_cost NUMERIC(15, 4);
    v_total_cost NUMERIC(15, 2);
    v_tanggal DATE;
    v_pos TEXT;
    v_keterangan TEXT;

    v_stock RECORD;
    v_masuk_id UUID := gen_random_uuid();
    v_cf_id UUID := gen_random_uuid();
    v_journal_id UUID;
    v_coa_inv UUID;
    v_coa_pay UUID;
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
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;
    IF v_caller_role NOT IN ('owner', 'admin', 'staff kantor') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan mencatat pembelian stok.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.fn_assert_active_tenant_license(p_tenant_id);

    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang transaksi wajib valid.' USING ERRCODE = '42501';
    END IF;

    v_item_ref := TRIM(COALESCE(p_payload->>'id_bahan_baku', p_payload->>'id_barang', ''));
    v_qty := COALESCE(NULLIF(p_payload->>'jumlah_masuk', '')::numeric, 0);
    v_unit_cost := COALESCE(NULLIF(p_payload->>'harga_satuan', '')::numeric, NULLIF(p_payload->>'harga_beli', '')::numeric, 0);
    v_total_cost := COALESCE(NULLIF(p_payload->>'total_biaya', '')::numeric, ROUND(v_qty * v_unit_cost, 2));
    v_tanggal := COALESCE(NULLIF(p_payload->>'tanggal', '')::date, CURRENT_DATE);
    v_pos := COALESCE(NULLIF(TRIM(p_payload->>'pos'), ''), 'SALDO CASH');
    v_keterangan := COALESCE(NULLIF(TRIM(p_payload->>'keterangan'), ''), 'Pembelian Stok');

    IF v_item_ref = '' OR v_qty <= 0 OR v_unit_cost < 0 OR v_total_cost < 0 THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Item, jumlah (> 0), dan harga (>= 0) wajib valid.' USING ERRCODE = '22023';
    END IF;

    SELECT id, id_barang, COALESCE(nama_produk, nama_barang) AS nama_item
    INTO v_stock
    FROM public.stok_barang
    WHERE tenant_id = p_tenant_id
      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
      AND (
          id::text = v_item_ref
          OR LOWER(TRIM(COALESCE(id_barang, ''))) = LOWER(v_item_ref)
          OR LOWER(TRIM(COALESCE(id_bahan_baku, ''))) = LOWER(v_item_ref)
      )
    ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STOCK_ITEM_NOT_FOUND: Item stok "%" tidak ditemukan.', v_item_ref USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.barang_masuk (
        id, tenant_id, branch_id, id_bahan_baku, id_barang, nama_barang, nama_produk, nama_bahan_baku,
        tanggal, jumlah_masuk, harga_beli, harga_satuan, total_biaya, total_harga, id_cashflow, created_at
    ) VALUES (
        v_masuk_id, p_tenant_id, v_effective_branch_id, v_stock.id, COALESCE(v_stock.id_barang, v_stock.id::text),
        v_stock.nama_item, v_stock.nama_item, v_stock.nama_item,
        v_tanggal, v_qty, v_unit_cost, v_unit_cost, v_total_cost, v_total_cost, v_cf_id::text, NOW()
    );

    INSERT INTO public.cashflow (
        id, tenant_id, branch_id, id_sumber, tanggal,
        keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
        pos, apakah_stok, id_bahan_baku, qty, created_at
    ) VALUES (
        v_cf_id, p_tenant_id, v_effective_branch_id, 'CF-IN-' || v_masuk_id::text, v_tanggal,
        v_keterangan || ': ' || v_stock.nama_item,
        'Pengeluaran', 'Pembelian Stok', 0.00, v_total_cost,
        v_pos, TRUE, v_stock.id, v_qty, NOW()
    );

    IF v_total_cost > 0 THEN
        SELECT id INTO v_coa_inv FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1103' LIMIT 1;
        IF v_pos ILIKE '%CASH%' THEN
            SELECT id INTO v_coa_pay FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;
        ELSE
            SELECT id INTO v_coa_pay FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1102' LIMIT 1;
        END IF;

        IF v_coa_inv IS NOT NULL AND v_coa_pay IS NOT NULL THEN
            v_journal_id := gen_random_uuid();
            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
            ) VALUES (
                v_journal_id, p_tenant_id, v_effective_branch_id, 'JE-IN-' || substr(v_masuk_id::text, 1, 8), v_tanggal,
                'Pembelian Stok: ' || v_stock.nama_item, v_total_cost, 'DRAFT', NOW()
            );

            INSERT INTO public.journal_entry_lines (
                id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
            ) VALUES
                (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_inv, v_total_cost, 0.00, 'Penambahan Persediaan ' || v_stock.nama_item, NOW()),
                (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_pay, 0.00, v_total_cost, 'Pembayaran Stok ' || v_stock.nama_item, NOW());

            UPDATE public.journal_entries SET status = 'POSTED' WHERE id = v_journal_id AND tenant_id = p_tenant_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'barang_masuk_id', v_masuk_id,
        'cashflow_id', v_cf_id,
        'stock_id', v_stock.id,
        'total_cost', v_total_cost
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_record_stock_purchase(UUID, UUID, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_record_stock_purchase(UUID, UUID, JSONB) TO authenticated;

-- ==============================================================================
-- 5. RC-04: HARDEN redeem_customer_reward
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.redeem_customer_reward(
    p_tenant_id uuid,
    p_plat text,
    p_reward_title text DEFAULT NULL::text,
    p_notes text DEFAULT ''::text,
    p_nama_pelanggan text DEFAULT ''::text,
    p_reward_type text DEFAULT NULL::text,
    p_id_struk text DEFAULT NULL::text,
    p_request_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_clean_plate TEXT := upper(regexp_replace(trim(COALESCE(p_plat, '')), '\s+', '', 'g'));
    v_caller_role VARCHAR(50);
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_program_id UUID;
    v_program_active BOOLEAN;
    v_target_stamps INT;
    v_canonical_title TEXT;
    v_canonical_type TEXT;
    v_active_branch_programs INT := 0;
    v_active_global_programs INT := 0;
    v_visits_count INT := 0;
    v_logs_count INT := 0;
    v_claims_count INT := 0;
    v_redemptions_count INT := 0;
    v_available INT := 0;
    v_redemption_id TEXT;
    v_existing RECORD;
    v_entitlement_seq INT;
    v_effective_id_struk TEXT := NULLIF(trim(COALESCE(p_id_struk, '')), '');
    v_effective_request_key TEXT := NULLIF(trim(COALESCE(p_request_key, '')), '');
    v_record JSONB;
BEGIN
    -- 1. Input Validation
    IF p_tenant_id IS NULL OR v_clean_plate = '' THEN
        RAISE EXCEPTION 'Tenant ID dan Plat nomor kendaraan wajib diisi';
    END IF;

    -- 2. Authenticated & Active Caller Verification
    v_caller_role   := COALESCE(public.current_user_role(), 'Anon');
    v_caller_tenant := public.current_tenant_id();
    v_caller_branch := public.current_branch_id();

    IF v_caller_role = 'Anon' OR (v_caller_tenant IS NULL AND v_caller_role <> 'Super Admin') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_OR_INACTIVE';
    END IF;

    IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin', 'Kasir') THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE_REDEEM: Role "%" tidak memiliki wewenang menukarkan reward.', v_caller_role
            USING ERRCODE = '42501';
    END IF;

    -- 3. Cross-Tenant Isolation Enforcement
    IF v_caller_role <> 'Super Admin' AND p_tenant_id <> v_caller_tenant THEN
        RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_REDEEM';
    END IF;

    -- 4. Concurrency Serialization via Transaction Advisory Lock
    PERFORM pg_advisory_xact_lock(hashtext('reward_claim:' || p_tenant_id::text || ':' || v_clean_plate)::bigint);

    -- 5. Idempotency Protection with Payload Plate Consistency Check (REW-07)
    IF v_effective_id_struk IS NOT NULL OR v_effective_request_key IS NOT NULL THEN
        SELECT id, plat, reward_title, claimed_at INTO v_existing
        FROM public.crm_loyalty_logs
        WHERE tenant_id = p_tenant_id
          AND tipe = 'REDEEM'
          AND (
              (v_effective_id_struk IS NOT NULL AND id_struk = v_effective_id_struk)
              OR
              (v_effective_request_key IS NOT NULL AND request_key = v_effective_request_key)
          )
        LIMIT 1;

        IF v_existing.id IS NOT NULL THEN
            IF upper(regexp_replace(trim(COALESCE(v_existing.plat, '')), '\s+', '', 'g')) IS DISTINCT FROM v_clean_plate THEN
                RAISE EXCEPTION 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: Request key "%" sudah digunakan untuk plat kendaraan lain.', v_effective_request_key
                    USING ERRCODE = '23505';
            END IF;

            RETURN jsonb_build_object(
                'redemption_id', v_existing.id,
                'tenant_id', p_tenant_id,
                'plat', upper(trim(p_plat)),
                'reward_title', v_existing.reward_title,
                'idempotent_replay', true,
                'claimed_at', v_existing.claimed_at
            );
        END IF;
    END IF;

    -- 6. Active Loyalty Program Gate (REW-02: reject ambiguous multiple active programs)
    IF v_caller_branch IS NOT NULL THEN
        SELECT COUNT(*) INTO v_active_branch_programs
        FROM public.crm_loyalty_programs
        WHERE tenant_id = p_tenant_id AND is_active = TRUE AND branch_id = v_caller_branch;

        IF v_active_branch_programs > 1 THEN
            RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LOYALTY_PROGRAMS: Terdapat lebih dari satu program loyalti aktif pada cabang ini.'
                USING ERRCODE = '23505';
        END IF;
    END IF;

    IF v_active_branch_programs = 0 THEN
        SELECT COUNT(*) INTO v_active_global_programs
        FROM public.crm_loyalty_programs
        WHERE tenant_id = p_tenant_id AND is_active = TRUE AND branch_id IS NULL;

        IF v_active_global_programs > 1 THEN
            RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LOYALTY_PROGRAMS: Terdapat lebih dari satu program loyalti aktif pada tenant ini.'
                USING ERRCODE = '23505';
        END IF;
    END IF;

    SELECT id, is_active, target_stamps, reward_title, reward_type
    INTO v_program_id, v_program_active, v_target_stamps, v_canonical_title, v_canonical_type
    FROM public.crm_loyalty_programs
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
      AND (v_caller_branch IS NULL OR branch_id = v_caller_branch OR branch_id IS NULL)
    ORDER BY (branch_id = v_caller_branch) DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF NOT FOUND OR v_program_active IS NOT TRUE OR COALESCE(v_target_stamps, 0) <= 0 THEN
        RAISE EXCEPTION 'LOYALTY_PROGRAM_UNAVAILABLE';
    END IF;

    -- REW-01 & REW-04: Always enforce canonical reward from DB; never allow client payload override
    v_canonical_title := COALESCE(NULLIF(trim(v_canonical_title), ''), 'Gratis Cuci Mobil');
    v_canonical_type  := COALESCE(NULLIF(trim(v_canonical_type), ''), 'FREE_SERVICE');

    -- 7. Strict Paid Visits Filter (Qualifying Visits Only)
    SELECT COUNT(DISTINCT s.id_struk) INTO v_visits_count
    FROM public.carwash cw
    INNER JOIN public.struk s ON s.tenant_id = cw.tenant_id AND s.id_struk = cw.id_struk
    WHERE cw.tenant_id = p_tenant_id
      AND upper(regexp_replace(trim(COALESCE(cw.plat, '')), '\s+', '', 'g')) = v_clean_plate
      AND lower(COALESCE(cw.status, '')) NOT IN ('batal', 'void', 'cancelled', 'pending')
      AND s.status_bayar IN ('Selesai', 'Lunas')
      AND COALESCE(s.total_tagihan, 0) > 0;

    -- 8. Count Historical Consumed Redemptions across crm_loyalty_logs & legacy customer_reward_claims (REW-08)
    SELECT COUNT(*) INTO v_logs_count
    FROM public.crm_loyalty_logs
    WHERE tenant_id = p_tenant_id
      AND upper(regexp_replace(trim(COALESCE(plat, '')), '\s+', '', 'g')) = v_clean_plate
      AND (tipe = 'REDEEM' OR (tipe IS NULL AND (claimed_at IS NOT NULL OR reward_title IS NOT NULL)));

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_reward_claims' AND c.relkind = 'r') THEN
        SELECT COUNT(*) INTO v_claims_count
        FROM public.customer_reward_claims
        WHERE tenant_id = p_tenant_id
          AND upper(regexp_replace(trim(COALESCE(plat, '')), '\s+', '', 'g')) = v_clean_plate
          AND UPPER(COALESCE(status, 'COMPLETED')) NOT IN ('BATAL', 'VOID', 'CANCELLED');
    END IF;

    v_redemptions_count := GREATEST(v_logs_count, v_claims_count);

    -- 9. Calculate Available Entitlement
    v_available := floor(v_visits_count / v_target_stamps) - v_redemptions_count;

    IF v_available <= 0 THEN
        RAISE EXCEPTION 'Stamp kunjungan belum cukup atau reward sudah diklaim';
    END IF;

    v_entitlement_seq := v_redemptions_count + 1;

    -- 10. Generate Unique ID and Insert Redemption Log
    v_redemption_id := 'red_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);

    INSERT INTO public.crm_loyalty_logs (
        id, tenant_id, branch_id, plat, tipe, reward_title, reward_type,
        id_struk, request_key, entitlement_seq, keterangan, notes,
        nama_pelanggan, claimed_at, created_at
    ) VALUES (
        v_redemption_id, p_tenant_id, v_caller_branch, upper(trim(p_plat)), 'REDEEM',
        v_canonical_title, v_canonical_type, v_effective_id_struk, v_effective_request_key,
        v_entitlement_seq, p_notes, p_notes, p_nama_pelanggan, NOW(), NOW()
    );

    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'customer_reward_claims' AND c.relkind = 'r') THEN
        INSERT INTO public.customer_reward_claims (
            tenant_id, branch_id, plat, customer_name, reward_id, id_struk, claimed_at, status
        ) VALUES (
            p_tenant_id, v_caller_branch, upper(trim(p_plat)), p_nama_pelanggan, v_program_id, v_effective_id_struk, NOW(), 'COMPLETED'
        );
    END IF;

    v_record := jsonb_build_object(
        'redemption_id', v_redemption_id,
        'tenant_id', p_tenant_id,
        'plat', upper(trim(p_plat)),
        'reward_title', v_canonical_title,
        'entitlement_seq', v_entitlement_seq,
        'claimed_at', NOW()
    );

    RETURN v_record;
END;
$function$;

-- ==============================================================================
-- 6. RC-03: ATOMIC VOID / CANCEL RECEIPT RPC (fn_void_or_cancel_receipt)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_void_or_cancel_receipt(
    p_tenant_id UUID,
    p_id_struk TEXT,
    p_reason TEXT DEFAULT 'Dibatalkan oleh Kasir/Owner'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;

    v_clean_id TEXT := TRIM(COALESCE(p_id_struk, ''));
    v_struk RECORD;
    v_was_paid BOOLEAN;
    v_bk RECORD;
    v_cf RECORD;
    v_orig_je RECORD;
    v_rev_je_id UUID;
    v_line RECORD;
    v_restored_items INT := 0;
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
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;
    IF v_caller_role NOT IN ('owner', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan membatalkan transaksi.' USING ERRCODE = '42501';
    END IF;
    IF v_clean_id = '' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: ID Struk wajib diisi.' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(('x' || substr(md5('void:' || p_tenant_id::text || ':' || v_clean_id), 1, 15))::bit(64)::bigint);

    SELECT *
    INTO v_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_clean_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RECEIPT_NOT_FOUND: Struk "%" tidak ditemukan.', v_clean_id USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_role = 'kasir' AND v_struk.branch_id IS DISTINCT FROM v_caller_branch THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Kasir tidak diizinkan membatalkan struk cabang lain.' USING ERRCODE = '42501';
    END IF;

    IF UPPER(TRIM(COALESCE(v_struk.status_bayar, ''))) = 'BATAL' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'ALREADY_CANCELLED',
            'id_struk', v_clean_id,
            'was_replayed', TRUE
        );
    END IF;

    v_was_paid := UPPER(TRIM(COALESCE(v_struk.status_bayar, ''))) IN ('SELESAI', 'PAID', 'LUNAS');

    -- 1. Restore inventory from barang_keluar
    FOR v_bk IN
        SELECT id, id_bahan_baku, id_barang, jumlah_keluar
        FROM public.barang_keluar
        WHERE tenant_id = p_tenant_id
          AND (
              id_struk = v_clean_id
              OR keterangan LIKE '%Struk: ' || v_clean_id || '%'
          )
    LOOP
        IF v_bk.id_bahan_baku IS NOT NULL AND COALESCE(v_bk.jumlah_keluar, 0) > 0 THEN
            UPDATE public.stok_barang
            SET stok = COALESCE(stok, 0) + v_bk.jumlah_keluar,
                stok_akhir = COALESCE(stok_akhir, stok, 0) + v_bk.jumlah_keluar,
                updated_at = NOW()
            WHERE id = v_bk.id_bahan_baku AND tenant_id = p_tenant_id;
            v_restored_items := v_restored_items + 1;
        END IF;
    END LOOP;

    -- 2. Mark struk, cafe, and carwash (zeroing commission) as Batal
    UPDATE public.struk
    SET status_bayar = 'Batal',
        status_pembayaran = 'Batal',
        catatan = TRIM(BOTH ' | ' FROM COALESCE(catatan, '') || ' | VOID: ' || COALESCE(NULLIF(TRIM(p_reason), ''), 'Dibatalkan')),
        updated_at = NOW()
    WHERE id = v_struk.id AND tenant_id = p_tenant_id;

    UPDATE public.cafe
    SET status = 'Batal'
    WHERE tenant_id = p_tenant_id AND id_struk = v_clean_id;

    UPDATE public.carwash
    SET status = 'Batal',
        gaji_anggota = 0.00,
        gaji_pencuci = 0.00
    WHERE tenant_id = p_tenant_id AND id_struk = v_clean_id;

    -- 3. Reverse Cashflow & General Ledger only if the receipt was previously Paid
    IF v_was_paid THEN
        FOR v_cf IN
            SELECT id_sumber, pos, pemasukan, branch_id
            FROM public.cashflow
            WHERE tenant_id = p_tenant_id
              AND jenis = 'Pemasukan'
              AND COALESCE(pemasukan, 0) > 0
              AND (
                  id_sumber IN (
                      'CF-POS-' || v_clean_id,
                      'CF-POS-CASH-' || v_clean_id,
                      'CF-POS-DIGITAL-' || v_clean_id,
                      'CF-SETTLE-' || v_clean_id,
                      'CF-SETTLE-CASH-' || v_clean_id,
                      'CF-SETTLE-DIGITAL-' || v_clean_id
                  )
              )
        LOOP
            INSERT INTO public.cashflow (
                id, tenant_id, branch_id, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                pos, apakah_stok, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, COALESCE(v_cf.branch_id, v_struk.branch_id),
                'CF-VOID-' || v_cf.id_sumber, CURRENT_DATE,
                'Pembatalan / Void Struk POS: ' || v_clean_id || ' (' || COALESCE(NULLIF(TRIM(p_reason), ''), 'Void') || ')',
                'Pengeluaran', 'Pembatalan / Void POS', 0.00, v_cf.pemasukan,
                v_cf.pos, FALSE, NOW()
            );
        END LOOP;

        FOR v_orig_je IN
            SELECT id, branch_id, entry_no, total_amount
            FROM public.journal_entries
            WHERE tenant_id = p_tenant_id
              AND status = 'POSTED'
              AND entry_no IN ('JE-POS-' || v_clean_id, 'JE-SETTLE-' || v_clean_id)
        LOOP
            v_rev_je_id := gen_random_uuid();
            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
            ) VALUES (
                v_rev_je_id, p_tenant_id, COALESCE(v_orig_je.branch_id, v_struk.branch_id),
                'JE-VOID-' || v_orig_je.entry_no, CURRENT_DATE,
                'Reversal / Void ' || v_orig_je.entry_no || ': ' || COALESCE(NULLIF(TRIM(p_reason), ''), 'Dibatalkan'),
                v_orig_je.total_amount, 'DRAFT', NOW()
            );

            FOR v_line IN
                SELECT account_id, debit, credit, memo
                FROM public.journal_entry_lines
                WHERE tenant_id = p_tenant_id AND journal_entry_id = v_orig_je.id
            LOOP
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_rev_je_id, v_line.account_id,
                    v_line.credit, v_line.debit, 'VOID: ' || COALESCE(v_line.memo, v_clean_id), NOW()
                );
            END LOOP;

            UPDATE public.journal_entries
            SET status = 'POSTED'
            WHERE id = v_rev_je_id AND tenant_id = p_tenant_id;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'CANCELLED',
        'id_struk', v_clean_id,
        'was_paid', v_was_paid,
        'restored_stock_items', v_restored_items,
        'was_replayed', FALSE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_void_or_cancel_receipt(UUID, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_void_or_cancel_receipt(UUID, TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- 7. RC-01 + RC-06: HARDEN fn_execute_checkout (LICENSE EXPIRY, SPLIT, NO BANK FALLBACK)
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
    -- 1. Otorisasi Pengguna
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

    -- RC-01: Enforce Active Tenant License
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

    -- 2. Parsing Payload Struk
    v_id_struk := TRIM(COALESCE(p_struk_payload->>'id_struk', p_struk_payload->>'nomor_struk', p_struk_payload->>'no_struk', ''));
    IF v_id_struk = '' THEN
        v_id_struk := 'STRUK-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 4));
    END IF;

    -- 3. Advisory Lock Transaksional untuk Idempotensi
    v_advisory_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk), 1, 15))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_advisory_key);

    -- 4. Hitung Hash Payload Transaksi
    v_current_hash := md5(
        COALESCE(p_struk_payload::text, '') || '|' ||
        COALESCE(p_cafe_items::text, '') || '|' ||
        COALESCE(p_carwash_payload::text, '')
    );

    -- 5. Cek Idempotensi Struk Eksisting
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

    -- 6. Ekstraksi Field Tambahan Struk
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

    IF v_diskon < 0.00 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh negatif.';
    END IF;

    -- 7. Validasi & Kalkulasi Item Cafe
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

    -- 8. Validasi & Kalkulasi Layanan Carwash
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        v_cw_paket := TRIM(COALESCE(p_carwash_payload->>'paket', ''));
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

    -- 9. Kalkulasi Tagihan & Validasi Diskon
    v_subtotal_kotor := v_total_cafe + v_total_carwash;

    IF v_diskon > v_subtotal_kotor THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh melebihi subtotal kotor transaksi (Subtotal: %, Diskon: %).',
            v_subtotal_kotor, v_diskon;
    END IF;

    v_total_tagihan := GREATEST(0.00, (v_subtotal_kotor - v_diskon + v_pajak));

    -- 10. Validasi Pembayaran & Split Allocation
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

    -- 11. Simpan Header Struk Transaksi
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

    -- 12. Pengurangan Stok Bahan Baku / Produk (BOM Inventory Deduction)
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

    -- 13. Simpan Baris Detail Cafe
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

    -- 14. Simpan Layanan Carwash
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

    -- 15. Sinkronisasi Cashflow (RC-06: Split Cash vs Digital)
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

    -- 16. Double-Entry General Ledger Auto-Posting (RC-06: Disallow Bank->Cash Fallback)
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
        'was_replayed', FALSE
    );
END;
$function$;

-- Also inject license expiry enforcement into fn_settle_pending_bill via wrapper check?
-- Wait: let's add a statement-level or row-level trigger? Even cleaner:
-- Wrap fn_settle_pending_bill? No, we shouldn't duplicate 500 lines if we can avoid it, OR
-- we can add a BEFORE UPDATE trigger on struk when status_bayar transitions to Selesai/Lunas/Paid!
-- Let's check: a BEFORE UPDATE trigger on struk when status_bayar transitions from Pending -> Selesai
-- enforces license expiry for BOTH fn_settle_pending_bill AND any direct update!
CREATE OR REPLACE FUNCTION public.fn_enforce_license_on_struk_settle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF UPPER(TRIM(COALESCE(NEW.status_bayar, ''))) IN ('SELESAI', 'PAID', 'LUNAS')
       AND UPPER(TRIM(COALESCE(OLD.status_bayar, ''))) NOT IN ('SELESAI', 'PAID', 'LUNAS') THEN
        PERFORM public.fn_assert_active_tenant_license(NEW.tenant_id);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_license_on_struk_settle ON public.struk;
CREATE TRIGGER trg_enforce_license_on_struk_settle
    BEFORE UPDATE OF status_bayar ON public.struk
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_license_on_struk_settle();

COMMIT;
