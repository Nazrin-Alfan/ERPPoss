-- ==============================================================================
-- MIGRATION: 20261119000003_shift_closing_exchange_and_branch_guard.sql
-- SCOPE    :
--   1. Add tukar_uang_keluar column to public.cashier_shift_closings.
--   2. Add SECURITY DEFINER RPC public.fn_get_cashier_shift_preview so Kasir
--      can read today's operational drawer figures (including Tukar Uang cash-out)
--      without opening direct SELECT on cashflow/pos_balances (PR-3 intact).
--   3. Harden public.fn_close_cashier_shift to subtract Tukar Uang cash-out from
--      ekspektasi_kas and enforce strict Kasir branch_id isolation (BRANCH_FORBIDDEN).
-- ==============================================================================

ALTER TABLE public.cashier_shift_closings
    ADD COLUMN IF NOT EXISTS tukar_uang_keluar NUMERIC(15, 2) NOT NULL DEFAULT 0.00;

CREATE OR REPLACE FUNCTION public.fn_get_cashier_shift_preview(
    p_tenant_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_tanggal DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid               UUID := auth.uid();
    v_prof              RECORD;
    v_branch            UUID;
    v_tanggal           DATE := COALESCE(p_tanggal, CURRENT_DATE);
    v_cash_sales        NUMERIC(15, 2) := 0.00;
    v_digital_sales     NUMERIC(15, 2) := 0.00;
    v_expenses          NUMERIC(15, 2) := 0.00;
    v_exchange_cash_out NUMERIC(15, 2) := 0.00;
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
        RAISE EXCEPTION 'FORBIDDEN: Peran ini tidak berwenang melihat rekap shift kasir.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL OR (
        v_prof.role <> 'Super Admin'
        AND v_prof.tenant_id IS DISTINCT FROM p_tenant_id
        AND NOT EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.user_id = v_uid AND tm.tenant_id = p_tenant_id
        )
    ) THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses rekap kasir lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    v_branch := COALESCE(p_branch_id, v_prof.branch_id);

    IF v_prof.role = 'Kasir' AND v_prof.branch_id IS NOT NULL AND v_branch IS DISTINCT FROM v_prof.branch_id THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Kasir hanya dapat melihat rekap shift cabangnya sendiri.' USING ERRCODE = '42501';
    END IF;

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
      AND (
          tanggal = v_tanggal
          OR (waktu_dibayar IS NOT NULL AND (waktu_dibayar AT TIME ZONE 'Asia/Jakarta')::date = v_tanggal)
      )
      AND UPPER(COALESCE(status_bayar, '')) IN ('SELESAI', 'LUNAS', 'PAID');

    SELECT COALESCE(SUM(COALESCE(nominal, 0)), 0)
    INTO v_expenses
    FROM public.pengeluaran
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND (pos IS NULL OR UPPER(pos) LIKE '%CASH%');

    SELECT COALESCE(SUM(COALESCE(pengeluaran, 0)), 0)
    INTO v_exchange_cash_out
    FROM public.cashflow
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND kategori = 'Tukar Uang'
      AND UPPER(COALESCE(pos, '')) LIKE '%CASH%';

    RETURN jsonb_build_object(
        'success', TRUE,
        'tanggal', v_tanggal,
        'branch_id', v_branch,
        'cash_sales', v_cash_sales,
        'digital_sales', v_digital_sales,
        'expenses', v_expenses,
        'exchange_cash_out', v_exchange_cash_out
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_cashier_shift_preview(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_cashier_shift_preview(UUID, UUID, DATE) TO authenticated, service_role;

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
    v_uid               UUID := auth.uid();
    v_prof              RECORD;
    v_branch            UUID;
    v_kasir             TEXT := COALESCE(NULLIF(btrim(p_kasir), ''), 'KASIR');
    v_tanggal           DATE := COALESCE(p_tanggal, CURRENT_DATE);
    v_cash_sales        NUMERIC(15, 2) := 0;
    v_digital_sales     NUMERIC(15, 2) := 0;
    v_expenses          NUMERIC(15, 2) := 0;
    v_exchange_cash_out NUMERIC(15, 2) := 0;
    v_expected          NUMERIC(15, 2) := 0;
    v_physical          NUMERIC(15, 2) := COALESCE(p_kas_fisik, 0);
    v_discrepancy       NUMERIC(15, 2) := 0;
    v_closing_id        UUID := gen_random_uuid();
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

    IF p_tenant_id IS NULL OR (
        v_prof.role <> 'Super Admin'
        AND v_prof.tenant_id IS DISTINCT FROM p_tenant_id
        AND NOT EXISTS (
            SELECT 1 FROM public.tenant_memberships tm
            WHERE tm.user_id = v_uid AND tm.tenant_id = p_tenant_id
        )
    ) THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses tutup kasir lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    v_branch := COALESCE(p_branch_id, v_prof.branch_id);

    IF v_prof.role = 'Kasir' AND v_prof.branch_id IS NOT NULL AND v_branch IS DISTINCT FROM v_prof.branch_id THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Kasir hanya dapat menutup shift pada cabangnya sendiri.' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('shift_close:' || p_tenant_id::text || ':' || v_tanggal::text || ':' || UPPER(v_kasir))::bigint);

    -- Hitung penjualan tunai & non-tunai hari ini dari struk lunas (termasuk open bill yang dilunasi hari ini)
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
      AND (
          tanggal = v_tanggal
          OR (waktu_dibayar IS NOT NULL AND (waktu_dibayar AT TIME ZONE 'Asia/Jakarta')::date = v_tanggal)
      )
      AND UPPER(COALESCE(status_bayar, '')) IN ('SELESAI', 'LUNAS', 'PAID');

    SELECT COALESCE(SUM(COALESCE(nominal, 0)), 0)
    INTO v_expenses
    FROM public.pengeluaran
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND (pos IS NULL OR UPPER(pos) LIKE '%CASH%');

    -- Kurangi uang tunai laci yang diberikan ke pelanggan pada transaksi Tukar Uang hari ini
    SELECT COALESCE(SUM(COALESCE(pengeluaran, 0)), 0)
    INTO v_exchange_cash_out
    FROM public.cashflow
    WHERE tenant_id = p_tenant_id
      AND (v_branch IS NULL OR branch_id = v_branch)
      AND tanggal = v_tanggal
      AND kategori = 'Tukar Uang'
      AND UPPER(COALESCE(pos, '')) LIKE '%CASH%';

    v_expected := COALESCE(p_modal_awal, 0) + v_cash_sales - v_expenses - v_exchange_cash_out;
    v_discrepancy := v_physical - v_expected;

    INSERT INTO public.cashier_shift_closings (
        id, tenant_id, branch_id, tanggal, kasir,
        modal_awal, penjualan_tunai, penjualan_digital, pengeluaran_kasir,
        tukar_uang_keluar, ekspektasi_kas, kas_fisik, selisih, catatan, closed_by
    ) VALUES (
        v_closing_id, p_tenant_id, v_branch, v_tanggal, UPPER(v_kasir),
        COALESCE(p_modal_awal, 0), v_cash_sales, v_digital_sales, v_expenses,
        v_exchange_cash_out, v_expected, v_physical, v_discrepancy, NULLIF(btrim(COALESCE(p_catatan, '')), ''), v_uid
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
        'tukar_uang_keluar', v_exchange_cash_out,
        'ekspektasi_kas', v_expected,
        'kas_fisik', v_physical,
        'selisih', v_discrepancy
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_close_cashier_shift(UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_close_cashier_shift(UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
