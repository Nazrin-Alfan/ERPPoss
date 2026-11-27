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
  deleteTenantCompletely,
  generateSecureInitialPassword
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
  Star,
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

  // Daftar masukan pengguna beta
  const [feedbackList, setFeedbackList] = useState([])

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
      try {
        const { data: allFeedback } = await supabase
          .from('beta_feedback')
          .select('*')
          .order('created_at', { ascending: false })
        setFeedbackList(allFeedback || [])
      } catch {
        setFeedbackList([])
      }

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
    const isCurrentlyActive = String(tenant.status || '').toUpperCase() !== 'SUSPENDED' && tenant.is_active !== false && tenant.subscription_status !== 'SUSPENDED'
    const updated = toggleTenantSubscriptionStatus(tenant, !isCurrentlyActive)

    try {
      const nextStatus = !isCurrentlyActive ? 'active' : 'suspended'
      const { error: tErr } = await supabase
        .from('tenants')
        .update({
          status: nextStatus,
          updated_at: updated.updated_at
        })
        .eq('id', tenant.id)
      if (tErr) throw tErr

      const { error: lErr } = await supabase
        .from('tenant_licenses')
        .update({
          status: !isCurrentlyActive ? 'ACTIVE' : 'SUSPENDED',
          updated_at: updated.updated_at
        })
        .eq('tenant_id', tenant.id)
      if (lErr) console.warn('Warning updating tenant_licenses status:', lErr)

      setTenants(prev => prev.map(t => t.id === tenant.id ? { ...updated, status: nextStatus } : t))
      showNotification(
        !isCurrentlyActive 
          ? `✅ Tenant "${tenant.nama}" berhasil diaktifkan kembali.` 
          : `⚠️ Tenant "${tenant.nama}" telah dibekukan (Kill-Switch Aktif).`
      )
    } catch (err) {
      console.error('Gagal memperbarui status tenant:', err)
      showNotification('Gagal memperbarui status tenant: ' + (err.message || ''))
    }
  }

  // Aksi Perpanjangan Lisensi
  const handleConfirmRenewal = async () => {
    if (!renewingTenant) return
    const updated = generateLicenseRenewalPayload(renewingTenant, renewalMonths)

    try {
      const { error: tErr } = await supabase
        .from('tenants')
        .update({
          status: 'active',
          updated_at: updated.updated_at
        })
        .eq('id', renewingTenant.id)
      if (tErr) throw tErr

      const { error: lErr } = await supabase
        .from('tenant_licenses')
        .update({
          status: 'ACTIVE',
          license_key: updated.serial_key,
          valid_until: updated.license_expires_at,
          expires_at: updated.license_expires_at,
          updated_at: updated.updated_at
        })
        .eq('tenant_id', renewingTenant.id)
      if (lErr) throw lErr

      setTenants(prev => prev.map(t => t.id === renewingTenant.id ? { ...updated, status: 'active' } : t))
      showNotification(`🎉 Lisensi "${renewingTenant.nama}" berhasil diperpanjang +${renewalMonths} bulan!`)
      setRenewingTenant(null)
    } catch (err) {
      console.error('Gagal memperpanjang lisensi:', err)
      showNotification('Gagal memperpanjang lisensi: ' + (err.message || ''))
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
      const initialPassword = generateSecureInitialPassword()

      // Coba panggil RPC PostgreSQL atomic Supabase Cloud
      if (typeof supabase.rpc === 'function') {
        const rpcResult = await supabase.rpc('fn_founder_create_tenant', {
          p_store_name: createForm.storeName.trim(),
          p_owner_name: createForm.ownerName.trim() || `Owner ${createForm.storeName.trim()}`,
          p_owner_email: createForm.ownerEmail.trim(),
          p_owner_password: initialPassword,
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
          owner_password: initialPassword,
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
        plainPassword: res.owner_password || initialPassword,
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

      const { error: tErr } = await supabase
        .from('tenants')
        .update({
          status: 'archived',
          updated_at: updated.updated_at
        })
        .eq('id', tenantToArchive.id)
      if (tErr) throw tErr
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

      const { error: tErr } = await supabase
        .from('tenants')
        .update({
          status: 'active',
          updated_at: updated.updated_at
        })
        .eq('id', tenant.id)
      if (tErr) throw tErr
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
    <div className="space-y-6 pb-12 animate-fade-in text-foreground">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-primary-soft border border-primary/30 text-foreground text-xs font-bold shadow-2xl flex items-center gap-2.5 animate-bounce">
          <Sparkles size={16} className="text-warning" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner Mission Control */}
      <div className="bg-primary flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl border border-primary/30 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-bold text-primary tracking-wider uppercase">
            <Crown size={16} className="text-warning" />
            <span>Platform Owner & Creator</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-wide mt-1">
            Solo Founder Mission Control
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1 max-w-xl">
            Pusat kendali ekosistem SaaS RelayPOS. Kelola monetisasi, penerbitan lisensi, status tenant, dan telemetri global.
          </p>
        </div>

        {/* Global Founder Actions */}
        <div className="flex flex-wrap items-center gap-2.5 relative z-10">
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-primary px-4 py-2.5 rounded-2xl text-primary-foreground font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-sm cursor-pointer active:scale-95"
          >
            <Plus size={15} />
            <span>Terbitkan Tenant Baru</span>
          </button>

          <button
            onClick={handleExportDatabaseSnapshot}
            className="p-2.5 rounded-2xl bg-surface border border-border hover:border-border-active text-muted hover:text-foreground transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Download full database snapshot JSON"
          >
            <Download size={14} className="text-primary" />
            <span className="hidden sm:inline">Backup DB</span>
          </button>

          <button
            onClick={loadPlatformData}
            disabled={isLoading}
            className="p-2.5 rounded-2xl bg-surface border border-border hover:border-border-hover text-muted hover:text-foreground transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Sinkronisasi data terbaru"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-primary' : ''} />
          </button>
        </div>
      </div>

      {/* Hero SaaS Metrics (4 KPI Utama Solo Founder) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Estimasi MRR Platform */}
        <div className="bg-surface p-5 rounded-3xl border border-border hover:border-border-active transition-all shadow-xl">
          <div className="flex items-center justify-between text-muted text-xs font-bold uppercase tracking-wider mb-2">
            <span>Estimasi MRR Platform</span>
            <div className="p-2.5 rounded-2xl bg-primary-soft text-primary-soft-foreground border border-primary/30">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-primary tracking-tight">
            {formatRupiah(platformMetrics.estimatedMRR)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>ARR: {formatRupiah(platformMetrics.estimatedARR)}</span>
            <span className="text-primary font-bold">Langganan</span>
          </div>
        </div>

        {/* Platform GMV (Gross Merchandise Value) */}
        <div className="bg-surface p-5 rounded-3xl border border-border hover:border-border-active transition-all shadow-xl">
          <div className="flex items-center justify-between text-muted text-xs font-bold uppercase tracking-wider mb-2">
            <span>Platform GMV (Volume)</span>
            <div className="p-2.5 rounded-2xl bg-success-bg text-success border border-success/30">
              <Store size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-success tracking-tight">
            {formatRupiah(platformMetrics.platformGMV)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>{platformMetrics.totalPlatformTransactions} Transaksi Sukses</span>
            <span className="text-success font-bold">Total Nilai</span>
          </div>
        </div>

        {/* Tenant Aktif vs Total */}
        <div className="bg-surface p-5 rounded-3xl border border-border hover:border-border-active transition-all shadow-xl">
          <div className="flex items-center justify-between text-muted text-xs font-bold uppercase tracking-wider mb-2">
            <span>Klien Tenant Aktif</span>
            <div className="p-2.5 rounded-2xl bg-primary-soft text-primary-soft-foreground border border-primary/30">
              <Users size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-primary tracking-tight">
            {platformMetrics.activeTenants} / {platformMetrics.totalTenants}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="text-muted">Status Sehat</span>
            <span className="font-bold text-primary font-mono">
              {platformMetrics.totalTenants > 0 
                ? ((platformMetrics.activeTenants / platformMetrics.totalTenants) * 100).toFixed(0) 
                : 0}% Berjalan
            </span>
          </div>
        </div>

        {/* Tenant Suspended / Habis Lisensi */}
        <div className="bg-surface p-5 rounded-3xl border border-border hover:border-destructive/50 transition-all shadow-xl">
          <div className="flex items-center justify-between text-muted text-xs font-bold uppercase tracking-wider mb-2">
            <span>Dibekukan / Menunggak</span>
            <div className="p-2.5 rounded-2xl bg-destructive-bg text-destructive border border-destructive/30">
              <Ban size={16} />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-destructive tracking-tight">
            {platformMetrics.suspendedTenants}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>Perlu Follow-up</span>
            <span className="text-destructive font-bold">Terkunci</span>
          </div>
        </div>
      </div>

      {/* Master List Tenant & Manajemen Lisensi */}
      <div className="bg-surface p-6 rounded-3xl border border-border shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Key size={18} className="text-primary" />
              <span>Daftar Klien Tenant & Kontrol Lisensi ({filteredTenants.length})</span>
            </h2>
            <p className="text-xs text-muted">
              Gunakan tombol aksi untuk memperpanjang serial key, membekukan akun, atau impersonasi akun tenant.
            </p>
          </div>

          {/* Search Bar & Filter Plan & Status */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-dark" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, ID, email..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-surface border border-border text-xs text-foreground focus:outline-none focus:border-ring w-44 sm:w-56"
              />
            </div>

            {/* Filter Status Aktif vs Arsip */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-surface border border-border text-xs text-muted focus:outline-none focus:border-ring cursor-pointer font-bold"
            >
              <option value="ACTIVE">Status: Toko Aktif</option>
              <option value="ARCHIVED">Status: Diarsipkan (Soft Delete)</option>
              <option value="ALL">Status: Semua Toko</option>
            </select>

            <select
              value={selectedPlanFilter}
              onChange={(e) => setSelectedPlanFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-surface border border-border text-xs text-muted focus:outline-none focus:border-ring cursor-pointer"
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
              <tr className="border-b border-border text-muted text-[11px] font-bold uppercase tracking-wider">
                <th className="pb-3 pl-1">Nama Toko & ID</th>
                <th className="pb-3">Paket Lisensi</th>
                <th className="pb-3">Masa Berlaku</th>
                <th className="pb-3">Serial Key</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-center">Aksi Solo Founder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTenants.map((t) => {
                const isArchived = String(t.status || '').toUpperCase() === 'ARCHIVED' || t.subscription_status === 'ARCHIVED'
                const isActive = !isArchived && String(t.status || '').toUpperCase() !== 'SUSPENDED' && t.is_active !== false && t.subscription_status !== 'SUSPENDED'
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
                      className={`hover:bg-surface-hover transition-colors cursor-pointer select-none ${
                        isExpanded ? 'bg-primary-soft border-l-2 border-primary/30' : ''
                      }`}
                    >
                      <td className="py-3 pl-1">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            className="p-1 text-muted-dark hover:text-primary transition-colors"
                            title={isExpanded ? "Tutup detail pemilik" : "Buka detail pemilik"}
                          >
                            {isExpanded ? <ChevronUp size={14} className="text-primary" /> : <ChevronDown size={14} />}
                          </button>
                          <div className="w-8 h-8 rounded-xl bg-surface border border-border flex items-center justify-center text-primary font-bold shrink-0">
                            {t.nama?.substring(0, 1) || 'T'}
                          </div>
                          <div>
                            <p className="font-bold text-foreground flex items-center gap-1.5">
                              <span>{t.nama}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-subsurface text-muted font-mono">
                                {t.business_type || 'HYBRID'}
                              </span>
                            </p>
                            <p className="text-[10px] text-muted-dark font-mono truncate max-w-[180px]">
                              {t.id} {t.owner_email ? `• ${t.owner_email}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-soft text-primary-soft-foreground border border-primary/30 uppercase">
                          {t.plan || 'BASIC'}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-muted">
                        {expiresAt ? expiresAt.toLocaleDateString('id-ID') : 'Aktif Selamanya'}
                        {isExpiringSoon && (
                          <span className="block text-[9px] text-warning font-sans font-bold">
                            ⚠️ Segera Berakhir
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-[10px] text-muted">
                        {t.serial_key || 'RLPOS-LEGACY-DEFAULT'}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isArchived
                            ? 'bg-warning-bg text-warning border-warning/30'
                            : (isActive 
                                ? 'bg-success-bg text-success border-success/30' 
                                : 'bg-destructive-bg text-destructive border-destructive/30')
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
                              className="px-2.5 py-1 rounded-lg bg-success-bg hover:bg-emerald-900 text-success border border-success/30 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
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
                                className="px-2 py-1 rounded-lg bg-subsurface hover:bg-primary-soft text-muted hover:text-primary text-[10px] font-bold border border-border transition-all cursor-pointer"
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
                                    ? 'bg-subsurface hover:bg-rose-950 text-muted hover:text-destructive border-border hover:border-destructive/50'
                                    : 'bg-success-bg text-success border-success/30 hover:bg-emerald-900'
                                }`}
                                title={isActive ? 'Bekukan Tenant (Kill Switch)' : 'Buka Blokir Tenant'}
                              >
                                {isActive ? <Ban size={13} /> : <Play size={13} />}
                              </button>

                              {/* Impersonation: Masuk sebagai Tenant Ini */}
                              <button
                                type="button"
                                onClick={() => handleImpersonate(t.id)}
                                className="p-1 rounded-lg bg-subsurface hover:bg-primary-soft text-muted hover:text-primary border border-border transition-all cursor-pointer"
                                title="Impersonasi: Masuk dan cek workspace tenant ini"
                              >
                                <ExternalLink size={13} />
                              </button>

                              {/* Tombol Arsipkan Tenant (Soft Delete) */}
                              {t.id !== 'tenant_jb_enterprise' && (
                                <button
                                  type="button"
                                  onClick={() => setTenantToArchive(t)}
                                  className="p-1 rounded-lg bg-subsurface hover:bg-amber-950 text-muted hover:text-warning border border-border hover:border-warning/50 transition-all cursor-pointer"
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
                      <tr className="bg-subsurface border-b border-primary/30 animate-fade-in">
                        <td colSpan={6} className="p-3.5 pl-6">
                          <div className="flex flex-wrap items-center justify-between gap-4 bg-primary-soft border border-primary/30 p-3.5 rounded-2xl">
                            <div className="flex flex-wrap items-center gap-6 text-xs">
                              {/* Nama Owner */}
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-primary-soft text-primary-soft-foreground">
                                  <User size={14} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted uppercase font-semibold block">Nama Pemilik</span>
                                  <span className="font-bold text-foreground">{displayOwnerName}</span>
                                </div>
                              </div>

                              {/* Email Owner */}
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-primary-soft text-primary-soft-foreground">
                                  <Mail size={14} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted uppercase font-semibold block">Email Login Owner</span>
                                  <span className="font-mono text-primary">{displayOwnerEmail}</span>
                                </div>
                              </div>

                              {/* Telepon Owner */}
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-primary-soft text-primary-soft-foreground">
                                  <Phone size={14} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted uppercase font-semibold block">No. WhatsApp / Telepon</span>
                                  <span className="font-mono text-foreground">{displayPhone}</span>
                                </div>
                              </div>

                              {/* Alamat Toko */}
                              <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-primary-soft text-primary-soft-foreground">
                                  <MapPin size={14} />
                                </div>
                                <div>
                                  <span className="text-[10px] text-muted uppercase font-semibold block">Lokasi / Alamat</span>
                                  <span className="text-foreground">{displayAddress}</span>
                                </div>
                              </div>
                            </div>

                            {/* Tombol Kontak Cepat WhatsApp Owner */}
                            {displayPhone && displayPhone !== '-' && (
                              <a
                                href={`https://wa.me/${displayPhone.replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(`Halo ${displayOwnerName}, kami dari Tim Support RelayPOS...`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-[11px] flex items-center gap-1.5 shadow-md shadow-sm transition-all active:scale-95"
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

      {/* Panel Masukan Beta Pengguna */}
      <div className="bg-surface border border-border rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-warning" />
            <div>
              <h2 className="text-base font-bold text-foreground">Masukan Pengguna Beta ({feedbackList.length})</h2>
              <p className="text-xs text-muted">Laporan bug, saran fitur, dan rating bintang dari pengguna.</p>
            </div>
          </div>
        </div>

        {feedbackList.length === 0 ? (
          <p className="text-xs text-muted-dark py-4 text-center">Belum ada masukan beta yang masuk.</p>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {feedbackList.map((fb) => (
              <div key={fb.id} className="p-3.5 rounded-2xl bg-subsurface border border-border flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-primary-soft text-primary-soft-foreground font-bold text-[10px] uppercase">{fb.category || 'FEATURE'}</span>
                    {fb.rating > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-warning font-bold text-[11px]">
                        <Star size={12} className="fill-amber-400" />
                        {fb.rating}/5
                      </span>
                    )}
                    <span className="font-semibold text-foreground">{fb.user_name || 'Pengguna'}</span>
                    <span className="text-muted-dark">({fb.user_role || 'Owner'})</span>
                    {fb.page_path && <span className="text-muted-dark font-mono text-[10px]">{fb.page_path}</span>}
                  </div>
                  <p className="text-foreground whitespace-pre-wrap break-words">{fb.message}</p>
                </div>
                <select
                  value={fb.status || 'OPEN'}
                  onChange={async (e) => {
                    const nextStatus = e.target.value
                    const { error } = await supabase.from('beta_feedback').update({ status: nextStatus }).eq('id', fb.id)
                    if (!error) {
                      setFeedbackList((prev) => prev.map((row) => (row.id === fb.id ? { ...row, status: nextStatus } : row)))
                      showNotification(`Status masukan diubah ke ${nextStatus}`)
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-surface border border-border text-[11px] font-semibold text-foreground shrink-0 cursor-pointer"
                >
                  <option value="OPEN">OPEN</option>
                  <option value="IN_REVIEW">IN_REVIEW</option>
                  <option value="RESOLVED">RESOLVED</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Terbitkan Tenant Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="w-full max-w-lg bg-surface border border-primary/30 rounded-3xl p-6 shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <Crown size={18} className="text-primary" />
                <h3 className="font-bold text-foreground text-base">Terbitkan Tenant Klien Baru</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted hover:text-foreground cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateNewTenant} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-muted font-semibold mb-1">Nama Toko / Usaha *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Barbershop & Cuci Mobil Express"
                  value={createForm.storeName}
                  onChange={(e) => setCreateForm({ ...createForm, storeName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-foreground focus:outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted font-semibold mb-1">Nama Pemilik (Owner)</label>
                  <input
                    type="text"
                    placeholder="Nama Lengkap"
                    value={createForm.ownerName}
                    onChange={(e) => setCreateForm({ ...createForm, ownerName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-foreground focus:outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Email Pemilik *</label>
                  <input
                    type="email"
                    required
                    placeholder="email@owner.com"
                    value={createForm.ownerEmail}
                    onChange={(e) => setCreateForm({ ...createForm, ownerEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-foreground focus:outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted font-semibold mb-1">Nomor WhatsApp / Telepon Owner (Opsional)</label>
                <input
                  type="tel"
                  placeholder="Contoh: 081234567890"
                  value={createForm.telepon}
                  onChange={(e) => setCreateForm({ ...createForm, telepon: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-foreground focus:outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-muted font-semibold mb-1">Jenis Bisnis</label>
                  <select
                    value={createForm.businessType}
                    onChange={(e) => setCreateForm({ ...createForm, businessType: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-foreground focus:outline-none focus:border-ring cursor-pointer"
                  >
                    <option value="HYBRID">Hybrid (POS + Antrean)</option>
                    <option value="CAFE">Cafe & Resto (Meja/F&B)</option>
                    <option value="CARWASH">Carwash & Detailing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Paket Lisensi</label>
                  <select
                    value={createForm.tier}
                    onChange={(e) => setCreateForm({ ...createForm, tier: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-foreground focus:outline-none focus:border-ring cursor-pointer"
                  >
                    <option value="PRO_ANNUAL">Pro Multi-Outlet (Tahunan)</option>
                    <option value="ENTERPRISE">Enterprise Full Support</option>
                    <option value="BASIC">Basic Single Outlet</option>
                  </select>
                </div>
                <div>
                  <label className="block text-muted font-semibold mb-1">Durasi Lisensi</label>
                  <select
                    value={createForm.licenseDurationMonths}
                    onChange={(e) => setCreateForm({ ...createForm, licenseDurationMonths: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-foreground focus:outline-none focus:border-ring cursor-pointer"
                  >
                    <option value={12}>12 Bulan (1 Tahun)</option>
                    <option value={24}>24 Bulan (2 Tahun)</option>
                    <option value={36}>36 Bulan (3 Tahun)</option>
                    <option value={6}>6 Bulan</option>
                    <option value={1}>1 Bulan (Trial)</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-primary-soft border border-primary/30 text-[11px] text-primary-soft-foreground">
                <p className="font-bold text-foreground mb-0.5">Kredensial Awal Login Owner:</p>
                <p>Username / Email: <span className="font-mono text-primary">{createForm.ownerEmail || 'email-owner@toko.com'}</span></p>
                <p>Password Awal: <span className="font-mono text-primary font-bold">Di-generate acak otomatis setelah diterbitkan</span> (wajib diganti Owner setelah login)</p>
              </div>

              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSubmittingTenant}
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-subsurface text-muted font-bold hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTenant}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-bold cursor-pointer shadow-lg flex items-center gap-1.5"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--overlay-backdrop)] backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="w-full max-w-lg bg-surface border border-success/30 rounded-3xl p-6 shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-success-bg text-success border border-success/30">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-base">Kredensial Tenant Siap Dikirim!</h3>
                  <p className="text-xs text-muted">Akun Owner aktif dan siap diserahkan via WhatsApp</p>
                </div>
              </div>
              <button
                onClick={() => setCreatedTenantResult(null)}
                className="text-muted hover:text-foreground cursor-pointer p-1 rounded-lg hover:bg-surface-hover"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Ringkasan Akun */}
              <div className="p-3.5 rounded-2xl bg-surface border border-border space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-muted">Toko / Outlet</span>
                  <span className="text-foreground font-bold">{createdTenantResult.tenant?.nama}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-muted">Nama Owner</span>
                  <span className="text-foreground font-semibold">{createdTenantResult.tenant?.owner_name || '-'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-muted">Email Login</span>
                  <span className="text-success font-mono font-semibold">{createdTenantResult.ownerProfile?.email}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-border">
                  <span className="text-muted">Password Default</span>
                  <span className="text-primary-soft-foreground font-mono font-bold bg-primary-soft px-2 py-0.5 rounded border border-primary/30">
                    {createdTenantResult.plainPassword}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Lisensi & Kuota</span>
                  <span className="text-warning font-medium">
                    {createdTenantResult.license?.tier_name || createdTenantResult.license?.tier} ({createdTenantResult.license?.max_branches || 1} Cabang)
                  </span>
                </div>
              </div>

              {/* Preview Format Pesan WhatsApp */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-muted font-semibold flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-success" />
                    Format Pesan WhatsApp untuk Owner:
                  </label>
                  <span className="text-[10px] text-muted-dark">Siap dikirimkan langsung</span>
                </div>
                <div className="p-3 bg-surface border border-border rounded-xl max-h-48 overflow-y-auto font-mono text-[11px] text-muted whitespace-pre-wrap leading-relaxed select-all">
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
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-subsurface hover:bg-surface-hover text-foreground border border-border'
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
                  className="flex-1 py-2.5 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-sm text-xs"
                >
                  <MessageSquare size={15} />
                  Kirim via WhatsApp
                </button>
              </div>

              <div className="pt-2 border-t border-border flex justify-end">
                <button
                  type="button"
                  onClick={() => setCreatedTenantResult(null)}
                  className="px-4 py-1.5 rounded-xl bg-subsurface hover:bg-surface-hover text-muted hover:text-foreground cursor-pointer text-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="w-full max-w-sm bg-surface border border-primary/30 rounded-3xl p-6 shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-warning" />
                <h3 className="font-bold text-foreground text-base">Perpanjang Lisensi</h3>
              </div>
              <button
                onClick={() => setRenewingTenant(null)}
                className="text-muted hover:text-foreground cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-muted mb-3">
              Perpanjang masa aktif untuk tenant: <strong className="text-foreground">{renewingTenant.nama}</strong>
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-muted mb-1">Pilih Durasi Tambahan:</label>
              <select
                value={renewalMonths}
                onChange={(e) => setRenewalMonths(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-foreground focus:outline-none focus:border-ring cursor-pointer"
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
                className="px-4 py-2 rounded-xl bg-subsurface text-muted font-bold text-xs hover:bg-surface-hover cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRenewal}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs cursor-pointer shadow-lg"
              >
                Konfirmasi Perpanjang
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Konfirmasi Arsipkan Tenant (Soft Delete) */}
      {tenantToArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="w-full max-w-sm bg-surface border border-warning/30 rounded-3xl p-6 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-warning-bg text-warning">
                  <Archive size={18} />
                </div>
                <h3 className="font-bold text-foreground text-base">Arsipkan Tenant Toko</h3>
              </div>
              <button
                onClick={() => setTenantToArchive(null)}
                className="text-muted hover:text-foreground cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 mb-5 text-xs text-muted">
              <p>
                Apakah Anda ingin mengarsipkan toko <strong className="text-foreground font-bold">{tenantToArchive.nama}</strong> ({tenantToArchive.id})?
              </p>
              <div className="p-3 rounded-xl bg-warning-bg border border-warning/30 text-warning space-y-1 text-[11px]">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-success" />
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
                className="px-4 py-2 rounded-xl bg-subsurface text-muted font-bold hover:bg-surface-hover cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmArchive}
                className="px-5 py-2 rounded-xl bg-warning hover:opacity-90 text-ink-foreground font-black cursor-pointer shadow-lg shadow-sm"
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
