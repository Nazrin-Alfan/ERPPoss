/**
 * consolidationService.js
 * Domain Service layer untuk agregasi data finansial multi-tenant eksekutif (Owner view)
 * Dilengkapi pertahanan RBAC Fail-Safe (Zero-Trust Data Protection).
 */
import { ROLES, isOwnerOrSuperAdmin } from '../constants/roles.js'

/**
 * Filter transaksi valid (mengecualikan transaksi Batal / Void / Pending)
 */
export function getValidTransactions(transactions = []) {
  return transactions.filter(t => {
    if (!t) return false
    const st = String(t.status_bayar || t.status || '').trim().toLowerCase()
    return st !== 'batal' && st !== 'void' && st !== 'cancelled' && st !== 'pending'
  })
}

export function getTransactionRevenue(t) {
  if (!t) return 0
  return (
    Number(t.total_tagihan) ||
    Number(t.total_biaya) ||
    Number(t.total_bayar) ||
    Number(t.total_harga) ||
    Number(t.nominal_bayar) ||
    Number(t.total) ||
    0
  )
}

/**
 * Validasi otorisasi peran (Hanya Owner & Super Admin)
 */
export function isExecutiveAuthorized(userRole) {
  return isOwnerOrSuperAdmin(userRole)
}

/**
 * Filter daftar tenant yang boleh diakses oleh Owner/Super Admin tanpa bergantung
 * pada kolom `owner_email` (yang tidak tersedia di skema Postgres Cloud).
 */
export function filterOwnerAccessibleTenants({
  tenants = [],
  profile = null,
  membershipTenantIds = new Set(),
  trustRlsResult = false,
} = {}) {
  const list = Array.isArray(tenants) ? tenants : []
  const role = profile?.role
  if (role === ROLES.SUPER_ADMIN) return list

  const userTenantId = profile?.tenant_id || null
  const profileEmail = (profile?.email || '').toLowerCase().trim()
  const memberSet =
    membershipTenantIds instanceof Set
      ? membershipTenantIds
      : new Set(Array.isArray(membershipTenantIds) ? membershipTenantIds : [])

  const matched = list.filter((t) => {
    if (!t?.id) return false
    if (userTenantId && t.id === userTenantId) return true
    if (memberSet.has(t.id)) return true
    return Boolean(profileEmail && t.owner_email && t.owner_email.toLowerCase().trim() === profileEmail)
  })

  if (matched.length > 0) return matched
  return trustRlsResult ? list : []
}

/**
 * Filter baris data berdasarkan daftar tenant yang diizinkan (tanpa bypass saat kosong).
 */
export function filterTenantScopedRecords(records = [], allowedTenantIds = new Set()) {
  if (!Array.isArray(records) || !(allowedTenantIds instanceof Set) || allowedTenantIds.size === 0) {
    return []
  }
  return records.filter((item) => item && allowedTenantIds.has(item.tenant_id))
}

/**
 * Menghitung ringkasan metrik konsolidasi eksekutif seluruh outlet
 */
export function calculateConsolidatedMetrics({
  userRole = ROLES.OWNER,
  tenants = [],
  transactions = [],
  expenses = [],
  cashAccounts = []
}) {
  // Lapis Pertahanan Data: Jika bukan Owner / Super Admin, tolak total (Return Kosong)
  if (!isExecutiveAuthorized(userRole)) {
    return {
      isAuthorized: false,
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      netMarginPercentage: 0,
      totalCashBalance: 0,
      totalTransactionsCount: 0,
      totalOutlets: 0
    }
  }

  const tenantIdSet = new Set(tenants.map(t => t.id))

  // Transaksi valid yang termasuk dalam tenant milik owner
  const validTx = getValidTransactions(transactions).filter(t => tenantIdSet.has(t.tenant_id))
  const totalRevenue = validTx.reduce((sum, t) => sum + getTransactionRevenue(t), 0)
  const totalTransactionsCount = validTx.length

  // Total pengeluaran operasional
  const validExpenses = expenses.filter(e => tenantIdSet.has(e.tenant_id))
  const totalExpenses = validExpenses.reduce((sum, e) => sum + (Number(e.jumlah) || 0), 0)

  // Net Profit & Margin
  const netProfit = totalRevenue - totalExpenses
  const netMarginPercentage = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

  // Total Kas & Bank aktif
  const validAccounts = cashAccounts.filter(a => tenantIdSet.has(a.tenant_id))
  const totalCashBalance = validAccounts.reduce((sum, a) => sum + (Number(a.saldo) || 0), 0)

  return {
    isAuthorized: true,
    totalRevenue,
    totalExpenses,
    netProfit,
    netMarginPercentage,
    totalCashBalance,
    totalTransactionsCount,
    totalOutlets: tenants.length
  }
}

/**
 * Membedah performa masing-masing outlet untuk tabel perbandingan side-by-side
 */
export function calculateOutletBreakdown({
  userRole = 'Owner',
  tenants = [],
  transactions = [],
  expenses = [],
  cashAccounts = []
}) {
  // Lapis Pertahanan Data: Jika bukan Owner / Super Admin, kembalikan array kosong
  if (!isExecutiveAuthorized(userRole)) {
    return []
  }

  const validTx = getValidTransactions(transactions)

  return tenants.map(tenant => {
    // Filter per tenant
    const tTx = validTx.filter(t => t.tenant_id === tenant.id)
    const revenue = tTx.reduce((sum, t) => sum + getTransactionRevenue(t), 0)
    const transactionCount = tTx.length

    const tExpenses = expenses.filter(e => e.tenant_id === tenant.id)
    const totalExp = tExpenses.reduce((sum, e) => sum + (Number(e.jumlah) || 0), 0)

    const netProfit = revenue - totalExp
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0

    const tAccounts = cashAccounts.filter(a => a.tenant_id === tenant.id)
    const cashBalance = tAccounts.reduce((sum, a) => sum + (Number(a.saldo) || 0), 0)

    // Status performa kualitatif
    let healthStatus = 'STABLE'
    let healthLabel = 'Stabil'
    let healthColor = 'bg-primary-soft text-primary-soft-foreground border-primary/30'

    if (revenue > 0 && margin >= 30) {
      healthStatus = 'EXCELLENT'
      healthLabel = 'Sangat Profit'
      healthColor = 'bg-success-bg text-success border-success/30'
    } else if (revenue > 0 && netProfit < 0) {
      healthStatus = 'DEFICIT'
      healthLabel = 'Defisit'
      healthColor = 'bg-destructive-bg text-destructive border-destructive/30'
    } else if (revenue === 0) {
      healthStatus = 'INACTIVE'
      healthLabel = 'Belum Ada Penjualan'
      healthColor = 'bg-subsurface text-muted border-border'
    }

    return {
      tenantId: tenant.id,
      tenantName: tenant.nama,
      businessType: tenant.business_type || 'HYBRID',
      revenue,
      expenses: totalExp,
      netProfit,
      marginPercentage: margin,
      cashBalance,
      transactionCount,
      healthStatus,
      healthLabel,
      healthColor
    }
  })
}

/**
 * Menghitung persentase kontribusi omzet per outlet
 */
export function calculateRevenueContribution({
  userRole = 'Owner',
  tenants = [],
  transactions = []
}) {
  if (!isExecutiveAuthorized(userRole)) {
    return []
  }

  const validTx = getValidTransactions(transactions)
  const tenantIdSet = new Set(tenants.map(t => t.id))
  const relevantTx = validTx.filter(t => tenantIdSet.has(t.tenant_id))

  const totalRev = relevantTx.reduce((sum, t) => sum + getTransactionRevenue(t), 0)

  return tenants.map(tenant => {
    const tTx = relevantTx.filter(t => t.tenant_id === tenant.id)
    const rev = tTx.reduce((sum, t) => sum + getTransactionRevenue(t), 0)
    const pct = totalRev > 0 ? (rev / totalRev) * 100 : 0

    return {
      tenantId: tenant.id,
      tenantName: tenant.nama,
      revenue: rev,
      percentage: pct
    }
  }).sort((a, b) => b.revenue - a.revenue)
}
