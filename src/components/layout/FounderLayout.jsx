import React from 'react'
import { useAuth } from '../../context/AuthContext'
import { Link } from 'react-router-dom'
import {
  LogOut,
  Terminal,
  ArrowRight,
  Layers
} from 'lucide-react'
import RelayLogo from '../brand/RelayLogo'

export default function FounderLayout({ children }) {
  const { profile, logout } = useAuth()

  return (
    <div
      data-theme="dark"
      className="min-h-screen bg-canvas text-foreground flex flex-col selection:bg-primary selection:text-primary-foreground"
    >
      {/* Top Header Command Bar Khusus Solo Founder (Pure Carbon Obsidian D1) */}
      <header className="sticky top-0 z-40 min-h-[60px] bg-surface/95 backdrop-blur-md border-b border-border px-4 sm:px-8 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <RelayLogo variant="dark" size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold tracking-wider text-foreground uppercase">
                RELAYPOS FOUNDER
              </span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wider">
                SUPER ADMIN • CONSOLE FOUNDER
              </span>
            </div>
            <p className="text-xs font-medium text-muted tracking-wide flex items-center gap-2 mt-0.5">
              <span>SaaS Platform Mission Control</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/konsolidasi"
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-1.5 rounded-full bg-subsurface hover:bg-surface-hover border border-border hover:border-border-hover text-xs font-bold text-foreground transition-all shadow-xs group cursor-pointer active:scale-[0.98]"
            title="Lihat sudut pandang Owner Bisnis"
          >
            <Layers size={14} className="text-[#60A5FA] group-hover:scale-105 transition-transform" />
            <span>Mode Owner</span>
            <ArrowRight size={13} className="text-muted group-hover:translate-x-0.5 transition-transform" />
          </Link>

          <div className="flex items-center gap-3 pl-3 border-l border-border">
            <div className="hidden md:block text-right">
              <p className="text-xs font-bold text-foreground truncate max-w-[140px]">
                {profile?.nama || 'Solo Founder'}
              </p>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />
                <span className="text-[10px] text-[#93C5FD] font-semibold uppercase tracking-wider">
                  Super Admin
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="w-10 h-10 rounded-full bg-subsurface border border-border hover:border-destructive/50 text-muted hover:text-destructive flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-[0.98]"
              title="Keluar dari akun Founder"
            >
              <LogOut size={15} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6">
        {children}
      </main>

      <footer className="border-t border-border py-3.5 px-4 sm:px-8 text-center text-xs text-muted-dark flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#60A5FA]" />
          <span>RelayPOS Cloud Multi-Tenant Architecture • Root Privileges</span>
        </div>
        <div className="text-[11px] font-mono text-muted-dark">
          Pure Carbon D1 • All Tenants Protected
        </div>
      </footer>
    </div>
  )
}
