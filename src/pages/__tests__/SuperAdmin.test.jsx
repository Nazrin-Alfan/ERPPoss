import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import SuperAdmin from '../SuperAdmin.jsx'

describe('SuperAdmin Page SSR Render Component Test', () => {
  it('TC_01: Renders SuperAdmin platform console without runtime crash', () => {
    const html = renderToString(React.createElement(SuperAdmin))
    expect(html).toContain('RelayPOS Founder Console (Super Admin)')
    expect(html).toContain('Daftarkan Tenant / Toko Baru')
    expect(html).toContain('Direktori Klien &amp; Status Lisensi')
  })
})
