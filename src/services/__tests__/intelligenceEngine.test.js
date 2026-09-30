import { describe, it, expect } from 'vitest'
import { IntelligenceEngineService } from '../intelligenceEngineService.js'
import { AIContextBuilder, STRATEGY_PRESETS, getAdaptedPresets } from '../aiContextBuilder.js'

describe('RelayPOS Intelligence Engine Service (Deterministic Business Metrics)', () => {
  const sampleStruk = [
    {
      id_struk: 'str-01',
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      tanggal: '2026-09-25',
      jam: '10:15:00',
      total_tagihan: 150000,
      metode_bayar: 'CASH',
      nominal_cash: 150000,
      nominal_qris: 0,
      status_bayar: 'Selesai'
    },
    {
      id_struk: 'str-02',
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      tanggal: '2026-09-25',
      jam: '14:30:00',
      total_tagihan: 100000,
      metode_bayar: 'QRIS',
      nominal_cash: 0,
      nominal_qris: 100000,
      status_bayar: 'Selesai'
    },
    {
      id_struk: 'str-03',
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      tanggal: '2026-09-26',
      jam: '19:00:00',
      total_tagihan: 50000,
      metode_bayar: 'CASH',
      nominal_cash: 50000,
      nominal_qris: 0,
      status_bayar: 'Batal' // Void
    }
  ]

  const sampleCarwash = [
    {
      id: 'cw-01',
      id_struk: 'str-01',
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      tanggal: '2026-09-25',
      jam: '10:15:00',
      plat: 'B 1234 ABC',
      model: 'Innova Reborn',
      paket: 'CUCI BODY + INTERIOR',
      harga: 75000,
      gaji_anggota: 25000,
      status: 'Selesai'
    },
    {
      id: 'cw-02',
      id_struk: 'str-02',
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      tanggal: '2026-09-25',
      jam: '14:30:00',
      plat: 'B 5678 XYZ',
      model: 'Fortuner GR',
      paket: 'CUCI KOMPLIT + WAX',
      harga: 100000,
      gaji_anggota: 35000,
      status: 'Selesai'
    }
  ]

  const sampleCafe = [
    {
      id: 'cf-01',
      id_struk: 'str-01', // Sinergi dengan cw-01
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      nama_menu: 'Ice Americano',
      qty: 2,
      harga_satuan: 25000,
      subtotal: 50000,
      status: 'Selesai'
    },
    {
      id: 'cf-02',
      id_struk: 'str-01',
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      nama_menu: 'Kentang Goreng',
      qty: 1,
      harga_satuan: 25000,
      subtotal: 25000,
      status: 'Selesai'
    }
  ]

  const sampleCashflow = [
    {
      id: 'cfl-01',
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      tanggal: '2026-09-25',
      jenis: 'Pengeluaran Cafe',
      kategori: 'Bahan Baku',
      pemasukan: 0,
      pengeluaran: 40000,
      pos: 'SALDO CASH'
    },
    {
      id: 'cfl-02',
      tenant_id: 'tenant-demo',
      branch_id: 'branch-01',
      tanggal: '2026-09-25',
      jenis: 'Pindah Kas', // Mutasi kas - tidak dihitung expense
      kategori: 'Transfer',
      pemasukan: 0,
      pengeluaran: 50000,
      pos: 'SALDO CASH'
    }
  ]

  const sampleStock = [
    {
      id: 'stk-01',
      tenant_id: 'tenant-demo',
      nama_produk: 'Biji Kopi Arabica',
      stok: 15, // Kritis
      satuan: 'kg',
      harga_satuan: 120000,
      min_stok: 20
    },
    {
      id: 'stk-02',
      tenant_id: 'tenant-demo',
      nama_produk: 'Shampoo Mobil Premium',
      stok: 120, // Aman
      satuan: 'liter',
      harga_satuan: 35000,
      min_stok: 50
    }
  ]

  it('1. Calculates exact deterministic financial metrics excluding cancelled/void and non-OPEX mutations', () => {
    const engine = new IntelligenceEngineService({
      struk: sampleStruk,
      carwash: sampleCarwash,
      cafe: sampleCafe,
      cashflow: sampleCashflow,
      stok_barang: sampleStock,
      tenantBusinessType: 'HYBRID',
      targetCapacity: 30
    })

    const metrics = engine.calculateComprehensiveMetrics()

    // Revenue: 150.000 + 100.000 (str-03 void diabaikan) = 250.000
    expect(metrics.financial.totalRevenue).toBe(250000)
    // Expenses: 40.000 (cfl-02 'Pindah Kas' diabaikan)
    expect(metrics.financial.totalExpenses).toBe(40000)
    // Net Profit: 250.000 - 40.000 = 210.000
    expect(metrics.financial.netProfit).toBe(210000)
    // Profit Margin: (210.000 / 250.000) * 100 = 84.0%
    expect(metrics.financial.profitMargin).toBe(84)
    // Expense Ratio: (40.000 / 250.000) * 100 = 16.0%
    expect(metrics.financial.expenseRatio).toBe(16)
  })

  it('2. Calculates Relay Effect cross-selling conversion rate deterministically', () => {
    const engine = new IntelligenceEngineService({
      struk: sampleStruk,
      carwash: sampleCarwash,
      cafe: sampleCafe,
      cashflow: sampleCashflow,
      stok_barang: sampleStock,
      tenantBusinessType: 'HYBRID',
      targetCapacity: 30
    })

    const metrics = engine.calculateComprehensiveMetrics()

    // 2 carwash transactions (str-01, str-02). str-01 juga beli di cafe.
    // Cross conversion: 1 / 2 = 50.0%
    expect(metrics.synergy.totalCarwashStruks).toBe(2)
    expect(metrics.synergy.crossConversionCount).toBe(1)
    expect(metrics.synergy.crossConversionRate).toBe(50)
  })

  it('3. Computes inventory runway and critical stock items with exact precision', () => {
    const engine = new IntelligenceEngineService({
      struk: sampleStruk,
      carwash: sampleCarwash,
      cafe: sampleCafe,
      cashflow: sampleCashflow,
      stok_barang: sampleStock,
      tenantBusinessType: 'HYBRID'
    })

    const metrics = engine.calculateComprehensiveMetrics()

    expect(metrics.inventory.criticalStockItems.length).toBe(1)
    expect(metrics.inventory.criticalStockItems[0].nama_produk).toBe('Biji Kopi Arabica')
    expect(metrics.inventory.totalInventoryValuation).toBe(15 * 120000 + 120 * 35000) // 1.800.000 + 4.200.000 = 6.000.000
  })

  it('4. Correctly extracts external and calendar contextual factors', () => {
    const engine = new IntelligenceEngineService({
      struk: sampleStruk,
      carwash: sampleCarwash,
      cafe: sampleCafe,
      cashflow: sampleCashflow,
      stok_barang: sampleStock,
      referenceDate: '2026-09-25' // Jumat gajian
    })

    const external = engine.extractExternalContext()
    expect(external.isPaydayCycle).toBe(true) // Tanggal 25 adalah payday
    expect(external.dayNameIndo).toBe('Jumat')
  })
})

describe('RelayPOS AI Context Builder (Vendor-Neutral, Zero-PII & Unlimited Queries)', () => {
  const mockMetrics = {
    financial: {
      totalRevenue: 5000000,
      totalExpenses: 2000000,
      netProfit: 3000000,
      profitMargin: 60,
      expenseRatio: 40,
      avgDailyOmzet: 500000,
      totalLiquid: 12500000
    },
    cashier: {
      totalCash: 3000000,
      totalNonCash: 2000000,
      totalTxCount: 25
    },
    carwash: {
      totalRevenue: 3500000,
      totalUnits: 35,
      avgCarsPerDay: 35,
      carwashAOV: 100000,
      topModels: [{ model: 'Avanza', count: 12 }]
    },
    cafe: {
      totalRevenue: 1500000,
      totalItems: 40,
      cafeStrukCount: 20,
      cafeAOV: 75000,
      topMenus: [{ nama: 'Es Kopi Gula Aren', qty: 25, revenue: 500000 }]
    },
    synergy: {
      crossConversionRate: 57.1,
      crossConversionCount: 20,
      totalCarwashStruks: 35,
      combinedARPU: 142857,
      capacityEfficiency: 85
    },
    inventory: {
      criticalStockItems: [{ nama_produk: 'Sirup Karamel', stok: 2, satuan: 'botol' }],
      totalInventoryValuation: 18500000
    },
    external: {
      isPaydayCycle: true,
      dayNameIndo: 'Sabtu',
      isWeekend: true
    },
    anomalies: []
  }

  it('1. Provides 10 Indonesian preset strategy templates and validates their IDs', () => {
    expect(STRATEGY_PRESETS.length).toBe(10)
    const presetIds = STRATEGY_PRESETS.map(p => p.id)
    expect(presetIds).toContain('360_HEALTH')
    expect(presetIds).toContain('CFO_AUDIT')
    expect(presetIds).toContain('PRIVE_POLICY')
    expect(presetIds).toContain('RELAY_SYNERGY')
    expect(presetIds).toContain('PEAK_HOURS')
    expect(presetIds).toContain('DYNAMIC_PRICING')
    expect(presetIds).toContain('PRODUCT_BCG')
    expect(presetIds).toContain('STOCK_RUNWAY')
    expect(presetIds).toContain('CRM_LOYALTY')
    expect(presetIds).toContain('CHURN_RECOVERY')
  })

  it('2. Builds vendor-neutral executive markdown prompt with zero PII', () => {
    const builder = new AIContextBuilder({
      metrics: mockMetrics,
      tenantBusinessType: 'HYBRID',
      presetId: '360_HEALTH',
      customQuestion: ''
    })

    const promptText = builder.buildMarkdownPrompt()

    expect(promptText).toContain('Audit Kesehatan Bisnis 360°')
    expect(promptText).toContain('Total Omzet Penjualan')
    expect(promptText).toContain('MATRIKS SINERGI ESTAFET')
    // Memastikan tidak ada nomor telepon atau data pribadi pelanggan
    expect(promptText).not.toContain('081')
    expect(promptText).not.toContain('nomor_hp')
  })

  it('3. Supports dynamic custom user questions beyond preset templates', () => {
    const customQ = 'Apakah pembukaan cabang baru di Jakarta Barat layak dilakukan dengan margin saat ini?'
    const builder = new AIContextBuilder({
      metrics: mockMetrics,
      tenantBusinessType: 'HYBRID',
      presetId: 'CUSTOM',
      customQuestion: customQ
    })

    const promptText = builder.buildMarkdownPrompt()
    expect(promptText).toContain(customQ)
    expect(promptText).toContain('PERTANYAAN KHUSUS MANAJEMEN:')
  })

  it('4. Exports clean full JSON schema for AI ingestion', () => {
    const builder = new AIContextBuilder({
      metrics: mockMetrics,
      tenantBusinessType: 'HYBRID',
      presetId: '360_HEALTH'
    })

    const jsonExport = builder.exportCleanJSON()
    expect(jsonExport.financial_metrics.total_revenue).toBe(5000000)
    expect(jsonExport.business_type).toBe('HYBRID')
    expect(jsonExport.external_factors.is_payday_cycle).toBe(true)
  })

  it('5. Correctly calculates granular cashflowHierarchy (Jenis -> Kategori -> Nominal, %)', () => {
    const customCashflow = [
      { id_cashflow: 'cf-1', jenis: 'Pengeluaran Cafe', kategori: 'Bahan Baku Kopi', pengeluaran: 500000 },
      { id_cashflow: 'cf-2', jenis: 'Pengeluaran Cafe', kategori: 'Bahan Baku Kopi', pengeluaran: 300000 },
      { id_cashflow: 'cf-3', jenis: 'Pengeluaran Cafe', kategori: 'Listrik Cafe', pengeluaran: 200000 },
      { id_cashflow: 'cf-4', jenis: 'Pengeluaran Carwash', kategori: 'Shampoo & Chemical', pengeluaran: 400000 }
    ]

    const engine = new IntelligenceEngineService({
      cashflow: customCashflow,
      struk: [{ total_tagihan: 3000000, status_bayar: 'Selesai' }]
    })

    const fin = engine.calculateFinancialMetrics()
    expect(fin.cashflowHierarchy).toBeDefined()
    expect(fin.cashflowHierarchy.length).toBe(2)

    const cafeGroup = fin.cashflowHierarchy.find((g) => g.jenis === 'Pengeluaran Cafe')
    expect(cafeGroup).toBeDefined()
    expect(cafeGroup.total).toBe(1000000)
    expect(cafeGroup.categories.length).toBe(2)

    const coffeeCat = cafeGroup.categories.find((c) => c.kategori === 'Bahan Baku Kopi')
    expect(coffeeCat.total).toBe(800000)
    expect(coffeeCat.count).toBe(2)
    expect(coffeeCat.percentageOfJenis).toBe(80)
  })

  it('6. Accurately calculates historical comparison delta and growth percentage', () => {
    const curMetrics = {
      financial: { totalRevenue: 12000000, totalExpenses: 6000000, netProfit: 6000000, profitMargin: 50 },
      cashier: { totalTxCount: 200 },
      carwash: { totalUnits: 150 },
      cafe: { totalRevenue: 4000000 },
      synergy: { crossConversionRate: 35 }
    }

    const prevMetrics = {
      financial: { totalRevenue: 10000000, totalExpenses: 5000000, netProfit: 5000000, profitMargin: 50 },
      cashier: { totalTxCount: 180 },
      carwash: { totalUnits: 120 },
      cafe: { totalRevenue: 3000000 },
      synergy: { crossConversionRate: 25 }
    }

    const comp = IntelligenceEngineService.calculateHistoricalComparison(curMetrics, prevMetrics, 'Bulan Ini', 'Bulan Lalu')
    expect(comp.currentLabel).toBe('Bulan Ini')
    expect(comp.previousLabel).toBe('Bulan Lalu')
    expect(comp.metrics.revenue.delta).toBe(2000000)
    expect(comp.metrics.revenue.percent).toBe(20)
    expect(comp.metrics.crossConversionRate.deltaBps).toBe(10)
  })

  it('7. Renders modular data blocks and interactive feedback directive in prompt', () => {
    const curMetrics = {
      financial: {
        totalRevenue: 10000000,
        totalExpenses: 4000000,
        netProfit: 6000000,
        profitMargin: 60,
        expenseRatio: 40,
        avgDailyOmzet: 500000,
        cashflowHierarchy: [
          {
            jenis: 'Pengeluaran Cafe',
            total: 3000000,
            percentage: 75,
            categories: [{ kategori: 'Susu UHT', total: 3000000, percentageOfJenis: 100, count: 5 }]
          }
        ]
      }
    }

    const histComp = IntelligenceEngineService.calculateHistoricalComparison(
      curMetrics,
      { financial: { totalRevenue: 8000000, totalExpenses: 4000000, netProfit: 4000000 } },
      'September 2026',
      'Agustus 2026'
    )

    const builder = new AIContextBuilder({
      metrics: curMetrics,
      tenantBusinessType: 'HYBRID',
      selectedBlocks: ['fin_summary', 'fin_cashflow_hierarchy', 'hist_variance_table'],
      historicalData: histComp,
      interactiveFeedback: true
    })

    const promptText = builder.buildMarkdownPrompt()
    expect(promptText).toContain('BEDAH STRUKTUR ARUS KAS')
    expect(promptText).toContain('Pengeluaran Cafe')
    expect(promptText).toContain('Susu UHT')
    expect(promptText).toContain('KOMPARASI KINERJA HISTORIS (September 2026 vs Agustus 2026)')
    expect(promptText).toContain('PANDUAN INTERAKSI DUA ARAH (INTERACTIVE FEEDBACK & GAP ANALYSIS)')
    expect(promptText).toContain('WAJIB ajukan 3 hingga 5 pertanyaan klarifikasi mendalam')
  })

  it('8. Verifies sector-specific historical comparison rendering for Carwash and Cafe', () => {
    const curMetrics = {
      financial: { totalRevenue: 50000000, totalExpenses: 20000000, netProfit: 30000000 },
      carwash: { totalRevenue: 20000000, totalUnits: 800, avgCarsPerDay: 26.7, carwashAOV: 25000 },
      cafe: { totalRevenue: 30000000, totalItems: 1500, cafeStrukCount: 600, cafeAOV: 50000 }
    }
    const prevMetrics = {
      financial: { totalRevenue: 45000000, totalExpenses: 22000000, netProfit: 23000000 },
      carwash: { totalRevenue: 18000000, totalUnits: 720, avgCarsPerDay: 24.0, carwashAOV: 25000 },
      cafe: { totalRevenue: 27000000, totalItems: 1350, cafeStrukCount: 540, cafeAOV: 50000 }
    }

    const histComp = IntelligenceEngineService.calculateHistoricalComparison(curMetrics, prevMetrics, 'September 2026', 'Agustus 2026')
    expect(histComp.sectors.carwash.totalUnits.delta).toBe(80)
    expect(histComp.sectors.cafe.cafeRevenue.delta).toBe(3000000)

    // Mode blok mandiri: hanya pilih Carwash + Cafe + Komparasi Historis
    const builder = new AIContextBuilder({
      metrics: curMetrics,
      tenantBusinessType: 'HYBRID',
      selectedBlocks: ['cw_aov_velocity', 'cafe_summary', 'hist_cw_variance', 'hist_cafe_variance'],
      historicalData: histComp,
      interactiveFeedback: false
    })

    const standaloneText = builder.buildStandaloneBlocksPrompt({ dataOnly: true })
    expect(standaloneText).toContain('Komparasi Operasional Carwash')
    expect(standaloneText).toContain('Komparasi Operasional F&B Cafe & Resto')
    expect(standaloneText).toContain('DATA OPERASIONAL CARWASH')
    expect(standaloneText).toContain('DATA OPERASIONAL CAFE & RESTO')
  })

  it('9. Verifies getAdaptedPresets returns specialized presets for CAFE tenant', () => {
    const cafePresets = getAdaptedPresets('CAFE')
    expect(cafePresets.length).toBe(10)
    
    const healthPreset = cafePresets.find(p => p.id === '360_HEALTH')
    expect(healthPreset.title).toContain('Cafe & Resto')

    const cfoPreset = cafePresets.find(p => p.id === 'CFO_AUDIT')
    expect(cfoPreset.title).toContain('Food Cost')

    const synergyPreset = cafePresets.find(p => p.id === 'RELAY_SYNERGY')
    expect(synergyPreset.title).toContain('Penjualan Silang & Upselling Menu F&B')
  })

  it('10. Builds 100% pure F&B prompt for CAFE tenant with zero carwash bleed', () => {
    const cafeMetrics = {
      financial: {
        totalRevenue: 25000000,
        totalExpenses: 12000000,
        netProfit: 13000000,
        profitMargin: 52,
        expenseRatio: 48,
        avgDailyOmzet: 833333,
        totalLiquid: 15000000,
        operatingDays: 30
      },
      cashier: { totalCash: 15000000, totalNonCash: 10000000, totalTxCount: 500 },
      carwash: { totalRevenue: 0, totalUnits: 0 },
      cafe: {
        totalRevenue: 25000000,
        totalItems: 850,
        cafeStrukCount: 500,
        cafeAOV: 50000,
        topMenus: [{ nama: 'Kopi Susu Senja', qty: 250, revenue: 5000000 }],
        slowestMenus: [{ nama: 'Teh Hangat', qty: 5 }]
      },
      synergy: { crossConversionRate: 0, crossCafeRevenue: 0 },
      crm: { totalUniqueCustomers: 320, vipCount: 15, regularCount: 85, newCount: 220, repeatCustomerRate: 31.25, avgLTV: 78125 },
      hourly: { busiestCafeHour: '15:00' },
      elasticity: { avgWeekdayDaily: 700000, avgWeekendDaily: 1100000, avgPaydayDaily: 950000 },
      inventory: { totalInventoryValuation: 8500000, criticalStockItems: [{ nama_produk: 'Biji Kopi Arabika', stok: 2, satuan: 'kg' }] },
      anomalies: []
    }

    const builder = new AIContextBuilder({
      metrics: cafeMetrics,
      tenantBusinessType: 'CAFE',
      tenantName: 'Senja Coffee Roastery',
      timeRangeLabel: 'Bulan September 2026',
      presetId: '360_HEALTH'
    })

    const promptText = builder.buildMarkdownPrompt()
    expect(promptText).toContain('Senja Coffee Roastery')
    expect(promptText).toContain('Unit Usaha F&B Cafe & Resto')
    expect(promptText).toContain('CAFE HEALTH SCORE')
    expect(promptText).toContain('DATA OPERASIONAL & FOOD/BEVERAGE (CAFE & LOUNGE)')
    expect(promptText).not.toContain('CARWASH')
    expect(promptText).not.toContain('bay cuci')
    expect(promptText).not.toContain('THE RELAY EFFECT')
  })

  it('11. Builds 100% pure Automotive prompt for CARWASH tenant with zero cafe bleed', () => {
    const carwashMetrics = {
      financial: {
        totalRevenue: 40000000,
        totalExpenses: 18000000,
        netProfit: 22000000,
        profitMargin: 55,
        expenseRatio: 45,
        avgDailyOmzet: 1333333,
        totalLiquid: 20000000,
        operatingDays: 30
      },
      cashier: { totalCash: 25000000, totalNonCash: 15000000, totalTxCount: 650 },
      carwash: {
        totalRevenue: 40000000,
        totalUnits: 650,
        avgCarsPerDay: 21.7,
        carwashAOV: 61538,
        topModels: [{ model: 'Innova Reborn', count: 95 }, { model: 'Fortuner', count: 42 }]
      },
      cafe: { totalRevenue: 0, totalItems: 0 },
      synergy: { crossConversionRate: 0, crossCafeRevenue: 0 },
      crm: { totalUniqueCustomers: 450, vipCount: 20, regularCount: 110, newCount: 320, repeatCustomerRate: 28.89, avgLTV: 88888 },
      hourly: { busiestCarwashHour: '09:00' },
      elasticity: { avgWeekdayDaily: 1100000, avgWeekendDaily: 1800000, avgPaydayDaily: 1500000 },
      inventory: { totalInventoryValuation: 6000000, criticalStockItems: [{ nama_produk: 'Shampoo Salju Premium', stok: 2, satuan: 'jerigen' }] },
      anomalies: []
    }

    const builder = new AIContextBuilder({
      metrics: carwashMetrics,
      tenantBusinessType: 'CARWASH',
      tenantName: 'Autoglaze Pro Detailing',
      timeRangeLabel: 'Bulan September 2026',
      presetId: '360_HEALTH'
    })

    const promptText = builder.buildMarkdownPrompt()
    expect(promptText).toContain('Autoglaze Pro Detailing')
    expect(promptText).toContain('Unit Usaha Carwash Modern & Auto Detailing')
    expect(promptText).toContain('CARWASH HEALTH SCORE')
    expect(promptText).toContain('DATA OPERASIONAL & PERFORMA BAY CUCI (CARWASH)')
    expect(promptText).not.toContain('CAFE')
    expect(promptText).not.toContain('pesanan meja')
    expect(promptText).not.toContain('THE RELAY EFFECT')
  })
})
