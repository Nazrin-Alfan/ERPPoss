import { describe, it, expect } from 'vitest'
import { getLocalDateString, calculateCashierDrawerStatus } from '../helpers'

describe('Cashier Drawer Cash & Date Normalization Helpers', () => {
  describe('getLocalDateString', () => {
    it('returns empty string for null, undefined, or empty values', () => {
      expect(getLocalDateString(null)).toBe('')
      expect(getLocalDateString(undefined)).toBe('')
      expect(getLocalDateString('')).toBe('')
    })

    it('returns plain YYYY-MM-DD directly without mutation', () => {
      expect(getLocalDateString('2026-10-31')).toBe('2026-10-31')
      expect(getLocalDateString(' 2026-11-01 ')).toBe('2026-11-01')
    })

    it('parses Date object to local YYYY-MM-DD', () => {
      const d = new Date(2026, 9, 31, 10, 30) // Oct 31, 2026
      expect(getLocalDateString(d)).toBe('2026-10-31')
    })
  })

  describe('calculateCashierDrawerStatus', () => {
    const today = new Date().toLocaleDateString('en-CA')

    it('calculates cash incoming for standard CASH / TUNAI transactions on today date', () => {
      const strukList = [
        {
          id_struk: 'str_1',
          total_tagihan: 50000,
          metode_bayar: 'CASH',
          status_bayar: 'Selesai',
          tanggal: today
        },
        {
          id_struk: 'str_2',
          total_tagihan: 35000,
          metode_bayar: 'Tunai',
          status_bayar: 'Selesai',
          tanggal: today
        }
      ]

      const status = calculateCashierDrawerStatus({
        strukList,
        expenses: [],
        startingCapital: 100000,
        targetDate: today
      })

      expect(status.todayIn).toBe(85000)
      expect(status.todayQRIS).toBe(0)
      expect(status.startingCapital).toBe(100000)
      expect(status.physicalDrawerCash).toBe(185000)
    })

    it('correctly attributes a bill created yesterday but settled today (waktu_dibayar today)', () => {
      const yesterday = '2026-10-30'
      const strukList = [
        {
          id_struk: 'str_old_settled_today',
          total_tagihan: 120000,
          metode_bayar: 'CASH',
          nominal_cash: 120000,
          nominal_qris: 0,
          status_bayar: 'Selesai',
          tanggal: yesterday,
          waktu_dibayar: new Date().toISOString() // settled today!
        }
      ]

      const status = calculateCashierDrawerStatus({
        strukList,
        expenses: [],
        startingCapital: 50000,
        targetDate: today
      })

      expect(status.todayIn).toBe(120000)
      expect(status.physicalDrawerCash).toBe(170000)
    })

    it('correctly handles SPLIT payments separating cash and qris', () => {
      const strukList = [
        {
          id_struk: 'str_split_1',
          total_tagihan: 100000,
          metode_bayar: 'SPLIT',
          nominal_cash: 40000,
          nominal_qris: 60000,
          status_bayar: 'Selesai',
          tanggal: today
        }
      ]

      const status = calculateCashierDrawerStatus({
        strukList,
        expenses: [],
        startingCapital: 0,
        targetDate: today
      })

      expect(status.todayIn).toBe(40000)
      expect(status.todayQRIS).toBe(60000)
      expect(status.physicalDrawerCash).toBe(40000)
    })

    it('ignores cancelled or voided transactions', () => {
      const strukList = [
        {
          id_struk: 'str_batal',
          total_tagihan: 90000,
          metode_bayar: 'CASH',
          status_bayar: 'Batal',
          tanggal: today
        },
        {
          id_struk: 'str_ok',
          total_tagihan: 25000,
          metode_bayar: 'CASH',
          status_bayar: 'Selesai',
          tanggal: today
        }
      ]

      const status = calculateCashierDrawerStatus({
        strukList,
        expenses: [],
        startingCapital: 0,
        targetDate: today
      })

      expect(status.todayIn).toBe(25000)
    })

    it('deducts today cash expenses from drawer balance', () => {
      const strukList = [
        {
          id_struk: 'str_1',
          total_tagihan: 100000,
          metode_bayar: 'CASH',
          status_bayar: 'Selesai',
          tanggal: today
        }
      ]

      const expenses = [
        { id: 'exp_1', nominal: 15000, tanggal: today },
        { id: 'exp_2', nominal: 5000, tanggal: today }
      ]

      const status = calculateCashierDrawerStatus({
        strukList,
        expenses,
        startingCapital: 200000,
        targetDate: today
      })

      expect(status.todayIn).toBe(100000)
      expect(status.todayOut).toBe(20000)
      expect(status.physicalDrawerCash).toBe(280000)
    })
  })
})
