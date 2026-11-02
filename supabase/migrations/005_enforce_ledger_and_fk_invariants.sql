-- ==============================================================================
-- MIGRATION: 005_enforce_ledger_and_fk_invariants.sql
-- DESCRIPTION: Batch 2 - Data Integrity, Multi-Tenant Invariants & Double-Entry Ledger Hardening
-- TARGETS:
--   - T01: Enforce Composite Foreign Keys (tenant_id + foreign_id) to eliminate cross-tenant IDOR
--   - T03 & T08: Double-Entry Balancing & Immutability Triggers in PostgreSQL (Debit == Credit, count >= 2)
--   - T04: Inventory Non-Negative Check Constraint (stok >= 0)
-- ==============================================================================

-- 1. COMPOSITE UNIQUE CONSTRAINTS FOR MULTI-TENANT ISOLATION
-- Guarantee that each referenced entity has a composite (tenant_id, id) key
DO $$
BEGIN
    -- branches (tenant_id, id)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_branches_tenant_id'
    ) THEN
        ALTER TABLE public.branches ADD CONSTRAINT uq_branches_tenant_id UNIQUE (tenant_id, id);
    END IF;

    -- chart_of_accounts (tenant_id, id)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_chart_of_accounts_tenant_id'
    ) THEN
        ALTER TABLE public.chart_of_accounts ADD CONSTRAINT uq_chart_of_accounts_tenant_id UNIQUE (tenant_id, id);
    END IF;

    -- journal_entries (tenant_id, id)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_journal_entries_tenant_id'
    ) THEN
        ALTER TABLE public.journal_entries ADD CONSTRAINT uq_journal_entries_tenant_id UNIQUE (tenant_id, id);
    END IF;

    -- cashflow (tenant_id, id)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_cashflow_tenant_id'
    ) THEN
        ALTER TABLE public.cashflow ADD CONSTRAINT uq_cashflow_tenant_id UNIQUE (tenant_id, id);
    END IF;

    -- stok_barang (tenant_id, id)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_stok_barang_tenant_id'
    ) THEN
        ALTER TABLE public.stok_barang ADD CONSTRAINT uq_stok_barang_tenant_id UNIQUE (tenant_id, id);
    END IF;
END $$;

-- 2. COMPOSITE FOREIGN KEYS (ELIMINATES CROSS-TENANT REFERENCE IDOR)
DO $$
BEGIN
    -- journal_entry_lines -> journal_entries(tenant_id, id)
    ALTER TABLE public.journal_entry_lines 
        DROP CONSTRAINT IF EXISTS journal_entry_lines_journal_entry_id_fkey,
        DROP CONSTRAINT IF EXISTS fk_journal_entry_lines_parent_composite;
    
    ALTER TABLE public.journal_entry_lines
        ADD CONSTRAINT fk_journal_entry_lines_parent_composite
        FOREIGN KEY (tenant_id, journal_entry_id) 
        REFERENCES public.journal_entries (tenant_id, id) 
        ON DELETE CASCADE;

    -- journal_entry_lines -> chart_of_accounts(tenant_id, id)
    ALTER TABLE public.journal_entry_lines 
        DROP CONSTRAINT IF EXISTS journal_entry_lines_account_id_fkey,
        DROP CONSTRAINT IF EXISTS fk_journal_entry_lines_account_composite;

    ALTER TABLE public.journal_entry_lines
        ADD CONSTRAINT fk_journal_entry_lines_account_composite
        FOREIGN KEY (tenant_id, account_id) 
        REFERENCES public.chart_of_accounts (tenant_id, id) 
        ON DELETE RESTRICT;

    -- pengeluaran -> cashflow(tenant_id, id)
    ALTER TABLE public.pengeluaran
        DROP CONSTRAINT IF EXISTS pengeluaran_id_cashflow_fkey,
        DROP CONSTRAINT IF EXISTS fk_pengeluaran_cashflow_composite;

    ALTER TABLE public.pengeluaran
        ADD CONSTRAINT fk_pengeluaran_cashflow_composite
        FOREIGN KEY (tenant_id, id_cashflow) 
        REFERENCES public.cashflow (tenant_id, id) 
        ON DELETE SET NULL;

    -- pos_balances -> branches(tenant_id, id)
    ALTER TABLE public.pos_balances
        DROP CONSTRAINT IF EXISTS pos_balances_branch_id_fkey,
        DROP CONSTRAINT IF EXISTS fk_pos_balances_branch_composite;

    ALTER TABLE public.pos_balances
        ADD CONSTRAINT fk_pos_balances_branch_composite
        FOREIGN KEY (tenant_id, branch_id) 
        REFERENCES public.branches (tenant_id, id) 
        ON DELETE RESTRICT;

    -- stok_barang -> branches(tenant_id, id)
    ALTER TABLE public.stok_barang
        DROP CONSTRAINT IF EXISTS stok_barang_branch_id_fkey,
        DROP CONSTRAINT IF EXISTS fk_stok_barang_branch_composite;

    ALTER TABLE public.stok_barang
        ADD CONSTRAINT fk_stok_barang_branch_composite
        FOREIGN KEY (tenant_id, branch_id) 
        REFERENCES public.branches (tenant_id, id) 
        ON DELETE RESTRICT;
END $$;

-- 3. INVENTORY NON-NEGATIVE CHECK CONSTRAINT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_stok_barang_non_negative'
    ) THEN
        ALTER TABLE public.stok_barang
            ADD CONSTRAINT chk_stok_barang_non_negative
            CHECK (stok >= 0);
    END IF;
END $$;

-- 4. DOUBLE-ENTRY LEDGER BALANCE & IMMUTABILITY INVARIANTS
-- Function to verify double-entry balancing on commit
CREATE OR REPLACE FUNCTION public.fn_check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_debit NUMERIC;
    v_credit NUMERIC;
    v_count INT;
    v_status VARCHAR;
BEGIN
    SELECT status INTO v_status FROM public.journal_entries WHERE id = NEW.id;
    IF v_status = 'POSTED' THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
        INTO v_debit, v_credit, v_count
        FROM public.journal_entry_lines
        WHERE journal_entry_id = NEW.id;

        IF v_count < 2 THEN
            RAISE EXCEPTION 'Double-entry violation: POSTED Journal entry % must contain at least 2 lines (found %)', NEW.id, v_count;
        END IF;

        IF v_debit <= 0 OR v_credit <= 0 THEN
            RAISE EXCEPTION 'Double-entry violation: POSTED Journal entry % debit and credit amounts must be strictly positive', NEW.id;
        END IF;

        IF v_debit <> v_credit THEN
            RAISE EXCEPTION 'Double-entry violation: POSTED Journal entry % is out of balance. Total Debit: %, Total Credit: %', NEW.id, v_debit, v_credit;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Function to check journal lines mutation & maintain immutability
CREATE OR REPLACE FUNCTION public.fn_check_journal_lines_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_target_id UUID;
    v_status VARCHAR;
    v_debit NUMERIC;
    v_credit NUMERIC;
    v_count INT;
BEGIN
    v_target_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
    SELECT status INTO v_status FROM public.journal_entries WHERE id = v_target_id;
    
    IF v_status = 'POSTED' THEN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
        INTO v_debit, v_credit, v_count
        FROM public.journal_entry_lines
        WHERE journal_entry_id = v_target_id;

        IF v_count < 2 OR v_debit <> v_credit OR v_debit <= 0 THEN
            RAISE EXCEPTION 'Double-entry violation: Modifying lines of POSTED Journal entry % resulted in an invalid state. Debit: %, Credit: %, Lines: %', v_target_id, v_debit, v_credit, v_count;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Constraint Trigger on journal_entries (deferred to transaction commit)
DROP TRIGGER IF EXISTS trg_defer_check_journal_balance ON public.journal_entries;
CREATE CONSTRAINT TRIGGER trg_defer_check_journal_balance
AFTER INSERT OR UPDATE OF status, total_amount ON public.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_journal_balance();

-- Constraint Trigger on journal_entry_lines (deferred to transaction commit)
DROP TRIGGER IF EXISTS trg_defer_check_lines_balance ON public.journal_entry_lines;
CREATE CONSTRAINT TRIGGER trg_defer_check_lines_balance
AFTER INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_journal_lines_balance();
