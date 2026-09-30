import { describe, it, expect } from 'vitest'
import {
  generateExecutiveAIPrompt,
  CONSULTATION_MODES,
  TIME_RANGE_OPTIONS
} from '../aiPromptGenerator'

describe('AI Executive Prompt Generator (Zero-Leakage, 4 Modes & Privacy)', () => {
  const baseData = {
    timeRangeLabel: 'Bulan Ini',
    overviewStats: {
      totalRevenue: 25000000,
      netProfit: 15000000,
      profitMargin: '60.0',
      totalLiquid: 30000000
    },
    financialAnalytics: {
      totalExpenses: 10000000
    },
    cfoHealth: {
      expenseRatio: '40.0',
      avgDailyOmzet: 833333
    },
    dailyCashierRecap: {
      totalCash: 12000000,
      totalNonCash: 13000000,
      totalOmzet: 25000000,
      totalTxCount: 150
    },
    criticalStockItems: [
      { nama_barang: 'Sirup Karamel', stok: 2, satuan: 'botol' }
    ]
  }

  describe('Configuration Exports', () => {
    it('should export 4 consultation modes and 4 time range options', () => {
      expect(CONSULTATION_MODES.length).toBe(4)
      expect(TIME_RANGE_OPTIONS.length).toBe(4)
    })
  })

  describe('Tenant CAFE - Strict Zero-Leakage', () => {
    it('should generate prompt without any carwash keywords', () => {
      const cafeData = {
        ...baseData,
        tenantBusinessType: 'CAFE',
        cafeAnalytics: {
          totalRevenue: 25000000,
          totalItems: 420,
          cafeAOV: 45000,
          cafeStrukCount: 150,
          topMenus: [{ nama: 'Kopi Susu Gula Aren', qty: 120, revenue: 3000000 }]
        }
      }

      const prompt = generateExecutiveAIPrompt(cafeData)

      // Strict Zero-Leakage assertion
      const lower = prompt.toLowerCase()
      expect(lower).not.toContain('cuci')
      expect(lower).not.toContain('mobil')
      expect(lower).not.toContain('plat nomor')
      expect(lower).not.toMatch(/\bbay\b/)
      expect(lower).not.toContain('kru cuci')
      expect(lower).not.toContain('kendaraan')

      // Must contain Cafe context
      expect(prompt).toContain('Cafe')
      expect(prompt).toContain('F&B')
      expect(prompt).toContain('Kopi Susu Gula Aren')
    })
  })

  describe('Tenant CARWASH - Strict Zero-Leakage', () => {
    it('should generate prompt without any cafe/F&B keywords', () => {
      const carwashData = {
        ...baseData,
        tenantBusinessType: 'CARWASH',
        carwashAnalytics: {
          totalRevenue: 25000000,
          totalUnits: 310,
          avgCarsPerDay: '10.3',
          carwashAOV: 80000,
          topModels: [{ model: 'Avanza', count: 45 }]
        }
      }

      const prompt = generateExecutiveAIPrompt(carwashData)

      // Strict Zero-Leakage assertion
      const lower = prompt.toLowerCase()
      expect(lower).not.toContain('makanan')
      expect(lower).not.toContain('minuman')
      expect(lower).not.toContain('barista')
      expect(lower).not.toContain('porsi')
      expect(lower).not.toContain('resep')
      expect(lower).not.toContain('meja makan')

      // Must contain Carwash context
      expect(prompt).toContain('Carwash')
      expect(prompt).toContain('Kendaraan')
      expect(prompt).toContain('Avanza')
    })
  })

  describe('Tenant HYBRID - The Relay Effect Synergy', () => {
    it('should generate prompt with cross-selling synergy analysis', () => {
      const hybridData = {
        ...baseData,
        tenantBusinessType: 'HYBRID',
        cafeAnalytics: {
          totalRevenue: 10000000,
          totalItems: 200,
          cafeAOV: 40000,
          cafeStrukCount: 100,
          topMenus: [{ nama: 'Americano', qty: 60, revenue: 1200000 }]
        },
        carwashAnalytics: {
          totalRevenue: 15000000,
          totalUnits: 250,
          avgCarsPerDay: '8.3',
          carwashAOV: 60000,
          topModels: [{ model: 'Innova', count: 35 }]
        },
        advancedKPIs: {
          crossConversionRate: '42.5',
          crossCount: 85,
          totalCarwashStruks: 200,
          combinedARPU: 125000,
          capacityEfficiency: '75.0'
        }
      }

      const prompt = generateExecutiveAIPrompt(hybridData)

      expect(prompt).toContain('Hybrid')
      expect(prompt).toContain('The Relay Effect')
      expect(prompt).toContain('42.5%')
      expect(prompt).toContain('Americano')
      expect(prompt).toContain('Innova')
    })
  })

  describe('4 Consultation Modes', () => {
    it('Mode 1: 360_HEALTH produces Business Health Score and SWOT prompt', () => {
      const prompt = generateExecutiveAIPrompt({
        ...baseData,
        consultationMode: '360_HEALTH'
      })
      expect(prompt).toContain('BUSINESS HEALTH SCORE')
      expect(prompt).toContain('SWOT ANALYSIS')
    })

    it('Mode 2: GROWTH_SALES produces Peak Hours and AOV growth prompt', () => {
      const prompt = generateExecutiveAIPrompt({
        ...baseData,
        consultationMode: 'GROWTH_SALES'
      })
      expect(prompt).toContain('PEAK HOURS')
      expect(prompt).toContain('AVERAGE ORDER VALUE')
    })

    it('Mode 3: CFO_AUDIT produces OPEX check and dividend/prive prompt', () => {
      const prompt = generateExecutiveAIPrompt({
        ...baseData,
        consultationMode: 'CFO_AUDIT'
      })
      expect(prompt).toContain('OPEX')
      expect(prompt).toContain('DIVIDEN / PRIVE')
    })

    it('Mode 4: PRODUCT_MENU produces BCG Matrix and Deadstock analysis prompt', () => {
      const prompt = generateExecutiveAIPrompt({
        ...baseData,
        consultationMode: 'PRODUCT_MENU'
      })
      expect(prompt).toContain('BCG MATRIX')
      expect(prompt).toContain('DEADSTOCK')
    })
  })

  describe('Privacy & Data Sanitization', () => {
    it('must sanitize any telephone numbers or private customer identifiers', () => {
      const sampleData = {
        ...baseData,
        tenantBusinessType: 'CAFE',
        cafeAnalytics: {
          totalRevenue: 25000000,
          totalItems: 420,
          cafeAOV: 45000,
          cafeStrukCount: 150,
          topMenus: []
        },
        rawPhoneTest: '081234567890',
        customerName: 'Budi Santoso'
      }

      const prompt = generateExecutiveAIPrompt(sampleData)

      expect(prompt).not.toContain('081234567890')
      expect(prompt).not.toContain('Budi Santoso')
    })
  })

  describe('Pragmatic Rating Support', () => {
    it('should gracefully handle empty or null rating without error', () => {
      const dataWithoutRating = {
        ...baseData,
        tenantBusinessType: 'CAFE',
        cafeAnalytics: {
          totalRevenue: 25000000,
          totalItems: 420,
          cafeAOV: 45000,
          cafeStrukCount: 150,
          topMenus: []
        },
        ratingSummary: null
      }

      expect(() => generateExecutiveAIPrompt(dataWithoutRating)).not.toThrow()
      const prompt = generateExecutiveAIPrompt(dataWithoutRating)
      expect(prompt).toBeTruthy()
    })
  })
})
