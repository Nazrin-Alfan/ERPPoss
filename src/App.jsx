import React, { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import ExecutiveLayout from './components/layout/ExecutiveLayout'
import FounderLayout from './components/layout/FounderLayout'
import LicenseExpiredLockout from './components/auth/LicenseExpiredLockout'
import ActivateLicenseModal from './components/auth/ActivateLicenseModal'
import { ShieldAlert } from 'lucide-react'
import { BUSINESS_TYPES, getTenantFeatures } from './utils/businessCapabilities'
import { ROLES, ROLE_PERMISSIONS, getRoleLandingRoute } from './constants/roles'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CafePOS from './pages/CafePOS'
import CarwashQueue from './pages/CarwashQueue'
import Finance from './pages/Finance'
import Admin from './pages/Admin'
import Karyawan from './pages/Karyawan'
import Reports from './pages/Reports'
import CRM from './pages/CRM'
import Gudang from './pages/Gudang'
import Konsolidasi from './pages/Konsolidasi'

// Lazy load untuk modul super-admin/setup khusus
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'))
const Founder = lazy(() => import('./pages/Founder'))
const Database = lazy(() => import('./pages/Database'))

const PageLoader = () => (
  <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-400">
    <div className="w-10 h-10 border-3 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Memuat Halaman...</p>
  </div>
)

// Komponen Proteksi Rute berdasarkan Login, Peran, Lisensi Tenant & Kapabilitas Fitur
const ProtectedRoute = ({ children, allowedRoles = null, ownerOnly = false, requiredFeature = null, allowedBusinessTypes = null }) => {
  const { user, profile, activeTenant, loading, licenseStatus, userTenants } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-12 h-12 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">Memvalidasi Akses...</p>
      </div>
    )
  }

  // Jika belum login, arahkan ke login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Selesaikan role pengguna dari profile atau user metadata dengan fallback aman
  const role = profile?.role || user?.role || user?.user_metadata?.role || ROLES.KASIR
  const isSuperAdmin = role === ROLES.SUPER_ADMIN || profile?.is_super_admin
  const features = getTenantFeatures(activeTenant?.business_type)
  const defaultLanding = getRoleLandingRoute(role, {
    tenantCount: userTenants?.length || 1,
    hasQueue: Boolean(features.hasQueue)
  })

  // GLOBAL LICENSE GUARD / PAYWALL LOCKOUT
  // Jika lisensi telah habis/expired dan bukan Super Admin, kunci akses operasional!
  if (!isSuperAdmin && licenseStatus?.isExpired) {
    return <LicenseExpiredLockout />
  }

  // Jika rute menetapkan allowedRoles, verifikasi apakah user memiliki salah satu peran tersebut
  if (allowedRoles && Array.isArray(allowedRoles) && !allowedRoles.includes(role)) {
    return <Navigate to={defaultLanding} replace />
  }

  // Kompatibilitas mundur untuk properti ownerOnly
  if (ownerOnly && role !== ROLES.OWNER) {
    return <Navigate to={defaultLanding} replace />
  }

  // Verifikasi kapabilitas model bisnis tenant (misal: antrean & CRM hanya untuk Carwash/Hybrid)
  if (requiredFeature) {
    if (!features[requiredFeature]) {
      return <Navigate to={defaultLanding} replace />
    }
  }

  if (allowedBusinessTypes && Array.isArray(allowedBusinessTypes)) {
    const currentType = String(activeTenant?.business_type || 'HYBRID').toUpperCase()
    if (!allowedBusinessTypes.includes(currentType)) {
      return <Navigate to={defaultLanding} replace />
    }
  }

  return children
}

// Komponen Smart Landing Dispatcher di Rute Root (/)
const RootDispatcher = () => {
  const { user, profile, loading, userTenants, activeTenant } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="w-12 h-12 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">Menyiapkan Ruang Kerja...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const role = profile?.role || user?.role || user?.user_metadata?.role || ROLES.OWNER
  const features = getTenantFeatures(activeTenant?.business_type)
  const landingRoute = getRoleLandingRoute(role, {
    tenantCount: userTenants?.length || 1,
    hasQueue: Boolean(features.hasQueue)
  })

  return <Navigate to={landingRoute} replace />
}

export const AppContent = () => {
  const { user, loading, profile, licenseStatus } = useAuth()
  const location = useLocation()
  const [showActivateModal, setShowActivateModal] = useState(false)
  const isSuperAdmin = profile?.role === ROLES.SUPER_ADMIN || profile?.is_super_admin
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('relaypos_sidebar_collapsed')
      if (saved !== null) return saved === 'true'
      return window.innerWidth < 1024
    }
    return false
  })
  const [slowLoading, setSlowLoading] = useState(false)

  useEffect(() => {
    let timer
    if (loading) {
      timer = setTimeout(() => {
        setSlowLoading(true)
      }, 2500)
    } else {
      setSlowLoading(false)
    }
    return () => clearTimeout(timer)
  }, [loading])

  const handleSetSidebarCollapsed = (collapsed) => {
    setIsSidebarCollapsed(collapsed)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('relaypos_sidebar_collapsed', String(collapsed))
    }
  }

  // Cek apakah sedang berada di Halaman Mandiri tanpa Sidebar (Login, Konsolidasi, Founder Cockpit)
  const isStandalonePage = location.pathname === '/login' || location.pathname === '/konsolidasi' || location.pathname === '/founder'
  const showSidebar = !!user && !isStandalonePage

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#000000] text-white px-4">
        <div className="w-12 h-12 border-4 border-[#00ffff] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-semibold text-[#bbcbb2] uppercase tracking-widest">Memuat Sesi...</p>
        {slowLoading && (
          <div className="mt-5 flex flex-col items-center gap-2 text-center animate-fade-in">
            <p className="text-[11px] text-zinc-400">Sinkronisasi memakan waktu lebih lama dari biasanya...</p>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 transition-all active:scale-[0.98]"
              >
                Muat Ulang
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('relaypos_active_tenant_id')
                  } catch (_) {}
                  window.location.href = '/login'
                }}
                className="px-3 py-1.5 rounded-lg bg-[#00ffff]/20 hover:bg-[#00ffff]/30 text-[#00ffff] text-xs font-medium border border-[#00ffff]/40 transition-all active:scale-[0.98]"
              >
                Ke Halaman Login
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full max-w-full bg-[#000000] text-white flex flex-col md:flex-row overflow-x-hidden">
      {/* Render Sidebar jika sudah login dan bukan di halaman mandiri */}
      {showSidebar && <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={handleSetSidebarCollapsed} />}

      {/* Konten Utama Aplikasi */}
      <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-[#000000] relative flex flex-col">
        {/* Trial Countdown & Expiry Banner */}
        {user && !isStandalonePage && !isSuperAdmin && !licenseStatus?.isExpired && (
          <>
            {licenseStatus?.isTrial && licenseStatus?.isActive && (
              <div className="bg-[#121215] border-b border-[#26272d] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 z-20">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
                  <span className="font-semibold text-white">Mode Trial 14 Hari:</span>
                  <span className="text-[#bbcbb2]">
                    Tersisa <strong className="text-amber-400 font-mono font-bold">{licenseStatus.daysRemaining} hari</strong> masa uji coba gratis.
                  </span>
                </div>
                <button
                  onClick={() => setShowActivateModal(true)}
                  className="px-2.5 py-1 rounded bg-[#00ffff] hover:bg-[#00e5e5] text-black font-bold text-[11px] transition-all active:scale-[0.98] cursor-pointer"
                >
                  Aktivasi Lisensi Resmi
                </button>
              </div>
            )}

            {licenseStatus?.isGracePeriod && (
              <div className="bg-rose-950/40 border-b border-rose-500/30 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-rose-300 shrink-0 z-20">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={14} className="text-rose-400 shrink-0" />
                  <span>
                    <strong>Masa Aktif Habis!</strong> Tersisa tenggang <strong className="text-rose-400 font-mono">{licenseStatus.graceDaysRemaining} hari</strong> sebelum sistem terkunci.
                  </span>
                </div>
                <button
                  onClick={() => setShowActivateModal(true)}
                  className="px-2.5 py-1 rounded bg-rose-500 hover:bg-rose-600 text-white font-bold text-[11px] transition-all active:scale-[0.98] cursor-pointer"
                >
                  Perpanjang Sekarang
                </button>
              </div>
            )}
          </>
        )}

        <div className="relative z-10 flex-1 min-h-0">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
              {/* Rute Login: Selalu dapat diakses langsung */}
              <Route path="/login" element={<Login />} />

              {/* Rute Root Aplikasi: Smart Landing Dispatcher Berdasarkan Peran */}
              <Route path="/" element={<RootDispatcher />} />

              {/* Rute Dashboard Executive Cabang Terpilih (Owner & Super Admin) */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_VIEW_EXECUTIVE_DASHBOARD}>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Konsolidasi Portofolio Multi-Outlet (Owner & Super Admin - Dedicated Executive Layout) */}
              <Route 
                path="/konsolidasi" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_VIEW_CONSOLIDATION}>
                    <ExecutiveLayout>
                      <Konsolidasi />
                    </ExecutiveLayout>
                  </ProtectedRoute>
                } 
              />

              {/* Rute POS (Owner, Admin, & Kasir) */}
              <Route 
                path="/pos" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_ACCESS_POS}>
                    <CafePOS />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Antrean Carwash (Owner, Admin, & Kasir - Khusus Carwash & Hybrid) */}
              <Route 
                path="/queue" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_ACCESS_QUEUE} requiredFeature="hasQueue">
                    <CarwashQueue />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Keuangan Operasional (Owner & Admin) */}
              <Route 
                path="/finance" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_VIEW_FINANCE}>
                    <Finance />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Laporan Akuntansi Resmi SAK EMKM (Owner Only) */}
              <Route 
                path="/reports" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_VIEW_REPORTS}>
                    <Reports />
                  </ProtectedRoute>
                } 
              />

              {/* Rute CRM & Pelanggan (Owner & Admin - Khusus Kendaraan: Carwash & Hybrid) */}
              <Route 
                path="/crm" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_ACCESS_CRM} requiredFeature="hasCRM">
                    <CRM />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Kelola Karyawan & Gaji (Owner & Admin) */}
              <Route 
                path="/karyawan" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_MANAGE_STAFF}>
                    <Karyawan />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Kelola Master Admin & Sistem (Owner Only) */}
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_MANAGE_STORE_SETTINGS}>
                    <Admin />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Solo Founder Platform Mission Control (HANYA Super Admin / Founder) */}
              <Route 
                path="/founder" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_MANAGE_TENANTS}>
                    <FounderLayout>
                      <Founder />
                    </FounderLayout>
                  </ProtectedRoute>
                } 
              />

              {/* Rute Solo Founder Platform Console Legacy (Redirect ke /founder - HANYA Super Admin) */}
              <Route 
                path="/super-admin" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_MANAGE_TENANTS}>
                    <Navigate to="/founder" replace />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Manajemen Multi-Gudang (Cafe, Carwash, Merchandise) */}
              <Route 
                path="/gudang" 
                element={
                  <ProtectedRoute allowedRoles={ROLE_PERMISSIONS.CAN_VIEW_INVENTORY_STOCK}>
                    <Gudang />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/inventory" 
                element={<Navigate to="/gudang" replace />} 
              />

              {/* Rute Database Master Raw Spreadsheet (Developer / Super Admin Saja) */}
              <Route 
                path="/database" 
                element={
                  <ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN]}>
                    <Database />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Catch-All */}
              <Route 
                path="*" 
                element={<Navigate to={user ? (profile?.role === ROLES.OWNER ? '/' : '/pos') : '/login'} replace />} 
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Modal Aktivasi Lisensi */}
      <ActivateLicenseModal
        isOpen={showActivateModal}
        onClose={() => setShowActivateModal(false)}
      />
      </main>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
