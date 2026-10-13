import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppTheme } from '../context/ThemeContext'
import { KeyRound, Mail, AlertCircle, Building2, User, Sparkles, CheckCircle2 } from 'lucide-react'
import { ROLES } from '../constants/roles'

const Login = () => {
  const { login, registerTenantOwner } = useAuth()
  const { currentTheme } = useAppTheme()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('login') // 'login' | 'register'

  // Login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Self-registration (Owner Onboarding) form state
  const [regNama, setRegNama] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regTenantName, setRegTenantName] = useState('')
  const [regBusinessType, setRegBusinessType] = useState('HYBRID')

  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    if (!email || !password) {
      setError('Username / Email dan password wajib diisi.')
      setLoading(false)
      return
    }

    const res = await login(email, password)
    if (!res.success) {
      setError(res.error || 'Gagal masuk. Periksa kembali username dan password Anda.')
    } else {
      // Dispatching rute berdasarkan role profile yang akurat dari database
      const userRole = res.profile?.role || res.user?.role || res.user?.user_metadata?.role || ROLES.KASIR
      if (userRole === ROLES.SUPER_ADMIN) {
        navigate('/founder', { replace: true })
      } else if (userRole === ROLES.OWNER) {
        navigate('/konsolidasi', { replace: true })
      } else {
        navigate('/pos', { replace: true })
      }
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

    if (regPassword.length < 6) {
      setError('Kata sandi minimal 6 karakter.')
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
    } else {
      setSuccessMsg('Toko Anda berhasil dibuat! Mengalihkan ke dashboard...')
      setTimeout(() => {
        navigate('/konsolidasi', { replace: true })
      }, 800)
    }
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
          <p className="text-slate-400 text-xs mt-1">Sistem Operasional & Kasir Estafet Terpadu</p>
        </div>

        {/* Tab Navigation: Masuk vs Daftar Toko Baru */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900/80 border border-slate-800 rounded-xl mb-5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login')
              setError('')
              setSuccessMsg('')
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'login'
                ? 'bg-brand-emerald text-slate-950 shadow-md shadow-brand-emerald/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Masuk ke Toko
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register')
              setError('')
              setSuccessMsg('')
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'register'
                ? 'bg-brand-emerald text-slate-950 shadow-md shadow-brand-emerald/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles size={13} />
            <span>Daftar Toko Baru</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs sm:text-sm flex items-start gap-2.5">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: FORM LOGIN */}
        {activeTab === 'login' ? (
          <>
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-username" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Username atau Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 text-slate-500" size={16} />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    placeholder="kasir1 atau email..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  PIN / Kata Sandi
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-3 text-slate-500" size={16} />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-brand-emerald hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-emerald/20 cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Masuk ke Sistem'
                )}
              </button>
            </form>

            {/* Akses Cepat 4 Akun Role (Demo) */}
            <div className="mt-6 p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
              <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase text-center flex items-center justify-center gap-1.5">
                <span>Akses Cepat Akun Role (Demo)</span>
              </p>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('superadmin@relaypos.com')
                    setPassword('password123')
                  }}
                  className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400 text-center transition-all group active:scale-95 cursor-pointer"
                  title="Isi form dengan akun Super Admin (Solo Founder)"
                >
                  <div className="text-base">⚡</div>
                  <div className="text-[10px] font-bold text-amber-300 group-hover:text-amber-200 mt-0.5 truncate">Founder</div>
                  <div className="text-[8px] text-amber-400/70 font-mono">superadmin</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('owner@relaypos.com')
                    setPassword('password123')
                  }}
                  className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-brand-emerald/50 text-center transition-all group active:scale-95 cursor-pointer"
                  title="Isi form dengan akun Owner"
                >
                  <div className="text-base">👑</div>
                  <div className="text-[10px] font-bold text-white group-hover:text-brand-emerald mt-0.5 truncate">Owner</div>
                  <div className="text-[8px] text-slate-400 font-mono">owner</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('admin@relaypos.com')
                    setPassword('password123')
                  }}
                  className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/50 text-center transition-all group active:scale-95 cursor-pointer"
                  title="Isi form dengan akun Admin"
                >
                  <div className="text-base">👔</div>
                  <div className="text-[10px] font-bold text-white group-hover:text-purple-300 mt-0.5 truncate">Admin</div>
                  <div className="text-[8px] text-slate-400 font-mono">admin</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('kasir@relaypos.com')
                    setPassword('password123')
                  }}
                  className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-brand-blue/50 text-center transition-all group active:scale-95 cursor-pointer"
                  title="Isi form dengan akun Kasir"
                >
                  <div className="text-base">👤</div>
                  <div className="text-[10px] font-bold text-white group-hover:text-brand-blue mt-0.5 truncate">Kasir</div>
                  <div className="text-[8px] text-slate-400 font-mono">kasir</div>
                </button>
              </div>
              <p className="text-[9px] text-slate-500 text-center italic">
                Password akun demo: <span className="font-mono text-slate-400 font-semibold">password123</span>
              </p>
            </div>
          </>
        ) : (
          /* TAB 2: FORM REGISTRASI MANDIRI OWNER (SELF-SERVICE ONBOARDING) */
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label htmlFor="reg-nama" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Nama Lengkap Pemilik
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 text-slate-500" size={16} />
                <input
                  id="reg-nama"
                  type="text"
                  placeholder="Budi Santoso"
                  value={regNama}
                  onChange={(e) => setRegNama(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-brand-emerald/60 focus:ring-1 focus:ring-brand-emerald/20 transition-all text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-tenant-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Nama Usaha / Toko
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-3 text-slate-500" size={16} />
                <input
                  id="reg-tenant-name"
                  type="text"
                  placeholder="AutoClean Carwash & Resto"
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

            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Email Akun Owner
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 text-slate-500" size={16} />
                <input
                  id="reg-email"
                  type="email"
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
                Kata Sandi (Min. 6 Karakter)
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3 text-slate-500" size={16} />
                <input
                  id="reg-password"
                  type="password"
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
              className="w-full py-3 bg-brand-emerald hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-emerald/20 cursor-pointer disabled:opacity-50 mt-3"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Daftar & Buka Toko Sekarang'
              )}
            </button>
            <p className="text-[10px] text-slate-500 text-center mt-2">
              Otomatis mendapatkan lisensi Trial dan Chart of Accounts (COA) siap pakai.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default Login
