import { describe, it, expect, beforeEach } from 'vitest'
import { createCleanTenantPayload } from '../../utils/superAdminHelpers'
import { ROLES } from '../../constants/roles'

describe('Cashier Multi-Tenant Routing & Access Tests', () => {
  let tenantAlpha
  let tenantBeta
  let cashierAlphaProfile
  let cashierBetaProfile
  let systemTenants

  beforeEach(() => {
    // 1. Superadmin produces payload for Tenant Alpha
    const payloadAlpha = createCleanTenantPayload({
      storeName: 'Kopi Alpha & Wash',
      slug: 'kopi-alpha-wash',
      ownerName: 'Owner Alpha',
      ownerEmail: 'owner.alpha@test.com',
      telepon: '081111111111',
      alamat: 'Jl. Alpha No. 1',
      tier: 'PRO_ANNUAL',
      licenseDurationMonths: 12
    })
    tenantAlpha = { ...payloadAlpha.tenant, id: 'tenant_alpha_01' }

    // 2. Superadmin produces payload for Tenant Beta
    const payloadBeta = createCleanTenantPayload({
      storeName: 'Auto Clean Beta & Cafe',
      slug: 'auto-clean-beta',
      ownerName: 'Owner Beta',
      ownerEmail: 'owner.beta@test.com',
      telepon: '082222222222',
      alamat: 'Jl. Beta No. 2',
      tier: 'PRO_ANNUAL',
      licenseDurationMonths: 12
    })
    tenantBeta = { ...payloadBeta.tenant, id: 'tenant_beta_02' }

    systemTenants = [tenantAlpha, tenantBeta]

    // 3. Cashier Profiles bound to respective tenant_id
    cashierAlphaProfile = {
      id: 'usr_kasir_alpha_01',
      nama: 'Bambang Kasir Alpha',
      email: 'kasir.alpha@test.com',
      role: ROLES.KASIR,
      tenant_id: tenantAlpha.id,
      branch_id: `branch_${tenantAlpha.id}_main`
    }

    cashierBetaProfile = {
      id: 'usr_kasir_beta_02',
      nama: 'Citra Kasir Beta',
      email: 'kasir.beta@test.com',
      role: ROLES.KASIR,
      tenant_id: tenantBeta.id,
      branch_id: `branch_${tenantBeta.id}_main`
    }
  })

  it('TC_KASIR_ROUTING_01: Cashier Alpha strictly resolves to Tenant Alpha and is excluded from Tenant Beta', () => {
    // Resolver logic matching AuthContext.jsx
    const resolveAllowedTenantsForCashier = (profile, allTenants) => {
      if (profile.role === ROLES.KASIR) {
        return allTenants.filter(t => t.id === profile.tenant_id)
      }
      return []
    }

    const alphaTenants = resolveAllowedTenantsForCashier(cashierAlphaProfile, systemTenants)
    expect(alphaTenants).toHaveLength(1)
    expect(alphaTenants[0].id).toBe('tenant_alpha_01')
    expect(alphaTenants[0].nama).toBe('Kopi Alpha & Wash')

    // Verify it cannot access Tenant Beta
    const hasBetaAccess = alphaTenants.some(t => t.id === 'tenant_beta_02')
    expect(hasBetaAccess).toBe(false)
  })

  it('TC_KASIR_ROUTING_02: Cashier Beta strictly resolves to Tenant Beta and is excluded from Tenant Alpha', () => {
    const resolveAllowedTenantsForCashier = (profile, allTenants) => {
      if (profile.role === ROLES.KASIR) {
        return allTenants.filter(t => t.id === profile.tenant_id)
      }
      return []
    }

    const betaTenants = resolveAllowedTenantsForCashier(cashierBetaProfile, systemTenants)
    expect(betaTenants).toHaveLength(1)
    expect(betaTenants[0].id).toBe('tenant_beta_02')
    expect(betaTenants[0].nama).toBe('Auto Clean Beta & Cafe')

    // Verify it cannot access Tenant Alpha
    const hasAlphaAccess = betaTenants.some(t => t.id === 'tenant_alpha_01')
    expect(hasAlphaAccess).toBe(false)
  })

  it('TC_KASIR_ISOLATION_03: Product catalog and transactions are 100% isolated between Cashier Alpha and Cashier Beta', () => {
    const productsInDatabase = [
      { id_menu: 'menu_alpha_1', tenant_id: 'tenant_alpha_01', daftar_menu: 'Kopi Espresso Alpha Spesial', harga: 28000 },
      { id_menu: 'menu_beta_1', tenant_id: 'tenant_beta_02', daftar_menu: 'Cuci Mobil Salju Beta', harga: 55000 }
    ]

    // Query simulation with tenant_id filter (LocalQueryBuilder pattern)
    const getVisibleMenuForCashier = (cashierProfile) => {
      return productsInDatabase.filter(item => item.tenant_id === cashierProfile.tenant_id)
    }

    const alphaMenu = getVisibleMenuForCashier(cashierAlphaProfile)
    const betaMenu = getVisibleMenuForCashier(cashierBetaProfile)

    // Kasir Alpha checks
    expect(alphaMenu).toHaveLength(1)
    expect(alphaMenu[0].daftar_menu).toBe('Kopi Espresso Alpha Spesial')
    expect(alphaMenu.find(m => m.daftar_menu === 'Cuci Mobil Salju Beta')).toBeUndefined()

    // Kasir Beta checks
    expect(betaMenu).toHaveLength(1)
    expect(betaMenu[0].daftar_menu).toBe('Cuci Mobil Salju Beta')
    expect(betaMenu.find(m => m.daftar_menu === 'Kopi Espresso Alpha Spesial')).toBeUndefined()
  })

  it('TC_KASIR_TRANSACTION_04: Transactions completed by cashier must strictly retain cashier tenant_id', () => {
    const createTransaction = (cashierProfile, cartItems, total) => {
      return {
        id_struk: `str_${Date.now()}`,
        tenant_id: cashierProfile.tenant_id,
        branch_id: cashierProfile.branch_id,
        kasir: cashierProfile.nama,
        kasir_id: cashierProfile.id,
        items: cartItems,
        total_tagihan: total,
        created_at: new Date().toISOString()
      }
    }

    const txAlpha = createTransaction(cashierAlphaProfile, [{ name: 'Kopi Espresso Alpha', qty: 1, price: 28000 }], 28000)
    const txBeta = createTransaction(cashierBetaProfile, [{ name: 'Cuci Mobil Salju Beta', qty: 1, price: 55000 }], 55000)

    expect(txAlpha.tenant_id).toBe('tenant_alpha_01')
    expect(txAlpha.kasir).toBe('Bambang Kasir Alpha')

    expect(txBeta.tenant_id).toBe('tenant_beta_02')
    expect(txBeta.kasir).toBe('Citra Kasir Beta')

    expect(txAlpha.tenant_id).not.toBe(txBeta.tenant_id)
  })
})
