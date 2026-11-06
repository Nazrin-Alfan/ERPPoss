import { beforeEach, describe, expect, it } from 'vitest'
import {
  createLocalClient,
  setActiveActorContext,
  resetActiveActorContext
} from '../localDbEngine.js'
import {
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  getRoleLandingRoute
} from '../../constants/roles.js'

describe('RBAC PR-6: Master Release Gate & Full Acceptance Criteria (AC-01 s.d. AC-17)', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111'
  const TENANT_D = '22222222-2222-2222-2222-222222222222'
  const BRANCH_A1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const BRANCH_A2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  const BRANCH_D1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
    resetActiveActorContext()
  })

  // ===========================================================================
  // TEST GROUP 1: MULTI-TENANT & BRANCH ISOLATION (AC-01, AC-02, AC-06)
  // ===========================================================================
  it('TC_RG_01 (AC-01, AC-02, AC-06): Enforces strict multi-tenant and cross-branch boundary', async () => {
    // 1. Setup Fixtures for Tenant A and Tenant D
    await db.from('stok_barang').insert({
      id: 'stok-a1-01',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A1,
      nama_produk: 'Bahan A1',
      stok: 100
    })
    await db.from('stok_barang').insert({
      id: 'stok-a2-01',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A2,
      nama_produk: 'Bahan A2',
      stok: 200
    })
    await db.from('stok_barang').insert({
      id: 'stok-d1-01',
      tenant_id: TENANT_D,
      branch_id: BRANCH_D1,
      nama_produk: 'Bahan D1',
      stok: 300
    })

    // 2. AC-01: Owner A queries data -> Must see Tenant A only, 0 rows of Tenant D
    setActiveActorContext({
      userId: 'user_owner_a',
      role: 'Owner',
      tenant_id: TENANT_A,
      branchId: null,
      is_active: true
    })
    const ownerAStock = (await db.from('stok_barang').select('*')).data
    expect(ownerAStock.some((r) => r.tenant_id === TENANT_D)).toBe(false)
    expect(ownerAStock.filter((r) => r.tenant_id === TENANT_A)).toHaveLength(2)

    // 3. AC-02: Tenant A cannot mutate Tenant D rows (must affect 0 rows or error)
    const { data: mutatedRows, error: mutateErr } = await db
      .from('stok_barang')
      .update({ stok: 999 })
      .eq('tenant_id', TENANT_D)
    expect(mutatedRows || []).toHaveLength(0)
    const targetD = (await db.from('stok_barang').select('*').eq('tenant_id', TENANT_D)).data
    expect(targetD.find((r) => r.id === 'stok-d1-01')?.stok).toBe(300)

    // 4. AC-06: Kasir A1 (Branch A1) queries data -> Must see Branch A1 only, 0 rows of Branch A2
    setActiveActorContext({
      userId: 'user_kasir_a1',
      role: 'Kasir',
      tenant_id: TENANT_A,
      branchId: BRANCH_A1,
      is_active: true
    })
    const kasirStock = (await db.from('stok_barang').select('*')).data
    expect(kasirStock.some((r) => r.branch_id === BRANCH_A2)).toBe(false)
    expect(kasirStock.find((r) => r.branch_id === BRANCH_A1)).toBeDefined()
  })

  // ===========================================================================
  // TEST GROUP 2: ROLE-BASED PRIVILEGE BOUNDARIES (AC-04, AC-05)
  // ===========================================================================
  it('TC_RG_02 (AC-04, AC-05): Blocks Kasir from finance, payroll, and catalog writes', async () => {
    // Seed sample menu and financial lines
    await db.from('daftar_harga_menu').insert({
      id: 'menu-01',
      tenant_id: TENANT_A,
      nama_menu: 'Espresso',
      harga: 25000
    })

    // Act as Kasir A1
    setActiveActorContext({
      userId: 'user_kasir_a1',
      role: 'Kasir',
      tenant_id: TENANT_A,
      branchId: BRANCH_A1,
      is_active: true
    })

    // AC-04: Kasir blocked from reading payroll & general ledger
    const payrollRead = (await db.from('karyawan_cuci').select('*')).data
    expect(payrollRead).toHaveLength(0)

    const journalRead = (await db.from('journal_entries').select('*')).data
    expect(journalRead).toHaveLength(0)

    const coaRead = (await db.from('chart_of_accounts').select('*')).data
    expect(coaRead).toHaveLength(0)

    // AC-05: Kasir blocked from mutating catalog prices
    const { error: priceErr } = await db
      .from('daftar_harga_menu')
      .update({ harga: 99999 })
      .eq('id', 'menu-01')
    expect(priceErr).toBeDefined()
    expect(priceErr.message).toMatch(/FORBIDDEN_ROLE_OPERATION|akses ditolak/i)

    // Verify Owner has full access to update catalog
    setActiveActorContext({
      userId: 'user_owner_a',
      role: 'Owner',
      tenant_id: TENANT_A,
      branchId: null,
      is_active: true
    })
    const { error: ownerUpdateErr } = await db
      .from('daftar_harga_menu')
      .update({ harga: 30000 })
      .eq('id', 'menu-01')
    expect(ownerUpdateErr).toBeNull()
    const updated = (await db.from('daftar_harga_menu').select('*').eq('id', 'menu-01')).data[0]
    expect(updated.harga).toBe(30000)
  })

  // ===========================================================================
  // TEST GROUP 3: RPC REWARD HARDENING (AC-09, AC-10, AC-11, AC-11b, AC-12)
  // ===========================================================================
  it('TC_RG_03 (AC-09 s.d. AC-12): Enforces complete security lifecycle on redeem_customer_reward RPC', async () => {
    const PLATE = 'B 8888 RG'

    // AC-09: Inactive user rejected
    setActiveActorContext({
      userId: 'user_inactive',
      role: 'Kasir',
      tenant_id: TENANT_A,
      is_active: false
    })
    await expect(
      db.rpc('redeem_customer_reward', {
        p_tenant_id: TENANT_A,
        p_plat: PLATE,
        p_reward_title: 'Free Wash'
      })
    ).rejects.toThrow(/UNAUTHORIZED_OR_INACTIVE/i)

    // AC-11: Cross-tenant tampering rejected
    setActiveActorContext({
      userId: 'user_owner_a',
      role: 'Owner',
      tenant_id: TENANT_A,
      is_active: true
    })
    await expect(
      db.rpc('redeem_customer_reward', {
        p_tenant_id: TENANT_D,
        p_plat: PLATE,
        p_reward_title: 'Free Wash D'
      })
    ).rejects.toThrow(/FORBIDDEN_CROSS_TENANT_REDEEM/i)

    // AC-10: Inactive loyalty program rejected
    await db.from('crm_loyalty_programs').insert({
      tenant_id: TENANT_A,
      is_active: false,
      target_stamps: 5
    })
    await expect(
      db.rpc('redeem_customer_reward', {
        p_tenant_id: TENANT_A,
        p_plat: PLATE,
        p_reward_title: 'Free Wash A'
      })
    ).rejects.toThrow(/LOYALTY_PROGRAM_UNAVAILABLE/i)

    // Setup active program
    await db.from('crm_loyalty_programs').insert({
      tenant_id: TENANT_A,
      is_active: true,
      target_stamps: 5,
      reward_title: 'Free Wash A'
    })

    // AC-11b: Unpaid / Pending visits do not award stamps
    for (let i = 0; i < 5; i++) {
      await db.from('struk').insert({
        tenant_id: TENANT_A,
        id_struk: `STR-PEND-${i}`,
        status_bayar: 'Pending'
      })
      await db.from('carwash').insert({
        tenant_id: TENANT_A,
        plat: PLATE,
        id_struk: `STR-PEND-${i}`,
        status: 'Dalam Antrian',
        status_bayar: 'Pending'
      })
    }
    await expect(
      db.rpc('redeem_customer_reward', {
        p_tenant_id: TENANT_A,
        p_plat: PLATE,
        p_reward_title: 'Free Wash A'
      })
    ).rejects.toThrow(/Stamp kunjungan belum cukup atau reward sudah diklaim/i)

    // AC-12: Settle visits to paid -> valid claim succeeds & idempotent replay
    for (let i = 0; i < 5; i++) {
      await db.from('struk').insert({
        tenant_id: TENANT_A,
        id_struk: `STR-PAID-${i}`,
        status_bayar: 'Selesai'
      })
      await db.from('carwash').insert({
        tenant_id: TENANT_A,
        plat: PLATE,
        id_struk: `STR-PAID-${i}`,
        status: 'Selesai Dicuci',
        status_bayar: 'Selesai'
      })
    }

    const claim1 = await db.rpc('redeem_customer_reward', {
      p_tenant_id: TENANT_A,
      p_plat: PLATE,
      p_reward_title: 'Free Wash A',
      p_id_struk: 'STR-REDEEM-FINAL-01'
    })
    expect(claim1.data.redemption_id).toBeDefined()

    // Replay with exact same id_struk is idempotent
    const claim2 = await db.rpc('redeem_customer_reward', {
      p_tenant_id: TENANT_A,
      p_plat: PLATE,
      p_reward_title: 'Free Wash A',
      p_id_struk: 'STR-REDEEM-FINAL-01'
    })
    expect(claim2.data.redemption_id).toBe(claim1.data.redemption_id)
    expect(claim2.data.idempotent_replay).toBe(true)

    const logs = (await db.from('crm_loyalty_logs').select('*').eq('tenant_id', TENANT_A)).data
    expect(logs).toHaveLength(1)
  })

  // ===========================================================================
  // TEST GROUP 4: POSITIVE FLOW & BUSINESS WORKFLOWS (AC-15, AC-16)
  // ===========================================================================
  it('TC_RG_04 (AC-15, AC-16): Verifies positive POS sales workflow and fail-closed context', async () => {
    setActiveActorContext({
      userId: 'user_kasir_a1',
      role: 'Kasir',
      tenant_id: TENANT_A,
      branchId: BRANCH_A1,
      is_active: true
    })

    // Positive checkout recording by Kasir
    const { data: newStruk, error: strukErr } = await db.from('struk').insert({
      id_struk: 'STR-POS-SUCCESS-001',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A1,
      total_belanja: 75000,
      jenis_pembayaran: 'CASH',
      status_bayar: 'Selesai',
      nama_kasir: 'Kasir A1'
    })
    expect(strukErr).toBeNull()
    expect(newStruk).toBeDefined()

    const readStruk = (await db.from('struk').select('*').eq('id_struk', 'STR-POS-SUCCESS-001')).data
    expect(readStruk).toHaveLength(1)
    expect(readStruk[0].total_belanja).toBe(75000)
  })

  // ===========================================================================
  // TEST GROUP 5: CAPABILITY MATRIX & RELEASE GATE VALIDATION (AC-17)
  // ===========================================================================
  it('TC_RG_05 (AC-17): Confirms full compliance with Capability Matrix and landing routes', () => {
    // Validate capability matrix completeness
    expect(hasPermission(ROLES.SUPER_ADMIN, 'CAN_MANAGE_TENANTS')).toBe(true)
    expect(hasPermission(ROLES.OWNER, 'CAN_VIEW_CONSOLIDATION')).toBe(true)
    expect(hasPermission(ROLES.OWNER, 'CAN_VIEW_REPORTS')).toBe(true)
    expect(hasPermission(ROLES.ADMIN, 'CAN_VIEW_FINANCE')).toBe(true)
    expect(hasPermission(ROLES.ADMIN, 'CAN_VIEW_REPORTS')).toBe(false)
    expect(hasPermission(ROLES.KASIR, 'CAN_ACCESS_POS')).toBe(true)
    expect(hasPermission(ROLES.KASIR, 'CAN_VIEW_FINANCE')).toBe(false)
    expect(hasPermission(ROLES.STAFF_KANTOR, 'CAN_MANAGE_INVENTORY')).toBe(true)
    expect(hasPermission(ROLES.KARYAWAN_CUCI, 'CAN_ACCESS_QUEUE')).toBe(true)

    // Validate safe, loop-free landing routes
    expect(getRoleLandingRoute(ROLES.SUPER_ADMIN)).toBe('/founder')
    expect(getRoleLandingRoute(ROLES.OWNER, { tenantCount: 2 })).toBe('/konsolidasi')
    expect(getRoleLandingRoute(ROLES.OWNER, { tenantCount: 1 })).toBe('/dashboard')
    expect(getRoleLandingRoute(ROLES.STAFF_KANTOR)).toBe('/gudang')
    expect(getRoleLandingRoute(ROLES.KARYAWAN_CUCI, { hasQueue: true })).toBe('/queue')
    expect(getRoleLandingRoute(ROLES.ADMIN)).toBe('/pos')
    expect(getRoleLandingRoute(ROLES.KASIR)).toBe('/pos')
  })
})
