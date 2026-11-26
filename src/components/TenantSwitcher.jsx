import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { Building2, ChevronDown, Check, Store, Plus, BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function TenantSwitcher({ isCollapsed = false }) {
  const { profile, activeTenant, userTenants, switchTenant } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef(null)
  const [portalCoords, setPortalCoords] = useState({ top: 0, left: 0, width: 280 })

  const currentRole = profile?.role || 'Kasir'
  const canSwitchTenant = currentRole === 'Owner' || currentRole === 'Super Admin'
  const enableFounderConsole =
    import.meta.env?.VITE_ENABLE_FOUNDER_CONSOLE === 'true' ||
    import.meta.env?.MODE === 'test'

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return

    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()

      if (isCollapsed) {
        setPortalCoords({
          top: Math.max(10, Math.min(rect.top, window.innerHeight - 380)),
          left: rect.right + 12,
          width: 290
        })
      } else {
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

  if (!canSwitchTenant) {
    if (isCollapsed) {
      return (
        <div
          className="w-11 h-11 mx-auto rounded-full bg-subsurface border border-border flex items-center justify-center text-primary"
          title={`Outlet Kasir Terkunci: ${activeTenant.nama}`}
        >
          <Building2 size={18} strokeWidth={1.75} />
        </div>
      )
    }

    return (
      <div className="min-h-[44px] px-3 py-2 rounded-full bg-subsurface border border-border flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase font-bold text-muted tracking-wider">
            Outlet Kasir
          </div>
          <p className="text-xs font-bold text-foreground truncate">{activeTenant.nama}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative shrink-0">
      {isCollapsed ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-11 h-11 mx-auto rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-[0.98] ${
            isOpen
              ? 'bg-primary text-primary-foreground border border-transparent shadow-xs'
              : 'bg-subsurface border border-border text-muted hover:text-foreground hover:border-border-hover'
          }`}
          title={`Pilih Outlet: ${activeTenant.nama}`}
        >
          <Building2 size={18} strokeWidth={1.75} />
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full min-h-[44px] px-3.5 py-2 rounded-full border text-left flex items-center justify-between gap-2 transition-all cursor-pointer group active:scale-[0.99] ${
            isOpen
              ? 'bg-selected-surface border-ring'
              : 'bg-subsurface border-border hover:border-border-hover'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <div className="min-w-0">
              <div className="text-[9px] uppercase font-bold text-muted tracking-wider leading-none">
                Outlet Aktif
              </div>
              <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors mt-0.5">
                {activeTenant.nama}
              </p>
            </div>
          </div>
          <ChevronDown
            size={15}
            strokeWidth={1.75}
            className={`text-muted shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}
          />
        </button>
      )}

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          id="tenant-switcher-portal"
          className="fixed z-[9999] bg-surface border border-border rounded-2xl p-2.5 shadow-2xl animate-pop-in text-foreground"
          style={{
            top: `${portalCoords.top}px`,
            left: `${portalCoords.left}px`,
            width: `${portalCoords.width}px`,
            maxWidth: 'calc(100vw - 24px)'
          }}
        >
          <div className="px-2.5 py-1.5 mb-1.5 border-b border-border flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Store size={12} className="text-primary" />
              <span>Daftar Outlet ({userTenants.length})</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-subsurface text-muted font-mono border border-border">
              {currentRole}
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {userTenants.map((tenant) => {
              const isSelected = tenant.id === activeTenant.id
              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={async () => {
                    await switchTenant(tenant.id)
                    setIsOpen(false)
                  }}
                  className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-primary-soft border border-primary/30 text-foreground'
                      : 'hover:bg-subsurface border border-transparent text-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                        isSelected
                          ? 'bg-primary text-primary-foreground font-bold'
                          : 'bg-subsurface text-muted'
                      }`}
                    >
                      <Building2 size={13} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold truncate ${isSelected ? 'text-primary-soft-foreground' : 'text-foreground'}`}>
                        {tenant.nama}
                      </p>
                      <p className="text-[9px] text-muted-dark font-mono truncate">
                        ID: {tenant.id}
                      </p>
                    </div>
                  </div>
                  {isSelected ? (
                    <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                      <Check size={11} className="stroke-[3]" />
                    </div>
                  ) : (
                    <span className="text-[9px] text-muted group-hover:text-foreground font-semibold shrink-0 bg-subsurface px-2 py-0.5 rounded-full border border-border">
                      Pilih
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {(currentRole === 'Super Admin' || currentRole === 'Owner') && (
            <div className="mt-2 pt-2 border-t border-border space-y-1.5">
              <Link
                to="/konsolidasi"
                onClick={() => setIsOpen(false)}
                className="w-full py-2 px-3 rounded-full bg-primary hover:bg-primary-hover text-[11px] font-bold text-primary-foreground flex items-center justify-between transition-all shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 size={13} />
                  <span>Konsolidasi Seluruh Outlet</span>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/20 text-primary-foreground font-mono">
                  All
                </span>
              </Link>

              <Link
                to={currentRole === 'Super Admin' && enableFounderConsole ? '/founder' : '/admin'}
                onClick={() => setIsOpen(false)}
                className="w-full py-2 px-3 rounded-full bg-subsurface hover:bg-surface-hover text-[11px] font-semibold text-foreground flex items-center justify-center gap-1.5 transition-all border border-border hover:border-border-hover"
              >
                <Plus size={13} />
                <span>{currentRole === 'Super Admin' && enableFounderConsole ? 'Kelola Outlet di Console' : 'Atur Toko di Admin'}</span>
              </Link>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
