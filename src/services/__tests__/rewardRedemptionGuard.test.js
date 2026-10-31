import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID } from '../localDbEngine.js'
import { redeemCustomerReward, recordLoyaltyClaim, lookupCustomerByPlate, aggregateCustomerCRMData } from '../crmService.js'

const plate = 'QA 0000 ZZ'
let db
const input = () => ({ tenant_id: DEFAULT_TENANT_ID, plat: plate, reward_title: 'QA reward' })
async function visits(count, extra = {}) {
  for (let i = 0; i < count; i++) {
    const { error } = await db.from('carwash').insert({ tenant_id: DEFAULT_TENANT_ID, plat: plate, harga: 50000, tanggal: '2026-10-01', ...extra })
    if (error) throw error
  }
}
async function logs() { return (await db.from('crm_loyalty_logs').select('*').eq('plat', plate)).data }

describe('Reward redemption eligibility and one-time entitlement', () => {
  beforeEach(() => { db = createLocalClient(); db.erp.resetDatabase() })

  it('rejects a plate with no qualifying visits without recording a claim', async () => {
    await expect(redeemCustomerReward(db, input())).rejects.toThrow(/stamp|kunjungan|reward/i)
    expect(await logs()).toHaveLength(0)
  })

  it('allows one earned reward and rejects sequential replay with equivalent plate formatting', async () => {
    await visits(5)
    await expect(redeemCustomerReward(db, input())).resolves.toMatchObject({ success: true })
    await expect(redeemCustomerReward(db, { ...input(), plat: 'qa0000zz' })).rejects.toThrow(/stamp|kunjungan|reward/i)
    expect(await logs()).toHaveLength(1)
    expect((await lookupCustomerByPlate(db, DEFAULT_TENANT_ID, plate)).loyalty.isRewardReady).toBe(false)
    expect((await aggregateCustomerCRMData(db, DEFAULT_TENANT_ID)).find(x => x.plat === plate).loyalty.isRewardReady).toBe(false)
  })

  it('serializes concurrent attempts, including separate local client wrappers', async () => {
    await visits(5)
    const attempts = await Promise.allSettled([redeemCustomerReward(db, input()), redeemCustomerReward(createLocalClient(), input())])
    expect(attempts.filter(x => x.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter(x => x.status === 'rejected')).toHaveLength(1)
    expect(await logs()).toHaveLength(1)
  })

  it('routes the POS claim entry point through the same guard', async () => {
    expect((await recordLoyaltyClaim(db, input())).error).toBeInstanceOf(Error)
    expect(await logs()).toHaveLength(0)
    await visits(5)
    expect((await recordLoyaltyClaim(db, { ...input(), id_struk: 'QA-SALE' })).error).toBeNull()
    await expect(redeemCustomerReward(db, input())).rejects.toThrow()
    expect((await logs())[0].id_struk).toBe('QA-SALE')
  })

  it('does not award stamps for cancelled or unpaid transactions', async () => {
    await visits(5, { status: 'Batal' })
    await visits(5, { status: 'Pending' })
    await visits(5, { id_struk: 'QA-PENDING' })
    await db.from('struk').insert({ tenant_id: DEFAULT_TENANT_ID, id_struk: 'QA-PENDING', status_bayar: 'Pending' })
    await expect(redeemCustomerReward(db, input())).rejects.toThrow()
    expect(await logs()).toHaveLength(0)
  })

  it('uses the persisted program target and allows each additional earned entitlement once', async () => {
    await db.from('crm_loyalty_programs').insert({ tenant_id: DEFAULT_TENANT_ID, target_stamps: 2 })
    await visits(4)
    await redeemCustomerReward(db, input())
    await redeemCustomerReward(db, input())
    await expect(redeemCustomerReward(db, input())).rejects.toThrow()
    expect(await logs()).toHaveLength(2)
  })

  it('does not use another tenant records to satisfy eligibility', async () => {
    await visits(5, { tenant_id: 'tenant_other' })
    await expect(redeemCustomerReward(db, input())).rejects.toThrow()
    expect(await logs()).toHaveLength(0)
  })

  it('fails closed if eligibility data cannot be read', async () => {
    const broken = { isLocal: true, from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: null, error: new Error('Read failed') }) }) }) }
    await expect(redeemCustomerReward(broken, input())).rejects.toThrow('Read failed')
  })

  it('requires an atomic cloud RPC instead of inserting claims from the browser', async () => {
    const cloud = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('RPC not installed') }), from: vi.fn() }
    await expect(redeemCustomerReward(cloud, input())).rejects.toThrow(/RPC|klaim|server/i)
    expect(cloud.rpc).toHaveBeenCalledWith('redeem_customer_reward', expect.objectContaining({ p_tenant_id: DEFAULT_TENANT_ID, p_plat: 'QA0000ZZ' }))
    expect(cloud.from).not.toHaveBeenCalled()
  })

  it('does not report success if cloud RPC returns no committed redemption', async () => {
    const cloud = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }), from: vi.fn() }
    await expect(redeemCustomerReward(cloud, input())).rejects.toThrow()
    expect(cloud.from).not.toHaveBeenCalled()
  })
})
