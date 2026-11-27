import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from '../Sidebar.jsx'

const mockAuthState = {
  profile: {
    nama: 'Nazrin Aliansyah',
    role: 'Owner'
  },
  activeTenant: {
    id: 'tenant-1',
    nama: 'RelayPOS Sudirman',
    business_type: 'HYBRID'
  },
  logout: vi.fn()
}

// Mock AuthContext & ThemeContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState
}))

vi.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({
    activeThemeId: 'theme_emerald',
    resolvedMode: 'light',
    toggleSurfaceMode: vi.fn(),
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
  beforeEach(() => {
    mockAuthState.profile = {
      nama: 'Nazrin Aliansyah',
      role: 'Owner'
    }
    mockAuthState.activeTenant = {
      id: 'tenant-1',
      nama: 'RelayPOS Sudirman',
      business_type: 'HYBRID'
    }
  })

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
    expect(html).toContain('AI Data Studio')
    expect(html).toContain('Kasir POS')
    expect(html).toContain('Antrean Carwash')
    expect(html).toContain('Pelanggan &amp; CRM')
    expect(html).toContain('Buku Kas Keuangan')
    expect(html).toContain('Laporan Akuntansi')
    expect(html).toContain('Karyawan &amp; Komisi')
    // Verify Database Master & Console Founder are NOT accessible / visible for normal Owner role (Protected)
    expect(html).not.toContain('Database Master')
    expect(html).not.toContain('Console Founder')
    expect(html).toContain('Pengaturan Toko')
    // Verify profile trigger button has title for account/logout
    expect(html).toContain('Klik profil')
    expect(html).toContain('overflow-y-auto')
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

  it('TC_03 (MOBILE_BOTTOM_NAV): Renders 5-slot mobile bottom navigation bar for Owner (Home, POS, Antrean, Kas, Menu)', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard'] },
        React.createElement(Sidebar, {
          isCollapsed: false,
          setIsCollapsed: vi.fn()
        })
      )
    )

    expect(html).toContain('data-testid="mobile-bottom-nav"')
    expect(html).toContain('data-testid="mobile-bottom-nav-menu"')
    expect(html).toContain('>Home<')
    expect(html).toContain('>POS<')
    expect(html).toContain('>Antrean<')
    expect(html).toContain('>Kas<')
    expect(html).toContain('>Menu<')
  })

  it('TC_04 (SECURITY_RBAC_MOBILE_NAV): Enforces Kasir role restriction on mobile bottom nav (omits Home/Dashboard & Kas/Finance)', () => {
    mockAuthState.profile = {
      nama: 'Rina Kasir',
      role: 'Kasir'
    }

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/pos'] },
        React.createElement(Sidebar, {
          isCollapsed: false,
          setIsCollapsed: vi.fn()
        })
      )
    )

    const mobileNavSegment = html.split('data-testid="mobile-bottom-nav"')[1]?.split('</nav>')[0] || ''
    expect(mobileNavSegment).toContain('href="/pos"')
    expect(mobileNavSegment).toContain('href="/queue"')
    expect(mobileNavSegment).toContain('data-testid="mobile-bottom-nav-menu"')
    expect(mobileNavSegment).not.toContain('href="/dashboard"')
    expect(mobileNavSegment).not.toContain('href="/ai-studio"')
    expect(mobileNavSegment).not.toContain('href="/finance"')
  })
})
