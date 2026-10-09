import React, { useState, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import ExecutiveLayout from './components/layout/ExecutiveLayout'
import FounderLayout from './components/layout/FounderLayout'
import { BUSINESS_TYPES, getTenantFeatures } from './utils/businessCapabilities'
import { ROLES } from './constants/roles'

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

// Komponen Proteksi Rute berdasarkan Login & Peran (Role RBAC: Owner, Admin, Kasir) serta Kapabilitas Tenant
const ProtectedRoute = ({ children, allowedRoles = null, ownerOnly = false, requiredFeature = null, allowedBusinessTypes = null }) => {
  const { user, profile, activeTenant, loading } = useAuth()

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

  // Jika rute menetapkan allowedRoles, verifikasi apakah user memiliki salah satu peran tersebut
  if (allowedRoles && Array.isArray(allowedRoles) && !allowedRoles.includes(role)) {
    if (role === ROLES.SUPER_ADMIN) return <Navigate to="/founder" replace />
    if (role === ROLES.OWNER) return <Navigate to="/konsolidasi" replace />
    return <Navigate to="/pos" replace />
  }

  // Kompatibilitas mundur untuk properti ownerOnly
  if (ownerOnly && role !== ROLES.OWNER) {
    if (role === ROLES.SUPER_ADMIN) return <Navigate to="/founder" replace />
    return <Navigate to="/pos" replace />
  }

  // Verifikasi kapabilitas model bisnis tenant (misal: antrean & CRM hanya untuk Carwash/Hybrid)
  if (requiredFeature) {
    const features = getTenantFeatures(activeTenant?.business_type)
    if (!features[requiredFeature]) {
      return <Navigate to="/pos" replace />
    }
  }

  if (allowedBusinessTypes && Array.isArray(allowedBusinessTypes)) {
    const currentType = String(activeTenant?.business_type || 'HYBRID').toUpperCase()
    if (!allowedBusinessTypes.includes(currentType)) {
      return <Navigate to="/pos" replace />
    }
  }

  return children
}

// Komponen Smart Landing Dispatcher di Rute Root (/)
const RootDispatcher = () => {
  const { user, profile, loading } = useAuth()

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

  if (role === ROLES.SUPER_ADMIN) {
    return <Navigate to="/founder" replace />
  }
  if (role === ROLES.OWNER) {
    return <Navigate to="/konsolidasi" replace />
  }
  return <Navigate to="/pos" replace />
}

const AppContent = () => {
  const { user, loading, profile } = useAuth()
  const location = useLocation()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1280
    }
    return false
  })

  // Cek apakah sedang berada di Halaman Mandiri tanpa Sidebar (Login, Konsolidasi, Founder Cockpit)
  const isStandalonePage = location.pathname === '/login' || location.pathname === '/konsolidasi' || location.pathname === '/founder'
  const showSidebar = !!user && !isStandalonePage

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#000000] text-white">
        <div className="w-12 h-12 border-4 border-[#00ffff] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-semibold text-[#bbcbb2] uppercase tracking-widest">Memuat Sesi...</p>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] w-full max-w-full bg-[#000000] text-white flex flex-col md:flex-row overflow-x-hidden">
      {/* Render Sidebar jika sudah login dan bukan di halaman mandiri */}
      {showSidebar && <Sidebar isCollapsed={isSidebarCollapsed} setIsCollapsed={setIsSidebarCollapsed} />}

      {/* Konten Utama Aplikasi */}
      <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden bg-[#000000] relative">
        <div className="relative z-10 min-h-full">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
              {/* Rute Login: Selalu dapat diakses langsung */}
              <Route path="/login" element={<Login />} />

              {/* Rute Root Aplikasi: Smart Landing Dispatcher Berdasarkan Peran */}
              <Route path="/" element={<RootDispatcher />} />

              {/* Rute Dashboard Executive Cabang Terpilih (Owner Only) */}
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute allowedRoles={['Owner']}>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Konsolidasi Portofolio Multi-Outlet (Owner & Super Admin - Dedicated Executive Layout) */}
              <Route 
                path="/konsolidasi" 
                element={
                  <ProtectedRoute allowedRoles={['Owner', 'Super Admin']}>
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
                  <ProtectedRoute allowedRoles={['Owner', 'Admin', 'Kasir']}>
                    <CafePOS />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Antrean Carwash (Owner, Admin, & Kasir - Khusus Carwash & Hybrid) */}
              <Route 
                path="/queue" 
                element={
                  <ProtectedRoute allowedRoles={['Owner', 'Admin', 'Kasir']} requiredFeature="hasQueue">
                    <CarwashQueue />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Keuangan Operasional (Owner & Admin) */}
              <Route 
                path="/finance" 
                element={
                  <ProtectedRoute allowedRoles={['Owner', 'Admin']}>
                    <Finance />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Laporan Akuntansi Resmi SAK EMKM (Owner Only) */}
              <Route 
                path="/reports" 
                element={
                  <ProtectedRoute allowedRoles={['Owner']}>
                    <Reports />
                  </ProtectedRoute>
                } 
              />

              {/* Rute CRM & Pelanggan (Owner & Admin - Khusus Kendaraan: Carwash & Hybrid) */}
              <Route 
                path="/crm" 
                element={
                  <ProtectedRoute allowedRoles={['Owner', 'Admin']} requiredFeature="hasCRM">
                    <CRM />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Kelola Karyawan & Gaji (Owner & Admin) */}
              <Route 
                path="/karyawan" 
                element={
                  <ProtectedRoute allowedRoles={['Owner', 'Admin']}>
                    <Karyawan />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Kelola Master Admin & Sistem (Owner Only) */}
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute allowedRoles={['Owner', 'Super Admin']}>
                    <Admin />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Solo Founder Platform Mission Control (HANYA Super Admin / Founder) */}
              <Route 
                path="/founder" 
                element={
                  <ProtectedRoute allowedRoles={['Super Admin']}>
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
                  <ProtectedRoute allowedRoles={['Super Admin']}>
                    <Navigate to="/founder" replace />
                  </ProtectedRoute>
                } 
              />

              {/* Rute Manajemen Multi-Gudang (Cafe, Carwash, Merchandise) */}
              <Route 
                path="/gudang" 
                element={
                  <ProtectedRoute allowedRoles={['Owner', 'Admin', 'Kasir']}>
                    <Gudang />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/inventory" 
                element={<Navigate to="/gudang" replace />} 
              />

              {/* Rute Database Master Stok & Resep (Owner & Admin) */}
              <Route 
                path="/database" 
                element={
                  <ProtectedRoute allowedRoles={['Owner', 'Admin']}>
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
