import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine.js'
import {
  buildOrderReceiptData,
  buildPaymentReceiptData,
  calculateSettlementWithSurcharge,
  normalizeWhatsAppPhone
} from '../../utils/receiptHelpers.js'
import { syncStaffToKaryawanKantor } from '../../utils/staffHelpers.js'

describe('Audit Verification: Multi-Module Data Relations & Workflows', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
    db.localDb.store.syncStrukToCashflow = true
  })

  // 1. UJI RELASI POS -> TRANSAKSI STRUK -> AUTO CASHFLOW -> AUTO DOUBLE-ENTRY JOURNAL
  it('Relasi 1: POS Checkout Lunas mengalir otomatis ke Struk, Cashflow, dan Jurnal Double-Entry', async () => {
    const strukId = 'STRUK-AUDIT-001'
    const newStruk = {
      id_struk: strukId,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: '2026-09-20',
      jam: '14:30:00',
      kasir: 'KASIR 1',
      total_tagihan: 75000,
      metode_bayar: 'QRIS',
      status_bayar: 'Selesai'
    }

    await db.from('struk').insert(newStruk)

    // Periksa tabel struk
    const { data: savedStruk } = await db.from('struk').select('*').eq('id_struk', strukId).single()
    expect(savedStruk).toBeDefined()
    expect(savedStruk.total_tagihan).toBe(75000)

    // Periksa tabel cashflow tersinkronisasi otomatis
    const { data: cashflowEntries } = await db.from('cashflow').select('*').eq('id_sumber', strukId)
    expect(cashflowEntries.length).toBe(1)
    const savedCashflow = cashflowEntries[0]
    expect(savedCashflow.pemasukan).toBe(75000)
    expect(savedCashflow.pos).toBe('SALDO REKENING Y') // QRIS maps to bank balance

    // Periksa auto-posting jurnal umum (Double-Entry Balance Invariant)
    const { data: journals } = await db.from('journal_entries').select('*').eq('source_id', strukId)
    expect(journals.length).toBe(1)
    const journal = journals[0]
    expect(journal.total_amount).toBe(75000)
    expect(journal.status).toBe('POSTED')

    const { data: lines } = await db.from('journal_entry_lines').select('*').eq('journal_entry_id', journal.id)
    expect(lines.length).toBe(2)

    const debitLine = lines.find(l => l.debit > 0)
    const creditLine = lines.find(l => l.credit > 0)
    expect(debitLine.account_id).toBe('acc_1002') // Kas Bank / QRIS
    expect(debitLine.debit).toBe(75000)
    expect(creditLine.account_id).toBe('acc_4001') // Pendapatan
    expect(creditLine.credit).toBe(75000)
    expect(debitLine.debit).toBe(creditLine.credit)
  })

  // 2. UJI RELASI POS CAFE -> RESEP BOM -> PEMOTONGAN STOK OTOMATIS & BARANG KELUAR
  it('Relasi 2: Penjualan Item Cafe secara otomatis memotong stok bahan baku berdasarkan resep BOM', async () => {
    // Ambil stok awal Biji Kopi (BK-01 pada master data)
    const { data: initialStock } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BK-01').single()
    const initialQty = initialStock.stok

    // Buat pesanan 2 porsi Americano Dingin (resep: BK-01 butuh 18g per cup -> 36g total)
    const cafeItem = {
      id_detail: 'dtl_audit_001',
      id_struk: 'STRUK-AUDIT-002',
      nama_menu: 'Americano Dingin',
      qty: 2,
      harga_satuan: 15000,
      subtotal: 30000
    }

    await db.from('cafe').insert(cafeItem)

    // Periksa pemotongan stok otomatis (18g * 2 = 36g)
    const { data: updatedStock } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BK-01').single()
    expect(updatedStock.stok).toBe(initialQty - 36)

    // Periksa log barang keluar tercatat
    const { data: keluarLogs } = await db.from('barang_keluar').select('*').eq('id_bahan_baku', 'BK-01')
    expect(keluarLogs.length).toBeGreaterThan(0)
    const recentLog = keluarLogs[keluarLogs.length - 1]
    expect(recentLog.jumlah_keluar).toBe(36)
  })

  // 3. UJI RELASI PROCUREMENT BARANG MASUK -> MOVING AVERAGE COST (MAC) & JURNAL PERSEDIAAN
  it('Relasi 3: Barang Masuk menghitung Moving Average Cost dan membukukan jurnal persediaan', async () => {
    // Buat item stok bersih untuk pengujian valuasi Moving Average Cost
    const testItemId = 'BB-TEST-AUDIT'
    await db.from('stok_barang').insert({
      id_bahan_baku: testItemId,
      nama_produk: 'Bahan Baku Uji Valuasi',
      satuan: 'kg',
      stok: 100,
      harga_beli: 10000,
      hpp: 10000
    })

    const incomingQty = 50
    const incomingUnitPrice = 16000
    const totalPembelian = incomingQty * incomingUnitPrice

    const masukRecord = {
      id_barang_masuk: 'bm_audit_01',
      id_bahan_baku: testItemId,
      nama_produk: 'Bahan Baku Uji Valuasi',
      jumlah_masuk: incomingQty,
      harga_satuan: incomingUnitPrice,
      total_harga: totalPembelian,
      metode_bayar: 'CASH',
      tanggal: '2026-09-20'
    }

    await db.from('barang_masuk').insert(masukRecord)

    // Periksa stok dan Moving Average Cost
    // Awal: 100 kg @ Rp 10.000 (Total Rp 1.000.000)
    // Masuk: 50 kg @ Rp 16.000 (Total Rp 800.000)
    // Total stok baru = 150 kg
    // MAC baru = (1.000.000 + 800.000) / 150 = 1.800.000 / 150 = Rp 12.000
    const { data: itemAfter } = await db.from('stok_barang').select('*').eq('id_bahan_baku', testItemId).single()
    expect(itemAfter.stok).toBe(150)
    expect(itemAfter.harga_beli).toBe(12000)

    // Periksa auto-posting jurnal persediaan
    const { data: journals } = await db.from('journal_entries').select('*').eq('source_id', 'bm_audit_01')
    expect(journals.length).toBe(1)
    const journal = journals[0]
    expect(journal.total_amount).toBe(totalPembelian)

    const { data: lines } = await db.from('journal_entry_lines').select('*').eq('journal_entry_id', journal.id)
    const debitLine = lines.find(l => l.debit > 0)
    const creditLine = lines.find(l => l.credit > 0)
    expect(debitLine.account_id).toBe('acc_1300') // Persediaan Stok
    expect(debitLine.debit).toBe(totalPembelian)
    expect(creditLine.account_id).toBe('acc_1001') // Kas Kasir
    expect(creditLine.credit).toBe(totalPembelian)
  })

  // 4. UJI INTEGRITAS LAPORAN KEUANGAN SAK EMKM & NERACA SEIMBANG (ASSETS = LIABILITIES + EQUITY)
  it('Relasi 4: General Ledger Statement menghasilkan Neraca Seimbang dengan laba periode berjalan', async () => {
    // 1. Penjualan Rp 100.000 Tunai
    await db.from('struk').insert({
      id_struk: 'STRUK-EVAL-01',
      tanggal: '2026-09-20',
      kasir: 'KASIR 1',
      total_tagihan: 100000,
      metode_bayar: 'CASH',
      status_bayar: 'Selesai'
    })

    // 2. Beban Operasional Rp 30.000 Tunai
    await db.from('pengeluaran').insert({
      id_pengeluaran: 'EXP-EVAL-01',
      tanggal: '2026-09-20',
      nominal: 30000,
      jenis: 'Pengeluaran Cafe',
      kategori: 'Operasional',
      pos: 'SALDO CASH'
    })

    // Hitung Laporan Keuangan via db.erp.gl
    const trialBalance = db.erp.gl.getTrialBalance(DEFAULT_TENANT_ID)
    expect(trialBalance.is_balanced).toBe(true)

    const incomeStatement = db.erp.gl.getIncomeStatement(DEFAULT_TENANT_ID)
    expect(incomeStatement.total_revenue).toBeGreaterThanOrEqual(100000)

    const balanceSheet = db.erp.gl.getBalanceSheet(DEFAULT_TENANT_ID)
    expect(balanceSheet.is_balanced).toBe(true)
    expect(balanceSheet.total_assets).toBe(balanceSheet.total_liabilities_and_equity)
  })

  // 5. UJI ROLE ACCESS MATRIX & AUTO-SYNC PROFILES KE KARYAWAN KANTOR
  it('Relasi 5: Profil Staf Sistem secara otomatis tersinkronisasi ke Direktori Karyawan Kantor', () => {
    const rawProfiles = [
      { id: 'p1', email: 'owner@relaypos.com', role: 'Owner', nama: 'Budi Owner' },
      { id: 'p2', email: 'admin@relaypos.com', role: 'Admin', nama: 'Siti Supervisor' },
      { id: 'p3', email: 'kasir@relaypos.com', role: 'Kasir', nama: 'Rian Kasir' }
    ]
    const existingOfficeStaff = [
      { id: 'man_1', nama: 'Pak Joko', jabatan: 'Office Boy', tipe: 'Karyawan Kantor' }
    ]

    const result = syncStaffToKaryawanKantor({
      staffProfiles: rawProfiles,
      existingKaryawanKantor: existingOfficeStaff
    })
    
    expect(result.mergedList.length).toBe(4) // 3 akun sistem + 1 manual
    const systemStaff = result.mergedList.filter(s => s.source === 'staff_registration')
    expect(systemStaff.length).toBe(3)
  })

  // 6. UJI BUKTI ORDER (DROP-OFF SLIP) VS BUKTI PEMBAYARAN THERMAL KASIR & SURCHARGES
  it('Relasi 6: Dual Receipt System memisahkan Bukti Order Ditinggal vs Bukti Pembayaran Lunas', () => {
    const mockOrder = {
      id_struk: 'STRUK-AUDIT-CW',
      tanggal: '2026-09-20',
      jam: '10:00:00',
      kasir: 'KASIR 1',
      total_tagihan: 50000,
      metode_bayar: 'CASH',
      status_bayar: 'Pending',
      carwash: [
        { plat: 'BK 1234 AB', paket: 'Cuci Premium Salju', harga: 50000, kehadiran: 'TINGGAL' }
      ]
    }

    // 1. Order Slip untuk Drop-off
    const orderSlip = buildOrderReceiptData(mockOrder, { storeName: 'RelayPOS Audit Outlet' })
    expect(orderSlip.type).toBe('ORDER_DROP_OFF')
    expect(orderSlip.kehadiran).toBe('DITINGGAL')
    expect(orderSlip.plat).toBe('BK 1234 AB')
    expect(orderSlip.disclaimer).toBeDefined()

    // 2. Bukti Pembayaran Lunas dengan Tambahan Biaya Inap 1 Malam (Rp 50.000)
    const settlement = calculateSettlementWithSurcharge(50000, {
      enabled: true,
      nominal: 50000,
      keterangan: 'Biaya Inap 1 Malam'
    })
    expect(settlement.finalTotal).toBe(100000)
    expect(settlement.surchargeAmount).toBe(50000)

    const paymentReceipt = buildPaymentReceiptData({
      ...mockOrder,
      total_tagihan: settlement.finalTotal,
      status_bayar: 'Selesai'
    }, { storeName: 'RelayPOS Audit Outlet' })
    expect(paymentReceipt.type).toBe('PAYMENT_RECEIPT')
    expect(paymentReceipt.isPaid).toBe(true)
    expect(paymentReceipt.totalTagihan).toBe(100000)
  })

  // 7. UJI NORMALISASI NOMOR WHATSAPP UNTUK DIGITAL RECEIPT PIPELINE
  it('Relasi 7: Normalisasi nomor WhatsApp otomatis mengonversi format lokal ke format internasional 62', () => {
    expect(normalizeWhatsAppPhone('081234567890')).toBe('6281234567890')
    expect(normalizeWhatsAppPhone('81234567890')).toBe('6281234567890')
    expect(normalizeWhatsAppPhone('+62 812-3456-7890')).toBe('6281234567890')
    expect(normalizeWhatsAppPhone('')).toBe('')
  })
})
