import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import CustomSelect from '../CustomSelect.jsx'

describe('CustomSelect Component Tests', () => {
  const sampleOptions = [
    { value: 'cafe', label: 'Pengeluaran Cafe', badge: 'F&B' },
    { value: 'carwash', label: 'Pengeluaran Carwash', badge: 'CW' },
    { value: 'bersama', label: 'Pengeluaran Bersama', badge: 'ALL' }
  ]

  it('TC_01: Renders custom select trigger with current selected label and custom chevron icon', () => {
    const html = renderToString(
      React.createElement(CustomSelect, {
        value: 'cafe',
        options: sampleOptions,
        onChange: vi.fn(),
        variant: 'emerald'
      })
    )

    expect(html).toContain('Pengeluaran Cafe')
    expect(html).toContain('F&amp;B')
    // Memastikan tidak merender tag native <select> browser
    expect(html).not.toContain('<select')
    expect(html).not.toContain('<option')
  })

  it('TC_02: Renders placeholder when value is empty', () => {
    const html = renderToString(
      React.createElement(CustomSelect, {
        value: '',
        options: sampleOptions,
        placeholder: 'Pilih Kategori...',
        onChange: vi.fn()
      })
    )

    expect(html).toContain('Pilih Kategori...')
  })
})
