import { describe, it, expect } from 'vitest'
import { isPayrollDeductionCategory, isWorkerNameMatch } from '../payrollHelpers'

describe('payrollHelpers', () => {
  describe('isPayrollDeductionCategory', () => {
    it('accepts kasbon, casbon, gaji, upah, komisi, payroll, pinjaman categories/jenis', () => {
      expect(isPayrollDeductionCategory('Casbon', 'Pengeluaran')).toBe(true)
      expect(isPayrollDeductionCategory('Casbon Karyawan', 'Casbon')).toBe(true)
      expect(isPayrollDeductionCategory('Gaji Karyawan', 'Pengeluaran')).toBe(true)
      expect(isPayrollDeductionCategory('Gaji / Komisi', 'Pengeluaran Bersama')).toBe(true)
      expect(isPayrollDeductionCategory('Upah Harian', '')).toBe(true)
      expect(isPayrollDeductionCategory('Pinjaman Karyawan', '')).toBe(true)
      expect(isPayrollDeductionCategory('', 'Casbon')).toBe(true)
    })

    it('rejects non-payroll categories like Operasional / Carwash / Bahan Baku', () => {
      expect(isPayrollDeductionCategory('Operasional', 'Pengeluaran Carwash')).toBe(false)
      expect(isPayrollDeductionCategory('Operasional Carwash', 'Pengeluaran Carwash')).toBe(false)
      expect(isPayrollDeductionCategory('Bahan Cuci & Chemical', 'Pengeluaran Carwash')).toBe(false)
      expect(isPayrollDeductionCategory('Bahan Baku', 'Pengeluaran Cafe')).toBe(false)
      expect(isPayrollDeductionCategory('Maintenance / Servis', 'Operasional')).toBe(false)
      expect(isPayrollDeductionCategory('', '')).toBe(false)
    })
  })

  describe('isWorkerNameMatch', () => {
    it('matches exact worker name and Y/I or P/V aliases on word boundaries', () => {
      expect(isWorkerNameMatch('Casbon Adi', 'ADI')).toBe(true)
      expect(isWorkerNameMatch('Pelunasan Gaji ADI (Cash)', 'ADI')).toBe(true)
      expect(isWorkerNameMatch('Kasbon Budi - 50rb', 'BUDY')).toBe(true)
      expect(isWorkerNameMatch('Kasbon Vani', 'PANI')).toBe(true)
    })

    it('does not falsely match worker name inside unrelated words', () => {
      expect(isWorkerNameMatch('Beli Kardus Jadi', 'ADI')).toBe(false)
      expect(isWorkerNameMatch('Pembelian Sabun', 'ABU')).toBe(false)
    })
  })
})
