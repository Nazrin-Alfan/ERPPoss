import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient } from '../localDbEngine'

describe('Single Login & Dual Google OAuth Intent (Login vs Daftar)', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('TC_01: Login Google Tanpa Tenant Ditolak — mode login untuk email baru gagal dan tidak membuat tenant baru', async () => {
    const tenantsBefore = db.localDb.store.getTable('tenants').length

    const res = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        mode: 'login',
        data: {
          email: 'belum.terdaftar@gmail.com',
          nama: 'Pengguna Baru',
        },
      },
    })

    expect(res.data.user).toBeNull()
    expect(res.data.session).toBeNull()
    expect(res.error).not.toBeNull()
    expect(res.error.message).toBe('email belum memiliki tenant, silahkan klik DAFTAR untuk memulai')
    expect(db.localDb.store.getTable('tenants').length).toBe(tenantsBefore)
  })

  it('TC_02: Daftar Google Membuat Tenant Baru — mode register membuat tenant Trial 14 hari dan profil Owner', async () => {
    const res = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        mode: 'register',
        tenantName: 'Toko Budi Jaya',
        businessType: 'HYBRID',
        data: {
          email: 'budi.baru@gmail.com',
          nama: 'Budi Santoso',
        },
      },
    })

    expect(res.error).toBeNull()
    expect(res.data.user).toBeDefined()
    expect(res.data.profile.role).toBe('Owner')
    expect(res.data.tenant).toBeDefined()
    expect(res.data.tenant.plan).toBe('TRIAL')
    expect(res.data.tenant.nama).toBe('Toko Budi Jaya')
  })

  it('TC_03: Login Google untuk Tenant Terdaftar Berhasil — email yang sudah terdaftar masuk ke tenant terkait', async () => {
    const reg = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        mode: 'register',
        tenantName: 'Carwash Maju',
        data: {
          email: 'owner.maju@gmail.com',
          nama: 'Owner Maju',
        },
      },
    })
    expect(reg.error).toBeNull()

    const loginRes = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        mode: 'login',
        data: {
          email: 'owner.maju@gmail.com',
        },
      },
    })

    expect(loginRes.error).toBeNull()
    expect(loginRes.data.profile.role).toBe('Owner')
    expect(loginRes.data.tenant.id).toBe(reg.data.tenant.id)
  })

  it('TC_04: Login Google untuk Super Admin Berhasil — preserves Super Admin role', async () => {
    const res = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        mode: 'login',
        data: {
          email: 'superadmin@relaypos.com',
          nama: 'Founder RelayPOS',
        },
      },
    })

    expect(res.error).toBeNull()
    expect(res.data.user).toBeDefined()
    expect(res.data.profile.role).toBe('Super Admin')
    expect(res.data.user.role).toBe('Super Admin')
    expect(res.data.user.user_metadata.role).toBe('Super Admin')
  })

  it('TC_05: Smart Co-Owner Flow — Owner 1 mendaftarkan Owner 2, lalu Owner 2 Login Google (mode login) masuk ke toko Owner 1', async () => {
    const regOwner1 = await db.auth.signUpOwner({
      email: 'owner1@gmail.com',
      password: 'password123',
      nama: 'Owner Satu',
      tenantName: 'Berkah Auto Wash',
      businessType: 'HYBRID',
    })
    expect(regOwner1.error).toBeNull()
    const store1TenantId = regOwner1.data.tenant.id

    const regOwner2 = await db.auth.signUp({
      email: 'mitra.owner2@gmail.com',
      password: 'password123',
      options: {
        data: {
          nama: 'Mitra Dua',
          role: 'Owner',
          tenant_id: store1TenantId,
        },
      },
    })
    expect(regOwner2.error).toBeNull()

    const oauthRes = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        mode: 'login',
        data: {
          email: 'mitra.owner2@gmail.com',
          nama: 'Mitra Dua',
        },
      },
    })

    expect(oauthRes.error).toBeNull()
    expect(oauthRes.data.profile.role).toBe('Owner')
    expect(oauthRes.data.profile.tenant_id).toBe(store1TenantId)
    expect(oauthRes.data.tenant.id).toBe(store1TenantId)
  })
})
