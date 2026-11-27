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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-md bg-surface border border-destructive/30 rounded-3xl shadow-2xl relative flex flex-col max-h-[92dvh] overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-destructive-bg border border-destructive/30 flex items-center justify-center text-destructive">
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Pembatalan Nota (Void)</h3>
              <p className="text-[10px] text-muted font-mono tabular-nums">
                Struk #{String(strukId).substring(0, 10)} • Rp {Number(totalAmount).toLocaleString('id-ID')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal batal nota"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-subsurface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-3.5 overscroll-contain">
            {/* Warning Policy */}
            <div className="p-3 rounded-xl bg-destructive-bg border border-destructive/30 text-xs text-destructive space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle size={13} className="shrink-0" />
                <span>Kebijakan Zero Hard Delete:</span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                Transaksi tidak akan dihapus fisik. Status diubah menjadi <strong className="text-foreground">Batal</strong>, alasan pembatalan disimpan ke audit log, dan bahan baku F&B otomatis dikembalikan ke stok.
              </p>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
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
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-destructive-bg border-destructive text-destructive shadow-sm'
                          : 'bg-subsurface border-border text-muted hover:text-foreground hover:border-border-hover'
                      }`}
                    >
                      {reason}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted mb-1.5">
                Keterangan / Alasan Pembatalan <span className="text-destructive">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Jelaskan alasan nota ini dibatalkan secara detail..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full p-3 bg-subsurface border border-border rounded-xl text-foreground text-base sm:text-xs placeholder:text-muted-dark focus:outline-none focus:border-destructive resize-none"
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border bg-surface shrink-0 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-subsurface hover:bg-surface-hover border border-border text-foreground text-xs font-semibold transition-all cursor-pointer"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-5 py-2 rounded-full bg-destructive-solid hover:opacity-90 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
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
