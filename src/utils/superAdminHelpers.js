/**
 * Super Admin (Solo Founder Platform Console) Helpers
 * Manages multi-tenant onboarding, serial license key generation,
 * tenant status overrides, and clean-slate tenant provisioning.
 */

import { DEFAULT_CARWASH_PACKAGES } from './carwashHelpers.js'
import { LICENSE_TIERS } from './licenseHelpers.js'

/**
 * Format Serial License Key: RLPOS-[TIER]-[YEAR]-[RAND4]-[CHECKSUM]
 * Contoh: RLPOS-PRO-2026-X89Z-441B
 */
export const generateSerialLicenseKey = (tierCode = 'PRO_ANNUAL', durationYears = 1) => {
  const currentYear = new Date().getFullYear()
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  
  let randomPart = ''
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  let checksumPart = ''
  for (let i = 0; i < 4; i++) {
    checksumPart += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  const prefix = tierCode.startsWith('PRO') ? 'PRO' : 'STD'
  return `RLPOS-${prefix}-${currentYear}-${randomPart}-${checksumPart}`
}

/**
 * Buat Tenant Baru Bersih (Zero-Transaction Clean State)
 */
export const createCleanTenantPayload = ({
  storeName,
  slug,
  ownerEmail,
  ownerName,
  telepon = '',
  alamat = '',
  tier = 'PRO_ANNUAL',
  licenseDurationMonths = 12,
  businessType = 'HYBRID'
}) => {
  const cleanSlug = (slug || storeName).toLowerCase().replace(/[^a-z0-9]/g, '_')
  const tenantId = `tenant_${cleanSlug}_${Math.random().toString(36).substring(2, 6)}`
  const branchId = `branch_${cleanSlug}_main`

  const now = new Date()
  const expiryDate = new Date(now)
  expiryDate.setMonth(expiryDate.getMonth() + (licenseDurationMonths || 12))

  const serialKey = generateSerialLicenseKey(tier, Math.ceil(licenseDurationMonths / 12))

  return {
    tenant: {
      id: tenantId,
      nama: storeName,
      slug: cleanSlug,
      business_type: businessType, // 'HYBRID' | 'CARWASH' | 'CAFE'
      plan: tier === 'PRO_ANNUAL' ? 'ENTERPRISE' : 'BASIC',
      status: 'ACTIVE',
      telepon,
      alamat,
      created_at: now.toISOString()
    },
    branch: {
      id: branchId,
      tenant_id: tenantId,
      nama: `Cabang Utama (${storeName})`,
      kode: 'HO-01',
      alamat: alamat || 'Alamat Toko',
      telepon: telepon || '0812-0000-0000',
      is_active: true,
      created_at: now.toISOString()
    },
    ownerProfile: {
      id: `usr_${cleanSlug}_owner`,
      tenant_id: tenantId,
      branch_id: branchId,
      nama: ownerName || 'Owner Toko',
      email: ownerEmail,
      role: 'Owner',
      created_at: now.toISOString()
    },
    license: {
      id: `lic_${tenantId}`,
      tenant_id: tenantId,
      license_key: serialKey,
      tier,
      tier_name: LICENSE_TIERS[tier]?.name || 'RelayPOS Pro Enterprise (Lisensi Tahunan)',
      status: 'ACTIVE',
      started_at: now.toISOString(),
      expires_at: expiryDate.toISOString(),
      max_branches: 3,
      max_devices: 10,
      notes: `Lisensi Resmi Diaktivasi oleh Super Admin untuk ${storeName}`,
      created_at: now.toISOString()
    },
    // Master data awal yang bersih
    initialBalances: [
      { id: `acc_${tenantId}_cash`, pos: 'SALDO CASH', label: 'Kas Laci Kasir', tipe: 'CASH', balance: 0, color: 'emerald', keterangan: 'Uang fisik di mesin kasir', is_active: true, tenant_id: tenantId, branch_id: branchId },
      { id: `acc_${tenantId}_reky`, pos: 'SALDO REKENING OPERASIONAL', label: 'Rekening Bank / QRIS', tipe: 'BANK', balance: 0, color: 'blue', keterangan: 'Rekening penerimaan utama & QRIS', is_active: true, tenant_id: tenantId, branch_id: branchId }
    ],
    initialPackages: (String(businessType || '').toUpperCase() === 'CAFE') 
      ? [] 
      : DEFAULT_CARWASH_PACKAGES.map((pkg, idx) => ({
          ...pkg,
          id: `pkg_${cleanSlug}_${idx + 1}`,
          sort_order: idx + 1,
          tenant_id: tenantId,
          branch_id: branchId
        }))
  }
}

/**
 * Filter tabel transaksi untuk mereset / menghapus transaksi demo
 * Menghapus: struk, carwash, cashflow, barang_masuk, barang_keluar, journal_entries
 * Mempertahankan: tenants, branches, profiles, chart_of_accounts, master_categories, carwash_packages, pos_balances, tenant_licenses
 */
export const purgeTransactionsForTenant = (dbInstance, targetTenantId) => {
  if (!dbInstance || !targetTenantId) return false

  const transactionTables = [
    'struk',
    'carwash',
    'cashflow',
    'barang_masuk',
    'barang_keluar',
    'journal_entries',
    'journal_entry_lines',
    'general_ledger',
    'audit_logs'
  ]

  transactionTables.forEach(tableName => {
    if (dbInstance.data && Array.isArray(dbInstance.data[tableName])) {
      dbInstance.data[tableName] = dbInstance.data[tableName].filter(
        item => item.tenant_id !== targetTenantId
      )
    }
  })

  // Reset saldo pos_balances kembali ke 0
  if (dbInstance.data && Array.isArray(dbInstance.data.pos_balances)) {
    dbInstance.data.pos_balances.forEach(pos => {
      if (pos.tenant_id === targetTenantId) {
        pos.balance = 0
      }
    })
  }

  if (typeof dbInstance.saveToStorage === 'function') {
    dbInstance.saveToStorage()
  }

  return true
}

/**
 * Hapus Tenant dan Seluruh Entitas Terkait Secara Total (Full Deletion)
 * Proteksi: Root tenant default 'tenant_jb_enterprise' tidak boleh dihapus.
 */
export const deleteTenantCompletely = (dbInstance, targetTenantId) => {
  if (!dbInstance || !targetTenantId) return { success: false, message: 'Database atau Tenant ID tidak valid.' }

  if (targetTenantId === 'tenant_jb_enterprise') {
    return {
      success: false,
      message: 'Tenant Bawaan Sistem (Demo Utama) dikunci dan tidak dapat dihapus.'
    }
  }

  // Seluruh tabel yang memuat kolom tenant_id
  const allTables = [
    'tenants',
    'branches',
    'profiles',
    'tenant_licenses',
    'pos_balances',
    'carwash_packages',
    'chart_of_accounts',
    'master_categories',
    'stok_barang',
    'daftar_harga_menu',
    'resep',
    'diskon',
    'karyawan_cuci',
    'karyawan_kantor',
    'struk',
    'cafe',
    'carwash',
    'cashflow',
    'barang_masuk',
    'barang_keluar',
    'journal_entries',
    'journal_entry_lines',
    'general_ledger',
    'audit_logs'
  ]

  allTables.forEach(tableName => {
    if (dbInstance.data && Array.isArray(dbInstance.data[tableName])) {
      dbInstance.data[tableName] = dbInstance.data[tableName].filter(
        item => item.tenant_id !== targetTenantId && item.id !== targetTenantId
      )
    }
  })

  if (typeof dbInstance.saveToStorage === 'function') {
    dbInstance.saveToStorage()
  }

  return { success: true, message: 'Tenant dan seluruh datanya berhasil dihapus permanen.' }
}
