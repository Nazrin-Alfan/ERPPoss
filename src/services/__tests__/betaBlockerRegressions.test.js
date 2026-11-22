import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  localSupabase,
  setActiveTenantId,
  resetActiveActorContext,
  isValidPostgresUuid,
} from '../localDbEngine.js'
import { DEFAULT_TENANT_ID } from '../../constants/erpConfig.js'
import * as consolidationSvc from '../consolidationService.js'
import { calculateCashierDrawerStatus } from '../../utils/helpers.js'

const ROOT = process.cwd()

describe('Public Beta Blocker Regression Suite (TDD)', () => {
  beforeEach(() => {
    resetActiveActorContext()
    setActiveTenantId(DEFAULT_TENANT_ID)
    localSupabase.erp.resetDatabase()
  })

  afterEach(() => {
    resetActiveActorContext()
    setActiveTenantId(DEFAULT_TENANT_ID)
  })

  it('TC_BB_01: Carwash checkout validates tiered tarif_matrix (Medium Regular 55000) & rejects price tampering', async () => {
    const reg = await localSupabase.auth.signUpOwner({
      email: 'cw.matrix@relaypos.id',
      password: 'Password!1',
      nama: 'Owner Matrix',
      tenantName: 'Matrix Wash & Brew',
      businessType: 'HYBRID',
    })
    expect(reg.error).toBeNull()
    const tenantId = reg.data.tenant.id
    const branchId = reg.data.profile.branch_id
    setActiveTenantId(tenantId)

    // Medium Regular for PAKET CUCI BIASA = 55000 (Small Regular = 50000)
    const okRes = await localSupabase.rpc('fn_execute_checkout', {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_struk_payload: {
        id_struk: 'STRUK-CW-MED-01',
        tanggal: '2026-11-19',
        jam: '10:00:00',
        kasir: 'KASIR 1',
        status_bayar: 'Selesai',
        metode_bayar: 'CASH',
        nominal_bayar: 55000,
        uang_diterima: 55000,
        total_tagihan: 55000,
      },
      p_cafe_items: [],
      p_carwash_payload: {
        paket: 'PAKET CUCI BIASA',
        ukuran: 'Medium',
        variant: 'Regular',
        plat: 'B 1234 QA',
        harga: 55000,
      },
    })
    expect(okRes.error).toBeNull()
    expect(okRes.data?.success).toBe(true)

    // Tampered price (e.g. 12000 for Medium Regular) MUST raise PRICE_TAMPERING_DETECTED
    const badRes = await localSupabase.rpc('fn_execute_checkout', {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_struk_payload: {
        id_struk: 'STRUK-CW-TAMPER-01',
        tanggal: '2026-11-19',
        jam: '10:05:00',
        kasir: 'KASIR 1',
        status_bayar: 'Selesai',
        metode_bayar: 'CASH',
        nominal_bayar: 12000,
        uang_diterima: 12000,
        total_tagihan: 12000,
      },
      p_cafe_items: [],
      p_carwash_payload: {
        paket: 'PAKET CUCI BIASA',
        ukuran: 'Medium',
        variant: 'Regular',
        plat: 'B 1234 QA',
        harga: 12000,
      },
    })
    expect(badRes.error).toBeTruthy()
    expect(String(badRes.error?.message || '')).toMatch(/PRICE_TAMPERING_DETECTED/i)

    // Verify SQL migration exists with uq_master_categories_tenant_nama & tarif_matrix check
    const migPath = path.join(ROOT, 'supabase/migrations/20261119000001_public_beta_blocker_fixes.sql')
    expect(fs.existsSync(migPath)).toBe(true)
    const migSql = fs.readFileSync(migPath, 'utf8')
    expect(migSql).toContain('uq_master_categories_tenant_nama')
    expect(migSql).toContain('tarif_matrix')
    expect(migSql).toContain('fn_record_cashier_money_exchange')
  })

  it('TC_BB_02: New CAFE/HYBRID tenant starter menus ALL have matching resep & stok_barang with valid UUIDs', async () => {
    const reg = await localSupabase.auth.signUpOwner({
      email: 'cafe.starter@relaypos.id',
      password: 'Password!1',
      nama: 'Cafe Starter Owner',
      tenantName: 'Kopi Starter QA',
      businessType: 'CAFE',
    })
    expect(reg.error).toBeNull()
    const tenantId = reg.data.tenant.id
    const store = localSupabase.localDb.store

    const menus = store.getTable('daftar_harga_menu').filter((m) => m.tenant_id === tenantId)
    const recipes = store.getTable('resep').filter((r) => r.tenant_id === tenantId)
    const stocks = store.getTable('stok_barang').filter((s) => s.tenant_id === tenantId)
    const balances = store.getTable('pos_balances').filter((b) => b.tenant_id === tenantId)

    expect(menus.length).toBeGreaterThanOrEqual(4)
    menus.forEach((m) => {
      const menuName = (m.nama_menu || m.daftar_menu || '').toLowerCase()
      const menuRecipes = recipes.filter((r) => (r.nama_menu || '').toLowerCase() === menuName)
      expect(menuRecipes.length, `Starter menu "${m.nama_menu || m.daftar_menu}" missing resep`).toBeGreaterThan(0)
      menuRecipes.forEach((r) => {
        const ing = stocks.find(
          (s) =>
            (s.nama_produk || '').toLowerCase() === (r.nama_bahan || '').toLowerCase() ||
            (s.nama_barang || '').toLowerCase() === (r.nama_bahan || '').toLowerCase()
        )
        expect(ing, `Ingredient "${r.nama_bahan}" for "${m.nama_menu || m.daftar_menu}" missing in stok_barang`).toBeDefined()
        expect(isValidPostgresUuid(ing.id)).toBe(true)
        expect(Number(ing.stok)).toBeGreaterThan(0)
      })
    })

    // pos_balances must include SALDO CASH and a digital bank account
    expect(balances.some((b) => b.pos === 'SALDO CASH')).toBe(true)
    expect(balances.some((b) => b.tipe === 'BANK')).toBe(true)
  })

  it('TC_BB_03: Admin.jsx has no undeclared staffList reference in toggleCashierActive', () => {
    const adminSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Admin.jsx'), 'utf8')
    expect(adminSrc).not.toMatch(/\bstaffList\b/)
  })

  it('TC_BB_04: Multi-outlet Owner without owner_email is preserved via tenant_memberships & Konsolidasi has no empty-set leak', () => {
    expect(typeof consolidationSvc.filterOwnerAccessibleTenants).toBe('function')
    expect(typeof consolidationSvc.filterTenantScopedRecords).toBe('function')

    const tenantsCloudShape = [
      { id: 't-1', nama: 'Outlet Satu' }, // No owner_email column!
      { id: 't-2', nama: 'Outlet Dua' },  // No owner_email column!
      { id: 't-other', nama: 'Outlet Orang Lain' },
    ]
    const accessible = consolidationSvc.filterOwnerAccessibleTenants({
      tenants: tenantsCloudShape,
      profile: { id: 'owner-1', tenant_id: 't-1', email: 'owner@mail.com', role: 'Owner' },
      membershipTenantIds: new Set(['t-1', 't-2']),
    })
    expect(accessible.map((t) => t.id)).toEqual(['t-1', 't-2'])

    // Empty allowedTenantIds MUST return [] (never leak unrelated rows)
    const rows = [
      { id: 'r1', tenant_id: 't-1' },
      { id: 'r2', tenant_id: 't-other' },
    ]
    expect(consolidationSvc.filterTenantScopedRecords(rows, new Set())).toEqual([])
    expect(consolidationSvc.filterTenantScopedRecords(rows, new Set(['t-1'])).map((r) => r.id)).toEqual(['r1'])

    const konsolSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Konsolidasi.jsx'), 'utf8')
    expect(konsolSrc).not.toContain('allowedTenantIds.size === 0')
  })

  it('TC_BB_05: Kasir can execute fn_record_cashier_money_exchange within own tenant & is blocked cross-tenant', async () => {
    const reg = await localSupabase.auth.signUpOwner({
      email: 'tukar.owner@relaypos.id',
      password: 'Password!1',
      nama: 'Owner Tukar',
      tenantName: 'Outlet Tukar QA',
      businessType: 'HYBRID',
    })
    const tenantId = reg.data.tenant.id
    const branchId = reg.data.profile.branch_id

    const regOther = await localSupabase.auth.signUpOwner({
      email: 'other.owner@relaypos.id',
      password: 'Password!1',
      nama: 'Owner Lain',
      tenantName: 'Outlet Lain',
      businessType: 'HYBRID',
    })
    const otherTenantId = regOther.data.tenant.id

    // Create & sign in as Kasir in Outlet Tukar QA
    await localSupabase.auth.signUp({
      email: 'kasirtukar',
      password: 'pin123',
      options: { data: { nama: 'Kasir Tukar', role: 'Kasir', tenant_id: tenantId, branch_id: branchId } },
    })
    await localSupabase.auth.signInWithPassword({
      email: `kasirtukar.${reg.data.tenant.slug}@pos.internal`,
      password: 'pin123',
    })
    setActiveTenantId(tenantId)

    // Pre-fund SALDO CASH for testing balance deduction
    const cashBal = localSupabase.localDb.store
      .getTable('pos_balances')
      .find((b) => b.tenant_id === tenantId && b.pos === 'SALDO CASH')
    expect(cashBal).toBeDefined()
    cashBal.balance = 500000

    const exRes = await localSupabase.rpc('fn_record_cashier_money_exchange', {
      p_tenant_id: tenantId,
      p_branch_id: branchId,
      p_kasir: 'KASIR TUKAR',
      p_cash_out: 100000,
      p_qris_in: 102000,
      p_customer: 'Budi',
    })
    expect(exRes.error).toBeNull()
    expect(exRes.data?.success).toBe(true)

    const updatedCash = localSupabase.localDb.store
      .getTable('pos_balances')
      .find((b) => b.tenant_id === tenantId && b.pos === 'SALDO CASH')
    const updatedBank = localSupabase.localDb.store
      .getTable('pos_balances')
      .find((b) => b.tenant_id === tenantId && b.tipe === 'BANK')
    // Opening balance in pos_balances stays immutable (prevents Finance.jsx double-count)
    expect(updatedCash.balance).toBe(500000)
    expect(updatedBank.balance).toBe(0)
    // Live derived balances returned by RPC & v_pocket_balances match exact post-exchange values
    expect(exRes.data?.cash_balance).toBe(400000)
    expect(exRes.data?.bank_balance).toBe(102000)
    const livePockets = localSupabase.localDb.store.getTable('v_pocket_balances').filter((b) => b.tenant_id === tenantId)
    expect(livePockets.find((b) => b.id === updatedCash.id)?.current_balance).toBe(400000)
    expect(livePockets.find((b) => b.id === updatedBank.id)?.current_balance).toBe(102000)

    const cfs = localSupabase.localDb.store.getTable('cashflow').filter((c) => c.tenant_id === tenantId)
    expect(cfs.length).toBe(3)

    // Cross-tenant attempt MUST fail with TENANT_FORBIDDEN
    const breachRes = await localSupabase.rpc('fn_record_cashier_money_exchange', {
      p_tenant_id: otherTenantId,
      p_branch_id: null,
      p_kasir: 'KASIR TUKAR',
      p_cash_out: 50000,
      p_qris_in: 50000,
      p_customer: 'Attacker',
    })
    expect(breachRes.error).toBeTruthy()
    expect(String(breachRes.error?.message || '')).toMatch(/TENANT_FORBIDDEN/i)

    const posSrc = fs.readFileSync(path.join(ROOT, 'src/pages/pos/HybridPOSPage.jsx'), 'utf8')
    expect(posSrc).toContain('fn_record_cashier_money_exchange')
    expect(posSrc).toContain('starting_capital_${effectiveTenantId}_')
  })

  it('TC_BB_06: Playwright CI E2E login selectors & Trial copy/WhatsApp config are consistent', () => {
    const t3 = fs.readFileSync(path.join(ROOT, 'scripts/qa_tahap3_playwright_e2e.mjs'), 'utf8')
    const t4 = fs.readFileSync(path.join(ROOT, 'scripts/qa_tahap4_a11y_perf_and_rbac_e2e.mjs'), 'utf8')
    expect(t3).not.toContain("{ name: 'Masuk ke Sistem' }")
    expect(t4).not.toContain("{ name: 'Masuk ke Sistem' }")

    const lockout = fs.readFileSync(path.join(ROOT, 'src/components/auth/LicenseExpiredLockout.jsx'), 'utf8')
    const activate = fs.readFileSync(path.join(ROOT, 'src/components/auth/ActivateLicenseModal.jsx'), 'utf8')
    expect(lockout).not.toContain('14 Hari')
    expect(lockout).toContain('30 Hari')
    expect(lockout).toContain('DEVELOPER_CONFIG')
    expect(activate).toContain('DEVELOPER_CONFIG')
  })

  it('TC_BB_07: Cloud migration allows trusted fn_switch_active_tenant while keeping FORBIDDEN_TENANT_MUTATION guard', () => {
    const switchMigPath = path.join(ROOT, 'supabase/migrations/20261119000002_fix_owner_tenant_switch_trigger.sql')
    expect(fs.existsSync(switchMigPath)).toBe(true)
    const sql = fs.readFileSync(switchMigPath, 'utf8')
    expect(sql).toContain('fn_protect_profile_role_and_tenant')
    expect(sql).toContain('fn_switch_active_tenant')
    expect(sql).toContain('relaypos.trusted_tenant_switch')
    expect(sql).toContain('v_is_trusted_owner_switch IS NOT TRUE')
    expect(sql).toContain('FORBIDDEN_TENANT_MUTATION')
    expect(sql).toContain('tenant_memberships')
  })

  it('TC_BB_08: Shift Closing & Drawer Preview subtract Tukar Uang cash-out and enforce Kasir branch isolation', async () => {
    const todayDate = new Date().toLocaleDateString('en-CA')
    const reg = await localSupabase.auth.signUpOwner({
      email: 'shift.exchange@relaypos.id',
      password: 'Password!1',
      nama: 'Owner Shift',
      tenantName: 'Outlet Shift QA',
      businessType: 'HYBRID',
    })
    expect(reg.error).toBeNull()
    const tenantId = reg.data.tenant.id
    const branchA = reg.data.profile.branch_id
    setActiveTenantId(tenantId)

    // Create Branch B inside same tenant
    const branchBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    localSupabase.localDb.store.getTable('branches').push({
      id: branchBId,
      tenant_id: tenantId,
      nama: 'Cabang B',
      kode: 'BR-B',
      is_active: true,
    })

    // Create & sign in as Kasir assigned to Branch A
    await localSupabase.auth.signUp({
      email: 'kasirshift',
      password: 'pin123',
      options: { data: { nama: 'Kasir Shift', role: 'Kasir', tenant_id: tenantId, branch_id: branchA } },
    })
    await localSupabase.auth.signInWithPassword({
      email: `kasirshift.${reg.data.tenant.slug}@pos.internal`,
      password: 'pin123',
    })
    setActiveTenantId(tenantId)

    // Pre-fund SALDO CASH
    const cashBal = localSupabase.localDb.store
      .getTable('pos_balances')
      .find((b) => b.tenant_id === tenantId && b.pos === 'SALDO CASH')
    cashBal.balance = 500000

    // Cash sale: 300,000
    localSupabase.localDb.store.getTable('struk').push({
      id: '11111111-1111-4111-8111-111111111111',
      id_struk: 'STRUK-SHIFT-EX-01',
      tenant_id: tenantId,
      branch_id: branchA,
      tanggal: todayDate,
      jam: '10:00:00',
      metode_bayar: 'CASH',
      total_tagihan: 300000,
      nominal_cash: 300000,
      status_bayar: 'Selesai',
      kasir: 'KASIR SHIFT',
    })

    // Cash expense: 50,000
    localSupabase.localDb.store.getTable('pengeluaran').push({
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      branch_id: branchA,
      tanggal: todayDate,
      nominal: 50000,
      pos: 'SALDO CASH',
      nama_pengeluaran: 'Es Batu',
    })

    // Tukar Uang cash out: 100,000 (QRIS in: 102,000)
    const exRes = await localSupabase.rpc('fn_record_cashier_money_exchange', {
      p_tenant_id: tenantId,
      p_branch_id: branchA,
      p_kasir: 'KASIR SHIFT',
      p_cash_out: 100000,
      p_qris_in: 102000,
      p_customer: 'Pelanggan Tukar',
      p_tanggal: todayDate,
    })
    expect(exRes.error).toBeNull()

    // Preview RPC must return today's exchange_cash_out = 100,000
    const previewRes = await localSupabase.rpc('fn_get_cashier_shift_preview', {
      p_tenant_id: tenantId,
      p_branch_id: branchA,
      p_tanggal: todayDate,
    })
    expect(previewRes.error).toBeNull()
    expect(previewRes.data?.exchange_cash_out).toBe(100000)
    expect(previewRes.data?.cash_sales).toBe(300000)
    expect(previewRes.data?.expenses).toBe(50000)

    // Expected drawer = 200,000 + 300,000 - 50,000 - 100,000 = 350,000 -> selisih MUST be 0
    const closeRes = await localSupabase.rpc('fn_close_cashier_shift', {
      p_tenant_id: tenantId,
      p_branch_id: branchA,
      p_kasir: 'KASIR SHIFT',
      p_tanggal: todayDate,
      p_modal_awal: 200000,
      p_kas_fisik: 350000,
      p_catatan: 'Pas setelah tukar uang',
    })
    expect(closeRes.error).toBeNull()
    expect(closeRes.data?.tukar_uang_keluar).toBe(100000)
    expect(closeRes.data?.ekspektasi_kas).toBe(350000)
    expect(closeRes.data?.selisih).toBe(0)

    // Cross-branch attempt by Branch A Kasir targeting Branch B MUST fail with BRANCH_FORBIDDEN
    const crossBranchRes = await localSupabase.rpc('fn_close_cashier_shift', {
      p_tenant_id: tenantId,
      p_branch_id: branchBId,
      p_kasir: 'KASIR SHIFT',
      p_tanggal: todayDate,
      p_modal_awal: 0,
      p_kas_fisik: 0,
    })
    expect(crossBranchRes.error).toBeTruthy()
    expect(String(crossBranchRes.error?.message || '')).toMatch(/BRANCH_FORBIDDEN/i)

    // Drawer helper must subtract exchangeCashOut
    const drawer = calculateCashierDrawerStatus({
      strukList: [{ tanggal: todayDate, metode_bayar: 'CASH', total_tagihan: 300000, status_bayar: 'Selesai' }],
      expenses: [{ nominal: 50000 }],
      startingCapital: 200000,
      exchangeCashOut: 100000,
      targetDate: todayDate,
    })
    expect(drawer.todayExchangeOut).toBe(100000)
    expect(drawer.physicalDrawerCash).toBe(350000)

    // Verify Cloud SQL migration exists with both RPCs and BRANCH_FORBIDDEN guard
    const migPath = path.join(ROOT, 'supabase/migrations/20261119000003_shift_closing_exchange_and_branch_guard.sql')
    expect(fs.existsSync(migPath)).toBe(true)
    const sql = fs.readFileSync(migPath, 'utf8')
    expect(sql).toContain('fn_get_cashier_shift_preview')
    expect(sql).toContain('fn_close_cashier_shift')
    expect(sql).toContain('BRANCH_FORBIDDEN')
    expect(sql).toContain('tukar_uang_keluar')
  })

  it('TC_BB_09: HybridPOSPage date-filters struk queries and removes dead pos_balances query', () => {
    const posSrc = fs.readFileSync(path.join(ROOT, 'src/pages/pos/HybridPOSPage.jsx'), 'utf8')
    const fetchCashBlock = posSrc.slice(
      posSrc.indexOf('const fetchCashierCash'),
      posSrc.indexOf('const fetchTodayTransactions')
    )
    const fetchHistBlock = posSrc.slice(
      posSrc.indexOf('const fetchTodayTransactions'),
      posSrc.indexOf('useEffect(() => {\n    fetchTodayTransactions') !== -1
        ? posSrc.indexOf('useEffect(() => {\n    fetchTodayTransactions')
        : posSrc.indexOf('useEffect(() => {\r\n    fetchTodayTransactions')
    )

    expect(fetchCashBlock).not.toContain(".from('pos_balances')")
    expect(fetchCashBlock).toContain(".eq('tanggal', todayDate)")
    expect(fetchCashBlock).toContain('fn_get_cashier_shift_preview')
    expect(fetchHistBlock).toContain(".eq('tanggal', targetDate)")
    expect(posSrc).toContain('todayExchangeOut')
  })

  it('TC_BB_10: Konsolidasi skips heavy redundant table queries on Cloud RPC success and uses local date (not UTC)', () => {
    const konsolSrc = fs.readFileSync(path.join(ROOT, 'src/pages/Konsolidasi.jsx'), 'utf8')
    expect(konsolSrc).not.toContain('now.toISOString().slice(0, 10)')
    expect(konsolSrc).not.toContain('now.toISOString().slice(0, 7)')
    const loadBlock = konsolSrc.slice(
      konsolSrc.indexOf('const loadConsolidatedData'),
      konsolSrc.indexOf('const filteredData')
    )
    // Early return after loading Cloud RPC summary + branches
    expect(loadBlock).toContain('return')
  })

  it('TC_BB_11: supabaseClient uses case-insensitive provider check & OnboardingWizardModal removes dead non-RPC fallback', () => {
    const clientSrc = fs.readFileSync(path.join(ROOT, 'src/supabaseClient.js'), 'utf8')
    expect(clientSrc).not.toContain("import.meta.env.VITE_BACKEND_PROVIDER === 'cloud'")
    expect(clientSrc).toContain("if (provider === 'cloud')")

    const wizardSrc = fs.readFileSync(path.join(ROOT, 'src/components/auth/OnboardingWizardModal.jsx'), 'utf8')
    expect(wizardSrc).not.toContain('createCleanTenantPayload')
    expect(wizardSrc).not.toContain(".from('tenants').insert(")
  })
})
