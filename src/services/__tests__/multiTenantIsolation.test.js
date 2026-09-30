import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createLocalClient,
  DEFAULT_TENANT_ID,
  setActiveTenantId,
  getActiveTenantId
} from '../localDbEngine'

describe('Multi-Tenant Row-Level Security (RLS) & Zero Cross-Contamination Test', () => {
  let db
  const TENANT_A = DEFAULT_TENANT_ID // 'tenant_jb_enterprise'
  const TENANT_B = 'tenant_cafe_senja_02'
  const TENANT_C = 'tenant_autocare_kilat_03'

  beforeEach(() => {
    setActiveTenantId(TENANT_A)
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  afterEach(() => {
    setActiveTenantId(DEFAULT_TENANT_ID)
  })

  it('TC_MT_01: Transaksi di Tenant A tidak bocor ke Tenant B', async () => {
    // 1. Catat transaksi di Tenant A
    setActiveTenantId(TENANT_A)
    const { data: strukA } = await db.from('struk').insert({
      id_struk: 'STRUK-TENANT-A-001',
      total_tagihan: 150000,
      metode_bayar: 'CASH',
      status_bayar: 'Selesai',
      tanggal: '2026-09-25'
    })
    expect(strukA.tenant_id).toBe(TENANT_A)

    // 2. Query dari sudut pandang Tenant A
    const { data: listA } = await db.from('struk').select('*')
    expect(listA.some(s => s.id_struk === 'STRUK-TENANT-A-001')).toBe(true)

    // 3. Pindah konteks ke Tenant B
    setActiveTenantId(TENANT_B)

    // 4. Query dari sudut pandang Tenant B: STRUK-TENANT-A-001 TIDAK BOLEH MUNCUL!
    const { data: listB } = await db.from('struk').select('*')
    expect(listB.some(s => s.id_struk === 'STRUK-TENANT-A-001')).toBe(false)
  })

  it('TC_MT_02: Transaksi di Tenant B tidak bocor ke Tenant A atau Tenant C', async () => {
    // 1. Pindah ke Tenant B dan catat transaksi
    setActiveTenantId(TENANT_B)
    const { data: strukB } = await db.from('struk').insert({
      id_struk: 'STRUK-TENANT-B-999',
      total_tagihan: 75000,
      metode_bayar: 'QRIS',
      status_bayar: 'Selesai',
      tanggal: '2026-09-25'
    })
    expect(strukB.tenant_id).toBe(TENANT_B)

    // 2. Query Tenant B: transaksi ada
    const { data: listB } = await db.from('struk').select('*')
    expect(listB.some(s => s.id_struk === 'STRUK-TENANT-B-999')).toBe(true)

    // 3. Kembali ke Tenant A: STRUK-TENANT-B-999 TIDAK BOLEH MUNCUL!
    setActiveTenantId(TENANT_A)
    const { data: listA } = await db.from('struk').select('*')
    expect(listA.some(s => s.id_struk === 'STRUK-TENANT-B-999')).toBe(false)

    // 4. Masuk ke Tenant C: STRUK-TENANT-B-999 TIDAK BOLEH MUNCUL!
    setActiveTenantId(TENANT_C)
    const { data: listC } = await db.from('struk').select('*')
    expect(listC.some(s => s.id_struk === 'STRUK-TENANT-B-999')).toBe(false)
  })

  it('TC_MT_03: Tenant baru memiliki 0 transaksi (kosong bersih) tapi memiliki master data siap pakai', async () => {
    // Masuk ke Tenant C yang baru dibuat
    setActiveTenantId(TENANT_C)

    // Transaksi harus 0 (bersih)
    const { data: strukList } = await db.from('struk').select('*')
    expect(strukList.length).toBe(0)

    const { data: carwashList } = await db.from('carwash').select('*')
    expect(carwashList.length).toBe(0)

    const { data: cashflowList } = await db.from('cashflow').select('*')
    expect(cashflowList.length).toBe(0)

    // Master data dasar harus otomatis ter-provision
    const { data: kasirList } = await db.from('kasir').select('*')
    expect(kasirList.length).toBeGreaterThan(0)
    expect(kasirList.every(k => k.tenant_id === TENANT_C)).toBe(true)

    const { data: paymentMethods } = await db.from('metode_bayar').select('*')
    expect(paymentMethods.length).toBeGreaterThan(0)
    expect(paymentMethods.every(m => m.tenant_id === TENANT_C)).toBe(true)

    const { data: balances } = await db.from('pos_balances').select('*')
    expect(balances.length).toBeGreaterThan(0)
    expect(balances.every(b => b.tenant_id === TENANT_C)).toBe(true)
  })

  it('TC_MT_04: Mutasi dan cashflow di Tenant B terisolasi secara finansial', async () => {
    setActiveTenantId(TENANT_B)

    // Insert pengeluaran di Tenant B
    await db.from('pengeluaran').insert({
      id_pengeluaran: 'EXP-B-01',
      nominal: 50000,
      nama_pengeluaran: 'Beli Sabun Cuci Tangan',
      jenis: 'Pengeluaran Cafe',
      kategori: 'Operasional Cafe',
      tanggal: '2026-09-25'
    })

    // Cek cashflow Tenant B
    const { data: cfB } = await db.from('cashflow').select('*')
    expect(cfB.some(c => c.id_sumber === 'EXP-B-01')).toBe(true)
    expect(cfB.every(c => c.tenant_id === TENANT_B)).toBe(true)

    // Cek cashflow Tenant A: EXP-B-01 TIDAK BOLEH ADA!
    setActiveTenantId(TENANT_A)
    const { data: cfA } = await db.from('cashflow').select('*')
    expect(cfA.some(c => c.id_sumber === 'EXP-B-01')).toBe(false)
  })
})
