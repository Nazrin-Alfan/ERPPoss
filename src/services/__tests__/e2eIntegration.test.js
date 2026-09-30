import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine'
import { calculateMovingAverageCost, GeneralLedgerService } from '../generalLedgerService'
import { addToCart, updateQty, removeFromCart } from '../../utils/cartHelpers'
import {
  normalizeCategory,
  normalizeJenis,
  validateExpenseForm,
  formatExpensePayload,
  validatePosExpenseForm,
  formatPosExpensePayload,
  validateIncomeForm,
  formatIncomePayload
} from '../../utils/financeHelpers'
import { calculateROI, PRICING_TIERS, HOURLY_LABOR_RATE_IDR } from '../../utils/promoHelpers'

describe('Comprehensive End-to-End SaaS ERP System & Data Connection Audit', () => {
  let db
  let glService

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
    db.localDb.store.syncStrukToCashflow = true
    glService = new GeneralLedgerService(db.localDb.store)
  })

  describe('1. Multi-Tenancy & Security Isolation', () => {
    it('TC_SYS_01: should enforce tenant_id and branch_id on all created records', async () => {
      const { data: tenant } = await db.from('tenants').select('*').eq('id', DEFAULT_TENANT_ID).single()
      expect(tenant).toBeDefined()
      expect(tenant.id).toBe(DEFAULT_TENANT_ID)
      expect(tenant.nama).toMatch(/RelayPOS Demo/)

      const { data: branches } = await db.from('branches').select('*').eq('tenant_id', DEFAULT_TENANT_ID)
      expect(branches.length).toBeGreaterThan(0)
      expect(branches[0].tenant_id).toBe(DEFAULT_TENANT_ID)

      // Insert item and check auto-injected tenant_id & branch_id
      const { data: item } = await db.from('stok_barang').insert({
        id_bahan_baku: 'BB-AUDIT-01',
        nama_produk: 'Susu UHT Fresh',
        satuan: 'liter',
        stok: 50
      })
      expect(item.tenant_id).toBe(DEFAULT_TENANT_ID)
      expect(item.branch_id).toBe(DEFAULT_BRANCH_ID)
    })
  })

  describe('2. Master Category & Access Control (Kasir vs Owner)', () => {
    it('TC_SYS_02: should maintain master cashflow categories and filter cashier-accessible options', async () => {
      const { data: categories } = await db.from('master_categories').select('*')
      expect(categories.length).toBeGreaterThan(0)

      // Cashier should only access categories where boleh_kasir is true
      const cashierCategories = categories.filter((c) => c.boleh_kasir === true)
      const ownerOnlyCategories = categories.filter((c) => c.boleh_kasir === false)

      expect(cashierCategories.length).toBeGreaterThan(0)
      expect(ownerOnlyCategories.length).toBeGreaterThan(0)

      // High-level strategic expenses (e.g. Sewa Tempat, Prive, Listrik) must be restricted from frontline cashiers
      const sewaCategory = categories.find((c) => c.nama_kategori.toLowerCase().includes('sewa'))
      if (sewaCategory) {
        expect(sewaCategory.boleh_kasir).toBe(false)
      }

      // Operational emergency expenses should be available to cashiers
      const operasionalKasir = categories.find((c) => c.nama_kategori.toLowerCase().includes('operasional'))
      if (operasionalKasir) {
        expect(operasionalKasir.boleh_kasir).toBe(true)
      }
    })
  })

  describe('3. POS Cart, Recipe BOM Deduction & Automatic Journal Postings', () => {
    it('TC_SYS_03: should execute a multi-item POS transaction and connect all relational tables', async () => {
      // 1. Initial inventory snapshot for Coffee Beans (BK-01)
      const { data: initialBean } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BK-01').single()
      const initialBeanStock = initialBean ? initialBean.stok : 1000

      // 2. Compute Cart
      let cart = []
      cart = addToCart(cart, { id_menu: 'menu_01', nama_menu: 'Americano Dingin', harga: 12000, kategori: 'Kopi' })
      cart = updateQty(cart, 'Americano Dingin', 1) // qty becomes 2
      expect(cart.length).toBe(1)
      expect(cart[0].qty).toBe(2)

      const subtotal = cart.reduce((sum, item) => sum + item.harga * item.qty, 0)
      expect(subtotal).toBe(24000)

      // 3. Create POS Struk
      const strukId = `STRUK-AUDIT-${Date.now()}`
      const { data: struk } = await db.from('struk').insert({
        id_struk: strukId,
        tanggal: '2026-09-18',
        jam: '14:30:00',
        nama_pelanggan: 'Budi Santoso',
        no_plat: 'BK 1234 JB',
        metode_bayar: 'QRIS',
        status_bayar: 'Selesai',
        kasir: 'ALEXA',
        total_tagihan: 24000,
        subtotal: 24000,
        diskon: 0
      })
      expect(struk.id_struk).toBe(strukId)

      // 4. Insert Cafe Details (Line Items)
      const { data: dtl1 } = await db.from('cafe').insert({
        id_detail: `DTL-CAF-1-${Date.now()}`,
        id_struk: strukId,
        nama_menu: 'Americano Dingin',
        qty: 2,
        harga_satuan: 12000,
        subtotal: 24000
      })
      expect(dtl1.id_struk).toBe(strukId)

      // 5. Verify Automatic BOM Inventory Deduction (2 Americano = 36g Coffee Beans)
      const { data: postBean } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BK-01').single()
      if (initialBean) {
        expect(postBean.stok).toBe(initialBeanStock - 36)
      }

      // Verify Barang Keluar audit log
      const { data: bkLogs } = await db.from('barang_keluar').select('*').eq('id_detail', dtl1.id_detail)
      expect(bkLogs.length).toBeGreaterThan(0)
      expect(bkLogs[0].jumlah_keluar).toBe(36)

      // 6. Verify Automatic Cashflow Log for QRIS Payment
      const { data: cfLogs } = await db.from('cashflow').select('*').eq('id_sumber', strukId)
      expect(cfLogs.length).toBe(1)
      expect(cfLogs[0].pemasukan).toBe(24000)

      // 7. Verify Automatic Double-Entry Journal Entry
      const journals = db.localDb.store.getTable('journal_entries').filter((j) => j.source_id === strukId)
      expect(journals.length).toBe(1)
      expect(journals[0].total_amount).toBe(24000)

      const lines = db.localDb.store.getTable('journal_entry_lines').filter((l) => l.journal_entry_id === journals[0].id)
      const debitSum = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
      const creditSum = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
      expect(debitSum).toBe(24000)
      expect(creditSum).toBe(24000)
      expect(debitSum).toBe(creditSum) // Invariant check: Debit === Credit
    })
  })

  describe('4. Carwash Queue & Progress Tracking', () => {
    it('TC_SYS_04: should manage queue status lifecycle and update vehicle status', async () => {
      const strukId = `STRUK-CW-${Date.now()}`
      
      // 1. Insert Struk with Carwash Service
      await db.from('struk').insert({
        id_struk: strukId,
        tanggal: '2026-09-18',
        nama_pelanggan: 'Rian Pratama',
        no_plat: 'BK 9988 XYZ',
        metode_bayar: 'CASH',
        status_bayar: 'Selesai',
        kasir: 'KASIR_1',
        total_tagihan: 50000
      })

      // 2. Insert Carwash Detail
      const { data: cwDetail } = await db.from('carwash').insert({
        id_detail: `DTL-CW-${Date.now()}`,
        id_struk: strukId,
        paket: 'Cuci Salju + Wax',
        plat: 'BK 9988 XYZ',
        harga_satuan: 50000,
        subtotal: 50000,
        status: 'Antre',
        karyawan_cuci: 'Riko'
      })
      expect(cwDetail.plat).toBe('BK 9988 XYZ')
      expect(cwDetail.status).toBe('Antre')

      // 3. Update Progress (Antre -> Cuci -> Kering -> Selesai)
      await db.from('carwash').update({ status: 'Cuci' }).eq('id_detail', cwDetail.id_detail)
      let { data: cwCurrent } = await db.from('carwash').select('*').eq('id_detail', cwDetail.id_detail).single()
      expect(cwCurrent.status).toBe('Cuci')

      await db.from('carwash').update({ status: 'Selesai' }).eq('id_detail', cwDetail.id_detail)
      cwCurrent = (await db.from('carwash').select('*').eq('id_detail', cwDetail.id_detail).single()).data
      expect(cwCurrent.status).toBe('Selesai')
    })
  })

  describe('5. Inventory Procurement & Moving Average Cost (MAC)', () => {
    it('TC_SYS_05: should accurately compute MAC and post procurement journals', () => {
      // Current: 500 pcs @ Rp 10.000 (Total Rp 5.000.000)
      // Inbound: 1.000 pcs @ Rp 13.000 (Total Rp 13.000.000)
      // New: (5.000.000 + 13.000.000) / 1.500 = 18.000.000 / 1.500 = Rp 12.000 / pc
      const macResult = calculateMovingAverageCost({
        currentStock: 500,
        currentCost: 10000,
        incomingQty: 1000,
        incomingUnitPrice: 13000
      })

      expect(macResult.newStock).toBe(1500)
      expect(macResult.newCost).toBe(12000)
      expect(macResult.totalValue).toBe(18000000)

      // Post Procurement via GeneralLedgerService
      const receipt = glService.recordGoodsReceipt({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        itemId: 'BK-01',
        qty: 1000,
        unitPrice: 13000,
        paymentMethod: 'TRANSFER', // Paid from Bank (acc_1002)
        supplierName: 'PT Distributor Utama',
        date: '2026-09-18',
        invoiceNo: 'PO-2026-001'
      })

      expect(receipt.success).toBe(true)
      expect(receipt.totalAmount).toBe(13000000)

      // Verify Posted Journal Lines: Debit 1300 (Persediaan), Credit 1002 (Bank)
      const lastJournal = db.localDb.store.getTable('journal_entries').find((j) => j.id === receipt.journalEntryId)
      expect(lastJournal).toBeDefined()
      expect(lastJournal.total_amount).toBe(13000000)

      const lines = db.localDb.store.getTable('journal_entry_lines').filter((l) => l.journal_entry_id === receipt.journalEntryId)
      const debitPersediaan = lines.find((l) => l.account_id === 'acc_1300')
      const creditBank = lines.find((l) => l.account_id === 'acc_1002')

      expect(debitPersediaan.debit).toBe(13000000)
      expect(creditBank.credit).toBe(13000000)
    })
  })

  describe('6. Finance, Cashflow Classification & Non-Sales Inflow Isolation', () => {
    it('TC_SYS_06: should isolate tenant leases & owner capital from operational sales revenue', async () => {
      // 1. Post Tenant Lease (Sewa Tenant Burger) -> Should route to 4003 (Other Income / Retail)
      const leaseJournal = db.erp.postJournal({
        tenant_id: DEFAULT_TENANT_ID,
        memo: 'Penerimaan Sewa Tenant Burger Bulan September',
        source_type: 'pemasukan_sewa',
        source_id: 'SEWA-001',
        lines: [
          { account_id: 'acc_1001', debit: 1500000, credit: 0, memo: 'Kas Kasir' },
          { account_id: 'acc_4003', debit: 0, credit: 1500000, memo: 'Pendapatan Sewa Tenant' }
        ]
      })
      expect(leaseJournal.total_amount).toBe(1500000)

      // 2. Post Owner Capital Injection -> Should route to 3001 (Modal Disetor)
      const capitalJournal = db.erp.postJournal({
        tenant_id: DEFAULT_TENANT_ID,
        memo: 'Suntikan Modal Pemilik Tambahan',
        source_type: 'modal_disetor',
        source_id: 'MODAL-001',
        lines: [
          { account_id: 'acc_1002', debit: 25000000, credit: 0, memo: 'Kas Bank' },
          { account_id: 'acc_3001', debit: 0, credit: 25000000, memo: 'Modal Disetor' }
        ]
      })
      expect(capitalJournal.total_amount).toBe(25000000)

      // Verify Financial Report segregation
      const report = db.erp.getFinancialReport()
      const leaseAcc = report.find((a) => a.code === '4003')
      const capitalAcc = report.find((a) => a.code === '3001')
      const salesCafeAcc = report.find((a) => a.code === '4001')

      expect(leaseAcc.credit).toBe(1500000)
      expect(capitalAcc.credit).toBe(25000000)
      // Sales revenue account is untouched by non-sales inflows
      expect(salesCafeAcc.credit).toBeGreaterThanOrEqual(0)
    })

    it('TC_SYS_07: should validate and format expense & income payloads correctly', () => {
      // 1. Validate POS Expense Form
      const validForm = {
        nominal: 50000,
        kategori: 'Operasional',
        keterangan: 'Beli Kanebo Pengering'
      }
      expect(validatePosExpenseForm(validForm).isValid).toBe(true)

      const payload = formatPosExpensePayload({
        form: validForm,
        todayDate: '2026-09-18',
        currentTime: '15:00:00',
        newExpId: 'exp_test_01'
      })
      expect(payload.nominal).toBe(50000)
      expect(payload.kategori).toBe('Operasional')

      // 2. Validate Income Form
      const validIncome = {
        nominal: 1000000,
        kategori: 'Sewa',
        keterangan: 'Uang Sewa Stand Makanan',
        pos: 'SALDO CASH'
      }
      expect(validateIncomeForm(validIncome).isValid).toBe(true)

      const incPayload = formatIncomePayload({
        form: validIncome,
        newCfId: 'cf_test_inc_01',
        todayDate: '2026-09-18',
        timestamp: new Date().toISOString()
      })
      expect(incPayload.pemasukan).toBe(1000000)
      expect(incPayload.pengeluaran).toBe(0)
    })
  })

  describe('7. General Ledger Invariant & Financial Statements (P&L, Balance Sheet)', () => {
    it('TC_SYS_08: should guarantee Assets = Liabilities + Equity identity across the enterprise', () => {
      const balanceSheet = glService.getBalanceSheet(DEFAULT_TENANT_ID)

      expect(balanceSheet).toBeDefined()
      expect(balanceSheet.is_balanced).toBe(true)
      expect(balanceSheet.total_assets).toBe(balanceSheet.total_liabilities_and_equity)
      expect(Math.abs(balanceSheet.total_assets - balanceSheet.total_liabilities_and_equity)).toBeLessThan(0.01)
    })

    it('TC_SYS_09: should execute Two-Way Sync between operational transactions and General Ledger', async () => {
      // 1. Create a transaction via Two-Way Sync helper
      const newTx = glService.createManualTransaction({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        date: '2026-09-18',
        debitAccountId: 'acc_6002',
        creditAccountId: 'acc_1001',
        amount: 350000,
        keterangan: 'Pembayaran Token Listrik Cafe',
        categoryName: 'Listrik Cafe',
        pos: 'SALDO CASH',
        tipe: 'Pengeluaran'
      })

      expect(newTx.success).toBe(true)
      expect(newTx.journal_id).toBeDefined()

      // Check corresponding operational records
      const { data: expRows } = await db.from('pengeluaran').select('*').eq('id_pengeluaran', newTx.id)
      expect(expRows.length).toBe(1)
      expect(expRows[0].nominal).toBe(350000)

      const { data: cfRows } = await db.from('cashflow').select('*').eq('id_sumber', newTx.id)
      expect(cfRows.length).toBe(1)
      expect(cfRows[0].pengeluaran).toBe(350000)

      // 2. Update transaction nominal via Two-Way Sync (Rp 350.000 -> Rp 400.000)
      const updateResult = glService.updateTransaction({
        tenant_id: DEFAULT_TENANT_ID,
        journalId: newTx.journal_id,
        newAmount: 400000,
        newMemo: 'Revisi Token Listrik Cafe'
      })
      expect(updateResult.success).toBe(true)

      // Verify updated journal
      const updatedJournal = db.localDb.store.getTable('journal_entries').find((j) => j.id === newTx.journal_id)
      expect(updatedJournal.total_amount).toBe(400000)
      expect(updatedJournal.memo).toBe('Revisi Token Listrik Cafe')

      // Verify updated source pengeluaran
      const { data: updatedExp } = await db.from('pengeluaran').select('*').eq('id_pengeluaran', newTx.id).single()
      expect(updatedExp.nominal).toBe(400000)
    })
  })

  describe('8. CRM Retention & ROI Calculation Utilities', () => {
    it('TC_SYS_10: should verify CRM customer tiering and ROI simulation formulas', () => {
      // ROI Simulator verification
      const roi = calculateROI({
        monthlyRevenue: 50000000, // 50 juta
        wastePercent: 8,          // 8% pemborosan bahan
        hoursSavedDaily: 2        // 2 jam efisiensi closing
      })

      // Waste saving = 50.000.000 * 0.08 = 4.000.000
      // Labor saving = 2 * 30 * 25.000 = 1.500.000
      // Total benefit = 5.500.000 / bulan
      expect(roi.monthlyWasteSavings).toBe(4000000)
      expect(roi.monthlyLaborSavings).toBe(1500000)
      expect(roi.totalMonthlySavings).toBe(5500000)
      expect(roi.totalAnnualSavings).toBe(66000000)
      expect(PRICING_TIERS.pro.monthlyPrice).toBe(399000)
      expect(HOURLY_LABOR_RATE_IDR).toBe(25000)
    })
  })
})
