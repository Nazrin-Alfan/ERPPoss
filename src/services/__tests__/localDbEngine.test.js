import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine'

describe('Local SaaS ERP Database Engine & Accounting Core', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
    db.localDb.store.syncStrukToCashflow = true
  })

  it('1. should initialize with default tenant and branches', async () => {
    const { data: tenants } = await db.from('tenants').select('*')
    expect(tenants.length).toBeGreaterThan(0)
    expect(tenants[0].id).toBe(DEFAULT_TENANT_ID)

    const { data: branches } = await db.from('branches').select('*')
    expect(branches.length).toBeGreaterThan(0)
    expect(branches[0].tenant_id).toBe(DEFAULT_TENANT_ID)
  })

  it('2. should maintain Standard Chart of Accounts (CoA)', async () => {
    const { data: coa } = await db.from('chart_of_accounts').select('*')
    expect(coa.length).toBeGreaterThanOrEqual(10)

    const cashAccount = coa.find((a) => a.code === '1001')
    expect(cashAccount).toBeDefined()
    expect(cashAccount.category).toBe('ASSET')
    expect(cashAccount.normal_balance).toBe('DEBIT')

    const revenueAccount = coa.find((a) => a.code === '4001')
    expect(revenueAccount).toBeDefined()
    expect(revenueAccount.category).toBe('REVENUE')
    expect(revenueAccount.normal_balance).toBe('CREDIT')
  })

  it('3. should perform CRUD operations with query builder correctly', async () => {
    // Insert
    const newProduct = {
      id_bahan_baku: 'BB-TEST-01',
      nama_produk: 'Syrup Vanilla',
      satuan: 'ml',
      stok: 1000,
    }
    const { data: inserted } = await db.from('stok_barang').insert(newProduct)
    expect(inserted.id_bahan_baku).toBe('BB-TEST-01')
    expect(inserted.tenant_id).toBe(DEFAULT_TENANT_ID)

    // Select with filter
    const { data: found } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BB-TEST-01').single()
    expect(found).toBeDefined()
    expect(found.stok).toBe(1000)

    // Update
    await db.from('stok_barang').update({ stok: 850 }).eq('id_bahan_baku', 'BB-TEST-01')
    const { data: updated } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BB-TEST-01').single()
    expect(updated.stok).toBe(850)

    // Delete
    await db.from('stok_barang').delete().eq('id_bahan_baku', 'BB-TEST-01')
    const { data: remaining } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BB-TEST-01')
    expect(remaining.length).toBe(0)
  })

  it('4. should trigger automatic stock deduction on Cafe sales based on Recipe (BOM)', async () => {
    // Check initial coffee bean stock (BK-01 = Biji Kopi in real master data)
    const { data: initialStock } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BK-01').single()
    const initialQty = initialStock.stok

    // Insert Cafe Sale for 'Americano Dingin' (qty = 2)
    // Recipe says 1 cup needs 18g coffee beans -> 2 cups = 36g
    await db.from('cafe').insert({
      id_detail: 'dtl_test_01',
      nama_menu: 'Americano Dingin',
      qty: 2,
      harga_satuan: 12000,
      subtotal: 24000,
    })

    const { data: postSaleStock } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BK-01').single()
    expect(postSaleStock.stok).toBe(initialQty - 36)

    const { data: bk } = await db.from('barang_keluar').select('*').eq('id_detail', 'dtl_test_01')
    expect(bk.length).toBeGreaterThan(0)
    expect(bk[0].jumlah_keluar).toBe(36)
  })

  it('5. should trigger automatic Double-Entry journal posting and cashflow on Completed Struk', async () => {
    const strukId = `struk_test_${Date.now()}`
    await db.from('struk').insert({
      id_struk: strukId,
      tanggal: '2026-09-11',
      nama_pelanggan: 'Pak Budi',
      metode_bayar: 'CASH',
      status_bayar: 'Selesai',
      kasir: 'ALEXA',
      total_tagihan: 50000,
    })

    // Verify Cashflow record
    const { data: cf } = await db.from('cashflow').select('*').eq('id_sumber', strukId)
    expect(cf.length).toBe(1)
    expect(cf[0].pemasukan).toBe(50000)
    expect(cf[0].pos).toBe('SALDO CASH')

    // Verify Financial Reports from Journal Entries
    const report = db.erp.getFinancialReport()
    const cashAcc = report.find((a) => a.code === '1001')
    const revAcc = report.find((a) => a.code === '4001')

    expect(cashAcc.debit).toBe(50000)
    expect(revAcc.credit).toBe(50000)
  })

  it('6. should post and balance manual Double-Entry journal entries', async () => {
    const journal = db.erp.postJournal({
      tenant_id: DEFAULT_TENANT_ID,
      memo: 'Setoran Modal Awal Tambahan',
      lines: [
        { account_id: 'acc_1001', debit: 10000000, credit: 0, memo: 'Kas Tunai' },
        { account_id: 'acc_3001', debit: 0, credit: 10000000, memo: 'Modal Disetor' },
      ],
    })

    expect(journal).toBeDefined()
    expect(journal.total_amount).toBe(10000000)

    const report = db.erp.getFinancialReport()
    const modalAcc = report.find((a) => a.code === '3001')
    expect(modalAcc.credit).toBe(10000000)
  })

  it('7. should support dynamic custom liquidity accounts in pos_balances (create, update, delete, query)', async () => {
    // 1. Initial liquidity balances should exist
    const { data: initialBalances } = await db.from('pos_balances').select('*')
    expect(initialBalances.length).toBeGreaterThanOrEqual(1)

    // 2. Add custom bank account
    const newAccount = {
      pos: 'SALDO REKENING BCA OPERASIONAL',
      label: 'BCA Operasional Utama',
      tipe: 'BANK',
      balance: 15000000,
      keterangan: 'Rekening penerimaan EDC dan QRIS',
      color: 'blue',
      is_active: true
    }
    const { data: inserted } = await db.from('pos_balances').insert(newAccount)
    expect(inserted.pos).toBe('SALDO REKENING BCA OPERASIONAL')
    expect(inserted.tenant_id).toBe(DEFAULT_TENANT_ID)

    // 3. Query the inserted account
    const { data: found } = await db.from('pos_balances').select('*').eq('pos', 'SALDO REKENING BCA OPERASIONAL').single()
    expect(found).toBeDefined()
    expect(found.balance).toBe(15000000)
    expect(found.label).toBe('BCA Operasional Utama')

    // 4. Update balance / label
    await db.from('pos_balances').update({ balance: 17500000, label: 'BCA Operasional & Payroll' }).eq('pos', 'SALDO REKENING BCA OPERASIONAL')
    const { data: updated } = await db.from('pos_balances').select('*').eq('pos', 'SALDO REKENING BCA OPERASIONAL').single()
    expect(updated.balance).toBe(17500000)
    expect(updated.label).toBe('BCA Operasional & Payroll')

    // 5. Delete custom account
    await db.from('pos_balances').delete().eq('pos', 'SALDO REKENING BCA OPERASIONAL')
    const { data: afterDelete } = await db.from('pos_balances').select('*').eq('pos', 'SALDO REKENING BCA OPERASIONAL')
    expect(afterDelete.length).toBe(0)
  })
})
