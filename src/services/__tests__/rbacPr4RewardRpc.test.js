import { beforeEach, describe, expect, it } from 'vitest'
import {
  createLocalClient,
  setActiveActorContext,
  resetActiveActorContext
} from '../localDbEngine.js'
import { redeemCustomerReward } from '../crmService.js'

describe('RBAC PR-4: redeem_customer_reward Hardening (AC-09, AC-10, AC-11, AC-11b, AC-12)', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111'
  const TENANT_D = '22222222-2222-2222-2222-222222222222'
  const PLATE_A = 'B 1234 QA'
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
    resetActiveActorContext()
  })

  it('TC_01 (AC-09): Rejects redemption when actor profile is inactive (UNAUTHORIZED_OR_INACTIVE)', async () => {
    // Setup active loyalty program and 5 paid visits for Tenant A
    await db.from('crm_loyalty_programs').insert({
      tenant_id: TENANT_A,
      is_active: true,
      target_stamps: 5,
      reward_title: 'Free Wash A'
    })
    for (let i = 0; i < 5; i++) {
      const strukId = `STR-A-${i}`
      await db.from('struk').insert({
        tenant_id: TENANT_A,
        id_struk: strukId,
        status_bayar: 'Selesai'
      })
      await db.from('carwash').insert({
        tenant_id: TENANT_A,
        plat: PLATE_A,
        id_struk: strukId,
        status: 'Selesai Dicuci',
        status_bayar: 'Selesai'
      })
    }

    // Set actor as inactive
    setActiveActorContext({
      userId: 'user_inactive',
      role: 'Kasir',
      tenant_id: TENANT_A,
      is_active: false
    })

    // Calling via db.rpc or redeemCustomerReward must reject with UNAUTHORIZED_OR_INACTIVE
    await expect(
      db.rpc('redeem_customer_reward', {
        p_tenant_id: TENANT_A,
        p_plat: PLATE_A,
        p_reward_title: 'Free Wash A'
      })
    ).rejects.toThrow(/UNAUTHORIZED_OR_INACTIVE/i)

    // Also via crmService
    await expect(
      redeemCustomerReward(db, {
        tenant_id: TENANT_A,
        plat: PLATE_A,
        reward_title: 'Free Wash A'
      })
    ).rejects.toThrow(/UNAUTHORIZED_OR_INACTIVE/i)
  })

  it('TC_02 (AC-10): Rejects redemption when loyalty program is inactive or target_stamps <= 0 (LOYALTY_PROGRAM_UNAVAILABLE)', async () => {
    // Set active actor
    setActiveActorContext({
      userId: 'user_kasir_a',
      role: 'Kasir',
      tenant_id: TENANT_A,
      is_active: true
    })

    // Insert loyalty program with is_active = false
    await db.from('crm_loyalty_programs').insert({
      tenant_id: TENANT_A,
      is_active: false,
      target_stamps: 5,
      reward_title: 'Disabled Program'
    })

    // Insert 5 paid visits
    for (let i = 0; i < 5; i++) {
      const strukId = `STR-A2-${i}`
      await db.from('struk').insert({
        tenant_id: TENANT_A,
        id_struk: strukId,
        status_bayar: 'Selesai'
      })
      await db.from('carwash').insert({
        tenant_id: TENANT_A,
        plat: PLATE_A,
        id_struk: strukId,
        status: 'Selesai Dicuci',
        status_bayar: 'Selesai'
      })
    }

    await expect(
      db.rpc('redeem_customer_reward', {
        p_tenant_id: TENANT_A,
        p_plat: PLATE_A,
        p_reward_title: 'Free Wash A'
      })
    ).rejects.toThrow(/LOYALTY_PROGRAM_UNAVAILABLE/i)
  })

  it('TC_03 (AC-11): Rejects cross-tenant redemption call (FORBIDDEN_CROSS_TENANT_REDEEM)', async () => {
    // Actor belongs to Tenant A
    setActiveActorContext({
      userId: 'user_owner_a',
      role: 'Owner',
      tenant_id: TENANT_A,
      is_active: true
    })

    // Attempting to redeem customer reward for Tenant D
    await expect(
      db.rpc('redeem_customer_reward', {
        p_tenant_id: TENANT_D,
        p_plat: 'D 9999 QA',
        p_reward_title: 'Free Wash D'
      })
    ).rejects.toThrow(/FORBIDDEN_CROSS_TENANT_REDEEM/i)

    await expect(
      redeemCustomerReward(db, {
        tenant_id: TENANT_D,
        plat: 'D 9999 QA',
        reward_title: 'Free Wash D'
      })
    ).rejects.toThrow(/FORBIDDEN_CROSS_TENANT_REDEEM/i)
  })

  it('TC_04 (AC-11b): Rejects redemption if customer visits are pending or unpaid', async () => {
    setActiveActorContext({
      userId: 'user_owner_a',
      role: 'Owner',
      tenant_id: TENANT_A,
      is_active: true
    })

    await db.from('crm_loyalty_programs').insert({
      tenant_id: TENANT_A,
      is_active: true,
      target_stamps: 5,
      reward_title: 'Free Wash A'
    })

    // Insert 5 visits linked to pending struk
    for (let i = 0; i < 5; i++) {
      const strukId = `STR-PENDING-${i}`
      await db.from('struk').insert({
        tenant_id: TENANT_A,
        id_struk: strukId,
        status_bayar: 'Pending'
      })
      await db.from('carwash').insert({
        tenant_id: TENANT_A,
        plat: PLATE_A,
        id_struk: strukId,
        status: 'Dalam Antrian',
        status_bayar: 'Pending'
      })
    }

    await expect(
      db.rpc('redeem_customer_reward', {
        p_tenant_id: TENANT_A,
        p_plat: PLATE_A,
        p_reward_title: 'Free Wash A'
      })
    ).rejects.toThrow(/Stamp kunjungan belum cukup atau reward sudah diklaim/i)
  })

  it('TC_05 (AC-12): Allows legitimate redemption and handles idempotent replay with same id_struk', async () => {
    setActiveActorContext({
      userId: 'user_owner_a',
      role: 'Owner',
      tenant_id: TENANT_A,
      is_active: true
    })

    await db.from('crm_loyalty_programs').insert({
      tenant_id: TENANT_A,
      is_active: true,
      target_stamps: 5,
      reward_title: 'Free Wash A'
    })

    // Insert 5 fully paid visits
    for (let i = 0; i < 5; i++) {
      const strukId = `STR-PAID-${i}`
      await db.from('struk').insert({
        tenant_id: TENANT_A,
        id_struk: strukId,
        status_bayar: 'Selesai'
      })
      await db.from('carwash').insert({
        tenant_id: TENANT_A,
        plat: PLATE_A,
        id_struk: strukId,
        status: 'Selesai Dicuci',
        status_bayar: 'Selesai'
      })
    }

    // 1st claim with id_struk
    const res1 = await db.rpc('redeem_customer_reward', {
      p_tenant_id: TENANT_A,
      p_plat: PLATE_A,
      p_reward_title: 'Free Wash A',
      p_id_struk: 'STR-CLAIM-001'
    })

    expect(res1.data).toBeDefined()
    expect(res1.data.redemption_id).toMatch(/^red_/)
    expect(res1.data.tenant_id).toBe(TENANT_A)

    // Replay with exact same id_struk returns idempotent record without double-consuming stamps
    const res2 = await db.rpc('redeem_customer_reward', {
      p_tenant_id: TENANT_A,
      p_plat: PLATE_A,
      p_reward_title: 'Free Wash A',
      p_id_struk: 'STR-CLAIM-001'
    })

    expect(res2.data.redemption_id).toBe(res1.data.redemption_id)
    expect(res2.data.idempotent_replay).toBe(true)

    // Verify only 1 log row was created in crm_loyalty_logs
    const logs = (await db.from('crm_loyalty_logs').select('*').eq('tenant_id', TENANT_A)).data
    expect(logs).toHaveLength(1)
  })
})
