import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import MenuHppCalculator from '../MenuHppCalculator'
import { formatRupiah } from '../../../utils/helpers'

describe('MenuHppCalculator Component (SSR Test)', () => {
  const mockStok = [
    {
      nama_produk: 'Biji Kopi House Blend',
      nama_bahan: 'Biji Kopi House Blend',
      satuan: 'kg',
      harga_satuan: 200000
    },
    {
      nama_produk: 'Susu Segar UHT',
      nama_bahan: 'Susu Segar UHT',
      satuan: 'liter',
      harga_satuan: 20000
    }
  ]

  const mockRecipe = [
    { nama_bahan: 'Biji Kopi House Blend', jumlah_dibutuhkan: 20, satuan: 'gram' }, // 4000
    { nama_bahan: 'Susu Segar UHT', jumlah_dibutuhkan: 150, satuan: 'ml' } // 3000
  ]

  it('merender tombol toggle kalkulator dan ringkasan HPP resep awal', () => {
    const html = renderToString(
      React.createElement(MenuHppCalculator, {
        menuRecipe: mockRecipe,
        stokBahan: mockStok,
        sellingPrice: 20000,
        onApplyPrice: vi.fn(),
        initialOpen: false
      })
    )

    expect(html).toContain('Kalkulator HPP &amp; Margin')
    expect(html).toContain('Buka Kalkulator')
    expect(html).toContain('HPP Resep:')
    expect(html).toContain(formatRupiah(7000))
  })

  it('merender panel kalkulator saat initialOpen true dengan rincian biaya dan rekomendasi harga', () => {
    const html = renderToString(
      React.createElement(MenuHppCalculator, {
        menuRecipe: mockRecipe,
        stokBahan: mockStok,
        sellingPrice: 20000,
        onApplyPrice: vi.fn(),
        initialOpen: true
      })
    )

    expect(html).toContain('Tutup')
    expect(html).toContain('Biaya Bahan Baku (Food Cost)')
    expect(html).toContain('Simulasi Rekomendasi Harga Jual')
    expect(html).toContain('Terapkan Harga')
    expect(html).toContain('Estimasi Laba Kotor per Porsi')
  })
})
