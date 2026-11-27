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

  it('merender panel kalkulator saat initialOpen true dengan switcher 2 mode dan rekomendasi harga', () => {
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
    expect(html).toContain('Hitung Margin Otomatis')
    expect(html).toContain('Terapkan Harga')
    expect(html).not.toContain('Tentukan Harga Jual (Rp)')
  })

  it('merender panel Hitung Margin Otomatis saat mode custom_price aktif (termasuk saat harga awal 0)', () => {
    const htmlWithPrice = renderToString(
      React.createElement(MenuHppCalculator, {
        menuRecipe: mockRecipe,
        stokBahan: mockStok,
        sellingPrice: 20000,
        onApplyPrice: vi.fn(),
        initialOpen: true,
        initialSimMode: 'custom_price'
      })
    )

    expect(htmlWithPrice).toContain('Tentukan Harga Jual (Rp)')
    expect(htmlWithPrice).toContain('Margin Keuntungan:')
    expect(htmlWithPrice).toContain('Estimasi Laba Kotor per Porsi:')
    expect(htmlWithPrice).toContain('65%')
    expect(htmlWithPrice).toContain(formatRupiah(13000))
    expect(htmlWithPrice).not.toContain('Terapkan Harga')

    const htmlZero = renderToString(
      React.createElement(MenuHppCalculator, {
        menuRecipe: mockRecipe,
        stokBahan: mockStok,
        sellingPrice: 0,
        onApplyPrice: vi.fn(),
        initialOpen: true,
        initialSimMode: 'custom_price'
      })
    )

    expect(htmlZero).toContain('Tentukan Harga Jual (Rp)')
    expect(htmlZero).toContain('0%')
  })
})
