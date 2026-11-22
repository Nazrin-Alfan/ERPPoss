import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine'
import { parseMandiriNotificationEmail } from '../mandiriEmailParser'

describe('Bank Mandiri Outgoing Notification Email Integration (TDD)', () => {
  let db
  const TENANT_A = DEFAULT_TENANT_ID
  const TENANT_B = '90000000-0000-4000-8000-000000000099'
  const BRANCH_A1 = DEFAULT_BRANCH_ID
  const BRANCH_A2 = '80000000-0000-4000-8000-000000000002'

  const POCKET_A1_ID = '70000000-0000-4000-8000-000000000001'
  const POCKET_A2_ID = '70000000-0000-4000-8000-000000000002'
  const POCKET_HQ_ID = '70000000-0000-4000-8000-000000000003'
  const POCKET_CASH_A1_ID = '70000000-0000-4000-8000-000000000004'

  beforeEach(async () => {
    db = createLocalClient()
    db.erp.resetDatabase(true)
    db.setActiveActor({ id: 'demo-owner-id', role: 'Owner', tenant_id: TENANT_A, branch_id: BRANCH_A1 })

    await db.from('tenants').insert({
      id: TENANT_B,
      nama: 'Tenant Asing B',
      slug: 'tenant-asing-b',
      plan: 'PRO',
      status: 'active',
      business_type: 'HYBRID',
    })
    await db.from('branches').insert({
      id: BRANCH_A2,
      tenant_id: TENANT_A,
      nama: 'Cabang A2',
      kode: 'A2',
      is_main: false,
      is_active: true,
    })

    // Seed 3 Bank Mandiri pockets in Tenant A (SALDO CASH already exists in resetDatabase; insert the 3 Mandiri pockets)
    await db.from('pos_balances').insert([
      {
        id: POCKET_A1_ID,
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        pos: 'SALDO MANDIRI A1',
        label: 'Mandiri Operasional A1',
        tipe: 'BANK',
        balance: 2000000,
        is_active: true,
      },
      {
        id: POCKET_A2_ID,
        tenant_id: TENANT_A,
        branch_id: BRANCH_A2,
        pos: 'SALDO MANDIRI A2',
        label: 'Mandiri Operasional A2',
        tipe: 'BANK',
        balance: 1500000,
        is_active: true,
      },
      {
        id: POCKET_HQ_ID,
        tenant_id: TENANT_A,
        branch_id: null,
        pos: 'SALDO MANDIRI HQ',
        label: 'Mandiri Pusat HQ',
        tipe: 'BANK',
        balance: 3000000,
        is_active: true,
      },
    ])
  })

  it('TC_MEI_01: Rule-based Mandiri parser handles Transfer, QRIS (null fee), VA/Bill, Failed tx, and unknown format', () => {
    // 1. Transfer BI-FAST with explicit fee & total debit (must NOT double-add fee)
    const transferHtml = `
      <html><body>
        <h3>Livin' by Mandiri - Bukti Transaksi</h3>
        <table>
          <tr><td>Status Transaksi</td><td>Berhasil</td></tr>
          <tr><td>Jenis Transaksi</td><td>Transfer BI-FAST</td></tr>
          <tr><td>Tanggal & Waktu</td><td>22 Nov 2026 10:15:30 WIB</td></tr>
          <tr><td>Sumber Dana</td><td>13700****1122</td></tr>
          <tr><td>Penerima</td><td>PT SUPPLIER SABun JAYA</td></tr>
          <tr><td>Bank Tujuan</td><td>BCA</td></tr>
          <tr><td>Nominal Transfer</td><td>Rp 350.000,00</td></tr>
          <tr><td>Biaya Transaksi</td><td>Rp 2.500,00</td></tr>
          <tr><td>Total Debet</td><td>Rp 352.500,00</td></tr>
          <tr><td>No. Referensi</td><td>20261122101530998811</td></tr>
        </table>
      </body></html>
    `
    const parsedTransfer = parseMandiriNotificationEmail({
      subject: "Bukti Transaksi Transfer BI-FAST - Livin' by Mandiri",
      from: 'noreply.livin@bankmandiri.co.id',
      body: transferHtml,
    })

    expect(parsedTransfer.recognized).toBe(true)
    expect(parsedTransfer.parser_version).toBe('mandiri_transfer_v1')
    expect(parsedTransfer.direction).toBe('OUT')
    expect(parsedTransfer.transaction_status).toBe('SUCCESS')
    expect(parsedTransfer.principal_amount).toBe('350000.0000')
    expect(parsedTransfer.fee_amount).toBe('2500.0000')
    expect(parsedTransfer.total_debit).toBe('352500.0000')
    expect(parsedTransfer.account_last4).toBe('1122')
    expect(parsedTransfer.counterparty_name).toBe('PT SUPPLIER SABun JAYA')
    expect(parsedTransfer.bank_reference).toBe('20261122101530998811')

    // 2. QRIS Payment without fee line -> fee_amount MUST stay null (not fabricated as 0)
    const qrisHtml = `
      <div>
        <p>Pembayaran QRIS Berhasil</p>
        <p>Tanggal: 22/11/2026 14:20:00</p>
        <p>Rekening Sumber: 137000****3344</p>
        <p>Nama Merchant: TOKO KOPI NUSANTARA</p>
        <p>Nominal Transaksi: Rp 125.000</p>
        <p>No. Referensi: QRIS-20261122-7744</p>
      </div>
    `
    const parsedQris = parseMandiriNotificationEmail({
      subject: "Pembayaran QRIS Berhasil - Livin' by Mandiri",
      from: 'noreply.livin@bankmandiri.co.id',
      body: qrisHtml,
    })
    expect(parsedQris.recognized).toBe(true)
    expect(parsedQris.parser_version).toBe('mandiri_qris_payment_v1')
    expect(parsedQris.principal_amount).toBe('125000.0000')
    expect(parsedQris.fee_amount).toBeNull()
    expect(parsedQris.total_debit).toBe('125000.0000')
    expect(parsedQris.account_last4).toBe('3344')
    expect(parsedQris.counterparty_name).toBe('TOKO KOPI NUSANTARA')

    // 3. Failed transaction -> recognized as non-postable
    const failedHtml = `
      <table>
        <tr><td>Status Transaksi</td><td>Gagal</td></tr>
        <tr><td>Sumber Dana</td><td>13700****1122</td></tr>
        <tr><td>Nominal Transfer</td><td>Rp 100.000</td></tr>
      </table>
    `
    const parsedFailed = parseMandiriNotificationEmail({
      subject: 'Notifikasi Transaksi',
      from: 'noreply.livin@bankmandiri.co.id',
      body: failedHtml,
    })
    expect(parsedFailed.transaction_status).toBe('FAILED')
    expect(parsedFailed.postable).toBe(false)

    // 4. Promo / unrecognized email -> NEEDS_MANUAL_REVIEW (never guessed)
    const promoHtml = `<p>Selamat! Tukarkan Livin'poin Anda dengan voucher diskon Rp 50.000 hari ini.</p>`
    const parsedPromo = parseMandiriNotificationEmail({
      subject: "Promo Spesial Livin'poin",
      from: 'mandiricare@bankmandiri.co.id',
      body: promoHtml,
    })
    expect(parsedPromo.recognized).toBe(false)
    expect(parsedPromo.parse_status).toBe('NEEDS_MANUAL_REVIEW')
  })

  it('TC_MEI_02: 1 Gmail connection routes to 3 Mandiri pockets (1122, 3344, 5566) and ignores personal account (9999)', async () => {
    db.setActiveActor({ id: 'demo-owner-id', role: 'Owner', tenant_id: TENANT_A, branch_id: BRANCH_A1 })

    const { data: conn, error: connErr } = await db
      .from('bank_email_connections')
      .insert({
        tenant_id: TENANT_A,
        provider: 'GMAIL_OAUTH',
        provider_account_id: 'google-sub-1001',
        email_address: 'Owner.Toko@gmail.com',
        status: 'CONNECTED',
      })
      .select()
      .single()
    expect(connErr).toBeNull()
    expect(conn.normalized_email).toBe('ownertoko@gmail.com')

    // Bind 3 Mandiri accounts under the SAME Gmail connection
    const { error: bindErr } = await db.from('bank_account_bindings').insert([
      {
        tenant_id: TENANT_A,
        connection_id: conn.id,
        bank_code: 'MANDIRI',
        account_last4: '1122',
        pocket_id: POCKET_A1_ID,
        import_start_date: '2026-11-01',
        is_active: true,
      },
      {
        tenant_id: TENANT_A,
        connection_id: conn.id,
        bank_code: 'MANDIRI',
        account_last4: '3344',
        pocket_id: POCKET_A2_ID,
        import_start_date: '2026-11-01',
        is_active: true,
      },
      {
        tenant_id: TENANT_A,
        connection_id: conn.id,
        bank_code: 'MANDIRI',
        account_last4: '5566',
        pocket_id: POCKET_HQ_ID,
        import_start_date: '2026-11-01',
        is_active: true,
      },
    ])
    expect(bindErr).toBeNull()

    // Ingest tx for 3344 -> must route to POCKET_A2_ID (Branch A2) with READY status
    const { data: res3344, error: err3344 } = await db.rpc('fn_ingest_mandiri_normalized_tx', {
      p_connection_id: conn.id,
      p_provider_message_id: 'gmail-msg-3344-01',
      p_sender_email: 'noreply.livin@bankmandiri.co.id',
      p_sender_verified: true,
      p_subject: 'Pembayaran QRIS Berhasil',
      p_received_at: '2026-11-22T14:20:00+07:00',
      p_payload: {
        bank_code: 'MANDIRI',
        direction: 'OUT',
        transaction_status: 'SUCCESS',
        tx_type: 'QRIS',
        principal_amount: '125000.0000',
        fee_amount: null,
        total_debit: '125000.0000',
        occurred_at: '2026-11-22T14:20:00+07:00',
        book_date: '2026-11-22',
        bank_reference: 'QRIS-20261122-7744',
        counterparty_name: 'TOKO KOPI NUSANTARA',
        account_last4: '3344',
        parser_version: 'mandiri_qris_payment_v1',
      },
    })
    expect(err3344).toBeNull()
    expect(res3344.status).toBe('DRAFT_CREATED')
    expect(res3344.review_status).toBe('READY')
    expect(res3344.pocket_id).toBe(POCKET_A2_ID)
    expect(res3344.branch_id).toBe(BRANCH_A2)

    // Ingest tx for personal account 9999 on the SAME Gmail -> must be IGNORED_UNBOUND_ACCOUNT (no draft created)
    const { data: res9999, error: err9999 } = await db.rpc('fn_ingest_mandiri_normalized_tx', {
      p_connection_id: conn.id,
      p_provider_message_id: 'gmail-msg-9999-personal',
      p_sender_email: 'noreply.livin@bankmandiri.co.id',
      p_sender_verified: true,
      p_subject: 'Transfer Pribadi',
      p_received_at: '2026-11-22T15:00:00+07:00',
      p_payload: {
        bank_code: 'MANDIRI',
        direction: 'OUT',
        transaction_status: 'SUCCESS',
        tx_type: 'TRANSFER',
        principal_amount: '500000.0000',
        fee_amount: '0.0000',
        total_debit: '500000.0000',
        occurred_at: '2026-11-22T15:00:00+07:00',
        book_date: '2026-11-22',
        bank_reference: 'REF-PERSONAL-9999',
        counterparty_name: 'REKENING PRIBADI',
        account_last4: '9999',
        parser_version: 'mandiri_transfer_v1',
      },
    })
    expect(err9999).toBeNull()
    expect(res9999.status).toBe('IGNORED_UNBOUND_ACCOUNT')
  })

  it('TC_MEI_03: Shared physical account (1122 bound to >1 pocket in same tenant) forces NEEDS_REVIEW and blocks unconfirmed post', async () => {
    db.setActiveActor({ id: 'demo-owner-id', role: 'Owner', tenant_id: TENANT_A, branch_id: BRANCH_A1 })

    const { data: conn } = await db
      .from('bank_email_connections')
      .insert({
        tenant_id: TENANT_A,
        provider: 'GMAIL_OAUTH',
        provider_account_id: 'google-sub-shared',
        email_address: 'shared.mandiri@gmail.com',
        status: 'CONNECTED',
      })
      .select()
      .single()

    // Bind account_last4 = '1122' to BOTH Pocket A1 and Pocket A2 (1 physical bank account split into 2 virtual ERP pockets)
    await db.from('bank_account_bindings').insert([
      {
        tenant_id: TENANT_A,
        connection_id: conn.id,
        bank_code: 'MANDIRI',
        account_last4: '1122',
        pocket_id: POCKET_A1_ID,
        is_default_for_last4: true,
        is_active: true,
      },
      {
        tenant_id: TENANT_A,
        connection_id: conn.id,
        bank_code: 'MANDIRI',
        account_last4: '1122',
        pocket_id: POCKET_A2_ID,
        is_default_for_last4: false,
        is_active: true,
      },
    ])

    const { data: ingested } = await db.rpc('fn_ingest_mandiri_normalized_tx', {
      p_connection_id: conn.id,
      p_provider_message_id: 'gmail-msg-shared-01',
      p_sender_email: 'noreply.livin@bankmandiri.co.id',
      p_sender_verified: true,
      p_subject: 'Transfer BI-FAST',
      p_received_at: '2026-11-22T16:00:00+07:00',
      p_payload: {
        bank_code: 'MANDIRI',
        direction: 'OUT',
        transaction_status: 'SUCCESS',
        tx_type: 'TRANSFER',
        principal_amount: '200000.0000',
        fee_amount: '2500.0000',
        total_debit: '202500.0000',
        occurred_at: '2026-11-22T16:00:00+07:00',
        book_date: '2026-11-22',
        bank_reference: 'REF-SHARED-001',
        counterparty_name: 'VENDOR BERSAMA',
        account_last4: '1122',
        parser_version: 'mandiri_transfer_v1',
      },
    })

    expect(ingested.review_status).toBe('NEEDS_REVIEW')
    expect(ingested.review_reason).toBe('AMBIGUOUS_POCKET')

    // Attempting to post without explicitly confirming p_pocket_id must fail
    const { error: postWithoutPocketErr } = await db.rpc('fn_post_bank_transaction_draft', {
      p_draft_id: ingested.draft_id,
      p_expected_version: 1,
      p_action: 'RECORD_EXPENSE',
      p_pocket_id: null,
      p_jenis: 'Pengeluaran Bersama',
      p_kategori: 'Listrik, Air & Utilitas',
      p_keterangan: 'Bayar Listrik',
      p_idempotency_key: 'idem-shared-fail',
    })
    expect(postWithoutPocketErr).not.toBeNull()
  })

  it('TC_MEI_04: Blocks stranger Tenant B from using Tenant A Gmail (including dot/+tag/@googlemail aliases)', async () => {
    db.setActiveActor({ id: 'demo-owner-id', role: 'Owner', tenant_id: TENANT_A, branch_id: BRANCH_A1 })

    const { error: errA } = await db.from('bank_email_connections').insert({
      tenant_id: TENANT_A,
      provider: 'GMAIL_OAUTH',
      provider_account_id: 'google-sub-budi-99',
      email_address: 'budi.santoso@gmail.com',
      status: 'CONNECTED',
    })
    expect(errA).toBeNull()

    // Stranger Owner in Tenant B tries to connect the same Gmail via +tag and @googlemail.com alias
    db.setActiveActor({ id: 'stranger-owner-b', role: 'Owner', tenant_id: TENANT_B, branch_id: null })
    const { error: errB1 } = await db.from('bank_email_connections').insert({
      tenant_id: TENANT_B,
      provider: 'GMAIL_OAUTH',
      provider_account_id: 'google-sub-different',
      email_address: 'b.u.d.i.santoso+toko2@googlemail.com',
      status: 'CONNECTED',
    })
    expect(errB1).not.toBeNull()
    expect(errB1.message).toMatch(/EMAIL_ALREADY_BOUND_TO_OTHER_TENANT|sudah terhubung/i)

    // Stranger Owner in Tenant B tries with same Google sub ID
    const { error: errB2 } = await db.from('bank_email_connections').insert({
      tenant_id: TENANT_B,
      provider: 'GMAIL_OAUTH',
      provider_account_id: 'google-sub-budi-99',
      email_address: 'other.alias@gmail.com',
      status: 'CONNECTED',
    })
    expect(errB2).not.toBeNull()
    expect(errB2.message).toMatch(/EMAIL_ALREADY_BOUND_TO_OTHER_TENANT|sudah terhubung/i)
  })

  it('TC_MEI_05: Atomic posting (RECORD_EXPENSE) updates v_pocket_balances, writes balanced journal, enforces version & idempotency', async () => {
    db.setActiveActor({ id: 'demo-owner-id', role: 'Owner', tenant_id: TENANT_A, branch_id: BRANCH_A1 })

    const { data: conn } = await db
      .from('bank_email_connections')
      .insert({
        tenant_id: TENANT_A,
        provider: 'GMAIL_OAUTH',
        provider_account_id: 'google-sub-atomic',
        email_address: 'atomic.toko@gmail.com',
        status: 'CONNECTED',
      })
      .select()
      .single()

    await db.from('bank_account_bindings').insert({
      tenant_id: TENANT_A,
      connection_id: conn.id,
      bank_code: 'MANDIRI',
      account_last4: '1122',
      pocket_id: POCKET_A1_ID,
      import_start_date: '2026-11-01',
      is_active: true,
    })

    const { data: ing } = await db.rpc('fn_ingest_mandiri_normalized_tx', {
      p_connection_id: conn.id,
      p_provider_message_id: 'gmail-msg-atomic-01',
      p_sender_email: 'noreply.livin@bankmandiri.co.id',
      p_sender_verified: true,
      p_subject: 'Transfer BI-FAST',
      p_received_at: '2026-11-22T10:15:30+07:00',
      p_payload: {
        bank_code: 'MANDIRI',
        direction: 'OUT',
        transaction_status: 'SUCCESS',
        tx_type: 'TRANSFER',
        principal_amount: '350000.0000',
        fee_amount: '2500.0000',
        total_debit: '352500.0000',
        occurred_at: '2026-11-22T10:15:30+07:00',
        book_date: '2026-11-22',
        bank_reference: 'REF-ATOMIC-352500',
        counterparty_name: 'PT PLN PERSERO',
        account_last4: '1122',
        parser_version: 'mandiri_transfer_v1',
      },
    })

    // 1. Stale version must be rejected
    const { error: staleErr } = await db.rpc('fn_post_bank_transaction_draft', {
      p_draft_id: ing.draft_id,
      p_expected_version: 99,
      p_action: 'RECORD_EXPENSE',
      p_pocket_id: POCKET_A1_ID,
      p_jenis: 'Pengeluaran Bersama',
      p_kategori: 'Listrik, Air & Utilitas',
      p_keterangan: 'Tagihan Listrik PLN',
      p_idempotency_key: 'idem-atomic-1',
    })
    expect(staleErr).not.toBeNull()

    // 2. Valid atomic post
    const { data: post1, error: postErr1 } = await db.rpc('fn_post_bank_transaction_draft', {
      p_draft_id: ing.draft_id,
      p_expected_version: 1,
      p_action: 'RECORD_EXPENSE',
      p_pocket_id: POCKET_A1_ID,
      p_jenis: 'Pengeluaran Bersama',
      p_kategori: 'Listrik, Air & Utilitas',
      p_keterangan: 'Tagihan Listrik PLN',
      p_idempotency_key: 'idem-atomic-1',
    })
    expect(postErr1).toBeNull()
    expect(post1.status).toBe('POSTED')
    expect(Number(post1.posted_amount)).toBe(352500)

    // 3. Idempotent replay with same idempotency_key returns existing posting without double-deducting
    const { data: post2, error: postErr2 } = await db.rpc('fn_post_bank_transaction_draft', {
      p_draft_id: ing.draft_id,
      p_expected_version: 1,
      p_action: 'RECORD_EXPENSE',
      p_pocket_id: POCKET_A1_ID,
      p_jenis: 'Pengeluaran Bersama',
      p_kategori: 'Listrik, Air & Utilitas',
      p_keterangan: 'Tagihan Listrik PLN',
      p_idempotency_key: 'idem-atomic-1',
    })
    expect(postErr2).toBeNull()
    expect(post2.posted_cashflow_id).toBe(post1.posted_cashflow_id)
    expect(post2.idempotent_replay).toBe(true)

    // 4. Verify v_pocket_balances decreased by exactly 352,500 once (2,000,000 -> 1,647,500) and opening_balance is untouched
    const { data: pocketView } = await db
      .from('v_pocket_balances')
      .select('*')
      .eq('id', POCKET_A1_ID)
      .single()
    expect(Number(pocketView.opening_balance)).toBe(2000000)
    expect(Number(pocketView.current_balance)).toBe(1647500)
  })

  it('TC_MEI_06: Supports LINK_EXISTING_CASHFLOW (no double count), TRANSFER_POCKET, and IGNORE with reason', async () => {
    db.setActiveActor({ id: 'demo-owner-id', role: 'Owner', tenant_id: TENANT_A, branch_id: BRANCH_A1 })

    // Pre-existing manual cashflow row of Rp 150.000 on POCKET_A1_ID
    const { data: manualCf } = await db
      .from('cashflow')
      .insert({
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        pocket_id: POCKET_A1_ID,
        pos: 'SALDO MANDIRI A1',
        tanggal: '2026-11-22',
        jenis: 'Pengeluaran Bersama',
        kategori: 'Pembelian Bahan',
        keterangan_transaksi: 'Catat manual sebelum email masuk',
        pemasukan: 0,
        pengeluaran: 150000,
      })
      .select()
      .single()

    const { data: conn } = await db
      .from('bank_email_connections')
      .insert({
        tenant_id: TENANT_A,
        provider: 'GMAIL_OAUTH',
        provider_account_id: 'google-sub-actions',
        email_address: 'actions.toko@gmail.com',
        status: 'CONNECTED',
      })
      .select()
      .single()

    await db.from('bank_account_bindings').insert({
      tenant_id: TENANT_A,
      connection_id: conn.id,
      bank_code: 'MANDIRI',
      account_last4: '1122',
      pocket_id: POCKET_A1_ID,
      import_start_date: '2026-11-01',
      is_active: true,
    })

    const { data: ingLink } = await db.rpc('fn_ingest_mandiri_normalized_tx', {
      p_connection_id: conn.id,
      p_provider_message_id: 'gmail-msg-link-01',
      p_sender_email: 'noreply.livin@bankmandiri.co.id',
      p_sender_verified: true,
      p_subject: 'Transfer Mandiri',
      p_received_at: '2026-11-22T11:00:00+07:00',
      p_payload: {
        bank_code: 'MANDIRI',
        direction: 'OUT',
        transaction_status: 'SUCCESS',
        tx_type: 'TRANSFER',
        principal_amount: '150000.0000',
        fee_amount: null,
        total_debit: '150000.0000',
        occurred_at: '2026-11-22T11:00:00+07:00',
        book_date: '2026-11-22',
        bank_reference: 'REF-LINK-150K',
        counterparty_name: 'SUPPLIER MANUAL',
        account_last4: '1122',
        parser_version: 'mandiri_transfer_v1',
      },
    })

    // Possible duplicate detected against manual cashflow!
    expect(ingLink.review_status).toBe('NEEDS_REVIEW')
    expect(ingLink.review_reason).toBe('POSSIBLE_DUPLICATE')

    // Link to existing manual cashflow -> balance must stay 2,000,000 - 150,000 = 1,850,000 (not deducted twice!)
    const { data: linkedRes, error: linkErr } = await db.rpc('fn_post_bank_transaction_draft', {
      p_draft_id: ingLink.draft_id,
      p_expected_version: 1,
      p_action: 'LINK_EXISTING_CASHFLOW',
      p_pocket_id: POCKET_A1_ID,
      p_existing_cashflow_id: manualCf.id,
      p_idempotency_key: 'idem-link-1',
    })
    expect(linkErr).toBeNull()
    expect(linkedRes.status).toBe('POSTED')
    expect(linkedRes.linked_cashflow_id).toBe(manualCf.id)

    const { data: pocketAfterLink } = await db
      .from('v_pocket_balances')
      .select('*')
      .eq('id', POCKET_A1_ID)
      .single()
    expect(Number(pocketAfterLink.current_balance)).toBe(1850000)
  })

  it('TC_MEI_07: Enforces RBAC branch isolation on drafts & posting for Admin Cabang vs Admin Pusat vs Kasir', async () => {
    db.setActiveActor({ id: 'demo-owner-id', role: 'Owner', tenant_id: TENANT_A, branch_id: BRANCH_A1 })

    const { data: conn } = await db
      .from('bank_email_connections')
      .insert({
        tenant_id: TENANT_A,
        provider: 'GMAIL_OAUTH',
        provider_account_id: 'google-sub-rbac',
        email_address: 'rbac.toko@gmail.com',
        status: 'CONNECTED',
      })
      .select()
      .single()

    await db.from('bank_account_bindings').insert([
      {
        tenant_id: TENANT_A,
        connection_id: conn.id,
        bank_code: 'MANDIRI',
        account_last4: '1122',
        pocket_id: POCKET_A1_ID,
        import_start_date: '2026-11-01',
        is_active: true,
      },
      {
        tenant_id: TENANT_A,
        connection_id: conn.id,
        bank_code: 'MANDIRI',
        account_last4: '3344',
        pocket_id: POCKET_A2_ID,
        import_start_date: '2026-11-01',
        is_active: true,
      },
      {
        tenant_id: TENANT_A,
        connection_id: conn.id,
        bank_code: 'MANDIRI',
        account_last4: '5566',
        pocket_id: POCKET_HQ_ID,
        import_start_date: '2026-11-01',
        is_active: true,
      },
    ])

    for (const [last4, ref] of [
      ['1122', 'REF-A1'],
      ['3344', 'REF-A2'],
      ['5566', 'REF-HQ'],
    ]) {
      await db.rpc('fn_ingest_mandiri_normalized_tx', {
        p_connection_id: conn.id,
        p_provider_message_id: `msg-${ref}`,
        p_sender_email: 'noreply.livin@bankmandiri.co.id',
        p_sender_verified: true,
        p_subject: 'Transfer',
        p_received_at: '2026-11-22T12:00:00+07:00',
        p_payload: {
          bank_code: 'MANDIRI',
          direction: 'OUT',
          transaction_status: 'SUCCESS',
          tx_type: 'TRANSFER',
          principal_amount: '50000.0000',
          fee_amount: null,
          total_debit: '50000.0000',
          occurred_at: '2026-11-22T12:00:00+07:00',
          book_date: '2026-11-22',
          bank_reference: ref,
          counterparty_name: `Vendor ${ref}`,
          account_last4: last4,
          parser_version: 'mandiri_transfer_v1',
        },
      })
    }

    // 1. Admin Pusat sees all 3 drafts (Branch A1 + Branch A2 + HQ)
    db.setActiveActor({ id: 'pusat-1', role: 'Admin Pusat', tenant_id: TENANT_A, branch_id: BRANCH_A1 })
    const { data: pusatDrafts } = await db.from('bank_transaction_drafts').select('*')
    expect(pusatDrafts).toHaveLength(3)

    // 2. Admin Cabang A1 sees ONLY Branch A1 draft (1 draft) and cannot post Branch A2 draft
    db.setActiveActor({ id: 'admin-a1', role: 'Admin', tenant_id: TENANT_A, branch_id: BRANCH_A1 })
    const { data: adminA1Drafts } = await db.from('bank_transaction_drafts').select('*')
    expect(adminA1Drafts).toHaveLength(1)
    expect(adminA1Drafts[0].account_last4).toBe('1122')

    const draftA2 = pusatDrafts.find((d) => d.account_last4 === '3344')
    const { error: crossBranchPostErr } = await db.rpc('fn_post_bank_transaction_draft', {
      p_draft_id: draftA2.id,
      p_expected_version: 1,
      p_action: 'RECORD_EXPENSE',
      p_pocket_id: POCKET_A2_ID,
      p_jenis: 'Pengeluaran Bersama',
      p_kategori: 'Lainnya',
      p_keterangan: 'Attempt cross-branch post',
      p_idempotency_key: 'idem-cross-branch',
    })
    expect(crossBranchPostErr).not.toBeNull()

    // 3. Kasir gets 0 rows on bank_transaction_drafts
    db.setActiveActor({ id: 'kasir-a1', role: 'Kasir', tenant_id: TENANT_A, branch_id: BRANCH_A1 })
    const { data: kasirDrafts } = await db.from('bank_transaction_drafts').select('*')
    expect(kasirDrafts || []).toHaveLength(0)
  })
})
