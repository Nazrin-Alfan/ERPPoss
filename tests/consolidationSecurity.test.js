import { describe, it, expect } from 'vitest'
import {
  calculateConsolidatedMetrics,
  calculateOutletBreakdown,
  calculateRevenueContribution
} from '../src/services/consolidationService'

describe('consolidationService - RBAC Security & Multi-Tenant Isolation', () => {
  const mockTenants = [
    { id: 'tenant-pusat', nama: 'RelayPOS Pusat & Cafe' },
    { id: 'tenant-cabang-b', nama: 'RelayPOS Cabang Timur' }
  ]

  const mockTransactions = [
    { id: 'tx-1', tenant_id: 'tenant-pusat', total_biaya: 150000, status: 'Selesai' },
    { id: 'tx-2', tenant_id: 'tenant-cabang-b', total_biaya: 200000, status: 'Selesai' }
  ]

  const mockExpenses = [
    { id: 'exp-1', tenant_id: 'tenant-pusat', jumlah: 50000 }
  ]

  const mockCashAccounts = [
    { id: 'acc-1', tenant_id: 'tenant-pusat', nama_akun: 'Kas Laci Kasir', saldo: 500000 }
  ]

  it('mengizinkan role Owner dan Super Admin untuk menghitung metrik konsolidasi', () => {
    const ownerResult = calculateConsolidatedMetrics({
      userRole: 'Owner',
      tenants: mockTenants,
      transactions: mockTransactions,
      expenses: mockExpenses,
      cashAccounts: mockCashAccounts
    })

    expect(ownerResult.totalRevenue).toBe(350000)
    expect(ownerResult.totalExpenses).toBe(50000)
    expect(ownerResult.netProfit).toBe(300000)
    expect(ownerResult.isAuthorized).toBe(true)

    const superAdminResult = calculateConsolidatedMetrics({
      userRole: 'Super Admin',
      tenants: mockTenants,
      transactions: mockTransactions,
      expenses: mockExpenses,
      cashAccounts: mockCashAccounts
    })

    expect(superAdminResult.isAuthorized).toBe(true)
    expect(superAdminResult.totalRevenue).toBe(350000)
  })

  it('menolak keras role Kasir dan Admin cabang dari akses data konsolidasi (Fail-Safe Defense)', () => {
    const kasirResult = calculateConsolidatedMetrics({
      userRole: 'Kasir',
      tenants: mockTenants,
      transactions: mockTransactions,
      expenses: mockExpenses,
      cashAccounts: mockCashAccounts
    })

    expect(kasirResult.isAuthorized).toBe(false)
    expect(kasirResult.totalRevenue).toBe(0)
    expect(kasirResult.netProfit).toBe(0)
    expect(kasirResult.totalCashBalance).toBe(0)

    const adminResult = calculateOutletBreakdown({
      userRole: 'Admin',
      tenants: mockTenants,
      transactions: mockTransactions,
      expenses: mockExpenses,
      cashAccounts: mockCashAccounts
    })

    // Admin cabang tidak boleh menerima breakdown konsolidasi
    expect(adminResult).toEqual([])
  })
})
