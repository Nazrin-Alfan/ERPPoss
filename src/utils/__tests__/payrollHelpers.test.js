import { describe, it, expect } from 'vitest'
import {
  isPayrollDeductionCategory,
  isWorkerNameMatch,
  resolvePayrollDeductionTarget,
  aggregateCarwashWages,
} from '../payrollHelpers'

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

  describe('aggregateCarwashWages (Relational ID & Anti-Leakage)', () => {
    const RINI_ID = '11111111-1111-4111-8111-111111111111'
    const RYNI_ID = '22222222-2222-4222-8222-222222222222'
    const OFFICE_ID = '99999999-9999-4999-8999-999999999999'

    it('matches kasbon strictly by karyawan_id even when note text is edited or mentions another worker (RINI vs RYNI)', () => {
      const summary = aggregateCarwashWages({
        karyawanCuciList: [
          { id: RINI_ID, nama: 'RINI' },
          { id: RYNI_ID, nama: 'RYNI' },
        ],
        carwashWagesList: [
          {
            id: 'cw-1',
            id_transaksi: 'CW-001',
            tanggal: '2026-11-21',
            jam: '09:00',
            layanan: 'Cuci Salju',
            harga_cuci: 60000,
            harga_paket: 40000,
            anggota_1_id: RINI_ID,
            anggota_1: 'RINI LAMA',
            anggota_2_id: RYNI_ID,
            anggota_2: 'RYNI',
          },
        ],
        pengeluaranList: [
          {
            id: 'exp-1',
            id_pengeluaran: 'EXP-1',
            tanggal: '2026-11-21',
            jenis: 'Pengeluaran Bersama',
            kategori: 'Kasbon',
            karyawan_id: RINI_ID,
            nama_pengeluaran: 'Kasbon Rini titip ambil bareng RYNI (note edited)',
            nominal: 15000,
          },
        ],
        cashflowList: [
          // Linked duplicate via id_sumber -> must NOT double-deduct
          {
            id: 'cf-1',
            id_cashflow: 'CF-1',
            id_sumber: 'EXP-1',
            tanggal: '2026-11-21',
            jenis: 'Pengeluaran Bersama',
            kategori: 'Kasbon',
            karyawan_id: RINI_ID,
            keterangan_transaksi: 'Kasbon Rini titip ambil bareng RYNI (note edited)',
            pengeluaran: 15000,
          },
        ],
      })

      const rini = summary.find((w) => w.id === RINI_ID)
      const ryni = summary.find((w) => w.id === RYNI_ID)

      // (60.000 / 3 / 2) + (40.000 / 2 / 2) = 10.000 + 10.000 = 20.000 per crew
      expect(rini).toBeDefined()
      expect(rini.name).toBe('RINI')
      expect(rini.totalWage).toBe(20000)
      expect(rini.totalWithdrawals).toBe(15000)
      expect(rini.netWage).toBe(5000)

      expect(ryni).toBeDefined()
      expect(ryni.totalWage).toBe(20000)
      expect(ryni.totalWithdrawals).toBe(0)
      expect(ryni.netWage).toBe(20000)
    })

    it('isolates office staff kasbon via external karyawan_id UUID so carwash worker is NOT deducted', () => {
      const summary = aggregateCarwashWages({
        karyawanCuciList: [{ id: RINI_ID, nama: 'RINI' }],
        carwashWagesList: [
          {
            id: 'cw-2',
            id_transaksi: 'CW-002',
            tanggal: '2026-11-21',
            jam: '10:00',
            layanan: 'Cuci Komplit',
            harga_cuci: 60000,
            harga_paket: 40000,
            anggota_1_id: RINI_ID,
            anggota_1: 'RINI',
          },
        ],
        pengeluaranList: [
          {
            id: 'exp-office',
            id_pengeluaran: 'EXP-OFF-1',
            tanggal: '2026-11-21',
            jenis: 'Pengeluaran Bersama',
            kategori: 'Kasbon',
            karyawan_id: OFFICE_ID,
            nama_pengeluaran: 'Kasbon Staff Kantor RINI Admin',
            nominal: 20000,
          },
        ],
        cashflowList: [],
      })

      const rini = summary.find((w) => w.id === RINI_ID)
      // Solo: (60.000 / 3) + (40.000 / 2) = 20.000 + 20.000 = 40.000
      expect(rini.totalWage).toBe(40000)
      expect(rini.totalWithdrawals).toBe(0)
      expect(rini.netWage).toBe(40000)
    })
  })
})
