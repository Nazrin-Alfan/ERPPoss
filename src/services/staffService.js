/**
 * staffService.js - Tenant-reactive staff directory and carwash payroll queries.
 */

import { supabase } from '../supabaseClient'

function applyTenantFilter(query, tenantId) {
  if (tenantId && query && typeof query.eq === 'function') {
    return query.eq('tenant_id', tenantId)
  }
  return query
}

function applyOrder(query, col, opts) {
  if (query && typeof query.order === 'function') {
    return query.order(col, opts)
  }
  return query
}

export const staffService = {
  async fetchStaffDirectory({ tenantId = null } = {}) {
    const safeFetch = async (table, selectCols, orderCol, ascending = true) => {
      try {
        let q = supabase.from(table).select(selectCols)
        q = applyTenantFilter(q, tenantId)
        q = applyOrder(q, orderCol, { ascending })
        const { data, error } = await q
        if (error) return []
        return Array.isArray(data) ? data : []
      } catch {
        return []
      }
    }

    const [karyawanCuciList, karyawanKantorList, staffList, branchRows] = await Promise.all([
      safeFetch('karyawan_cuci', '*', 'nama', true),
      safeFetch('karyawan_kantor', '*', 'nama', true),
      safeFetch('profiles', '*', 'created_at', false),
      safeFetch('branches', 'id, nama, kode, is_active', 'created_at', true)
    ])

    let pocketOptions = []
    try {
      let pkQ = applyTenantFilter(supabase.from('v_pocket_balances').select('id, pos, label, tipe, is_active'), tenantId)
      let { data: pkData, error: pkErr } = await pkQ
      if (pkErr || !Array.isArray(pkData)) {
        const fbRes = await applyTenantFilter(supabase.from('pos_balances').select('id, pos, label, tipe, is_active'), tenantId)
        pkData = fbRes?.data
      }
      pocketOptions = (pkData || []).filter((p) => p.is_active !== false)
    } catch {
      pocketOptions = []
    }

    return {
      karyawanCuciList,
      karyawanKantorList,
      staffList,
      tenantBranches: branchRows.filter((b) => b.is_active !== false),
      pocketOptions
    }
  },

  async fetchCarwashWagesData({ tenantId = null, startDate, endDate } = {}) {
    let cwQ = applyTenantFilter(supabase.from('carwash').select('*'), tenantId)
    if (cwQ && typeof cwQ.neq === 'function') cwQ = cwQ.neq('status', 'Batal')
    if (startDate && cwQ && typeof cwQ.gte === 'function') cwQ = cwQ.gte('tanggal', startDate)
    if (endDate && cwQ && typeof cwQ.lte === 'function') cwQ = cwQ.lte('tanggal', endDate)
    const { data: cwData, error: cwErr } = await cwQ
    if (cwErr) throw cwErr

    let cfQ = applyTenantFilter(supabase.from('cashflow').select('*'), tenantId)
    if (startDate && cfQ && typeof cfQ.gte === 'function') cfQ = cfQ.gte('tanggal', startDate)
    if (endDate && cfQ && typeof cfQ.lte === 'function') cfQ = cfQ.lte('tanggal', endDate)
    const { data: cfData, error: cfErr } = await cfQ
    if (cfErr) throw cfErr

    let expQ = applyTenantFilter(supabase.from('pengeluaran').select('*'), tenantId)
    if (startDate && expQ && typeof expQ.gte === 'function') expQ = expQ.gte('tanggal', startDate)
    if (endDate && expQ && typeof expQ.lte === 'function') expQ = expQ.lte('tanggal', endDate)
    const { data: expData, error: expErr } = await expQ
    if (expErr) throw expErr

    return {
      carwashWagesList: Array.isArray(cwData) ? cwData : [],
      cashflowList: Array.isArray(cfData) ? cfData : [],
      pengeluaranList: Array.isArray(expData) ? expData : []
    }
  }
}

export default staffService
