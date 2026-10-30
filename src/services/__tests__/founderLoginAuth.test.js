import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_DEMO_PASSWORD_HASH } from '../localDbEngine'

describe('Founder & Superadmin Authentication Suite', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('TC_01: Founder successfully logs in with superadmin@relaypos.com and password123', async () => {
    const res = await db.auth.signInWithPassword({
      email: 'superadmin@relaypos.com',
      password: 'password123',
    })

    expect(res.error).toBeNull()
    expect(res.data.user).toBeDefined()
    expect(res.data.user.email).toBe('superadmin@relaypos.com')
    expect(res.data.user.user_metadata.role).toBe('Super Admin')
    expect(res.data.user.user_metadata.tenant_id).toBe('tenant_platform_root')
  })

  it('TC_02: Founder successfully logs in using username handle "superadmin"', async () => {
    const res = await db.auth.signInWithPassword({
      email: 'superadmin',
      password: 'password123',
    })

    expect(res.error).toBeNull()
    expect(res.data.user).toBeDefined()
    expect(res.data.user.email).toBe('superadmin@relaypos.com')
    expect(res.data.user.user_metadata.role).toBe('Super Admin')
  })

  it('TC_03: Login handles input with trailing or leading whitespace gracefully', async () => {
    const res = await db.auth.signInWithPassword({
      email: '  superadmin@relaypos.com  ',
      password: ' password123 ',
    })

    expect(res.error).toBeNull()
    expect(res.data.user.email).toBe('superadmin@relaypos.com')
    expect(res.data.user.user_metadata.role).toBe('Super Admin')
  })

  it('TC_04: Prioritized profile matching prevents colliding legacy profiles named "SuperAdmin" from hijacking founder login', async () => {
    // Inject a dummy colliding profile placed earlier in the profiles table
    const profiles = db.localDb.store.getTable('profiles')
    profiles.unshift({
      id: 'colliding-legacy-admin',
      nama: 'SuperAdmin',
      role: 'Owner',
      password_hash: 'arbitrary_legacy_hash_xyz',
      salt: 'arbitrary_salt',
    })

    // Exact email match must still resolve to demo-superadmin-id
    const res = await db.auth.signInWithPassword({
      email: 'superadmin@relaypos.com',
      password: 'password123',
    })

    expect(res.error).toBeNull()
    expect(res.data.user.id).toBe('demo-superadmin-id')
    expect(res.data.user.email).toBe('superadmin@relaypos.com')
    expect(res.data.user.user_metadata.role).toBe('Super Admin')
  })

  it('TC_05: Incorrect password for founder is strictly rejected', async () => {
    const res = await db.auth.signInWithPassword({
      email: 'superadmin@relaypos.com',
      password: 'wrongPassword999!',
    })

    expect(res.error).not.toBeNull()
    expect(res.error.message).toBe('Kata sandi salah.')
    expect(res.data.user).toBeNull()
  })

  it('TC_06: Non-existent user is strictly rejected with Pengguna tidak ditemukan', async () => {
    const res = await db.auth.signInWithPassword({
      email: 'nonexistent_founder@relaypos.com',
      password: 'password123',
    })

    expect(res.error).not.toBeNull()
    expect(res.error.message).toBe('Pengguna tidak ditemukan.')
  })
})
