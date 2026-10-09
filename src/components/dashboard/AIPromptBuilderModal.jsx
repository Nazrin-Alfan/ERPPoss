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
        return <Receipt size={16} className="text-amber-400" />
      case 'PRIVE_POLICY':
        return <Scale size={16} className="text-emerald-400" />
      case 'RELAY_SYNERGY':
        return <TrendingUp size={16} className="text-cyan-400" />
      case 'PEAK_HOURS':
        return <Clock size={16} className="text-indigo-400" />
      case 'DYNAMIC_PRICING':
        return <Sparkles size={16} className="text-yellow-400" />
      case 'PRODUCT_BCG':
        return <Package size={16} className="text-rose-400" />
      case 'STOCK_RUNWAY':
        return <AlertTriangle size={16} className="text-amber-500" />
      case 'CRM_LOYALTY':
      case 'CHURN_RECOVERY':
        return <Users size={16} className="text-sky-400" />
      case '360_HEALTH':
      default:
        return <Layers size={16} className="text-blue-400" />
    }
  }

  const quickQuestions = [
    'Bandingkan margin laba kotor menu makanan vs minuman bulan ini.',
    'Apakah kenaikan komisi kru cuci 10% aman jika harga paket tidak dinaikkan?',
    'Evaluasi efektivitas jam buka cabang dan rekomendasi pembagian shift karyawan.',
    'Berapa batas maksimal penarikan dividen/prive agar modal kerja tetap aman?'
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="bg-[#090D16] border border-zinc-800/80 rounded-2xl w-full max-w-5xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-blue-400 shadow-inner">
              <Bot size={20} strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  RelayPOS Intelligence Layer
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold uppercase tracking-wider">
                  AI-Vendor-Neutral
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Kompilasi data deterministik menjadi context bisnis siap-pakai untuk ChatGPT, Claude, Gemini, atau DeepSeek
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all duration-150 active:scale-[0.98]"
            aria-label="Tutup Dialog"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Security & Multi-Tenant Bar */}
        <div className="px-4 sm:px-5 py-2.5 bg-[#050810] border-b border-zinc-800/80 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <ShieldCheck size={14} strokeWidth={1.75} />
            <span>Multi-Tenant Row-Level Isolated & 100% Anonim (Zero Customer PII)</span>
          </div>

          <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
            <span>Model Usaha:</span>
            <span className="font-bold text-white px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 flex items-center gap-1">
              {tenantType === 'CAFE' ? (
                <>
                  <Coffee size={12} className="text-amber-400" /> Cafe Murni
                </>
              ) : tenantType === 'CARWASH' ? (
                <>
                  <Car size={12} className="text-blue-400" /> Carwash Murni
                </>
              ) : (
                <>
                  <Store size={12} className="text-emerald-400" /> Hybrid (Sistem Estafet)
                </>
              )}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/30 px-4 sm:px-5 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('PRESETS')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-150 ${
              activeTab === 'PRESETS'
                ? 'bg-[#090D16] text-white border-t border-x border-zinc-800 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <Sparkles size={14} className={activeTab === 'PRESETS' ? 'text-blue-400' : 'text-zinc-500'} />
            10 Preset Strategis
          </button>

          <button
            onClick={() => setActiveTab('CUSTOM')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-150 ${
              activeTab === 'CUSTOM'
                ? 'bg-[#090D16] text-white border-t border-x border-zinc-800 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <HelpCircle size={14} className={activeTab === 'CUSTOM' ? 'text-amber-400' : 'text-zinc-500'} />
            Tanya Bebas (Custom Query)
          </button>

          <button
            onClick={() => setActiveTab('RAW_JSON')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all duration-150 ${
              activeTab === 'RAW_JSON'
                ? 'bg-[#090D16] text-white border-t border-x border-zinc-800 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
            }`}
          >
            <FileCode size={14} className={activeTab === 'RAW_JSON' ? 'text-emerald-400' : 'text-zinc-500'} />
            Raw JSON Context
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: 10 STRATEGY PRESETS */}
          {activeTab === 'PRESETS' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                  Pilih Fokus Strategi Analisis:
                </label>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {filteredPresets.length} Template Tersedia
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredPresets.map((preset) => {
                  const isSelected = selectedPreset === preset.id
                  return (
                    <button
                      key={preset.id}
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`text-left p-3.5 rounded-xl border transition-all duration-150 flex items-start gap-3 active:scale-[0.98] ${
                        isSelected
                          ? 'bg-blue-600/10 border-blue-500/80 shadow-md ring-1 ring-blue-500/30'
                          : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/80'
                      }`}
                    >
                      <div className={`p-2 rounded-lg mt-0.5 border ${
                        isSelected
                          ? 'bg-blue-500/20 border-blue-500/40'
                          : 'bg-zinc-800 border-zinc-700'
                      }`}>
                        {getPresetIcon(preset.id)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs text-white leading-tight">
                          {preset.title}
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
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
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                  Ketik Pertanyaan atau Instruksi Spesifik:
                </label>
                <p className="text-xs text-zinc-400 mb-2">
                  Intelligence Layer akan otomatis melampirkan seluruh metrik keuangan, operasional, dan stok secara lengkap di balik layar.
                </p>
                <textarea
                  value={customQuestion}
                  onChange={(e) => setCustomQuestion(e.target.value)}
                  placeholder="Contoh: Tolong bandingkan profitabilitas menu cafe terlaris vs menu yang jarang laku, lalu buatkan strategi bundling kombo dengan paket cuci mobil..."
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-sans leading-relaxed"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                  Contoh Pertanyaan Cepat (Quick Suggestions):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCustomQuestion(q)}
                      className="text-left p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white transition-all flex items-center justify-between gap-2 active:scale-[0.98]"
                    >
                      <span className="line-clamp-1">{q}</span>
                      <ArrowRight size={12} className="text-zinc-500 flex-shrink-0" />
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
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                  Deterministic JSON Schema Output:
                </label>
                <span className="text-[11px] font-mono text-zinc-400">
                  Ready for AI API Ingestion
                </span>
              </div>
              <pre className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-[11px] font-mono text-emerald-400 max-h-80 overflow-y-auto leading-relaxed select-all">
                {rawJsonOutput}
              </pre>
            </div>
          )}

          {/* Prompt Preview Box (Hanya jika tab bukan RAW_JSON) */}
          {activeTab !== 'RAW_JSON' && (
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                  Pratinjau Prompt Eksekutif:
                </label>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {markdownPrompt.length} karakter
                </span>
              </div>
              <div className="bg-zinc-950 border border-zinc-800/90 rounded-xl p-3.5 max-h-64 overflow-y-auto font-mono text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed select-all">
                {markdownPrompt}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-block font-mono text-[10px] px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-400">
              100% Vendor-Neutral
            </kbd>
            <span className="text-xs text-zinc-400">
              Tempel prompt ke ChatGPT / Claude / DeepSeek
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleDownloadJSON}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-all duration-150 flex items-center gap-2 active:scale-[0.98]"
              title="Unduh file JSON"
            >
              <Download size={14} strokeWidth={1.75} />
              <span className="hidden sm:inline">Unduh</span> JSON
            </button>

            <button
              onClick={handleCopyJSON}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center gap-2 border active:scale-[0.98] ${
                copiedType === 'JSON'
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200'
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
              onClick={handleCopyMarkdown}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-2 shadow-lg active:scale-[0.98] ${
                copiedType === 'MARKDOWN'
                  ? 'bg-emerald-600 text-white shadow-emerald-900/30'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/30'
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
