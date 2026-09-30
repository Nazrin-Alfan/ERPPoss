/**
 * consolidationService.js
 * Domain Service layer untuk agregasi data finansial multi-tenant eksekutif (Owner view)
 * Dilengkapi pertahanan RBAC Fail-Safe (Zero-Trust Data Protection).
 */

/**
 * Filter transaksi valid (mengecualikan transaksi Batal / Void)
 */
export function getValidTransactions(transactions = []) {
  return transactions.filter(t => t && t.status !== 'Batal' && t.status !== 'Void')
}

/**
 * Validasi otorisasi peran (Hanya Owner & Super Admin)
 */
export function isExecutiveAuthorized(userRole) {
  return userRole === 'Owner' || userRole === 'Super Admin'
}

/**
 * Menghitung ringkasan metrik konsolidasi eksekutif seluruh outlet
 */
export function calculateConsolidatedMetrics({
  userRole = 'Owner',
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
  const totalRevenue = validTx.reduce((sum, t) => sum + (Number(t.total_biaya) || 0), 0)
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
    const revenue = tTx.reduce((sum, t) => sum + (Number(t.total_biaya) || 0), 0)
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
    let healthColor = 'text-blue-400 bg-blue-500/10 border-blue-500/30'

    if (revenue > 0 && margin >= 30) {
      healthStatus = 'EXCELLENT'
      healthLabel = 'Sangat Profit'
      healthColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
    } else if (revenue > 0 && netProfit < 0) {
      healthStatus = 'DEFICIT'
      healthLabel = 'Defisit'
      healthColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30'
    } else if (revenue === 0) {
      healthStatus = 'INACTIVE'
      healthLabel = 'Belum Ada Penjualan'
      healthColor = 'text-slate-400 bg-slate-800 border-slate-700'
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

  const totalRev = relevantTx.reduce((sum, t) => sum + (Number(t.total_biaya) || 0), 0)

  return tenants.map(tenant => {
    const tTx = relevantTx.filter(t => t.tenant_id === tenant.id)
    const rev = tTx.reduce((sum, t) => sum + (Number(t.total_biaya) || 0), 0)
    const pct = totalRev > 0 ? (rev / totalRev) * 100 : 0

    return {
      tenantId: tenant.id,
      tenantName: tenant.nama,
      revenue: rev,
      percentage: pct
    }
  }).sort((a, b) => b.revenue - a.revenue)
}
