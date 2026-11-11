/**
 * staffHelpers.js
 * Utilitas integrasi dan sinkronisasi otomatis antara akun Staf terdaftar (profiles)
 * dan tabel Master Karyawan Kantor (karyawan_kantor).
 */
import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../constants/erpConfig.js'
import { ROLES } from '../constants/roles.js'

// Construct calendar boundaries directly: setMonth on the 31st can overflow
// into the month after the intended cut-off (for example Oct 31 -> Dec 1).
export function getPayrollPeriod(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const startsThisMonth = date.getDate() >= 16
  const formatLocalDate = value => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
  return {
    start: formatLocalDate(new Date(year, month - (startsThisMonth ? 0 : 1), 16)),
    end: formatLocalDate(new Date(year, month + (startsThisMonth ? 1 : 0), 15)),
  }
}

export const DEFAULT_COMMISSION_CONFIG = {
  washShareDivisor: 3, // Bagi 3 untuk pencucian dasar
  packageShareDivisor: 2, // Bagi 2 untuk paket tambahan
  roundingUnit: 1000,
}

/**
 * Menghitung bagi hasil komisi staf pencucian mobil
 */
export function calculateCarwashWorkerWage({
  hargaCuci = 0,
  hargaPaket = 0,
  isSplit = false,
  config = DEFAULT_COMMISSION_CONFIG
}) {
  const { washShareDivisor = 3, packageShareDivisor = 2, roundingUnit = 1000 } = config

  const splitFactor = isSplit ? 2 : 1
  const washWagePerPerson = Math.floor((hargaCuci / washShareDivisor / splitFactor) / roundingUnit) * roundingUnit
  const packageWagePerPerson = hargaPaket > 0
    ? Math.floor((hargaPaket / packageShareDivisor / splitFactor) / roundingUnit) * roundingUnit
    : 0

  return {
    washWagePerPerson,
    packageWagePerPerson,
    totalSharePerPerson: washWagePerPerson + packageWagePerPerson
  }
}

export const isValidUUID = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val)

/**
 * Menampilkan username login staf secara bersih tanpa domain internal (@pos.internal / @jb.local)
 */
export const formatStaffLoginHandle = (email = '') => {
  const clean = String(email || '').trim()
  if (!clean) return '-'
  const lower = clean.toLowerCase()
  if (lower.endsWith('@pos.internal')) {
    const localPart = clean.split('@')[0]
    return localPart.split('.')[0] || localPart
  }
  if (lower.endsWith('@jb.local')) {
    return clean.split('@')[0]
  }
  return clean
}

export const syncStaffToKaryawanKantor = ({
  staffProfiles = [],
  existingKaryawanKantor = [],
  defaultTenantId = DEFAULT_TENANT_ID,
  defaultBranchId = DEFAULT_BRANCH_ID
}) => {
  const existingMap = new Map()
  const deactivatedNames = new Set()

  // Indeks karyawan kantor eksisting berdasarkan nama uppercase yang bersih
  existingKaryawanKantor.forEach((item) => {
    const key = (item.nama || '').trim().toUpperCase()
    if (!key) return
    const isInactive = item.is_active === false || String(item.status || '').toLowerCase() === 'nonaktif'
    if (isInactive) {
      deactivatedNames.add(key)
      return
    }
    existingMap.set(key, item)
  })

  const newRecordsToInsert = []
  const mergedList = existingKaryawanKantor.filter(
    (item) => item.is_active !== false && String(item.status || '').toLowerCase() !== 'nonaktif'
  )

  // Cek setiap profil staf yang terdaftar (hanya yang aktif)
  staffProfiles.forEach((profile) => {
    if (profile.is_active === false) return
    const pName = (profile.nama || '').trim().toUpperCase()
    if (!pName || deactivatedNames.has(pName)) return

    if (!existingMap.has(pName)) {
      const generatedId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-' + Math.random().toString(16).substring(2, 14).padEnd(12, '0')
      const newRecord = {
        id: generatedId,
        id_karyawan: `kk_auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        nama: pName,
        role: profile.role || 'Kasir',
        email: profile.email || '',
        source: 'staff_registration',
        is_active: true,
        status: 'Aktif',
        tenant_id: profile.tenant_id || defaultTenantId,
        branch_id: profile.branch_id || defaultBranchId,
        created_at: profile.created_at || new Date().toISOString()
      }

      existingMap.set(pName, newRecord)
      mergedList.push(newRecord)
      newRecordsToInsert.push(newRecord)
    } else {
      // Sinkronkan role & email tampilan dengan profil terbaru
      const existing = existingMap.get(pName)
      if (profile.role) {
        existing.role = profile.role
      }
      if (!existing.email && profile.email) {
        existing.email = profile.email
      }
      if (!existing.source) {
        existing.source = 'staff_registration'
      }
    }
  })

  // Urutkan alfabetis berdasarkan nama
  mergedList.sort((a, b) => (a.nama || '').localeCompare(b.nama || ''))

  return {
    mergedList,
    newRecordsToInsert
  }
}

/**
 * Format konfigurasi badge visual peran hak akses staf
 */
export const getRoleBadgeConfig = (role = '') => {
  const normalized = (role || '').trim().toLowerCase()
  if (normalized === 'owner') {
    return {
      label: 'Owner',
      bgClass: 'bg-brand-blue/15 text-brand-blue border-brand-blue/30',
      dotClass: 'bg-brand-blue'
    }
  }
  if (normalized === 'kasir') {
    return {
      label: 'Kasir',
      bgClass: 'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30',
      dotClass: 'bg-brand-emerald'
    }
  }
  if (normalized === 'admin') {
    return {
      label: 'Admin',
      bgClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      dotClass: 'bg-purple-400'
    }
  }
  return {
    label: role || 'Staff Kantor',
    bgClass: 'bg-slate-800 text-slate-300 border-slate-700',
    dotClass: 'bg-slate-400'
  }
}
