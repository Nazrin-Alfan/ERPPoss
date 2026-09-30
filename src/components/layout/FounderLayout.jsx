import React from 'react'
import { useAuth } from '../../context/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import {
  Crown,
  LogOut,
  ShieldAlert,
  Terminal,
  Activity,
  ArrowRight,
  Database,
  Store,
  Layers
} from 'lucide-react'

export default function FounderLayout({ children }) {
  const { profile, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#000000] text-white flex flex-col selection:bg-[#00ffff] selection:text-[#0f0f0f]">
      {/* Top Header Command Bar Khusus Solo Founder */}
      <header className="sticky top-0 z-50 bg-[#000000]/95 backdrop-blur-md border-b border-[#26272d] px-4 sm:px-8 py-2.5 flex items-center justify-between">
        {/* Founder Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-[#18181c] border border-[#26272d] flex items-center justify-center text-[#ffc71f] shadow-xs shrink-0">
            <Crown size={16} strokeWidth={1.75} className="text-[#ffc71f]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-white uppercase">
                RELAYPOS FOUNDER
              </span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-sm bg-[#18181c] text-[#00ffff] font-bold border border-[#26272d] uppercase tracking-wider">
                Console
              </span>
            </div>
            <p className="text-xs font-medium text-[#bbcbb2] tracking-wide flex items-center gap-2">
              <span>SaaS Platform Control</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ffff]"></span>
            </p>
          </div>
        </div>

        {/* Action Controls & Profil Founder */}
        <div className="flex items-center gap-3">
          {/* Tombol Masuk ke View Bisnis Owner */}
          <Link
            to="/konsolidasi"
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-[#18181c] hover:bg-[#242428] border border-[#26272d] hover:border-[#3f414a] text-xs font-bold text-white transition-all shadow-xs group cursor-pointer"
            title="Lihat sudut pandang Owner Bisnis"
          >
            <Layers size={14} className="text-[#00ffff] group-hover:scale-105 transition-transform" />
            <span>Mode Owner</span>
            <ArrowRight size={13} className="text-[#bbcbb2] group-hover:translate-x-0.5 transition-transform" />
          </Link>

          {/* Profil Founder Card & Tombol Keluar */}
          <div className="flex items-center gap-3 pl-3 border-l border-[#26272d]">
            <div className="hidden md:block text-right">
              <p className="text-xs font-bold text-white truncate max-w-[130px]">
                {profile?.nama || 'Solo Founder'}
              </p>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ffff]"></span>
                <span className="text-[10px] text-[#00ffff] font-semibold uppercase tracking-wider">
                  Super Admin
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              className="p-1.5 rounded-sm bg-[#18181c] border border-[#26272d] hover:border-[#ff5102]/40 text-[#bbcbb2] hover:text-[#ff5102] transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              title="Keluar dari akun Founder"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Full-Width Khusus Founder */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6">
        {children}
      </main>

      {/* Footer Khusus Mission Control */}
      <footer className="border-t border-[#26272d] py-3.5 px-4 sm:px-8 text-center text-xs text-[#6b7367] flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#00ffff]" />
          <span>RelayPOS Cloud Multi-Tenant Architecture • Root Privileges</span>
        </div>
        <div className="text-[11px] font-mono text-[#6b7367]">
          VRS_2026 • All Tenants Protected
        </div>
      </footer>
    </div>
  )
}
