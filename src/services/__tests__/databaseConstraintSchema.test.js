import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  createLocalClient,
  isValidPostgresUuid,
  DEFAULT_TENANT_ID,
} from '../localDbEngine.js'
import { createCleanTenantPayload } from '../../utils/superAdminHelpers.js'

const REQUIRED_VEHICLE_SIZES = ['Small', 'Medium', 'Large', 'Extra Large']
const VALID_WAREHOUSES = new Set(['CAFE', 'CARWASH', 'MERCHANDISE'])

describe('Pilar 1: Database Constraint & Schema Testing', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('TC_DB_01: UUID Primary Key Constraint Validation on new tenant provisioning & onboarding RPC', async () => {
    // 1. Provisioning via SuperAdmin helper
    const superAdminPayload = createCleanTenantPayload({
      storeName: 'Garasi Bersih Abadi',
      slug: 'garasi_bersih',
      ownerEmail: 'owner@garasi.id',
      ownerName: 'Pak Hendra',
      businessType: 'HYBRID',
    })

    expect(superAdminPayload.initialPackages.length).toBeGreaterThanOrEqual(6)
    superAdminPayload.initialPackages.forEach((pkg) => {
      expect(isValidPostgresUuid(pkg.id)).toBe(true)
      expect(pkg.id).not.toMatch(/^pkg_/)
    })

    // 2. Provisioning via signUpOwner + fn_complete_store_setup
    const reg = await db.auth.signUpOwner({
      email: 'db01.owner@relaypos.id',
      password: 'password123',
      nama: 'Andi',
      tenantName: 'Andi Wash & Brew',
      businessType: 'HYBRID',
    })
    expect(reg.error).toBeNull()

    const tenantId = reg.data.tenant.id
    const starterPackages = db.localDb.store
      .getTable('carwash_packages')
      .filter((p) => p.tenant_id === tenantId)
    expect(starterPackages.length).toBeGreaterThanOrEqual(6)
    starterPackages.forEach((pkg) => {
      expect(isValidPostgresUuid(pkg.id)).toBe(true)
    })

    const rpcRes = await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantId,
      p_payload: {
        owner_name: 'Andi Wijaya',
        store_name: 'Andi Wash & Brew',
        business_type: 'HYBRID',
        clear_starter_samples: true,
        carwash_packages: [{ nama_paket: 'PAKET FOAM SNOW', tarif: 55000 }],
        cafe_menus: [{ nama_menu: 'Es Kopi Susu', kategori: 'Kopi', harga: 18000 }],
        stock_items: [{ nama_barang: 'Biji Kopi Toraja', satuan: 'kg', stok: 10, harga_satuan: 180000, gudang: 'CAFE' }],
      },
    })
    expect(rpcRes.error).toBeNull()

    const pkgs = db.localDb.store.getTable('carwash_packages').filter((p) => p.tenant_id === tenantId)
    const menus = db.localDb.store.getTable('daftar_harga_menu').filter((m) => m.tenant_id === tenantId)
    const stocks = db.localDb.store.getTable('stok_barang').filter((s) => s.tenant_id === tenantId)

    expect(pkgs).toHaveLength(1)
    expect(menus).toHaveLength(1)
    expect(stocks).toHaveLength(1)
    expect(isValidPostgresUuid(pkgs[0].id)).toBe(true)
    expect(isValidPostgresUuid(menus[0].id)).toBe(true)
    expect(isValidPostgresUuid(stocks[0].id)).toBe(true)
  })

  it('TC_DB_02: Starter & Onboarding Stock SKU Constraint (NOT NULL id_barang & id_bahan_baku)', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'db02.owner@relaypos.id',
      password: 'password123',
      nama: 'Budi',
      tenantName: 'Budi Auto & Kopi',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id

    // Starter stock from registration must already have non-null SKU & UUID id
    const starterStocks = db.localDb.store.getTable('stok_barang').filter((s) => s.tenant_id === tenantId)
    expect(starterStocks.length).toBeGreaterThanOrEqual(3)
    starterStocks.forEach((item) => {
      expect(isValidPostgresUuid(item.id)).toBe(true)
      expect(typeof item.id_barang).toBe('string')
      expect(item.id_barang.trim().length).toBeGreaterThan(0)
      expect(item.id_bahan_baku).toBe(item.id_barang)
      expect(VALID_WAREHOUSES.has(item.gudang)).toBe(true)
    })

    // Onboarding setup without manual SKU must auto-generate SKUs cleanly
    await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantId,
      p_payload: {
        clear_starter_samples: true,
        stock_items: [
          { nama_barang: 'Biji Kopi Robusta', satuan: 'kg', stok: 5, gudang: 'CAFE' },
          { nama_barang: 'Susu Oatmilk', satuan: 'liter', stok: 12, gudang: 'CAFE' },
          { nama_barang: 'Shampoo pH Neutral', satuan: 'liter', stok: 25, gudang: 'CARWASH' },
          { nama_barang: 'Microfiber Cloth 40x40', satuan: 'pcs', stok: 30, gudang: 'MERCHANDISE' },
        ],
      },
    })

    const onboardedStocks = db.localDb.store.getTable('stok_barang').filter((s) => s.tenant_id === tenantId)
    expect(onboardedStocks).toHaveLength(4)
    expect(onboardedStocks[0].id_barang).toMatch(/^BB-KOPI-/)
    expect(onboardedStocks[1].id_barang).toMatch(/^BB-SUSU-/)
    expect(onboardedStocks[2].id_barang).toMatch(/^BB-SHM-/)
    expect(onboardedStocks[3].id_barang).toMatch(/^MRC-/)
    onboardedStocks.forEach((item) => {
      expect(isValidPostgresUuid(item.id)).toBe(true)
      expect(item.id_bahan_baku).toBe(item.id_barang)
      expect(item.nama_produk).toBeTruthy()
      expect(item.satuan).toBeTruthy()
      expect(VALID_WAREHOUSES.has(item.gudang)).toBe(true)
    })
  })

  it('TC_DB_03: JSONB tarif_matrix Structural Integrity across all vehicle sizes and modes', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'db03.owner@relaypos.id',
      password: 'password123',
      nama: 'Citra',
      tenantName: 'Citra Carwash',
      businessType: 'CARWASH',
    })
    const tenantId = reg.data.tenant.id

    await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantId,
      p_payload: {
        clear_starter_samples: false,
        carwash_packages: [{ nama_paket: 'PAKET INTERIOR DEEP', tarif: 90000 }],
      },
    })

    const packages = db.localDb.store.getTable('carwash_packages').filter((p) => p.tenant_id === tenantId)
    expect(packages.length).toBeGreaterThanOrEqual(2)

    packages.forEach((pkg) => {
      expect(typeof pkg.price).toBe('number')
      expect(pkg.price).toBeGreaterThanOrEqual(0)
      expect(pkg.tarif_matrix).toBeDefined()
      expect(typeof pkg.tarif_matrix).toBe('object')

      REQUIRED_VEHICLE_SIZES.forEach((size) => {
        const tier = pkg.tarif_matrix[size]
        expect(tier).toBeDefined()
        expect(typeof tier.Regular).toBe('number')
        expect(tier.Regular).toBeGreaterThanOrEqual(0)
        expect(typeof tier['Body only']).toBe('number')
        expect(tier['Body only']).toBeGreaterThanOrEqual(0)
      })
    })
  })

  it('TC_DB_04: Double-Entry Accounting & Decimal Precision Invariant', () => {
    expect(() =>
      db.erp.postJournal({
        tenant_id: DEFAULT_TENANT_ID,
        date: '2026-11-17',
        memo: 'Imbalanced entry test',
        lines: [
          { account_id: 'acc_1001', debit: 100000, credit: 0 },
          { account_id: 'acc_4001', debit: 0, credit: 99999 },
        ],
      })
    ).toThrow(/DOUBLE_ENTRY_VIOLATION/)

    const balanced = db.erp.postJournal({
      tenant_id: DEFAULT_TENANT_ID,
      date: '2026-11-17',
      memo: 'Fractional precision test',
      lines: [
        { account_id: 'acc_1001', debit: 12345.6789, credit: 0 },
        { account_id: 'acc_4001', debit: 0, credit: 12345.6789 },
      ],
    })
    expect(balanced).toBeDefined()
    const lines = db.localDb.store
      .getTable('journal_entry_lines')
      .filter((l) => l.journal_entry_id === balanced.id)
    const debitSum = lines.reduce((sum, l) => sum + Number(l.debit), 0)
    const creditSum = lines.reduce((sum, l) => sum + Number(l.credit), 0)
    expect(Math.abs(debitSum - creditSum)).toBeLessThan(0.001)
  })

  it('TC_DB_05: Static SQL Migration Drift Verification for onboarding & package defaults', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261117000007_harden_carwash_packages_and_onboarding_defaults.sql'
    )
    expect(fs.existsSync(migrationPath)).toBe(true)

    const sql = fs.readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('fn_initialize_tenant_defaults')
    expect(sql).toContain('fn_complete_store_setup')
    expect(sql).toContain('tarif_matrix')
    expect(sql).toContain('keterangan')
    expect(sql).toContain('gen_random_uuid()')
    expect(sql).toContain('id_barang')
    expect(sql).toContain('id_bahan_baku')
  })
})
