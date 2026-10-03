import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { RelationTable } from '../components/ui/tables'
import {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  useTableSort
} from '../components/ui/Table'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getActiveTenantId, DEFAULT_TENANT_ID } from '../services/localDbEngine'
import {
  aggregateCustomerCRMData,
  redeemCustomerReward,
  updateCustomerPreferenceNote,
  compileWhatsAppTemplate,
  getLoyaltyProgramSettings,
  saveLoyaltyProgramSettings,
  DEFAULT_CRM_TEMPLATES,
  DEFAULT_CRM_SETTINGS,
  DEFAULT_LOYALTY_PROGRAM,
  STAMP_TARGET_DEFAULT
} from '../services/crmService'
import {
  Users,
  Search,
  Award,
  Calendar,
  Phone,
  Car,
  Download,
  Filter,
  X,
  RefreshCw,
  Clock,
  Sparkles,
  ExternalLink,
  MessageCircle,
  MessageSquare,
  ChevronRight,
  AlertTriangle,
  Gift,
  CheckCircle2,
  Copy,
  Check,
  Send,
  Save,
  Coffee,
  FileText,
  UserCheck,
  Tag,
  Settings,
  Sliders,
  Plus,
  Minus,
  Crown,
  ShieldAlert,
  DollarSign,
  RotateCcw
} from 'lucide-react'
import { formatRupiah, parseDateSafe } from '../utils/helpers'

const CRM = () => {
  const { activeTenant } = useAuth()
  const tenantId = activeTenant?.id || getActiveTenantId() || DEFAULT_TENANT_ID

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successToast, setSuccessToast] = useState(null)
  const [customerList, setCustomerList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSegment, setFilterSegment] = useState('ALL') // 'ALL' | 'VIP' | 'LOYAL' | 'NEED_ATTENTION' | 'AT_RISK' | 'NEW'
  
  // Modals state
  const [selectedCustomerPlat, setSelectedCustomerPlat] = useState(null)
  const [retentionTargetCustomer, setRetentionTargetCustomer] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('REMINDER_14_DAYS')
  const [customMessageBody, setCustomMessageBody] = useState('')
  const [compiledPreview, setCompiledPreview] = useState('')
  const [copiedMessage, setCopiedMessage] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [preferenceNoteInput, setPreferenceNoteInput] = useState('')
  const [customerNameInput, setCustomerNameInput] = useState('')
  const [whatsappInput, setWhatsappInput] = useState('')
  const [claimingReward, setClaimingReward] = useState(false)
  const [customerDetailTab, setCustomerDetailTab] = useState('history') // 'history' | 'notes'

  // Custom Loyalty Program & CRM RFM Config Modal state
  const [showProgramConfigModal, setShowProgramConfigModal] = useState(false)
  const [configModalTab, setConfigModalTab] = useState('stamps') // 'stamps' | 'vip_rfm'
  const [programSettings, setProgramSettings] = useState(DEFAULT_CRM_SETTINGS)
  const [savingProgram, setSavingProgram] = useState(false)
  
  // Tab 1 state: Stamp & Reward
  const [editTargetStamps, setEditTargetStamps] = useState(5)
  const [editRewardType, setEditRewardType] = useState('FREE_SERVICE')
  const [editRewardTitle, setEditRewardTitle] = useState('Gratis 1x Cuci Mobil Salju')
  const [editRewardDescription, setEditRewardDescription] = useState('Kumpulkan 5 stamp cuci mobil untuk klaim 1x cuci mobil salju gratis.')

  // Tab 2 state: VIP & RFM Thresholds
  const [editVipMinVisits, setEditVipMinVisits] = useState(5)
  const [editVipMinSpent, setEditVipMinSpent] = useState(0)
  const [editLoyalMinVisits, setEditLoyalMinVisits] = useState(3)
  const [editActiveDays, setEditActiveDays] = useState(14)
  const [editChurnDays, setEditChurnDays] = useState(30)
  const [editVipRetentionMode, setEditVipRetentionMode] = useState('DYNAMIC')

  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 15

  // Trigger auto-dismiss toast
  useEffect(() => {
    if (!successToast) return
    const timer = setTimeout(() => setSuccessToast(null), 3500)
    return () => clearTimeout(timer)
  }, [successToast])

  // Load CRM Data & Program Settings using crmService
  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const [data, prog] = await Promise.all([
        aggregateCustomerCRMData(supabase, tenantId),
        getLoyaltyProgramSettings(supabase, tenantId)
      ])
      setCustomerList(data || [])
      if (prog) {
        setProgramSettings(prog)
        setEditTargetStamps(prog.target_stamps || 5)
        setEditRewardType(prog.reward_type || 'FREE_SERVICE')
        setEditRewardTitle(prog.reward_title || 'Gratis 1x Cuci Mobil Salju')
        setEditRewardDescription(prog.reward_description || '')
        setEditVipMinVisits(prog.vip_min_visits !== undefined ? prog.vip_min_visits : 5)
        setEditVipMinSpent(prog.vip_min_spent !== undefined ? prog.vip_min_spent : 0)
        setEditLoyalMinVisits(prog.loyal_min_visits !== undefined ? prog.loyal_min_visits : 3)
        setEditActiveDays(prog.active_days_threshold !== undefined ? prog.active_days_threshold : 14)
        setEditChurnDays(prog.churn_days_threshold !== undefined ? prog.churn_days_threshold : 30)
        setEditVipRetentionMode(prog.vip_retention_mode || 'DYNAMIC')
      }
    } catch (err) {
      console.error('Error fetching CRM data:', err)
      setErrorMessage('Gagal memuat data pelanggan & CRM: ' + (err.message || 'Terjadi kesalahan sistem.'))
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle Escape key to safely close all modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedCustomerPlat(null)
        setRetentionTargetCustomer(null)
        setShowProgramConfigModal(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalCustomers = customerList.length
    const vipCount = customerList.filter(c => c.rfm?.code === 'VIP').length
    const loyalCount = customerList.filter(c => c.rfm?.code === 'LOYAL').length
    const needAttentionCount = customerList.filter(c => c.rfm?.code === 'NEED_ATTENTION').length
    const atRiskCount = customerList.filter(c => c.rfm?.code === 'AT_RISK').length
    const newCount = customerList.filter(c => c.rfm?.code === 'NEW').length
    const readyRewardCount = customerList.filter(c => c.loyalty?.isRewardReady).length
    const totalSpentAll = customerList.reduce((sum, c) => sum + (c.totalSpent || 0), 0)

    return {
      totalCustomers,
      vipCount,
      loyalCount,
      needAttentionCount,
      atRiskCount,
      newCount,
      readyRewardCount,
      totalSpentAll
    }
  }, [customerList])

  // Filter & Search
  const filteredCustomers = useMemo(() => {
    return customerList.filter(cust => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch = !q ||
        (cust.plat && cust.plat.toLowerCase().includes(q)) ||
        (cust.nama && cust.nama.toLowerCase().includes(q)) ||
        (cust.model && cust.model.toLowerCase().includes(q)) ||
        (cust.noTelepon && cust.noTelepon.toLowerCase().includes(q)) ||
        (cust.favPkg && cust.favPkg.toLowerCase().includes(q))

      let matchesFilter = true
      if (filterSegment === 'VIP') matchesFilter = cust.rfm?.code === 'VIP'
      else if (filterSegment === 'LOYAL') matchesFilter = cust.rfm?.code === 'LOYAL'
      else if (filterSegment === 'NEED_ATTENTION') matchesFilter = cust.rfm?.code === 'NEED_ATTENTION'
      else if (filterSegment === 'AT_RISK') matchesFilter = cust.rfm?.code === 'AT_RISK'
      else if (filterSegment === 'NEW') matchesFilter = cust.rfm?.code === 'NEW'
      else if (filterSegment === 'REWARD_READY') matchesFilter = !!cust.loyalty?.isRewardReady

      return matchesSearch && matchesFilter
    })
  }, [customerList, searchQuery, filterSegment])

  const {
    sortedData: sortedCustomers,
    sortState,
    handleSort
  } = useTableSort(filteredCustomers, 'totalSpent', 'desc')

  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / pageSize))
  const paginatedCustomers = useMemo(() => {
    const from = (currentPage - 1) * pageSize
    return sortedCustomers.slice(from, from + pageSize)
  }, [sortedCustomers, currentPage, pageSize])

  const activeCustomer = useMemo(() => {
    if (!selectedCustomerPlat) return null
    return customerList.find(c => c.plat === selectedCustomerPlat) || null
  }, [customerList, selectedCustomerPlat])

  // Sync inputs when active customer opened
  useEffect(() => {
    if (activeCustomer) {
      setPreferenceNoteInput(activeCustomer.catatanKhusus || '')
      setCustomerNameInput(activeCustomer.nama || '')
      setWhatsappInput(activeCustomer.noTelepon !== '-' ? activeCustomer.noTelepon : '')
    }
  }, [activeCustomer])

  // Save Customer Preference Note
  const handleSaveCustomerNote = async () => {
    if (!activeCustomer) return
    setSavingNote(true)
    try {
      await updateCustomerPreferenceNote(supabase, {
        tenant_id: tenantId,
        plat: activeCustomer.plat,
        catatan: preferenceNoteInput,
        nama_pelanggan: customerNameInput,
        no_whatsapp: whatsappInput
      })
      setSuccessToast(`Catatan preferensi untuk plat ${activeCustomer.plat} berhasil disimpan!`)
      await loadData()
    } catch (err) {
      setErrorMessage('Gagal menyimpan catatan: ' + err.message)
    } finally {
      setSavingNote(false)
    }
  }

  // Claim Customer Loyalty Reward
  const handleClaimReward = async () => {
    if (!activeCustomer) return
    const rewardTitle = activeCustomer.loyalty?.rewardTitle || programSettings.reward_title || 'Gratis Hadiah Loyalty'
    if (!confirm(`Konfirmasi klaim reward "${rewardTitle}" untuk kendaraan ${activeCustomer.plat}?`)) return
    setClaimingReward(true)
    try {
      await redeemCustomerReward(supabase, {
        tenant_id: tenantId,
        plat: activeCustomer.plat,
        reward_title: rewardTitle,
        notes: `Reward Loyalty (${rewardTitle}) Diklaim untuk ${activeCustomer.model}`
      })
      setSuccessToast(`Reward "${rewardTitle}" berhasil diklaim untuk ${activeCustomer.plat}!`)
      await loadData()
      setSelectedCustomerPlat(null)
    } catch (err) {
      setErrorMessage('Gagal memproses klaim reward: ' + err.message)
    } finally {
      setClaimingReward(false)
    }
  }

  // Save Custom Loyalty Program & CRM RFM Settings
  const handleSaveProgramSettings = async () => {
    if (!editRewardTitle.trim()) {
      alert('Mohon masukkan nama reward yang dapat diklaim pelanggan.')
      return
    }
    setSavingProgram(true)
    try {
      await saveLoyaltyProgramSettings(supabase, {
        tenant_id: tenantId,
        target_stamps: editTargetStamps,
        reward_type: editRewardType,
        reward_title: editRewardTitle.trim(),
        reward_description: editRewardDescription.trim(),
        vip_min_visits: editVipMinVisits,
        vip_min_spent: editVipMinSpent,
        loyal_min_visits: editLoyalMinVisits,
        active_days_threshold: editActiveDays,
        churn_days_threshold: editChurnDays,
        vip_retention_mode: editVipRetentionMode
      })
      setSuccessToast(`Pengaturan Loyalty & Kriteria CRM berhasil disimpan!`)
      setShowProgramConfigModal(false)
      await loadData()
    } catch (err) {
      setErrorMessage('Gagal menyimpan pengaturan program loyalty & CRM: ' + err.message)
    } finally {
      setSavingProgram(false)
    }
  }

  // Reset to Default Preset Settings
  const handleResetToDefaultSettings = () => {
    setEditTargetStamps(DEFAULT_CRM_SETTINGS.target_stamps)
    setEditRewardType(DEFAULT_CRM_SETTINGS.reward_type)
    setEditRewardTitle(DEFAULT_CRM_SETTINGS.reward_title)
    setEditRewardDescription(DEFAULT_CRM_SETTINGS.reward_description)
    setEditVipMinVisits(DEFAULT_CRM_SETTINGS.vip_min_visits)
    setEditVipMinSpent(DEFAULT_CRM_SETTINGS.vip_min_spent)
    setEditLoyalMinVisits(DEFAULT_CRM_SETTINGS.loyal_min_visits)
    setEditActiveDays(DEFAULT_CRM_SETTINGS.active_days_threshold)
    setEditChurnDays(DEFAULT_CRM_SETTINGS.churn_days_threshold)
    setEditVipRetentionMode(DEFAULT_CRM_SETTINGS.vip_retention_mode)
  }

  // Open Smart Retention WhatsApp Modal
  const handleOpenRetentionModal = (customer) => {
    setRetentionTargetCustomer(customer)
    const defaultTpl = DEFAULT_CRM_TEMPLATES[0]
    setSelectedTemplateId(defaultTpl.id)
    setCustomMessageBody(defaultTpl.body)
    recompileMessage(defaultTpl.body, customer)
  }

  // Re-compile message using Spintax and customer variables
  const recompileMessage = (templateBody, customer) => {
    const cust = customer || retentionTargetCustomer
    if (!cust) return
    const variables = {
      nama: cust.nama || 'Kak',
      plat: cust.plat,
      model: cust.model || 'Mobil',
      hari_lalu: cust.daysSinceLastVisit || 0,
      total_kunjungan: cust.totalVisits || 1,
      paket_favorit: cust.favPkg || 'Cuci Mobil',
      target_stamps: cust.loyalty?.stampTarget || programSettings.target_stamps || 5,
      reward_title: cust.loyalty?.rewardTitle || programSettings.reward_title || 'Gratis Cuci Mobil'
    }
    const compiled = compileWhatsAppTemplate(templateBody, variables)
    setCompiledPreview(compiled)
    setCopiedMessage(false)
  }

  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId)
    const tpl = DEFAULT_CRM_TEMPLATES.find(t => t.id === templateId)
    if (tpl) {
      setCustomMessageBody(tpl.body)
      recompileMessage(tpl.body)
    }
  }

  const handleCopyMessage = () => {
    if (!compiledPreview) return
    navigator.clipboard.writeText(compiledPreview)
    setCopiedMessage(true)
    setTimeout(() => setCopiedMessage(false), 2000)
  }

  const handleSendWhatsApp = () => {
    if (!retentionTargetCustomer || !compiledPreview) return
    const cleanPhone = (retentionTargetCustomer.noTelepon || '').replace(/\D/g, '').replace(/^0/, '62')
    if (!cleanPhone || cleanPhone.length < 9) {
      alert('Nomor WhatsApp pelanggan belum valid atau belum diisi.')
      return
    }
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(compiledPreview)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Export CSV
  const handleExportCSV = () => {
    if (customerList.length === 0) return
    const headers = [
      'Nomor Plat',
      'Nama Pelanggan',
      'Model Kendaraan',
      'No Telepon',
      'Segmen RFM',
      'Kunjungan Terakhir (Hari Lalu)',
      'Total Kunjungan',
      'Stamp Loyalty',
      'Siap Klaim Reward',
      'Total Cuci Mobil (Rp)',
      'Total Cafe (Rp)',
      'Total Belanja (Rp)',
      'Paket Favorit',
      'Catatan Khusus'
    ]
    const rows = customerList.map(c => [
      `"${c.plat}"`,
      `"${c.nama || '-'}"`,
      `"${c.model}"`,
      `"${c.noTelepon}"`,
      `"${c.rfm?.label || c.segment}"`,
      c.daysSinceLastVisit || 0,
      c.totalVisits,
      `${c.loyalty?.stamps || 0}/${STAMP_TARGET_DEFAULT}`,
      c.loyalty?.isRewardReady ? 'YA' : 'TIDAK',
      c.carwashSpent || 0,
      c.cafeSpent || 0,
      c.totalSpent,
      `"${c.favPkg}"`,
      `"${(c.catatanKhusus || '').replace(/"/g, '""')}"`
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `crm_loyalty_relaypos_${new Date().toISOString().substring(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-6 pb-24 md:pb-8 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 rounded-xl shadow-2xl backdrop-blur-md animate-fade-in text-xs font-semibold">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
              <Users size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Manajemen Pelanggan & CRM Terpadu
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 uppercase tracking-wider">
                  Carwash & Cafe Loyalty
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Segmentasi RFM otomatis, kartu stamp digital, retensi WhatsApp cerdas & konsolidasi belanja
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowProgramConfigModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-amber-500/15 to-orange-500/15 hover:from-amber-500/25 hover:to-orange-500/25 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
            title="Kustomisasi Target Stamp & Hadiah"
          >
            <Gift size={14} className="text-amber-400" />
            <span>Atur Program Loyalty</span>
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
            title="Refresh Data Pelanggan"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-cyan-400' : ''} />
          </button>

          <button
            onClick={handleExportCSV}
            disabled={customerList.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
          >
            <Download size={14} className="text-cyan-400" />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* Error Feedback Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 4 Summary Cards (Bento-style Metric Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Pelanggan */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-900/40 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pelanggan</span>
            <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Users size={16} />
            </span>
          </div>
          <h3 className="text-2xl font-black text-white font-mono tabular-nums">{summaryMetrics.totalCustomers}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Kendaraan & kontak terdaftar unik</p>
        </div>

        {/* Card 2: Pelanggan Setia (VIP) */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-900/40 relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pelanggan Setia (VIP)</span>
            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Award size={16} />
            </span>
          </div>
          <h3 className="text-2xl font-black text-emerald-400 font-mono tabular-nums">{summaryMetrics.vipCount}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Kunjungan cuci ≥ 5 kali & aktif</p>
        </div>

        {/* Card 3: Perlu Follow-Up (14-30 Hari) */}
        <div
          onClick={() => { setFilterSegment('NEED_ATTENTION'); setCurrentPage(1) }}
          className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-900/40 relative overflow-hidden cursor-pointer hover:border-amber-500/40 transition-all group"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              Perlu Follow-Up
            </span>
            <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:bg-amber-500/20 transition-all">
              <Clock size={16} />
            </span>
          </div>
          <h3 className="text-2xl font-black text-amber-400 font-mono tabular-nums">{summaryMetrics.needAttentionCount}</h3>
          <p className="text-[11px] text-slate-400 mt-1">Sudah 14-30 hari belum mampir cuci</p>
        </div>

        {/* Card 4: Berisiko Churn (>30 Hari) */}
        <div
          onClick={() => { setFilterSegment('AT_RISK'); setCurrentPage(1) }}
          className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-900/40 relative overflow-hidden cursor-pointer hover:border-rose-500/40 transition-all group"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
              Berisiko Churn
            </span>
            <span className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:bg-rose-500/20 transition-all">
              <AlertTriangle size={16} />
            </span>
          </div>
          <h3 className="text-2xl font-black text-rose-400 font-mono tabular-nums">{summaryMetrics.atRiskCount}</h3>
          <p className="text-[11px] text-slate-400 mt-1">&gt; 30 hari tidak berkunjung (Target Winback)</p>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-900/30 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Daftar Kendaraan & Histori Loyalitas
              {summaryMetrics.readyRewardCount > 0 && (
                <button
                  onClick={() => { setFilterSegment('REWARD_READY'); setCurrentPage(1) }}
                  className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 hover:bg-emerald-500/30 transition-all"
                >
                  <Gift size={11} />
                  {summaryMetrics.readyRewardCount} Siap Klaim Reward
                </button>
              )}
            </h3>
            <p className="text-xs text-slate-400">Total {filteredCustomers.length} pelanggan ditemukan</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                placeholder="Cari Plat / Nama / HP / Paket..."
                className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 w-60"
              />
            </div>

            {/* Segment Selector Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto max-w-full">
              <button
                onClick={() => { setFilterSegment('ALL'); setCurrentPage(1) }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] whitespace-nowrap ${filterSegment === 'ALL' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                Semua
              </button>
              <button
                onClick={() => { setFilterSegment('VIP'); setCurrentPage(1) }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] whitespace-nowrap ${filterSegment === 'VIP' ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                VIP (≥5x)
              </button>
              <button
                onClick={() => { setFilterSegment('LOYAL'); setCurrentPage(1) }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] whitespace-nowrap ${filterSegment === 'LOYAL' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-white'}`}
              >
                Reguler (3-4x)
              </button>
              <button
                onClick={() => { setFilterSegment('NEED_ATTENTION'); setCurrentPage(1) }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] whitespace-nowrap ${filterSegment === 'NEED_ATTENTION' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                Perlu Follow-Up
              </button>
              <button
                onClick={() => { setFilterSegment('AT_RISK'); setCurrentPage(1) }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] whitespace-nowrap ${filterSegment === 'AT_RISK' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
              >
                Berisiko Churn
              </button>
              <button
                onClick={() => { setFilterSegment('NEW'); setCurrentPage(1) }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all text-[11px] whitespace-nowrap ${filterSegment === 'NEW' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Baru (1x)
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <RelationTable
          data={paginatedCustomers}
          sortState={sortState}
          onSort={handleSort}
          keyExtractor={(c) => c.plat}
          emptyMessage="Tidak ada pelanggan atau riwayat kendaraan ditemukan untuk filter ini."
          columns={[
            {
              key: 'plat',
              label: 'Plat / Nama Pelanggan',
              sortable: true,
              className: 'font-mono font-bold text-white',
              render: (val, c) => (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono bg-slate-950 text-cyan-300 font-black px-2 py-0.5 rounded border border-cyan-900/50 text-xs">
                      {val || '-'}
                    </span>
                    {c.catatanKhusus && (
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Memiliki catatan khusus" />
                    )}
                  </div>
                  {c.nama && (
                    <span className="text-[11px] text-slate-300 font-semibold truncate max-w-[140px]">
                      {c.nama}
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'model',
              label: 'Model & Layanan Favorit',
              sortable: true,
              className: 'font-medium text-white',
              render: (val, c) => (
                <div>
                  <div className="text-white font-medium text-xs">{val || 'Mobil'}</div>
                  <div className="text-slate-400 text-[10px] uppercase font-mono truncate max-w-[150px]">
                    {c.favPkg}
                  </div>
                </div>
              ),
            },
            {
              key: 'noTelepon',
              label: 'No. WhatsApp',
              className: 'font-mono text-slate-400 text-xs',
              render: (val) => (
                val && val !== '-' ? (
                  <span className="text-slate-300 font-mono text-xs">{val}</span>
                ) : (
                  <span className="text-slate-600 font-mono">-</span>
                )
              ),
            },
            {
              key: 'segment',
              label: 'Status RFM',
              render: (_, c) => (
                <div className="flex flex-col gap-1 items-start">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${c.segmentBadge}`}>
                    {c.rfm?.label || c.segment}
                  </span>
                  {c.daysSinceLastVisit !== undefined && (
                    <span className={`text-[10px] font-mono ${c.daysSinceLastVisit > 30 ? 'text-rose-400 font-bold' : c.daysSinceLastVisit >= 14 ? 'text-amber-400' : 'text-slate-500'}`}>
                      {c.daysSinceLastVisit === 0 ? 'Hari ini' : `${c.daysSinceLastVisit} hari lalu`}
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'totalVisits',
              label: 'Loyalty Stamp',
              sortable: true,
              align: 'center',
              render: (_, c) => {
                const stamps = c.loyalty?.stamps || 0
                const target = c.loyalty?.stampTarget || programSettings.target_stamps || 5
                const isReady = c.loyalty?.isRewardReady
                const rewardTitle = c.loyalty?.rewardTitle || programSettings.reward_title || 'Gratis Layanan'
                return (
                  <div className="flex flex-col items-center gap-1" title={`Program: ${target} Stamp = ${rewardTitle}`}>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(target, 6) }, (_, i) => i + 1).map((slot) => (
                        <div
                          key={slot}
                          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold border transition-all ${
                            slot <= stamps
                              ? isReady
                                ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black'
                                : 'bg-cyan-500 border-cyan-400 text-slate-950'
                              : 'bg-slate-900 border-slate-800 text-slate-600'
                          }`}
                        >
                          {slot <= stamps ? '✓' : ''}
                        </div>
                      ))}
                      {target > 6 && (
                        <span className="text-[9px] font-mono text-slate-400 font-bold">+{target - 6}</span>
                      )}
                    </div>
                    {isReady ? (
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider animate-pulse">
                        Siap Klaim!
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono text-slate-400">
                        {stamps}/{target} Stamp
                      </span>
                    )}
                  </div>
                )
              },
            },
            {
              key: 'totalSpent',
              label: 'Akumulasi Belanja',
              sortable: true,
              numeric: true,
              render: (val, c) => (
                <div className="text-right">
                  <span className="font-mono text-cyan-400 font-bold text-xs tabular-nums block">
                    {formatRupiah(val || 0)}
                  </span>
                  {c.cafeSpent > 0 && (
                    <span className="text-[10px] text-amber-400/80 font-mono tabular-nums block" title="Belanja Cafe">
                      + Cafe: {formatRupiah(c.cafeSpent)}
                    </span>
                  )}
                </div>
              ),
            },
            {
              key: 'actions',
              label: 'Aksi Cepat',
              align: 'center',
              render: (_, c) => (
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    onClick={() => handleOpenRetentionModal(c)}
                    className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1 text-[11px] font-semibold active:scale-[0.98]"
                    title="Buat Pesan Retensi WhatsApp"
                  >
                    <MessageSquare size={13} />
                    <span>Follow-Up</span>
                  </button>

                  <button
                    onClick={() => setSelectedCustomerPlat(c.plat)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex items-center gap-1 text-[11px] font-semibold active:scale-[0.98]"
                    title="Lihat Detail Riwayat & Stamp"
                  >
                    <span>Detail</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              ),
            },
          ]}
        />

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Halaman <span className="font-bold text-white">{currentPage}</span> dari {totalPages} ({filteredCustomers.length} Pelanggan)
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 rounded-lg font-bold text-white active:scale-[0.98]"
              >
                Sebelumnya
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 rounded-lg font-bold text-white active:scale-[0.98]"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Customer Detail, Loyalty Card & Preferences */}
      {activeCustomer && (
        <div
          onClick={() => setSelectedCustomerPlat(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-2xl max-h-[82vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-pop-in"
          >
            {/* Pinned Sticky Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 shrink-0 bg-slate-900/95 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${activeCustomer.segmentBadge}`}>
                    {activeCustomer.rfm?.label || activeCustomer.segment}
                  </span>
                  {activeCustomer.loyalty?.isRewardReady && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase flex items-center gap-1">
                      <Gift size={10} /> Reward Siap Klaim
                    </span>
                  )}
                </div>
                <h3 className="font-mono text-xl font-black text-white tracking-wider uppercase mt-1">
                  {activeCustomer.plat}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Model: {activeCustomer.model} • Telp: {activeCustomer.noTelepon || '-'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCustomerPlat(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                  title="Tutup (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable Content Body with min-h-0 Flex Clamp */}
            <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-3.5">
              {/* Interactive Loyalty Stamp Board */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Award size={16} className="text-cyan-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Kartu Stamp Loyalty Digital
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                    <span>Target: <strong className="text-cyan-400">{activeCustomer.loyalty?.stampTarget || 5} Stamp</strong></span>
                    <span>Riwayat: <strong className="text-white">{activeCustomer.totalVisits}x</strong> Cuci</span>
                  </div>
                </div>

                {/* Dynamic Slots */}
                <div className={`grid gap-2 pt-0.5 ${
                  (activeCustomer.loyalty?.stampTarget || 5) <= 5
                    ? 'grid-cols-5'
                    : (activeCustomer.loyalty?.stampTarget || 5) <= 8
                      ? 'grid-cols-4 sm:grid-cols-8'
                      : 'grid-cols-5 sm:grid-cols-10'
                }`}>
                  {Array.from({ length: activeCustomer.loyalty?.stampTarget || 5 }, (_, i) => i + 1).map((slot) => {
                    const isChecked = slot <= (activeCustomer.loyalty?.stamps || 0)
                    const isLastSlot = slot === (activeCustomer.loyalty?.stampTarget || 5)
                    return (
                      <div
                        key={slot}
                        className={`flex flex-col items-center justify-center py-2 rounded-lg border text-center transition-all ${
                          isChecked
                            ? activeCustomer.loyalty?.isRewardReady
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm'
                              : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                            : 'bg-slate-900 border-slate-800 text-slate-600'
                        }`}
                      >
                        <span className="text-sm font-black">
                          {isChecked ? '✓' : slot}
                        </span>
                        <span className="text-[9px] font-bold uppercase mt-0.5 truncate max-w-full px-0.5">
                          {isLastSlot ? '🎁 Hadiah' : `Cuci ${slot}`}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Reward Claim Banner if Ready */}
                {activeCustomer.loyalty?.isRewardReady && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs flex-wrap">
                    <div className="flex items-center gap-2">
                      <Gift size={15} className="text-emerald-400 shrink-0" />
                      <div>
                        <p className="font-bold text-emerald-200 text-xs">
                          Kartu Stamp Penuh ({activeCustomer.loyalty?.stampTarget}/{activeCustomer.loyalty?.stampTarget})!
                        </p>
                        <p className="text-[11px] text-emerald-300/90">
                          Pelanggan berhak atas: <strong className="text-white font-semibold underline underline-offset-2">{activeCustomer.loyalty?.rewardTitle || 'Hadiah Loyalty'}</strong>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClaimReward}
                      disabled={claimingReward}
                      className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-lg transition-all shadow-md active:scale-[0.98] shrink-0"
                    >
                      {claimingReward ? 'Memproses...' : 'Klaim Hadiah'}
                    </button>
                  </div>
                )}
              </div>

              {/* Financial & Spending Summary */}
              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 font-medium text-[11px]">Cuci Mobil</span>
                  <p className="text-sm font-black text-cyan-400 mt-0.5 font-mono tabular-nums">
                    {formatRupiah(activeCustomer.carwashSpent || 0)}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 font-medium text-[11px]">Konsumsi Cafe</span>
                  <p className="text-sm font-black text-amber-400 mt-0.5 font-mono tabular-nums">
                    {formatRupiah(activeCustomer.cafeSpent || 0)}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 font-medium text-[11px]">Total Akumulasi</span>
                  <p className="text-sm font-black text-emerald-400 mt-0.5 font-mono tabular-nums">
                    {formatRupiah(activeCustomer.totalSpent || 0)}
                  </p>
                </div>
              </div>

              {/* Sub-Tab Navigation for Balanced High-Density Content */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCustomerDetailTab('history')}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    customerDetailTab === 'history'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  <Clock size={13} />
                  <span>Histori Transaksi Cuci ({activeCustomer.visitsHistory?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerDetailTab('notes')}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    customerDetailTab === 'notes'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  <FileText size={13} />
                  <span>Profil & Catatan Kru</span>
                </button>
              </div>

              {/* Tab 1: Histori Transaksi Cuci */}
              {customerDetailTab === 'history' && (
                <div className="space-y-2">
                  <TableContainer className="border border-slate-800 rounded-xl max-h-44 overflow-y-auto">
                    <Table>
                      <TableHeader sticky>
                        <TableRow className="bg-slate-900/95 text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-800">
                          <TableHead className="py-2 px-3">Layanan Cuci</TableHead>
                          <TableHead className="py-2 px-3">Waktu & Kru</TableHead>
                          <TableHead align="right" className="py-2 px-3">Tarif</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(activeCustomer.visitsHistory || []).length === 0 ? (
                          <TableEmpty colSpan={3} message="Belum ada riwayat transaksi cuci tercatat." />
                        ) : (
                          (activeCustomer.visitsHistory || []).map((v, i) => (
                            <TableRow
                              key={v.id || i}
                              className="hover:bg-slate-800/40 transition-colors border-b border-slate-800/60 text-xs"
                            >
                              <TableCell className="py-2 px-3">
                                <span className="font-bold text-white block">{v.paket}</span>
                                <span className="text-[10px] text-slate-400">Ukuran: {v.ukuran}</span>
                              </TableCell>
                              <TableCell className="py-2 px-3 text-slate-300">
                                <span className="text-[11px] block">{v.tanggal} {v.jam ? `• Jam ${v.jam}` : ''}</span>
                                <span className="text-[10px] text-slate-500">Kru: {v.pencuci || '-'}</span>
                              </TableCell>
                              <TableCell align="right" numeric className="py-2 px-3 font-mono font-bold text-cyan-400 tabular-nums">
                                {formatRupiah(v.harga)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </div>
              )}

              {/* Tab 2: Special Customer Preference Notes Section */}
              {customerDetailTab === 'notes' && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={13} className="text-cyan-400" />
                      Profil & Catatan Khusus
                    </span>
                    <span className="text-[10px] text-slate-500">Instruksi Kru Bay/Kasir</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Nama Pemilik:</label>
                      <input
                        type="text"
                        value={customerNameInput}
                        onChange={(e) => setCustomerNameInput(e.target.value)}
                        placeholder="Contoh: Pak Budi"
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">No. WhatsApp:</label>
                      <input
                        type="text"
                        value={whatsappInput}
                        onChange={(e) => setWhatsappInput(e.target.value)}
                        placeholder="0812xxxxxxxx"
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Catatan Handling / Alergi Parfum / Velg Khusus:</label>
                    <textarea
                      rows={2}
                      value={preferenceNoteInput}
                      onChange={(e) => setPreferenceNoteInput(e.target.value)}
                      placeholder="Contoh: AC jangan disemprot parfum cair, velg cat doff hati-hati chemical keras..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 resize-none"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveCustomerNote}
                      disabled={savingNote}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                    >
                      <Save size={13} />
                      <span>{savingNote ? 'Menyimpan...' : 'Simpan Profil & Catatan'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pinned Sticky Footer */}
            <div className="px-5 py-3 border-t border-slate-800 shrink-0 bg-slate-900/95 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <span>Segmen: <strong className="text-white capitalize">{activeCustomer.segment}</strong> • Total <strong className="text-cyan-400">{activeCustomer.totalVisits}x</strong> Kunjungan</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenRetentionModal(activeCustomer)}
                  className="px-3.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-[0.98]"
                >
                  <MessageCircle size={14} />
                  <span>Kirim WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCustomerPlat(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all active:scale-[0.98]"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Smart Retention WhatsApp Generator */}
      {retentionTargetCustomer && (
        <div
          onClick={() => setRetentionTargetCustomer(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-xl max-h-[82vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-pop-in"
          >
            {/* Pinned Sticky Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 shrink-0 bg-slate-900/95 flex justify-between items-start">
              <div>
                <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase font-bold tracking-wider">
                  Smart Retention Assistant
                </span>
                <h3 className="text-lg font-black text-white mt-1">
                  Kirim Pesan WhatsApp: <span className="font-mono text-cyan-400">{retentionTargetCustomer.plat}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tujuan: {retentionTargetCustomer.nama || 'Pelanggan'} • {retentionTargetCustomer.noTelepon || 'No HP tidak terdaftar'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setRetentionTargetCustomer(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                title="Tutup (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Body with min-h-0 Flex Clamp */}
            <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-3.5">
              {/* Template Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Pilih Template Pesan:</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {DEFAULT_CRM_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => handleTemplateChange(tpl.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selectedTemplateId === tpl.id
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <p className="font-bold text-[11px] truncate">{tpl.title}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{tpl.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Body Editor */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold text-slate-300">Format Template (Spintax & Variabel):</label>
                  <button
                    onClick={() => recompileMessage(customMessageBody)}
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold"
                    title="Generate ulang variasi kata Spintax"
                  >
                    <Sparkles size={12} />
                    <span>Acak Variasi Kata (Spintax)</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={customMessageBody}
                  onChange={(e) => {
                    setCustomMessageBody(e.target.value)
                    recompileMessage(e.target.value)
                  }}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-mono resize-none"
                />
              </div>

              {/* Live Compiled Preview */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    Pratinjau Pesan yang Akan Diterima Pelanggan:
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {compiledPreview.length} Karakter
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-xs text-emerald-100 whitespace-pre-line leading-relaxed">
                  {compiledPreview || 'Ketik template untuk melihat pratinjau...'}
                </div>
              </div>
            </div>

            {/* Pinned Action Buttons Footer */}
            <div className="px-5 py-3 border-t border-slate-800 shrink-0 bg-slate-900/95 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCopyMessage}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
              >
                {copiedMessage ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedMessage ? 'Tersalin!' : 'Salin Teks'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRetentionTargetCustomer(null)}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  disabled={!retentionTargetCustomer?.noTelepon || retentionTargetCustomer.noTelepon === '-'}
                  className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                >
                  <Send size={14} />
                  <span>Kirim WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Custom Loyalty Program & CRM RFM Settings */}
      {showProgramConfigModal && (
        <div
          onClick={() => setShowProgramConfigModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-2xl max-h-[84vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-pop-in"
          >
            {/* Pinned Sticky Header */}
            <div className="px-5 py-3.5 border-b border-slate-800 shrink-0 bg-slate-900/95 flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Pengaturan Loyalty & Kriteria CRM
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kustomisasi target stamp hadiah serta kriteria VIP & batas churn outlet Anda
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowProgramConfigModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                title="Tutup (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/70 px-5 pt-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfigModalTab('stamps')}
                className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                  configModalTab === 'stamps'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Gift size={14} />
                <span>1. Program Stamp & Hadiah</span>
              </button>
              <button
                type="button"
                onClick={() => setConfigModalTab('vip_rfm')}
                className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all ${
                  configModalTab === 'vip_rfm'
                    ? 'border-emerald-400 text-emerald-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Crown size={14} />
                <span>2. Kriteria VIP & Ambang RFM</span>
              </button>
            </div>

            {/* Scrollable Body Container */}
            <div className="px-5 py-4 space-y-3.5 flex-1 min-h-0 overflow-y-auto">
              {configModalTab === 'stamps' ? (
                <>
                  {/* Target Stamp Stepper */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <label className="text-xs font-bold text-white block">
                          Target Jumlah Stamp untuk Klaim:
                        </label>
                        <p className="text-[11px] text-slate-400">
                          Berapa kali cuci mobil agar pelanggan berhak mendapatkan hadiah?
                        </p>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setEditTargetStamps(prev => Math.max(2, prev - 1))}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold active:scale-95"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-mono text-base font-black text-amber-400 w-8 text-center tabular-nums">
                          {editTargetStamps}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditTargetStamps(prev => Math.min(20, prev + 1))}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold active:scale-95"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Preset Chips */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 font-semibold mr-1">Rekomendasi Cepat:</span>
                      {[3, 5, 8, 10].map(cnt => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setEditTargetStamps(cnt)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
                            editTargetStamps === cnt
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {cnt} Stamp {cnt === 5 ? '(Standar)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reward Type Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white block">
                      Kategori Hadiah / Reward:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {[
                        { id: 'FREE_SERVICE', label: 'Cuci / Detailing', icon: Car },
                        { id: 'FREE_CAFE', label: 'Minuman / Cafe', icon: Coffee },
                        { id: 'DISCOUNT_PERCENT', label: 'Diskon (%)', icon: Tag },
                        { id: 'CUSTOM', label: 'Kustom Bebas', icon: Gift }
                      ].map(cat => {
                        const IconComp = cat.icon
                        const isSelected = editRewardType === cat.id
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setEditRewardType(cat.id)}
                            className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 text-center transition-all ${
                              isSelected
                                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            <IconComp size={16} />
                            <span className="font-bold text-[11px]">{cat.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Popular Reward Preset Chips */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 block">
                      Pilih Cepat Nama Hadiah Populer:
                    </label>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {[
                        { title: 'Gratis 1x Cuci Mobil Salju', type: 'FREE_SERVICE', desc: 'Gratis 1x cuci mobil salju reguler.' },
                        { title: 'Gratis 1 Cup Kopi Susu Senja di Cafe', type: 'FREE_CAFE', desc: 'Voucher 1 cup kopi susu / teh manis dingin di cafe.' },
                        { title: 'Gratis 1 Camilan / Snack di Cafe', type: 'FREE_CAFE', desc: 'Voucher 1 porsi kentang goreng / snack di cafe.' },
                        { title: 'Diskon 50% Cuci Detailing / Poles', type: 'DISCOUNT_PERCENT', desc: 'Potongan 50% untuk layanan premium cuci detailing.' },
                        { title: 'Gratis Fogging Interior Anti-Bakteri', type: 'CUSTOM', desc: 'Bonus sterilisasi fogging interior kabin mobil.' }
                      ].map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setEditRewardTitle(p.title)
                            setEditRewardType(p.type)
                            setEditRewardDescription(p.desc)
                          }}
                          className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-[11px] font-medium transition-all"
                        >
                          {p.title}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reward Title Input */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-white block">
                      Nama Hadiah yang Didapatkan Pelanggan:
                    </label>
                    <input
                      type="text"
                      value={editRewardTitle}
                      onChange={(e) => setEditRewardTitle(e.target.value)}
                      placeholder="Contoh: Gratis 1x Cuci Mobil Salju"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 font-semibold"
                    />
                  </div>

                  {/* Reward Description */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300 block">
                      Deskripsi & Syarat Klaim (Opsional):
                    </label>
                    <textarea
                      rows={2}
                      value={editRewardDescription}
                      onChange={(e) => setEditRewardDescription(e.target.value)}
                      placeholder="Contoh: Tunjukkan kupon stamp ke kasir saat mobil selesai dicuci."
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400 resize-none"
                    />
                  </div>

                  {/* Live Preview of Dynamic Stamp Card */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 size={13} className="text-amber-400" />
                        Pratinjau Kartu Stamp Pelanggan:
                      </span>
                      <span className="font-mono text-[10px] text-amber-400 font-bold">
                        Target: {editTargetStamps} Stamp
                      </span>
                    </div>

                    {/* Slots preview */}
                    <div className={`grid gap-1.5 pt-1 ${
                      editTargetStamps <= 5
                        ? 'grid-cols-5'
                        : editTargetStamps <= 8
                          ? 'grid-cols-4 sm:grid-cols-8'
                          : 'grid-cols-5 sm:grid-cols-10'
                    }`}>
                      {Array.from({ length: editTargetStamps }, (_, i) => i + 1).map((slot) => {
                        const isLast = slot === editTargetStamps
                        return (
                          <div
                            key={slot}
                            className={`flex flex-col items-center justify-center py-2 rounded-lg border text-center transition-all ${
                              isLast
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            <span className="text-xs font-black">{slot}</span>
                            <span className="text-[8px] font-bold uppercase truncate max-w-full px-0.5 mt-0.5">
                              {isLast ? '🎁 Klaim' : `Cuci ${slot}`}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200 mt-2">
                      <span className="font-bold">Hadiah:</span> {editRewardTitle || 'Nama Hadiah Belum Diisi'}
                    </div>
                  </div>
                </>
              ) : (
                /* TAB 2: VIP & RFM THRESHOLDS CUSTOMIZATION */
                <div className="space-y-4">
                  {/* 1. VIP Minimum Visits Requirement */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <label className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Crown size={14} className="text-emerald-400" />
                          Syarat Minimal Kunjungan VIP:
                        </label>
                        <p className="text-[11px] text-slate-400">
                          Berapa kali total cuci mobil agar pelanggan meraih gelar VIP?
                        </p>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setEditVipMinVisits(prev => Math.max(2, prev - 1))}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold active:scale-95"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="font-mono text-base font-black text-emerald-400 w-8 text-center tabular-nums">
                          {editVipMinVisits}x
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditVipMinVisits(prev => Math.min(50, prev + 1))}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold active:scale-95"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 font-semibold mr-1">Preset Cepat:</span>
                      {[3, 5, 7, 10].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setEditVipMinVisits(v)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
                            editVipMinVisits === v
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          ≥ {v}x Cuci {v === 5 ? '(Standar)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. VIP Minimum Spending Requirement (Optional) */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                    <div>
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <DollarSign size={14} className="text-cyan-400" />
                        Syarat Minimal Akumulasi Belanja VIP (Opsional):
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Bila diisi &gt; Rp 0, pelanggan harus mencapai total rupiah belanja ini di samping frekuensi kunjungan.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="50000"
                        value={editVipMinSpent}
                        onChange={(e) => setEditVipMinSpent(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-400"
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                        {editVipMinSpent > 0 ? formatRupiah(editVipMinSpent) : 'Hanya Kunjungan'}
                      </span>
                    </div>

                    {/* Spend presets */}
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'Rp 0 (Hanya Kunjungan)', val: 0 },
                        { label: 'Rp 250.000', val: 250000 },
                        { label: 'Rp 500.000', val: 500000 },
                        { label: 'Rp 1.000.000', val: 1000000 }
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setEditVipMinSpent(item.val)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all ${
                            editVipMinSpent === item.val
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Recency & Churn Days Thresholds */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Active Threshold */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Clock size={13} className="text-cyan-400" />
                        Batas Hari "Aktif Baru" (Recency):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="3"
                          max="60"
                          value={editActiveDays}
                          onChange={(e) => setEditActiveDays(Math.max(1, parseInt(e.target.value, 10) || 14))}
                          className="w-20 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono font-bold text-white text-center focus:outline-none focus:border-cyan-400"
                        />
                        <span className="text-xs text-slate-400">Hari Terakhir</span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Datang dalam ≤ {editActiveDays} hari dianggap pelanggan aktif rutin.
                      </p>
                    </div>

                    {/* Churn Threshold */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <label className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                        <ShieldAlert size={13} className="text-rose-400" />
                        Batas Alarm Churn (Hilang):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="10"
                          max="180"
                          value={editChurnDays}
                          onChange={(e) => setEditChurnDays(Math.max(editActiveDays + 1, parseInt(e.target.value, 10) || 30))}
                          className="w-20 px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono font-bold text-rose-400 text-center focus:outline-none focus:border-rose-400"
                        />
                        <span className="text-xs text-slate-400">Hari Tanpa Cuci</span>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Tidak datang &gt; {editChurnDays} hari otomatis memicu status Berisiko Churn.
                      </p>
                    </div>
                  </div>

                  {/* 4. VIP Retention Inactivity Behavior Mode */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white block">
                      Mode Perilaku VIP saat Tidak Aktif (&gt; {editChurnDays} Hari):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {/* Option A: Dynamic */}
                      <button
                        type="button"
                        onClick={() => setEditVipRetentionMode('DYNAMIC')}
                        className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                          editVipRetentionMode === 'DYNAMIC'
                            ? 'bg-amber-500/15 border-amber-500/50 text-white shadow-sm ring-1 ring-amber-500/30'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-amber-300 text-xs">Mode Dinamis (Standar)</span>
                          {editVipRetentionMode === 'DYNAMIC' && <Check size={14} className="text-amber-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          VIP yang tidak datang &gt;{editChurnDays} hari beralih ke <span className="text-rose-400 font-semibold">Berisiko Churn</span> agar staf segera mengirimkan WhatsApp Winback.
                        </p>
                      </button>

                      {/* Option B: Permanent */}
                      <button
                        type="button"
                        onClick={() => setEditVipRetentionMode('PERMANENT')}
                        className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                          editVipRetentionMode === 'PERMANENT'
                            ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm ring-1 ring-emerald-500/30'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-emerald-300 text-xs">Gelar VIP Permanen</span>
                          {editVipRetentionMode === 'PERMANENT' && <Check size={14} className="text-emerald-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Tetap menyandang status VIP kapan pun datang, namun sistem menyematkan label peringatan inaktif jika melewati batas {editChurnDays} hari.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* 5. Live Summary Box */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                    <span className="font-bold text-white flex items-center gap-1.5 text-[11px]">
                      <Sparkles size={13} className="text-cyan-400" />
                      Ringkasan Kriteria Outlet Aktif:
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      • <strong className="text-emerald-300">VIP</strong>: Kunjungan ≥ <span className="text-white font-mono">{editVipMinVisits}x</span> {editVipMinSpent > 0 ? `dan total belanja ≥ ${formatRupiah(editVipMinSpent)}` : ''}.<br />
                      • <strong className="text-amber-300">Follow-Up</strong>: Tidak berkunjung selama <span className="text-white font-mono">{editActiveDays} - {editChurnDays} hari</span>.<br />
                      • <strong className="text-rose-400">Churn</strong>: Melewati <span className="text-white font-mono">&gt; {editChurnDays} hari</span> ({editVipRetentionMode === 'DYNAMIC' ? 'Status berubah ke Berisiko Churn' : 'Gelar VIP dengan flag inaktif'}).
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Pinned Footer */}
            <div className="px-5 py-3 border-t border-slate-800 shrink-0 bg-slate-900/95 flex justify-between items-center gap-2">
              <button
                type="button"
                onClick={handleResetToDefaultSettings}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl text-xs font-medium transition-all"
                title="Kembalikan semua nilai ke preset standar sistem"
              >
                <RotateCcw size={13} />
                <span>Reset ke Standar</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProgramConfigModal(false)}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveProgramSettings}
                  disabled={savingProgram}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50"
                >
                  <Save size={14} />
                  <span>{savingProgram ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM
