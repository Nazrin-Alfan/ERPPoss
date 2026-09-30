import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatRupiah,
  parseDateSafe,
  getShiftForCashier,
  generateUUID,
  calculateTutupKasirRecap,
  calculateDailyCashierRecap
} from '../helpers'

describe('Base Helpers', () => {
  describe('formatRupiah', () => {
    it('should format numbers correctly to Rupiah currency string', () => {
      // Membersihkan spasi non-breaking untuk perbandingan yang konsisten
      const clean = (str) => str.replace(/\s/g, ' ').replace(/\u00a0/g, ' ')
      
      expect(clean(formatRupiah(15000))).toBe('Rp 15.000')
      expect(clean(formatRupiah(0))).toBe('Rp 0')
      expect(clean(formatRupiah('2500000'))).toBe('Rp 2.500.000')
    })
  })

  describe('parseDateSafe', () => {
    it('should parse standard date strings and return Date instances', () => {
      const parsed = parseDateSafe('2026-08-06')
      expect(parsed).toBeInstanceOf(Date)
      expect(parsed.getFullYear()).toBe(2026)
      expect(parsed.getMonth()).toBe(7) // Agustus (0-indexed)
      expect(parsed.getDate()).toBe(6)
    })

    it('should fallback to current Date if input is null or empty', () => {
      const today = new Date()
      const parsed = parseDateSafe(null)
      expect(parsed).toBeInstanceOf(Date)
      // Selisih waktu pengujian sangat kecil
      expect(Math.abs(parsed.getTime() - today.getTime())).toBeLessThan(1000)
    })

    it('should parse ISO date strings with time component', () => {
      const parsed = parseDateSafe('2026-08-06T12:30:00')
      expect(parsed.getHours()).toBe(12)
    })
  })

  describe('getShiftForCashier', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should map Shift 2 for specific cashier Syafa regardless of time', () => {
      vi.setSystemTime(new Date('2026-08-06T09:00:00')) // Jam 9 pagi
      expect(getShiftForCashier('Syafa')).toBe('Shift 2')
      expect(getShiftForCashier('syafa')).toBe('Shift 2')
    })

    it('should map Shift 1 for specific cashiers Alexa and Vira regardless of time', () => {
      vi.setSystemTime(new Date('2026-08-06T18:00:00')) // Jam 6 sore
      expect(getShiftForCashier('Alexa')).toBe('Shift 1')
      expect(getShiftForCashier('Vira')).toBe('Shift 1')
    })

    it('should map shift based on time for default/other cashiers', () => {
      // Pagi: jam 10.00 -> Shift 1
      vi.setSystemTime(new Date('2026-08-06T10:00:00'))
      expect(getShiftForCashier('Budi')).toBe('Shift 1')

      // Sore: jam 15.00 -> Shift 2
      vi.setSystemTime(new Date('2026-08-06T15:00:00'))
      expect(getShiftForCashier('Budi')).toBe('Shift 2')
    })

    it('should default to Shift 1 if cashier name is empty', () => {
      expect(getShiftForCashier('')).toBe('Shift 1')
      expect(getShiftForCashier(null)).toBe('Shift 1')
    })
  })

  describe('generateUUID', () => {
    it('should return a string of appropriate length and character set', () => {
      const uuid = generateUUID()
      expect(typeof uuid).toBe('string')
      expect(uuid.length).toBeGreaterThanOrEqual(10)
    })

    it('should produce unique values across multiple calls', () => {
      const set = new Set()
      for (let i = 0; i < 100; i++) {
        set.add(generateUUID())
      }
      expect(set.size).toBe(100)
    })

    it('should fallback to valid RFC 4122 v4 UUID format when crypto.randomUUID is not available', () => {
      const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto
      const originalRandomUUID = cryptoObj?.randomUUID
      if (cryptoObj && cryptoObj.randomUUID) {
        cryptoObj.randomUUID = undefined
      }

      const uuid = generateUUID()
      const rfc4122Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      expect(rfc4122Regex.test(uuid)).toBe(true)

      if (cryptoObj && originalRandomUUID) {
        cryptoObj.randomUUID = originalRandomUUID
      }
    })
  })

  describe('calculateTutupKasirRecap', () => {
    it('should compile correct cashflow records for cash, qris, and expenses', () => {
      const receipts = [
        { total_tagihan: 15000, metode_bayar: 'CASH', status_bayar: 'Selesai' },
        { total_tagihan: '35000', metode_bayar: 'CASH', status_bayar: 'Selesai' },
        { total_tagihan: 50000, metode_bayar: 'QRIS', status_bayar: 'Selesai' }
      ]
      
      const expenses = [
        { nominal: 10000 },
        { nominal: '15000' }
      ]

      const recap = calculateTutupKasirRecap({
        receipts,
        expenses,
        cashierName: 'Alexa',
        todayDate: '2026-08-06',
        timestamp: '2026-08-06T15:22:00.000Z'
      })

      expect(recap.length).toBe(3)

      // CASH Omzet record
      const cashRecord = recap.find(r => r.kategori === 'Omzet Harian (CASH)')
      expect(cashRecord).toBeDefined()
      expect(cashRecord.pemasukan).toBe(50000) // 15000 + 35000
      expect(cashRecord.pengeluaran).toBe(0)
      expect(cashRecord.pos).toBe('SALDO CASH')
      expect(cashRecord.jenis).toBe('Pemasukan')
      expect(cashRecord.keterangan_transaksi).toBe('Rekap Tutup Kasir (CASH) - Kasir: Alexa')
      expect(cashRecord.tanggal).toBe('2026-08-06')
      expect(cashRecord.created_at).toBe('2026-08-06T15:22:00.000Z')

      // QRIS Omzet record
      const qrisRecord = recap.find(r => r.kategori === 'Omzet Harian (QRIS)')
      expect(qrisRecord).toBeDefined()
      expect(qrisRecord.pemasukan).toBe(50000)
      expect(qrisRecord.pengeluaran).toBe(0)
      expect(qrisRecord.pos).toBe('SALDO REKENING Y')
      expect(qrisRecord.jenis).toBe('Pemasukan')
      expect(qrisRecord.keterangan_transaksi).toBe('Rekap Tutup Kasir (QRIS) - Kasir: Alexa')

      // Expense record
      const expenseRecord = recap.find(r => r.pos === 'SALDO CASH' && r.pengeluaran > 0)
      expect(expenseRecord).toBeDefined()
      expect(expenseRecord.pemasukan).toBe(0)
      expect(expenseRecord.pengeluaran).toBe(25000) // 10000 + 15000
      expect(expenseRecord.kategori).toBe('Operasional')
      expect(expenseRecord.jenis).toBe('pengeluaran Cafe')
      expect(expenseRecord.keterangan_transaksi).toBe('Rekap Pengeluaran Kasir - Kasir: Alexa')
    })

    it('should accurately calculate SPLIT payment dividing nominal_cash and nominal_qris', () => {
      const receipts = [
        { total_tagihan: 50000, metode_bayar: 'SPLIT', nominal_cash: 20000, nominal_qris: 30000, status_bayar: 'Selesai' },
        { total_tagihan: 30000, metode_bayar: 'CASH', nominal_cash: 30000, nominal_qris: 0, status_bayar: 'Selesai' }
      ]

      const recap = calculateTutupKasirRecap({
        receipts,
        expenses: [],
        cashierName: 'Syafa',
        todayDate: '2026-08-06',
        timestamp: '2026-08-06T15:22:00.000Z'
      })

      const cashRecord = recap.find(r => r.kategori === 'Omzet Harian (CASH)')
      const qrisRecord = recap.find(r => r.kategori === 'Omzet Harian (QRIS)')

      expect(cashRecord.pemasukan).toBe(50000) // 20000 (split) + 30000 (cash)
      expect(qrisRecord.pemasukan).toBe(30000) // 30000 (split)
    })

    it('should omit records that have zero total', () => {
      const recap = calculateTutupKasirRecap({
        receipts: [{ total_tagihan: 20000, metode_bayar: 'QRIS', status_bayar: 'Selesai' }],
        expenses: [],
        cashierName: 'Budi',
        todayDate: '2026-08-06',
        timestamp: '2026-08-06T15:22:00.000Z'
      })

      expect(recap.length).toBe(1)
      expect(recap[0].kategori).toBe('Omzet Harian (QRIS)')
      expect(recap[0].pemasukan).toBe(20000)
    })
  })

  describe('calculateDailyCashierRecap', () => {
    it('should accurately calculate cash vs non-cash totals, counts, and percentages for today', () => {
      const sampleReceipts = [
        { id_struk: 'S1', tanggal: '2026-09-20', metode_bayar: 'CASH', total_tagihan: 100000, nominal_cash: 100000, nominal_qris: 0, status_bayar: 'Selesai' },
        { id_struk: 'S2', tanggal: '2026-09-20', metode_bayar: 'QRIS', total_tagihan: 50000, nominal_cash: 0, nominal_qris: 50000, status_bayar: 'Selesai' },
        { id_struk: 'S3', tanggal: '2026-09-20', metode_bayar: 'SPLIT', total_tagihan: 50000, nominal_cash: 20000, nominal_qris: 30000, status_bayar: 'Selesai' },
        { id_struk: 'S4', tanggal: '2026-09-20', metode_bayar: 'TRANSFER', total_tagihan: 100000, nominal_cash: 0, nominal_qris: 100000, status_bayar: 'Selesai' },
        // Transaksi kemarin (harus di-filter keluar)
        { id_struk: 'S5', tanggal: '2026-09-19', metode_bayar: 'CASH', total_tagihan: 80000, nominal_cash: 80000, nominal_qris: 0, status_bayar: 'Selesai' },
        // Transaksi batal (harus diabaikan)
        { id_struk: 'S6', tanggal: '2026-09-20', metode_bayar: 'CASH', total_tagihan: 45000, nominal_cash: 45000, nominal_qris: 0, status_bayar: 'Batal' }
      ]

      const recap = calculateDailyCashierRecap(sampleReceipts, '2026-09-20')
      expect(recap.totalCash).toBe(120000) // S1: 100k + S3: 20k
      expect(recap.totalNonCash).toBe(180000) // S2: 50k + S3: 30k + S4: 100k
      expect(recap.totalOmzet).toBe(300000)
      expect(recap.cashPercentage).toBe(40) // 120k / 300k = 40%
      expect(recap.nonCashPercentage).toBe(60) // 180k / 300k = 60%
      expect(recap.cashTxCount).toBe(1)
      expect(recap.nonCashTxCount).toBe(2)
      expect(recap.splitTxCount).toBe(1)
      expect(recap.totalTxCount).toBe(4)
    })

    it('should handle empty receipts gracefully with zero values', () => {
      const recap = calculateDailyCashierRecap([], '2026-09-20')
      expect(recap.totalCash).toBe(0)
      expect(recap.totalNonCash).toBe(0)
      expect(recap.totalOmzet).toBe(0)
      expect(recap.cashPercentage).toBe(0)
      expect(recap.nonCashPercentage).toBe(0)
      expect(recap.totalTxCount).toBe(0)
    })
  })
})
