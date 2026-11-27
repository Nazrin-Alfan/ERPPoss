import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ROLES } from '../../constants/roles'
import { DEVELOPER_CONFIG } from '../../constants/erpConfig'
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
    developerPhone: DEVELOPER_CONFIG.whatsappNumber,
    tenantName: activeTenant?.nama || 'Outlet RelayPOS',
    tenantId: activeTenant?.id || 'tenant_unknown',
    planCode: 'PRO_ANNUAL',
    currentExpiry: licenseStatus?.valid_until || licenseStatus?.expires_at || ''
  })

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex items-center justify-center p-4 sm:p-6 overflow-y-auto text-foreground">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-lg relative text-left">
        {/* Header Icon & Status Badge */}
        <div className="flex items-center justify-between pb-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-destructive-bg border border-destructive/25 flex items-center justify-center text-destructive shrink-0">
              <ShieldAlert size={22} strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider text-foreground uppercase">RELAYPOS</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-destructive-bg text-destructive border border-destructive/30">
                  TRIAL EXPIRED
                </span>
              </div>
              <p className="text-xs text-muted font-medium mt-0.5">Gerbang Keamanan &amp; Lisensi ERP</p>
            </div>
          </div>
        </div>

        {/* Headline & Informasi Toko */}
        <div className="mt-5 space-y-2">
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Masa Uji Coba 30 Hari Telah Berakhir
          </h2>
          <p className="text-xs text-muted leading-relaxed">
            Akses operasional untuk <strong className="text-foreground font-semibold">{activeTenant?.nama || 'Toko Anda'}</strong> saat ini dikunci. Seluruh data transaksi, keuangan, dan inventori Anda tersimpan aman di cloud.
          </p>
        </div>

        {/* Ringkasan Akun */}
        <div className="mt-4 p-3.5 bg-subsurface border border-border rounded-xl space-y-2 text-xs">
          <div className="flex justify-between items-center text-muted">
            <span>Nama Outlet:</span>
            <span className="text-foreground font-semibold">{activeTenant?.nama || '-'}</span>
          </div>
          <div className="flex justify-between items-center text-muted">
            <span>ID Tenant:</span>
            <span className="text-foreground font-mono text-[11px] select-all">{activeTenant?.id || '-'}</span>
          </div>
          <div className="flex justify-between items-center text-muted">
            <span>Status Sistem:</span>
            <span className="text-destructive font-semibold flex items-center gap-1">
              <Clock size={12} /> Terkunci (Perlu Aktivasi)
            </span>
          </div>
        </div>

        {/* Pesan Sukses / Error */}
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

        {/* Konten untuk Owner vs Kasir/Staf */}
        {isOwner ? (
          <div className="mt-5 space-y-4">
            <form onSubmit={handleActivate} className="space-y-3">
              <label className="block text-xs font-semibold text-foreground">
                Masukkan Serial Key Lisensi Resmi
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

              <button
                type="submit"
                disabled={isSubmitting || !serialKey.trim()}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Sparkles size={14} className="shrink-0" />
                <span>{isSubmitting ? 'Memverifikasi Lisensi...' : 'Aktivasi & Buka Sistem'}</span>
              </button>
            </form>

            <div className="relative flex items-center justify-center my-3">
              <div className="border-t border-border w-full"></div>
              <span className="bg-surface px-2.5 text-[10px] text-muted-dark uppercase tracking-wider font-semibold">
                Atau
              </span>
            </div>

            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-success-bg hover:opacity-90 border border-success/30 text-success font-semibold text-xs transition-all active:scale-[0.98] cursor-pointer"
            >
              <MessageCircle size={15} className="shrink-0" />
              <span>Hubungi Founder via WhatsApp untuk Aktivasi</span>
            </a>
          </div>
        ) : (
          <div className="mt-5 p-4 rounded-xl bg-subsurface border border-border text-xs text-muted space-y-2">
            <p className="font-semibold text-foreground">Perhatian untuk Staf / Kasir:</p>
            <p className="leading-relaxed">
              Masa uji coba toko ini telah selesai. Harap hubungi <strong className="text-foreground">Pemilik Toko (Owner)</strong> untuk mengaktifkan lisensi RelayPOS agar Anda dapat melanjutkan transaksi kasir.
            </p>
          </div>
        )}

        {/* Tombol Keluar Sesi */}
        <div className="mt-6 pt-4 border-t border-border flex justify-end">
          <button
            type="button"
            onClick={logout}
            className="min-h-[40px] px-3 inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-destructive transition-colors cursor-pointer"
          >
            <LogOut size={14} />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </div>
    </div>
  )
}
