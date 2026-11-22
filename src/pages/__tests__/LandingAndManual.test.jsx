import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '../LandingPage'
import UserManualPage from '../UserManualPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    activeTenant: null,
    loading: false
  })
}))

describe('LandingPage & UserManualPage', () => {
  it('merender LandingPage baru dengan galeri screenshot asli dan tautan ke User Manual / Daftar Beta', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>
    )

    expect(html).toContain('RelayPOS')
    expect(html).toContain('/screenshots/pos-hybrid.png')
    expect(html).toContain('href="/login?mode=register"')
    expect(html).toContain('href="/panduan"')
    expect(html).toContain('Beta Publik Gratis 30 Hari')
    expect(html).toContain('POS Kasir Estafet')
    expect(html).toContain('Antrean Carwash')
    expect(html).toContain('Dashboard Eksekutif')
    expect(html).toContain('Laporan SAK EMKM')
    expect(html).toContain('CRM &amp; Payroll Kru')
  })

  it('merender halaman UserManualPage terpisah dengan 8 bab SOP, filter peran, dan tombol cetak', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/panduan']}>
        <UserManualPage />
      </MemoryRouter>
    )

    expect(html).toContain('Panduan Penggunaan')
    expect(html).toContain('Cetak / Simpan PDF')
    expect(html).toContain('Semua Peran')
    expect(html).toContain('Bab 1:')
    expect(html).toContain('Bab 4:')
    expect(html).toContain('Bab 8:')
    expect(html).toContain('/screenshots/carwash-queue.png')
    expect(html).toContain('/screenshots/finance-reports.png')
  })
})
