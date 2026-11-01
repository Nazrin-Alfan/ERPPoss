import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import LicenseExpiredLockout from '../LicenseExpiredLockout.jsx'
import ActivateLicenseModal from '../ActivateLicenseModal.jsx'
import * as AuthContextModule from '../../../context/AuthContext'

describe('LicenseExpiredLockout & Trial Gate Suite', () => {
  it('TC_01: should render lockout screen with activation form when user is Owner', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user_owner_1' },
      profile: { role: 'Owner', nama: 'Owner Toko' },
      activeTenant: { id: 'tenant_trial_123', nama: 'Kopi Kenangan' },
      licenseStatus: {
        status: 'EXPIRED',
        isExpired: true,
        daysRemaining: 0,
        valid_until: '2026-10-01T00:00:00.000Z'
      },
      activateLicenseKey: vi.fn(),
      logout: vi.fn()
    })

    const html = renderToString(React.createElement(LicenseExpiredLockout))

    expect(html).toContain('Masa Uji Coba 14 Hari Telah Berakhir')
    expect(html).toContain('Kopi Kenangan')
    expect(html).toContain('tenant_trial_123')
    expect(html).toContain('Masukkan Serial Key Lisensi Resmi')
    expect(html).toContain('Aktivasi &amp; Buka Sistem')
    expect(html).toContain('Hubungi Founder via WhatsApp')
  })

  it('TC_02: should render informational notice without activation form when user is Kasir', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'user_kasir_1' },
      profile: { role: 'Kasir', nama: 'Budi Kasir' },
      activeTenant: { id: 'tenant_trial_123', nama: 'Kopi Kenangan' },
      licenseStatus: {
        status: 'EXPIRED',
        isExpired: true,
        daysRemaining: 0
      },
      activateLicenseKey: vi.fn(),
      logout: vi.fn()
    })

    const html = renderToString(React.createElement(LicenseExpiredLockout))

    expect(html).toContain('Masa Uji Coba 14 Hari Telah Berakhir')
    expect(html).toContain('Perhatian untuk Staf / Kasir')
    expect(html).toContain('Harap hubungi')
    expect(html).not.toContain('Masukkan Serial Key Lisensi Resmi')
  })

  it('TC_03: should render ActivateLicenseModal with serial key input and WhatsApp CTA', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      activeTenant: { id: 'tenant_trial_123', nama: 'Kopi Kenangan' },
      licenseStatus: {
        status: 'ACTIVE',
        isTrial: true,
        daysRemaining: 12
      },
      activateLicenseKey: vi.fn()
    })

    const html = renderToString(
      React.createElement(ActivateLicenseModal, {
        isOpen: true,
        onClose: vi.fn()
      })
    )

    expect(html).toContain('Aktivasi Lisensi Resmi')
    expect(html).toContain('Serial Key Lisensi Toko')
    expect(html).toContain('Terapkan Kunci')
    expect(html).toContain('Hubungi Founder di WhatsApp')
  })

  it('TC_04: should return null when ActivateLicenseModal isOpen is false', () => {
    const html = renderToString(
      React.createElement(ActivateLicenseModal, {
        isOpen: false,
        onClose: vi.fn()
      })
    )

    expect(html).toBe('')
  })
})
