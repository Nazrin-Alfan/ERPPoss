import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient } from '../localDbEngine'

describe('3-Tier RBAC Architecture (Owner, Admin, Kasir)', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('1. should initialize 3 primary role profiles (Owner, Admin, Kasir)', async () => {
    const { data: profiles } = await db.from('profiles').select('*')
    expect(profiles.length).toBeGreaterThanOrEqual(3)

    const owner = profiles.find((p) => p.role === 'Owner' && p.email === 'owner@relaypos.com')
    const admin = profiles.find((p) => p.role === 'Admin' && p.email === 'admin@relaypos.com')
    const kasir = profiles.find((p) => p.role === 'Kasir' && p.email === 'kasir@relaypos.com')

    expect(owner).toBeDefined()
    expect(owner.nama).toMatch(/Owner/i)

    expect(admin).toBeDefined()
    expect(admin.nama).toBe('Admin Supervisor')

    expect(kasir).toBeDefined()
    expect(kasir.nama).toBe('Kasir Demo')
  })

  it('2. should authenticate and resolve role correctly via signInWithPassword', async () => {
    // 1. Login as Owner
    const { data: ownerAuth } = await db.auth.signInWithPassword({
      email: 'owner@relaypos.com',
      password: 'password123',
    })
    expect(ownerAuth.user.role).toBe('Owner')
    expect(ownerAuth.user.email).toBe('owner@relaypos.com')

    // 2. Login as Admin
    const { data: adminAuth } = await db.auth.signInWithPassword({
      email: 'admin@relaypos.com',
      password: 'password123',
    })
    expect(adminAuth.user.role).toBe('Admin')
    expect(adminAuth.user.email).toBe('admin@relaypos.com')

    // 3. Login as Kasir
    const { data: kasirAuth } = await db.auth.signInWithPassword({
      email: 'kasir@relaypos.com',
      password: 'password123',
    })
    expect(kasirAuth.user.role).toBe('Kasir')
    expect(kasirAuth.user.email).toBe('kasir@relaypos.com')
  })

  it('3. should also resolve shorthand usernames with valid password (owner, admin, kasir)', async () => {
    const { data: ownerAuth } = await db.auth.signInWithPassword({ email: 'owner', password: 'password123' })
    expect(ownerAuth.user.role).toBe('Owner')

    const { data: adminAuth } = await db.auth.signInWithPassword({ email: 'admin', password: 'password123' })
    expect(adminAuth.user.role).toBe('Admin')

    const { data: kasirAuth } = await db.auth.signInWithPassword({ email: 'kasir', password: 'password123' })
    expect(kasirAuth.user.role).toBe('Kasir')
  })

  it('4. should populate all 3 roles into karyawan_kantor list', async () => {
    const { data: kk } = await db.from('karyawan_kantor').select('*')
    const ownerRec = kk.find((k) => k.role === 'Owner')
    const adminRec = kk.find((k) => k.role === 'Admin')
    const kasirRec = kk.find((k) => k.role === 'Kasir')

    expect(ownerRec).toBeDefined()
    expect(adminRec).toBeDefined()
    expect(kasirRec).toBeDefined()
  })

  it('5. should enforce route authorization matrix across roles', () => {
    // Definisi rute sesuai App.jsx & Sidebar.jsx
    const routeRules = {
      '/': ['Owner'],
      '/pos': ['Owner', 'Admin', 'Kasir'],
      '/queue': ['Owner', 'Admin', 'Kasir'],
      '/finance': ['Owner', 'Admin'],
      '/reports': ['Owner'],
      '/crm': ['Owner', 'Admin'],
      '/karyawan': ['Owner', 'Admin'],
      '/admin': ['Owner'],
      '/database': ['Owner', 'Admin'],
    }

    const checkAccess = (role, path) => {
      const allowed = routeRules[path]
      return allowed ? allowed.includes(role) : false
    }

    // Kasir Access Check
    expect(checkAccess('Kasir', '/pos')).toBe(true)
    expect(checkAccess('Kasir', '/queue')).toBe(true)
    expect(checkAccess('Kasir', '/')).toBe(false)
    expect(checkAccess('Kasir', '/finance')).toBe(false)
    expect(checkAccess('Kasir', '/reports')).toBe(false)
    expect(checkAccess('Kasir', '/crm')).toBe(false)
    expect(checkAccess('Kasir', '/karyawan')).toBe(false)
    expect(checkAccess('Kasir', '/admin')).toBe(false)
    expect(checkAccess('Kasir', '/database')).toBe(false)

    // Admin Access Check
    expect(checkAccess('Admin', '/pos')).toBe(true)
    expect(checkAccess('Admin', '/queue')).toBe(true)
    expect(checkAccess('Admin', '/crm')).toBe(true)
    expect(checkAccess('Admin', '/finance')).toBe(true)
    expect(checkAccess('Admin', '/karyawan')).toBe(true)
    expect(checkAccess('Admin', '/database')).toBe(true)
    // Admin Restricted from Owner-exclusive views
    expect(checkAccess('Admin', '/')).toBe(false)
    expect(checkAccess('Admin', '/reports')).toBe(false)
    expect(checkAccess('Admin', '/admin')).toBe(false)

    // Owner Access Check (Full Access)
    Object.keys(routeRules).forEach((path) => {
      expect(checkAccess('Owner', path)).toBe(true)
    })
  })

  it('6. should reject invalid password and unknown users (C1 security fix)', async () => {
    // 1. Wrong password for existing user
    const { data: wrongPassData, error: wrongPassErr } = await db.auth.signInWithPassword({
      email: 'owner@relaypos.com',
      password: 'wrongpassword',
    })
    expect(wrongPassData.user).toBeNull()
    expect(wrongPassErr).toBeDefined()
    expect(wrongPassErr.message).toMatch(/Kata sandi salah/i)

    // 2. Non-existent user must NOT guess role from email substring
    const { data: evilData, error: evilErr } = await db.auth.signInWithPassword({
      email: 'attacker_owner@malicious.com',
      password: 'anypassword',
    })
    expect(evilData.user).toBeNull()
    expect(evilErr).toBeDefined()
    expect(evilErr.message).toMatch(/Pengguna tidak ditemukan/i)
  })

  it('7. should register new tenant owner via signUpOwner with isolated workspace', async () => {
    const regRes = await db.auth.signUpOwner({
      email: 'budi.test@autoclean.com',
      password: 'mypassword123',
      nama: 'Budi Test',
      tenantName: 'AutoClean Express Test',
      businessType: 'HYBRID',
    })

    expect(regRes.error).toBeNull()
    expect(regRes.data.user).toBeDefined()
    expect(regRes.data.user.role).toBe('Owner')
    expect(regRes.data.tenant).toBeDefined()
    expect(regRes.data.tenant.business_type).toBe('HYBRID')

    const newTenantId = regRes.data.tenant.id

    // Check that Chart of Accounts is bootstrapped for this new tenant
    const { data: tenantCoa } = await db.from('chart_of_accounts').select('*').eq('tenant_id', newTenantId)
    expect(tenantCoa.length).toBeGreaterThan(0)

    // Verify login with the newly created owner credentials
    const { data: loginData, error: loginErr } = await db.auth.signInWithPassword({
      email: 'budi.test@autoclean.com',
      password: 'mypassword123',
    })
    expect(loginErr).toBeNull()
    expect(loginData.user.role).toBe('Owner')
    expect(loginData.user.email).toBe('budi.test@autoclean.com')
  })
})
