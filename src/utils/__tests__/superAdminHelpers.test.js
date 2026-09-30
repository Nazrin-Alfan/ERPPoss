import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateSerialLicenseKey,
  createCleanTenantPayload,
  purgeTransactionsForTenant,
  deleteTenantCompletely
} from '../superAdminHelpers.js'
import { localDbStore, DEFAULT_TENANT_ID } from '../../services/localDbEngine.js'

describe('superAdminHelpers', () => {
  it('TC_01: generateSerialLicenseKey should produce valid formatted keys', () => {
    const key = generateSerialLicenseKey('PRO_ANNUAL', 1)
    expect(key).toMatch(/^RLPOS-PRO-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })

  it('TC_02: createCleanTenantPayload should provision zero-transaction tenant structure', () => {
    const payload = createCleanTenantPayload({
      storeName: 'Kurnia Auto Care',
      ownerEmail: 'owner@kurnia.com',
      ownerName: 'Pak Kurnia',
      tier: 'PRO_ANNUAL'
    })

    expect(payload.tenant.nama).toBe('Kurnia Auto Care')
    expect(payload.tenant.status).toBe('ACTIVE')
    expect(payload.ownerProfile.email).toBe('owner@kurnia.com')
    expect(payload.license.license_key).toMatch(/^RLPOS-PRO-/)
    expect(payload.initialBalances.length).toBe(2)
    expect(payload.initialBalances[0].balance).toBe(0)
    expect(payload.initialPackages.length).toBeGreaterThanOrEqual(7)
  })

  it('TC_03: purgeTransactionsForTenant should clear transactions while keeping master data', () => {
    localDbStore.resetDatabase()

    // Mock insert transaksi dummy
    localDbStore.getTable('struk').push({ id_struk: 'str_mock_1', tenant_id: DEFAULT_TENANT_ID, total: 50000 })
    localDbStore.getTable('carwash').push({ id_transaksi: 'cw_mock_1', tenant_id: DEFAULT_TENANT_ID, plat: 'BK 1234 XX' })

    // Verifikasi ada transaksi sebelum purge
    const strukBefore = localDbStore.getTable('struk').filter(s => s.tenant_id === DEFAULT_TENANT_ID)
    expect(strukBefore.length).toBe(1)

    // Lakukan purge
    const success = purgeTransactionsForTenant(localDbStore, DEFAULT_TENANT_ID)
    expect(success).toBe(true)

    // Struk dan carwash harus 0
    const strukAfter = localDbStore.getTable('struk').filter(s => s.tenant_id === DEFAULT_TENANT_ID)
    expect(strukAfter.length).toBe(0)

    const cwAfter = localDbStore.getTable('carwash').filter(c => c.tenant_id === DEFAULT_TENANT_ID)
    expect(cwAfter.length).toBe(0)

    // Master data paket cuci harus tetap ada
    const packages = localDbStore.getTable('carwash_packages').filter(p => p.tenant_id === DEFAULT_TENANT_ID)
    expect(packages.length).toBeGreaterThan(0)
  })

  it('TC_04: deleteTenantCompletely should delete user-created tenant completely', () => {
    const payload = createCleanTenantPayload({
      storeName: 'Test Toko Hapus',
      ownerEmail: 'owner@hapus.com',
      ownerName: 'Owner Hapus'
    })

    const newTenantId = payload.tenant.id

    // Insert payload
    localDbStore.getTable('tenants').push(payload.tenant)
    localDbStore.getTable('tenant_licenses').push(payload.license)
    localDbStore.getTable('pos_balances').push(...payload.initialBalances)

    // Pastikan terdaftar
    expect(localDbStore.getTable('tenants').some(t => t.id === newTenantId)).toBe(true)

    // Lakukan penghapusan total
    const result = deleteTenantCompletely(localDbStore, newTenantId)
    expect(result.success).toBe(true)

    // Pastikan tidak ada lagi di tabel
    expect(localDbStore.getTable('tenants').some(t => t.id === newTenantId)).toBe(false)
    expect(localDbStore.getTable('tenant_licenses').some(l => l.tenant_id === newTenantId)).toBe(false)
    expect(localDbStore.getTable('pos_balances').some(b => b.tenant_id === newTenantId)).toBe(false)
  })

  it('TC_05: deleteTenantCompletely should protect root demo tenant from deletion', () => {
    const result = deleteTenantCompletely(localDbStore, 'tenant_jb_enterprise')
    expect(result.success).toBe(false)
    expect(result.message).toContain('tidak dapat dihapus')
  })
})
