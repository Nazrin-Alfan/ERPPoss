import { beforeEach, describe, expect, it } from 'vitest'
import { createLocalClient, localDbStore, DEFAULT_TENANT_ID } from '../localDbEngine.js'
import { aggregateCustomerCRMData, lookupCustomerByPlate, redeemCustomerReward } from '../crmService.js'

let db
beforeEach(() => { db = createLocalClient(); localDbStore.resetDatabase(false) })

describe('CRM history remains visible independently from reward eligibility', () => {
  it('keeps the existing demo customer history when imported receipt references are missing', async () => {
    const customers = await aggregateCustomerCRMData(db, DEFAULT_TENANT_ID)
    expect(customers.length).toBeGreaterThan(0)
    expect(customers.some(customer => customer.totalVisits > 0)).toBe(true)
    expect(customers.every(customer => !customer.loyalty.isRewardReady)).toBe(true)
  })

  it('shows five historical visits without granting reward for unverifiable linked receipts', async () => {
    const plat = 'QA HISTORY 01'
    for (let i = 0; i < 5; i++) {
      await db.from('carwash').insert({ tenant_id: DEFAULT_TENANT_ID, plat, id_struk: `missing-receipt-${i}`, status: 'Selesai', harga: 50000, tanggal: '2026-10-01' })
    }
    const aggregate = (await aggregateCustomerCRMData(db, DEFAULT_TENANT_ID)).find(row => row.plat === plat)
    expect(aggregate?.totalVisits).toBe(5)
    expect(aggregate?.loyalty.isRewardReady).toBe(false)
    const lookup = await lookupCustomerByPlate(db, DEFAULT_TENANT_ID, plat)
    expect(lookup?.totalVisits).toBe(5)
    expect(lookup?.loyalty.isRewardReady).toBe(false)
    await expect(redeemCustomerReward(db, { tenant_id: DEFAULT_TENANT_ID, plat })).rejects.toThrow()
  })
})
