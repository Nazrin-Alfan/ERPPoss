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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-3xl p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-soft border border-primary/30 flex items-center justify-center text-primary-soft-foreground">
              <Users size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Rekap Komisi Kru Pencuci Hari Ini</h3>
              <p className="text-[10px] text-muted">
                Transparansi Upah Harian Kru Lapangan (Solo 100% / Tim 50%)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal komisi kru"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-subsurface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* List of Crew */}
        <div className="flex-1 overflow-y-auto my-4 space-y-3 custom-scrollbar pr-1">
          {crewSummaries.length === 0 ? (
            <div className="text-center py-12 text-muted text-xs">
              Belum ada pengerjaan cuci mobil yang tercatat hari ini.
            </div>
          ) : (
            crewSummaries.map((crew) => {
              const netWage = Math.max(0, (crew.totalWage || 0) - (crew.totalWithdrawals || 0))
              return (
                <div
                  key={crew.name}
                  className="p-4 rounded-xl bg-subsurface border border-border hover:border-border-hover transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-soft border border-primary/30 flex items-center justify-center text-primary-soft-foreground font-bold shrink-0">
                      {crew.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <span>{crew.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-foreground border border-border font-mono tabular-nums">
                          {crew.totalCars || 0} Mobil
                        </span>
                      </h4>
                      <p className="text-[11px] text-muted mt-0.5 tabular-nums">
                        Komisi: <strong className="text-foreground">{formatRupiah(crew.totalWage || 0)}</strong>
                        {crew.totalWithdrawals > 0 && (
                          <span className="text-destructive ml-2">
                            • Kasbon: -{formatRupiah(crew.totalWithdrawals)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border">
                    <div className="text-left sm:text-right">
                      <span className="text-[9px] uppercase tracking-wider text-muted font-semibold block">
                        Upah Bersih
                      </span>
                      <span className="text-sm font-black text-foreground font-mono tabular-nums">
                        {formatRupiah(netWage)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handlePrintMiniSlip(crew)}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] shadow-sm"
                      title="Cetak Slip Thermal Mini"
                    >
                      <Printer size={14} className="text-primary" />
                      <span>Cetak Slip</span>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border flex items-center justify-between shrink-0 gap-3">
          <p className="text-[10px] text-muted-dark italic">
            *Komisi langsung dihitung otomatis saat transaksi cuci mobil diselesaikan kasir.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-subsurface hover:bg-surface-hover border border-border text-foreground text-xs font-bold transition-all cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
