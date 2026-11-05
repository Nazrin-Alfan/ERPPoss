import { describe, it, expect } from 'vitest'
import { ROLES, isManagement, isCashier, isOwnerOrSuperAdmin } from '../../constants/roles.js'

describe('PR-1 Access Control Matrix & Contract Alignment', () => {
  it('defines the 6 canonical system roles according to the audit specification', () => {
    expect(ROLES.SUPER_ADMIN).toBe('Super Admin')
    expect(ROLES.OWNER).toBe('Owner')
    expect(ROLES.ADMIN).toBe('Admin')
    expect(ROLES.KASIR).toBe('Kasir')
    expect(ROLES.STAFF_KANTOR).toBe('Staff Kantor')
    expect(ROLES.KARYAWAN_CUCI).toBe('Karyawan Cuci')
  })

  it('correctly classifies management roles (Super Admin, Owner, Admin)', () => {
    expect(isManagement(ROLES.SUPER_ADMIN)).toBe(true)
    expect(isManagement(ROLES.OWNER)).toBe(true)
    expect(isManagement(ROLES.ADMIN)).toBe(true)
    expect(isManagement(ROLES.KASIR)).toBe(false)
    expect(isManagement(ROLES.STAFF_KANTOR)).toBe(false)
    expect(isManagement(ROLES.KARYAWAN_CUCI)).toBe(false)
  })

  it('correctly classifies cashier role', () => {
    expect(isCashier(ROLES.KASIR)).toBe(true)
    expect(isCashier(ROLES.OWNER)).toBe(false)
    expect(isCashier(ROLES.ADMIN)).toBe(false)
  })

  it('correctly classifies owner or super admin', () => {
    expect(isOwnerOrSuperAdmin(ROLES.OWNER)).toBe(true)
    expect(isOwnerOrSuperAdmin(ROLES.SUPER_ADMIN)).toBe(true)
    expect(isOwnerOrSuperAdmin(ROLES.KASIR)).toBe(false)
    expect(isOwnerOrSuperAdmin(ROLES.STAFF_KANTOR)).toBe(false)
  })
})
