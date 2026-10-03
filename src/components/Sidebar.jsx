import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TenantSwitcher from './TenantSwitcher'
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Car, 
  DollarSign, 
  Settings, 
  ShieldAlert,
  LogOut, 
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Users,
  Database,
  FileText,
  UserCheck,
  Boxes,
  Building2
} from 'lucide-react'

import { getTenantFeatures } from '../utils/businessCapabilities'

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const location = useLocation()
  const { profile, activeTenant, logout } = useAuth()
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef(null)
  const currentRole = profile?.role || 'Kasir'
  const currentBusinessType = activeTenant?.business_type || 'HYBRID'
  const features = getTenantFeatures(currentBusinessType)

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  const isItemVisible = (item) => {
    if (item.allowedRoles && Array.isArray(item.allowedRoles)) {
      if (!item.allowedRoles.includes(currentRole)) return false
    }
    if (item.ownerOnly && currentRole !== 'Owner') {
      return false
    }
    if (item.requiresFeature && !features[item.requiresFeature]) {
      return false
    }
    if (item.allowedBusinessTypes && Array.isArray(item.allowedBusinessTypes)) {
      if (!item.allowedBusinessTypes.includes(currentBusinessType)) return false
    }
    return true
  }

  const getRoleBadgeStyle = (role) => {
    if (role === 'Owner') return 'bg-[#ffc71f]/15 text-[#ffc71f] border border-[#ffc71f]/30'
    if (role === 'Admin' || role === 'Super Admin') return 'bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30'
    return 'bg-[#00ffff]/10 text-[#00ffff] border border-[#00ffff]/20'
  }

  const navSections = [
    {
      title: 'UTAMA',
      items: [
        {
          name: 'Dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          allowedRoles: ['Owner']
        }
      ]
    },
    {
      title: 'OPERASIONAL KASIR',
      items: [
        {
          name: 'Kasir POS',
          path: '/pos',
          icon: ShoppingCart,
          allowedRoles: ['Owner', 'Admin', 'Kasir']
        },
        {
          name: 'Antrean Carwash',
          path: '/queue',
          icon: Car,
          allowedRoles: ['Owner', 'Admin', 'Kasir'],
          requiresFeature: 'hasQueue'
        },
        {
          name: 'Pelanggan & CRM',
          path: '/crm',
          icon: UserCheck,
          allowedRoles: ['Owner', 'Admin'],
          requiresFeature: 'hasCRM'
        }
      ]
    },
    {
      title: 'KEUANGAN & AKUNTANSI',
      items: [
        {
          name: 'Buku Kas Keuangan',
          path: '/finance',
          icon: DollarSign,
          allowedRoles: ['Owner', 'Admin']
        },
        {
          name: 'Laporan Akuntansi',
          path: '/reports',
          icon: FileText,
          allowedRoles: ['Owner']
        }
      ]
    },
    {
      title: 'LOGISTIK & SDM',
      items: [
        {
          name: 'Multi-Gudang & Stok',
          path: '/gudang',
          icon: Boxes,
          allowedRoles: ['Owner', 'Admin', 'Kasir']
        },
        {
          name: 'Karyawan & Komisi',
          path: '/karyawan',
          icon: Users,
          allowedRoles: ['Owner', 'Admin']
        },
        {
          name: 'Database Master',
          path: '/database',
          icon: Database,
          allowedRoles: ['Owner', 'Admin']
        }
      ]
    },
    {
      title: 'SISTEM',
      items: [
        {
          name: 'Kelola Admin',
          path: '/admin',
          icon: Settings,
          allowedRoles: ['Owner', 'Super Admin']
        },
        {
          name: 'Console Founder',
          path: '/founder',
          icon: ShieldAlert,
          allowedRoles: ['Super Admin']
        }
      ]
    }
  ]

  const activeClass = 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-xs'
  const inactiveClass = 'text-[#bbcbb2] hover:bg-[#1b1b1d] hover:text-white border border-transparent'

  return (
    <>
      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 left-0 right-0 h-14 bg-[#000000] border-b border-[#26272d] flex items-center justify-between px-4 z-30 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#1b1b1d] border border-[#26272d] flex items-center justify-center shrink-0">
            <span className="font-bold text-sm text-[#00ffff]">R</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-xs tracking-wider text-white truncate uppercase">
              RELAYPOS
            </h1>
            <p className="text-[9px] text-[#bbcbb2] font-semibold uppercase tracking-wider truncate max-w-[150px]">
              {activeTenant?.nama || 'Cloud POS & ERP'}
            </p>
          </div>
        </div>

        {/* Mobile Header Buttons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowMobileNav(!showMobileNav)}
            className={`p-2 rounded-lg border transition-all active:scale-95 flex items-center justify-center cursor-pointer ${
              showMobileNav 
                ? 'bg-[#00ffff]/20 border-[#00ffff] text-[#00ffff]' 
                : 'bg-[#1b1b1d] border-[#26272d] text-[#bbcbb2] hover:text-white'
            }`}
            title="Menu Navigasi"
          >
            {showMobileNav ? <X size={16} strokeWidth={1.75} /> : <Menu size={16} strokeWidth={1.75} />}
          </button>
        </div>

        {/* Mobile Nav Dropdown Popover */}
        {showMobileNav && (
          <div className="absolute top-16 right-4 w-64 bg-[#121215] border border-[#26272d] rounded-2xl p-3 shadow-2xl z-40 animate-pop-in flex flex-col gap-2 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain pb-6">
            {/* Mobile User Profile Header */}
            <div className="p-2.5 rounded-xl bg-[#18181c] border border-[#26272d] flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#26272d] border border-[#3f414a] flex items-center justify-center text-[#bbcbb2] shrink-0">
                  <User size={15} />
                </div>
                <div className="overflow-hidden min-w-0">
                  <p className="font-semibold text-xs truncate text-white">{profile?.nama || 'Pengguna'}</p>
                  <span className={`text-[8px] px-2 py-0.5 rounded font-bold uppercase inline-block mt-0.5 ${getRoleBadgeStyle(currentRole)}`}>
                    {currentRole}
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Tenant Switcher */}
            <div className="mb-2">
              <TenantSwitcher isCollapsed={false} />
            </div>

            {navSections.map((section, sIdx) => {
              const visibleItems = section.items.filter(isItemVisible)
              if (visibleItems.length === 0) return null

              return (
                <div key={section.title || sIdx} className="space-y-1">
                  <p className="text-[9px] text-[#6b7367] font-bold uppercase tracking-wider px-2 pt-1">{section.title}</p>
                  {visibleItems.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.path

                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        onClick={() => setShowMobileNav(false)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-all active:scale-[0.98] ${
                          isActive 
                            ? 'bg-[#00ffff] text-[#0f0f0f] font-bold' 
                            : 'text-[#bbcbb2] hover:bg-[#1b1b1d] hover:text-white'
                        }`}
                      >
                        <Icon size={15} />
                        <span>{item.name}</span>
                      </Link>
                    )
                  })}
                </div>
              )
            })}
            <div className="h-[1px] w-full bg-[#26272d] my-1"></div>
            <button
              onClick={() => {
                setShowMobileNav(false)
                logout()
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-[#ff5102] hover:bg-[#ff5102]/10 transition-colors w-full text-left font-bold cursor-pointer"
            >
              <LogOut size={15} />
              <span>Keluar Aplikasi</span>
            </button>
          </div>
        )}

      </header>

      {/* Sidebar untuk Desktop & Tablet */}
      <aside className={`hidden md:flex flex-col ${isCollapsed ? 'w-[72px]' : 'w-64'} h-full shrink-0 bg-[#000000] border-r border-[#26272d] text-white z-30 transition-[width] duration-200 ease-in-out`}>
        {/* Logo/Header */}
        <div className={`p-3.5 border-b border-[#26272d] flex items-center ${isCollapsed ? 'justify-center' : 'justify-between gap-3'} relative shrink-0`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
            <div className="w-8 h-8 rounded-md bg-[#1b1b1d] border border-[#26272d] flex items-center justify-center shrink-0 shadow-xs">
              <span className="font-bold text-sm text-[#00ffff]">R</span>
            </div>
            {!isCollapsed && (
              <div className="min-w-0 animate-fade-in">
                <h1 className="font-bold text-xs tracking-wider text-white truncate uppercase">
                  RELAYPOS
                </h1>
                <p className="text-[10px] text-[#bbcbb2] font-medium uppercase tracking-wider truncate max-w-[130px] mt-0.5">
                  {activeTenant?.nama || 'Cloud POS & ERP'}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`p-1.5 rounded-md bg-[#1b1b1d] border border-[#26272d] text-[#bbcbb2] hover:text-white transition-all hover:bg-[#242428] cursor-pointer ${
              isCollapsed 
                ? 'absolute -right-3 top-3.5 z-50 shadow-md bg-[#1b1b1d] border-[#3f414a] text-[#00ffff]' 
                : ''
            }`}
            title={isCollapsed ? 'Perlebar Sidebar (Expand)' : 'Perkecil Sidebar (Collapse)'}
          >
            {isCollapsed ? <ChevronRight size={14} strokeWidth={1.75} /> : <ChevronLeft size={14} strokeWidth={1.75} />}
          </button>
        </div>

        {/* Konten Scrollable: Profil Interaktif, Navigasi, & Switcher Tema */}
        <div 
          className="flex-1 min-h-0 overflow-y-auto overflow-x-visible overscroll-contain px-3 pt-3 pb-24 space-y-3 select-none touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Jembatan Cepat Kembali ke Portal Eksekutif HQ (Hanya untuk Owner & Super Admin) */}
          {(currentRole === 'Owner' || currentRole === 'Super Admin') && (
            <Link
              to="/konsolidasi"
              className={`rounded-xl bg-[#121215] hover:bg-[#18181c] border border-[#26272d] hover:border-[#3f414a] text-left flex items-center ${
                isCollapsed ? 'w-10 h-10 mx-auto justify-center p-0' : 'w-full p-2.5 justify-between'
              } transition-all group shadow-xs tap-tactile`}
              title="Kembali ke Portal Eksekutif Holding HQ"
            >
              {isCollapsed ? (
                <div className="w-6 h-6 rounded-lg bg-[#18181c] text-[#00ffff] flex items-center justify-center font-bold shrink-0 border border-[#26272d]">
                  <Building2 size={12} strokeWidth={1.75} />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-[#18181c] text-[#00ffff] flex items-center justify-center font-bold shrink-0 border border-[#26272d]">
                      <Building2 size={12} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-white group-hover:text-[#00ffff] transition-colors truncate">
                        Portal Holding HQ
                      </p>
                      <p className="text-[9px] text-[#bbcbb2] font-medium uppercase tracking-wider">
                        Konsolidasi Multi-Outlet
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={13} strokeWidth={1.75} className="text-[#bbcbb2] group-hover:translate-x-0.5 transition-transform shrink-0" />
                </>
              )}
            </Link>
          )}

          {/* Info Profil Interaktif (Klik untuk membuka menu Keluar Aplikasi) */}
          <div className="relative shrink-0" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={`rounded-xl bg-[#121215] border transition-all duration-150 flex items-center cursor-pointer tap-tactile ${
                isCollapsed 
                  ? 'w-10 h-10 mx-auto justify-center p-0' 
                  : 'w-full p-2.5 justify-between'
              } ${
                showProfileMenu 
                  ? 'border-[#00ffff] bg-[#18181c]' 
                  : 'border-[#26272d] hover:border-[#3f414a] hover:bg-[#18181c]'
              }`}
              title={isCollapsed ? `${profile?.nama || 'Pengguna'} (${currentRole}) - Klik untuk Keluar` : 'Klik profil untuk opsi akun / keluar'}
            >
              {isCollapsed ? (
                <div className="w-7 h-7 rounded-full bg-[#18181c] border border-[#26272d] flex items-center justify-center text-[#bbcbb2] shrink-0">
                  <User size={14} strokeWidth={1.75} />
                </div>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[#18181c] border border-[#26272d] flex items-center justify-center text-[#bbcbb2] shrink-0">
                    <User size={14} strokeWidth={1.75} />
                  </div>
                  <div className="overflow-hidden animate-fade-in text-left min-w-0">
                    <h2 className="font-semibold text-xs truncate text-white">{profile?.nama || 'Pengguna'}</h2>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase inline-block mt-0.5 ${getRoleBadgeStyle(currentRole)}`}>
                      {currentRole}
                    </span>
                  </div>
                </div>
              )}
              {!isCollapsed && (
                <ChevronDown 
                  size={13} 
                  strokeWidth={1.75}
                  className={`text-[#bbcbb2] transition-transform duration-150 shrink-0 ${showProfileMenu ? 'rotate-180 text-[#00ffff]' : ''}`} 
                />
              )}
            </button>

            {/* Profile Dropdown Popover */}
            {showProfileMenu && (
              <div className={`absolute z-50 bg-[#121215] border border-[#26272d] rounded-xl p-2 shadow-2xl animate-pop-in ${
                isCollapsed 
                  ? 'left-full top-0 ml-2 w-56' 
                  : 'top-full left-0 right-0 mt-2'
              }`}>
                <div className="p-2 border-b border-[#26272d] mb-1">
                  <p className="text-[9px] text-[#6b7367] font-bold uppercase tracking-wider">Akun Terhubung</p>
                  <p className="text-xs font-bold text-white truncate mt-0.5">{profile?.nama || 'Pengguna'}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ffff]"></span>
                    <span className="text-[10px] text-[#bbcbb2] font-medium">{currentRole} • Sesi Aktif</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowProfileMenu(false)
                    logout()
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-semibold text-[#ff5102] hover:bg-[#ff5102]/10 border border-transparent hover:border-[#ff5102]/30 transition-all tap-tactile text-left cursor-pointer"
                >
                  <LogOut size={14} strokeWidth={1.75} />
                  <span>Keluar Aplikasi</span>
                </button>
              </div>
            )}
          </div>

          {/* Tenant / Outlet Switcher */}
          <TenantSwitcher isCollapsed={isCollapsed} />

          {/* Menu Navigasi Grouped */}
          <nav className="space-y-4 pt-1">
            {navSections.map((section, sIdx) => {
              const visibleItems = section.items.filter(isItemVisible)
              if (visibleItems.length === 0) return null

              return (
                <div key={section.title || sIdx} className="space-y-0.5">
                  {!isCollapsed ? (
                    <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase flex items-center justify-between">
                      <span>{section.title}</span>
                    </div>
                  ) : (
                    <div className="h-[1px] bg-zinc-800/80 my-2 mx-2"></div>
                  )}

                  {visibleItems.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.path

                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        className={`flex items-center ${
                          isCollapsed 
                            ? 'w-10 h-10 mx-auto justify-center px-0' 
                            : 'w-full gap-2.5 px-3 py-2'
                        } rounded-lg text-xs transition-all duration-150 tap-tactile ${
                          isActive ? activeClass : inactiveClass
                        }`}
                        title={isCollapsed ? item.name : ''}
                      >
                        <Icon size={15} strokeWidth={1.75} className="shrink-0" />
                        {!isCollapsed && <span className="truncate">{item.name}</span>}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
