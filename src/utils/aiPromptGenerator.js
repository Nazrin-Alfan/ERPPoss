/**
 * RelayPOS Executive AI Prompt Generator
 * Sesuai Standar: Multi-Tenant Strict Zero-Leakage & 100% Data Privacy (Zero Customer PII)
 * Mendukung 4 Mode Konsultasi Strategis:
 * 1. '360_HEALTH'  : Rekapitulasi Menyeluruh 360° & Skor Kesehatan Bisnis
 * 2. 'GROWTH_SALES': Pertumbuhan Penjualan, Jam Sibuk & Kecepatan Layanan
 * 3. 'CFO_AUDIT'   : Audit Finansial, Efisiensi Beban OPEX & Kebijakan Prive
 * 4. 'PRODUCT_MENU': Rekayasa Menu / Layanan & Analisis Perputaran Stok
 */

function formatRp(val) {
  const num = parseFloat(val) || 0
  return 'Rp ' + Math.round(num).toLocaleString('id-ID')
}

export const CONSULTATION_MODES = [
  {
    id: '360_HEALTH',
    title: '360° Kesehatan Bisnis & Rekap Eksekutif',
    subtitle: 'Audit holistik, Health Score 1-100, SWOT, evaluasi prive & rencana ekspansi'
  },
  {
    id: 'GROWTH_SALES',
    title: 'Pertumbuhan Penjualan & Operasional',
    subtitle: 'Jam sibuk, AOV tiket, utilisasi kapasitas, dan sinergi estafet'
  },
  {
    id: 'CFO_AUDIT',
    title: 'Audit Finansial & CFO (Kebocoran OPEX)',
    subtitle: 'Rasio beban usaha, margin kotor vs bersih, komisi kru & batas aman dividen'
  },
  {
    id: 'PRODUCT_MENU',
    title: 'Rekayasa Produk & Menu / Layanan',
    subtitle: 'BCG matrix (Stars, Cash Cows, Dogs), evaluasi COGS & stok kritis'
  }
]

export const TIME_RANGE_OPTIONS = [
  { id: '7_DAYS', label: '1 Minggu', desc: '7 Hari Terakhir' },
  { id: '30_DAYS', label: '1 Bulan', desc: '30 Hari / Bulan Berjalan' },
  { id: '90_DAYS', label: '3 Bulan', desc: 'Tren Kuartalan' },
  { id: 'ALL_TIME', label: 'All-Time', desc: 'Seluruh Riwayat Outlet' }
]

/**
 * Generate enterprise-grade prompt for ChatGPT / Claude / DeepSeek
 * @param {Object} data Context data from Dashboard
 * @returns {string} Prompt text
 */
export function generateExecutiveAIPrompt(data = {}) {
  const {
    tenantBusinessType = 'HYBRID',
    timeRangeLabel = 'Bulan Ini',
    consultationMode = '360_HEALTH',
    overviewStats = {},
    financialAnalytics = {},
    cfoHealth = {},
    cafeAnalytics = {},
    carwashAnalytics = {},
    advancedKPIs = {},
    dailyCashierRecap = {},
    criticalStockItems = [],
    ratingSummary = null
  } = data

  const isCafe = tenantBusinessType === 'CAFE'
  const isCarwash = tenantBusinessType === 'CARWASH'
  const isHybrid = tenantBusinessType === 'HYBRID' || (!isCafe && !isCarwash)

  // 1. Role & Identity Definition based on Consultation Mode & Tenant Type
  let personaTitle = ''
  let tenantScopeDesc = ''
  let businessRuleDirective = ''

  if (isCafe) {
    tenantScopeDesc = 'Bisnis Cafe, Resto & Specialty Coffee Shop'
    businessRuleDirective = 'Tenant ini beroperasi sebagai unit usaha Cafe & Resto murni. Seluruh analisis dan rekomendasi Anda WAJIB 100% berfokus pada dinamika operasional F&B, perputaran stok bahan baku, margin menu, rotasi meja, dan kepuasan pengunjung tanpa referensi ke industri luar F&B.'
  } else if (isCarwash) {
    tenantScopeDesc = 'Bisnis Carwash Modern & Auto Detailing'
    businessRuleDirective = 'Tenant ini beroperasi sebagai unit usaha Carwash & Auto Detailing murni. Seluruh analisis dan rekomendasi Anda WAJIB 100% berfokus pada throughput slot pengerjaan, utilisasi kapasitas harian, perawatan unit, serta efisiensi tim teknis dan chemical tanpa referensi ke industri luar otomotif.'
  } else {
    tenantScopeDesc = 'Bisnis Hybrid Terpadu: Carwash Modern & Cafe Lounge (Sistem Estafet RelayPOS)'
    businessRuleDirective = 'Fokuskan analisis Anda pada sinergi estafet (The Relay Effect): bagaimana memaksimalkan konversi silang dari tamu yang sedang servis agar melakukan pembelanjaan di cafe sembari menunggu.'
  }

  // Persona by mode
  switch (consultationMode) {
    case 'CFO_AUDIT':
      personaTitle = isCafe
        ? 'Senior F&B Chief Financial Officer (CFO) & Forensic Financial Auditor'
        : isCarwash
        ? 'Senior Automotive Business CFO & Financial Controller'
        : 'Group CFO & Enterprise Financial Auditor'
      break
    case 'GROWTH_SALES':
      personaTitle = isCafe
        ? 'F&B Growth Strategist & Head of Restaurant Operations'
        : isCarwash
        ? 'Automotive Service Operations Director & Retail Growth Specialist'
        : 'Chief Commercial Officer (CCO) & Head of Omnichannel Operations'
      break
    case 'PRODUCT_MENU':
      personaTitle = isCafe
        ? 'Senior Executive Chef & F&B Menu Engineering Specialist'
        : isCarwash
        ? 'Automotive Detailing Product Manager & Service Packaging Strategist'
        : 'Head of Product Strategy & Service Portfolio Director'
      break
    case '360_HEALTH':
    default:
      personaTitle = isCafe
        ? 'Senior Venture Partner & F&B Corporate Strategist'
        : isCarwash
        ? 'Managing Director & Automotive Service Business Consultant'
        : 'Senior Venture Partner, Group CFO & Corporate Business Evaluator'
      break
  }

  // 2. Metrics Assembly (100% Aggregated, ZERO Phone / PII)
  const lines = []

  lines.push(`Anda adalah ${personaTitle} bereputasi internasional.`)
  lines.push(`Tugas Anda adalah melakukan audit mendalam terhadap performa operasional dan finansial untuk unit usaha: ${tenantScopeDesc}.`)
  lines.push('')
  lines.push('---')
  lines.push('BATASAN OPERASIONAL & PEDOMAN ANALISIS:')
  lines.push(`1. ${businessRuleDirective}`)
  lines.push('2. Jawab secara lugas, tajam, profesional, berbasis data kuantitatif, tanpa basa-basi atau pujian artifisial.')
  lines.push('3. Seluruh data di bawah telah diaudit dan diagregasikan secara anonim tanpa identitas pribadi pelanggan.')
  lines.push('---')
  lines.push('')

  lines.push(`DATA KINERJA BISNIS (Periode: ${timeRangeLabel})`)
  lines.push(`- Total Omzet Penjualan : ${formatRp(overviewStats.totalRevenue)}`)
  lines.push(`- Total Beban/Pengeluaran: ${formatRp(financialAnalytics.totalExpenses)}`)
  lines.push(`- Estimasi Laba Bersih   : ${formatRp(overviewStats.netProfit)} (Margin: ${overviewStats.profitMargin || '0'}%)`)
  lines.push(`- Rasio Pengeluaran      : ${cfoHealth.expenseRatio || '0'}% dari total omzet`)
  lines.push(`- Rata-rata Omzet / Hari : ${formatRp(cfoHealth.avgDailyOmzet)}`)
  lines.push(`- Total Saldo Likuid Kas : ${formatRp(overviewStats.totalLiquid)}`)
  lines.push('')

  // Cashier Breakdown
  lines.push('DISTRIBUSI PEMBAYARAN KASIR:')
  lines.push(`- Uang Fisik Kasir (Cash): ${formatRp(dailyCashierRecap.totalCash)}`)
  lines.push(`- Non-Tunai (QRIS & Bank): ${formatRp(dailyCashierRecap.totalNonCash)}`)
  lines.push(`- Total Transaksi Struk  : ${dailyCashierRecap.totalTxCount || 0} transaksi`)
  lines.push('')

  // Cafe Section (Only if Cafe or Hybrid)
  if (isCafe || isHybrid) {
    lines.push('KINERJA DIVISI CAFE & RESTO:')
    lines.push(`- Omzet Cafe             : ${formatRp(cafeAnalytics.totalRevenue)}`)
    lines.push(`- Total Porsi Terjual    : ${cafeAnalytics.totalItems || 0} item`)
    lines.push(`- Rata-rata Belanja (AOV): ${formatRp(cafeAnalytics.cafeAOV)} / struk`)
    if (cafeAnalytics.topMenus && cafeAnalytics.topMenus.length > 0) {
      lines.push('- Top Menu Terlaris      :')
      cafeAnalytics.topMenus.forEach((m, idx) => {
        lines.push(`  ${idx + 1}. ${m.nama} — ${m.qty} porsi (${formatRp(m.revenue)})`)
      })
    }
    lines.push('')
  }

  // Carwash Section (Only if Carwash or Hybrid)
  if (isCarwash || isHybrid) {
    lines.push('KINERJA DIVISI CARWASH & DETAILING:')
    lines.push(`- Omzet Carwash          : ${formatRp(carwashAnalytics.totalRevenue)}`)
    lines.push(`- Total Kendaraan Selesai: ${carwashAnalytics.totalUnits || 0} unit`)
    lines.push(`- Rata-rata Unit / Hari  : ${carwashAnalytics.avgCarsPerDay || 0} unit/hari`)
    lines.push(`- Rata-rata Belanja (AOV): ${formatRp(carwashAnalytics.carwashAOV)} / unit`)
    if (carwashAnalytics.topModels && carwashAnalytics.topModels.length > 0) {
      lines.push('- Top Tipe Kendaraan     :')
      carwashAnalytics.topModels.forEach((cm, idx) => {
        lines.push(`  ${idx + 1}. ${cm.model} (${cm.count} unit)`)
      })
    }
    lines.push('')
  }

  // Hybrid Synergy Section (The Relay Effect)
  if (isHybrid) {
    lines.push('MATRIKS SINERGI ESTAFET (THE RELAY EFFECT):')
    lines.push(`- Konversi Cross-Selling : ${advancedKPIs.crossConversionRate || '0'}% dari tamu servis memesan F&B`)
    lines.push(`- Volume Tamu Bersinergi : ${advancedKPIs.crossCount || 0} dari total ${advancedKPIs.totalCarwashStruks || 0} unit servis`)
    lines.push(`- Combined ARPU / Tamu   : ${formatRp(advancedKPIs.combinedARPU)}`)
    lines.push(`- Utilisasi Kapasitas Bay: ${advancedKPIs.capacityEfficiency || '0'}%`)
    lines.push('')
  }

  // Critical Stock
  if (criticalStockItems && criticalStockItems.length > 0) {
    lines.push('PERINGATAN STOK & BAHAN BAKU MENIPIS (≤ 100):')
    criticalStockItems.forEach(item => {
      lines.push(`- ${item.nama_barang || item.nama_produk}: sisa ${item.stok} ${item.satuan || 'unit'}`)
    })
    lines.push('')
  }

  // Rating (Pragmatic optional)
  if (ratingSummary && ratingSummary.totalRatings > 0) {
    lines.push('SURVEY KEPUASAN PELANGGAN:')
    lines.push(`- Rata-rata Rating       : ${ratingSummary.averageRating} / 5.0 (${ratingSummary.totalRatings} ulasan)`)
    lines.push('')
  }

  // 3. Structured Deliverables Prompt by Mode
  lines.push('---')
  lines.push('FORMAT OUTPUT YANG WAJIB ANDA BERIKAN:')

  if (consultationMode === 'CFO_AUDIT') {
    lines.push('1. HEALTH CHECK STRUKTUR BIAYA & OPEX: Evaluasi rasio pengeluaran operasional terhadap total omzet.')
    lines.push('2. AUDIT TITIK KEBOCORAN KAS & EFISIENSI: Di pos biaya mana terjadi pemborosan tertinggi (gaji/komisi, utilitas, atau restok)?')
    lines.push('3. ANALISIS KEBIJAKAN DIVIDEN / PRIVE: Berapa batas penarikan prive yang aman agar arus kas likuid tetap terlindungi?')
    lines.push('4. REKOMENDASI TANGGA EFISIENSI 30 HARI: Langkah konkret memotong biaya tanpa menurunkan kualitas layanan.')
  } else if (consultationMode === 'GROWTH_SALES') {
    lines.push('1. ANALISIS POLA TRAFIK & PEAK HOURS: Jam-jam dan hari apa yang paling produktif, serta bagaimana optimasi shift kerja?')
    lines.push('2. STRATEGI PENINGKATAN AOV (AVERAGE ORDER VALUE): Taktik upselling dan bundling untuk menaikkan nilai belanja per tiket.')
    if (isHybrid) {
      lines.push('3. OPTIMASI SINERGI ESTAFET (THE RELAY EFFECT): Cara menaikkan konversi silang tamu cuci mobil ke cafe hingga mencapai 65%+.')
    } else if (isCafe) {
      lines.push('3. ROTASI MEJA & SERVICE SPEED: Cara meningkatkan kecepatan penyajian makanan tanpa mengurangi kenyamanan tamu.')
    } else {
      lines.push('3. UTILISASI BAY & THROUGHPUT CUCI: Taktik mengurangi bottleneck antrean dan menaikkan jumlah kendaraan per jam.')
    }
    lines.push('4. RENCANA AKSI PERTUMBUHAN 14 HARI: 3 program taktis yang siap dijalankan kasir dan tim operasional besok pagi.')
  } else if (consultationMode === 'PRODUCT_MENU') {
    lines.push('1. BCG MATRIX PORTFOLIO (Stars, Cash Cows, Question Marks, Dogs): Kelompokkan produk/layanan berdasarkan kontribusi volume dan revenue.')
    lines.push('2. IDENTIFIKASI MENU/LAYANAN LAMBAT (DEADSTOCK RISK): Menu atau item apa yang perputarannya lambat dan berisiko membebani modal kerja?')
    lines.push('3. STRATEGI PRICING & BUNDLING: Rekomendasi penyesuaian harga atau paket bundling kombo untuk mendongkrak margin kotor.')
    lines.push('4. REKOMENDASI PENGELOLAAN STOK: Tindakan preventif terhadap item yang berstatus menipis (≤ 100).')
  } else {
    // Default '360_HEALTH'
    lines.push('1. 🎯 BUSINESS HEALTH SCORE (Skala 1 - 100): Berikan skor menyeluruh beserta justifikasi 4 pilar (Likuiditas, Margin, Efisiensi, Pertumbuhan).')
    lines.push('2. ⚔️ SWOT ANALYSIS RINGKAS: Strengths, Weaknesses, Opportunities, dan Threats berdasarkan data aktual di atas.')
    if (isHybrid) {
      lines.push('3. STRATEGI SINERGI ESTAFET (THE RELAY EFFECT): Langkah konkret mengunci retensi pelanggan cuci mobil dan cafe secara bersamaan.')
    } else if (isCafe) {
      lines.push('3. STRATEGI PERPUTARAN MEJA & F&B MARGIN: Langkah konkret menaikkan margin laba bersih cafe.')
    } else {
      lines.push('3. STRATEGI KAPASITAS BAY & RETENSI KENDARAAN: Langkah konkret memaksimalkan kapasitas slot pengerjaan.')
    }
    lines.push('4. REKOMENDASI EKSEKUTIF PEMILIK / INVESTOR: 3 keputusan strategis prioritas utama untuk Owner dalam 30 hari ke depan.')
  }

  return lines.join('\n')
}
