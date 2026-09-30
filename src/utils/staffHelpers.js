/**
 * staffHelpers.js
 * Utilitas integrasi dan sinkronisasi otomatis antara akun Staf terdaftar (profiles)
 * dan tabel Master Karyawan Kantor (karyawan_kantor).
 */

export const syncStaffToKaryawanKantor = ({
  staffProfiles = [],
  existingKaryawanKantor = [],
  defaultTenantId = 'tenant_jb_enterprise',
  defaultBranchId = 'branch_medan_01'
}) => {
  const existingMap = new Map()

  // Indeks karyawan kantor eksisting berdasarkan nama uppercase yang bersih
  existingKaryawanKantor.forEach((item) => {
    const key = (item.nama || '').trim().toUpperCase()
    if (key) {
      existingMap.set(key, item)
    }
  })

  const newRecordsToInsert = []
  const mergedList = [...existingKaryawanKantor]

  // Cek setiap profil staf yang terdaftar
  staffProfiles.forEach((profile) => {
    const pName = (profile.nama || '').trim().toUpperCase()
    if (!pName) return

    if (!existingMap.has(pName)) {
      const newRecord = {
        id: `kk_auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        nama: pName,
        role: profile.role || 'Kasir',
        email: profile.email || '',
        source: 'staff_registration',
        tenant_id: profile.tenant_id || defaultTenantId,
        branch_id: profile.branch_id || defaultBranchId,
        created_at: profile.created_at || new Date().toISOString()
      }

      existingMap.set(pName, newRecord)
      mergedList.push(newRecord)
      newRecordsToInsert.push(newRecord)
    } else {
      // Jika sudah ada tapi belum memiliki metadata role/email/source, perkaya data tampilan
      const existing = existingMap.get(pName)
      if (!existing.role && profile.role) {
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
