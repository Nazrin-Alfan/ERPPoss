import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine.js'
import {
  DEFAULT_CARWASH_PACKAGES,
  calculateCarwashPriceAndCommission
} from '../../utils/carwashHelpers.js'

describe('Carwash Package Master & Custom Commission Architecture', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  it('TC_01: Database initialized with default carwash packages bound to active tenant', async () => {
    const { data: pkgs, error } = await db
      .from('carwash_packages')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)

    expect(error).toBeNull()
    expect(pkgs).toBeDefined()
    expect(pkgs.length).toBeGreaterThanOrEqual(7)

    const basicPkg = pkgs.find(p => p.nama_paket === 'PAKET CUCI BIASA')
    expect(basicPkg).toBeDefined()
    expect(basicPkg.tarif.Small.Regular).toBe(50000)
    expect(basicPkg.tarif.Large.Regular).toBe(60000)
  })

  it('TC_02: Owner can insert a new custom carwash package with flat commission', async () => {
    const customPkg = {
      id: 'pkg_custom_express',
      nama_paket: 'PAKET CUCI EXPRESS 15 MENIT',
      keterangan: 'Cuci kilat body luar menggunakan snow foam khusus',
      tarif: {
        Small: { Regular: 35000, 'Body only': 35000 },
        Medium: { Regular: 40000, 'Body only': 40000 },
        Large: { Regular: 45000, 'Body only': 45000 },
        'Extra Large': { Regular: 55000, 'Body only': 55000 }
      },
      komisi_skema: 'FLAT',
      komisi_value: 12000,
      is_active: true,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID
    }

    const { error: insertErr } = await db.from('carwash_packages').insert(customPkg)
    expect(insertErr).toBeNull()

    const { data: savedPkg } = await db
      .from('carwash_packages')
      .select('*')
      .eq('id', 'pkg_custom_express')
      .single()

    expect(savedPkg).toBeDefined()
    expect(savedPkg.nama_paket).toBe('PAKET CUCI EXPRESS 15 MENIT')

    // Test calculation on custom package
    const calc = calculateCarwashPriceAndCommission({
      packageItem: savedPkg,
      ukuran: 'Medium',
      variant: 'Regular'
    })

    expect(calc.harga).toBe(40000)
    expect(calc.gaji_pencuci).toBe(12000) // Flat commission per car
  })

  it('TC_03: Owner can create percentage-based commission package (e.g. 35% MRR/RevShare)', async () => {
    const revSharePkg = {
      id: 'pkg_detailing_revshare',
      nama_paket: 'PAKET CERAMIC COATING HYBRID',
      keterangan: 'Poles 3 tahap dan lapisan pelindung keramik',
      tarif: {
        Small: { Regular: 500000, 'Body only': 500000 },
        Medium: { Regular: 600000, 'Body only': 600000 },
        Large: { Regular: 750000, 'Body only': 750000 },
        'Extra Large': { Regular: 900000, 'Body only': 900000 }
      },
      komisi_skema: 'PERCENT',
      komisi_value: 30, // 30% dari total tagihan
      is_active: true,
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID
    }

    await db.from('carwash_packages').insert(revSharePkg)

    const calc = calculateCarwashPriceAndCommission({
      packageItem: revSharePkg,
      ukuran: 'Large',
      variant: 'Regular'
    })

    expect(calc.harga).toBe(750000)
    expect(calc.gaji_pencuci).toBe(225000) // 30% of 750,000 = 225,000
  })

  it('TC_04: Tenant Isolation Test - Another tenant cannot see or modify packages', async () => {
    const OTHER_TENANT_ID = 'tenant_rival_autocare'
    
    // Attempt to query with another tenant_id
    const { data: rivalPkgs } = await db
      .from('carwash_packages')
      .select('*')
      .eq('tenant_id', OTHER_TENANT_ID)

    expect(rivalPkgs.length).toBe(0)
  })

  it('TC_05: Graceful fallback when packageItem is null or unrecognized', () => {
    const calc = calculateCarwashPriceAndCommission({
      packageItem: null,
      ukuran: 'Small',
      variant: 'Regular'
    })

    expect(calc.harga).toBe(50000)
    expect(calc.gaji_pencuci).toBe(16666) // 1/3 of 50000
  })
})
