import { describe, it, expect } from 'vitest'
import {
  evaluateLicenseStatus,
  buildWhatsAppRenewalLink,
  LICENSE_TIERS,
  GRACE_PERIOD_DAYS
} from '../licenseHelpers.js'

describe('licenseHelpers', () => {
  it('TC_01: should return ACTIVE when expiry date is in the future', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 30) // 30 days from now

    const result = evaluateLicenseStatus({
      expires_at: futureDate.toISOString()
    })

    expect(result.status).toBe('ACTIVE')
    expect(result.isActive).toBe(true)
    expect(result.isExpired).toBe(false)
    expect(result.daysRemaining).toBe(30)
  })

  it('TC_02: should return GRACE_PERIOD when expired within 7 days', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 3) // Expired 3 days ago

    const result = evaluateLicenseStatus({
      expires_at: pastDate.toISOString()
    })

    expect(result.status).toBe('GRACE_PERIOD')
    expect(result.isActive).toBe(true) // Operational during grace period
    expect(result.isGracePeriod).toBe(true)
    expect(result.isExpired).toBe(false)
    expect(result.graceDaysRemaining).toBe(4) // 7 - 3 = 4 days left
  })

  it('TC_03: should return EXPIRED when past grace period', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 10) // Expired 10 days ago

    const result = evaluateLicenseStatus({
      expires_at: pastDate.toISOString()
    })

    expect(result.status).toBe('EXPIRED')
    expect(result.isActive).toBe(false)
    expect(result.isExpired).toBe(true)
  })

  it('TC_04: should return DEMO_TRIAL when license data is missing or empty', () => {
    const result = evaluateLicenseStatus(null)
    expect(result.status).toBe('DEMO_TRIAL')
    expect(result.isActive).toBe(true)
  })

  it('TC_05: should generate valid WhatsApp renewal link with prefilled order details', () => {
    const link = buildWhatsAppRenewalLink({
      developerPhone: '0812-9988-7766',
      tenantName: 'Barokah Carwash & Coffee',
      tenantId: 'tenant_barokah_01',
      planCode: 'PRO_ANNUAL',
      currentExpiry: '2026-12-31'
    })

    expect(link).toContain('https://wa.me/6281299887766')
    expect(link).toContain(encodeURIComponent('Barokah Carwash & Coffee'))
    expect(link).toContain(encodeURIComponent('RelayPOS Pro Enterprise'))
  })
})
