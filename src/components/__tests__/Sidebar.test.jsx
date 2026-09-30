import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from '../Sidebar.jsx'

// Mock AuthContext & ThemeContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      nama: 'Nazrin Aliansyah',
      role: 'Owner'
    },
    logout: vi.fn()
  })
}))

vi.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({
    activeThemeId: 'theme_emerald',
    currentTheme: {
      id: 'theme_emerald',
      name: 'Default Emerald',
      brandName: 'RelayPOS Enterprise',
      subText: 'Multi-Tenant SaaS',
      logo: '/logo.png'
    },
    changeTheme: vi.fn()
  }),
  themes: {
    theme_emerald: {
      id: 'theme_emerald',
      name: 'Default Emerald',
      logo: '/logo.png'
    }
  }
}))

describe('Sidebar UI/UX Component & Interactive Profile Menu Test', () => {
  it('TC_01: Renders expanded sidebar with interactive profile trigger and all navigation sections', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(Sidebar, {
          isCollapsed: false,
          setIsCollapsed: vi.fn()
        })
      )
    )

    // Verify brand and header
    expect(html).toContain('RELAYPOS')
    expect(html).toContain('Nazrin Aliansyah')
    expect(html).toContain('Owner')

    // Verify scrollable area and navigation items
    expect(html).toContain('Dashboard')
    expect(html).toContain('Kasir POS')
    expect(html).toContain('Antrean Carwash')
    expect(html).toContain('Pelanggan &amp; CRM')
    expect(html).toContain('Buku Kas Keuangan')
    expect(html).toContain('Laporan Akuntansi')
    expect(html).toContain('Karyawan &amp; Komisi')
    expect(html).toContain('Database Master')
    expect(html).toContain('Kelola Admin')
    // Verify profile trigger button has title for account/logout
    expect(html).toContain('Klik profil')
    expect(html).toContain('overflow-y-auto')

    // Verify Console Founder is NOT accessible / visible for Owner role
    expect(html).not.toContain('Console Founder')
  })

  it('TC_02: Renders collapsed sidebar with proper compact profile trigger and collapse classes', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(Sidebar, {
          isCollapsed: true,
          setIsCollapsed: vi.fn()
        })
      )
    )

    expect(html).toContain('w-[72px]')
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('Nazrin Aliansyah (Owner) - Klik untuk Keluar')
  })
})
