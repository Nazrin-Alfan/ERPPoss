import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient } from '../localDbEngine'

describe('Multi-Role Google OAuth, Co-Owner Re-bind & Store-Scoped Staff Login', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('TC_01: Google OAuth login for a new Owner creates a trial tenant and assigns role Owner', async () => {
    const res = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
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
    expect(res.data.tenant.nama).toBe("Budi Santoso's Store")
  })

  it('TC_02: Google OAuth login for Super Admin preserves Super Admin role without downgrading to Owner', async () => {
    const res = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
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

  it('TC_03: Co-Owner flow — Owner 1 registers Owner 2 Gmail (role Owner), then Owner 2 logs in via Google OAuth into the same tenant', async () => {
    // Owner 1 creates a store
    const regOwner1 = await db.auth.signUpOwner({
      email: 'owner1@gmail.com',
      password: 'password123',
      nama: 'Owner Satu',
      tenantName: 'Berkah Auto Wash',
      businessType: 'HYBRID',
    })
    expect(regOwner1.error).toBeNull()
    const store1TenantId = regOwner1.data.tenant.id

    // Owner 1 registers Owner 2 as Co-Owner
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

    // Owner 2 logs in via Google OAuth
    const oauthRes = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
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

  it('TC_04: Smart Co-Owner Re-bind — Owner 2 accidentally clicked Google Login first (0-tx trial store), then Owner 1 registers Owner 2 into Owner 1 store cleanly', async () => {
    // Owner 2 accidentally logs in via Google first -> creates empty trial store
    const accidentalLogin = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        data: {
          email: 'calon.mitra@gmail.com',
          nama: 'Calon Mitra',
        },
      },
    })
    expect(accidentalLogin.error).toBeNull()
    const accidentalTenantId = accidentalLogin.data.tenant.id

    // Owner 1 creates main store
    const regOwner1 = await db.auth.signUpOwner({
      email: 'pendiri@gmail.com',
      password: 'password123',
      nama: 'Pendiri Utama',
      tenantName: 'Jaya Auto Spa',
      businessType: 'CARWASH',
    })
    const mainTenantId = regOwner1.data.tenant.id

    // Owner 1 adds calon.mitra@gmail.com as Co-Owner -> should re-bind instead of failing with duplicate
    const rebindRes = await db.auth.signUp({
      email: 'calon.mitra@gmail.com',
      password: 'password123',
      options: {
        data: {
          nama: 'Calon Mitra',
          role: 'Owner',
          tenant_id: mainTenantId,
        },
      },
    })

    expect(rebindRes.error).toBeNull()
    expect(rebindRes.data.user.tenant_id).toBe(mainTenantId)

    // Verify Owner 2 now logs in to mainTenantId via Google OAuth
    const secondOauth = await db.auth.signInWithOAuth({
      provider: 'google',
      options: {
        data: {
          email: 'calon.mitra@gmail.com',
        },
      },
    })
    expect(secondOauth.data.profile.tenant_id).toBe(mainTenantId)
    expect(secondOauth.data.tenant.id).toBe(mainTenantId)

    // Accidental empty trial store should be cleaned up / removed
    const tenants = db.localDb.store.getTable('tenants')
    expect(tenants.find((t) => t.id === accidentalTenantId)).toBeUndefined()
  })

  it('TC_05: Store-Scoped Staff Login — fn_resolve_login_email resolves identical username "kasir1" to different tenants based on p_tenant_slug', async () => {
    const storeA = await db.auth.signUpOwner({
      email: 'ownera@gmail.com',
      password: 'password123',
      nama: 'Owner A',
      tenantName: 'Toko Alpha',
      businessType: 'CAFE',
    })
    const storeB = await db.auth.signUpOwner({
      email: 'ownerb@gmail.com',
      password: 'password123',
      nama: 'Owner B',
      tenantName: 'Toko Beta',
      businessType: 'CARWASH',
    })

    const slugA = storeA.data.tenant.slug
    const slugB = storeB.data.tenant.slug

    await db.auth.signUp({
      email: 'kasir1',
      password: 'password123',
      options: { data: { nama: 'Kasir Alpha', role: 'Kasir', tenant_id: storeA.data.tenant.id } },
    })
    await db.auth.signUp({
      email: 'kasir1',
      password: 'password123',
      options: { data: { nama: 'Kasir Beta', role: 'Kasir', tenant_id: storeB.data.tenant.id } },
    })

    const resA = await db.rpc('fn_resolve_login_email', { p_identifier: 'kasir1', p_tenant_slug: slugA })
    const resB = await db.rpc('fn_resolve_login_email', { p_identifier: 'kasir1', p_tenant_slug: slugB })

    expect(resA.error).toBeNull()
    expect(resB.error).toBeNull()
    expect(resA.data.email).toBe(`kasir1.${slugA}@pos.internal`)
    expect(resB.data.email).toBe(`kasir1.${slugB}@pos.internal`)
    expect(resA.data.email).not.toBe(resB.data.email)
  })
})
