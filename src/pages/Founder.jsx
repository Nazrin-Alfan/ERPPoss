import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import {
  calculateFounderPlatformMetrics,
  toggleTenantSubscriptionStatus,
  generateLicenseRenewalPayload
} from '../services/founderService'
import { createCleanTenantPayload } from '../utils/superAdminHelpers'
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
  Download
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Founder() {
  const { profile, switchTenant } = useAuth()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [tenants, setTenants] = useState([])
  const [transactions, setTransactions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPlanFilter, setSelectedPlanFilter] = useState('ALL')
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // Modal State: Buat Tenant Baru
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({
    storeName: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
    telepon: '',
    alamat: '',
    tier: 'PRO_ANNUAL',
    licenseDurationMonths: 12
  })

  // Modal State: Perpanjang Lisensi
  const [renewingTenant, setRenewingTenant] = useState(null)
  const [renewalMonths, setRenewalMonths] = useState(12)

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
      const { data: allTenants } = await supabase.from('tenants').select('*')
      const { data: allTx } = await supabase.from('transaksi').select('*')

      setTenants(allTenants || [])
      setTransactions(allTx || [])
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
      return matchSearch && matchPlan
    })
  }, [tenants, searchQuery, selectedPlanFilter])

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

    try {
      const payload = createCleanTenantPayload(createForm)
      await supabase.from('tenants').insert([payload.tenant])
      if (payload.branch) {
        await supabase.from('branches').insert([payload.branch])
      }
      setTenants(prev => [payload.tenant, ...prev])
      showNotification(`✨ Tenant baru "${payload.tenant.nama}" berhasil diterbitkan!`)
      setShowCreateModal(false)
      setCreateForm({
        storeName: '',
        slug: '',
        ownerName: '',
        ownerEmail: '',
        telepon: '',
        alamat: '',
        tier: 'PRO_ANNUAL',
        licenseDurationMonths: 12
      })
    } catch (err) {
      showNotification('Gagal membuat tenant baru.')
    }
  }

  // Aksi Impersonation Mode: Masuk sebagai Tenant Ini untuk Troubleshooting
  const handleImpersonate = (tenantId) => {
    switchTenant(tenantId)
    showNotification(`Masuk ke workspace tenant ${tenantId}...`)
    navigate('/dashboard')
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

          {/* Search Bar & Filter Plan */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, ID, email..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 w-48 sm:w-60"
              />
            </div>
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
                const isActive = t.is_active !== false && t.subscription_status !== 'SUSPENDED'
                const expiresAt = t.license_expires_at ? new Date(t.license_expires_at) : null
                const isExpiringSoon = expiresAt && (expiresAt - new Date()) < (30 * 24 * 60 * 60 * 1000)

                return (
                  <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pl-1">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-purple-400 font-bold shrink-0">
                          {t.nama?.substring(0, 1) || 'T'}
                        </div>
                        <div>
                          <p className="font-bold text-white">{t.nama}</p>
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
                        isActive 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {isActive ? 'Aktif' : 'Dibekukan'}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
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
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Terbitkan Tenant Baru */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-purple-500/40 rounded-3xl p-6 shadow-2xl relative">
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

              <div className="grid grid-cols-2 gap-3">
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

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer shadow-lg"
                >
                  Terbitkan & Aktivasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Perpanjang Lisensi */}
      {renewingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-purple-500/40 rounded-3xl p-6 shadow-2xl relative">
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
    </div>
  )
}
