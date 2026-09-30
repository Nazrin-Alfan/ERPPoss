import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import LicenseManager from '../LicenseManager.jsx'

describe('LicenseManager SSR Render Component Test', () => {
  it('TC_01: Renders license manager without runtime exception', () => {
    const mockLicense = {
      id: 'lic_test_1',
      tenant_id: 'tenant_jb_enterprise',
      license_key: 'RLPOS-PRO-2026-TEST-KEY1',
      tier: 'PRO_ANNUAL',
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    }

    const html = renderToString(
      React.createElement(LicenseManager, {
        licenseData: mockLicense,
        storeName: 'Carwash & Cafe Sejahtera'
      })
    )

    expect(html).toContain('Status Lisensi')
    expect(html).toContain('RLPOS-PRO-2026-TEST-KEY1')
    expect(html).toContain('WhatsApp')
    expect(html).toContain('Rekening Pembayaran Pengembang')
  })
})
