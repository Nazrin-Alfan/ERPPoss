import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import CRM from '../CRM.jsx'

// Mock Supabase Client
vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [] }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    }))
  }
}))

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    activeTenant: {
      id: 'tenant-123',
      name: 'RelayPOS Demo Outlet'
    },
    user: { id: 'user-1' }
  })
}))

describe('CRM Page Component Tests', () => {
  it('TC_01: Renders CRM page without crashing and includes RFM metrics & loyalty controls', () => {
    const html = renderToString(React.createElement(CRM))

    // Headers & title
    expect(html).toContain('Manajemen Pelanggan &amp; CRM Terpadu')
    expect(html).toContain('Carwash &amp; Cafe Loyalty')
    expect(html).toContain('Atur Program Loyalty')

    // Bento summary metrics
    expect(html).toContain('Total Pelanggan')
    expect(html).toContain('Pelanggan Setia (VIP)')
    expect(html).toContain('Perlu Follow-Up')
    expect(html).toContain('Berisiko Churn')

    // Segment filter tabs
    expect(html).toContain('Semua')
    expect(html).toContain('VIP (≥5x)')
    expect(html).toContain('Reguler (3-4x)')
    expect(html).toContain('Baru (1x)')

    // Table headers
    expect(html).toContain('Plat / Nama Pelanggan')
    expect(html).toContain('Model &amp; Layanan Favorit')
    expect(html).toContain('Status RFM')
    expect(html).toContain('Loyalty Stamp')
    expect(html).toContain('Akumulasi Belanja')
    expect(html).toContain('Aksi Cepat')
  })
})
