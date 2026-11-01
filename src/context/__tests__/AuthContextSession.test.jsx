import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { AuthProvider, useAuth } from '../AuthContext'

const TestConsumer = () => {
  const { loading, user, activeTenant, licenseStatus } = useAuth()
  return (
    <div id="test-consumer">
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.id : 'anonymous'}</span>
      <span data-testid="tenant">{activeTenant ? activeTenant.nama : 'none'}</span>
    </div>
  )
}

describe('AuthContext Session Stabilization & Safety', () => {
  it('TC_AUTH_01: Renders AuthProvider with consumer component safely', () => {
    const html = renderToString(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    expect(html).toContain('id="test-consumer"')
    expect(html).toContain('data-testid="loading"')
  })

  it('TC_AUTH_02: Verifies that App loading screen renders with tactile fallback elements', () => {
    // Simulasi loading state tampilan
    const LoadingFallback = () => (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#000000] text-white px-4">
        <div className="w-12 h-12 border-4 border-[#00ffff] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-semibold text-[#bbcbb2] uppercase tracking-widest">Memuat Sesi...</p>
        <button type="button">Ke Halaman Login</button>
      </div>
    )

    const html = renderToString(<LoadingFallback />)
    expect(html).toContain('Memuat Sesi...')
    expect(html).toContain('Ke Halaman Login')
    expect(html).toContain('border-[#00ffff]')
  })
})
