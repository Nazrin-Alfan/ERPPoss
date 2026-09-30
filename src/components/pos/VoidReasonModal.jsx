import React, { useState } from 'react'
import { AlertTriangle, X, Check, RotateCcw, ShieldAlert } from 'lucide-react'

const PRESET_REASONS = [
  'Salah Input Menu / Item',
  'Pelanggan Ganti Pesanan',
  'Pelanggan Batal / Keluar Lokasi',
  'Salah Nominal / Metode Bayar',
  'Kendala Mesin / Operasional Cuaca'
]

export default function VoidReasonModal({ isOpen, onClose, onConfirm, transaction }) {
  const [selectedPreset, setSelectedPreset] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen || !transaction) return null

  const handleSelectPreset = (reason) => {
    setSelectedPreset(reason)
    if (!customReason) {
      setCustomReason(reason)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const finalReason = customReason.trim() || selectedPreset.trim()
    if (!finalReason) {
      return setError('Alasan pembatalan transaksi wajib diisi demi kepatuhan audit kasir.')
    }

    setLoading(true)
    setError('')
    try {
      await onConfirm(transaction, finalReason)
      onClose()
    } catch (err) {
      setError(err.message || 'Gagal memproses pembatalan transaksi.')
    } finally {
      setLoading(false)
    }
  }

  const strukId = transaction.id_struk || transaction.id || 'N/A'
  const totalAmount = transaction.total_tagihan || transaction.total_harga || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/85 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md glass-panel border border-rose-500/30 rounded-3xl p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-[#26272d]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Pembatalan Nota (Void)</h3>
              <p className="text-[10px] text-[#bbcbb2] font-mono">
                Struk #{String(strukId).substring(0, 10)} • Rp {Number(totalAmount).toLocaleString('id-ID')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#bbcbb2] hover:text-white hover:bg-[#18181c] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Warning Policy */}
        <div className="my-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <AlertTriangle size={13} className="shrink-0" />
            <span>Kebijakan Zero Hard Delete:</span>
          </div>
          <p className="text-[11px] leading-relaxed text-rose-200/90">
            Transaksi tidak akan dihapus fisik. Status diubah menjadi <strong className="text-white">Batal</strong>, alasan pembatalan disimpan ke audit log, dan bahan baku F&B otomatis dikembalikan ke stok.
          </p>
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-2">
              Pilih Alasan Cepat:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_REASONS.map((reason) => {
                const isSelected = selectedPreset === reason
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => handleSelectPreset(reason)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-rose-500/20 border-rose-500 text-white shadow-sm'
                        : 'bg-[#121215]/60 border-[#26272d] text-[#bbcbb2] hover:text-slate-200 hover:border-[#3f414a]'
                    }`}
                  >
                    {reason}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1.5">
              Keterangan / Alasan Pembatalan <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder="Jelaskan alasan nota ini dibatalkan secara detail..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="w-full p-3 bg-[#121215] border border-[#26272d] rounded-lg text-white text-xs placeholder-slate-600 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-[#121215] hover:bg-[#18181c] text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold shadow-lg shadow-rose-600/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw size={13} />
              <span>{loading ? 'Membatalkan...' : 'Konfirmasi Batal (Void)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
