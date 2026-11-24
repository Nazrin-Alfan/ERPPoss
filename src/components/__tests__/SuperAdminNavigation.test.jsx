import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const mockAuthState = {
  profile: { nama: 'Nazrin', role: 'Super Admin' },
  activeTenant: { id: 'tenant-1', nama: 'Jaya Bersama Carwash', business_type: 'HYBRID' },
  userTenants: [],
  licenseStatus: { isTrial: false, isActive: true },
  switchTenant: vi.fn(),
  logout: vi.fn()
}

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuthState
}))

vi.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({
    currentTheme: { brandName: 'RelayPOS Enterprise' }
  })
}))

import ExecutiveLayout from '../layout/ExecutiveLayout.jsx'
import Sidebar from '../Sidebar.jsx'

describe('Super Admin Navigation to Founder Console Suite', () => {
  beforeEach(() => {
    mockAuthState.profile = { nama: 'Nazrin', role: 'Super Admin' }
  })

  it('TC_01 (HAPPY_PATH): ExecutiveLayout displays Console Founder button and Super Admin role badge for Super Admin', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/konsolidasi'] },
        React.createElement(ExecutiveLayout, null, React.createElement('div', null, 'HQ'))
      )
    )

    expect(html).toContain('href="/founder"')
    expect(html).toContain('Console Founder')
    expect(html).toContain('Super Admin')
  })

  it('TC_02 (SECURITY_TENANT_BREACH): ExecutiveLayout hides Console Founder button for regular Owner role', () => {
    mockAuthState.profile = { nama: 'Owner Toko', role: 'Owner' }

    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/konsolidasi'] },
        React.createElement(ExecutiveLayout, null, React.createElement('div', null, 'HQ'))
      )
    )

    expect(html).not.toContain('href="/founder"')
    expect(html).not.toContain('Console Founder')
    expect(html).toContain('Owner')
  })

  it('TC_03 (REGRESSION): Sidebar renders top quick-bridge button to /founder in both expanded and collapsed modes for Super Admin', () => {
    const expandedHtml = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard'] },
        React.createElement(Sidebar, { isCollapsed: false, setIsCollapsed: vi.fn() })
      )
    )
    const collapsedHtml = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard'] },
        React.createElement(Sidebar, { isCollapsed: true, setIsCollapsed: vi.fn() })
      )
    )

    expect(expandedHtml).toContain('data-testid="founder-quick-bridge"')
    expect(expandedHtml).toContain('href="/founder"')
    expect(collapsedHtml).toContain('data-testid="founder-quick-bridge"')
    expect(collapsedHtml).toContain('href="/founder"')
  })
})
