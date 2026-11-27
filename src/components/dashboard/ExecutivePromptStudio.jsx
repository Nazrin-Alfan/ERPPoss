import React, { useState, useMemo } from 'react'
import {
  Bot,
  Copy,
  Check,
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
  Calendar,
  AlertTriangle,
  History,
  Maximize2,
  Minimize2,
  Download,
  Filter,
  ArrowRight,
  Info
} from 'lucide-react'
import { IntelligenceEngineService } from '../../services/intelligenceEngineService'
import { AIContextBuilder, MODULAR_DATA_GROUPS, getAdaptedPresets } from '../../services/aiContextBuilder'

const formatRp = (val) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(val || 0)

const parseDateSafe = (dStr) => {
  if (!dStr) return new Date()
  const [y, m, d] = dStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const formatDateSafe = (d) => {
  if (!d || isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ExecutivePromptStudio({
  strukList = [],
  carwashList = [],
  cafeList = [],
  cashflowLogs = [],
  stokList = [],
  posAccountList = [],
  tenantBusinessType = 'HYBRID',
  activeTenant = {},
  targetCapacity = 30
}) {
  // Navigation Tabs: MODULAR_STUDIO (Blok Data Mandiri), PRESETS (10 Preset Konsultasi), RAW_JSON
  const [activeTab, setActiveTab] = useState('MODULAR_STUDIO')

  // Filter Waktu Terisolasi
  const [periodPreset, setPeriodPreset] = useState('MONTH') // TODAY, WEEK, MONTH, LAST_MONTH, QUARTER, CUSTOM
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Opsi Pembanding Historis
  const [enableHistorical, setEnableHistorical] = useState(false)
  const [historicalMode, setHistoricalMode] = useState('PREVIOUS') // PREVIOUS (MoM/WoW), LAST_YEAR (YoY), CUSTOM
  const [customHistStartDate, setCustomHistStartDate] = useState('')
  const [customHistEndDate, setCustomHistEndDate] = useState('')

  const isCafe = tenantBusinessType === 'CAFE'
  const isCarwash = tenantBusinessType === 'CARWASH'
  const isHybrid = tenantBusinessType === 'HYBRID' || (!isCafe && !isCarwash)

  // Pilihan Preset Aktif (Khusus Tab Preset)
  const [selectedPreset, setSelectedPreset] = useState('360_HEALTH')

  // Pilihan Blok Modular Granular (Khusus Tab Blok Data Mandiri)
  // Default disesuaikan secara dinamis dengan sektor bisnis tenant
  const [selectedBlockIds, setSelectedBlockIds] = useState(() => {
    if (isCafe) {
      return new Set([
        'fin_summary',
        'fin_cashflow_hierarchy',
        'fin_liquid_balances',
        'fin_cashier_payment',
        'cafe_summary',
        'cafe_top_menus',
        'cafe_slowest_menus',
        'inv_valuation',
        'inv_critical_items',
        'crm_cohorts',
        'crm_repeat_rate',
        'time_peak_hours',
        'hist_variance_table',
        'hist_fin_variance',
        'hist_cafe_variance'
      ])
    }
    if (isCarwash) {
      return new Set([
        'fin_summary',
        'fin_cashflow_hierarchy',
        'fin_liquid_balances',
        'fin_cashier_payment',
        'cw_capacity',
        'cw_models',
        'cw_aov_velocity',
        'inv_valuation',
        'inv_critical_items',
        'crm_cohorts',
        'crm_repeat_rate',
        'time_peak_hours',
        'hist_variance_table',
        'hist_fin_variance',
        'hist_cw_variance'
      ])
    }
    return new Set([
      'fin_summary',
      'fin_cashflow_hierarchy',
      'fin_liquid_balances',
      'cw_capacity',
      'cw_aov_velocity',
      'cafe_summary',
      'cafe_top_menus',
      'syn_cross_rate',
      'syn_combined_arpu',
      'hist_variance_table'
    ])
  })

  // State Dropdown Akordeon Kategori
  const [openCategories, setOpenCategories] = useState(() => ({
    FINANCIAL: true,
    HISTORICAL: true,
    CARWASH: !isCafe,
    CAFE: !isCarwash,
    SYNERGY: isHybrid,
    INVENTORY: isCafe,
    CRM: false,
    TIME_CALENDAR: false
  }))

  // Input Prompt / Instruksi Bebas Pengguna (Khusus Tab Blok Data Mandiri)
  const [customInstruction, setCustomInstruction] = useState('')
  const [includeFeedback, setIncludeFeedback] = useState(true)

  // Status Interaksi
  const [copiedType, setCopiedType] = useState(null)
  const [isFullscreenPreview, setIsFullscreenPreview] = useState(false)

  const tenantName = activeTenant?.nama_usaha || 'RelayPOS Enterprise Outlet'

  // Hitung rentang tanggal saat ini & pembanding (Bebas timezone bug)
  const { currentRange, previousRange, currentLabel, previousLabel } = useMemo(() => {
    const now = new Date()
    const todayStr = formatDateSafe(now)

    let curStart = ''
    let curEnd = todayStr
    let curLbl = 'Bulan Ini'

    if (periodPreset === 'TODAY') {
      curStart = todayStr
      curEnd = todayStr
      curLbl = `Hari Ini (${todayStr})`
    } else if (periodPreset === 'WEEK') {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      curStart = formatDateSafe(d)
      curLbl = '7 Hari Terakhir'
    } else if (periodPreset === 'MONTH') {
      curStart = formatDateSafe(new Date(now.getFullYear(), now.getMonth(), 1))
      const lastDayThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      curEnd = formatDateSafe(lastDayThisMonth)
      curLbl = `Bulan Ini (${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })})`
    } else if (periodPreset === 'LAST_MONTH') {
      curStart = formatDateSafe(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      curEnd = formatDateSafe(new Date(now.getFullYear(), now.getMonth(), 0))
      const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      curLbl = `Bulan Lalu (${prevM.toLocaleString('id-ID', { month: 'long', year: 'numeric' })})`
    } else if (periodPreset === 'QUARTER') {
      const d = new Date(now)
      d.setDate(d.getDate() - 90)
      curStart = formatDateSafe(d)
      curLbl = 'Kuartal Berjalan (90 Hari)'
    } else {
      curStart = customStartDate || todayStr
      curEnd = customEndDate || todayStr
      curLbl = `${curStart} s/d ${curEnd}`
    }

    // Hitung tanggal pembanding historis
    let prevStart = ''
    let prevEnd = ''
    let prevLbl = 'Periode Sebelumnya'

    const isHistoricalActive = enableHistorical || selectedBlockIds.has('hist_variance_table')

    if (isHistoricalActive) {
      if (historicalMode === 'LAST_YEAR') {
        const d1 = parseDateSafe(curStart)
        const d2 = parseDateSafe(curEnd)
        prevStart = formatDateSafe(new Date(d1.getFullYear() - 1, d1.getMonth(), d1.getDate()))
        prevEnd = formatDateSafe(new Date(d2.getFullYear() - 1, d2.getMonth(), d2.getDate()))
        prevLbl = 'Tahun Sebelumnya (YoY)'
      } else if (historicalMode === 'CUSTOM' && customHistStartDate && customHistEndDate) {
        prevStart = customHistStartDate
        prevEnd = customHistEndDate
        prevLbl = `Kustom Pembanding (${customHistStartDate} - ${customHistEndDate})`
      } else if (periodPreset === 'MONTH') {
        prevStart = formatDateSafe(new Date(now.getFullYear(), now.getMonth() - 1, 1))
        prevEnd = formatDateSafe(new Date(now.getFullYear(), now.getMonth(), 0))
        const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        prevLbl = `Bulan Lalu (${prevM.toLocaleString('id-ID', { month: 'long', year: 'numeric' })})`
      } else if (periodPreset === 'LAST_MONTH') {
        prevStart = formatDateSafe(new Date(now.getFullYear(), now.getMonth() - 2, 1))
        prevEnd = formatDateSafe(new Date(now.getFullYear(), now.getMonth() - 1, 0))
        const prev2M = new Date(now.getFullYear(), now.getMonth() - 2, 1)
        prevLbl = `2 Bulan Lalu (${prev2M.toLocaleString('id-ID', { month: 'long', year: 'numeric' })})`
      } else if (periodPreset === 'TODAY') {
        const yest = new Date(now)
        yest.setDate(yest.getDate() - 1)
        prevStart = formatDateSafe(yest)
        prevEnd = formatDateSafe(yest)
        prevLbl = 'Kemarin'
      } else if (periodPreset === 'WEEK') {
        const curD1 = parseDateSafe(curStart)
        const pEnd = new Date(curD1)
        pEnd.setDate(pEnd.getDate() - 1)
        const pStart = new Date(curD1)
        pStart.setDate(pStart.getDate() - 7)
        prevStart = formatDateSafe(pStart)
        prevEnd = formatDateSafe(pEnd)
        prevLbl = '7 Hari Sebelumnya'
      } else {
        const d1 = parseDateSafe(curStart)
        const d2 = parseDateSafe(curEnd)
        const durationDays = Math.max(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)), 1)
        const pEnd = new Date(d1)
        pEnd.setDate(pEnd.getDate() - 1)
        const pStart = new Date(pEnd)
        pStart.setDate(pStart.getDate() - durationDays)
        prevStart = formatDateSafe(pStart)
        prevEnd = formatDateSafe(pEnd)
        prevLbl = 'Periode Sebelumnya'
      }
    }

    return {
      currentRange: { start: curStart, end: curEnd },
      previousRange: { start: prevStart, end: prevEnd },
      currentLabel: curLbl,
      previousLabel: prevLbl
    }
  }, [periodPreset, customStartDate, customEndDate, enableHistorical, selectedBlockIds, historicalMode, customHistStartDate, customHistEndDate])

  // Map id_struk -> tanggal untuk mengaitkan item pesanan cafe ke tanggal struk asalnya
  const strukDateMap = useMemo(() => {
    const map = new Map()
    strukList.forEach((s) => {
      const id = s.id_struk || s.id_transaksi || s.id
      const d = s.tanggal || s.created_at || ''
      if (id && d) {
        map.set(id, d.slice(0, 10))
      }
    })
    return map
  }, [strukList])

  // Filter helper dengan fallback resolusi tanggal relasional untuk cafe
  const filterByDate = (list, start, end, isCafeList = false) => {
    if (!start && !end) return list
    return list.filter((item) => {
      let rawDate = item.tanggal || item.created_at || ''
      if (!rawDate && isCafeList && item.id_struk) {
        rawDate = strukDateMap.get(item.id_struk) || ''
      }
      if (!rawDate) return false
      const dStr = rawDate.slice(0, 10)
      if (start && dStr < start) return false
      if (end && dStr > end) return false
      return true
    })
  }

  // Hitung snapshot metrik aktif
  const currentSnapshot = useMemo(() => {
    const curStruk = filterByDate(strukList, currentRange.start, currentRange.end)
    const curCw = filterByDate(carwashList, currentRange.start, currentRange.end)
    const curCf = filterByDate(cafeList, currentRange.start, currentRange.end, true)
    const curCashflow = filterByDate(cashflowLogs, currentRange.start, currentRange.end)

    const engine = new IntelligenceEngineService({
      struk: curStruk,
      carwash: curCw,
      cafe: curCf,
      cashflow: curCashflow,
      stok_barang: stokList,
      pos_balances: posAccountList,
      tenantBusinessType,
      targetCapacity
    })

    return engine.calculateComprehensiveMetrics()
  }, [strukList, carwashList, cafeList, cashflowLogs, stokList, posAccountList, tenantBusinessType, targetCapacity, currentRange, strukDateMap])

  // Hitung snapshot metrik pembanding (jika historis diaktifkan atau blok historis dicentang)
  const historicalComparison = useMemo(() => {
    const isHistoricalActive = enableHistorical ||
      selectedBlockIds.has('hist_variance_table') ||
      selectedBlockIds.has('hist_fin_variance') ||
      selectedBlockIds.has('hist_cw_variance') ||
      selectedBlockIds.has('hist_cafe_variance') ||
      selectedBlockIds.has('hist_syn_variance') ||
      selectedBlockIds.has('hist_crm_variance')

    if (!isHistoricalActive || !previousRange.start || !previousRange.end) return null

    const prevStruk = filterByDate(strukList, previousRange.start, previousRange.end)
    const prevCw = filterByDate(carwashList, previousRange.start, previousRange.end)
    const prevCf = filterByDate(cafeList, previousRange.start, previousRange.end, true)
    const prevCashflow = filterByDate(cashflowLogs, previousRange.start, previousRange.end)

    const prevEngine = new IntelligenceEngineService({
      struk: prevStruk,
      carwash: prevCw,
      cafe: prevCf,
      cashflow: prevCashflow,
      stok_barang: stokList,
      pos_balances: posAccountList,
      tenantBusinessType,
      targetCapacity
    })

    const prevSnapshot = prevEngine.calculateComprehensiveMetrics()
    return IntelligenceEngineService.calculateHistoricalComparison(currentSnapshot, prevSnapshot, currentLabel, previousLabel)
  }, [enableHistorical, selectedBlockIds, previousRange, strukList, carwashList, cafeList, cashflowLogs, stokList, posAccountList, tenantBusinessType, targetCapacity, currentSnapshot, currentLabel, previousLabel, strukDateMap])

  // Context Builder Instances
  // 1. Khusus untuk Blok Data Mandiri (Mematuhi seleksi granular checkbox)
  const standaloneContextBuilder = useMemo(() => {
    if (!currentSnapshot) return null
    return new AIContextBuilder({
      metrics: currentSnapshot,
      tenantBusinessType,
      tenantName,
      timeRangeLabel: currentLabel,
      selectedBlocks: selectedBlockIds,
      historicalData: historicalComparison,
      interactiveFeedback: includeFeedback
    })
  }, [currentSnapshot, tenantBusinessType, tenantName, currentLabel, selectedBlockIds, historicalComparison, includeFeedback])

  // 2. Khusus untuk 10 Preset Konsultasi (Otomatis dipilih sistem secara lengkap, TIDAK terikat checkbox user)
  const presetContextBuilder = useMemo(() => {
    if (!currentSnapshot) return null
    return new AIContextBuilder({
      metrics: currentSnapshot,
      tenantBusinessType,
      tenantName,
      timeRangeLabel: currentLabel,
      presetId: selectedPreset,
      selectedBlocks: null, // null = seluruh metrik kurasi sistem terpilih otomatis
      historicalData: historicalComparison,
      interactiveFeedback: true
    })
  }, [currentSnapshot, tenantBusinessType, tenantName, currentLabel, selectedPreset, historicalComparison])

  // Teks Output Prompt
  const standaloneFullPrompt = useMemo(() => {
    if (!standaloneContextBuilder) return ''
    return standaloneContextBuilder.buildStandaloneBlocksPrompt({
      customUserPrompt: customInstruction,
      includeFeedback: includeFeedback,
      dataOnly: false
    })
  }, [standaloneContextBuilder, customInstruction, includeFeedback])

  const standaloneDataOnlyText = useMemo(() => {
    if (!standaloneContextBuilder) return ''
    return standaloneContextBuilder.buildStandaloneBlocksPrompt({
      customUserPrompt: '',
      includeFeedback: false,
      dataOnly: true
    })
  }, [standaloneContextBuilder])

  const presetPromptText = useMemo(() => {
    if (!presetContextBuilder) return ''
    return presetContextBuilder.buildMarkdownPrompt()
  }, [presetContextBuilder])

  const rawJsonOutput = useMemo(() => {
    if (!standaloneContextBuilder) return '{}'
    return JSON.stringify(standaloneContextBuilder.exportCleanJSON(), null, 2)
  }, [standaloneContextBuilder])

  // Handlers Kategori & Blok
  const toggleBlock = (blockId) => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev)
      if (next.has(blockId)) {
        next.delete(blockId)
      } else {
        next.add(blockId)
      }
      const anyHist = next.has('hist_variance_table') ||
        next.has('hist_fin_variance') ||
        next.has('hist_cw_variance') ||
        next.has('hist_cafe_variance') ||
        next.has('hist_syn_variance') ||
        next.has('hist_crm_variance')
      setEnableHistorical(anyHist)
      return next
    })
  }

  const toggleSelectAllCategory = (blocks, selectAll) => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev)
      blocks.forEach((b) => {
        if (selectAll) {
          next.add(b.id)
        } else {
          next.delete(b.id)
        }
      })
      const anyHist = next.has('hist_variance_table') ||
        next.has('hist_fin_variance') ||
        next.has('hist_cw_variance') ||
        next.has('hist_cafe_variance') ||
        next.has('hist_syn_variance') ||
        next.has('hist_crm_variance')
      setEnableHistorical(anyHist)
      return next
    })
  }

  const toggleCategoryOpen = (catId) => {
    setOpenCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId]
    }))
  }

  // Copy Helpers
  const copyToClipboard = async (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
  }

  const handleCopyFullPrompt = async () => {
    await copyToClipboard(standaloneFullPrompt)
    setCopiedType('full_prompt')
    setTimeout(() => setCopiedType(null), 2500)
  }

  const handleCopyDataOnly = async () => {
    await copyToClipboard(standaloneDataOnlyText)
    setCopiedType('data_only')
    setTimeout(() => setCopiedType(null), 2500)
  }

  const handleCopyPresetPrompt = async () => {
    await copyToClipboard(presetPromptText)
    setCopiedType('preset')
    setTimeout(() => setCopiedType(null), 2500)
  }

  const handleCopyJson = async () => {
    await copyToClipboard(rawJsonOutput)
    setCopiedType('json')
    setTimeout(() => setCopiedType(null), 2500)
  }

  const handleDownloadJson = () => {
    const blob = new Blob([rawJsonOutput], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relaypos-ai-context-${currentRange.start}-to-${currentRange.end}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Quick prompt suggestions
  const promptSuggestions = [
    'Analisis anomali pada data di atas dan berikan 3 langkah taktis menaikkan profit margin.',
    'Bandingkan pertumbuhan periode ini terhadap periode lalu dan tunjukkan pos beban mana yang membengkak.',
    'Evaluasi apakah struktur harga cafe dan carwash sudah optimal berdasarkan data AOV dan konversi estafet.',
    'Identifikasi pelanggan yang berisiko churn dan buatkan rencana pesan penawaran kembali.'
  ]

  // Filter kategori dan blok berdasarkan tipe bisnis
  const availableCategories = useMemo(() => {
    return MODULAR_DATA_GROUPS
      .filter((cat) => !cat.applicableFor || cat.applicableFor.includes(tenantBusinessType))
      .map((cat) => ({
        ...cat,
        blocks: (cat.blocks || []).filter((b) => !b.applicableFor || b.applicableFor.includes(tenantBusinessType))
      }))
  }, [tenantBusinessType])

  const activePresets = useMemo(() => getAdaptedPresets(tenantBusinessType), [tenantBusinessType])

  return (
    <div id="ai-prompt-studio" className="bg-surface border border-border rounded-2xl p-4 sm:p-6 text-foreground shadow-xs relative overflow-hidden transition-all duration-200">
      {/* Header Studio */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-2 rounded-xl bg-primary-soft border border-primary/25 text-primary">
              <Bot className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              AI Executive Prompt &amp; Data Studio
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-soft border border-primary/25 text-primary-soft-foreground flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Zero PII &amp; Local AI Ready
            </span>
          </div>
          <p className="text-xs text-muted mt-1.5 max-w-2xl leading-relaxed">
            Pilih blok data operasional &amp; finansial terstruktur untuk dianalisis dengan AI pilihan Anda (ChatGPT, Claude, DeepSeek, atau LLM lokal), atau gunakan 10 preset konsultasi eksekutif siap-salin.
          </p>
        </div>

        {/* Status Mode Badge */}
        <div className="flex items-center gap-2 self-start lg:self-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-subsurface border border-border text-xs text-foreground">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="font-medium text-foreground">Mesin Intelijen Deterministik Aktif</span>
          </div>
        </div>
      </div>

      {/* Section Filter Waktu Independen */}
      <div className="bg-subsurface border border-border rounded-xl p-4 mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted uppercase tracking-wider flex-wrap">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span>Filter Periode Analisis:</span>
            <span className="text-foreground font-bold">{currentLabel}</span>
          </div>

          {/* Toggle Komparasi Historis */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
              <input
                type="checkbox"
                checked={
                  enableHistorical ||
                  selectedBlockIds.has('hist_variance_table') ||
                  selectedBlockIds.has('hist_fin_variance') ||
                  selectedBlockIds.has('hist_cw_variance') ||
                  selectedBlockIds.has('hist_cafe_variance') ||
                  selectedBlockIds.has('hist_syn_variance') ||
                  selectedBlockIds.has('hist_crm_variance')
                }
                onChange={(e) => {
                  const checked = e.target.checked
                  setEnableHistorical(checked)
                  setSelectedBlockIds((prev) => {
                    const next = new Set(prev)
                    if (checked) {
                      next.add('hist_variance_table')
                      next.add('hist_fin_variance')
                      next.add('hist_cw_variance')
                      next.add('hist_cafe_variance')
                      next.add('hist_syn_variance')
                    } else {
                      next.delete('hist_variance_table')
                      next.delete('hist_fin_variance')
                      next.delete('hist_cw_variance')
                      next.delete('hist_cafe_variance')
                      next.delete('hist_syn_variance')
                      next.delete('hist_crm_variance')
                    }
                    return next
                  })
                }}
                className="w-4 h-4 rounded bg-surface border-border text-primary accent-primary"
              />
              <span className="text-muted flex items-center gap-1 font-medium hover:text-foreground transition-colors">
                <History className="w-3.5 h-3.5 text-warning" /> Aktifkan Komparasi Historis ({previousLabel})
              </span>
            </label>
          </div>
        </div>

        {/* Tombol Preset Periode */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'TODAY', label: 'Hari Ini' },
            { id: 'WEEK', label: '7 Hari Terakhir' },
            { id: 'MONTH', label: 'Bulan Ini' },
            { id: 'LAST_MONTH', label: 'Bulan Lalu' },
            { id: 'QUARTER', label: '90 Hari (Kuartal)' },
            { id: 'CUSTOM', label: 'Rentang Kustom' }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriodPreset(item.id)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer active:scale-[0.98] ${
                periodPreset === item.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-border'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Input Tanggal Kustom (Jika dipilih) */}
        {periodPreset === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
            <span className="text-xs text-muted">Pilih Periode:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-border-active"
            />
            <span className="text-xs text-muted-dark">s/d</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-surface border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-border-active"
            />
          </div>
        )}

        {/* Sub-baris Kontrol Baseline Pembanding Historis */}
        {(enableHistorical || selectedBlockIds.has('hist_variance_table')) && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border text-xs">
            <span className="text-warning font-semibold flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Baseline Pembanding:
            </span>
            {[
              { id: 'PREVIOUS', label: periodPreset === 'MONTH' ? 'Bulan Lalu (MoM)' : 'Periode Sebelumnya' },
              { id: 'LAST_YEAR', label: 'Tahun Lalu (YoY)' },
              { id: 'CUSTOM', label: 'Kustom Tanggal Pembanding' }
            ].map((hm) => (
              <button
                key={hm.id}
                type="button"
                onClick={() => setHistoricalMode(hm.id)}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer active:scale-[0.98] ${
                  historicalMode === hm.id
                    ? 'bg-warning-bg text-warning border border-warning/30 font-semibold'
                    : 'bg-surface text-muted hover:text-foreground border border-border'
                }`}
              >
                {hm.label}
              </button>
            ))}

            {historicalMode === 'CUSTOM' && (
              <div className="flex items-center gap-2 pl-2 flex-wrap">
                <input
                  type="date"
                  value={customHistStartDate}
                  onChange={(e) => setCustomHistStartDate(e.target.value)}
                  className="bg-surface border border-border rounded-xl px-2 py-1 text-xs text-foreground focus:border-border-active"
                />
                <span className="text-muted-dark">s/d</span>
                <input
                  type="date"
                  value={customHistEndDate}
                  onChange={(e) => setCustomHistEndDate(e.target.value)}
                  className="bg-surface border border-border rounded-xl px-2 py-1 text-xs text-foreground focus:border-border-active"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Studio Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border mb-6 pb-3 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('MODULAR_STUDIO')}
          className={`flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
            activeTab === 'MODULAR_STUDIO'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted hover:text-foreground hover:bg-subsurface'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Blok Data Mandiri &amp; Custom Prompt</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums ${
            activeTab === 'MODULAR_STUDIO' ? 'bg-primary-foreground/20 text-primary-foreground font-bold' : 'bg-primary-soft text-primary-soft-foreground'
          }`}>
            {selectedBlockIds.size} Blok
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PRESETS')}
          className={`flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
            activeTab === 'PRESETS'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted hover:text-foreground hover:bg-subsurface'
          }`}
        >
          <Sparkles className={`w-4 h-4 ${activeTab === 'PRESETS' ? 'text-primary-foreground' : 'text-warning'}`} />
          <span>10 Preset Konsultasi Eksekutif</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
            activeTab === 'PRESETS' ? 'bg-primary-foreground/20 text-primary-foreground font-bold' : 'bg-warning-bg text-warning'
          }`}>
            Otomatis
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('RAW_JSON')}
          className={`flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
            activeTab === 'RAW_JSON'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted hover:text-foreground hover:bg-subsurface'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Raw JSON Data</span>
        </button>
      </div>

      {/* TAB 1: BLOK DATA MANDIRI & CUSTOM PROMPT */}
      {activeTab === 'MODULAR_STUDIO' && (
        <div className="space-y-6">
          {/* Instruksi Pengantar */}
          <div className="flex items-start gap-3 p-3.5 bg-primary-soft border border-primary/25 rounded-xl text-xs text-foreground">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-primary-soft-foreground">Prinsip Studio Blok Data Mandiri:</span> Centang data yang ingin Anda sertakan di bawah ini. Anda dapat mengetik instruksi prompt bebas atau langsung menyalin blok datanya saja untuk dianalisis di AI eksternal pilihan Anda (ChatGPT, Claude, DeepSeek).
            </div>
          </div>

          {/* Section 1: Pemilih Blok Data Dropdown Akordeon */}
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <span>1. Pilih Kategori &amp; Blok Data:</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = []
                    availableCategories.forEach((cat) => {
                      cat.blocks.forEach((b) => allIds.push(b.id))
                    })
                    setSelectedBlockIds(new Set(allIds))
                    setEnableHistorical(true)
                  }}
                  className="px-3 py-1.5 text-xs text-primary-soft-foreground bg-primary-soft hover:opacity-90 border border-primary/25 rounded-full font-semibold transition-colors cursor-pointer"
                >
                  Pilih Semua Blok
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBlockIds(new Set())
                    setEnableHistorical(false)
                  }}
                  className="px-3 py-1.5 text-xs text-muted hover:text-foreground bg-subsurface hover:bg-surface-hover border border-border rounded-full font-semibold transition-colors cursor-pointer"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {availableCategories.map((cat) => {
                const catId = cat.id
                const isOpen = openCategories[catId]
                const catBlocks = cat.blocks || []
                const selectedInCatCount = catBlocks.filter((b) => selectedBlockIds.has(b.id)).length
                const isAllCatSelected = selectedInCatCount === catBlocks.length && catBlocks.length > 0

                return (
                  <div
                    key={catId}
                    className="border border-border rounded-xl bg-surface overflow-hidden transition-all duration-200"
                  >
                    {/* Header Dropdown Akordeon */}
                    <div
                      onClick={() => toggleCategoryOpen(catId)}
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-surface-hover select-none bg-subsurface"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base shrink-0">{cat.icon}</span>
                        <div className="truncate">
                          <span className="font-bold text-xs sm:text-sm text-foreground block truncate">
                            {cat.title}
                          </span>
                          <span className="text-[11px] text-muted font-mono tabular-nums">
                            {selectedInCatCount} dari {catBlocks.length} blok terpilih
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleSelectAllCategory(catBlocks, !isAllCatSelected)}
                          className="px-2.5 py-1 text-[11px] rounded-full bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-border font-semibold cursor-pointer"
                        >
                          {isAllCatSelected ? 'Batal' : 'Semua'}
                        </button>
                        <span className="text-muted-dark text-xs font-mono">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Konten Checkbox Blok */}
                    {isOpen && (
                      <div className="p-3.5 pt-2 border-t border-border space-y-2 bg-surface">
                        {catBlocks.map((block) => {
                          const isChecked = selectedBlockIds.has(block.id)
                          return (
                            <label
                              key={block.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-selected-surface border border-border-active'
                                  : 'hover:bg-subsurface border border-transparent'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleBlock(block.id)}
                                className="mt-0.5 w-4 h-4 rounded bg-surface border-border text-primary accent-primary"
                              />
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs font-bold block truncate ${isChecked ? 'text-primary-soft-foreground' : 'text-foreground'}`}>
                                  {block.label}
                                </span>
                                <span className="text-[11px] text-muted leading-relaxed block mt-0.5">
                                  {block.description}
                                </span>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2: Input Instruksi / Prompt Bebas Klien */}
          <div className="bg-subsurface border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-warning" />
                <span>2. Tuliskan Instruksi / Prompt Khusus Anda (Opsional):</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeFeedback}
                  onChange={(e) => setIncludeFeedback(e.target.checked)}
                  className="w-3.5 h-3.5 rounded bg-surface border-border text-primary accent-primary"
                />
                <span>Sertakan Klausul Klarifikasi</span>
              </label>
            </div>

            <textarea
              rows={3}
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="Contoh: Analisis data di bawah ini, tunjukkan 3 kelemahan terbesar bulan ini dan bagaimana cara menaikkan margin laba bersih..."
              className="w-full bg-surface border border-border rounded-xl p-3 text-base sm:text-xs text-foreground placeholder:text-muted-dark focus:outline-none focus:border-border-active font-mono transition-colors"
            />

            {/* Quick Suggestions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-muted">Saran Instruksi Cepat:</span>
              {promptSuggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCustomInstruction(sug)}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-border transition-colors cursor-pointer"
                >
                  {sug.slice(0, 48)}...
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Pratinjau Khusus Blok Data Siap Salin */}
          <div className="bg-subsurface border border-border rounded-xl overflow-hidden">
            {/* Header Box Pratinjau */}
            <div className="p-3.5 bg-surface border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-primary" />
                  <span>3. Pratinjau Blok Data Siap Salin ({selectedBlockIds.size} Blok Terpilih)</span>
                </span>
                <span className="text-[11px] text-muted font-mono tabular-nums mt-0.5 block">
                  {standaloneFullPrompt.length.toLocaleString('id-ID')} karakter • {standaloneFullPrompt.split('\n').length} baris
                </span>
              </div>

              {/* Action Buttons Mandiri */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyDataOnly}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-semibold bg-subsurface hover:bg-surface-hover text-foreground flex items-center gap-1.5 transition-colors border border-border cursor-pointer"
                  title="Salin murni data terstruktur tanpa teks instruksi"
                >
                  {copiedType === 'data_only' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-success" />
                      <span className="text-success font-bold">Data Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted" />
                      <span>Salin Data Saja</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyFullPrompt}
                  className="min-h-[40px] px-4 py-1.5 rounded-full text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                  title="Salin instruksi khusus beserta data terstruktur dan panduan umpan balik"
                >
                  {copiedType === 'full_prompt' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-primary-foreground" />
                      <span>Prompt &amp; Data Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
                      <span>Salin Lengkap dengan Instruksi</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreenPreview(true)}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-subsurface hover:bg-surface-hover text-muted hover:text-foreground border border-border cursor-pointer"
                  title="Perbesar Pratinjau Layar Penuh"
                  aria-label="Perbesar pratinjau layar penuh"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Area Pratinjau Teks Markdown */}
            <div className="p-4 max-h-96 overflow-y-auto font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed bg-subsurface">
              {selectedBlockIds.size === 0 ? (
                <div className="py-12 text-center text-muted">
                  <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-2" />
                  <p className="font-bold text-foreground">Belum ada blok data yang dipilih.</p>
                  <p className="text-[11px] text-muted-dark mt-1">Centang salah satu kategori data di atas untuk merender pratinjau.</p>
                </div>
              ) : (
                standaloneFullPrompt
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 10 PRESET KONSULTASI EKSEKUTIF */}
      {activeTab === 'PRESETS' && (
        <div className="space-y-6">
          {/* Banner Notifikasi Otomatis Sistem */}
          <div className="flex items-start gap-3 p-3.5 bg-warning-bg border border-warning/30 rounded-xl text-xs text-foreground">
            <Sparkles className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-warning">Data Otomatis Terkurasi Sistem:</span> Seluruh metrik finansial, perputaran produk, efisiensi operasional, dan komparasi historis untuk 10 preset ini telah dipilih dan disusun secara otomatis oleh sistem sesuai tema analisis eksekutif.
            </div>
          </div>

          {/* Kartu Pemilih 10 Preset */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activePresets.map((p) => {
              const isSelected = selectedPreset === p.id
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPreset(p.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-selected-surface border-border-active shadow-xs'
                      : 'bg-subsurface border-border hover:border-border-hover'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.icon}</span>
                    <span className={`text-xs font-bold ${isSelected ? 'text-primary-soft-foreground' : 'text-foreground'}`}>
                      {p.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-1">{p.desc}</p>
                </div>
              )
            })}
          </div>

          {/* Pratinjau Khusus Preset */}
          <div className="bg-subsurface border border-border rounded-xl overflow-hidden">
            <div className="p-3.5 bg-surface border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  <span>Pratinjau Prompt Preset: {selectedPreset}</span>
                </span>
                <span className="text-[11px] text-muted block mt-0.5 font-mono">
                  Format baku eksekutif dengan persona ahli, tujuan taktis, data terkurasi, dan deliverables.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPresetPrompt}
                  className="min-h-[40px] px-4 py-1.5 rounded-full text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
                >
                  {copiedType === 'preset' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-primary-foreground" />
                      <span>Prompt Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-primary-foreground" />
                      <span>Salin Prompt Preset</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsFullscreenPreview(true)}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-subsurface hover:bg-surface-hover text-muted hover:text-foreground border border-border cursor-pointer"
                  aria-label="Perbesar pratinjau preset"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 max-h-96 overflow-y-auto font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed bg-subsurface">
              {presetPromptText}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RAW JSON DATA */}
      {activeTab === 'RAW_JSON' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                <FileCode className="w-4 h-4 text-primary" />
                <span>Skema JSON Deterministik Bersih (Zero-PII)</span>
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Gunakan untuk payload API langsung atau ingest ke LLM lokal terstruktur.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCopyJson}
                className="min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-semibold bg-subsurface hover:bg-surface-hover text-foreground flex items-center gap-1.5 border border-border cursor-pointer"
              >
                {copiedType === 'json' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success" />
                    <span className="text-success font-bold">JSON Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted" />
                    <span>Salin JSON</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                className="min-h-[40px] px-4 py-1.5 rounded-full text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.98]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh File .json</span>
              </button>
            </div>
          </div>

          <div className="p-4 max-h-96 overflow-y-auto font-mono text-xs text-foreground whitespace-pre bg-subsurface border border-border rounded-xl leading-relaxed">
            {rawJsonOutput}
          </div>
        </div>
      )}

      {/* Fullscreen Modal Preview */}
      {isFullscreenPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl text-foreground">
            <div className="p-4 border-b border-border flex items-center justify-between bg-subsurface gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Bot className="w-5 h-5 text-primary shrink-0" />
                <h3 className="font-bold text-xs sm:text-sm text-foreground truncate">
                  Pratinjau Layar Penuh: {activeTab === 'MODULAR_STUDIO' ? 'Blok Data Mandiri' : activeTab === 'PRESETS' ? `Preset ${selectedPreset}` : 'Raw JSON'}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={activeTab === 'MODULAR_STUDIO' ? handleCopyFullPrompt : activeTab === 'PRESETS' ? handleCopyPresetPrompt : handleCopyJson}
                  className="min-h-[40px] px-4 py-1.5 rounded-full text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" /> Salin Teks
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullscreenPreview(false)}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-surface hover:bg-surface-hover text-muted hover:text-foreground border border-border cursor-pointer"
                  aria-label="Perkecil pratinjau"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed bg-subsurface">
              {activeTab === 'MODULAR_STUDIO' ? standaloneFullPrompt : activeTab === 'PRESETS' ? presetPromptText : rawJsonOutput}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExecutivePromptStudio
