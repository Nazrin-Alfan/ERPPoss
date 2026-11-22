import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppTheme } from '../context/ThemeContext'
import { api } from '../services/apiAdapter'
import {
  KeyRound,
  Mail,
  AlertCircle,
  Building2,
  User,
  Sparkles,
  CheckCircle2,
  LogIn,
  BookOpen,
  ArrowLeft
} from 'lucide-react'
import { ROLES, getRoleLandingRoute } from '../constants/roles'

const GOOGLE_AUTH_ENABLED = import.meta.env?.VITE_GOOGLE_AUTH_ENABLED !== 'false'

const resolvePostLoginRoute = (profile, userTenants = []) =>
  getRoleLandingRoute(profile?.role || ROLES.KASIR, {
    tenantCount: Array.isArray(userTenants) ? userTenants.length : 1
  })

const GoogleIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
)

const Login = () => {
  const {
    login,
    registerTenantOwner,
    loginWithGoogle,
    oauthError,
    clearOAuthError,
    user,
    profile,
    userTenants,
    loading: authLoading
  } = useAuth()
  const { currentTheme } = useAppTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // 'login' | 'register'
  const [activeTab, setActiveTab] = useState(() =>
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  )

  useEffect(() => {
    if (searchParams.get('mode') === 'register') {
      setActiveTab('register')
    }
  }, [searchParams])
  const [showManualRegister, setShowManualRegister] = useState(false)

  // Single Login state (Owner, Co-Owner, Admin, Kasir, Super Admin)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [tenantSlug, setTenantSlug] = useState(() => {
    try {
      return localStorage.getItem('relaypos_last_tenant_slug') || ''
    } catch {
      return ''
    }
  })

  // Self-registration (Owner Onboarding) form state
  const [regNama, setRegNama] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regTenantName, setRegTenantName] = useState('')
  const [regBusinessType, setRegBusinessType] = useState('HYBRID')

  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (oauthError) {
      setError(oauthError)
    }
  }, [oauthError])

  useEffect(() => {
    if (!authLoading && user && profile && !loading && !successMsg && !oauthError) {
      navigate(resolvePostLoginRoute(profile, userTenants), { replace: true })
    }
  }, [authLoading, user, profile, userTenants, loading, successMsg, oauthError, navigate])

  const switchTab = (tab) => {
    setActiveTab(tab)
    setError('')
    setSuccessMsg('')
    clearOAuthError()
  }

  const routeAfterLogin = (res) => {
    navigate(resolvePostLoginRoute(res.profile, res.userTenants), { replace: true })
  }

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    const cleanIdentifier = (identifier || '').trim()

    if (!cleanIdentifier || !password) {
      setError('Username atau email serta kata sandi wajib diisi.')
      setLoading(false)
      return
    }

    const effectiveSlug = (api.isCloud && !cleanIdentifier.includes('@') && !cleanIdentifier.includes('.'))
      ? (tenantSlug.trim() || null)
      : null

    const res = await login(cleanIdentifier, password, effectiveSlug)
    if (!res.success) {
      setError(res.error || 'Gagal masuk. Periksa kembali kredensial Anda.')
    } else {
      routeAfterLogin(res)
    }
    setLoading(false)
  }

  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    if (!regNama || !regEmail || !regPassword || !regTenantName) {
      setError('Seluruh formulir pendaftaran wajib diisi.')
      setLoading(false)
      return
    }

    if (regPassword.length < 8) {
      setError('Kata sandi minimal 8 karakter.')
      setLoading(false)
      return
    }

    const res = await registerTenantOwner({
      nama: regNama,
      email: regEmail,
      password: regPassword,
      tenantName: regTenantName,
      businessType: regBusinessType
    })

    if (!res.success) {
      setError(res.error || 'Pendaftaran toko gagal. Silakan coba lagi.')
      setLoading(false)
    } else if (res.requiresEmailConfirmation) {
      setSuccessMsg('Periksa email Anda untuk konfirmasi pendaftaran, lalu masuk ke toko.')
      setLoading(false)
    } else {
      setSuccessMsg('Toko Anda berhasil dibuat! Mengalihkan ke dashboard toko...')
      setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, 800)
    }
  }

  const runGoogleOAuth = async (payload) => {
    if (!GOOGLE_AUTH_ENABLED) {
      setError('Google Sign-In sedang dinonaktifkan sementara. Silakan mendaftar atau masuk menggunakan email.')
      return
    }
    setError('')
    setSuccessMsg('')
    clearOAuthError()
    setLoading(true)

    const res = await loginWithGoogle(payload)
    if (!res.success) {
      setError(res.error || 'Autentikasi Google gagal. Silakan coba lagi.')
      setLoading(false)
    } else if (res.user) {
      setSuccessMsg('Autentikasi Google berhasil! Mengalihkan...')
      setTimeout(() => {
        routeAfterLogin(res)
      }, 500)
    }
  }

  const handleGoogleLogin = () => runGoogleOAuth({ mode: 'login' })

  const handleGoogleRegister = () => {
    if (!regTenantName.trim()) {
      setError('Isi Nama Usaha / Toko terlebih dahulu sebelum daftar dengan Google.')
      return
    }
    runGoogleOAuth({
      mode: 'register',
      tenantName: regTenantName.trim(),
      businessType: regBusinessType,
      nama: regNama.trim()
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070a10] px-4 py-8 relative">
      <div className="w-full max-w-md bg-[#0d121f] p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-800">
        {/* Header Logo */}
        <div className="text-center mb-5">
          <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden border border-slate-700/80 shadow-md mb-3 bg-[#111827] p-2 flex items-center justify-center">
            <img
              src={currentTheme.logo}
              alt="Logo RelayPOS"
              className="w-full h-full object-contain"
            />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-1.5">
            <span>RelayPOS</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">Sistem Operasional &amp; Kasir Estafet Terpadu</p>
        </div>

        {/* 2-Tab Navigation: Masuk ke Toko vs Daftar Toko Baru */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900/80 border border-slate-800 rounded-xl mb-5">
          <button
            type="button"
            onClick={() => switchTab('login')}
            className={`py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'login'
                ? 'bg-brand-emerald text-slate-950 shadow-md shadow-brand-emerald/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn size={14} />
            <span>Masuk ke Toko</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('register')}
            className={`py-2 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'register'
                ? 'bg-brand-emerald text-slate-950 shadow-md shadow-brand-emerald/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles size={14} />
            <span>Daftar Toko Baru</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div role="alert" className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div role="status" className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs sm:text-sm flex items-start gap-2.5">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: MASUK KE TOKO (SINGLE LOGIN SEMUA ROLE) */}
        {activeTab === 'login' && (
          <>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={!GOOGLE_AUTH_ENABLED || loading}
              className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-all text-xs sm:text-sm border ${
                GOOGLE_AUTH_ENABLED
                  ? 'bg-white hover:bg-slate-100 text-slate-900 shadow-md active:scale-[0.98] cursor-pointer border-slate-200'
                  : 'bg-slate-900/60 text-slate-500 border-slate-800 cursor-not-allowed opacity-60'
              }`}
            >
              <GoogleIcon />
              <span>{GOOGLE_AUTH_ENABLED ? 'Lanjutkan dengan Google' : 'Google Sign-In Dinonaktifkan'}</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-2">
              Khusus akun Google yang sudah terdaftar di toko atau diundang Owner.
            </p>

            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                atau masuk dengan akun toko
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-identifier" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Username atau Email
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 text-slate-500" size={16} />
                  <input
                    id="login-identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    placeholder="owner@tokoanda.com atau kasir1.kode-toko"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    PIN / Kata Sandi
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[11px] text-brand-emerald hover:underline font-medium"
                  >
                    Lupa kata sandi?
                  </Link>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 text-slate-500" size={16} />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm font-mono"
                    required
                  />
                </div>
              </div>

              {api.isCloud && identifier.trim() && !identifier.includes('@') && !identifier.includes('.') && (
                <div>
                  <label htmlFor="login-tenant-slug" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Kode Toko (Khusus Staf Tanpa Email)
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-3 text-slate-500" size={16} />
                    <input
                      id="login-tenant-slug"
                      name="tenantSlug"
                      type="text"
                      autoComplete="organization"
                      placeholder="Misal: berkah-auto-wash"
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm font-mono"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-brand-emerald hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-emerald/20 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Masuk'
                )}
              </button>
            </form>
          </>
        )}

        {/* TAB 2: DAFTAR TOKO BARU (SELF-SERVICE ONBOARDING) */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label htmlFor="reg-tenant-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Nama Usaha / Toko
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-3 text-slate-500" size={16} />
                <input
                  id="reg-tenant-name"
                  type="text"
                  autoComplete="organization"
                  placeholder="Contoh: Berkah Auto & Cafe"
                  value={regTenantName}
                  onChange={(e) => setRegTenantName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Model Operasional Toko
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRegBusinessType('HYBRID')}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    regBusinessType === 'HYBRID'
                      ? 'bg-brand-emerald/15 border-brand-emerald text-brand-emerald font-bold'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-sm">🚗☕</div>
                  <div className="text-[10px] mt-0.5">Hybrid</div>
                </button>
                <button
                  type="button"
                  onClick={() => setRegBusinessType('CARWASH')}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    regBusinessType === 'CARWASH'
                      ? 'bg-brand-emerald/15 border-brand-emerald text-brand-emerald font-bold'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-sm">🚗</div>
                  <div className="text-[10px] mt-0.5">Carwash</div>
                </button>
                <button
                  type="button"
                  onClick={() => setRegBusinessType('CAFE')}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                    regBusinessType === 'CAFE'
                      ? 'bg-brand-emerald/15 border-brand-emerald text-brand-emerald font-bold'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="text-sm">☕</div>
                  <div className="text-[10px] mt-0.5">Cafe Only</div>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleRegister}
              disabled={!GOOGLE_AUTH_ENABLED || loading}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold flex items-center justify-center gap-2.5 transition-all shadow-md active:scale-[0.98] cursor-pointer border border-slate-200 text-xs sm:text-sm disabled:opacity-50"
            >
              <GoogleIcon />
              <span>Daftar Toko Cepat dengan Google</span>
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <button
                type="button"
                onClick={() => setShowManualRegister((prev) => !prev)}
                className="flex-shrink mx-3 text-[11px] font-bold text-slate-400 hover:text-brand-emerald transition-colors cursor-pointer"
              >
                {showManualRegister ? 'Sembunyikan form manual ▲' : 'Atau daftar manual dengan Email ▼'}
              </button>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {showManualRegister && (
              <>
                <div>
                  <label htmlFor="reg-nama" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Nama Lengkap Pemilik
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3 text-slate-500" size={16} />
                    <input
                      id="reg-nama"
                      type="text"
                      autoComplete="name"
                      placeholder="Budi Santoso"
                      value={regNama}
                      onChange={(e) => setRegNama(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Email Akun Owner
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 text-slate-500" size={16} />
                    <input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      placeholder="budi@autoclean.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm font-mono"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Kata Sandi (Min. 8 Karakter)
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-3 text-slate-500" size={16} />
                    <input
                      id="reg-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm font-mono"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-brand-emerald hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-emerald/20 cursor-pointer disabled:opacity-50 mt-3"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Daftar & Buka Toko Sekarang'
                  )}
                </button>
              </>
            )}

            <p className="text-[10px] text-slate-500 text-center mt-2">
              Otomatis mendapatkan lisensi Trial Beta 30 Hari dan Chart of Accounts (COA) siap pakai.
            </p>
          </form>
        )}

        <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-400">
          <Link to="/welcome" className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
            <ArrowLeft size={13} strokeWidth={1.75} />
            <span>Beranda Produk</span>
          </Link>
          <Link to="/panduan" className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 transition-colors">
            <BookOpen size={13} strokeWidth={1.75} />
            <span>Panduan Pengguna</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login
