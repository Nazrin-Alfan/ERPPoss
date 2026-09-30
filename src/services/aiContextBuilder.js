/**
 * RelayPOS AI Context Builder
 * Lapisan ke-3 (AI Context) yang mengonversi data deterministik dari Intelligence Layer
 * menjadi prompt dan export terstruktur (Markdown & JSON Schema) yang bersifat AI-Vendor-Neutral.
 * 100% Zero Customer PII (Tanpa nomor telepon, nama pelanggan disamarkan/dihilangkan).
 */

function formatRp(val) {
  const num = parseFloat(val) || 0
  return 'Rp ' + Math.round(num).toLocaleString('id-ID')
}

export const STRATEGY_PRESETS = [
  {
    id: '360_HEALTH',
    title: 'Audit Kesehatan Bisnis 360° & Skor Eksekutif',
    desc: 'Audit holistik 4 pilar: Likuiditas, Margin, Efisiensi, Pertumbuhan & Skor 1-100',
    category: 'EXECUTIVE',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  },
  {
    id: 'CFO_AUDIT',
    title: 'Audit Forensik CFO: Deteksi Kebocoran Biaya (OPEX)',
    desc: 'Bedah rasio beban usaha terhadap omzet, komisi tim, dan efisiensi belanja operasional',
    category: 'FINANCE',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  },
  {
    id: 'PRIVE_POLICY',
    title: 'Kebijakan Batas Aman Dividen & Arus Kas (Prive)',
    desc: 'Hitung batas maksimal penarikan prive pemilik agar modal kerja tetap terlindungi',
    category: 'FINANCE',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  },
  {
    id: 'RELAY_SYNERGY',
    title: 'Optimalisasi Efek Estafet: Penjualan Silang ke Cafe',
    desc: 'Analisis konversi tamu cuci kendaraan yang memesan makanan/minuman di cafe',
    category: 'OPERATIONS',
    recommendedFor: ['HYBRID']
  },
  {
    id: 'PEAK_HOURS',
    title: 'Analisis Jam Sibuk & Efisiensi Shift Kru',
    desc: 'Distribusi beban kerja per jam, utilisasi slot bay, dan kecepatan rotasi pesanan',
    category: 'OPERATIONS',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  },
  {
    id: 'DYNAMIC_PRICING',
    title: 'Strategi Harga Dinamis & Siklus Gajian (Payday)',
    desc: 'Elastisitas hari kerja vs akhir pekan, serta strategi paket saat periode gajian',
    category: 'GROWTH',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  },
  {
    id: 'PRODUCT_BCG',
    title: 'Matriks Portofolio Menu & Layanan (Matriks BCG)',
    desc: 'Klasifikasi produk unggulan (Stars), penopang kas (Cash Cows), dan beban (Dogs)',
    category: 'PRODUCT',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  },
  {
    id: 'STOCK_RUNWAY',
    title: 'Ketahanan Stok Bahan Baku & Kecepatan Habis',
    desc: 'Kecepatan konsumsi harian (Burn Rate), sisa hari stok (Runway), dan peringatan stok kritis',
    category: 'SUPPLY_CHAIN',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  },
  {
    id: 'CRM_LOYALTY',
    title: 'Strategi Retensi & Loyalitas Pelanggan VIP',
    desc: 'Segmentasi frekuensi kunjungan pelanggan (VIP, Reguler, Baru) dan strategi reward',
    category: 'CRM',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  },
  {
    id: 'CHURN_RECOVERY',
    title: 'Deteksi Risiko Churn & Reaktivasi Pelanggan Pasif',
    desc: 'Identifikasi pelanggan yang tidak kembali > 45 hari dan skrip pesan reaktivasi',
    category: 'CRM',
    recommendedFor: ['HYBRID', 'CARWASH', 'CAFE']
  }
]

/**
 * Kembalikan preset konsultasi yang telah disesuaikan secara dinamis untuk tipe bisnis spesifik
 */
export function getAdaptedPresets(tenantBusinessType = 'HYBRID') {
  const isCafe = tenantBusinessType === 'CAFE'
  const isCarwash = tenantBusinessType === 'CARWASH'

  if (isCafe) {
    return [
      {
        id: '360_HEALTH',
        title: '360° Kesehatan Bisnis Cafe & Resto',
        icon: '🩺',
        desc: 'Audit holistik 4 pilar: Margin F&B, Food Cost, Rotasi Meja, & Kepuasan Tamu',
        category: 'EXECUTIVE',
        recommendedFor: ['CAFE']
      },
      {
        id: 'CFO_AUDIT',
        title: 'Audit CFO Food Cost & OPEX Cafe',
        icon: '💰',
        desc: 'Bedah rasio Food Cost (COGS), beban bahan baku, & efisiensi bar/dapur',
        category: 'FINANCE',
        recommendedFor: ['CAFE']
      },
      {
        id: 'PRIVE_POLICY',
        title: 'Kebijakan Batas Aman Dividen Cafe',
        icon: '🛡️',
        desc: 'Batas penarikan laba tanpa mengganggu modal kerja belanja bahan segar',
        category: 'FINANCE',
        recommendedFor: ['CAFE']
      },
      {
        id: 'RELAY_SYNERGY',
        title: 'Penjualan Silang & Upselling Menu F&B',
        icon: '☕',
        desc: 'Taktik pairing makanan + minuman, upsize porsi, dan rekomendasi kasir',
        category: 'OPERATIONS',
        recommendedFor: ['CAFE']
      },
      {
        id: 'PEAK_HOURS',
        title: 'Jam Sibuk & Kecepatan Rotasi Meja',
        icon: '⏰',
        desc: 'Distribusi rush hour makan/ngopi, rotasi meja, & alokasi shift barista/kitchen',
        category: 'OPERATIONS',
        recommendedFor: ['CAFE']
      },
      {
        id: 'DYNAMIC_PRICING',
        title: 'Strategi Harga, Paket Menu & Promo',
        icon: '🏷️',
        desc: 'Paket makan siang, happy hour coffee, diskon weekday vs weekend, & payday surge',
        category: 'GROWTH',
        recommendedFor: ['CAFE']
      },
      {
        id: 'PRODUCT_BCG',
        title: 'Rekayasa Menu F&B (Menu Engineering)',
        icon: '🍽️',
        desc: 'Klasifikasi menu BCG Stars, Plowhorses, Puzzles, Dogs & eliminasi deadstock',
        category: 'PRODUCT',
        recommendedFor: ['CAFE']
      },
      {
        id: 'STOCK_RUNWAY',
        title: 'Ketahanan Stok Bahan Baku & Food Waste',
        icon: '📦',
        desc: 'Pencegahan kadaluarsa biji kopi/dairy, sisa hari stok, & batas aman restok',
        category: 'SUPPLY_CHAIN',
        recommendedFor: ['CAFE']
      },
      {
        id: 'CRM_LOYALTY',
        title: 'Retensi Tamu Reguler & Coffee Club',
        icon: '👥',
        desc: 'Segmentasi tamu VIP, loyalty card digital, & aktivasi kunjungan ulang 7 hari',
        category: 'CRM',
        recommendedFor: ['CAFE']
      },
      {
        id: 'CHURN_RECOVERY',
        title: 'Reaktivasi Tamu Pasif (>30 Hari)',
        icon: '🧲',
        desc: 'Identifikasi tamu yang lama tidak datang & draf pesan undangan menu baru',
        category: 'CRM',
        recommendedFor: ['CAFE']
      }
    ]
  }

  if (isCarwash) {
    return [
      {
        id: '360_HEALTH',
        title: '360° Kesehatan Bisnis Carwash & Detailing',
        icon: '🩺',
        desc: 'Audit holistik: Throughput bay, utilisasi kapasitas, efisiensi kru & kimia',
        category: 'EXECUTIVE',
        recommendedFor: ['CARWASH']
      },
      {
        id: 'CFO_AUDIT',
        title: 'Audit CFO Beban Operasional & Kimia Cuci',
        icon: '💰',
        desc: 'Bedah komisi kru cuci, chemical shampoo/wax, listrik, & air PAM',
        category: 'FINANCE',
        recommendedFor: ['CARWASH']
      },
      {
        id: 'PRIVE_POLICY',
        title: 'Batas Aman Dividen & Arus Kas Carwash',
        icon: '🛡️',
        desc: 'Batas dividen aman dengan cadangan servis hidrolik & restok bahan cuci',
        category: 'FINANCE',
        recommendedFor: ['CARWASH']
      },
      {
        id: 'PEAK_HOURS',
        title: 'Jam Sibuk & Throughput Kapasitas Bay',
        icon: '⏰',
        desc: 'Optimasi antrean slot cuci, waktu pengerjaan per unit, & shift teknisi',
        category: 'OPERATIONS',
        recommendedFor: ['CARWASH']
      },
      {
        id: 'DYNAMIC_PRICING',
        title: 'Yield Management & Paket Detailing',
        icon: '🏷️',
        desc: 'Insentif jam sepi (pagi hari), paket cuci komplit, & tarif akhir pekan',
        category: 'GROWTH',
        recommendedFor: ['CARWASH']
      },
      {
        id: 'PRODUCT_BCG',
        title: 'Matriks Layanan & Paket Cuci Detailing',
        icon: '🚗',
        desc: 'Klasifikasi paket cuci body, interior, mesin, wax, hingga nano coating',
        category: 'PRODUCT',
        recommendedFor: ['CARWASH']
      },
      {
        id: 'STOCK_RUNWAY',
        title: 'Ketahanan Stok Chemical & Perlengkapan',
        icon: '📦',
        desc: 'Monitoring shampoo, semir ban, microfiber, degreaser, & ROP supplier',
        category: 'SUPPLY_CHAIN',
        recommendedFor: ['CARWASH']
      },
      {
        id: 'CRM_LOYALTY',
        title: 'Program Member Cuci & Kendaraan VIP',
        icon: '👥',
        desc: 'Retensi kendaraan reguler, paket langganan cuci, & histori servis plat',
        category: 'CRM',
        recommendedFor: ['CARWASH']
      },
      {
        id: 'CHURN_RECOVERY',
        title: 'Reaktivasi Kendaraan Pasif (>45 Hari)',
        icon: '🧲',
        desc: 'Deteksi plat mobil yang belum cuci ulang & penawaran voucher wax gratis',
        category: 'CRM',
        recommendedFor: ['CARWASH']
      }
    ]
  }

  // HYBRID Default
  return [
    {
      id: '360_HEALTH',
      title: '360° Business Health & Estafet Recap',
      icon: '🩺',
      desc: 'Audit holistik 4 pilar: Likuiditas, Margin, Efisiensi, & Sinergi Estafet',
      category: 'EXECUTIVE',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'CFO_AUDIT',
      title: 'CFO Cost Optimization & OPEX Audit',
      icon: '💰',
      desc: 'Bedah rasio beban usaha terhadap omzet, komisi tim, & efisiensi operasional',
      category: 'FINANCE',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'PRIVE_POLICY',
      title: 'Prive & Dividend Safety Policy',
      icon: '🛡️',
      desc: 'Batas aman penarikan dividen pemilik tanpa mengganggu kas likuid usaha',
      category: 'FINANCE',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'RELAY_SYNERGY',
      title: 'Relay Estafet Synergy (Cuci ➔ Cafe)',
      icon: '🔄',
      desc: 'Korelasional konversi silang tamu cuci yang memesan F&B di lounge cafe',
      category: 'OPERATIONS',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'PEAK_HOURS',
      title: 'Peak Hours & Labor Shift Scheduling',
      icon: '⏰',
      desc: 'Distribusi beban kerja per jam, utilisasi slot bay cuci, & antrean kasir',
      category: 'OPERATIONS',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'DYNAMIC_PRICING',
      title: 'Dynamic Pricing & Payday Surge',
      icon: '🏷️',
      desc: 'Elastisitas hari kerja vs akhir pekan, serta strategi paket saat gajian',
      category: 'GROWTH',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'PRODUCT_BCG',
      title: 'Product & Menu Matrix (BCG Matrix)',
      icon: '☕',
      desc: 'Klasifikasi produk unggulan (Stars), penopang kas (Cash Cows), & deadstock',
      category: 'PRODUCT',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'STOCK_RUNWAY',
      title: 'Stock Runway & Supply Chain Safety',
      icon: '📦',
      desc: 'Kecepatan habis bahan baku (Burn Rate), sisa hari stok, & batas kritis',
      category: 'SUPPLY_CHAIN',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'CRM_LOYALTY',
      title: 'CRM & Loyalty Velocity (VIP Cohort)',
      icon: '👥',
      desc: 'Segmentasi frekuensi kunjungan pelanggan (VIP, Reguler, Baru) & reward',
      category: 'CRM',
      recommendedFor: ['HYBRID']
    },
    {
      id: 'CHURN_RECOVERY',
      title: 'Churn Risk & Win-Back Re-engagement',
      icon: '🧲',
      desc: 'Identifikasi pelanggan yang tidak kembali > 45 hari & skrip reaktivasi',
      category: 'CRM',
      recommendedFor: ['HYBRID']
    }
  ]
}

/**
 * Pengelompokan Blok Data Modular Granular (Dropdown & Checkboxes)
 */
export const MODULAR_DATA_GROUPS = [
  {
    id: 'FINANCIAL',
    title: 'Keuangan & Arus Kas',
    icon: 'Receipt',
    color: 'emerald',
    blocks: [
      { id: 'fin_summary', label: 'Ringkasan Omzet, Total Beban & Margin (%)', defaultChecked: true },
      { id: 'fin_cashflow_hierarchy', label: 'Bedah Granular Arus Kas (Jenis ➔ Kategori ➔ Nominal & %)', defaultChecked: true },
      { id: 'fin_liquid_balances', label: 'Posisi Saldo Kas Laci & Rekening Bank Likuid', defaultChecked: true },
      { id: 'fin_cashier_payment', label: 'Distribusi Pembayaran Kasir (CASH vs Non-Tunai / QRIS)', defaultChecked: true }
    ]
  },
  {
    id: 'CARWASH',
    title: 'Carwash & Operasional Bay',
    icon: 'Car',
    color: 'blue',
    applicableFor: ['HYBRID', 'CARWASH'],
    blocks: [
      { id: 'cw_capacity', label: 'Utilisasi Kapasitas Bay Cuci (Realisasi vs Target Harian)', defaultChecked: true },
      { id: 'cw_models', label: 'Komposisi Ukuran Mobil & Paket Layanan', defaultChecked: true },
      { id: 'cw_aov_velocity', label: 'Carwash AOV & Rata-rata Mobil/Hari', defaultChecked: true }
    ]
  },
  {
    id: 'CAFE',
    title: 'Cafe & Food / Beverage',
    icon: 'Coffee',
    color: 'amber',
    applicableFor: ['HYBRID', 'CAFE'],
    blocks: [
      { id: 'cafe_summary', label: 'Omzet Cafe, Struk & Cafe AOV per Meja', defaultChecked: true },
      { id: 'cafe_top_menus', label: 'Leaderboard Top Menu Terlaris (Qty & Omzet)', defaultChecked: true },
      { id: 'cafe_slowest_menus', label: 'Menu Penjualan Terendah (Slow-Moving / Deadstock)', defaultChecked: false }
    ]
  },
  {
    id: 'SYNERGY',
    title: 'Sinergi Estafet (The Relay Effect)',
    icon: 'TrendingUp',
    color: 'cyan',
    applicableFor: ['HYBRID'],
    blocks: [
      { id: 'syn_cross_rate', label: 'Tingkat Konversi Estafet Cuci ➔ Cafe (%)', defaultChecked: true },
      { id: 'syn_revenue_lift', label: 'Tambahan Omzet Cafe Murni dari Tamu Cuci Mobil', defaultChecked: true },
      { id: 'syn_combined_arpu', label: 'Combined ARPU (Belanja Gabungan Tamu Estafet)', defaultChecked: true }
    ]
  },
  {
    id: 'INVENTORY',
    title: 'Gudang & Rantai Pasok (Inventory)',
    icon: 'Package',
    color: 'purple',
    blocks: [
      { id: 'inv_valuation', label: 'Valuasi Total Aset Stok di Gudang', defaultChecked: true },
      { id: 'inv_critical_items', label: 'Daftar Item Bahan Baku Kritis (Stok ≤ Batas Aman)', defaultChecked: true }
    ]
  },
  {
    id: 'CRM',
    title: 'CRM & Loyalitas Pelanggan (Zero-PII)',
    icon: 'Users',
    color: 'sky',
    blocks: [
      { id: 'crm_cohorts', label: 'Segmentasi Tamu: VIP (≥5x), Reguler (2-4x), Baru (1x)', defaultChecked: true },
      { id: 'crm_churn_risk', label: 'Deteksi Risiko Churn (>45 Hari Tidak Berkunjung)', defaultChecked: true },
      { id: 'crm_repeat_rate', label: 'Repeat Customer Rate (%) & Rata-rata Customer LTV', defaultChecked: true }
    ]
  },
  {
    id: 'TIME_CALENDAR',
    title: 'Pola Waktu & Kalender Yield',
    icon: 'Clock',
    color: 'indigo',
    blocks: [
      { id: 'time_peak_hours', label: 'Distribusi Jam Sibuk Operasional (Peak Hours)', defaultChecked: true },
      { id: 'time_elasticity', label: 'Elastisitas Hari Kerja vs Akhir Pekan (Weekday vs Weekend)', defaultChecked: true },
      { id: 'time_payday', label: 'Analisis Siklus Gajian (Payday Peak vs Mid-Month Flow)', defaultChecked: true }
    ]
  },
  {
    id: 'HISTORICAL',
    title: 'Komparasi Historis & Pertumbuhan Sektoral',
    icon: 'Scale',
    color: 'emerald',
    blocks: [
      { id: 'hist_variance_table', label: 'Komparasi Terpadu (Menyesuaikan Seluruh Sektor yang Dipilih)', defaultChecked: true },
      { id: 'hist_fin_variance', label: 'Komparasi Finansial & Pembukuan (Omzet, OPEX, Laba, Margin)', defaultChecked: true },
      { id: 'hist_cw_variance', label: 'Komparasi Operasional Carwash (Unit Cuci, Mobil/Hari, AOV Cuci)', defaultChecked: true, applicableFor: ['HYBRID', 'CARWASH'] },
      { id: 'hist_cafe_variance', label: 'Komparasi Kinerja Cafe (Omzet F&B, Porsi Terjual, AOV Meja)', defaultChecked: true, applicableFor: ['HYBRID', 'CAFE'] },
      { id: 'hist_syn_variance', label: 'Komparasi Sinergi Estafet (Konversi %, Omzet Silang, Combined ARPU)', defaultChecked: true, applicableFor: ['HYBRID'] },
      { id: 'hist_crm_variance', label: 'Komparasi Retensi CRM (Tamu Unik, Repeat Rate %, Risiko Churn)', defaultChecked: false }
    ]
  }
]

export const ALL_BLOCK_IDS = MODULAR_DATA_GROUPS.flatMap((g) => g.blocks.map((b) => b.id))

function renderCashflowHierarchy(hierarchy = [], totalExpenses = 0) {
  if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
    return '*(Tidak ada rincian data pengeluaran terdata)*'
  }
  const lines = []
  lines.push(`Total Beban Terdata: ${formatRp(totalExpenses)} (100%)`)
  lines.push('')
  hierarchy.forEach((jItem, idx) => {
    lines.push(`${idx + 1}. **[JENIS: ${jItem.jenis}]** — Total: ${formatRp(jItem.total)} (${jItem.percentage}% dari Total Beban)`)
    if (Array.isArray(jItem.categories) && jItem.categories.length > 0) {
      jItem.categories.forEach((cat, cIdx) => {
        const isLast = cIdx === jItem.categories.length - 1
        const prefix = isLast ? '   └──' : '   ├──'
        lines.push(`${prefix} Kategori: ${cat.kategori} : **${formatRp(cat.total)}** (${cat.percentageOfJenis}% dari jenis ini) [${cat.count} tx]`)
      })
    }
  })
  return lines.join('\n')
}

function renderHistoricalTable(histData, isBlockActive = () => true, isPreset = false, businessType = 'HYBRID') {
  if (!histData) return ''
  const isHybrid = businessType === 'HYBRID'
  const isCarwash = businessType === 'CARWASH'
  const isCafe = businessType === 'CAFE'

  const lines = [
    `### 📊 KOMPARASI KINERJA HISTORIS (${histData.currentLabel} vs ${histData.previousLabel})`,
    `*Analisis perbandingan varians delta kinerja operasional & finansial.*`,
    ''
  ]

  const formatDeltaStatus = (delta, percent, isExpense = false) => {
    if (percent === 0 && delta === 0) return '⚪ Stabil'
    if (isExpense) {
      if (percent > 15) return '⚠️ Beban Meningkat Pesat'
      if (percent > 0) return '🟡 Biaya Naik Wajar'
      return '🟢 Efisiensi Beban'
    }
    if (percent > 10) return '🟢 Tumbuh Sangat Baik'
    if (percent > 0) return '🟢 Tumbuh Positif'
    if (percent > -5) return '🟡 Sedikit Tertekan'
    return '🔴 Penurunan Signifikan'
  }

  const formatPointsStatus = (deltaBps, isExpense = false) => {
    if (deltaBps === 0) return '⚪ Stabil'
    if (isExpense) {
      return deltaBps <= 0 ? '🟢 Rasio Membaik' : '⚠️ Rasio Membengkak'
    }
    return deltaBps >= 0 ? '🟢 Ekspansi Positif' : '🟡 Kompresi Margin'
  }

  const renderSectorTable = (subTitle, items) => {
    const tableLines = [
      `#### ${subTitle}`,
      `| Indikator Kinerja | ${histData.previousLabel} | ${histData.currentLabel} | Perubahan (Delta) | Status Pertumbuhan |`,
      `| :--- | :--- | :--- | :--- | :--- |`
    ]
    let count = 0
    items.forEach((it) => {
      if (!it || it.current === undefined) return
      count++
      let prevStr = ''
      let currStr = ''
      let deltaStr = ''
      let statusStr = ''

      if (it.isPoints) {
        prevStr = `${it.previous}%`
        currStr = `${it.current}%`
        const bpsSign = it.deltaBps >= 0 ? '+' : ''
        deltaStr = `${bpsSign}${it.deltaBps}% pts`
        statusStr = formatPointsStatus(it.deltaBps, it.isExpense)
      } else if (it.unit) {
        prevStr = `${it.previous} ${it.unit}`
        currStr = `${it.current} ${it.unit}`
        const sign = it.delta >= 0 ? '+' : ''
        deltaStr = `${sign}${it.delta} ${it.unit} (${sign}${it.percent}%)`
        statusStr = formatDeltaStatus(it.delta, it.percent, it.isExpense)
      } else {
        prevStr = formatRp(it.previous)
        currStr = formatRp(it.current)
        const sign = it.delta >= 0 ? '+' : ''
        deltaStr = `${sign}${formatRp(it.delta)} (${sign}${it.percent}%)`
        statusStr = formatDeltaStatus(it.delta, it.percent, it.isExpense)
      }

      tableLines.push(`| **${it.label}** | ${prevStr} | ${currStr} | ${deltaStr} | ${statusStr} |`)
    })

    return count > 0 ? tableLines.join('\n') : ''
  }

  const sec = histData.sectors || {}

  // 1. Sektor Finansial
  const showFin = isPreset ||
    isBlockActive('hist_fin_variance') ||
    (isBlockActive('hist_variance_table') && (
      isBlockActive('fin_summary') || isBlockActive('fin_cashflow_hierarchy') ||
      isBlockActive('fin_liquid_balances') || isBlockActive('fin_cashier_payment')
    )) ||
    (!isBlockActive('hist_cw_variance') && !isBlockActive('hist_cafe_variance') && !isBlockActive('hist_syn_variance') && !isBlockActive('hist_crm_variance'))

  if (showFin && sec.financial) {
    const finTable = renderSectorTable('💰 Komparasi Finansial & Pembukuan', [
      sec.financial.revenue,
      sec.financial.expenses,
      sec.financial.netProfit,
      sec.financial.profitMargin,
      sec.financial.expenseRatio,
      sec.financial.txCount
    ])
    if (finTable) {
      lines.push(finTable)
      lines.push('')
    }
  }

  // 2. Sektor Carwash
  const showCw = !isCafe && (
    isPreset ||
    isBlockActive('hist_cw_variance') ||
    (isBlockActive('hist_variance_table') && (
      isBlockActive('cw_capacity') || isBlockActive('cw_models') || isBlockActive('cw_aov_velocity')
    ))
  )

  if (showCw && sec.carwash) {
    const cwTable = renderSectorTable('🚗 Komparasi Operasional Carwash', [
      sec.carwash.totalUnits,
      sec.carwash.avgCarsPerDay,
      sec.carwash.carwashRevenue,
      sec.carwash.carwashAOV
    ])
    if (cwTable) {
      lines.push(cwTable)
      lines.push('')
    }
  }

  // 3. Sektor Cafe
  const showCafe = !isCarwash && (
    isPreset ||
    isBlockActive('hist_cafe_variance') ||
    (isBlockActive('hist_variance_table') && (
      isBlockActive('cafe_summary') || isBlockActive('cafe_top_menus') || isBlockActive('cafe_slowest_menus')
    ))
  )

  if (showCafe && sec.cafe) {
    const cafeTable = renderSectorTable('☕ Komparasi Operasional F&B Cafe & Resto', [
      sec.cafe.cafeRevenue,
      sec.cafe.totalItems,
      sec.cafe.cafeStrukCount,
      sec.cafe.cafeAOV
    ])
    if (cafeTable) {
      lines.push(cafeTable)
      lines.push('')
    }
  }

  // 4. Sektor Sinergi Estafet
  const showSyn = isHybrid && (
    isPreset ||
    isBlockActive('hist_syn_variance') ||
    (isBlockActive('hist_variance_table') && (
      isBlockActive('syn_cross_rate') || isBlockActive('syn_revenue_lift') || isBlockActive('syn_combined_arpu')
    ))
  )

  if (showSyn && sec.synergy) {
    const synTable = renderSectorTable('🔄 Komparasi Sinergi Estafet (Cross-Selling)', [
      sec.synergy.crossConversionRate,
      sec.synergy.crossConversionCount,
      sec.synergy.crossCafeRevenue,
      sec.synergy.combinedARPU,
      sec.synergy.capacityEfficiency
    ])
    if (synTable) {
      lines.push(synTable)
      lines.push('')
    }
  }

  // 5. Sektor CRM & Pelanggan
  const showCrm = isPreset ||
    isBlockActive('hist_crm_variance') ||
    (isBlockActive('hist_variance_table') && (
      isBlockActive('crm_cohorts') || isBlockActive('crm_churn_risk') || isBlockActive('crm_repeat_rate')
    ))

  if (showCrm && sec.crm) {
    const crmTable = renderSectorTable('👥 Komparasi Retensi & Pelanggan (CRM)', [
      sec.crm.totalUnique,
      sec.crm.vipCount,
      sec.crm.repeatCustomerRate,
      sec.crm.churnRisk,
      sec.crm.avgLTV
    ])
    if (crmTable) {
      lines.push(crmTable)
      lines.push('')
    }
  }

  // Fallback flat table jika tidak ada sub-tabel yang dihasilkan
  if (lines.length <= 3 && histData.metrics) {
    const m = histData.metrics
    const fallbackLines = [
      `| Indikator Kinerja | ${histData.previousLabel} | ${histData.currentLabel} | Perubahan (Delta) | Status Pertumbuhan |`,
      `| :--- | :--- | :--- | :--- | :--- |`
    ]
    if (m.revenue) fallbackLines.push(`| **Total Omzet** | ${formatRp(m.revenue.previous)} | ${formatRp(m.revenue.current)} | ${m.revenue.delta >= 0 ? '+' : ''}${formatRp(m.revenue.delta)} (${m.revenue.percent >= 0 ? '+' : ''}${m.revenue.percent}%) | ${formatDeltaStatus(m.revenue.delta, m.revenue.percent)} |`)
    if (m.expenses) fallbackLines.push(`| **Total Beban (OPEX)** | ${formatRp(m.expenses.previous)} | ${formatRp(m.expenses.current)} | ${m.expenses.delta >= 0 ? '+' : ''}${formatRp(m.expenses.delta)} (${m.expenses.percent >= 0 ? '+' : ''}${m.expenses.percent}%) | ${formatDeltaStatus(m.expenses.delta, m.expenses.percent, true)} |`)
    if (m.netProfit) fallbackLines.push(`| **Laba Bersih** | ${formatRp(m.netProfit.previous)} | ${formatRp(m.netProfit.current)} | ${m.netProfit.delta >= 0 ? '+' : ''}${formatRp(m.netProfit.delta)} (${m.netProfit.percent >= 0 ? '+' : ''}${m.netProfit.percent}%) | ${formatDeltaStatus(m.netProfit.delta, m.netProfit.percent)} |`)
    lines.push(fallbackLines.join('\n'))
  }

  return lines.join('\n')
}

export class AIContextBuilder {
  constructor({
    metrics = {},
    tenantBusinessType = 'HYBRID',
    tenantName = 'RelayPOS Enterprise Outlet',
    timeRangeLabel = 'Bulan Ini',
    presetId = '360_HEALTH',
    customQuestion = '',
    selectedBlocks = null,
    historicalData = null,
    interactiveFeedback = true
  } = {}) {
    this.metrics = metrics
    this.tenantBusinessType = tenantBusinessType
    this.tenantName = tenantName
    this.timeRangeLabel = timeRangeLabel
    this.presetId = presetId
    this.customQuestion = customQuestion
    this.selectedBlocks = selectedBlocks ? (Array.isArray(selectedBlocks) ? new Set(selectedBlocks) : selectedBlocks) : null
    this.historicalData = historicalData
    this.interactiveFeedback = interactiveFeedback
  }

  /**
   * Cek apakah sebuah blok data dipilih untuk diikutkan dalam prompt
   */
  isBlockActive(blockId) {
    if (!this.selectedBlocks) return true
    return this.selectedBlocks.has(blockId)
  }

  /**
   * Tentukan Persona & Target Output berdasarkan Preset ID & Tipe Bisnis
   */
  getPersonaDirectives() {
    const isCafe = this.tenantBusinessType === 'CAFE'
    const isCarwash = this.tenantBusinessType === 'CARWASH'
    const isHybrid = this.tenantBusinessType === 'HYBRID' || (!isCafe && !isCarwash)

    let role = 'Senior Business Advisor & Enterprise ERP Auditor'
    let scopeDesc = isCafe
      ? 'Unit Usaha F&B Cafe & Resto (Operasional Murni F&B)'
      : isCarwash
      ? 'Unit Usaha Carwash Modern & Auto Detailing'
      : 'Unit Usaha Hybrid Terpadu: Carwash Modern + Cafe Lounge (Sistem Estafet RelayPOS)'

    let specificDeliverables = []

    switch (this.presetId) {
      case 'CFO_AUDIT':
        role = isCafe
          ? 'Senior F&B Chief Financial Officer (CFO) & Restaurant Cost Controller'
          : isCarwash
          ? 'Senior Automotive Business CFO & Financial Controller'
          : 'Chief Financial Officer (CFO) & Forensic Financial Controller'
        specificDeliverables = isCafe
          ? [
              '1. HEALTH CHECK STRUKTUR BIAYA & FOOD COST: Evaluasi rasio beban bahan baku (COGS) dan OPEX terhadap total omzet cafe.',
              '2. AUDIT TITIK KEBOCORAN KAS & EFISIENSI BAR/DAPUR: Analisis pos biaya yang paling boros (komisi kru barista/kitchen, bahan terbuang/spoilage, atau utilitas).',
              '3. RENCANA AKSI EFISIENSI 30 HARI: 3 langkah konkret pemangkasan beban tanpa menurunkan porsi dan kualitas rasa sajian.'
            ]
          : isCarwash
          ? [
              '1. HEALTH CHECK STRUKTUR BIAYA & KIMIA CUCI: Evaluasi rasio beban bahan shampoo/wax/chemical, komisi kru, dan OPEX terhadap omzet carwash.',
              '2. AUDIT TITIK KEBOCORAN KAS & EFISIENSI OPERASIONAL: Analisis pos biaya yang paling boros (komisi kru cuci, utilitas listrik/air PAM, atau pemeliharaan mesin).',
              '3. RENCANA AKSI EFISIENSI 30 HARI: 3 langkah konkret pemangkasan beban tanpa menurunkan kualitas kebersihan cuci & kepuasan pelanggan.'
            ]
          : [
              '1. HEALTH CHECK STRUKTUR BIAYA & OPEX: Evaluasi pos pengeluaran terbesar dan rasio terhadap omzet.',
              '2. AUDIT TITIK KEBOCORAN KAS & EFISIENSI: Analisis pos biaya yang paling boros (komisi kru, utilitas, atau restok).',
              '3. RENCANA AKSI EFISIENSI 30 HARI: 3 langkah konkret pemangkasan beban tanpa menurunkan kepuasan pelanggan.'
            ]
        break

      case 'PRIVE_POLICY':
        role = isCafe
          ? 'F&B Corporate Treasury Specialist & Restaurant Cashflow Advisor'
          : isCarwash
          ? 'Automotive Corporate Treasury Specialist & Carwash Financial Advisor'
          : 'Corporate Treasury Specialist & Wealth Advisory Consultant'
        specificDeliverables = isCafe
          ? [
              '1. BATAS AMAN PENARIKAN PRIVE PEMILIK: Berapa batas nominal dividen yang aman ditarik bulan ini?',
              '2. CADANGAN KAS BELANJA BAHAN SEGAR: Minimal saldo kas likuid yang wajib dipertahankan untuk modal kerja restok harian/mingguan.',
              '3. PROYEKSI KETAHANAN KAS (CASH RUNWAY): Simulasi ketahanan operasional jika terjadi penurunan omzet mendadak.'
            ]
          : isCarwash
          ? [
              '1. BATAS AMAN PENARIKAN PRIVE PEMILIK: Berapa nominal dividen yang aman ditarik bulan ini?',
              '2. CADANGAN KAS RESTOK CHEMICAL & SERVIS: Minimal saldo kas likuid yang wajib ditahan untuk restok shampoo/wax dan servis mesin rutin.',
              '3. PROYEKSI KETAHANAN KAS (CASH RUNWAY): Simulasi ketahanan operasional jika terjadi fluktuasi cuaca ekstrem.'
            ]
          : [
              '1. BATAS AMAN PENARIKAN PRIVE / DIVIDEN: Berapa batas nominal dividen yang aman ditarik bulan ini?',
              '2. CADANGAN KAS OPERASIONAL MINIMAL: Jumlah saldo likuid minimal yang wajib dipertahankan di kas laci & rekening.',
              '3. PROYEKSI KETAHANAN KAS (CASH RUNWAY): Simulasi ketahanan operasional jika terjadi penurunan omzet mendadak.'
            ]
        break

      case 'RELAY_SYNERGY':
        role = isCafe
          ? 'F&B Revenue Management & Menu Merchandising Specialist'
          : 'Omnichannel Operations Director & Retail Synergy Specialist'
        specificDeliverables = isCafe
          ? [
              '1. OPTIMASI PENJUALAN SILANG MENU (CROSS-SELLING): Strategi pairing makanan + minuman (misal: kopi + pastry/snack).',
              '2. TAKTIK UPSELLING KASIR: 2 skrip penawaran konkret (upsize minuman, add-on topping/side dish) yang wajib diucapkan kasir saat pemesanan.',
              '3. TARGET PENINGKATAN AOV TIKET MEJA: Cara menaikkan rata-rata belanja per pesanan meja hingga 25%+.'
            ]
          : [
              '1. AUDIT KONVERSI ESTAFET: Evaluasi mengapa rasio tamu cuci yang mampir ke cafe berada di level saat ini.',
              '2. TAKTIK BUNDLING & VOUCHER KASIR: 2 skrip penawaran konkret yang wajib diucapkan kasir/kru saat menerima kunci mobil.',
              '3. TARGET PENINGKATAN COMBINED ARPU: Cara menaikkan nilai belanja gabungan per tamu hingga 35%+.'
            ]
        break

      case 'PEAK_HOURS':
        role = isCafe
          ? 'Head of F&B Operations & Table Turnover Specialist'
          : isCarwash
          ? 'Automotive Service Operations Director & Bay Throughput Specialist'
          : 'Head of Process Engineering & Service Operations'
        specificDeliverables = isCafe
          ? [
              '1. ANALISIS JAM SIBUK (RUSH HOURS): Evaluasi jam sarapan, makan siang, ngopi sore, dan makan malam berdasarkan data transaksi.',
              '2. ROTASI MEJA & KECEPATAN SERVIS: Taktik memangkas lead time penyajian makanan/minuman dan menaikkan perputaran meja (Table Turnover Rate).',
              '3. REKAYASA SHIFT KRU BARISTA & KITCHEN: Rekomendasi alokasi tim saat jam puncak vs jam lengang.'
            ]
          : isCarwash
          ? [
              '1. ANALISIS JAM SIBUK & IDLE BAY: Evaluasi jam sibuk antrean kendaraan vs jam lengang berdasarkan data transaksi cuci.',
              '2. OPTIMASI UTILISASI BAY & THROUGHPUT CUCI: Taktik mengurangi waktu pengerjaan (lead time) per unit dan menaikkan kapasitas mobil/hari.',
              '3. JADWAL REKAYASA SHIFT KRU CUCI: Rekomendasi alokasi tim teknisi saat jam puncak pagi/sore vs jam sepi siang.'
            ]
          : [
              '1. ANALISIS JAM SIBUK & IDLE: Evaluasi tabel distribusi jam sibuk cuci mobil vs cafe di atas.',
              '2. OPTIMASI ROTASI BAY / MEJA: Taktik mengurangi waktu tunggu (lead time) pengerjaan cuci atau penyajian makanan.',
              '3. JADWAL REKAYASA SHIFT KRU: Rekomendasi alokasi tim saat jam puncak (09:00-11:00 & 14:00-15:00) vs jam lengang.'
            ]
        break

      case 'DYNAMIC_PRICING':
        role = isCafe
          ? 'F&B Revenue Management & Menu Pricing Strategist'
          : isCarwash
          ? 'Automotive Service Yield Management & Pricing Strategist'
          : 'Revenue Management & Pricing Strategist'
        specificDeliverables = isCafe
          ? [
              '1. EVALUASI ELASTISITAS HARGA MENU: Perbandingan daya beli tamu di hari kerja vs akhir pekan berdasarkan data aktual.',
              '2. TAKTIK SIKLUS GAJIAN & PROMO KOMBO: Paket bundling makan siang dan promo gajian (payday surge) yang menguntungkan.',
              '3. PROGRAM HAPPY HOUR COFFEE: Skema diskon/bundling terukur untuk mengisi kapasitas meja di jam-jam sepi (14:00 - 17:00).'
            ]
          : isCarwash
          ? [
              '1. EVALUASI ELASTISITAS HARGA LAYANAN: Perbandingan volume dan daya beli pelanggan cuci di hari kerja vs akhir pekan.',
              '2. TAKTIK SIKLUS GAJIAN & PAKET DETAILING: Paket bundling cuci komplit + jamur kaca / wax saat periode gajian (tgl 25-5).',
              '3. PROGRAM OFF-PEAK (EARLY BIRD WASH): Skema diskon/insentif terukur untuk mengisi slot bay kosong di pagi hari (08:00 - 10:00).'
            ]
          : [
              '1. EVALUASI ELASTISITAS HARGA: Perbandingan daya beli pelanggan di hari kerja vs akhir pekan berdasarkan data aktual.',
              '2. TAKTIK SIKLUS GAJIAN (PAYDAY SURGE): Paket bundling premium yang siap diluncurkan saat periode gajian (tgl 25-5).',
              '3. PROGRAM OFF-PEAK (HAPPY HOUR): Skema diskon terukur untuk mengisi kapasitas kosong di jam-jam sepi.'
            ]
        break

      case 'PRODUCT_BCG':
        role = isCafe
          ? 'Senior Executive Chef & F&B Menu Engineering Specialist'
          : isCarwash
          ? 'Automotive Detailing Product Manager & Service Packaging Strategist'
          : 'Chief Commercial Officer & Menu/Service Engineering Specialist'
        specificDeliverables = isCafe
          ? [
              '1. MATRIKS BCG MENU ENGINEERING: Klasifikasi menu F&B (Stars: Margin & Volume Tinggi, Plowhorses: Volume Tinggi Margin Rendah, Puzzles: Margin Tinggi Volume Rendah, Dogs: Margin & Volume Rendah).',
              '2. ELIMINASI MENU BEBAN (DEADSTOCK): Menu makanan/minuman mana yang wajib direvisi atau dihapus karena perputaran sangat lambat.',
              '3. REKAYASA BUNDLING SIGNATURE: Formula kombo minuman signature + makanan margin tinggi untuk mendongkrak margin kotor.'
            ]
          : isCarwash
          ? [
              '1. MATRIKS BCG LAYANAN CUCI & DETAILING: Klasifikasi paket cuci body, interior, mesin, wax, hingga coating berdasarkan volume & omzet.',
              '2. ELIMINASI / REVISI LAYANAN TIDAK POPULER: Layanan atau add-on yang peminatnya rendah dan membebani waktu kru.',
              '3. REKAYASA BUNDLING LAYANAN PREMIUM: Formula paket bundling cuci berkala + proteksi wax untuk mendongkrak tiket AOV per mobil.'
            ]
          : [
              '1. MATRIKS BCG (Stars, Cash Cows, Dogs): Klasifikasi item menu cafe / paket carwash berdasarkan volume & omzet.',
              '2. ELIMINASI MENU BEBAN (DEADSTOCK): Menu/paket mana yang harus direvisi atau dihapus karena perputaran lambat.',
              '3. REKAYASA BUNDLING STRATEGIS: Formula kombo paket cuci + menu cafe terlaris untuk mendongkrak margin kotor.'
            ]
        break

      case 'STOCK_RUNWAY':
        role = isCafe
          ? 'Kitchen Supply Chain & Food Waste Controller'
          : isCarwash
          ? 'Automotive Chemical Supply Chain & Inventory Cost Controller'
          : 'Supply Chain Director & Inventory Cost Controller'
        specificDeliverables = isCafe
          ? [
              '1. AUDIT BAHAN BAKU KRITIS & SEGAR: Tindakan darurat untuk bahan baku (biji kopi, susu/dairy, sirup, dll.) yang tersisa di bawah batas aman.',
              '2. PENCEGAHAN FOOD WASTE & SPOILAGE: SOP kontrol persediaan untuk meminimalkan bahan terbuang/kadaluarsa.',
              '3. REKAYASA REORDER POINT (ROP): Jadwal dan kuantitas order optimal ke supplier bahan baku.'
            ]
          : isCarwash
          ? [
              '1. AUDIT STOK CHEMICAL & PERLENGKAPAN KRITIS: Langkah darurat untuk shampoo salju, semir ban, degreaser, dan kain microfiber yang menipis.',
              '2. PENGENDALIAN CHEMICAL WASTE & DOSIS CUCI: Standarisasi takaran shampoo/chemical per mobil agar tidak boros/terbuang.',
              '3. REORDER POINT & HUBUNGAN SUPPLIER: Jadwal dan kuantitas order optimal ke distributor chemical otomotif.'
            ]
          : [
              '1. AUDIT ITEM KRITIS: Langkah darurat untuk item bahan baku yang tersisa di bawah batas aman.',
              '2. REKAYASA REORDER POINT (ROP): Kapan dan berapa kuantitas optimal yang harus dipesan ke supplier.',
              '3. PENGENDALIAN HPP & VENDOR: Cara menekan Moving Average Cost bahan baku utama.'
            ]
        break

      case 'CRM_LOYALTY':
        role = isCafe
          ? 'F&B Guest Experience & Coffee Community Director'
          : isCarwash
          ? 'Automotive CRM Director & Car Owner Loyalty Architect'
          : 'Customer Experience Director & Loyalty Program Architect'
        specificDeliverables = isCafe
          ? [
              '1. PROGRAM LOYALITAS PENIKMAT KOPI & REGULER: Skema reward digital / loyalty stamps untuk mengunci tamu setia.',
              '2. AKTIVASI KUNJUNGAN KE-2: Strategi mengonversi pelanggan baru agar datang kembali dalam waktu < 7 hari.',
              '3. KONTROL MARGIN DISKON: Memastikan insentif loyalitas tidak menggerus profitabilitas bersih.'
            ]
          : isCarwash
          ? [
              '1. PROGRAM MEMBER CUCI & KENDARAAN VIP: Skema paket langganan cuci berkala / kupon cuci gratis ke-6 untuk mempertahankan pelanggan setia.',
              '2. AKTIVASI CUCI ULANG KENDARAAN: Strategi mendorong pemilik mobil baru agar kembali cuci dalam waktu < 14 hari.',
              '3. KONTROL MARGIN DISKON & MEMBER: Memastikan voucher loyalitas tidak menggerus profitabilitas operasional.'
            ]
          : [
              '1. PROGRAM LOYALITAS PELANGGAN VIP: Skema apresiasi untuk mempertahankan cohort pelanggan setia.',
              '2. AKTIVASI KUNJUNGAN KE-2: Strategi mengonversi pelanggan baru agar kembali dalam tempo < 14 hari.',
              '3. KONTROL MARGIN DISKON: Memastikan insentif loyalitas tidak menggerus profitabilitas bersih.'
            ]
        break

      case 'CHURN_RECOVERY':
        role = isCafe
          ? 'F&B Guest Retention Specialist & Community Win-Back Strategist'
          : isCarwash
          ? 'Automotive Retention Specialist & Win-Back Campaign Director'
          : 'Retention Marketing Specialist & Win-Back Campaign Director'
        specificDeliverables = isCafe
          ? [
              '1. ANALISIS PENYEBAB TAMU PASIF: Faktor apa yang membuat pelanggan reguler tidak berkunjung > 30-45 hari.',
              '2. SKRIP REAKTIVASI (WHATSAPP/SMS): Draf pesan ramah dan personal mengundang mencicipi menu baru tanpa terkesan spam.',
              '3. PENAWARAN WIN-BACK TERUKUR: Voucher diskon/free dessert dengan syarat dan masa berlaku terbatas.'
            ]
          : isCarwash
          ? [
              '1. DETEKSI PLAT KENDARAAN TIDAK KEMBALI: Analisis penyebab plat mobil pelanggan reguler yang tidak berkunjung > 45 hari.',
              '2. SKRIP REAKTIVASI (WHATSAPP/SMS): Draf pesan ramah menawarkan gratis semir ban premium / wax kilat tanpa terkesan spam.',
              '3. PENAWARAN WIN-BACK TERUKUR: Voucher diskon cuci dengan batas masa berlaku terbatas.'
            ]
          : [
              '1. ANALISIS PENYEBAB CHURN: Faktor apa yang membuat pelanggan reguler tidak berkunjung > 45 hari.',
              '2. SKRIP REAKTIVASI (WHATSAPP/SMS): Draf pesan ramah dan personal tanpa terkesan spam.',
              '3. PENAWARAN WIN-BACK TERUKUR: Voucher reaktivasi dengan syarat dan masa berlaku terbatas.'
            ]
        break

      case '360_HEALTH':
      default:
        role = isCafe
          ? 'Senior Venture Partner & F&B Corporate Strategist'
          : isCarwash
          ? 'Managing Director & Automotive Service Business Consultant'
          : 'Senior Venture Partner, Group CFO & Corporate Business Evaluator'
        specificDeliverables = isCafe
          ? [
              '1. CAFE HEALTH SCORE (Skala 1 - 100): Skor kesehatan menyeluruh bisnis cafe beserta justifikasi 4 pilar (Likuiditas, Margin F&B, Rotasi Meja, Kepuasan Tamu).',
              '2. SWOT ANALYSIS CAFE & RESTO: Analisis Kekuatan menu, Kelemahan operasional, Peluang pasar lokal, dan Ancaman kompetitor F&B.',
              '3. REKOMENDASI EKSEKUTIF PEMILIK CAFE: 3 keputusan strategis prioritas utama untuk Owner dalam 30 hari ke depan.'
            ]
          : isCarwash
          ? [
              '1. CARWASH HEALTH SCORE (Skala 1 - 100): Skor kesehatan menyeluruh bisnis carwash (Throughput Bay, Margin, Utilisasi Kapasitas, Retensi Kendaraan).',
              '2. SWOT ANALYSIS CARWASH & DETAILING: Analisis Kekuatan layanan, Kelemahan teknis, Peluang detailing lokal, dan Ancaman kompetitor cuci terdekat.',
              '3. REKOMENDASI EKSEKUTIF PEMILIK CARWASH: 3 keputusan strategis prioritas utama untuk Owner dalam 30 hari ke depan.'
            ]
          : [
              '1. BUSINESS HEALTH SCORE (Skala 1 - 100): Skor kesehatan menyeluruh beserta justifikasi 4 pilar (Likuiditas, Margin, Efisiensi, Pertumbuhan).',
              '2. SWOT ANALYSIS RINGKAS: Analisis Kekuatan, Kelemahan, Peluang, dan Ancaman berbasis data aktual.',
              '3. REKOMENDASI EKSEKUTIF OWNER: 3 keputusan strategis prioritas utama untuk Owner dalam 30 hari ke depan.'
            ]
        break
    }

    return { role, scopeDesc, specificDeliverables, isHybrid, isCafe, isCarwash }
  }

  /**
   * Build Full Vendor-Neutral Executive Markdown Prompt with Dynamic Deep-Dive per Preset
   */
  buildMarkdownPrompt() {
    const { role, scopeDesc, specificDeliverables, isHybrid, isCafe, isCarwash } = this.getPersonaDirectives()
    const presetObj = STRATEGY_PRESETS.find((p) => p.id === this.presetId)
    const presetTitle = presetObj ? presetObj.title : (this.presetId === 'CUSTOM' ? 'Pertanyaan Kustom Manajemen' : 'Konsultasi Eksekutif')

    const fin = this.metrics.financial || {}
    const csh = this.metrics.cashier || {}
    const hr = this.metrics.hourly || {}
    const cw = this.metrics.carwash || {}
    const cf = this.metrics.cafe || {}
    const syn = this.metrics.synergy || {}
    const crm = this.metrics.crm || {}
    const ela = this.metrics.elasticity || {}
    const inv = this.metrics.inventory || {}
    const anomalies = this.metrics.anomalies || []

    const lines = []

    // 1. Header & Role Identity
    lines.push(`## 📌 MODE ANALISIS: ${presetTitle}`)
    lines.push(`Anda adalah ${role} bereputasi internasional.`)
    lines.push(`Tugas Anda adalah melakukan analisis mendalam berbasis data deterministik untuk: **${this.tenantName}** (${scopeDesc}).`)
    lines.push('')
    lines.push('---')
    lines.push('### 🛡️ PEDOMAN KONSULTASI & ZERO PII:')
    lines.push('1. Jawab secara lugas, tajam, berbasis data kuantitatif, tanpa basa-basi atau pujian artifisial.')
    lines.push('2. Seluruh data di bawah telah diaudit dan diagregasikan 100% secara anonim tanpa identitas pribadi pelanggan.')
    lines.push('3. Berikan rekomendasi langkah taktis yang realistis dan siap dieksekusi tim lapangan besok pagi.')
    lines.push('---')
    lines.push('')

    // 2. Data Ringkasan Pokok (Core Financials - Otomatis Sistem untuk Preset)
    lines.push(`### 📊 RINGKASAN KINERJA UTAMA (Periode: ${this.timeRangeLabel})`)
    lines.push(`- Total Omzet Penjualan : ${formatRp(fin.totalRevenue)}`)
    lines.push(`- Total Beban/Pengeluaran: ${formatRp(fin.totalExpenses)} (Rasio: ${fin.expenseRatio || 0}%)`)
    lines.push(`- Estimasi Laba Bersih   : ${formatRp(fin.netProfit)} (Net Margin: ${fin.profitMargin || 0}%)`)
    lines.push(`- Rata-rata Omzet / Hari : ${formatRp(fin.avgDailyOmzet)} / hari (${fin.operatingDays || 1} hari aktif)`)
    lines.push('')

    // 2.1 Posisi Saldo Kas Likuid
    if (fin.totalLiquid > 0) {
      lines.push('### 🏛️ POSISI SALDO KAS LIKUID & REKENING TOKO')
      lines.push(`- Total Saldo Likuid Tersedia: **${formatRp(fin.totalLiquid)}**`)
      lines.push('')
    }

    // 2.2 Bedah Granular Arus Kas (Jenis ➔ Kategori)
    if (fin.cashflowHierarchy && Object.keys(fin.cashflowHierarchy).length > 0) {
      lines.push('### 💳 BEDAH STRUKTUR ARUS KAS (JENIS & KATEGORI PENGELUARAN)')
      lines.push(renderCashflowHierarchy(fin.cashflowHierarchy, fin.totalExpenses))
      lines.push('')
    }

    // 2.3 Distribusi Pembayaran Kasir
    if (csh.totalTxCount > 0) {
      lines.push('### 🧾 DISTRIBUSI PEMBAYARAN KASIR')
      lines.push(`- Uang Fisik Kasir (CASH)     : ${formatRp(csh.totalCash)}`)
      lines.push(`- Non-Tunai (QRIS & Transfer) : ${formatRp(csh.totalNonCash)}`)
      lines.push(`- Total Struk Transaksi Kasir : ${csh.totalTxCount || 0} struk`)
      lines.push('')
    }

    // 2.4 Komparasi Historis & Pertumbuhan (Otomatis jika data pembanding tersedia)
    if (this.historicalData) {
      lines.push(renderHistoricalTable(this.historicalData, () => true, true, this.tenantBusinessType))
      lines.push('')
    }

    // 3. Divisi Carwash
    if (!isCafe && (cw.totalRevenue > 0 || cw.totalUnits > 0)) {
      lines.push('### 🚗 DATA OPERASIONAL & PERFORMA BAY CUCI (CARWASH)')
      lines.push(`- Omzet Divisi Carwash : ${formatRp(cw.totalRevenue)}`)
      lines.push(`- Total Unit Dikerjakan: ${cw.totalUnits || 0} kendaraan (Rata-rata: ${cw.avgCarsPerDay || 0} mobil/hari)`)
      lines.push(`- Carwash Ticket AOV   : ${formatRp(cw.carwashAOV)} / unit`)
      if (cw.topModels && cw.topModels.length > 0) {
        lines.push(`- Model Mobil Paling Sering: ${cw.topModels.slice(0, 3).map((m) => `${m.model} (${m.count}x)`).join(', ')}`)
      }
      lines.push('')
    }

    // 4. Divisi Cafe
    if (!isCarwash && (cf.totalRevenue > 0 || cf.totalItems > 0)) {
      lines.push('### ☕ DATA OPERASIONAL & FOOD/BEVERAGE (CAFE & LOUNGE)')
      lines.push(`- Omzet Divisi Cafe : ${formatRp(cf.totalRevenue)}`)
      lines.push(`- Total Porsi Terjual: ${cf.totalItems || 0} porsi / cup (${cf.cafeStrukCount || 0} pesanan meja)`)
      lines.push(`- Cafe Ticket AOV   : ${formatRp(cf.cafeAOV)} / meja`)
      if (cf.topMenus && cf.topMenus.length > 0) {
        lines.push(`- Menu Terlaris (Top Sellers): ${cf.topMenus.slice(0, 5).map((m) => `${m.nama || m.nama_menu || 'Menu'} (${m.qty} porsi - ${formatRp(m.revenue || m.total || 0)})`).join(', ')}`)
      }
      if (cf.slowestMenus && cf.slowestMenus.length > 0) {
        lines.push(`- Menu Perputaran Lambat (Slow-Moving): ${cf.slowestMenus.slice(0, 5).map((m) => `${m.nama || m.nama_menu || 'Menu'} (${m.qty} porsi)`).join(', ')}`)
      }
      lines.push('')
    }

    // 5. Sinergi Estafet (Khusus Hybrid)
    if (isHybrid && (syn.crossConversionRate > 0 || syn.crossCafeRevenue > 0)) {
      lines.push('### 🔄 MATRIKS SINERGI ESTAFET (THE RELAY EFFECT)')
      lines.push(`- Konversi Cross-Selling: **${syn.crossConversionRate || 0}%** (${syn.crossConversionCount || 0} dari ${syn.totalCarwashStruks || 0} tamu cuci memesan F&B)`)
      lines.push(`- Omzet Cafe Tambahan Murni Tamu Cuci: **${formatRp(syn.crossCafeRevenue || 0)}**`)
      lines.push(`- Combined ARPU / Tamu Estafet : **${formatRp(syn.combinedARPU)}**`)
      lines.push('')
    }

    // 6. Gudang & Rantai Pasok (Inventory)
    if (inv.totalInventoryValuation > 0 || (inv.criticalStockItems && inv.criticalStockItems.length > 0)) {
      lines.push('### 📦 KETAHANAN STOK & RANTAI PASOK (INVENTORY)')
      lines.push(`- Valuasi Total Aset Bahan Baku: ${formatRp(inv.totalInventoryValuation)}`)
      if (inv.criticalStockItems && inv.criticalStockItems.length > 0) {
        lines.push(`- Peringatan Item Kritis (Stok ≤ Min): ${inv.criticalStockItems.map((item) => `${item.nama_produk} (Sisa ${item.stok} ${item.satuan})`).join(', ')}`)
      }
      lines.push('')
    }

    // 7. CRM & Kohort Pelanggan
    if (crm.totalUniqueCustomers > 0) {
      lines.push('### 👥 DATA KOHORT PELANGGAN & RETENSI (ZERO-PII)')
      lines.push(`- Total Pelanggan Unik : ${crm.totalUniqueCustomers || 0} orang/kendaraan`)
      lines.push(`- Segmentasi Frekuensi : VIP (≥5x): ${crm.vipCount || 0} | Reguler (2-4x): ${crm.regularCount || 0} | Baru (1x): ${crm.newCount || 0}`)
      lines.push(`- Repeat Customer Rate : ${crm.repeatCustomerRate || 0}%`)
      lines.push(`- Rata-rata Customer LTV: ${formatRp(crm.avgLTV)}`)
      if (crm.churnRiskCount > 0) {
        lines.push(`- Deteksi Risiko Churn (>45 hari): **${crm.churnRiskCount || 0} pelanggan berisiko hilang**`)
      }
      lines.push('')
    }

    // 8. Pola Waktu & Kalender
    if (hr.busiestCarwashHour || hr.busiestCafeHour || ela.avgWeekdayDaily > 0) {
      lines.push('### ⏰ POLA WAKTU OPERASIONAL & KALENDER YIELD')
      if (!isCafe && hr.busiestCarwashHour) {
        lines.push(`- Jam Sibuk Cuci Mobil : Pukul ${hr.busiestCarwashHour || '09:00'}`)
      }
      if (!isCarwash && hr.busiestCafeHour) {
        lines.push(`- Jam Sibuk Cafe & Lounge : Pukul ${hr.busiestCafeHour || '14:00'}`)
      }
      if (ela.avgWeekdayDaily > 0) {
        lines.push(`- Rata-rata Omzet Hari Kerja (Senin-Kamis) : ${formatRp(ela.avgWeekdayDaily)} / hari`)
        lines.push(`- Rata-rata Omzet Akhir Pekan (Jumat-Minggu): ${formatRp(ela.avgWeekendDaily)} / hari`)
      }
      if (ela.avgPaydayDaily > 0) {
        lines.push(`- Rata-rata Omzet Periode Gajian (tgl 25-5) : ${formatRp(ela.avgPaydayDaily)} / hari`)
      }
      lines.push('')
    }

    // 9. Anomali Terdeteksi (jika ada)
    if (anomalies && anomalies.length > 0) {
      lines.push('### 🚨 ANOMALI BISNIS TERDETEKSI (RULE-BASED)')
      anomalies.forEach((a, i) => {
        lines.push(`${i + 1}. [${a.severity}] ${a.message}`)
      })
      lines.push('')
    }

    // 10. Pertanyaan Kustom (Jika Diisi Pengguna)
    if (this.customQuestion && this.customQuestion.trim()) {
      lines.push('---')
      lines.push('### ❓ PERTANYAAN KHUSUS MANAJEMEN:')
      lines.push(`"${this.customQuestion.trim()}"`)
      lines.push('')
    }

    // 11. Format Output Wajib
    lines.push('---')
    lines.push('### 🎯 FORMAT STRUKTUR JAWABAN YANG WAJIB ANDA BERIKAN:')
    specificDeliverables.forEach((item) => {
      lines.push(item)
    })
    lines.push('')

    // 12. Interactive Feedback Loop Directive
    if (this.interactiveFeedback) {
      lines.push('---')
      lines.push('### 🤝 PANDUAN INTERAKSI DUA ARAH (INTERACTIVE FEEDBACK & GAP ANALYSIS)')
      lines.push('Sebagai konsultan bisnis senior bereputasi internasional:')
      lines.push('1. Jika ada data kualitatif lapangan atau konteks operasional yang tidak tercantum dalam ringkasan di atas namun krusial bagi akurasi keputusan (misal: harga sewa tempat, target omzet pemilik, situasi persaingan lokal, kapasitas kru shift, atau program promosi yang sedang berjalan), WAJIB ajukan 3 hingga 5 pertanyaan klarifikasi mendalam kepada pemilik bisnis di bagian paling akhir jawaban Anda.')
      lines.push('2. Sediakan opsi pilihan jawaban singkat atau estimasi rentang agar pemilik bisnis dapat langsung membalas dan melanjutkan sesi konsultasi mendalam.')
    }

    return lines.join('\n')
  }

  /**
   * Build Standalone Modular Data Blocks Prompt
   * Menghasilkan teks data terstruktur murni khusus untuk blok data terpilih,
   * sehingga pengguna bebas memformat instruksi prompt mereka sendiri.
   */
  buildStandaloneBlocksPrompt({ customUserPrompt = '', includeFeedback = true, dataOnly = false } = {}) {
    const fin = this.metrics.financial || {}
    const csh = this.metrics.cashier || {}
    const hr = this.metrics.hourly || {}
    const cw = this.metrics.carwash || {}
    const cf = this.metrics.cafe || {}
    const syn = this.metrics.synergy || {}
    const crm = this.metrics.crm || {}
    const ela = this.metrics.elasticity || {}
    const inv = this.metrics.inventory || {}

    const isCafe = this.tenantBusinessType === 'CAFE'
    const isCarwash = this.tenantBusinessType === 'CARWASH'
    const isHybrid = this.tenantBusinessType === 'HYBRID' || (!isCafe && !isCarwash)

    const lines = []

    // 1. Header Instruksi Pengguna (Jika Ada & Bukan Data-Only)
    if (!dataOnly && customUserPrompt && customUserPrompt.trim()) {
      lines.push('## 🎯 INSTRUKSI & PERTANYAAN KHUSUS:')
      lines.push(customUserPrompt.trim())
      lines.push('')
      lines.push('---')
    }

    // 2. Judul Blok Data
    lines.push(`## 📊 DATA OPERASIONAL & FINANSIAL (${this.tenantName})`)
    lines.push(`- **Model Usaha**: ${this.tenantBusinessType}`)
    lines.push(`- **Periode Data**: ${this.timeRangeLabel}`)
    lines.push('*(Seluruh data di bawah ini telah diaudit secara deterministik & Zero Customer PII)*')
    lines.push('')

    // 3. Render Blok-blok yang dipilih
    // 3.1 Finansial Pokok
    if (this.isBlockActive('fin_summary')) {
      lines.push('### 💰 RINGKASAN OMZET, BEBAN & LABA')
      lines.push(`- Total Omzet Penjualan : ${formatRp(fin.totalRevenue)}`)
      lines.push(`- Total Beban/Pengeluaran: ${formatRp(fin.totalExpenses)} (Rasio Beban: ${fin.expenseRatio || 0}%)`)
      lines.push(`- Estimasi Laba Bersih   : ${formatRp(fin.netProfit)} (Net Margin: ${fin.profitMargin || 0}%)`)
      lines.push(`- Rata-rata Omzet / Hari : ${formatRp(fin.avgDailyOmzet)} / hari (${fin.operatingDays || 1} hari aktif)`)
      lines.push('')
    }

    // 3.2 Hierarki Arus Kas
    if (this.isBlockActive('fin_cashflow_hierarchy')) {
      lines.push('### 💳 BEDAH STRUKTUR ARUS KAS (JENIS ➔ KATEGORI PENGELUARAN)')
      lines.push(renderCashflowHierarchy(fin.cashflowHierarchy, fin.totalExpenses))
      lines.push('')
    }

    // 3.3 Saldo Kas Likuid
    if (this.isBlockActive('fin_liquid_balances') && fin.totalLiquid > 0) {
      lines.push('### 🏛️ POSISI SALDO KAS LIKUID & REKENING')
      lines.push(`- Total Saldo Kas Likuid Tersedia: **${formatRp(fin.totalLiquid)}**`)
      lines.push('')
    }

    // 3.4 Kasir Payment
    if (this.isBlockActive('fin_cashier_payment')) {
      lines.push('### 🧾 DISTRIBUSI PEMBAYARAN KASIR')
      lines.push(`- Uang Fisik Kasir (CASH)     : ${formatRp(csh.totalCash)}`)
      lines.push(`- Non-Tunai (QRIS & Transfer) : ${formatRp(csh.totalNonCash)}`)
      lines.push(`- Total Struk Kasir Tercetak  : ${csh.totalTxCount || 0} struk`)
      lines.push('')
    }

    // 3.5 Komparasi Historis Sektoral
    const hasHistActive = this.isBlockActive('hist_variance_table') ||
      this.isBlockActive('hist_fin_variance') ||
      this.isBlockActive('hist_cw_variance') ||
      this.isBlockActive('hist_cafe_variance') ||
      this.isBlockActive('hist_syn_variance') ||
      this.isBlockActive('hist_crm_variance')

    if (hasHistActive && this.historicalData) {
      lines.push(renderHistoricalTable(this.historicalData, (id) => this.isBlockActive(id), false, this.tenantBusinessType))
      lines.push('')
    }

    // 3.6 Carwash
    if (!isCafe && (this.isBlockActive('cw_capacity') || this.isBlockActive('cw_models') || this.isBlockActive('cw_aov_velocity'))) {
      lines.push('### 🚗 DATA OPERASIONAL CARWASH')
      if (this.isBlockActive('cw_aov_velocity')) {
        lines.push(`- Omzet Carwash        : ${formatRp(cw.totalRevenue)}`)
        lines.push(`- Total Unit Dicuci    : ${cw.totalUnits || 0} mobil (Rata-rata: ${cw.avgCarsPerDay || 0} mobil/hari)`)
        lines.push(`- Carwash Ticket AOV   : ${formatRp(cw.carwashAOV)} / unit`)
      }
      if (this.isBlockActive('cw_models') && cw.topModels && cw.topModels.length > 0) {
        lines.push(`- Model Mobil Paling Sering: ${cw.topModels.slice(0, 3).map((m) => `${m.model} (${m.count}x)`).join(', ')}`)
      }
      lines.push('')
    }

    // 3.7 Cafe
    if (!isCarwash && (this.isBlockActive('cafe_summary') || this.isBlockActive('cafe_top_menus') || this.isBlockActive('cafe_slowest_menus'))) {
      lines.push('### ☕ DATA OPERASIONAL CAFE & RESTO')
      if (this.isBlockActive('cafe_summary')) {
        lines.push(`- Omzet Cafe           : ${formatRp(cf.totalRevenue)}`)
        lines.push(`- Total Item Terjual   : ${cf.totalItems || 0} porsi (${cf.cafeStrukCount || 0} order meja)`)
        lines.push(`- Cafe Ticket AOV      : ${formatRp(cf.cafeAOV)} / meja`)
      }
      if (this.isBlockActive('cafe_top_menus') && cf.topMenus && cf.topMenus.length > 0) {
        lines.push(`- Top Menu Terlaris    : ${cf.topMenus.slice(0, 5).map((m) => `${m.nama || m.nama_menu || 'Menu'} (${m.qty} porsi - ${formatRp(m.revenue || m.total || 0)})`).join(', ')}`)
      }
      if (this.isBlockActive('cafe_slowest_menus') && cf.slowestMenus && cf.slowestMenus.length > 0) {
        lines.push(`- Menu Slow-Moving     : ${cf.slowestMenus.slice(0, 5).map((m) => `${m.nama || m.nama_menu || 'Menu'} (${m.qty} porsi)`).join(', ')}`)
      }
      lines.push('')
    }

    // 3.8 Sinergi Estafet
    if (isHybrid && (this.isBlockActive('syn_cross_rate') || this.isBlockActive('syn_revenue_lift') || this.isBlockActive('syn_combined_arpu'))) {
      lines.push('### 🔄 SINERGI ESTAFET (THE RELAY EFFECT)')
      if (this.isBlockActive('syn_cross_rate')) {
        lines.push(`- Konversi Estafet Cuci ➔ Cafe: **${syn.crossConversionRate || 0}%** (${syn.crossConversionCount || 0} dari ${syn.totalCarwashStruks || 0} tamu cuci memesan F&B)`)
      }
      if (this.isBlockActive('syn_revenue_lift')) {
        lines.push(`- Tambahan Omzet Cafe dari Tamu Cuci: **${formatRp(syn.crossCafeRevenue || 0)}**`)
      }
      if (this.isBlockActive('syn_combined_arpu')) {
        lines.push(`- Combined ARPU / Tamu Estafet : **${formatRp(syn.combinedARPU)}**`)
      }
      lines.push('')
    }

    // 3.9 Gudang & Rantai Pasok
    if (this.isBlockActive('inv_valuation') || this.isBlockActive('inv_critical_items')) {
      lines.push('### 📦 GUDANG & PERSEDIAAN')
      if (this.isBlockActive('inv_valuation')) {
        lines.push(`- Valuasi Aset Stok: ${formatRp(inv.totalInventoryValuation)}`)
      }
      if (this.isBlockActive('inv_critical_items') && inv.criticalStockItems && inv.criticalStockItems.length > 0) {
        lines.push(`- Item Kritis (Stok ≤ Min): ${inv.criticalStockItems.map((item) => `${item.nama_produk} (Sisa ${item.stok} ${item.satuan})`).join(', ')}`)
      }
      lines.push('')
    }

    // 3.10 CRM
    if (this.isBlockActive('crm_cohorts') || this.isBlockActive('crm_churn_risk') || this.isBlockActive('crm_repeat_rate')) {
      lines.push('### 👥 KOHORT PELANGGAN (ZERO-PII)')
      if (this.isBlockActive('crm_cohorts')) {
        lines.push(`- Total Pelanggan Unik : ${crm.totalUniqueCustomers || 0}`)
        lines.push(`- Segmentasi Frekuensi : VIP: ${crm.vipCount || 0} | Reguler: ${crm.regularCount || 0} | Baru: ${crm.newCount || 0}`)
      }
      if (this.isBlockActive('crm_repeat_rate')) {
        lines.push(`- Repeat Customer Rate : ${crm.repeatCustomerRate || 0}% | Rata-rata LTV: ${formatRp(crm.avgLTV)}`)
      }
      if (this.isBlockActive('crm_churn_risk')) {
        lines.push(`- Risiko Churn (>45 hari): **${crm.churnRiskCount || 0} pelanggan pasif**`)
      }
      lines.push('')
    }

    // 3.11 Pola Waktu
    if (this.isBlockActive('time_peak_hours') || this.isBlockActive('time_elasticity') || this.isBlockActive('time_payday')) {
      lines.push('### ⏰ POLA WAKTU & KALENDER')
      if (this.isBlockActive('time_peak_hours')) {
        const peakParts = []
        if (!isCafe && hr.busiestCarwashHour) peakParts.push(`Jam Sibuk Cuci: Pukul ${hr.busiestCarwashHour}`)
        if (!isCarwash && hr.busiestCafeHour) peakParts.push(`Jam Sibuk Cafe: Pukul ${hr.busiestCafeHour}`)
        if (peakParts.length > 0) {
          lines.push(`- ${peakParts.join(' | ')}`)
        }
      }
      if (this.isBlockActive('time_elasticity')) {
        lines.push(`- Omzet Rata-rata Hari Kerja: ${formatRp(ela.avgWeekdayDaily)} / hari | Akhir Pekan: ${formatRp(ela.avgWeekendDaily)} / hari`)
      }
      if (this.isBlockActive('time_payday')) {
        lines.push(`- Omzet Periode Gajian (tgl 25-5): ${formatRp(ela.avgPaydayDaily)} / hari`)
      }
      lines.push('')
    }

    // 4. Interactive Feedback Directive
    if (!dataOnly && includeFeedback) {
      lines.push('---')
      lines.push('### 🤝 PANDUAN INTERAKSI DUA ARAH (GAP ANALYSIS)')
      lines.push('Jika ada data kualitatif lapangan atau konteks operasional yang belum tercakup di atas namun penting bagi analisis Anda, silakan ajukan 3–5 pertanyaan klarifikasi tajam di bagian akhir jawaban Anda.')
    }

    return lines.join('\n')
  }

  /**
   * Export Full Structured JSON for Direct AI Ingestion
   */
  exportCleanJSON() {
    return {
      schema_version: '2.2-relaypos-intelligence',
      generated_at: new Date().toISOString(),
      tenant_name: this.tenantName,
      business_type: this.tenantBusinessType,
      time_range: this.timeRangeLabel,
      preset_mode: this.presetId,
      custom_question: this.customQuestion || null,
      financial_metrics: {
        total_revenue: this.metrics.financial?.totalRevenue || 0,
        total_expenses: this.metrics.financial?.totalExpenses || 0,
        net_profit: this.metrics.financial?.netProfit || 0,
        profit_margin_percent: this.metrics.financial?.profitMargin || 0,
        expense_ratio_percent: this.metrics.financial?.expenseRatio || 0,
        avg_daily_revenue: this.metrics.financial?.avgDailyOmzet || 0,
        total_liquid_cash: this.metrics.financial?.totalLiquid || 0,
        expense_by_jenis: this.metrics.financial?.expenseByJenis || [],
        cashflow_hierarchy: this.metrics.financial?.cashflowHierarchy || []
      },
      historical_comparison: this.historicalData || null,
      hourly_traffic_breakdown: this.metrics.hourly?.hourlyBreakdown || [],
      cashier_breakdown: {
        cash_drawer: this.metrics.cashier?.totalCash || 0,
        non_cash_bank_qris: this.metrics.cashier?.totalNonCash || 0,
        total_receipts_count: this.metrics.cashier?.totalTxCount || 0
      },
      carwash_metrics: {
        revenue: this.metrics.carwash?.totalRevenue || 0,
        total_units_completed: this.metrics.carwash?.totalUnits || 0,
        avg_units_per_day: this.metrics.carwash?.avgCarsPerDay || 0,
        average_order_value: this.metrics.carwash?.carwashAOV || 0,
        top_vehicle_models: this.metrics.carwash?.topModels || [],
        top_packages: this.metrics.carwash?.topPackages || []
      },
      cafe_metrics: {
        revenue: this.metrics.cafe?.totalRevenue || 0,
        total_items_sold: this.metrics.cafe?.totalItems || 0,
        cafe_receipts_count: this.metrics.cafe?.cafeStrukCount || 0,
        average_order_value: this.metrics.cafe?.cafeAOV || 0,
        top_selling_menus: this.metrics.cafe?.topMenus || [],
        slowest_selling_menus: this.metrics.cafe?.slowestMenus || []
      },
      relay_synergy_metrics: {
        cross_selling_conversion_rate: this.metrics.synergy?.crossConversionRate || 0,
        cross_selling_count: this.metrics.synergy?.crossConversionCount || 0,
        cross_cafe_revenue: this.metrics.synergy?.crossCafeRevenue || 0,
        total_carwash_struks: this.metrics.synergy?.totalCarwashStruks || 0,
        combined_arpu: this.metrics.synergy?.combinedARPU || 0,
        bay_capacity_efficiency_percent: this.metrics.synergy?.capacityEfficiency || 0
      },
      crm_cohort_metrics: {
        total_unique_customers: this.metrics.crm?.totalUniqueCustomers || 0,
        vip_customers_count: this.metrics.crm?.vipCount || 0,
        regular_customers_count: this.metrics.crm?.regularCount || 0,
        new_customers_count: this.metrics.crm?.newCount || 0,
        repeat_customer_rate_percent: this.metrics.crm?.repeatCustomerRate || 0,
        churn_risk_count: this.metrics.crm?.churnRiskCount || 0,
        average_ltv: this.metrics.crm?.avgLTV || 0
      },
      pricing_elasticity: {
        weekday_avg_daily_revenue: this.metrics.elasticity?.avgWeekdayDaily || 0,
        weekend_avg_daily_revenue: this.metrics.elasticity?.avgWeekendDaily || 0,
        weekend_surge_percent: this.metrics.elasticity?.weekendSurgePercent || 0,
        payday_avg_daily_revenue: this.metrics.elasticity?.avgPaydayDaily || 0,
        mid_month_avg_daily_revenue: this.metrics.elasticity?.avgMidMonthDaily || 0,
        payday_surge_percent: this.metrics.elasticity?.paydaySurgePercent || 0
      },
      inventory_summary: {
        critical_stock_items: this.metrics.inventory?.criticalStockItems || [],
        total_inventory_valuation: this.metrics.inventory?.totalInventoryValuation || 0
      },
      external_factors: {
        reference_date: this.metrics.external?.referenceDate || null,
        day_of_week: this.metrics.external?.dayNameIndo || null,
        is_weekend: !!this.metrics.external?.isWeekend,
        is_payday_cycle: !!this.metrics.external?.isPaydayCycle
      },
      detected_anomalies: this.metrics.anomalies || []
    }
  }
}
