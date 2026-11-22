-- ==============================================================================
-- MIGRATION: 20261123000001_pocket_balance_relational_foundation.sql
-- PURPOSE  : Harden pos_balances & cashflow relational integrity as the single
--            source of truth before Bank Email Integration:
--            1. Composite tenant key uq_pos_balances_tenant_id (tenant_id, id)
--            2. Duplicate-proof UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id, pos)
--            3. Optional CoA link pos_balances.account_id -> chart_of_accounts
--            4. Relational cashflow.pocket_id -> pos_balances(tenant_id, id) ON DELETE RESTRICT
--            5. Safe backfill + legacy 'SALDO REKENING (N)' alias normalization
--            6. Bidirectional sync & rename propagation triggers
--            7. Single source of truth view public.v_pocket_balances (security_invoker)
--            8. Align fn_record_cashier_money_exchange & fn_get_owner_consolidated_summary
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. HARDEN public.pos_balances
-- ------------------------------------------------------------------------------
ALTER TABLE public.pos_balances
    ADD COLUMN IF NOT EXISTS account_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_pos_balances_tenant_id'
          AND conrelid = 'public.pos_balances'::regclass
    ) THEN
        ALTER TABLE public.pos_balances
            ADD CONSTRAINT uq_pos_balances_tenant_id UNIQUE (tenant_id, id);
    END IF;
END $$;

-- Prevent duplicate pocket names when branch_id IS NULL (PostgreSQL 15+ NULLS NOT DISTINCT)
ALTER TABLE public.pos_balances
    DROP CONSTRAINT IF EXISTS uq_pos_balances_tenant_pos;

ALTER TABLE public.pos_balances
    ADD CONSTRAINT uq_pos_balances_tenant_pos UNIQUE NULLS NOT DISTINCT (tenant_id, branch_id, pos);

-- Optional Chart of Accounts link per pocket (enables distinct CoA lines on bank-to-bank transfers)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_pos_balances_coa_composite'
          AND conrelid = 'public.pos_balances'::regclass
    ) THEN
        ALTER TABLE public.pos_balances
            ADD CONSTRAINT fk_pos_balances_coa_composite
            FOREIGN KEY (tenant_id, account_id)
            REFERENCES public.chart_of_accounts (tenant_id, id)
            ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_balances_tenant_account
    ON public.pos_balances (tenant_id, account_id)
    WHERE account_id IS NOT NULL;

-- Idempotent backfill of pos_balances.account_id to standard 1101 (CASH) / 1102 (BANK)
UPDATE public.pos_balances pb
SET account_id = (
    SELECT coa.id
    FROM public.chart_of_accounts coa
    WHERE coa.tenant_id = pb.tenant_id
      AND coa.kode_akun = CASE WHEN UPPER(COALESCE(pb.tipe, '')) = 'CASH' THEN '1101' ELSE '1102' END
    ORDER BY coa.created_at ASC, coa.id ASC
    LIMIT 1
)
WHERE pb.account_id IS NULL;

-- ------------------------------------------------------------------------------
-- 2. ADD RELATIONAL pocket_id TO public.cashflow & BACKFILL EXISTING ROWS
-- ------------------------------------------------------------------------------
ALTER TABLE public.cashflow
    ADD COLUMN IF NOT EXISTS pocket_id UUID;

-- Pass 1: Exact tenant + pos match (prefer matching branch, then HQ/NULL, then oldest)
UPDATE public.cashflow cf
SET pocket_id = (
    SELECT pb.id
    FROM public.pos_balances pb
    WHERE pb.tenant_id = cf.tenant_id
      AND UPPER(TRIM(pb.pos)) = UPPER(TRIM(COALESCE(cf.pos, '')))
    ORDER BY
        (pb.branch_id IS NOT DISTINCT FROM cf.branch_id) DESC,
        (pb.branch_id IS NULL) DESC,
        pb.is_active DESC,
        pb.updated_at ASC,
        pb.id ASC
    LIMIT 1
)
WHERE cf.pocket_id IS NULL
  AND NULLIF(TRIM(COALESCE(cf.pos, '')), '') IS NOT NULL;

-- Pass 2: Normalize orphaned legacy digital aliases ('SALDO REKENING (N)', 'SALDO REKENING OPERASIONAL')
-- onto the tenant's primary active BANK pocket (preferring 'SALDO REKENING Y')
WITH resolved_legacy AS (
    SELECT
        cf.id AS cf_id,
        pb.id AS target_pocket_id,
        pb.pos AS target_pos
    FROM public.cashflow cf
    CROSS JOIN LATERAL (
        SELECT p.id, p.pos
        FROM public.pos_balances p
        WHERE p.tenant_id = cf.tenant_id
          AND UPPER(COALESCE(p.tipe, 'BANK')) = 'BANK'
        ORDER BY
            (p.pos = 'SALDO REKENING Y') DESC,
            (p.branch_id IS NOT DISTINCT FROM cf.branch_id) DESC,
            p.is_active DESC,
            p.updated_at ASC,
            p.id ASC
        LIMIT 1
    ) pb
    WHERE cf.pocket_id IS NULL
      AND UPPER(TRIM(COALESCE(cf.pos, ''))) IN (
          'SALDO REKENING (N)',
          'SALDO REKENING OPERASIONAL',
          'SALDO REKENING N'
      )
)
UPDATE public.cashflow cf
SET pocket_id = rl.target_pocket_id,
    pos = rl.target_pos
FROM resolved_legacy rl
WHERE cf.id = rl.cf_id;

-- Composite cross-tenant FK with ON DELETE RESTRICT (protects pockets with ledger history)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_cashflow_pocket_composite'
          AND conrelid = 'public.cashflow'::regclass
    ) THEN
        ALTER TABLE public.cashflow
            ADD CONSTRAINT fk_cashflow_pocket_composite
            FOREIGN KEY (tenant_id, pocket_id)
            REFERENCES public.pos_balances (tenant_id, id)
            ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cashflow_tenant_pocket
    ON public.cashflow (tenant_id, pocket_id)
    WHERE pocket_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. BIDIRECTIONAL SYNC & RENAME PROPAGATION TRIGGERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_cashflow_pocket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_pocket RECORD;
    v_norm_pos TEXT;
BEGIN
    IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Case A: pocket_id already supplied
    IF NEW.pocket_id IS NOT NULL THEN
        SELECT id, pos
        INTO v_pocket
        FROM public.pos_balances
        WHERE tenant_id = NEW.tenant_id
          AND id = NEW.pocket_id
        LIMIT 1;

        IF FOUND THEN
            -- If a legacy caller updated pos to a different pocket without updating pocket_id,
            -- re-resolve pocket_id from the new pos string (rename propagation keeps them equal).
            IF TG_OP = 'UPDATE'
               AND NEW.pos IS DISTINCT FROM OLD.pos
               AND NEW.pocket_id IS NOT DISTINCT FROM OLD.pocket_id
               AND UPPER(TRIM(COALESCE(NEW.pos, ''))) <> UPPER(TRIM(v_pocket.pos)) THEN
                NEW.pocket_id := NULL;
            ELSE
                NEW.pos := v_pocket.pos;
                RETURN NEW;
            END IF;
        ELSE
            -- Leave invalid/cross-tenant pocket_id intact so composite FK rejects with 23503
            RETURN NEW;
        END IF;
    END IF;

    -- Case B: Resolve pocket_id from pos string (exact match first, then legacy bank alias)
    v_norm_pos := UPPER(TRIM(COALESCE(NEW.pos, '')));
    IF v_norm_pos = '' THEN
        RETURN NEW;
    END IF;

    SELECT id, pos
    INTO v_pocket
    FROM public.pos_balances
    WHERE tenant_id = NEW.tenant_id
      AND UPPER(TRIM(pos)) = v_norm_pos
    ORDER BY
        (branch_id IS NOT DISTINCT FROM NEW.branch_id) DESC,
        (branch_id IS NULL) DESC,
        is_active DESC,
        updated_at ASC,
        id ASC
    LIMIT 1;

    -- shortcut: normalizes legacy hardcoded digital pos strings from fn_execute_checkout / fn_settle_pending_bill;
    -- remove alias fallback once those RPCs pass pocket_id directly.
    IF NOT FOUND AND v_norm_pos IN ('SALDO REKENING (N)', 'SALDO REKENING OPERASIONAL', 'SALDO REKENING N') THEN
        SELECT id, pos
        INTO v_pocket
        FROM public.pos_balances
        WHERE tenant_id = NEW.tenant_id
          AND UPPER(COALESCE(tipe, 'BANK')) = 'BANK'
        ORDER BY
            (pos = 'SALDO REKENING Y') DESC,
            (branch_id IS NOT DISTINCT FROM NEW.branch_id) DESC,
            is_active DESC,
            updated_at ASC,
            id ASC
        LIMIT 1;
    END IF;

    IF FOUND THEN
        NEW.pocket_id := v_pocket.id;
        NEW.pos := v_pocket.pos;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_cashflow_pocket ON public.cashflow;
CREATE TRIGGER trg_sync_cashflow_pocket
    BEFORE INSERT OR UPDATE OF pocket_id, pos ON public.cashflow
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_cashflow_pocket();

CREATE OR REPLACE FUNCTION public.fn_propagate_pocket_rename_to_cashflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF NEW.pos IS DISTINCT FROM OLD.pos AND NULLIF(TRIM(COALESCE(NEW.pos, '')), '') IS NOT NULL THEN
        UPDATE public.cashflow
        SET pos = NEW.pos
        WHERE tenant_id = NEW.tenant_id
          AND pocket_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propagate_pocket_rename_to_cashflow ON public.pos_balances;
CREATE TRIGGER trg_propagate_pocket_rename_to_cashflow
    AFTER UPDATE OF pos ON public.pos_balances
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_propagate_pocket_rename_to_cashflow();

REVOKE ALL ON FUNCTION public.fn_sync_cashflow_pocket() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_propagate_pocket_rename_to_cashflow() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. SINGLE SOURCE OF TRUTH VIEW: public.v_pocket_balances (security_invoker)
--    Contract: pos_balances.balance = opening_balance (never mutated by txs);
--    current_balance = opening_balance + SUM(cashflow.pemasukan - pengeluaran).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pocket_balances
WITH (security_invoker = true) AS
SELECT
    pb.id,
    pb.tenant_id,
    pb.branch_id,
    pb.pos,
    pb.label,
    pb.tipe,
    pb.account_id,
    pb.color,
    pb.keterangan,
    pb.is_active,
    pb.updated_at,
    pb.balance::NUMERIC(18, 4) AS opening_balance,
    COALESCE(cf.total_in, 0.0000)::NUMERIC(18, 4) AS total_in,
    COALESCE(cf.total_out, 0.0000)::NUMERIC(18, 4) AS total_out,
    (pb.balance + COALESCE(cf.net_cashflow, 0.0000))::NUMERIC(18, 4) AS current_balance,
    COALESCE(cf.tx_count, 0)::BIGINT AS tx_count,
    'ERP_BOOK'::TEXT AS balance_source
FROM public.pos_balances pb
LEFT JOIN (
    SELECT
        tenant_id,
        pocket_id,
        SUM(COALESCE(pemasukan, 0)) AS total_in,
        SUM(COALESCE(pengeluaran, 0)) AS total_out,
        SUM(COALESCE(pemasukan, 0) - COALESCE(pengeluaran, 0)) AS net_cashflow,
        COUNT(*) AS tx_count
    FROM public.cashflow
    WHERE pocket_id IS NOT NULL
    GROUP BY tenant_id, pocket_id
) cf ON cf.tenant_id = pb.tenant_id AND cf.pocket_id = pb.id;

REVOKE ALL ON public.v_pocket_balances FROM PUBLIC, anon;
GRANT SELECT ON public.v_pocket_balances TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. ALIGN EXISTING BALANCE RPCs (END DOUBLE-COUNTING & ZERO-BALANCE DRIFT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_cashier_money_exchange(
    p_tenant_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_kasir TEXT DEFAULT 'KASIR',
    p_cash_out NUMERIC DEFAULT 0,
    p_qris_in NUMERIC DEFAULT 0,
    p_customer TEXT DEFAULT 'Umum',
    p_tanggal DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;
    v_cash_out NUMERIC(18, 4) := ROUND(COALESCE(p_cash_out, 0), 4);
    v_qris_in NUMERIC(18, 4) := ROUND(COALESCE(p_qris_in, 0), 4);
    v_admin_fee NUMERIC(18, 4);
    v_customer TEXT := COALESCE(NULLIF(BTRIM(p_customer), ''), 'Umum');
    v_kasir TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_kasir), ''), 'KASIR'));
    v_tanggal DATE := COALESCE(p_tanggal, CURRENT_DATE);
    v_tx_ref TEXT := 'EXCH-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(md5(random()::text), 1, 4));
    v_cash_row RECORD;
    v_bank_row RECORD;
    v_bank_pos TEXT := 'SALDO REKENING Y';
    v_new_cash_bal NUMERIC(18, 4);
    v_new_bank_bal NUMERIC(18, 4);
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles
    WHERE id = v_caller_id;

    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun staf tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL OR (
        v_caller_role <> 'super admin'
        AND v_caller_tenant IS DISTINCT FROM p_tenant_id
        AND NOT EXISTS (
            SELECT 1 FROM public.tenant_memberships m
            WHERE m.user_id = v_caller_id AND m.tenant_id = p_tenant_id
        )
    ) THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses mutasi kas lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role NOT IN ('super admin', 'owner', 'admin pusat', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan mencatat tukar uang.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.fn_assert_active_tenant_license(p_tenant_id);

    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL THEN
        SELECT id INTO v_effective_branch_id
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_active IS TRUE
        ORDER BY is_main DESC NULLS LAST, created_at ASC
        LIMIT 1;
    END IF;

    IF v_caller_role IN ('kasir', 'admin') AND v_caller_branch IS NOT NULL AND v_effective_branch_id IS DISTINCT FROM v_caller_branch THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Peran ini hanya dapat mencatat mutasi pada cabangnya sendiri.' USING ERRCODE = '42501';
    END IF;

    IF v_cash_out <= 0 OR v_qris_in <= 0 THEN
        RAISE EXCEPTION 'INVALID_EXCHANGE_AMOUNT: Nominal uang tunai dan transfer QRIS wajib lebih dari 0.';
    END IF;

    v_admin_fee := v_qris_in - v_cash_out;

    -- Lock or initialize SALDO CASH pocket
    SELECT id, pos, balance INTO v_cash_row
    FROM public.pos_balances
    WHERE tenant_id = p_tenant_id
      AND (pos = 'SALDO CASH' OR UPPER(COALESCE(tipe, '')) = 'CASH')
      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
    ORDER BY (pos = 'SALDO CASH') DESC, (branch_id = v_effective_branch_id) DESC NULLS LAST, updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.pos_balances (tenant_id, branch_id, pos, label, tipe, balance, color, is_active)
        VALUES (p_tenant_id, v_effective_branch_id, 'SALDO CASH', 'Kas Tunai Laci Kasir', 'CASH', 0.0000, 'emerald', TRUE)
        RETURNING id, pos, balance INTO v_cash_row;
    END IF;

    -- Lock or initialize primary BANK pocket
    SELECT id, pos, balance INTO v_bank_row
    FROM public.pos_balances
    WHERE tenant_id = p_tenant_id
      AND UPPER(COALESCE(tipe, 'BANK')) = 'BANK'
      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
    ORDER BY (pos = 'SALDO REKENING Y') DESC, (branch_id = v_effective_branch_id) DESC NULLS LAST, is_active DESC, updated_at ASC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.pos_balances (tenant_id, branch_id, pos, label, tipe, balance, color, is_active)
        VALUES (p_tenant_id, v_effective_branch_id, 'SALDO REKENING Y', 'Rekening QRIS & Transfer Utama', 'BANK', 0.0000, 'blue', TRUE)
        RETURNING id, pos, balance INTO v_bank_row;
    END IF;

    v_bank_pos := v_bank_row.pos;

    INSERT INTO public.cashflow (
        id, tenant_id, branch_id, pocket_id, id_cashflow, id_sumber, tanggal,
        keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
        pos, saldo_kas, apakah_stok, created_at
    ) VALUES
        (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_cash_row.id,
            v_tx_ref || '-CASH', v_tx_ref, v_tanggal,
            'Tukar Uang Cash Keluar (' || v_kasir || ') - Cust: ' || v_customer,
            'Pindah', 'Tukar Uang', 0.0000, v_cash_out,
            v_cash_row.pos, 0.0000, FALSE, NOW()
        ),
        (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_bank_row.id,
            v_tx_ref || '-BANK', v_tx_ref, v_tanggal,
            'Tukar Uang QRIS Masuk (' || v_kasir || ') - Cust: ' || v_customer,
            'Pindah', 'Tukar Uang', v_cash_out, 0.0000,
            v_bank_pos, 0.0000, FALSE, NOW()
        );

    IF v_admin_fee > 0 THEN
        INSERT INTO public.cashflow (
            id, tenant_id, branch_id, pocket_id, id_cashflow, id_sumber, tanggal,
            keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
            pos, saldo_kas, apakah_stok, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_bank_row.id,
            v_tx_ref || '-FEE', v_tx_ref, v_tanggal,
            'Biaya Admin Tukar Uang (' || v_kasir || ') - Cust: ' || v_customer,
            'Pemasukan', 'Pendapatan Lain-lain', v_admin_fee, 0.0000,
            v_bank_pos, 0.0000, FALSE, NOW()
        );
    END IF;

    -- Derive live book balances from opening_balance + cashflow (never mutate pos_balances.balance)
    SELECT v_cash_row.balance + COALESCE(SUM(COALESCE(pemasukan, 0) - COALESCE(pengeluaran, 0)), 0)
    INTO v_new_cash_bal
    FROM public.cashflow
    WHERE tenant_id = p_tenant_id AND pocket_id = v_cash_row.id;

    SELECT v_bank_row.balance + COALESCE(SUM(COALESCE(pemasukan, 0) - COALESCE(pengeluaran, 0)), 0)
    INTO v_new_bank_bal
    FROM public.cashflow
    WHERE tenant_id = p_tenant_id AND pocket_id = v_bank_row.id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'reference_id', v_tx_ref,
        'cash_out', v_cash_out,
        'qris_in', v_qris_in,
        'admin_fee', v_admin_fee,
        'cash_pocket_id', v_cash_row.id,
        'bank_pocket_id', v_bank_row.id,
        'cash_balance', v_new_cash_bal,
        'bank_balance', v_new_bank_bal,
        'bank_pos', v_bank_pos
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_record_cashier_money_exchange(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_record_cashier_money_exchange(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, DATE) TO authenticated, service_role;

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
    v_rows JSONB;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi login diperlukan.' USING ERRCODE = '42501';
    END IF;

    v_role := public.current_user_role();
    IF v_role NOT IN ('Super Admin', 'Owner') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Owner atau Super Admin yang dapat melihat ringkasan konsolidasi.' USING ERRCODE = '42501';
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
            (
                COALESCE((
                    SELECT SUM(COALESCE(pb.balance, 0))
                    FROM public.pos_balances pb
                    WHERE pb.tenant_id = t.id AND pb.is_active IS TRUE
                ), 0)
                + COALESCE((
                    SELECT SUM(COALESCE(cf.pemasukan, 0) - COALESCE(cf.pengeluaran, 0))
                    FROM public.cashflow cf
                    JOIN public.pos_balances pb ON pb.tenant_id = cf.tenant_id AND pb.id = cf.pocket_id
                    WHERE cf.tenant_id = t.id AND pb.is_active IS TRUE
                ), 0)
            ) AS cash_balance
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

COMMIT;
