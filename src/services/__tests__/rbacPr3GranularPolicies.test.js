import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createLocalClient,
  DEFAULT_TENANT_ID,
  DEFAULT_BRANCH_ID,
  setActiveTenantId,
  setActiveActorContext,
  resetActiveActorContext
} from '../localDbEngine.js'

describe('PR-3 Granular RLS & Branch Scoping Parity Suite', () => {
  let db
  const TENANT_A = DEFAULT_TENANT_ID
  const BRANCH_A1 = DEFAULT_BRANCH_ID
  const BRANCH_A2 = 'branch_a2_timur'

  beforeEach(() => {
    setActiveTenantId(TENANT_A)
    resetActiveActorContext()
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  afterEach(() => {
    resetActiveActorContext()
    setActiveTenantId(DEFAULT_TENANT_ID)
  })

  it('TC_PR3_01: [HAPPY_PATH] Owner and Admin can read across branches and update catalog prices', async () => {
    // Arrange: Set context to Owner
    setActiveActorContext({ role: 'Owner', branchId: BRANCH_A1 })

    // Act: Insert stock and menu for branch A1 and A2
    await db.from('stok_barang').insert({
      id_barang: 'item_a1_001',
      nama_barang: 'Bahan A1',
      branch_id: BRANCH_A1,
      stok: 50,
      harga_satuan: 10000
    })
    await db.from('stok_barang').insert({
      id_barang: 'item_a2_001',
      nama_barang: 'Bahan A2',
      branch_id: BRANCH_A2,
      stok: 30,
      harga_satuan: 12000
    })

    // Act: Owner queries stok_barang
    const { data: allStock, error: stockErr } = await db.from('stok_barang').select('*')
    expect(stockErr).toBeNull()
    expect(allStock.some(s => s.branch_id === BRANCH_A1)).toBe(true)
    expect(allStock.some(s => s.branch_id === BRANCH_A2)).toBe(true)

    // Act: Owner updates catalog price
    const { data: updatedMenu, error: updateErr } = await db
      .from('daftar_harga_menu')
      .update({ harga: 25000 })
      .eq('nama_menu', 'Kopi Espresso')
    expect(updateErr).toBeNull()
  })

  it('TC_PR3_02: [SECURITY_TENANT_BREACH] Kasir is blocked from reading payroll, general ledger, and cashflow tables', async () => {
    // Arrange: Ensure data exists in sensitive tables
    setActiveActorContext({ role: 'Owner', branchId: BRANCH_A1 })
    await db.from('karyawan_cuci').insert({
      id: 'kru_cuci_01',
      nama: 'Asep Kru Cuci',
      branch_id: BRANCH_A1,
      gaji: 2500000
    })
    await db.from('journal_entries').insert({
      id: 'je_secret_01',
      entry_no: 'JE-SEC-01',
      total_amount: 500000,
      status: 'POSTED'
    })

    // Act: Switch to Kasir context
    setActiveActorContext({ role: 'Kasir', branchId: BRANCH_A1 })

    // Assert: Kasir reading payroll returns 0 rows
    const { data: cuciData } = await db.from('karyawan_cuci').select('*')
    expect(cuciData).toEqual([])

    // Assert: Kasir reading journal entries returns 0 rows
    const { data: jeData } = await db.from('journal_entries').select('*')
    expect(jeData).toEqual([])

    // Assert: Kasir reading chart of accounts returns 0 rows
    const { data: coaData } = await db.from('chart_of_accounts').select('*')
    expect(coaData).toEqual([])

    // Assert: Kasir reading pos_balances returns 0 rows
    const { data: balData } = await db.from('pos_balances').select('*')
    expect(balData).toEqual([])
  })

  it('TC_PR3_03: [SECURITY_TENANT_BREACH] Kasir is blocked from direct write/update on master catalog and inventory', async () => {
    // Arrange: Switch to Kasir context
    setActiveActorContext({ role: 'Kasir', branchId: BRANCH_A1 })

    // Act: Kasir attempts to update menu prices
    const { error: menuErr } = await db
      .from('daftar_harga_menu')
      .update({ harga: 99999 })
      .eq('nama_menu', 'Kopi Espresso')

    // Assert: Modification is blocked
    expect(menuErr).not.toBeNull()
    expect(menuErr.message).toContain('FORBIDDEN_ROLE_OPERATION')

    // Act: Kasir attempts to update stock directly
    const { error: stockErr } = await db
      .from('stok_barang')
      .update({ stok: 999 })
      .eq('nama_barang', 'Bahan A1')

    // Assert: Modification is blocked
    expect(stockErr).not.toBeNull()
    expect(stockErr.message).toContain('FORBIDDEN_ROLE_OPERATION')
  })

  it('TC_PR3_04: [SECURITY_BRANCH_BREACH] Kasir in Branch A1 is isolated from Branch A2 inventory and receipts', async () => {
    // Arrange: Create fixtures in Branch A1 and Branch A2 under Owner context
    setActiveActorContext({ role: 'Owner', branchId: BRANCH_A1 })
    await db.from('stok_barang').insert({
      id_barang: 'item_a1_exclusive',
      nama_barang: 'Biji Kopi A1',
      branch_id: BRANCH_A1,
      stok: 10
    })
    await db.from('stok_barang').insert({
      id_barang: 'item_a2_exclusive',
      nama_barang: 'Biji Kopi A2',
      branch_id: BRANCH_A2,
      stok: 20
    })
    await db.from('struk').insert({
      id_struk: 'STR-A2-001',
      branch_id: BRANCH_A2,
      total_tagihan: 50000,
      metode_bayar: 'CASH',
      status_bayar: 'Selesai'
    })

    // Act: Switch context to Kasir Branch A1
    setActiveActorContext({ role: 'Kasir', branchId: BRANCH_A1 })

    // Assert: Kasir A1 only sees Branch A1 stock
    const { data: visibleStock } = await db.from('stok_barang').select('*')
    expect(visibleStock.some(s => s.branch_id === BRANCH_A1)).toBe(true)
    expect(visibleStock.some(s => s.branch_id === BRANCH_A2)).toBe(false)

    // Assert: Kasir A1 cannot see Branch A2 receipts
    const { data: visibleStruk } = await db.from('struk').select('*')
    expect(visibleStruk.some(s => s.branch_id === BRANCH_A2)).toBe(false)

    // Act: Kasir A1 attempts to create a transaction in Branch A2
    const { error: insertErr } = await db.from('struk').insert({
      id_struk: 'STR-ILLEGAL-A2',
      branch_id: BRANCH_A2,
      total_tagihan: 25000,
      metode_bayar: 'CASH',
      status_bayar: 'Selesai'
    })

    // Assert: Cross-branch mutation is blocked
    expect(insertErr).not.toBeNull()
    expect(insertErr.message).toContain('FORBIDDEN_BRANCH_OPERATION')
  })

  it('TC_PR3_05: [DOUBLE_ENTRY_INTEGRITY] Posted journal entries are immutable against direct update or delete', async () => {
    // Arrange: Create a posted journal entry
    setActiveActorContext({ role: 'Owner', branchId: BRANCH_A1 })
    await db.from('journal_entries').insert({
      id: 'je_immutable_01',
      entry_no: 'JE-IMMUTABLE-01',
      total_amount: 1000000,
      status: 'POSTED'
    })

    // Act: Attempt to delete the posted journal
    const { error: delErr } = await db
      .from('journal_entries')
      .delete()
      .eq('id', 'je_immutable_01')

    // Assert: Delete is rejected
    expect(delErr).not.toBeNull()
    expect(delErr.message).toContain('IMMUTABLE_POSTED_JOURNAL')

    // Act: Attempt to update the posted journal amount
    const { error: updErr } = await db
      .from('journal_entries')
      .update({ total_amount: 999 })
      .eq('id', 'je_immutable_01')

    // Assert: Update is rejected
    expect(updErr).not.toBeNull()
    expect(updErr.message).toContain('IMMUTABLE_POSTED_JOURNAL')
  })
})
