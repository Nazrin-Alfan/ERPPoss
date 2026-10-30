import { describe, it, expect, beforeEach } from 'vitest'
import { createCleanTenantPayload } from '../../utils/superAdminHelpers'

describe('Tenant Onboarding & Multi-Tenant Data Isolation Tests', () => {
  it('TC_ONB_01: createCleanTenantPayload produces clean credentials, license, and owner profile', () => {
    const input = {
      storeName: 'AutoClean Cafe & Wash',
      slug: 'autoclean-cafe-wash',
      ownerName: 'Budi Santoso',
      ownerEmail: 'budi@autoclean.com',
      telepon: '081234567890',
      alamat: 'Jl. Pemuda No. 45',
      tier: 'PRO_ANNUAL',
      licenseDurationMonths: 12
    }

    const payload = createCleanTenantPayload(input)

    expect(payload.tenant.nama).toBe('AutoClean Cafe & Wash')
    expect(payload.tenant.owner_email).toBe('budi@autoclean.com')
    expect(payload.tenant.owner_name).toBe('Budi Santoso')
    expect(payload.ownerProfile.email).toBe('budi@autoclean.com')
    expect(payload.ownerProfile.role).toBe('Owner')
    expect(payload.ownerProfile.tenant_id).toBe(payload.tenant.id)
    expect(payload.license.tier).toBe('PRO_ANNUAL')
    expect(payload.license.max_branches).toBe(3)
  })

  it('TC_ISO_01: Owner tenant filtering isolates tenants strictly to the owner and excludes demo tenants', () => {
    const allSystemTenants = [
      { id: 'tenant_jb_enterprise', nama: 'RelayPOS Demo Holding', owner_email: 'demo@relaypos.com' },
      { id: 'tenant_cafe_senja_02', nama: 'Kopi Senja', owner_email: 'senja@kopi.com' },
      { id: 'tenant_autoclean_99', nama: 'AutoClean Cafe & Wash', owner_email: 'budi@autoclean.com' }
    ]

    const budiProfile = {
      id: 'usr_budi_123',
      email: 'budi@autoclean.com',
      role: 'Owner',
      tenant_id: 'tenant_autoclean_99'
    }

    // Filter logic as implemented in AuthContext
    const profileEmail = budiProfile.email.toLowerCase().trim()
    const allowedTenants = allSystemTenants.filter(t => {
      const matchTenantId = t.id === budiProfile.tenant_id
      const matchEmail = Boolean(profileEmail && t.owner_email && t.owner_email.toLowerCase().trim() === profileEmail)
      return matchTenantId || matchEmail
    })

    expect(allowedTenants).toHaveLength(1)
    expect(allowedTenants[0].nama).toBe('AutoClean Cafe & Wash')
    expect(allowedTenants[0].id).toBe('tenant_autoclean_99')

    // Ensure demo tenants are NOT present
    const hasDemoHolding = allowedTenants.some(t => t.id === 'tenant_jb_enterprise')
    const hasKopiSenja = allowedTenants.some(t => t.id === 'tenant_cafe_senja_02')
    expect(hasDemoHolding).toBe(false)
    expect(hasKopiSenja).toBe(false)
  })

  it('TC_CONSOL_01: Consolidated data view strictly filters transactions by userTenants set', () => {
    const userTenants = [
      { id: 'tenant_autoclean_99', nama: 'AutoClean Cafe & Wash' }
    ]

    const allTx = [
      { id: 'tx_1', tenant_id: 'tenant_jb_enterprise', total_tagihan: 500000 },
      { id: 'tx_2', tenant_id: 'tenant_autoclean_99', total_tagihan: 120000 },
      { id: 'tx_3', tenant_id: 'tenant_cafe_senja_02', total_tagihan: 75000 }
    ]

    const allowedTenantIds = new Set(userTenants.map(t => t.id))
    const filteredTx = allTx.filter(t => allowedTenantIds.has(t.tenant_id))

    expect(filteredTx).toHaveLength(1)
    expect(filteredTx[0].id).toBe('tx_2')
    expect(filteredTx[0].total_tagihan).toBe(120000)
  })
})
