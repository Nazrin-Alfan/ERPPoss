import React, { useState, useMemo, useEffect } from 'react'
import {
  Bot,
  Copy,
  Check,
  X,
  ShieldCheck,
  Coffee,
  Car,
  TrendingUp,
  Receipt,
  Package,
  Layers,
  Sparkles,
  HelpCircle,
  FileCode,
  Download,
  AlertTriangle,
  Scale,
  Clock,
  Users,
  Store,
  ArrowRight
} from 'lucide-react'
import { STRATEGY_PRESETS, getAdaptedPresets, AIContextBuilder } from '../../services/aiContextBuilder'
import { IntelligenceEngineService } from '../../services/intelligenceEngineService'

export default function AIPromptBuilderModal({
  isOpen,
  onClose,
  dashboardData = {}
}) {
  const [activeTab, setActiveTab] = useState('PRESETS') // 'PRESETS' | 'CUSTOM' | 'RAW_JSON'
  const [selectedPreset, setSelectedPreset] = useState('360_HEALTH')
  const [customQuestion, setCustomQuestion] = useState('')
  const [copiedType, setCopiedType] = useState(null) // 'MARKDOWN' | 'JSON' | null
  const [categoryFilter, setCategoryFilter] = useState('ALL') // 'ALL' | 'EXECUTIVE' | 'FINANCE' | 'OPERATIONS' | 'GROWTH' | 'PRODUCT' | 'SUPPLY_CHAIN' | 'CRM'

  const tenantType = dashboardData?.tenantBusinessType || 'HYBRID'
  const tenantName = dashboardData?.activeTenant?.nama || 'RelayPOS Enterprise'
  const timeLabel = dashboardData?.timeRangeLabel || 'Bulan Ini'

  // Hitung Metrik Komprehensif melalui Intelligence Engine Service
  const calculatedSnapshot = useMemo(() => {
    if (!dashboardData) return null

    // Jika data mentah tersedia, gunakan Intelligence Engine Service secara utuh
    if (dashboardData.strukList || dashboardData.struk) {
      const engine = new IntelligenceEngineService({
        struk: dashboardData.strukList || dashboardData.struk || [],
        carwash: dashboardData.carwashList || dashboardData.carwash || [],
        cafe: dashboardData.cafeList || dashboardData.cafe || [],
        cashflow: dashboardData.cashflowLogs || dashboardData.cashflow || [],
        stok_barang: dashboardData.stokList || dashboardData.stok_barang || [],
        pos_balances: dashboardData.posAccountList || dashboardData.pos_balances || [],
        tenantBusinessType: tenantType,
        targetCapacity: dashboardData.advancedKPIs?.targetCapacity || 30,
        operatingDays: dashboardData.operatingDays
      })
      return engine.calculateComprehensiveMetrics()
    }

    // Fallback: Pemetaan dari props dashboard yang sudah dihitung
    return {
      financial: {
        totalRevenue: dashboardData.overviewStats?.totalRevenue || 0,
        totalExpenses: dashboardData.financialAnalytics?.totalExpenses || 0,
        netProfit: dashboardData.overviewStats?.netProfit || 0,
        profitMargin: parseFloat(dashboardData.overviewStats?.profitMargin || 0),
        expenseRatio: parseFloat(dashboardData.cfoHealth?.expenseRatio || 0),
        avgDailyOmzet: dashboardData.cfoHealth?.avgDailyOmzet || 0,
        totalLiquid: dashboardData.overviewStats?.totalLiquid || 0
      },
      cashier: {
        totalCash: dashboardData.dailyCashierRecap?.totalCash || 0,
        totalNonCash: dashboardData.dailyCashierRecap?.totalNonCash || 0,
        totalTxCount: dashboardData.dailyCashierRecap?.totalTxCount || 0
      },
      carwash: {
        totalRevenue: dashboardData.carwashAnalytics?.totalRevenue || 0,
        totalUnits: dashboardData.carwashAnalytics?.totalUnits || 0,
        avgCarsPerDay: parseFloat(dashboardData.carwashAnalytics?.avgCarsPerDay || 0),
        carwashAOV: dashboardData.carwashAnalytics?.carwashAOV || 0,
        topModels: dashboardData.carwashAnalytics?.topModels || []
      },
      cafe: {
        totalRevenue: dashboardData.cafeAnalytics?.totalRevenue || 0,
        totalItems: dashboardData.cafeAnalytics?.totalItems || 0,
        cafeStrukCount: dashboardData.cafeAnalytics?.cafeStrukCount || 0,
        cafeAOV: dashboardData.cafeAnalytics?.cafeAOV || 0,
        topMenus: dashboardData.cafeAnalytics?.topMenus || []
      },
      synergy: {
        crossConversionRate: parseFloat(dashboardData.advancedKPIs?.crossConversionRate || 0),
        crossConversionCount: dashboardData.advancedKPIs?.crossCount || 0,
        totalCarwashStruks: dashboardData.advancedKPIs?.totalCarwashStruks || 0,
        combinedARPU: dashboardData.advancedKPIs?.combinedARPU || 0,
        capacityEfficiency: dashboardData.advancedKPIs?.capacityEfficiency || 0,
        targetCapacity: dashboardData.advancedKPIs?.targetCapacity || 30
      },
      inventory: {
        criticalStockItems: dashboardData.criticalStockItems || [],
        totalInventoryValuation: 0
      },
      external: {
        referenceDate: new Date().toLocaleDateString('en-CA'),
        dayNameIndo: 'Hari Ini',
        isWeekend: false,
        isPaydayCycle: true,
        paydayLabel: 'Periode Aktif'
      },
      anomalies: []
    }
  }, [dashboardData, tenantType])

  // Context Builder Instance
  const contextBuilder = useMemo(() => {
    if (!calculatedSnapshot) return null
    return new AIContextBuilder({
      metrics: calculatedSnapshot,
      tenantBusinessType: tenantType,
      tenantName: tenantName,
      timeRangeLabel: timeLabel,
      presetId: activeTab === 'CUSTOM' ? 'CUSTOM' : selectedPreset,
      customQuestion: customQuestion
    })
  }, [calculatedSnapshot, tenantType, tenantName, timeLabel, activeTab, selectedPreset, customQuestion])

  const markdownPrompt = useMemo(() => {
    if (!contextBuilder) return ''
    return contextBuilder.buildMarkdownPrompt()
  }, [contextBuilder])

  const rawJsonOutput = useMemo(() => {
    if (!contextBuilder) return '{}'
    return JSON.stringify(contextBuilder.exportCleanJSON(), null, 2)
  }, [contextBuilder])

  const allPresets = useMemo(() => getAdaptedPresets(tenantType), [tenantType])

  if (!isOpen) return null

  const handleCopyMarkdown = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdownPrompt)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = markdownPrompt
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopiedType('MARKDOWN')
      setTimeout(() => setCopiedType(null), 2500)
    } catch (err) {
      console.error('Failed to copy markdown prompt:', err)
    }
  }

  const handleCopyJSON = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(rawJsonOutput)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = rawJsonOutput
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopiedType('JSON')
      setTimeout(() => setCopiedType(null), 2500)
    } catch (err) {
      console.error('Failed to copy JSON:', err)
    }
  }

  const handleDownloadJSON = () => {
    try {
      const blob = new Blob([rawJsonOutput], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relaypos-intelligence-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download JSON:', err)
    }
  }

  const filteredPresets = allPresets.filter((p) => {
    // Filter rekomendasi tipe bisnis
    if (p.recommendedFor && !p.recommendedFor.includes(tenantType)) return false
    // Filter kategori tab
    if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false
    return true
  })

  const getPresetIcon = (presetId) => {
    switch (presetId) {
      case 'CFO_AUDIT':
        return <Receipt size={16} className="text-warning" />
      case 'PRIVE_POLICY':
        return <Scale size={16} className="text-success" />
      case 'RELAY_SYNERGY':
        return <TrendingUp size={16} className="text-primary" />
      case 'PEAK_HOURS':
        return <Clock size={16} className="text-primary" />
      case 'DYNAMIC_PRICING':
        return <Sparkles size={16} className="text-warning" />
      case 'PRODUCT_BCG':
        return <Package size={16} className="text-destructive" />
      case 'STOCK_RUNWAY':
        return <AlertTriangle size={16} className="text-warning" />
      case 'CRM_LOYALTY':
      case 'CHURN_RECOVERY':
        return <Users size={16} className="text-primary" />
      case '360_HEALTH':
      default:
        return <Layers size={16} className="text-primary" />
    }
  }

  const quickQuestions = [
    'Bandingkan margin laba kotor menu makanan vs minuman bulan ini.',
    'Apakah kenaikan komisi kru cuci 10% aman jika harga paket tidak dinaikkan?',
    'Evaluasi efektivitas jam buka cabang dan rekomendasi pembagian shift karyawan.',
    'Berapa batas maksimal penarikan dividen/prive agar modal kerja tetap aman?'
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-5xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden text-foreground">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-subsurface">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary">
              <Bot size={20} strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                  RelayPOS Intelligence Layer
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground border border-primary/25 font-semibold uppercase tracking-wider">
                  AI-Vendor-Neutral
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Kompilasi data deterministik menjadi context bisnis siap-pakai untuk ChatGPT, Claude, Gemini, atau DeepSeek
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-surface-hover transition-all duration-150 active:scale-[0.98] cursor-pointer"
            aria-label="Tutup Dialog"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Security & Multi-Tenant Bar */}
        <div className="px-4 sm:px-5 py-2.5 bg-success-bg/60 border-b border-border flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2 text-success font-semibold">
            <ShieldCheck size={14} strokeWidth={1.75} />
            <span>Multi-Tenant Row-Level Isolated &amp; 100% Anonim (Zero Customer PII)</span>
          </div>

          <div className="flex items-center gap-2 text-muted text-[11px]">
            <span>Model Usaha:</span>
            <span className="font-bold text-foreground px-2.5 py-0.5 rounded-md bg-surface border border-border flex items-center gap-1">
              {tenantType === 'CAFE' ? (
                <>
                  <Coffee size={12} className="text-warning" /> Cafe Murni
                </>
              ) : tenantType === 'CARWASH' ? (
                <>
                  <Car size={12} className="text-primary" /> Carwash Murni
                </>
              ) : (
                <>
                  <Store size={12} className="text-success" /> Hybrid (Sistem Estafet)
                </>
              )}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-border bg-subsurface px-4 sm:px-5 gap-2 pt-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('PRESETS')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === 'PRESETS'
                ? 'bg-surface text-foreground border-t border-x border-border shadow-xs'
                : 'text-muted hover:text-foreground hover:bg-surface/50'
            }`}
          >
            <Sparkles size={14} className={activeTab === 'PRESETS' ? 'text-primary' : 'text-muted-dark'} />
            10 Preset Strategis
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CUSTOM')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === 'CUSTOM'
                ? 'bg-surface text-foreground border-t border-x border-border shadow-xs'
                : 'text-muted hover:text-foreground hover:bg-surface/50'
            }`}
          >
            <HelpCircle size={14} className={activeTab === 'CUSTOM' ? 'text-warning' : 'text-muted-dark'} />
            Tanya Bebas (Custom Query)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('RAW_JSON')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-150 whitespace-nowrap cursor-pointer ${
              activeTab === 'RAW_JSON'
                ? 'bg-surface text-foreground border-t border-x border-border shadow-xs'
                : 'text-muted hover:text-foreground hover:bg-surface/50'
            }`}
          >
            <FileCode size={14} className={activeTab === 'RAW_JSON' ? 'text-success' : 'text-muted-dark'} />
            Raw JSON Context
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: 10 STRATEGY PRESETS */}
          {activeTab === 'PRESETS' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                  Pilih Fokus Strategi Analisis:
                </label>
                <span className="text-[11px] text-muted font-mono tabular-nums">
                  {filteredPresets.length} Template Tersedia
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredPresets.map((preset) => {
                  const isSelected = selectedPreset === preset.id
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`text-left p-3.5 rounded-xl border transition-all duration-150 flex items-start gap-3 active:scale-[0.98] cursor-pointer ${
                        isSelected
                          ? 'bg-selected-surface border-border-active ring-1 ring-ring/30 shadow-xs'
                          : 'bg-subsurface border-border hover:border-border-hover hover:bg-surface-hover'
                      }`}
                    >
                      <div className={`p-2 rounded-lg mt-0.5 border ${
                        isSelected
                          ? 'bg-primary-soft border-primary/25'
                          : 'bg-surface border-border'
                      }`}>
                        {getPresetIcon(preset.id)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-foreground leading-tight">
                          {preset.title}
                        </div>
                        <div className="text-[11px] text-muted mt-1 line-clamp-2 leading-relaxed">
                          {preset.desc}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOM QUERY */}
          {activeTab === 'CUSTOM' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block mb-1">
                  Ketik Pertanyaan atau Instruksi Spesifik:
                </label>
                <p className="text-xs text-muted mb-2">
                  Intelligence Layer akan otomatis melampirkan seluruh metrik keuangan, operasional, dan stok secara lengkap di balik layar.
                </p>
                <textarea
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Contoh: Tolong bandingkan profitabilitas menu cafe terlaris vs menu yang jarang laku, lalu buatkan strategi bundling kombo dengan paket cuci mobil..."
                  rows={4}
                  className="w-full bg-subsurface border border-border rounded-xl p-3 text-base sm:text-xs text-foreground placeholder:text-muted-dark focus:outline-none focus:border-border-active focus:ring-2 focus:ring-ring/20 transition-all font-sans leading-relaxed"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-2">
                  Contoh Pertanyaan Cepat (Quick Suggestions):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCustomQuestion(q)}
                      className="text-left p-2.5 rounded-xl bg-subsurface border border-border hover:border-border-hover text-xs text-foreground transition-all flex items-center justify-between gap-2 active:scale-[0.98] cursor-pointer"
                    >
                      <span className="line-clamp-1">{q}</span>
                      <ArrowRight size={12} className="text-muted flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RAW JSON */}
          {activeTab === 'RAW_JSON' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                  Deterministic JSON Schema Output:
                </label>
                <span className="text-[11px] font-mono text-muted">
                  Ready for AI API Ingestion
                </span>
              </div>
              <pre className="w-full bg-subsurface border border-border rounded-xl p-3.5 text-[11px] font-mono text-foreground max-h-80 overflow-y-auto leading-relaxed select-all">
                {rawJsonOutput}
              </pre>
            </div>
          )}

          {/* Prompt Preview Box (Hanya jika tab bukan RAW_JSON) */}
          {activeTab !== 'RAW_JSON' && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground uppercase tracking-wider block">
                  Pratinjau Prompt Eksekutif:
                </label>
                <span className="text-[11px] text-muted font-mono tabular-nums">
                  {markdownPrompt.length} karakter
                </span>
              </div>
              <div className="bg-subsurface border border-border rounded-xl p-3.5 max-h-64 overflow-y-auto font-mono text-[11px] text-foreground whitespace-pre-wrap leading-relaxed select-all">
                {markdownPrompt}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-border bg-subsurface flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-block font-mono text-[10px] px-2 py-0.5 rounded-md bg-surface border border-border text-muted">
              100% Vendor-Neutral
            </kbd>
            <span className="text-xs text-muted">
              Tempel prompt ke ChatGPT / Claude / DeepSeek
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            <button
              type="button"
              onClick={handleDownloadJSON}
              className="min-h-[40px] px-3.5 py-2 rounded-full text-xs font-semibold bg-surface hover:bg-surface-hover border border-border text-foreground transition-all duration-150 flex items-center gap-2 active:scale-[0.98] cursor-pointer"
              title="Unduh file JSON"
            >
              <Download size={14} strokeWidth={1.75} />
              <span className="hidden sm:inline">Unduh</span> JSON
            </button>

            <button
              type="button"
              onClick={handleCopyJSON}
              className={`min-h-[40px] px-3.5 py-2 rounded-full text-xs font-semibold transition-all duration-150 flex items-center gap-2 border active:scale-[0.98] cursor-pointer ${
                copiedType === 'JSON'
                  ? 'bg-success border-success text-white'
                  : 'bg-surface hover:bg-surface-hover border-border text-foreground'
              }`}
            >
              {copiedType === 'JSON' ? (
                <>
                  <Check size={14} className="text-white" /> Tersalin!
                </>
              ) : (
                <>
                  <FileCode size={14} /> Salin JSON
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyMarkdown}
              className={`min-h-[40px] px-4 py-2 rounded-full text-xs font-semibold transition-all duration-150 flex items-center gap-2 shadow-xs active:scale-[0.98] cursor-pointer ${
                copiedType === 'MARKDOWN'
                  ? 'bg-success text-white'
                  : 'bg-primary hover:bg-primary-hover text-primary-foreground'
              }`}
            >
              {copiedType === 'MARKDOWN' ? (
                <>
                  <Check size={15} strokeWidth={2} /> Prompt Tersalin!
                </>
              ) : (
                <>
                  <Copy size={15} strokeWidth={1.75} /> Salin Prompt Markdown
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
