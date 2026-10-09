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
        accentColor: '#00ffff',
        total: expenseData.totalCarwashExp || totalFilteredNominal
      }
    }
    if (isCafe) {
      return {
        title: 'Rincian Pengeluaran Divisi Cafe & Resto',
        subtitle: 'Daftar belanja bahan baku (kopi, susu, sirup), kemasan & dapur',
        icon: Coffee,
        accentColor: '#ffc71f',
        total: expenseData.totalCafeExp || totalFilteredNominal
      }
    }
    if (isShared) {
      return {
        title: 'Rincian Pengeluaran Bersama (Shared Overhead)',
        subtitle: 'Daftar biaya utilitas (listrik, air, wifi), gaji kru umum & casbon',
        icon: Layers,
        accentColor: '#f57733',
        total: expenseData.totalSharedExp || totalFilteredNominal
      }
    }
    return {
      title: 'Rincian Seluruh Pengeluaran Holding',
      subtitle: 'Konsolidasi pengeluaran carwash, cafe & beban bersama operasional',
      icon: DollarSign,
      accentColor: '#ff5102',
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
      `"${(item.kategori || '').replace(/"/g, '""')}"`,
      `"${(item.keterangan || '').replace(/"/g, '""')}"`,
      `"${(item.akun || '').replace(/"/g, '""')}"`,
      item.nominal || 0
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `pengeluaran_${division.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#121215] border border-[#26272d] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#26272d] flex items-center justify-between gap-3 bg-[#18181c]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: `${titleInfo.accentColor}15`,
                borderColor: `${titleInfo.accentColor}40`,
                color: titleInfo.accentColor
              }}
            >
              <TitleIcon size={20} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate flex items-center gap-2">
                <span>{titleInfo.title}</span>
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-md bg-[#26272d] text-[#bbcbb2]">
                  {timeRangeLabel}
                </span>
              </h2>
              <p className="text-xs text-[#bbcbb2] truncate mt-0.5">{titleInfo.subtitle}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[#bbcbb2] hover:text-white rounded-lg hover:bg-[#26272d] transition-colors cursor-pointer active:scale-[0.98]"
            title="Tutup Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="p-4 bg-[#141418] border-b border-[#26272d] grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
            <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
              Total Pengeluaran
            </span>
            <p className="text-xl font-bold text-[#ff5102] font-mono mt-0.5">
              {formatRupiah(titleInfo.total)}
            </p>
            <span className="text-[11px] text-[#bbcbb2]">
              {activeItems.length} transaksi tercatat
            </span>
          </div>

          {isCarwash && (
            <>
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
                  Komisi Kru Pencuci
                </span>
                <p className="text-xl font-bold text-[#00ffff] font-mono mt-0.5">
                  {formatRupiah(expenseData.carwashCommission || 0)}
                </p>
                <span className="text-[11px] text-[#bbcbb2]">
                  Bagi hasil operasional cuci
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
                  Bahan & Chemical
                </span>
                <p className="text-xl font-bold text-white font-mono mt-0.5">
                  {formatRupiah(expenseData.carwashBahan || 0)}
                </p>
                <span className="text-[11px] text-[#bbcbb2]">
                  Shampoo, semir & sabun cuci
                </span>
              </div>
            </>
          )}

          {isCafe && (
            <>
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
                  Belanja Bahan Baku
                </span>
                <p className="text-xl font-bold text-[#ffc71f] font-mono mt-0.5">
                  {formatRupiah(expenseData.cafeBahanBaku || 0)}
                </p>
                <span className="text-[11px] text-[#bbcbb2]">
                  Kopi, susu, sirup & kemasan
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
                  Operasional Dapur
                </span>
                <p className="text-xl font-bold text-white font-mono mt-0.5">
                  {formatRupiah(expenseData.cafeOperasional || 0)}
                </p>
                <span className="text-[11px] text-[#bbcbb2]">
                  Gas, perlengkapan & dapur
                </span>
              </div>
            </>
          )}

          {isShared && (
            <>
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
                  Gaji & Casbon Kru
                </span>
                <p className="text-xl font-bold text-[#f57733] font-mono mt-0.5">
                  {formatRupiah(expenseData.bebanBersamaGaji || 0)}
                </p>
                <span className="text-[11px] text-[#bbcbb2]">
                  Gaji tetap & kasbon karyawan
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
                  Utilitas (Listrik/Air/Wifi)
                </span>
                <p className="text-xl font-bold text-white font-mono mt-0.5">
                  {formatRupiah(expenseData.bebanBersamaUtilitas || 0)}
                </p>
                <span className="text-[11px] text-[#bbcbb2]">
                  Beban utilitas operasional
                </span>
              </div>
            </>
          )}

          {isAll && (
            <>
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
                  Beban Carwash + Cafe
                </span>
                <p className="text-xl font-bold text-white font-mono mt-0.5">
                  {formatRupiah((expenseData.totalCarwashExp || 0) + (expenseData.totalCafeExp || 0))}
                </p>
                <span className="text-[11px] text-[#bbcbb2]">
                  Total operasional 2 divisi
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                <span className="text-[10px] uppercase font-bold text-[#bbcbb2] tracking-wider block">
                  Beban Bersama (Overhead)
                </span>
                <p className="text-xl font-bold text-[#f57733] font-mono mt-0.5">
                  {formatRupiah(expenseData.totalSharedExp || 0)}
                </p>
                <span className="text-[11px] text-[#bbcbb2]">
                  Gaji, utilitas & operasional
                </span>
              </div>
            </>
          )}
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 sm:p-4 border-b border-[#26272d] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#bbcbb2]" />
            <input
              type="text"
              placeholder="Cari keterangan / kategori..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#18181c] border border-[#26272d] text-xs text-white placeholder:text-[#6b7367] focus:outline-none focus:border-[#00ffff] transition-colors"
            />
          </div>

          {/* Category Filter Chips & Export */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end overflow-x-auto no-scrollbar">
            {availableCategories.length > 2 && (
              <div className="flex items-center gap-1 bg-[#18181c] p-0.5 rounded-lg border border-[#26272d] text-xs shrink-0">
                {availableCategories.slice(0, 4).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                      selectedCategory === cat
                        ? 'bg-[#26272d] text-white'
                        : 'text-[#bbcbb2] hover:text-white'
                    }`}
                  >
                    {cat === 'ALL' ? 'Semua Kategori' : cat}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg bg-[#18181c] hover:bg-[#242428] text-white border border-[#26272d] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] shrink-0"
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
            <div className="py-12 text-center text-xs text-[#bbcbb2] space-y-2">
              <AlertTriangle size={24} className="mx-auto text-[#6b7367]" />
              <p className="font-semibold text-white">Tidak ada rincian pengeluaran yang ditemukan</p>
              <p className="text-[#6b7367]">Coba ubah rentang tanggal atau kata kunci pencarian Anda.</p>
            </div>
          ) : (
            <div className="border border-[#26272d] rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#18181c] text-[#bbcbb2] border-b border-[#26272d] uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Kategori</th>
                    <th className="py-2.5 px-3">Keterangan / Uraian</th>
                    <th className="py-2.5 px-3">Sumber Dana</th>
                    <th className="py-2.5 px-3 text-right">Nominal (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#26272d]">
                  {filteredList.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-[#18181c]/60 transition-colors">
                      <td className="py-2.5 px-3 text-white font-mono whitespace-nowrap">
                        {item.tanggal ? item.tanggal.slice(0, 10) : '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-[#26272d] text-white text-[10px] font-semibold">
                          {item.kategori || 'Operasional'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-white font-medium">
                        {item.keterangan || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-[#bbcbb2] text-[11px] whitespace-nowrap">
                        {item.akun || 'Kasir'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#ff5102] whitespace-nowrap">
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
        <div className="p-3 sm:p-4 border-t border-[#26272d] bg-[#18181c] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-[#bbcbb2]">
            Menampilkan <strong className="text-white font-mono">{filteredList.length}</strong> dari{' '}
            <strong className="text-white font-mono">{activeItems.length}</strong> catatan pengeluaran
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold">
              Total Terfilter:{' '}
              <strong className="text-[#ff5102] font-mono text-sm ml-1">
                {formatRupiah(totalFilteredNominal)}
              </strong>
            </span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#26272d] hover:bg-[#34353d] text-white font-semibold transition-all cursor-pointer active:scale-[0.98]"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
