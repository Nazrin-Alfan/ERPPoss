import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { Building2, ChevronDown, Check, Store, Shield, Plus, Sparkles, ExternalLink, BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function TenantSwitcher({ isCollapsed = false }) {
  const { profile, activeTenant, userTenants, switchTenant } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef(null)
  const [portalCoords, setPortalCoords] = useState({ top: 0, left: 0, width: 280 })

  const currentRole = profile?.role || 'Kasir'
  const canSwitchTenant = currentRole === 'Owner' || currentRole === 'Super Admin'

  // Hitung posisi absolut untuk Portal agar tidak pernah tertutup overflow container manapun
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return

    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      
      if (isCollapsed) {
        // Melayang di sebelah kanan tombol trigger
        setPortalCoords({
          top: Math.max(10, Math.min(rect.top, window.innerHeight - 380)),
          left: rect.right + 12,
          width: 290
        })
      } else {
        // Berada tepat di bawah trigger dengan lebar pas
        setPortalCoords({
          top: rect.bottom + 8,
          left: rect.left,
          width: Math.max(rect.width, 260)
        })
      }
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, isCollapsed])

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return
      const portalEl = document.getElementById('tenant-switcher-portal')
      if (portalEl && portalEl.contains(e.target)) return
      setIsOpen(false)
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!activeTenant) return null

  // Tampilan untuk Kasir (Read-only, terkunci pada 1 tenant)
  if (!canSwitchTenant) {
    if (isCollapsed) {
      return (
        <div 
          className="w-10 h-10 mx-auto rounded-md bg-[#18181c] border border-[#26272d] flex items-center justify-center text-[#00ffff]"
          title={`Outlet Kasir Terkunci: ${activeTenant.nama}`}
        >
          <Building2 size={16} />
        </div>
      )
    }

    return (
      <div className="px-3 py-2 rounded-md bg-[#18181c] border border-[#26272d] flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-sm bg-[#00ffff]/15 border border-[#00ffff]/30 flex items-center justify-center text-[#00ffff] shrink-0">
          <Building2 size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider flex items-center gap-1">
            <span>Outlet Kasir</span>
          </div>
          <p className="text-xs font-bold text-white truncate">{activeTenant.nama}</p>
        </div>
      </div>
    )
  }

  // Tampilan untuk Owner & Super Admin (Dengan Dropdown Pemilih Outlet)
  return (
    <div className="relative shrink-0">
      {isCollapsed ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-10 h-10 mx-auto rounded-md flex items-center justify-center transition-all cursor-pointer ${
            isOpen 
              ? 'bg-[#00ffff] text-[#121215] border border-[#00ffff]' 
              : 'bg-[#18181c] border border-[#26272d] text-[#bbcbb2] hover:text-white hover:border-[#3f414a]'
          }`}
          title={`Pilih Outlet: ${activeTenant.nama}`}
        >
          <Building2 size={16} />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full px-3 py-2 rounded-md border text-left flex items-center justify-between gap-2 transition-all cursor-pointer group ${
            isOpen
              ? 'bg-[#18181c] border-[#00ffff]'
              : 'bg-[#18181c] border-[#26272d] hover:border-[#3f414a]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-sm bg-[#00ffff]/15 border border-[#00ffff]/30 flex items-center justify-center text-[#00ffff] shrink-0 group-hover:scale-105 transition-transform">
              <Building2 size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] uppercase font-bold text-[#bbcbb2] tracking-wider flex items-center gap-1.5">
                <span>Outlet Aktif</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#00ffff]"></span>
              </div>
              <p className="text-xs font-bold text-white truncate group-hover:text-[#00ffff] transition-colors">
                {activeTenant.nama}
              </p>
            </div>
          </div>
          <ChevronDown 
            size={14} 
            className={`text-[#bbcbb2] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#00ffff]' : ''}`} 
          />
        </button>
      )}

      {/* Portal Dropdown Menu */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div 
          id="tenant-switcher-portal"
          className="fixed z-[9999] bg-[#121215] border border-[#26272d] rounded-md p-2.5 shadow-2xl animate-pop-in text-white"
          style={{
            top: `${portalCoords.top}px`,
            left: `${portalCoords.left}px`,
            width: `${portalCoords.width}px`,
            maxWidth: 'calc(100vw - 24px)'
          }}
        >
          {/* Header Popover yang Rapi & Kompak */}
          <div className="px-2.5 py-1.5 mb-1.5 border-b border-[#26272d] flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#bbcbb2] uppercase tracking-wider flex items-center gap-1.5">
              <Store size={12} className="text-[#00ffff]" />
              <span>Daftar Outlet ({userTenants.length})</span>
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-[#18181c] text-[#bbcbb2] font-mono border border-[#26272d]">
              {currentRole}
            </span>
          </div>

          {/* List Outlet */}
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {userTenants.map((tenant) => {
              const isSelected = tenant.id === activeTenant.id
              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => {
                    switchTenant(tenant.id)
                    setIsOpen(false)
                  }}
                  className={`w-full p-2.5 rounded-sm text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-[#00ffff]/15 border border-[#00ffff]/30 text-white'
                      : 'hover:bg-[#18181c] border border-transparent text-[#bbcbb2] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                      isSelected 
                        ? 'bg-[#00ffff] text-[#121215] font-bold' 
                        : 'bg-[#18181c] text-[#bbcbb2]'
                    }`}>
                      <Building2 size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${isSelected ? 'text-[#00ffff]' : 'text-white'}`}>
                        {tenant.nama}
                      </p>
                      <p className="text-[9px] text-[#6b7367] font-mono truncate">
                        ID: {tenant.id}
                      </p>
                    </div>
                  </div>
                  {isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-[#00ffff]/20 text-[#00ffff] flex items-center justify-center shrink-0 border border-[#00ffff]/40">
                      <Check size={11} className="stroke-[3]" />
                    </div>
                  ) : (
                    <span className="text-[9px] text-[#6b7367] group-hover:text-white font-medium shrink-0 bg-[#18181c] px-1.5 py-0.5 rounded-sm border border-[#26272d]">
                      Pilih
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tombol Aksi Bawah */}
          {(currentRole === 'Super Admin' || currentRole === 'Owner') && (
            <div className="mt-2 pt-2 border-t border-[#26272d] space-y-1.5">
              <Link
                to="/konsolidasi"
                onClick={() => setIsOpen(false)}
                className="w-full py-2 px-2.5 rounded-sm bg-[#00ffff]/10 hover:bg-[#00ffff]/20 text-[11px] font-bold text-[#00ffff] flex items-center justify-between transition-all border border-[#00ffff]/30 group"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 size={13} className="text-[#00ffff] group-hover:scale-110 transition-transform" />
                  <span>Konsolidasi Seluruh Outlet</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded-sm bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/40 font-mono">
                  All
                </span>
              </Link>

              <Link
                to={currentRole === 'Super Admin' ? '/super-admin' : '/admin'}
                onClick={() => setIsOpen(false)}
                className="w-full py-2 px-2.5 rounded-sm bg-[#18181c] hover:bg-[#242428] text-[11px] font-semibold text-[#bbcbb2] hover:text-white flex items-center justify-center gap-1.5 transition-all border border-[#26272d] hover:border-[#3f414a] group"
              >
                <Plus size={13} className="text-[#bbcbb2] group-hover:text-white transition-colors" />
                <span>{currentRole === 'Super Admin' ? 'Kelola Outlet di Console' : 'Atur Toko di Admin'}</span>
              </Link>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
