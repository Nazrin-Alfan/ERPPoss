import { describe, it, expect } from 'vitest'
import {
  isTestOrCancelledStruk,
  isTukarUangStruk,
  classifyExpenseBucket,
} from '../reportClassificationHelpers'

describe('reportClassificationHelpers', () => {
  describe('isTestOrCancelledStruk', () => {
    it('preserves legitimate words containing test substring like kontes, protest, tester', () => {
      expect(isTestOrCancelledStruk({ keterangan: 'Hadiah Lomba Kontes Kopi', status: 'Lunas' })).toBe(false)
      expect(isTestOrCancelledStruk({ keterangan: 'Komplain Protest Pelanggan (Gratis)', status: 'Lunas' })).toBe(false)
      expect(isTestOrCancelledStruk({ keterangan: 'Pembelian Tester Parfum Mobil', status: 'Lunas' })).toBe(false)
      expect(isTestOrCancelledStruk({ keterangan: 'Kopi Tubruk Biasa', status: 'Selesai' })).toBe(false)
    })

    it('excludes test, testing, kalibrasi, and cancelled/void transactions', () => {
      expect(isTestOrCancelledStruk({ keterangan: 'Test Transaksi QRIS', status_bayar: 'Lunas' })).toBe(true)
      expect(isTestOrCancelledStruk({ keterangan: 'Transaksi testing kasir', status_bayar: 'Lunas' })).toBe(true)
      expect(isTestOrCancelledStruk({ keterangan: 'Kalibrasi timbangan espresso', status_bayar: 'Lunas' })).toBe(true)
      expect(isTestOrCancelledStruk({ keterangan: 'Kopi Susu', status_bayar: 'Batal' })).toBe(true)
      expect(isTestOrCancelledStruk({ keterangan: 'Cuci Mobil', status_bayar: 'Cancelled' })).toBe(true)
      expect(isTestOrCancelledStruk({ keterangan: 'Kopi Tubruk', is_test: true, status_bayar: 'Lunas' })).toBe(true)
    })
  })

  describe('isTukarUangStruk', () => {
    it('detects tukar uang / ganti QRIS internal cash swaps without misclassifying normal sales', () => {
      expect(isTukarUangStruk({ kategori: 'Tukar Uang', keterangan: 'Tukar Uang Cash -> QRIS' })).toBe(true)
      expect(isTukarUangStruk({ keterangan: 'Penjualan Kopi Susu Gula Aren', kategori: 'Cafe' })).toBe(false)
    })
  })

  describe('classifyExpenseBucket', () => {
    it('classifies Kasbon (K), Casbon (C), and karyawan_id expenses as overhead_gaji', () => {
      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Bersama',
          kategori: 'Kasbon Karyawan',
          keterangan: 'Kasbon mingguan',
        })
      ).toBe('overhead_gaji')

      expect(
        classifyExpenseBucket({
          jenis: 'Casbon',
          kategori: 'Casbon',
          keterangan: 'Pinjaman staff',
        })
      ).toBe('overhead_gaji')

      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Bersama',
          kategori: 'Lainnya',
          keterangan: 'Pinjaman darurat',
          karyawan_id: '11111111-1111-4111-8111-111111111111',
        })
      ).toBe('overhead_gaji')
    })

    it('does NOT misclassify Repair kursi or Air freshener / filter as overhead_utilitas', () => {
      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Bersama',
          kategori: 'Maintenance',
          keterangan: 'Repair kursi ruang tunggu',
        })
      ).toBe('overhead_lain')

      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Bersama',
          kategori: 'Perlengkapan',
          keterangan: 'Beli Air freshener ruangan',
        })
      ).toBe('overhead_lain')

      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Bersama',
          kategori: 'Operasional',
          keterangan: 'Ganti Air filter ruang kasir',
        })
      ).toBe('overhead_lain')
    })

    it('classifies genuine PDAM water, PLN electricity, and WiFi bills as overhead_utilitas', () => {
      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Bersama',
          kategori: 'Utilitas',
          keterangan: 'Tagihan Air PDAM bulan ini',
        })
      ).toBe('overhead_utilitas')

      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Bersama',
          kategori: 'Operasional',
          keterangan: 'Token Listrik PLN',
        })
      ).toBe('overhead_utilitas')

      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Bersama',
          kategori: 'Internet',
          keterangan: 'Tagihan WiFi Biznet',
        })
      ).toBe('overhead_utilitas')
    })

    it('routes Cafe and Carwash expenses into bahan vs ops buckets accurately', () => {
      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Cafe',
          kategori: 'Bahan Baku F&B',
          keterangan: 'Kulakan Biji Kopi Arabica',
        })
      ).toBe('cafe_bahan')

      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Cafe',
          kategori: 'Operasional',
          keterangan: 'Beli Air freshener toilet cafe',
        })
      ).toBe('cafe_ops')

      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Carwash',
          kategori: 'Bahan Cuci & Chemical',
          keterangan: 'Shampoo Snow Wash 20L',
        })
      ).toBe('carwash_bahan')

      expect(
        classifyExpenseBucket({
          jenis: 'Pengeluaran Carwash',
          kategori: 'Maintenance',
          keterangan: 'Servis nozzle jet cleaner',
        })
      ).toBe('carwash_ops')
    })
  })
})
