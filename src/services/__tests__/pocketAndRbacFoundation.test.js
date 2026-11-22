import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createLocalClient,
  DEFAULT_TENANT_ID,
  DEFAULT_BRANCH_ID,
  setActiveTenantId,
  setActiveActorContext,
  resetActiveActorContext,
} from '../localDbEngine.js'
import {
  ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  getRoleLandingRoute,
  getRoleDisplayLabel,
  isTenantWideManager,
} from '../../constants/roles.js'

describe('TDD: Pocket Balance Relational Foundation & RBAC Admin Pusat vs Admin Cabang', () => {
  const TENANT_A = DEFAULT_TENANT_ID
  const TENANT_B = 'tenant_b_other_isolation'
  const BRANCH_A1 = DEFAULT_BRANCH_ID
  const BRANCH_A2 = 'branch_a2_selatan'
  const BRANCH_B1 = 'branch_b1_other'
  let db

  beforeEach(() => {
    resetActiveActorContext()
    setActiveTenantId(TENANT_A)
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  afterEach(() => {
    resetActiveActorContext()
    setActiveTenantId(DEFAULT_TENANT_ID)
  })

  it('TC_PF_01: [HAPPY_PATH] v_pocket_balances computes opening_balance + net cashflow by pocket_id without double-count', async () => {
    setActiveActorContext({ userId: 'owner-a', role: ROLES.OWNER, tenant_id: TENANT_A, branchId: BRANCH_A1, is_active: true })

    // Create pocket with opening balance 1,000,000
    const { data: created } = await db.from('pos_balances').insert({
      id: 'pocket-mandiri-a1',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A1,
      pos: 'SALDO MANDIRI A1',
      label: 'Mandiri Operasional A1',
      tipe: 'BANK',
      balance: 1000000,
      is_active: true,
    })
    expect(created).toBeTruthy()

    // Insert income 250,000 & expense 100,000 referencing pocket_id
    await db.from('cashflow').insert([
      {
        id: 'cf-p-1',
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        pocket_id: 'pocket-mandiri-a1',
        tanggal: '2026-11-22',
        keterangan_transaksi: 'Setoran QRIS',
        jenis: 'Pemasukan',
        kategori: 'Pendapatan Kasir',
        pemasukan: 250000,
        pengeluaran: 0,
      },
      {
        id: 'cf-p-2',
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        pocket_id: 'pocket-mandiri-a1',
        tanggal: '2026-11-22',
        keterangan_transaksi: 'Bayar Listrik',
        jenis: 'Pengeluaran Bersama',
        kategori: 'Listrik',
        pemasukan: 0,
        pengeluaran: 100000,
      },
    ])

    const { data: rows, error } = await db.from('v_pocket_balances').select('*').eq('id', 'pocket-mandiri-a1')
    expect(error).toBeNull()
    expect(rows).toHaveLength(1)
    expect(rows[0].opening_balance).toBe(1000000)
    expect(rows[0].total_in).toBe(250000)
    expect(rows[0].total_out).toBe(100000)
    expect(rows[0].current_balance).toBe(1150000)
    expect(rows[0].tx_count).toBe(2)
    expect(rows[0].balance_source).toBe('ERP_BOOK')
  })

  it('TC_PF_02: [REGRESSION] Renaming pos_balances.pos propagates to cashflow.pos and preserves pocket balance', async () => {
    setActiveActorContext({ userId: 'owner-a', role: ROLES.OWNER, tenant_id: TENANT_A, branchId: BRANCH_A1, is_active: true })

    await db.from('pos_balances').insert({
      id: 'pocket-rename-1',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A1,
      pos: 'SALDO REKENING MANDIRI',
      label: 'Rekening Mandiri',
      tipe: 'BANK',
      balance: 500000,
      is_active: true,
    })

    await db.from('cashflow').insert({
      id: 'cf-rename-1',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A1,
      pos: 'SALDO REKENING MANDIRI',
      tanggal: '2026-11-22',
      keterangan_transaksi: 'Beli Bahan',
      jenis: 'Pengeluaran Bersama',
      kategori: 'Operasional',
      pemasukan: 0,
      pengeluaran: 120000,
    })

    // Rename pocket pos by id
    const { error: updErr } = await db
      .from('pos_balances')
      .update({ pos: 'SALDO MANDIRI OPERASIONAL', label: 'Mandiri Operasional' })
      .eq('id', 'pocket-rename-1')
    expect(updErr).toBeNull()

    // Cashflow row should have updated pos and keep pocket_id
    const { data: cfRows } = await db.from('cashflow').select('*').eq('id', 'cf-rename-1')
    expect(cfRows[0].pocket_id).toBe('pocket-rename-1')
    expect(cfRows[0].pos).toBe('SALDO MANDIRI OPERASIONAL')

    // v_pocket_balances keeps exact current_balance = 500000 - 120000 = 380000
    const { data: vRows } = await db.from('v_pocket_balances').select('*').eq('id', 'pocket-rename-1')
    expect(vRows[0].current_balance).toBe(380000)
  })

  it('TC_PF_03: [REGRESSION] Legacy alias SALDO REKENING (N) auto-resolves to active BANK pocket_id', async () => {
    setActiveActorContext({ userId: 'owner-a', role: ROLES.OWNER, tenant_id: TENANT_A, branchId: BRANCH_A1, is_active: true })

    await db.from('cashflow').insert({
      id: 'cf-legacy-alias',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A1,
      pos: 'SALDO REKENING (N)',
      tanggal: '2026-11-22',
      keterangan_transaksi: 'Penjualan POS Digital Legacy',
      jenis: 'Pemasukan',
      kategori: 'Pendapatan Kasir',
      pemasukan: 75000,
      pengeluaran: 0,
    })

    const { data: cfRows } = await db.from('cashflow').select('*').eq('id', 'cf-legacy-alias')
    expect(cfRows[0].pocket_id).toBeTruthy()
    expect(cfRows[0].pos).not.toBe('SALDO REKENING (N)')
  })

  it('TC_PF_04: [INTEGRITY] Deleting a pocket referenced by cashflow is blocked with FK error 23503', async () => {
    setActiveActorContext({ userId: 'owner-a', role: ROLES.OWNER, tenant_id: TENANT_A, branchId: BRANCH_A1, is_active: true })

    await db.from('pos_balances').insert({
      id: 'pocket-protected-1',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A1,
      pos: 'SALDO BCA LOCK',
      label: 'BCA Lock',
      tipe: 'BANK',
      balance: 0,
      is_active: true,
    })

    await db.from('cashflow').insert({
      id: 'cf-lock-1',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A1,
      pocket_id: 'pocket-protected-1',
      tanggal: '2026-11-22',
      keterangan_transaksi: 'Tx Locked',
      jenis: 'Pemasukan',
      kategori: 'Pendapatan',
      pemasukan: 50000,
      pengeluaran: 0,
    })

    const { error: delErr } = await db.from('pos_balances').delete().eq('id', 'pocket-protected-1')
    expect(delErr).not.toBeNull()
    expect(String(delErr.message || delErr.code || '')).toMatch(/23503|FOREIGN_KEY|digunakan/i)
  })

  it('TC_PF_05: [RBAC] ROLES.ADMIN_PUSAT permissions, helpers, and display labels are configured accurately', () => {
    expect(ROLES.ADMIN_PUSAT).toBe('Admin Pusat')
    expect(hasPermission(ROLES.ADMIN_PUSAT, 'CAN_VIEW_FINANCE')).toBe(true)
    expect(hasPermission(ROLES.ADMIN_PUSAT, 'CAN_MANAGE_STAFF')).toBe(true)
    expect(hasPermission(ROLES.ADMIN_PUSAT, 'CAN_MANAGE_INVENTORY')).toBe(true)
    expect(hasPermission(ROLES.ADMIN_PUSAT, 'CAN_MANAGE_BANK_INTEGRATION')).toBe(true)
    expect(hasPermission(ROLES.ADMIN_PUSAT, 'CAN_MANAGE_TENANTS')).toBe(false)
    expect(hasPermission(ROLES.ADMIN_PUSAT, 'CAN_VIEW_CONSOLIDATION')).toBe(false)
    expect(hasPermission(ROLES.ADMIN_PUSAT, 'CAN_MANAGE_STORE_SETTINGS')).toBe(false)
    expect(ROLE_PERMISSIONS.CAN_MANAGE_BANK_INTEGRATION).not.toContain(ROLES.KASIR)
    expect(isTenantWideManager(ROLES.OWNER)).toBe(true)
    expect(isTenantWideManager(ROLES.ADMIN_PUSAT)).toBe(true)
    expect(isTenantWideManager(ROLES.ADMIN)).toBe(false)
    expect(getRoleLandingRoute(ROLES.ADMIN_PUSAT)).toBe('/finance')
    expect(getRoleDisplayLabel(ROLES.ADMIN)).toBe('Admin Cabang')
    expect(getRoleDisplayLabel(ROLES.ADMIN_PUSAT)).toBe('Admin Pusat')
  })

  it('TC_PF_06: [SECURITY_BRANCH_BREACH] Admin (Cabang A1) is strictly isolated to Branch A1, while Admin Pusat sees all branches in Tenant A only', async () => {
    // Seed branches A1, A2 (Tenant A) and B1 (Tenant B)
    setActiveActorContext({ userId: 'super-admin', role: ROLES.SUPER_ADMIN, tenant_id: TENANT_A, branchId: BRANCH_A1, is_active: true })

    await db.from('pos_balances').insert([
      { id: 'pb-a1', tenant_id: TENANT_A, branch_id: BRANCH_A1, pos: 'SALDO BANK A1', label: 'Bank A1', tipe: 'BANK', balance: 100000, is_active: true },
      { id: 'pb-a2', tenant_id: TENANT_A, branch_id: BRANCH_A2, pos: 'SALDO BANK A2', label: 'Bank A2', tipe: 'BANK', balance: 200000, is_active: true },
      { id: 'pb-hq', tenant_id: TENANT_A, branch_id: null, pos: 'SALDO HQ PUSAT', label: 'Rekening Pusat', tipe: 'BANK', balance: 500000, is_active: true },
      { id: 'pb-b1', tenant_id: TENANT_B, branch_id: BRANCH_B1, pos: 'SALDO BANK B1', label: 'Bank B1', tipe: 'BANK', balance: 999000, is_active: true },
    ])

    await db.from('stok_barang').insert([
      { id: 'st-a1', tenant_id: TENANT_A, branch_id: BRANCH_A1, nama_produk: 'Sabun A1', stok: 10 },
      { id: 'st-a2', tenant_id: TENANT_A, branch_id: BRANCH_A2, nama_produk: 'Sabun A2', stok: 20 },
      { id: 'st-b1', tenant_id: TENANT_B, branch_id: BRANCH_B1, nama_produk: 'Sabun B1', stok: 30 },
    ])

    // 1. Admin Cabang A1: ONLY sees Branch A1 pockets & stock (NO A2, NO HQ null, NO Tenant B)
    setActiveActorContext({ userId: 'admin-a1', role: ROLES.ADMIN, tenant_id: TENANT_A, branchId: BRANCH_A1, is_active: true })
    const { data: adminPockets } = await db.from('v_pocket_balances').select('*')
    expect(adminPockets.some((p) => p.id === 'pb-a1')).toBe(true)
    expect(adminPockets.some((p) => p.id === 'pb-a2')).toBe(false)
    expect(adminPockets.some((p) => p.id === 'pb-hq')).toBe(false)
    expect(adminPockets.some((p) => p.id === 'pb-b1')).toBe(false)

    const { data: adminStock } = await db.from('stok_barang').select('*')
    expect(adminStock.some((s) => s.id === 'st-a1')).toBe(true)
    expect(adminStock.some((s) => s.id === 'st-a2')).toBe(false)

    // Admin Cabang A1 blocked from inserting cashflow into Branch A2
    const { error: crossBranchErr } = await db.from('cashflow').insert({
      id: 'cf-illegal-branch',
      tenant_id: TENANT_A,
      branch_id: BRANCH_A2,
      pocket_id: 'pb-a2',
      tanggal: '2026-11-22',
      keterangan_transaksi: 'Illegal Cross Branch',
      jenis: 'Pengeluaran Bersama',
      kategori: 'Operasional',
      pemasukan: 0,
      pengeluaran: 10000,
    })
    expect(crossBranchErr).not.toBeNull()

    // 2. Admin Pusat (Tenant A): sees A1, A2, HQ — but 0 rows from Tenant B!
    setActiveActorContext({ userId: 'admin-pusat-a', role: ROLES.ADMIN_PUSAT, tenant_id: TENANT_A, branchId: BRANCH_A1, is_active: true })
    const { data: pusatPockets } = await db.from('v_pocket_balances').select('*')
    expect(pusatPockets.some((p) => p.id === 'pb-a1')).toBe(true)
    expect(pusatPockets.some((p) => p.id === 'pb-a2')).toBe(true)
    expect(pusatPockets.some((p) => p.id === 'pb-hq')).toBe(true)
    expect(pusatPockets.some((p) => p.id === 'pb-b1')).toBe(false)

    const { data: pusatStock } = await db.from('stok_barang').select('*')
    expect(pusatStock.some((s) => s.id === 'st-a1')).toBe(true)
    expect(pusatStock.some((s) => s.id === 'st-a2')).toBe(true)
    expect(pusatStock.some((s) => s.id === 'st-b1')).toBe(false)

    // 3. Kasir still gets 0 rows from v_pocket_balances
    setActiveActorContext({ userId: 'kasir-a1', role: ROLES.KASIR, tenant_id: TENANT_A, branchId: BRANCH_A1, is_active: true })
    const { data: kasirPockets } = await db.from('v_pocket_balances').select('*')
    expect(kasirPockets).toEqual([])
  })
})
