import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createDefaultAuthState, createMockSupabaseClient } from '../../../testUtils/renderPageHelper'

const mockState = vi.hoisted(() => ({
  auth: null
}))

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createPortal: (node) => node
  }
})

vi.mock('../../../supabaseClient', () => {
  const client = createMockSupabaseClient()
  return {
    supabase: client,
    default: client,
    isCloudBackend: false
  }
})

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockState.auth
}))

vi.mock('../../../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: true, theme: 'dark', toggleTheme: () => {} }),
  useAppTheme: () => ({
    resolvedMode: 'dark',
    isDark: true,
    toggleSurfaceMode: () => {}
  })
}))

import HybridPOSPage from '../HybridPOSPage'

describe('HybridPOSPage Carwash Manual Cart & Z-Index Hierarchy Contracts', () => {
  beforeEach(() => {
    mockState.auth = createDefaultAuthState()
  })

  it('TC_01 (INITIAL_EMPTY_CART): Does not render Carwash in Struk Belanja or show mobile sticky cart bar initially', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/pos']}>
        <HybridPOSPage />
      </MemoryRouter>
    )

    expect(html).toContain('Belum ada menu dipilih')
    expect(html).not.toContain('data-testid="mobile-sticky-cart-bar"')
    expect(html).not.toContain('Plat Belum Diisi')
  })

  it('TC_02 (NO_AUTO_CARWASH_ON_TAB_OR_TYPE): Does not auto-enable hasCarwash when switching to carwash tab or typing plate number', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/pos/HybridPOSPage.jsx'),
      'utf8'
    )

    expect(src).not.toMatch(/activeTab === 'carwash'[\s\S]{0,120}setHasCarwash\(true\)/)
    expect(src).not.toMatch(/platNomor:\s*val[\s\S]{0,120}setHasCarwash\(true\)/)
    expect(src).toContain('handleAddCarwashToCart')
    expect(src).toContain('handleRemoveCarwashFromCart')
    expect(src).toContain('data-testid="add-carwash-to-cart-btn"')
    expect(src).toContain('data-testid="remove-carwash-from-cart-btn"')
    expect(src).toContain('Isi plat nomor kendaraan terlebih dahulu')
  })

  it('TC_03 (Z_INDEX_HIERARCHY): Keeps POS header, sticky cart bar, and mobile cart drawer below Sidebar mobile nav / above chrome cleanly', () => {
    const posSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/pos/HybridPOSPage.jsx'),
      'utf8'
    )
    const sidebarSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/Sidebar.jsx'),
      'utf8'
    )
    const thermalSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/pos/ThermalReceiptModal.jsx'),
      'utf8'
    )

    // POS header stacks at z-[25] and wraps before xl so 640px-1023px does not crop tabs
    expect(posSrc).toContain('flex-col xl:flex-row xl:items-center justify-between gap-2.5 shrink-0 relative z-[25]')
    expect(posSrc).toContain('data-testid="mobile-sticky-cart-bar"')
    expect(posSrc).toContain('fixed bottom-20 left-3 right-3 z-20')
    expect(posSrc).toContain('z-[60] flex flex-col justify-end')

    // Sidebar portals mobile nav out of sticky header and stacks it at z-[45]/z-[48]
    expect(sidebarSrc).toContain('createPortal(mobileNavNode, portalRoot)')
    expect(sidebarSrc).toContain('z-[45]')
    expect(sidebarSrc).toContain('z-[48]')
    expect(thermalSrc).toContain('fixed inset-0 z-[70]')
  })
})
