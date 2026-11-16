import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient } from '../localDbEngine'

describe('Guided Store Onboarding Setup (2-Stage SaaS Flow)', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('TC_01: New tenant from signUpOwner or Google register starts with onboarding_completed === false', async () => {
    const emailReg = await db.auth.signUpOwner({
      email: 'owner.baru@gmail.com',
      password: 'password123',
      nama: 'Andi Wijaya',
      tenantName: 'Andi Auto Spa',
      businessType: 'HYBRID',
    })
    expect(emailReg.error).toBeNull()
    expect(emailReg.data.tenant.onboarding_completed).toBe(false)

    const googleReg = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        mode: 'register',
        data: {
          mode: 'register',
          email: 'google.owner@gmail.com',
          nama: 'Sari',
          tenantName: 'Sari Kopi',
          businessType: 'CAFE',
        },
      },
    })
    expect(googleReg.error).toBeNull()
    expect(googleReg.data.tenant.onboarding_completed).toBe(false)
  })

  it('TC_02: fn_complete_store_setup updates owner profile, tenant, branch address/phone, and marks onboarding_completed === true', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'setup.owner@gmail.com',
      password: 'password123',
      nama: 'Delta Force',
      tenantName: 'Berkah Wash',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id
    const userId = reg.data.user.id

    const rpcRes = await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantId,
      p_payload: {
        owner_name: 'Hendra Pratama',
        store_name: 'Hendra Auto & Kopi',
        business_type: 'HYBRID',
        telepon: '081299998888',
        alamat: 'Jl. Sudirman No. 45, Bandung',
        clear_starter_samples: false,
      },
    })

    expect(rpcRes.error).toBeNull()
    expect(rpcRes.data.success).toBe(true)
    expect(rpcRes.data.onboarding_completed).toBe(true)

    const updatedTenant = db.localDb.store.getTable('tenants').find((t) => t.id === tenantId)
    expect(updatedTenant.nama).toBe('Hendra Auto & Kopi')
    expect(updatedTenant.onboarding_completed).toBe(true)

    const updatedBranch = db.localDb.store.getTable('branches').find((b) => b.tenant_id === tenantId)
    expect(updatedBranch.alamat).toBe('Jl. Sudirman No. 45, Bandung')
    expect(updatedBranch.telepon).toBe('081299998888')

    const updatedProfile = db.localDb.store.getTable('profiles').find((p) => p.id === userId)
    expect(updatedProfile.nama).toBe('Hendra Pratama')
  })

  it('TC_03: clear_starter_samples replaces starter menus, packages, and materials with owner items when 0 transactions exist', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'clean.owner@gmail.com',
      password: 'password123',
      nama: 'Rina',
      tenantName: 'Rina Carwash',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id

    const rpcRes = await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantId,
      p_payload: {
        owner_name: 'Rina Marlina',
        store_name: 'Rina Detailing & Brew',
        business_type: 'HYBRID',
        telepon: '081300001111',
        alamat: 'Jl. Asia Afrika No. 10',
        clear_starter_samples: true,
        carwash_packages: [{ nama_paket: 'Cuci Hidrolik Premium', tarif: 65000 }],
        cafe_menus: [{ nama_menu: 'Matcha Latte', kategori: 'Minuman', harga: 25000 }],
        stock_items: [
          {
            nama_barang: 'Bubuk Matcha Jepang',
            satuan: 'gram',
            stok: 500,
            harga_satuan: 400,
            min_stok: 100,
            gudang: 'CAFE',
          },
        ],
      },
    })

    expect(rpcRes.error).toBeNull()

    const menus = db.localDb.store.getTable('daftar_harga_menu').filter((m) => m.tenant_id === tenantId)
    const packages = db.localDb.store.getTable('carwash_packages').filter((p) => p.tenant_id === tenantId)
    const stocks = db.localDb.store.getTable('stok_barang').filter((s) => s.tenant_id === tenantId)
    const recipes = db.localDb.store.getTable('resep').filter((r) => r.tenant_id === tenantId)

    expect(recipes).toHaveLength(0)
    expect(menus.map((m) => m.daftar_menu)).toEqual(['Matcha Latte'])
    expect(packages.map((p) => p.nama_paket)).toEqual(['CUCI HIDROLIK PREMIUM'])
    expect(stocks.map((s) => s.nama_produk)).toEqual(['Bubuk Matcha Jepang'])
  })

  it('TC_04: Skip setup marks onboarding_completed === true while preserving starter template data', async () => {
    const reg = await db.auth.signUpOwner({
      email: 'skip.owner@gmail.com',
      password: 'password123',
      nama: 'Bima',
      tenantName: 'Bima Wash',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id
    const initialMenusCount = db.localDb.store
      .getTable('daftar_harga_menu')
      .filter((m) => m.tenant_id === tenantId).length
    expect(initialMenusCount).toBeGreaterThan(0)

    const rpcRes = await db.rpc('fn_complete_store_setup', {
      p_tenant_id: tenantId,
      p_payload: { skip: true },
    })

    expect(rpcRes.error).toBeNull()
    expect(rpcRes.data.onboarding_completed).toBe(true)

    const updatedTenant = db.localDb.store.getTable('tenants').find((t) => t.id === tenantId)
    expect(updatedTenant.onboarding_completed).toBe(true)

    const afterMenusCount = db.localDb.store
      .getTable('daftar_harga_menu')
      .filter((m) => m.tenant_id === tenantId).length
    expect(afterMenusCount).toBe(initialMenusCount)
  })
})
