import React, { useState } from 'react'
import { api } from '../services/apiAdapter'
import { Link } from 'react-router-dom'
import RelayLogo from '../components/brand/RelayLogo'
import { Mail, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [localToken, setLocalToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.auth.forgotPassword(email)
      setSubmitted(true)
      // Hanya tampilkan link reset langsung pada mode Local Sandbox (non-Cloud)
      if (!api.isCloud && res?.token) {
        setLocalToken(res.token)
      }
    } catch (err) {
      setError(err.message || 'Gagal meminta reset password')
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
            <Mail size={18} />
          </div>
          <h2 className="text-xl font-bold text-foreground">Lupa Kata Sandi</h2>
          <p className="text-xs text-muted">Masukkan email akun Owner Anda untuk menerima tautan pemulihan kata sandi.</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div className="space-y-4 text-center">
            <div className="p-4 rounded-xl bg-success-bg border border-success/30 text-success text-xs space-y-1.5">
              <CheckCircle2 size={24} className="mx-auto text-success" />
              <p className="font-bold text-foreground">Permintaan Reset Terkirim</p>
              <p>
                Jika email <strong>{email}</strong> terdaftar, tautan reset kata sandi telah dikirim ke kotak masuk email Anda.
              </p>
            </div>

            {localToken && (
              <div className="p-3 rounded-xl bg-warning-bg border border-warning/30 text-xs space-y-2">
                <p className="text-warning font-semibold">Mode Sandbox Lokal:</p>
                <Link
                  to={`/reset-password?token=${encodeURIComponent(localToken)}`}
                  className="inline-flex items-center justify-center min-h-[40px] px-4 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary-hover transition-colors"
                >
                  Lanjut Reset Kata Sandi
                </Link>
              </div>
            )}

            <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold">
              <ArrowLeft size={13} />
              <span>Kembali ke Halaman Login</span>
            </Link>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Email Terdaftar</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@tokoanda.com"
                className="w-full min-h-[44px] bg-subsurface border border-border rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-dark focus:outline-none focus:border-border-active focus:ring-2 focus:ring-ring/20"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] bg-primary hover:bg-primary-hover text-primary-foreground font-semibold py-2.5 rounded-full text-sm transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Mengirim...' : 'Kirim Tautan Reset'}
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
