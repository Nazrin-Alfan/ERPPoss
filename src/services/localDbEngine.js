/**
 * Local Database Engine for SaaS ERP
 * Zero cloud dependency - 100% offline & persistent (localStorage/Memory).
 * Includes Multi-Tenant isolation, Chart of Accounts (Double-Entry Ledger),
 * Inventory Valuation, Auto-triggers, and Supabase-compatible Query Builder.
 */

import realSeedData from './realSeedData.json' with { type: 'json' }
import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../constants/erpConfig.js'
import { GeneralLedgerService, calculateMovingAverageCost } from './generalLedgerService.js'
import { DEFAULT_CARWASH_PACKAGES } from '../utils/carwashHelpers.js'
import { resolveAccountForPaymentMethod } from '../constants/transactionConstants.js'

const STORAGE_KEY = 'relaypos_real_sandbox_v2'
const AUTH_STORAGE_KEY = 'relaypos_real_auth_v2'
export const ACTIVE_TENANT_STORAGE_KEY = 'relaypos_active_tenant_id'
let inMemoryActiveTenantId = null

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
      nama: 'RelayPOS Demo Holding (Carwash + Cafe)',
      slug: 'relaypos-demo',
      business_type: 'HYBRID', // 'HYBRID' | 'CARWASH' | 'CAFE'
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tenant_demo_cafe',
      nama: 'Kopi Senja & Bistro (Cafe Only)',
      slug: 'kopi-senja',
      business_type: 'CAFE',
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    },
    {
      id: 'tenant_demo_carwash',
      nama: 'Kilat Auto Detailing (Carwash Only)',
      slug: 'kilat-carwash',
      business_type: 'CARWASH',
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
      expires_at: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString(), // 65 hari ke depan
      max_branches: 3,
      max_devices: 10,
      notes: 'Lisensi Resmi B2B RelayPOS - Paket Tahunan',
      created_at: new Date().toISOString()
    },
    {
      id: 'lic_demo_cafe',
      tenant_id: 'tenant_demo_cafe',
      license_key: 'RLPOS-CAFE-2026-CF10-992A',
      tier: 'PRO_ANNUAL',
      tier_name: 'RelayPOS Cafe Pro (Lisensi Tahunan)',
      status: 'ACTIVE',
      started_at: '2026-01-01T00:00:00.000Z',
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      max_branches: 1,
      max_devices: 5,
      notes: 'Lisensi Demo Cafe Murni',
      created_at: new Date().toISOString()
    },
    {
      id: 'lic_demo_cw',
      tenant_id: 'tenant_demo_carwash',
      license_key: 'RLPOS-WASH-2026-CW20-881C',
      tier: 'PRO_ANNUAL',
      tier_name: 'RelayPOS Carwash Pro (Lisensi Tahunan)',
      status: 'ACTIVE',
      started_at: '2026-01-01T00:00:00.000Z',
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      max_branches: 1,
      max_devices: 5,
      notes: 'Lisensi Demo Carwash Murni',
      created_at: new Date().toISOString()
    }
  ],
  branches: [
    {
      id: DEFAULT_BRANCH_ID,
      tenant_id: DEFAULT_TENANT_ID,
      nama: 'Cabang Utama (Carwash & Cafe)',
      kode: 'HO-01',
      alamat: 'Jl. Merdeka No. 88, Medan',
      telepon: '0812-3456-7890',
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'branch_cafe_main',
      tenant_id: 'tenant_demo_cafe',
      nama: 'Outlet Kopi Senja Thamrin',
      kode: 'CF-01',
      alamat: 'Jl. M.H. Thamrin No. 12, Jakarta Pusat',
      telepon: '0811-9876-5432',
      is_active: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'branch_carwash_main',
      tenant_id: 'tenant_demo_carwash',
      nama: 'Kilat Detailing Bay Sudirman',
      kode: 'CW-01',
      alamat: 'Jl. Jend. Sudirman Kav. 45, Bandung',
      telepon: '0813-2233-4455',
      is_active: true,
      created_at: new Date().toISOString(),
    },
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
  suppliers: [
    {
      id: 'sup_01',
      tenant_id: DEFAULT_TENANT_ID,
      nama: 'CV Berkah Roastery Kopi',
      kontak: 'Budi Santoso (0811-9876-5432)',
      kategori: 'Bahan Baku Cafe',
      alamat: 'Medan',
      created_at: new Date().toISOString(),
    },
    {
      id: 'sup_02',
      tenant_id: DEFAULT_TENANT_ID,
      nama: 'PT Autocare Mega Mandiri',
      kontak: 'Hendra (0812-7788-9900)',
      kategori: 'Chemical & Snow Shampoo',
      alamat: 'Medan',
      created_at: new Date().toISOString(),
    },
  ],
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
    { id: 1, nama: 'KRU 1', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 2, nama: 'KRU 2', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 3, nama: 'KRU 3', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 4, nama: 'KRU 4', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
  ],
  karyawan_kantor: [
    { id: 'kk_owner', nama: 'Owner Demo', role: 'Owner', email: 'owner@relaypos.com', source: 'staff_registration', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 'kk_admin', nama: 'Admin Supervisor', role: 'Admin', email: 'admin@relaypos.com', source: 'staff_registration', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 'kk_kasir', nama: 'Kasir Demo', role: 'Kasir', email: 'kasir@relaypos.com', source: 'staff_registration', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
    { id: 'kk_1', nama: 'INDAH', role: 'Staff Kantor', email: 'indah@relaypos.com', source: 'manual', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: new Date().toISOString() },
  ],
  stok_barang: realSeedData.stok_barang && realSeedData.stok_barang.length > 0 ? realSeedData.stok_barang : [],
  daftar_harga_menu: realSeedData.daftar_harga_menu && realSeedData.daftar_harga_menu.length > 0 ? realSeedData.daftar_harga_menu : [],
  resep: realSeedData.resep && realSeedData.resep.length > 0 ? realSeedData.resep : [],
  diskon: realSeedData.diskon && realSeedData.diskon.length > 0 ? realSeedData.diskon : [],
  pos_balances: (realSeedData.pos_balances && realSeedData.pos_balances.length > 0 ? realSeedData.pos_balances : [
    { pos: 'SALDO CASH', balance: 0, label: 'Kas Laci Kasir', tipe: 'CASH', color: 'emerald', keterangan: 'Uang fisik di mesin kasir' },
    { pos: 'SALDO REKENING Y', balance: 0, label: 'Rekening Operasional Y', tipe: 'BANK', color: 'blue', keterangan: 'Rekening penerimaan utama & QRIS' },
    { pos: 'SALDO REKENING N', balance: 0, label: 'Rekening Operasional N', tipe: 'BANK', color: 'cyan', keterangan: 'Rekening biaya operasional' },
    { pos: 'SALDO REKENING R', balance: 0, label: 'Rekening Cadangan R', tipe: 'BANK', color: 'purple', keterangan: 'Rekening cadangan / simpanan' }
  ]).map(b => ({
    id: b.id || `acc_${String(b.pos || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    pos: b.pos,
    label: b.label || (b.pos === 'SALDO CASH' ? 'Kas Laci Kasir' : b.pos === 'SALDO REKENING Y' ? 'Rekening Operasional Y' : b.pos === 'SALDO REKENING N' ? 'Rekening Operasional N' : b.pos === 'SALDO REKENING R' ? 'Rekening Cadangan R' : b.pos),
    tipe: b.tipe || (b.pos === 'SALDO CASH' ? 'CASH' : 'BANK'),
    balance: typeof b.balance === 'number' ? b.balance : parseFloat(b.balance || 0),
    keterangan: b.keterangan || (b.pos === 'SALDO CASH' ? 'Uang fisik di kasir' : 'Rekening bank operasional'),
    color: b.color || (b.pos === 'SALDO CASH' ? 'emerald' : b.pos === 'SALDO REKENING Y' ? 'blue' : b.pos === 'SALDO REKENING N' ? 'cyan' : 'purple'),
    is_active: b.is_active !== false,
    tenant_id: b.tenant_id || DEFAULT_TENANT_ID,
    branch_id: b.branch_id || DEFAULT_BRANCH_ID
  })),
  carwash_packages: DEFAULT_CARWASH_PACKAGES.map((pkg, idx) => ({
    ...pkg,
    sort_order: idx + 1,
    tenant_id: DEFAULT_TENANT_ID,
    branch_id: DEFAULT_BRANCH_ID
  })),

  // 5. TRANSAKSI REAL DARI SUPABASE CLOUD (DEFAULT TENANT ISOLATED)
  struk: (realSeedData.struk || []).map((s) => ({
    ...s,
    tenant_id: s.tenant_id || DEFAULT_TENANT_ID,
    branch_id: s.branch_id || DEFAULT_BRANCH_ID
  })),
  cafe: (realSeedData.cafe || []).map((c) => ({
    ...c,
    tenant_id: c.tenant_id || DEFAULT_TENANT_ID,
    branch_id: c.branch_id || DEFAULT_BRANCH_ID
  })),
  carwash: (realSeedData.carwash || []).map((cw) => ({
    ...cw,
    tenant_id: cw.tenant_id || DEFAULT_TENANT_ID,
    branch_id: cw.branch_id || DEFAULT_BRANCH_ID
  })),
  pengeluaran: (realSeedData.pengeluaran || []).map((p) => ({
    ...p,
    tenant_id: p.tenant_id || DEFAULT_TENANT_ID,
    branch_id: p.branch_id || DEFAULT_BRANCH_ID
  })),
  barang_masuk: (realSeedData.barang_masuk || []).map((bm) => ({
    ...bm,
    tenant_id: bm.tenant_id || DEFAULT_TENANT_ID,
    branch_id: bm.branch_id || DEFAULT_BRANCH_ID
  })),
  barang_keluar: (realSeedData.barang_keluar || []).map((bk) => ({
    ...bk,
    tenant_id: bk.tenant_id || DEFAULT_TENANT_ID,
    branch_id: bk.branch_id || DEFAULT_BRANCH_ID
  })),
  cashflow: (realSeedData.cashflow || []).map((cf) => ({
    ...cf,
    tenant_id: cf.tenant_id || DEFAULT_TENANT_ID,
    branch_id: cf.branch_id || DEFAULT_BRANCH_ID
  })),

  // 6. PROFILES & USERS (4 ROLE: SUPER_ADMIN, OWNER, ADMIN, KASIR)
  profiles: [
    {
      id: 'demo-superadmin-id',
      tenant_id: 'tenant_platform_root',
      branch_id: 'branch_platform_root',
      nama: 'Solo Founder (Super Admin)',
      email: 'superadmin@relaypos.com',
      role: 'Super Admin',
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-owner-id',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      nama: 'Owner Demo',
      email: 'owner@relaypos.com',
      role: 'Owner',
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-admin-id',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      nama: 'Admin Supervisor',
      email: 'admin@relaypos.com',
      role: 'Admin',
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-kasir-id',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      nama: 'Kasir Demo',
      email: 'kasir@relaypos.com',
      role: 'Kasir',
      created_at: new Date().toISOString(),
    },
    {
      id: '96e0b43e-b470-4394-b46c-242bb6dfeece',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      nama: 'nazrinalfansyurihrp',
      email: 'owner@relaypos.com',
      role: 'Owner',
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
    this.ensureInitialized()
  }

  setSyncStrukToCashflow(enabled) {
    this.syncStrukToCashflow = Boolean(enabled)
  }

  ensureInitialized() {
    if (!this.data.journal_entries) this.data.journal_entries = []
    if (!this.data.journal_entry_lines) this.data.journal_entry_lines = []
    if (!this.data.master_categories || this.data.master_categories.length === 0) {
      this.data.master_categories = JSON.parse(JSON.stringify(INITIAL_SEED_DATA.master_categories || []))
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
    
    // Pastikan 3 akun role demo (Owner, Admin, Kasir) selalu tersedia
    if (!this.data.profiles) this.data.profiles = []
    INITIAL_SEED_DATA.profiles.forEach((p) => {
      const exists = this.data.profiles.some(
        (existing) => existing.email?.toLowerCase() === p.email.toLowerCase() && existing.role === p.role
      )
      if (!exists) {
        this.data.profiles.push(JSON.parse(JSON.stringify(p)))
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
      id: '96e0b43e-b470-4394-b46c-242bb6dfeece',
      email: 'owner@jayabersama.com',
      role: 'Owner',
      user_metadata: { nama: 'nazrinalfansyurihrp', role: 'Owner' },
    }
    return { user: defaultUser, token: 'mock-local-token' }
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
          tableCwPkg.push({
            ...pkg,
            id: `pkg_${tenantId}_${idx + 1}`,
            sort_order: idx + 1,
            tenant_id: tenantId,
            branch_id: `branch_${tenantId}_main`
          })
        })
      }
    }

    // 7. Master Menu Cafe Awal (jika tipe Cafe / Hybrid)
    if (businessType !== 'CARWASH') {
      const tableMenu = this.getTable('daftar_harga_menu')
      const hasMenu = tableMenu.some(m => m.tenant_id === tenantId)
      if (!hasMenu) {
        hasMutations = true
        const sampleMenus = (realSeedData.daftar_harga_menu || []).slice(0, 10)
        sampleMenus.forEach((m, idx) => {
          tableMenu.push({
            ...m,
            id_menu: `menu_${tenantId}_${idx + 1}`,
            tenant_id: tenantId,
            branch_id: `branch_${tenantId}_main`
          })
        })
      }
    }

    if (hasMutations) {
      this.saveToStorage()
    }
  }

  getTable(tableName) {
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
      console.warn(`[DOUBLE_ENTRY_WARNING] Imbalance in journal entry: Debit=${totalDebit}, Credit=${totalCredit}`)
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
    this.filters.push((row) => Array.isArray(values) && values.includes(this._getValue(row, column)))
    return this
  }

  is(column, value) {
    this.filters.push((row) => this._getValue(row, column) === value)
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
    if (this.operation === 'DELETE') {
      return this._executeDelete()
    }
    return this._executeSelect()
  }

  // Execute SELECT
  async _executeSelect() {
    const activeTenantId = getActiveTenantId()
    
    // Auto-provision master data untuk tenant baru HANYA jika belum pernah di-provision (0ms check)
    if (activeTenantId && activeTenantId !== DEFAULT_TENANT_ID && (!this.store.provisionedTenants || !this.store.provisionedTenants.has(activeTenantId))) {
      this.store.ensureTenantMasterData(activeTenantId)
    }

    const table = this.store.getTable(this.tableName)
    let filteredResults = table.filter((row) => this.filters.every((f) => f(row)))

    // Automatic Row-Level Security (RLS) Isolation untuk Multi-Tenant Table
    if (isMultiTenantTable(this.tableName) && !this.explicitTenantFilter && !this.bypassTenantIsolation) {
      filteredResults = filteredResults.filter((row) => {
        if (row.tenant_id) return row.tenant_id === activeTenantId
        // Data bawaan awal tanpa tenant_id hanya boleh terlihat oleh DEFAULT_TENANT_ID
        return activeTenantId === DEFAULT_TENANT_ID
      })
    }

    const totalCount = filteredResults.length
    let results = [...filteredResults]

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
    const table = this.store.getTable(this.tableName)
    const inserted = []
    const activeTenantId = getActiveTenantId()

    if (activeTenantId && activeTenantId !== DEFAULT_TENANT_ID) {
      this.store.ensureTenantMasterData(activeTenantId)
    }

    for (const item of records) {
      const effectiveTenant = item.tenant_id || (isMultiTenantTable(this.tableName) ? activeTenantId : undefined)
      const effectiveBranch = item.branch_id || (effectiveTenant === DEFAULT_TENANT_ID ? DEFAULT_BRANCH_ID : `branch_${effectiveTenant || 'main'}_main`)

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

      if (!record.id && !record.id_struk && !record.id_detail && !record.id_transaksi && !record.id_pengeluaran && !record.id_cashflow && !record.id_bahan_baku && !record.id_menu && !record.id_resep) {
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
    const table = this.store.getTable(this.tableName)
    const updated = []
    const activeTenantId = getActiveTenantId()

    table.forEach((row, idx) => {
      const tenantMatch = (this.bypassTenantIsolation || this.explicitTenantFilter || this.hasSpecificIdFilter || !isMultiTenantTable(this.tableName))
        ? true
        : (row.tenant_id ? row.tenant_id === activeTenantId : activeTenantId === DEFAULT_TENANT_ID)

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

  // Execute DELETE
  async _executeDelete() {
    const table = this.store.getTable(this.tableName)
    const remaining = []
    const deleted = []
    const activeTenantId = getActiveTenantId()

    table.forEach((row) => {
      const tenantMatch = (this.bypassTenantIsolation || this.explicitTenantFilter || this.hasSpecificIdFilter || !isMultiTenantTable(this.tableName))
        ? true
        : (row.tenant_id ? row.tenant_id === activeTenantId : activeTenantId === DEFAULT_TENANT_ID)

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
        r.nama_menu === record.nama_menu
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
            id_bahan_baku: rec.id_bahan_baku,
            nama_bahan_baku: rec.nama_bahan,
            jumlah_keluar: qtyOut,
            tanggal: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
          })

          const stockItem = stockTable.find((s) => 
            (s.tenant_id ? s.tenant_id === effectiveTenant : true) &&
            s.id_bahan_baku === rec.id_bahan_baku
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
    const settlementDate = (struk.waktu_dibayar ? struk.waktu_dibayar.split('T')[0] : null) || struk.tanggal || new Date().toISOString().split('T')[0]

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
    const stockItem = stockTable.find((s) => s.id_barang === rawItemId || s.id_bahan_baku === rawItemId)
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
export const createLocalClient = () => {
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
        const profiles = localDbStore.getTable('profiles')
        const cleanInput = (email || '').trim().toLowerCase()
        const usernamePart = cleanInput.includes('@') ? cleanInput.split('@')[0] : cleanInput
        const normalizedEmail = cleanInput.includes('@') ? cleanInput : `${cleanInput}@jb.local`

        const profile = profiles.find((p) => 
          (p.email && p.email.toLowerCase() === normalizedEmail) ||
          (p.email && p.email.toLowerCase() === cleanInput) ||
          (p.nama && p.nama.toLowerCase() === cleanInput) ||
          (p.nama && p.nama.toLowerCase() === usernamePart)
        ) || {
          id: `usr_${Date.now()}`,
          nama: email.split('@')[0].toUpperCase(),
          email: normalizedEmail,
          role: email.toLowerCase().includes('owner') || email.toLowerCase().includes('nazrin')
            ? 'Owner'
            : (email.toLowerCase().includes('admin') || email.toLowerCase().includes('spv') || email.toLowerCase().includes('leader') ? 'Admin' : 'Kasir'),
        }

        const userObj = {
          id: profile.id,
          email: profile.email || normalizedEmail,
          role: profile.role,
          user_metadata: {
            nama: profile.nama,
            role: profile.role,
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
        const normalizedEmail = email.includes('@') ? email.trim() : `${email.trim().toLowerCase()}@jb.local`
        const newUserId = `usr_${Date.now()}`
        const nama = options.data?.nama || email.split('@')[0]
        const role = options.data?.role || 'Kasir'

        const profileRecord = {
          id: newUserId,
          tenant_id: DEFAULT_TENANT_ID,
          branch_id: DEFAULT_BRANCH_ID,
          nama,
          email: normalizedEmail,
          role,
          created_at: new Date().toISOString(),
        }

        localDbStore.getTable('profiles').push(profileRecord)
        localDbStore.saveToStorage()

        const userObj = {
          id: newUserId,
          email: normalizedEmail,
          role,
          user_metadata: { nama, role },
        }

        return { data: { user: userObj }, error: null }
      },
    },

    erp: {
      resetDatabase() {
        return localDbStore.resetDatabase()
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
