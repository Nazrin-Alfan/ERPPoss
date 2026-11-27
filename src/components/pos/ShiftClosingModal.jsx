import React, { useState } from 'react'
import { 
  Calculator, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  Wallet, 
  DollarSign, 
  ArrowRight, 
  FileText, 
  X,
  CreditCard,
  Building
} from 'lucide-react'
import { formatRupiah } from '../../utils/helpers'

export default function ShiftClosingModal({
  isOpen,
  onClose,
  cashierName = 'Kasir',
  storeName = 'RelayPOS Outlet',
  ownerPhone = '',
  startingCapital = 0,
  todayCashSales = 0,
  todayQrisSales = 0,
  todayExpenses = 0,
  todayExchangeOut = 0,
  onConfirmClose
}) {
  const [physicalCash, setPhysicalCash] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSuccessClosed, setIsSuccessClosed] = useState(false)
  const [closingSummary, setClosingSummary] = useState(null)

  if (!isOpen) return null

  // Hitungan Model Terbuka Sistem
  const expectedDrawerCash =
    Number(startingCapital) + Number(todayCashSales) - Number(todayExpenses) - Number(todayExchangeOut)
  const physicalCashNum = parseFloat(physicalCash) || 0
  const discrepancy = physicalCashNum - expectedDrawerCash

  const handleProcessClosing = async () => {
    if (physicalCash === '') {
      return setError('Silakan masukkan jumlah uang fisik yang ada di laci kasir.')
    }

    setLoading(true)
    setError('')
    try {
      const recapData = {
        cashierName,
        storeName,
        startingCapital,
        todayCashSales,
        todayQrisSales,
        todayExpenses,
        todayExchangeOut,
        expectedDrawerCash,
        physicalCash: physicalCashNum,
        discrepancy,
        notes: notes.trim(),
        closedAt: new Date().toISOString()
      }

      if (onConfirmClose) {
        await onConfirmClose(recapData)
      }

      setClosingSummary(recapData)
      setIsSuccessClosed(true)
    } catch (err) {
      setError(err.message || 'Gagal memproses tutup kasir.')
    } finally {
      setLoading(false)
    }
  }

  const handleSendToWhatsApp = () => {
    if (!closingSummary) return

    const phoneClean = (ownerPhone || '').replace(/[^0-9]/g, '')
    const targetPhone = phoneClean.startsWith('0') ? '62' + phoneClean.substring(1) : phoneClean

    const message = `*LAPORAN REKAP TUTUP KASIR - RELAYPOS*
🏪 Outlet: ${closingSummary.storeName}
👤 Kasir: ${closingSummary.cashierName}
📅 Waktu: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full', timeStyle: 'short' })}
------------------------------------------------
💵 Modal Awal Laci: ${formatRupiah(closingSummary.startingCapital)}
🛒 Penjualan Tunai: ${formatRupiah(closingSummary.todayCashSales)}
💳 Penjualan QRIS / Bank: ${formatRupiah(closingSummary.todayQrisSales)}
🔻 Total Pengeluaran Kasir: ${formatRupiah(closingSummary.todayExpenses)}${Number(closingSummary.todayExchangeOut || 0) > 0 ? `\n🔁 Tukar Uang (Cash Keluar): -${formatRupiah(closingSummary.todayExchangeOut)}` : ''}
------------------------------------------------
📊 *Ekspektasi Uang Fisik Laci*: ${formatRupiah(closingSummary.expectedDrawerCash)}
💰 *Uang Fisik Dihitung Kasir*: ${formatRupiah(closingSummary.physicalCash)}
⚖️ *Selisih*: ${closingSummary.discrepancy === 0 ? '✅ PAS (Rp 0)' : `${closingSummary.discrepancy > 0 ? '🟢 LEBIH' : '🔴 KURANG'} ${formatRupiah(Math.abs(closingSummary.discrepancy))}`}
------------------------------------------------
📝 Catatan: ${closingSummary.notes || 'Semua transaksi dan fisik laci telah diverifikasi.'}
`

    const waUrl = targetPhone 
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`

    window.open(waUrl, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg bg-surface border border-border rounded-3xl shadow-2xl relative flex flex-col max-h-[92dvh] overflow-hidden my-auto">
        {/* Pinned Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-warning-bg border border-warning/30 flex items-center justify-center text-warning">
              <Calculator size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Tutup Shift Kasir (Model Terbuka)</h3>
              <p className="text-[10px] text-muted">
                Pencocokan Uang Fisik Laci Kasir dengan Sistem
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal tutup shift"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-subsurface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs shrink-0">
            {error}
          </div>
        )}

        {!isSuccessClosed ? (
          <>
            {/* Scrollable Body */}
            <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4 overscroll-contain">
              {/* Rincian Hitungan Komputer / Sistem */}
              <div className="p-3.5 rounded-xl bg-subsurface border border-border space-y-2 text-xs">
                <div className="text-[10px] uppercase font-bold text-muted tracking-wider flex items-center justify-between">
                  <span>Rincian Sistem Komputer</span>
                  <span className="text-muted-dark font-mono">Kasir: {cashierName}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/60">
                  <span className="text-muted">Modal Awal Kasir</span>
                  <span className="font-mono font-bold text-foreground tabular-nums">{formatRupiah(startingCapital)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/60">
                  <span className="text-muted">Penerimaan Tunai (Cash)</span>
                  <span className="font-mono font-bold text-success tabular-nums">+{formatRupiah(todayCashSales)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/60">
                  <span className="text-muted">Penerimaan QRIS / Transfer Bank</span>
                  <span className="font-mono font-bold text-primary tabular-nums">{formatRupiah(todayQrisSales)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/60">
                  <span className="text-muted">Pengeluaran Kasir Hari Ini</span>
                  <span className="font-mono font-bold text-destructive tabular-nums">-{formatRupiah(todayExpenses)}</span>
                </div>
                {Number(todayExchangeOut || 0) > 0 && (
                  <div className="flex justify-between items-center py-1 border-b border-border/60">
                    <span className="text-muted">Tukar Uang (Cash Keluar → QRIS)</span>
                    <span className="font-mono font-bold text-warning tabular-nums">-{formatRupiah(todayExchangeOut)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1.5 font-bold text-sm">
                  <span className="text-warning">Ekspektasi Uang Fisik Laci:</span>
                  <span className="font-mono text-warning text-base tabular-nums">{formatRupiah(expectedDrawerCash)}</span>
                </div>
              </div>

              {/* Input Uang Fisik Nyata di Laci */}
              <div>
                <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                  Hitung & Masukkan Uang Fisik di Laci <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted font-bold text-sm font-mono">Rp</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={physicalCash}
                    onChange={(e) => setPhysicalCash(e.target.value)}
                    className="w-full min-h-[44px] pl-11 pr-4 py-2.5 bg-subsurface border border-border rounded-xl text-foreground text-base font-mono font-bold tabular-nums focus:outline-none focus:border-ring"
                    autoFocus
                  />
                </div>

                {/* Tampilan Selisih Real-Time */}
                {physicalCash !== '' && (
                  <div className={`mt-2 p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
                    discrepancy === 0
                      ? 'bg-success-bg border-success/30 text-success'
                      : discrepancy > 0
                      ? 'bg-primary-soft border-primary/30 text-primary-soft-foreground'
                      : 'bg-destructive-bg border-destructive/30 text-destructive'
                  }`}>
                    <span className="flex items-center gap-1.5">
                      {discrepancy === 0 ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                      <span>{discrepancy === 0 ? 'Uang Fisik Cocok Sempurna' : discrepancy > 0 ? 'Selisih Lebih (Surplus)' : 'Selisih Kurang (Minus)'}</span>
                    </span>
                    <span className="font-mono text-sm tabular-nums">
                      {discrepancy > 0 ? '+' : ''}{formatRupiah(discrepancy)}
                    </span>
                  </div>
                )}
              </div>

              {/* Catatan / Alasan Selisih */}
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Catatan Kasir / Keterangan Selisih
                </label>
                <textarea
                  rows={2}
                  placeholder="Tulis catatan penutupan kasir atau penjelasan jika ada selisih..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 bg-subsurface border border-border rounded-xl text-foreground text-base sm:text-xs placeholder:text-muted-dark focus:outline-none focus:border-ring resize-none"
                />
              </div>
            </div>

            {/* Pinned Footer Actions */}
            <div className="px-6 py-3.5 border-t border-border bg-surface shrink-0 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-subsurface hover:bg-surface-hover border border-border text-foreground text-xs font-semibold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleProcessClosing}
                disabled={loading}
                className="min-h-[44px] px-5 py-2 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Calculator size={14} />
                <span>{loading ? 'Menutup Kasir...' : 'Konfirmasi Tutup Kasir'}</span>
              </button>
            </div>
          </>
        ) : (
          /* TAMPILAN SUKSES & KIRIM LAPORAN WA */
          <div className="p-6 text-center space-y-4 overflow-y-auto flex-1 overscroll-contain animate-fade-in">
            <div className="w-14 h-14 mx-auto rounded-full bg-success-bg text-success flex items-center justify-center border border-success/30">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h4 className="text-lg font-black text-foreground">Tutup Kasir Berhasil!</h4>
              <p className="text-muted text-xs mt-1">
                Audit penutupan shift kasir telah tersimpan dengan aman.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-subsurface border border-border text-left text-xs space-y-1.5 max-w-sm mx-auto">
              <div className="flex justify-between">
                <span className="text-muted">Total Uang Fisik Laci:</span>
                <span className="font-mono font-bold text-foreground tabular-nums">{formatRupiah(closingSummary?.physicalCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Status Selisih:</span>
                <span className={`font-mono font-bold tabular-nums ${
                  closingSummary?.discrepancy === 0 ? 'text-success' : 'text-warning'
                }`}>
                  {closingSummary?.discrepancy === 0 ? 'PAS (Rp 0)' : `${formatRupiah(closingSummary?.discrepancy)}`}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleSendToWhatsApp}
                className="w-full min-h-[48px] py-3 px-4 rounded-full bg-success text-ink-foreground font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-all cursor-pointer"
              >
                <Send size={15} />
                <span>Kirim Rekap ke WhatsApp Owner</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-subsurface hover:bg-surface-hover border border-border text-foreground font-bold text-xs transition-all cursor-pointer"
              >
                Selesai & Keluar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
