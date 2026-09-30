import React from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAppTheme } from '../../context/ThemeContext'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Store,
  ArrowRight
} from 'lucide-react'

export default function ExecutiveLayout({ children }) {
  const { profile, activeTenant, userTenants, switchTenant, logout } = useAuth()
  const { currentTheme } = useAppTheme()
  const navigate = useNavigate()

  const handleEnterStore = (tenantId = null) => {
    if (tenantId) {
      switchTenant(tenantId)
    }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col selection:bg-[#00ffff] selection:text-[#0f0f0f]">
      {/* Top Bar Mandiri Khusus Executive Portal HQ */}
      <header className="sticky top-0 z-40 bg-[#000000]/95 backdrop-blur-sm border-b border-[#26272d] px-4 sm:px-8 py-2.5 flex items-center justify-between">
        {/* Brand Group & Holding Badge */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#18181c] border border-[#26272d] flex items-center justify-center text-[#00ffff] shrink-0 shadow-xs">
            <Building2 size={16} strokeWidth={1.75} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-white uppercase">
                RELAYPOS
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#18181c] text-[#bbcbb2] font-semibold border border-[#26272d]">
                Portal Holding
              </span>
            </div>
            <p className="text-xs font-medium text-[#bbcbb2]">
              {currentTheme?.brandName || 'Komersial Portofolio'}
            </p>
          </div>
        </div>

        {/* Action Controls & Profil Pemilik */}
        <div className="flex items-center gap-3">
          {/* Tombol Cepat Beralih Masuk ke Operasional Toko */}
          <button
            onClick={() => handleEnterStore(activeTenant?.id)}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#18181c] hover:bg-[#242428] border border-[#26272d] hover:border-[#3f414a] text-xs font-semibold text-white transition-all shadow-xs group cursor-pointer active:scale-[0.98]"
            title="Buka tampilan kasir & operasional toko"
          >
            <Store size={14} strokeWidth={1.75} className="text-[#00ffff] group-hover:scale-105 transition-transform" />
            <span>Workspace Outlet ({activeTenant?.nama || 'Toko'})</span>
            <ArrowRight size={13} strokeWidth={1.75} className="text-[#bbcbb2] group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Profil Owner Card & Tombol Keluar */}
          <div className="flex items-center gap-3 pl-3 border-l border-[#26272d]">
            <div className="hidden md:block text-right">
              <p className="text-xs font-semibold text-white truncate max-w-[120px]">
                {profile?.nama || 'Pemilik Usaha'}
              </p>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff9821]"></span>
                <span className="text-[10px] text-[#ff9821] font-bold uppercase tracking-wider">
                  Owner
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              className="p-1.5 rounded-md bg-[#18181c] border border-[#26272d] hover:border-[#ff5102]/40 text-[#bbcbb2] hover:text-[#ff5102] transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              title="Keluar dari akun"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Full-Width Khusus HQ */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 overflow-x-hidden">
        {children}
      </main>

      {/* Footer Minimalis Executive HQ */}
      <footer className="border-t border-[#26272d] py-3.5 px-4 sm:px-8 text-center text-xs text-[#6b7367] flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-[#00ffff]" />
          <span>Sistem Konsolidasi Multi-Outlet Terisolasi & Terenkripsi Cloud</span>
        </div>
        <div className="text-[11px] font-mono text-[#6b7367]">
          RelayPOS Enterprise • VRS_2026
        </div>
      </footer>
    </div>
  )
}
