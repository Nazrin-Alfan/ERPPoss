import React from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAppTheme } from '../../context/ThemeContext'
import { Link, useNavigate } from 'react-router-dom'
import {
  Crown,
  LogOut,
  ShieldCheck,
  Store,
  ArrowRight
} from 'lucide-react'
import { ROLES } from '../../constants/roles'
import RelayLogo from '../brand/RelayLogo'

const ENABLE_FOUNDER_CONSOLE =
  import.meta.env?.VITE_ENABLE_FOUNDER_CONSOLE === 'true' ||
  import.meta.env?.MODE === 'test'

export default function ExecutiveLayout({ children }) {
  const { profile, activeTenant, switchTenant, logout } = useAuth()
  const { currentTheme } = useAppTheme() || {}
  const navigate = useNavigate()
  const isSuperAdmin = profile?.role === ROLES.SUPER_ADMIN || profile?.is_super_admin

  const handleEnterStore = (tenantId = null) => {
    if (tenantId) {
      switchTenant(tenantId)
    }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-canvas text-foreground flex flex-col selection:bg-primary selection:text-primary-foreground">
      {/* Top Bar Mandiri Khusus Executive Portal HQ (60px) */}
      <header className="sticky top-0 z-40 min-h-[60px] bg-surface/95 backdrop-blur-sm border-b border-border px-4 sm:px-8 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <RelayLogo size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold tracking-wider text-foreground uppercase">
                RELAYPOS
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-subsurface text-muted font-semibold border border-border">
                Multi-Cabang
              </span>
            </div>
            <p className="text-xs font-medium text-muted truncate">
              {currentTheme?.brandName ? `${currentTheme.brandName} • Ringkasan Multi-Outlet` : 'Ringkasan Multi-Outlet'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {isSuperAdmin && ENABLE_FOUNDER_CONSOLE && (
            <Link
              to="/founder"
              className="inline-flex items-center gap-1.5 sm:gap-2 min-h-[40px] px-3.5 py-1.5 rounded-full bg-warning-bg hover:opacity-90 border border-warning/35 text-xs font-bold text-warning transition-all shadow-xs group cursor-pointer active:scale-[0.98]"
              title="Buka Console Founder (Super Admin)"
            >
              <Crown size={14} strokeWidth={2} className="shrink-0" />
              <span>Console Founder</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => handleEnterStore(activeTenant?.id)}
            className="hidden sm:inline-flex items-center gap-2 min-h-[40px] px-4 py-1.5 rounded-full bg-primary hover:bg-primary-hover text-xs font-bold text-primary-foreground transition-all shadow-xs group cursor-pointer active:scale-[0.98]"
            title="Buka tampilan kasir & operasional toko"
          >
            <Store size={14} strokeWidth={1.75} className="shrink-0" />
            <span>Buka Kasir Toko ({activeTenant?.nama || 'Toko'})</span>
            <ArrowRight size={13} strokeWidth={1.75} className="group-hover:translate-x-0.5 transition-transform" />
          </button>

          <div className="flex items-center gap-3 pl-3 border-l border-border">
            <div className="hidden md:block text-right">
              <p className="text-xs font-bold text-foreground truncate max-w-[140px]">
                {profile?.nama || 'Pemilik Usaha'}
              </p>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isSuperAdmin ? 'bg-primary' : 'bg-warning'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isSuperAdmin ? 'text-primary-soft-foreground' : 'text-warning'}`}>
                  {isSuperAdmin ? 'Super Admin' : 'Owner'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="w-10 h-10 rounded-full bg-subsurface border border-border hover:border-destructive/40 text-muted hover:text-destructive flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              title="Keluar dari akun"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 overflow-x-hidden">
        {children}
      </main>

      <footer className="border-t border-border py-3.5 px-4 sm:px-8 text-center text-xs text-muted-dark flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-primary" />
          <span>Sistem Konsolidasi Multi-Outlet Terisolasi &amp; Terenkripsi Cloud</span>
        </div>
        <div className="text-[11px] font-mono text-muted-dark">
          RelayPOS Enterprise • Cobalt v5.0
        </div>
      </footer>
    </div>
  )
}
