import { describe, it, expect } from 'vitest'
import {
  calculateConsolidatedMetrics,
  calculateOutletBreakdown,
  calculateRevenueContribution
} from '../src/services/consolidationService'

describe('consolidationService - Multi-Tenant Executive Calculations', () => {
  const mockTenants = [
    { id: 'tenant-pusat', nama: 'RelayPOS Pusat & Cafe' },
    { id: 'tenant-cabang-b', nama: 'RelayPOS Cabang Timur' }
  ]

  const mockTransactions = [
    // Tenant Pusat
    { id: 'tx-1', tenant_id: 'tenant-pusat', total_biaya: 150000, status: 'Selesai', created_at: '2026-09-20T10:00:00Z' },
    { id: 'tx-2', tenant_id: 'tenant-pusat', total_biaya: 250000, status: 'Selesai', created_at: '2026-09-21T11:00:00Z' },
    { id: 'tx-3', tenant_id: 'tenant-pusat', total_biaya: 100000, status: 'Batal', created_at: '2026-09-21T12:00:00Z' }, // Void, exclude
    // Tenant Cabang Timur
    { id: 'tx-4', tenant_id: 'tenant-cabang-b', total_biaya: 200000, status: 'Selesai', created_at: '2026-09-20T09:00:00Z' }
  ]

  const mockExpenses = [
    // Tenant Pusat
    { id: 'exp-1', tenant_id: 'tenant-pusat', jumlah: 80000, tanggal: '2026-09-20' },
    // Tenant Cabang Timur
    { id: 'exp-2', tenant_id: 'tenant-cabang-b', jumlah: 50000, tanggal: '2026-09-20' }
  ]

  const mockCashAccounts = [
    { id: 'acc-1', tenant_id: 'tenant-pusat', nama_akun: 'Kas Laci Kasir', saldo: 500000 },
    { id: 'acc-2', tenant_id: 'tenant-pusat', nama_akun: 'Rekening BCA', saldo: 2000000 },
    { id: 'acc-3', tenant_id: 'tenant-cabang-b', nama_akun: 'Kas Laci Kasir Cabang', saldo: 300000 }
  ]

  it('menghitung metrik konsolidasi agregat seluruh cabang dengan tepat', () => {
    const summary = calculateConsolidatedMetrics({
      tenants: mockTenants,
      transactions: mockTransactions,
      expenses: mockExpenses,
      cashAccounts: mockCashAccounts
    })

    // Omzet total valid = 150.000 + 250.000 (Pusat) + 200.000 (Timur) = 600.000 (Exclude Batal)
    expect(summary.totalRevenue).toBe(600000)
    // Pengeluaran total = 80.000 + 50.000 = 130.000
    expect(summary.totalExpenses).toBe(130000)
    // Net profit = 600.000 - 130.000 = 470.000
    expect(summary.netProfit).toBe(470000)
    // Margin laba = (470.000 / 600.000) * 100 = 78.33%
    expect(summary.netMarginPercentage).toBeCloseTo(78.33, 1)
    // Total kas = 500.000 + 2.000.000 + 300.000 = 2.800.000
    expect(summary.totalCashBalance).toBe(2800000)
    // Total transaksi valid = 3
    expect(summary.totalTransactionsCount).toBe(3)
  })

  it('membedah performa per cabang secara terisolasi tanpa saling bocor data', () => {
    const breakdown = calculateOutletBreakdown({
      tenants: mockTenants,
      transactions: mockTransactions,
      expenses: mockExpenses,
      cashAccounts: mockCashAccounts
    })

    expect(breakdown).toHaveLength(2)

    const pusat = breakdown.find(b => b.tenantId === 'tenant-pusat')
    expect(pusat.revenue).toBe(400000)
    expect(pusat.expenses).toBe(80000)
    expect(pusat.netProfit).toBe(320000)
    expect(pusat.cashBalance).toBe(2500000)
    expect(pusat.transactionCount).toBe(2)

    const timur = breakdown.find(b => b.tenantId === 'tenant-cabang-b')
    expect(timur.revenue).toBe(200000)
    expect(timur.expenses).toBe(50000)
    expect(timur.netProfit).toBe(150000)
    expect(timur.cashBalance).toBe(300000)
    expect(timur.transactionCount).toBe(1)
  })

  it('menghitung persentase kontribusi omzet per outlet dengan presisi', () => {
    const contributions = calculateRevenueContribution({
      tenants: mockTenants,
      transactions: mockTransactions
    })

    const pusat = contributions.find(c => c.tenantId === 'tenant-pusat')
    const timur = contributions.find(c => c.tenantId === 'tenant-cabang-b')

    // Total omzet = 600.000. Pusat = 400.000 (66.67%), Timur = 200.000 (33.33%)
    expect(pusat.percentage).toBeCloseTo(66.67, 1)
    expect(timur.percentage).toBeCloseTo(33.33, 1)
  })
})
