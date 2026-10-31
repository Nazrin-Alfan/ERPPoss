import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import {
  calculateFounderPlatformMetrics,
  toggleTenantSubscriptionStatus,
  generateLicenseRenewalPayload
} from '../services/founderService'
import {
  createCleanTenantPayload,
  deleteTenantCompletely
} from '../utils/superAdminHelpers'
import { formatRupiah } from '../utils/helpers'
import {
  Crown,
  TrendingUp,
  Store,
  ShieldCheck,
  ShieldAlert,
  Key,
  Users,
  Database,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Play,
  Calendar,
  ExternalLink,
  Plus,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  Download,
  ChevronDown,
  ChevronUp,
  User,
  Mail,
  Phone,
  MapPin,
  Clock,
  Archive,
  ArchiveRestore,
  Copy,
  Check,
  MessageSquare
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Founder() {
  const { profile, switchTenant } = useAuth()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [tenants, setTenants] = useState([])
  const [profiles, setProfiles] = useState([])
  const [transactions, setTransactions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlanFilter, setSelectedPlanFilter] = useState('ALL')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ACTIVE') // 'ACTIVE' | 'ARCHIVED' | 'ALL'
  const [lastRefreshed, setLastRefreshed] = useState(new Date())
  const [expandedTenantId, setExpandedTenantId] = useState(null)

  // Modal State: Buat Tenant Baru
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isSubmittingTenant, setIsSubmittingTenant] = useState(false)
  const [createdTenantResult, setCreatedTenantResult] = useState(null)
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false)
  const [createForm, setCreateForm] = useState({
    storeName: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
    telepon: '',
    alamat: '',
    tier: 'PRO_ANNUAL',
    licenseDurationMonths: 12,
    businessType: 'HYBRID'
  })

  // Modal State: Perpanjang Lisensi
  const [renewingTenant, setRenewingTenant] = useState(null)
  const [renewalMonths, setRenewalMonths] = useState(12)

  // Modal State: Arsipkan Tenant (Soft Delete)
  const [tenantToArchive, setTenantToArchive] = useState(null)

  // Status feedback toast
  const [toastMessage, setToastMessage] = useState('')

  const showNotification = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 4000)
  }

  // Load Data Global Seluruh Platform
  const loadPlatformData = async () => {
    setIsLoading(true)
    try {
      const { data: allTenants, error: tErr } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
      if (tErr) console.warn('Supabase fetch tenants warning:', tErr)

      const { data: allTx } = await supabase.from('struk').select('*', { ignoreTenant: true })
      const { data: allProfiles } = await supabase.from('profiles').select('*', { ignoreTenant: true })
      const { data: allBranches } = await supabase.from('branches').select('*')
      const { data: allLicenses } = await supabase.from('tenant_licenses').select('*')

      const enrichedTenants = (allTenants || []).map(t => {
        const lic = (allLicenses || []).find(l => l.tenant_id === t.id)
        const br = (allBranches || []).find(b => b.tenant_id === t.id)
        const prof = (allProfiles || []).find(p => p.tenant_id === t.id && p.role === 'Owner')
        return {
          ...t,
          serial_key: lic?.license_key || t.serial_key,
          license_expires_at: lic?.valid_until || t.license_expires_at,
          telepon: br?.telepon || prof?.telepon || t.telepon,
          alamat: br?.alamat || prof?.alamat || t.alamat,
          owner_name: prof?.nama || t.owner_name,
          owner_email: prof?.email || t.owner_email
        }
      })

      setTenants(enrichedTenants)
      setTransactions(allTx || [])
      setProfiles(allProfiles || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Gagal memuat data platform founder:', err)
      showNotification('Gagal mengambil data dari database.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPlatformData()
  }, [])

  // Kalkulasi Metrik Global Platform
  const platformMetrics = useMemo(() => {
    return calculateFounderPlatformMetrics({
      tenants,
      transactions
    })
  }, [tenants, transactions])

  // Filter List Tenant
  const filteredTenants = useMemo(() => {
    return tenants.filter(t => {
      const matchSearch = (t.nama || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.owner_email || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchPlan = selectedPlanFilter === 'ALL' || (t.plan || 'BASIC').toUpperCase() === selectedPlanFilter
      
      const isArchived = t.status === 'ARCHIVED' || t.subscription_status === 'ARCHIVED'
      let matchStatus = true
      if (selectedStatusFilter === 'ACTIVE') {
        matchStatus = !isArchived
      } else if (selectedStatusFilter === 'ARCHIVED') {
        matchStatus = isArchived
      }

      return matchSearch && matchPlan && matchStatus
    })
  }, [tenants, searchQuery, selectedPlanFilter, selectedStatusFilter])

  // Aksi Kill-Switch: Bekukan atau Aktifkan Tenant
  const handleToggleSubscription = async (tenant) => {
    const isCurrentlyActive = tenant.is_active !== false && tenant.subscription_status !== 'SUSPENDED'
    const updated = toggleTenantSubscriptionStatus(tenant, !isCurrentlyActive)

    try {
      await supabase.from('tenants').upsert(updated)
      setTenants(prev => prev.map(t => t.id === tenant.id ? updated : t))
      showNotification(
        !isCurrentlyActive 
          ? `✅ Tenant "${tenant.nama}" berhasil diaktifkan kembali.` 
          : `⚠️ Tenant "${tenant.nama}" telah dibekukan (Kill-Switch Aktif).`
      )
    } catch (err) {
      showNotification('Gagal memperbarui status tenant.')
    }
  }

  // Aksi Perpanjangan Lisensi
  const handleConfirmRenewal = async () => {
    if (!renewingTenant) return
    const updated = generateLicenseRenewalPayload(renewingTenant, renewalMonths)

    try {
      await supabase.from('tenants').upsert(updated)
      setTenants(prev => prev.map(t => t.id === renewingTenant.id ? updated : t))
      showNotification(`🎉 Lisensi "${renewingTenant.nama}" berhasil diperpanjang +${renewalMonths} bulan!`)
      setRenewingTenant(null)
    } catch (err) {
      showNotification('Gagal memperpanjang lisensi.')
    }
  }

  // Aksi Buat Tenant Baru
  const handleCreateNewTenant = async (e) => {
    e.preventDefault()
    if (!createForm.storeName.trim() || !createForm.ownerEmail.trim()) {
      showNotification('Nama Toko dan Email Pemilik wajib diisi.')
      return
    }

    setIsSubmittingTenant(true)
    try {
      let res = null
      let usedRpc = false

      // Coba panggil RPC PostgreSQL atomic Supabase Cloud
      if (typeof supabase.rpc === 'function') {
        const rpcResult = await supabase.rpc('fn_founder_create_tenant', {
          p_store_name: createForm.storeName.trim(),
          p_owner_name: createForm.ownerName.trim() || `Owner ${createForm.storeName.trim()}`,
          p_owner_email: createForm.ownerEmail.trim(),
          p_owner_password: 'password123',
          p_telepon: createForm.telepon.trim() || '-',
          p_alamat: createForm.alamat?.trim() || '-',
          p_business_type: createForm.businessType || 'HYBRID',
          p_plan: createForm.tier === 'PRO_ANNUAL' ? 'pro' : createForm.tier === 'ENTERPRISE' ? 'enterprise' : 'basic',
          p_license_months: Number(createForm.licenseDurationMonths) || 12
        })

        if (!rpcResult.error && rpcResult.data?.success) {
          res = rpcResult.data
          usedRpc = true
        } else if (rpcResult.error) {
          console.warn('RPC fn_founder_create_tenant error, evaluating fallback:', rpcResult.error)
        }
      }

      // Fallback untuk mock environment jika RPC tidak tersedia
      if (!usedRpc) {
        const payload = createCleanTenantPayload(createForm)
        const { error: tErr } = await supabase.from('tenants').insert([payload.tenant])
        if (tErr) throw new Error(tErr.message || 'Gagal menyimpan data tenant')
        if (payload.branch) await supabase.from('branches').insert([payload.branch])
        if (payload.ownerProfile) await supabase.from('profiles').insert([payload.ownerProfile])
        if (payload.license) await supabase.from('tenant_licenses').insert([payload.license])

        res = {
          nama: payload.tenant.nama,
          owner_name: payload.tenant.owner_name,
          owner_email: payload.tenant.owner_email,
          owner_password: 'password123',
          license_key: payload.license?.license_key,
          telepon: payload.tenant.telepon,
          plan: payload.tenant.plan,
          valid_until: payload.license?.expires_at
        }
      }

      // Reload data platform agar sinkron sempurna dengan database PostgreSQL
      await loadPlatformData()
      setShowCreateModal(false)

      const resultData = {
        tenant: {
          nama: res.nama,
          owner_name: res.owner_name,
          telepon: res.telepon
        },
        ownerProfile: {
          email: res.owner_email
        },
        license: {
          tier_name: res.plan,
          expires_at: res.valid_until || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          license_key: res.license_key
        },
        plainPassword: res.owner_password || 'password123',
        loginUrl: `${window.location.origin}/login`
      }

      setCreatedTenantResult(resultData)
      showNotification(`✨ Tenant baru "${res.nama}" berhasil diterbitkan dan tersimpan di database cloud!`)
      setCreateForm({
        storeName: '',
        slug: '',
        ownerName: '',
        ownerEmail: '',
        telepon: '',
        alamat: '',
        tier: 'PRO_ANNUAL',
        licenseDurationMonths: 12,
        businessType: 'HYBRID'
      })
    } catch (err) {
      console.error('Gagal membuat tenant baru:', err)
      showNotification(`Gagal membuat tenant: ${err.message}`)
    } finally {
      setIsSubmittingTenant(false)
    }
  }

  // Helper Pembuat Teks WhatsApp Onboarding Kredensial
  const getWhatsAppMessageText = (data) => {
    if (!data) return ''
    const t = data.tenant
    const o = data.ownerProfile
    const l = data.license
    const expiryFormatted = l?.expires_at ? new Date(l.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '1 Tahun'

    return `Halo Kak ${t.owner_name || 'Owner'}! 👋

Selamat, akun sistem kasir & operasional toko *${t.nama}* di *RelayPOS* sudah resmi aktif dan siap digunakan! 🚀

Berikut kredensial login akun Anda:
🌐 *Link Akses Login*: ${data.loginUrl}
📧 *Email / Username*: ${o.email}
🔑 *Password Default*: ${data.plainPassword}
🏷️ *Paket Lisensi*: ${l?.tier_name || l?.tier || 'Pro Annual'}
📅 *Masa Aktif*: s/d ${expiryFormatted}
🔐 *Kunci Serial*: ${l?.license_key || '-'}

📌 *Langkah Mudah Memulai*:
1. Buka tautan login di atas via browser laptop, tablet, atau HP (disarankan Google Chrome).
2. Masuk menggunakan Email & Password di atas.
3. Anda dapat langsung melengkapi profil toko, printer struk thermal, dan mengganti kata sandi di menu *Pengaturan Toko*.

Jika butuh panduan awal atau ada pertanyaan teknis, silakan hubungi kami via chat ini. Selamat mengelola usaha dengan RelayPOS! 🙌`
  }

  const handleCopyWhatsAppText = () => {
    if (!createdTenantResult) return
    const text = getWhatsAppMessageText(createdTenantResult)
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
    }
    setCopiedWhatsApp(true)
    showNotification('📋 Format teks WhatsApp berhasil disalin ke clipboard!')
    setTimeout(() => setCopiedWhatsApp(false), 2500)
  }

  const handleOpenWhatsApp = () => {
    if (!createdTenantResult) return
    const rawPhone = createdTenantResult.tenant?.telepon || ''
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '')
    const targetPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone
    const text = encodeURIComponent(getWhatsAppMessageText(createdTenantResult))
    const url = targetPhone ? `https://wa.me/${targetPhone}?text=${text}` : `https://api.whatsapp.com/send?text=${text}`
    window.open(url, '_blank')
  }

  // Aksi Arsipkan Tenant (Soft Delete)
  const handleConfirmArchive = async () => {
    if (!tenantToArchive) return

    if (tenantToArchive.id === 'tenant_jb_enterprise') {
      showNotification('Tenant Utama Sistem dikunci dan tidak dapat diarsipkan.')
      setTenantToArchive(null)
      return
    }

    try {
      const updated = {
        ...tenantToArchive,
        status: 'ARCHIVED',
        subscription_status: 'ARCHIVED',
        is_active: false,
        updated_at: new Date().toISOString()
      }

      await supabase.from('tenants').upsert(updated)
      setTenants(prev => prev.map(t => t.id === tenantToArchive.id ? updated : t))
      showNotification(`📦 Tenant "${tenantToArchive.nama}" berhasil dipindahkan ke Arsip (Data tetap aman).`)
      setTenantToArchive(null)
      if (expandedTenantId === tenantToArchive.id) {
        setExpandedTenantId(null)
      }
    } catch (err) {
      console.error('Gagal mengarsipkan tenant:', err)
      showNotification('Gagal mengarsipkan tenant.')
    }
  }

  // Aksi Pulihkan Tenant dari Arsip
  const handleRestoreTenant = async (tenant) => {
    try {
      const updated = {
        ...tenant,
        status: 'ACTIVE',
        subscription_status: 'ACTIVE',
        is_active: true,
        updated_at: new Date().toISOString()
      }

      await supabase.from('tenants').upsert(updated)
      setTenants(prev => prev.map(t => t.id === tenant.id ? updated : t))
      showNotification(`✨ Tenant "${tenant.nama}" berhasil dipulihkan dari arsip dan aktif kembali!`)
    } catch (err) {
      console.error('Gagal memulihkan tenant:', err)
      showNotification('Gagal memulihkan tenant.')
    }
  }

  // Aksi Impersonation Mode: Masuk sebagai Tenant Ini untuk Troubleshooting
  const handleImpersonate = (tenantId) => {
    switchTenant(tenantId)
    const target = tenants.find(t => t.id === tenantId)
    showNotification(`⚡ Mengalihkan ke workspace "${target?.nama || tenantId}"...`)
    setTimeout(() => {
      navigate('/konsolidasi')
    }, 150)
  }

  // Aksi Ekspor Snapshot Database Platform
  const handleExportDatabaseSnapshot = () => {
    const backupData = {
      exported_at: new Date().toISOString(),
      platform: 'RelayPOS Solo Founder Edition',
      total_tenants: tenants.length,
      tenants: tenants,
      transactions: transactions
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute("href", dataStr)
    downloadAnchor.setAttribute("download", `relaypos_platform_backup_${Date.now()}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
    showNotification('📦 Database platform snapshot berhasil diekspor!')
  }

  return (
    <div className="space-y-6 pb-12 animate-fade-in text-slate-100">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-purple-950/95 border border-purple-500/50 text-white text-xs font-bold shadow-2xl flex items-center gap-2.5 animate-bounce">
          <Sparkles size={16} className="text-amber-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner Mission Control */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-950/80 via-slate-900 to-slate-950 p-6 rounded-3xl border border-purple-500/30 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-bold text-purple-400 tracking-wider uppercase">
            <Crown size={16} className="text-amber-300" />
            <span>Platform Owner & Creator</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide mt-1">
            Solo Founder Mission Control
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            Pusat kendali ekosistem SaaS RelayPOS. Kelola monetisasi, penerbitan lisensi, status tenant, dan telemetri global.
          </p>
        </div>

        {/* Global Founder Actions */}
        <div className="flex flex-wrap items-center gap-2.5 relative z-10">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-purple-600/25 cursor-pointer active:scale-95"
          >
            <Plus size={15} />
            <span>Terbitkan Tenant Baru</span>
          </button>

          <button
            onClick={handleExportDatabaseSnapshot}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Download full database snapshot JSON"
          >
            <Download size={14} className="text-purple-400" />
            <span className="hidden sm:inline">Backup DB</span>
          </button>

          <button
            onClick={loadPlatformData}
            disabled={isLoading}
            className="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Sinkronisasi data terbaru"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-purple-400' : ''} />
          </button>
        </div>
      </div>

      {/* Hero SaaS Metrics (4 KPI Utama Solo Founder) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Estimasi MRR Platform */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 hover:border-purple-500/40 transition-all shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Estimasi MRR Platform</span>
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-purple-300 tracking-tight">
            {formatRupiah(platformMetrics.estimatedMRR)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>ARR: {formatRupiah(platformMetrics.estimatedARR)}</span>
            <span className="text-purple-400 font-bold">Langganan</span>
          </div>
        </div>

        {/* Platform GMV (Gross Merchandise Value) */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 hover:border-emerald-500/40 transition-all shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Platform GMV (Volume)</span>
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Store size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
            {formatRupiah(platformMetrics.platformGMV)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>{platformMetrics.totalPlatformTransactions} Transaksi Sukses</span>
            <span className="text-emerald-400 font-bold">Total Nilai</span>
          </div>
        </div>

        {/* Tenant Aktif vs Total */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 hover:border-cyan-500/40 transition-all shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Klien Tenant Aktif</span>
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Users size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-cyan-400 tracking-tight">
            {platformMetrics.activeTenants} / {platformMetrics.totalTenants}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Status Sehat</span>
            <span className="font-bold text-cyan-400 font-mono">
              {platformMetrics.totalTenants > 0 
                ? ((platformMetrics.activeTenants / platformMetrics.totalTenants) * 100).toFixed(0) 
                : 0}% Berjalan
            </span>
          </div>
        </div>

        {/* Tenant Suspended / Habis Lisensi */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 hover:border-rose-500/40 transition-all shadow-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Dibekukan / Menunggak</span>
            <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Ban size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-rose-400 tracking-tight">
            {platformMetrics.suspendedTenants}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>Perlu Follow-up</span>
            <span className="text-rose-400 font-bold">Terkunci</span>
          </div>
        </div>
      </div>

      {/* Master List Tenant & Manajemen Lisensi */}
      <div className="bg-slate-900/90 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Key size={18} className="text-purple-400" />
              <span>Daftar Klien Tenant & Kontrol Lisensi ({filteredTenants.length})</span>
            </h2>
            <p className="text-xs text-slate-400">
              Gunakan tombol aksi untuk memperpanjang serial key, membekukan akun, atau impersonasi akun tenant.
            </p>
          </div>

          {/* Search Bar & Filter Plan & Status */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, ID, email..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 w-44 sm:w-56"
              />
            </div>

            {/* Filter Status Aktif vs Arsip */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-purple-500 cursor-pointer font-bold"
            >
              <option value="ACTIVE">Status: Toko Aktif</option>
              <option value="ARCHIVED">Status: Diarsipkan (Soft Delete)</option>
              <option value="ALL">Status: Semua Toko</option>
            </select>

            <select
              value={selectedPlanFilter}
              onChange={(e) => setSelectedPlanFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value="ALL">Semua Paket</option>
              <option value="ENTERPRISE">Enterprise</option>
              <option value="PRO_ANNUAL">Pro Annual</option>
              <option value="BASIC">Basic</option>
            </select>
          </div>
        </div>

        {/* Tabel Master Tenant */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                <th className="pb-3 pl-1">Nama Toko & ID</th>
                <th className="pb-3">Paket Lisensi</th>
                <th className="pb-3">Masa Berlaku</th>
                <th className="pb-3">Serial Key</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-center">Aksi Solo Founder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTenants.map((t) => {
                const isArchived = t.status === 'ARCHIVED' || t.subscription_status === 'ARCHIVED'
                const isActive = !isArchived && t.is_active !== false && t.subscription_status !== 'SUSPENDED'
                const expiresAt = t.license_expires_at ? new Date(t.license_expires_at) : null
                const isExpiringSoon = !isArchived && expiresAt && (expiresAt - new Date()) < (30 * 24 * 60 * 60 * 1000)
                const isExpanded = expandedTenantId === t.id

                // Cari data profil Owner dari tenant ini
                const ownerProfile = profiles.find(p => p.tenant_id === t.id && p.role === 'Owner') || {
                  nama: t.owner_name || `Owner ${t.nama}`,
                  email: t.owner_email || 'Belum terdaftar',
                  telepon: t.telepon || '-',
                  alamat: t.alamat || '-'
                }

                const displayOwnerName = ownerProfile.nama || t.owner_name || `Owner ${t.nama}`
                const displayOwnerEmail = ownerProfile.email || t.owner_email || '-'
                const displayPhone = t.telepon || ownerProfile.telepon || '-'
                const displayAddress = t.alamat || ownerProfile.alamat || '-'

                return (
                  <React.Fragment key={t.id}>
                    <tr 
                      onClick={() => setExpandedTenantId(isExpanded ? null : t.id)}
                      className={`hover:bg-slate-800/40 transition-colors cursor-pointer select-none ${
                        isExpanded ? 'bg-purple-950/20 border-l-2 border-purple-500' : ''
                      }`}
                    >
                      <td className="py-3 pl-1">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            className="p-1 text-slate-500 hover:text-purple-400 transition-colors"
                            title={isExpanded ? "Tutup detail pemilik" : "Buka detail pemilik"}
                          >
                            {isExpanded ? <ChevronUp size={14} className="text-purple-400" /> : <ChevronDown size={14} />}
                          </button>
                          <div className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-purple-400 font-bold shrink-0">
                            {t.nama?.substring(0, 1) || 'T'}
                          </div>
                          <div>
                            <p className="font-bold text-white flex items-center gap-1.5">
                              <span>{t.nama}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                {t.business_type || 'HYBRID'}
                              </span>
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">
                              {t.id} {t.owner_email ? `• ${t.owner_email}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30 uppercase">
                          {t.plan || 'BASIC'}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-slate-300">
                        {expiresAt ? expiresAt.toLocaleDateString('id-ID') : 'Aktif Selamanya'}
                        {isExpiringSoon && (
                          <span className="block text-[9px] text-amber-400 font-sans font-bold">
                            ⚠️ Segera Berakhir
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-[10px] text-slate-400">
                        {t.serial_key || 'RLPOS-LEGACY-DEFAULT'}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isArchived
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : (isActive 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30')
                        }`}>
                          {isArchived ? 'Diarsipkan' : (isActive ? 'Aktif' : 'Dibekukan')}
                        </span>
                      </td>
                      <td className="py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {isArchived ? (
                            /* Tombol Pulihkan dari Arsip */
                            <button
                              type="button"
                              onClick={() => handleRestoreTenant(t)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                              title="Pulihkan Toko dari Arsip"
                            >
                              <ArchiveRestore size={13} />
                              <span>Pulihkan</span>
                            </button>
                          ) : (
                            <>
                              {/* Tombol Perpanjang */}
                              <button
                                type="button"
                                onClick={() => setRenewingTenant(t)}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-purple-950 text-slate-300 hover:text-purple-300 text-[10px] font-bold border border-slate-700 transition-all cursor-pointer"
                                title="Perpanjang masa aktif lisensi"
                              >
                                Perpanjang
                              </button>

                              {/* Kill-Switch Pembekuan Akun */}
                              <button
                                type="button"
                                onClick={() => handleToggleSubscription(t)}
                                className={`p-1 rounded-lg border transition-all cursor-pointer ${
                                  isActive
                                    ? 'bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border-slate-700 hover:border-rose-500/50'
                                    : 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 hover:bg-emerald-900'
                                }`}
                                title={isActive ? 'Bekukan Tenant (Kill Switch)' : 'Buka Blokir Tenant'}
                              >
                                {isActive ? <Ban size={13} /> : <Play size={13} />}
                              </button>

                              {/* Impersonation: Masuk sebagai Tenant Ini */}
                              <button
                                type="button"
                                onClick={() => handleImpersonate(t.id)}
                                className="p-1 rounded-lg bg-slate-800 hover:bg-indigo-950 text-slate-400 hover:text-indigo-300 border border-slate-700 transition-all cursor-pointer"
                                title="Impersonasi: Masuk dan cek workspace tenant ini"
                              >
                                <ExternalLink size={13} />
                              </button>

                              {/* Tombol Arsipkan Tenant (Soft Delete) */}
                              {t.id !== 'tenant_jb_enterprise' && (
                                <button
                                  type="button"
                                  onClick={() => setTenantToArchive(t)}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-amber-950 text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/50 transition-all cursor-pointer"
                                  title="Arsipkan Toko (Soft Delete)"
                                >
                                  <Archive size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* BARIS DETAIL INFORMASI PEMILIK (ACCORDION DRAWER) */}
                    {isExpanded && (
                      <tr className="bg-slate-950/70 border-b border-purple-500/30 animate-fade-in">
                        <td colSpan={6} className="p-3.5 pl-6">
                          <div className="flex flex-wrap items-center justify-between gap-4 bg-purple-950/20 border border-purple-500/20 p-3.5 rounded-2xl">
                            <div className="flex flex-wrap items-center gap-6 text-xs">
                              {/* Nama Owner */}
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                                  <User size={14} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Nama Pemilik</span>
                                  <span className="font-bold text-white">{displayOwnerName}</span>
                                </div>
                              </div>

                              {/* Email Owner */}
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                                  <Mail size={14} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Email Login Owner</span>
                                  <span className="font-mono text-purple-300">{displayOwnerEmail}</span>
                                </div>
                              </div>

                              {/* Telepon Owner */}
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                                  <Phone size={14} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">No. WhatsApp / Telepon</span>
                                  <span className="font-mono text-slate-200">{displayPhone}</span>
                                </div>
                              </div>

                              {/* Alamat Toko */}
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                                  <MapPin size={14} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Lokasi / Alamat</span>
                                  <span className="text-slate-200">{displayAddress}</span>
                                </div>
                              </div>
                            </div>

                            {/* Tombol Kontak Cepat WhatsApp Owner */}
                            {displayPhone && displayPhone !== '-' && (
                              <a
                                href={`https://wa.me/${displayPhone.replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(`Halo ${displayOwnerName}, kami dari Tim Support RelayPOS...`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all active:scale-95"
                                title="Hubungi Owner via WhatsApp"
                              >
                                <Phone size={13} />
                                <span>Hubungi Owner</span>
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Terbitkan Tenant Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-purple-500/40 rounded-3xl p-6 shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Crown size={18} className="text-purple-400" />
                <h3 className="font-bold text-white text-base">Terbitkan Tenant Klien Baru</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewTenant} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nama Toko / Usaha *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Barbershop & Cuci Mobil Express"
                  value={createForm.storeName}
                  onChange={(e) => setCreateForm({ ...createForm, storeName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Nama Pemilik (Owner)</label>
                  <input
                    type="text"
                    placeholder="Nama Lengkap"
                    value={createForm.ownerName}
                    onChange={(e) => setCreateForm({ ...createForm, ownerName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Email Pemilik *</label>
                  <input
                    type="email"
                    required
                    placeholder="email@owner.com"
                    value={createForm.ownerEmail}
                    onChange={(e) => setCreateForm({ ...createForm, ownerEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nomor WhatsApp / Telepon Owner (Opsional)</label>
                <input
                  type="tel"
                  placeholder="Contoh: 081234567890"
                  value={createForm.telepon}
                  onChange={(e) => setCreateForm({ ...createForm, telepon: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Jenis Bisnis</label>
                  <select
                    value={createForm.businessType}
                    onChange={(e) => setCreateForm({ ...createForm, businessType: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="HYBRID">Hybrid (POS + Antrean)</option>
                    <option value="CAFE">Cafe & Resto (Meja/F&B)</option>
                    <option value="CARWASH">Carwash & Detailing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Paket Lisensi</label>
                  <select
                    value={createForm.tier}
                    onChange={(e) => setCreateForm({ ...createForm, tier: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value="PRO_ANNUAL">Pro Multi-Outlet (Tahunan)</option>
                    <option value="ENTERPRISE">Enterprise Full Support</option>
                    <option value="BASIC">Basic Single Outlet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Durasi Lisensi</label>
                  <select
                    value={createForm.licenseDurationMonths}
                    onChange={(e) => setCreateForm({ ...createForm, licenseDurationMonths: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                  >
                    <option value={12}>12 Bulan (1 Tahun)</option>
                    <option value={24}>24 Bulan (2 Tahun)</option>
                    <option value={36}>36 Bulan (3 Tahun)</option>
                    <option value={6}>6 Bulan</option>
                    <option value={1}>1 Bulan (Trial)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 text-[11px] text-purple-200">
                <p className="font-bold text-white mb-0.5">Kredensial Default Login Owner:</p>
                <p>Username / Email: <span className="font-mono text-purple-300">{createForm.ownerEmail || 'email-owner@toko.com'}</span></p>
                <p>Password Default: <span className="font-mono text-purple-300 font-bold">password123</span> (dapat diganti oleh Owner setelah login)</p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSubmittingTenant}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTenant}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold cursor-pointer shadow-lg flex items-center gap-1.5"
                >
                  {isSubmittingTenant ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Menerbitkan...</span>
                    </>
                  ) : (
                    <span>Terbitkan & Aktivasi</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Kredensial Tenant Baru (WhatsApp Ready & Salin Kredensial) */}
      {createdTenantResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Kredensial Tenant Siap Dikirim!</h3>
                  <p className="text-xs text-slate-400">Akun Owner aktif dan siap diserahkan via WhatsApp</p>
                </div>
              </div>
              <button
                onClick={() => setCreatedTenantResult(null)}
                className="text-slate-400 hover:text-white cursor-pointer p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Ringkasan Akun */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Toko / Outlet</span>
                  <span className="text-white font-bold">{createdTenantResult.tenant?.nama}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Nama Owner</span>
                  <span className="text-white font-semibold">{createdTenantResult.tenant?.owner_name || '-'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Email Login</span>
                  <span className="text-emerald-400 font-mono font-semibold">{createdTenantResult.ownerProfile?.email}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                  <span className="text-slate-400">Password Default</span>
                  <span className="text-purple-300 font-mono font-bold bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/30">
                    {createdTenantResult.plainPassword}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Lisensi & Kuota</span>
                  <span className="text-amber-400 font-medium">
                    {createdTenantResult.license?.tier_name || createdTenantResult.license?.tier} ({createdTenantResult.license?.max_branches || 1} Cabang)
                  </span>
                </div>
              </div>

              {/* Preview Format Pesan WhatsApp */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-emerald-400" />
                    Format Pesan WhatsApp untuk Owner:
                  </label>
                  <span className="text-[10px] text-slate-500">Siap dikirimkan langsung</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed select-all">
                  {getWhatsAppMessageText(createdTenantResult)}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={handleCopyWhatsAppText}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition cursor-pointer text-xs ${
                    copiedWhatsApp
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  {copiedWhatsApp ? (
                    <>
                      <Check size={15} />
                      Tersalin ke Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy size={15} />
                      Salin Format WhatsApp
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40 text-xs"
                >
                  <MessageSquare size={15} />
                  Kirim via WhatsApp
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCreatedTenantResult(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer text-xs"
                >
                  Selesai & Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Perpanjang Lisensi */}
      {renewingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="w-full max-w-sm bg-slate-900 border border-purple-500/40 rounded-3xl p-6 shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-amber-400" />
                <h3 className="font-bold text-white text-base">Perpanjang Lisensi</h3>
              </div>
              <button
                onClick={() => setRenewingTenant(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3">
              Perpanjang masa aktif untuk tenant: <strong className="text-white">{renewingTenant.nama}</strong>
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Pilih Durasi Tambahan:</label>
              <select
                value={renewalMonths}
                onChange={(e) => setRenewalMonths(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value={12}>+12 Bulan (1 Tahun)</option>
                <option value={24}>+24 Bulan (2 Tahun)</option>
                <option value={6}>+6 Bulan</option>
                <option value={3}>+3 Bulan</option>
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenewingTenant(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRenewal}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs cursor-pointer shadow-lg"
              >
                Konfirmasi Perpanjang
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Konfirmasi Arsipkan Tenant (Soft Delete) */}
      {tenantToArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <Archive size={18} />
                </div>
                <h3 className="font-bold text-white text-base">Arsipkan Tenant Toko</h3>
              </div>
              <button
                onClick={() => setTenantToArchive(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 mb-5 text-xs text-slate-300">
              <p>
                Apakah Anda ingin mengarsipkan toko <strong className="text-white font-bold">{tenantToArchive.nama}</strong> ({tenantToArchive.id})?
              </p>
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-300 space-y-1 text-[11px]">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span>Data Tetap Aman (Bukan Dihapus)</span>
                </p>
                <p>
                  Toko akan dinonaktifkan dan disembunyikan dari daftar aktif. Seluruh data transaksi, keuangan, stok, dan akun staf <strong>tetap tersimpan utuh</strong> dan dapat dipulihkan kembali kapan saja klien memperpanjang langganan.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setTenantToArchive(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmArchive}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black cursor-pointer shadow-lg shadow-amber-600/30"
              >
                Arsipkan Toko
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
