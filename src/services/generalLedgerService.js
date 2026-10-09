/**
 * General Ledger Service for SaaS ERP
 * Enterprise Double-Entry Accounting, Inventory Valuation (Moving Average Cost),
 * and Financial Statements Generator (Trial Balance, P&L, Balance Sheet, Ledger Drilldown).
 */

import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../constants/erpConfig.js'
import { resolveAccountForPaymentMethod } from '../constants/transactionConstants.js'

/**
 * Calculates Moving Average Cost (MAC) upon receiving new stock
 * @param {Object} params
 * @param {number} params.currentStock - Existing stock on hand
 * @param {number} params.currentCost - Current unit cost
 * @param {number} params.incomingQty - Quantity being received
 * @param {number} params.incomingUnitPrice - Unit purchase price from vendor
 * @returns {{ newStock: number, newCost: number, totalValue: number }}
 */
export function calculateMovingAverageCost({
  currentStock = 0,
  currentCost = 0,
  incomingQty = 0,
  incomingUnitPrice = 0,
}) {
  const sLama = Math.max(0, parseFloat(currentStock) || 0)
  const hLama = Math.max(0, parseFloat(currentCost) || 0)
  const qMasuk = Math.max(0, parseFloat(incomingQty) || 0)
  const hMasuk = Math.max(0, parseFloat(incomingUnitPrice) || 0)

  const totalValLama = sLama * hLama
  const totalValMasuk = qMasuk * hMasuk
  const newStock = sLama + qMasuk
  const totalValue = Math.round((totalValLama + totalValMasuk + Number.EPSILON) * 100) / 100

  let newCost = hMasuk
  if (newStock > 0) {
    newCost = totalValue / newStock
  }

  // Round to 4 decimal places for exact precision
  const roundedCost = Math.round((newCost + Number.EPSILON) * 10000) / 10000

  return {
    newStock,
    newCost: roundedCost,
    totalValue,
  }
}

export class GeneralLedgerService {
  constructor(store) {
    this.store = store
  }

  /**
   * Records a Goods Receipt (Barang Masuk) with Moving Average Cost update and automated double-entry posting.
   */
  recordGoodsReceipt({
    tenant_id = DEFAULT_TENANT_ID,
    branch_id = DEFAULT_BRANCH_ID,
    itemId,
    qty,
    unitPrice,
    paymentMethod = 'CASH', // 'CASH' | 'BANK' | 'CREDIT' (Tempo)
    supplierName = '',
    date = new Date().toISOString().split('T')[0],
    invoiceNo = '',
  }) {
    if (!this.store) {
      throw new Error('Database store is not initialized in GeneralLedgerService')
    }

    const stokTable = this.store.getTable('stok_barang')
    const item = stokTable.find(
      (i) => (i.id_barang === itemId || i.id === itemId || i.id_bahan_baku === itemId) && (i.tenant_id === tenant_id || !i.tenant_id)
    )

    if (!item) {
      throw new Error(`Master item with ID ${itemId} not found for tenant ${tenant_id}`)
    }

    const qNum = parseFloat(qty) || 0
    const priceNum = parseFloat(unitPrice) || 0
    const totalAmount = Math.round((qNum * priceNum + Number.EPSILON) * 100) / 100

    // 1. Calculate Moving Average Cost
    const currentStock = parseFloat(item.stok_akhir) || 0
    const currentCost = parseFloat(item.harga_beli) || parseFloat(item.hpp) || 0
    const macResult = calculateMovingAverageCost({
      currentStock,
      currentCost,
      incomingQty: qNum,
      incomingUnitPrice: priceNum,
    })

    // Update Master Item in Memory
    item.stok_akhir = macResult.newStock
    item.harga_beli = macResult.newCost
    if (item.hpp !== undefined) item.hpp = macResult.newCost

    // 2. Append to barang_masuk
    const masukRecord = {
      id_barang_masuk: `bm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id,
      branch_id,
      id_barang: itemId,
      nama_barang: item.nama_barang,
      qty: qNum,
      satuan: item.satuan || 'pcs',
      harga_satuan: priceNum,
      total_harga: totalAmount,
      supplier: supplierName || 'Supplier Umum',
      nomor_faktur: invoiceNo || `INV-${Date.now().toString().slice(-6)}`,
      metode_bayar: paymentMethod,
      tanggal: date,
      created_at: new Date().toISOString(),
    }
    this.store.getTable('barang_masuk').push(masukRecord)

    // 3. Append to stock_movements (Audit Log)
    if (!this.store.data.stock_movements) {
      this.store.data.stock_movements = []
    }
    this.store.data.stock_movements.push({
      id: `sm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id,
      branch_id,
      item_id: itemId,
      movement_type: 'IN_PURCHASE',
      qty_change: qNum,
      balance_after: macResult.newStock,
      unit_cost: macResult.newCost,
      reference_id: masukRecord.id_barang_masuk,
      notes: `Pembelian dari ${supplierName || 'Supplier'} (${paymentMethod})`,
      created_at: new Date().toISOString(),
    })

    // 4. Automated Double-Entry Journal Posting
    // Debit: Persediaan Bahan Baku (acc_1300)
    // Credit: Kas (acc_1001), Bank (acc_1002), or Hutang Usaha (acc_2001)
    let creditAccount = 'acc_1001'
    if (paymentMethod === 'CREDIT' || paymentMethod === 'TEMPO') {
      creditAccount = 'acc_2001'
    } else if (paymentMethod === 'BANK' || paymentMethod === 'TRANSFER' || paymentMethod === 'QRIS') {
      creditAccount = 'acc_1002'
    }

    const journal = this.store.postJournalEntry({
      tenant_id,
      branch_id,
      date,
      memo: `Pembelian Persediaan: ${item.nama_barang} (${qNum} ${item.satuan || ''})`,
      source_type: 'barang_masuk',
      source_id: masukRecord.id_barang_masuk,
      lines: [
        {
          account_id: 'acc_1300',
          account_code: '1300',
          account_name: 'Persediaan Bahan Baku & Stok',
          debit: totalAmount,
          credit: 0,
          memo: `Penerimaan ${item.nama_barang} @ ${priceNum}`,
        },
        {
          account_id: creditAccount,
          account_code: creditAccount === 'acc_2001' ? '2001' : (creditAccount === 'acc_1002' ? '1002' : '1001'),
          account_name: creditAccount === 'acc_2001' ? 'Hutang Usaha (AP)' : (creditAccount === 'acc_1002' ? 'Kas Bank' : 'Kas Kasir'),
          debit: 0,
          credit: totalAmount,
          memo: `Pembayaran persediaan via ${paymentMethod}`,
        },
      ],
    })

    this.store.saveToStorage()

    return {
      success: true,
      newStock: macResult.newStock,
      newCost: macResult.newCost,
      totalAmount,
      journalEntryId: journal?.id,
    }
  }

  /**
   * Generates a Trial Balance (Neraca Saldo)
   */
  getTrialBalance(tenant_id = DEFAULT_TENANT_ID) {
    let coa = (this.store.getTable('chart_of_accounts') || []).filter((a) => a.tenant_id === tenant_id)
    if (coa.length === 0) {
      // Fallback to standard Chart of Accounts template
      const defaultCoa = (this.store.getTable('chart_of_accounts') || []).filter((a) => a.tenant_id === DEFAULT_TENANT_ID)
      coa = defaultCoa.map((a) => ({ ...a, tenant_id }))
    }
    const lines = (this.store.getTable('journal_entry_lines') || []).filter((l) => l.tenant_id === tenant_id)

    let totalDebit = 0
    let totalCredit = 0

    const accounts = coa.map((acc) => {
      const accLines = lines.filter((l) => l.account_id === acc.id)
      const lineDebit = accLines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0)
      const lineCredit = accLines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0)

      totalDebit += lineDebit
      totalCredit += lineCredit

      let balanceDebit = 0
      let balanceCredit = 0

      if (acc.normal_balance === 'DEBIT') {
        const net = lineDebit - lineCredit
        if (net >= 0) balanceDebit = net
        else balanceCredit = Math.abs(net)
      } else {
        const net = lineCredit - lineDebit
        if (net >= 0) balanceCredit = net
        else balanceDebit = Math.abs(net)
      }

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        category: acc.category,
        normal_balance: acc.normal_balance,
        total_debit: lineDebit,
        total_credit: lineCredit,
        balance_debit: balanceDebit,
        balance_credit: balanceCredit,
      }
    })

    const difference = Math.round((Math.abs(totalDebit - totalCredit) + Number.EPSILON) * 100) / 100
    const is_balanced = difference < 0.01

    return {
      accounts,
      total_debit: Math.round((totalDebit + Number.EPSILON) * 100) / 100,
      total_credit: Math.round((totalCredit + Number.EPSILON) * 100) / 100,
      difference,
      is_balanced,
    }
  }

  /**
   * Generates an Income Statement (Laporan Laba Rugi Komprehensif)
   */
  getIncomeStatement(tenant_id = DEFAULT_TENANT_ID) {
    const tb = this.getTrialBalance(tenant_id)

    // Revenues (category === 'REVENUE')
    const revenues = tb.accounts
      .filter((a) => a.category === 'REVENUE')
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        amount: a.balance_credit - a.balance_debit,
      }))
    const total_revenue = revenues.reduce((s, a) => s + a.amount, 0)

    // COGS (code 5000-5999 or HPP)
    const cogs = tb.accounts
      .filter((a) => a.category === 'EXPENSE' && (a.code.startsWith('5') || a.name.toLowerCase().includes('hpp')))
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        amount: a.balance_debit - a.balance_credit,
      }))
    const total_cogs = cogs.reduce((s, a) => s + a.amount, 0)
    const gross_profit = total_revenue - total_cogs

    // Operating Expenses (category === 'EXPENSE' and not COGS)
    const expenses = tb.accounts
      .filter((a) => a.category === 'EXPENSE' && !a.code.startsWith('5') && !a.name.toLowerCase().includes('hpp'))
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        amount: a.balance_debit - a.balance_credit,
      }))
    const total_expenses = expenses.reduce((s, a) => s + a.amount, 0)
    const net_profit = gross_profit - total_expenses

    return {
      revenues,
      total_revenue,
      cogs,
      total_cogs,
      gross_profit,
      expenses,
      total_expenses,
      net_profit,
    }
  }

  /**
   * Generates a Balance Sheet (Neraca Keuangan: Aset = Liabilitas + Ekuitas)
   */
  getBalanceSheet(tenant_id = DEFAULT_TENANT_ID) {
    const tb = this.getTrialBalance(tenant_id)
    const pnl = this.getIncomeStatement(tenant_id)

    // Assets
    const assets = tb.accounts
      .filter((a) => a.category === 'ASSET')
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        amount: a.balance_debit - a.balance_credit,
      }))
    const total_assets = assets.reduce((s, a) => s + a.amount, 0)

    // Liabilities
    const liabilities = tb.accounts
      .filter((a) => a.category === 'LIABILITY')
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        amount: a.balance_credit - a.balance_debit,
      }))
    const total_liabilities = liabilities.reduce((s, a) => s + a.amount, 0)

    // Equity
    const equity = tb.accounts
      .filter((a) => a.category === 'EQUITY')
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        amount: a.balance_credit - a.balance_debit,
      }))
    const base_equity = equity.reduce((s, a) => s + a.amount, 0)

    // Add current period net profit to equity
    const current_net_profit = pnl.net_profit
    const total_equity = base_equity + current_net_profit

    const total_liabilities_and_equity = Math.round((total_liabilities + total_equity + Number.EPSILON) * 100) / 100
    const rounded_assets = Math.round((total_assets + Number.EPSILON) * 100) / 100
    const difference = Math.round((Math.abs(rounded_assets - total_liabilities_and_equity) + Number.EPSILON) * 100) / 100
    const is_balanced = difference < 0.01

    return {
      assets,
      total_assets: rounded_assets,
      liabilities,
      total_liabilities,
      equity,
      base_equity,
      current_net_profit,
      total_equity,
      total_liabilities_and_equity,
      difference,
      is_balanced,
    }
  }

  /**
   * Returns a detailed drilldown of transactions for a specific Account ID
   */
  getAccountLedger(tenant_id = DEFAULT_TENANT_ID, accountId) {
    const coa = (this.store.getTable('chart_of_accounts') || []).find((a) => a.id === accountId && a.tenant_id === tenant_id)
    if (!coa) return null

    const entries = (this.store.getTable('journal_entries') || []).filter((e) => e.tenant_id === tenant_id)
    const lines = (this.store.getTable('journal_entry_lines') || []).filter(
      (l) => l.account_id === accountId && l.tenant_id === tenant_id
    )

    let runningBalance = 0

    const rows = lines
      .map((line) => {
        const header = entries.find((e) => e.id === line.journal_entry_id) || {}
        const debit = parseFloat(line.debit) || 0
        const credit = parseFloat(line.credit) || 0

        if (coa.normal_balance === 'DEBIT') {
          runningBalance += (debit - credit)
        } else {
          runningBalance += (credit - debit)
        }

        return {
          id: line.id,
          journal_id: line.journal_entry_id,
          entry_no: header.entry_no || '-',
          date: header.date || '-',
          memo: line.memo || header.memo || '-',
          source_type: header.source_type || null,
          source_id: header.source_id || null,
          debit,
          credit,
          running_balance: runningBalance,
        }
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    return {
      account: coa,
      rows,
      closing_balance: runningBalance,
    }
  }

  /**
   * Automatically backfills historical transactions into double-entry journals
   * if journal_entries table is empty upon initial startup.
   */
  backfillHistoricalJournals(tenant_id = DEFAULT_TENANT_ID) {
    const entries = this.store.getTable('journal_entries')
    const existingForTenant = entries.filter((e) => e.tenant_id === tenant_id)
    if (existingForTenant.length > 0) {
      return { skipped: true, count: existingForTenant.length }
    }

    let backfilledCount = 0
    const branchId = DEFAULT_BRANCH_ID

    // 1. Struk & Cafe Transactions (Recent 200)
    const strukList = (this.store.getTable('struk') || []).filter((s) => s.status_bayar !== 'Batal').slice(-200)
    strukList.forEach((s) => {
      const amount = parseFloat(s.total_tagihan) || 0
      if (amount > 0) {
        const debitAcc = resolveAccountForPaymentMethod(s.metode_bayar, this.store.getTable('metode_bayar'))
        this.store.postJournalEntry({
          tenant_id,
          branch_id: branchId,
          date: s.tanggal,
          memo: `[Historical] Penjualan POS Kasir (${s.kasir || 'Kasir'}) - Struk ${String(s.id_struk).substring(0, 8)}`,
          source_type: 'struk',
          source_id: s.id_struk,
          lines: [
            { account_id: debitAcc, debit: amount, credit: 0, memo: `Kas/Bank via ${s.metode_bayar || 'CASH'}` },
            { account_id: 'acc_4001', debit: 0, credit: amount, memo: 'Pendapatan Cafe & F&B' },
          ],
        }, false)
        backfilledCount++
      }
    })

    // 2. Carwash Transactions (Recent 200)
    const carwashList = (this.store.getTable('carwash') || []).filter((c) => c.status === 'Selesai' || c.status === 'Sedang Dicuci').slice(-200)
    carwashList.forEach((c) => {
      const price = parseFloat(c.harga) || 0
      const commission = (parseFloat(c.komisi_1) || 0) + (parseFloat(c.komisi_2) || 0)
      if (price > 0) {
        // Revenue posting
        this.store.postJournalEntry({
          tenant_id,
          branch_id: branchId,
          date: c.tanggal,
          memo: `[Historical] Jasa Cuci Mobil: ${c.plat || ''} (${c.ukuran || ''})`,
          source_type: 'carwash',
          source_id: c.id_carwash || c.id,
          lines: [
            { account_id: 'acc_1001', debit: price, credit: 0, memo: 'Penerimaan Kas Carwash' },
            { account_id: 'acc_4002', debit: 0, credit: price, memo: 'Pendapatan Jasa Carwash' },
          ],
        }, false)
        backfilledCount++

        // Commission posting
        if (commission > 0) {
          this.store.postJournalEntry({
            tenant_id,
            branch_id: branchId,
            date: c.tanggal,
            memo: `[Historical] Beban Komisi Pencuci: ${c.plat || ''}`,
            source_type: 'carwash_commission',
            source_id: c.id_carwash || c.id,
            lines: [
              { account_id: 'acc_6001', debit: commission, credit: 0, memo: 'Beban Komisi Kru Cuci' },
              { account_id: 'acc_2002', debit: 0, credit: commission, memo: 'Hutang Komisi Kru Cuci' },
            ],
          }, false)
          backfilledCount++
        }
      }
    })

    // 3. Pengeluaran Transactions (Recent 100)
    const pengeluaranList = (this.store.getTable('pengeluaran') || []).slice(-100)
    pengeluaranList.forEach((p) => {
      const nom = parseFloat(p.nominal) || 0
      if (nom > 0) {
        const kat = String(p.kategori || '').toLowerCase()
        let expAcc = 'acc_6004' // Beban Operasional Umum
        if (kat.includes('listrik') || kat.includes('air') || kat.includes('utilitas')) {
          expAcc = 'acc_6002'
        } else if (kat.includes('servis') || kat.includes('mesin') || kat.includes('perawatan')) {
          expAcc = 'acc_6003'
        } else if (kat.includes('bahan') || kat.includes('kopi') || kat.includes('sabun')) {
          expAcc = 'acc_5001'
        }

        this.store.postJournalEntry({
          tenant_id,
          branch_id: branchId,
          date: p.tanggal,
          memo: `[Historical] Beban: ${p.nama_pengeluaran || p.kategori}`,
          source_type: 'pengeluaran',
          source_id: p.id_pengeluaran,
          lines: [
            { account_id: expAcc, debit: nom, credit: 0, memo: `Beban ${p.kategori || 'Operasional'}` },
            { account_id: 'acc_1001', debit: 0, credit: nom, memo: 'Kas Berkurang' },
          ],
        }, false)
        backfilledCount++
      }
    })

    this.store.saveToStorage(true)
    return { success: true, backfilledCount }
  }

  /**
   * Two-Way Sync Mutasi: Create manual transaction and reflect immediately in GL
   */
  createManualTransaction({
    tenant_id = DEFAULT_TENANT_ID,
    branch_id = DEFAULT_BRANCH_ID,
    date = new Date().toISOString().split('T')[0],
    debitAccountId,
    creditAccountId,
    amount,
    keterangan,
    categoryName = 'Operasional',
    pos = 'SALDO CASH',
    tipe = 'Pengeluaran',
  }) {
    const nom = Math.max(0, parseFloat(amount) || 0)
    if (nom <= 0) throw new Error('Nominal transaksi harus lebih besar dari 0')

    const newId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    
    // 1. Simpan ke tabel pengeluaran atau cashflow
    if (tipe === 'Pengeluaran') {
      const expTable = this.store.getTable('pengeluaran')
      expTable.push({
        id_pengeluaran: newId,
        tenant_id,
        branch_id,
        tanggal: date,
        nama_pengeluaran: keterangan || 'Pengeluaran Kas Manual',
        nominal: nom,
        kategori: categoryName,
        jenis: 'Pengeluaran',
        pos,
        created_at: new Date().toISOString(),
      })
    }

    const cfTable = this.store.getTable('cashflow')
    cfTable.push({
      id_cashflow: `cf_${newId}`,
      tenant_id,
      branch_id,
      id_sumber: newId,
      tanggal: date,
      keterangan_transaksi: keterangan || 'Mutasi Manual Akuntansi',
      jenis: tipe,
      kategori: categoryName,
      pemasukan: tipe === 'Pemasukan' ? nom : 0,
      pengeluaran: tipe === 'Pengeluaran' ? nom : 0,
      pos,
      created_at: new Date().toISOString(),
    })

    // 2. Post Jurnal Double-Entry
    const journal = this.store.postJournalEntry({
      tenant_id,
      branch_id,
      date,
      memo: keterangan || `${tipe} Manual: ${categoryName}`,
      source_type: tipe === 'Pengeluaran' ? 'pengeluaran' : 'cashflow',
      source_id: newId,
      lines: [
        { account_id: debitAccountId, debit: nom, credit: 0, memo: keterangan || `Beban ${categoryName}` },
        { account_id: creditAccountId, debit: 0, credit: nom, memo: keterangan || `Kas Keluar ${pos}` },
      ],
    })

    this.store.saveToStorage(true)
    return { success: true, id: newId, journal_id: journal?.id }
  }

  /**
   * Two-Way Sync Mutasi: Update existing journal line & source record
   */
  updateTransaction({
    tenant_id = DEFAULT_TENANT_ID,
    journalId,
    newDate,
    newAmount,
    newMemo,
  }) {
    const entries = this.store.getTable('journal_entries')
    const lines = this.store.getTable('journal_entry_lines')

    const entry = entries.find((e) => e.id === journalId && e.tenant_id === tenant_id)
    if (!entry) throw new Error('Entri jurnal tidak ditemukan')

    const nom = parseFloat(newAmount)
    if (newDate) entry.date = newDate
    if (newMemo) entry.memo = newMemo
    if (!isNaN(nom) && nom > 0) entry.total_amount = nom

    // Update lines
    const relatedLines = lines.filter((l) => l.journal_entry_id === journalId && l.tenant_id === tenant_id)
    relatedLines.forEach((l) => {
      if (newMemo) l.memo = newMemo
      if (!isNaN(nom) && nom > 0) {
        if (l.debit > 0) l.debit = nom
        if (l.credit > 0) l.credit = nom
      }
    })

    // Update data sumber asli jika ada
    if (entry.source_type && entry.source_id) {
      if (entry.source_type === 'pengeluaran') {
        const expTable = this.store.getTable('pengeluaran')
        const exp = expTable.find((p) => p.id_pengeluaran === entry.source_id)
        if (exp) {
          if (newDate) exp.tanggal = newDate
          if (newMemo) exp.nama_pengeluaran = newMemo
          if (!isNaN(nom) && nom > 0) exp.nominal = nom
        }
      }

      // Update cashflow jika cocok
      const cfTable = this.store.getTable('cashflow')
      const cf = cfTable.find((c) => c.id_sumber === entry.source_id || c.id_cashflow === entry.source_id)
      if (cf) {
        if (newDate) cf.tanggal = newDate
        if (newMemo) cf.keterangan_transaksi = newMemo
        if (!isNaN(nom) && nom > 0) {
          if (cf.pengeluaran > 0) cf.pengeluaran = nom
          if (cf.pemasukan > 0) cf.pemasukan = nom
        }
      }
    }

    this.store.saveToStorage(true)
    return { success: true }
  }

  /**
   * Two-Way Sync Mutasi: Delete transaction and remove from both GL & source table
   */
  deleteTransaction({
    tenant_id = DEFAULT_TENANT_ID,
    journalId,
  }) {
    const entries = this.store.getTable('journal_entries')
    const lines = this.store.getTable('journal_entry_lines')

    const entryIdx = entries.findIndex((e) => e.id === journalId && e.tenant_id === tenant_id)
    if (entryIdx === -1) throw new Error('Entri jurnal tidak ditemukan')

    const entry = entries[entryIdx]

    // Hapus lines
    this.store.data.journal_entry_lines = lines.filter(
      (l) => !(l.journal_entry_id === journalId && l.tenant_id === tenant_id)
    )

    // Hapus entry
    entries.splice(entryIdx, 1)

    // Hapus dari data sumber asli
    if (entry.source_type && entry.source_id) {
      if (entry.source_type === 'pengeluaran') {
        this.store.data.pengeluaran = (this.store.data.pengeluaran || []).filter(
          (p) => p.id_pengeluaran !== entry.source_id
        )
      }
      this.store.data.cashflow = (this.store.data.cashflow || []).filter(
        (c) => c.id_sumber !== entry.source_id && c.id_cashflow !== entry.source_id
      )
    }

    this.store.saveToStorage(true)
    return { success: true }
  }
}
