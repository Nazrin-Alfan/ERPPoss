import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import {
  ShieldAlert,
  Building,
  Plus,
  Key,
  Calendar,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Search,
  Send,
  Trash2,
  RotateCcw,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  Users,
  Store,
  DollarSign
} from 'lucide-react'
import {
  generateSerialLicenseKey,
  createCleanTenantPayload,
  purgeTransactionsForTenant,
  deleteTenantCompletely
} from '../utils/superAdminHelpers'
import { evaluateLicenseStatus } from '../utils/licenseHelpers'
import { DEVELOPER_CONFIG } from '../constants/erpConfig'

const SuperAdmin = () => {
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState([])
  const [licenses, setLicenses] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [selectedTenantForKey, setSelectedTenantForKey] = useState(null)
  const [generatedKeyResult, setGeneratedKeyResult] = useState(null)
  const [tenantToDelete, setTenantToDelete] = useState(null)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [tenantToPurge, setTenantToPurge] = useState(null)
  const [purgeConfirmInput, setPurgeConfirmInput] = useState('')

  // Form State New Tenant
  const [tenantForm, setTenantForm] = useState({
    storeName: '',
    ownerName: '',
    ownerEmail: '',
    telepon: '',
    alamat: '',
    tier: 'PRO_ANNUAL',
    durationMonths: 12
  })

  // Copied State
  const [copiedKey, setCopiedKey] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: tData } = await supabase.from('tenants').select('*')
      const { data: lData } = await supabase.from('tenant_licenses').select('*')

      setTenants(tData || [])
      setLicenses(lData || [])
    } catch (err) {
      console.error('Super Admin load data error:', err)
      setError(err.message || 'Gagal memuat data konsol Super Admin.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // KPI Metrics
  const metrics = useMemo(() => {
    const totalTenants = tenants.length
    let activeLicenses = 0
    let graceOrExpired = 0

    licenses.forEach(lic => {
      const evalStatus = evaluateLicenseStatus(lic)
      if (evalStatus.status === 'ACTIVE') activeLicenses++
      else graceOrExpired++
    })

    const estimatedAnnualMRR = licenses.reduce((sum, lic) => {
      return sum + (lic.tier === 'PRO_ANNUAL' ? DEVELOPER_CONFIG.standardAnnualPrice : 2400000)
    }, 0)

    return {
      totalTenants,
      activeLicenses,
      graceOrExpired,
      estimatedAnnualMRR
    }
  }, [tenants, licenses])

  // Filtered Tenants List
  const filteredTenants = useMemo(() => {
    return tenants.filter(t =>
      (t.nama || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.id || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [tenants, searchQuery])

  // Submit Handler: Tambah Tenant Baru Bersih
  const handleCreateTenant = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!tenantForm.storeName.trim() || !tenantForm.ownerEmail.trim()) {
      setError('Nama Toko dan Email Owner wajib diisi.')
      return
    }

    try {
      setLoading(true)
      const payload = createCleanTenantPayload(tenantForm)

      // 1. Simpan Tenant
      const { error: tErr } = await supabase.from('tenants').insert(payload.tenant)
      if (tErr) throw tErr

      // 2. Simpan Cabang Utama
      await supabase.from('branches').insert(payload.branch)

      // 3. Simpan Profil Owner
      await supabase.from('profiles').insert(payload.ownerProfile)

      // 4. Simpan Lisensi Awal
      await supabase.from('tenant_licenses').insert(payload.license)

      // 5. Simpan Akun Likuiditas Awal
      for (const bal of payload.initialBalances) {
        await supabase.from('pos_balances').insert(bal)
      }

      // 6. Simpan Paket Cuci Master Awal
      for (const pkg of payload.initialPackages) {
        await supabase.from('carwash_packages').insert(pkg)
      }

      setGeneratedKeyResult({
        storeName: payload.tenant.nama,
        tenantId: payload.tenant.id,
        ownerEmail: payload.ownerProfile.email,
        licenseKey: payload.license.license_key,
        expiresAt: payload.license.expires_at,
        telepon: tenantForm.telepon
      })

      setShowAddModal(false)
      setTenantForm({
        storeName: '',
        ownerName: '',
        ownerEmail: '',
        telepon: '',
        alamat: '',
        tier: 'PRO_ANNUAL',
        durationMonths: 12
      })

      setSuccess(`Tenant "${payload.tenant.nama}" berhasil dibuat dengan status bersih!`)
      await loadData()
    } catch (err) {
      console.error('Error creating clean tenant:', err)
      setError(err.message || 'Gagal membuat tenant baru.')
    } finally {
      setLoading(false)
    }
  }

  // Handler Generate Serial Key Tambahan
  const handleOpenKeyModal = (tenant) => {
    setSelectedTenantForKey(tenant)
    setShowKeyModal(true)
  }

  const handleGenerateAndApplyKey = async (tierCode, durationMonths) => {
    if (!selectedTenantForKey) return
    try {
      setLoading(true)
      const newKey = generateSerialLicenseKey(tierCode, Math.ceil(durationMonths / 12))
      const now = new Date()
      const expiry = new Date(now)
      expiry.setMonth(expiry.getMonth() + parseInt(durationMonths))

      const existingLic = licenses.find(l => l.tenant_id === selectedTenantForKey.id)

      if (existingLic) {
        await supabase.from('tenant_licenses').update({
          license_key: newKey,
          tier: tierCode,
          status: 'ACTIVE',
          expires_at: expiry.toISOString(),
          notes: `Diperpanjang oleh Super Admin pada ${now.toLocaleDateString('id-ID')}`
        }).eq('id', existingLic.id)
      } else {
        await supabase.from('tenant_licenses').insert({
          id: `lic_${selectedTenantForKey.id}`,
          tenant_id: selectedTenantForKey.id,
          license_key: newKey,
          tier: tierCode,
          status: 'ACTIVE',
          expires_at: expiry.toISOString(),
          notes: `Diterbitkan oleh Super Admin pada ${now.toLocaleDateString('id-ID')}`
        })
      }

      setGeneratedKeyResult({
        storeName: selectedTenantForKey.nama,
        tenantId: selectedTenantForKey.id,
        licenseKey: newKey,
        expiresAt: expiry.toISOString(),
        telepon: selectedTenantForKey.telepon
      })

      setShowKeyModal(false)
      setSuccess(`Serial key lisensi baru berhasil diterbitkan untuk "${selectedTenantForKey.nama}"!`)
      await loadData()
    } catch (err) {
      console.error('Error generating key:', err)
      setError(err.message || 'Gagal menerbitkan serial key.')
    } finally {
      setLoading(false)
    }
  }

  // Handler Purge Data Transaksi Toko (Buka Modal)
  const handleOpenPurgeModal = (tenant) => {
    setTenantToPurge(tenant)
    setPurgeConfirmInput('')
  }

  const handleExecutePurge = async () => {
    if (!tenantToPurge) return

    const expectedName = (tenantToPurge.nama || '').trim().toLowerCase()
    const enteredName = (purgeConfirmInput || '').trim().toLowerCase()

    if (enteredName !== expectedName) {
      alert(`Konfirmasi nama tidak cocok. Masukkan nama "${tenantToPurge.nama}".`)
      return
    }

    try {
      setLoading(true)
      const localStore = supabase.localDb?.store
      if (localStore) {
        purgeTransactionsForTenant(localStore, tenantToPurge.id)
      }

      setSuccess(`Transaksi outlet "${tenantToPurge.nama}" berhasil dikosongkan. Toko siap operasional bersih dari Struk #0001!`)
      setTenantToPurge(null)
      await loadData()
    } catch (err) {
      console.error('Error purging transactions:', err)
      setError(err.message || 'Gagal membersihkan transaksi.')
    } finally {
      setLoading(false)
    }
  }

  // Handler Hapus Tenant Permanen (Buka Modal)
  const handleOpenDeleteModal = (tenant) => {
    if (tenant.id === 'tenant_jb_enterprise') {
      alert('Tenant Demo Utama Sistem (tenant_jb_enterprise) dilindungi dan tidak dapat dihapus.')
      return
    }
    setTenantToDelete(tenant)
    setDeleteConfirmInput('')
  }

  const handleExecuteDelete = async () => {
    if (!tenantToDelete) return

    const expectedName = (tenantToDelete.nama || '').trim().toLowerCase()
    const enteredName = (deleteConfirmInput || '').trim().toLowerCase()

    if (enteredName !== expectedName) {
      alert(`Konfirmasi nama tidak cocok. Masukkan nama "${tenantToDelete.nama}".`)
      return
    }

    try {
      setLoading(true)
      const localStore = supabase.localDb?.store
      if (localStore) {
        const result = deleteTenantCompletely(localStore, tenantToDelete.id)
        if (!result.success) {
          throw new Error(result.message)
        }
      } else {
        // Fallback supabase REST delete
        const { error: delErr } = await supabase.from('tenants').delete().eq('id', tenantToDelete.id)
        if (delErr) throw delErr
      }

      setSuccess(`Tenant "${tenantToDelete.nama}" dan seluruh datanya berhasil dihapus permanen dari sistem!`)
      setTenantToDelete(null)
      await loadData()
    } catch (err) {
      console.error('Error deleting tenant completely:', err)
      setError(err.message || 'Gagal menghapus tenant.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text)
      setCopiedKey(text)
      setTimeout(() => setCopiedKey(''), 2000)
    }
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header Platform Founder */}
      <div className="glass-panel p-5 md:p-6 rounded-2xl border border-amber-500/30 bg-slate-900/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldAlert size={18} />
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-wider">
              RelayPOS Founder Console (Super Admin)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pusat komando Solo Founder untuk mengelola lisensi multi-tenant, penerbitan serial key, dan onboarding klien baru.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
            title="Muat Ulang Data"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-lg shadow-amber-500/20"
          >
            <Plus size={16} />
            <span>Daftarkan Tenant / Toko Baru</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle size={16} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Result Card: Serial Key Baru Dibuat */}
      {generatedKeyResult && (
        <div className="glass-panel p-5 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 space-y-3 animate-fade-in">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase">
              <Sparkles size={16} />
              <span>Serial Key Lisensi Berhasil Diterbitkan</span>
            </div>
            <button
              onClick={() => setGeneratedKeyResult(null)}
              className="text-xs text-slate-500 hover:text-white"
            >
              Tutup
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Nama Toko:</span>
              <span className="text-white font-bold text-sm mt-0.5 block">{generatedKeyResult.storeName}</span>
              <span className="text-[10px] text-cyan-400 font-mono">{generatedKeyResult.tenantId}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Serial Key Aktivasi:</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-emerald-400 font-mono font-black text-sm">{generatedKeyResult.licenseKey}</span>
                <button
                  onClick={() => handleCopy(generatedKeyResult.licenseKey)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                  title="Salin Key"
                >
                  {copiedKey === generatedKeyResult.licenseKey ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Berlaku Sampai:</span>
                <span className="text-amber-300 font-bold">{new Date(generatedKeyResult.expiresAt).toLocaleDateString('id-ID')}</span>
              </div>
              {generatedKeyResult.telepon && (
                <a
                  href={`https://wa.me/${generatedKeyResult.telepon.replace(/\D/g, '')}?text=${encodeURIComponent(`Halo! Berikut Serial Key Lisensi RelayPOS untuk ${generatedKeyResult.storeName}:\n\nKUNCI LISENSI: ${generatedKeyResult.licenseKey}\nBERLAKU SAMPAI: ${new Date(generatedKeyResult.expiresAt).toLocaleDateString('id-ID')}\n\nMasukkan kode ini pada menu Admin -> Lisensi & Langganan. Selamat menggunakan!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-[10px] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Send size={11} />
                  <span>Kirim Key via WhatsApp Klien</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4 Kartu Metrik Platform SaaS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Klien / Outlet</span>
            <Store size={16} className="text-brand-blue" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{metrics.totalTenants}</div>
          <span className="text-[10px] text-slate-500">Tenant aktif di database</span>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Lisensi Aktif</span>
            <CheckCircle size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{metrics.activeLicenses}</div>
          <span className="text-[10px] text-emerald-500/80">Langganan beroperasi normal</span>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Perlu Tagihan / Habis</span>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">{metrics.graceOrExpired}</div>
          <span className="text-[10px] text-amber-500/80">Grace period atau kadaluarsa</span>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Proyeksi Omzet Lisensi</span>
            <DollarSign size={16} className="text-purple-400" />
          </div>
          <div className="text-xl font-black text-purple-400 font-mono">
            Rp {(metrics.estimatedAnnualMRR / 1000000).toFixed(1)} Jt
          </div>
          <span className="text-[10px] text-slate-500">Nilai kontrak lisensi tahunan</span>
        </div>
      </div>

      {/* Tabel Direktori Klien Multi-Tenant */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Building size={16} className="text-amber-400" />
              Direktori Klien & Status Lisensi
            </h3>
            <p className="text-xs text-slate-400">Daftar seluruh outlet bisnis yang menggunakan platform RelayPOS.</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Cari toko atau ID tenant..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-3">Nama Outlet / Klien</th>
                <th className="p-3">ID Tenant</th>
                <th className="p-3">Paket Lisensi</th>
                <th className="p-3">Masa Berlaku</th>
                <th className="p-3">Status Lisensi</th>
                <th className="p-3 text-center">Tindakan Founder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Tidak ada tenant ditemukan.
                  </td>
                </tr>
              ) : (
                filteredTenants.map(t => {
                  const lic = licenses.find(l => l.tenant_id === t.id)
                  const evalStatus = evaluateLicenseStatus(lic)

                  return (
                    <tr key={t.id} className="hover:bg-slate-850/30 transition-colors">
                      <td className="p-3 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <Store size={14} className="text-slate-500" />
                          <span>{t.nama}</span>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-cyan-400 text-[11px]">{t.id}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[10px]">
                          {lic?.tier || 'PRO_ANNUAL'}
                        </span>
                      </td>
                      <td className="p-3">
                        {lic?.expires_at ? (
                          <div>
                            <span className="text-white font-medium block">
                              {new Date(lic.expires_at).toLocaleDateString('id-ID')}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {evalStatus.daysRemaining > 0 ? `${evalStatus.daysRemaining} hari lagi` : 'Kadaluarsa'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Trial Sandbox</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 w-fit ${
                          evalStatus.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : evalStatus.status === 'GRACE_PERIOD'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          <span>{evalStatus.status}</span>
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenKeyModal(t)}
                            className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors"
                            title="Terbitkan / Perpanjang Serial Key"
                          >
                            <Key size={13} />
                          </button>
                          <button
                            onClick={() => handleOpenPurgeModal(t)}
                            className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-colors"
                            title="Kosongkan Transaksi Demo (Mulai Operasional Bersih Struk #0001)"
                          >
                            <RotateCcw size={13} />
                          </button>
                          {t.id !== 'tenant_jb_enterprise' && (
                            <button
                              onClick={() => handleOpenDeleteModal(t)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
                              title="Hapus Tenant dan Seluruh Datanya Permanen"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Tambah Tenant Baru Bersih */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl border border-slate-800 bg-slate-900 my-8 shadow-2xl">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Store size={18} className="text-amber-400" />
                <h3 className="text-base font-black text-white uppercase">Daftarkan Klien / Tenant Baru</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-3.5 mt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">Nama Usaha / Toko *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Barokah Carwash & Coffee"
                  value={tenantForm.storeName}
                  onChange={e => setTenantForm(prev => ({ ...prev, storeName: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">Nama Pemilik (Owner)</label>
                  <input
                    type="text"
                    placeholder="Contoh: Bpk. H. Rahmat"
                    value={tenantForm.ownerName}
                    onChange={e => setTenantForm(prev => ({ ...prev, ownerName: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">Email Login Owner *</label>
                  <input
                    type="email"
                    required
                    placeholder="owner@barokah.com"
                    value={tenantForm.ownerEmail}
                    onChange={e => setTenantForm(prev => ({ ...prev, ownerEmail: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">No. WhatsApp Klien</label>
                  <input
                    type="text"
                    placeholder="081234567890"
                    value={tenantForm.telepon}
                    onChange={e => setTenantForm(prev => ({ ...prev, telepon: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">Paket Lisensi</label>
                  <select
                    value={tenantForm.tier}
                    onChange={e => setTenantForm(prev => ({ ...prev, tier: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="PRO_ANNUAL">Pro Enterprise (Rp 3.6 Jt/Thn)</option>
                    <option value="BASIC_ANNUAL">Starter (Rp 2.4 Jt/Thn)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">Alamat Outlet</label>
                <input
                  type="text"
                  placeholder="Jl. Raya Utama No. 10, Jakarta"
                  value={tenantForm.alamat}
                  onChange={e => setTenantForm(prev => ({ ...prev, alamat: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300/90 leading-relaxed">
                *Toko baru akan dibuatkan database bersih (zero transactions), lengkap dengan master bagan akun (CoA), master paket cuci, rekening saldo kas awal Rp 0, dan Serial Key 1 tahun penuh.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {loading ? 'Memproses...' : 'Buat Tenant & Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Generate Serial Key Tambahan */}
      {showKeyModal && selectedTenantForKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-amber-400" />
                <h3 className="text-base font-black text-white uppercase">Terbitkan Serial Key Baru</h3>
              </div>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-4 mt-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Target Outlet:</span>
                <span className="text-white font-bold text-sm block mt-0.5">{selectedTenantForKey.nama}</span>
                <span className="text-[10px] text-cyan-400 font-mono">{selectedTenantForKey.id}</span>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">Durasi Lisensi</label>
                <select
                  id="selectKeyDuration"
                  defaultValue="12"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="12">12 Bulan (1 Tahun Penuh) - Standard Pro</option>
                  <option value="24">24 Bulan (2 Tahun Penuh) - Extended</option>
                  <option value="6">6 Bulan - Semester</option>
                  <option value="1">1 Bulan - Bulanan</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dur = document.getElementById('selectKeyDuration').value
                    handleGenerateAndApplyKey('PRO_ANNUAL', dur)
                  }}
                  disabled={loading}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {loading ? 'Menerbitkan...' : 'Terbitkan & Aktivasi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Konfirmasi Hapus Tenant Permanen */}
      {tenantToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-rose-500/30 bg-slate-900 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-400 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase">Hapus Tenant Permanen</h3>
                <p className="text-[11px] text-rose-400 font-medium">Tindakan ini tidak dapat dibatalkan!</p>
              </div>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-slate-300">
              <p>
                Anda akan menghapus seluruh data outlet <strong className="text-white font-mono bg-slate-800 px-1.5 py-0.5 rounded">{tenantToDelete.nama}</strong> ({tenantToDelete.id}) beserta seluruh akun, cabang, paket cuci, dan lisensinya.
              </p>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-400">
                  Ketik nama outlet untuk konfirmasi:
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-slate-800 text-amber-300 px-2 py-1 rounded select-all cursor-pointer" title="Klik lalu salin">
                    {tenantToDelete.nama}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmInput(tenantToDelete.nama)}
                    className="text-[10px] text-cyan-400 hover:underline"
                  >
                    (Isi Otomatis)
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={`Ketik: ${tenantToDelete.nama}`}
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTenantToDelete(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDelete}
                  disabled={loading || deleteConfirmInput.trim().toLowerCase() !== (tenantToDelete.nama || '').trim().toLowerCase()}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all"
                >
                  {loading ? 'Menghapus...' : 'Hapus Permanen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Konfirmasi Reset / Purge Transaksi Toko */}
      {tenantToPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-cyan-500/30 bg-slate-900 shadow-2xl">
            <div className="flex items-center gap-2.5 text-cyan-400 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <RotateCcw size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-white uppercase">Kosongkan Transaksi Demo</h3>
                <p className="text-[11px] text-cyan-400 font-medium">Mulai operasional toko dari Struk #0001</p>
              </div>
            </div>

            <div className="mt-4 space-y-3.5 text-xs text-slate-300">
              <p>
                Riwayat struk kasir, antrean cuci, dan cashflow untuk outlet <strong className="text-white font-mono bg-slate-800 px-1.5 py-0.5 rounded">{tenantToPurge.nama}</strong> akan dikosongkan. Master paket cuci, rekening, dan lisensi tetap aman.
              </p>

              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-400">
                  Ketik nama outlet untuk konfirmasi:
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-slate-800 text-amber-300 px-2 py-1 rounded select-all cursor-pointer">
                    {tenantToPurge.nama}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPurgeConfirmInput(tenantToPurge.nama)}
                    className="text-[10px] text-cyan-400 hover:underline"
                  >
                    (Isi Otomatis)
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={`Ketik: ${tenantToPurge.nama}`}
                  value={purgeConfirmInput}
                  onChange={(e) => setPurgeConfirmInput(e.target.value)}
                  className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTenantToPurge(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecutePurge}
                  disabled={loading || purgeConfirmInput.trim().toLowerCase() !== (tenantToPurge.nama || '').trim().toLowerCase()}
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 disabled:hover:bg-cyan-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all"
                >
                  {loading ? 'Mengosongkan...' : 'Kosongkan Transaksi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SuperAdmin
