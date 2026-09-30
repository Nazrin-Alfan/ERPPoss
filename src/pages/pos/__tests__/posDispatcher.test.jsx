import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { POSDispatcher } from '../POSDispatcher.jsx'

// Mock sub-komponen agar fokus menguji keputusan routing dispatcher
vi.mock('../CafePOSPage.jsx', () => ({
  default: () => <div data-testid="cafe-pos-view">Murni Kasir Cafe F&B</div>
}))

vi.mock('../CarwashPOSPage.jsx', () => ({
  default: () => <div data-testid="carwash-pos-view">Murni Kasir Carwash Intake</div>
}))

vi.mock('../HybridPOSPage.jsx', () => ({
  default: () => <div data-testid="hybrid-pos-view">Kasir Estafet Hybrid</div>
}))

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('../../../context/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth()
}))

describe('TDD: POSDispatcher Component Routing', () => {
  it('harus me-render CafePOSPage jika business_type === "CAFE"', () => {
    mockUseAuth.mockReturnValue({
      activeTenant: { id: 't-cafe-1', name: 'Kopi Kenangan', business_type: 'CAFE' }
    })

    const html = renderToString(<POSDispatcher />)
    expect(html).toContain('data-testid="cafe-pos-view"')
    expect(html).not.toContain('data-testid="carwash-pos-view"')
    expect(html).not.toContain('data-testid="hybrid-pos-view"')
  })

  it('harus me-render CarwashPOSPage jika business_type === "CARWASH"', () => {
    mockUseAuth.mockReturnValue({
      activeTenant: { id: 't-cw-1', name: 'Auto Clean', business_type: 'CARWASH' }
    })

    const html = renderToString(<POSDispatcher />)
    expect(html).toContain('data-testid="carwash-pos-view"')
    expect(html).not.toContain('data-testid="cafe-pos-view"')
    expect(html).not.toContain('data-testid="hybrid-pos-view"')
  })

  it('harus me-render HybridPOSPage jika business_type === "HYBRID" atau default', () => {
    mockUseAuth.mockReturnValue({
      activeTenant: { id: 't-hy-1', name: 'RelayPOS Flagship', business_type: 'HYBRID' }
    })

    const html = renderToString(<POSDispatcher />)
    expect(html).toContain('data-testid="hybrid-pos-view"')
    expect(html).not.toContain('data-testid="cafe-pos-view"')
    expect(html).not.toContain('data-testid="carwash-pos-view"')
  })
})
