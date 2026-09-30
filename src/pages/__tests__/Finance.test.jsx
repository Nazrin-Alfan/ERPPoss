import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import Finance from '../Finance.jsx'

// Mock Supabase Client
vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { total_income: 1000000, total_expense: 500000, total_balance: 500000 } })),
        order: vi.fn(() => ({
          range: vi.fn(() => Promise.resolve({
            data: [
              {
                id_cashflow: 'cf-1',
                tanggal: '2026-09-28',
                jenis: 'Pengeluaran Bersama',
                kategori: 'Listrik, Air & Utilitas',
                keterangan_transaksi: 'Listrik Toko',
                pos: 'SALDO CASH',
                pemasukan: 0,
                pengeluaran: 150000,
                created_at: '2026-09-28T10:00:00Z'
              }
            ]
          }))
        })),
        range: vi.fn(() => Promise.resolve({ data: [] }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    }))
  }
}))

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    activeTenant: {
      id: 'tenant-123',
      name: 'RelayPOS Outlet Pusat',
      business_type: 'CARWASH_CAFE'
    },
    user: { id: 'user-1' }
  })
}))

describe('Finance Page Component Tests', () => {
  it('TC_01: Renders Finance page without crashing and includes table sort & filter controls', () => {
    const html = renderToString(React.createElement(Finance))
    expect(html).toContain('Monitoring Keuangan')
    expect(html).toContain('Log Transaksi Cashflow')
    expect(html).toContain('Tanggal')
    expect(html).toContain('Nominal')
    expect(html).toContain('Semua Arus')
    expect(html).toContain('Semua Jenis')
    expect(html).toContain('Semua Kategori')
    expect(html).toContain('Total Kas Bersih (All-time)')
    expect(html).toContain('Laci Kasir (Cash Fisik)')
  })
})
