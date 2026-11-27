import React, { useState, useMemo } from 'react'
import {
  X,
  Car,
  Coffee,
  Layers,
  Search,
  Download,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  DollarSign,
  Users,
  Package,
  Calendar,
  Filter
} from 'lucide-react'
import { formatRupiah } from '../../utils/helpers'
import { generateCSVString, downloadCSV } from '../../utils/financeHelpers'

export default function ExpenseDetailModal({
  isOpen,
  onClose,
  division = 'CARWASH', // 'CARWASH' | 'CAFE' | 'SHARED' | 'ALL'
  expenseData = {
    carwashExpenses: [],
    cafeExpenses: [],
    sharedExpenses: [],
    carwashCommission: 0,
    carwashBahan: 0,
    carwashOperasional: 0,
    cafeBahanBaku: 0,
    cafeOperasional: 0,
    bebanBersamaUtilitas: 0,
    bebanBersamaGaji: 0,
    bebanBersamaLain: 0,
    totalCarwashExp: 0,
    totalCafeExp: 0,
    totalSharedExp: 0,
    totalExpenses: 0
  },
  timeRangeLabel = 'Periode Terpilih'
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')

  const isCarwash = division === 'CARWASH'
  const isCafe = division === 'CAFE'
  const isShared = division === 'SHARED'
  const isAll = division === 'ALL'

  // Determine active item list
  const activeItems = useMemo(() => {
    let rawList = []
    if (isCarwash) {
      rawList = expenseData.carwashExpenses || []
    } else if (isCafe) {
      rawList = expenseData.cafeExpenses || []
    } else if (isShared) {
      rawList = expenseData.sharedExpenses || []
    } else {
      rawList = [
        ...(expenseData.carwashExpenses || []),
        ...(expenseData.cafeExpenses || []),
        ...(expenseData.sharedExpenses || [])
      ]
    }

    // Sort by date descending
    return rawList.sort((a, b) => {
      const dateA = new Date(a.tanggal || 0).getTime()
      const dateB = new Date(b.tanggal || 0).getTime()
      return dateB - dateA
    })
  }, [isCarwash, isCafe, isShared, expenseData])

  // Extract unique categories for filter
  const availableCategories = useMemo(() => {
    const cats = new Set(activeItems.map(item => item.kategori).filter(Boolean))
    return ['ALL', ...Array.from(cats)]
  }, [activeItems])

  // Filtered list
  const filteredList = useMemo(() => {
    return activeItems.filter(item => {
      if (selectedCategory !== 'ALL' && item.kategori !== selectedCategory) {
        return false
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const ket = String(item.keterangan || '').toLowerCase()
        const kat = String(item.kategori || '').toLowerCase()
        const akun = String(item.akun || '').toLowerCase()
        return ket.includes(q) || kat.includes(q) || akun.includes(q)
      }
      return true
    })
  }, [activeItems, selectedCategory, searchTerm])

  const totalFilteredNominal = useMemo(() => {
    return filteredList.reduce((sum, item) => sum + (parseFloat(item.nominal) || 0), 0)
  }, [filteredList])

  // Modal Title & Theming
  const titleInfo = useMemo(() => {
    if (isCarwash) {
      return {
        title: 'Rincian Pengeluaran Divisi Carwash',
        subtitle: 'Daftar komisi kru pencuci, chemical, shampoo, sabun & utilitas cuci',
        icon: Car,
        badgeClass: 'bg-primary-soft border-primary/25 text-primary',
        total: expenseData.totalCarwashExp || totalFilteredNominal
      }
    }
    if (isCafe) {
      return {
        title: 'Rincian Pengeluaran Divisi Cafe & Resto',
        subtitle: 'Daftar belanja bahan baku (kopi, susu, sirup), kemasan & dapur',
        icon: Coffee,
        badgeClass: 'bg-warning-bg border-warning/30 text-warning',
        total: expenseData.totalCafeExp || totalFilteredNominal
      }
    }
    if (isShared) {
      return {
        title: 'Rincian Pengeluaran Bersama (Shared Overhead)',
        subtitle: 'Daftar biaya utilitas (listrik, air, wifi), gaji kru umum & casbon',
        icon: Layers,
        badgeClass: 'bg-subsurface border-border text-foreground',
        total: expenseData.totalSharedExp || totalFilteredNominal
      }
    }
    return {
      title: 'Rincian Seluruh Pengeluaran Holding',
      subtitle: 'Konsolidasi pengeluaran carwash, cafe & beban bersama operasional',
      icon: DollarSign,
      badgeClass: 'bg-destructive-bg border-destructive/30 text-destructive',
      total: expenseData.totalExpenses || totalFilteredNominal
    }
  }, [isCarwash, isCafe, isShared, expenseData, totalFilteredNominal])

  if (!isOpen) return null

  const TitleIcon = titleInfo.icon

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredList.length === 0) return
    const headers = ['Tanggal', 'Divisi', 'Kategori', 'Keterangan', 'Akun/Sumber', 'Nominal']
    const rows = filteredList.map(item => [
      item.tanggal || '',
      item.divisi || division,
      item.kategori || '',
      item.keterangan || '',
      item.akun || '',
      item.nominal || 0
    ])

    const columns = headers.map((label, index) => ({ label, accessor: row => row[index] }))
    downloadCSV(generateCSVString(columns, rows), `pengeluaran_${division.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-foreground">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3 bg-subsurface">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${titleInfo.badgeClass}`}>
              <TitleIcon size={20} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-foreground truncate flex items-center gap-2">
                <span className="truncate">{titleInfo.title}</span>
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-md bg-surface border border-border text-muted shrink-0">
                  {timeRangeLabel}
                </span>
              </h2>
              <p className="text-xs text-muted truncate mt-0.5">{titleInfo.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-muted hover:text-foreground rounded-xl hover:bg-surface-hover transition-colors cursor-pointer active:scale-[0.98]"
            title="Tutup Modal"
            aria-label="Tutup modal rincian pengeluaran"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="p-4 bg-canvas border-b border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-surface border border-border">
            <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
              Total Pengeluaran
            </span>
            <p className="text-xl font-bold text-destructive font-mono tabular-nums mt-0.5">
              {formatRupiah(titleInfo.total)}
            </p>
            <span className="text-[11px] text-muted">
              {activeItems.length} transaksi tercatat
            </span>
          </div>

          {isCarwash && (
            <>
              <div className="p-3 rounded-xl bg-surface border border-border">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
                  Komisi Kru Pencuci
                </span>
                <p className="text-xl font-bold text-primary font-mono tabular-nums mt-0.5">
                  {formatRupiah(expenseData.carwashCommission || 0)}
                </p>
                <span className="text-[11px] text-muted">
                  Bagi hasil operasional cuci
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface border border-border">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
                  Bahan &amp; Chemical
                </span>
                <p className="text-xl font-bold text-foreground font-mono tabular-nums mt-0.5">
                  {formatRupiah(expenseData.carwashBahan || 0)}
                </p>
                <span className="text-[11px] text-muted">
                  Shampoo, semir &amp; sabun cuci
                </span>
              </div>
            </>
          )}

          {isCafe && (
            <>
              <div className="p-3 rounded-xl bg-surface border border-border">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
                  Belanja Bahan Baku
                </span>
                <p className="text-xl font-bold text-warning font-mono tabular-nums mt-0.5">
                  {formatRupiah(expenseData.cafeBahanBaku || 0)}
                </p>
                <span className="text-[11px] text-muted">
                  Kopi, susu, sirup &amp; kemasan
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface border border-border">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
                  Operasional Dapur
                </span>
                <p className="text-xl font-bold text-foreground font-mono tabular-nums mt-0.5">
                  {formatRupiah(expenseData.cafeOperasional || 0)}
                </p>
                <span className="text-[11px] text-muted">
                  Gas, perlengkapan &amp; dapur
                </span>
              </div>
            </>
          )}

          {isShared && (
            <>
              <div className="p-3 rounded-xl bg-surface border border-border">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
                  Gaji &amp; Casbon Kru
                </span>
                <p className="text-xl font-bold text-warning font-mono tabular-nums mt-0.5">
                  {formatRupiah(expenseData.bebanBersamaGaji || 0)}
                </p>
                <span className="text-[11px] text-muted">
                  Gaji tetap &amp; kasbon karyawan
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface border border-border">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
                  Utilitas (Listrik/Air/Wifi)
                </span>
                <p className="text-xl font-bold text-foreground font-mono tabular-nums mt-0.5">
                  {formatRupiah(expenseData.bebanBersamaUtilitas || 0)}
                </p>
                <span className="text-[11px] text-muted">
                  Beban utilitas operasional
                </span>
              </div>
            </>
          )}

          {isAll && (
            <>
              <div className="p-3 rounded-xl bg-surface border border-border">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
                  Beban Carwash + Cafe
                </span>
                <p className="text-xl font-bold text-foreground font-mono tabular-nums mt-0.5">
                  {formatRupiah((expenseData.totalCarwashExp || 0) + (expenseData.totalCafeExp || 0))}
                </p>
                <span className="text-[11px] text-muted">
                  Total operasional 2 divisi
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface border border-border">
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">
                  Beban Bersama (Overhead)
                </span>
                <p className="text-xl font-bold text-warning font-mono tabular-nums mt-0.5">
                  {formatRupiah(expenseData.totalSharedExp || 0)}
                </p>
                <span className="text-[11px] text-muted">
                  Gaji, utilitas &amp; operasional
                </span>
              </div>
            </>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 sm:p-4 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface">
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Cari keterangan / kategori..."
              aria-label="Cari rincian pengeluaran"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full min-h-[44px] pl-9 pr-3 py-1.5 rounded-xl bg-subsurface border border-border text-base sm:text-xs text-foreground placeholder:text-muted-dark focus:outline-none focus:border-border-active transition-colors"
            />
          </div>

          {/* Category Filter Chips & Export */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end overflow-x-auto no-scrollbar">
            {availableCategories.length > 2 && (
              <div className="flex items-center gap-1 bg-subsurface p-1 rounded-xl border border-border text-xs shrink-0">
                {availableCategories.slice(0, 4).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                      selectedCategory === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {cat === 'ALL' ? 'Semua Kategori' : cat}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleExportCSV}
              className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-subsurface hover:bg-surface-hover text-foreground border border-border text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] shrink-0"
              title="Ekspor Data ke CSV"
            >
              <Download size={13} />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* Scrollable Data Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[50vh]">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted space-y-2">
              <AlertTriangle size={24} className="mx-auto text-muted-dark" />
              <p className="font-semibold text-foreground">Tidak ada rincian pengeluaran yang ditemukan</p>
              <p className="text-muted-dark">Coba ubah rentang tanggal atau kata kunci pencarian Anda.</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-subsurface text-muted border-b border-border uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Kategori</th>
                    <th className="py-2.5 px-3">Keterangan / Uraian</th>
                    <th className="py-2.5 px-3">Sumber Dana</th>
                    <th className="py-2.5 px-3 text-right">Nominal (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredList.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-surface-hover transition-colors">
                      <td className="py-2.5 px-3 text-foreground font-mono tabular-nums whitespace-nowrap">
                        {item.tanggal ? item.tanggal.slice(0, 10) : '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-subsurface border border-border text-foreground text-[10px] font-semibold">
                          {item.kategori || 'Operasional'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-foreground font-medium">
                        {item.keterangan || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-muted text-[11px] whitespace-nowrap">
                        {item.akun || 'Kasir'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-destructive whitespace-nowrap">
                        {formatRupiah(item.nominal || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-border bg-subsurface flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-muted">
            Menampilkan <strong className="text-foreground font-mono tabular-nums">{filteredList.length}</strong> dari{' '}
            <strong className="text-foreground font-mono tabular-nums">{activeItems.length}</strong> catatan pengeluaran
          </div>
          <div className="flex items-center gap-3">
            <span className="text-foreground font-semibold">
              Total Terfilter:{' '}
              <strong className="text-destructive font-mono tabular-nums text-sm ml-1">
                {formatRupiah(totalFilteredNominal)}
              </strong>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-1.5 rounded-full bg-surface hover:bg-surface-hover border border-border text-foreground font-semibold transition-all cursor-pointer active:scale-[0.98]"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
