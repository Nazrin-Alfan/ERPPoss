import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Crown, Mail, KeyRound, AlertCircle, ShieldCheck } from 'lucide-react'
import { ROLES } from '../constants/roles'

const GOOGLE_AUTH_ENABLED = import.meta.env?.VITE_GOOGLE_AUTH_ENABLED !== 'false'

const GoogleIcon = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
)

export default function FounderLogin() {
  const { user, profile, login, loginWithGoogle, logout } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const currentRole = profile?.role || user?.role || user?.user_metadata?.role
    if (user && currentRole === ROLES.SUPER_ADMIN) {
      navigate('/founder', { replace: true })
    }
  }, [user, profile, navigate])

  const enforceSuperAdminOrReject = async (res) => {
    const resolvedRole = res?.profile?.role || res?.user?.role || res?.user?.user_metadata?.role
    if (resolvedRole !== ROLES.SUPER_ADMIN) {
      await logout()
      setError('Akses Ditolak: Portal ini khusus untuk Super Admin / Founder.')
      return false
    }
    navigate('/founder', { replace: true })
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const cleanEmail = (email || '').trim()
    const cleanPass = (password || '').trim()
    if (!cleanEmail || !cleanPass) {
      setError('Email dan kata sandi Founder wajib diisi.')
      setLoading(false)
      return
    }

    const res = await login(cleanEmail, cleanPass, null)
    if (!res.success) {
      setError(res.error || 'Autentikasi Founder gagal.')
    } else {
      await enforceSuperAdminOrReject(res)
    }
    setLoading(false)
  }

  const handleGoogleFounder = async () => {
    if (!GOOGLE_AUTH_ENABLED) {
      setError('Google Sign-In sedang dinonaktifkan.')
      return
    }
    setError('')
    setLoading(true)

    const res = await loginWithGoogle()
    if (!res.success) {
      setError(res.error || 'Autentikasi Google gagal.')
      setLoading(false)
    } else if (res.user) {
      await enforceSuperAdminOrReject(res)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#04060b] px-4 py-8">
      <div className="w-full max-w-md bg-[#0b0f1a] p-7 sm:p-8 rounded-2xl shadow-2xl border border-amber-500/20">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
            <Crown size={28} />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-widest mb-2">
            <ShieldCheck size={12} />
            <span>Internal Platform Console</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">RelayPOS Founder Portal</h1>
          <p className="text-slate-400 text-xs mt-1">Akses terbatas hanya untuk Super Admin terotorisasi.</p>
        </div>

        {error && (
          <div role="alert" className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleFounder}
          disabled={!GOOGLE_AUTH_ENABLED || loading}
          className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold flex items-center justify-center gap-2.5 transition-all shadow-md active:scale-[0.98] cursor-pointer border border-slate-200 text-xs sm:text-sm disabled:opacity-50"
        >
          <GoogleIcon />
          <span>Masuk Founder dengan Google</span>
        </button>

        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            atau kredensial founder
          </span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="founder-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Email Super Admin
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 text-slate-500" size={16} />
              <input
                id="founder-email"
                type="text"
                placeholder="superadmin@relaypos.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all text-sm font-mono"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="founder-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Kata Sandi
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-3 text-slate-500" size={16} />
              <input
                id="founder-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all text-sm font-mono"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'Buka Mission Control'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
