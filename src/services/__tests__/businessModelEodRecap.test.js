import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine.js'
import { calculateTutupKasirRecap } from '../../utils/helpers.js'

describe('SaaS ERP Business Model Verification (Tunggal vs Hybrid & EOD Recap)', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
    // Standar ERP: transaksi tidak mencemari cashflow secara receh sebelum Tutup Kasir / EOD
    db.localDb.store.syncStrukToCashflow = false
  })

  // ============================================================================
  // MODEL 1: BISNIS TUNGGAL - CARWASH ONLY
  // ============================================================================
  describe('1. Model Bisnis Tunggal: Carwash Saja', () => {
    it('harus memproses omzet carwash (Cash & QRIS) dan pengeluaran carwash tanpa ada omzet cafe', async () => {
      const todayDate = '2026-09-26'

      // 1. Kasir input transaksi Cuci Biasa (CASH Rp 50.000)
      const strukCwCash = {
        id_struk: 'STRUK-CW-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        jam: '09:00:00',
        nama_pelanggan: 'Mobil Rush - BK 1111 AA',
        metode_bayar: 'CASH',
        status_bayar: 'Selesai',
        kasir: 'KASIR_CARWASH',
        total_tagihan: 50000,
        nominal_cash: 50000,
        nominal_qris: 0
      }
      await db.from('struk').insert(strukCwCash)
      await db.from('carwash').insert({
        id_transaksi: 'CW-01',
        id_struk: 'STRUK-CW-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        plat: 'BK 1111 AA',
        paket: 'Cuci Biasa',
        harga: 50000,
        metode: 'CASH',
        status: 'Selesai'
      })

      // 2. Kasir input transaksi Cuci Hidrolik + Semir (QRIS Rp 75.000)
      const strukCwQris = {
        id_struk: 'STRUK-CW-02',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        jam: '10:30:00',
        nama_pelanggan: 'Innova - BK 2222 BB',
        metode_bayar: 'QRIS',
        status_bayar: 'Selesai',
        kasir: 'KASIR_CARWASH',
        total_tagihan: 75000,
        nominal_cash: 0,
        nominal_qris: 75000
      }
      await db.from('struk').insert(strukCwQris)
      await db.from('carwash').insert({
        id_transaksi: 'CW-02',
        id_struk: 'STRUK-CW-02',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        plat: 'BK 2222 BB',
        paket: 'Cuci Hidrolik Detailing',
        harga: 75000,
        metode: 'QRIS',
        status: 'Selesai'
      })

      // Verifikasi: Sebelum tutup kasir, cashflow belum terisi struk (tidak mencemari arus kas)
      const { data: initialCf } = await db.from('cashflow').select('*')
      expect(initialCf.length).toBe(0)

      // 3. Kasir input pengeluaran Carwash (Beli Shampo Snow Rp 35.000)
      await db.from('pengeluaran').insert({
        id_pengeluaran: 'EXP-CW-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        nama_pengeluaran: 'Beli Shampoo Snow 5L',
        jenis: 'pengeluaran Carwash',
        kategori: 'Bahan Baku',
        nominal: 35000
      })

      // Verifikasi: Pengeluaran tercatat real-time dan langsung dibebankan ke unit Carwash
      const { data: midCf } = await db.from('cashflow').select('*')
      expect(midCf.length).toBe(1)
      expect(midCf[0].jenis).toBe('pengeluaran Carwash')
      expect(midCf[0].pengeluaran).toBe(35000)

      // 4. Proses Tutup Kasir / EOD
      const { data: completedReceipts } = await db
        .from('struk')
        .select('*, cafe(*), carwash(*)')
        .eq('tanggal', todayDate)
        .eq('status_bayar', 'Selesai')

      const recapInsertions = calculateTutupKasirRecap({
        receipts: completedReceipts,
        expenses: [], // Pengeluaran sudah tercatat real-time, jangan didobelkan
        cashierName: 'KASIR_CARWASH',
        todayDate
      })

      await db.from('cashflow').insert(recapInsertions)

      // 5. Verifikasi Hasil Akhir Buku Kas
      const { data: finalCf } = await db.from('cashflow').select('*')
      // Harus ada 3 baris: 1 Pengeluaran Carwash + 2 Rekap Pemasukan Carwash (Cash & QRIS)
      expect(finalCf.length).toBe(3)

      const cwCashEntry = finalCf.find(c => c.jenis === 'pemasukan carwash' && c.pos === 'SALDO CASH')
      const cwQrisEntry = finalCf.find(c => c.jenis === 'pemasukan carwash' && c.pos === 'SALDO REKENING Y')
      const cafeEntry = finalCf.find(c => c.jenis === 'pemasukan cafe')

      expect(cwCashEntry).toBeDefined()
      expect(cwCashEntry.pemasukan).toBe(50000)

      expect(cwQrisEntry).toBeDefined()
      expect(cwQrisEntry.pemasukan).toBe(75000)

      // Model Tunggal Carwash: Omzet Cafe WAJIB nihil / undefined
      expect(cafeEntry).toBeUndefined()
    })
  })

  // ============================================================================
  // MODEL 2: BISNIS TUNGGAL - CAFE ONLY
  // ============================================================================
  describe('2. Model Bisnis Tunggal: Cafe Saja', () => {
    it('harus memproses omzet cafe (Cash & QRIS) dan pengeluaran cafe tanpa ada omzet carwash', async () => {
      const todayDate = '2026-09-26'

      // 1. Kasir input pesanan Kopi & Roti (CASH Rp 35.000)
      const strukCafeCash = {
        id_struk: 'STRUK-CF-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        jam: '11:00:00',
        nama_pelanggan: 'Meja 03',
        metode_bayar: 'CASH',
        status_bayar: 'Selesai',
        kasir: 'BARISTA_CAFE',
        total_tagihan: 35000,
        nominal_cash: 35000,
        nominal_qris: 0
      }
      await db.from('struk').insert(strukCafeCash)
      await db.from('cafe').insert({
        id_detail: 'DTL-CF-01',
        id_struk: 'STRUK-CF-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        nama_menu: 'Sanger Dingin',
        qty: 1,
        harga_satuan: 15000,
        subtotal: 15000,
        status: 'Selesai'
      })
      await db.from('cafe').insert({
        id_detail: 'DTL-CF-02',
        id_struk: 'STRUK-CF-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        nama_menu: 'Roti Bakar Coklat',
        qty: 1,
        harga_satuan: 20000,
        subtotal: 20000,
        status: 'Selesai'
      })

      // 2. Kasir input pesanan Makanan Berat (QRIS Rp 60.000)
      const strukCafeQris = {
        id_struk: 'STRUK-CF-02',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        jam: '12:30:00',
        nama_pelanggan: 'Meja 05',
        metode_bayar: 'QRIS',
        status_bayar: 'Selesai',
        kasir: 'BARISTA_CAFE',
        total_tagihan: 60000,
        nominal_cash: 0,
        nominal_qris: 60000
      }
      await db.from('struk').insert(strukCafeQris)
      await db.from('cafe').insert({
        id_detail: 'DTL-CF-03',
        id_struk: 'STRUK-CF-02',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        nama_menu: 'Nasi Goreng Spesial',
        qty: 2,
        harga_satuan: 30000,
        subtotal: 60000,
        status: 'Selesai'
      })

      // 3. Kasir input pengeluaran Cafe (Beli Es Batu Rp 15.000)
      await db.from('pengeluaran').insert({
        id_pengeluaran: 'EXP-CF-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        nama_pengeluaran: 'Beli Es Batu Kristal',
        jenis: 'pengeluaran Cafe',
        kategori: 'Operasional',
        nominal: 15000
      })

      // 4. Proses Tutup Kasir / EOD
      const { data: completedReceipts } = await db
        .from('struk')
        .select('*, cafe(*), carwash(*)')
        .eq('tanggal', todayDate)
        .eq('status_bayar', 'Selesai')

      const recapInsertions = calculateTutupKasirRecap({
        receipts: completedReceipts,
        expenses: [],
        cashierName: 'BARISTA_CAFE',
        todayDate
      })

      await db.from('cashflow').insert(recapInsertions)

      // 5. Verifikasi Buku Kas
      const { data: finalCf } = await db.from('cashflow').select('*')
      expect(finalCf.length).toBe(3) // 1 Pengeluaran Cafe + 2 Rekap Pemasukan Cafe (Cash & QRIS)

      const cafeCashEntry = finalCf.find(c => c.jenis === 'pemasukan cafe' && c.pos === 'SALDO CASH')
      const cafeQrisEntry = finalCf.find(c => c.jenis === 'pemasukan cafe' && c.pos === 'SALDO REKENING Y')
      const cwEntry = finalCf.find(c => c.jenis === 'pemasukan carwash')

      expect(cafeCashEntry).toBeDefined()
      expect(cafeCashEntry.pemasukan).toBe(35000)

      expect(cafeQrisEntry).toBeDefined()
      expect(cafeQrisEntry.pemasukan).toBe(60000)

      // Model Tunggal Cafe: Omzet Carwash WAJIB nihil / undefined
      expect(cwEntry).toBeUndefined()
    })
  })

  // ============================================================================
  // MODEL 3: BISNIS HYBRID - CARWASH + CAFE (ESTAFET SYSTEM)
  // ============================================================================
  describe('3. Model Bisnis Hybrid: Carwash & Cafe (Estafet)', () => {
    it('harus memecah omzet 1 struk gabungan (Cuci Mobil + Minum Kopi) secara terpisah ke carwash dan cafe', async () => {
      const todayDate = '2026-09-26'

      // Transaksi Estafet Hybrid: Pelanggan cuci mobil (Rp 50.000) sambil ngopi (Rp 25.000) = Total Rp 75.000 CASH
      const strukHybrid = {
        id_struk: 'STRUK-HYBRID-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        jam: '14:00:00',
        nama_pelanggan: 'Fortuner - BK 8888 CC',
        metode_bayar: 'CASH',
        status_bayar: 'Selesai',
        kasir: 'KASIR_UTAMA',
        total_tagihan: 75000,
        nominal_cash: 75000,
        nominal_qris: 0
      }
      await db.from('struk').insert(strukHybrid)

      // Layanan Carwash
      await db.from('carwash').insert({
        id_transaksi: 'CW-HYB-01',
        id_struk: 'STRUK-HYBRID-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        plat: 'BK 8888 CC',
        paket: 'Paket Cuci Biasa',
        harga: 50000,
        metode: 'CASH',
        status: 'Selesai'
      })

      // Pesanan Cafe
      await db.from('cafe').insert({
        id_detail: 'DTL-HYB-01',
        id_struk: 'STRUK-HYBRID-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        nama_menu: 'Kopi Susu Gula Aren',
        qty: 1,
        harga_satuan: 25000,
        subtotal: 25000,
        status: 'Selesai'
      })

      // Pengeluaran masing-masing unit dan bersama
      await db.from('pengeluaran').insert({
        id_pengeluaran: 'EXP-HYB-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        nama_pengeluaran: 'Susu UHT Cafe',
        jenis: 'pengeluaran Cafe',
        kategori: 'Bahan Baku',
        nominal: 20000
      })
      await db.from('pengeluaran').insert({
        id_pengeluaran: 'EXP-HYB-02',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        nama_pengeluaran: 'Sponge Cuci Mobil',
        jenis: 'pengeluaran Carwash',
        kategori: 'Perlengkapan',
        nominal: 15000
      })
      await db.from('pengeluaran').insert({
        id_pengeluaran: 'EXP-HYB-03',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        nama_pengeluaran: 'Token PLN Bersama',
        jenis: 'pengeluaran Bersama',
        kategori: 'Operasional',
        nominal: 50000
      })

      // Tutup Kasir EOD
      const { data: completedReceipts } = await db
        .from('struk')
        .select('*, cafe(*), carwash(*)')
        .eq('tanggal', todayDate)
        .eq('status_bayar', 'Selesai')

      const recapInsertions = calculateTutupKasirRecap({
        receipts: completedReceipts,
        expenses: [],
        cashierName: 'KASIR_UTAMA',
        todayDate
      })

      await db.from('cashflow').insert(recapInsertions)

      // Verifikasi Pembagian Metrik
      const { data: finalCf } = await db.from('cashflow').select('*')
      // 3 Pengeluaran + 2 Rekap Pemasukan (Carwash Cash Rp 50rb & Cafe Cash Rp 25rb)
      expect(finalCf.length).toBe(5)

      const cwCash = finalCf.find(c => c.jenis === 'pemasukan carwash')
      const cfCash = finalCf.find(c => c.jenis === 'pemasukan cafe')

      expect(cwCash).toBeDefined()
      expect(cwCash.pemasukan).toBe(50000)

      expect(cfCash).toBeDefined()
      expect(cfCash.pemasukan).toBe(25000)

      // Verifikasi Pengeluaran Terisolasi
      const expCafe = finalCf.find(c => c.jenis === 'pengeluaran Cafe')
      const expCw = finalCf.find(c => c.jenis === 'pengeluaran Carwash')
      const expBersama = finalCf.find(c => c.jenis === 'pengeluaran Bersama')

      expect(expCafe.pengeluaran).toBe(20000)
      expect(expCw.pengeluaran).toBe(15000)
      expect(expBersama.pengeluaran).toBe(50000)
    })
  })

  // ============================================================================
  // PENANGANAN KESALAHAN KASIR (VOID / PEMBATALAN SEBELUM TUTUP KASIR)
  // ============================================================================
  describe('4. Penanganan Kesalahan Input Kasir (Void & EOD Safety)', () => {
    it('tidak boleh memasukkan transaksi yang telah dibatalkan (Void) ke dalam rekap Tutup Kasir', async () => {
      const todayDate = '2026-09-26'

      // Kasir salah input transaksi Rp 100.000
      const strukSalah = {
        id_struk: 'STRUK-SALAH-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        nama_pelanggan: 'Salah Ketik',
        metode_bayar: 'CASH',
        status_bayar: 'Selesai',
        kasir: 'KASIR_1',
        total_tagihan: 100000
      }
      await db.from('struk').insert(strukSalah)
      await db.from('carwash').insert({
        id_transaksi: 'CW-SALAH-01',
        id_struk: 'STRUK-SALAH-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        plat: 'BK 0000 XX',
        paket: 'Salah Input',
        harga: 100000,
        status: 'Selesai'
      })

      // Kasir menyadari kesalahan lalu membatalkan (Void)
      await db.from('struk').update({ status_bayar: 'Batal' }).eq('id_struk', 'STRUK-SALAH-01')
      await db.from('carwash').update({ status: 'Batal' }).eq('id_struk', 'STRUK-SALAH-01')

      // Kasir menginput transaksi pengganti yang benar (Rp 40.000)
      const strukBenar = {
        id_struk: 'STRUK-BENAR-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        nama_pelanggan: 'Pelanggan Asli',
        metode_bayar: 'CASH',
        status_bayar: 'Selesai',
        kasir: 'KASIR_1',
        total_tagihan: 40000
      }
      await db.from('struk').insert(strukBenar)
      await db.from('carwash').insert({
        id_transaksi: 'CW-BENAR-01',
        id_struk: 'STRUK-BENAR-01',
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        tanggal: todayDate,
        plat: 'BK 1234 YZ',
        paket: 'Cuci Motor',
        harga: 40000,
        status: 'Selesai'
      })

      // Tutup Kasir EOD
      const { data: completedReceipts } = await db
        .from('struk')
        .select('*, cafe(*), carwash(*)')
        .eq('tanggal', todayDate)
        .eq('status_bayar', 'Selesai')

      const recapInsertions = calculateTutupKasirRecap({
        receipts: completedReceipts,
        expenses: [],
        cashierName: 'KASIR_1',
        todayDate
      })

      await db.from('cashflow').insert(recapInsertions)

      // Verifikasi: Hanya transaksi benar Rp 40.000 yang masuk, transaksi Rp 100.000 diabaikan 100%
      const { data: cfList } = await db.from('cashflow').select('*')
      expect(cfList.length).toBe(1)
      expect(cfList[0].pemasukan).toBe(40000)
      expect(cfList[0].pemasukan).not.toBe(140000)
    })
  })
})
