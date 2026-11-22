-- ==============================================================================
-- MIGRATION: 20261123000003_bank_mandiri_email_integration_foundation.sql
-- PURPOSE  : Bank Mandiri Outgoing Notification Email Integration (/ponytail):
--            1. Canonical email identity normalizer (strips Gmail dots & +tag).
--            2. 5 core tables:
--               - bank_email_connections (1 Gmail/Inbound -> N bank accounts)
--               - bank_email_connection_secrets (server-only private vault table)
--               - bank_account_bindings (account_last4 -> pos_balances.id pocket_id)
--               - bank_email_messages (idempotent raw message ingestion log)
--               - bank_transaction_drafts (review inbox + atomic posting outcome)
--            3. Cross-tenant Gmail hijack protection trigger.
--            4. RPC fn_ingest_mandiri_normalized_tx (idempotent ingest & pocket routing).
--            5. RPC fn_post_bank_transaction_draft (ACID FOR UPDATE financial posting).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CANONICAL EMAIL IDENTITY NORMALIZER (GMAIL DOT / +TAG / GOOGLEMAIL ALIAS)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_normalize_email_identity(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_email IS NULL OR btrim(p_email) = '' THEN ''
        WHEN split_part(lower(btrim(p_email)), '@', 2) IN ('gmail.com', 'googlemail.com') THEN
            replace(split_part(split_part(lower(btrim(p_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
        ELSE
            lower(btrim(p_email))
    END;
$$;

-- ------------------------------------------------------------------------------
-- 2. TABLE 1: public.bank_email_connections
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_email_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider VARCHAR(30) NOT NULL DEFAULT 'GMAIL_OAUTH'
        CHECK (provider IN ('GMAIL_OAUTH', 'INBOUND_FORWARD', 'MANUAL_EML')),
    provider_account_id TEXT NOT NULL,
    email_address TEXT NOT NULL,
    normalized_email TEXT GENERATED ALWAYS AS (public.fn_normalize_email_identity(email_address)) STORED,
    status VARCHAR(25) NOT NULL DEFAULT 'CONNECTED'
        CHECK (status IN ('CONNECTED', 'REAUTH_REQUIRED', 'PAUSED', 'DISCONNECTED')),
    sync_cursor TEXT,
    last_synced_at TIMESTAMPTZ,
    last_error TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_email_connections_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_bank_email_connections_tenant_provider_acct UNIQUE (tenant_id, provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_email_connections_created_by
    ON public.bank_email_connections (created_by)
    WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_email_connections_norm_email
    ON public.bank_email_connections (normalized_email)
    WHERE status <> 'DISCONNECTED';

CREATE INDEX IF NOT EXISTS idx_bank_email_connections_provider_acct
    ON public.bank_email_connections (provider, provider_account_id)
    WHERE status <> 'DISCONNECTED';

-- ------------------------------------------------------------------------------
-- 3. TABLE 2: public.bank_email_connection_secrets (SERVER-ONLY PRIVATE TABLE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_email_connection_secrets (
    connection_id UUID PRIMARY KEY REFERENCES public.bank_email_connections(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    encrypted_refresh_token TEXT,
    encrypted_access_token TEXT,
    token_expires_at TIMESTAMPTZ,
    oauth_state_hash TEXT,
    inbound_webhook_secret TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_email_secrets_tenant
    ON public.bank_email_connection_secrets (tenant_id);

ALTER TABLE public.bank_email_connection_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bank_email_connection_secrets FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS bank_email_secrets_deny_client ON public.bank_email_connection_secrets;
CREATE POLICY bank_email_secrets_deny_client
    ON public.bank_email_connection_secrets
    FOR ALL
    TO authenticated
    USING (FALSE)
    WITH CHECK (FALSE);

-- ------------------------------------------------------------------------------
-- 4. TABLE 3: public.bank_account_bindings (1 CONNECTION -> N BANK ACCOUNTS/POCKETS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_account_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL,
    bank_code VARCHAR(30) NOT NULL DEFAULT 'MANDIRI'
        CHECK (bank_code IN ('MANDIRI')),
    account_last4 VARCHAR(10) NOT NULL
        CHECK (account_last4 ~ '^[0-9]{4}$'),
    account_label_hint TEXT,
    pocket_id UUID NOT NULL,
    import_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_default_for_last4 BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_account_bindings_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_bank_bindings_connection_composite
        FOREIGN KEY (tenant_id, connection_id)
        REFERENCES public.bank_email_connections(tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_bank_bindings_pocket_composite
        FOREIGN KEY (tenant_id, pocket_id)
        REFERENCES public.pos_balances(tenant_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bank_account_bindings_conn
    ON public.bank_account_bindings (tenant_id, connection_id);

CREATE INDEX IF NOT EXISTS idx_bank_account_bindings_pocket
    ON public.bank_account_bindings (tenant_id, pocket_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_binding_active_conn_last4_pocket
    ON public.bank_account_bindings (tenant_id, connection_id, bank_code, account_last4, pocket_id)
    WHERE is_active = TRUE;

-- ------------------------------------------------------------------------------
-- 5. TABLE 4: public.bank_email_messages (IDEMPOTENT RAW INGESTION LOG)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_email_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL,
    provider_message_id TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    sender_email TEXT NOT NULL,
    sender_verified BOOLEAN NOT NULL DEFAULT FALSE,
    subject TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    parse_status VARCHAR(35) NOT NULL DEFAULT 'PARSED'
        CHECK (parse_status IN (
            'PARSED',
            'NEEDS_MANUAL_REVIEW',
            'IGNORED_UNBOUND_ACCOUNT',
            'IGNORED_NON_OUTGOING',
            'IGNORED_BEFORE_START_DATE',
            'PARSE_FAILED'
        )),
    parser_version VARCHAR(50),
    parse_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_email_messages_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_bank_email_messages_conn_msg UNIQUE (connection_id, provider_message_id),
    CONSTRAINT fk_bank_messages_connection_composite
        FOREIGN KEY (tenant_id, connection_id)
        REFERENCES public.bank_email_connections(tenant_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bank_email_messages_conn
    ON public.bank_email_messages (tenant_id, connection_id, received_at DESC);

-- ------------------------------------------------------------------------------
-- 6. TABLE 5: public.bank_transaction_drafts (INBOX DRAFTS & ATOMIC POSTING STATE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_transaction_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    connection_id UUID NOT NULL,
    source_message_id UUID NOT NULL,
    binding_id UUID,
    pocket_id UUID,
    bank_code VARCHAR(30) NOT NULL DEFAULT 'MANDIRI',
    direction VARCHAR(10) NOT NULL DEFAULT 'OUT'
        CHECK (direction = 'OUT'),
    tx_type VARCHAR(30) NOT NULL DEFAULT 'TRANSFER'
        CHECK (tx_type IN ('TRANSFER', 'QRIS', 'BILL_PAYMENT', 'VA', 'TOPUP')),
    currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
    principal_amount NUMERIC(18, 4) NOT NULL CHECK (principal_amount >= 0),
    fee_amount NUMERIC(18, 4) CHECK (fee_amount IS NULL OR fee_amount >= 0),
    total_debit NUMERIC(18, 4) NOT NULL CHECK (total_debit > 0),
    occurred_at TIMESTAMPTZ NOT NULL,
    book_date DATE NOT NULL,
    bank_reference TEXT,
    counterparty_name TEXT,
    account_last4 VARCHAR(10),
    parser_version VARCHAR(50) NOT NULL,
    suggested_jenis TEXT NOT NULL DEFAULT 'Pengeluaran Bersama',
    suggested_kategori TEXT NOT NULL DEFAULT 'Biaya Operasional Lainnya',
    review_status VARCHAR(25) NOT NULL DEFAULT 'NEEDS_REVIEW'
        CHECK (review_status IN ('NEEDS_REVIEW', 'READY', 'POSTED', 'DUPLICATE', 'IGNORED')),
    review_reason TEXT,
    duplicate_candidate_cashflow_id UUID,
    ignore_reason TEXT,
    version INT NOT NULL DEFAULT 1,
    posting_action VARCHAR(35)
        CHECK (posting_action IS NULL OR posting_action IN (
            'RECORD_EXPENSE',
            'TRANSFER_POCKET',
            'LINK_EXISTING_CASHFLOW',
            'IGNORE'
        )),
    posted_cashflow_id UUID,
    posted_transfer_pair_cashflow_id UUID,
    posted_journal_id UUID,
    linked_cashflow_id UUID,
    idempotency_key TEXT,
    posted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_bank_transaction_drafts_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_bank_tx_drafts_source_msg UNIQUE (tenant_id, source_message_id),
    CONSTRAINT fk_bank_drafts_connection_composite
        FOREIGN KEY (tenant_id, connection_id)
        REFERENCES public.bank_email_connections(tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_bank_drafts_message_composite
        FOREIGN KEY (tenant_id, source_message_id)
        REFERENCES public.bank_email_messages(tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_bank_drafts_binding_composite
        FOREIGN KEY (tenant_id, binding_id)
        REFERENCES public.bank_account_bindings(tenant_id, id)
        ON DELETE SET NULL,
    CONSTRAINT fk_bank_drafts_pocket_composite
        FOREIGN KEY (tenant_id, pocket_id)
        REFERENCES public.pos_balances(tenant_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_drafts_branch
    ON public.bank_transaction_drafts (branch_id)
    WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_drafts_conn
    ON public.bank_transaction_drafts (tenant_id, connection_id);

CREATE INDEX IF NOT EXISTS idx_bank_tx_drafts_binding
    ON public.bank_transaction_drafts (tenant_id, binding_id)
    WHERE binding_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_drafts_pocket
    ON public.bank_transaction_drafts (tenant_id, pocket_id)
    WHERE pocket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_drafts_posted_by
    ON public.bank_transaction_drafts (posted_by)
    WHERE posted_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_drafts_status_date
    ON public.bank_transaction_drafts (tenant_id, review_status, occurred_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_tx_drafts_tenant_idempotency
    ON public.bank_transaction_drafts (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 7. CROSS-TENANT GMAIL HIJACK GUARD TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_guard_bank_email_connection_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_norm_email TEXT;
    v_conflict_tenant UUID;
    v_caller_uid UUID := auth.uid();
    v_caller_role TEXT := public.current_user_role();
    v_same_owner BOOLEAN := FALSE;
BEGIN
    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := public.current_tenant_id();
    END IF;

    IF NEW.created_by IS NULL AND v_caller_uid IS NOT NULL THEN
        NEW.created_by := v_caller_uid;
    END IF;

    IF COALESCE(NEW.status, 'CONNECTED') = 'DISCONNECTED' THEN
        RETURN NEW;
    END IF;

    v_norm_email := public.fn_normalize_email_identity(NEW.email_address);

    SELECT c.tenant_id INTO v_conflict_tenant
    FROM public.bank_email_connections c
    WHERE c.tenant_id <> NEW.tenant_id
      AND c.status <> 'DISCONNECTED'
      AND (
          c.normalized_email = v_norm_email
          OR (c.provider = NEW.provider AND c.provider_account_id = NEW.provider_account_id)
      )
    LIMIT 1;

    IF v_conflict_tenant IS NOT NULL THEN
        IF v_caller_role = 'Super Admin' THEN
            v_same_owner := TRUE;
        ELSIF v_caller_uid IS NOT NULL THEN
            SELECT (
                EXISTS (
                    SELECT 1 FROM public.tenant_memberships m1
                    WHERE m1.user_id = v_caller_uid AND m1.tenant_id = NEW.tenant_id AND UPPER(COALESCE(m1.role, '')) = 'OWNER'
                )
                AND EXISTS (
                    SELECT 1 FROM public.tenant_memberships m2
                    WHERE m2.user_id = v_caller_uid AND m2.tenant_id = v_conflict_tenant AND UPPER(COALESCE(m2.role, '')) = 'OWNER'
                )
            ) INTO v_same_owner;
        END IF;

        IF NOT COALESCE(v_same_owner, FALSE) THEN
            RAISE EXCEPTION 'EMAIL_ALREADY_BOUND_TO_OTHER_TENANT: Akun email ini sudah terhubung ke organisasi/toko lain di ERPPoss.'
                USING ERRCODE = '23505';
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_guard_bank_email_connection_ownership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_bank_email_connection_ownership ON public.bank_email_connections;
CREATE TRIGGER trg_guard_bank_email_connection_ownership
    BEFORE INSERT OR UPDATE OF email_address, provider_account_id, status, tenant_id
    ON public.bank_email_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_guard_bank_email_connection_ownership();

-- ------------------------------------------------------------------------------
-- 8. ROW-LEVEL SECURITY POLICIES (INITPLAN OPTIMIZED)
-- ------------------------------------------------------------------------------
ALTER TABLE public.bank_email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_account_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transaction_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_email_connections_tenant_policy ON public.bank_email_connections;
CREATE POLICY bank_email_connections_tenant_policy
    ON public.bank_email_connections
    FOR ALL
    TO authenticated
    USING (
        (SELECT public.current_user_role()) = 'Super Admin'
        OR (
            tenant_id = (SELECT public.current_tenant_id())
            AND (SELECT public.fn_is_management_role())
        )
    )
    WITH CHECK (
        (SELECT public.current_user_role()) = 'Super Admin'
        OR (
            tenant_id = (SELECT public.current_tenant_id())
            AND (SELECT public.fn_is_tenant_wide_manager())
        )
    );

DROP POLICY IF EXISTS bank_account_bindings_tenant_policy ON public.bank_account_bindings;
CREATE POLICY bank_account_bindings_tenant_policy
    ON public.bank_account_bindings
    FOR ALL
    TO authenticated
    USING (
        (SELECT public.current_user_role()) = 'Super Admin'
        OR (
            tenant_id = (SELECT public.current_tenant_id())
            AND (
                (SELECT public.fn_is_tenant_wide_manager())
                OR (
                    (SELECT public.current_user_role()) = 'Admin'
                    AND EXISTS (
                        SELECT 1 FROM public.pos_balances pb
                        WHERE pb.tenant_id = bank_account_bindings.tenant_id
                          AND pb.id = bank_account_bindings.pocket_id
                          AND pb.branch_id = (SELECT public.current_branch_id())
                    )
                )
            )
        )
    )
    WITH CHECK (
        (SELECT public.current_user_role()) = 'Super Admin'
        OR (
            tenant_id = (SELECT public.current_tenant_id())
            AND (SELECT public.fn_is_tenant_wide_manager())
        )
    );

DROP POLICY IF EXISTS bank_email_messages_tenant_policy ON public.bank_email_messages;
CREATE POLICY bank_email_messages_tenant_policy
    ON public.bank_email_messages
    FOR ALL
    TO authenticated
    USING (
        (SELECT public.current_user_role()) = 'Super Admin'
        OR (
            tenant_id = (SELECT public.current_tenant_id())
            AND (SELECT public.fn_is_tenant_wide_manager())
        )
    )
    WITH CHECK (
        (SELECT public.current_user_role()) = 'Super Admin'
        OR (
            tenant_id = (SELECT public.current_tenant_id())
            AND (SELECT public.fn_is_tenant_wide_manager())
        )
    );

DROP POLICY IF EXISTS bank_transaction_drafts_branch_policy ON public.bank_transaction_drafts;
CREATE POLICY bank_transaction_drafts_branch_policy
    ON public.bank_transaction_drafts
    FOR ALL
    TO authenticated
    USING (
        (SELECT public.fn_is_management_role())
        AND (SELECT public.fn_has_operational_branch_access(tenant_id, branch_id))
    )
    WITH CHECK (
        (SELECT public.fn_is_management_role())
        AND (SELECT public.fn_has_operational_branch_access(tenant_id, branch_id))
    );

-- ------------------------------------------------------------------------------
-- 9. RPC 1: public.fn_ingest_mandiri_normalized_tx
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ingest_mandiri_normalized_tx(
    p_connection_id UUID,
    p_provider_message_id TEXT,
    p_sender_email TEXT,
    p_sender_verified BOOLEAN DEFAULT TRUE,
    p_subject TEXT DEFAULT '',
    p_received_at TIMESTAMPTZ DEFAULT NOW(),
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_caller_role TEXT := public.current_user_role();
    v_caller_tenant UUID := public.current_tenant_id();
    v_conn RECORD;
    v_existing_msg_id UUID;
    v_existing_draft RECORD;
    v_msg_id UUID := gen_random_uuid();
    v_draft_id UUID := gen_random_uuid();

    v_tx_status TEXT := UPPER(COALESCE(p_payload->>'transaction_status', 'SUCCESS'));
    v_direction TEXT := UPPER(COALESCE(p_payload->>'direction', 'OUT'));
    v_bank_code TEXT := UPPER(COALESCE(p_payload->>'bank_code', p_payload->>'bank', 'MANDIRI'));
    v_tx_type TEXT := UPPER(COALESCE(p_payload->>'tx_type', 'TRANSFER'));
    v_last4 TEXT := NULLIF(BTRIM(COALESCE(p_payload->>'account_last4', '')), '');
    v_principal NUMERIC(18, 4) := COALESCE(NULLIF(p_payload->>'principal_amount', '')::numeric, 0);
    v_fee NUMERIC(18, 4) := NULLIF(p_payload->>'fee_amount', '')::numeric;
    v_total_debit NUMERIC(18, 4) := COALESCE(NULLIF(p_payload->>'total_debit', '')::numeric, v_principal + COALESCE(v_fee, 0));
    v_occurred_at TIMESTAMPTZ := COALESCE(NULLIF(p_payload->>'occurred_at', '')::timestamptz, COALESCE(p_received_at, NOW()));
    v_book_date DATE := COALESCE(NULLIF(p_payload->>'book_date', '')::date, v_occurred_at::date);
    v_bank_ref TEXT := NULLIF(BTRIM(COALESCE(p_payload->>'bank_reference', '')), '');
    v_counterparty TEXT := NULLIF(BTRIM(COALESCE(p_payload->>'counterparty_name', '')), '');
    v_parser_ver TEXT := COALESCE(NULLIF(BTRIM(p_payload->>'parser_version'), ''), 'mandiri_transfer_v1');
    v_sug_jenis TEXT := COALESCE(NULLIF(BTRIM(p_payload->>'suggested_jenis'), ''), 'Pengeluaran Bersama');
    v_sug_kat TEXT := COALESCE(NULLIF(BTRIM(p_payload->>'suggested_kategori'), ''), 'Biaya Operasional Lainnya');

    v_match_count INT := 0;
    v_total_active_bindings INT := 0;
    v_matched_binding RECORD;
    v_target_pocket_id UUID := NULL;
    v_target_branch_id UUID := NULL;
    v_target_binding_id UUID := NULL;
    v_review_status TEXT := 'NEEDS_REVIEW';
    v_review_reason TEXT := NULL;
    v_dup_cf_id UUID := NULL;
BEGIN
    SELECT id, tenant_id, status
    INTO v_conn
    FROM public.bank_email_connections
    WHERE id = p_connection_id
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CONNECTION_NOT_FOUND: Koneksi email tidak ditemukan.' USING ERRCODE = '23503';
    END IF;

    IF v_caller_role <> 'Super Admin' AND (
        v_caller_tenant IS DISTINCT FROM v_conn.tenant_id
        OR v_caller_role NOT IN ('Owner', 'Admin Pusat', 'Admin')
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Tidak memiliki akses ingest pada koneksi email ini.' USING ERRCODE = '42501';
    END IF;

    -- Layer 1 Dedup: Check if (connection_id, provider_message_id) already exists
    SELECT id INTO v_existing_msg_id
    FROM public.bank_email_messages
    WHERE connection_id = p_connection_id
      AND provider_message_id = p_provider_message_id
    LIMIT 1;

    IF v_existing_msg_id IS NOT NULL THEN
        SELECT id, review_status, review_reason, pocket_id, branch_id
        INTO v_existing_draft
        FROM public.bank_transaction_drafts
        WHERE tenant_id = v_conn.tenant_id AND source_message_id = v_existing_msg_id
        LIMIT 1;

        RETURN jsonb_build_object(
            'status', 'ALREADY_INGESTED',
            'idempotent_replay', TRUE,
            'message_id', v_existing_msg_id,
            'draft_id', v_existing_draft.id,
            'review_status', v_existing_draft.review_status,
            'pocket_id', v_existing_draft.pocket_id,
            'branch_id', v_existing_draft.branch_id
        );
    END IF;

    -- Non-outgoing or failed/pending transaction -> record message as IGNORED_NON_OUTGOING
    IF v_tx_status <> 'SUCCESS' OR v_direction <> 'OUT' OR v_total_debit <= 0 THEN
        INSERT INTO public.bank_email_messages (
            id, tenant_id, connection_id, provider_message_id, content_sha256,
            sender_email, sender_verified, subject, received_at, parse_status, parser_version
        ) VALUES (
            v_msg_id, v_conn.tenant_id, p_connection_id, p_provider_message_id,
            md5(COALESCE(p_provider_message_id, '') || COALESCE(p_subject, '')),
            COALESCE(p_sender_email, ''), COALESCE(p_sender_verified, FALSE), p_subject,
            COALESCE(p_received_at, NOW()), 'IGNORED_NON_OUTGOING', v_parser_ver
        );

        RETURN jsonb_build_object(
            'status', 'IGNORED_NON_OUTGOING',
            'message_id', v_msg_id
        );
    END IF;

    -- Count active bindings under this connection
    SELECT COUNT(*) INTO v_total_active_bindings
    FROM public.bank_account_bindings
    WHERE tenant_id = v_conn.tenant_id
      AND connection_id = p_connection_id
      AND bank_code = v_bank_code
      AND is_active IS TRUE;

    IF v_last4 IS NOT NULL THEN
        SELECT COUNT(*) INTO v_match_count
        FROM public.bank_account_bindings
        WHERE tenant_id = v_conn.tenant_id
          AND connection_id = p_connection_id
          AND bank_code = v_bank_code
          AND account_last4 = v_last4
          AND is_active IS TRUE;
    END IF;

    -- Personal / unregistered account on the same Gmail -> ignore cleanly
    IF v_match_count = 0 AND v_total_active_bindings > 0 AND v_last4 IS NOT NULL THEN
        INSERT INTO public.bank_email_messages (
            id, tenant_id, connection_id, provider_message_id, content_sha256,
            sender_email, sender_verified, subject, received_at, parse_status, parser_version
        ) VALUES (
            v_msg_id, v_conn.tenant_id, p_connection_id, p_provider_message_id,
            md5(COALESCE(p_provider_message_id, '') || COALESCE(v_last4, '')),
            COALESCE(p_sender_email, ''), COALESCE(p_sender_verified, FALSE), p_subject,
            COALESCE(p_received_at, NOW()), 'IGNORED_UNBOUND_ACCOUNT', v_parser_ver
        );

        RETURN jsonb_build_object(
            'status', 'IGNORED_UNBOUND_ACCOUNT',
            'message_id', v_msg_id,
            'account_last4', v_last4
        );
    END IF;

    IF v_match_count = 1 THEN
        SELECT b.id, b.pocket_id, b.import_start_date, pb.branch_id
        INTO v_matched_binding
        FROM public.bank_account_bindings b
        JOIN public.pos_balances pb ON pb.tenant_id = b.tenant_id AND pb.id = b.pocket_id
        WHERE b.tenant_id = v_conn.tenant_id
          AND b.connection_id = p_connection_id
          AND b.bank_code = v_bank_code
          AND b.account_last4 = v_last4
          AND b.is_active IS TRUE
        LIMIT 1;

        IF v_matched_binding.import_start_date IS NOT NULL AND v_book_date < v_matched_binding.import_start_date THEN
            INSERT INTO public.bank_email_messages (
                id, tenant_id, connection_id, provider_message_id, content_sha256,
                sender_email, sender_verified, subject, received_at, parse_status, parser_version
            ) VALUES (
                v_msg_id, v_conn.tenant_id, p_connection_id, p_provider_message_id,
                md5(COALESCE(p_provider_message_id, '') || COALESCE(v_book_date::text, '')),
                COALESCE(p_sender_email, ''), COALESCE(p_sender_verified, FALSE), p_subject,
                COALESCE(p_received_at, NOW()), 'IGNORED_BEFORE_START_DATE', v_parser_ver
            );

            RETURN jsonb_build_object(
                'status', 'IGNORED_BEFORE_START_DATE',
                'message_id', v_msg_id
            );
        END IF;

        v_target_binding_id := v_matched_binding.id;
        v_target_pocket_id := v_matched_binding.pocket_id;
        v_target_branch_id := v_matched_binding.branch_id;
        v_review_status := 'READY';
        v_review_reason := 'READY_AUTO_MATCHED';
    ELSIF v_match_count > 1 THEN
        -- 1 physical account shared across multiple pockets in the same tenant -> suggest default but force NEEDS_REVIEW
        SELECT b.id, b.pocket_id, pb.branch_id
        INTO v_matched_binding
        FROM public.bank_account_bindings b
        JOIN public.pos_balances pb ON pb.tenant_id = b.tenant_id AND pb.id = b.pocket_id
        WHERE b.tenant_id = v_conn.tenant_id
          AND b.connection_id = p_connection_id
          AND b.bank_code = v_bank_code
          AND b.account_last4 = v_last4
          AND b.is_active IS TRUE
        ORDER BY b.is_default_for_last4 DESC, b.created_at ASC
        LIMIT 1;

        v_target_binding_id := v_matched_binding.id;
        v_target_pocket_id := NULL; -- Force explicit confirmation at posting time
        v_target_branch_id := NULL;
        v_review_status := 'NEEDS_REVIEW';
        v_review_reason := 'AMBIGUOUS_POCKET';
    ELSE
        v_review_status := 'NEEDS_REVIEW';
        v_review_reason := 'UNRECOGNIZED_ACCOUNT';
    END IF;

    -- Layer 2 & 3 Duplicate Signal Check against existing drafts or manual cashflow
    IF v_bank_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.bank_transaction_drafts d
        WHERE d.tenant_id = v_conn.tenant_id
          AND d.bank_code = v_bank_code
          AND d.bank_reference = v_bank_ref
          AND d.review_status <> 'IGNORED'
    ) THEN
        v_review_status := 'NEEDS_REVIEW';
        v_review_reason := 'POSSIBLE_DUPLICATE';
    ELSIF v_target_pocket_id IS NOT NULL THEN
        SELECT cf.id INTO v_dup_cf_id
        FROM public.cashflow cf
        WHERE cf.tenant_id = v_conn.tenant_id
          AND cf.pocket_id = v_target_pocket_id
          AND cf.tanggal = v_book_date
          AND COALESCE(cf.pengeluaran, 0) = v_total_debit
        ORDER BY cf.created_at DESC
        LIMIT 1;

        IF v_dup_cf_id IS NOT NULL THEN
            v_review_status := 'NEEDS_REVIEW';
            v_review_reason := 'POSSIBLE_DUPLICATE';
        END IF;
    END IF;

    IF p_sender_verified IS NOT TRUE THEN
        v_review_status := 'NEEDS_REVIEW';
        v_review_reason := COALESCE(v_review_reason, 'UNVERIFIED_SENDER');
    END IF;

    INSERT INTO public.bank_email_messages (
        id, tenant_id, connection_id, provider_message_id, content_sha256,
        sender_email, sender_verified, subject, received_at, parse_status, parser_version
    ) VALUES (
        v_msg_id, v_conn.tenant_id, p_connection_id, p_provider_message_id,
        md5(COALESCE(p_provider_message_id, '') || COALESCE(v_bank_ref, '') || v_total_debit::text),
        COALESCE(p_sender_email, ''), COALESCE(p_sender_verified, FALSE), p_subject,
        COALESCE(p_received_at, NOW()), 'PARSED', v_parser_ver
    );

    INSERT INTO public.bank_transaction_drafts (
        id, tenant_id, branch_id, connection_id, source_message_id, binding_id, pocket_id,
        bank_code, direction, tx_type, currency, principal_amount, fee_amount, total_debit,
        occurred_at, book_date, bank_reference, counterparty_name, account_last4, parser_version,
        suggested_jenis, suggested_kategori, review_status, review_reason, duplicate_candidate_cashflow_id
    ) VALUES (
        v_draft_id, v_conn.tenant_id, v_target_branch_id, p_connection_id, v_msg_id, v_target_binding_id, v_target_pocket_id,
        v_bank_code, 'OUT', CASE WHEN v_tx_type IN ('TRANSFER', 'QRIS', 'BILL_PAYMENT', 'VA', 'TOPUP') THEN v_tx_type ELSE 'TRANSFER' END,
        'IDR', v_principal, v_fee, v_total_debit,
        v_occurred_at, v_book_date, v_bank_ref, v_counterparty, v_last4, v_parser_ver,
        v_sug_jenis, v_sug_kat, v_review_status, v_review_reason, v_dup_cf_id
    );

    UPDATE public.bank_email_connections
    SET last_synced_at = NOW(), updated_at = NOW()
    WHERE id = p_connection_id;

    RETURN jsonb_build_object(
        'status', 'DRAFT_CREATED',
        'message_id', v_msg_id,
        'draft_id', v_draft_id,
        'review_status', v_review_status,
        'review_reason', v_review_reason,
        'pocket_id', v_target_pocket_id,
        'branch_id', v_target_branch_id,
        'duplicate_candidate_cashflow_id', v_dup_cf_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ingest_mandiri_normalized_tx(UUID, TEXT, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ingest_mandiri_normalized_tx(UUID, TEXT, TEXT, BOOLEAN, TEXT, TIMESTAMPTZ, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. RPC 2: public.fn_post_bank_transaction_draft (ATOMIC FINANCIAL POSTING)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_post_bank_transaction_draft(
    p_draft_id UUID,
    p_expected_version INT DEFAULT 1,
    p_action TEXT DEFAULT 'RECORD_EXPENSE',
    p_pocket_id UUID DEFAULT NULL,
    p_jenis TEXT DEFAULT NULL,
    p_kategori TEXT DEFAULT NULL,
    p_keterangan TEXT DEFAULT NULL,
    p_destination_pocket_id UUID DEFAULT NULL,
    p_existing_cashflow_id UUID DEFAULT NULL,
    p_ignore_reason TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_caller_uid UUID := auth.uid();
    v_caller_role TEXT := public.current_user_role();
    v_caller_tenant UUID := public.current_tenant_id();
    v_caller_branch UUID := public.current_branch_id();
    v_draft RECORD;
    v_pocket RECORD;
    v_dest_pocket RECORD;
    v_existing_cf RECORD;
    v_action TEXT := UPPER(BTRIM(COALESCE(p_action, 'RECORD_EXPENSE')));
    v_target_pocket_id UUID;
    v_effective_branch_id UUID;
    v_amount NUMERIC(18, 4);
    v_jenis TEXT;
    v_kategori TEXT;
    v_ket TEXT;
    v_cf_id UUID := gen_random_uuid();
    v_pair_cf_id UUID := NULL;
    v_journal_id UUID := NULL;
    v_coa_debit UUID := NULL;
    v_coa_credit UUID := NULL;
BEGIN
    IF v_caller_uid IS NULL OR v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin Pusat', 'Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Owner, Admin Pusat, atau Admin Cabang yang dapat memproses draft mutasi bank.'
            USING ERRCODE = '42501';
    END IF;

    -- 1. Lock draft row FOR UPDATE
    SELECT *
    INTO v_draft
    FROM public.bank_transaction_drafts
    WHERE id = p_draft_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DRAFT_NOT_FOUND: Draft transaksi bank tidak ditemukan.' USING ERRCODE = '23503';
    END IF;

    IF v_caller_role <> 'Super Admin' AND v_draft.tenant_id IS DISTINCT FROM v_caller_tenant THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.fn_assert_active_tenant_license(v_draft.tenant_id);

    -- 2. Idempotent Replay Check
    IF v_draft.review_status = 'POSTED' THEN
        IF p_idempotency_key IS NOT NULL AND v_draft.idempotency_key = p_idempotency_key THEN
            RETURN jsonb_build_object(
                'status', 'POSTED',
                'idempotent_replay', TRUE,
                'draft_id', v_draft.id,
                'posting_action', v_draft.posting_action,
                'posted_amount', v_draft.total_debit,
                'posted_cashflow_id', v_draft.posted_cashflow_id,
                'posted_transfer_pair_cashflow_id', v_draft.posted_transfer_pair_cashflow_id,
                'posted_journal_id', v_draft.posted_journal_id,
                'linked_cashflow_id', v_draft.linked_cashflow_id
            );
        END IF;
        RAISE EXCEPTION 'ALREADY_POSTED: Draft transaksi ini sudah pernah diposting.' USING ERRCODE = '23505';
    END IF;

    -- 3. Optimistic Concurrency Lock Check
    IF p_expected_version IS NOT NULL AND v_draft.version <> p_expected_version THEN
        RAISE EXCEPTION 'VERSION_CONFLICT: Draft telah berubah (expected %, actual %). Muat ulang halaman.', p_expected_version, v_draft.version
            USING ERRCODE = '40001';
    END IF;

    -- 4. Handle IGNORE action early
    IF v_action = 'IGNORE' THEN
        IF NULLIF(BTRIM(COALESCE(p_ignore_reason, '')), '') IS NULL THEN
            RAISE EXCEPTION 'IGNORE_REASON_REQUIRED: Alasan pengabaian wajib diisi.' USING ERRCODE = '22023';
        END IF;

        IF v_caller_role = 'Admin' AND v_draft.branch_id IS DISTINCT FROM v_caller_branch THEN
            RAISE EXCEPTION 'BRANCH_FORBIDDEN: Admin Cabang hanya dapat mengabaikan draft cabangnya sendiri.' USING ERRCODE = '42501';
        END IF;

        UPDATE public.bank_transaction_drafts
        SET review_status = 'IGNORED',
            posting_action = 'IGNORE',
            ignore_reason = BTRIM(p_ignore_reason),
            idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
            posted_by = v_caller_uid,
            posted_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_draft.id;

        RETURN jsonb_build_object(
            'status', 'IGNORED',
            'draft_id', v_draft.id,
            'posting_action', 'IGNORE'
        );
    END IF;

    -- 5. Resolve & Lock Target Pocket
    v_target_pocket_id := COALESCE(p_pocket_id, v_draft.pocket_id);
    IF v_target_pocket_id IS NULL THEN
        RAISE EXCEPTION 'POCKET_REQUIRED: Pilih kantong rekening sumber sebelum mem-posting draft ini.' USING ERRCODE = '23502';
    END IF;

    SELECT id, tenant_id, branch_id, pos, label, account_id
    INTO v_pocket
    FROM public.pos_balances
    WHERE id = v_target_pocket_id AND tenant_id = v_draft.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'POCKET_NOT_FOUND: Kantong rekening tidak ditemukan pada tenant ini.' USING ERRCODE = '23503';
    END IF;

    -- Branch isolation check for Admin Cabang
    IF v_caller_role = 'Admin' AND (
        v_pocket.branch_id IS NULL
        OR v_pocket.branch_id IS DISTINCT FROM v_caller_branch
        OR (v_draft.branch_id IS NOT NULL AND v_draft.branch_id IS DISTINCT FROM v_caller_branch)
    ) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Admin Cabang hanya dapat mem-posting mutasi untuk kantong cabangnya sendiri.'
            USING ERRCODE = '42501';
    END IF;

    v_effective_branch_id := COALESCE(v_pocket.branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL THEN
        SELECT id INTO v_effective_branch_id
        FROM public.branches
        WHERE tenant_id = v_draft.tenant_id AND is_active IS TRUE
        ORDER BY is_main DESC NULLS LAST, created_at ASC
        LIMIT 1;
    END IF;

    -- Server strictly uses locked draft.total_debit (never trusts client nominal!)
    v_amount := v_draft.total_debit;
    v_jenis := COALESCE(NULLIF(BTRIM(p_jenis), ''), v_draft.suggested_jenis, 'Pengeluaran Bersama');
    v_kategori := COALESCE(NULLIF(BTRIM(p_kategori), ''), v_draft.suggested_kategori, 'Biaya Operasional Lainnya');
    v_ket := COALESCE(
        NULLIF(BTRIM(p_keterangan), ''),
        'Mutasi Mandiri ' || COALESCE(v_draft.tx_type, 'OUT') ||
        CASE WHEN v_draft.counterparty_name IS NOT NULL THEN ' - ' || v_draft.counterparty_name ELSE '' END ||
        CASE WHEN v_draft.bank_reference IS NOT NULL THEN ' [Ref: ' || v_draft.bank_reference || ']' ELSE '' END
    );

    -- 6A. ACTION: LINK_EXISTING_CASHFLOW (No new cashflow created -> zero double-count)
    IF v_action = 'LINK_EXISTING_CASHFLOW' THEN
        IF p_existing_cashflow_id IS NULL THEN
            RAISE EXCEPTION 'CASHFLOW_ID_REQUIRED: Pilih transaksi cashflow manual yang akan ditautkan.' USING ERRCODE = '23502';
        END IF;

        SELECT id, tenant_id, pocket_id, pengeluaran
        INTO v_existing_cf
        FROM public.cashflow
        WHERE id = p_existing_cashflow_id AND tenant_id = v_draft.tenant_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'CASHFLOW_NOT_FOUND: Transaksi cashflow manual tidak ditemukan.' USING ERRCODE = '23503';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.bank_transaction_drafts
            WHERE tenant_id = v_draft.tenant_id AND linked_cashflow_id = p_existing_cashflow_id AND id <> v_draft.id
        ) THEN
            RAISE EXCEPTION 'CASHFLOW_ALREADY_LINKED: Transaksi manual ini sudah tertaut ke draft email lain.' USING ERRCODE = '23505';
        END IF;

        UPDATE public.bank_transaction_drafts
        SET pocket_id = v_pocket.id,
            branch_id = v_pocket.branch_id,
            review_status = 'POSTED',
            posting_action = 'LINK_EXISTING_CASHFLOW',
            linked_cashflow_id = v_existing_cf.id,
            idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
            posted_by = v_caller_uid,
            posted_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_draft.id;

        RETURN jsonb_build_object(
            'status', 'POSTED',
            'idempotent_replay', FALSE,
            'draft_id', v_draft.id,
            'posting_action', 'LINK_EXISTING_CASHFLOW',
            'posted_amount', v_amount,
            'linked_cashflow_id', v_existing_cf.id
        );

    -- 6B. ACTION: TRANSFER_POCKET (Inter-pocket transfer)
    ELSIF v_action = 'TRANSFER_POCKET' THEN
        IF p_destination_pocket_id IS NULL OR p_destination_pocket_id = v_pocket.id THEN
            RAISE EXCEPTION 'INVALID_DESTINATION_POCKET: Kantong tujuan wajib dipilih dan berbeda dari kantong asal.' USING ERRCODE = '22023';
        END IF;

        SELECT id, tenant_id, branch_id, pos, label
        INTO v_dest_pocket
        FROM public.pos_balances
        WHERE id = p_destination_pocket_id AND tenant_id = v_draft.tenant_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'DESTINATION_POCKET_NOT_FOUND: Kantong tujuan tidak ditemukan.' USING ERRCODE = '23503';
        END IF;

        v_pair_cf_id := gen_random_uuid();

        INSERT INTO public.cashflow (
            id, tenant_id, branch_id, pocket_id, id_cashflow, id_sumber, tanggal,
            keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran, pos, apakah_stok, created_at
        ) VALUES
            (
                v_cf_id, v_draft.tenant_id, v_effective_branch_id, v_pocket.id,
                'CF-BNK-' || substr(v_draft.id::text, 1, 8) || '-OUT',
                'BANK-IMP-' || v_draft.id::text, v_draft.book_date,
                v_ket, 'Pindah', 'Pindah', 0.0000, v_amount, v_pocket.pos, FALSE, NOW()
            ),
            (
                v_pair_cf_id, v_draft.tenant_id, COALESCE(v_dest_pocket.branch_id, v_effective_branch_id), v_dest_pocket.id,
                'CF-BNK-' || substr(v_draft.id::text, 1, 8) || '-IN',
                'BANK-IMP-' || v_draft.id::text, v_draft.book_date,
                v_ket, 'Pindah', 'Pindah', v_amount, 0.0000, v_dest_pocket.pos, FALSE, NOW()
            );

        UPDATE public.bank_transaction_drafts
        SET pocket_id = v_pocket.id,
            branch_id = v_pocket.branch_id,
            review_status = 'POSTED',
            posting_action = 'TRANSFER_POCKET',
            posted_cashflow_id = v_cf_id,
            posted_transfer_pair_cashflow_id = v_pair_cf_id,
            idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
            posted_by = v_caller_uid,
            posted_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_draft.id;

        RETURN jsonb_build_object(
            'status', 'POSTED',
            'idempotent_replay', FALSE,
            'draft_id', v_draft.id,
            'posting_action', 'TRANSFER_POCKET',
            'posted_amount', v_amount,
            'posted_cashflow_id', v_cf_id,
            'posted_transfer_pair_cashflow_id', v_pair_cf_id
        );

    -- 6C. ACTION: RECORD_EXPENSE (Default: Cashflow + Double-Entry Journal)
    ELSIF v_action = 'RECORD_EXPENSE' THEN
        INSERT INTO public.cashflow (
            id, tenant_id, branch_id, pocket_id, id_cashflow, id_sumber, tanggal,
            keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran, pos, apakah_stok, created_at
        ) VALUES (
            v_cf_id, v_draft.tenant_id, v_effective_branch_id, v_pocket.id,
            'CF-BNK-' || substr(v_draft.id::text, 1, 8),
            'BANK-IMP-' || v_draft.id::text, v_draft.book_date,
            v_ket, v_jenis, v_kategori, 0.0000, v_amount, v_pocket.pos, FALSE, NOW()
        );

        -- Resolve Double-Entry CoA accounts (Credit: Bank 1102 / pocket.account_id, Debit: Expense 6102/6101/5101)
        v_coa_credit := v_pocket.account_id;
        IF v_coa_credit IS NULL THEN
            SELECT id INTO v_coa_credit
            FROM public.chart_of_accounts
            WHERE tenant_id = v_draft.tenant_id AND kode_akun IN ('1102', '1001')
            ORDER BY (kode_akun = '1102') DESC
            LIMIT 1;
        END IF;

        SELECT id INTO v_coa_debit
        FROM public.chart_of_accounts
        WHERE tenant_id = v_draft.tenant_id
          AND kode_akun = CASE
              WHEN v_kategori ILIKE '%gaji%' OR v_kategori ILIKE '%komisi%' THEN '6101'
              WHEN v_kategori ILIKE '%bahan%' OR v_kategori ILIKE '%stok%' THEN '5101'
              ELSE '6102'
          END
        LIMIT 1;

        IF v_coa_debit IS NULL THEN
            SELECT id INTO v_coa_debit
            FROM public.chart_of_accounts
            WHERE tenant_id = v_draft.tenant_id AND kode_akun IN ('6102', '5101', '6101')
            LIMIT 1;
        END IF;

        IF v_coa_debit IS NOT NULL AND v_coa_credit IS NOT NULL THEN
            v_journal_id := gen_random_uuid();
            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_by, created_at
            ) VALUES (
                v_journal_id, v_draft.tenant_id, v_effective_branch_id,
                'JE-BNK-' || substr(v_draft.id::text, 1, 8),
                v_draft.book_date, v_ket, v_amount, 'DRAFT', v_caller_uid, NOW()
            );

            INSERT INTO public.journal_entry_lines (
                id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
            ) VALUES
                (gen_random_uuid(), v_draft.tenant_id, v_journal_id, v_coa_debit, v_amount, 0.0000, v_ket, NOW()),
                (gen_random_uuid(), v_draft.tenant_id, v_journal_id, v_coa_credit, 0.0000, v_amount, 'Kredit ' || v_pocket.pos, NOW());

            UPDATE public.journal_entries
            SET status = 'POSTED'
            WHERE id = v_journal_id AND tenant_id = v_draft.tenant_id;
        END IF;

        UPDATE public.bank_transaction_drafts
        SET pocket_id = v_pocket.id,
            branch_id = v_pocket.branch_id,
            suggested_jenis = v_jenis,
            suggested_kategori = v_kategori,
            review_status = 'POSTED',
            posting_action = 'RECORD_EXPENSE',
            posted_cashflow_id = v_cf_id,
            posted_journal_id = v_journal_id,
            idempotency_key = COALESCE(p_idempotency_key, idempotency_key),
            posted_by = v_caller_uid,
            posted_at = NOW(),
            version = version + 1,
            updated_at = NOW()
        WHERE id = v_draft.id;

        RETURN jsonb_build_object(
            'status', 'POSTED',
            'idempotent_replay', FALSE,
            'draft_id', v_draft.id,
            'posting_action', 'RECORD_EXPENSE',
            'posted_amount', v_amount,
            'posted_cashflow_id', v_cf_id,
            'posted_journal_id', v_journal_id
        );
    ELSE
        RAISE EXCEPTION 'INVALID_POSTING_ACTION: Tindakan "%" tidak dikenali.', v_action USING ERRCODE = '22023';
    END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_post_bank_transaction_draft(UUID, INT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_post_bank_transaction_draft(UUID, INT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
