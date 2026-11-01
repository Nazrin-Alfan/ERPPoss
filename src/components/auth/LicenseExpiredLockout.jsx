import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ROLES } from '../../constants/roles'
import { buildWhatsAppRenewalLink } from '../../utils/licenseHelpers'
import { 
  ShieldAlert, 
  KeyRound, 
  MessageCircle, 
  LogOut, 
  Building2, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react'

export default function LicenseExpiredLockout() {
  const { user, profile, activeTenant, licenseStatus, activateLicenseKey, logout } = useAuth()
  const [serialKey, setSerialKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const currentRole = profile?.role || user?.role || ROLES.KASIR
  const isOwner = currentRole === ROLES.OWNER || currentRole === ROLES.SUPER_ADMIN

  const handleActivate = async (e) => {
    e.preventDefault()
    if (!serialKey.trim()) {
      setErrorMsg('Harap masukkan serial key lisensi resmi Anda.')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMsg('')
      setSuccessMsg('')
      await activateLicenseKey(serialKey.trim())
      setSuccessMsg('Lisensi berhasil diaktivasi! Ruang kerja Anda kini terbuka penuh.')
    } catch (err) {
      console.error('Gagal aktivasi lisensi:', err)
      setErrorMsg(err.message || 'Kunci lisensi tidak valid atau gagal diverifikasi.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const waLink = buildWhatsAppRenewalLink({
    developerPhone: '6281234567890',
    tenantName: activeTenant?.nama || 'Outlet RelayPOS',
    tenantId: activeTenant?.id || 'tenant_unknown',
    planCode: 'PRO_ANNUAL',
    currentExpiry: licenseStatus?.valid_until || licenseStatus?.expires_at || ''
  })

  return (
    <div className="fixed inset-0 z-50 bg-[#000000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#121215] border border-[#26272d] rounded-2xl p-6 sm:p-8 shadow-2xl relative text-left">
        {/* Header Icon & Status Badge */}
        <div className="flex items-center justify-between pb-5 border-b border-[#26272d]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert size={22} strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider text-white uppercase">RELAYPOS</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  TRIAL EXPIRED
                </span>
              </div>
              <p className="text-xs text-[#bbcbb2] font-medium mt-0.5">Gerbang Keamanan & Lisensi ERP</p>
            </div>
          </div>
        </div>

        {/* Headline & Informasi Toko */}
        <div className="mt-5 space-y-2">
          <h2 className="text-lg font-bold text-white tracking-tight">
            Masa Uji Coba 14 Hari Telah Berakhir
          </h2>
          <p className="text-xs text-[#bbcbb2] leading-relaxed">
            Akses operasional untuk <strong className="text-white font-semibold">{activeTenant?.nama || 'Toko Anda'}</strong> saat ini dikunci. Seluruh data transaksi, keuangan, dan inventori Anda tersimpan aman di cloud.
          </p>
        </div>

        {/* Ringkasan Akun */}
        <div className="mt-4 p-3.5 bg-[#18181c] border border-[#26272d] rounded-xl space-y-2 text-xs">
          <div className="flex justify-between items-center text-zinc-400">
            <span>Nama Outlet:</span>
            <span className="text-white font-medium">{activeTenant?.nama || '-'}</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>ID Tenant:</span>
            <span className="text-zinc-300 font-mono text-[11px] select-all">{activeTenant?.id || '-'}</span>
          </div>
          <div className="flex justify-between items-center text-zinc-400">
            <span>Status Sistem:</span>
            <span className="text-rose-400 font-semibold flex items-center gap-1">
              <Clock size={12} /> Terkunci (Perlu Aktivasi)
            </span>
          </div>
        </div>

        {/* Pesan Sukses / Error */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Konten untuk Owner vs Kasir/Staf */}
        {isOwner ? (
          <div className="mt-5 space-y-4">
            <form onSubmit={handleActivate} className="space-y-3">
              <label className="block text-xs font-semibold text-zinc-300">
                Masukkan Serial Key Lisensi Resmi
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={serialKey}
                  onChange={(e) => setSerialKey(e.target.value.toUpperCase())}
                  placeholder="RLPOS-PRO-2027-XXXX-XXXX"
                  className="w-full bg-[#18181c] border border-[#26272d] focus:border-[#00ffff] rounded-lg px-3.5 py-2.5 text-xs text-white font-mono placeholder:text-zinc-600 focus:outline-none transition-colors"
                  disabled={isSubmitting}
                />
                <KeyRound size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !serialKey.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#00ffff] hover:bg-[#00e5e5] text-black font-bold text-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Sparkles size={14} className="shrink-0" />
                <span>{isSubmitting ? 'Memverifikasi Lisensi...' : 'Aktivasi & Buka Sistem'}</span>
              </button>
            </form>

            <div className="relative flex items-center justify-center my-3">
              <div className="border-t border-[#26272d] w-full"></div>
              <span className="bg-[#121215] px-2 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                Atau
              </span>
            </div>

            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] font-semibold text-xs transition-all active:scale-[0.98] cursor-pointer"
            >
              <MessageCircle size={15} className="shrink-0" />
              <span>Hubungi Founder via WhatsApp untuk Aktivasi</span>
            </a>
          </div>
        ) : (
          <div className="mt-5 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 space-y-2">
            <p className="font-medium text-white">Perhatian untuk Staf / Kasir:</p>
            <p className="leading-relaxed">
              Masa uji coba toko ini telah selesai. Harap hubungi <strong className="text-white">Pemilik Toko (Owner)</strong> untuk mengaktifkan lisensi RelayPOS agar Anda dapat melanjutkan transaksi kasir.
            </p>
          </div>
        )}

        {/* Tombol Keluar Sesi */}
        <div className="mt-6 pt-4 border-t border-[#26272d] flex justify-end">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </div>
    </div>
  )
}
