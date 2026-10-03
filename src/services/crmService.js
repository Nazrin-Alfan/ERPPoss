/**
 * Enterprise Integrated CRM & Loyalty Engine for RelayPOS
 * Multi-tenant isolation, RFM Scoring, Digital Stamp Loyalty,
 * Spintax WhatsApp Retention, & Cross-Sector (Carwash ⇄ Cafe) Consolidator.
 */

import { DEFAULT_TENANT_ID } from '../constants/erpConfig.js'

export const STAMP_TARGET_DEFAULT = 5

export const DEFAULT_CRM_SETTINGS = {
  // 1. Loyalty Program Settings
  target_stamps: 5,
  reward_type: 'FREE_SERVICE',
  reward_title: 'Gratis 1x Cuci Mobil Salju',
  reward_description: 'Kumpulkan 5 stamp cuci mobil untuk klaim 1x cuci mobil salju gratis.',

  // 2. Custom VIP & RFM Thresholds
  vip_min_visits: 5,            // Minimal total kunjungan untuk jadi VIP (Default: 5)
  vip_min_spent: 0,             // Minimal total pengeluaran untuk jadi VIP (Default: Rp 0 / opsional)
  loyal_min_visits: 3,          // Minimal total kunjungan untuk Pelanggan Reguler (Default: 3)
  active_days_threshold: 14,    // Batas hari terhitung aktif baru-baru ini (Default: 14 hari)
  warning_days_threshold: 30,   // Ambang batas perlu follow-up (Default: 14-30 hari)
  churn_days_threshold: 30,     // Ambang batas berisiko churn/hilang (Default: > 30 hari)
  vip_retention_mode: 'DYNAMIC' // 'DYNAMIC' (prioritaskan status Churn) | 'PERMANENT' (gelar VIP tetap dengan label inaktif)
}

export const DEFAULT_LOYALTY_PROGRAM = DEFAULT_CRM_SETTINGS

export const DEFAULT_CRM_TEMPLATES = [
  {
    id: 'REMINDER_14_DAYS',
    title: 'Pengingat Cuci Berkala (14-30 Hari)',
    description: 'Cocok untuk pelanggan yang sudah 2-4 minggu tidak berkunjung.',
    body: '{Halo|Hai|Selamat pagi} {{nama}}, mobil {{model}} ({{plat}}) terakhir dicuci {{hari_lalu}} hari yang lalu. Yuk mampir cuci lagi hari ini agar cat mobil tetap kinclong & terlindungi! Dapatkan gratis kopi/teh saat menunggu.'
  },
  {
    id: 'VIP_REWARD',
    title: 'Apresiasi Pelanggan VIP / Loyalty Reward',
    description: 'Kirimkan ucapan terima kasih dan info reward gratis cuci.',
    body: 'Terima kasih banyak {{nama}}! Sebagai pelanggan setia kami (Total {{total_kunjungan}}x cuci), mobil {{plat}} berhak atas bonus loyalty spesial. Tunjukkan pesan ini ke kasir saat kunjungan berikutnya!'
  },
  {
    id: 'WINBACK_CHURN',
    title: 'Winback Churn (>30 Hari Tidak Datang)',
    description: 'Penawaran diskon khusus untuk pelanggan lama yang sudah lama tidak berkunjung.',
    body: '{Halo|Hai|Selamat siang} {{nama}}, kami kangen dengan mobil {{model}} ({{plat}}). Sudah {{hari_lalu}} hari Anda belum mampir. Kami sediakan voucher diskon 20% untuk cuci detailing hari ini! Balas pesan ini untuk klaim voucher.'
  },
  {
    id: 'WELCOME_NEW',
    title: 'Sambutan Pelanggan Baru (1x Cuci)',
    description: 'Membangun impresi pertama yang hangat setelah kunjungan perdana.',
    body: 'Terima kasih telah mempercayakan cuci mobil {{model}} ({{plat}}) di RelayPOS hari ini. Kami harap Anda puas dengan hasil kerja kru kami. Simpan nomor ini untuk reservasi cepat antrean!'
  }
]

/**
 * Evaluates Customer RFM Segment based on Recency, Frequency, and Monetary metrics.
 * Supports configurable thresholds per tenant/outlet.
 */
export function calculateRFMSegment({
  totalVisits = 0,
  totalSpent = 0,
  lastVisit = null,
  referenceDate = new Date(),
  settings = DEFAULT_CRM_SETTINGS
}) {
  const refTime = referenceDate instanceof Date ? referenceDate.getTime() : new Date(referenceDate).getTime()
  const lastTime = lastVisit ? (lastVisit instanceof Date ? lastVisit.getTime() : new Date(lastVisit).getTime()) : refTime
  
  const diffMs = Math.max(0, refTime - lastTime)
  const daysSinceLastVisit = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  const activeDays = settings?.active_days_threshold !== undefined ? Number(settings.active_days_threshold) : 14
  const churnDays = settings?.churn_days_threshold !== undefined ? Number(settings.churn_days_threshold) : 30
  const vipVisits = settings?.vip_min_visits !== undefined ? Number(settings.vip_min_visits) : 5
  const vipMinSpent = settings?.vip_min_spent !== undefined ? Number(settings.vip_min_spent) : 0
  const loyalVisits = settings?.loyal_min_visits !== undefined ? Number(settings.loyal_min_visits) : 3
  const retentionMode = settings?.vip_retention_mode || 'DYNAMIC'

  const isVipQualified = totalVisits >= vipVisits && totalSpent >= vipMinSpent

  // Mode PERMANENT: Gelar VIP tetap melekat, namun flag & label mencatat status keaktifan
  if (retentionMode === 'PERMANENT' && isVipQualified) {
    if (daysSinceLastVisit > churnDays) {
      return {
        code: 'VIP',
        label: `VIP (Inaktif >${churnDays} Hari)`,
        badgeClass: 'bg-emerald-500/15 text-emerald-400 border-amber-500/40',
        daysSinceLastVisit,
        isChurnRisk: true,
        actionRecommendation: 'Hubungi pelanggan VIP ini segera dengan promo eksklusif untuk mengaktifkan kembali kunjungannya.'
      }
    }
    if (daysSinceLastVisit > activeDays) {
      return {
        code: 'VIP',
        label: 'VIP (Perlu Follow-Up)',
        badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        daysSinceLastVisit,
        isChurnRisk: false,
        actionRecommendation: 'Kirimkan WhatsApp ramah menawarkan reservasi slot cuci atau voucher minuman.'
      }
    }
    return {
      code: 'VIP',
      label: 'VIP (Pelanggan Setia)',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      daysSinceLastVisit,
      isChurnRisk: false,
      actionRecommendation: 'Berikan perlakuan VIP, jalur cepat pengerjaan, dan voucher apresiasi.'
    }
  }

  // Mode DYNAMIC (Default): Prioritaskan penanganan Churn & Follow-Up
  // 1. At-Risk / Churning: Formerly active (>1 visit) but inactive beyond churn threshold
  if (daysSinceLastVisit > churnDays && totalVisits >= 2) {
    return {
      code: 'AT_RISK',
      label: `Berisiko Churn (>${churnDays} Hari)`,
      badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      daysSinceLastVisit,
      isChurnRisk: true,
      actionRecommendation: 'Kirimkan pesan winback dengan voucher diskon eksklusif 20%.'
    }
  }

  // 2. Need Attention: Inactive between activeDays and churnDays
  if (daysSinceLastVisit >= activeDays && daysSinceLastVisit <= churnDays && totalVisits >= 1) {
    return {
      code: 'NEED_ATTENTION',
      label: `Perlu Follow-Up (${activeDays}-${churnDays} Hari)`,
      badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      daysSinceLastVisit,
      isChurnRisk: false,
      actionRecommendation: 'Kirimkan WhatsApp reminder cuci berkala dengan penawaran minuman cafe.'
    }
  }

  // 3. VIP (Champions): High frequency + monetary qualified and recently active
  if (isVipQualified) {
    return {
      code: 'VIP',
      label: 'VIP (Pelanggan Setia)',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      daysSinceLastVisit,
      isChurnRisk: false,
      actionRecommendation: 'Berikan perlakuan VIP, jalur cepat pengerjaan, dan voucher apresiasi.'
    }
  }

  // 4. Loyal Customer: Regular visits
  if (totalVisits >= loyalVisits) {
    return {
      code: 'LOYAL',
      label: 'Pelanggan Reguler',
      badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      daysSinceLastVisit,
      isChurnRisk: false,
      actionRecommendation: 'Tawarkan paket stamp loyalty untuk mendorong menuju level VIP.'
    }
  }

  // 5. New Customer: Single visit
  if (totalVisits <= 1) {
    return {
      code: 'NEW',
      label: 'Pelanggan Baru',
      badgeClass: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
      daysSinceLastVisit,
      isChurnRisk: false,
      actionRecommendation: 'Kirimkan pesan terima kasih dan undang untuk kunjungan kedua.'
    }
  }

  // Default fallback
  return {
    code: 'REGULAR',
    label: 'Pelanggan Biasa',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    daysSinceLastVisit,
    isChurnRisk: false,
    actionRecommendation: 'Pertahankan kualitas layanan standar.'
  }
}

/**
 * Calculates digital stamp progress and reward readiness.
 */
export function calculateLoyaltyStamps(
  totalVisits = 0,
  stampTarget = STAMP_TARGET_DEFAULT,
  rewardTitle = DEFAULT_LOYALTY_PROGRAM.reward_title
) {
  const target = Math.max(1, parseInt(stampTarget, 10) || STAMP_TARGET_DEFAULT)
  const currentStampsInCycle = totalVisits % target
  const rewardsEarned = Math.floor(totalVisits / target)
  const isRewardReady = totalVisits > 0 && currentStampsInCycle === 0
  const effectiveStamps = isRewardReady ? target : currentStampsInCycle
  const stampsRemaining = isRewardReady ? 0 : target - currentStampsInCycle

  return {
    stamps: effectiveStamps,
    stampTarget: target,
    rewardsEarned,
    isRewardReady,
    stampsRemaining,
    rewardTitle: rewardTitle || DEFAULT_LOYALTY_PROGRAM.reward_title
  }
}

/**
 * Retrieves the tenant's loyalty & CRM settings.
 */
export async function getLoyaltyProgramSettings(db, tenantId = DEFAULT_TENANT_ID) {
  if (!db) return DEFAULT_CRM_SETTINGS
  try {
    const { data } = await db
      .from('crm_loyalty_programs')
      .select('*')
      .eq('tenant_id', tenantId)

    if (data && data.length > 0) {
      const row = data[0]
      return {
        ...DEFAULT_CRM_SETTINGS,
        ...row,
        target_stamps: parseInt(row.target_stamps, 10) || DEFAULT_CRM_SETTINGS.target_stamps,
        vip_min_visits: row.vip_min_visits !== undefined && row.vip_min_visits !== null ? parseInt(row.vip_min_visits, 10) : DEFAULT_CRM_SETTINGS.vip_min_visits,
        vip_min_spent: row.vip_min_spent !== undefined && row.vip_min_spent !== null ? parseFloat(row.vip_min_spent) : DEFAULT_CRM_SETTINGS.vip_min_spent,
        loyal_min_visits: row.loyal_min_visits !== undefined && row.loyal_min_visits !== null ? parseInt(row.loyal_min_visits, 10) : DEFAULT_CRM_SETTINGS.loyal_min_visits,
        active_days_threshold: row.active_days_threshold !== undefined && row.active_days_threshold !== null ? parseInt(row.active_days_threshold, 10) : DEFAULT_CRM_SETTINGS.active_days_threshold,
        churn_days_threshold: row.churn_days_threshold !== undefined && row.churn_days_threshold !== null ? parseInt(row.churn_days_threshold, 10) : DEFAULT_CRM_SETTINGS.churn_days_threshold,
        vip_retention_mode: row.vip_retention_mode || DEFAULT_CRM_SETTINGS.vip_retention_mode
      }
    }
  } catch (err) {
    console.warn('Error fetching loyalty program settings, fallback to default:', err)
  }
  return DEFAULT_CRM_SETTINGS
}

/**
 * Saves or updates tenant-specific loyalty & CRM settings.
 */
export async function saveLoyaltyProgramSettings(db, {
  tenant_id = DEFAULT_TENANT_ID,
  target_stamps = 5,
  reward_type = 'FREE_SERVICE',
  reward_title = 'Gratis 1x Cuci Mobil Salju',
  reward_description = '',
  vip_min_visits = 5,
  vip_min_spent = 0,
  loyal_min_visits = 3,
  active_days_threshold = 14,
  churn_days_threshold = 30,
  vip_retention_mode = 'DYNAMIC'
}) {
  if (!db) throw new Error('Database client required.')

  const payload = {
    target_stamps: Math.max(1, parseInt(target_stamps, 10) || 5),
    reward_type,
    reward_title,
    reward_description,
    vip_min_visits: Math.max(1, parseInt(vip_min_visits, 10) || 5),
    vip_min_spent: Math.max(0, parseFloat(vip_min_spent) || 0),
    loyal_min_visits: Math.max(1, parseInt(loyal_min_visits, 10) || 3),
    active_days_threshold: Math.max(1, parseInt(active_days_threshold, 10) || 14),
    churn_days_threshold: Math.max(1, parseInt(churn_days_threshold, 10) || 30),
    vip_retention_mode: vip_retention_mode || 'DYNAMIC',
    updated_at: new Date().toISOString()
  }

  const { data: existing } = await db
    .from('crm_loyalty_programs')
    .select('*')
    .eq('tenant_id', tenant_id)

  if (existing && existing.length > 0) {
    const { error } = await db
      .from('crm_loyalty_programs')
      .update(payload)
      .eq('id', existing[0].id)

    if (error) throw error
  } else {
    const { error } = await db
      .from('crm_loyalty_programs')
      .insert({
        id: `prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenant_id,
        ...payload,
        is_active: true,
        created_at: new Date().toISOString()
      })

    if (error) throw error
  }

  return { success: true }
}

/**
 * Parses Spintax syntax {Option A|Option B|Option C} randomly.
 * Safe from prototype pollution.
 */
export function parseSpintax(text = '') {
  if (!text || typeof text !== 'string') return ''
  
  // Safe regex requiring pipe to avoid matching lone braces
  const spintaxRegex = /\{([^{}|]*\|[^{}]*)\}/g
  let result = text

  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (_, choices) => {
      const parts = choices.split('|')
      const chosen = parts[Math.floor(Math.random() * parts.length)]
      return chosen || ''
    })
  }

  return result
}

/**
 * Substitutes variables {{var}} and evaluates Spintax.
 */
export function compileWhatsAppTemplate(templateStr = '', variables = {}) {
  if (!templateStr) return ''

  // 1. Substitute double curly variables first
  let compiled = templateStr.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key) && variables[key] !== undefined && variables[key] !== null) {
      return String(variables[key])
    }
    return match
  })

  // 2. Parse Spintax choices
  compiled = parseSpintax(compiled)

  return compiled.trim()
}

/**
 * Aggregates full CRM customer data from Carwash, Struk (Cafe & POS), and CRM tables.
 */
export async function aggregateCustomerCRMData(db, tenantId = DEFAULT_TENANT_ID, referenceDate = new Date()) {
  if (!db) return []

  // 1. Fetch carwash transactions
  const { data: carwashRecords = [] } = await db
    .from('carwash')
    .select('*')
    .eq('tenant_id', tenantId)

  // 2. Fetch Struk transactions (for Cafe & cross-selling)
  const { data: strukRecords = [] } = await db
    .from('struk')
    .select('*')
    .eq('tenant_id', tenantId)

  // 3. Fetch custom customer profile notes & preference records
  const { data: crmCustomers = [] } = await db
    .from('crm_customers')
    .select('*')
    .eq('tenant_id', tenantId)

  // 4. Fetch reward redemption logs
  const { data: loyaltyLogs = [] } = await db
    .from('crm_loyalty_logs')
    .select('*')
    .eq('tenant_id', tenantId)

  const crmProfileMap = new Map()
  ;(crmCustomers || []).forEach(c => {
    if (c.plat) crmProfileMap.set(c.plat.trim().toUpperCase(), c)
  })

  const customerMap = {}

  // Process Carwash visits
  ;(carwashRecords || []).forEach(cw => {
    const rawPlat = cw.plat_nomor || cw.plat || ''
    if (!rawPlat || !rawPlat.trim()) return
    const plat = rawPlat.trim().toUpperCase().replace(/\s+/g, ' ')

    if (!customerMap[plat]) {
      customerMap[plat] = {
        plat,
        nama: cw.nama_pelanggan || cw.nama || '',
        model: cw.model || 'Mobil',
        noTelepon: cw.no_telepon || '-',
        totalVisits: 0,
        carwashSpent: 0,
        cafeSpent: 0,
        totalSpent: 0,
        firstVisit: cw.tanggal || cw.created_at,
        lastVisit: cw.tanggal || cw.created_at,
        favoritePackageMap: {},
        visitsHistory: [],
        catatanKhusus: ''
      }
    }

    const c = customerMap[plat]
    c.totalVisits += 1
    const price = parseFloat(cw.harga || 0)
    c.carwashSpent += price
    c.totalSpent += price

    // Track latest and earliest dates
    const currentDate = cw.tanggal || cw.created_at
    if (new Date(currentDate).getTime() > new Date(c.lastVisit).getTime()) {
      c.lastVisit = currentDate
    }
    if (new Date(currentDate).getTime() < new Date(c.firstVisit).getTime()) {
      c.firstVisit = currentDate
    }

    if (cw.model) c.model = cw.model
    if (cw.no_telepon && cw.no_telepon !== '-') c.noTelepon = cw.no_telepon
    if (cw.nama_pelanggan && !c.nama) c.nama = cw.nama_pelanggan

    const pkt = (cw.paket && cw.paket.trim()) ? cw.paket.trim() : 'PAKET CUCI BIASA'
    c.favoritePackageMap[pkt] = (c.favoritePackageMap[pkt] || 0) + 1

    c.visitsHistory.push({
      id: cw.id || cw.id_antrean || `cw_${Math.random()}`,
      visitNumber: c.totalVisits,
      tanggal: cw.tanggal || cw.created_at,
      jam: cw.jam || '',
      paket: pkt,
      ukuran: cw.ukuran || 'Medium',
      variant: cw.variant || 'Regular',
      harga: price,
      pencuci: `${cw.anggota_1 || ''} ${cw.anggota_2 ? '+ ' + cw.anggota_2 : ''}`.trim()
    })
  })

  // Correlate Cafe transactions via struk (matching customer name with plat or registered name)
  ;(strukRecords || []).forEach(s => {
    if (!s.nama_pelanggan || !s.nama_pelanggan.trim()) return
    const custKey = s.nama_pelanggan.trim().toUpperCase()

    // If customer plate matches directly
    if (customerMap[custKey]) {
      const c = customerMap[custKey]
      const total = parseFloat(s.total || s.grand_total || 0)
      c.cafeSpent += total
      c.totalSpent += total
    }
  })

  // Fetch tenant custom loyalty program settings
  const loyaltyProgram = await getLoyaltyProgramSettings(db, tenantId)

  // Finalize enrichment with RFM, Loyalty, and Saved Profiles
  return Object.values(customerMap).map(cust => {
    // Determine favorite package
    let favPkg = 'PAKET CUCI BIASA'
    let maxCount = 0
    Object.entries(cust.favoritePackageMap).forEach(([pkg, count]) => {
      if (count > maxCount) {
        maxCount = count
        favPkg = pkg
      }
    })

    // Attach saved profile notes if present
    const profile = crmProfileMap.get(cust.plat)
    if (profile) {
      if (profile.nama) cust.nama = profile.nama
      if (profile.no_whatsapp) cust.noTelepon = profile.no_whatsapp
      if (profile.catatan_khusus) cust.catatanKhusus = profile.catatan_khusus
    }

    // RFM calculation with tenant custom settings
    const rfm = calculateRFMSegment({
      totalVisits: cust.totalVisits,
      totalSpent: cust.totalSpent,
      lastVisit: cust.lastVisit,
      referenceDate,
      settings: loyaltyProgram
    })

    // Digital stamp calculation with custom settings
    const loyalty = calculateLoyaltyStamps(
      cust.totalVisits,
      loyaltyProgram.target_stamps,
      loyaltyProgram.reward_title
    )

    return {
      ...cust,
      favPkg,
      rfm,
      loyalty,
      segment: rfm.label,
      segmentBadge: rfm.badgeClass,
      daysSinceLastVisit: rfm.daysSinceLastVisit
    }
  }).sort((a, b) => b.totalVisits - a.totalVisits)
}

/**
 * Records reward redemption in loyalty logs.
 */
export async function redeemCustomerReward(db, {
  tenant_id = DEFAULT_TENANT_ID,
  plat = '',
  reward_title = '',
  notes = 'Free Cuci Diklaim'
}) {
  if (!db || !plat) throw new Error('Database client and customer plate required.')

  const redemptionId = `red_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  const record = {
    id: redemptionId,
    tenant_id,
    plat: plat.trim().toUpperCase(),
    tipe: 'REDEEM',
    reward_title: reward_title || DEFAULT_LOYALTY_PROGRAM.reward_title,
    keterangan: notes,
    created_at: new Date().toISOString()
  }

  const { error } = await db.from('crm_loyalty_logs').insert(record)
  if (error) throw error

  return { success: true, redemptionId }
}

/**
 * Updates or creates customer preference note and contact details.
 */
export async function updateCustomerPreferenceNote(db, {
  tenant_id = DEFAULT_TENANT_ID,
  plat = '',
  catatan = '',
  nama_pelanggan = '',
  no_whatsapp = ''
}) {
  if (!db || !plat) throw new Error('Database client and customer plate required.')

  const normalizedPlat = plat.trim().toUpperCase()
  
  // Check if profile exists
  const { data: existing } = await db
    .from('crm_customers')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('plat', normalizedPlat)

  if (existing && existing.length > 0) {
    const existingId = existing[0].id
    const updates = {
      updated_at: new Date().toISOString()
    }
    if (catatan !== undefined) updates.catatan_khusus = catatan
    if (nama_pelanggan) updates.nama = nama_pelanggan
    if (no_whatsapp) updates.no_whatsapp = no_whatsapp

    const { error } = await db
      .from('crm_customers')
      .update(updates)
      .eq('id', existingId)

    if (error) throw error
  } else {
    const newRecord = {
      id: `crm_cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id,
      plat: normalizedPlat,
      nama: nama_pelanggan || '',
      no_whatsapp: no_whatsapp || '',
      catatan_khusus: catatan || '',
      created_at: new Date().toISOString()
    }

    const { error } = await db.from('crm_customers').insert(newRecord)
    if (error) throw error
  }

  return { success: true }
}

/**
 * Fast lookup for a customer's CRM profile, RFM segment, and loyalty status by license plate.
 * Dedicated for real-time POS Cashier intake and reactive banners.
 */
export async function lookupCustomerByPlate(db, tenantId = DEFAULT_TENANT_ID, plateQuery = '') {
  if (!db || !plateQuery || !plateQuery.trim()) return null
  const cleanQuery = plateQuery.trim().toUpperCase()
  const rawClean = cleanQuery.replace(/\s+/g, '')

  // 1. Fetch loyalty program settings for this tenant
  const settings = await getLoyaltyProgramSettings(db, tenantId)

  // 2. Fetch carwash visits matching plate
  const { data: cwData = [] } = await db
    .from('carwash')
    .select('*')
    .eq('tenant_id', tenantId)

  const matchingCw = (cwData || []).filter(cw => {
    const rawPlat = (cw.plat_nomor || cw.plat || '').trim().toUpperCase()
    return rawPlat === cleanQuery || rawPlat.replace(/\s+/g, '') === rawClean
  })

  // 3. Fetch Struk records for cafe spend correlation
  const { data: strukData = [] } = await db
    .from('struk')
    .select('*')
    .eq('tenant_id', tenantId)

  const matchingStruk = (strukData || []).filter(s => {
    const cust = (s.nama_pelanggan || '').trim().toUpperCase()
    return cust === cleanQuery || cust.replace(/\s+/g, '') === rawClean
  })

  // 4. Fetch CRM customer profile
  const { data: crmData = [] } = await db
    .from('crm_customers')
    .select('*')
    .eq('tenant_id', tenantId)

  const profile = (crmData || []).find(c => {
    const p = (c.plat || '').trim().toUpperCase()
    return p === cleanQuery || p.replace(/\s+/g, '') === rawClean
  })

  // If no carwash and no profile found, return null (brand new unregistered plate)
  if (matchingCw.length === 0 && !profile) {
    return null
  }

  // Calculate metrics
  const totalVisits = matchingCw.length
  let carwashSpent = 0
  let latestDate = null
  let lastModel = profile?.model_kendaraan || profile?.model || ''
  let lastPhone = profile?.no_whatsapp || profile?.no_telepon || ''
  let notes = profile?.catatan_khusus || profile?.catatan || ''
  let custName = profile?.nama_pelanggan || profile?.nama || ''

  matchingCw.forEach(cw => {
    const price = parseFloat(cw.harga || 0)
    carwashSpent += price
    const date = cw.tanggal || cw.created_at
    if (!latestDate || new Date(date).getTime() > new Date(latestDate).getTime()) {
      latestDate = date
    }
    if (cw.model && !lastModel) lastModel = cw.model
    if (cw.no_telepon && cw.no_telepon !== '-' && !lastPhone) lastPhone = cw.no_telepon
    if (cw.catatan_kendaraan && !notes) notes = cw.catatan_kendaraan
    if (cw.nama_pelanggan && !custName) custName = cw.nama_pelanggan
  })

  let cafeSpent = 0
  matchingStruk.forEach(s => {
    cafeSpent += parseFloat(s.total || s.grand_total || 0)
  })

  const totalSpent = carwashSpent + cafeSpent

  // RFM & Loyalty calculations
  const segment = calculateRFMSegment({
    totalVisits,
    totalSpent,
    lastVisitDate: latestDate,
    thresholds: settings,
    now: new Date()
  })

  const loyalty = calculateLoyaltyStamps(
    totalVisits,
    settings.target_stamps,
    settings.reward_title
  )

  return {
    plat: cleanQuery,
    nama: custName || cleanQuery,
    model: lastModel || 'Mobil',
    noTelepon: lastPhone || '',
    catatanKhusus: notes || '',
    totalVisits,
    totalSpent,
    carwashSpent,
    cafeSpent,
    lastVisitDate: latestDate,
    segment,
    loyalty,
    settings
  }
}

/**
 * Records a claimed loyalty reward in crm_loyalty_logs from POS cashier.
 */
export async function recordLoyaltyClaim(db, {
  tenant_id = DEFAULT_TENANT_ID,
  plat,
  nama_pelanggan = '',
  reward_title = 'Gratis Hadiah Loyalty',
  reward_type = 'FREE_SERVICE',
  id_struk = null,
  notes = ''
}) {
  if (!db || !plat) return { error: new Error('Database client and plate required.') }
  try {
    const payload = {
      tenant_id,
      plat: plat.trim().toUpperCase(),
      nama_pelanggan: nama_pelanggan || plat.trim().toUpperCase(),
      reward_title,
      reward_type,
      id_struk,
      notes: notes || `Klaim reward ${reward_title} di POS Kasir`,
      claimed_at: new Date().toISOString()
    }
    const { data, error } = await db.from('crm_loyalty_logs').insert([payload])
    if (error) throw error
    return { data, error: null }
  } catch (err) {
    console.warn('Error recording loyalty claim:', err)
    return { data: null, error: err }
  }
}

/**
 * Upserts a customer CRM profile from POS cashier intake.
 */
export async function upsertCRMCustomerProfile(db, {
  tenant_id = DEFAULT_TENANT_ID,
  plat,
  nama_pelanggan = '',
  no_whatsapp = '',
  model_kendaraan = '',
  catatan_khusus = ''
}) {
  if (!db || !plat) return { error: new Error('Database client and plate required.') }
  try {
    const normalizedPlat = plat.trim().toUpperCase()
    const { data: existing } = await db
      .from('crm_customers')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('plat', normalizedPlat)

    if (existing && existing.length > 0) {
      const updates = {
        updated_at: new Date().toISOString()
      }
      if (nama_pelanggan) updates.nama_pelanggan = nama_pelanggan
      if (no_whatsapp) updates.no_whatsapp = no_whatsapp
      if (model_kendaraan) updates.model_kendaraan = model_kendaraan
      if (catatan_khusus) updates.catatan_khusus = catatan_khusus

      const { data, error } = await db
        .from('crm_customers')
        .update(updates)
        .eq('id', existing[0].id)
      if (error) throw error
      return { data, error: null }
    } else {
      const newRecord = {
        id: `crm_cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenant_id,
        plat: normalizedPlat,
        nama_pelanggan: nama_pelanggan || normalizedPlat,
        no_whatsapp: no_whatsapp || '',
        model_kendaraan: model_kendaraan || '',
        catatan_khusus: catatan_khusus || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      const { data, error } = await db.from('crm_customers').insert([newRecord])
      if (error) throw error
      return { data, error: null }
    }
  } catch (err) {
    console.warn('Error upserting CRM customer profile:', err)
    return { data: null, error: err }
  }
}

