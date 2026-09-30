import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import {
  Users,
  Search,
  Award,
  Calendar,
  Phone,
  Car,
  Download,
  Filter,
  X,
  RefreshCw,
  Clock,
  Sparkles,
  ExternalLink,
  MessageCircle
} from 'lucide-react'
import { formatRupiah, parseDateSafe } from '../utils/helpers'

const fetchAllCarwash = async () => {
  let allData = []
  let from = 0
  const step = 1000
  while (true) {
    const { data, error } = await supabase
      .from('carwash')
      .select('*')
      .range(from, from + step - 1)
    if (error || !data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < step) break
    from += step
  }
  return allData
}

const CRM = () => {
  const [loading, setLoading] = useState(true)
  const [carwashList, setCarwashList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSegment, setFilterSegment] = useState('ALL') // 'ALL' | 'VIP' | 'REGULAR' | 'NEW'
  const [selectedCustomerPlat, setSelectedCustomerPlat] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  const loadData = async () => {
    setLoading(true)
    try {
      const data = await fetchAllCarwash()
      setCarwashList(data || [])
    } catch (err) {
      console.error('Error fetching CRM data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Aggregate Customer Records by Plate Number
  const customerList = useMemo(() => {
    const map = {}
    const sorted = [...carwashList].sort((a, b) => new Date(a.created_at || a.tanggal).getTime() - new Date(b.created_at || b.tanggal).getTime())

    sorted.forEach(cw => {
      if (!cw.plat || !cw.plat.trim()) return
      const plat = cw.plat.trim().toUpperCase().replace(/\s+/g, ' ')

      if (!map[plat]) {
        map[plat] = {
          plat,
          model: cw.model || 'Mobil',
          noTelepon: cw.no_telepon || '-',
          totalVisits: 0,
          totalSpent: 0,
          firstVisit: cw.tanggal || cw.created_at,
          lastVisit: cw.tanggal || cw.created_at,
          favoritePackageMap: {},
          visitsHistory: []
        }
      }

      map[plat].totalVisits += 1
      const price = parseFloat(cw.harga || 0)
      map[plat].totalSpent += price
      map[plat].lastVisit = cw.tanggal || cw.created_at
      if (cw.model) map[plat].model = cw.model
      if (cw.no_telepon && cw.no_telepon !== '-') map[plat].noTelepon = cw.no_telepon

      const pkt = (cw.paket && cw.paket.trim()) ? cw.paket.trim() : 'PAKET CUCI BIASA'
      map[plat].favoritePackageMap[pkt] = (map[plat].favoritePackageMap[pkt] || 0) + 1

      map[plat].visitsHistory.push({
        visitNumber: map[plat].totalVisits,
        tanggal: cw.tanggal || cw.created_at,
        jam: cw.jam || '',
        paket: pkt,
        ukuran: cw.ukuran || 'Medium',
        variant: cw.variant || 'Regular',
        harga: price,
        pencuci: `${cw.anggota_1 || ''} ${cw.anggota_2 ? '+ ' + cw.anggota_2 : ''}`.trim()
      })
    })

    return Object.values(map).map(cust => {
      let favPkg = 'PAKET CUCI BIASA'
      let maxCount = 0
      Object.entries(cust.favoritePackageMap).forEach(([pkg, count]) => {
        if (count > maxCount) {
          maxCount = count
          favPkg = pkg
        }
      })

      let segment = 'Pelanggan Baru'
      let segmentBadge = 'bg-slate-800 text-slate-300 border-slate-700'
      if (cust.totalVisits >= 5) {
        segment = 'VIP (Setia)'
        segmentBadge = 'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30'
      } else if (cust.totalVisits >= 2) {
        segment = 'Reguler'
        segmentBadge = 'bg-purple-500/15 text-purple-400 border-purple-500/20'
      }

      return {
        ...cust,
        favPkg,
        segment,
        segmentBadge
      }
    }).sort((a, b) => b.totalVisits - a.totalVisits)
  }, [carwashList])

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalCustomers = customerList.length
    const vipCount = customerList.filter(c => c.totalVisits >= 5).length
    const regularCount = customerList.filter(c => c.totalVisits >= 2 && c.totalVisits < 5).length
    const newCount = customerList.filter(c => c.totalVisits === 1).length
    const totalSpentAll = customerList.reduce((sum, c) => sum + c.totalSpent, 0)
    const avgSpentPerCustomer = totalCustomers > 0 ? Math.round(totalSpentAll / totalCustomers) : 0

    return {
      totalCustomers,
      vipCount,
      regularCount,
      newCount,
      totalSpentAll,
      avgSpentPerCustomer
    }
  }, [customerList])

  // Filter & Search
  const filteredCustomers = useMemo(() => {
    return customerList.filter(cust => {
      const q = searchQuery.toLowerCase()
      const matchesSearch = cust.plat.toLowerCase().includes(q) ||
        cust.model.toLowerCase().includes(q) ||
        cust.noTelepon.toLowerCase().includes(q) ||
        cust.favPkg.toLowerCase().includes(q)

      let matchesFilter = true
      if (filterSegment === 'VIP') matchesFilter = cust.totalVisits >= 5
      else if (filterSegment === 'REGULAR') matchesFilter = cust.totalVisits >= 2 && cust.totalVisits < 5
      else if (filterSegment === 'NEW') matchesFilter = cust.totalVisits === 1

      return matchesSearch && matchesFilter
    })
  }, [customerList, searchQuery, filterSegment])

  const totalPages = Math.ceil(filteredCustomers.length / pageSize)
  const paginatedCustomers = useMemo(() => {
    const from = (currentPage - 1) * pageSize
    return filteredCustomers.slice(from, from + pageSize)
  }, [filteredCustomers, currentPage, pageSize])

  const activeCustomer = useMemo(() => {
    if (!selectedCustomerPlat) return null
    return customerList.find(c => c.plat === selectedCustomerPlat) || null
  }, [customerList, selectedCustomerPlat])

  // Export CSV
  const handleExportCSV = () => {
    if (customerList.length === 0) return
    const headers = ['Nomor Plat', 'Model Kendaraan', 'No Telepon', 'Kunjungan', 'Total Belanja', 'Paket Favorit', 'Kunjungan Terakhir', 'Segmen']
    const rows = customerList.map(c => [
      `"${c.plat}"`,
      `"${c.model}"`,
      `"${c.noTelepon}"`,
      c.totalVisits,
      c.totalSpent,
      `"${c.favPkg}"`,
      `"${c.lastVisit}"`,
      `"${c.segment}"`
    ])
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `data_pelanggan_carwash_${new Date().toISOString().substring(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-6 pb-24 md:pb-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/10">
              <Users size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Manajemen Pelanggan & CRM
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 uppercase tracking-wider">
                  Carwash Loyalty
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">Analisis retensi, histori kunjungan plat nomor, paket cuci terfavorit & engagement</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            <Download size={14} className="text-cyan-400" />
            Ekspor CSV
          </button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">Total Pelanggan</span>
            <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Users size={16} />
            </span>
          </div>
          <h3 className="text-2xl font-black text-white">{summaryMetrics.totalCustomers}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Kendaraan terdaftar unik</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">Pelanggan Setia (VIP)</span>
            <span className="p-2 rounded-lg bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20">
              <Award size={16} />
            </span>
          </div>
          <h3 className="text-2xl font-black text-emerald-400">{summaryMetrics.vipCount}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Kunjungan cuci ≥ 5 kali</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">Pelanggan Reguler</span>
            <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Car size={16} />
            </span>
          </div>
          <h3 className="text-2xl font-black text-purple-400">{summaryMetrics.regularCount}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Kunjungan cuci 2 - 4 kali</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">Pelanggan Baru</span>
            <span className="p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
              <Sparkles size={16} />
            </span>
          </div>
          <h3 className="text-2xl font-black text-white">{summaryMetrics.newCount}</h3>
          <p className="text-[11px] text-slate-500 mt-1">Kunjungan cuci perdana (1x)</p>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h3 className="text-sm font-bold text-white">Daftar Kendaraan & Histori Loyalitas</h3>
            <p className="text-xs text-slate-400">Total {filteredCustomers.length} kendaraan ditemukan</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1) }}
                placeholder="Cari Plat / Model / No HP..."
                className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 w-56"
              />
            </div>

            {/* Segment Selector */}
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => { setFilterSegment('ALL'); setCurrentPage(1) }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${filterSegment === 'ALL' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                Semua
              </button>
              <button
                onClick={() => { setFilterSegment('VIP'); setCurrentPage(1) }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${filterSegment === 'VIP' ? 'bg-brand-emerald text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                VIP (≥5x)
              </button>
              <button
                onClick={() => { setFilterSegment('REGULAR'); setCurrentPage(1) }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${filterSegment === 'REGULAR' ? 'bg-purple-500 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Reguler (2-4x)
              </button>
              <button
                onClick={() => { setFilterSegment('NEW'); setCurrentPage(1) }}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${filterSegment === 'NEW' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Baru (1x)
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase">
                <th className="py-3 px-3">Nomor Plat</th>
                <th className="py-3 px-3">Model Kendaraan</th>
                <th className="py-3 px-3">No Telepon</th>
                <th className="py-3 px-3 text-center">Kunjungan</th>
                <th className="py-3 px-3">Paket Terfavorit</th>
                <th className="py-3 px-3 text-right">Total Akumulasi</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500">
                    Memuat data CRM pelanggan...
                  </td>
                </tr>
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500">
                    Tidak ada pelanggan yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-white uppercase tracking-wider">{c.plat}</td>
                    <td className="py-3 px-3 text-slate-300">{c.model}</td>
                    <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">{c.noTelepon}</td>
                    <td className="py-3 px-3 text-center font-bold text-cyan-400">{c.totalVisits} kali</td>
                    <td className="py-3 px-3 text-slate-300">{c.favPkg}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">{formatRupiah(c.totalSpent)}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${c.segmentBadge}`}>
                        {c.segment}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setSelectedCustomerPlat(c.plat)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold transition-all"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-xs text-slate-400">
            <span>Halaman {currentPage} dari {totalPages} ({filteredCustomers.length} Pelanggan)</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg font-bold"
              >
                Sebelumnya
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg font-bold"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Detail Modal */}
      {activeCustomer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-panel w-full max-w-2xl p-6 rounded-2xl border border-slate-700 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${activeCustomer.segmentBadge}`}>
                  {activeCustomer.segment}
                </span>
                <h3 className="font-mono text-2xl font-black text-white tracking-wider uppercase mt-1">
                  {activeCustomer.plat}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Model: {activeCustomer.model} • Telp: {activeCustomer.noTelepon}</p>
              </div>
              <div className="flex items-center gap-2">
                {activeCustomer.noTelepon && activeCustomer.noTelepon !== '-' && (
                  <a
                    href={`https://wa.me/${activeCustomer.noTelepon.replace(/\D/g, '').replace(/^0/, '62')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-1 text-xs font-bold px-2.5"
                  >
                    <MessageCircle size={14} />
                    Kirim WA
                  </a>
                )}
                <button
                  onClick={() => setSelectedCustomerPlat(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 font-medium">Total Kunjungan Cuci</span>
                <p className="text-lg font-black text-cyan-400 mt-0.5">{activeCustomer.totalVisits} kali</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-slate-500 font-medium">Total Akumulasi Belanja</span>
                <p className="text-lg font-black text-emerald-400 mt-0.5">{formatRupiah(activeCustomer.totalSpent)}</p>
              </div>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Histori Kunjungan Kendaraan:</h4>
              <div className="space-y-2">
                {activeCustomer.visitsHistory.map((v, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-white">{v.paket} ({v.ukuran})</p>
                      <p className="text-[10px] text-slate-400">{v.tanggal} {v.jam ? `• Jam ${v.jam}` : ''} • Kru: {v.pencuci || '-'}</p>
                    </div>
                    <span className="font-mono font-bold text-emerald-400">{formatRupiah(v.harga)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CRM
