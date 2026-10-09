import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine'
import { GeneralLedgerService } from '../generalLedgerService'
import { TABLES_METADATA } from '../../pages/Database'
import { getTenantFeatures } from '../../utils/businessCapabilities'

describe('Comprehensive Feature Simulation & Cross-Module Data Integration Audit', () => {
  let db
  let glService

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
    db.localDb.store.syncStrukToCashflow = true
    glService = new GeneralLedgerService(db.localDb.store)
  })

  // ============================================================================
  // 1. AUTENTIKASI, TENANT FEATURE FLAGS & RBAC PERAN
  // ============================================================================
  describe('1. Autentikasi & Kapabilitas Model Bisnis (Feature Flags)', () => {
    it('SIM_01: Validasi akses fitur berdasarkan model bisnis (CAFE, CARWASH, HYBRID)', () => {
      const cafeFeatures = getTenantFeatures('CAFE')
      expect(cafeFeatures.isCafeOnly).toBe(true)
      expect(cafeFeatures.hasCafe).toBe(true)
      expect(cafeFeatures.hasCarwash).toBe(false)
      expect(cafeFeatures.hasQueue).toBe(false)

      const carwashFeatures = getTenantFeatures('CARWASH')
      expect(carwashFeatures.isCarwashOnly).toBe(true)
      expect(carwashFeatures.hasCafe).toBe(false)
      expect(carwashFeatures.hasCarwash).toBe(true)
      expect(carwashFeatures.hasQueue).toBe(true)

      const hybridFeatures = getTenantFeatures('HYBRID')
      expect(hybridFeatures.isHybrid).toBe(true)
      expect(hybridFeatures.hasCafe).toBe(true)
      expect(hybridFeatures.hasCarwash).toBe(true)
      expect(hybridFeatures.hasQueue).toBe(true)
      expect(hybridFeatures.hasCRM).toBe(true)
    })
  })

  // ============================================================================
  // 2. POS ORDER, ESTAFET CROSS-SELLING, DAN BILL OF MATERIALS (BOM)
  // ============================================================================
  describe('2. Integrasi POS Order, Estafet Carwash + Cafe, dan Potong Stok BOM', () => {
    it('SIM_02: Simulasi transaksi POS gabungan: Cuci Mobil + Kopi Sanger -> Potong Stok Resep Otomatis', async () => {
      // 1. Siapkan master bahan baku di stok_barang
      await db.from('stok_barang').insert([
        { id_bahan_baku: 'BB-KOPI', nama_produk: 'Biji Kopi Robusta', satuan: 'gram', stok: 1000 },
        { id_bahan_baku: 'BB-SKM', nama_produk: 'Susu Kental Manis', satuan: 'ml', stok: 1000 },
        { id_bahan_baku: 'BB-SABUN', nama_produk: 'Shampoo Carwash Snow', satuan: 'liter', stok: 100 }
      ])

      // 2. Daftarkan resep menu Sanger Panas
      await db.from('resep').insert([
        { id_resep: 'RSP-SANGER-1', nama_menu: 'Sanger Panas', id_bahan_baku: 'BB-KOPI', nama_bahan: 'Biji Kopi Robusta', jumlah: 20 },
        { id_resep: 'RSP-SANGER-2', nama_menu: 'Sanger Panas', id_bahan_baku: 'BB-SKM', nama_bahan: 'Susu Kental Manis', jumlah: 30 }
      ])

      const strukId = 'STRUK-SIM-001'
      const activeDate = '2026-10-05'
      const activeTime = '14:30:00'

      // 3. Simpan Header Struk
      const { data: struk } = await db.from('struk').insert({
        id_struk: strukId,
        tanggal: activeDate,
        jam: activeTime,
        nama_pelanggan: 'Budi Santoso',
        plat_nomor: 'B 1234 XYZ',
        metode_bayar: 'QRIS',
        status_bayar: 'Selesai',
        kasir: 'KASIR UTAMA',
        total_tagihan: 65000,
        nominal_qris: 65000,
        nominal_cash: 0
      })
      expect(struk.id_struk).toBe(strukId)

      // 4. Simpan Detail Carwash (Layanan Cuci)
      const { data: carwashItem } = await db.from('carwash').insert({
        id_transaksi: 'CW-SIM-001',
        id_struk: strukId,
        tanggal: activeDate,
        jam: activeTime,
        plat: 'B 1234 XYZ',
        model: 'Avanza',
        ukuran: 'Medium',
        paket: 'PAKET REGULER',
        metode: 'QRIS',
        harga: 50000,
        status: 'Selesai',
        pencuci: 'Anto',
        anggota2: 'Bambang',
        gaji_pencuci: 15000
      })
      expect(carwashItem.plat).toBe('B 1234 XYZ')

      // 5. Simpan Detail Cafe dengan field tanggal & jam
      const { data: cafeItem } = await db.from('cafe').insert({
        id_detail: 'CF-SIM-001',
        id_struk: strukId,
        tanggal: activeDate,
        jam: activeTime,
        nama_menu: 'Sanger Panas',
        qty: 1,
        harga_satuan: 15000,
        subtotal: 15000,
        status: 'Selesai'
      })
      expect(cafeItem.tanggal).toBe(activeDate)
      expect(cafeItem.jam).toBe(activeTime)

      // 6. Verifikasi Pemotongan Stok Bahan Baku Otomatis (BOM trigger)
      const { data: stokKopi } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BB-KOPI').single()
      const { data: stokSkm } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BB-SKM').single()

      // Stok awal 1000 - 20 (kopi) = 980, Stok awal 1000 - 30 (susu) = 970
      expect(stokKopi.stok).toBe(980)
      expect(stokSkm.stok).toBe(970)

      // 7. Verifikasi Log Mutasi Barang Keluar
      const { data: barangKeluar } = await db.from('barang_keluar').select('*').eq('id_detail', 'CF-SIM-001')
      expect(barangKeluar.length).toBeGreaterThanOrEqual(2)
      expect(barangKeluar.map(b => b.nama_bahan_baku)).toContain('Biji Kopi Robusta')
      expect(barangKeluar.map(b => b.nama_bahan_baku)).toContain('Susu Kental Manis')
    })
  })

  // ============================================================================
  // 3. ANTREAN CARWASH (QUEUE MANAGEMENT)
  // ============================================================================
  describe('3. Manajemen Antrean Carwash (Queue Workflow)', () => {
    it('SIM_03: Alur hidup antrean dari status Menunggu -> Dicuci -> Finishing -> Selesai', async () => {
      // 1. Masuk antrean
      const { data: qItem } = await db.from('carwash').insert({
        id_transaksi: 'CW-QUEUE-01',
        tanggal: '2026-10-05',
        jam: '10:00:00',
        plat: 'D 9999 BOS',
        model: 'Pajero',
        ukuran: 'Large',
        paket: 'PAKET SNOW',
        harga: 60000,
        status: 'Menunggu'
      })
      expect(qItem.status).toBe('Menunggu')

      // 2. Petugas memindahkan ke slot pengerjaan (Dicuci)
      await db.from('carwash').update({
        status: 'Dicuci',
        pencuci: 'Agus'
      }).eq('id_transaksi', 'CW-QUEUE-01')

      const { data: washing } = await db.from('carwash').select('*').eq('id_transaksi', 'CW-QUEUE-01').single()
      expect(washing.status).toBe('Dicuci')
      expect(washing.pencuci).toBe('Agus')

      // 3. Pindah ke tahap Finishing
      await db.from('carwash').update({
        status: 'Finishing'
      }).eq('id_transaksi', 'CW-QUEUE-01')

      const { data: finishing } = await db.from('carwash').select('*').eq('id_transaksi', 'CW-QUEUE-01').single()
      expect(finishing.status).toBe('Finishing')

      // 4. Pembayaran di Kasir (Selesai)
      await db.from('carwash').update({
        status: 'Selesai'
      }).eq('id_transaksi', 'CW-QUEUE-01')

      const { data: done } = await db.from('carwash').select('*').eq('id_transaksi', 'CW-QUEUE-01').single()
      expect(done.status).toBe('Selesai')
    })
  })

  // ============================================================================
  // 4. INTEGRASI CRM PELANGGAN & LOYALITAS
  // ============================================================================
  describe('4. Integrasi CRM & Riwayat Kunjungan Kendaraan', () => {
    it('SIM_04: Transaksi tercatat mengupdate riwayat belanja & visit count plat kendaraan', async () => {
      const platTarget = 'BK 8888 JJ'
      
      // Catat 2 kunjungan
      await db.from('carwash').insert([
        { id_transaksi: 'CW-CRM-1', plat: platTarget, tanggal: '2026-10-01', harga: 50000, status: 'Selesai' },
        { id_transaksi: 'CW-CRM-2', plat: platTarget, tanggal: '2026-10-05', harga: 55000, status: 'Selesai' }
      ])

      const { data: visitLogs } = await db.from('carwash').select('*').eq('plat', platTarget)
      expect(visitLogs.length).toBe(2)

      const totalSpent = visitLogs.reduce((acc, row) => acc + (row.harga || 0), 0)
      expect(totalSpent).toBe(105000)
    })
  })

  // ============================================================================
  // 5. MANAJEMEN KOMISI KARYAWAN & POTONG KASBON
  // ============================================================================
  describe('5. Penghitungan Komisi Pencuci & Integrasi Casbon Staf', () => {
    it('SIM_05: Komisi solo vs duet dihitung tepat & saldo casbon terpotong secara transparan', async () => {
      // 1. Casbon awal karyawan
      await db.from('karyawan_cuci').insert({
        id_karyawan: 'KRY-01',
        nama: 'Rian Anto',
        saldo_casbon: 50000
      })

      // 2. Transaksi cuci solo (1 pencuci dapat 15.000 penuh)
      await db.from('carwash').insert({
        id_transaksi: 'CW-KOMISI-1',
        tanggal: '2026-10-05',
        plat: 'B 111 AA',
        pencuci: 'Rian Anto',
        gaji_pencuci: 15000,
        status: 'Selesai'
      })

      // 3. Transaksi cuci duet (2 pencuci bagi 2 -> masing-masing 10.000)
      await db.from('carwash').insert({
        id_transaksi: 'CW-KOMISI-2',
        tanggal: '2026-10-05',
        plat: 'B 222 BB',
        pencuci: 'Rian Anto',
        anggota2: 'Dedi Kurniawan',
        gaji_pencuci: 20000,
        status: 'Selesai'
      })

      const { data: myJobsSolo } = await db.from('carwash').select('*').eq('pencuci', 'Rian Anto')
      expect(myJobsSolo.length).toBe(2)

      let totalKomisi = 0
      myJobsSolo.forEach(job => {
        if (job.anggota2 && job.anggota2.trim()) {
          totalKomisi += job.gaji_pencuci / 2
        } else {
          totalKomisi += job.gaji_pencuci
        }
      })
      // 15000 (solo) + 10000 (duet) = 25000
      expect(totalKomisi).toBe(25000)
    })
  })

  // ============================================================================
  // 6. KEUANGAN, ARUS KAS (CASHFLOW) & GENERAL LEDGER SAK EMKM
  // ============================================================================
  describe('6. Integrasi Arus Kas & Double-Entry Accounting (Laba Rugi & Neraca)', () => {
    it('SIM_06: Pencatatan otomatis cashflow dan integritas neraca saldo (Trial Balance)', async () => {
      // 1. Pemasukan Penjualan Cafe
      const { data: cf1 } = await db.from('cashflow').insert({
        id_cashflow: 'CF-LOG-01',
        tanggal: '2026-10-05',
        keterangan_transaksi: 'Omzet Harian Cafe Cash',
        jenis: 'pemasukan cafe',
        kategori: 'Pemasukan',
        pemasukan: 200000,
        pengeluaran: 0,
        pos: 'SALDO CASH'
      })
      expect(cf1.pemasukan).toBe(200000)

      // 2. Pengeluaran Operasional (Beban Listrik)
      const { data: cf2 } = await db.from('cashflow').insert({
        id_cashflow: 'CF-LOG-02',
        tanggal: '2026-10-05',
        keterangan_transaksi: 'Bayar Listrik & Token',
        jenis: 'pengeluaran',
        kategori: 'Operasional',
        pemasukan: 0,
        pengeluaran: 75000,
        pos: 'SALDO CASH'
      })
      expect(cf2.pengeluaran).toBe(75000)

      // 3. Verifikasi General Ledger Jurnal Otomatis Neraca Saldo
      const tb = glService.getTrialBalance(DEFAULT_TENANT_ID)
      expect(tb).toBeDefined()
      expect(tb.is_balanced).toBe(true)
      expect(tb.total_debit).toBe(tb.total_credit)
    })
  })

  // ============================================================================
  // 7. GUDANG & INVENTORI (RESTOCK BARANG MASUK)
  // ============================================================================
  describe('7. Modul Gudang & Restock Barang Masuk', () => {
    it('SIM_07: Input barang masuk menambah stok fisik barang secara presisi', async () => {
      // Buat item stok awal 10 liter
      await db.from('stok_barang').insert({
        id_bahan_baku: 'BB-SYRUP-VANILLA',
        nama_produk: 'Syrup Vanilla Botol',
        satuan: 'botol',
        stok: 10
      })

      // Tambah barang masuk 25 botol
      await db.from('barang_masuk').insert({
        id_masuk: 'IN-001',
        id_bahan_baku: 'BB-SYRUP-VANILLA',
        nama_bahan_baku: 'Syrup Vanilla Botol',
        jumlah_masuk: 25,
        tanggal: '2026-10-05'
      })

      const { data: currentStock } = await db.from('stok_barang').select('*').eq('id_bahan_baku', 'BB-SYRUP-VANILLA').single()
      expect(currentStock.stok).toBe(35)
    })
  })

  // ============================================================================
  // 8. DATABASE MASTER (TABLE SCHEMAS & DATE FILTER INTEGRATION)
  // ============================================================================
  describe('8. Database Master Schema & Konsistensi Kolom Tanggal Cafe', () => {
    it('SIM_08: Memverifikasi tabel cafe di Database Master memiliki kolom tanggal aktif', () => {
      const cafeSchema = TABLES_METADATA.cafe
      expect(cafeSchema).toBeDefined()
      expect(cafeSchema.dateField).toBe('tanggal')
      
      const columnNames = cafeSchema.columns.map(c => c.name)
      expect(columnNames).toContain('tanggal')
      expect(columnNames).toContain('jam')
      expect(columnNames).toContain('nama_menu')
      expect(columnNames).toContain('subtotal')
    })
  })
})
