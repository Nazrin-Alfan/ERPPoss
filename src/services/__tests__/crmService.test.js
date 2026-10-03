import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../localDbEngine.js'
import {
  calculateRFMSegment,
  parseSpintax,
  compileWhatsAppTemplate,
  calculateLoyaltyStamps,
  aggregateCustomerCRMData,
  redeemCustomerReward,
  updateCustomerPreferenceNote,
  getLoyaltyProgramSettings,
  saveLoyaltyProgramSettings,
  lookupCustomerByPlate,
  recordLoyaltyClaim,
  upsertCRMCustomerProfile,
  DEFAULT_CRM_TEMPLATES,
  STAMP_TARGET_DEFAULT
} from '../crmService.js'

describe('Enterprise Integrated CRM & Loyalty Engine', () => {
  let db

  beforeEach(() => {
    db = createLocalClient()
    db.erp.resetDatabase()
  })

  describe('1. RFM Scoring & Churn Risk Segmentation', () => {
    const referenceDate = new Date('2026-10-01T12:00:00.000Z')

    it('should classify VIP customer correctly (visits >= 5 and recency <= 21 days)', () => {
      const lastVisit = new Date('2026-09-20T10:00:00.000Z') // 11 days ago
      const segment = calculateRFMSegment({
        totalVisits: 6,
        totalSpent: 450000,
        lastVisit,
        referenceDate
      })
      expect(segment.code).toBe('VIP')
      expect(segment.label).toContain('VIP')
      expect(segment.actionRecommendation).toBeDefined()
    })

    it('should classify Need Attention customer (recency 14 to 30 days)', () => {
      const lastVisit = new Date('2026-09-12T10:00:00.000Z') // 19 days ago
      const segment = calculateRFMSegment({
        totalVisits: 3,
        totalSpent: 150000,
        lastVisit,
        referenceDate
      })
      expect(segment.code).toBe('NEED_ATTENTION')
      expect(segment.daysSinceLastVisit).toBe(19)
    })

    it('should classify At-Risk Churning customer (recency > 30 days and visits >= 2)', () => {
      const lastVisit = new Date('2026-08-15T10:00:00.000Z') // 47 days ago
      const segment = calculateRFMSegment({
        totalVisits: 4,
        totalSpent: 280000,
        lastVisit,
        referenceDate
      })
      expect(segment.code).toBe('AT_RISK')
      expect(segment.isChurnRisk).toBe(true)
    })

    it('should classify New Customer (total visits == 1)', () => {
      const lastVisit = new Date('2026-09-30T10:00:00.000Z') // 1 day ago
      const segment = calculateRFMSegment({
        totalVisits: 1,
        totalSpent: 50000,
        lastVisit,
        referenceDate
      })
      expect(segment.code).toBe('NEW')
      expect(segment.label).toBe('Pelanggan Baru')
    })

    it('should respect custom VIP visits threshold (e.g. VIP min 3 visits)', () => {
      const lastVisit = new Date('2026-09-25T10:00:00.000Z') // 6 days ago
      const customSettings = {
        vip_min_visits: 3,
        active_days_threshold: 14,
        churn_days_threshold: 30
      }
      const segment = calculateRFMSegment({
        totalVisits: 3,
        totalSpent: 180000,
        lastVisit,
        referenceDate,
        settings: customSettings
      })
      expect(segment.code).toBe('VIP')
    })

    it('should respect custom churn threshold (e.g. 15 days churn instead of 30)', () => {
      const lastVisit = new Date('2026-09-10T10:00:00.000Z') // 21 days ago
      const customSettings = {
        churn_days_threshold: 15
      }
      const segment = calculateRFMSegment({
        totalVisits: 4,
        totalSpent: 240000,
        lastVisit,
        referenceDate,
        settings: customSettings
      })
      expect(segment.code).toBe('AT_RISK')
      expect(segment.daysSinceLastVisit).toBe(21)
    })

    it('should respect custom VIP minimum spending threshold (e.g. min Rp 500.000)', () => {
      const lastVisit = new Date('2026-09-28T10:00:00.000Z') // 3 days ago
      const customSettings = {
        vip_min_visits: 5,
        vip_min_spent: 500000,
        loyal_min_visits: 3
      }
      // 5 visits but only 250k spent -> should be LOYAL, not VIP
      const segmentNotEnoughSpent = calculateRFMSegment({
        totalVisits: 5,
        totalSpent: 250000,
        lastVisit,
        referenceDate,
        settings: customSettings
      })
      expect(segmentNotEnoughSpent.code).toBe('LOYAL')

      // 5 visits and 600k spent -> VIP
      const segmentVip = calculateRFMSegment({
        totalVisits: 5,
        totalSpent: 600000,
        lastVisit,
        referenceDate,
        settings: customSettings
      })
      expect(segmentVip.code).toBe('VIP')
    })

    it('should support permanent VIP retention mode with inactivity alert', () => {
      const lastVisit = new Date('2026-08-01T10:00:00.000Z') // 61 days ago
      const customSettings = {
        vip_min_visits: 5,
        churn_days_threshold: 30,
        vip_retention_mode: 'PERMANENT'
      }
      const segment = calculateRFMSegment({
        totalVisits: 7,
        totalSpent: 600000,
        lastVisit,
        referenceDate,
        settings: customSettings
      })
      expect(segment.code).toBe('VIP')
      expect(segment.isChurnRisk).toBe(true)
      expect(segment.label).toContain('Inaktif')
    })
  })

  describe('2. Digital Stamp Loyalty Calculations & Redemption', () => {
    it('should calculate current stamps and reward readiness for 5-stamp cycle', () => {
      const result = calculateLoyaltyStamps(7, STAMP_TARGET_DEFAULT) // 7 visits, target 5
      expect(result.stamps).toBe(2) // 7 % 5 = 2 stamps
      expect(result.rewardsEarned).toBe(1) // 1 reward earned
      expect(result.isRewardReady).toBe(false)
      expect(result.stampsRemaining).toBe(3) // 5 - 2 = 3
    })

    it('should signal reward ready when exact or threshold reached', () => {
      const result = calculateLoyaltyStamps(5, STAMP_TARGET_DEFAULT)
      expect(result.stamps).toBe(5)
      expect(result.isRewardReady).toBe(true)
      expect(result.stampsRemaining).toBe(0)
    })

    it('should adapt dynamically to custom stamp targets (e.g. 8 stamps for free coffee)', () => {
      const customTarget = 8
      const customRewardTitle = 'Gratis 1 Kopi Susu Senja di Cafe'
      const result = calculateLoyaltyStamps(8, customTarget, customRewardTitle)
      expect(result.stamps).toBe(8)
      expect(result.stampTarget).toBe(8)
      expect(result.isRewardReady).toBe(true)
      expect(result.stampsRemaining).toBe(0)
      expect(result.rewardTitle).toBe('Gratis 1 Kopi Susu Senja di Cafe')

      const midResult = calculateLoyaltyStamps(5, customTarget, customRewardTitle)
      expect(midResult.stamps).toBe(5)
      expect(midResult.isRewardReady).toBe(false)
      expect(midResult.stampsRemaining).toBe(3)
    })

    it('should save and retrieve tenant-specific custom loyalty program settings', async () => {
      const { saveLoyaltyProgramSettings, getLoyaltyProgramSettings } = await import('../crmService.js')
      
      const newSettings = {
        tenant_id: DEFAULT_TENANT_ID,
        target_stamps: 6,
        reward_type: 'FREE_CAFE',
        reward_title: 'Kopi Susu Gula Aren Gratis',
        reward_description: 'Klaim di kasir cafe setelah 6x cuci mobil'
      }

      const saveRes = await saveLoyaltyProgramSettings(db, newSettings)
      expect(saveRes.success).toBe(true)

      const fetched = await getLoyaltyProgramSettings(db, DEFAULT_TENANT_ID)
      expect(fetched.target_stamps).toBe(6)
      expect(fetched.reward_type).toBe('FREE_CAFE')
      expect(fetched.reward_title).toBe('Kopi Susu Gula Aren Gratis')
    })

    it('should record reward redemption in loyalty logs with custom reward title', async () => {
      const customerPlat = 'B 8888 RLP'
      const res = await redeemCustomerReward(db, {
        tenant_id: DEFAULT_TENANT_ID,
        plat: customerPlat,
        reward_title: 'Kopi Susu Gula Aren Gratis',
        notes: 'Klaim hadiah 6 stamp kustom'
      })

      expect(res.success).toBe(true)
      expect(res.redemptionId).toBeDefined()

      // Verify log saved in db
      const { data: logs } = await db
        .from('crm_loyalty_logs')
        .select('*')
        .eq('plat', customerPlat)
      expect(logs.length).toBe(1)
      expect(logs[0].tipe).toBe('REDEEM')
      expect(logs[0].reward_title).toBe('Kopi Susu Gula Aren Gratis')
    })
  })

  describe('3. Spintax Parser & Smart WhatsApp Retention Template', () => {
    it('should compile dynamic variables safely', () => {
      const template = 'Halo {{nama}}, mobil {{model}} plat {{plat}} sudah {{hari_lalu}} hari tidak berkunjung.'
      const compiled = compileWhatsAppTemplate(template, {
        nama: 'Pak Budi',
        model: 'Innova Reborn',
        plat: 'B 1234 ABC',
        hari_lalu: 18
      })

      expect(compiled).toBe('Halo Pak Budi, mobil Innova Reborn plat B 1234 ABC sudah 18 hari tidak berkunjung.')
    })

    it('should parse Spintax choices randomly without corrupting curly brackets', () => {
      const spintaxTemplate = '{Halo|Hai|Selamat pagi} {{nama}}'
      const parsed = parseSpintax(spintaxTemplate)
      expect(['Halo {{nama}}', 'Hai {{nama}}', 'Selamat pagi {{nama}}']).toContain(parsed)
    })

    it('should have predefined retention templates for carwash loyalty', () => {
      expect(DEFAULT_CRM_TEMPLATES.length).toBeGreaterThanOrEqual(4)
      const reminderTpl = DEFAULT_CRM_TEMPLATES.find(t => t.id === 'REMINDER_14_DAYS')
      expect(reminderTpl).toBeDefined()
      expect(reminderTpl.body).toContain('{{plat}}')
    })
  })

  describe('4. Cross-Sector Ingestion & Aggregation (Carwash + Cafe)', () => {
    it('should aggregate customer data across carwash and struk/cafe', async () => {
      // Seed test carwash transactions
      await db.from('carwash').insert([
        {
          plat: 'B 9999 CRM',
          model: 'Fortuner',
          no_telepon: '081234567890',
          harga: 60000,
          paket: 'PAKET CUCI KILAT',
          tanggal: '2026-09-10',
          tenant_id: DEFAULT_TENANT_ID
        },
        {
          plat: 'B 9999 CRM',
          model: 'Fortuner',
          no_telepon: '081234567890',
          harga: 80000,
          paket: 'PAKET CUCI WAX',
          tanggal: '2026-09-25',
          tenant_id: DEFAULT_TENANT_ID
        }
      ])

      // Seed test struk / cafe transaction with same customer plat/name
      await db.from('struk').insert([
        {
          id_struk: 'STRUK-CRM-01',
          nama_pelanggan: 'B 9999 CRM',
          total: 55000,
          status_bayar: 'Selesai',
          tenant_id: DEFAULT_TENANT_ID
        }
      ])

      const customers = await aggregateCustomerCRMData(db, DEFAULT_TENANT_ID)
      expect(customers.length).toBeGreaterThan(0)

      const target = customers.find(c => c.plat === 'B 9999 CRM')
      expect(target).toBeDefined()
      expect(target.totalVisits).toBe(2)
      expect(target.carwashSpent).toBe(140000)
      expect(target.cafeSpent).toBe(55000)
      expect(target.totalSpent).toBe(195000)
      expect(target.loyalty.stamps).toBe(2)
    })

    it('should enforce multi-tenant isolation on CRM data', async () => {
      // Insert for other tenant
      await db.from('carwash').insert([
        {
          plat: 'D 1111 T2',
          model: 'Avanza',
          harga: 50000,
          tenant_id: 'tenant_demo_carwash'
        }
      ])

      const defaultTenantCustomers = await aggregateCustomerCRMData(db, DEFAULT_TENANT_ID)
      const foreign = defaultTenantCustomers.find(c => c.plat === 'D 1111 T2')
      expect(foreign).toBeUndefined()
    })
  })

  describe('5. Customer Preferences & Special Handling Notes', () => {
    it('should save and update customer special preference notes', async () => {
      const plat = 'B 7777 VIP'
      const note = 'Jok kulit nappa: Jangan disemprot parfum interior cair!'

      const updateRes = await updateCustomerPreferenceNote(db, {
        tenant_id: DEFAULT_TENANT_ID,
        plat,
        catatan: note,
        nama_pelanggan: 'Sultan B'
      })

      expect(updateRes.success).toBe(true)

      const { data } = await db
        .from('crm_customers')
        .select('*')
        .eq('plat', plat)

      expect(data.length).toBe(1)
      expect(data[0].catatan_khusus).toBe(note)
      expect(data[0].nama).toBe('Sultan B')
    })
  })

  describe('6. Custom Loyalty Program & CRM RFM Thresholds Management', () => {
    it('should save and retrieve custom loyalty & VIP thresholds for tenant', async () => {
      const customConfig = {
        tenant_id: DEFAULT_TENANT_ID,
        target_stamps: 7,
        reward_type: 'FREE_SERVICE',
        reward_title: 'Gratis 1x Cuci Detailing Mesin',
        reward_description: 'Capai 7 stamp untuk detailing mesin gratis.',
        vip_min_visits: 4,
        vip_min_spent: 300000,
        loyal_min_visits: 2,
        active_days_threshold: 10,
        churn_days_threshold: 25,
        vip_retention_mode: 'PERMANENT'
      }

      await saveLoyaltyProgramSettings(db, customConfig)

      const saved = await getLoyaltyProgramSettings(db, DEFAULT_TENANT_ID)
      expect(saved.target_stamps).toBe(7)
      expect(saved.reward_title).toBe('Gratis 1x Cuci Detailing Mesin')
      expect(saved.vip_min_visits).toBe(4)
      expect(saved.vip_min_spent).toBe(300000)
      expect(saved.loyal_min_visits).toBe(2)
      expect(saved.active_days_threshold).toBe(10)
      expect(saved.churn_days_threshold).toBe(25)
      expect(saved.vip_retention_mode).toBe('PERMANENT')
    })

    it('should apply tenant custom VIP thresholds in aggregateCustomerCRMData', async () => {
      // Set tenant custom VIP threshold to 3 visits (instead of 5)
      await saveLoyaltyProgramSettings(db, {
        tenant_id: DEFAULT_TENANT_ID,
        target_stamps: 3,
        vip_min_visits: 3,
        active_days_threshold: 14,
        churn_days_threshold: 30
      })

      // Insert 3 recent carwash transactions for customer B 3333 CUS
      await db.from('carwash').insert([
        { plat: 'B 3333 CUS', model: 'Jazz', harga: 50000, tanggal: '2026-09-20', tenant_id: DEFAULT_TENANT_ID },
        { plat: 'B 3333 CUS', model: 'Jazz', harga: 50000, tanggal: '2026-09-25', tenant_id: DEFAULT_TENANT_ID },
        { plat: 'B 3333 CUS', model: 'Jazz', harga: 50000, tanggal: '2026-09-29', tenant_id: DEFAULT_TENANT_ID }
      ])

      const customers = await aggregateCustomerCRMData(db, DEFAULT_TENANT_ID, new Date('2026-10-01T12:00:00.000Z'))
      const customer = customers.find(c => c.plat === 'B 3333 CUS')

      expect(customer).toBeDefined()
      expect(customer.totalVisits).toBe(3)
      // With custom threshold of 3, 3 visits qualifies as VIP!
      expect(customer.rfm.code).toBe('VIP')
      expect(customer.segment).toBe('VIP (Pelanggan Setia)')
    })
  })

  describe('5. Real-time POS Cashier CRM Integration (Two-Way)', () => {
    it('should perform fast lookup by plate number including plat_nomor from Carwash POS', async () => {
      // Insert customer profile
      await db.from('crm_customers').insert([
        {
          tenant_id: DEFAULT_TENANT_ID,
          plat: 'BK 1968 LNA',
          nama_pelanggan: 'Pak Budi',
          no_whatsapp: '081298765432',
          model_kendaraan: 'Fortuner GR',
          catatan_khusus: 'Velg doff, gunakan sabun pH netral'
        }
      ])

      // Insert 5 carwash visits with plat_nomor (as saved by CarwashPOSPage)
      for (let i = 1; i <= 5; i++) {
        await db.from('carwash').insert([
          {
            plat_nomor: 'BK 1968 LNA',
            model: 'Fortuner GR',
            harga: 60000,
            tanggal: `2026-09-2${i}`,
            tenant_id: DEFAULT_TENANT_ID
          }
        ])
      }

      const lookup = await lookupCustomerByPlate(db, DEFAULT_TENANT_ID, 'BK 1968 LNA')
      expect(lookup).toBeDefined()
      expect(lookup.totalVisits).toBe(5)
      expect(lookup.model).toBe('Fortuner GR')
      expect(lookup.noTelepon).toBe('081298765432')
      expect(lookup.catatanKhusus).toContain('Velg doff')
      expect(lookup.segment.code).toBe('VIP')
      expect(lookup.loyalty.isRewardReady).toBe(true) // 5 visits % 5 target = 0 -> reward ready!
    })

    it('should record loyalty reward redemption from POS cashier', async () => {
      const res = await recordLoyaltyClaim(db, {
        tenant_id: DEFAULT_TENANT_ID,
        plat: 'BK 1968 LNA',
        nama_pelanggan: 'Pak Budi',
        reward_title: 'Gratis 1x Cuci Mobil Salju',
        reward_type: 'FREE_SERVICE',
        id_struk: 'STRUK-POS-100',
        notes: 'Klaim hadiah gratis cuci dari POS Kasir'
      })
      expect(res.error).toBeFalsy()

      const { data: logs } = await db
        .from('crm_loyalty_logs')
        .select('*')
        .eq('plat', 'BK 1968 LNA')

      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].reward_title).toBe('Gratis 1x Cuci Mobil Salju')
      expect(logs[0].id_struk).toBe('STRUK-POS-100')
    })

    it('should upsert customer CRM profile from POS cashier input', async () => {
      await upsertCRMCustomerProfile(db, {
        tenant_id: DEFAULT_TENANT_ID,
        plat: 'B 777 NEW',
        nama_pelanggan: 'Ibu Siti',
        no_whatsapp: '081300001111',
        model_kendaraan: 'Honda HRV',
        catatan_khusus: 'Interior jangan disemprot parfum'
      })

      const { data } = await db
        .from('crm_customers')
        .select('*')
        .eq('plat', 'B 777 NEW')

      expect(data.length).toBe(1)
      expect(data[0].model_kendaraan).toBe('Honda HRV')
      expect(data[0].catatan_khusus).toContain('parfum')
    })
  })
})
