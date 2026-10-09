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
  const expectedDrawerCash = Number(startingCapital) + Number(todayCashSales) - Number(todayExpenses)
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
🔻 Total Pengeluaran Kasir: ${formatRupiah(closingSummary.todayExpenses)}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#000000]/85 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg glass-panel border border-[#26272d] rounded-3xl shadow-2xl relative flex flex-col max-h-[92dvh] overflow-hidden my-auto">
        {/* Pinned Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#26272d] shrink-0 bg-[#121215]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Calculator size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Tutup Shift Kasir (Model Terbuka)</h3>
              <p className="text-[10px] text-[#bbcbb2]">
                Pencocokan Uang Fisik Laci Kasir dengan Sistem
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

        {error && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs shrink-0">
            {error}
          </div>
        )}

        {!isSuccessClosed ? (
          <>
            {/* Scrollable Body */}
            <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4 overscroll-contain">
              {/* Rincian Hitungan Komputer / Sistem */}
              <div className="p-3.5 rounded-lg bg-[#121215]/80 border border-[#26272d] space-y-2 text-xs">
                <div className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider flex items-center justify-between">
                  <span>Rincian Sistem Komputer</span>
                  <span className="text-[#6b7367] font-mono">Kasir: {cashierName}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#26272d]/60">
                  <span className="text-slate-200">Modal Awal Kasir</span>
                  <span className="font-mono font-bold text-white">{formatRupiah(startingCapital)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#26272d]/60">
                  <span className="text-slate-200">Penerimaan Tunai (Cash)</span>
                  <span className="font-mono font-bold text-emerald-400">+{formatRupiah(todayCashSales)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#26272d]/60">
                  <span className="text-slate-200">Penerimaan QRIS / Transfer Bank</span>
                  <span className="font-mono font-bold text-[#00ffff]">{formatRupiah(todayQrisSales)}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#26272d]/60">
                  <span className="text-slate-200">Pengeluaran Kasir Hari Ini</span>
                  <span className="font-mono font-bold text-rose-400">-{formatRupiah(todayExpenses)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 font-bold text-sm">
                  <span className="text-amber-300">Ekspektasi Uang Fisik Laci:</span>
                  <span className="font-mono text-amber-300 text-base">{formatRupiah(expectedDrawerCash)}</span>
                </div>
              </div>

              {/* Input Uang Fisik Nyata di Laci */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1.5">
                  Hitung & Masukkan Uang Fisik di Laci <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-[#bbcbb2] font-bold text-sm">Rp</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={physicalCash}
                    onChange={(e) => setPhysicalCash(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-[#121215] border border-[#26272d] rounded-lg text-white text-base font-mono font-bold focus:outline-none focus:border-[#00ffff]"
                    autoFocus
                  />
                </div>

                {/* Tampilan Selisih Real-Time */}
                {physicalCash !== '' && (
                  <div className={`mt-2 p-2.5 rounded-lg border flex items-center justify-between text-xs font-bold ${
                    discrepancy === 0
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : discrepancy > 0
                      ? 'bg-[#00ffff]/10 border-[#00ffff]/30 text-[#00ffff]'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  }`}>
                    <span className="flex items-center gap-1.5">
                      {discrepancy === 0 ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                      <span>{discrepancy === 0 ? 'Uang Fisik Cocok Sempurna' : discrepancy > 0 ? 'Selisih Lebih (Surplus)' : 'Selisih Kurang (Minus)'}</span>
                    </span>
                    <span className="font-mono text-sm">
                      {discrepancy > 0 ? '+' : ''}{formatRupiah(discrepancy)}
                    </span>
                  </div>
                )}
              </div>

              {/* Catatan / Alasan Selisih */}
              <div>
                <label className="block text-xs font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1.5">
                  Catatan Kasir / Keterangan Selisih
                </label>
                <textarea
                  rows={2}
                  placeholder="Tulis catatan penutupan kasir atau penjelasan jika ada selisih..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 bg-[#121215] border border-[#26272d] rounded-lg text-white text-xs focus:outline-none focus:border-[#00ffff] resize-none"
                />
              </div>
            </div>

            {/* Pinned Footer Actions */}
            <div className="px-6 py-3.5 border-t border-[#26272d] bg-[#18181c] shrink-0 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2.5 rounded-lg bg-[#121215] hover:bg-[#18181c] text-slate-200 text-xs font-semibold transition-all cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleProcessClosing}
                disabled={loading}
                className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Calculator size={14} />
                <span>{loading ? 'Menutup Kasir...' : 'Konfirmasi Tutup Kasir'}</span>
              </button>
            </div>
          </>
        ) : (
          /* TAMPILAN SUKSES & KIRIM LAPORAN WA */
          <div className="p-6 text-center space-y-4 overflow-y-auto flex-1 overscroll-contain animate-fade-in">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h4 className="text-lg font-black text-white">Tutup Kasir Berhasil!</h4>
              <p className="text-[#bbcbb2] text-xs mt-1">
                Data penutupan shift kasir telah dibukukan ke jurnal arus kas (cashflow).
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-[#121215]/80 border border-[#26272d] text-left text-xs space-y-1.5 max-w-sm mx-auto">
              <div className="flex justify-between">
                <span className="text-[#bbcbb2]">Total Uang Fisik Laci:</span>
                <span className="font-mono font-bold text-white">{formatRupiah(closingSummary?.physicalCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#bbcbb2]">Status Selisih:</span>
                <span className={`font-mono font-bold ${
                  closingSummary?.discrepancy === 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {closingSummary?.discrepancy === 0 ? 'PAS (Rp 0)' : `${formatRupiah(closingSummary?.discrepancy)}`}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleSendToWhatsApp}
                className="w-full py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                <Send size={15} />
                <span>Kirim Rekap ke WhatsApp Owner 📲</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-lg bg-[#121215] hover:bg-[#18181c] text-slate-200 font-bold text-xs transition-all cursor-pointer"
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
