import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
const mode = vi.hoisted(() => ({ cloud: false }))
vi.mock('../../supabaseClient', () => ({ get isCloudBackend() { return mode.cloud } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ login: vi.fn(), registerTenantOwner: vi.fn(), loginWithGoogle: vi.fn() }) }))
vi.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ currentTheme: 'dark' }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
import Login from '../Login'

describe('Login backend-specific demo controls', () => {
  it('preserves role quick-login and demo password in local sandbox', () => {
    mode.cloud = false
    const html = renderToStaticMarkup(<Login />)
    expect(html).toContain('Akses Cepat Akun Role (Demo)')
    expect(html).toContain('Password akun demo:')
  })
  it('does not advertise local demo accounts on cloud login', () => {
    mode.cloud = true
    const html = renderToStaticMarkup(<Login />)
    expect(html).not.toContain('Akses Cepat Akun Role (Demo)')
    expect(html).not.toContain('Password akun demo:')
    expect(html).toContain('Lanjutkan dengan Google')
    expect(html).toContain('Masuk ke Sistem')
  })
})
