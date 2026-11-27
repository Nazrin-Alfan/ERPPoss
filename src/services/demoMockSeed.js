/**
 * demoMockSeed.js
 * Rich, date-relative mock data for browser local development preview (`npm run dev`).
 * Never invoked in Vitest (`MODE === 'test'`) or Cloud production mode, so all
 * automated unit, contract, and cold-start tests stay 100% deterministic.
 */

import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../constants/erpConfig.js'
import { DEFAULT_CARWASH_PACKAGES } from '../utils/carwashHelpers.js'

export const DEMO_MOCK_SEED_VERSION = 'v5_rebrand_preview_1'

const OUTLET_SUDIRMAN_ID = 'tenant_outlet_sudirman'
const BRANCH_SUDIRMAN_ID = 'branch_sudirman_01'
const OUTLET_KEMANG_ID = 'tenant_outlet_kemang'
const BRANCH_KEMANG_ID = 'branch_kemang_01'

function formatDateLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getThisMonthDate(daysBack, now = new Date()) {
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack)
  if (candidate.getMonth() !== now.getMonth()) {
    // Clamp into day 1 of the current month if run early in the month
    return formatDateLocal(new Date(now.getFullYear(), now.getMonth(), 1))
  }
  return formatDateLocal(candidate)
}

function getLastMonthDate(dayOfMonth, now = new Date()) {
  const safeDay = Math.min(28, Math.max(1, dayOfMonth))
  return formatDateLocal(new Date(now.getFullYear(), now.getMonth() - 1, safeDay))
}

function ensureArray(data, key) {
  if (!Array.isArray(data[key])) data[key] = []
  return data[key]
}

export function applyDevMockSeedData(data, now = new Date()) {
  const todayStr = formatDateLocal(now)
  const yesterdayStr = getThisMonthDate(1, now)
  const day2Str = getThisMonthDate(2, now)
  const day4Str = getThisMonthDate(4, now)
  const day6Str = getThisMonthDate(6, now)
  const day9Str = getThisMonthDate(9, now)
  const day13Str = getThisMonthDate(13, now)
  const day18Str = getThisMonthDate(18, now)
  const day22Str = getThisMonthDate(22, now)

  const prevM1 = getLastMonthDate(4, now)
  const prevM2 = getLastMonthDate(9, now)
  const prevM3 = getLastMonthDate(15, now)
  const prevM4 = getLastMonthDate(21, now)
  const prevM5 = getLastMonthDate(26, now)
  const churnDateStr = formatDateLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 36))

  // 1. Multi-outlet Tenants owned by owner@relaypos.com
  const tenants = ensureArray(data, 'tenants')
  const extraTenants = [
    {
      id: OUTLET_SUDIRMAN_ID,
      nama: 'RelayPOS Cafe Sudirman',
      slug: 'relaypos-cafe-sudirman',
      owner_name: 'Owner RelayPOS',
      owner_email: 'owner@relaypos.com',
      telepon: '0812-8800-1122',
      alamat: 'Jl. Jend. Sudirman Kav. 42, Jakarta',
      business_type: 'CAFE',
      plan: 'PRO',
      status: 'ACTIVE',
      onboarding_completed: true,
      created_at: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString(),
    },
    {
      id: OUTLET_KEMANG_ID,
      nama: 'RelayPOS Wash Kemang',
      slug: 'relaypos-wash-kemang',
      owner_name: 'Owner RelayPOS',
      owner_email: 'owner@relaypos.com',
      telepon: '0812-9900-3344',
      alamat: 'Jl. Kemang Raya No. 18, Jakarta Selatan',
      business_type: 'CARWASH',
      plan: 'TRIAL',
      status: 'ACTIVE',
      onboarding_completed: true,
      created_at: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    },
  ]
  extraTenants.forEach((et) => {
    if (!tenants.some((t) => t.id === et.id)) tenants.push(et)
  })
  const defaultTenant = tenants.find((t) => t.id === DEFAULT_TENANT_ID)
  if (defaultTenant) {
    defaultTenant.onboarding_completed = true
  }

  // 2. Branches & Licenses for extra outlets
  const branches = ensureArray(data, 'branches')
  ;[
    {
      id: BRANCH_SUDIRMAN_ID,
      tenant_id: OUTLET_SUDIRMAN_ID,
      nama: 'Outlet Sudirman',
      kode: 'SDM-01',
      alamat: 'Jl. Jend. Sudirman Kav. 42, Jakarta',
      telepon: '0812-8800-1122',
      is_active: true,
      created_at: now.toISOString(),
    },
    {
      id: BRANCH_KEMANG_ID,
      tenant_id: OUTLET_KEMANG_ID,
      nama: 'Outlet Kemang',
      kode: 'KMG-01',
      alamat: 'Jl. Kemang Raya No. 18, Jakarta Selatan',
      telepon: '0812-9900-3344',
      is_active: true,
      created_at: now.toISOString(),
    },
  ].forEach((b) => {
    if (!branches.some((eb) => eb.id === b.id)) branches.push(b)
  })

  const licenses = ensureArray(data, 'tenant_licenses')
  const nextYearIso = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
  ;[
    {
      id: 'lic_sudirman_pro',
      tenant_id: OUTLET_SUDIRMAN_ID,
      license_key: 'RLPOS-PRO-SDM-2026-881A',
      tier: 'PRO_ANNUAL',
      tier_name: 'RelayPOS Pro Outlet',
      status: 'ACTIVE',
      started_at: '2026-01-01T00:00:00.000Z',
      expires_at: nextYearIso,
      max_branches: 2,
      max_devices: 5,
      created_at: now.toISOString(),
    },
    {
      id: 'lic_kemang_trial',
      tenant_id: OUTLET_KEMANG_ID,
      license_key: 'RLPOS-PRO-KMG-2026-992B',
      tier: 'PRO_ANNUAL',
      tier_name: 'RelayPOS Pro Outlet',
      status: 'ACTIVE',
      started_at: '2026-01-01T00:00:00.000Z',
      expires_at: nextYearIso,
      max_branches: 2,
      max_devices: 5,
      created_at: now.toISOString(),
    },
  ].forEach((lic) => {
    if (!licenses.some((el) => el.id === lic.id)) licenses.push(lic)
  })

  // 3. Crew Carwash
  data.karyawan_cuci = [
    { id: 1, nama: 'Angga', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: now.toISOString() },
    { id: 2, nama: 'Ferry', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: now.toISOString() },
    { id: 3, nama: 'Rahman', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: now.toISOString() },
    { id: 4, nama: 'Dimas', tenant_id: DEFAULT_TENANT_ID, branch_id: DEFAULT_BRANCH_ID, created_at: now.toISOString() },
  ]

  // 4. Clean positive Inventory Stock (with 2 low-stock items for Dashboard Alerts & Gudang)
  data.stok_barang = [
    {
      id: 'stk-kopi-01',
      id_bahan_baku: 'BK-01',
      nama_produk: 'Biji Kopi House Blend',
      nama_barang: 'Biji Kopi House Blend',
      satuan: 'Gram',
      stok: 1450,
      harga_satuan: 210,
      harga_beli: 210,
      moving_average_cost: 210,
      minimum_stok: 300,
      min_stok: 300,
      kategori: 'Bahan Baku',
      gudang: 'CAFE',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      updated_at: now.toISOString(),
    },
    {
      id: 'stk-susu-02',
      id_bahan_baku: 'BK-02',
      nama_produk: 'Susu Segar UHT Full Cream',
      nama_barang: 'Susu Segar UHT Full Cream',
      satuan: 'Liter',
      stok: 4,
      harga_satuan: 21500,
      harga_beli: 21500,
      moving_average_cost: 21500,
      minimum_stok: 10,
      min_stok: 10,
      kategori: 'Bahan Baku',
      gudang: 'CAFE',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      updated_at: now.toISOString(),
    },
    {
      id: 'stk-aren-03',
      id_bahan_baku: 'BK-03',
      nama_produk: 'Gula Aren Cair Premium',
      nama_barang: 'Gula Aren Cair Premium',
      satuan: 'Ml',
      stok: 2400,
      harga_satuan: 45,
      harga_beli: 45,
      moving_average_cost: 45,
      minimum_stok: 500,
      min_stok: 500,
      kategori: 'Bahan Baku',
      gudang: 'CAFE',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      updated_at: now.toISOString(),
    },
    {
      id: 'stk-teh-04',
      id_bahan_baku: 'BK-06',
      nama_produk: 'Daun Teh Melati',
      nama_barang: 'Daun Teh Melati',
      satuan: 'Gram',
      stok: 850,
      harga_satuan: 28,
      harga_beli: 28,
      moving_average_cost: 28,
      minimum_stok: 150,
      min_stok: 150,
      kategori: 'Bahan Baku',
      gudang: 'CAFE',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      updated_at: now.toISOString(),
    },
    {
      id: 'stk-kentang-05',
      id_bahan_baku: 'BMK-06',
      nama_produk: 'Kentang Shoestring Beku',
      nama_barang: 'Kentang Shoestring Beku',
      satuan: 'Gram',
      stok: 3200,
      harga_satuan: 34,
      harga_beli: 34,
      moving_average_cost: 34,
      minimum_stok: 800,
      min_stok: 800,
      kategori: 'Bahan Baku',
      gudang: 'CAFE',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      updated_at: now.toISOString(),
    },
    {
      id: 'stk-shm-06',
      id_bahan_baku: 'CW-01',
      nama_produk: 'Shampoo Snow Wash Touchless',
      nama_barang: 'Shampoo Snow Wash Touchless',
      satuan: 'Liter',
      stok: 3,
      harga_satuan: 38000,
      harga_beli: 38000,
      moving_average_cost: 38000,
      minimum_stok: 10,
      min_stok: 10,
      kategori: 'Chemical Carwash',
      gudang: 'CARWASH',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      updated_at: now.toISOString(),
    },
    {
      id: 'stk-wax-07',
      id_bahan_baku: 'CW-02',
      nama_produk: 'Silicone Wax & Tire Polish',
      nama_barang: 'Silicone Wax & Tire Polish',
      satuan: 'Liter',
      stok: 18,
      harga_satuan: 45000,
      harga_beli: 45000,
      moving_average_cost: 45000,
      minimum_stok: 5,
      min_stok: 5,
      kategori: 'Chemical Carwash',
      gudang: 'CARWASH',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      updated_at: now.toISOString(),
    },
    {
      id: 'stk-parfum-08',
      id_bahan_baku: 'MRC-01',
      nama_produk: 'Parfum Mobil Kopi Bali',
      nama_barang: 'Parfum Mobil Kopi Bali',
      satuan: 'Pcs',
      stok: 24,
      harga_satuan: 18000,
      harga_beli: 18000,
      harga_jual: 35000,
      moving_average_cost: 18000,
      minimum_stok: 6,
      min_stok: 6,
      kategori: 'Merchandise',
      gudang: 'MERCHANDISE',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      updated_at: now.toISOString(),
    },
  ]

  // 5. Realistic Pocket Opening Balances across all 3 outlets
  data.pos_balances = [
    {
      id: 'acc_saldo_cash',
      pos: 'SALDO CASH',
      label: 'Kas Laci Kasir',
      tipe: 'CASH',
      balance: 2450000,
      color: 'emerald',
      keterangan: 'Uang fisik di mesin kasir',
      is_active: true,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
    },
    {
      id: 'acc_saldo_rekening_y',
      pos: 'SALDO REKENING Y',
      label: 'Rekening Operasional Y',
      tipe: 'BANK',
      balance: 14800000,
      color: 'blue',
      keterangan: 'Rekening penerimaan utama & QRIS',
      is_active: true,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
    },
    {
      id: 'acc_saldo_rekening_n',
      pos: 'SALDO REKENING N',
      label: 'Rekening Operasional N',
      tipe: 'BANK',
      balance: 4250000,
      color: 'cyan',
      keterangan: 'Rekening biaya operasional',
      is_active: true,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
    },
    {
      id: 'acc_saldo_rekening_r',
      pos: 'SALDO REKENING R',
      label: 'Rekening Cadangan R',
      tipe: 'BANK',
      balance: 9500000,
      color: 'purple',
      keterangan: 'Rekening cadangan / simpanan',
      is_active: true,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
    },
    {
      id: 'acc_sudirman_cash',
      pos: 'SALDO CASH',
      label: 'Kas Kasir Sudirman',
      tipe: 'CASH',
      balance: 1950000,
      color: 'emerald',
      is_active: true,
      tenant_id: OUTLET_SUDIRMAN_ID,
      branch_id: BRANCH_SUDIRMAN_ID,
    },
    {
      id: 'acc_sudirman_bank',
      pos: 'SALDO REKENING Y',
      label: 'Bank BCA Sudirman',
      tipe: 'BANK',
      balance: 11200000,
      color: 'blue',
      is_active: true,
      tenant_id: OUTLET_SUDIRMAN_ID,
      branch_id: BRANCH_SUDIRMAN_ID,
    },
    {
      id: 'acc_kemang_cash',
      pos: 'SALDO CASH',
      label: 'Kas Kasir Kemang',
      tipe: 'CASH',
      balance: 1500000,
      color: 'emerald',
      is_active: true,
      tenant_id: OUTLET_KEMANG_ID,
      branch_id: BRANCH_KEMANG_ID,
    },
    {
      id: 'acc_kemang_bank',
      pos: 'SALDO REKENING Y',
      label: 'Bank Mandiri Kemang',
      tipe: 'BANK',
      balance: 5000000,
      color: 'blue',
      is_active: true,
      tenant_id: OUTLET_KEMANG_ID,
      branch_id: BRANCH_KEMANG_ID,
    },
  ]

  // Provision master data for extra outlets (Kemang & Sudirman)
  const cwPackages = ensureArray(data, 'carwash_packages')
  if (!cwPackages.some((p) => p.tenant_id === OUTLET_KEMANG_ID)) {
    DEFAULT_CARWASH_PACKAGES.forEach((pkg, idx) => {
      cwPackages.push({
        ...pkg,
        id: `pkg_kemang_${idx + 1}`,
        sort_order: idx + 1,
        tenant_id: OUTLET_KEMANG_ID,
        branch_id: BRANCH_KEMANG_ID,
      })
    })
  }

  // 6. Rich Transactions: Struk, Carwash & Cafe (Today + This Month + Last Month + Churn)
  const strukRows = []
  const carwashRows = []
  const cafeRows = []

  const addOrder = ({
    id,
    tenantId = DEFAULT_TENANT_ID,
    branchId = DEFAULT_BRANCH_ID,
    tanggal,
    jam,
    metode = 'QRIS',
    statusBayar = 'Selesai',
    kasir = 'Kasir Utama',
    cw = null,
    cafeItems = [],
  }) => {
    const cwPrice = cw ? Number(cw.harga || 0) : 0
    const cafeTotal = cafeItems.reduce((sum, item) => sum + Number(item.harga_satuan) * Number(item.qty), 0)
    const grandTotal = cwPrice + cafeTotal

    strukRows.push({
      id_struk: id,
      tenant_id: tenantId,
      branch_id: branchId,
      tanggal,
      jam,
      kasir,
      metode_bayar: metode,
      status_bayar: statusBayar,
      total_tagihan: grandTotal,
      nominal_bayar: statusBayar === 'Pending' ? 0 : grandTotal,
      nominal_cash: statusBayar === 'Pending' ? 0 : metode === 'CASH' ? grandTotal : 0,
      nominal_qris: statusBayar === 'Pending' ? 0 : metode !== 'CASH' ? grandTotal : 0,
      diskon_carwash: 0,
      diskon_cafe: 0,
      created_at: `${tanggal}T${jam}.000Z`,
    })

    if (cw) {
      carwashRows.push({
        id: `cw-${id}`,
        id_transaksi: `CW-${id}`,
        id_struk: id,
        tenant_id: tenantId,
        branch_id: branchId,
        tanggal,
        jam,
        plat: cw.plat,
        model: cw.model,
        ukuran: cw.ukuran || 'Medium',
        variant: cw.variant || 'Regular',
        paket: cw.paket,
        kehadiran: cw.kehadiran || 'TUNGGU',
        no_telepon: cw.no_telepon || '081234567890',
        harga: cwPrice,
        anggota_1: cw.anggota_1 || 'Angga',
        anggota_2: cw.anggota_2 || 'Ferry',
        komisi_1: cw.komisi_1 ?? Math.round(cwPrice * 0.15),
        komisi_2: cw.komisi_2 ?? Math.round(cwPrice * 0.15),
        status: cw.status || statusBayar,
        status_pengerjaan: cw.status_pengerjaan || 'Siap Diambil',
        kondisi_bodi: cw.kondisi_bodi || 'Mulus',
        barang_berharga: cw.barang_berharga || 'Tidak Ada',
        catatan_kendaraan: cw.catatan_kendaraan || '',
        created_at: `${tanggal}T${jam}.000Z`,
      })
    }

    cafeItems.forEach((item, idx) => {
      const subtotal = Number(item.harga_satuan) * Number(item.qty)
      cafeRows.push({
        id: `cf-${id}-${idx + 1}`,
        id_transaksi: `CF-${id}-${idx + 1}`,
        id_struk: id,
        tenant_id: tenantId,
        branch_id: branchId,
        nama_menu: item.nama_menu,
        kategori: item.kategori || 'Cafe',
        qty: item.qty,
        harga_satuan: item.harga_satuan,
        subtotal,
        status: statusBayar,
        created_at: `${tanggal}T${jam}.000Z`,
      })
    })
  }

  // --- TODAY (6 Orders: 4 Carwash Queue active/ready + 2 Cafe standalone) ---
  addOrder({
    id: 'str-today-01',
    tanggal: todayStr,
    jam: '09:15:00',
    metode: 'QRIS',
    statusBayar: 'Selesai',
    cw: {
      plat: 'B 1234 RLP',
      model: 'Toyota Fortuner',
      ukuran: 'Large',
      paket: 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)',
      harga: 220000,
      kehadiran: 'TUNGGU',
      no_telepon: '081299112233',
      anggota_1: 'Angga',
      anggota_2: 'Ferry',
      status: 'Selesai',
      status_pengerjaan: 'Siap Diambil',
      catatan_kendaraan: 'Pelanggan VIP menunggu di lounge cafe',
    },
    cafeItems: [
      { nama_menu: 'Kopi Susu Gula Aren Dingin', qty: 2, harga_satuan: 20000 },
      { nama_menu: 'Nasi Goreng Spesial', qty: 1, harga_satuan: 28000 },
    ],
  })

  addOrder({
    id: 'str-today-02',
    tanggal: todayStr,
    jam: '10:05:00',
    metode: 'CASH',
    statusBayar: 'Pending',
    cw: {
      plat: 'B 8899 KOP',
      model: 'Mitsubishi Pajero',
      ukuran: 'Large',
      paket: 'PAKET GLOW UP (CUCI + WAX BODY)',
      harga: 120000,
      kehadiran: 'TUNGGU',
      no_telepon: '081377889900',
      anggota_1: 'Rahman',
      anggota_2: 'Dimas',
      status: 'Pending',
      status_pengerjaan: 'Sedang Dicuci',
      catatan_kendaraan: 'Fokus pembersihan velg dan kolong',
    },
    cafeItems: [{ nama_menu: 'Sanger Dingin', qty: 2, harga_satuan: 15000 }],
  })

  addOrder({
    id: 'str-today-03',
    tanggal: todayStr,
    jam: '10:40:00',
    metode: 'QRIS',
    statusBayar: 'Pending',
    cw: {
      plat: 'D 4521 CAR',
      model: 'Honda Civic Turbo',
      ukuran: 'Medium',
      paket: 'PAKET DAUN TALAS (CUCI + WAX KACA)',
      harga: 105000,
      kehadiran: 'TINGGAL',
      no_telepon: '081566778899',
      anggota_1: 'Angga',
      anggota_2: '',
      komisi_2: 0,
      status: 'Pending',
      status_pengerjaan: 'Menunggu Antrean',
      barang_berharga: 'Dashcam terpasang',
    },
    cafeItems: [{ nama_menu: 'Americano Dingin', qty: 1, harga_satuan: 12000 }],
  })

  addOrder({
    id: 'str-today-04',
    tanggal: todayStr,
    jam: '11:10:00',
    metode: 'TRANSFER',
    statusBayar: 'Pending',
    cw: {
      plat: 'B 7710 WSH',
      model: 'Toyota Avanza',
      ukuran: 'Medium',
      paket: 'PAKET CUCI BIASA',
      harga: 55000,
      kehadiran: 'TUNGGU',
      no_telepon: '081744556677',
      anggota_1: 'Ferry',
      anggota_2: 'Rahman',
      status: 'Pending',
      status_pengerjaan: 'Menunggu Antrean',
    },
  })

  addOrder({
    id: 'str-today-05',
    tanggal: todayStr,
    jam: '12:20:00',
    metode: 'CASH',
    statusBayar: 'Selesai',
    cafeItems: [
      { nama_menu: 'Ayam Geprek', qty: 2, harga_satuan: 25000 },
      { nama_menu: 'Kentang Goreng', qty: 1, harga_satuan: 12000 },
      { nama_menu: 'Teh Manis/Tawar Dingin', qty: 2, harga_satuan: 8000 },
    ],
  })

  addOrder({
    id: 'str-today-06',
    tanggal: todayStr,
    jam: '14:15:00',
    metode: 'QRIS',
    statusBayar: 'Selesai',
    cafeItems: [
      { nama_menu: 'Kopi Late Dingin', qty: 3, harga_satuan: 18000 },
      { nama_menu: 'Sosis Goreng', qty: 2, harga_satuan: 12000 },
    ],
  })

  // --- EARLIER THIS MONTH (12 Orders for rich Trend, CRM Repeat/VIP & Synergy) ---
  const thisMonthHistory = [
    { id: 'str-m01', d: yesterdayStr, jam: '09:30:00', m: 'QRIS', plat: 'B 1234 RLP', model: 'Toyota Fortuner', hp: '081299112233', paket: 'PAKET SULTAN (FULL EXTERIOR)', harga: 350000, menu: [{ nama_menu: 'Kopi Susu Gula Aren Dingin', qty: 2, harga_satuan: 20000 }] },
    { id: 'str-m02', d: yesterdayStr, jam: '13:15:00', m: 'CASH', plat: 'B 8899 KOP', model: 'Mitsubishi Pajero', hp: '081377889900', paket: 'PAKET KACA BENING (CUCI + JAMUR KACA)', harga: 160000, menu: [{ nama_menu: 'Ayam Penyet', qty: 1, harga_satuan: 25000 }] },
    { id: 'str-m03', d: day2Str, jam: '10:20:00', m: 'QRIS', plat: 'B 3309 SUV', model: 'Hyundai Ioniq 5', hp: '081811223344', paket: 'PAKET JURAGAN (CUCI + JAMUR KACA + WAX KACA)', harga: 210000, menu: [{ nama_menu: 'Kopi Late Dingin', qty: 2, harga_satuan: 18000 }, { nama_menu: 'Kentang Goreng', qty: 1, harga_satuan: 12000 }] },
    { id: 'str-m04', d: day2Str, jam: '15:45:00', m: 'TRANSFER', plat: null, menu: [{ nama_menu: 'Nasi Goreng Spesial', qty: 2, harga_satuan: 28000 }, { nama_menu: 'Teh Manis/Tawar Dingin', qty: 2, harga_satuan: 8000 }] },
    { id: 'str-m05', d: day4Str, jam: '11:00:00', m: 'QRIS', plat: 'B 1234 RLP', model: 'Toyota Fortuner', hp: '081299112233', paket: 'PAKET GLOW UP (CUCI + WAX BODY)', harga: 120000, menu: [{ nama_menu: 'Sanger Dingin', qty: 2, harga_satuan: 15000 }] },
    { id: 'str-m06', d: day4Str, jam: '16:10:00', m: 'CASH', plat: 'D 4521 CAR', model: 'Honda Civic Turbo', hp: '081566778899', paket: 'PAKET CUCI BIASA', harga: 55000, menu: [] },
    { id: 'str-m07', d: day6Str, jam: '09:50:00', m: 'QRIS', plat: 'B 8899 KOP', model: 'Mitsubishi Pajero', hp: '081377889900', paket: 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)', harga: 220000, menu: [{ nama_menu: 'Kopi Susu Gula Aren Dingin', qty: 1, harga_satuan: 20000 }, { nama_menu: 'Segala Tempe', qty: 1, harga_satuan: 15000 }] },
    { id: 'str-m08', d: day9Str, jam: '10:30:00', m: 'CASH', plat: 'B 1234 RLP', model: 'Toyota Fortuner', hp: '081299112233', paket: 'PAKET CUCI BIASA', harga: 60000, menu: [{ nama_menu: 'Americano Panas', qty: 1, harga_satuan: 12000 }] },
    { id: 'str-m09', d: day9Str, jam: '14:00:00', m: 'QRIS', plat: 'B 7710 WSH', model: 'Toyota Avanza', hp: '081744556677', paket: 'PAKET GLOW UP (CUCI + WAX BODY)', harga: 110000, menu: [{ nama_menu: 'Nasi Goreng Kampung', qty: 1, harga_satuan: 22000 }] },
    { id: 'str-m10', d: day13Str, jam: '11:25:00', m: 'QRIS', plat: 'B 1234 RLP', model: 'Toyota Fortuner', hp: '081299112233', paket: 'PAKET DAUN TALAS (CUCI + WAX KACA)', harga: 110000, menu: [{ nama_menu: 'Kopi Susu Gula Aren Dingin', qty: 2, harga_satuan: 20000 }] },
    { id: 'str-m11', d: day18Str, jam: '13:40:00', m: 'TRANSFER', plat: 'B 3309 SUV', model: 'Hyundai Ioniq 5', hp: '081811223344', paket: 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)', harga: 220000, menu: [{ nama_menu: 'Kopi Late Panas', qty: 2, harga_satuan: 18000 }] },
    { id: 'str-m12', d: day22Str, jam: '15:10:00', m: 'CASH', plat: 'B 8899 KOP', model: 'Mitsubishi Pajero', hp: '081377889900', paket: 'PAKET CUCI BIASA', harga: 60000, menu: [{ nama_menu: 'Nugget Goreng', qty: 1, harga_satuan: 12000 }] },
  ]

  thisMonthHistory.forEach((h, idx) => {
    addOrder({
      id: h.id,
      tanggal: h.d,
      jam: h.jam,
      metode: h.m,
      statusBayar: 'Selesai',
      cw: h.plat
        ? {
            plat: h.plat,
            model: h.model,
            ukuran: 'Large',
            paket: h.paket,
            harga: h.harga,
            no_telepon: h.hp,
            anggota_1: idx % 2 === 0 ? 'Angga' : 'Rahman',
            anggota_2: idx % 2 === 0 ? 'Ferry' : 'Dimas',
            status: 'Selesai',
            status_pengerjaan: 'Siap Diambil',
          }
        : null,
      cafeItems: h.menu,
    })
  })

  // --- LAST MONTH & CHURN COHORT (for MoM comparison & CRM AT_RISK segment) ---
  const lastMonthHistory = [
    { id: 'str-lm01', d: prevM1, jam: '10:00:00', m: 'QRIS', plat: 'B 1234 RLP', model: 'Toyota Fortuner', hp: '081299112233', paket: 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)', harga: 220000, menu: [{ nama_menu: 'Kopi Susu Gula Aren Dingin', qty: 1, harga_satuan: 20000 }] },
    { id: 'str-lm02', d: prevM2, jam: '11:30:00', m: 'CASH', plat: 'D 4521 CAR', model: 'Honda Civic Turbo', hp: '081566778899', paket: 'PAKET GLOW UP (CUCI + WAX BODY)', harga: 110000, menu: [{ nama_menu: 'Sanger Dingin', qty: 1, harga_satuan: 15000 }] },
    { id: 'str-lm03', d: prevM3, jam: '14:20:00', m: 'QRIS', plat: 'B 9012 HBD', model: 'Honda Brio', hp: '081922334455', paket: 'PAKET CUCI BIASA', harga: 50000, menu: [] },
    { id: 'str-lm04', d: prevM4, jam: '16:00:00', m: 'TRANSFER', plat: null, menu: [{ nama_menu: 'Nasi Goreng Spesial', qty: 2, harga_satuan: 28000 }, { nama_menu: 'Kopi Late Dingin', qty: 2, harga_satuan: 18000 }] },
    { id: 'str-lm05', d: prevM5, jam: '12:45:00', m: 'QRIS', plat: 'B 8899 KOP', model: 'Mitsubishi Pajero', hp: '081377889900', paket: 'PAKET DAUN TALAS (CUCI + WAX KACA)', harga: 110000, menu: [{ nama_menu: 'Ayam Geprek', qty: 1, harga_satuan: 25000 }] },
    { id: 'str-lm06', d: churnDateStr, jam: '10:15:00', m: 'CASH', plat: 'B 5566 OLD', model: 'Toyota Innova', hp: '081188997766', paket: 'PAKET JURAGAN (CUCI + JAMUR KACA + WAX KACA)', harga: 205000, menu: [{ nama_menu: 'Kopi Susu Gula Aren Panas', qty: 1, harga_satuan: 20000 }] },
  ]

  lastMonthHistory.forEach((h) => {
    addOrder({
      id: h.id,
      tanggal: h.d,
      jam: h.jam,
      metode: h.m,
      statusBayar: 'Selesai',
      cw: h.plat
        ? {
            plat: h.plat,
            model: h.model,
            ukuran: 'Medium',
            paket: h.paket,
            harga: h.harga,
            no_telepon: h.hp,
            anggota_1: 'Angga',
            anggota_2: 'Ferry',
            status: 'Selesai',
            status_pengerjaan: 'Siap Diambil',
          }
        : null,
      cafeItems: h.menu,
    })
  })

  // --- OUTLET 2: RelayPOS Cafe Sudirman (8 Orders this month for Konsolidasi comparison) ---
  ;[
    { id: 'str-sdm-01', d: todayStr, jam: '08:45:00', m: 'QRIS', menu: [{ nama_menu: 'Kopi Susu Gula Aren Dingin', qty: 4, harga_satuan: 22000 }, { nama_menu: 'Roti Bakar Cokelat', qty: 2, harga_satuan: 18000 }] },
    { id: 'str-sdm-02', d: todayStr, jam: '12:15:00', m: 'CASH', menu: [{ nama_menu: 'Nasi Goreng Spesial', qty: 3, harga_satuan: 30000 }, { nama_menu: 'Americano Dingin', qty: 3, harga_satuan: 16000 }] },
    { id: 'str-sdm-03', d: yesterdayStr, jam: '09:30:00', m: 'QRIS', menu: [{ nama_menu: 'Kopi Late Dingin', qty: 5, harga_satuan: 20000 }] },
    { id: 'str-sdm-04', d: day2Str, jam: '13:10:00', m: 'TRANSFER', menu: [{ nama_menu: 'Ayam Geprek', qty: 4, harga_satuan: 26000 }, { nama_menu: 'Teh Manis/Tawar Dingin', qty: 4, harga_satuan: 10000 }] },
    { id: 'str-sdm-05', d: day6Str, jam: '15:00:00', m: 'QRIS', menu: [{ nama_menu: 'Kopi Susu Gula Aren Dingin', qty: 6, harga_satuan: 22000 }] },
  ].forEach((s) => {
    addOrder({
      id: s.id,
      tenantId: OUTLET_SUDIRMAN_ID,
      branchId: BRANCH_SUDIRMAN_ID,
      tanggal: s.d,
      jam: s.jam,
      metode: s.m,
      statusBayar: 'Selesai',
      kasir: 'Kasir Sudirman',
      cafeItems: s.menu,
    })
  })

  data.struk = strukRows
  data.carwash = carwashRows
  data.cafe = cafeRows

  // 7. Realistic Expenses & Cashflow Logs (aligned with Bank Mutation duplicate candidate!)
  data.pengeluaran = [
    {
      id: 'exp-01',
      id_pengeluaran: 'EXP-01',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: day2Str,
      jam: '09:00:00',
      nama_pengeluaran: 'Belanja Biji Kopi & Susu UHT',
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku F&B',
      nominal: 420000,
      pos: 'SALDO REKENING N',
      created_at: `${day2Str}T09:00:00.000Z`,
    },
    {
      id: 'exp-02',
      id_pengeluaran: 'EXP-02',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: day4Str,
      jam: '11:20:00',
      nama_pengeluaran: 'Restock Chemical Shampoo & Wax',
      jenis: 'Pengeluaran Carwash',
      kategori: 'Bahan Cuci & Chemical',
      nominal: 340000,
      pos: 'SALDO REKENING N',
      created_at: `${day4Str}T11:20:00.000Z`,
    },
    {
      id: 'exp-03',
      id_pengeluaran: 'EXP-03',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: day9Str,
      jam: '14:00:00',
      nama_pengeluaran: 'Tagihan Listrik & Air PDAM Bulanan',
      jenis: 'Pengeluaran Bersama',
      kategori: 'Listrik Carwash',
      nominal: 485000,
      pos: 'SALDO REKENING Y',
      created_at: `${day9Str}T14:00:00.000Z`,
    },
    {
      id: 'exp-04',
      id_pengeluaran: 'EXP-04',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: todayStr,
      jam: '08:30:00',
      nama_pengeluaran: 'Pembelian Es Batu & Susu Tambahan',
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku F&B',
      nominal: 125000,
      pos: 'SALDO REKENING Y',
      created_at: `${todayStr}T08:30:00.000Z`,
    },
    {
      id: 'exp-lm-01',
      id_pengeluaran: 'EXP-LM-01',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: prevM2,
      jam: '10:00:00',
      nama_pengeluaran: 'Belanja Bahan Baku Kopi Bulan Lalu',
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku F&B',
      nominal: 380000,
      pos: 'SALDO REKENING N',
      created_at: `${prevM2}T10:00:00.000Z`,
    },
    {
      id: 'exp-sdm-01',
      id_pengeluaran: 'EXP-SDM-01',
      tenant_id: OUTLET_SUDIRMAN_ID,
      branch_id: BRANCH_SUDIRMAN_ID,
      tanggal: day4Str,
      jam: '10:00:00',
      nama_pengeluaran: 'Stok Biji Kopi & Packaging Cup',
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku F&B',
      nominal: 210000,
      pos: 'SALDO REKENING Y',
      created_at: `${day4Str}T10:00:00.000Z`,
    },
  ]

  data.cashflow = [
    {
      id: 'cf-inc-01',
      id_cashflow: 'CF-INC-01',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      pocket_id: 'acc_saldo_rekening_y',
      pos: 'SALDO REKENING Y',
      tanggal: yesterdayStr,
      jenis: 'Penjualan POS',
      kategori: 'Rekap Tutup Kasir QRIS',
      keterangan_transaksi: 'Settlement QRIS & Transfer Harian',
      pemasukan: 1450000,
      pengeluaran: 0,
      created_at: `${yesterdayStr}T21:00:00.000Z`,
    },
    {
      id: 'cf-inc-02',
      id_cashflow: 'CF-INC-02',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      pocket_id: 'acc_saldo_cash',
      pos: 'SALDO CASH',
      tanggal: day4Str,
      jenis: 'Penjualan POS',
      kategori: 'Rekap Tutup Kasir Tunai',
      keterangan_transaksi: 'Setoran Laci Kasir Tunai',
      pemasukan: 890000,
      pengeluaran: 0,
      created_at: `${day4Str}T21:00:00.000Z`,
    },
    {
      id: 'cf-exp-01',
      id_cashflow: 'CF-EXP-01',
      id_sumber: 'EXP-01',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      pocket_id: 'acc_saldo_rekening_n',
      pos: 'SALDO REKENING N',
      tanggal: day2Str,
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku F&B',
      keterangan_transaksi: 'Belanja Biji Kopi & Susu UHT',
      pemasukan: 0,
      pengeluaran: 420000,
      created_at: `${day2Str}T09:00:00.000Z`,
    },
    {
      id: 'cf-exp-02',
      id_cashflow: 'CF-EXP-02',
      id_sumber: 'EXP-02',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      pocket_id: 'acc_saldo_rekening_n',
      pos: 'SALDO REKENING N',
      tanggal: day4Str,
      jenis: 'Pengeluaran Carwash',
      kategori: 'Bahan Cuci & Chemical',
      keterangan_transaksi: 'Restock Chemical Shampoo & Wax',
      pemasukan: 0,
      pengeluaran: 340000,
      created_at: `${day4Str}T11:20:00.000Z`,
    },
    {
      id: 'cf-exp-03',
      id_cashflow: 'CF-EXP-03',
      id_sumber: 'EXP-03',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      pocket_id: 'acc_saldo_rekening_y',
      pos: 'SALDO REKENING Y',
      tanggal: day9Str,
      jenis: 'Pengeluaran Bersama',
      kategori: 'Listrik Carwash',
      keterangan_transaksi: 'Tagihan Listrik & Air PDAM Bulanan',
      pemasukan: 0,
      pengeluaran: 485000,
      created_at: `${day9Str}T14:00:00.000Z`,
    },
    {
      id: 'cf-exp-04',
      id_cashflow: 'CF-EXP-04',
      id_sumber: 'EXP-04',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      pocket_id: 'acc_saldo_rekening_y',
      pos: 'SALDO REKENING Y',
      tanggal: todayStr,
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku F&B',
      keterangan_transaksi: 'Pembelian Es Batu & Susu Tambahan (Grosir Kopi)',
      pemasukan: 0,
      pengeluaran: 125000,
      created_at: `${todayStr}T08:30:00.000Z`,
    },
  ]

  // 8. Sample Mandiri Bank Mutation Email Inbox Drafts (so tab Mutasi Bank langsung terisi)
  const connId = '81000000-0000-4000-8000-000000000001'
  const bindId = '82000000-0000-4000-8000-000000000001'
  data.bank_email_connections = [
    {
      id: connId,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      provider_type: 'GMAIL_OAUTH',
      provider_account_id: 'google-sub-mandiriinboxrelayposgmailcom',
      connected_email: 'mandiri.inbox.relaypos@gmail.com',
      normalized_email: 'mandiriinboxrelaypos@gmail.com',
      status: 'ACTIVE',
      created_at: now.toISOString(),
    },
  ]
  data.bank_account_bindings = [
    {
      id: bindId,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      connection_id: connId,
      pocket_id: 'acc_saldo_rekening_y',
      bank_code: 'MANDIRI',
      account_last4: '1122',
      account_holder_name: 'Rekening Operasional Y',
      is_default_for_last4: true,
      import_start_date: '2020-01-01',
      is_active: true,
      created_at: now.toISOString(),
    },
  ]
  data.bank_email_messages = [
    {
      id: '83000000-0000-4000-8000-000000000001',
      tenant_id: DEFAULT_TENANT_ID,
      connection_id: connId,
      provider_message_id: 'demo-livin-msg-001',
      sender_email: 'noreply.livin@bankmandiri.co.id',
      sender_verified: true,
      subject: "Bukti Transaksi Transfer BI-FAST - Livin' by Mandiri",
      received_at: now.toISOString(),
      parse_status: 'PARSED',
      parser_version: 'mandiri_transfer_v1',
      created_at: now.toISOString(),
    },
    {
      id: '83000000-0000-4000-8000-000000000002',
      tenant_id: DEFAULT_TENANT_ID,
      connection_id: connId,
      provider_message_id: 'demo-livin-msg-002',
      sender_email: 'noreply.livin@bankmandiri.co.id',
      sender_verified: true,
      subject: "Pembayaran QRIS Berhasil - Livin' by Mandiri",
      received_at: now.toISOString(),
      parse_status: 'PARSED',
      parser_version: 'mandiri_qris_payment_v1',
      created_at: now.toISOString(),
    },
  ]
  data.bank_transaction_drafts = [
    {
      id: '84000000-0000-4000-8000-000000000001',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      connection_id: connId,
      source_message_id: '83000000-0000-4000-8000-000000000001',
      binding_id: bindId,
      pocket_id: 'acc_saldo_rekening_y',
      bank_code: 'MANDIRI',
      direction: 'OUT',
      tx_type: 'TRANSFER',
      currency: 'IDR',
      principal_amount: 350000,
      fee_amount: 2500,
      total_debit: 352500,
      occurred_at: `${todayStr}T10:15:30.000Z`,
      book_date: todayStr,
      bank_reference: 'MND-TF-20261127-01',
      counterparty_name: 'PT SUPPLIER SHAMPOO CARWASH',
      beneficiary_bank: 'BCA',
      account_last4: '1122',
      parser_version: 'mandiri_transfer_v1',
      suggested_jenis: 'Pengeluaran Carwash',
      suggested_kategori: 'Bahan Cuci & Chemical',
      review_status: 'READY',
      review_reason: null,
      duplicate_candidate_cashflow_id: null,
      version: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: '84000000-0000-4000-8000-000000000002',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      connection_id: connId,
      source_message_id: '83000000-0000-4000-8000-000000000002',
      binding_id: bindId,
      pocket_id: 'acc_saldo_rekening_y',
      bank_code: 'MANDIRI',
      direction: 'OUT',
      tx_type: 'QRIS',
      currency: 'IDR',
      principal_amount: 125000,
      fee_amount: 0,
      total_debit: 125000,
      occurred_at: `${todayStr}T08:32:00.000Z`,
      book_date: todayStr,
      bank_reference: 'MND-QRIS-20261127-02',
      counterparty_name: 'GROSIR KOPI & SUSU NUSANTARA',
      beneficiary_bank: null,
      account_last4: '1122',
      parser_version: 'mandiri_qris_payment_v1',
      suggested_jenis: 'Pengeluaran Cafe',
      suggested_kategori: 'Bahan Baku F&B',
      review_status: 'NEEDS_REVIEW',
      review_reason: 'POSSIBLE_DUPLICATE',
      duplicate_candidate_cashflow_id: 'cf-exp-04',
      version: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  ]

  return data
}

export default applyDevMockSeedData
