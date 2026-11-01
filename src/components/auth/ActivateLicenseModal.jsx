import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { buildWhatsAppRenewalLink } from '../../utils/licenseHelpers'
import { 
  KeyRound, 
  MessageCircle, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  ShieldCheck
} from 'lucide-react'

export default function ActivateLicenseModal({ isOpen, onClose }) {
  const { activeTenant, licenseStatus, activateLicenseKey } = useAuth()
  const [serialKey, setSerialKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  if (!isOpen) return null

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
      setSuccessMsg('Lisensi berhasil diaktivasi! Paket RelayPOS Pro aktif 1 Tahun.')
      setTimeout(() => {
        onClose()
      }, 1500)
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121215] border border-[#26272d] rounded-2xl p-6 shadow-2xl relative text-left">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#26272d]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#00ffff]/10 border border-[#00ffff]/20 flex items-center justify-center text-[#00ffff]">
              <ShieldCheck size={18} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Aktivasi Lisensi Resmi</h3>
              <p className="text-[11px] text-[#bbcbb2]">RelayPOS Pro Enterprise</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#18181c] border border-[#26272d] text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Notifikasi Error / Sukses */}
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

        {/* Form Aktivasi */}
        <form onSubmit={handleActivate} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Serial Key Lisensi Toko:
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
            <p className="text-[10px] text-zinc-500 mt-1">
              Kunci lisensi diterbitkan langsung oleh Founder / Pengembang software RelayPOS.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-3 rounded-lg bg-[#18181c] hover:bg-[#242428] border border-[#26272d] text-zinc-300 font-semibold text-xs transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !serialKey.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#00ffff] hover:bg-[#00e5e5] text-black font-bold text-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Sparkles size={13} />
              <span>{isSubmitting ? 'Memproses...' : 'Terapkan Kunci'}</span>
            </button>
          </div>
        </form>

        {/* Link WhatsApp */}
        <div className="mt-4 pt-3 border-t border-[#26272d] text-center">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#25D366] hover:underline font-semibold"
          >
            <MessageCircle size={14} />
            <span>Belum punya lisensi? Hubungi Founder di WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  )
}
