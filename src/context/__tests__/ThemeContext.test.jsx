import { describe, it, expect } from 'vitest'
import {
  DARK_DEFAULT_ROUTES,
  MIGRATED_LIGHT_ROUTES,
  resolveSurfaceMode,
  themes
} from '../ThemeContext.jsx'

describe('Phase 3: Dual-Mode ThemeContext & Strangler-Fig Safety', () => {
  it('resolves /pos, /founder, /super-admin, and /database to Pure Carbon Dark D1 in auto mode', () => {
    for (const route of DARK_DEFAULT_ROUTES) {
      expect(resolveSurfaceMode(route, 'auto')).toBe('dark')
    }
    expect(resolveSurfaceMode('/pos', 'auto')).toBe('dark')
    expect(resolveSurfaceMode('/founder', 'auto')).toBe('dark')
    expect(resolveSurfaceMode('/super-admin', 'auto')).toBe('dark')
    expect(resolveSurfaceMode('/database', 'auto')).toBe('dark')
  })

  it('resolves migrated routes in MIGRATED_LIGHT_ROUTES to light mode in auto mode', () => {
    for (const route of MIGRATED_LIGHT_ROUTES) {
      expect(resolveSurfaceMode(route, 'auto')).toBe('light')
    }
    expect(resolveSurfaceMode('/', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/welcome', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/panduan', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/manual', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/login', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/forgot-password', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/reset-password', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/dashboard', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/queue', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/finance', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/reports', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/gudang', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/inventory', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/karyawan', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/crm', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/admin', 'auto')).toBe('light')
    expect(resolveSurfaceMode('/konsolidasi', 'auto')).toBe('light')
  })

  it('defaults fallback routes to Fintech Cobalt Light once Phase 4 migration is complete', () => {
    expect(resolveSurfaceMode('/unknown-route', 'auto')).toBe('light')
  })

  it('respects explicit user light or dark preference override regardless of route', () => {
    expect(resolveSurfaceMode('/finance', 'light')).toBe('light')
    expect(resolveSurfaceMode('/pos', 'light')).toBe('light')
    expect(resolveSurfaceMode('/dashboard', 'dark')).toBe('dark')
    expect(resolveSurfaceMode('/ui-kit', 'dark')).toBe('dark')
  })

  it('ships Fintech Cobalt Blue & Pure Carbon D1 presets free of legacy neon cyan or purple hex tokens', () => {
    const serialized = JSON.stringify(themes)
    expect(serialized).toContain('#2563EB')
    expect(serialized).toContain('#F4F6FA')
    expect(serialized).toContain('#09090B')
    expect(serialized).not.toMatch(/#00ffff|#c8f31d|#6366f1|#c084fc/i)
  })
})
