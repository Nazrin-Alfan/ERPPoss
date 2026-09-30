import { describe, it, expect } from 'vitest'
import { calculateROI, PRICING_TIERS, HOURLY_LABOR_RATE_IDR } from '../promoHelpers'

describe('Promo & ROI Helpers Test Suite', () => {
  describe('calculateROI', () => {
    it('calculates exact monthly and annual savings with standard inputs', () => {
      const result = calculateROI({
        monthlyRevenue: 50000000,
        wastePercent: 5,
        hoursSavedDaily: 2
      })

      // 5% of 50.000.000 = 2.500.000
      expect(result.monthlyWasteSavings).toBe(2500000)
      // 2 hours * 30 days = 60 hours
      expect(result.monthlyHoursSaved).toBe(60)
      // 60 hours * 25.000 = 1.500.000
      expect(result.monthlyLaborSavings).toBe(1500000)
      // Total monthly = 2.500.000 + 1.500.000 = 4.000.000
      expect(result.totalMonthlySavings).toBe(4000000)
      // Annual = 4.000.000 * 12 = 48.000.000
      expect(result.totalAnnualSavings).toBe(48000000)
      // Net benefit against Pro plan (399.000) = 4.000.000 - 399.000 = 3.601.000
      expect(result.netMonthlyBenefit).toBe(3601000)
      // Multiplier = 4.000.000 / 399.000 = ~10.0x
      expect(result.roiMultiplier).toBe(10)
    })

    it('handles zero or negative inputs gracefully without crashing', () => {
      const result = calculateROI({
        monthlyRevenue: -1000,
        wastePercent: -5,
        hoursSavedDaily: -2
      })

      expect(result.monthlyWasteSavings).toBe(0)
      expect(result.monthlyHoursSaved).toBe(0)
      expect(result.totalMonthlySavings).toBe(0)
      expect(result.totalAnnualSavings).toBe(0)
    })

    it('caps percentage and hours to realistic maximum thresholds', () => {
      const result = calculateROI({
        monthlyRevenue: 100000000,
        wastePercent: 99, // Should be clamped to max 50%
        hoursSavedDaily: 48 // Should be clamped to max 24 hours
      })

      expect(result.monthlyWasteSavings).toBe(50000000)
      expect(result.monthlyHoursSaved).toBe(24 * 30)
    })
  })

  describe('PRICING_TIERS', () => {
    it('provides all 3 core tiers with discount on annual cycle', () => {
      expect(PRICING_TIERS.starter).toBeDefined()
      expect(PRICING_TIERS.pro).toBeDefined()
      expect(PRICING_TIERS.ultimate).toBeDefined()

      // Verify annual monthly price is less than regular monthly price
      expect(PRICING_TIERS.starter.annualMonthlyPrice).toBeLessThan(PRICING_TIERS.starter.monthlyPrice)
      expect(PRICING_TIERS.pro.annualMonthlyPrice).toBeLessThan(PRICING_TIERS.pro.monthlyPrice)
      expect(PRICING_TIERS.ultimate.annualMonthlyPrice).toBeLessThan(PRICING_TIERS.ultimate.monthlyPrice)
    })

    it('marks pro plan as recommended with complete feature set', () => {
      expect(PRICING_TIERS.pro.recommended).toBe(true)
      expect(PRICING_TIERS.pro.features.length).toBeGreaterThan(6)
    })
  })
})
