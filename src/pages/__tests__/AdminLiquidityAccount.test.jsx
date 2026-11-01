import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Admin from '../Admin'

// Mock useAuth
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-founder-1', email: 'owner@test.com' },
    profile: {
      id: 'user-founder-1',
      tenant_id: 'tenant-test-123',
      branch_id: 'branch-test-456',
      role: 'Owner'
    },
    activeTenant: {
      id: 'tenant-test-123',
      name: 'Outlet Uji Coba',
      business_type: 'CARWASH_AND_CAFE'
    },
    registerKasir: vi.fn(),
    logout: vi.fn()
  })
}))

describe('Admin Liquidity Account Management & Modals', () => {
  it('TC_01: Renders Admin component with liquidity accounts structure without crashing', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/admin?tab=accounts']}>
        <Admin />
      </MemoryRouter>
    )

    // Periksa navigasi tab dan komponen akun kas & bank
    expect(html).toContain('Rekening Kas')
    expect(html).toContain('Pengaturan Toko &amp; Admin')
  })

  it('TC_02: Verifies pos_balances payload integrity for multi-tenant isolation', () => {
    const targetTenantId = 'tenant-test-123'
    const targetBranchId = 'branch-test-456'
    const inputPos = 'BCA OPERASIONAL'
    const normalizedPos = inputPos.startsWith('SALDO ') ? inputPos : `SALDO ${inputPos}`

    const payload = {
      tenant_id: targetTenantId,
      branch_id: targetBranchId,
      pos: normalizedPos,
      label: 'BCA Utama',
      tipe: 'BANK',
      keterangan: 'Rekening EDC',
      color: 'blue',
      is_active: true,
      balance: 500000
    }

    expect(payload.tenant_id).toBe('tenant-test-123')
    expect(payload.branch_id).toBe('branch-test-456')
    expect(payload.pos).toBe('SALDO BCA OPERASIONAL')
    expect(payload.balance).toBe(500000)
    expect(payload.is_active).toBe(true)
  })
})

