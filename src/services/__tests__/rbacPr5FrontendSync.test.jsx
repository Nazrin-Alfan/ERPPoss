import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  getRoleLandingRoute
} from '../../constants/roles.js'
import Gudang from '../../pages/Gudang.jsx'

let mockRole = ROLES.OWNER

// Mock Supabase Client
vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({
          data: [
            {
              id: 'item-1',
              id_barang: 'CF-01',
              nama_barang: 'Biji Kopi Arabika',
              kategori: 'Bahan Baku',
              satuan: 'Gram',
              stok: 500,
              min_stok: 100,
              harga_beli: 150,
              harga_jual: 0,
              gudang: 'CAFE'
            }
          ],
          error: null
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    }))
  }
}))

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    activeTenant: {
      id: 'tenant-qa',
      business_type: 'HYBRID',
      name: 'RelayPOS QA Outlet'
    },
    profile: {
      role: mockRole,
      nama: 'QA User'
    },
    user: { id: 'user-qa' }
  })
}))

describe('RBAC PR-5: Frontend Synchronization & Role Matrix Resolution', () => {
  describe('1. Centralized hasPermission Matrix', () => {
    it('TC_01: Correctly evaluates permissions across canonical roles', () => {
      // Owner
      expect(hasPermission(ROLES.OWNER, 'CAN_VIEW_REPORTS')).toBe(true)
      expect(hasPermission(ROLES.OWNER, 'CAN_VIEW_FINANCE')).toBe(true)
      expect(hasPermission(ROLES.OWNER, 'CAN_VIEW_INVENTORY_COST')).toBe(true)
      expect(hasPermission(ROLES.OWNER, 'CAN_OPNAME_INVENTORY')).toBe(true)
      expect(hasPermission(ROLES.OWNER, 'CAN_MANAGE_INVENTORY')).toBe(true)
      expect(hasPermission(ROLES.OWNER, 'CAN_ACCESS_POS')).toBe(true)

      // Admin
      expect(hasPermission(ROLES.ADMIN, 'CAN_VIEW_FINANCE')).toBe(true)
      expect(hasPermission(ROLES.ADMIN, 'CAN_VIEW_INVENTORY_COST')).toBe(true)
      expect(hasPermission(ROLES.ADMIN, 'CAN_OPNAME_INVENTORY')).toBe(true)
      expect(hasPermission(ROLES.ADMIN, 'CAN_MANAGE_INVENTORY')).toBe(true)
      expect(hasPermission(ROLES.ADMIN, 'CAN_ACCESS_POS')).toBe(true)
      expect(hasPermission(ROLES.ADMIN, 'CAN_VIEW_REPORTS')).toBe(false)
      expect(hasPermission(ROLES.ADMIN, 'CAN_VIEW_CONSOLIDATION')).toBe(false)

      // Kasir (Strictly restricted from HPP / cost, restock, opname, and finance)
      expect(hasPermission(ROLES.KASIR, 'CAN_ACCESS_POS')).toBe(true)
      expect(hasPermission(ROLES.KASIR, 'CAN_ACCESS_QUEUE')).toBe(true)
      expect(hasPermission(ROLES.KASIR, 'CAN_VIEW_INVENTORY_STOCK')).toBe(true)
      expect(hasPermission(ROLES.KASIR, 'CAN_VIEW_INVENTORY_COST')).toBe(false)
      expect(hasPermission(ROLES.KASIR, 'CAN_MANAGE_INVENTORY')).toBe(false)
      expect(hasPermission(ROLES.KASIR, 'CAN_OPNAME_INVENTORY')).toBe(false)
      expect(hasPermission(ROLES.KASIR, 'CAN_VIEW_FINANCE')).toBe(false)
      expect(hasPermission(ROLES.KASIR, 'CAN_VIEW_REPORTS')).toBe(false)

      // Staff Kantor (Purchasing / Inventory Restock, but no POS or Opname)
      expect(hasPermission(ROLES.STAFF_KANTOR, 'CAN_VIEW_INVENTORY_STOCK')).toBe(true)
      expect(hasPermission(ROLES.STAFF_KANTOR, 'CAN_VIEW_INVENTORY_COST')).toBe(true)
      expect(hasPermission(ROLES.STAFF_KANTOR, 'CAN_MANAGE_INVENTORY')).toBe(true)
      expect(hasPermission(ROLES.STAFF_KANTOR, 'CAN_OPNAME_INVENTORY')).toBe(false)
      expect(hasPermission(ROLES.STAFF_KANTOR, 'CAN_ACCESS_POS')).toBe(false)

      // Karyawan Cuci (Queue only, no inventory or finance)
      expect(hasPermission(ROLES.KARYAWAN_CUCI, 'CAN_ACCESS_QUEUE')).toBe(true)
      expect(hasPermission(ROLES.KARYAWAN_CUCI, 'CAN_ACCESS_POS')).toBe(false)
      expect(hasPermission(ROLES.KARYAWAN_CUCI, 'CAN_VIEW_INVENTORY_STOCK')).toBe(false)

      // Unknown / Invalid permission returns false safely
      expect(hasPermission(ROLES.OWNER, 'NON_EXISTENT_PERMISSION')).toBe(false)
      expect(hasPermission(null, 'CAN_ACCESS_POS')).toBe(false)
    })
  })

  describe('2. Safe Landing Route Dispatcher (getRoleLandingRoute)', () => {
    it('TC_02: Returns accurate, loop-free landing routes for each role', () => {
      // Super Admin -> /founder
      expect(getRoleLandingRoute(ROLES.SUPER_ADMIN)).toBe('/founder')

      // Owner with multi-tenant -> /konsolidasi
      expect(getRoleLandingRoute(ROLES.OWNER, { tenantCount: 3 })).toBe('/konsolidasi')

      // Owner with single tenant -> /dashboard
      expect(getRoleLandingRoute(ROLES.OWNER, { tenantCount: 1 })).toBe('/dashboard')

      // Staff Kantor -> /gudang
      expect(getRoleLandingRoute(ROLES.STAFF_KANTOR)).toBe('/gudang')

      // Karyawan Cuci (with carwash queue feature) -> /queue
      expect(getRoleLandingRoute(ROLES.KARYAWAN_CUCI, { hasQueue: true })).toBe('/queue')

      // Karyawan Cuci (with or without carwash queue) -> always /queue (avoids /pos redirect loop)
      expect(getRoleLandingRoute(ROLES.KARYAWAN_CUCI, { hasQueue: false })).toBe('/queue')

      // Kasir & Admin -> /pos
      expect(getRoleLandingRoute(ROLES.KASIR)).toBe('/pos')
      expect(getRoleLandingRoute(ROLES.ADMIN)).toBe('/pos')

      // Default fallback
      expect(getRoleLandingRoute('UnknownRole')).toBe('/pos')
    })
  })

  describe('3. Consistency between App Routes and Sidebar Navigation', () => {
    it('TC_03: Verifies ROLE_PERMISSIONS mappings cover all critical operational modules', () => {
      expect(ROLE_PERMISSIONS.CAN_ACCESS_POS).toContain(ROLES.KASIR)
      expect(ROLE_PERMISSIONS.CAN_ACCESS_POS).toContain(ROLES.ADMIN)
      expect(ROLE_PERMISSIONS.CAN_ACCESS_POS).toContain(ROLES.OWNER)

      expect(ROLE_PERMISSIONS.CAN_VIEW_FINANCE).not.toContain(ROLES.KASIR)
      expect(ROLE_PERMISSIONS.CAN_VIEW_REPORTS).toEqual([ROLES.OWNER])

      expect(ROLE_PERMISSIONS.CAN_MANAGE_INVENTORY).not.toContain(ROLES.KASIR)
      expect(ROLE_PERMISSIONS.CAN_OPNAME_INVENTORY).not.toContain(ROLES.KASIR)
      expect(ROLE_PERMISSIONS.CAN_VIEW_INVENTORY_COST).not.toContain(ROLES.KASIR)
    })
  })

  describe('4. Gudang.jsx UI Component RBAC Rendering', () => {
    it('TC_04: Owner sees Tambah Barang, Total Nilai Inventori, and HPP columns', () => {
      mockRole = ROLES.OWNER
      const html = renderToString(React.createElement(Gudang))
      expect(html).toContain('Tambah Barang')
      expect(html).toContain('Total Nilai Inventori')
      expect(html).toContain('ESTIMASI HPP')
      expect(html).toContain('TOTAL NILAI ASET')
    })

    it('TC_05: Kasir is restricted from Tambah Barang, HPP valuation, and direct row mutations', () => {
      mockRole = ROLES.KASIR
      const html = renderToString(React.createElement(Gudang))
      expect(html).not.toContain('Tambah Barang')
      expect(html).not.toContain('Total Nilai Inventori')
      expect(html).toContain('Akses Terbatas Kasir')
      expect(html).not.toContain('ESTIMASI HPP')
      expect(html).not.toContain('TOTAL NILAI ASET')
      expect(html).not.toContain('Sesuaikan Stok Fisik (Opname)')
    })
  })
})
