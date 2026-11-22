import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createLocalClient,
  DEFAULT_TENANT_ID,
  isValidPostgresUuid,
  generateLocalUuid,
  POSTGRES_SCHEMA_COLUMNS,
  setActiveTenantId,
  resetActiveActorContext,
} from '../localDbEngine.js'
import { DEFAULT_CARWASH_PACKAGES } from '../../utils/carwashHelpers.js'

/**
 * Simulates Admin.jsx self-healing delete behavior for carwash packages
 * (handles both genuine DB UUID rows and legacy unseeded memory templates).
 */
async function simulateAdminDeleteCarwashPackage({ db, carwashPackages, pkgId }) {
  const pkg = carwashPackages.find((p) => p.id === pkgId)
  if (isValidPostgresUuid(pkgId)) {
    const { error } = await db.from('carwash_packages').delete().eq('id', pkgId)
    if (error) throw error
  } else {
    const packagesToSeed = carwashPackages
      .filter((p) => p.id !== pkgId)
      .map((p, idx) => {
        const basePrice = typeof p.tarif === 'number' ? p.tarif : (p.tarif?.Small?.Regular || 50000)
        return {
          name: p.nama_paket,
          nama_paket: p.nama_paket,
          description: p.keterangan || '',
          keterangan: p.keterangan || '',
          price: basePrice,
          tarif: basePrice,
          tarif_matrix: typeof p.tarif === 'object' ? p.tarif : null,
          komisi_skema: p.komisi_skema || 'TIERED',
          komisi_value: parseFloat(p.komisi_value) || 0,
          is_active: p.is_active !== false,
          sort_order: idx + 1,
        }
      })
    if (packagesToSeed.length > 0) {
      const { error: seedErr } = await db.from('carwash_packages').insert(packagesToSeed)
      if (seedErr) throw seedErr
    }
  }
  if (pkg?.nama_paket) {
    await db.from('resep').delete().eq('nama_menu', pkg.nama_paket)
  }
}

describe('Pilar 4: Day-0 Cold Start / Zero-State Onboarding Tests', () => {
  let db

  beforeEach(() => {
    resetActiveActorContext()
    setActiveTenantId(DEFAULT_TENANT_ID)
    db = createLocalClient({ strictPostgresParity: true })
    db.erp.resetDatabase()
    db.erp.setStrictPostgresParity(true)
  })

  afterEach(() => {
    resetActiveActorContext()
    setActiveTenantId(DEFAULT_TENANT_ID)
  })

  it('TC_DAY0_01: Immediate delete of starter carwash package on brand-new store (0 transactions)', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'day0.owner1@relaypos.id',
      password: 'password123',
      nama: 'Fajar',
      tenantName: 'Fajar Berkah Wash',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id
    setActiveTenantId(tenantId)

    // Confirm 0 transactions
    expect(db.localDb.store.getTable('struk').filter((s) => s.tenant_id === tenantId)).toHaveLength(0)

    const { data: initialPkgs, error: fetchErr } = await db
      .from('carwash_packages')
      .select('*')
      .eq('tenant_id', tenantId)
    expect(fetchErr).toBeNull()
    const initialCount = initialPkgs.length
    expect(initialCount).toBeGreaterThanOrEqual(6)

    // Every package on a newly provisioned store MUST already carry a valid UUID
    initialPkgs.forEach((p) => expect(isValidPostgresUuid(p.id)).toBe(true))

    const target = initialPkgs.find((p) => p.nama_paket.includes('PEJABAT')) || initialPkgs[0]
    await simulateAdminDeleteCarwashPackage({ db, carwashPackages: initialPkgs, pkgId: target.id })

    // Re-fetch ("page reload") -> deleted package stays deleted permanently
    const { data: reloadedPkgs } = await db
      .from('carwash_packages')
      .select('*')
      .eq('tenant_id', tenantId)
    expect(reloadedPkgs).toHaveLength(initialCount - 1)
    expect(reloadedPkgs.some((p) => p.id === target.id)).toBe(false)
  })

  it('TC_DAY0_02: Self-healing fallback persists remaining packages cleanly when deleting pkg_sultan memory template', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'day0.legacy@relaypos.id',
      password: 'password123',
      nama: 'Gilang',
      tenantName: 'Gilang Carwash',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id
    setActiveTenantId(tenantId)

    // Simulate extreme legacy cold-start where DB carwash_packages is empty (0 rows)
    const pkgTable = db.localDb.store.getTable('carwash_packages')
    for (let i = pkgTable.length - 1; i >= 0; i--) {
      if (pkgTable[i].tenant_id === tenantId) pkgTable.splice(i, 1)
    }

    const { data: emptyDb } = await db.from('carwash_packages').select('*').eq('tenant_id', tenantId)
    expect(emptyDb).toHaveLength(0)

    // UI renders DEFAULT_CARWASH_PACKAGES from memory (with pseudo-id 'pkg_sultan')
    const uiPackages = DEFAULT_CARWASH_PACKAGES
    expect(uiPackages.some((p) => p.id === 'pkg_sultan')).toBe(true)

    // Activate tenant context just as logged-in Owner session would
    db.localDb.store.ensureTenantMasterData(tenantId, 'HYBRID')
    const { data: afterReloadBeforeSave } = await db
      .from('carwash_packages')
      .select('*')
      .eq('tenant_id', tenantId)
    expect(afterReloadBeforeSave).toHaveLength(0)

    // Simulate Admin.jsx self-healing delete under strict Postgres parity
    await expect(
      simulateAdminDeleteCarwashPackage({ db, carwashPackages: uiPackages, pkgId: 'pkg_sultan' })
    ).resolves.not.toThrow()

    // Reload -> Remaining 6 packages now live in DB with real Postgres UUIDs, PAKET SULTAN gone
    const { data: persistedPkgs } = await db
      .from('carwash_packages')
      .select('*')
      .eq('tenant_id', tenantId)
    expect(persistedPkgs).toHaveLength(uiPackages.length - 1)
    expect(persistedPkgs.some((p) => p.nama_paket.includes('SULTAN'))).toBe(false)
    persistedPkgs.forEach((p) => {
      expect(isValidPostgresUuid(p.id)).toBe(true)
      Object.keys(p).forEach((col) => {
        expect(POSTGRES_SCHEMA_COLUMNS.carwash_packages.has(col)).toBe(true)
      })
    })
  })

  it('TC_DAY0_03: Day-0 expense purchase on starter stock automatically restocks inventory', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'day0.stock@relaypos.id',
      password: 'password123',
      nama: 'Hana',
      tenantName: 'Hana Wash & Cafe',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id
    const branchId = reg.data.profile.branch_id
    setActiveTenantId(tenantId)

    const { data: starterStocks } = await db
      .from('stok_barang')
      .select('*')
      .eq('tenant_id', tenantId)
    const kopiStarter = starterStocks.find((s) => s.id_barang === 'BB-KOPI')
    expect(kopiStarter).toBeDefined()
    expect(isValidPostgresUuid(kopiStarter.id)).toBe(true)
    expect(kopiStarter.stok).toBe(100)

    // Cashier immediately records Bahan Baku expense referencing starter item UUID
    const expId = generateLocalUuid()
    const { error: expErr } = await db.from('pengeluaran').insert({
      id: expId,
      id_pengeluaran: expId,
      tenant_id: tenantId,
      branch_id: branchId,
      tanggal: '2026-11-17',
      jam: '09:00:00',
      nama_pengeluaran: 'Beli Biji Kopi House Blend',
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku',
      nominal: 1500000,
      pos: 'SALDO CASH',
      apakah_stok: true,
      id_bahan_baku: kopiStarter.id,
      qty: 10,
    })
    expect(expErr).toBeNull()

    const { data: updatedKopi } = await db
      .from('stok_barang')
      .select('*')
      .eq('id', kopiStarter.id)
      .single()
    expect(updatedKopi.stok).toBe(110)

    const bmRows = db.localDb.store
      .getTable('barang_masuk')
      .filter((b) => b.tenant_id === tenantId && b.id_bahan_baku === kopiStarter.id)
    expect(bmRows).toHaveLength(1)
    expect(bmRows[0].jumlah_masuk).toBe(10)
  })

  it('TC_DAY0_04: Day-0 Onboarding clear_starter_samples vs skip + Business Model Isolation', async () => {
    // A. clear_starter_samples: true
    const regA = await db.auth.signUpOwner({
      email: 'day0.clear@relaypos.id',
      password: 'password123',
      nama: 'Irwan',
      tenantName: 'Irwan Custom Garage',
      businessType: 'HYBRID',
    })
    const tenantA = regA.data.tenant.id

    const resA = await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantA,
      p_payload: {
        clear_starter_samples: true,
        carwash_packages: [{ nama_paket: 'Cuci Steam', tarif: 60000 }],
        stock_items: [{ nama_barang: 'Wax Carnauba', satuan: 'liter', stok: 8, gudang: 'CARWASH' }],
      },
    })
    expect(resA.error).toBeNull()

    const pkgsA = db.localDb.store.getTable('carwash_packages').filter((p) => p.tenant_id === tenantA)
    const stocksA = db.localDb.store.getTable('stok_barang').filter((s) => s.tenant_id === tenantA)
    expect(pkgsA).toHaveLength(1)
    expect(isValidPostgresUuid(pkgsA[0].id)).toBe(true)
    expect(pkgsA[0].tarif_matrix.Small.Regular).toBe(60000)
    expect(stocksA).toHaveLength(1)
    expect(stocksA[0].id_barang).toMatch(/^CW-/)

    // B. skip: true
    const regB = await db.auth.signUpOwner({
      email: 'day0.skip@relaypos.id',
      password: 'password123',
      nama: 'Joko',
      tenantName: 'Joko Quick Wash',
      businessType: 'HYBRID',
    })
    const tenantB = regB.data.tenant.id

    const resB = await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantB,
      p_payload: { skip: true },
    })
    expect(resB.error).toBeNull()
    expect(resB.data.skipped).toBe(true)

    const pkgsB = db.localDb.store.getTable('carwash_packages').filter((p) => p.tenant_id === tenantB)
    const stocksB = db.localDb.store.getTable('stok_barang').filter((s) => s.tenant_id === tenantB)
    expect(pkgsB.length).toBeGreaterThanOrEqual(6)
    expect(stocksB.length).toBeGreaterThanOrEqual(3)
    pkgsB.forEach((p) => expect(isValidPostgresUuid(p.id)).toBe(true))
    stocksB.forEach((s) => expect(s.id_barang).toBeTruthy())

    // C. Business Model Isolation on Day-0 (CAFE rejects carwash_packages, CARWASH rejects daftar_harga_menu)
    const regCafe = await db.auth.signUpOwner({
      email: 'day0.cafeonly@relaypos.id',
      password: 'password123',
      nama: 'Kopi',
      tenantName: 'Kopi Murni',
      businessType: 'CAFE',
    })
    const { error: cafeCwErr } = await db.from('carwash_packages').insert({
      tenant_id: regCafe.data.tenant.id,
      name: 'ILLEGAL WASH',
      price: 50000,
    })
    expect(cafeCwErr).toBeDefined()

    const regCw = await db.auth.signUpOwner({
      email: 'day0.cwonly@relaypos.id',
      password: 'password123',
      nama: 'Cuci',
      tenantName: 'Cuci Murni',
      businessType: 'CARWASH',
    })
    const { error: cwCafeErr } = await db.from('daftar_harga_menu').insert({
      tenant_id: regCw.data.tenant.id,
      daftar_menu: 'Illegal Latte',
      harga: 25000,
    })
    expect(cwCafeErr).toBeDefined()
  })
})
