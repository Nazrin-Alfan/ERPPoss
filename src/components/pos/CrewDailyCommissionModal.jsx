import React, { useState } from 'react'
import { Users, Printer, Sparkles, X, Car, DollarSign, CheckCircle2 } from 'lucide-react'
import { formatRupiah } from '../../utils/helpers'

export default function CrewDailyCommissionModal({
  isOpen,
  onClose,
  storeName = 'RelayPOS Outlet',
  crewSummaries = [],
  onPrintSlip
}) {
  const [selectedCrew, setSelectedCrew] = useState(null)

  if (!isOpen) return null

  const handlePrintMiniSlip = (crew) => {
    if (onPrintSlip) {
      onPrintSlip(crew)
    } else {
      window.print()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl glass-panel border border-slate-800 rounded-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Users size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Rekap Komisi Kru Pencuci Hari Ini</h3>
              <p className="text-[10px] text-slate-400">
                Transparansi Upah Harian Kru Lapangan (Solo 100% / Tim 50%)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* List of Crew */}
        <div className="flex-1 overflow-y-auto my-4 space-y-3 custom-scrollbar pr-1">
          {crewSummaries.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              Belum ada pengerjaan cuci mobil yang tercatat hari ini.
            </div>
          ) : (
            crewSummaries.map((crew) => {
              const netWage = Math.max(0, (crew.totalWage || 0) - (crew.totalWithdrawals || 0))
              return (
                <div
                  key={crew.name}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold shrink-0">
                      {crew.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>{crew.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                          {crew.totalCars || 0} Mobil
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Komisi: <strong className="text-slate-200">{formatRupiah(crew.totalWage || 0)}</strong>
                        {crew.totalWithdrawals > 0 && (
                          <span className="text-rose-400 ml-2">
                            • Kasbon: -{formatRupiah(crew.totalWithdrawals)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
                    <div className="text-left sm:text-right">
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold block">
                        Upah Bersih
                      </span>
                      <span className="text-sm font-black text-emerald-400 font-mono">
                        {formatRupiah(netWage)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePrintMiniSlip(crew)}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
                      title="Cetak Slip Thermal Mini"
                    >
                      <Printer size={13} className="text-brand-emerald" />
                      <span>Cetak Slip</span>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-slate-500 italic">
            *Komisi langsung dihitung otomatis saat transaksi cuci mobil diselesaikan kasir.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
