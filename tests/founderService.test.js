import { describe, it, expect } from 'vitest'
import {
  calculateFounderPlatformMetrics,
  toggleTenantSubscriptionStatus,
  generateLicenseRenewalPayload
} from '../src/services/founderService'

describe('founderService - Solo Founder God-Mode Controls', () => {
  const mockTenants = [
    {
      id: 'tenant-1',
      nama: 'Kopi & Cuci Jaya',
      is_active: true,
      subscription_status: 'ACTIVE',
      plan: 'ENTERPRISE',
      license_expires_at: '2026-12-31T23:59:59Z'
    },
    {
      id: 'tenant-2',
      nama: 'Barbershop & Cafe Bro',
      is_active: true,
      subscription_status: 'ACTIVE',
      plan: 'BASIC',
      license_expires_at: '2026-10-31T23:59:59Z'
    },
    {
      id: 'tenant-3',
      nama: 'Auto Detailing Express',
      is_active: false,
      subscription_status: 'SUSPENDED',
      plan: 'BASIC',
      license_expires_at: '2026-08-31T23:59:59Z'
    }
  ]

  const mockTransactions = [
    { id: 'tx-1', tenant_id: 'tenant-1', total_biaya: 250000, status: 'Selesai' },
    { id: 'tx-2', tenant_id: 'tenant-1', total_biaya: 150000, status: 'Selesai' },
    { id: 'tx-3', tenant_id: 'tenant-2', total_biaya: 100000, status: 'Selesai' },
    { id: 'tx-4', tenant_id: 'tenant-3', total_biaya: 50000, status: 'Batal' }
  ]

  it('menghitung metrik global platform SaaS (MRR, GMV, Tenant Counts)', () => {
    const metrics = calculateFounderPlatformMetrics({
      tenants: mockTenants,
      transactions: mockTransactions
    })

    expect(metrics.totalTenants).toBe(3)
    expect(metrics.activeTenants).toBe(2)
    expect(metrics.suspendedTenants).toBe(1)
    // GMV Platform = 250.000 + 150.000 + 100.000 = 500.000 (tidak termasuk batal)
    expect(metrics.platformGMV).toBe(500000)
    expect(metrics.totalPlatformTransactions).toBe(3)
    // MRR dari 1 Enterprise (misal 500rb) + 1 Basic (misal 200rb) = 700.000
    expect(metrics.estimatedMRR).toBeGreaterThan(0)
  })

  it('bisa membekukan (kill-switch) dan mengaktifkan kembali langganan tenant', () => {
    const suspended = toggleTenantSubscriptionStatus(mockTenants[0], false)
    expect(suspended.is_active).toBe(false)
    expect(suspended.subscription_status).toBe('SUSPENDED')

    const reactivated = toggleTenantSubscriptionStatus(mockTenants[2], true)
    expect(reactivated.is_active).toBe(true)
    expect(reactivated.subscription_status).toBe('ACTIVE')
  })

  it('memperpanjang lisensi tenant dengan payload baru dan masa aktif bertambah', () => {
    const renewal = generateLicenseRenewalPayload(mockTenants[0], 6) // +6 bulan
    expect(renewal.license_expires_at).toBeDefined()
    expect(new Date(renewal.license_expires_at).getTime()).toBeGreaterThan(new Date(mockTenants[0].license_expires_at).getTime())
    expect(renewal.subscription_status).toBe('ACTIVE')
    expect(renewal.is_active).toBe(true)
  })
})
