import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquarePlus, Star, X, CheckCircle2, AlertCircle, Send } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'

const CATEGORIES = [
  { id: 'BUG', label: 'Bug / Error' },
  { id: 'FEATURE', label: 'Saran Fitur' },
  { id: 'UX', label: 'Tampilan / UX' },
  { id: 'OTHER', label: 'Lainnya' },
]

const RATING_LABELS = {
  1: 'Perlu Banyak Perbaikan',
  2: 'Kurang Memuaskan',
  3: 'Cukup Baik',
  4: 'Sangat Baik',
  5: 'Luar Biasa',
}

const FeedbackModal = ({ isOpen, onClose }) => {
  const location = useLocation()
  const { user, profile, activeTenant } = useAuth()

  const [category, setCategory] = useState('FEATURE')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setError('')
      setSubmitted(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const activeStars = hoverRating || rating

  const handleClose = () => {
    if (submitting) return
    setCategory('FEATURE')
    setRating(0)
    setHoverRating(0)
    setMessage('')
    setError('')
    setSubmitted(false)
    onClose?.()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const cleanMsg = message.trim()
    if (cleanMsg.length < 5) {
      setError('Mohon tulis masukan minimal 5 karakter.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const payload = {
        tenant_id: activeTenant?.id || profile?.tenant_id || null,
        user_id: user?.id || profile?.id || null,
        user_name: profile?.nama || user?.email || 'Pengguna Beta',
        user_role: profile?.role || 'Owner',
        category,
        rating: rating >= 1 && rating <= 5 ? rating : null,
        page_path: location.pathname || '/',
        message: cleanMsg,
        status: 'OPEN',
      }

      const { error: insertErr } = await supabase.from('beta_feedback').insert(payload)
      if (insertErr) throw insertErr

      setSubmitted(true)
      setMessage('')
      setRating(0)
    } catch (err) {
      setError(err?.message || 'Gagal mengirim masukan. Silakan coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      <div className="w-full max-w-md bg-[#121215] border border-[#26272d] rounded-2xl p-5 shadow-2xl my-auto">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#26272d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00ffff]/10 border border-[#00ffff]/25 flex items-center justify-center text-[#00ffff] shrink-0">
              <MessageSquarePlus size={16} />
            </div>
            <div>
              <h3 id="feedback-modal-title" className="text-sm font-bold text-white">
                Beri Masukan Beta
              </h3>
              <p className="text-[11px] text-[#8e8e93]">
                Laporan bug atau saran Anda membantu penyempurnaan RelayPOS.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Tutup modal masukan"
            className="p-1 rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#1b1b1d] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {submitted ? (
          <div className="py-7 text-center space-y-3">
            <div className="w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Terima kasih atas masukannya!</p>
              <p className="text-xs text-[#8e8e93] mt-1">
                Catatan Anda sudah tersimpan dan akan segera ditinjau tim pengembang.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="mt-2 px-4 py-2 rounded-xl bg-[#00ffff] hover:bg-[#00e5e5] text-[#0f0f0f] text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
            >
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Pemberian Bintang (1-5) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-semibold text-[#bbcbb2]">
                  Penilaian Pengalaman (Opsional)
                </label>
                {activeStars > 0 && (
                  <span className="text-[10px] font-medium text-amber-400">
                    {activeStars}/5 • {RATING_LABELS[activeStars]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5" role="group" aria-label="Rating bintang">
                {[1, 2, 3, 4, 5].map((star) => {
                  const filled = star <= activeStars
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(rating === star ? 0 : star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`Beri ${star} bintang`}
                      aria-pressed={rating === star}
                      className="p-1.5 rounded-lg bg-[#18181c] border border-[#26272d] hover:border-amber-400/50 transition-all active:scale-[0.95] cursor-pointer"
                    >
                      <Star
                        size={18}
                        className={filled ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}
                      />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Kategori */}
            <div>
              <label className="block text-[11px] font-semibold text-[#bbcbb2] mb-1.5">
                Kategori
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORIES.map((cat) => {
                  const active = category === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all active:scale-[0.98] cursor-pointer ${
                        active
                          ? 'bg-[#00ffff]/15 border-[#00ffff]/50 text-[#00ffff]'
                          : 'bg-[#18181c] border-[#26272d] text-[#bbcbb2] hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Pesan Masukan */}
            <div>
              <label htmlFor="beta-feedback-message" className="block text-[11px] font-semibold text-[#bbcbb2] mb-1.5">
                Detail Masukan *
              </label>
              <textarea
                id="beta-feedback-message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ceritakan kendala yang dialami atau fitur yang Anda butuhkan..."
                className="w-full px-3 py-2.5 rounded-xl bg-[#0b0b0d] border border-[#26272d] text-xs text-white placeholder-[#6b7367] focus:outline-none focus:border-[#00ffff] resize-none"
                required
              />
              <div className="flex items-center justify-between mt-1 text-[10px] text-[#6b7367]">
                <span>Konteks: {location.pathname}{activeTenant?.nama ? ` • ${activeTenant.nama}` : ''}</span>
                <span className="font-mono">{message.trim().length} karakter</span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-3.5 py-2 rounded-xl bg-[#18181c] border border-[#26272d] text-xs font-semibold text-[#bbcbb2] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-[#00ffff] hover:bg-[#00e5e5] text-[#0f0f0f] text-xs font-bold flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                <Send size={13} />
                <span>{submitting ? 'Mengirim...' : 'Kirim Masukan'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default FeedbackModal
