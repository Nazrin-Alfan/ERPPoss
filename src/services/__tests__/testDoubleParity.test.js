import { describe, it, expect, beforeEach } from 'vitest'
import {
  createLocalClient,
  DEFAULT_TENANT_ID,
  DEFAULT_BRANCH_ID,
  isValidPostgresUuid,
  generateLocalUuid,
} from '../localDbEngine.js'

describe('Pilar 5: Test Double Parity Testing (Strict Postgres & PostgREST Simulation)', () => {
  let db

  beforeEach(() => {
    db = createLocalClient({ strictPostgresParity: true })
    db.erp.resetDatabase()
    db.erp.setStrictPostgresParity(true)
  })

  it('TC_PARITY_01: Reproduces Postgres Error 22P02 on non-UUID id filters and inserts', async () => {
    // 1. Delete with pseudo-string ID ('pkg_sultan')
    const { error: delErr } = await db
      .from('carwash_packages')
      .delete()
      .eq('id', 'pkg_sultan')

    expect(delErr).toBeDefined()
    expect(delErr.code).toBe('22P02')
    expect(delErr.message).toMatch(/invalid input syntax for type uuid: "pkg_sultan"/i)

    // 2. Select .in('id', [...]) with non-UUID
    const { error: inErr } = await db
      .from('carwash_packages')
      .select('*')
      .in('id', ['pkg_cuci_biasa'])

    expect(inErr).toBeDefined()
    expect(inErr.code).toBe('22P02')
    expect(inErr.message).toMatch(/invalid input syntax for type uuid: "pkg_cuci_biasa"/i)

    // 3. Insert explicit non-UUID id
    const { error: insErr } = await db.from('carwash_packages').insert({
      id: 'pkg_invalid_string',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      name: 'INVALID PKG',
      price: 50000,
    })

    expect(insErr).toBeDefined()
    expect(insErr.code).toBe('22P02')

    // 4. pengeluaran.id_bahan_baku is UUID in Postgres -> non-UUID string triggers 22P02
    const expUuid = generateLocalUuid()
    const { error: fkUuidErr } = await db.from('pengeluaran').insert({
      id: expUuid,
      id_pengeluaran: expUuid,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: '2026-11-17',
      nama_pengeluaran: 'Beli Kopi',
      kategori: 'Bahan Baku',
      nominal: 50000,
      apakah_stok: true,
      id_bahan_baku: 'BB-NON-UUID',
      qty: 1,
    })

    expect(fkUuidErr).toBeDefined()
    expect(fkUuidErr.code).toBe('22P02')
    expect(fkUuidErr.message).toMatch(/invalid input syntax for type uuid: "BB-NON-UUID"/i)
  })

  it('TC_PARITY_02: Reproduces PostgREST Error PGRST204 when inserting or updating nonexistent schema columns', async () => {
    const expUuid = generateLocalUuid()

    // 1. Inserting removed/legacy column 'id_barang' into pengeluaran
    const { error: insertSchemaErr } = await db.from('pengeluaran').insert({
      id: expUuid,
      id_pengeluaran: expUuid,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      tanggal: '2026-11-17',
      nama_pengeluaran: 'Beli Susu',
      kategori: 'Bahan Baku',
      nominal: 75000,
      id_barang: 'BB-SUSU',
    })

    expect(insertSchemaErr).toBeDefined()
    expect(insertSchemaErr.code).toBe('PGRST204')
    expect(insertSchemaErr.message).toBe(
      "Could not find the 'id_barang' column of 'pengeluaran' in the schema cache"
    )

    // 2. Updating nonexistent column on pengeluaran
    const { error: updateSchemaErr } = await db
      .from('pengeluaran')
      .update({ unit_usaha: 'Cafe' })
      .eq('id', expUuid)

    expect(updateSchemaErr).toBeDefined()
    expect(updateSchemaErr.code).toBe('PGRST204')
    expect(updateSchemaErr.message).toBe(
      "Could not find the 'unit_usaha' column of 'pengeluaran' in the schema cache"
    )
  })

  it('TC_PARITY_03: Local RPC fn_complete_store_setup parity matches PL/pgSQL cloud contract', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'parity03.owner@relaypos.id',
      password: 'password123',
      nama: 'Kurnia',
      tenantName: 'Kurnia Wash',
      businessType: 'CARWASH',
    })
    const tenantId = reg.data.tenant.id

    const { data: setupRes, error: setupErr } = await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantId,
      p_payload: {
        owner_name: 'Kurnia Sari',
        store_name: 'Kurnia Wash Pro',
        business_type: 'CARWASH',
        telepon: '08111222333',
        alamat: 'Jl. Merdeka No. 99',
        clear_starter_samples: true,
        carwash_packages: [{ nama_paket: 'PAKET WASH PRO', tarif: 80000 }],
        stock_items: [{ nama_barang: 'Shampoo Salju Super', satuan: 'liter', stok: 40, harga_satuan: 30000, gudang: 'CARWASH' }],
      },
    })

    expect(setupErr).toBeNull()
    expect(setupRes).toMatchObject({
      success: true,
      tenant_id: tenantId,
      onboarding_completed: true,
    })
    expect(setupRes.branch_id).toBeTruthy()

    const packages = db.localDb.store.getTable('carwash_packages').filter((p) => p.tenant_id === tenantId)
    expect(packages).toHaveLength(1)
    expect(isValidPostgresUuid(packages[0].id)).toBe(true)
    expect(packages[0].tarif_matrix).toBeDefined()
    expect(packages[0].tarif_matrix.Small.Regular).toBe(80000)
    expect(packages[0].keterangan).toBeTruthy()

    const stocks = db.localDb.store.getTable('stok_barang').filter((s) => s.tenant_id === tenantId)
    expect(stocks).toHaveLength(1)
    expect(isValidPostgresUuid(stocks[0].id)).toBe(true)
    expect(stocks[0].id_barang).toMatch(/^BB-SHM-/)
  })

  it('TC_PARITY_04: UPSERT enforces Postgres UUID/schema parity and auto-generates UUID PK when omitted', async () => {
    // 1. UPSERT rejecting unknown schema column (PGRST204)
    const { error: badColErr } = await db.from('carwash_packages').upsert({
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      name: 'UPSERT PKG',
      price: 60000,
      nonexistent_col: 'bad',
    })
    expect(badColErr).toBeDefined()
    expect(badColErr.code).toBe('PGRST204')

    // 2. UPSERT rejecting invalid UUID id (22P02)
    const { error: badUuidErr } = await db.from('carwash_packages').upsert({
      id: 'pkg_bad_upsert',
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      name: 'UPSERT PKG',
      price: 60000,
    })
    expect(badUuidErr).toBeDefined()
    expect(badUuidErr.code).toBe('22P02')

    // 3. Valid UPSERT omitting id auto-generates RFC 4122 UUID
    const { data: okRow, error: okErr } = await db.from('carwash_packages').upsert({
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      name: 'PAKET UPSERT PARITY',
      nama_paket: 'PAKET UPSERT PARITY',
      price: 65000,
      tarif: 65000,
      is_active: true,
    })
    expect(okErr).toBeNull()
    expect(isValidPostgresUuid(okRow.id)).toBe(true)
  })
})
