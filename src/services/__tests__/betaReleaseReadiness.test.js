import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  localSupabase,
  setActiveTenantId,
  resetActiveActorContext,
} from '../localDbEngine.js'
import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../../constants/erpConfig.js'
import { api } from '../apiAdapter.js'
import { evaluateLicenseStatus, BETA_TRIAL_DAYS } from '../../utils/licenseHelpers.js'
import { generateSecureInitialPassword } from '../../utils/superAdminHelpers.js'

describe('Beta Release Readiness & Ponytail Hardening Suite', () => {
  beforeEach(() => {
    resetActiveActorContext()
    setActiveTenantId(DEFAULT_TENANT_ID)
    localSupabase.erp.resetDatabase()
  })

  afterEach(() => {
    resetActiveActorContext()
    setActiveTenantId(DEFAULT_TENANT_ID)
  })

  it('1. Beta Trial 30 Hari + 7-Day Grace Period Parity & Business-Type Stock Isolation', async () => {
    const fallbackStatus = evaluateLicenseStatus(null)
    expect(fallbackStatus.daysRemaining).toBe(BETA_TRIAL_DAYS)
    expect(BETA_TRIAL_DAYS).toBe(30)

    const cafeReg = await localSupabase.auth.signUpOwner({
      email: 'beta.cafe@relaypos.id',
      password: 'Password!1',
      nama: 'Cafe Owner',
      tenantName: 'Kopi Beta',
      businessType: 'CAFE',
    })
    expect(cafeReg.error).toBeNull()
    const cafeStocks = localSupabase.localDb.store
      .getTable('stok_barang')
      .filter((s) => s.tenant_id === cafeReg.data.tenant.id)
    expect(cafeStocks.length).toBe(4)
    expect(cafeStocks.every((s) => s.gudang === 'CAFE')).toBe(true)

    const cafeLic = localSupabase.localDb.store
      .getTable('tenant_licenses')
      .find((l) => l.tenant_id === cafeReg.data.tenant.id)
    const licEval = evaluateLicenseStatus(cafeLic)
    expect(licEval.isTrial).toBe(true)
    expect(licEval.daysRemaining).toBeGreaterThanOrEqual(29)

    const cwReg = await localSupabase.auth.signUpOwner({
      email: 'beta.cw@relaypos.id',
      password: 'Password!1',
      nama: 'CW Owner',
      tenantName: 'Cuci Beta',
      businessType: 'CARWASH',
    })
    const cwStocks = localSupabase.localDb.store
      .getTable('stok_barang')
      .filter((s) => s.tenant_id === cwReg.data.tenant.id)
    expect(cwStocks.length).toBe(1)
    expect(cwStocks[0].gudang).toBe('CARWASH')
  })

  it('2. Forgot & Reset Password Flow updates password and allows login', async () => {
    const email = 'reset.owner@relaypos.id'
    await localSupabase.auth.signUpOwner({
      email,
      password: 'OldPassword123',
      nama: 'Reset Owner',
      tenantName: 'Reset Wash',
      businessType: 'HYBRID',
    })

    const forgotRes = await api.auth.forgotPassword(email)
    expect(forgotRes.success).toBe(true)
    expect(forgotRes.token).toBeTruthy()

    const resetRes = await api.auth.resetPassword({
      newPassword: 'NewPassword456',
      token: forgotRes.token,
    })
    expect(resetRes.success).toBe(true)

    const loginRes = await api.auth.login(email, 'NewPassword456')
    expect(loginRes.success).toBe(true)
    expect(loginRes.user.email).toBe(email)
  })

  it('3. Multi-Outlet Opsi B: Owner creates 2nd outlet, switches safely, Kasir is blocked', async () => {
    const reg = await localSupabase.auth.signUpOwner({
      email: 'multi.owner@relaypos.id',
      password: 'Password!1',
      nama: 'Multi Owner',
      tenantName: 'Outlet Satu',
      businessType: 'HYBRID',
    })
    const firstTenantId = reg.data.tenant.id

    const { data: outletRes, error: outletErr } = await localSupabase.rpc('fn_create_owner_outlet', {
      p_store_name: 'Outlet Dua',
      p_business_type: 'CAFE',
    })
    expect(outletErr).toBeNull()
    expect(outletRes.success).toBe(true)
    const secondTenantId = outletRes.tenant.id
    expect(secondTenantId).not.toBe(firstTenantId)

    const { data: switchRes, error: switchErr } = await localSupabase.rpc('fn_switch_active_tenant', {
      p_tenant_id: secondTenantId,
    })
    expect(switchErr).toBeNull()
    expect(switchRes.tenant_id).toBe(secondTenantId)

    // Kasir created in Outlet Satu cannot switch to Outlet Dua
    await localSupabase.auth.signUp({
      email: 'kasir1',
      password: 'pin123',
      options: { data: { nama: 'Kasir Satu', role: 'Kasir', tenant_id: firstTenantId } },
    })
    await api.auth.login('kasir1', 'pin123', reg.data.tenant.slug)
    const { error: kasirSwitchErr } = await localSupabase.rpc('fn_switch_active_tenant', {
      p_tenant_id: secondTenantId,
    })
    expect(kasirSwitchErr).toBeTruthy()
  })

  it('4. Shift Closing RPC records drawer audit without double-counting cashflow', async () => {
    const todayDate = new Date().toLocaleDateString('en-CA')
    const cashflowBefore = localSupabase.localDb.store.getTable('cashflow').length

    await api.transaksi.executeCheckout({
      tenant_id: DEFAULT_TENANT_ID,
      branch_id: DEFAULT_BRANCH_ID,
      struk_payload: {
        id_struk: 'STRUK-SHIFT-01',
        tenant_id: DEFAULT_TENANT_ID,
        tanggal: todayDate,
        jam: '10:00:00',
        metode_bayar: 'CASH',
        nominal_cash: 50000,
        total_tagihan: 50000,
        status_bayar: 'Selesai',
        kasir: 'KASIR A',
      },
      cafe_items: [],
      carwash_payload: null,
    })

    const cashflowAfterSale = localSupabase.localDb.store.getTable('cashflow').length
    const { data: closeRes, error: closeErr } = await localSupabase.rpc('fn_close_cashier_shift', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_branch_id: DEFAULT_BRANCH_ID,
      p_kasir: 'KASIR A',
      p_tanggal: todayDate,
      p_modal_awal: 100000,
      p_kas_fisik: 150000,
      p_catatan: 'Pas Rp 0',
    })

    expect(closeErr).toBeNull()
    expect(closeRes.success).toBe(true)
    expect(closeRes.penjualan_tunai).toBe(50000)
    expect(closeRes.ekspektasi_kas).toBe(150000)
    expect(closeRes.selisih).toBe(0)
    // Crucial: fn_close_cashier_shift does NOT insert duplicate revenue rows into cashflow
    expect(localSupabase.localDb.store.getTable('cashflow').length).toBe(cashflowAfterSale)
    expect(cashflowAfterSale).toBeGreaterThanOrEqual(cashflowBefore)
  })

  it('5. Receipt Config DB Persistence + Atomic Loyalty Checkout + Secure Initial Password', async () => {
    const { data: cfgRes, error: cfgErr } = await localSupabase.rpc('fn_update_tenant_receipt_config', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_config: { storeName: 'TOKO BETA SUKSES', paperWidth: '58mm' },
    })
    expect(cfgErr).toBeNull()
    expect(cfgRes.receipt_config.storeName).toBe('TOKO BETA SUKSES')

    // Loyalty checkout without sufficient stamps MUST fail atomically without creating struk
    const strukBefore = localSupabase.localDb.store.getTable('struk').length
    await expect(
      api.transaksi.executeCheckout({
        tenant_id: DEFAULT_TENANT_ID,
        branch_id: DEFAULT_BRANCH_ID,
        struk_payload: {
          id_struk: 'STRUK-LOY-FAIL',
          tenant_id: DEFAULT_TENANT_ID,
          tanggal: '2026-11-18',
          jam: '11:00:00',
          metode_bayar: 'CASH',
          total_tagihan: 0,
          status_bayar: 'Selesai',
          redeem_loyalty: true,
        },
        cafe_items: [],
        carwash_payload: {
          id_transaksi: 'cw-loy-fail',
          id_struk: 'STRUK-LOY-FAIL',
          tenant_id: DEFAULT_TENANT_ID,
          plat: 'B9999XYZ',
          paket: 'PAKET CUCI BIASA',
          harga: 50000,
        },
      })
    ).rejects.toThrow(/Stamp kunjungan belum cukup|LOYALTY_PROGRAM_UNAVAILABLE/i)
    expect(localSupabase.localDb.store.getTable('struk').length).toBe(strukBefore)

    const pwd1 = generateSecureInitialPassword()
    const pwd2 = generateSecureInitialPassword()
    expect(pwd1).toHaveLength(12)
    expect(pwd1).not.toBe('password123')
    expect(pwd1).not.toBe(pwd2)
  })
})
