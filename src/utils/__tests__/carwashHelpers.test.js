import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CARWASH_PACKAGES,
  calculateCarwashPriceAndCommission
} from '../carwashHelpers'

describe('carwashHelpers', () => {
  it('should calculate standard tiered commission for basic wash', () => {
    const basicPkg = DEFAULT_CARWASH_PACKAGES[0] // PAKET CUCI BIASA
    const res = calculateCarwashPriceAndCommission({
      packageItem: basicPkg,
      ukuran: 'Medium',
      variant: 'Regular'
    })

    expect(res.harga).toBe(55000)
    // 1/3 of 55000 = 18333, treatment = 0
    expect(res.gaji_pencuci).toBe(18333)
  })

  it('should calculate tiered commission for premium treatment packages', () => {
    const kacaPkg = DEFAULT_CARWASH_PACKAGES[1] // PAKET KACA BENING
    const res = calculateCarwashPriceAndCommission({
      packageItem: kacaPkg,
      ukuran: 'Small',
      variant: 'Regular'
    })

    expect(res.harga).toBe(150000)
    // washPortion = 50000 -> 16666
    // treatment = 150000 - 50000 = 100000 -> 50000
    // total = 66666
    expect(res.gaji_pencuci).toBe(16666 + 50000)
  })

  it('should support percentage-based commission scheme (PERCENT)', () => {
    const customPkg = {
      nama_paket: 'PAKET PROMO MERDEKA',
      tarif: {
        Medium: { Regular: 100000 }
      },
      komisi_skema: 'PERCENT',
      komisi_value: 35 // 35%
    }

    const res = calculateCarwashPriceAndCommission({
      packageItem: customPkg,
      ukuran: 'Medium',
      variant: 'Regular'
    })

    expect(res.harga).toBe(100000)
    expect(res.gaji_pencuci).toBe(35000)
  })

  it('should support flat nominal commission scheme (FLAT)', () => {
    const customPkg = {
      nama_paket: 'PAKET CUCI KILAT',
      tarif: {
        Small: { Regular: 45000 }
      },
      komisi_skema: 'FLAT',
      komisi_value: 12000
    }

    const res = calculateCarwashPriceAndCommission({
      packageItem: customPkg,
      ukuran: 'Small',
      variant: 'Regular'
    })

    expect(res.harga).toBe(45000)
    expect(res.gaji_pencuci).toBe(12000)
  })

  it('should handle custom price for Custom vehicle size', () => {
    const basicPkg = DEFAULT_CARWASH_PACKAGES[0]
    const res = calculateCarwashPriceAndCommission({
      packageItem: basicPkg,
      ukuran: 'Custom',
      variant: 'Regular',
      customHarga: 120000
    })

    expect(res.harga).toBe(120000)
    expect(res.gaji_pencuci).toBeGreaterThan(0)
  })
})
