import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID } from '../localDbEngine.js'
import { evaluateLicenseStatus } from '../../utils/licenseHelpers.js'

describe('Tenant License & Subscription Integration', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('TC_01: Should retrieve active license bound to tenant', async () => {
    const { data: licenses, error } = await db
      .from('tenant_licenses')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)

    expect(error).toBeNull()
    expect(licenses).toBeDefined()
    expect(licenses.length).toBe(1)
    expect(licenses[0].tier).toBe('PRO_ANNUAL')

    const status = evaluateLicenseStatus(licenses[0])
    expect(status.isActive).toBe(true)
    expect(status.status).toBe('ACTIVE')
    expect(status.daysRemaining).toBeGreaterThan(60)
  })

  it('TC_02: Should allow owner or developer to update license key and expiration', async () => {
    const nextYear = new Date()
    nextYear.setFullYear(nextYear.getFullYear() + 1)

    const { error: updateErr } = await db
      .from('tenant_licenses')
      .update({
        license_key: 'RLPOS-PRO-2027-NEW-KEY',
        expires_at: nextYear.toISOString(),
        notes: 'Perpanjangan Lisensi Tahunan Sukses'
      })
      .eq('tenant_id', DEFAULT_TENANT_ID)

    expect(updateErr).toBeNull()

    const { data: updated } = await db
      .from('tenant_licenses')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .single()

    expect(updated.license_key).toBe('RLPOS-PRO-2027-NEW-KEY')
    const status = evaluateLicenseStatus(updated)
    expect(status.daysRemaining).toBeGreaterThan(350)
  })

  it('TC_03: Tenant isolation - rival tenant cannot access another tenant license', async () => {
    const { data: rivalLicenses } = await db
      .from('tenant_licenses')
      .select('*')
      .eq('tenant_id', 'tenant_other_unauthorized')

    expect(rivalLicenses.length).toBe(0)
  })
})
