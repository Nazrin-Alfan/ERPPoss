import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createLocalClient,
  DEFAULT_TENANT_ID,
  DEFAULT_BRANCH_ID,
  isValidPostgresUuid,
  generateLocalUuid,
  setActiveTenantId,
  resetActiveActorContext,
} from '../localDbEngine.js'
import { calculateMenuHpp, calculateMarginSimulation } from '../../utils/hppCalculator.js'

describe('Pilar 3: Real-Environment CRUD Lifecycle E2E Tests (Strict Postgres Parity)', () => {
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

  it('TC_CRUD_01: Full Carwash Package Lifecycle + Chemical Recipe Cascade Delete', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'crud01.owner@relaypos.id',
      password: 'password123',
      nama: 'Eko',
      tenantName: 'Eko Auto Detailing',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id
    const branchId = reg.data.profile.branch_id
    setActiveTenantId(tenantId)

    const pkgName = 'PAKET CERAMIC EXPRESS'
    // 1. CREATE
    const { data: createdPkg, error: insErr } = await db.from('carwash_packages').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name: pkgName,
      nama_paket: pkgName,
      description: 'Cuci snow + ceramic sealant',
      keterangan: 'Cuci snow + ceramic sealant',
      price: 120000,
      tarif: 120000,
      tarif_matrix: {
        Small: { Regular: 120000, 'Body only': 100000 },
        Medium: { Regular: 140000, 'Body only': 120000 },
        Large: { Regular: 160000, 'Body only': 140000 },
        'Extra Large': { Regular: 200000, 'Body only': 200000 },
      },
      komisi_skema: 'TIERED',
      komisi_value: 0,
      is_active: true,
    })
    expect(insErr).toBeNull()
    expect(isValidPostgresUuid(createdPkg.id)).toBe(true)

    const { error: resepErr } = await db.from('resep').insert({
      tenant_id: tenantId,
      id_resep: `rsp_cw_${Date.now()}`,
      nama_menu: pkgName,
      id_bahan_baku: 'BB-SHM',
      nama_bahan: 'Shampoo Carwash Touchless',
      jumlah: 0.25,
      jumlah_dibutuhkan: 0.25,
      satuan: 'liter',
    })
    expect(resepErr).toBeNull()

    // 2. READ
    const { data: readBack, error: readErr } = await db
      .from('carwash_packages')
      .select('*')
      .eq('id', createdPkg.id)
      .single()
    expect(readErr).toBeNull()
    expect(readBack.nama_paket).toBe(pkgName)

    // 3. UPDATE pricing & commission
    const updatedMatrix = {
      ...readBack.tarif_matrix,
      Large: { Regular: 175000, 'Body only': 155000 },
    }
    const { error: updErr } = await db
      .from('carwash_packages')
      .update({
        tarif_matrix: updatedMatrix,
        komisi_skema: 'PERCENT',
        komisi_value: 25,
      })
      .eq('id', createdPkg.id)
    expect(updErr).toBeNull()

    // 4. TOGGLE is_active
    const { error: toggleErr } = await db
      .from('carwash_packages')
      .update({ is_active: false })
      .eq('id', createdPkg.id)
    expect(toggleErr).toBeNull()

    const { data: toggledRow } = await db
      .from('carwash_packages')
      .select('*')
      .eq('id', createdPkg.id)
      .single()
    expect(toggledRow.is_active).toBe(false)
    expect(toggledRow.komisi_skema).toBe('PERCENT')
    expect(toggledRow.tarif_matrix.Large.Regular).toBe(175000)

    // 5. DELETE package & cascade delete recipe
    const { error: delPkgErr } = await db.from('carwash_packages').delete().eq('id', createdPkg.id)
    expect(delPkgErr).toBeNull()
    const { error: delResepErr } = await db.from('resep').delete().eq('nama_menu', pkgName)
    expect(delResepErr).toBeNull()

    // 6. VERIFY permanently deleted on re-query
    const { data: afterDeletePkgs } = await db
      .from('carwash_packages')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', createdPkg.id)
    expect(afterDeletePkgs).toHaveLength(0)

    const { data: afterDeleteResep } = await db
      .from('resep')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('nama_menu', pkgName)
    expect(afterDeleteResep).toHaveLength(0)
  })

  it('TC_CRUD_02: Full Cafe Menu + 3-Ingredient Recipe BOM + HPP Pricing Lifecycle', async () => {
    const tenantId = DEFAULT_TENANT_ID
    const branchId = DEFAULT_BRANCH_ID

    // 1. Seed 3 ingredients in stok_barang
    const { data: stocks, error: stErr } = await db.from('stok_barang').insert([
      {
        tenant_id: tenantId, branch_id: branchId, id_barang: 'CRUD-KOPI', id_bahan_baku: 'CRUD-KOPI',
        nama_produk: 'Espresso Bean Blend', nama_barang: 'Espresso Bean Blend', satuan: 'kg',
        stok: 20, stok_akhir: 20, harga_satuan: 200000, harga_beli: 200000, gudang: 'CAFE', kategori: 'Bahan Baku',
      },
      {
        tenant_id: tenantId, branch_id: branchId, id_barang: 'CRUD-SUSU', id_bahan_baku: 'CRUD-SUSU',
        nama_produk: 'Fresh Milk Full Cream', nama_barang: 'Fresh Milk Full Cream', satuan: 'liter',
        stok: 50, stok_akhir: 50, harga_satuan: 22000, harga_beli: 22000, gudang: 'CAFE', kategori: 'Bahan Baku',
      },
      {
        tenant_id: tenantId, branch_id: branchId, id_barang: 'CRUD-AREN', id_bahan_baku: 'CRUD-AREN',
        nama_produk: 'Gula Aren Cair Premium', nama_barang: 'Gula Aren Cair Premium', satuan: 'liter',
        stok: 15, stok_akhir: 15, harga_satuan: 35000, harga_beli: 35000, gudang: 'CAFE', kategori: 'Bahan Baku',
      },
    ])
    expect(stErr).toBeNull()
    expect(stocks).toHaveLength(3)

    const menuName = 'Kopi Aren Signature CRUD'
    // 2. Create menu
    const { data: menu, error: mErr } = await db.from('daftar_harga_menu').insert({
      tenant_id: tenantId,
      branch_id: branchId,
      daftar_menu: menuName,
      nama_menu: menuName,
      kategori: 'Kopi (Coffee)',
      harga: 18000,
      is_active: true,
    })
    expect(mErr).toBeNull()
    expect(isValidPostgresUuid(menu.id)).toBe(true)

    // 3. Insert 3 recipes
    const recipePayloads = [
      { id_resep: 'r1', id_bahan_baku: 'CRUD-KOPI', nama_bahan: 'Espresso Bean Blend', jumlah: 18, jumlah_dibutuhkan: 18, satuan: 'gram' },
      { id_resep: 'r2', id_bahan_baku: 'CRUD-SUSU', nama_bahan: 'Fresh Milk Full Cream', jumlah: 150, jumlah_dibutuhkan: 150, satuan: 'ml' },
      { id_resep: 'r3', id_bahan_baku: 'CRUD-AREN', nama_bahan: 'Gula Aren Cair Premium', jumlah: 25, jumlah_dibutuhkan: 25, satuan: 'ml' },
    ].map((r) => ({ ...r, tenant_id: tenantId, nama_menu: menuName }))

    const { error: rInsErr } = await db.from('resep').insert(recipePayloads)
    expect(rInsErr).toBeNull()

    // 4. Calculate HPP and apply 60% target margin recommendedPrice
    // 18g @200/g = 3600, 150ml @22/ml = 3300, 25ml @35/ml = 875 -> foodCost = 7775
    const hpp = calculateMenuHpp({
      recipeList: recipePayloads,
      stockItems: stocks,
      packagingCost: 1225,
      overheadCost: 0,
    })
    expect(hpp.totalHpp).toBe(9000)

    const sim = calculateMarginSimulation({
      sellingPrice: menu.harga,
      totalHpp: hpp.totalHpp,
      targetMargin: 60,
    })
    // 9000 / 0.4 = 22500
    expect(sim.recommendedPrice).toBe(22500)

    // 5. Update menu price & one recipe line
    const { error: mUpdErr } = await db
      .from('daftar_harga_menu')
      .update({ harga: sim.recommendedPrice })
      .eq('id', menu.id)
    expect(mUpdErr).toBeNull()

    const { error: rUpdErr } = await db
      .from('resep')
      .update({ jumlah_dibutuhkan: 20, jumlah: 20 })
      .eq('id_resep', 'r1')
    expect(rUpdErr).toBeNull()

    const { data: updatedMenu } = await db.from('daftar_harga_menu').select('*').eq('id', menu.id).single()
    expect(updatedMenu.harga).toBe(22500)

    // 6. Delete menu and its recipes
    await db.from('resep').delete().eq('nama_menu', menuName)
    await db.from('daftar_harga_menu').delete().eq('id', menu.id)

    const { data: leftMenus } = await db.from('daftar_harga_menu').select('*').eq('id', menu.id)
    const { data: leftRecipes } = await db.from('resep').select('*').eq('nama_menu', menuName)
    expect(leftMenus).toHaveLength(0)
    expect(leftRecipes).toHaveLength(0)
  })

  it('TC_CRUD_03: Expense Recording (Bahan Baku) to Automated Warehouse Restock & MAC Update', async () => {
    const stockId = generateLocalUuid()
    const { data: stockRow, error: sErr } = await db.from('stok_barang').insert({
      id: stockId,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      id_barang: 'BB-KOPI-MAC',
      id_bahan_baku: 'BB-KOPI-MAC',
      nama_produk: 'Biji Kopi Arabica Gayo',
      nama_barang: 'Biji Kopi Arabica Gayo',
      satuan: 'kg',
      stok: 10,
      stok_akhir: 10,
      harga_beli: 100000,
      harga_satuan: 100000,
      gudang: 'CAFE',
      kategori: 'Bahan Baku',
    })
    expect(sErr).toBeNull()

    const expId = generateLocalUuid()
    const { error: expErr } = await db.from('pengeluaran').insert({
      id: expId,
      id_pengeluaran: expId,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: '2026-11-17',
      jam: '14:15:00',
      nama_pengeluaran: 'Beli Biji Kopi Arabica Gayo',
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku',
      nominal: 500000,
      pos: 'SALDO CASH',
      apakah_stok: true,
      id_bahan_baku: stockRow.id,
      qty: 5,
    })
    expect(expErr).toBeNull()

    // Verify stock increased 10 -> 15 and MAC remained 100000 ((10*100k + 5*100k)/15 = 100k)
    const { data: restocked } = await db
      .from('stok_barang')
      .select('*')
      .eq('id', stockRow.id)
      .single()
    expect(restocked.stok).toBe(15)
    expect(restocked.stok_akhir).toBe(15)
    expect(restocked.harga_beli).toBe(100000)

    // Verify cashflow & barang_masuk side-effects
    const cashflows = db.localDb.store.getTable('cashflow').filter((c) => c.id_sumber === expId)
    expect(cashflows).toHaveLength(1)
    expect(cashflows[0].pengeluaran).toBe(500000)

    const bmList = db.localDb.store.getTable('barang_masuk').filter((b) => b.id_bahan_baku === stockRow.id)
    expect(bmList).toHaveLength(1)
    expect(bmList[0].jumlah_masuk).toBe(5)
    expect(bmList[0].total_harga).toBe(500000)
  })
})
