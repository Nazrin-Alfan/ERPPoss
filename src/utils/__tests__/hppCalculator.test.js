import { describe, it, expect } from 'vitest'
import {
  calculateIngredientCost,
  calculateMenuHpp,
  calculateMarginSimulation
} from '../hppCalculator'

describe('HPP Calculator Utility (TDD)', () => {
  const mockStock = [
    {
      id: 'stok-1',
      id_barang: 'BB-KOPI',
      id_bahan_baku: 'BB-KOPI',
      nama_produk: 'Biji Kopi House Blend',
      nama_bahan: 'Biji Kopi House Blend',
      satuan: 'kg',
      harga_satuan: 200000, // Rp 200.000 / kg -> Rp 200 / gram
      harga_beli: 200000
    },
    {
      id: 'stok-2',
      id_barang: 'BB-SUSU',
      id_bahan_baku: 'BB-SUSU',
      nama_produk: 'Susu Segar UHT',
      nama_bahan: 'Susu Segar UHT',
      satuan: 'liter',
      harga_satuan: 20000, // Rp 20.000 / liter -> Rp 20 / ml
      harga_beli: 20000
    },
    {
      id: 'stok-3',
      id_barang: 'BB-AREN',
      id_bahan_baku: 'BB-AREN',
      nama_produk: 'Gula Aren Cair',
      nama_bahan: 'Gula Aren Cair',
      satuan: 'ml',
      harga_satuan: 50, // Rp 50 / ml
      harga_beli: 50
    },
    {
      id: 'stok-4',
      id_barang: 'BB-CUP',
      id_bahan_baku: 'BB-CUP',
      nama_produk: 'Cup Plastik 16oz',
      nama_bahan: 'Cup Plastik 16oz',
      satuan: 'pcs',
      harga_satuan: 800,
      harga_beli: 800
    }
  ]

  describe('1. calculateIngredientCost', () => {
    it('mengonversi dari kg (stok) ke gram (resep) secara akurat', () => {
      const stock = mockStock[0] // 200.000 / kg
      const result = calculateIngredientCost(stock, 20, 'gram')
      expect(result.unitCost).toBe(200) // Rp 200 / gram
      expect(result.subtotalCost).toBe(4000) // 20 gram * 200 = 4.000
      expect(result.isStockPriceZero).toBe(false)
    })

    it('mengonversi dari liter (stok) ke ml (resep) secara akurat', () => {
      const stock = mockStock[1] // 20.000 / liter
      const result = calculateIngredientCost(stock, 150, 'ml')
      expect(result.unitCost).toBe(20) // Rp 20 / ml
      expect(result.subtotalCost).toBe(3000) // 150 ml * 20 = 3.000
    })

    it('menghitung satuan yang identik (pcs ke pcs)', () => {
      const stock = mockStock[3] // 800 / pcs
      const result = calculateIngredientCost(stock, 1, 'pcs')
      expect(result.unitCost).toBe(800)
      expect(result.subtotalCost).toBe(800)
    })

    it('mengembalikan 0 jika harga stok belum diisi', () => {
      const stock = { nama_produk: 'Air Mineral', satuan: 'liter', harga_satuan: 0 }
      const result = calculateIngredientCost(stock, 100, 'ml')
      expect(result.subtotalCost).toBe(0)
      expect(result.isStockPriceZero).toBe(true)
    })
  })

  describe('2. calculateMenuHpp', () => {
    it('menghitung total HPP bahan baku, kemasan, dan overhead secara komprehensif', () => {
      const recipe = [
        { nama_bahan: 'Biji Kopi House Blend', jumlah_dibutuhkan: 20, satuan: 'gram' }, // 4.000
        { nama_bahan: 'Susu Segar UHT', jumlah_dibutuhkan: 150, satuan: 'ml' }, // 3.000
        { nama_bahan: 'Gula Aren Cair', jumlah_dibutuhkan: 20, satuan: 'ml' } // 1.000
      ]

      const result = calculateMenuHpp({
        recipeList: recipe,
        stockItems: mockStock,
        packagingCost: 1500, // cup + sedotan
        overheadCost: 500 // es batu + listrik
      })

      expect(result.foodCost).toBe(8000) // 4000 + 3000 + 1000
      expect(result.packagingCost).toBe(1500)
      expect(result.overheadCost).toBe(500)
      expect(result.totalHpp).toBe(10000)
      expect(result.breakdown).toHaveLength(3)
      expect(result.breakdown[0].subtotalCost).toBe(4000)
    })
  })

  describe('3. calculateMarginSimulation', () => {
    it('menghitung gross profit, margin %, food cost %, dan margin status dengan benar', () => {
      const sim = calculateMarginSimulation({
        sellingPrice: 20000,
        totalHpp: 8000,
        targetMargin: 60
      })

      expect(sim.grossProfit).toBe(12000)
      expect(sim.marginPercent).toBe(60)
      expect(sim.foodCostPercent).toBe(40)
      expect(sim.marginStatus).toBe('HEALTHY')
    })

    it('memberikan rekomendasi harga jual berdasarkan target margin yang dibulatkan rapi', () => {
      // HPP = 10.000, Ingin Margin = 50% -> Harga = 10.000 / 0.5 = 20.000
      const sim50 = calculateMarginSimulation({
        sellingPrice: 0,
        totalHpp: 10000,
        targetMargin: 50
      })
      expect(sim50.recommendedPrice).toBe(20000)

      // HPP = 8.000, Ingin Margin = 60% -> Harga = 8.000 / 0.4 = 20.000
      const sim60 = calculateMarginSimulation({
        sellingPrice: 0,
        totalHpp: 8000,
        targetMargin: 60
      })
      expect(sim60.recommendedPrice).toBe(20000)
    })

    it('mendeteksi kerugian (LOSS) jika harga jual lebih rendah dari HPP', () => {
      const simLoss = calculateMarginSimulation({
        sellingPrice: 8000,
        totalHpp: 10000
      })
      expect(simLoss.grossProfit).toBe(-2000)
      expect(simLoss.marginStatus).toBe('LOSS')
    })
  })

  describe('Relasi ID stok_barang_id saat bahan baku di-rename', () => {
    it('tetap menghitung HPP menu menggunakan stok_barang_id walau nama_bahan pada resep belum sama persis', () => {
      const renamedStock = [
        {
          id: '11111111-1111-4111-8111-111111111111',
          id_barang: 'BB-KOPI',
          id_bahan_baku: 'BB-KOPI',
          nama_produk: 'Biji Kopi Arabica Single Origin (Renamed)',
          nama_bahan: 'Biji Kopi Arabica Single Origin (Renamed)',
          satuan: 'kg',
          harga_satuan: 250000,
          harga_beli: 250000,
        },
      ]
      const staleNameRecipe = [
        {
          stok_barang_id: '11111111-1111-4111-8111-111111111111',
          id_bahan_baku: 'BB-KOPI-LAMA',
          nama_bahan: 'Biji Kopi Nama Lama',
          jumlah_dibutuhkan: 20,
          satuan: 'gram',
        },
      ]

      const res = calculateMenuHpp({
        recipeList: staleNameRecipe,
        stockItems: renamedStock,
        packagingCost: 1000,
        overheadCost: 500,
      })

      // 250.000 / 1000gr = 250/gr * 20gr = 5.000 + 1.000 + 500 = 6.500
      expect(res.foodCost).toBe(5000)
      expect(res.totalHpp).toBe(6500)
      expect(res.breakdown).toHaveLength(1)
      expect(res.breakdown[0].isStockPriceZero).toBe(false)
    })
  })
})
