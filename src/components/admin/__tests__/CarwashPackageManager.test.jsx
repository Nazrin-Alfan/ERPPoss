import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import CarwashPackageManager, {
  isUniformCarwashTarif,
  MAX_CARWASH_PACKAGE_NAME_LENGTH
} from '../CarwashPackageManager'
import { formatRupiah } from '../../../utils/helpers'

describe('CarwashPackageManager Flat-Rate & Matrix Tests', () => {
  const flatTarif = {
    Small: { Regular: 65000, 'Body only': 65000 },
    Medium: { Regular: 65000, 'Body only': 65000 },
    Large: { Regular: 65000, 'Body only': 65000 },
    'Extra Large': { Regular: 65000, 'Body only': 65000 }
  }

  const matrixTarif = {
    Small: { Regular: 50000, 'Body only': 35000 },
    Medium: { Regular: 55000, 'Body only': 40000 },
    Large: { Regular: 60000, 'Body only': 45000 },
    'Extra Large': { Regular: 80000, 'Body only': 80000 }
  }

  it('defines MAX_CARWASH_PACKAGE_NAME_LENGTH = 32 and wraps long package titles safely', () => {
    expect(MAX_CARWASH_PACKAGE_NAME_LENGTH).toBe(32)
    const html = renderToString(
      React.createElement(CarwashPackageManager, {
        packages: [
          {
            id: 'pkg-long',
            nama_paket: 'PAKET DAUN TALAS (CUCI + WAX KACA SUPER PANJANG)',
            tarif: matrixTarif,
            is_active: true
          }
        ],
        resepList: [],
        stokBahan: [],
        onSavePackage: vi.fn(),
        onDeletePackage: vi.fn(),
        onToggleActive: vi.fn()
      })
    )
    expect(html).toContain('break-words')
    expect(html).toContain('PAKET DAUN TALAS')
  })

  it('isUniformCarwashTarif detects flat vs matrix tariffs accurately', () => {
    expect(isUniformCarwashTarif(flatTarif)).toBe(true)
    expect(isUniformCarwashTarif(matrixTarif)).toBe(false)
    expect(isUniformCarwashTarif(null)).toBe(false)
  })

  it('renders flat-rate summary for uniform package and matrix table for tiered package', () => {
    const html = renderToString(
      React.createElement(CarwashPackageManager, {
        packages: [
          { id: 'pkg-flat', nama_paket: 'CUCI KILAT FLAT', tarif: flatTarif, is_active: true },
          { id: 'pkg-matrix', nama_paket: 'CUCI REGULER MATRIKS', tarif: matrixTarif, is_active: true }
        ],
        resepList: [],
        stokBahan: [],
        onSavePackage: vi.fn(),
        onDeletePackage: vi.fn(),
        onToggleActive: vi.fn()
      })
    )

    expect(html).toContain('Tarif Flat Semua Kendaraan')
    expect(html).toContain(formatRupiah(65000))
    expect(html).toContain('CUCI REGULER MATRIKS')
    expect(html).toContain('Extra Large')
  })
})
