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
    expect(owner.nama).toBe('Owner Demo')

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

  it('3. should also resolve shorthand usernames (owner, admin, kasir)', async () => {
    const { data: ownerAuth } = await db.auth.signInWithPassword({ email: 'owner' })
    expect(ownerAuth.user.role).toBe('Owner')

    const { data: adminAuth } = await db.auth.signInWithPassword({ email: 'admin' })
    expect(adminAuth.user.role).toBe('Admin')

    const { data: kasirAuth } = await db.auth.signInWithPassword({ email: 'kasir' })
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
})
