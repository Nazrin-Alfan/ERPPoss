import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { DEVELOPER_CONFIG } from '../../constants/erpConfig'
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
    developerPhone: DEVELOPER_CONFIG.whatsappNumber,
    tenantName: activeTenant?.nama || 'Outlet RelayPOS',
    tenantId: activeTenant?.id || 'tenant_unknown',
    planCode: 'PRO_ANNUAL',
    currentExpiry: licenseStatus?.valid_until || licenseStatus?.expires_at || ''
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-xl relative text-left text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary">
              <ShieldCheck size={18} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Aktivasi Lisensi Resmi</h3>
              <p className="text-[11px] text-muted">RelayPOS Pro Enterprise</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal aktivasi lisensi"
            className="min-w-[40px] min-h-[40px] rounded-xl bg-subsurface border border-border text-muted hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Notifikasi Error / Sukses */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-start gap-2">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-destructive" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-xl bg-success-bg border border-success/30 text-success text-xs flex items-start gap-2">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-success" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form Aktivasi */}
        <form onSubmit={handleActivate} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Serial Key Lisensi Toko:
            </label>
            <div className="relative">
              <input
                type="text"
                value={serialKey}
                onChange={(e) => setSerialKey(e.target.value.toUpperCase())}
                placeholder="RLPOS-PRO-2027-XXXX-XXXX"
                className="w-full min-h-[44px] bg-subsurface border border-border focus:border-border-active focus:ring-2 focus:ring-ring/20 rounded-xl pl-3.5 pr-10 py-2.5 text-base sm:text-sm text-foreground font-mono placeholder:text-muted-dark focus:outline-none transition-colors"
                disabled={isSubmitting}
              />
              <KeyRound size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-dark pointer-events-none" />
            </div>
            <p className="text-[11px] text-muted mt-1.5">
              Kunci lisensi diterbitkan langsung oleh Founder / Pengembang software RelayPOS.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] py-2 px-3 rounded-full bg-subsurface hover:bg-surface-hover border border-border text-foreground font-semibold text-xs transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !serialKey.trim()}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Sparkles size={13} />
              <span>{isSubmitting ? 'Memproses...' : 'Terapkan Kunci'}</span>
            </button>
          </div>
        </form>

        {/* Link WhatsApp */}
        <div className="mt-4 pt-3 border-t border-border text-center">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[44px] px-3 py-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-success-bg border border-success/30 text-success hover:opacity-90 text-xs font-semibold transition-all"
          >
            <MessageCircle size={14} />
            <span>Belum punya lisensi? Hubungi Founder di WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  )
}
