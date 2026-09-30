import { describe, it, expect, beforeEach } from 'vitest'
import {
  calculateMovingAverageCost,
  GeneralLedgerService
} from '../generalLedgerService'
import { LocalDatabaseStore, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine'

describe('General Ledger & Inventory Valuation Service (TDD)', () => {
  let store
  let glService

  beforeEach(() => {
    store = new LocalDatabaseStore()
    // Reset or ensure clean tables
    store.getTable('journal_entries').length = 0
    store.getTable('journal_entry_lines').length = 0
    glService = new GeneralLedgerService(store)
  })

  describe('1. Moving Average Cost (MAC) Formula', () => {
    it('TC_01: should calculate correct weighted average when existing stock exists', () => {
      // 1000 gr @ 200/gr + 2000 gr @ 260/gr = (200,000 + 520,000) / 3000 = 240/gr
      const result = calculateMovingAverageCost({
        currentStock: 1000,
        currentCost: 200,
        incomingQty: 2000,
        incomingUnitPrice: 260
      })
      expect(result.newCost).toBe(240)
      expect(result.newStock).toBe(3000)
      expect(result.totalValue).toBe(720000)
    })

    it('TC_02: should handle initial stock from zero (no prior stock)', () => {
      const result = calculateMovingAverageCost({
        currentStock: 0,
        currentCost: 0,
        incomingQty: 500,
        incomingUnitPrice: 150
      })
      expect(result.newCost).toBe(150)
      expect(result.newStock).toBe(500)
      expect(result.totalValue).toBe(75000)
    })

    it('TC_03: should maintain precision without rounding drift', () => {
      // 3 units @ 10 + 7 units @ 12 = (30 + 84) / 10 = 11.4
      const result = calculateMovingAverageCost({
        currentStock: 3,
        currentCost: 10,
        incomingQty: 7,
        incomingUnitPrice: 12
      })
      expect(result.newCost).toBe(11.4)
      expect(result.newStock).toBe(10)
    })
  })

  describe('2. Goods Receipt & Procurement Journal Posting', () => {
    it('TC_04: should post goods receipt paid cash and update inventory & journal', () => {
      // Setup master item
      const item = {
        id_barang: 'item_kopi_01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        nama_barang: 'Biji Kopi Arabika',
        stok_akhir: 1000,
        harga_beli: 200,
        satuan: 'gram'
      }
      store.getTable('stok_barang').push(item)

      const receipt = glService.recordGoodsReceipt({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        itemId: 'item_kopi_01',
        qty: 2000,
        unitPrice: 260,
        paymentMethod: 'CASH', // Paid from Kas (acc_1001)
        supplierName: 'CV Kopi Nusantara',
        date: '2026-09-11',
        invoiceNo: 'INV-SUP-001'
      })

      expect(receipt.success).toBe(true)
      expect(receipt.newStock).toBe(3000)
      expect(receipt.newCost).toBe(240)

      // Item in store should be updated
      const updatedItem = store.getTable('stok_barang').find(i => i.id_barang === 'item_kopi_01')
      expect(updatedItem.stok_akhir).toBe(3000)
      expect(updatedItem.harga_beli).toBe(240)

      // Journal entry should be posted: Debit acc_1300 (Persediaan) 520,000, Credit acc_1001 (Kas) 520,000
      const entries = store.getTable('journal_entries')
      expect(entries.length).toBe(1)
      expect(entries[0].total_amount).toBe(520000)

      const lines = store.getTable('journal_entry_lines').filter(l => l.journal_entry_id === entries[0].id)
      expect(lines.length).toBe(2)

      const debitLine = lines.find(l => l.account_id === 'acc_1300')
      const creditLine = lines.find(l => l.account_id === 'acc_1001')
      expect(debitLine.debit).toBe(520000)
      expect(creditLine.credit).toBe(520000)
    })

    it('TC_05: should post goods receipt on credit (tempo) to Hutang Usaha (acc_2001)', () => {
      const item = {
        id_barang: 'item_shampoo_01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        nama_barang: 'Snow Shampoo 20L',
        stok_akhir: 2,
        harga_beli: 150000,
        satuan: 'jerigen'
      }
      store.getTable('stok_barang').push(item)

      const receipt = glService.recordGoodsReceipt({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        itemId: 'item_shampoo_01',
        qty: 3,
        unitPrice: 160000,
        paymentMethod: 'CREDIT', // Tempo (acc_2001)
        supplierName: 'PT Autocare Mandiri',
        date: '2026-09-11'
      })

      expect(receipt.success).toBe(true)
      const lines = store.getTable('journal_entry_lines')
      const apLine = lines.find(l => l.account_id === 'acc_2001')
      expect(apLine).toBeDefined()
      expect(apLine.credit).toBe(480000) // 3 * 160,000
    })
  })

  describe('3. Trial Balance, P&L, and Balance Sheet Invariants', () => {
    it('TC_06: should verify Trial Balance equality (Debit == Credit)', () => {
      // Manual post balanced journal
      store.postJournalEntry({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        date: '2026-09-11',
        memo: 'Setoran Modal Awal',
        lines: [
          { account_id: 'acc_1001', debit: 5000000, credit: 0 },
          { account_id: 'acc_3001', debit: 0, credit: 5000000 }
        ]
      })

      store.postJournalEntry({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        date: '2026-09-11',
        memo: 'Pendapatan Jasa Cuci Mobil',
        lines: [
          { account_id: 'acc_1001', debit: 100000, credit: 0 },
          { account_id: 'acc_4002', debit: 0, credit: 100000 }
        ]
      })

      const tb = glService.getTrialBalance(DEFAULT_TENANT_ID)
      expect(tb.is_balanced).toBe(true)
      expect(tb.total_debit).toBe(5100000)
      expect(tb.total_credit).toBe(5100000)
      expect(tb.difference).toBe(0)
    })

    it('TC_07: should calculate Income Statement and Balance Sheet with Asset == Liability + Equity', () => {
      // 1. Initial Capital: Kas +10,000,000, Modal +10,000,000
      store.postJournalEntry({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        date: '2026-09-11',
        memo: 'Modal Awal',
        lines: [
          { account_id: 'acc_1001', debit: 10000000, credit: 0 },
          { account_id: 'acc_3001', debit: 0, credit: 10000000 }
        ]
      })

      // 2. Sales Revenue: Kas +200,000, Pendapatan Cafe +200,000
      store.postJournalEntry({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        date: '2026-09-11',
        memo: 'Penjualan Cafe',
        lines: [
          { account_id: 'acc_1001', debit: 200000, credit: 0 },
          { account_id: 'acc_4001', debit: 0, credit: 200000 }
        ]
      })

      // 3. COGS: HPP +50,000, Persediaan -50,000 (acc_1300)
      store.postJournalEntry({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        date: '2026-09-11',
        memo: 'Pemotongan HPP Resep',
        lines: [
          { account_id: 'acc_5001', debit: 50000, credit: 0 },
          { account_id: 'acc_1300', debit: 0, credit: 50000 }
        ]
      })

      // 4. Operating Expense: Beban Operasional +30,000, Kas -30,000
      store.postJournalEntry({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        date: '2026-09-11',
        memo: 'Beban Listrik',
        lines: [
          { account_id: 'acc_6002', debit: 30000, credit: 0 },
          { account_id: 'acc_1001', debit: 0, credit: 30000 }
        ]
      })

      // P&L Check
      const pnl = glService.getIncomeStatement(DEFAULT_TENANT_ID)
      expect(pnl.total_revenue).toBe(200000)
      expect(pnl.total_cogs).toBe(50000)
      expect(pnl.gross_profit).toBe(150000)
      expect(pnl.total_expenses).toBe(30000)
      expect(pnl.net_profit).toBe(120000)

      // Balance Sheet Check
      const bs = glService.getBalanceSheet(DEFAULT_TENANT_ID)
      expect(bs.is_balanced).toBe(true)
      expect(bs.total_assets).toBe(bs.total_liabilities_and_equity)
    })
  })

  describe('4. Multi-Tenant Security & Ledger Isolation', () => {
    it('TC_08: should never leak journal entries across different tenant IDs', () => {
      const OTHER_TENANT = 'tenant_other_branch'

      // Post to Default Tenant
      store.postJournalEntry({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        date: '2026-09-11',
        memo: 'Kas Default',
        lines: [
          { account_id: 'acc_1001', debit: 100000, credit: 0 },
          { account_id: 'acc_4001', debit: 0, credit: 100000 }
        ]
      })

      // Post to Other Tenant
      store.postJournalEntry({
        tenant_id: OTHER_TENANT,
        branch_id: 'branch_other',
        date: '2026-09-11',
        memo: 'Kas Other Tenant',
        lines: [
          { account_id: 'acc_1001', debit: 9999999, credit: 0 },
          { account_id: 'acc_4001', debit: 0, credit: 9999999 }
        ]
      })

      const tbDefault = glService.getTrialBalance(DEFAULT_TENANT_ID)
      expect(tbDefault.total_debit).toBe(100000)

      const tbOther = glService.getTrialBalance(OTHER_TENANT)
      expect(tbOther.total_debit).toBe(9999999)
    })
  })

  describe('5. Historical Data Backfill to Double-Entry', () => {
    it('TC_09: should automatically backfill historical struk and carwash into balanced journals', () => {
      // Seed dummy historical POS struk
      store.getTable('struk').push({
        id_struk: 'str_hist_01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: '2026-08-15',
        kasir: 'ALEXA',
        total_tagihan: 75000,
        metode_bayar: 'CASH',
        status_bayar: 'Selesai'
      })

      // Seed dummy carwash
      store.getTable('carwash').push({
        id_transaksi: 'cw_hist_01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: '2026-08-15',
        plat: 'BK 1234 JB',
        ukuran: 'Medium',
        harga: 50000,
        komisi_1: 15000,
        status: 'Selesai'
      })

      const res = glService.backfillHistoricalJournals(DEFAULT_TENANT_ID)
      expect(res.success).toBe(true)
      expect(res.backfilledCount).toBeGreaterThanOrEqual(2)

      const tb = glService.getTrialBalance(DEFAULT_TENANT_ID)
      expect(tb.is_balanced).toBe(true)
    })
  })

  describe('6. Master Categories & Two-Way Sync Manual Transaction', () => {
    it('TC_10: should create, update, and delete manual transaction with two-way sync', () => {
      // 1. Create Manual Transaction
      const createRes = glService.createManualTransaction({
        tenant_id: DEFAULT_TENANT_ID,
        date: '2026-09-14',
        debitAccountId: 'acc_6002', // Listrik
        creditAccountId: 'acc_1001', // Kas
        amount: 250000,
        keterangan: 'Beli Token Listrik Carwash',
        categoryName: 'Listrik Carwash',
        tipe: 'Pengeluaran',
      })

      expect(createRes.success).toBe(true)
      expect(createRes.journal_id).toBeDefined()

      // Check ledger drilldown
      const ledger = glService.getAccountLedger(DEFAULT_TENANT_ID, 'acc_6002')
      const row = ledger.rows.find(r => r.journal_id === createRes.journal_id)
      expect(row).toBeDefined()
      expect(row.debit).toBe(250000)
      expect(row.memo).toBe('Beli Token Listrik Carwash')

      // 2. Update Transaction
      glService.updateTransaction({
        tenant_id: DEFAULT_TENANT_ID,
        journalId: createRes.journal_id,
        newDate: '2026-09-15',
        newAmount: 300000,
        newMemo: 'Beli Token Listrik Carwash (Revisi)',
      })

      const ledgerUpdated = glService.getAccountLedger(DEFAULT_TENANT_ID, 'acc_6002')
      const rowUpdated = ledgerUpdated.rows.find(r => r.journal_id === createRes.journal_id)
      expect(rowUpdated.debit).toBe(300000)
      expect(rowUpdated.date).toBe('2026-09-15')
      expect(rowUpdated.memo).toBe('Beli Token Listrik Carwash (Revisi)')

      // 3. Delete Transaction
      glService.deleteTransaction({
        tenant_id: DEFAULT_TENANT_ID,
        journalId: createRes.journal_id,
      })

      const ledgerDeleted = glService.getAccountLedger(DEFAULT_TENANT_ID, 'acc_6002')
      const rowDeleted = ledgerDeleted.rows.find(r => r.journal_id === createRes.journal_id)
      expect(rowDeleted).toBeUndefined()
    })
  })
})
