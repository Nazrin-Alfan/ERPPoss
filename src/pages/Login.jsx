import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useAppTheme } from '../context/ThemeContext'
import { KeyRound, Mail, AlertCircle } from 'lucide-react'
import { ROLES } from '../constants/roles'

const Login = () => {
  const { login, loginWithGoogle } = useAuth()
  const { currentTheme } = useAppTheme()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
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
      // Dispatching rute berdasarkan role profile yang akurat
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

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await loginWithGoogle({
        email: 'budi.owner@gmail.com',
        name: 'Pak Budi (Owner)'
      })
      if (res.success) {
        navigate('/konsolidasi', { replace: true })
      } else {
        setError(res.error || 'Gagal masuk dengan Google.')
      }
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan autentikasi Google.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070a10] px-4 py-8 relative">
      <div className="w-full max-w-md bg-[#0d121f] p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-800">
        {/* Header Logo */}
        <div className="text-center mb-6">
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

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Login Kredensial Kasir & Staf */}
        <form onSubmit={handleSubmit} className="space-y-4">
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

        {/* Divider Google Sign-In */}
        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            atau
          </span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        {/* Tombol Masuk Google untuk Owner */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold flex items-center justify-center gap-2.5 transition-all shadow-md active:scale-98 cursor-pointer border border-slate-200 text-xs sm:text-sm disabled:opacity-50 mb-5"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <span>Lanjutkan dengan Google (Owner)</span>
        </button>

        {/* Akses Cepat 4 Akun Role (Demo) */}
        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
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
      </div>
    </div>
  )
}

export default Login