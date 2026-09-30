import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient } from '../localDbEngine'
import { createCleanTenantPayload } from '../../utils/superAdminHelpers'

describe('Sprint 1 Core Business & Multi-Tenant Features', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  describe('1. Expense-to-Inventory Sync', () => {
    it('otomatis menambah stok barang dan mencatat ke barang_masuk saat pengeluaran bahan baku diinput', async () => {
      // Siapkan item stok awal
      const stockTable = db.localDb.store.getTable('stok_barang')
      stockTable.push({
        id_barang: 'raw_kopi_arabika',
        nama_barang: 'Biji Kopi Arabika',
        stok: 10,
        harga_beli: 100000,
        tenant_id: 'tenant_demo',
        branch_id: 'branch_demo'
      })

      // Catat pengeluaran bahan baku (beli 5 kg seharga Rp 600.000 -> @Rp 120.000)
      const expenseEntry = {
        id_pengeluaran: 'exp_kopi_01',
        tenant_id: 'tenant_demo',
        branch_id: 'branch_demo',
        nama_pengeluaran: 'Beli Biji Kopi Arabika 5kg',
        jenis: 'Bahan Baku',
        kategori: 'Bahan Baku F&B',
        id_barang: 'raw_kopi_arabika',
        qty: 5,
        nominal: 600000,
        pos: 'SALDO CASH',
        tanggal: '2026-09-23'
      }

      await db.from('pengeluaran').insert(expenseEntry)

      // Verifikasi stok bertambah: 10 + 5 = 15 kg
      const updatedStock = stockTable.find(s => s.id_barang === 'raw_kopi_arabika')
      expect(updatedStock).toBeDefined()
      expect(updatedStock.stok).toBe(15)

      // Verifikasi harga Moving Average Cost (MAC):
      // ((10 * 100000) + (5 * 120000)) / 15 = (1000000 + 600000) / 15 = 106666.67
      expect(Math.round(updatedStock.harga_beli)).toBe(106667)

      // Verifikasi catatan otomatis ada di tabel barang_masuk
      const bmTable = db.localDb.store.getTable('barang_masuk')
      const bmRecord = bmTable.find(b => b.id_barang === 'raw_kopi_arabika')
      expect(bmRecord).toBeDefined()
      expect(bmRecord.jumlah_masuk).toBe(5)
      expect(bmRecord.total_harga).toBe(600000)
    })
  })

  describe('2. Void Transaction & Inventory Auto-Restore (Zero Hard Delete)', () => {
    it('mengembalikan stok bahan baku cafe saat nota transaksi dibatalkan (status Batal)', async () => {
      // 1. Siapkan menu & resep
      const resepTable = db.localDb.store.getTable('resep')
      resepTable.push({
        id_resep: 'rsp_espresso',
        nama_menu: 'Espresso Single',
        id_bahan_baku: 'raw_kopi',
        nama_bahan: 'Kopi Bubuk',
        jumlah: 18 // 18 gram per porsi
      })

      const stockTable = db.localDb.store.getTable('stok_barang')
      stockTable.push({
        id_bahan_baku: 'raw_kopi',
        nama_barang: 'Kopi Bubuk',
        stok: 1000, // 1000 gram
        harga_beli: 200,
        tenant_id: 'tenant_demo',
        branch_id: 'branch_demo'
      })

      // 2. Transaksi Checkout Cafe: 2 Espresso (memotong 36 gram)
      const strukId = 'struk_void_test_1'
      await db.from('struk').insert({
        id_struk: strukId,
        tenant_id: 'tenant_demo',
        branch_id: 'branch_demo',
        total_tagihan: 40000,
        metode_bayar: 'CASH',
        status_bayar: 'Selesai',
        kasir: 'Doni'
      })

      await db.from('cafe').insert({
        id_detail: 'cafe_item_1',
        id_struk: strukId,
        nama_menu: 'Espresso Single',
        qty: 2,
        harga_satuan: 20000,
        tenant_id: 'tenant_demo',
        branch_id: 'branch_demo'
      })

      // Stok setelah insert berkurang menjadi 1000 - 36 = 964 gram
      const stockAfterSale = stockTable.find(s => s.id_bahan_baku === 'raw_kopi')
      expect(stockAfterSale.stok).toBe(964)

      // 3. Batalkan transaksi nota (Void)
      await db.from('struk').update({ status_bayar: 'Batal', alasan_batal: 'Pelanggan salah pesan' }).eq('id_struk', strukId)

      // Verifikasi stok dipulihkan kembali ke 1000 gram
      const stockAfterVoid = stockTable.find(s => s.id_bahan_baku === 'raw_kopi')
      expect(stockAfterVoid.stok).toBe(1000)

      // Verifikasi cashflow tidak ganda / telah dibersihkan
      const cashflowTable = db.localDb.store.getTable('cashflow')
      const cf = cashflowTable.find(c => c.id_sumber === strukId)
      expect(cf).toBeUndefined()
    })
  })

  describe('3. Clean Tenant Provisioning (Setup Wizard)', () => {
    it('membuat struktur tenant baru yang bersih, lisensi aktif, dan saldo kas awal', () => {
      const payload = createCleanTenantPayload({
        storeName: 'Berkah Autocare',
        slug: 'berkah_autocare',
        ownerEmail: 'owner@berkah.com',
        ownerName: 'Haji Ahmad',
        telepon: '081299998888',
        alamat: 'Jl. Merdeka No. 10',
        tier: 'PRO_ANNUAL',
        licenseDurationMonths: 12
      })

      expect(payload.tenant.nama).toBe('Berkah Autocare')
      expect(payload.tenant.status).toBe('ACTIVE')
      expect(payload.license.license_key).toMatch(/^RLPOS-PRO-/)
      expect(payload.initialBalances).toHaveLength(2)
      expect(payload.initialPackages.length).toBeGreaterThan(0)
    })
  })

  describe('4. Merchandise & Retail Direct Stock Deduction', () => {
    it('memotong stok barang merchandise langsung saat checkout tanpa resep dan memulihkan saat void', async () => {
      const stockTable = db.localDb.store.getTable('stok_barang')
      
      // Daftarkan item merchandise
      stockTable.push({
        id_barang: 'MCH-TEST-01',
        nama_barang: 'Parfum Mobil Aroma Kopi',
        nama_produk: 'Parfum Mobil Aroma Kopi',
        stok: 25,
        harga_jual: 35000,
        harga_beli: 18000,
        satuan: 'botol',
        kategori: 'Merchandise',
        tenant_id: 'tenant_demo'
      })

      const strukId = 'struk_merch_01'
      await db.from('struk').insert({
        id_struk: strukId,
        tenant_id: 'tenant_demo',
        total_tagihan: 70000,
        status_bayar: 'Selesai',
        metode_bayar: 'CASH',
        kasir: 'Doni'
      })

      // Kasir menjual 2 botol parfum mobil
      await db.from('cafe').insert({
        id_detail: 'cafe_item_mch_1',
        id_struk: strukId,
        id_barang: 'MCH-TEST-01',
        nama_menu: 'Parfum Mobil Aroma Kopi',
        qty: 2,
        harga_satuan: 35000,
        subtotal: 70000,
        tenant_id: 'tenant_demo'
      })

      // Verifikasi stok berkurang langsung dari 25 menjadi 23
      const itemAfterSale = stockTable.find(s => s.id_barang === 'MCH-TEST-01')
      expect(itemAfterSale.stok).toBe(23)

      // Verifikasi saat nota dibatalkan (Void), stok merchandise kembali ke 25
      await db.from('struk').update({ status_bayar: 'Batal', alasan_batal: 'Pelanggan batal beli parfum' }).eq('id_struk', strukId)
      const itemAfterVoid = stockTable.find(s => s.id_barang === 'MCH-TEST-01')
      expect(itemAfterVoid.stok).toBe(25)
    })
  })
})
