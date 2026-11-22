-- ==============================================================================
-- LIVE POSTGRES 17 VERIFICATION HARNESS: Bank Mandiri Email Integration
-- Runs inside BEGIN ... ROLLBACK so production stays 100% clean.
-- ==============================================================================

BEGIN;

CREATE TEMP TABLE pg_temp.mei_results (
    check_id TEXT PRIMARY KEY,
    description TEXT,
    passed BOOLEAN,
    detail TEXT
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.mei_assert(
    p_id TEXT,
    p_desc TEXT,
    p_ok BOOLEAN,
    p_detail TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO pg_temp.mei_results VALUES (p_id, p_desc, p_ok, p_detail)
    ON CONFLICT (check_id) DO UPDATE SET passed = p_ok, detail = p_detail;
END;
$$;

GRANT INSERT, UPDATE, SELECT ON pg_temp.mei_results TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.mei_assert(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

DO $$
DECLARE
    v_t1 UUID := '11000000-0000-4000-8000-000000000001'::uuid;
    v_t2 UUID := '11000000-0000-4000-8000-000000000002'::uuid;
    v_b1 UUID := '22000000-0000-4000-8000-000000000001'::uuid;
    v_b2 UUID := '22000000-0000-4000-8000-000000000002'::uuid;
    v_b3 UUID := '22000000-0000-4000-8000-000000000003'::uuid;
    v_u_owner1 UUID := '33000000-0000-4000-8000-000000000001'::uuid;
    v_u_pusat1 UUID := '33000000-0000-4000-8000-000000000002'::uuid;
    v_u_admin_a1 UUID := '33000000-0000-4000-8000-000000000003'::uuid;
    v_u_kasir_a1 UUID := '33000000-0000-4000-8000-000000000004'::uuid;
    v_u_owner2 UUID := '33000000-0000-4000-8000-000000000005'::uuid;
    v_p_a1 UUID := '44000000-0000-4000-8000-000000000001'::uuid;
    v_p_a2 UUID := '44000000-0000-4000-8000-000000000002'::uuid;
    v_p_hq UUID := '44000000-0000-4000-8000-000000000003'::uuid;
    v_conn_a UUID := '55000000-0000-4000-8000-000000000001'::uuid;
    v_res JSONB;
    v_post1 JSONB;
    v_post2 JSONB;
    v_draft_a1 UUID;
    v_draft_a2 UUID;
    v_bal NUMERIC;
    v_err TEXT := '';
BEGIN
    INSERT INTO public.tenants (id, nama, slug, plan, status)
    VALUES
        (v_t1, 'Tenant Mandiri Uji A', 'tenant-mandiri-uji-a', 'pro', 'active'),
        (v_t2, 'Tenant Mandiri Uji B', 'tenant-mandiri-uji-b', 'pro', 'active');

    INSERT INTO public.tenant_licenses (tenant_id, license_key, plan, tier, status, max_branches, max_users, features, valid_until, expires_at)
    VALUES
        (v_t1, 'MEI-KEY-T1', 'pro', 'PRO', 'ACTIVE', 10, 50, '{}'::jsonb, NOW() + INTERVAL '365 days', NOW() + INTERVAL '365 days'),
        (v_t2, 'MEI-KEY-T2', 'pro', 'PRO', 'ACTIVE', 10, 50, '{}'::jsonb, NOW() + INTERVAL '365 days', NOW() + INTERVAL '365 days');

    INSERT INTO public.branches (id, tenant_id, nama, kode, is_active)
    VALUES
        (v_b1, v_t1, 'Cabang A1', 'MAIN', TRUE),
        (v_b2, v_t1, 'Cabang A2', 'A2', TRUE),
        (v_b3, v_t2, 'Cabang B1', 'MAIN', TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_t1, v_b1);

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES
        (v_u_owner1, v_t1, v_b1, 'OWNER A', 'owner.mei.a@test.local', 'Owner', TRUE),
        (v_u_pusat1, v_t1, v_b1, 'PUSAT A', 'pusat.mei.a@test.local', 'Admin Pusat', TRUE),
        (v_u_admin_a1, v_t1, v_b1, 'ADMIN A1', 'admin1.mei.a@test.local', 'Admin', TRUE),
        (v_u_kasir_a1, v_t1, v_b1, 'KASIR A1', 'kasir1.mei.a@test.local', 'Kasir', TRUE),
        (v_u_owner2, v_t2, v_b3, 'OWNER B', 'owner.mei.b@test.local', 'Owner', TRUE);

    INSERT INTO public.pos_balances (id, tenant_id, branch_id, pos, label, tipe, balance, is_active)
    VALUES
        (v_p_a1, v_t1, v_b1, 'SALDO MANDIRI A1', 'Mandiri A1', 'BANK', 2000000, TRUE),
        (v_p_a2, v_t1, v_b2, 'SALDO MANDIRI A2', 'Mandiri A2', 'BANK', 1500000, TRUE),
        (v_p_hq, v_t1, NULL, 'SALDO MANDIRI HQ', 'Mandiri Pusat HQ', 'BANK', 3000000, TRUE);

    -- CHECK 1: Create Gmail connection & verify canonical email normalization
    INSERT INTO public.bank_email_connections (id, tenant_id, provider, provider_account_id, email_address, status, created_by)
    VALUES (v_conn_a, v_t1, 'GMAIL_OAUTH', 'google-sub-mei-1', 'Budi.Santoso+toko1@googlemail.com', 'CONNECTED', v_u_owner1);

    PERFORM pg_temp.mei_assert(
        'MEI-01',
        'Canonical Gmail identity normalizes dots, +tag, and @googlemail.com',
        (SELECT normalized_email FROM public.bank_email_connections WHERE id = v_conn_a) = 'budisantoso@gmail.com',
        'norm=' || COALESCE((SELECT normalized_email FROM public.bank_email_connections WHERE id = v_conn_a), 'NULL')
    );

    -- CHECK 2: Stranger Tenant B blocked from connecting same Gmail (alias or sub)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_owner2::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_owner2::text, true);
    v_err := '';
    BEGIN
        INSERT INTO public.bank_email_connections (tenant_id, provider, provider_account_id, email_address, status)
        VALUES (v_t2, 'GMAIL_OAUTH', 'google-sub-other', 'b.u.d.i.santoso+cabang2@gmail.com', 'CONNECTED');
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    PERFORM pg_temp.mei_assert('MEI-02', 'Stranger Tenant B blocked from using Tenant A Gmail alias', v_err LIKE '%EMAIL_ALREADY_BOUND_TO_OTHER_TENANT%', v_err);

    -- Switch to Owner A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_owner1::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_owner1::text, true);

    -- Bind 3 Mandiri accounts (1122, 3344, 5566) under 1 Gmail connection
    INSERT INTO public.bank_account_bindings (tenant_id, connection_id, bank_code, account_last4, pocket_id, import_start_date, is_active)
    VALUES
        (v_t1, v_conn_a, 'MANDIRI', '1122', v_p_a1, '2026-11-01', TRUE),
        (v_t1, v_conn_a, 'MANDIRI', '3344', v_p_a2, '2026-11-01', TRUE),
        (v_t1, v_conn_a, 'MANDIRI', '5566', v_p_hq, '2026-11-01', TRUE);

    -- CHECK 3: Personal unbound account (9999) on same Gmail is ignored
    v_res := public.fn_ingest_mandiri_normalized_tx(
        v_conn_a, 'msg-personal-9999', 'noreply.livin@bankmandiri.co.id', TRUE, 'Transfer', NOW(),
        jsonb_build_object('account_last4', '9999', 'principal_amount', '500000.0000', 'total_debit', '500000.0000', 'book_date', '2026-11-22')
    );
    PERFORM pg_temp.mei_assert('MEI-03', 'Unbound personal account 9999 on same Gmail is ignored', v_res->>'status' = 'IGNORED_UNBOUND_ACCOUNT', v_res::text);

    -- CHECK 4: Ingest 1122 (A1) & 3344 (A2) auto-routes to exact pockets
    v_res := public.fn_ingest_mandiri_normalized_tx(
        v_conn_a, 'msg-a1-1122', 'noreply.livin@bankmandiri.co.id', TRUE, 'Transfer BI-FAST', NOW(),
        jsonb_build_object(
            'account_last4', '1122', 'tx_type', 'TRANSFER', 'principal_amount', '350000.0000',
            'fee_amount', '2500.0000', 'total_debit', '352500.0000', 'book_date', '2026-11-22',
            'bank_reference', 'REF-MEI-1122', 'counterparty_name', 'PT PLN'
        )
    );
    v_draft_a1 := (v_res->>'draft_id')::uuid;

    v_res := public.fn_ingest_mandiri_normalized_tx(
        v_conn_a, 'msg-a2-3344', 'noreply.livin@bankmandiri.co.id', TRUE, 'Pembayaran QRIS', NOW(),
        jsonb_build_object(
            'account_last4', '3344', 'tx_type', 'QRIS', 'principal_amount', '125000.0000',
            'total_debit', '125000.0000', 'book_date', '2026-11-22',
            'bank_reference', 'REF-MEI-3344', 'counterparty_name', 'TOKO KOPI A2'
        )
    );
    v_draft_a2 := (v_res->>'draft_id')::uuid;

    PERFORM pg_temp.mei_assert(
        'MEI-04',
        '1 Gmail auto-routes 1122 -> Pocket A1 & 3344 -> Pocket A2 with READY status',
        v_draft_a1 IS NOT NULL AND v_draft_a2 IS NOT NULL AND (v_res->>'pocket_id')::uuid = v_p_a2 AND v_res->>'review_status' = 'READY',
        v_res::text
    );

    -- CHECK 5: Atomic posting of Draft A1 (352,500) updates v_pocket_balances (2,000,000 -> 1,647,500), writes POSTED journal, and is idempotent
    v_post1 := public.fn_post_bank_transaction_draft(
        v_draft_a1, 1, 'RECORD_EXPENSE', v_p_a1, 'Pengeluaran Bersama', 'Listrik, Air & Utilitas', 'Bayar PLN A1', NULL, NULL, NULL, 'idem-mei-a1'
    );
    v_post2 := public.fn_post_bank_transaction_draft(
        v_draft_a1, 1, 'RECORD_EXPENSE', v_p_a1, 'Pengeluaran Bersama', 'Listrik, Air & Utilitas', 'Bayar PLN A1', NULL, NULL, NULL, 'idem-mei-a1'
    );
    SELECT current_balance INTO v_bal FROM public.v_pocket_balances WHERE id = v_p_a1;

    PERFORM pg_temp.mei_assert(
        'MEI-05',
        'Atomic posting deducts 352,500 once (1,647,500), creates POSTED journal, and replays idempotently',
        v_bal = 1647500 AND (v_post1->>'posted_journal_id') IS NOT NULL AND (v_post2->>'idempotent_replay')::boolean IS TRUE,
        'bal=' || v_bal || ', jrn=' || COALESCE(v_post1->>'posted_journal_id', 'NULL')
    );
END $$;

-- RLS & RBAC CHECKS AS AUTHENTICATED
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    v_u_admin_a1 UUID := '33000000-0000-4000-8000-000000000003'::uuid;
    v_u_pusat1 UUID := '33000000-0000-4000-8000-000000000002'::uuid;
    v_u_kasir_a1 UUID := '33000000-0000-4000-8000-000000000004'::uuid;
    v_b1 UUID := '22000000-0000-4000-8000-000000000001'::uuid;
    v_cnt_admin INT;
    v_cnt_pusat INT;
    v_cnt_kasir INT;
    v_secret_err TEXT := '';
BEGIN
    -- Admin Cabang A1 sees ONLY Branch A1 drafts (1)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_admin_a1::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_admin_a1::text, true);
    SELECT COUNT(*) INTO v_cnt_admin FROM public.bank_transaction_drafts;

    -- Admin Pusat sees ALL Tenant A drafts (2)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_pusat1::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_pusat1::text, true);
    SELECT COUNT(*) INTO v_cnt_pusat FROM public.bank_transaction_drafts;

    -- Kasir sees 0 drafts
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u_kasir_a1::text, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_u_kasir_a1::text, true);
    SELECT COUNT(*) INTO v_cnt_kasir FROM public.bank_transaction_drafts;

    -- Secrets table is completely inaccessible to authenticated role
    BEGIN
        PERFORM COUNT(*) FROM public.bank_email_connection_secrets;
    EXCEPTION WHEN insufficient_privilege THEN
        v_secret_err := SQLERRM;
    END;

    PERFORM pg_temp.mei_assert(
        'MEI-06',
        'RLS isolates drafts (Admin Cabang=1, Admin Pusat=2, Kasir=0) & blocks bank_email_connection_secrets',
        v_cnt_admin = 1 AND v_cnt_pusat = 2 AND v_cnt_kasir = 0 AND v_secret_err <> '',
        'admin=' || v_cnt_admin || ', pusat=' || v_cnt_pusat || ', kasir=' || v_cnt_kasir || ', secret_err=' || v_secret_err
    );
END $$;

RESET ROLE;

SELECT check_id, description, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status, detail
FROM pg_temp.mei_results
ORDER BY check_id;

ROLLBACK;
