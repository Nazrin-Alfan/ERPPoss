/**
 * financeService.js - Tenant-scoped finance custom options, pockets, and COA categories.
 */

import { supabase } from '../supabaseClient'
import { storageAdapter } from './storageAdapter'

const OPTION_KEYS = {
  jenis: 'finance_custom_jenis_list',
  kategori: 'finance_custom_kategori_list',
  income_jenis: 'finance_custom_income_jenis_list',
  income_kategori: 'finance_custom_income_kategori_list'
}

function cleanArray(val) {
  return Array.isArray(val) ? val : []
}

export const financeService = {
  getCustomFinanceOptions(tenantId) {
    return {
      customJenisList: cleanArray(storageAdapter.getJSON(tenantId, OPTION_KEYS.jenis, [])),
      customKategoriList: cleanArray(storageAdapter.getJSON(tenantId, OPTION_KEYS.kategori, [])),
      customIncomeJenisList: cleanArray(storageAdapter.getJSON(tenantId, OPTION_KEYS.income_jenis, [])),
      customIncomeKategoriList: cleanArray(storageAdapter.getJSON(tenantId, OPTION_KEYS.income_kategori, []))
    }
  },

  saveCustomFinanceOption(tenantId, type, val, defaults = [], normalizer = (v) => String(v || '').trim()) {
    const key = OPTION_KEYS[type]
    if (!key || !val || typeof val !== 'string' || !val.trim()) {
      return null
    }
    const norm = normalizer(val)
    if (!norm || defaults.some((d) => String(d).toLowerCase() === norm.toLowerCase())) {
      return null
    }
    const current = cleanArray(storageAdapter.getJSON(tenantId, key, []))
    if (current.some((p) => String(p).toLowerCase() === norm.toLowerCase())) {
      return current
    }
    const updated = [...current, norm]
    storageAdapter.setJSON(tenantId, key, updated)
    return updated
  },

  async fetchPocketBalances(tenantId = null) {
    let query = supabase.from('v_pocket_balances').select('id, pos, label, tipe, saldo, is_active')
    if (tenantId && query && typeof query.eq === 'function') {
      query = query.eq('tenant_id', tenantId)
    }
    const { data, error } = await query
    if (!error && Array.isArray(data)) {
      return data
    }
    let fb = supabase.from('pos_balances').select('id, pos, label, tipe, saldo, is_active')
    if (tenantId && fb && typeof fb.eq === 'function') {
      fb = fb.eq('tenant_id', tenantId)
    }
    const fbRes = await fb
    if (fbRes?.error) throw fbRes.error
    return Array.isArray(fbRes?.data) ? fbRes.data : []
  },

  async fetchMasterCategories(tenantId = null) {
    let query = supabase.from('master_categories').select('*')
    if (tenantId && query && typeof query.eq === 'function') {
      query = query.eq('tenant_id', tenantId)
    }
    if (query && typeof query.order === 'function') {
      query = query.order('nama_kategori', { ascending: true })
    }
    const { data, error } = await query
    if (error) throw error
    return Array.isArray(data) ? data : []
  }
}

export default financeService
