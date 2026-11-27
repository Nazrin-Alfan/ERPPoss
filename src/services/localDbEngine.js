/**
 * Local Database Engine for SaaS ERP
 * Zero cloud dependency - 100% offline & persistent (localStorage/Memory).
 * Includes Multi-Tenant isolation, Chart of Accounts (Double-Entry Ledger),
 * Inventory Valuation, Auto-triggers, and Supabase-compatible Query Builder.
 */

import realSeedData from './syntheticSeedData.json' with { type: 'json' }
import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../constants/erpConfig.js'
import { GeneralLedgerService, calculateMovingAverageCost } from './generalLedgerService.js'
import { DEFAULT_CARWASH_PACKAGES, calculateCarwashPriceAndCommission } from '../utils/carwashHelpers.js'
import { resolveAccountForPaymentMethod } from '../constants/transactionConstants.js'
import { normalizeEmailIdentity } from './mandiriEmailParser.js'
import { DEMO_MOCK_SEED_VERSION, applyDevMockSeedData } from './demoMockSeed.js'

const isBrowserDevSandbox = () =>
  Boolean(typeof window !== 'undefined' && import.meta.env?.DEV && import.meta.env?.MODE !== 'test')

const POSTGRES_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Check whether a value conforms to strict RFC 4122 PostgreSQL UUID syntax. */
export const isValidPostgresUuid = (val) =>
  typeof val === 'string' && POSTGRES_UUID_REGEX.test(val)

/** Generate a RFC 4122 v4 UUID compatible with PostgreSQL `uuid` columns. */
export const generateLocalUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const POSTGRES_UUID_PK_TABLES = new Set([
  'carwash_packages',
  'daftar_harga_menu',
  'stok_barang',
  'resep',
  'pengeluaran',
  'barang_masuk',
  'bank_email_connections',
  'bank_account_bindings',
  'bank_email_messages',
  'bank_transaction_drafts',
])

/** Exact live Supabase column whitelists per table for strict parity checks. */
export const POSTGRES_SCHEMA_COLUMNS = {
  pengeluaran: new Set([
    'id', 'tenant_id', 'branch_id', 'id_cashflow', 'tanggal', 'jam',
    'nama_pengeluaran', 'jenis', 'kategori', 'nominal', 'id_bahan_baku',
    'karyawan_id', 'qty', 'apakah_stok', 'created_at', 'pos', 'id_pengeluaran', 'no',
  ]),
  barang_masuk: new Set([
    'id', 'tenant_id', 'branch_id', 'id_bahan_baku', 'tanggal',
    'nama_bahan_baku', 'jumlah_masuk', 'harga_beli', 'total_biaya',
    'created_at', 'id_barang', 'nama_barang', 'harga_satuan',
    'total_harga', 'id_masuk', 'id_pengeluaran', 'id_cashflow', 'nama_produk',
  ]),
  carwash_packages: new Set([
    'id', 'tenant_id', 'branch_id', 'name', 'price', 'description',
    'sort_order', 'is_active', 'created_at', 'nama_paket', 'tarif',
    'komisi_skema', 'komisi_value', 'commission_amount', 'komisi',
    'keterangan', 'tarif_matrix',
  ]),
  daftar_harga_menu: new Set([
    'id', 'tenant_id', 'branch_id', 'daftar_menu', 'harga', 'kategori',
    'deskripsi', 'foto_url', 'is_bundling', 'is_active', 'updated_at',
    'id_menu', 'nama_item', 'nama_menu', 'nama',
  ]),
  stok_barang: new Set([
    'id', 'tenant_id', 'branch_id', 'nama_produk', 'satuan', 'stok',
    'harga_satuan', 'min_stok', 'updated_at', 'nama_barang', 'kategori',
    'gudang', 'harga_beli', 'harga_jual', 'id_bahan_baku', 'id_barang',
    'stok_akhir', 'sub_kategori', 'keterangan', 'is_active', 'icon',
    'emoji', 'foto_url',
  ]),
  resep: new Set([
    'id', 'tenant_id', 'id_menu', 'id_bahan_baku', 'nama_menu',
    'nama_bahan', 'jumlah', 'satuan', 'created_at', 'id_resep',
    'jumlah_dibutuhkan', 'daftar_menu', 'nama_bahan_baku', 'jumlah_pemakaian',
    'stok_barang_id', 'menu_id', 'carwash_package_id',
  ]),
}

const buildDefaultTarifMatrix = (basePrice) => ({
  Small: { Regular: basePrice, 'Body only': Math.max(0, basePrice - 15000) },
  Medium: { Regular: basePrice + 5000, 'Body only': Math.max(0, basePrice - 10000) },
  Large: { Regular: basePrice + 10000, 'Body only': Math.max(0, basePrice - 5000) },
  'Extra Large': { Regular: basePrice + 30000, 'Body only': basePrice + 30000 },
})

const deriveAutoStockSku = (stockName, gudang, idx) => {
  const upper = String(stockName || '').toUpperCase()
  const pad2 = String(idx).padStart(2, '0')
  const pad3 = String(idx).padStart(3, '0')
  if (upper.includes('KOPI')) return `BB-KOPI-${pad2}`
  if (upper.includes('SUSU')) return `BB-SUSU-${pad2}`
  if (upper.includes('SHAMPOO') || upper.includes('SAMPO')) return `BB-SHM-${pad2}`
  if (gudang === 'CARWASH') return `CW-${pad3}`
  if (gudang === 'MERCHANDISE') return `MRC-${pad3}`
  return `BB-${pad3}`
}

const STARTER_STOCK_TEMPLATES = [
  { sku: 'BB-KOPI', nama: 'Biji Kopi House Blend', satuan: 'kg', stok: 100, harga: 150000, minStok: 5, gudang: 'CAFE' },
  { sku: 'BB-SUSU', nama: 'Susu Segar UHT', satuan: 'liter', stok: 100, harga: 22000, minStok: 10, gudang: 'CAFE' },
  { sku: 'BB-ROTI', nama: 'Roti Tawar Tebal', satuan: 'porsi', stok: 100, harga: 5000, minStok: 10, gudang: 'CAFE' },
  { sku: 'BB-KENTANG', nama: 'Kentang Shoestring', satuan: 'kg', stok: 50, harga: 32000, minStok: 5, gudang: 'CAFE' },
  { sku: 'BB-SHM', nama: 'Shampoo Carwash Touchless', satuan: 'liter', stok: 200, harga: 35000, minStok: 20, gudang: 'CARWASH' },
]

const STARTER_CAFE_MENUS = [
  { nama: 'Kopi Susu Aren', harga: 18000, kategori: 'Kopi' },
  { nama: 'Americano Dingin', harga: 15000, kategori: 'Kopi' },
  { nama: 'Roti Bakar Cokelat', harga: 15000, kategori: 'Makanan' },
  { nama: 'Kentang Goreng Crispy', harga: 16000, kategori: 'Snack' },
]

const STARTER_CAFE_RECIPES = [
  { menu: 'Kopi Susu Aren', sku: 'BB-KOPI', bahan: 'Biji Kopi House Blend', jumlah: 0.02, satuan: 'kg' },
  { menu: 'Kopi Susu Aren', sku: 'BB-SUSU', bahan: 'Susu Segar UHT', jumlah: 0.15, satuan: 'liter' },
  { menu: 'Americano Dingin', sku: 'BB-KOPI', bahan: 'Biji Kopi House Blend', jumlah: 0.02, satuan: 'kg' },
  { menu: 'Roti Bakar Cokelat', sku: 'BB-ROTI', bahan: 'Roti Tawar Tebal', jumlah: 1, satuan: 'porsi' },
  { menu: 'Kentang Goreng Crispy', sku: 'BB-KENTANG', bahan: 'Kentang Shoestring', jumlah: 0.2, satuan: 'kg' },
]

const seedStarterStockForTenant = (store, tenantId, branchId, businessType = 'HYBRID') => {
  const stockTable = store.getTable('stok_barang')
  if (stockTable.some((s) => s.tenant_id === tenantId)) return
  const bType = String(businessType || 'HYBRID').toUpperCase()
  const now = new Date().toISOString()
  STARTER_STOCK_TEMPLATES.filter((tpl) => {
    if (bType === 'CAFE') return tpl.gudang === 'CAFE'
    if (bType === 'CARWASH') return tpl.gudang === 'CARWASH'
    return true
  }).forEach((tpl) => {
    stockTable.push({
      id: generateLocalUuid(),
      tenant_id: tenantId,
      branch_id: branchId,
      id_barang: tpl.sku,
      id_bahan_baku: tpl.sku,
      nama_produk: tpl.nama,
      nama_barang: tpl.nama,
      satuan: tpl.satuan,
      stok: tpl.stok,
      stok_akhir: tpl.stok,
      harga_satuan: tpl.harga,
      harga_beli: tpl.harga,
      min_stok: tpl.minStok,
      gudang: tpl.gudang,
      kategori: 'Bahan Baku',
      is_active: true,
      updated_at: now,
    })
  })
}

const STORAGE_KEY = 'relaypos_real_sandbox_v2'
const AUTH_STORAGE_KEY = 'relaypos_real_auth_v2'
export const ACTIVE_TENANT_STORAGE_KEY = 'relaypos_active_tenant_id'
let inMemoryActiveTenantId = null
let inMemoryActiveActorContext = {
  role: null,
  branchId: null,
  userId: null,
  tenant_id: null,
  is_active: true
}

export const getActiveActorContext = () => ({ ...inMemoryActiveActorContext })

export const setActiveActorContext = ({
  role = null,
  branchId = null,
  branch_id = null,
  userId = null,
  id = null,
  tenant_id = null,
  is_active = true,
} = {}) => {
  const resolvedBranch = branchId !== null ? branchId : branch_id
  const resolvedUser = userId !== null ? userId : id
  inMemoryActiveActorContext = { role, branchId: resolvedBranch, userId: resolvedUser, tenant_id, is_active }
  if (tenant_id) {
    setActiveTenantId(tenant_id)
  }
}

export const resetActiveActorContext = () => {
  inMemoryActiveActorContext = { role: null, branchId: null, userId: null, tenant_id: null, is_active: true }
  setActiveTenantId(null)
}

export const DEFAULT_SALT = 'relaypos_salt_v1'
// Precomputed SHA-256 for 'password123:relaypos_salt_v1'
export const DEFAULT_DEMO_PASSWORD_HASH = 'e34a55edf4750ae90b3c60399853c906bf01114dd7abcf7cc6980b9ca13a4b62'

export async function hashPassword(password, salt = DEFAULT_SALT) {
  if (typeof crypto !== 'undefined' && crypto?.subtle) {
    const enc = new TextEncoder()
    const data = enc.encode(`${password}:${salt}`)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  let hash = 0
  const str = `${password}:${salt}`
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return String(Math.abs(hash))
}

// Helper global untuk membaca Tenant Aktif saat ini di browser/runtime
export const getActiveTenantId = () => {
  if (inMemoryActiveTenantId && inMemoryActiveTenantId.trim()) {
    return inMemoryActiveTenantId.trim()
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY)
      if (stored && stored.trim()) return stored.trim()
    } catch {
      // ignore
    }
  }
  return DEFAULT_TENANT_ID
}

export const setActiveTenantId = (tenantId) => {
  inMemoryActiveTenantId = tenantId || null
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (tenantId) {
        window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId)
      } else {
        window.localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY)
      }
    } catch {
      // ignore
    }
  }
}

// Tabel sistem global yang tidak diisolasi per-tenant
export const GLOBAL_TABLES = new Set([
  'tenants',
  'app_settings',
  'system_logs'
])

export const isMultiTenantTable = (tableName) => !GLOBAL_TABLES.has(tableName)

export { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID }

export const INITIAL_SEED_DATA = {
  // 1. SAAS MULTI-TENANCY & ORG
  tenants: [
    {
      id: DEFAULT_TENANT_ID,
      nama: 'RelayPOS Enterprise',
      slug: 'relaypos-enterprise',
      owner_name: 'Owner RelayPOS',
      owner_email: 'owner@relaypos.com',
      telepon: '0812-0000-0000',
      alamat: 'Kantor Pusat RelayPOS',
      business_type: 'HYBRID', // 'HYBRID' | 'CARWASH' | 'CAFE'
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
  ],
  tenant_licenses: [
    {
      id: 'lic_default_pro',
      tenant_id: DEFAULT_TENANT_ID,
      license_key: 'RLPOS-PRO-2026-X89Z-441B',
      tier: 'PRO_ANNUAL',
      tier_name: 'RelayPOS Pro Enterprise (Lisensi Tahunan)',
      status: 'ACTIVE',
      started_at: '2026-01-01T00:00:00.000Z',
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      max_branches: 3,
      max_devices: 10,
      notes: 'Lisensi Resmi B2B RelayPOS - Paket Tahunan',
      created_at: new Date().toISOString()
    }
  ],
  beta_feedback: [],
  branches: [
    {
      id: DEFAULT_BRANCH_ID,
      tenant_id: DEFAULT_TENANT_ID,
      nama: 'Cabang Utama (Pusat)',
      kode: 'HO-01',
      alamat: 'Kantor Pusat RelayPOS',
      telepon: '0812-0000-0000',
      is_active: true,
      created_at: new Date().toISOString(),
    }
  ],

  // 2. FINANCIAL CORE - CHART OF ACCOUNTS (CoA)
  chart_of_accounts: [
    // ASET LANCAR (1000 - 1499)
    { id: 'acc_1001', tenant_id: DEFAULT_TENANT_ID, code: '1001', name: 'Kas Kasir (Cash on Hand)', category: 'ASSET', normal_balance: 'DEBIT', is_active: true },
    { id: 'acc_1002', tenant_id: DEFAULT_TENANT_ID, code: '1002', name: 'Kas Bank / QRIS Settlement', category: 'ASSET', normal_balance: 'DEBIT', is_active: true },
    { id: 'acc_1200', tenant_id: DEFAULT_TENANT_ID, code: '1200', name: 'Piutang Usaha (AR)', category: 'ASSET', normal_balance: 'DEBIT', is_active: true },
    { id: 'acc_1300', tenant_id: DEFAULT_TENANT_ID, code: '1300', name: 'Persediaan Bahan Baku & Stok', category: 'ASSET', normal_balance: 'DEBIT', is_active: true },
    // LIABILITAS (2000 - 2999)
    { id: 'acc_2001', tenant_id: DEFAULT_TENANT_ID, code: '2001', name: 'Hutang Usaha (AP - Supplier)', category: 'LIABILITY', normal_balance: 'CREDIT', is_active: true },
    { id: 'acc_2002', tenant_id: DEFAULT_TENANT_ID, code: '2002', name: 'Hutang Gaji & Komisi Kru', category: 'LIABILITY', normal_balance: 'CREDIT', is_active: true },
    // EKUITAS (3000 - 3999)
    { id: 'acc_3001', tenant_id: DEFAULT_TENANT_ID, code: '3001', name: 'Modal Disetor Pemilik', category: 'EQUITY', normal_balance: 'CREDIT', is_active: true },
    { id: 'acc_3002', tenant_id: DEFAULT_TENANT_ID, code: '3002', name: 'Laba Ditahan (Retained Earnings)', category: 'EQUITY', normal_balance: 'CREDIT', is_active: true },
    // PENDAPATAN (4000 - 4999)
    { id: 'acc_4001', tenant_id: DEFAULT_TENANT_ID, code: '4001', name: 'Pendapatan Cafe & F&B', category: 'REVENUE', normal_balance: 'CREDIT', is_active: true },
    { id: 'acc_4002', tenant_id: DEFAULT_TENANT_ID, code: '4002', name: 'Pendapatan Jasa Carwash', category: 'REVENUE', normal_balance: 'CREDIT', is_active: true },
    { id: 'acc_4003', tenant_id: DEFAULT_TENANT_ID, code: '4003', name: 'Pendapatan Penjualan Retail & Merchandise', category: 'REVENUE', normal_balance: 'CREDIT', is_active: true },
    // HARGA POKOK PENJUALAN (5000 - 5999)
    { id: 'acc_5001', tenant_id: DEFAULT_TENANT_ID, code: '5001', name: 'HPP - Bahan Baku F&B Cafe', category: 'EXPENSE', normal_balance: 'DEBIT', is_active: true },
    { id: 'acc_5002', tenant_id: DEFAULT_TENANT_ID, code: '5002', name: 'HPP - Shampoo & Chemical Carwash', category: 'EXPENSE', normal_balance: 'DEBIT', is_active: true },
    // BEBAN OPERASIONAL (6000 - 6999)
    { id: 'acc_6001', tenant_id: DEFAULT_TENANT_ID, code: '6001', name: 'Beban Komisi & Upah Cuci Mobil', category: 'EXPENSE', normal_balance: 'DEBIT', is_active: true },
    { id: 'acc_6002', tenant_id: DEFAULT_TENANT_ID, code: '6002', name: 'Beban Listrik, Air & Utilitas', category: 'EXPENSE', normal_balance: 'DEBIT', is_active: true },
    { id: 'acc_6003', tenant_id: DEFAULT_TENANT_ID, code: '6003', name: 'Beban Perawatan & Servis Mesin', category: 'EXPENSE', normal_balance: 'DEBIT', is_active: true },
    { id: 'acc_6004', tenant_id: DEFAULT_TENANT_ID, code: '6004', name: 'Beban Operasional & Kasbon Karyawan', category: 'EXPENSE', normal_balance: 'DEBIT', is_active: true },
  ],

  // DOUBLE ENTRY GENERAL LEDGER
  journal_entries: [],
  journal_entry_lines: [],

  // 3. PROCUREMENT & VENDORS
  suppliers: [],
  purchase_orders: [],
  purchase_order_items: [],
  stock_movements: [],

  // 4. MASTER OPERASIONAL & POS (DEMO SANDBOX)
  kasir: [
    { nama: 'KASIR 1', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, is_active: true, created_at: new Date().toISOString() },
    { nama: 'KASIR 2', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, is_active: true, created_at: new Date().toISOString() },
    { nama: 'SUPERVISOR', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, is_active: true, created_at: new Date().toISOString() },
  ],
  metode_bayar: realSeedData.metode_bayar && realSeedData.metode_bayar.length > 0 ? realSeedData.metode_bayar : [
    { nama: 'CASH', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, is_active: true, created_at: new Date().toISOString() },
    { nama: 'QRIS', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, is_active: true, created_at: new Date().toISOString() },
    { nama: 'TRANSFER', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, is_active: true, created_at: new Date().toISOString() },
  ],
  // MASTER KATEGORI & ARUS CASHFLOW (DENGAN KONTROL AKSES KASIR & PEMETAAN COA)
  master_categories: [
    // 1. Pengeluaran Cafe (F&B)
    { id: 'kat_cafe_bahan', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Bahan Baku F&B', jenis: 'Pengeluaran Cafe', tipe_arus: 'PENGELUARAN', account_id: 'acc_5001', boleh_kasir: true, is_active: true },
    { id: 'kat_cafe_listrik', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Listrik Cafe', jenis: 'Pengeluaran Cafe', tipe_arus: 'PENGELUARAN', account_id: 'acc_6002', boleh_kasir: false, is_active: true },
    { id: 'kat_cafe_operasional', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Operasional Cafe', jenis: 'Pengeluaran Cafe', tipe_arus: 'PENGELUARAN', account_id: 'acc_6004', boleh_kasir: true, is_active: true },
    { id: 'kat_cafe_servis', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Servis Mesin Cafe', jenis: 'Pengeluaran Cafe', tipe_arus: 'PENGELUARAN', account_id: 'acc_6003', boleh_kasir: false, is_active: true },
    // 2. Pengeluaran Carwash
    { id: 'kat_cw_chemical', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Bahan Cuci & Chemical', jenis: 'Pengeluaran Carwash', tipe_arus: 'PENGELUARAN', account_id: 'acc_5002', boleh_kasir: true, is_active: true },
    { id: 'kat_cw_listrik', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Listrik Carwash', jenis: 'Pengeluaran Carwash', tipe_arus: 'PENGELUARAN', account_id: 'acc_6002', boleh_kasir: false, is_active: true },
    { id: 'kat_cw_air', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Air PAM & Perawatan Mesin Air', jenis: 'Pengeluaran Carwash', tipe_arus: 'PENGELUARAN', account_id: 'acc_6002', boleh_kasir: true, is_active: true },
    { id: 'kat_cw_servis', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Servis Hidrolik & Kompresor', jenis: 'Pengeluaran Carwash', tipe_arus: 'PENGELUARAN', account_id: 'acc_6003', boleh_kasir: false, is_active: true },
    { id: 'kat_cw_perlengkapan', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Perlengkapan Cuci Mobil', jenis: 'Pengeluaran Carwash', tipe_arus: 'PENGELUARAN', account_id: 'acc_6004', boleh_kasir: true, is_active: true },
    // 3. Pengeluaran Bersama & Umum
    { id: 'kat_umum_sewa', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Sewa Tempat Usaha (Bang Awal)', jenis: 'Pengeluaran Bersama', tipe_arus: 'PENGELUARAN', account_id: 'acc_6004', boleh_kasir: false, is_active: true },
    { id: 'kat_umum_gaji', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Gaji Karyawan Tetap & Leader', jenis: 'Pengeluaran Bersama', tipe_arus: 'PENGELUARAN', account_id: 'acc_6001', boleh_kasir: false, is_active: true },
    { id: 'kat_umum_casbon', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Casbon Karyawan', jenis: 'Pengeluaran Bersama', tipe_arus: 'PENGELUARAN', account_id: 'acc_6004', boleh_kasir: true, is_active: true },
    { id: 'kat_umum_admin_bank', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Biaya Admin Bank / QRIS', jenis: 'Pengeluaran Bersama', tipe_arus: 'PENGELUARAN', account_id: 'acc_6004', boleh_kasir: false, is_active: true },
    // 4. Non-Beban & Mutasi Saldo
    { id: 'kat_pindah_saldo', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Pindah Saldo Antar Rekening', jenis: 'Mutasi Internal', tipe_arus: 'PENGELUARAN', account_id: 'acc_1002', boleh_kasir: false, is_active: true },
    { id: 'kat_prive_owner', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Prive / Penarikan Owner', jenis: 'Mutasi Internal', tipe_arus: 'PENGELUARAN', account_id: 'acc_3002', boleh_kasir: false, is_active: true },
    // 5. Pemasukan Lain-lain (Non-POS)
    { id: 'kat_inc_sewa_tenant', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Pendapatan Sewa Tenant (Burger/Tempe/Jus/dll)', jenis: 'Pemasukan Non-POS', tipe_arus: 'PEMASUKAN', account_id: 'acc_4003', boleh_kasir: false, is_active: true },
    { id: 'kat_inc_modal_owner', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Suntikan / Pinjaman Modal Pemilik', jenis: 'Pemasukan Non-POS', tipe_arus: 'PEMASUKAN', account_id: 'acc_3001', boleh_kasir: false, is_active: true },
    { id: 'kat_inc_pelunasan_casbon', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Pelunasan Casbon Karyawan', jenis: 'Pemasukan Non-POS', tipe_arus: 'PEMASUKAN', account_id: 'acc_1001', boleh_kasir: true, is_active: true },
    { id: 'kat_inc_lainnya', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Pendapatan Non-Operasional Lain', jenis: 'Pemasukan Non-POS', tipe_arus: 'PEMASUKAN', account_id: 'acc_4003', boleh_kasir: false, is_active: true },
    // 6. Kategori Menu F&B Cafe (Katalog POS)
    { id: 'kat_menu_kopi', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Kopi (Coffee)', jenis: 'Kategori Menu Cafe', tipe_arus: 'PEMASUKAN', account_id: 'acc_4001', boleh_kasir: true, is_active: true },
    { id: 'kat_menu_noncoffee', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Non-Coffee & Teh', jenis: 'Kategori Menu Cafe', tipe_arus: 'PEMASUKAN', account_id: 'acc_4001', boleh_kasir: true, is_active: true },
    { id: 'kat_menu_makanan', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Makanan Berat', jenis: 'Kategori Menu Cafe', tipe_arus: 'PEMASUKAN', account_id: 'acc_4001', boleh_kasir: true, is_active: true },
    { id: 'kat_menu_snack', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Camilan & Snack', jenis: 'Kategori Menu Cafe', tipe_arus: 'PEMASUKAN', account_id: 'acc_4001', boleh_kasir: true, is_active: true },
    { id: 'kat_menu_dessert', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Dessert & Pastry', jenis: 'Kategori Menu Cafe', tipe_arus: 'PEMASUKAN', account_id: 'acc_4001', boleh_kasir: true, is_active: true },
    // 7. Kategori Layanan Carwash (Katalog POS)
    { id: 'kat_cw_reguler', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Cuci Reguler & Salju', jenis: 'Kategori Layanan Carwash', tipe_arus: 'PEMASUKAN', account_id: 'acc_4002', boleh_kasir: true, is_active: true },
    { id: 'kat_cw_detailing', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Cuci Detailing & Wax', jenis: 'Kategori Layanan Carwash', tipe_arus: 'PEMASUKAN', account_id: 'acc_4002', boleh_kasir: true, is_active: true },
    { id: 'kat_cw_interior', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Interior Care & Fogging', jenis: 'Kategori Layanan Carwash', tipe_arus: 'PEMASUKAN', account_id: 'acc_4002', boleh_kasir: true, is_active: true },
    { id: 'kat_cw_coating', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Poles & Nano Coating', jenis: 'Kategori Layanan Carwash', tipe_arus: 'PEMASUKAN', account_id: 'acc_4002', boleh_kasir: true, is_active: true },
    // 8. Kategori Retail & Merchandise
    { id: 'kat_ret_parfum', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Parfum & Aksesoris', jenis: 'Kategori Retail / Merchandise', tipe_arus: 'PEMASUKAN', account_id: 'acc_4003', boleh_kasir: true, is_active: true },
    { id: 'kat_ret_chemical', tenant_id: DEFAULT_TENANT_ID, nama_kategori: 'Chemical Retail & Lap', jenis: 'Kategori Retail / Merchandise', tipe_arus: 'PEMASUKAN', account_id: 'acc_4003', boleh_kasir: true, is_active: true },
  ],
  karyawan_cuci: [
    { id: 1, nama: 'Operator Cuci 1', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 2, nama: 'Operator Cuci 2', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
  ],
  karyawan_kantor: [
    { id: 'kk_owner', nama: 'Owner Toko', role: 'Owner', email: 'owner@relaypos.com', source: 'staff_registration', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 'kk_admin', nama: 'Admin Supervisor', role: 'Admin', email: 'admin@relaypos.com', source: 'staff_registration', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 'kk_kasir', nama: 'Kasir Toko', role: 'Kasir', email: 'kasir@relaypos.com', source: 'staff_registration', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
  ],
  stok_barang: realSeedData.stok_barang && realSeedData.stok_barang.length > 0 ? realSeedData.stok_barang : [],
  daftar_harga_menu: realSeedData.daftar_harga_menu && realSeedData.daftar_harga_menu.length > 0 ? realSeedData.daftar_harga_menu : [],
  resep: realSeedData.resep && realSeedData.resep.length > 0 ? realSeedData.resep : [],
  diskon: realSeedData.diskon && realSeedData.diskon.length > 0 ? realSeedData.diskon : [],
  pos_balances: [
    { id: 'acc_saldo_cash', pos: 'SALDO CASH', label: 'Kas Laci Kasir', tipe: 'CASH', balance: 0, color: 'emerald', keterangan: 'Uang fisik di mesin kasir', is_active: true, tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID },
    { id: 'acc_saldo_rekening_y', pos: 'SALDO REKENING Y', label: 'Rekening Operasional Y', tipe: 'BANK', balance: 0, color: 'blue', keterangan: 'Rekening penerimaan utama & QRIS', is_active: true, tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID },
    { id: 'acc_saldo_rekening_n', pos: 'SALDO REKENING N', label: 'Rekening Operasional N', tipe: 'BANK', balance: 0, color: 'cyan', keterangan: 'Rekening biaya operasional', is_active: true, tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID },
    { id: 'acc_saldo_rekening_r', pos: 'SALDO REKENING R', label: 'Rekening Cadangan R', tipe: 'BANK', balance: 0, color: 'purple', keterangan: 'Rekening cadangan / simpanan', is_active: true, tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID }
  ],
  carwash_packages: DEFAULT_CARWASH_PACKAGES.map((pkg, idx) => ({
    ...pkg,
    sort_order: idx + 1,
    tenant_id: DEFAULT_TENANT_ID,
    branch_id: DEFAULT_BRANCH_ID
  })),

  // 5. TRANSAKSI REAL DARI SUPABASE CLOUD (DEFAULT TENANT ISOLATED)
  struk: [],
  cafe: [],
  carwash: [],
  pengeluaran: [],
  barang_masuk: [],
  barang_keluar: [],
  cashflow: [],

  // 6. PROFILES & USERS (4 ROLE: SUPER_ADMIN, OWNER, ADMIN, KASIR)
  profiles: [
    {
      id: 'demo-superadmin-id',
      tenant_id: 'tenant_platform_root',
      branch_id: 'branch_platform_root',
      nama: 'Solo Founder (Super Admin)',
      email: 'superadmin@relaypos.com',
      role: 'Super Admin',
      password_hash: DEFAULT_DEMO_PASSWORD_HASH,
      salt: DEFAULT_SALT,
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-owner-id',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      nama: 'Owner RelayPOS',
      email: 'owner@relaypos.com',
      role: 'Owner',
      password_hash: DEFAULT_DEMO_PASSWORD_HASH,
      salt: DEFAULT_SALT,
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-admin-id',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      nama: 'Admin Supervisor',
      email: 'admin@relaypos.com',
      role: 'Admin',
      password_hash: DEFAULT_DEMO_PASSWORD_HASH,
      salt: DEFAULT_SALT,
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-kasir-id',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      nama: 'Kasir Utama',
      email: 'kasir@relaypos.com',
      role: 'Kasir',
      password_hash: DEFAULT_DEMO_PASSWORD_HASH,
      salt: DEFAULT_SALT,
      created_at: new Date().toISOString(),
    },
  ],

  // 7. AUDIT LOGS
  audit_logs: [
    {
      id: 'log_init',
      tenant_id: DEFAULT_TENANT_ID,
      user_id: 'usr_owner_01',
      action: 'SYSTEM_INITIALIZATION',
      details: 'Local SaaS ERP Database initialized with standard Chart of Accounts & Seed Data.',
      timestamp: new Date().toISOString(),
    },
  ],
}

// In-Memory Database Storage Holder
export class LocalDatabaseStore {
  constructor() {
    this.data = this.loadFromStorage()
    this.authSession = this.loadAuth()
    this.provisionedTenants = new Set([DEFAULT_TENANT_ID])
    this.syncStrukToCashflow = false // Standar ERP: Omzet direkap saat Tutup Kasir / EOD, bukan per-struk
    this.strictPostgresParity = false
    this.ensureInitialized()
  }

  setSyncStrukToCashflow(enabled) {
    this.syncStrukToCashflow = Boolean(enabled)
  }

  setStrictPostgresParity(enabled) {
    this.strictPostgresParity = Boolean(enabled)
  }

  ensureInitialized() {
    if (!this.data.journal_entries) this.data.journal_entries = []
    if (!this.data.journal_entry_lines) this.data.journal_entry_lines = []
    if (!this.data.bank_email_connections) this.data.bank_email_connections = []
    if (!this.data.bank_account_bindings) this.data.bank_account_bindings = []
    if (!this.data.bank_email_messages) this.data.bank_email_messages = []
    if (!this.data.bank_transaction_drafts) this.data.bank_transaction_drafts = []
    if (!this.data.master_categories || this.data.master_categories.length === 0) {
      this.data.master_categories = JSON.parse(JSON.stringify(INITIAL_SEED_DATA.master_categories || []))
    }

    // Bersihkan tenant mock jika tersimpan di local storage
    if (this.data.tenants) {
      this.data.tenants = this.data.tenants.filter((t) => t.id !== 'tenant_demo_cafe' && t.id !== 'tenant_demo_carwash')
    }
    if (this.data.branches) {
      this.data.branches = this.data.branches.filter((b) => b.tenant_id !== 'tenant_demo_cafe' && b.tenant_id !== 'tenant_demo_carwash')
    }
    if (this.data.tenant_licenses) {
      this.data.tenant_licenses = this.data.tenant_licenses.filter((l) => l.tenant_id !== 'tenant_demo_cafe' && l.tenant_id !== 'tenant_demo_carwash')
    }
    if (this.data.profiles) {
      this.data.profiles = this.data.profiles.filter((p) => p.tenant_id !== 'tenant_demo_cafe' && p.tenant_id !== 'tenant_demo_carwash' && p.id !== '96e0b43e-b470-4394-b46c-242bb6dfeece')
    }

    // Auto-migrate & sinkronisasi model bisnis tenant (Cafe / Carwash / Hybrid)
    if (!this.data.tenants) this.data.tenants = []
    INITIAL_SEED_DATA.tenants.forEach((dt) => {
      const existing = this.data.tenants.find((t) => t.id === dt.id)
      if (!existing) {
        this.data.tenants.push(JSON.parse(JSON.stringify(dt)))
      } else if (!existing.business_type) {
        existing.business_type = dt.business_type
      }
    })

    // Pastikan seluruh tenant di database memiliki atribut business_type yang valid
    this.data.tenants.forEach((t) => {
      if (!t.business_type) {
        const text = `${t.nama || ''} ${t.slug || ''}`.toLowerCase()
        if (text.includes('cafe') || text.includes('kopi') || text.includes('resto') || text.includes('bistro')) {
          t.business_type = 'CAFE'
        } else if (text.includes('carwash') || text.includes('cuci') || text.includes('wash') || text.includes('detailing')) {
          t.business_type = 'CARWASH'
        } else {
          t.business_type = 'HYBRID'
        }
      }
    })

    // Pastikan branch demo juga tersedia
    if (!this.data.branches) this.data.branches = []
    INITIAL_SEED_DATA.branches.forEach((b) => {
      const exists = this.data.branches.some((eb) => eb.id === b.id)
      if (!exists) {
        this.data.branches.push(JSON.parse(JSON.stringify(b)))
      }
    })
    
    // Pastikan 4 akun role demo (Super Admin, Owner, Admin, Kasir) selalu tersedia
    if (!this.data.profiles) this.data.profiles = []
    INITIAL_SEED_DATA.profiles.forEach((p) => {
      const existing = this.data.profiles.find(
        (ep) => (ep.email?.toLowerCase() === p.email.toLowerCase() && ep.role === p.role) || ep.id === p.id
      )
      if (!existing) {
        this.data.profiles.push(JSON.parse(JSON.stringify(p)))
      } else {
        // Jamin kredensial akun platform superadmin/founder selalu sinkron dengan seed resmi
        if (p.email === 'superadmin@relaypos.com') {
          existing.email = p.email
          existing.role = p.role
          existing.tenant_id = p.tenant_id || 'tenant_platform_root'
          if (!existing.password_hash) {
            existing.password_hash = DEFAULT_DEMO_PASSWORD_HASH
            existing.salt = DEFAULT_SALT
          }
        }
      }
    })
    // Pastikan semua profil memiliki password_hash & salt terisi (default demo password123)
    this.data.profiles.forEach((p) => {
      if (!p.password_hash) {
        p.password_hash = DEFAULT_DEMO_PASSWORD_HASH
        p.salt = DEFAULT_SALT
      }
    })

    if (!this.data.karyawan_kantor) this.data.karyawan_kantor = []
    INITIAL_SEED_DATA.karyawan_kantor.forEach((k) => {
      const exists = this.data.karyawan_kantor.some(
        (existing) => (existing.nama || '').trim().toUpperCase() === k.nama.trim().toUpperCase()
      )
      if (!exists) {
        this.data.karyawan_kantor.push(JSON.parse(JSON.stringify(k)))
      }
    })

    if (!this.data.karyawan_cuci || this.data.karyawan_cuci.length === 0) {
      this.data.karyawan_cuci = JSON.parse(JSON.stringify(INITIAL_SEED_DATA.karyawan_cuci || []))
    } else {
      // Pastikan nama kru cuci standar (ANGGA, FERRY, RAHMAN, dll.) terdaftar jika masih pakai KRU 1 dsb.
      INITIAL_SEED_DATA.karyawan_cuci.forEach((kc) => {
        const exists = this.data.karyawan_cuci.some(
          (existing) => (existing.nama || '').trim().toUpperCase() === kc.nama.trim().toUpperCase()
        )
        if (!exists) {
          this.data.karyawan_cuci.push(JSON.parse(JSON.stringify(kc)))
        }
      })
    }

    if (isBrowserDevSandbox()) {
      const needsDemoSeed =
        this.data._demo_seed_version !== DEMO_MOCK_SEED_VERSION &&
        (!this.data.struk || this.data.struk.length === 0) &&
        (!this.data.cashflow || this.data.cashflow.length === 0)
      if (needsDemoSeed) {
        applyDevMockSeedData(this.data)
        this.data._demo_seed_version = DEMO_MOCK_SEED_VERSION
        this.data.journal_entries = []
        this.data.journal_entry_lines = []
        const gl = new GeneralLedgerService(this)
        gl.backfillHistoricalJournals(DEFAULT_TENANT_ID)
        this.saveToStorage(true)
      }
    }

    if (this.data.journal_entries.length === 0) {
      const gl = new GeneralLedgerService(this)
      gl.backfillHistoricalJournals(DEFAULT_TENANT_ID)
    }
  }

  loadFromStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          const merged = { ...INITIAL_SEED_DATA }
          Object.keys(parsed).forEach((key) => {
            if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
              merged[key] = parsed[key]
            } else if (!Array.isArray(parsed[key]) && parsed[key] !== null && parsed[key] !== undefined) {
              merged[key] = parsed[key]
            }
          })
          return merged
        }
      } catch (err) {
        console.warn('Failed to parse local database storage, resetting to seed data', err)
      }
    }
    return JSON.parse(JSON.stringify(INITIAL_SEED_DATA))
  }

  saveToStorage(immediate = false) {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer)
        this._saveTimer = null
      }
      if (immediate) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
        } catch (err) {
          console.warn('LocalStorage quota or serialization notice (working in-memory):', err.message || err)
        }
        return
      }
      this._saveTimer = setTimeout(() => {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
        } catch (err) {
          console.warn('LocalStorage quota or serialization notice (working in-memory):', err.message || err)
        }
      }, 300)
    }
  }

  loadAuth() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(AUTH_STORAGE_KEY)
        if (saved) return JSON.parse(saved)
      } catch (err) {
        // ignore
      }
    }
    const defaultUser = {
      id: 'demo-owner-id',
      email: 'owner@relaypos.com',
      role: 'Owner',
      user_metadata: { nama: 'Owner RelayPOS', role: 'Owner' },
    }
    return { user: defaultUser, token: 'mock-local-token' }
  }

  getAuth() {
    return this.authSession || this.loadAuth()
  }

  saveAuth(session) {
    this.authSession = session
    if (typeof window !== 'undefined' && window.localStorage) {
      if (session) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
      } else {
        window.localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    }
  }

  resetDatabase(cleanTransactions = true) {
    this.data = JSON.parse(JSON.stringify(INITIAL_SEED_DATA))
    this.data.bank_email_connections = []
    this.data.bank_account_bindings = []
    this.data.bank_email_messages = []
    this.data.bank_transaction_drafts = []
    if (cleanTransactions) {
      this.data.struk = []
      this.data.cafe = []
      this.data.carwash = []
      this.data.pengeluaran = []
      this.data.barang_masuk = []
      this.data.barang_keluar = []
      this.data.cashflow = []
    }
    this.provisionedTenants = new Set([DEFAULT_TENANT_ID])
    this.strictPostgresParity = false
    this.saveToStorage(true)
    return this.data
  }

  // Provisioning master data dasar untuk tenant baru (agar operasional siap tanpa menyalin riwayat transaksi)
  ensureTenantMasterData(tenantId, businessType = 'HYBRID') {
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return
    if (!this.provisionedTenants) {
      this.provisionedTenants = new Set([DEFAULT_TENANT_ID])
    }
    if (this.provisionedTenants.has(tenantId)) {
      return // Instant 0ms bypass: tenant sudah di-provision
    }
    this.provisionedTenants.add(tenantId)
    let hasMutations = false

    // 1. Akun Kas & Bank Laci
    const tableBalances = this.getTable('pos_balances')
    const hasBalances = tableBalances.some(b => b.tenant_id === tenantId)
    if (!hasBalances) {
      hasMutations = true
      tableBalances.push(
        { id: `acc_${tenantId}_cash`, pos: 'SALDO CASH', label: 'Kas Laci Kasir', tipe: 'CASH', balance: 0, color: 'emerald', keterangan: 'Uang fisik di mesin kasir', is_active: true, tenant_id: tenantId, branch_id: `branch_${tenantId}_main` },
        { id: `acc_${tenantId}_reky`, pos: 'SALDO REKENING OPERASIONAL', label: 'Rekening Bank / QRIS', tipe: 'BANK', balance: 0, color: 'blue', keterangan: 'Rekening penerimaan utama & QRIS', is_active: true, tenant_id: tenantId, branch_id: `branch_${tenantId}_main` }
      )
    }

    // 2. Akun Kasir Default
    const tableKasir = this.getTable('kasir')
    const hasKasir = tableKasir.some(k => k.tenant_id === tenantId)
    if (!hasKasir) {
      hasMutations = true
      tableKasir.push(
        { nama: 'KASIR 1', tenant_id: tenantId, branch_id: `branch_${tenantId}_main`, is_active: true, created_at: new Date().toISOString() }
      )
    }

    // 3. Metode Pembayaran Default
    const tableMetode = this.getTable('metode_bayar')
    const hasMetode = tableMetode.some(m => m.tenant_id === tenantId)
    if (!hasMetode) {
      hasMutations = true
      tableMetode.push(
        { nama: 'CASH', tenant_id: tenantId, branch_id: `branch_${tenantId}_main`, is_active: true, created_at: new Date().toISOString() },
        { nama: 'QRIS', tenant_id: tenantId, branch_id: `branch_${tenantId}_main`, is_active: true, created_at: new Date().toISOString() },
        { nama: 'TRANSFER', tenant_id: tenantId, branch_id: `branch_${tenantId}_main`, is_active: true, created_at: new Date().toISOString() }
      )
    }

    // 4. Kategori Arus Kas & Pengeluaran
    const tableKategori = this.getTable('master_categories')
    const hasKategori = tableKategori.some(k => k.tenant_id === tenantId)
    if (!hasKategori) {
      hasMutations = true
      INITIAL_SEED_DATA.master_categories.forEach(kat => {
        tableKategori.push({
          ...kat,
          id: `${kat.id}_${tenantId}`,
          tenant_id: tenantId
        })
      })
    }

    // 5. Chart of Accounts (CoA)
    const tableCoA = this.getTable('chart_of_accounts')
    const hasCoA = tableCoA.some(c => c.tenant_id === tenantId)
    if (!hasCoA) {
      hasMutations = true
      INITIAL_SEED_DATA.chart_of_accounts.forEach(acc => {
        tableCoA.push({
          ...acc,
          id: `${acc.id}_${tenantId}`,
          tenant_id: tenantId
        })
      })
    }

    // 6. Master Paket Cuci Mobil (jika tipe Carwash / Hybrid)
    if (businessType !== 'CAFE') {
      const tableCwPkg = this.getTable('carwash_packages')
      const hasCwPkg = tableCwPkg.some(p => p.tenant_id === tenantId)
      if (!hasCwPkg) {
        hasMutations = true
        DEFAULT_CARWASH_PACKAGES.forEach((pkg, idx) => {
          const basePrice = typeof pkg.tarif === 'number' ? pkg.tarif : (pkg.tarif?.Small?.Regular || 50000)
          tableCwPkg.push({
            ...pkg,
            id: generateLocalUuid(),
            name: pkg.nama_paket,
            description: pkg.keterangan || '',
            price: basePrice,
            tarif_matrix: typeof pkg.tarif === 'object' ? pkg.tarif : null,
            sort_order: idx + 1,
            tenant_id: tenantId,
            branch_id: `branch_${tenantId}_main`
          })
        })
      }
    }

    // 7. Master Menu & Resep Cafe Awal (jika tipe Cafe / Hybrid)
    if (businessType !== 'CARWASH') {
      const tableMenu = this.getTable('daftar_harga_menu')
      const hasMenu = tableMenu.some(m => m.tenant_id === tenantId)
      if (!hasMenu) {
        hasMutations = true
        STARTER_CAFE_MENUS.forEach((m) => {
          tableMenu.push({
            id: generateLocalUuid(),
            id_menu: m.nama,
            daftar_menu: m.nama,
            nama_menu: m.nama,
            harga: m.harga,
            kategori: m.kategori,
            is_active: true,
            tenant_id: tenantId,
            branch_id: `branch_${tenantId}_main`,
            updated_at: new Date().toISOString(),
          })
        })
      }

      const tableResep = this.getTable('resep')
      const hasResep = tableResep.some(r => r.tenant_id === tenantId)
      if (!hasResep) {
        hasMutations = true
        STARTER_CAFE_RECIPES.forEach((r) => {
          tableResep.push({
            id: generateLocalUuid(),
            tenant_id: tenantId,
            id_menu: r.menu,
            id_bahan_baku: r.sku,
            daftar_menu: r.menu,
            nama_menu: r.menu,
            nama_bahan: r.bahan,
            nama_bahan_baku: r.bahan,
            jumlah: r.jumlah,
            jumlah_dibutuhkan: r.jumlah,
            jumlah_pemakaian: r.jumlah,
            satuan: r.satuan,
            created_at: new Date().toISOString(),
          })
        })
      }
    }

    if (hasMutations) {
      this.saveToStorage()
    }
  }

  getTable(tableName) {
    if (tableName === 'v_pocket_balances') {
      const pockets = this.data.pos_balances || []
      const cashflows = this.data.cashflow || []
      return pockets.map((pb) => {
        let totalIn = 0
        let totalOut = 0
        let txCount = 0
        cashflows.forEach((cf) => {
          if (cf.tenant_id !== pb.tenant_id) return
          const matchedById = cf.pocket_id && cf.pocket_id === pb.id
          const matchedByPos = !cf.pocket_id && cf.pos && pb.pos && String(cf.pos).trim().toUpperCase() === String(pb.pos).trim().toUpperCase()
          if (matchedById || matchedByPos) {
            totalIn += parseFloat(cf.pemasukan || 0)
            totalOut += parseFloat(cf.pengeluaran || 0)
            txCount += 1
          }
        })
        const opening = parseFloat(pb.balance || 0)
        return {
          ...pb,
          opening_balance: opening,
          total_in: totalIn,
          total_out: totalOut,
          current_balance: opening + (totalIn - totalOut),
          tx_count: txCount,
          balance_source: 'ERP_BOOK',
        }
      })
    }
    if (!this.data[tableName]) {
      this.data[tableName] = []
    }
    return this.data[tableName]
  }

  // DOUBLE-ENTRY AUTO-JOURNAL ENGINE
  postJournalEntry({ tenant_id = DEFAULT_TENANT_ID, branch_id = DEFAULT_BRANCH_ID, entry_no, date, memo, lines = [], source_type = null, source_id = null }, shouldSave = true) {
    if (!lines || lines.length === 0) return null

    const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0)
    const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      const errMsg = `[DOUBLE_ENTRY_VIOLATION] Jurnal tidak seimbang: Total Debit (${totalDebit}) != Total Credit (${totalCredit})`
      console.error(errMsg)
      throw new Error(errMsg)
    }

    const journalId = `je_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const journalRecord = {
      id: journalId,
      tenant_id,
      branch_id,
      entry_no: entry_no || `JV-${Date.now().toString().slice(-6)}`,
      date: date || new Date().toISOString().split('T')[0],
      memo: memo || 'Jurnal Otomatis Sistem ERP',
      source_type,
      source_id,
      total_amount: totalDebit,
      status: 'POSTED',
      created_at: new Date().toISOString(),
    }

    this.getTable('journal_entries').push(journalRecord)

    lines.forEach((line) => {
      const lineRecord = {
        id: `jel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenant_id,
        journal_entry_id: journalId,
        account_id: line.account_id,
        account_code: line.account_code || '',
        account_name: line.account_name || '',
        debit: parseFloat(line.debit) || 0,
        credit: parseFloat(line.credit) || 0,
        memo: line.memo || memo,
      }
      this.getTable('journal_entry_lines').push(lineRecord)
    })

    if (shouldSave) {
      this.saveToStorage()
    }
    return journalRecord
  }
}

export const localDbStore = new LocalDatabaseStore()

// Query Builder supporting Supabase API Methods (Select, Insert, Update, Delete with Chainable Filters)
export class LocalQueryBuilder {
  constructor(store, tableName) {
    this.store = store
    this.tableName = tableName
    this.filters = []
    this.sortFields = []
    this.limitCount = null
    this.rangeOffsets = null
    this.isSingle = false
    this.isMaybeSingle = false
    this.selectedColumns = '*'
    this.operation = 'SELECT' // 'SELECT', 'INSERT', 'UPDATE', 'DELETE'
    this.payload = null
    this.explicitTenantFilter = false
    this.bypassTenantIsolation = false
    this.parityError = null
  }

  _buildUuidSyntaxError(val) {
    return {
      code: '22P02',
      message: `invalid input syntax for type uuid: "${val}"`,
    }
  }

  _validateFilterUuid(column, value) {
    if (!this.store.strictPostgresParity || this.parityError) return
    const isUuidCol =
      (column === 'id' && POSTGRES_UUID_PK_TABLES.has(this.tableName)) ||
      (this.tableName === 'pengeluaran' && column === 'id_bahan_baku')
    if (!isUuidCol || value === null || value === undefined) return
    if (!isValidPostgresUuid(value)) {
      this.parityError = this._buildUuidSyntaxError(value)
    }
  }

  _validateMutationPayloads(records) {
    if (!this.store.strictPostgresParity) return null
    if (this.parityError) return this.parityError

    const allowedCols = POSTGRES_SCHEMA_COLUMNS[this.tableName]
    for (const item of records) {
      if (!item || typeof item !== 'object') continue
      if (allowedCols) {
        for (const key of Object.keys(item)) {
          if (!allowedCols.has(key)) {
            return {
              code: 'PGRST204',
              message: `Could not find the '${key}' column of '${this.tableName}' in the schema cache`,
            }
          }
        }
      }
      if (POSTGRES_UUID_PK_TABLES.has(this.tableName) && item.id !== undefined && item.id !== null) {
        if (!isValidPostgresUuid(item.id)) {
          return this._buildUuidSyntaxError(item.id)
        }
      }
      if (this.tableName === 'pengeluaran' && item.id_bahan_baku !== undefined && item.id_bahan_baku !== null) {
        if (!isValidPostgresUuid(item.id_bahan_baku)) {
          return this._buildUuidSyntaxError(item.id_bahan_baku)
        }
      }
    }
    return null
  }

  bypassTenant() {
    this.bypassTenantIsolation = true
    return this
  }

  select(columns = '*', options = {}) {
    this.selectedColumns = columns
    this.queryOptions = options || {}
    if (options && options.ignoreTenant) {
      this.bypassTenantIsolation = true
    }
    return this
  }

  _getValue(row, column) {
    if (row[column] !== undefined) return row[column]
    if (typeof column === 'string' && column.includes('.')) {
      const [relation, field] = column.split('.')
      if (row[relation] && row[relation][field] !== undefined) {
        return row[relation][field]
      }
      if (relation === 'struk' && row.id_struk) {
        if (!this._strukCache) {
          const strukTable = this.store.getTable('struk')
          this._strukCache = new Map(strukTable.map((item) => [item.id_struk, item]))
        }
        const s = this._strukCache.get(row.id_struk)
        if (s && s[field] !== undefined) return s[field]
      }
    }
    return row[column]
  }

  eq(column, value) {
    if (column === 'tenant_id') {
      this.explicitTenantFilter = true
    }
    if (column.startsWith('id_') || column === 'id') {
      this.hasSpecificIdFilter = true
    }
    this._validateFilterUuid(column, value)
    this.filters.push((row) => this._getValue(row, column) === value)
    return this
  }

  neq(column, value) {
    this.filters.push((row) => this._getValue(row, column) !== value)
    return this
  }

  gt(column, value) {
    this.filters.push((row) => this._getValue(row, column) > value)
    return this
  }

  gte(column, value) {
    this.filters.push((row) => this._getValue(row, column) >= value)
    return this
  }

  lt(column, value) {
    this.filters.push((row) => this._getValue(row, column) < value)
    return this
  }

  lte(column, value) {
    this.filters.push((row) => this._getValue(row, column) <= value)
    return this
  }

  like(column, pattern) {
    const regex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`)
    this.filters.push((row) => regex.test(String(this._getValue(row, column) || '')))
    return this
  }

  ilike(column, pattern) {
    const regex = new RegExp(`^${pattern.replace(/%/g, '.*')}$`, 'i')
    this.filters.push((row) => regex.test(String(this._getValue(row, column) || '')))
    return this
  }

  in(column, values) {
    if (Array.isArray(values)) {
      values.forEach((v) => this._validateFilterUuid(column, v))
    }
    this.filters.push((row) => Array.isArray(values) && values.includes(this._getValue(row, column)))
    return this
  }

  is(column, value) {
    this.filters.push((row) => {
      const val = this._getValue(row, column)
      return value === null ? (val === null || val === undefined) : val === value
    })
    return this
  }

  order(column, { ascending = true } = {}) {
    this.sortFields.push({ column, ascending })
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  range(from, to) {
    this.rangeOffsets = { from, to }
    return this
  }

  single() {
    this.isSingle = true
    return this
  }

  maybeSingle() {
    this.isMaybeSingle = true
    return this
  }

  // INSERT initiation
  insert(payload) {
    this.operation = 'INSERT'
    this.payload = payload
    return this
  }

  // UPDATE initiation
  update(values) {
    this.operation = 'UPDATE'
    this.payload = values
    return this
  }

  // UPSERT initiation (Supabase-compatible)
  upsert(values, options = {}) {
    this.operation = 'UPSERT'
    this.payload = values
    this.upsertOptions = options
    return this
  }

  // DELETE initiation
  delete() {
    this.operation = 'DELETE'
    return this
  }

  // EXECUTE OPERATIONS
  async _execute() {
    if (this.operation === 'INSERT') {
      return this._executeInsert()
    }
    if (this.operation === 'UPDATE') {
      return this._executeUpdate()
    }
    if (this.operation === 'UPSERT') {
      return this._executeUpsert()
    }
    if (this.operation === 'DELETE') {
      return this._executeDelete()
    }
    return this._executeSelect()
  }

  // Execute SELECT
  async _executeSelect() {
    if (this.parityError) {
      return { data: null, error: this.parityError }
    }
    const activeTenantId = getActiveTenantId()
    
    // Auto-provision master data untuk tenant baru HANYA jika belum pernah di-provision (0ms check)
    if (activeTenantId && activeTenantId !== DEFAULT_TENANT_ID && (!this.store.provisionedTenants || !this.store.provisionedTenants.has(activeTenantId))) {
      this.store.ensureTenantMasterData(activeTenantId)
    }

    const table = this.store.getTable(this.tableName)
    let filteredResults = table.filter((row) => this.filters.every((f) => f(row)))

    const actor = getActiveActorContext()
    const hasActor = Boolean(actor && (actor.role || actor.tenant_id))

    // Automatic Row-Level Security (RLS) Isolation untuk Multi-Tenant Table
    if (isMultiTenantTable(this.tableName) && !this.bypassTenantIsolation) {
      // Lookup profil pengguna spesifik berbasis ID (autentikasi & session) tidak boleh terblokir tenant isolation
      if (this.tableName === 'profiles' && this.hasSpecificIdFilter) {
        // Izinkan identity lookup
      } else if (this.tableName === 'tenant_memberships') {
        const authUid = actor?.userId || this.store.getAuth()?.user?.id || null
        if ((!hasActor || actor.role !== 'Super Admin') && authUid) {
          filteredResults = filteredResults.filter((row) => row.user_id === authUid)
        }
      } else if (hasActor && actor.role !== 'Super Admin' && actor.tenant_id) {
        // Strict multi-tenant isolation under active actor context
        filteredResults = filteredResults.filter((row) => row.tenant_id === actor.tenant_id)
      } else if (!this.explicitTenantFilter) {
        filteredResults = filteredResults.filter((row) => {
          if (row.tenant_id) return row.tenant_id === activeTenantId
          // Data bawaan awal tanpa tenant_id hanya boleh terlihat oleh DEFAULT_TENANT_ID
          return activeTenantId === DEFAULT_TENANT_ID
        })
      }
    }

    const totalCount = filteredResults.length
    let results = [...filteredResults]

    // PR-3 & RBAC Branch Scoping Parity
    if (actor && actor.role === 'Kasir') {
      const sensitiveTables = [
        'journal_entries',
        'journal_entry_lines',
        'chart_of_accounts',
        'karyawan_cuci',
        'karyawan_kantor',
        'pos_balances',
        'v_pocket_balances',
        'cashflow',
        'intelligence_daily_snapshots',
        'bank_email_connections',
        'bank_account_bindings',
        'bank_email_messages',
        'bank_transaction_drafts',
      ]
      if (sensitiveTables.includes(this.tableName)) {
        return { data: [], error: null, count: 0 }
      }

      // P1-05: Server-side cost/HPP protection for Kasir on stok_barang
      if (this.tableName === 'stok_barang') {
        results = results.map((row) => {
          const copy = { ...row }
          delete copy.harga_beli
          delete copy.harga_satuan
          return copy
        })
      }

      const operationalTables = ['struk', 'cafe', 'carwash', 'pengeluaran', 'barang_masuk', 'barang_keluar', 'crm_loyalty_logs']
      if (actor.branchId && operationalTables.includes(this.tableName)) {
        // Operational tables do NOT allow NULL branch bypass
        results = results.filter((row) => row.branch_id === actor.branchId)
      } else if (actor.branchId) {
        results = results.filter((row) => {
          if (row.branch_id !== undefined && row.branch_id !== null) {
            return row.branch_id === actor.branchId
          }
          return true
        })
      }
    } else if (actor && actor.role === 'Admin' && actor.branchId) {
      // Admin Cabang: strictly scoped to own branch across finance & operational tables (no NULL bypass)
      const strictBranchTables = [
        'pos_balances',
        'v_pocket_balances',
        'bank_transaction_drafts',
        'cashflow',
        'pengeluaran',
        'struk',
        'cafe',
        'carwash',
        'stok_barang',
        'barang_masuk',
        'barang_keluar',
        'karyawan_cuci',
        'karyawan_kantor',
        'intelligence_daily_snapshots',
        'cashier_shift_closings',
        'crm_loyalty_logs',
        'customer_reward_claims',
      ]
      if (strictBranchTables.includes(this.tableName)) {
        results = results.filter((row) => row.branch_id === actor.branchId)
      } else if (this.tableName === 'profiles' && !this.hasSpecificIdFilter) {
        results = results.filter((row) => row.id === actor.userId || row.branch_id === actor.branchId)
      }
    }

    // Sorting
    if (this.sortFields.length > 0) {
      results.sort((a, b) => {
        for (const { column, ascending } of this.sortFields) {
          const valA = this._getValue(a, column)
          const valB = this._getValue(b, column)
          if (valA === valB) continue
          if (valA === undefined || valA === null) return ascending ? -1 : 1
          if (valB === undefined || valB === null) return ascending ? 1 : -1
          if (typeof valA === 'string' && typeof valB === 'string') {
            const cmp = valA.localeCompare(valB)
            if (cmp !== 0) return ascending ? cmp : -cmp
          } else {
            const cmp = valA < valB ? -1 : 1
            return ascending ? cmp : -cmp
          }
        }
        return 0
      })
    }

    // Range & Limit
    if (this.rangeOffsets) {
      results = results.slice(this.rangeOffsets.from, this.rangeOffsets.to + 1)
    } else if (this.limitCount !== null) {
      results = results.slice(0, this.limitCount)
    }

    // Auto populate joined relations if requested (hanya jika ada sintaks relasi seperti struk(...), cafe(...), dll.)
    if (this.selectedColumns && typeof this.selectedColumns === 'string') {
      const matchTenant = (item) => {
        if (this.bypassTenantIsolation || this.explicitTenantFilter) return true
        if (item.tenant_id) return item.tenant_id === activeTenantId
        return activeTenantId === DEFAULT_TENANT_ID
      }

      const wantsStrukRelation = /\bstruk(\s*\(|!)/i.test(this.selectedColumns)
      const wantsCafeRelation = /\bcafe(\s*\(|!)/i.test(this.selectedColumns)
      const wantsCarwashRelation = /\bcarwash(\s*\(|!)/i.test(this.selectedColumns)

      if (wantsStrukRelation) {
        const strukTable = this.store.getTable('struk').filter(matchTenant)
        const strukMap = new Map(strukTable.map((s) => [s.id_struk, s]))
        results = results.map((row) => ({
          ...row,
          struk: strukMap.get(row.id_struk) || null,
        }))
      }

      if (wantsCafeRelation) {
        const cafeTable = this.store.getTable('cafe').filter(matchTenant)
        const cafeByStruk = new Map()
        cafeTable.forEach((c) => {
          if (!cafeByStruk.has(c.id_struk)) cafeByStruk.set(c.id_struk, [])
          cafeByStruk.get(c.id_struk).push(c)
        })
        results = results.map((row) => ({
          ...row,
          cafe: cafeByStruk.get(row.id_struk) || [],
        }))
      }

      if (wantsCarwashRelation) {
        const cwTable = this.store.getTable('carwash').filter(matchTenant)
        const cwByStruk = new Map()
        cwTable.forEach((cw) => {
          if (!cwByStruk.has(cw.id_struk)) cwByStruk.set(cw.id_struk, [])
          cwByStruk.get(cw.id_struk).push(cw)
        })
        results = results.map((row) => ({
          ...row,
          carwash: cwByStruk.get(row.id_struk) || [],
        }))
      }
    }

    if (this.isSingle) {
      if (results.length === 0) {
        return { data: null, count: totalCount, error: { message: 'Row not found', code: 'PGRST116' } }
      }
      return { data: JSON.parse(JSON.stringify(results[0])), count: totalCount, error: null }
    }

    if (this.isMaybeSingle) {
      return { data: results.length > 0 ? JSON.parse(JSON.stringify(results[0])) : null, count: totalCount, error: null }
    }

    const resObj = { data: JSON.parse(JSON.stringify(results)), error: null }
    if (this.queryOptions?.count || this.rangeOffsets || this.limitCount !== null) {
      resObj.count = totalCount
    }
    return resObj
  }

  // Execute INSERT
  async _executeInsert() {
    const records = Array.isArray(this.payload) ? this.payload : [this.payload]
    const parityErr = this._validateMutationPayloads(records)
    if (parityErr) {
      return { data: null, error: parityErr }
    }
    const table = this.store.getTable(this.tableName)
    const inserted = []
    const activeTenantId = getActiveTenantId()

    if (activeTenantId && activeTenantId !== DEFAULT_TENANT_ID) {
      this.store.ensureTenantMasterData(activeTenantId)
    }

    const actorInsert = getActiveActorContext()
    if (actorInsert && actorInsert.role === 'Kasir') {
      const catalogTables = ['daftar_harga_menu', 'carwash_packages', 'resep', 'diskon', 'stok_barang']
      if (catalogTables.includes(this.tableName)) {
        return {
          data: null,
          error: new Error("[FORBIDDEN_ROLE_OPERATION] Role Kasir dilarang memodifikasi katalog/stok.")
        }
      }
      if (this.tableName === 'struk' && actorInsert.branchId) {
        for (const item of records) {
          if (item.branch_id && item.branch_id !== actorInsert.branchId) {
            return {
              data: null,
              error: new Error('[FORBIDDEN_BRANCH_OPERATION] Role Kasir dilarang mencatat transaksi untuk cabang lain.')
            }
          }
        }
      }
    }
    if (actorInsert && actorInsert.role === 'Admin' && actorInsert.branchId) {
      const branchLockedTables = ['pos_balances', 'cashflow', 'pengeluaran', 'struk', 'cafe', 'carwash', 'stok_barang', 'barang_masuk', 'barang_keluar']
      if (branchLockedTables.includes(this.tableName)) {
        for (const item of records) {
          if (item.branch_id !== undefined && item.branch_id !== actorInsert.branchId) {
            return {
              data: null,
              error: new Error('[FORBIDDEN_BRANCH_OPERATION] Admin Cabang dilarang membuat data untuk cabang lain.')
            }
          }
        }
      }
    }
    for (const item of records) {
      const effectiveTenant = item.tenant_id || (isMultiTenantTable(this.tableName) ? activeTenantId : undefined)
      const effectiveBranch =
        item.branch_id !== undefined
          ? item.branch_id
          : (effectiveTenant === DEFAULT_TENANT_ID ? DEFAULT_BRANCH_ID : `branch_${effectiveTenant || 'main'}_main`)

      // Validasi integritas kapabilitas bisnis model tenant (Defense-in-Depth)
      if (effectiveTenant) {
        const tenant = this.store.getTable('tenants').find(t => t.id === effectiveTenant)
        if (tenant && tenant.business_type) {
          const bType = String(tenant.business_type).toUpperCase()
          if (bType === 'CAFE' && (this.tableName === 'carwash' || this.tableName === 'carwash_packages')) {
            console.warn(`[LocalDB Engine] Constraint Violation: Tenant ${tenant.nama || effectiveTenant} bertipe CAFE dilarang mencatat ke tabel ${this.tableName}`)
            return {
              data: null,
              error: {
                message: `Constraint Violation: Tenant ${tenant.nama || effectiveTenant} adalah usaha bertipe CAFE dan tidak diizinkan mengakses transaksi carwash.`
              }
            }
          }
          if (bType === 'CARWASH' && (this.tableName === 'cafe' || this.tableName === 'daftar_harga_menu' || this.tableName === 'resep')) {
            console.warn(`[LocalDB Engine] Constraint Violation: Tenant ${tenant.nama || effectiveTenant} bertipe CARWASH dilarang mencatat ke tabel ${this.tableName}`)
            return {
              data: null,
              error: {
                message: `Constraint Violation: Tenant ${tenant.nama || effectiveTenant} adalah usaha bertipe CARWASH dan tidak diizinkan mengakses menu cafe / resep.`
              }
            }
          }
        }
      }

      const record = {
        tenant_id: effectiveTenant,
        branch_id: effectiveBranch,
        created_at: item.created_at || new Date().toISOString(),
        ...item,
        ...(effectiveTenant ? { tenant_id: effectiveTenant } : {}),
      }

      if (this.tableName === 'bank_email_connections') {
        record.normalized_email = normalizeEmailIdentity(record.email_address)
        record.status = record.status || 'CONNECTED'
        if (record.status !== 'DISCONNECTED') {
          const conflict = table.find(
            (c) =>
              c.tenant_id !== record.tenant_id &&
              c.status !== 'DISCONNECTED' &&
              (c.normalized_email === record.normalized_email ||
                (c.provider === (record.provider || 'GMAIL_OAUTH') && c.provider_account_id === record.provider_account_id))
          )
          if (conflict) {
            const memberships = this.store.getTable('tenant_memberships') || []
            const uid = actorInsert?.userId || this.store.getAuth()?.user?.id || null
            const sameOwner =
              actorInsert?.role === 'Super Admin' ||
              (uid &&
                memberships.some((m) => m.user_id === uid && m.tenant_id === record.tenant_id && String(m.role || '').toUpperCase() === 'OWNER') &&
                memberships.some((m) => m.user_id === uid && m.tenant_id === conflict.tenant_id && String(m.role || '').toUpperCase() === 'OWNER'))
            if (!sameOwner) {
              return {
                data: null,
                error: Object.assign(
                  new Error('EMAIL_ALREADY_BOUND_TO_OTHER_TENANT: Akun email ini sudah terhubung ke organisasi/toko lain di ERPPoss.'),
                  { code: '23505' }
                ),
              }
            }
          }
        }
      }

      if (this.tableName === 'pos_balances') {
        const dup = table.find(
          (p) =>
            p.tenant_id === record.tenant_id &&
            (p.branch_id ?? null) === (record.branch_id ?? null) &&
            String(p.pos || '').trim().toUpperCase() === String(record.pos || '').trim().toUpperCase()
        )
        if (dup) {
          return {
            data: null,
            error: Object.assign(new Error(`23505: Kantong "${record.pos}" sudah ada pada cabang ini.`), { code: '23505' }),
          }
        }
      }

      if (this.tableName === 'cashflow') {
        const pockets = this.store.getTable('pos_balances')
        if (record.pocket_id) {
          const match = pockets.find((p) => p.tenant_id === record.tenant_id && p.id === record.pocket_id)
          if (!match) {
            return {
              data: null,
              error: Object.assign(new Error('23503: FOREIGN_KEY_VIOLATION pocket_id tidak valid untuk tenant ini.'), { code: '23503' }),
            }
          }
          record.pos = match.pos
        } else if (record.pos) {
          const normPos = String(record.pos).trim().toUpperCase()
          let match = pockets.find(
            (p) =>
              p.tenant_id === record.tenant_id &&
              String(p.pos || '').trim().toUpperCase() === normPos &&
              (p.branch_id ?? null) === (record.branch_id ?? null)
          ) || pockets.find(
            (p) => p.tenant_id === record.tenant_id && String(p.pos || '').trim().toUpperCase() === normPos
          )
          if (!match && ['SALDO REKENING (N)', 'SALDO REKENING OPERASIONAL', 'SALDO REKENING N'].includes(normPos)) {
            match =
              pockets.find((p) => p.tenant_id === record.tenant_id && p.pos === 'SALDO REKENING Y') ||
              pockets.find((p) => p.tenant_id === record.tenant_id && String(p.tipe || 'BANK').toUpperCase() === 'BANK')
          }
          if (match) {
            record.pocket_id = match.id
            record.pos = match.pos
          }
        }
      }

      if (POSTGRES_UUID_PK_TABLES.has(this.tableName) && !record.id) {
        record.id = generateLocalUuid()
      } else if (!record.id && !record.id_struk && !record.id_detail && !record.id_transaksi && !record.id_pengeluaran && !record.id_cashflow && !record.id_bahan_baku && !record.id_menu && !record.id_resep) {
        record.id = `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      }

      table.push(record)
      inserted.push(record)
      this._applyTriggersOnInsert(record)
    }

    this.store.saveToStorage()
    return { data: Array.isArray(this.payload) ? inserted : inserted[0], error: null }
  }

  // Execute UPDATE
  async _executeUpdate() {
    const parityErr = this._validateMutationPayloads([this.payload])
    if (parityErr) {
      return { data: null, error: parityErr }
    }
    const table = this.store.getTable(this.tableName)
    const updated = []
    const activeTenantId = getActiveTenantId()

    const actorUpdate = getActiveActorContext()
    if (actorUpdate && actorUpdate.role === 'Kasir') {
      const catalogTables = ['daftar_harga_menu', 'carwash_packages', 'resep', 'diskon', 'stok_barang']
      if (catalogTables.includes(this.tableName)) {
        return {
          data: null,
          error: new Error("[FORBIDDEN_ROLE_OPERATION] Role Kasir dilarang memodifikasi katalog/stok.")
        }
      }
    }
    if (this.tableName === 'journal_entries') {
      const targetRows = table.filter((row) => this.filters.every((f) => f(row)))
      if (targetRows.some((r) => r.status === 'POSTED')) {
        return {
          data: null,
          error: new Error('[IMMUTABLE_POSTED_JOURNAL] Jurnal akuntansi berstatus POSTED bersifat immutable.')
        }
      }
    }
    table.forEach((row, idx) => {
      const hasActor = Boolean(actorUpdate && (actorUpdate.role || actorUpdate.tenant_id))
      let tenantMatch = false
      if (hasActor) {
        if (actorUpdate.role === 'Super Admin' || this.bypassTenantIsolation) {
          tenantMatch = true
        } else if (isMultiTenantTable(this.tableName)) {
          tenantMatch = row.tenant_id === (actorUpdate.tenant_id || activeTenantId)
        } else {
          tenantMatch = true
        }
      } else {
        tenantMatch = (this.bypassTenantIsolation || this.explicitTenantFilter || this.hasSpecificIdFilter || !isMultiTenantTable(this.tableName))
          ? true
          : (row.tenant_id ? row.tenant_id === activeTenantId : activeTenantId === DEFAULT_TENANT_ID)
      }

      if (tenantMatch && this.filters.every((f) => f(row))) {
        table[idx] = {
          ...row,
          ...this.payload,
          updated_at: new Date().toISOString(),
        }
        updated.push(table[idx])
        this._applyTriggersOnUpdate(table[idx], row)
      }
    })

    this.store.saveToStorage()
    return { data: updated, error: null }
  }

  // Execute UPSERT
  async _executeUpsert() {
    const table = this.store.getTable(this.tableName)
    const records = Array.isArray(this.payload) ? this.payload : [this.payload]
    const parityErr = this._validateMutationPayloads(records)
    if (parityErr) {
      return { data: null, error: parityErr }
    }
    const upserted = []

    const actorUpsert = getActiveActorContext()
    if (actorUpsert && actorUpsert.role === 'Kasir') {
      const catalogTables = ['daftar_harga_menu', 'carwash_packages', 'resep', 'diskon', 'stok_barang']
      if (catalogTables.includes(this.tableName)) {
        return {
          data: null,
          error: new Error("[FORBIDDEN_ROLE_OPERATION] Role Kasir dilarang memodifikasi katalog/stok.")
        }
      }
    }

    if (actorUpsert && actorUpsert.role !== 'Super Admin' && actorUpsert.tenant_id) {
      for (const item of records) {
        if (item.tenant_id && item.tenant_id !== actorUpsert.tenant_id) {
          return {
            data: null,
            error: new Error("[FORBIDDEN_CROSS_TENANT_MUTATION] Mutasi lintas tenant dilarang.")
          }
        }
      }
    }

    for (const item of records) {
      const keyField = item.id ? 'id' : (item.id_struk ? 'id_struk' : (item.id_transaksi ? 'id_transaksi' : 'id'))
      const matchIdx = table.findIndex((r) => r[keyField] && r[keyField] === item[keyField])

      if (matchIdx > -1) {
        table[matchIdx] = {
          ...table[matchIdx],
          ...item,
          updated_at: new Date().toISOString(),
        }
        upserted.push(table[matchIdx])
        this._applyTriggersOnUpdate(table[matchIdx], table[matchIdx])
      } else {
        const newRecord = {
          created_at: new Date().toISOString(),
          ...item,
        }
        if (POSTGRES_UUID_PK_TABLES.has(this.tableName) && !newRecord.id) {
          newRecord.id = generateLocalUuid()
        }
        table.push(newRecord)
        upserted.push(newRecord)
        this._applyTriggersOnInsert(newRecord)
      }
    }

    this.store.saveToStorage()
    return { data: Array.isArray(this.payload) ? upserted : upserted[0], error: null }
  }

  // Execute DELETE
  async _executeDelete() {
    if (this.parityError) {
      return { data: null, error: this.parityError }
    }
    const table = this.store.getTable(this.tableName)
    const remaining = []
    const deleted = []
    const activeTenantId = getActiveTenantId()

    const actorDelete = getActiveActorContext()
    if (actorDelete && actorDelete.role === 'Kasir') {
      const catalogTables = ['daftar_harga_menu', 'carwash_packages', 'resep', 'diskon', 'stok_barang']
      if (catalogTables.includes(this.tableName)) {
        return {
          data: null,
          error: new Error("[FORBIDDEN_ROLE_OPERATION] Role Kasir dilarang memodifikasi katalog/stok.")
        }
      }
    }
    if (this.tableName === 'journal_entries') {
      const targetRows = table.filter((row) => this.filters.every((f) => f(row)))
      if (targetRows.some((r) => r.status === 'POSTED')) {
        return {
          data: null,
          error: new Error('[IMMUTABLE_POSTED_JOURNAL] Jurnal akuntansi berstatus POSTED bersifat immutable.')
        }
      }
    }
    if (this.tableName === 'pos_balances') {
      const cashflows = this.store.getTable('cashflow')
      const candidateRows = table.filter((row) => this.filters.every((f) => f(row)))
      const referenced = candidateRows.find((pb) =>
        cashflows.some((cf) => cf.tenant_id === pb.tenant_id && cf.pocket_id === pb.id)
      )
      if (referenced) {
        return {
          data: null,
          error: Object.assign(
            new Error(`23503: FOREIGN_KEY_VIOLATION Kantong "${referenced.label || referenced.pos}" masih digunakan oleh transaksi cashflow dan tidak dapat dihapus permanen.`),
            { code: '23503' }
          ),
        }
      }
    }
    table.forEach((row) => {
      const hasActor = Boolean(actorDelete && (actorDelete.role || actorDelete.tenant_id))
      let tenantMatch = false
      if (hasActor) {
        if (actorDelete.role === 'Super Admin' || this.bypassTenantIsolation) {
          tenantMatch = true
        } else if (isMultiTenantTable(this.tableName)) {
          tenantMatch = row.tenant_id === (actorDelete.tenant_id || activeTenantId)
        } else {
          tenantMatch = true
        }
      } else {
        tenantMatch = (this.bypassTenantIsolation || this.explicitTenantFilter || this.hasSpecificIdFilter || !isMultiTenantTable(this.tableName))
          ? true
          : (row.tenant_id ? row.tenant_id === activeTenantId : activeTenantId === DEFAULT_TENANT_ID)
      }

      if (tenantMatch && this.filters.every((f) => f(row))) {
        deleted.push(row)
      } else {
        remaining.push(row)
      }
    })

    this.store.data[this.tableName] = remaining
    this.store.saveToStorage()
    return { data: deleted, error: null }
  }

  // TRIGGERS ON INSERT
  _applyTriggersOnInsert(record) {
    const activeTenantId = getActiveTenantId()
    const effectiveTenant = record.tenant_id || activeTenantId

    if (this.tableName === 'cafe') {
      const recipes = this.store.getTable('resep').filter((r) => 
        (r.tenant_id ? r.tenant_id === effectiveTenant : true) &&
        ((record.menu_id && r.menu_id === record.menu_id) ||
         (!r.menu_id && r.nama_menu === record.nama_menu))
      )
      const stockTable = this.store.getTable('stok_barang')
      const bkTable = this.store.getTable('barang_keluar')

      if (recipes.length > 0) {
        recipes.forEach((rec) => {
          const qtyOut = (parseFloat(rec.jumlah) || 0) * (parseInt(record.qty, 10) || 1)
          bkTable.push({
            id_keluar: `bk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenant_id: effectiveTenant,
            branch_id: record.branch_id || DEFAULT_BRANCH_ID,
            id_detail: record.id_detail,
            id_bahan_baku: rec.stok_barang_id || rec.id_bahan_baku,
            nama_bahan_baku: rec.nama_bahan,
            jumlah_keluar: qtyOut,
            tanggal: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
          })

          const stockItem = stockTable.find((s) => 
            (s.tenant_id ? s.tenant_id === effectiveTenant : true) &&
            ((rec.stok_barang_id && s.id === rec.stok_barang_id) ||
             s.id_bahan_baku === rec.id_bahan_baku)
          )
          if (stockItem) {
            stockItem.stok = (parseFloat(stockItem.stok) || 0) - qtyOut
            if (stockItem.stok_akhir !== undefined) {
              stockItem.stok_akhir = (parseFloat(stockItem.stok_akhir) || 0) - qtyOut
            }
            stockItem.updated_at = new Date().toISOString()
          }
        })
      } else {
        // Direct retail / merchandise deduction
        const directStock = stockTable.find((s) => 
          (s.tenant_id ? s.tenant_id === effectiveTenant : true) &&
          ((s.id_barang && s.id_barang === record.id_barang) ||
          (s.id_bahan_baku && s.id_bahan_baku === record.id_barang) ||
          (s.nama_produk && s.nama_produk.toLowerCase() === record.nama_menu?.toLowerCase()) ||
          (s.nama_barang && s.nama_barang.toLowerCase() === record.nama_menu?.toLowerCase()))
        )
        if (directStock) {
          const qtyOut = parseInt(record.qty, 10) || 1
          directStock.stok = (parseFloat(directStock.stok) || 0) - qtyOut
          if (directStock.stok_akhir !== undefined) {
            directStock.stok_akhir = (parseFloat(directStock.stok_akhir) || 0) - qtyOut
          }
          directStock.updated_at = new Date().toISOString()

          bkTable.push({
            id_keluar: `bk_mch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenant_id: effectiveTenant,
            branch_id: record.branch_id || DEFAULT_BRANCH_ID,
            id_detail: record.id_detail,
            id_bahan_baku: directStock.id_bahan_baku || directStock.id_barang,
            nama_bahan_baku: directStock.nama_produk || directStock.nama_barang || record.nama_menu,
            jumlah_keluar: qtyOut,
            tanggal: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
          })
        }
      }
    }

    if (this.tableName === 'carwash') {
      const pkgName = record.paket || record.layanan || 'PAKET CUCI BIASA'
      const recipes = this.store.getTable('resep').filter((r) => 
        (r.tenant_id ? r.tenant_id === effectiveTenant : effectiveTenant === DEFAULT_TENANT_ID) &&
        (r.nama_menu === pkgName || 
        r.nama_menu?.toLowerCase() === pkgName.toLowerCase() ||
        (record.layanan && r.nama_menu?.toLowerCase() === record.layanan?.toLowerCase()))
      )
      const stockTable = this.store.getTable('stok_barang')
      const bkTable = this.store.getTable('barang_keluar')

      if (recipes.length > 0) {
        recipes.forEach((rec) => {
          const qtyOut = parseFloat(rec.jumlah_dibutuhkan || rec.jumlah) || 0
          bkTable.push({
            id_keluar: `bk_cw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            tenant_id: effectiveTenant,
            branch_id: record.branch_id || DEFAULT_BRANCH_ID,
            id_detail: record.id_antrean || record.id_struk || `cw_${Date.now()}`,
            id_bahan_baku: rec.id_bahan_baku,
            nama_bahan_baku: rec.nama_bahan,
            jumlah_keluar: qtyOut,
            tanggal: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
          })

          const stockItem = stockTable.find((s) => 
            (s.tenant_id ? s.tenant_id === effectiveTenant : effectiveTenant === DEFAULT_TENANT_ID) &&
            ((s.id_bahan_baku && s.id_bahan_baku === rec.id_bahan_baku) ||
            (s.id_barang && s.id_barang === rec.id_bahan_baku) ||
            (s.nama_bahan && s.nama_bahan.toLowerCase() === rec.nama_bahan?.toLowerCase()) ||
            (s.nama_barang && s.nama_barang.toLowerCase() === rec.nama_bahan?.toLowerCase()))
          )
          if (stockItem) {
            stockItem.stok = (parseFloat(stockItem.stok) || 0) - qtyOut
            if (stockItem.stok_akhir !== undefined) {
              stockItem.stok_akhir = (parseFloat(stockItem.stok_akhir) || 0) - qtyOut
            }
            stockItem.updated_at = new Date().toISOString()
          }
        })
      }
    }

    if (this.tableName === 'barang_masuk') {
      const stockTable = this.store.getTable('stok_barang')
      const itemId = record.id_barang || record.id_bahan_baku
      const stockItem = stockTable.find((s) => s.id_barang === itemId || s.id_bahan_baku === itemId)
      if (stockItem) {
        const qtyMasuk = parseFloat(record.jumlah_masuk || record.qty || 0)
        const unitPrice = parseFloat(record.harga_satuan || record.harga_beli || 0)
        const currentStock = parseFloat(stockItem.stok_akhir !== undefined ? stockItem.stok_akhir : stockItem.stok || 0)
        const currentCost = parseFloat(stockItem.harga_beli || stockItem.hpp || 0)

        const mac = calculateMovingAverageCost({
          currentStock,
          currentCost,
          incomingQty: qtyMasuk,
          incomingUnitPrice: unitPrice,
        })

        if (stockItem.stok !== undefined) stockItem.stok = mac.newStock
        if (stockItem.stok_akhir !== undefined) stockItem.stok_akhir = mac.newStock
        stockItem.harga_beli = mac.newCost
        if (stockItem.hpp !== undefined) stockItem.hpp = mac.newCost
        stockItem.updated_at = new Date().toISOString()

        const totalAmount = parseFloat(record.total_harga) || (qtyMasuk * unitPrice)
        if (totalAmount > 0) {
          const method = String(record.metode_bayar || 'CASH').toUpperCase()
          const creditAcc = resolveAccountForPaymentMethod(method, this.store.getTable('metode_bayar'))

          this.store.postJournalEntry({
            tenant_id: record.tenant_id || DEFAULT_TENANT_ID,
            branch_id: record.branch_id || DEFAULT_BRANCH_ID,
            date: record.tanggal || new Date().toISOString().split('T')[0],
            memo: `Pembelian Bahan Baku: ${stockItem.nama_barang || stockItem.nama_bahan || 'Barang'} (${qtyMasuk})`,
            source_type: 'barang_masuk',
            source_id: record.id_barang_masuk,
            lines: [
              { account_id: 'acc_1300', debit: totalAmount, credit: 0, memo: 'Persediaan Bertambah' },
              { account_id: creditAcc, debit: 0, credit: totalAmount, memo: `Pembayaran via ${method}` },
            ],
          })
        }
      }
    }

    if (this.tableName === 'struk' && record.status_bayar === 'Selesai') {
      if (this.store.syncStrukToCashflow) {
        this._syncStrukToFinance(record)
      }
    }

    if (this.tableName === 'pengeluaran') {
      this._syncPengeluaranToFinance(record)
      this._syncExpenseToInventory(record)
    }

    if (this.tableName === 'cashflow' && (record.id_barang || record.id_bahan_baku)) {
      this._syncExpenseToInventory(record)
    }
  }

  // TRIGGERS ON UPDATE
  _applyTriggersOnUpdate(newRow, oldRow) {
    if (this.tableName === 'struk' && newRow.status_bayar === 'Selesai' && oldRow.status_bayar !== 'Selesai') {
      if (this.store.syncStrukToCashflow) {
        this._syncStrukToFinance(newRow)
      }
    }

    if (this.tableName === 'struk' && newRow.status_bayar === 'Batal' && oldRow.status_bayar !== 'Batal') {
      this._rollbackVoidStruk(newRow)
    }

    if (this.tableName === 'cafe' && newRow.status === 'Batal' && oldRow.status !== 'Batal') {
      this._restoreCafeStock(newRow)
    }

    if (this.tableName === 'carwash' && newRow.status === 'Batal' && oldRow.status !== 'Batal') {
      this._restoreCarwashStock(newRow)
    }

    if (this.tableName === 'daftar_harga_menu') {
      const newMenuName = newRow.daftar_menu || newRow.nama_menu
      const oldMenuName = oldRow.daftar_menu || oldRow.nama_menu
      if (newMenuName && newMenuName !== oldMenuName && newRow.id) {
        this.store.getTable('resep').forEach((r) => {
          if (r.menu_id === newRow.id && (!r.tenant_id || r.tenant_id === newRow.tenant_id)) {
            r.nama_menu = newMenuName
            r.daftar_menu = newMenuName
          }
        })
      }
    }

    if (this.tableName === 'stok_barang') {
      const newStockName = newRow.nama_produk || newRow.nama_barang
      const oldStockName = oldRow.nama_produk || oldRow.nama_barang
      if (newStockName && newStockName !== oldStockName && newRow.id) {
        this.store.getTable('resep').forEach((r) => {
          if (r.stok_barang_id === newRow.id && (!r.tenant_id || r.tenant_id === newRow.tenant_id)) {
            r.nama_bahan = newStockName
            r.nama_bahan_baku = newStockName
          }
        })
      }
    }

    if (this.tableName === 'pos_balances') {
      if (newRow.pos && newRow.pos !== oldRow.pos && newRow.id) {
        this.store.getTable('cashflow').forEach((cf) => {
          if (cf.pocket_id === newRow.id && (!cf.tenant_id || cf.tenant_id === newRow.tenant_id)) {
            cf.pos = newRow.pos
          }
        })
      }
    }
  }

  _rollbackVoidStruk(struk) {
    // 1. Revert cashflow
    const cashflowTable = this.store.getTable('cashflow')
    const cfIdx = cashflowTable.findIndex((c) => c.id_sumber === struk.id_struk)
    if (cfIdx !== -1) {
      cashflowTable.splice(cfIdx, 1)
    }

    // 2. Revert journal entry
    const jeTable = this.store.getTable('journal_entries')
    const jeIdx = jeTable.findIndex((j) => j.source_id === struk.id_struk)
    if (jeIdx !== -1) {
      jeTable.splice(jeIdx, 1)
    }

    // 3. Restore all cafe items for this struk
    const cafeTable = this.store.getTable('cafe')
    const items = cafeTable.filter((c) => c.id_struk === struk.id_struk)
    items.forEach((item) => {
      this._restoreCafeStock(item)
    })

    // 4. Restore all carwash chemical items for this struk
    const cwTable = this.store.getTable('carwash')
    const cwItems = cwTable.filter((c) => c.id_struk === struk.id_struk)
    cwItems.forEach((cw) => {
      this._restoreCarwashStock(cw)
    })
  }

  _restoreCafeStock(cafeItem) {
    const effectiveTenant = cafeItem.tenant_id || getActiveTenantId()
    const recipes = this.store.getTable('resep').filter((r) => 
      (r.tenant_id ? r.tenant_id === effectiveTenant : true) &&
      r.nama_menu === cafeItem.nama_menu
    )
    const stockTable = this.store.getTable('stok_barang')
    const bkTable = this.store.getTable('barang_keluar')

    if (recipes.length > 0) {
      recipes.forEach((rec) => {
        const qtyOut = (parseFloat(rec.jumlah) || 0) * (parseInt(cafeItem.qty, 10) || 1)
        const stockItem = stockTable.find((s) => 
          (s.tenant_id ? s.tenant_id === effectiveTenant : true) &&
          s.id_bahan_baku === rec.id_bahan_baku
        )
        if (stockItem) {
          stockItem.stok = (parseFloat(stockItem.stok) || 0) + qtyOut
          if (stockItem.stok_akhir !== undefined) {
            stockItem.stok_akhir = (parseFloat(stockItem.stok_akhir) || 0) + qtyOut
          }
          stockItem.updated_at = new Date().toISOString()
        }
      })
    } else {
      // Direct merchandise restore
      const directStock = stockTable.find((s) => 
        (s.tenant_id ? s.tenant_id === effectiveTenant : true) &&
        ((s.id_barang && s.id_barang === cafeItem.id_barang) ||
        (s.id_bahan_baku && s.id_bahan_baku === cafeItem.id_barang) ||
        (s.nama_produk && s.nama_produk.toLowerCase() === cafeItem.nama_menu?.toLowerCase()) ||
        (s.nama_barang && s.nama_barang.toLowerCase() === cafeItem.nama_menu?.toLowerCase()))
      )
      if (directStock) {
        const qtyOut = parseInt(cafeItem.qty, 10) || 1
        directStock.stok = (parseFloat(directStock.stok) || 0) + qtyOut
        if (directStock.stok_akhir !== undefined) {
          directStock.stok_akhir = (parseFloat(directStock.stok_akhir) || 0) + qtyOut
        }
        directStock.updated_at = new Date().toISOString()
      }
    }

    if (cafeItem.id_detail) {
      const bkIdx = bkTable.findIndex((b) => b.id_detail === cafeItem.id_detail)
      if (bkIdx !== -1) {
        bkTable.splice(bkIdx, 1)
      }
    }
  }

  _restoreCarwashStock(cwItem) {
    const pkgName = cwItem.paket || cwItem.layanan || 'PAKET CUCI BIASA'
    const recipes = this.store.getTable('resep').filter((r) => 
      r.nama_menu === pkgName || 
      r.nama_menu?.toLowerCase() === pkgName.toLowerCase() ||
      (cwItem.layanan && r.nama_menu?.toLowerCase() === cwItem.layanan?.toLowerCase())
    )
    const stockTable = this.store.getTable('stok_barang')
    const bkTable = this.store.getTable('barang_keluar')

    if (recipes.length > 0) {
      recipes.forEach((rec) => {
        const qtyOut = parseFloat(rec.jumlah_dibutuhkan || rec.jumlah) || 0
        const stockItem = stockTable.find((s) => 
          (s.id_bahan_baku && s.id_bahan_baku === rec.id_bahan_baku) ||
          (s.id_barang && s.id_barang === rec.id_bahan_baku) ||
          (s.nama_bahan && s.nama_bahan.toLowerCase() === rec.nama_bahan?.toLowerCase()) ||
          (s.nama_barang && s.nama_barang.toLowerCase() === rec.nama_bahan?.toLowerCase())
        )
        if (stockItem) {
          stockItem.stok = (parseFloat(stockItem.stok) || 0) + qtyOut
          if (stockItem.stok_akhir !== undefined) {
            stockItem.stok_akhir = (parseFloat(stockItem.stok_akhir) || 0) + qtyOut
          }
          stockItem.updated_at = new Date().toISOString()
        }
      })
    }

    const detailId = cwItem.id_antrean || cwItem.id_struk
    if (detailId) {
      const bkIdx = bkTable.findIndex((b) => b.id_detail === detailId)
      if (bkIdx !== -1) {
        bkTable.splice(bkIdx, 1)
      }
    }
  }

  _syncStrukToFinance(struk) {
    const activeTenantId = getActiveTenantId()
    const effectiveTenant = struk.tenant_id || activeTenantId
    const effectiveBranch = struk.branch_id || (effectiveTenant === DEFAULT_TENANT_ID ? DEFAULT_BRANCH_ID : `branch_${effectiveTenant}_main`)

    const cashflowTable = this.store.getTable('cashflow')
    const exists = cashflowTable.find((c) => c.id_sumber === struk.id_struk)
    const amount = parseFloat(struk.total_tagihan) || 0
    const pos = struk.metode_bayar === 'QRIS' ? 'SALDO REKENING Y' : 'SALDO CASH'
    const parseLocalOrDate = (val) => {
      if (!val) return null
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim()
      try {
        const d = new Date(val)
        return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA')
      } catch (_) {
        return null
      }
    }
    const settlementDate = (struk.waktu_dibayar ? parseLocalOrDate(struk.waktu_dibayar) : null) || struk.tanggal || new Date().toLocaleDateString('en-CA')

    if (!exists && amount > 0) {
      cashflowTable.push({
        id_cashflow: `cf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: effectiveTenant,
        branch_id: effectiveBranch,
        id_sumber: struk.id_struk,
        tanggal: settlementDate,
        keterangan_transaksi: `Pemasukan Kasir (${struk.kasir}) - Struk ${struk.id_struk?.substring(0, 8)}`,
        jenis: 'Pemasukan',
        pemasukan: amount,
        pengeluaran: 0.0,
        pos,
        created_at: new Date().toISOString(),
      })

      const debitAcc = resolveAccountForPaymentMethod(struk.metode_bayar, this.store.getTable('metode_bayar'))
      this.store.postJournalEntry({
        tenant_id: effectiveTenant,
        branch_id: effectiveBranch,
        date: settlementDate,
        memo: `Penjualan POS Kasir (${struk.kasir}) - Struk ${struk.id_struk?.substring(0, 8)}`,
        source_type: 'struk',
        source_id: struk.id_struk,
        lines: [
          { account_id: debitAcc, debit: amount, credit: 0, memo: `Penerimaan Kas/Bank via ${struk.metode_bayar}` },
          { account_id: 'acc_4001', debit: 0, credit: amount, memo: 'Pendapatan Penjualan POS Cafe & Layanan' },
        ],
      })
    }
  }

  _syncPengeluaranToFinance(exp) {
    const activeTenantId = getActiveTenantId()
    const effectiveTenant = exp.tenant_id || activeTenantId
    const effectiveBranch = exp.branch_id || (effectiveTenant === DEFAULT_TENANT_ID ? DEFAULT_BRANCH_ID : `branch_${effectiveTenant}_main`)

    const cashflowTable = this.store.getTable('cashflow')
    const exists = cashflowTable.find((c) => c.id_sumber === exp.id_pengeluaran)
    const amount = parseFloat(exp.nominal || exp.total_harga || exp.pengeluaran || 0)

    if (!exists && amount > 0) {
      cashflowTable.push({
        id_cashflow: `cf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: effectiveTenant,
        branch_id: effectiveBranch,
        id_sumber: exp.id_pengeluaran,
        tanggal: exp.tanggal || new Date().toISOString().split('T')[0],
        keterangan_transaksi: `Pengeluaran ${exp.jenis || 'Umum'} (${exp.kategori || '-'}): ${exp.nama_pengeluaran || ''}`,
        jenis: exp.jenis || 'Beban',
        kategori: exp.kategori || 'Operasional',
        pemasukan: 0.0,
        pengeluaran: amount,
        pos: 'SALDO CASH',
        created_at: new Date().toISOString(),
      })

      // Cari pemetaan akun dari master_categories jika ada
      const masterCat = (this.store.getTable('master_categories') || []).find(
        (m) => m.nama_kategori?.toLowerCase() === (exp.kategori || '').toLowerCase()
      )
      const debitAccountId = masterCat?.account_id || 'acc_6004'

      this.store.postJournalEntry({
        tenant_id: exp.tenant_id,
        branch_id: exp.branch_id,
        date: exp.tanggal,
        memo: `Pengeluaran: ${exp.nama_pengeluaran || exp.kategori}`,
        source_type: 'pengeluaran',
        source_id: exp.id_pengeluaran,
        lines: [
          { account_id: debitAccountId, debit: amount, credit: 0, memo: `Beban ${exp.kategori || 'Operasional'}` },
          { account_id: 'acc_1001', debit: 0, credit: amount, memo: 'Pengeluaran Kas Tunai' },
        ],
      })
    }
  }

  _syncExpenseToInventory(exp) {
    const rawItemId = exp.id_barang || exp.id_bahan_baku
    if (!rawItemId) return

    const stockTable = this.store.getTable('stok_barang')
    const stockItem = stockTable.find(
      (s) =>
        (!exp.tenant_id || !s.tenant_id || s.tenant_id === exp.tenant_id) &&
        (s.id === rawItemId || s.id_barang === rawItemId || s.id_bahan_baku === rawItemId)
    )
    if (!stockItem) return

    const qty = parseFloat(exp.qty || exp.jumlah || 1)
    const totalAmount = parseFloat(exp.nominal || exp.pengeluaran || exp.total_harga || 0)
    const unitPrice = qty > 0 ? (totalAmount / qty) : 0

    const currentStock = parseFloat(stockItem.stok_akhir !== undefined ? stockItem.stok_akhir : stockItem.stok || 0)
    const currentCost = parseFloat(stockItem.harga_beli || stockItem.hpp || 0)

    const mac = calculateMovingAverageCost({
      currentStock,
      currentCost,
      incomingQty: qty,
      incomingUnitPrice: unitPrice,
    })

    if (stockItem.stok !== undefined) stockItem.stok = mac.newStock
    if (stockItem.stok_akhir !== undefined) stockItem.stok_akhir = mac.newStock
    stockItem.harga_beli = mac.newCost
    if (stockItem.hpp !== undefined) stockItem.hpp = mac.newCost
    stockItem.updated_at = new Date().toISOString()

    // Catat ke tabel barang_masuk
    const bmTable = this.store.getTable('barang_masuk')
    bmTable.push({
      id_barang_masuk: `bm_exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: exp.tenant_id || DEFAULT_TENANT_ID,
      branch_id: exp.branch_id || DEFAULT_BRANCH_ID,
      id_barang: rawItemId,
      id_bahan_baku: rawItemId,
      nama_barang: stockItem.nama_barang || stockItem.nama_bahan || exp.nama_pengeluaran,
      jumlah_masuk: qty,
      harga_satuan: unitPrice,
      total_harga: totalAmount,
      tanggal: exp.tanggal || new Date().toISOString().split('T')[0],
      metode_bayar: exp.pos === 'SALDO CASH' ? 'CASH' : 'BANK',
      created_at: new Date().toISOString(),
    })
  }

  // Thenable for Promise resolution
  then(resolve, reject) {
    return this._execute().then(resolve, reject)
  }

  catch(reject) {
    return this._execute().catch(reject)
  }

  finally(callback) {
    return this._execute().finally(callback)
  }
}

// Client Factory compatible with Supabase Interface
export const createLocalClient = (options = {}) => {
  if (options && typeof options.strictPostgresParity === 'boolean') {
    localDbStore.setStrictPostgresParity(options.strictPostgresParity)
  }
  const authListeners = []

  const glService = new GeneralLedgerService(localDbStore)

  return {
    isLocal: true,
    localDb: {
      store: localDbStore,
      gl: glService,
    },

    from(tableName) {
      return new LocalQueryBuilder(localDbStore, tableName)
    },

    auth: {
      async getSession() {
        const session = localDbStore.authSession
        return { data: { session }, error: null }
      },

      async getUser() {
        const session = localDbStore.authSession
        return { data: { user: session ? session.user : null }, error: null }
      },

      async signInWithPassword({ email, password }) {
        if (!email || !String(email).trim()) {
          return { data: { user: null, session: null }, error: new Error('Username atau email wajib diisi.') }
        }
        if (!password || !String(password).trim()) {
          return { data: { user: null, session: null }, error: new Error('Password wajib diisi.') }
        }

        const profiles = localDbStore.getTable('profiles')
        const cleanInput = (email || '').trim().toLowerCase()
        const cleanPassword = (password || '').trim()
        const usernamePart = cleanInput.includes('@') ? cleanInput.split('@')[0] : cleanInput
        const baseUsername = usernamePart.split('.')[0]
        const normalizedEmail = cleanInput.includes('@') ? cleanInput : `${cleanInput}@jb.local`
        const currentTenantId = getActiveTenantId()

        // Hierarki pencarian profil presisi:
        // 1. Prioritas utama: Kecocokan eksak email
        let profile = profiles.find((p) => (p.email || '').toLowerCase() === cleanInput)

        // 2. Prioritas kedua: Kecocokan username part terhadap email (termasuk @pos.internal, @jb.local, @relaypos.com)
        if (!profile) {
          const candidates = profiles.filter((p) => {
            const pEmail = (p.email || '').toLowerCase()
            const pUserPart = pEmail.includes('@') ? pEmail.split('@')[0] : pEmail
            const pBaseUser = pUserPart.split('.')[0]
            return (
              pUserPart === usernamePart ||
              pBaseUser === baseUsername ||
              pEmail === `${usernamePart}@relaypos.com` ||
              pEmail === `${usernamePart}@jb.local` ||
              pEmail === normalizedEmail
            )
          })
          profile =
            candidates.find((p) => currentTenantId && p.tenant_id === currentTenantId && p.is_active !== false) ||
            candidates.find((p) => currentTenantId && p.tenant_id === currentTenantId) ||
            candidates.find((p) => p.is_active !== false) ||
            candidates[0] ||
            null
        }

        // 3. Prioritas ketiga: Nama pengguna eksak
        if (!profile) {
          profile = profiles.find((p) => {
            const pName = (p.nama || '').trim().toLowerCase()
            return pName === cleanInput || pName === usernamePart
          })
        }

        // C1 Fix: Reject unknown users immediately - NO arbitrary role guessing!
        if (!profile) {
          return { data: { user: null, session: null }, error: new Error('Pengguna tidak ditemukan.') }
        }

        // Reject deactivated accounts (Soft Delete Opsi A)
        if (profile.is_active === false) {
          return {
            data: { user: null, session: null },
            error: new Error('ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'),
          }
        }

        // C1 Fix: Verify password hash securely with universal demo fallback
        const salt = profile.salt || DEFAULT_SALT
        const expectedHash = profile.password_hash || DEFAULT_DEMO_PASSWORD_HASH
        const inputHash = await hashPassword(cleanPassword, salt)

        // Verifikasi fleksibel & tangguh:
        // 1. Hash cocok dengan expectedHash (untuk user biasa atau password kustom yang sudah diganti)
        // 2. ATAU jika password adalah default demo 'password123' dan akun masih menggunakan hash bawaan (isDefaultHash)
        const isDemoPassword = cleanPassword === 'password123'
        const isDefaultHash = expectedHash === DEFAULT_DEMO_PASSWORD_HASH || !profile.password_hash

        const isMatch = (inputHash === expectedHash) || (isDemoPassword && isDefaultHash)

        if (!isMatch) {
          return { data: { user: null, session: null }, error: new Error('Kata sandi salah.') }
        }

        const userObj = {
          id: profile.id,
          email: profile.email || normalizedEmail,
          role: profile.role,
          tenant_id: profile.tenant_id || DEFAULT_TENANT_ID,
          user_metadata: {
            nama: profile.nama,
            role: profile.role,
            tenant_id: profile.tenant_id || DEFAULT_TENANT_ID,
          },
        }

        const session = {
          user: userObj,
          access_token: 'local-jwt-token-erp',
          token_type: 'bearer',
          expires_in: 86400,
        }

        localDbStore.saveAuth(session)
        authListeners.forEach((fn) => fn('SIGNED_IN', session))
        return { data: { user: userObj, session }, error: null }
      },

      async signOut() {
        localDbStore.saveAuth(null)
        authListeners.forEach((fn) => fn('SIGNED_OUT', null))
        return { error: null }
      },

      onAuthStateChange(callback) {
        authListeners.push(callback)
        setTimeout(() => {
          callback(localDbStore.authSession ? 'INITIAL_SESSION' : 'SIGNED_OUT', localDbStore.authSession)
        }, 10)
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                const idx = authListeners.indexOf(callback)
                if (idx > -1) authListeners.splice(idx, 1)
              },
            },
          },
        }
      },

      async signUp({ email, password, options = {} }) {
        if (!email || !String(email).trim()) {
          return { data: { user: null }, error: new Error('Email atau username wajib diisi.') }
        }
        if (!password || !String(password).trim()) {
          return { data: { user: null }, error: new Error('Password wajib diisi.') }
        }

        const currentActiveTenant = getActiveTenantId() || DEFAULT_TENANT_ID
        const targetTenantId = options.data?.tenant_id || currentActiveTenant
        const targetBranchId = options.data?.branch_id || `branch_${targetTenantId}_main`
        const tenants = localDbStore.getTable('tenants') || []
        const tenantObj = tenants.find((t) => t.id === targetTenantId)
        const tenantSlug = (
          tenantObj?.slug ||
          String(targetTenantId)
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 16) ||
          'default'
        )

        const cleanEmail = email.trim().toLowerCase()
        const profiles = localDbStore.getTable('profiles')

        let normalizedEmail = cleanEmail
        let username = cleanEmail.split('@')[0]
        if (!cleanEmail.includes('@') || cleanEmail.endsWith('@jb.local')) {
          username = cleanEmail.split('@')[0].replace(/[^a-z0-9._-]/g, '')
          const duplicateInTenant = profiles.find((p) => {
            if (p.tenant_id !== targetTenantId) return false
            const pEmail = (p.email || '').toLowerCase()
            const pBaseUser = pEmail.split('@')[0].split('.')[0]
            return (
              pEmail === `${username}@jb.local` ||
              pEmail === `${username}.${tenantSlug}@pos.internal` ||
              pBaseUser === username
            )
          })
          if (duplicateInTenant) {
            return {
              data: { user: null },
              error: new Error(`DUPLICATE_USER: Username "${username}" sudah digunakan oleh staf lain di toko Anda.`),
            }
          }
          normalizedEmail = `${username}.${tenantSlug}@pos.internal`
        }

        const existing = profiles.find((p) => p.email?.toLowerCase() === normalizedEmail)
        if (existing) {
          return { data: { user: null }, error: new Error('Email/Username sudah terdaftar.') }
        }

        const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        const cleanNama = (options.data?.nama || username).trim().toUpperCase()
        const allowedStaffRoles = ['Kasir', 'Admin', 'Admin Pusat', 'Owner', 'Staff Kantor', 'Karyawan Cuci']
        const role = allowedStaffRoles.includes(options.data?.role) ? options.data.role : 'Kasir'

        const salt = DEFAULT_SALT
        const password_hash = await hashPassword(password, salt)

        const profileRecord = {
          id: newUserId,
          tenant_id: targetTenantId,
          branch_id: targetBranchId,
          nama: cleanNama,
          email: normalizedEmail,
          role,
          is_active: true,
          password_hash,
          salt,
          created_at: new Date().toISOString(),
        }

        profiles.push(profileRecord)

        // Atomic sync to kasir table (when role === 'Kasir')
        if (role === 'Kasir') {
          const kasirTable = localDbStore.getTable('kasir')
          const existingKasir = kasirTable.find(
            (k) => k.tenant_id === targetTenantId && (k.nama || '').trim().toUpperCase() === cleanNama
          )
          if (existingKasir) {
            existingKasir.is_active = true
          } else {
            kasirTable.push({
              nama: cleanNama,
              tenant_id: targetTenantId,
              branch_id: targetBranchId,
              is_active: true,
              created_at: new Date().toISOString(),
            })
          }
        }

        // Atomic sync to karyawan_kantor table
        const kkTable = localDbStore.getTable('karyawan_kantor')
        const existingKk = kkTable.find(
          (k) => k.tenant_id === targetTenantId && (k.nama || '').trim().toUpperCase() === cleanNama
        )
        if (existingKk) {
          existingKk.role = role
          existingKk.email = normalizedEmail
          existingKk.source = 'staff_registration'
          existingKk.is_active = true
          existingKk.status = 'Aktif'
        } else {
          kkTable.push({
            id: `kk_${newUserId}`,
            id_karyawan: `kk_auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            nama: cleanNama,
            role,
            email: normalizedEmail,
            source: 'staff_registration',
            is_active: true,
            status: 'Aktif',
            tenant_id: targetTenantId,
            branch_id: targetBranchId,
            created_at: new Date().toISOString(),
          })
        }

        localDbStore.saveToStorage()

        const userObj = {
          id: newUserId,
          email: normalizedEmail,
          username,
          nama: cleanNama,
          role,
          tenant_id: profileRecord.tenant_id,
          branch_id: profileRecord.branch_id,
          user_metadata: { nama: cleanNama, username, role, tenant_id: profileRecord.tenant_id },
        }

        return { data: { user: userObj }, error: null }
      },

      async signUpOwner({ email, password, nama, tenantName, businessType = 'HYBRID' }) {
        if (!email || !String(email).trim()) {
          return { data: { user: null, session: null }, error: new Error('Email wajib diisi.') }
        }
        if (!password || !String(password).trim() || password.length < 8) {
          return { data: { user: null, session: null }, error: new Error('Password minimal 8 karakter.') }
        }
        if (!tenantName || !String(tenantName).trim()) {
          return { data: { user: null, session: null }, error: new Error('Nama toko/usaha wajib diisi.') }
        }

        const cleanEmail = email.trim().toLowerCase()
        const profiles = localDbStore.getTable('profiles')
        const existing = profiles.find((p) => p.email?.toLowerCase() === cleanEmail)
        if (existing) {
          return { data: { user: null, session: null }, error: new Error('Email ini sudah terdaftar.') }
        }

        const cleanType = ['HYBRID', 'CARWASH', 'CAFE'].includes(String(businessType).toUpperCase())
          ? String(businessType).toUpperCase()
          : 'HYBRID'

        const randomSuffix = Math.random().toString(36).substring(2, 7)
        const newTenantId = `tenant_${Date.now()}_${randomSuffix}`
        const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `toko-${randomSuffix}`

        // 1. Buat record tenant
        const newTenant = {
          id: newTenantId,
          nama: tenantName.trim(),
          slug,
          business_type: cleanType,
          plan: 'TRIAL',
          status: 'ACTIVE',
          onboarding_completed: false,
          created_at: new Date().toISOString(),
        }
        localDbStore.getTable('tenants').push(newTenant)

        // 2. Buat branch utama
        const newBranchId = `branch_${newTenantId}_main`
        localDbStore.getTable('branches').push({
          id: newBranchId,
          tenant_id: newTenantId,
          nama: 'Cabang Utama',
          is_active: true,
          created_at: new Date().toISOString(),
        })

        // 3. Inisialisasi master data otomatis untuk tenant baru
        localDbStore.ensureTenantMasterData(newTenantId, cleanType)
        seedStarterStockForTenant(localDbStore, newTenantId, newBranchId, cleanType)

        // 4. Buat profile owner
        const newUserId = `usr_${Date.now()}`
        const salt = DEFAULT_SALT
        const password_hash = await hashPassword(password, salt)

        const ownerProfile = {
          id: newUserId,
          tenant_id: newTenantId,
          branch_id: newBranchId,
          nama: (nama || 'Owner').trim(),
          email: cleanEmail,
          role: 'Owner',
          password_hash,
          salt,
          created_at: new Date().toISOString(),
        }
        localDbStore.getTable('profiles').push(ownerProfile)
        localDbStore.getTable('tenant_memberships').push({
          user_id: newUserId,
          tenant_id: newTenantId,
          branch_id: newBranchId,
          role: 'Owner',
          is_default: true,
          created_at: new Date().toISOString(),
        })

        // 4b. Buat lisensi uji coba 30 hari (Beta Trial Otomatis)
        const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        localDbStore.getTable('tenant_licenses').push({
          id: `lic_${Date.now()}`,
          tenant_id: newTenantId,
          license_key: `RLPOS-TRL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          tier: 'TRIAL_30D',
          plan: 'trial',
          tier_name: 'RelayPOS Beta Trial (30 Hari)',
          status: 'ACTIVE',
          started_at: new Date().toISOString(),
          expires_at: trialExpiry,
          valid_until: trialExpiry,
          max_branches: 1,
          max_devices: 3,
          features: { trial: true, duration_days: 30, trial_days: 30 },
          notes: 'Trial Beta Otomatis 30 Hari Pendaftaran Mandiri',
          created_at: new Date().toISOString()
        })

        // 5. Simpan & buat session
        localDbStore.saveToStorage()

        const userObj = {
          id: newUserId,
          email: cleanEmail,
          role: 'Owner',
          tenant_id: newTenantId,
          user_metadata: {
            nama: ownerProfile.nama,
            role: 'Owner',
            tenant_id: newTenantId,
          },
        }

        const session = {
          user: userObj,
          access_token: 'local-jwt-token-erp',
          token_type: 'bearer',
          expires_in: 86400,
        }

        localDbStore.saveAuth(session)
        authListeners.forEach((fn) => fn('SIGNED_IN', session))

        return { data: { user: userObj, session, tenant: newTenant, profile: ownerProfile }, error: null }
      },

      async signInWithOAuth({ provider, options = {} }) {
        if (provider !== 'google') {
          return { data: { user: null, session: null }, error: new Error(`OAuth provider ${provider} belum didukung.`) }
        }

        const email = options?.data?.email || options?.queryParams?.email || 'owner.google@example.com'
        const nama = options?.data?.nama || options?.queryParams?.nama || 'Owner Google'
        const mode = (options?.mode || options?.data?.mode || 'login').toLowerCase()
        const cleanEmail = email.trim().toLowerCase()

        const profiles = localDbStore.getTable('profiles')
        let profile = profiles.find((p) => p.email?.toLowerCase() === cleanEmail)
        let tenant = null

        if (profile) {
          if (profile.is_active === false) {
            return {
              data: { user: null, session: null },
              error: new Error('ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'),
            }
          }
          // Akun sudah ada -> login langsung
          tenant = localDbStore.getTable('tenants').find((t) => t.id === profile.tenant_id)
        } else {
          if (mode !== 'register') {
            return {
              data: { user: null, session: null },
              error: new Error('email belum memiliki tenant, silahkan klik DAFTAR untuk memulai'),
            }
          }

          // Mode register -> Buat tenant baru (Trial 14 Hari)
          const randomSuffix = Math.random().toString(36).substring(2, 7)
          const tenantName = options?.tenantName || options?.data?.tenantName || `${nama}'s Store`
          const businessType = (options?.businessType || options?.data?.businessType || 'HYBRID').toUpperCase()
          const newTenantId = `tenant_${Date.now()}_${randomSuffix}`
          const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `toko-${randomSuffix}`

          tenant = {
            id: newTenantId,
            nama: tenantName,
            slug,
            owner_name: nama,
            owner_email: cleanEmail,
            business_type: businessType,
            plan: 'TRIAL',
            status: 'ACTIVE',
            onboarding_completed: false,
            created_at: new Date().toISOString(),
          }
          localDbStore.getTable('tenants').push(tenant)

          const newBranchId = `branch_${newTenantId}_main`
          localDbStore.getTable('branches').push({
            id: newBranchId,
            tenant_id: newTenantId,
            nama: 'Cabang Utama',
            is_active: true,
            created_at: new Date().toISOString(),
          })

          localDbStore.ensureTenantMasterData(newTenantId, tenant.business_type)

          const newUserId = `usr_google_${Date.now()}`
          profile = {
            id: newUserId,
            tenant_id: newTenantId,
            branch_id: newBranchId,
            nama,
            email: cleanEmail,
            role: 'Owner',
            provider: 'google',
            created_at: new Date().toISOString(),
          }
          profiles.push(profile)
          localDbStore.saveToStorage()
        }

        const resolvedRole = profile.role || 'Owner'
        const userObj = {
          id: profile.id,
          email: profile.email,
          role: resolvedRole,
          tenant_id: profile.tenant_id,
          user_metadata: {
            nama: profile.nama,
            role: resolvedRole,
            tenant_id: profile.tenant_id,
            provider: 'google',
          },
        }

        const session = {
          user: userObj,
          access_token: 'google-oauth-jwt-token-erp',
          token_type: 'bearer',
          expires_in: 86400,
        }

        localDbStore.saveAuth(session)
        authListeners.forEach((fn) => fn('SIGNED_IN', session))

        return { data: { user: userObj, session, tenant, profile }, error: null }
      },

      async updateUser({ password, data = {} }) {
        const session = localDbStore.getAuth()
        const currentUserId = session?.user?.id
        if (!currentUserId) {
          return { data: { user: null }, error: new Error('Sesi pengguna tidak valid atau telah berakhir.') }
        }

        const profiles = localDbStore.getTable('profiles')
        const profile = profiles.find((p) => p.id === currentUserId || p.email?.toLowerCase() === session?.user?.email?.toLowerCase())
        if (!profile) {
          return { data: { user: null }, error: new Error('Profil pengguna tidak ditemukan.') }
        }

        if (password) {
          if (password.length < 8) {
            return { data: { user: null }, error: new Error('Kata sandi baru minimal 8 karakter.') }
          }
          const salt = profile.salt || DEFAULT_SALT
          const password_hash = await hashPassword(password, salt)
          profile.password_hash = password_hash
          profile.salt = salt
          profile.updated_at = new Date().toISOString()
        }

        if (data && typeof data === 'object') {
          if (data.nama) profile.nama = data.nama
        }

        localDbStore.saveToStorage()
        return { data: { user: session.user }, error: null }
      },

      async forgotPassword(email) {
        const cleanEmail = String(email || '').trim().toLowerCase()
        const profiles = localDbStore.getTable('profiles') || []
        const found = profiles.find((p) => (p.email || '').toLowerCase() === cleanEmail)
        if (!found) {
          return { success: true, emailSent: true }
        }
        const token = `rst_${generateLocalUuid().slice(0, 12)}`
        localDbStore.getTable('password_reset_tokens').push({
          token,
          user_id: found.id,
          email: cleanEmail,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        })
        localDbStore.saveToStorage()
        return { success: true, emailSent: true, token }
      },

      async resetPassword({ newPassword, token = null }) {
        if (!newPassword || newPassword.length < 8) {
          throw new Error('Kata sandi baru minimal 8 karakter.')
        }
        const profiles = localDbStore.getTable('profiles') || []
        let targetProfile = null
        if (token) {
          const tokens = localDbStore.getTable('password_reset_tokens') || []
          const entry = tokens.find((t) => t.token === token && new Date(t.expires_at).getTime() > Date.now())
          if (!entry) throw new Error('Token reset password tidak valid atau sudah kadaluarsa.')
          targetProfile = profiles.find((p) => p.id === entry.user_id)
        } else {
          const session = localDbStore.getAuth()
          if (session?.user?.id) {
            targetProfile = profiles.find((p) => p.id === session.user.id)
          }
        }
        if (!targetProfile) throw new Error('Akun pengguna tidak ditemukan.')
        const salt = targetProfile.salt || DEFAULT_SALT
        targetProfile.password_hash = await hashPassword(newPassword, salt)
        targetProfile.salt = salt
        targetProfile.updated_at = new Date().toISOString()
        localDbStore.saveToStorage()
        return { success: true }
      },

      async changePassword({ currentPassword, newPassword }) {
        const session = localDbStore.getAuth()
        const currentUserId = session?.user?.id
        if (!currentUserId) {
          return { success: false, error: 'Sesi pengguna tidak valid atau telah berakhir.' }
        }

        const profiles = localDbStore.getTable('profiles')
        const profile = profiles.find((p) => p.id === currentUserId || p.email?.toLowerCase() === session?.user?.email?.toLowerCase())
        if (!profile) {
          return { success: false, error: 'Profil pengguna tidak ditemukan.' }
        }

        if (!currentPassword || !String(currentPassword).trim()) {
          return { success: false, error: 'Kata sandi saat ini wajib diisi.' }
        }

        if (!newPassword || newPassword.length < 8) {
          return { success: false, error: 'Kata sandi baru minimal 8 karakter.' }
        }

        // Verifikasi kata sandi lama
        const salt = profile.salt || DEFAULT_SALT
        const expectedHash = profile.password_hash || DEFAULT_DEMO_PASSWORD_HASH
        const inputHash = await hashPassword(currentPassword, salt)

        if (inputHash !== expectedHash) {
          return { success: false, error: 'Kata sandi saat ini salah.' }
        }

        // Simpan kata sandi baru
        const newHash = await hashPassword(newPassword, salt)
        profile.password_hash = newHash
        profile.salt = salt
        profile.updated_at = new Date().toISOString()

        localDbStore.saveToStorage()
        return { success: true, message: 'Kata sandi berhasil diperbarui.' }
      },
    },

    erp: {
      resetDatabase() {
        return localDbStore.resetDatabase()
      },
      setStrictPostgresParity(enabled) {
        return localDbStore.setStrictPostgresParity(enabled)
      },
      getStrictPostgresParity() {
        return Boolean(localDbStore.strictPostgresParity)
      },
      exportJson() {
        return JSON.stringify(localDbStore.data, null, 2)
      },
      importJson(jsonString) {
        try {
          const parsed = JSON.parse(jsonString)
          localDbStore.data = parsed
          localDbStore.saveToStorage()
          return { success: true }
        } catch (e) {
          return { success: false, error: e.message }
        }
      },
      postJournal(payload) {
        return localDbStore.postJournalEntry(payload)
      },
      gl: glService,
      calculateMovingAverageCost,
      getFinancialReport(tenant_id = DEFAULT_TENANT_ID) {
        const coa = localDbStore.getTable('chart_of_accounts')
        const lines = localDbStore.getTable('journal_entry_lines')

        const report = coa.map((acc) => {
          const accLines = lines.filter((l) => l.account_id === acc.id)
          const totalDebit = accLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
          const totalCredit = accLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
          let balance = 0
          if (acc.normal_balance === 'DEBIT') {
            balance = totalDebit - totalCredit
          } else {
            balance = totalCredit - totalDebit
          }
          return {
            id: acc.id,
            code: acc.code,
            name: acc.name,
            category: acc.category,
            normal_balance: acc.normal_balance,
            debit: totalDebit,
            credit: totalCredit,
            balance,
          }
        })
        return report
      },
    },

    getActiveActorContext() {
      return getActiveActorContext()
    },

    async rpc(name, params = {}) {
      if (name === 'fn_get_pos_inventory_stock') {
        const actor = getActiveActorContext()
        const activeTenantId = (actor && actor.tenant_id) || getActiveTenantId()
        const targetBranch = params.p_branch_id || (actor && actor.branchId) || null
        const table = localDbStore.getTable('stok_barang') || []
        const tenantStocks = table.filter(row => {
          const matchTenant = row.tenant_id ? row.tenant_id === activeTenantId : activeTenantId === DEFAULT_TENANT_ID
          if (!matchTenant) return false
          if (targetBranch && row.branch_id) return row.branch_id === targetBranch
          return true
        })
        const safeRows = tenantStocks.map(row => {
          const copy = { ...row }
          delete copy.harga_beli
          delete copy.harga_satuan
          return {
            id: copy.id,
            tenant_id: copy.tenant_id,
            branch_id: copy.branch_id,
            id_barang: copy.id_barang || copy.id_bahan_baku,
            id_bahan_baku: copy.id_bahan_baku || copy.id_barang,
            nama_barang: copy.nama_barang || copy.nama_produk,
            nama_produk: copy.nama_produk || copy.nama_barang,
            kategori: copy.kategori || 'Bahan Baku',
            sub_kategori: copy.sub_kategori || '',
            satuan: copy.satuan || 'Pcs',
            stok: Number(copy.stok !== undefined ? copy.stok : (copy.stok_tersedia || 0)),
            stok_akhir: Number(copy.stok_akhir !== undefined ? copy.stok_akhir : (copy.stok || copy.stok_tersedia || 0)),
            min_stok: Number(copy.min_stok !== undefined ? copy.min_stok : (copy.minimal_stok || 0)),
            gudang: copy.gudang || 'CAFE',
            harga_jual: Number(copy.harga_jual || copy.harga || 0),
            foto_url: copy.foto_url || null,
            icon: copy.icon || null,
            emoji: copy.emoji || null,
            keterangan: copy.keterangan || null,
            is_active: copy.is_active !== false,
            updated_at: copy.updated_at || new Date().toISOString()
          }
        })
        return { data: safeRows, error: null }
      }

      if (name === 'fn_get_active_carwash_crew') {
        const actor = getActiveActorContext()
        const activeTenantId = (actor && actor.tenant_id) || getActiveTenantId()
        const targetBranch = params.p_branch_id || (actor && actor.branchId) || null
        const table = localDbStore.getTable('karyawan_cuci') || []
        const activeCrew = table.filter(row => {
          const matchTenant = row.tenant_id ? row.tenant_id === activeTenantId : activeTenantId === DEFAULT_TENANT_ID
          if (!matchTenant) return false
          if (targetBranch && row.branch_id) return row.branch_id === targetBranch
          const isActive = row.is_active !== false && (row.status || '').toLowerCase() !== 'nonaktif'
          return isActive
        })
        const safeRows = activeCrew.map(c => ({
          id: c.id,
          tenant_id: c.tenant_id,
          branch_id: c.branch_id,
          nama: c.nama,
          is_active: c.is_active !== false
        }))
        return { data: safeRows, error: null }
      }

      if (name === 'redeem_customer_reward') {
        const {
          p_tenant_id,
          p_plat,
          p_reward_title = 'Free Wash',
          p_notes = '',
          p_nama_pelanggan = '',
          p_reward_type = 'FREE_SERVICE',
          p_id_struk = null,
          p_request_key = null
        } = params

        const actor = getActiveActorContext()
        if (actor) {
          if (actor.is_active === false) {
            throw new Error('UNAUTHORIZED_OR_INACTIVE')
          }
          const allowedRoles = ['Super Admin', 'Owner', 'Admin Pusat', 'Admin', 'Kasir']
          if (actor.role && !allowedRoles.includes(actor.role)) {
            throw new Error('FORBIDDEN_CALLER_ROLE')
          }
          if (actor.role !== 'Super Admin' && actor.tenant_id && actor.tenant_id !== p_tenant_id) {
            throw new Error('FORBIDDEN_CROSS_TENANT_REDEEM')
          }
        }

        const cleanPlate = (p_plat || '').trim().toUpperCase().replace(/\s+/g, '')
        if (!p_tenant_id || !cleanPlate) {
          throw new Error('Tenant ID dan Plat nomor kendaraan wajib diisi')
        }

        // Check idempotency on id_struk or request_key
        const logsTable = localDbStore.getTable('crm_loyalty_logs') || []
        if (p_id_struk || p_request_key) {
          const existing = logsTable.find(l => l.tenant_id === p_tenant_id && l.tipe === 'REDEEM' && (
            (p_id_struk && l.id_struk === p_id_struk) ||
            (p_request_key && (l.request_key === p_request_key || l.id_struk === p_request_key))
          ))
          if (existing) {
            return {
              data: {
                redemption_id: existing.id,
                tenant_id: p_tenant_id,
                plat: (p_plat || '').trim().toUpperCase().replace(/\s+/g, ' '),
                reward_title: existing.reward_title || p_reward_title,
                idempotent_replay: true,
                claimed_at: existing.claimed_at || new Date().toISOString()
              },
              error: null
            }
          }
        }

        // Active loyalty program gate
        const programsTable = localDbStore.getTable('crm_loyalty_programs') || []
        const tenantPrograms = programsTable.filter(p => p.tenant_id === p_tenant_id)
        let activeProgram = null
        if (tenantPrograms.length > 0) {
          activeProgram = tenantPrograms.find(p => p.is_active !== false)
          if (!activeProgram) {
            throw new Error('LOYALTY_PROGRAM_UNAVAILABLE')
          }
        } else {
          activeProgram = { is_active: true, target_stamps: 5, reward_title: p_reward_title }
        }

        const targetStamps = Number(activeProgram.target_stamps || 5)
        if (targetStamps <= 0) {
          throw new Error('LOYALTY_PROGRAM_UNAVAILABLE')
        }

        // Qualifying visits filter: distinct paid receipts or non-receipt visits
        const cwTable = localDbStore.getTable('carwash') || []
        const strukTable = localDbStore.getTable('struk') || []
        const qualifyingCw = cwTable.filter(cw => {
          if (cw.tenant_id !== p_tenant_id) return false
          const plateNorm = (cw.plat || '').trim().toUpperCase().replace(/\s+/g, '')
          if (plateNorm !== cleanPlate) return false
          const st = (cw.status || '').toLowerCase()
          if (['batal', 'void', 'cancelled', 'pending'].includes(st)) return false
          if (cw.id_struk) {
            const struk = strukTable.find(s => s.tenant_id === p_tenant_id && s.id_struk === cw.id_struk)
            if (!struk) return false
            const sBayar = (struk.status_bayar || '').toLowerCase()
            if (sBayar !== 'selesai' && sBayar !== 'lunas') return false
            if (struk.total_tagihan !== undefined && struk.total_tagihan !== null && Number(struk.total_tagihan) <= 0) return false
          }
          return true
        })

        const distinctReceipts = new Set(qualifyingCw.map(cw => cw.id_struk).filter(Boolean))
        const visitsWithoutReceipt = qualifyingCw.filter(cw => !cw.id_struk).length
        const totalEligibleVisits = distinctReceipts.size + visitsWithoutReceipt

        const redemptions = logsTable.filter(l => {
          if (l.tenant_id !== p_tenant_id) return false
          const plateNorm = (l.plat || '').trim().toUpperCase().replace(/\s+/g, '')
          if (plateNorm !== cleanPlate) return false
          return l.tipe === 'REDEEM' || (!l.tipe && (l.claimed_at || l.reward_title))
        })

        const available = Math.floor(totalEligibleVisits / targetStamps) - redemptions.length
        if (available <= 0) {
          throw new Error('Stamp kunjungan belum cukup atau reward sudah diklaim')
        }

        const redemptionId = `red_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        const finalRewardTitle = activeProgram.reward_title || p_reward_title
        const finalRewardType = activeProgram.reward_type || p_reward_type
        const newRecord = {
          id: redemptionId,
          tenant_id: p_tenant_id,
          plat: (p_plat || '').trim().toUpperCase().replace(/\s+/g, ' '),
          tipe: 'REDEEM',
          reward_title: finalRewardTitle,
          reward_type: finalRewardType,
          id_struk: p_id_struk,
          request_key: p_request_key,
          entitlement_seq: redemptions.length + 1,
          keterangan: p_notes,
          notes: p_notes,
          nama_pelanggan: p_nama_pelanggan,
          claimed_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        }

        logsTable.push(newRecord)

        const claimsTable = localDbStore.getTable('customer_reward_claims')
        if (claimsTable) {
          claimsTable.push({
            id: `claim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            tenant_id: p_tenant_id,
            plat: newRecord.plat,
            customer_name: p_nama_pelanggan,
            reward_id: activeProgram.id || null,
            reward_title: finalRewardTitle,
            id_struk: p_id_struk,
            request_key: p_request_key,
            status: 'COMPLETED',
            claimed_at: newRecord.claimed_at,
            created_at: newRecord.created_at
          })
        }

        localDbStore.saveToStorage()
        return {
          data: {
            redemption_id: redemptionId,
            tenant_id: p_tenant_id,
            plat: newRecord.plat,
            reward_title: finalRewardTitle,
            claimed_at: newRecord.claimed_at
          },
          error: null
        }
      }

      if (name === 'fn_manage_tenant_staff') {
        const { p_staff_id, p_action, p_new_role = null } = params
        const actor = getActiveActorContext()
        const callerRole = actor?.role || 'Owner'
        const callerTenant = actor?.tenant_id || getActiveTenantId() || DEFAULT_TENANT_ID

        if (!['Super Admin', 'Owner', 'Admin Pusat', 'Admin'].includes(callerRole)) {
          return {
            data: null,
            error: new Error(`FORBIDDEN: Role "${callerRole}" tidak memiliki izin untuk mengelola akun staf.`),
          }
        }

        const profiles = localDbStore.getTable('profiles') || []
        const target = profiles.find((p) => p.id === p_staff_id)
        if (!target) {
          return { data: null, error: new Error('NOT_FOUND: Profil staf tidak ditemukan.') }
        }

        if (callerRole !== 'Super Admin' && target.tenant_id && target.tenant_id !== callerTenant) {
          return {
            data: null,
            error: new Error('FORBIDDEN_CROSS_TENANT: Tidak dapat memodifikasi staf dari tenant lain.'),
          }
        }

        // Co-Owner Protection: Owner / Admin Pusat / Admin cannot mutate another Owner or Super Admin
        if (['Owner', 'Super Admin'].includes(target.role) && callerRole !== 'Super Admin') {
          return {
            data: null,
            error: new Error(
              `FORBIDDEN_MUTATE_CO_OWNER: Akun dengan role "${target.role}" dilindungi dan tidak dapat diubah atau dinonaktifkan oleh sesama Owner/Admin.`
            ),
          }
        }

        if (callerRole === 'Admin Pusat' && target.role === 'Admin Pusat' && target.id !== actor?.userId) {
          return {
            data: null,
            error: new Error('FORBIDDEN_ROLE_ESCALATION: Admin Pusat tidak dapat memodifikasi akun Admin Pusat lain.'),
          }
        }

        if (callerRole === 'Admin') {
          if (['Admin Pusat', 'Admin'].includes(target.role) && target.id !== actor?.userId) {
            return {
              data: null,
              error: new Error('FORBIDDEN_ROLE_ESCALATION: Admin Cabang tidak dapat memodifikasi akun Admin atau Admin Pusat.'),
            }
          }
          if (actor?.branchId && target.branch_id && target.branch_id !== actor.branchId) {
            return {
              data: null,
              error: new Error('BRANCH_FORBIDDEN: Admin Cabang hanya dapat mengelola staf pada cabangnya sendiri.'),
            }
          }
        }

        const cleanAction = String(p_action || '').trim().toUpperCase()
        const targetNamaUpper = (target.nama || '').trim().toUpperCase()
        const targetEmailLower = (target.email || '').trim().toLowerCase()
        const kasirTable = localDbStore.getTable('kasir') || []
        const kkTable = localDbStore.getTable('karyawan_kantor') || []

        if (cleanAction === 'UPDATE_ROLE') {
          if (!['Super Admin', 'Owner', 'Admin Pusat'].includes(callerRole)) {
            return {
              data: null,
              error: new Error('FORBIDDEN_ROLE_ESCALATION: Hanya Owner atau Admin Pusat yang dapat mengubah role akun staf.'),
            }
          }
          const allowedRoles = ['Kasir', 'Admin', 'Admin Pusat', 'Staff Kantor', 'Karyawan Cuci', 'Owner']
          const cleanRole = String(p_new_role || '').trim()
          if (!allowedRoles.includes(cleanRole)) {
            return { data: null, error: new Error(`INVALID_ROLE: Peran baru "${cleanRole}" tidak valid.`) }
          }
          if (callerRole === 'Admin Pusat' && ['Owner', 'Admin Pusat'].includes(cleanRole)) {
            return {
              data: null,
              error: new Error('FORBIDDEN_ROLE_ESCALATION: Admin Pusat hanya dapat menetapkan role Admin Cabang atau staf operasional.'),
            }
          }

          target.role = cleanRole
          target.updated_at = new Date().toISOString()

          kkTable.forEach((kk) => {
            if (
              kk.tenant_id === target.tenant_id &&
              (kk.profile_id === target.id ||
                (!kk.profile_id &&
                  ((kk.email && kk.email.toLowerCase() === targetEmailLower) ||
                    (kk.nama || '').trim().toUpperCase() === targetNamaUpper)))
            ) {
              kk.role = cleanRole
              kk.profile_id = kk.profile_id || target.id
            }
          })

          const existingKasir = kasirTable.find(
            (k) =>
              k.tenant_id === target.tenant_id &&
              (k.profile_id === target.id ||
                (!k.profile_id && (k.nama || '').trim().toUpperCase() === targetNamaUpper))
          )
          if (cleanRole === 'Kasir' && target.is_active !== false) {
            if (existingKasir) {
              existingKasir.is_active = true
              existingKasir.profile_id = existingKasir.profile_id || target.id
            } else {
              kasirTable.push({
                nama: targetNamaUpper,
                profile_id: target.id,
                tenant_id: target.tenant_id,
                branch_id: target.branch_id,
                is_active: true,
                created_at: new Date().toISOString(),
              })
            }
          } else if (existingKasir) {
            existingKasir.is_active = false
            existingKasir.profile_id = existingKasir.profile_id || target.id
          }

          localDbStore.saveToStorage()
          return {
            data: {
              success: true,
              action: 'UPDATE_ROLE',
              staff_id: target.id,
              nama: target.nama,
              new_role: cleanRole,
              is_active: target.is_active !== false,
            },
            error: null,
          }
        }

        if (cleanAction === 'DEACTIVATE') {
          target.is_active = false
          target.updated_at = new Date().toISOString()

          kasirTable.forEach((k) => {
            if (
              k.tenant_id === target.tenant_id &&
              (k.profile_id === target.id ||
                (!k.profile_id && (k.nama || '').trim().toUpperCase() === targetNamaUpper))
            ) {
              k.is_active = false
              k.profile_id = k.profile_id || target.id
            }
          })

          kkTable.forEach((kk) => {
            if (
              kk.tenant_id === target.tenant_id &&
              (kk.profile_id === target.id ||
                (!kk.profile_id &&
                  ((kk.email && kk.email.toLowerCase() === targetEmailLower) ||
                    (kk.nama || '').trim().toUpperCase() === targetNamaUpper)))
            ) {
              kk.is_active = false
              kk.status = 'Nonaktif'
              kk.profile_id = kk.profile_id || target.id
            }
          })

          localDbStore.saveToStorage()
          return {
            data: {
              success: true,
              action: 'DEACTIVATE',
              staff_id: target.id,
              nama: target.nama,
              role: target.role,
              is_active: false,
            },
            error: null,
          }
        }

        if (cleanAction === 'ACTIVATE') {
          target.is_active = true
          target.updated_at = new Date().toISOString()

          if (target.role === 'Kasir') {
            const existingKasir = kasirTable.find(
              (k) =>
                k.tenant_id === target.tenant_id &&
                (k.profile_id === target.id ||
                  (!k.profile_id && (k.nama || '').trim().toUpperCase() === targetNamaUpper))
            )
            if (existingKasir) {
              existingKasir.is_active = true
              existingKasir.profile_id = existingKasir.profile_id || target.id
            } else {
              kasirTable.push({
                nama: targetNamaUpper,
                profile_id: target.id,
                tenant_id: target.tenant_id,
                branch_id: target.branch_id,
                is_active: true,
                created_at: new Date().toISOString(),
              })
            }
          }

          kkTable.forEach((kk) => {
            if (
              kk.tenant_id === target.tenant_id &&
              (kk.profile_id === target.id ||
                (!kk.profile_id &&
                  ((kk.email && kk.email.toLowerCase() === targetEmailLower) ||
                    (kk.nama || '').trim().toUpperCase() === targetNamaUpper)))
            ) {
              kk.is_active = true
              kk.status = 'Aktif'
              kk.profile_id = kk.profile_id || target.id
            }
          })

          localDbStore.saveToStorage()
          return {
            data: {
              success: true,
              action: 'ACTIVATE',
              staff_id: target.id,
              nama: target.nama,
              role: target.role,
              is_active: true,
            },
            error: null,
          }
        }

        return { data: null, error: new Error(`INVALID_ACTION: Aksi "${cleanAction}" tidak dikenali.`) }
      }

      if (name === 'fn_resolve_login_email') {
        const cleanId = String(params.p_identifier || '').trim().toLowerCase()
        const cleanSlug = params.p_tenant_slug ? String(params.p_tenant_slug).trim().toLowerCase() : null
        const profiles = localDbStore.getTable('profiles') || []
        const tenants = localDbStore.getTable('tenants') || []
        let scopedTenantId = null
        if (cleanSlug) {
          const matchedTenant = tenants.find((t) => String(t.slug || '').toLowerCase() === cleanSlug)
          if (matchedTenant) {
            scopedTenantId = matchedTenant.id
          } else if (!cleanId.includes('@')) {
            return { data: { email: `${cleanId}.${cleanSlug}@pos.internal`, is_active: true }, error: null }
          }
        }
        const currentTenantId = scopedTenantId || getActiveTenantId()
        const candidates = profiles.filter((p) => {
          if (scopedTenantId && p.tenant_id !== scopedTenantId) return false
          const pEmail = (p.email || '').toLowerCase()
          const pLocal = pEmail.split('@')[0]
          const pBase = pLocal.split('.')[0]
          return pEmail === cleanId || pLocal === cleanId || pBase === cleanId || (p.nama || '').toLowerCase() === cleanId
        })
        const match =
          candidates.find((p) => currentTenantId && p.tenant_id === currentTenantId && p.is_active !== false) ||
          candidates.find((p) => currentTenantId && p.tenant_id === currentTenantId) ||
          candidates.find((p) => p.is_active !== false) ||
          candidates[0]
        if (match) {
          if (match.is_active === false) {
            return {
              data: null,
              error: new Error('ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'),
            }
          }
          return { data: { email: match.email, is_active: true }, error: null }
        }
        if (cleanSlug && !cleanId.includes('@')) {
          return { data: { email: `${cleanId}.${cleanSlug}@pos.internal`, is_active: true }, error: null }
        }
        return { data: { email: cleanId.includes('@') ? cleanId : `${cleanId}@jb.local`, is_active: true }, error: null }
      }

      if (name === 'fn_complete_google_oauth_flow') {
        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        if (!uid) {
          return { data: null, error: new Error('UNAUTHORIZED: Sesi tidak ditemukan.') }
        }
        const profiles = localDbStore.getTable('profiles')
        const existing = profiles.find((p) => p.id === uid || p.email?.toLowerCase() === session.user.email?.toLowerCase())
        if (existing) {
          if (existing.is_active === false) {
            return {
              data: { status: 'INACTIVE', message: 'ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.' },
              error: null,
            }
          }
          return { data: { status: 'EXISTING_USER', tenant_id: existing.tenant_id, role: existing.role }, error: null }
        }
        const mode = String(params?.p_mode || 'login').trim().toLowerCase()
        if (mode !== 'register') {
          return {
            data: { status: 'UNREGISTERED', message: 'email belum memiliki tenant, silahkan klik DAFTAR untuk memulai' },
            error: null,
          }
        }
        const ownerName = (params?.p_owner_name || session.user.user_metadata?.nama || session.user.email?.split('@')[0] || 'Owner').trim()
        const tenantName = (params?.p_tenant_name || `${ownerName}'s Store`).trim()
        const businessType = String(params?.p_business_type || 'HYBRID').toUpperCase()
        const randomSuffix = Math.random().toString(36).substring(2, 7)
        const newTenantId = `tenant_${Date.now()}_${randomSuffix}`
        const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `toko-${randomSuffix}`
        localDbStore.getTable('tenants').push({
          id: newTenantId,
          nama: tenantName,
          slug,
          owner_name: ownerName,
          owner_email: session.user.email,
          business_type: businessType,
          plan: 'TRIAL',
          status: 'ACTIVE',
          onboarding_completed: false,
          created_at: new Date().toISOString(),
        })
        const newBranchId = `branch_${newTenantId}_main`
        localDbStore.getTable('branches').push({
          id: newBranchId,
          tenant_id: newTenantId,
          nama: 'Cabang Utama',
          is_active: true,
          created_at: new Date().toISOString(),
        })
        localDbStore.ensureTenantMasterData(newTenantId, businessType)
        seedStarterStockForTenant(localDbStore, newTenantId, newBranchId, businessType)
        const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        localDbStore.getTable('tenant_licenses').push({
          id: `lic_${Date.now()}`,
          tenant_id: newTenantId,
          license_key: `RLPOS-TRL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          tier: 'TRIAL_30D',
          plan: 'trial',
          status: 'ACTIVE',
          expires_at: trialExpiry,
          valid_until: trialExpiry,
          max_branches: 1,
          max_users: 10,
          features: { trial: true, trial_days: 30, duration_days: 30 },
          created_at: new Date().toISOString(),
        })
        profiles.push({
          id: uid,
          tenant_id: newTenantId,
          branch_id: newBranchId,
          nama: ownerName,
          email: session.user.email,
          role: 'Owner',
          provider: 'google',
          created_at: new Date().toISOString(),
        })
        localDbStore.getTable('tenant_memberships').push({
          user_id: uid,
          tenant_id: newTenantId,
          branch_id: newBranchId,
          role: 'Owner',
          is_default: true,
          created_at: new Date().toISOString(),
        })
        localDbStore.saveToStorage()
        return { data: { status: 'REGISTERED_NEW_TENANT', tenant_id: newTenantId }, error: null }
      }

      if (name === 'fn_complete_store_setup') {
        const tenantId = params?.p_tenant_id
        const payload = params?.p_payload || {}
        const tenants = localDbStore.getTable('tenants') || []
        const branches = localDbStore.getTable('branches') || []
        const profiles = localDbStore.getTable('profiles') || []

        const targetTenant = tenants.find((t) => t.id === tenantId)
        if (!targetTenant) {
          return { data: null, error: new Error('TENANT_NOT_FOUND') }
        }

        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        const callerProfile = profiles.find((p) => p.id === uid)
        if (callerProfile && callerProfile.role !== 'Super Admin' && callerProfile.tenant_id !== tenantId) {
          return { data: null, error: new Error('FORBIDDEN: Hanya Owner toko ini yang berhak mengonfigurasi setup toko.') }
        }

        let mainBranch = branches.find((b) => b.tenant_id === tenantId && (b.is_main || b.kode === 'MAIN')) ||
          branches.find((b) => b.tenant_id === tenantId)

        if (payload.skip) {
          targetTenant.onboarding_completed = true
          targetTenant.updated_at = new Date().toISOString()
          localDbStore.saveToStorage()
          return {
            data: {
              success: true,
              tenant_id: tenantId,
              branch_id: mainBranch?.id || null,
              onboarding_completed: true,
              skipped: true,
            },
            error: null,
          }
        }

        if (payload.owner_name && callerProfile) {
          callerProfile.nama = String(payload.owner_name).trim()
          callerProfile.updated_at = new Date().toISOString()
        }
        if (payload.store_name) {
          targetTenant.nama = String(payload.store_name).trim()
        }
        if (payload.business_type && ['HYBRID', 'CAFE', 'CARWASH'].includes(String(payload.business_type).toUpperCase())) {
          targetTenant.business_type = String(payload.business_type).toUpperCase()
        }
        targetTenant.onboarding_completed = true
        targetTenant.updated_at = new Date().toISOString()

        if (mainBranch) {
          if (payload.store_name) mainBranch.nama = String(payload.store_name).trim()
          if (payload.alamat !== undefined && payload.alamat !== null && String(payload.alamat).trim() !== '') {
            mainBranch.alamat = String(payload.alamat).trim()
          }
          if (payload.telepon !== undefined && payload.telepon !== null && String(payload.telepon).trim() !== '') {
            mainBranch.telepon = String(payload.telepon).trim()
          }
          mainBranch.updated_at = new Date().toISOString()
        }

        const hasTx = (localDbStore.getTable('struk') || []).some((s) => s.tenant_id === tenantId)
        if (payload.clear_starter_samples && !hasTx) {
          for (const tblName of ['resep', 'daftar_harga_menu', 'carwash_packages', 'stok_barang']) {
            const arr = localDbStore.getTable(tblName)
            if (Array.isArray(arr)) {
              for (let i = arr.length - 1; i >= 0; i--) {
                if (arr[i].tenant_id === tenantId) arr.splice(i, 1)
              }
            }
          }
        }

        if (Array.isArray(payload.carwash_packages)) {
          const pkgTable = localDbStore.getTable('carwash_packages')
          for (const pkg of payload.carwash_packages) {
            const pkgName = String(pkg.nama_paket || pkg.name || '').trim().toUpperCase()
            const rawPrice = typeof pkg.tarif === 'object'
              ? (pkg.tarif?.Small?.Regular ?? pkg.price ?? 0)
              : (pkg.tarif ?? pkg.price ?? 0)
            const pkgPrice = Math.max(0, parseFloat(rawPrice) || 0)
            const pkgDesc = String(pkg.keterangan || pkg.description || 'Layanan cuci kendaraan').trim()
            const pkgMatrix = (pkg.tarif_matrix && typeof pkg.tarif_matrix === 'object')
              ? pkg.tarif_matrix
              : (pkg.tarif && typeof pkg.tarif === 'object')
              ? pkg.tarif
              : buildDefaultTarifMatrix(pkgPrice)
            if (pkgName) {
              pkgTable.push({
                id: generateLocalUuid(),
                tenant_id: tenantId,
                branch_id: mainBranch?.id || null,
                name: pkgName,
                nama_paket: pkgName,
                description: pkgDesc,
                keterangan: pkgDesc,
                price: pkgPrice,
                tarif: pkgPrice,
                tarif_matrix: pkgMatrix,
                komisi_skema: pkg.komisi_skema || 'TIERED',
                is_active: true,
                created_at: new Date().toISOString(),
              })
            }
          }
        }

        if (Array.isArray(payload.cafe_menus)) {
          const menuTable = localDbStore.getTable('daftar_harga_menu')
          for (const menu of payload.cafe_menus) {
            const menuName = String(menu.nama_menu || menu.daftar_menu || '').trim()
            const menuPrice = Math.max(0, parseFloat(menu.harga ?? 0) || 0)
            const menuCat = String(menu.kategori || 'Minuman').trim()
            if (menuName) {
              menuTable.push({
                id: generateLocalUuid(),
                tenant_id: tenantId,
                branch_id: mainBranch?.id || null,
                daftar_menu: menuName,
                nama_menu: menuName,
                harga: menuPrice,
                kategori: menuCat,
                is_active: true,
                updated_at: new Date().toISOString(),
              })
            }
          }
        }

        if (Array.isArray(payload.stock_items)) {
          const stockTable = localDbStore.getTable('stok_barang')
          let stockIdx = 0
          for (const item of payload.stock_items) {
            const itemName = String(item.nama_barang || item.nama_produk || '').trim()
            if (itemName) {
              stockIdx += 1
              const qty = Math.max(0, parseFloat(item.stok ?? 0) || 0)
              const cost = Math.max(0, parseFloat(item.harga_satuan ?? item.harga_beli ?? 0) || 0)
              const minStok = Math.max(0, parseFloat(item.min_stok ?? 5) || 5)
              const gudang = ['CAFE', 'CARWASH', 'MERCHANDISE'].includes(String(item.gudang || '').toUpperCase())
                ? String(item.gudang).toUpperCase()
                : 'CAFE'
              const rawSku = String(item.id_barang || item.id_bahan_baku || item.sku || '').trim()
              const stockSku = rawSku || deriveAutoStockSku(itemName, gudang, stockIdx)
              stockTable.push({
                id: generateLocalUuid(),
                tenant_id: tenantId,
                branch_id: mainBranch?.id || null,
                id_barang: stockSku,
                id_bahan_baku: stockSku,
                nama_produk: itemName,
                nama_barang: itemName,
                satuan: String(item.satuan || 'pcs').trim(),
                stok: qty,
                stok_akhir: qty,
                harga_satuan: cost,
                harga_beli: cost,
                min_stok: minStok,
                gudang,
                kategori: 'Bahan Baku',
                is_active: true,
                updated_at: new Date().toISOString(),
              })
            }
          }
        }

        localDbStore.saveToStorage()
        return {
          data: {
            success: true,
            tenant_id: tenantId,
            branch_id: mainBranch?.id || null,
            onboarding_completed: true,
          },
          error: null,
        }
      }

      if (name === 'fn_switch_active_tenant') {
        const targetTenantId = params?.p_tenant_id
        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        const profiles = localDbStore.getTable('profiles') || []
        const caller = profiles.find((p) => p.id === uid)
        if (!caller) return { data: null, error: new Error('UNAUTHORIZED: Sesi tidak ditemukan.') }
        const tenants = localDbStore.getTable('tenants') || []
        const targetTenant = tenants.find((t) => t.id === targetTenantId)
        if (!targetTenant) return { data: null, error: new Error('TENANT_NOT_FOUND') }
        if (caller.role !== 'Super Admin') {
          if (caller.role !== 'Owner') {
            return { data: null, error: new Error('FORBIDDEN: Hanya Owner atau Super Admin yang dapat berpindah outlet.') }
          }
          const memberships = localDbStore.getTable('tenant_memberships') || []
          const isMember = memberships.some((m) => m.user_id === uid && m.tenant_id === targetTenantId) ||
            (targetTenant.owner_email && caller.email && targetTenant.owner_email.toLowerCase() === caller.email.toLowerCase()) ||
            caller.tenant_id === targetTenantId
          if (!isMember) {
            return { data: null, error: new Error('TENANT_FORBIDDEN: Anda tidak memiliki akses ke outlet ini.') }
          }
        }
        const branches = localDbStore.getTable('branches') || []
        const targetBranch = branches.find((b) => b.tenant_id === targetTenantId && b.is_active !== false)
        caller.tenant_id = targetTenantId
        caller.branch_id = targetBranch?.id || null
        setActiveTenantId(targetTenantId)
        localDbStore.saveToStorage()
        return { data: { success: true, tenant_id: targetTenantId, branch_id: caller.branch_id }, error: null }
      }

      if (name === 'fn_update_tenant_receipt_config') {
        const { p_tenant_id, p_config } = params || {}
        const tenants = localDbStore.getTable('tenants') || []
        const target = tenants.find((t) => t.id === p_tenant_id)
        if (!target) return { data: null, error: new Error('TENANT_NOT_FOUND') }
        target.receipt_config = p_config || {}
        target.updated_at = new Date().toISOString()
        localDbStore.saveToStorage()
        return { data: { success: true, tenant_id: p_tenant_id, receipt_config: target.receipt_config }, error: null }
      }

      const computeLocalCashierShiftMetrics = ({ tenantId, branchId = null, tanggal }) => {
        const matchBranch = (row) => !branchId || !row.branch_id || row.branch_id === branchId
        const strukRows = (localDbStore.getTable('struk') || []).filter((s) => {
          if (s.tenant_id !== tenantId || !matchBranch(s)) return false
          if (!['Selesai', 'Lunas', 'Paid'].includes(s.status_bayar)) return false
          const settleDate = s.waktu_dibayar ? new Date(s.waktu_dibayar).toLocaleDateString('en-CA') : null
          return s.tanggal === tanggal || settleDate === tanggal
        })
        let cashSales = 0
        let digitalSales = 0
        strukRows.forEach((s) => {
          const m = String(s.metode_bayar || '').toUpperCase()
          if (m === 'SPLIT') {
            cashSales += parseFloat(s.nominal_cash || 0)
            digitalSales += parseFloat(s.nominal_qris || 0) + parseFloat(s.nominal_transfer || 0)
          } else if (m === 'CASH' || m === 'TUNAI') {
            cashSales += parseFloat(s.total_tagihan || 0)
          } else {
            digitalSales += parseFloat(s.total_tagihan || 0)
          }
        })
        const expRows = (localDbStore.getTable('pengeluaran') || []).filter(
          (e) =>
            e.tenant_id === tenantId &&
            matchBranch(e) &&
            e.tanggal === tanggal &&
            (!e.pos || String(e.pos).toUpperCase().includes('CASH'))
        )
        const expenses = expRows.reduce((sum, e) => sum + parseFloat(e.nominal || 0), 0)
        const exchangeRows = (localDbStore.getTable('cashflow') || []).filter(
          (c) =>
            c.tenant_id === tenantId &&
            matchBranch(c) &&
            c.tanggal === tanggal &&
            c.kategori === 'Tukar Uang' &&
            String(c.pos || '').toUpperCase().includes('CASH')
        )
        const exchangeCashOut = exchangeRows.reduce((sum, c) => sum + parseFloat(c.pengeluaran || 0), 0)
        return { cashSales, digitalSales, expenses, exchangeCashOut }
      }

      if (name === 'fn_get_cashier_shift_preview') {
        const {
          p_tenant_id,
          p_branch_id = null,
          p_tanggal = new Date().toLocaleDateString('en-CA'),
        } = params || {}
        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        const caller = uid ? (localDbStore.getTable('profiles') || []).find((p) => p.id === uid) : null
        if (caller) {
          if (caller.is_active === false) {
            return { data: null, error: new Error('USER_INACTIVE: Akun tidak aktif.') }
          }
          if (caller.role !== 'Super Admin' && caller.tenant_id !== p_tenant_id) {
            const memberships = localDbStore.getTable('tenant_memberships') || []
            const hasAccess = memberships.some((m) => m.user_id === uid && m.tenant_id === p_tenant_id)
            if (!hasAccess) {
              return { data: null, error: new Error('TENANT_FORBIDDEN: Akses rekap kasir lintas tenant ditolak.') }
            }
          }
          const effectiveBranch = p_branch_id || caller.branch_id || null
          if (caller.role === 'Kasir' && caller.branch_id && effectiveBranch !== caller.branch_id) {
            return { data: null, error: new Error('BRANCH_FORBIDDEN: Kasir hanya dapat melihat rekap shift cabangnya sendiri.') }
          }
        }
        const effectiveBranch = p_branch_id || caller?.branch_id || null
        const metrics = computeLocalCashierShiftMetrics({
          tenantId: p_tenant_id,
          branchId: effectiveBranch,
          tanggal: p_tanggal,
        })
        return {
          data: {
            success: true,
            tanggal: p_tanggal,
            branch_id: effectiveBranch,
            cash_sales: metrics.cashSales,
            digital_sales: metrics.digitalSales,
            expenses: metrics.expenses,
            exchange_cash_out: metrics.exchangeCashOut,
          },
          error: null,
        }
      }

      if (name === 'fn_close_cashier_shift') {
        const {
          p_tenant_id,
          p_branch_id = null,
          p_kasir = 'KASIR',
          p_tanggal = new Date().toLocaleDateString('en-CA'),
          p_modal_awal = 0,
          p_kas_fisik = 0,
          p_catatan = '',
        } = params || {}
        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        const caller = uid ? (localDbStore.getTable('profiles') || []).find((p) => p.id === uid) : null
        if (caller) {
          if (caller.is_active === false) {
            return { data: null, error: new Error('USER_INACTIVE: Akun tidak aktif.') }
          }
          if (!['Super Admin', 'Owner', 'Admin', 'Kasir'].includes(caller.role)) {
            return { data: null, error: new Error('FORBIDDEN: Peran ini tidak berwenang menutup shift kasir.') }
          }
          if (caller.role !== 'Super Admin' && caller.tenant_id !== p_tenant_id) {
            const memberships = localDbStore.getTable('tenant_memberships') || []
            const hasAccess = memberships.some((m) => m.user_id === uid && m.tenant_id === p_tenant_id)
            if (!hasAccess) {
              return { data: null, error: new Error('TENANT_FORBIDDEN: Akses tutup kasir lintas tenant ditolak.') }
            }
          }
          const effectiveBranch = p_branch_id || caller.branch_id || null
          if (caller.role === 'Kasir' && caller.branch_id && effectiveBranch !== caller.branch_id) {
            return { data: null, error: new Error('BRANCH_FORBIDDEN: Kasir hanya dapat menutup shift pada cabangnya sendiri.') }
          }
        }
        const effectiveBranch = p_branch_id || caller?.branch_id || null
        const { cashSales, digitalSales, expenses, exchangeCashOut } = computeLocalCashierShiftMetrics({
          tenantId: p_tenant_id,
          branchId: effectiveBranch,
          tanggal: p_tanggal,
        })
        const expected = Number(p_modal_awal || 0) + cashSales - expenses - exchangeCashOut
        const physical = Number(p_kas_fisik || 0)
        const discrepancy = physical - expected
        const closingId = generateLocalUuid()
        localDbStore.getTable('cashier_shift_closings').push({
          id: closingId,
          tenant_id: p_tenant_id,
          branch_id: effectiveBranch,
          tanggal: p_tanggal,
          kasir: String(p_kasir || 'KASIR').toUpperCase(),
          modal_awal: Number(p_modal_awal || 0),
          penjualan_tunai: cashSales,
          penjualan_digital: digitalSales,
          pengeluaran_kasir: expenses,
          tukar_uang_keluar: exchangeCashOut,
          ekspektasi_kas: expected,
          kas_fisik: physical,
          selisih: discrepancy,
          catatan: p_catatan,
          closed_at: new Date().toISOString(),
        })
        localDbStore.saveToStorage()
        return {
          data: {
            success: true,
            closing_id: closingId,
            tanggal: p_tanggal,
            kasir: String(p_kasir || 'KASIR').toUpperCase(),
            modal_awal: Number(p_modal_awal || 0),
            penjualan_tunai: cashSales,
            penjualan_digital: digitalSales,
            pengeluaran_kasir: expenses,
            tukar_uang_keluar: exchangeCashOut,
            ekspektasi_kas: expected,
            kas_fisik: physical,
            selisih: discrepancy,
          },
          error: null,
        }
      }

      if (name === 'fn_create_owner_outlet') {
        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        const profiles = localDbStore.getTable('profiles') || []
        const caller = profiles.find((p) => p.id === uid)
        if (!caller || !['Owner', 'Super Admin'].includes(caller.role)) {
          return { data: null, error: new Error('FORBIDDEN: Hanya Owner yang dapat menambah outlet baru.') }
        }
        const cleanName = String(params?.p_store_name || '').trim()
        if (!cleanName) return { data: null, error: new Error('INVALID_STORE_NAME') }
        const bType = ['HYBRID', 'CAFE', 'CARWASH'].includes(String(params?.p_business_type || '').toUpperCase())
          ? String(params.p_business_type).toUpperCase()
          : 'HYBRID'
        const newTenantId = generateLocalUuid()
        const newBranchId = generateLocalUuid()
        const slug = `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`
        const newTenant = {
          id: newTenantId,
          nama: cleanName,
          slug,
          owner_name: caller.nama,
          owner_email: caller.email,
          business_type: bType,
          plan: 'trial',
          status: 'active',
          onboarding_completed: true,
          created_at: new Date().toISOString(),
        }
        localDbStore.getTable('tenants').push(newTenant)
        localDbStore.getTable('branches').push({
          id: newBranchId,
          tenant_id: newTenantId,
          nama: 'Cabang Utama',
          kode: 'MAIN',
          alamat: params?.p_alamat || '-',
          telepon: params?.p_telepon || '-',
          is_main: true,
          is_active: true,
          created_at: new Date().toISOString(),
        })
        localDbStore.ensureTenantMasterData(newTenantId, bType)
        seedStarterStockForTenant(localDbStore, newTenantId, newBranchId, bType)
        const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        localDbStore.getTable('tenant_licenses').push({
          id: generateLocalUuid(),
          tenant_id: newTenantId,
          license_key: `RLPOS-TRL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          tier: 'TRIAL_30D',
          plan: 'trial',
          status: 'ACTIVE',
          expires_at: trialExpiry,
          valid_until: trialExpiry,
          features: { trial: true, trial_days: 30 },
          created_at: new Date().toISOString(),
        })
        localDbStore.getTable('tenant_memberships').push({
          user_id: uid,
          tenant_id: newTenantId,
          branch_id: newBranchId,
          role: caller.role,
          is_default: false,
          created_at: new Date().toISOString(),
        })
        localDbStore.saveToStorage()
        return { data: { success: true, tenant: newTenant, branch_id: newBranchId }, error: null }
      }

      if (name === 'fn_execute_checkout') {
        const {
          p_tenant_id,
          p_branch_id = null,
          p_struk_payload,
          p_cafe_items = [],
          p_carwash_payload = null,
        } = params || {}

        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        const profiles = localDbStore.getTable('profiles') || []
        const caller = profiles.find((p) => p.id === uid)
        if (!uid || !caller) {
          return { data: null, error: new Error('UNAUTHORIZED: Sesi pengguna diperlukan.') }
        }
        if (caller.is_active === false) {
          return { data: null, error: new Error('USER_INACTIVE: Keanggotaan aktif diperlukan.') }
        }
        if (!p_tenant_id || caller.tenant_id !== p_tenant_id) {
          return { data: null, error: new Error('TENANT_FORBIDDEN: Akses transaksi lintas tenant ditolak.') }
        }
        const callerRole = String(caller.role || '').trim().toLowerCase()
        if (!['owner', 'admin', 'kasir'].includes(callerRole)) {
          return { data: null, error: new Error('FORBIDDEN: Peran pengguna tidak diizinkan melakukan checkout.') }
        }

        const effectiveBranchId = p_branch_id || caller.branch_id || null
        const strukPayload = p_struk_payload || {}
        const idStruk = String(strukPayload.id_struk || `STRUK-${Date.now()}`).trim()
        const tanggal = strukPayload.tanggal || new Date().toLocaleDateString('en-CA')
        const jam = strukPayload.jam || new Date().toTimeString().split(' ')[0]

        let totalCafe = 0
        if (Array.isArray(p_cafe_items)) {
          const menus = localDbStore.getTable('daftar_harga_menu') || []
          for (const item of p_cafe_items) {
            const namaMenu = String(item.nama_menu || '').trim()
            const qtyMenu = parseFloat(item.qty ?? 1) || 1
            const hargaMenu = parseFloat(item.harga_satuan ?? item.harga ?? 0) || 0
            if (!namaMenu || qtyMenu <= 0) {
              return { data: null, error: new Error('INVALID_ITEM: Nama menu dan kuantitas wajib valid.') }
            }
            const menuLookupId = item.menu_id || (isValidPostgresUuid(item.id_menu) ? item.id_menu : null)
            const catalogMenu = menus.find(
              (m) =>
                m.tenant_id === p_tenant_id &&
                ((menuLookupId && m.id === menuLookupId) ||
                  String(m.nama_menu || '').trim().toLowerCase() === namaMenu.toLowerCase() ||
                  String(m.daftar_menu || '').trim().toLowerCase() === namaMenu.toLowerCase())
            )
            if (catalogMenu && hargaMenu !== parseFloat(catalogMenu.harga)) {
              return {
                data: null,
                error: new Error(
                  `PRICE_TAMPERING_DETECTED: Harga menu "${namaMenu}" tidak sesuai katalog (Katalog: ${catalogMenu.harga}, Dikirim: ${hargaMenu}).`
                ),
              }
            }
            totalCafe += hargaMenu * qtyMenu
          }
        }

        let totalCarwash = 0
        if (p_carwash_payload && Object.keys(p_carwash_payload).length > 0) {
          const cwPaket = String(p_carwash_payload.paket || '').trim()
          const cwUkuran = String(p_carwash_payload.ukuran || 'Medium').trim() || 'Medium'
          const cwVariant = String(p_carwash_payload.variant || 'Regular').trim() || 'Regular'
          const cwHarga = parseFloat(p_carwash_payload.harga ?? p_carwash_payload.tarif ?? 0) || 0
          if (cwHarga < 0) {
            return { data: null, error: new Error('INVALID_PRICE: Tarif carwash tidak boleh negatif.') }
          }

          if (cwPaket) {
            const cwPkg = (localDbStore.getTable('carwash_packages') || []).find(
              (p) =>
                p.tenant_id === p_tenant_id &&
                (String(p.nama_paket || '').trim().toLowerCase() === cwPaket.toLowerCase() ||
                  String(p.name || '').trim().toLowerCase() === cwPaket.toLowerCase())
            )
            if (cwPkg && cwUkuran.toLowerCase() !== 'custom') {
              const { harga: matrixPrice } = calculateCarwashPriceAndCommission({
                packageItem: cwPkg,
                ukuran: cwUkuran,
                variant: cwVariant,
              })
              const basePrice = parseFloat(cwPkg.tarif ?? cwPkg.price ?? 0) || 0
              const expectedPrice = matrixPrice > 0 ? matrixPrice : basePrice
              if (expectedPrice > 0 && cwHarga !== expectedPrice && cwHarga !== basePrice) {
                return {
                  data: null,
                  error: new Error(
                    `PRICE_TAMPERING_DETECTED: Harga paket carwash "${cwPaket}" tidak sesuai katalog (Katalog: ${expectedPrice}, Dikirim: ${cwHarga}).`
                  ),
                }
              }
            }
          }
          totalCarwash = cwHarga
        }

        const diskon = Math.max(0, parseFloat(strukPayload.diskon || 0) || 0)
        const pajak = Math.max(0, parseFloat(strukPayload.pajak || 0) || 0)
        const subtotal = totalCafe + totalCarwash
        const totalTagihan = Math.max(0, subtotal - diskon + pajak)
        const statusBayar = strukPayload.status_bayar || 'Selesai'
        const metodeBayar = String(strukPayload.metode_bayar || 'CASH').toUpperCase()

        localDbStore.getTable('struk').push({
          id: generateLocalUuid(),
          tenant_id: p_tenant_id,
          branch_id: effectiveBranchId,
          id_struk: idStruk,
          tanggal,
          jam,
          kasir: strukPayload.kasir || caller.nama || 'Kasir',
          nama_pelanggan: strukPayload.nama_pelanggan || 'Pelanggan Umum',
          status_bayar: statusBayar,
          status_pembayaran: statusBayar,
          metode_bayar: metodeBayar,
          total_tagihan: totalTagihan,
          nominal_bayar: totalTagihan,
          nominal_cash: metodeBayar === 'CASH' ? totalTagihan : parseFloat(strukPayload.nominal_cash || 0),
          nominal_qris: metodeBayar === 'QRIS' ? totalTagihan : parseFloat(strukPayload.nominal_qris || 0),
          nominal_transfer: metodeBayar === 'TRANSFER' ? totalTagihan : parseFloat(strukPayload.nominal_transfer || 0),
          created_at: new Date().toISOString(),
        })

        if (Array.isArray(p_cafe_items) && p_cafe_items.length > 0) {
          p_cafe_items.forEach((item) => {
            const h = parseFloat(item.harga_satuan ?? item.harga ?? 0) || 0
            const q = parseFloat(item.qty ?? 1) || 1
            localDbStore.getTable('cafe').push({
              id: generateLocalUuid(),
              tenant_id: p_tenant_id,
              branch_id: effectiveBranchId,
              id_struk: idStruk,
              tanggal,
              jam,
              menu_id: item.menu_id || (isValidPostgresUuid(item.id_menu) ? item.id_menu : null),
              stok_barang_id: item.stok_barang_id || null,
              nama_menu: item.nama_menu,
              qty: q,
              harga_satuan: h,
              subtotal: h * q,
              status: statusBayar,
              created_at: new Date().toISOString(),
            })
          })
        }

        if (p_carwash_payload && Object.keys(p_carwash_payload).length > 0) {
          localDbStore.getTable('carwash').push({
            id: generateLocalUuid(),
            tenant_id: p_tenant_id,
            branch_id: effectiveBranchId,
            id_struk: idStruk,
            tanggal,
            jam,
            plat: p_carwash_payload.plat || '-',
            model: p_carwash_payload.model || 'Mobil',
            variant: p_carwash_payload.variant || 'Regular',
            ukuran: p_carwash_payload.ukuran || 'Medium',
            paket: p_carwash_payload.paket || 'PAKET CUCI BIASA',
            harga: totalCarwash,
            anggota_1: p_carwash_payload.anggota_1 || null,
            anggota_2: p_carwash_payload.anggota_2 || null,
            anggota_1_id: p_carwash_payload.anggota_1_id || null,
            anggota_2_id: p_carwash_payload.anggota_2_id || null,
            status: statusBayar,
            created_at: new Date().toISOString(),
          })
        }

        localDbStore.saveToStorage()
        return {
          data: {
            success: true,
            status: 'COMPLETED',
            id_struk: idStruk,
            total_tagihan: totalTagihan,
          },
          error: null,
        }
      }

      if (name === 'fn_record_cashier_money_exchange') {
        const {
          p_tenant_id,
          p_branch_id = null,
          p_kasir = 'KASIR',
          p_cash_out = 0,
          p_qris_in = 0,
          p_customer = 'Umum',
          p_tanggal = new Date().toLocaleDateString('en-CA'),
        } = params || {}

        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        const profiles = localDbStore.getTable('profiles') || []
        const caller = profiles.find((p) => p.id === uid)
        if (!uid || !caller) {
          return { data: null, error: new Error('UNAUTHORIZED: Sesi pengguna diperlukan.') }
        }
        if (caller.is_active === false) {
          return { data: null, error: new Error('USER_INACTIVE: Akun staf tidak aktif.') }
        }
        const callerRole = String(caller.role || '').trim().toLowerCase()
        const memberships = localDbStore.getTable('tenant_memberships') || []
        const isMember = memberships.some((m) => m.user_id === uid && m.tenant_id === p_tenant_id)
        if (callerRole !== 'super admin' && caller.tenant_id !== p_tenant_id && !isMember) {
          return { data: null, error: new Error('TENANT_FORBIDDEN: Akses mutasi kas lintas tenant ditolak.') }
        }
        if (!['super admin', 'owner', 'admin pusat', 'admin', 'kasir'].includes(callerRole)) {
          return { data: null, error: new Error('FORBIDDEN: Peran pengguna tidak diizinkan mencatat tukar uang.') }
        }

        const cashOut = Math.round((Number(p_cash_out) || 0) * 100) / 100
        const qrisIn = Math.round((Number(p_qris_in) || 0) * 100) / 100
        if (cashOut <= 0 || qrisIn <= 0) {
          return { data: null, error: new Error('INVALID_EXCHANGE_AMOUNT: Nominal uang tunai dan transfer QRIS wajib lebih dari 0.') }
        }

        const effectiveBranchId = p_branch_id || caller.branch_id || null
        if (['kasir', 'admin'].includes(callerRole) && caller.branch_id && effectiveBranchId !== caller.branch_id) {
          return { data: null, error: new Error('BRANCH_FORBIDDEN: Peran ini hanya dapat mencatat mutasi pada cabangnya sendiri.') }
        }
        const balances = localDbStore.getTable('pos_balances')
        let cashRow = balances.find((b) => b.tenant_id === p_tenant_id && b.pos === 'SALDO CASH')
        if (!cashRow) {
          cashRow = {
            id: generateLocalUuid(),
            tenant_id: p_tenant_id,
            branch_id: effectiveBranchId,
            pos: 'SALDO CASH',
            label: 'Kas Tunai Laci Kasir',
            tipe: 'CASH',
            balance: 0,
            color: 'emerald',
            is_active: true,
          }
          balances.push(cashRow)
        }

        let bankRow =
          balances.find((b) => b.tenant_id === p_tenant_id && b.pos === 'SALDO REKENING Y') ||
          balances.find((b) => b.tenant_id === p_tenant_id && b.pos === 'SALDO REKENING OPERASIONAL') ||
          balances.find((b) => b.tenant_id === p_tenant_id && b.tipe === 'BANK')
        if (!bankRow) {
          bankRow = {
            id: generateLocalUuid(),
            tenant_id: p_tenant_id,
            branch_id: effectiveBranchId,
            pos: 'SALDO REKENING Y',
            label: 'Rekening QRIS & Transfer Utama',
            tipe: 'BANK',
            balance: 0,
            color: 'blue',
            is_active: true,
          }
          balances.push(bankRow)
        }

        const adminFee = qrisIn - cashOut
        const txRef = `EXCH-${Date.now()}`
        const cust = String(p_customer || 'Umum').trim() || 'Umum'
        const kasirName = String(p_kasir || 'KASIR').trim().toUpperCase() || 'KASIR'
        const nowIso = new Date().toISOString()
        const cashflowTable = localDbStore.getTable('cashflow')

        cashflowTable.push(
          {
            id: generateLocalUuid(),
            id_cashflow: `${txRef}-CASH`,
            id_sumber: txRef,
            tenant_id: p_tenant_id,
            branch_id: effectiveBranchId,
            pocket_id: cashRow.id,
            tanggal: p_tanggal,
            jenis: 'Pindah',
            kategori: 'Tukar Uang',
            pos: cashRow.pos,
            pemasukan: 0,
            pengeluaran: cashOut,
            keterangan_transaksi: `Tukar Uang Cash Keluar (${kasirName}) - Cust: ${cust}`,
            apakah_stok: false,
            created_at: nowIso,
          },
          {
            id: generateLocalUuid(),
            id_cashflow: `${txRef}-BANK`,
            id_sumber: txRef,
            tenant_id: p_tenant_id,
            branch_id: effectiveBranchId,
            pocket_id: bankRow.id,
            tanggal: p_tanggal,
            jenis: 'Pindah',
            kategori: 'Tukar Uang',
            pos: bankRow.pos,
            pemasukan: cashOut,
            pengeluaran: 0,
            keterangan_transaksi: `Tukar Uang QRIS Masuk (${kasirName}) - Cust: ${cust}`,
            apakah_stok: false,
            created_at: nowIso,
          }
        )

        if (adminFee > 0) {
          cashflowTable.push({
            id: generateLocalUuid(),
            id_cashflow: `${txRef}-FEE`,
            id_sumber: txRef,
            tenant_id: p_tenant_id,
            branch_id: effectiveBranchId,
            pocket_id: bankRow.id,
            tanggal: p_tanggal,
            jenis: 'Pemasukan',
            kategori: 'Pendapatan Lain-lain',
            pos: bankRow.pos,
            pemasukan: adminFee,
            pengeluaran: 0,
            keterangan_transaksi: `Biaya Admin Tukar Uang (${kasirName}) - Cust: ${cust}`,
            apakah_stok: false,
            created_at: nowIso,
          })
        }

        // Derive live book balances from opening_balance + cashflow (never mutate pos_balances.balance)
        const computePocketBalance = (pocket) => {
          const net = cashflowTable
            .filter((cf) => cf.tenant_id === p_tenant_id && (cf.pocket_id === pocket.id || (!cf.pocket_id && cf.pos === pocket.pos)))
            .reduce((sum, cf) => sum + (parseFloat(cf.pemasukan) || 0) - (parseFloat(cf.pengeluaran) || 0), 0)
          return (parseFloat(pocket.balance) || 0) + net
        }

        const newCashBalance = computePocketBalance(cashRow)
        const newBankBalance = computePocketBalance(bankRow)
        localDbStore.saveToStorage()

        return {
          data: {
            success: true,
            reference_id: txRef,
            cash_out: cashOut,
            qris_in: qrisIn,
            admin_fee: adminFee,
            cash_pocket_id: cashRow.id,
            bank_pocket_id: bankRow.id,
            cash_balance: newCashBalance,
            bank_balance: newBankBalance,
            bank_pos: bankRow.pos,
          },
          error: null,
        }
      }

      if (name === 'fn_get_owner_consolidated_summary') {
        const startDate = params?.p_start_date || null
        const endDate = params?.p_end_date || null
        const session = localDbStore.getAuth()
        const uid = session?.user?.id
        const caller = uid ? (localDbStore.getTable('profiles') || []).find((p) => p.id === uid) : null
        const memberships = localDbStore.getTable('tenant_memberships') || []
        const allActiveTenants = (localDbStore.getTable('tenants') || []).filter(
          (t) => String(t.status || '').toUpperCase() !== 'ARCHIVED'
        )
        const tenants =
          !caller || caller.role === 'Super Admin'
            ? allActiveTenants
            : allActiveTenants.filter(
                (t) =>
                  t.id === caller.tenant_id ||
                  memberships.some((m) => m.user_id === caller.id && m.tenant_id === t.id) ||
                  (t.owner_email && caller.email && t.owner_email.toLowerCase() === caller.email.toLowerCase())
              )
        const struk = localDbStore.getTable('struk') || []
        const pengeluaran = localDbStore.getTable('pengeluaran') || []
        const pocketBalances = localDbStore.getTable('v_pocket_balances') || []
        const outlets = tenants.map((t) => {
          const tStruk = struk.filter(
            (s) =>
              s.tenant_id === t.id &&
              ['Selesai', 'Lunas', 'Paid'].includes(s.status_bayar) &&
              (!startDate || s.tanggal >= startDate) &&
              (!endDate || s.tanggal <= endDate)
          )
          const tExp = pengeluaran.filter(
            (e) =>
              e.tenant_id === t.id &&
              (!startDate || e.tanggal >= startDate) &&
              (!endDate || e.tanggal <= endDate)
          )
          const tBal = pocketBalances.filter((b) => b.tenant_id === t.id && b.is_active !== false)
          return {
            tenant_id: t.id,
            tenant_name: t.nama,
            business_type: t.business_type,
            plan: t.plan,
            status: t.status,
            revenue: tStruk.reduce((sum, s) => sum + parseFloat(s.total_tagihan || 0), 0),
            transactions_count: tStruk.length,
            expenses: tExp.reduce((sum, e) => sum + parseFloat(e.nominal || 0), 0),
            cash_balance: tBal.reduce((sum, b) => sum + parseFloat(b.current_balance ?? b.balance ?? 0), 0),
          }
        })
        return { data: { success: true, outlets }, error: null }
      }

      if (name === 'fn_ingest_mandiri_normalized_tx') {
        const {
          p_connection_id,
          p_provider_message_id,
          p_sender_email = 'noreply.livin@bankmandiri.co.id',
          p_sender_verified = true,
          p_subject = '',
          p_received_at = new Date().toISOString(),
          p_payload = {},
        } = params || {}

        const connections = localDbStore.getTable('bank_email_connections') || []
        const conn = connections.find((c) => c.id === p_connection_id)
        if (!conn) {
          return { data: null, error: Object.assign(new Error('CONNECTION_NOT_FOUND: Koneksi email tidak ditemukan.'), { code: '23503' }) }
        }

        const actor = getActiveActorContext()
        const callerRole = actor?.role || localDbStore.getAuth()?.user?.role || 'Owner'
        const callerTenant = actor?.tenant_id || getActiveTenantId()
        if (callerRole !== 'Super Admin' && (callerTenant !== conn.tenant_id || !['Owner', 'Admin Pusat', 'Admin'].includes(callerRole))) {
          return { data: null, error: Object.assign(new Error('FORBIDDEN: Tidak memiliki akses ingest pada koneksi email ini.'), { code: '42501' }) }
        }

        const messages = localDbStore.getTable('bank_email_messages')
        const drafts = localDbStore.getTable('bank_transaction_drafts')
        const bindings = localDbStore.getTable('bank_account_bindings')
        const pockets = localDbStore.getTable('pos_balances')
        const cashflows = localDbStore.getTable('cashflow')

        const existingMsg = messages.find((m) => m.connection_id === p_connection_id && m.provider_message_id === p_provider_message_id)
        if (existingMsg) {
          const existingDraft = drafts.find((d) => d.tenant_id === conn.tenant_id && d.source_message_id === existingMsg.id)
          return {
            data: {
              status: 'ALREADY_INGESTED',
              idempotent_replay: true,
              message_id: existingMsg.id,
              draft_id: existingDraft?.id || null,
              review_status: existingDraft?.review_status || null,
              pocket_id: existingDraft?.pocket_id || null,
              branch_id: existingDraft?.branch_id || null,
            },
            error: null,
          }
        }

        const msgId = generateLocalUuid()
        const txStatus = String(p_payload?.transaction_status || 'SUCCESS').toUpperCase()
        const direction = String(p_payload?.direction || 'OUT').toUpperCase()
        const bankCode = String(p_payload?.bank_code || p_payload?.bank || 'MANDIRI').toUpperCase()
        const txType = String(p_payload?.tx_type || 'TRANSFER').toUpperCase()
        const last4 = String(p_payload?.account_last4 || '').trim() || null
        const principal = parseFloat(p_payload?.principal_amount || 0)
        const fee = p_payload?.fee_amount !== null && p_payload?.fee_amount !== undefined && p_payload?.fee_amount !== ''
          ? parseFloat(p_payload.fee_amount)
          : null
        const totalDebit = p_payload?.total_debit ? parseFloat(p_payload.total_debit) : principal + (fee || 0)
        const occurredAt = p_payload?.occurred_at || p_received_at || new Date().toISOString()
        const bookDate = p_payload?.book_date || String(occurredAt).slice(0, 10)
        const bankRef = String(p_payload?.bank_reference || '').trim() || null
        const counterparty = String(p_payload?.counterparty_name || '').trim() || null
        const parserVer = p_payload?.parser_version || 'mandiri_transfer_v1'
        const sugJenis = p_payload?.suggested_jenis || 'Pengeluaran Bersama'
        const sugKat = p_payload?.suggested_kategori || 'Biaya Operasional Lainnya'

        if (txStatus !== 'SUCCESS' || direction !== 'OUT' || totalDebit <= 0) {
          messages.push({
            id: msgId,
            tenant_id: conn.tenant_id,
            connection_id: p_connection_id,
            provider_message_id: p_provider_message_id,
            content_sha256: `sha_${msgId}`,
            sender_email: p_sender_email,
            sender_verified: Boolean(p_sender_verified),
            subject: p_subject,
            received_at: p_received_at,
            parse_status: 'IGNORED_NON_OUTGOING',
            parser_version: parserVer,
            created_at: new Date().toISOString(),
          })
          return { data: { status: 'IGNORED_NON_OUTGOING', message_id: msgId }, error: null }
        }

        const activeBindings = bindings.filter(
          (b) => b.tenant_id === conn.tenant_id && b.connection_id === p_connection_id && b.bank_code === bankCode && b.is_active !== false
        )
        const matchedBindings = last4 ? activeBindings.filter((b) => String(b.account_last4) === String(last4)) : []

        if (matchedBindings.length === 0 && activeBindings.length > 0 && last4) {
          messages.push({
            id: msgId,
            tenant_id: conn.tenant_id,
            connection_id: p_connection_id,
            provider_message_id: p_provider_message_id,
            content_sha256: `sha_${msgId}`,
            sender_email: p_sender_email,
            sender_verified: Boolean(p_sender_verified),
            subject: p_subject,
            received_at: p_received_at,
            parse_status: 'IGNORED_UNBOUND_ACCOUNT',
            parser_version: parserVer,
            created_at: new Date().toISOString(),
          })
          return { data: { status: 'IGNORED_UNBOUND_ACCOUNT', message_id: msgId, account_last4: last4 }, error: null }
        }

        let targetBindingId = null
        let targetPocketId = null
        let targetBranchId = null
        let reviewStatus = 'NEEDS_REVIEW'
        let reviewReason = 'UNRECOGNIZED_ACCOUNT'

        if (matchedBindings.length === 1) {
          const b = matchedBindings[0]
          if (b.import_start_date && bookDate < b.import_start_date) {
            return { data: { status: 'IGNORED_BEFORE_START_DATE', message_id: msgId }, error: null }
          }
          const pocket = pockets.find((p) => p.tenant_id === conn.tenant_id && p.id === b.pocket_id)
          targetBindingId = b.id
          targetPocketId = b.pocket_id
          targetBranchId = pocket ? (pocket.branch_id ?? null) : null
          reviewStatus = 'READY'
          reviewReason = 'READY_AUTO_MATCHED'
        } else if (matchedBindings.length > 1) {
          const defB = matchedBindings.find((b) => b.is_default_for_last4) || matchedBindings[0]
          targetBindingId = defB.id
          targetPocketId = null
          targetBranchId = null
          reviewStatus = 'NEEDS_REVIEW'
          reviewReason = 'AMBIGUOUS_POCKET'
        }

        let dupCfId = null
        if (
          bankRef &&
          drafts.some((d) => d.tenant_id === conn.tenant_id && d.bank_code === bankCode && d.bank_reference === bankRef && d.review_status !== 'IGNORED')
        ) {
          reviewStatus = 'NEEDS_REVIEW'
          reviewReason = 'POSSIBLE_DUPLICATE'
        } else if (targetPocketId) {
          const dupCf = cashflows.find(
            (cf) =>
              cf.tenant_id === conn.tenant_id &&
              cf.pocket_id === targetPocketId &&
              cf.tanggal === bookDate &&
              parseFloat(cf.pengeluaran || 0) === totalDebit
          )
          if (dupCf) {
            dupCfId = dupCf.id
            reviewStatus = 'NEEDS_REVIEW'
            reviewReason = 'POSSIBLE_DUPLICATE'
          }
        }

        messages.push({
          id: msgId,
          tenant_id: conn.tenant_id,
          connection_id: p_connection_id,
          provider_message_id: p_provider_message_id,
          content_sha256: `sha_${msgId}`,
          sender_email: p_sender_email,
          sender_verified: Boolean(p_sender_verified),
          subject: p_subject,
          received_at: p_received_at,
          parse_status: 'PARSED',
          parser_version: parserVer,
          created_at: new Date().toISOString(),
        })

        const draftId = generateLocalUuid()
        drafts.push({
          id: draftId,
          tenant_id: conn.tenant_id,
          branch_id: targetBranchId,
          connection_id: p_connection_id,
          source_message_id: msgId,
          binding_id: targetBindingId,
          pocket_id: targetPocketId,
          bank_code: bankCode,
          direction: 'OUT',
          tx_type: txType,
          currency: 'IDR',
          principal_amount: principal,
          fee_amount: fee,
          total_debit: totalDebit,
          occurred_at: occurredAt,
          book_date: bookDate,
          bank_reference: bankRef,
          counterparty_name: counterparty,
          account_last4: last4,
          parser_version: parserVer,
          suggested_jenis: sugJenis,
          suggested_kategori: sugKat,
          review_status: reviewStatus,
          review_reason: reviewReason,
          duplicate_candidate_cashflow_id: dupCfId,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        localDbStore.saveToStorage()

        return {
          data: {
            status: 'DRAFT_CREATED',
            message_id: msgId,
            draft_id: draftId,
            review_status: reviewStatus,
            review_reason: reviewReason,
            pocket_id: targetPocketId,
            branch_id: targetBranchId,
            duplicate_candidate_cashflow_id: dupCfId,
          },
          error: null,
        }
      }

      if (name === 'fn_post_bank_transaction_draft') {
        const {
          p_draft_id,
          p_expected_version = 1,
          p_action = 'RECORD_EXPENSE',
          p_pocket_id = null,
          p_jenis = null,
          p_kategori = null,
          p_keterangan = null,
          p_destination_pocket_id = null,
          p_existing_cashflow_id = null,
          p_ignore_reason = null,
          p_idempotency_key = null,
        } = params || {}

        const actor = getActiveActorContext()
        const callerRole = actor?.role || localDbStore.getAuth()?.user?.role || 'Owner'
        const callerTenant = actor?.tenant_id || getActiveTenantId()
        const callerBranch = actor?.branchId || null
        const callerUid = actor?.userId || localDbStore.getAuth()?.user?.id || 'demo-owner-id'

        if (!['Super Admin', 'Owner', 'Admin Pusat', 'Admin'].includes(callerRole)) {
          return { data: null, error: Object.assign(new Error('FORBIDDEN: Peran tidak diizinkan mem-posting draft mutasi bank.'), { code: '42501' }) }
        }

        const drafts = localDbStore.getTable('bank_transaction_drafts')
        const draft = drafts.find((d) => d.id === p_draft_id)
        if (!draft) {
          return { data: null, error: Object.assign(new Error('DRAFT_NOT_FOUND: Draft tidak ditemukan.'), { code: '23503' }) }
        }
        if (callerRole !== 'Super Admin' && draft.tenant_id !== callerTenant) {
          return { data: null, error: Object.assign(new Error('TENANT_FORBIDDEN: Akses lintas tenant ditolak.'), { code: '42501' }) }
        }

        if (draft.review_status === 'POSTED') {
          if (p_idempotency_key && draft.idempotency_key === p_idempotency_key) {
            return {
              data: {
                status: 'POSTED',
                idempotent_replay: true,
                draft_id: draft.id,
                posting_action: draft.posting_action,
                posted_amount: draft.total_debit,
                posted_cashflow_id: draft.posted_cashflow_id,
                posted_transfer_pair_cashflow_id: draft.posted_transfer_pair_cashflow_id,
                posted_journal_id: draft.posted_journal_id,
                linked_cashflow_id: draft.linked_cashflow_id,
              },
              error: null,
            }
          }
          return { data: null, error: Object.assign(new Error('ALREADY_POSTED: Draft sudah pernah diposting.'), { code: '23505' }) }
        }

        if (p_expected_version !== null && draft.version !== p_expected_version) {
          return { data: null, error: Object.assign(new Error(`VERSION_CONFLICT: expected ${p_expected_version}, actual ${draft.version}`), { code: '40001' }) }
        }

        const action = String(p_action || 'RECORD_EXPENSE').trim().toUpperCase()
        if (action === 'IGNORE') {
          if (!p_ignore_reason || !String(p_ignore_reason).trim()) {
            return { data: null, error: Object.assign(new Error('IGNORE_REASON_REQUIRED: Alasan wajib diisi.'), { code: '22023' }) }
          }
          if (callerRole === 'Admin' && draft.branch_id !== callerBranch) {
            return { data: null, error: Object.assign(new Error('BRANCH_FORBIDDEN: Admin Cabang hanya dapat mengabaikan draft cabangnya.'), { code: '42501' }) }
          }
          draft.review_status = 'IGNORED'
          draft.posting_action = 'IGNORE'
          draft.ignore_reason = String(p_ignore_reason).trim()
          draft.idempotency_key = p_idempotency_key || draft.idempotency_key
          draft.posted_by = callerUid
          draft.posted_at = new Date().toISOString()
          draft.version += 1
          localDbStore.saveToStorage()
          return { data: { status: 'IGNORED', draft_id: draft.id, posting_action: 'IGNORE' }, error: null }
        }

        const targetPocketId = p_pocket_id || draft.pocket_id
        if (!targetPocketId) {
          return { data: null, error: Object.assign(new Error('POCKET_REQUIRED: Pilih kantong rekening sumber sebelum mem-posting.'), { code: '23502' }) }
        }

        const pockets = localDbStore.getTable('pos_balances')
        const pocket = pockets.find((p) => p.id === targetPocketId && p.tenant_id === draft.tenant_id)
        if (!pocket) {
          return { data: null, error: Object.assign(new Error('POCKET_NOT_FOUND: Kantong tidak ditemukan.'), { code: '23503' }) }
        }

        if (callerRole === 'Admin' && (!pocket.branch_id || pocket.branch_id !== callerBranch || (draft.branch_id && draft.branch_id !== callerBranch))) {
          return { data: null, error: Object.assign(new Error('BRANCH_FORBIDDEN: Admin Cabang hanya dapat mem-posting kantong cabangnya sendiri.'), { code: '42501' }) }
        }

        const amount = parseFloat(draft.total_debit)
        const jenis = (p_jenis && String(p_jenis).trim()) || draft.suggested_jenis || 'Pengeluaran Bersama'
        const kategori = (p_kategori && String(p_kategori).trim()) || draft.suggested_kategori || 'Biaya Operasional Lainnya'
        const ket =
          (p_keterangan && String(p_keterangan).trim()) ||
          `Mutasi Mandiri ${draft.tx_type || 'OUT'}${draft.counterparty_name ? ' - ' + draft.counterparty_name : ''}`
        const cashflows = localDbStore.getTable('cashflow')

        if (action === 'LINK_EXISTING_CASHFLOW') {
          const existingCf = cashflows.find((cf) => cf.id === p_existing_cashflow_id && cf.tenant_id === draft.tenant_id)
          if (!existingCf) {
            return { data: null, error: Object.assign(new Error('CASHFLOW_NOT_FOUND: Transaksi cashflow tidak ditemukan.'), { code: '23503' }) }
          }
          draft.pocket_id = pocket.id
          draft.branch_id = pocket.branch_id ?? null
          draft.review_status = 'POSTED'
          draft.posting_action = 'LINK_EXISTING_CASHFLOW'
          draft.linked_cashflow_id = existingCf.id
          draft.idempotency_key = p_idempotency_key || draft.idempotency_key
          draft.posted_by = callerUid
          draft.posted_at = new Date().toISOString()
          draft.version += 1
          localDbStore.saveToStorage()
          return {
            data: {
              status: 'POSTED',
              idempotent_replay: false,
              draft_id: draft.id,
              posting_action: 'LINK_EXISTING_CASHFLOW',
              posted_amount: amount,
              linked_cashflow_id: existingCf.id,
            },
            error: null,
          }
        }

        if (action === 'TRANSFER_POCKET') {
          const destPocket = pockets.find((p) => p.id === p_destination_pocket_id && p.tenant_id === draft.tenant_id)
          if (!destPocket || destPocket.id === pocket.id) {
            return { data: null, error: Object.assign(new Error('INVALID_DESTINATION_POCKET: Kantong tujuan tidak valid.'), { code: '22023' }) }
          }
          const outCfId = generateLocalUuid()
          const inCfId = generateLocalUuid()
          cashflows.push(
            {
              id: outCfId,
              id_cashflow: outCfId,
              id_sumber: `BANK-IMP-${draft.id}`,
              tenant_id: draft.tenant_id,
              branch_id: pocket.branch_id || callerBranch || DEFAULT_BRANCH_ID,
              pocket_id: pocket.id,
              pos: pocket.pos,
              tanggal: draft.book_date,
              jenis: 'Pindah',
              kategori: 'Pindah',
              pemasukan: 0,
              pengeluaran: amount,
              keterangan_transaksi: ket,
              created_at: new Date().toISOString(),
            },
            {
              id: inCfId,
              id_cashflow: inCfId,
              id_sumber: `BANK-IMP-${draft.id}`,
              tenant_id: draft.tenant_id,
              branch_id: destPocket.branch_id || callerBranch || DEFAULT_BRANCH_ID,
              pocket_id: destPocket.id,
              pos: destPocket.pos,
              tanggal: draft.book_date,
              jenis: 'Pindah',
              kategori: 'Pindah',
              pemasukan: amount,
              pengeluaran: 0,
              keterangan_transaksi: ket,
              created_at: new Date().toISOString(),
            }
          )
          draft.pocket_id = pocket.id
          draft.branch_id = pocket.branch_id ?? null
          draft.review_status = 'POSTED'
          draft.posting_action = 'TRANSFER_POCKET'
          draft.posted_cashflow_id = outCfId
          draft.posted_transfer_pair_cashflow_id = inCfId
          draft.idempotency_key = p_idempotency_key || draft.idempotency_key
          draft.posted_by = callerUid
          draft.posted_at = new Date().toISOString()
          draft.version += 1
          localDbStore.saveToStorage()
          return {
            data: {
              status: 'POSTED',
              idempotent_replay: false,
              draft_id: draft.id,
              posting_action: 'TRANSFER_POCKET',
              posted_amount: amount,
              posted_cashflow_id: outCfId,
              posted_transfer_pair_cashflow_id: inCfId,
            },
            error: null,
          }
        }

        // Default: RECORD_EXPENSE
        const cfId = generateLocalUuid()
        const journalId = generateLocalUuid()
        cashflows.push({
          id: cfId,
          id_cashflow: cfId,
          id_sumber: `BANK-IMP-${draft.id}`,
          tenant_id: draft.tenant_id,
          branch_id: pocket.branch_id || callerBranch || DEFAULT_BRANCH_ID,
          pocket_id: pocket.id,
          pos: pocket.pos,
          tanggal: draft.book_date,
          jenis,
          kategori,
          pemasukan: 0,
          pengeluaran: amount,
          keterangan_transaksi: ket,
          apakah_stok: false,
          created_at: new Date().toISOString(),
        })

        const journals = localDbStore.getTable('journal_entries')
        const journalLines = localDbStore.getTable('journal_entry_lines')
        journals.push({
          id: journalId,
          tenant_id: draft.tenant_id,
          branch_id: pocket.branch_id || callerBranch || DEFAULT_BRANCH_ID,
          entry_no: `JE-BNK-${String(draft.id).slice(0, 8)}`,
          date: draft.book_date,
          memo: ket,
          total_amount: amount,
          status: 'POSTED',
          created_by: callerUid,
          created_at: new Date().toISOString(),
        })
        journalLines.push(
          {
            id: generateLocalUuid(),
            tenant_id: draft.tenant_id,
            journal_entry_id: journalId,
            account_id: '6102',
            debit: amount,
            credit: 0,
            memo: ket,
          },
          {
            id: generateLocalUuid(),
            tenant_id: draft.tenant_id,
            journal_entry_id: journalId,
            account_id: pocket.account_id || '1102',
            debit: 0,
            credit: amount,
            memo: `Kredit ${pocket.pos}`,
          }
        )

        draft.pocket_id = pocket.id
        draft.branch_id = pocket.branch_id ?? null
        draft.suggested_jenis = jenis
        draft.suggested_kategori = kategori
        draft.review_status = 'POSTED'
        draft.posting_action = 'RECORD_EXPENSE'
        draft.posted_cashflow_id = cfId
        draft.posted_journal_id = journalId
        draft.idempotency_key = p_idempotency_key || draft.idempotency_key
        draft.posted_by = callerUid
        draft.posted_at = new Date().toISOString()
        draft.version += 1
        localDbStore.saveToStorage()

        return {
          data: {
            status: 'POSTED',
            idempotent_replay: false,
            draft_id: draft.id,
            posting_action: 'RECORD_EXPENSE',
            posted_amount: amount,
            posted_cashflow_id: cfId,
            posted_journal_id: journalId,
          },
          error: null,
        }
      }

      throw new Error(`RPC ${name} not supported on local client`)
    },

    setActiveTenantId,
    setActiveActorContext,
    setActiveActor: setActiveActorContext,
    resetActiveActorContext,

    channel(name) {
      const channelObj = {
        on(event, filter, callback) {
          return channelObj
        },
        subscribe(callback) {
          if (typeof callback === 'function') callback('SUBSCRIBED')
          return channelObj
        },
        unsubscribe() {
          return Promise.resolve()
        },
      }
      return channelObj
    },
    removeChannel(channel) {
      return Promise.resolve()
    },
    removeAllChannels() {
      return Promise.resolve()
    },
    getChannels() {
      return []
    },
  }
}

export const localSupabase = createLocalClient()
export default localSupabase
