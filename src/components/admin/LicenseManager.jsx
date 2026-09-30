import React, { useState } from 'react'
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  Key,
  ExternalLink,
  CreditCard,
  Building,
  CheckCircle,
  Copy,
  Check,
  Sparkles,
  HelpCircle,
  Send,
  Calendar
} from 'lucide-react'
import {
  evaluateLicenseStatus,
  buildWhatsAppRenewalLink,
  LICENSE_TIERS
} from '../../utils/licenseHelpers'
import { DEVELOPER_CONFIG } from '../../constants/erpConfig'

const LicenseManager = ({
  licenseData,
  storeName = 'Outlet Carwash & Cafe',
  onActivateKey
}) => {
  const [copiedAccount, setCopiedAccount] = useState(false)
  const [inputKey, setInputKey] = useState('')
  const [activationError, setActivationError] = useState('')
  const [activationSuccess, setActivationSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const licenseStatus = evaluateLicenseStatus(licenseData)
  const currentPlan = LICENSE_TIERS[licenseData?.tier] || LICENSE_TIERS.PRO_ANNUAL

  const renewalWhatsAppUrl = buildWhatsAppRenewalLink({
    developerPhone: DEVELOPER_CONFIG.whatsappNumber,
    tenantName: storeName,
    tenantId: licenseData?.tenant_id || 'tenant_jb_enterprise',
    planCode: currentPlan.code,
    currentExpiry: licenseData?.expires_at
  })

  const handleCopyBank = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(DEVELOPER_CONFIG.bankAccount)
      setCopiedAccount(true)
      setTimeout(() => setCopiedAccount(false), 2000)
    }
  }

  const handleKeySubmit = async (e) => {
    e.preventDefault()
    setActivationError('')
    setActivationSuccess('')
    if (!inputKey.trim()) {
      setActivationError('Silakan masukkan Kode Serial Lisensi aktivasi.')
      return
    }

    try {
      setIsSubmitting(true)
      if (onActivateKey) {
        await onActivateKey(inputKey.trim())
        setActivationSuccess('Kode lisensi berhasil diaktivasi! Masa aktif sistem telah diperpanjang.')
        setInputKey('')
      }
    } catch (err) {
      setActivationError(err.message || 'Gagal mengaktivasi kode lisensi.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Info */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={22} className="text-cyan-400" />
            <h3 className="text-lg font-black text-white uppercase tracking-wide">
              Status Lisensi & Hak Penggunaan Software
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Informasi masa aktif lisensi tahunan, aktivasi serial key, dan perpanjangan langsung ke developer RelayPOS.
          </p>
        </div>

        {/* Badge Status */}
        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 font-bold text-xs ${
            licenseStatus.status === 'ACTIVE'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : licenseStatus.status === 'GRACE_PERIOD'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 animate-pulse'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}>
            {licenseStatus.status === 'ACTIVE' ? (
              <CheckCircle size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            <span>{licenseStatus.message}</span>
          </div>
        </div>
      </div>

      {/* Grid Informasi Utama: 2 Kolom */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Kolom Kiri (2 Span): Detail Paket & Fitur */}
        <div className="lg:col-span-2 space-y-5">
          {/* Card Rincian Lisensi */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" />
              Paket Lisensi Berjalan
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Tipe Lisensi</span>
                <span className="text-white font-extrabold text-sm mt-0.5 block">{currentPlan.name}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">ID Tenant Terdaftar</span>
                <span className="text-cyan-400 font-mono font-bold text-xs mt-0.5 block">{licenseData?.tenant_id || 'tenant_jb_enterprise'}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Kunci Serial Aktif</span>
                <span className="text-slate-300 font-mono text-xs mt-0.5 block">{licenseData?.license_key || 'RLPOS-DEMO-XXXX-YYYY'}</span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Masa Berlaku Sampai</span>
                <span className="text-amber-300 font-bold text-xs mt-0.5 block flex items-center gap-1.5">
                  <Calendar size={13} />
                  {licenseData?.expires_at ? new Date(licenseData.expires_at).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  }) : '14 Hari Uji Coba'}
                </span>
              </div>
            </div>

            {/* Checklist Fitur */}
            <div className="pt-2 border-t border-slate-800/60">
              <span className="text-slate-400 text-xs font-bold block mb-2">Fitur Enterprise Termasuk:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {currentPlan.features.map((feat, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-slate-300">
                    <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form Input Serial Key Aktivasi Baru */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Key size={16} className="text-cyan-400" />
              Aktivasi Kunci Lisensi Baru
            </h4>
            <p className="text-xs text-slate-400">
              Setelah melakukan pembayaran perpanjangan, masukkan serial key yang diberikan oleh developer RelayPOS di bawah ini.
            </p>

            <form onSubmit={handleKeySubmit} className="space-y-3 pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Contoh: RLPOS-PRO-2027-ABCD-EFGH"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value.toUpperCase())}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
                >
                  <Key size={14} />
                  <span>Aktivasi Serial Key</span>
                </button>
              </div>

              {activationError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{activationError}</span>
                </div>
              )}

              {activationSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle size={14} className="shrink-0" />
                  <span>{activationSuccess}</span>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Kolom Kanan: Card Order & Pembayaran Solo Founder */}
        <div className="space-y-5">
          {/* Card Direct Sales WhatsApp */}
          <div className="glass-panel p-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <Send size={18} />
              <h4 className="text-sm font-black uppercase tracking-wide">Perpanjangan Cepat via WhatsApp</h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Dapatkan faktur resmi, nomor rekening transfer, dan serial key langsung dari developer RelayPOS.
            </p>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-900/50 text-xs space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Biaya Lisensi Tahunan:</span>
              <span className="text-lg font-black text-emerald-400 font-mono">
                Rp {currentPlan.price.toLocaleString('id-ID')}
              </span>
              <span className="text-[10px] text-slate-500 block">/ 12 Bulan Penuh (Software Unlimited)</span>
            </div>

            <a
              href={renewalWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Send size={14} />
              <span>Hubungi Developer via WhatsApp</span>
              <ExternalLink size={12} />
            </a>
          </div>

          {/* Rekening Pembayaran Resmi Pengembang */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 space-y-3 text-xs">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <CreditCard size={15} className="text-cyan-400" />
              Rekening Pembayaran Pengembang
            </h4>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[10px] font-bold uppercase">Bank Pengembang:</span>
                <span className="text-white font-bold">{DEVELOPER_CONFIG.bankName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-[10px] font-bold uppercase">Nomor Rekening:</span>
                <div className="flex items-center gap-1.5 font-mono text-cyan-400 font-bold">
                  <span>{DEVELOPER_CONFIG.bankAccount}</span>
                  <button
                    onClick={handleCopyBank}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                    title="Salin Nomor Rekening"
                  >
                    {copiedAccount ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 border-t border-slate-900 pt-1">
                <span>Atas Nama:</span>
                <span className="text-slate-300">{DEVELOPER_CONFIG.founderName}</span>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 leading-tight">
              *Setelah transfer, kirimkan bukti transfer melalui WhatsApp agar serial key aktivasi segera di-generate.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LicenseManager
