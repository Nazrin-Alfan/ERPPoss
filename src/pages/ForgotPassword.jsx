import React, { useState } from 'react'
import { api } from '../services/apiAdapter'
import { Link } from 'react-router-dom'
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
    <div className="min-h-screen flex items-center justify-center bg-[#000000] px-4 text-white">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-[#121215] border border-[#26272d] p-7 rounded-2xl shadow-2xl space-y-4">
        <div className="text-center space-y-1">
          <div className="w-11 h-11 mx-auto rounded-xl bg-[#00ffff]/10 border border-[#00ffff]/30 text-[#00ffff] flex items-center justify-center mb-2">
            <Mail size={20} />
          </div>
          <h2 className="text-xl font-bold text-white">Lupa Kata Sandi</h2>
          <p className="text-xs text-[#bbcbb2]">Masukkan email akun Owner Anda untuk menerima tautan pemulihan kata sandi.</p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div className="space-y-4 text-center">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-1.5">
              <CheckCircle2 size={24} className="mx-auto text-emerald-400" />
              <p className="font-bold text-white">Permintaan Reset Terkirim</p>
              <p>
                Jika email <strong>{email}</strong> terdaftar, tautan reset kata sandi telah dikirim ke kotak masuk email Anda.
              </p>
            </div>

            {localToken && (
              <div className="p-3 rounded-lg bg-[#18181c] border border-amber-500/30 text-xs space-y-2">
                <p className="text-amber-300 font-semibold">Mode Sandbox Lokal:</p>
                <Link
                  to={`/reset-password?token=${encodeURIComponent(localToken)}`}
                  className="inline-block px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300"
                >
                  Lanjut Reset Kata Sandi
                </Link>
              </div>
            )}

            <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-[#00ffff] hover:underline font-semibold">
              <ArrowLeft size={13} />
              <span>Kembali ke Halaman Login</span>
            </Link>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5">Email Terdaftar</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@tokoanda.com"
                className="w-full bg-[#18181c] border border-[#26272d] rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#00ffff]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00ffff] hover:bg-[#00e5e5] text-[#0f0f0f] font-bold py-2.5 rounded-lg text-sm transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Mengirim...' : 'Kirim Tautan Reset'}
            </button>

            <div className="text-center pt-1">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-[#bbcbb2] hover:text-[#00ffff]">
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
