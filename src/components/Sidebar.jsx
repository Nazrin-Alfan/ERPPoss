import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppTheme } from '../context/ThemeContext'
import TenantSwitcher from './TenantSwitcher'
import RelayLogo from './brand/RelayLogo'
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
  Building2,
  Crown,
  KeyRound,
  MessageSquarePlus,
  BookOpen,
  Sun,
  Moon
} from 'lucide-react'

import { getTenantFeatures } from '../utils/businessCapabilities'
import { ROLES, ROLE_PERMISSIONS, getRoleDisplayLabel } from '../constants/roles'
import ChangePasswordModal from './auth/ChangePasswordModal'
import FeedbackModal from './common/FeedbackModal'

const ENABLE_FOUNDER_CONSOLE =
  import.meta.env?.VITE_ENABLE_FOUNDER_CONSOLE === 'true' ||
  import.meta.env?.MODE === 'test'

const MOBILE_BOTTOM_PRIORITY = [
  '/dashboard',
  '/pos',
  '/queue',
  '/finance',
  '/gudang',
  '/crm',
  '/reports',
  '/karyawan',
  '/admin'
]

const MOBILE_BOTTOM_LABELS = {
  '/dashboard': 'Home',
  '/pos': 'POS',
  '/queue': 'Antrean',
  '/finance': 'Kas',
  '/gudang': 'Gudang',
  '/crm': 'CRM',
  '/reports': 'Laporan',
  '/karyawan': 'Staf',
  '/admin': 'Admin'
}

const Sidebar = ({ isCollapsed, setIsCollapsed }) => {
  const location = useLocation()
  const { profile, activeTenant, logout, licenseStatus } = useAuth()
  const themeCtx = useAppTheme() || {}
  const resolvedMode = themeCtx.resolvedMode || 'dark'
  const toggleSurfaceMode = themeCtx.toggleSurfaceMode || (() => {})
  const [showMobileNav, setShowMobileNav] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const profileMenuRef = useRef(null)
  const currentRole = profile?.role || 'Kasir'
  const currentBusinessType = activeTenant?.business_type || 'HYBRID'
  const features = getTenantFeatures(currentBusinessType)

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
    if (item.ownerOnly && currentRole !== ROLES.OWNER) {
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
    if (role === ROLES.OWNER) return 'bg-warning-bg text-warning border border-warning/30'
    if (role === ROLES.ADMIN_PUSAT || role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) {
      return 'bg-primary-soft text-primary-soft-foreground border border-primary/30'
    }
    return 'bg-subsurface text-muted border border-border'
  }
  const currentRoleLabel = getRoleDisplayLabel(currentRole)

  const navSections = [
    {
      title: 'UTAMA',
      items: [
        {
          name: 'Dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          allowedRoles: ROLE_PERMISSIONS.CAN_VIEW_EXECUTIVE_DASHBOARD
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
          allowedRoles: ROLE_PERMISSIONS.CAN_ACCESS_POS
        },
        {
          name: 'Antrean Carwash',
          path: '/queue',
          icon: Car,
          allowedRoles: ROLE_PERMISSIONS.CAN_ACCESS_QUEUE,
          requiresFeature: 'hasQueue'
        },
        {
          name: 'Pelanggan & CRM',
          path: '/crm',
          icon: UserCheck,
          allowedRoles: ROLE_PERMISSIONS.CAN_ACCESS_CRM,
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
          allowedRoles: ROLE_PERMISSIONS.CAN_VIEW_FINANCE
        },
        {
          name: 'Laporan Akuntansi',
          path: '/reports',
          icon: FileText,
          allowedRoles: ROLE_PERMISSIONS.CAN_VIEW_REPORTS
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
          allowedRoles: ROLE_PERMISSIONS.CAN_VIEW_INVENTORY_STOCK
        },
        {
          name: 'Karyawan & Komisi',
          path: '/karyawan',
          icon: Users,
          allowedRoles: ROLE_PERMISSIONS.CAN_MANAGE_STAFF
        }
      ]
    },
    {
      title: 'SISTEM',
      items: [
        {
          name: 'Pengaturan Toko',
          path: '/admin',
          icon: Settings,
          allowedRoles: ROLE_PERMISSIONS.CAN_MANAGE_STORE_SETTINGS
        },
        ...(ENABLE_FOUNDER_CONSOLE ? [
          {
            name: 'Console Founder',
            path: '/founder',
            icon: ShieldAlert,
            allowedRoles: ROLE_PERMISSIONS.CAN_MANAGE_TENANTS
          },
          {
            name: 'Database Master (Dev)',
            path: '/database',
            icon: Database,
            allowedRoles: ROLE_PERMISSIONS.CAN_MANAGE_TENANTS
          }
        ] : [])
      ]
    }
  ]

  const activeClass = 'bg-primary text-primary-foreground font-bold shadow-xs'
  const inactiveClass = 'text-muted hover:bg-subsurface hover:text-foreground border border-transparent'

  const visibleNavItems = navSections.flatMap((section) => section.items.filter(isItemVisible))
  const mobilePrimaryTabs = MOBILE_BOTTOM_PRIORITY
    .map((priorityPath) => visibleNavItems.find((item) => item.path === priorityPath))
    .filter(Boolean)
    .slice(0, 4)

  return (
    <>
      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 left-0 right-0 h-14 bg-surface border-b border-border flex items-center justify-between px-4 z-30 animate-fade-in">
        <div className="flex items-center gap-2.5 min-w-0">
          <RelayLogo size="sm" />
          <div className="min-w-0">
            <h1 className="font-bold text-xs tracking-wider text-foreground truncate uppercase">
              RELAYPOS
            </h1>
            <p className="text-[9px] text-muted font-semibold uppercase tracking-wider truncate max-w-[150px]">
              {activeTenant?.nama || 'Cloud POS & ERP'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSurfaceMode}
            className="w-10 h-10 rounded-full bg-subsurface border border-border text-muted hover:text-foreground flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            title={resolvedMode === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
            aria-label="Ubah mode tema"
          >
            {resolvedMode === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          </button>

          <button
            type="button"
            onClick={() => setShowMobileNav(!showMobileNav)}
            className={`w-10 h-10 rounded-full border transition-all active:scale-95 flex items-center justify-center cursor-pointer ${
              showMobileNav
                ? 'bg-primary border-transparent text-primary-foreground'
                : 'bg-subsurface border-border text-muted hover:text-foreground'
            }`}
            title="Menu Navigasi"
          >
            {showMobileNav ? <X size={18} strokeWidth={1.75} /> : <Menu size={18} strokeWidth={1.75} />}
          </button>
        </div>

        {showMobileNav && (
          <>
            <div
              className="md:hidden fixed inset-0 top-14 bottom-16 bg-black/40 z-30"
              onClick={() => setShowMobileNav(false)}
            />
            <div className="fixed top-14 right-3 w-72 bg-surface border border-border rounded-2xl p-3 shadow-2xl z-40 animate-pop-in flex flex-col gap-2 max-h-[calc(100dvh-8.5rem)] overflow-y-auto overscroll-contain pb-6">
            <div className="p-2.5 rounded-xl bg-subsurface border border-border flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-muted shrink-0">
                  <User size={15} />
                </div>
                <div className="overflow-hidden min-w-0">
                  <p className="font-semibold text-xs truncate text-foreground">{profile?.nama || 'Pengguna'}</p>
                  <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase inline-block mt-0.5 ${getRoleBadgeStyle(currentRole)}`}>
                    {currentRoleLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-2">
              <TenantSwitcher isCollapsed={false} />
            </div>

            {(currentRole === ROLES.SUPER_ADMIN || profile?.is_super_admin) && ENABLE_FOUNDER_CONSOLE && (
              <Link
                to="/founder"
                onClick={() => setShowMobileNav(false)}
                className="flex items-center justify-between min-h-[44px] px-3.5 py-2 rounded-full bg-warning-bg hover:opacity-90 border border-warning/35 text-xs font-bold text-warning transition-all active:scale-[0.98]"
              >
                <span className="flex items-center gap-2">
                  <Crown size={15} strokeWidth={2} />
                  <span>Console Founder</span>
                </span>
                <ChevronRight size={14} />
              </Link>
            )}

            {navSections.map((section, sIdx) => {
              const visibleItems = section.items.filter(isItemVisible)
              if (visibleItems.length === 0) return null

              return (
                <div key={section.title || sIdx} className="space-y-1">
                  <p className="text-[9px] text-muted-dark font-bold uppercase tracking-wider px-2.5 pt-1">{section.title}</p>
                  {visibleItems.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.path

                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        onClick={() => setShowMobileNav(false)}
                        className={`flex items-center justify-between min-h-[44px] px-3.5 py-2 rounded-full text-xs transition-all active:scale-[0.98] ${
                          isActive ? activeClass : inactiveClass
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon size={17} strokeWidth={1.75} />
                          <span>{item.name}</span>
                        </span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#93C5FD] shrink-0" />}
                      </Link>
                    )
                  })}
                </div>
              )
            })}

            <div className="h-[1px] w-full bg-border my-1" />
            <Link
              to="/panduan"
              onClick={() => setShowMobileNav(false)}
              className="flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-full text-xs text-primary-soft-foreground bg-primary-soft hover:opacity-90 transition-colors w-full text-left font-semibold"
            >
              <BookOpen size={16} strokeWidth={1.75} />
              <span>Panduan Pengguna</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setShowMobileNav(false)
                setShowFeedbackModal(true)
              }}
              className="flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-full text-xs text-warning bg-warning-bg hover:opacity-90 transition-colors w-full text-left font-semibold cursor-pointer"
            >
              <MessageSquarePlus size={16} strokeWidth={1.75} />
              <span>Beri Masukan Beta</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMobileNav(false)
                setShowChangePasswordModal(true)
              }}
              className="flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-full text-xs text-foreground hover:bg-subsurface transition-colors w-full text-left font-semibold cursor-pointer"
            >
              <KeyRound size={16} strokeWidth={1.75} className="text-primary" />
              <span>Ganti Kata Sandi</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMobileNav(false)
                logout()
              }}
              className="flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-full text-xs text-destructive hover:bg-destructive-bg transition-colors w-full text-left font-bold cursor-pointer"
            >
              <LogOut size={16} strokeWidth={1.75} />
              <span>Keluar Aplikasi</span>
            </button>
            </div>
          </>
        )}
      </header>

      {/* Mobile Bottom Navigation Bar (< 768px, RBAC-aware 4 priority routes + Menu trigger) */}
      <nav
        aria-label="Navigasi Mobile"
        data-testid="mobile-bottom-nav"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-surface/95 backdrop-blur-md border-t border-border px-2 flex items-center justify-around"
      >
        {mobilePrimaryTabs.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          const shortLabel = MOBILE_BOTTOM_LABELS[item.path] || item.name

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setShowMobileNav(false)}
              className="min-w-[56px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all active:scale-[0.96]"
            >
              <span
                className={`w-10 h-6 rounded-full flex items-center justify-center transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted'
                }`}
              >
                <Icon size={17} strokeWidth={1.75} />
              </span>
              <span
                className={`text-[10px] leading-tight ${
                  isActive ? 'text-primary font-bold' : 'text-muted font-medium'
                }`}
              >
                {shortLabel}
              </span>
            </Link>
          )
        })}

        <button
          type="button"
          data-testid="mobile-bottom-nav-menu"
          onClick={() => setShowMobileNav((prev) => !prev)}
          aria-label="Buka Menu Navigasi"
          className="min-w-[56px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all active:scale-[0.96] cursor-pointer"
        >
          <span
            className={`w-10 h-6 rounded-full flex items-center justify-center transition-colors ${
              showMobileNav ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted'
            }`}
          >
            {showMobileNav ? <X size={17} strokeWidth={1.75} /> : <Menu size={17} strokeWidth={1.75} />}
          </span>
          <span
            className={`text-[10px] leading-tight ${
              showMobileNav ? 'text-primary font-bold' : 'text-muted font-medium'
            }`}
          >
            Menu
          </span>
        </button>
      </nav>

      {/* Desktop & Tablet Sidebar (240px Expanded / 72px Vector Icon-Rail) */}
      <aside
        className={`hidden md:flex flex-col ${
          isCollapsed ? 'w-[72px]' : 'w-60'
        } h-full shrink-0 bg-surface border-r border-border text-foreground z-30 transition-[width] duration-200 ease-in-out`}
      >
        {/* Logo/Header */}
        <div
          className={`p-3.5 border-b border-border flex items-center ${
            isCollapsed ? 'justify-center' : 'justify-between gap-2.5'
          } relative shrink-0`}
        >
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
            <RelayLogo size={isCollapsed ? 'sm' : 'md'} />
            {!isCollapsed && (
              <div className="min-w-0 animate-fade-in">
                <h1 className="font-extrabold text-xs tracking-wider text-foreground truncate uppercase">
                  RELAYPOS
                </h1>
                <p className="text-[10px] text-muted font-medium uppercase tracking-wider truncate max-w-[125px] mt-0.5">
                  {activeTenant?.nama || 'Cloud POS & ERP'}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`w-8 h-8 rounded-full bg-subsurface border border-border text-muted hover:text-foreground hover:border-border-hover flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              isCollapsed ? 'absolute -right-3.5 top-4 z-50 shadow-md bg-surface border-border-hover text-primary' : ''
            }`}
            title={isCollapsed ? 'Perlebar Sidebar (Expand)' : 'Perkecil Sidebar (Collapse)'}
          >
            {isCollapsed ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronLeft size={14} strokeWidth={2} />}
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overflow-x-visible overscroll-contain px-3 pt-3 pb-24 space-y-3 select-none touch-pan-y custom-scrollbar"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Console Founder Bridge (Super Admin Only) */}
          {(currentRole === ROLES.SUPER_ADMIN || profile?.is_super_admin) && ENABLE_FOUNDER_CONSOLE && (
            <Link
              to="/founder"
              data-testid="founder-quick-bridge"
              className={`bg-warning-bg hover:opacity-90 border border-warning/35 text-left flex items-center transition-all group shadow-xs tap-tactile active:scale-[0.98] ${
                isCollapsed ? 'w-12 h-12 mx-auto justify-center p-0 rounded-full' : 'w-full min-h-[44px] px-3 py-2 justify-between rounded-2xl'
              }`}
              title="Buka Console Founder (Super Admin)"
            >
              {isCollapsed ? (
                <Crown size={20} strokeWidth={1.75} className="text-warning" />
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-surface text-warning flex items-center justify-center shrink-0 border border-warning/30">
                      <Crown size={14} strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-warning truncate">
                        Console Founder
                      </p>
                      <p className="text-[9px] text-muted font-medium uppercase tracking-wider">
                        Platform Super Admin
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={14} strokeWidth={1.75} className="text-warning group-hover:translate-x-0.5 transition-transform shrink-0" />
                </>
              )}
            </Link>
          )}

          {/* Holding HQ Consolidation Bridge */}
          {(currentRole === 'Owner' || currentRole === 'Super Admin') && (
            <Link
              to="/konsolidasi"
              className={`bg-subsurface hover:bg-surface-hover border border-border hover:border-border-hover text-left flex items-center transition-all group shadow-xs tap-tactile ${
                isCollapsed ? 'w-12 h-12 mx-auto justify-center p-0 rounded-full' : 'w-full min-h-[44px] px-3 py-2 justify-between rounded-2xl'
              }`}
              title="Kembali ke Portal Eksekutif Holding HQ"
            >
              {isCollapsed ? (
                <Building2 size={20} strokeWidth={1.75} className="text-primary" />
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center shrink-0 border border-primary/20">
                      <Building2 size={14} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        Portal Holding HQ
                      </p>
                      <p className="text-[9px] text-muted font-medium uppercase tracking-wider">
                        Konsolidasi Multi-Outlet
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={14} strokeWidth={1.75} className="text-muted group-hover:translate-x-0.5 transition-transform shrink-0" />
                </>
              )}
            </Link>
          )}

          {/* Profile Card */}
          <div className="relative shrink-0" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={`bg-subsurface border transition-all duration-150 flex items-center cursor-pointer tap-tactile ${
                isCollapsed
                  ? 'w-12 h-12 mx-auto justify-center p-0 rounded-full'
                  : 'w-full min-h-[44px] px-3 py-2 justify-between rounded-2xl'
              } ${
                showProfileMenu
                  ? 'border-ring bg-selected-surface'
                  : 'border-border hover:border-border-hover'
              }`}
              title={isCollapsed ? `${profile?.nama || 'Pengguna'} (${currentRole}) - Klik untuk Keluar` : 'Klik profil untuk opsi akun / keluar'}
            >
              {isCollapsed ? (
                <User size={20} strokeWidth={1.75} className="text-muted" />
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-ink text-ink-foreground flex items-center justify-center shrink-0">
                    <User size={14} strokeWidth={1.75} />
                  </div>
                  <div className="overflow-hidden animate-fade-in text-left min-w-0">
                    <h2 className="font-bold text-xs truncate text-foreground">{profile?.nama || 'Pengguna'}</h2>
                    <span className={`text-[9px] px-2 py-0.2 rounded-full font-bold uppercase inline-block mt-0.5 ${getRoleBadgeStyle(currentRole)}`}>
                      {currentRoleLabel}
                    </span>
                  </div>
                </div>
              )}
              {!isCollapsed && (
                <ChevronDown
                  size={14}
                  strokeWidth={1.75}
                  className={`text-muted transition-transform duration-150 shrink-0 ${showProfileMenu ? 'rotate-180 text-primary' : ''}`}
                />
              )}
            </button>

            {showProfileMenu && (
              <div
                className={`absolute z-50 bg-surface border border-border rounded-2xl p-2 shadow-2xl animate-pop-in ${
                  isCollapsed ? 'left-full top-0 ml-2 w-56' : 'top-full left-0 right-0 mt-2'
                }`}
              >
                <div className="p-2 border-b border-border mb-1">
                  <p className="text-[9px] text-muted-dark font-bold uppercase tracking-wider">Akun Terhubung</p>
                  <p className="text-xs font-bold text-foreground truncate mt-0.5">{profile?.nama || 'Pengguna'}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-muted font-medium">{currentRoleLabel} • Sesi Aktif</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false)
                    setShowChangePasswordModal(true)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-subsurface transition-all tap-tactile text-left cursor-pointer mb-1"
                >
                  <KeyRound size={14} strokeWidth={1.75} className="text-primary" />
                  <span>Ganti Kata Sandi</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false)
                    logout()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive-bg transition-all tap-tactile text-left cursor-pointer"
                >
                  <LogOut size={14} strokeWidth={1.75} />
                  <span>Keluar Aplikasi</span>
                </button>
              </div>
            )}
          </div>

          <TenantSwitcher isCollapsed={isCollapsed} />

          {licenseStatus?.isTrial && !isCollapsed && (
            <div className="px-3 py-1.5 rounded-full bg-warning-bg border border-warning/25 text-[10px] flex items-center justify-between">
              <span className="text-warning font-semibold">Trial {licenseStatus.daysRemaining} Hari</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-bold uppercase">Uji Coba</span>
            </div>
          )}

          {!isCollapsed && (
            <div
              className="px-2.5 py-1.5 rounded-full bg-subsurface border border-border text-[9px] text-muted flex items-center justify-between font-mono"
              title={`Build Time: ${import.meta.env.VITE_BUILD_TIME || 'Live'}`}
            >
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>RelayPOS Cloud</span>
              </span>
              <span className="text-primary-soft-foreground font-bold">
                {import.meta.env.VITE_BUILD_COMMIT || 'latest'}
              </span>
            </div>
          )}

          {/* Grouped Navigation */}
          <nav className="space-y-4 pt-1">
            {navSections.map((section, sIdx) => {
              const visibleItems = section.items.filter(isItemVisible)
              if (visibleItems.length === 0) return null

              return (
                <div key={section.title || sIdx} className="space-y-1">
                  {!isCollapsed ? (
                    <div className="px-3 py-1 text-[10px] font-bold tracking-wider text-muted-dark uppercase">
                      <span>{section.title}</span>
                    </div>
                  ) : (
                    <div className="h-[1px] bg-border my-2 mx-2" />
                  )}

                  {visibleItems.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.path

                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        className={`flex items-center transition-all duration-150 tap-tactile rounded-full ${
                          isCollapsed
                            ? 'w-12 h-12 mx-auto justify-center p-0'
                            : 'w-full min-h-[44px] justify-between px-3.5 py-2 text-xs'
                        } ${isActive ? activeClass : inactiveClass}`}
                        title={isCollapsed ? item.name : ''}
                      >
                        {isCollapsed ? (
                          <Icon size={20} strokeWidth={1.75} className="shrink-0" />
                        ) : (
                          <>
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
                              <span className="truncate">{item.name}</span>
                            </span>
                            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#93C5FD] shrink-0" />}
                          </>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )
            })}
          </nav>
        </div>

        {/* Footer Bantuan, Mode Tema & Masukan Beta */}
        <div className="p-2.5 border-t border-border shrink-0 space-y-1.5 bg-surface">
          <button
            type="button"
            onClick={toggleSurfaceMode}
            title={resolvedMode === 'dark' ? 'Beralih ke Mode Terang (Light)' : 'Beralih ke Mode Gelap (Carbon D1)'}
            className={`flex items-center rounded-full text-xs font-semibold text-muted hover:text-foreground bg-subsurface hover:bg-surface-hover border border-border transition-all active:scale-[0.98] cursor-pointer ${
              isCollapsed ? 'w-11 h-11 mx-auto justify-center p-0' : 'w-full min-h-[40px] justify-between px-3.5 py-2'
            }`}
          >
            <span className="flex items-center gap-2.5">
              {resolvedMode === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
              {!isCollapsed && <span>{resolvedMode === 'dark' ? 'Mode Terang' : 'Mode Gelap'}</span>}
            </span>
            {!isCollapsed && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface border border-border text-muted">
                {resolvedMode === 'dark' ? 'D1' : 'Light'}
              </span>
            )}
          </button>

          <Link
            to="/panduan"
            title={isCollapsed ? 'Panduan Pengguna (User Manual)' : ''}
            className={`flex items-center rounded-full text-xs font-semibold text-primary-soft-foreground bg-primary-soft hover:opacity-90 border border-primary/20 transition-all active:scale-[0.98] ${
              isCollapsed ? 'w-11 h-11 mx-auto justify-center p-0' : 'w-full min-h-[40px] gap-2.5 px-3.5 py-2'
            }`}
          >
            <BookOpen size={16} strokeWidth={1.75} className="shrink-0" />
            {!isCollapsed && <span className="truncate">Panduan Pengguna</span>}
          </Link>

          <button
            type="button"
            onClick={() => setShowFeedbackModal(true)}
            title={isCollapsed ? 'Beri Masukan Beta' : ''}
            className={`flex items-center rounded-full text-xs font-semibold text-warning bg-warning-bg hover:opacity-90 border border-warning/25 transition-all active:scale-[0.98] cursor-pointer ${
              isCollapsed ? 'w-11 h-11 mx-auto justify-center p-0' : 'w-full min-h-[40px] gap-2.5 px-3.5 py-2'
            }`}
          >
            <MessageSquarePlus size={16} strokeWidth={1.75} className="shrink-0" />
            {!isCollapsed && <span className="truncate">Beri Masukan</span>}
          </button>
        </div>
      </aside>

      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />

      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />
    </>
  )
}

export default Sidebar
