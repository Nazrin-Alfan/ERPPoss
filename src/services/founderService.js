/**
 * founderService.js
 * Domain Service layer untuk Solo Founder Mission Control (Platform God-Mode)
 * Mengelola metrik SaaS global, aktivasi/kill-switch lisensi, dan impersonasi tenant.
 */

import { generateSerialLicenseKey } from '../utils/superAdminHelpers'

// Nilai standar estimasi MRR per plan
const PLAN_PRICING = {
  ENTERPRISE: 499000,
  PRO_ANNUAL: 349000,
  PRO: 349000,
  BASIC: 199000,
  STARTER: 149000,
  TRIAL: 0
}

/**
 * Menghitung metrik global platform SaaS untuk Solo Founder
 */
export function calculateFounderPlatformMetrics({
  tenants = [],
  transactions = []
}) {
  const totalTenants = tenants.length
  const activeTenants = tenants.filter(t => t.is_active !== false && t.subscription_status !== 'SUSPENDED').length
  const suspendedTenants = totalTenants - activeTenants

  // GMV Platform (Total transaksi sukses dari seluruh tenant di sistem)
  const validTx = transactions.filter(t => t && t.status !== 'Batal' && t.status !== 'Void')
  const platformGMV = validTx.reduce((sum, t) => sum + (Number(t.total_biaya) || 0), 0)
  const totalPlatformTransactions = validTx.length

  // Estimasi MRR (Monthly Recurring Revenue) platform
  const estimatedMRR = tenants.reduce((sum, t) => {
    if (t.is_active === false || t.subscription_status === 'SUSPENDED') return sum
    const planKey = (t.plan || 'BASIC').toUpperCase()
    return sum + (PLAN_PRICING[planKey] || PLAN_PRICING.BASIC)
  }, 0)

  // Estimasi ARR (Annual Recurring Revenue)
  const estimatedARR = estimatedMRR * 12

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    platformGMV,
    totalPlatformTransactions,
    estimatedMRR,
    estimatedARR
  }
}

/**
 * Mengubah status langganan tenant (Aktivasi / Kill Switch Pembekuan Akun)
 */
export function toggleTenantSubscriptionStatus(tenant, makeActive = true) {
  if (!tenant) return null

  return {
    ...tenant,
    is_active: makeActive,
    subscription_status: makeActive ? 'ACTIVE' : 'SUSPENDED',
    updated_at: new Date().toISOString()
  }
}

/**
 * Memperpanjang masa aktif lisensi tenant
 */
export function generateLicenseRenewalPayload(tenant, addMonths = 12) {
  if (!tenant) return null

  const currentExpiry = tenant.license_expires_at ? new Date(tenant.license_expires_at) : new Date()
  const baseDate = currentExpiry.getTime() > Date.now() ? currentExpiry : new Date()

  const newExpiry = new Date(baseDate)
  newExpiry.setMonth(newExpiry.getMonth() + Number(addMonths))

  const newSerialKey = generateSerialLicenseKey(tenant.plan || 'PRO_ANNUAL', Math.ceil(addMonths / 12))

  return {
    ...tenant,
    license_expires_at: newExpiry.toISOString(),
    subscription_status: 'ACTIVE',
    is_active: true,
    serial_key: newSerialKey,
    updated_at: new Date().toISOString()
  }
}
