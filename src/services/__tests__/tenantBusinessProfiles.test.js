import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { getTenantFeatures, BUSINESS_TYPES } from '../../utils/businessCapabilities.js'
import { createCleanTenantPayload } from '../../utils/superAdminHelpers.js'
import { buildOrderReceiptData, generateWhatsAppReceiptMessage } from '../../utils/receiptHelpers.js'
import { localDbStore, localSupabase } from '../localDbEngine.js'

describe('Tenant Business Profile Feature Gating & Capability Matrix', () => {
  // 1. Matrix Uji Model Bisnis Tunggal: CAFE ONLY
  it('1. Model CAFE: hanya mengaktifkan fitur Cafe & Retail, menonaktifkan Carwash & Antrean', () => {
    const features = getTenantFeatures(BUSINESS_TYPES.CAFE)

    expect(features.businessType).toBe('CAFE')
    expect(features.isCafeOnly).toBe(true)
    expect(features.isCarwashOnly).toBe(false)
    expect(features.isHybrid).toBe(false)

    // Fitur Cafe Aktif
    expect(features.hasCafe).toBe(true)
    expect(features.hasMenuCatalog).toBe(true)
    expect(features.hasRecipeBOM).toBe(true)
    expect(features.hasCafeWarehouse).toBe(true)

    // Fitur Carwash & Layanan CRM Nonaktif
    expect(features.hasCarwash).toBe(false)
    expect(features.hasQueue).toBe(false)
    expect(features.hasPlateTracking).toBe(false)
    expect(features.hasCrewCommission).toBe(false)
    expect(features.hasCarwashPackages).toBe(false)
    expect(features.hasCarwashWarehouse).toBe(false)
    expect(features.hasCRM).toBe(false)

    // Fitur Umum Aktif
    expect(features.hasMerchandise).toBe(true)
    expect(features.hasRetailWarehouse).toBe(true)
    expect(features.hasFinanceCashflow).toBe(true)
    expect(features.hasDoubleEntryLedger).toBe(true)
  })

  // 2. Matrix Uji Model Bisnis Tunggal: CARWASH ONLY
  it('2. Model CARWASH: hanya mengaktifkan fitur Carwash & Antrean, menonaktifkan Cafe & BOM', () => {
    const features = getTenantFeatures(BUSINESS_TYPES.CARWASH)

    expect(features.businessType).toBe('CARWASH')
    expect(features.isCafeOnly).toBe(false)
    expect(features.isCarwashOnly).toBe(true)
    expect(features.isHybrid).toBe(false)

    // Fitur Carwash & CRM Aktif
    expect(features.hasCarwash).toBe(true)
    expect(features.hasQueue).toBe(true)
    expect(features.hasPlateTracking).toBe(true)
    expect(features.hasCrewCommission).toBe(true)
    expect(features.hasCarwashPackages).toBe(true)
    expect(features.hasCarwashWarehouse).toBe(true)
    expect(features.hasCRM).toBe(true)

    // Fitur Cafe Nonaktif
    expect(features.hasCafe).toBe(false)
    expect(features.hasMenuCatalog).toBe(false)
    expect(features.hasRecipeBOM).toBe(false)
    expect(features.hasCafeWarehouse).toBe(false)

    // Fitur Umum Aktif
    expect(features.hasMerchandise).toBe(true)
    expect(features.hasRetailWarehouse).toBe(true)
  })

  // 3. Matrix Uji Model Bisnis Gabungan: HYBRID (CARWASH + CAFE)
  it('3. Model HYBRID: mengaktifkan seluruh fitur Carwash, Cafe, Antrean, dan Estafet', () => {
    const features = getTenantFeatures(BUSINESS_TYPES.HYBRID)

    expect(features.businessType).toBe('HYBRID')
    expect(features.isCafeOnly).toBe(false)
    expect(features.isCarwashOnly).toBe(false)
    expect(features.isHybrid).toBe(true)

    // Seluruh Fitur Carwash & Cafe Aktif
    expect(features.hasCarwash).toBe(true)
    expect(features.hasQueue).toBe(true)
    expect(features.hasCafe).toBe(true)
    expect(features.hasMenuCatalog).toBe(true)
    expect(features.hasRecipeBOM).toBe(true)
    expect(features.hasCrewCommission).toBe(true)
    expect(features.hasCafeWarehouse).toBe(true)
    expect(features.hasCarwashWarehouse).toBe(true)
    expect(features.hasCRM).toBe(true)
  })

  // 4. Fallback Default bila Tipe Bisnis Kosong / Tidak Dikenal
  it('4. Fallback: mengembalikan HYBRID bila tipe bisnis null atau tidak valid', () => {
    const featuresEmpty = getTenantFeatures(null)
    expect(featuresEmpty.isHybrid).toBe(true)
    expect(featuresEmpty.hasCarwash).toBe(true)
    expect(featuresEmpty.hasCafe).toBe(true)

    const featuresUnknown = getTenantFeatures('UNKNOWN_TYPE')
    expect(featuresUnknown.isHybrid).toBe(true)
  })

  // 5. Verifikasi Isolasi Komponen & Modul untuk Tenant CAFE Murni
  it('5. Verifikasi modul terisolasi untuk Tenant CAFE Murni', () => {
    const cafeFeatures = getTenantFeatures('CAFE')

    // Rute & Fitur Terlarang untuk Cafe
    expect(cafeFeatures.hasQueue).toBe(false)
    expect(cafeFeatures.hasCRM).toBe(false)
    expect(cafeFeatures.hasCarwash).toBe(false)
    expect(cafeFeatures.hasCarwashWarehouse).toBe(false)

    // Simulasi filter tabel database untuk Cafe
    const allTables = ['carwash', 'cafe', 'struk', 'pengeluaran', 'cashflow', 'karyawan_cuci', 'stok_barang']
    const allowedTablesCafe = allTables.filter(tbl => {
      if (cafeFeatures.isCafeOnly) {
        return tbl !== 'carwash' && tbl !== 'karyawan_cuci'
      }
      return true
    })
    expect(allowedTablesCafe).not.toContain('carwash')
    expect(allowedTablesCafe).not.toContain('karyawan_cuci')
    expect(allowedTablesCafe).toContain('cafe')
    expect(allowedTablesCafe).toContain('struk')

    // Simulasi filter tab keuangan untuk Cafe
    const financeTabs = [
      { id: 'cashflow', visible: true },
      { id: 'carwash', visible: cafeFeatures.hasCarwash },
      { id: 'cafe', visible: cafeFeatures.hasCafe },
      { id: 'expenses', visible: true }
    ].filter(t => t.visible).map(t => t.id)
    expect(financeTabs).not.toContain('carwash')
    expect(financeTabs).toContain('cafe')
    expect(financeTabs).toContain('cashflow')
    expect(financeTabs).toContain('expenses')
  })

  // 6. Verifikasi Isolasi Komponen & Modul untuk Tenant CARWASH Murni
  it('6. Verifikasi modul terisolasi untuk Tenant CARWASH Murni', () => {
    const carwashFeatures = getTenantFeatures('CARWASH')

    // Rute & Fitur Terlarang untuk Carwash
    expect(carwashFeatures.hasCafe).toBe(false)
    expect(carwashFeatures.hasMenuCatalog).toBe(false)
    expect(carwashFeatures.hasRecipeBOM).toBe(false)
    expect(carwashFeatures.hasCafeWarehouse).toBe(false)

    // Fitur Wajib Carwash
    expect(carwashFeatures.hasQueue).toBe(true)
    expect(carwashFeatures.hasCRM).toBe(true)
    expect(carwashFeatures.hasCarwashWarehouse).toBe(true)

    // Simulasi filter tabel database untuk Carwash
    const allTables = ['carwash', 'cafe', 'struk', 'daftar_harga_menu', 'resep', 'stok_barang']
    const allowedTablesCarwash = allTables.filter(tbl => {
      if (carwashFeatures.isCarwashOnly) {
        return tbl !== 'cafe' && tbl !== 'daftar_harga_menu' && tbl !== 'resep'
      }
      return true
    })
    expect(allowedTablesCarwash).not.toContain('cafe')
    expect(allowedTablesCarwash).not.toContain('daftar_harga_menu')
    expect(allowedTablesCarwash).not.toContain('resep')
    expect(allowedTablesCarwash).toContain('carwash')
  })

  // 7. Celah 1 & 2: Struk Thermal & WhatsApp Receipt Adaptif (Bebas No. Polisi untuk Cafe)
  it('7. Struk Thermal & WhatsApp Receipt: order cafe murni bebas dari No. Polisi / Kendaraan', () => {
    const cafeOrder = {
      id_struk: 'ord-cafe-001',
      tanggal: '2026-09-27',
      jam: '10:00:00',
      kasir: 'BARISTA',
      no_meja: 'Meja 05',
      tipe_pesanan: 'DINE IN',
      total_tagihan: 35000,
      cafe: [
        { nama_menu: 'Caffe Latte', qty: 1, harga_satuan: 25000, subtotal: 25000 },
        { nama_menu: 'Butter Croissant', qty: 1, harga_satuan: 10000, subtotal: 10000 }
      ]
    }

    const receiptData = buildOrderReceiptData(cafeOrder)
    expect(receiptData.hasCarwash).toBe(false)
    expect(receiptData.plat).toBe('')
    expect(receiptData.model).toBe('')
    expect(receiptData.nomorMejaAntrean).toBe('Meja 05')

    const waMsg = generateWhatsAppReceiptMessage(receiptData, '081234567890')
    const waText = waMsg.message || waMsg.text || ''
    expect(waText).not.toContain('No. Polisi')
    expect(waText).not.toContain('Tipe Unit')
    expect(waText).toContain('Meja / Pesanan: *Meja 05*')
  })

  // 8. Celah 3: Seeding Onboarding Tenant Cafe Bersih Tanpa Paket Cuci
  it('8. Onboarding Tenant: tenant CAFE tidak menginjeksi paket carwash default', () => {
    const cafePayload = createCleanTenantPayload({
      storeName: 'Aroma Kopi Nusantara',
      ownerEmail: 'owner@aromakopi.com',
      ownerName: 'Owner Kopi',
      businessType: 'CAFE'
    })

    expect(cafePayload.tenant.business_type).toBe('CAFE')
    expect(cafePayload.initialPackages).toEqual([])

    const hybridPayload = createCleanTenantPayload({
      storeName: 'Kurnia Auto Lounge',
      ownerEmail: 'owner@kurnia.com',
      ownerName: 'Pak Kurnia',
      businessType: 'HYBRID'
    })
    expect(hybridPayload.tenant.business_type).toBe('HYBRID')
    expect(hybridPayload.initialPackages.length).toBeGreaterThan(0)
  })

  // 9. Celah 4: Lapisan Database Engine Mencegah Pelanggaran Model Tenant
  it('9. Database Engine Constraint: menolak insert carwash untuk tenant bertipe CAFE', async () => {
    localDbStore.resetDatabase()

    const mockCafeTenantId = 'tenant_cafe_testing_99'
    localDbStore.getTable('tenants').push({
      id: mockCafeTenantId,
      nama: 'Cafe Santai 99',
      business_type: 'CAFE'
    })

    const result = await localSupabase.from('carwash').insert({
      tenant_id: mockCafeTenantId,
      plat: 'BK 9999 XX',
      paket: 'CUCI SALJU',
      harga: 50000
    })

    expect(result.error).toBeDefined()
    expect(result.error.message).toContain('Constraint Violation')
    expect(result.data).toBeNull()
  })
})
