import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../services/apiAdapter'
import { supabase } from '../supabaseClient'
import RelayLogo from '../components/brand/RelayLogo'
import { KeyRound, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(!api.isCloud)
  const [hasRecoverySession, setHasRecoverySession] = useState(!api.isCloud)

  useEffect(() => {
    if (!api.isCloud) return undefined
    let active = true

    supabase.auth.getSession?.().then(({ data }) => {
      if (!active) return
      setHasRecoverySession(Boolean(data?.session))
      setSessionChecked(true)
    }).catch(() => {
      if (!active) return
      setHasRecoverySession(false)
      setSessionChecked(true)
    })

    const sub = supabase.auth.onAuthStateChange?.((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setHasRecoverySession(Boolean(session))
        setSessionChecked(true)
      }
    })

    return () => {
      active = false
      sub?.data?.subscription?.unsubscribe?.()
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      return setError('Kata sandi baru minimal 8 karakter.')
    }
    if (newPassword !== confirmPassword) {
      return setError('Konfirmasi kata sandi tidak cocok.')
    }

    setLoading(true)
    try {
      await api.auth.resetPassword({ newPassword, token })
      setSuccess(true)
      setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err) {
      setError(err.message || 'Gagal memperbarui kata sandi. Pastikan tautan reset masih berlaku.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 text-foreground">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-surface border border-border p-7 rounded-2xl shadow-sm space-y-4">
        <div className="text-center space-y-1.5">
          <div className="flex justify-center mb-2">
            <RelayLogo size="md" />
          </div>
          <div className="w-10 h-10 mx-auto rounded-xl bg-primary-soft border border-primary/25 text-primary-soft-foreground flex items-center justify-center">
            <KeyRound size={18} />
          </div>
          <h2 className="text-xl font-bold text-foreground">Atur Kata Sandi Baru</h2>
          <p className="text-xs text-muted">Buat kata sandi baru minimal 8 karakter untuk akun Anda.</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {api.isCloud && sessionChecked && !hasRecoverySession && !success ? (
          <div className="p-4 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs text-center space-y-3">
            <AlertCircle size={24} className="mx-auto text-destructive" />
            <p className="font-bold text-foreground">Tautan Reset Tidak Valid atau Kedaluwarsa</p>
            <p>Silakan minta tautan pemulihan kata sandi yang baru agar sesi recovery aman.</p>
            <Link
              to="/forgot-password"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary-hover transition-colors"
            >
              Minta Tautan Reset Baru
            </Link>
          </div>
        ) : success ? (
          <div className="p-4 rounded-xl bg-success-bg border border-success/30 text-success text-xs text-center space-y-2">
            <CheckCircle2 size={24} className="mx-auto text-success" />
            <p className="font-bold text-foreground">Kata Sandi Berhasil Diperbarui</p>
            <p>Mengalihkan Anda ke halaman login...</p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Kata Sandi Baru</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
                minLength={8}
                autoComplete="new-password"
                className="w-full min-h-[44px] bg-subsurface border border-border rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-dark focus:outline-none focus:border-border-active focus:ring-2 focus:ring-ring/20"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Konfirmasi Kata Sandi Baru</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi kata sandi baru"
                minLength={8}
                autoComplete="new-password"
                className="w-full min-h-[44px] bg-subsurface border border-border rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-dark focus:outline-none focus:border-border-active focus:ring-2 focus:ring-ring/20"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] bg-primary hover:bg-primary-hover text-primary-foreground font-semibold py-2.5 rounded-full text-sm transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Menyimpan...' : 'Simpan Kata Sandi Baru'}
            </button>

            <div className="text-center pt-1">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary font-medium">
                <ArrowLeft size={13} />
                <span>Kembali ke Login</span>
              </Link>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
