import { describe, it, expect, beforeEach } from 'vitest'
import {
  createLocalClient,
  POSTGRES_SCHEMA_COLUMNS,
  isValidPostgresUuid,
  generateLocalUuid,
  DEFAULT_TENANT_ID,
  DEFAULT_BRANCH_ID,
} from '../localDbEngine.js'
import { formatPosExpensePayload } from '../../utils/financeHelpers.js'
import { calculateMenuHpp, calculateMarginSimulation } from '../../utils/hppCalculator.js'

const assertPayloadFitsSchema = (payload, tableName) => {
  const allowed = POSTGRES_SCHEMA_COLUMNS[tableName]
  expect(allowed).toBeDefined()
  Object.keys(payload).forEach((col) => {
    expect(allowed.has(col), `Column '${col}' is not allowed on table '${tableName}'`).toBe(true)
  })
}

describe('Pilar 2: Consumer-Provider Schema Contract Validation', () => {
  let db

  beforeEach(() => {
    db = createLocalClient({ strictPostgresParity: true })
    db.erp.resetDatabase()
    db.erp.setStrictPostgresParity(true)
  })

  it('TC_CDC_01: Lossless round-trip contract between carwash_packages DB row and Admin UI state', () => {
    const dbRow = {
      id: generateLocalUuid(),
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      name: 'PAKET CUCI WAX',
      nama_paket: 'PAKET CUCI WAX',
      description: 'Cuci bersih + wax body',
      keterangan: 'Cuci bersih + wax body',
      price: 75000,
      tarif: 75000,
      tarif_matrix: {
        Small: { Regular: 75000, 'Body only': 60000 },
        Medium: { Regular: 85000, 'Body only': 70000 },
        Large: { Regular: 95000, 'Body only': 80000 },
        'Extra Large': { Regular: 120000, 'Body only': 120000 },
      },
      komisi_skema: 'TIERED',
      komisi_value: 0,
      is_active: true,
    }

    // DB Row -> UI State (mirrors Admin.jsx loadAdminData normalization)
    const uiState = {
      ...dbRow,
      nama_paket: dbRow.nama_paket || dbRow.name,
      name: dbRow.name || dbRow.nama_paket,
      keterangan: dbRow.keterangan || dbRow.description,
      tarif: dbRow.tarif_matrix || dbRow.tarif,
    }

    expect(typeof uiState.tarif).toBe('object')
    expect(uiState.tarif.Large['Body only']).toBe(80000)

    // UI State -> DB Save Payload (mirrors Admin.jsx handleSaveCarwashPackage)
    const basePrice = typeof uiState.tarif === 'number'
      ? uiState.tarif
      : (uiState.tarif?.Small?.Regular || 50000)

    const savePayload = {
      id: uiState.id,
      nama_paket: uiState.nama_paket,
      name: uiState.nama_paket,
      description: uiState.keterangan || '',
      keterangan: uiState.keterangan || '',
      komisi_skema: uiState.komisi_skema || 'TIERED',
      komisi_value: parseFloat(uiState.komisi_value) || 0,
      price: basePrice,
      tarif: basePrice,
      tarif_matrix: typeof uiState.tarif === 'object' ? uiState.tarif : null,
      is_active: uiState.is_active !== false,
    }

    assertPayloadFitsSchema(savePayload, 'carwash_packages')
    expect(savePayload.price).toBe(75000)
    expect(savePayload.tarif).toBe(75000)
    expect(savePayload.tarif_matrix).toEqual(dbRow.tarif_matrix)
    expect(savePayload.description).toBe(dbRow.description)
  })

  it('TC_CDC_02: Contract between sanitized POS expense payload and PostgreSQL pengeluaran & barang_masuk tables', async () => {
    const stockUuid = generateLocalUuid()
    await db.from('stok_barang').insert({
      id: stockUuid,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      id_barang: 'BB-KOPI-01',
      id_bahan_baku: 'BB-KOPI-01',
      nama_produk: 'Biji Kopi Espresso',
      nama_barang: 'Biji Kopi Espresso',
      satuan: 'kg',
      stok: 5,
      stok_akhir: 5,
      harga_beli: 140000,
      harga_satuan: 140000,
      gudang: 'CAFE',
      kategori: 'Bahan Baku',
    })

    const expUuid = generateLocalUuid()
    const rawPayload = formatPosExpensePayload({
      form: {
        tanggal: '2026-11-17',
        keterangan: 'Beli Biji Kopi Espresso',
        nominal: '280000',
        unit: 'Cafe',
        kategori: 'Bahan Baku',
        id_barang: stockUuid,
        id_bahan_baku: stockUuid,
        qty: '2',
      },
      todayDate: '2026-11-17',
      currentTime: '10:30:00',
      newExpId: expUuid,
    })

    // Expect formatter temporarily carries id_barang for legacy local workflows,
    // which MUST be stripped before hitting Postgres pengeluaran schema
    expect(rawPayload.id_barang).toBe(stockUuid)

    const { id_barang: _stripped, ...cleanPayload } = rawPayload
    const cloudPayload = {
      ...cleanPayload,
      id: expUuid,
      id_pengeluaran: expUuid,
      id_bahan_baku: isValidPostgresUuid(cleanPayload.id_bahan_baku) ? cleanPayload.id_bahan_baku : null,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
    }

    assertPayloadFitsSchema(cloudPayload, 'pengeluaran')
    expect(cloudPayload).not.toHaveProperty('id_barang')

    const { error: insertErr } = await db.from('pengeluaran').insert(cloudPayload)
    expect(insertErr).toBeNull()

    const bmRows = db.localDb.store.getTable('barang_masuk').filter((b) => b.tenant_id === DEFAULT_TENANT_ID)
    expect(bmRows).toHaveLength(1)
    expect(bmRows[0].id_barang).toBe(stockUuid)
    expect(bmRows[0].jumlah_masuk).toBe(2)
    expect(bmRows[0].harga_satuan).toBe(140000)
    expect(bmRows[0].total_harga).toBe(280000)
  })

  it('TC_CDC_03: OnboardingWizardModal payload contract against fn_complete_store_setup RPC', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'cdc03.owner@relaypos.id',
      password: 'password123',
      nama: 'Dedi',
      tenantName: 'Dedi Station',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id

    const scenarios = [
      {
        business_type: 'HYBRID',
        carwash_packages: [{ nama_paket: 'Cuci Kilat', tarif: 45000 }],
        cafe_menus: [{ nama_menu: 'Americano', kategori: 'Kopi', harga: 15000 }],
        stock_items: [{ nama_barang: 'Kopi Robusta', satuan: 'kg', stok: 3, harga_satuan: 120000, min_stok: 1, gudang: 'CAFE' }],
      },
      {
        business_type: 'CAFE',
        carwash_packages: [],
        cafe_menus: [{ nama_menu: 'Matcha Iced', kategori: 'Non-Coffee', harga: 24000 }],
        stock_items: [{ nama_barang: 'Susu Fresh', satuan: 'liter', stok: 10, harga_satuan: 21000, min_stok: 2, gudang: 'CAFE' }],
      },
      {
        business_type: 'CARWASH',
        carwash_packages: [{ nama_paket: 'Detailing Kaca', tarif: 150000 }],
        cafe_menus: [],
        stock_items: [{ nama_barang: 'Shampoo Touchless', satuan: 'liter', stok: 20, harga_satuan: 40000, min_stok: 5, gudang: 'CARWASH' }],
      },
    ]

    for (const sc of scenarios) {
      const p_payload = {
        owner_name: 'Dedi Kurnia',
        store_name: 'Dedi Station',
        telepon: '08123456789',
        alamat: 'Jl. Gatot Subroto No. 1',
        clear_starter_samples: true,
        ...sc,
      }
      expect(typeof p_payload.clear_starter_samples).toBe('boolean')
      expect(Array.isArray(p_payload.carwash_packages)).toBe(true)
      expect(Array.isArray(p_payload.cafe_menus)).toBe(true)
      expect(Array.isArray(p_payload.stock_items)).toBe(true)

      const { data, error } = await db.rpc('fn_complete_store_setup', {
        p_tenant_id: tenantId,
        p_payload,
      })
      expect(error).toBeNull()
      expect(data.success).toBe(true)
      expect(data.onboarding_completed).toBe(true)
    }

    const pkgs = db.localDb.store.getTable('carwash_packages').filter((p) => p.tenant_id === tenantId)
    const stocks = db.localDb.store.getTable('stok_barang').filter((s) => s.tenant_id === tenantId)
    pkgs.forEach((p) => assertPayloadFitsSchema(p, 'carwash_packages'))
    stocks.forEach((s) => assertPayloadFitsSchema(s, 'stok_barang'))
  })

  it('TC_CDC_04: MenuHppCalculator contract across harga_satuan vs harga_beli and cross-unit conversions', () => {
    const stockItems = [
      { id_bahan_baku: 'BB-01', nama_produk: 'Biji Kopi', satuan: 'kg', harga_satuan: 200000 }, // using harga_satuan -> 200 / gram
      { id_bahan_baku: 'BB-02', nama_produk: 'Susu UHT', satuan: 'liter', harga_beli: 24000 }, // using harga_beli fallback -> 24 / ml
      { id_bahan_baku: 'BB-03', nama_produk: 'Bubuk Cokelat', satuan: 'ons', harga_beli: 15000 }, // ons -> 150 / gram
    ]

    const recipeList = [
      { id_bahan_baku: 'BB-01', nama_bahan: 'Biji Kopi', jumlah_dibutuhkan: 20, satuan: 'gram' }, // 4,000
      { id_bahan_baku: 'BB-02', nama_bahan: 'Susu UHT', jumlah_dibutuhkan: 150, satuan: 'ml' }, // 3,600
      { id_bahan_baku: 'BB-03', nama_bahan: 'Bubuk Cokelat', jumlah_dibutuhkan: 10, satuan: 'gram' }, // 1,500
    ]

    const hppResult = calculateMenuHpp({
      recipeList,
      stockItems,
      packagingCost: 1500,
      overheadCost: 400,
    })

    expect(hppResult.hasMissingPrices).toBe(false)
    expect(hppResult.foodCost).toBe(9100)
    expect(hppResult.totalHpp).toBe(11000)

    const sim = calculateMarginSimulation({
      sellingPrice: 25000,
      totalHpp: hppResult.totalHpp,
      targetMargin: 60,
    })

    // Recommended price for 60% margin: 11000 / 0.4 = 27500 (already multiple of 500)
    expect(Number.isNaN(sim.marginPercent)).toBe(false)
    expect(sim.grossProfit).toBe(14000)
    expect(sim.marginPercent).toBe(56)
    expect(sim.foodCostPercent).toBe(44)
    expect(sim.recommendedPrice).toBe(27500)
    expect(sim.marginStatus).toBe('MODERATE')
  })
})
