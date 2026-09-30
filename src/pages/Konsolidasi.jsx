import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import {
  calculateConsolidatedMetrics,
  calculateOutletBreakdown,
  calculateRevenueContribution
} from '../services/consolidationService'
import { formatRupiah } from '../utils/helpers'
import {
  Building2,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Store,
  PieChart,
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  ArrowRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import OnboardingWizardModal from '../components/auth/OnboardingWizardModal'

export default function Konsolidasi() {
  const { user, profile, userTenants, activeTenant, switchTenant, refreshTenants } = useAuth()
  const navigate = useNavigate()
  const currentRole = profile?.role || user?.role || user?.user_metadata?.role || 'Owner'

  const [isLoading, setIsLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('ALL') // 'ALL', 'THIS_MONTH', 'TODAY'
  const [transactions, setTransactions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [cashAccounts, setCashAccounts] = useState([])
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // Muat data dari seluruh tenant milik owner
  const loadConsolidatedData = async () => {
    setIsLoading(true)
    try {
      const { data: allTx } = await supabase.from('transaksi').select('*')
      const { data: allExp } = await supabase.from('pengeluaran').select('*')
      const { data: allAcc } = await supabase.from('akun_keuangan').select('*')

      setTransactions(allTx || [])
      setExpenses(allExp || [])
      setCashAccounts(allAcc || [])
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Gagal memuat data konsolidasi:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadConsolidatedData()
  }, [])

  // Filter waktu transaksi & pengeluaran
  const filteredData = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const currentYearMonth = now.toISOString().slice(0, 7)

    let tx = transactions
    let exp = expenses

    if (selectedPeriod === 'TODAY') {
      tx = transactions.filter(t => (t.created_at || '').startsWith(todayStr))
      exp = expenses.filter(e => (e.tanggal || '').startsWith(todayStr))
    } else if (selectedPeriod === 'THIS_MONTH') {
      tx = transactions.filter(t => (t.created_at || '').startsWith(currentYearMonth))
      exp = expenses.filter(e => (e.tanggal || '').startsWith(currentYearMonth))
    }

    return { tx, exp }
  }, [transactions, expenses, selectedPeriod])

  // Agregasi Finansial dengan Parameter userRole untuk Zero-Trust RBAC Gate
  const metrics = useMemo(() => {
    return calculateConsolidatedMetrics({
      userRole: currentRole,
      tenants: userTenants,
      transactions: filteredData.tx,
      expenses: filteredData.exp,
      cashAccounts
    })
  }, [currentRole, userTenants, filteredData, cashAccounts])

  const breakdown = useMemo(() => {
    return calculateOutletBreakdown({
      userRole: currentRole,
      tenants: userTenants,
      transactions: filteredData.tx,
      expenses: filteredData.exp,
      cashAccounts
    })
  }, [currentRole, userTenants, filteredData, cashAccounts])

  const contributions = useMemo(() => {
    return calculateRevenueContribution({
      userRole: currentRole,
      tenants: userTenants,
      transactions: filteredData.tx
    })
  }, [currentRole, userTenants, filteredData])

  // Aksi berpindah tenant & langsung masuk ke operasional toko tersebut
  const handleJumpToTenant = (tenantId) => {
    switchTenant(tenantId)
    navigate('/dashboard')
  }

  // Aksi setelah wizard penambahan cabang selesai
  const handleWizardCompleted = async () => {
    setShowWizard(false)
    if (typeof refreshTenants === 'function') {
      await refreshTenants()
    }
    await loadConsolidatedData()
  }

  // Jika otorisasi gagal / role non-owner
  if (!metrics.isAuthorized) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 bg-slate-900/60 rounded-3xl border border-rose-500/30">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <AlertCircle size={28} />
        </div>
        <h2 className="text-xl font-bold text-white">Akses Eksekutif Dibatasi</h2>
        <p className="text-sm text-slate-400 max-w-md mt-1 mb-5">
          Halaman Konsolidasi Portofolio ini hanya dapat diakses oleh akun Pemilik (Owner) dan Founder.
        </p>
        <button
          onClick={() => navigate('/pos')}
          className="px-5 py-2.5 rounded-xl bg-brand-emerald text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-all cursor-pointer shadow-lg"
        >
          Kembali ke Layar Kasir POS
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full space-y-6 pb-12 animate-fade-in text-slate-100 overflow-x-hidden">
      {/* Top Header Executive Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 sm:p-6 rounded-3xl border border-slate-800 shadow-2xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-brand-emerald tracking-wider uppercase">
            <ShieldCheck size={16} className="shrink-0" />
            <span>Portofolio Finansial Gabungan</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-wide mt-1 truncate">
            Konsolidasi Portofolio Bisnis
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Data ringkasan eksekutif seluruh outlet tanpa bias operasional harian.
          </p>
        </div>

        {/* Filter Periode & Refresh */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-2xl p-1 text-xs shadow-inner">
            <button
              onClick={() => setSelectedPeriod('TODAY')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                selectedPeriod === 'TODAY'
                  ? 'bg-brand-emerald text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setSelectedPeriod('THIS_MONTH')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                selectedPeriod === 'THIS_MONTH'
                  ? 'bg-brand-emerald text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setSelectedPeriod('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                selectedPeriod === 'ALL'
                  ? 'bg-brand-emerald text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Waktu
            </button>
          </div>

          <button
            onClick={loadConsolidatedData}
            disabled={isLoading}
            className="p-2.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-sm"
            title="Muat ulang data terbaru"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-brand-emerald' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Hero KPI Cards (4 Kolom Rapi & Terstandarisasi) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Omzet */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 relative overflow-hidden group hover:border-brand-emerald/40 transition-all shadow-xl min-w-0">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span className="truncate pr-1">Total Omzet Gabungan</span>
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-white tracking-tight truncate">
            {formatRupiah(metrics.totalRevenue)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>{metrics.totalTransactionsCount} Total Transaksi</span>
            <span className="text-emerald-400 font-bold">Semua Cabang</span>
          </div>
        </div>

        {/* Total Pengeluaran */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 relative overflow-hidden group hover:border-rose-500/40 transition-all shadow-xl min-w-0">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span className="truncate pr-1">Beban Operasional</span>
            <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
              <ArrowDownRight size={16} />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-white tracking-tight truncate">
            {formatRupiah(metrics.totalExpenses)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>HPP, Gaji, & Sewa</span>
            <span className="text-rose-400 font-bold">Pengeluaran</span>
          </div>
        </div>

        {/* Laba Bersih Konsolidasi */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 relative overflow-hidden group hover:border-cyan-500/40 transition-all shadow-xl min-w-0">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span className="truncate pr-1">Net Profit Bersih</span>
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-black font-mono tracking-tight truncate ${metrics.netProfit >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
            {formatRupiah(metrics.netProfit)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Rata-rata Margin</span>
            <span className={`font-bold font-mono px-2 py-0.5 rounded-full ${
              metrics.netMarginPercentage >= 20 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : 'bg-amber-500/20 text-amber-400'
            }`}>
              {metrics.netMarginPercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Total Kas & Bank */}
        <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 relative overflow-hidden group hover:border-purple-500/40 transition-all shadow-xl min-w-0">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
            <span className="truncate pr-1">Total Likuiditas Kas</span>
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
              <Wallet size={16} />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-purple-300 tracking-tight truncate">
            {formatRupiah(metrics.totalCashBalance)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
            <span>Kas Laci & Bank</span>
            <span className="text-purple-400 font-bold">Siap Prive</span>
          </div>
        </div>
      </div>

      {/* Outlet Entity Cards Grid (Tampilan Representasi Toko Mandiri) */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Store size={18} className="text-brand-emerald" />
              <span>Portofolio Unit Usaha & Cabang ({userTenants.length})</span>
            </h2>
            <p className="text-xs text-slate-400">
              Pilih salah satu unit usaha di bawah untuk masuk ke ruang kerja operasional toko tersebut.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="px-4 py-2.5 rounded-xl bg-brand-emerald hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 transition-all cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <Sparkles size={14} className="shrink-0" />
            <span>+ Tambah Cabang Baru</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {breakdown.map((item) => {
            const isCurrent = item.tenantId === activeTenant?.id
            return (
              <div
                key={item.tenantId}
                className={`bg-slate-900/90 p-5 rounded-3xl border transition-all duration-300 flex flex-col justify-between group hover:border-brand-emerald/60 shadow-xl min-w-0 ${
                  isCurrent 
                    ? 'border-brand-emerald/40 ring-1 ring-brand-emerald/30 bg-slate-900' 
                    : 'border-slate-800'
                }`}
              >
                <div className="min-w-0">
                  {/* Card Header: Outlet Name & Status Badge */}
                  <div className="flex items-start justify-between gap-2 mb-4 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-brand-emerald shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                        <Store size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-white text-sm truncate">
                            {item.tenantName}
                          </h3>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                            item.businessType === 'CAFE'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                              : item.businessType === 'CARWASH'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          }`}>
                            {item.businessType === 'CAFE' ? '☕ Cafe' : item.businessType === 'CARWASH' ? '🚗 Carwash' : '⚡ Hybrid'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono truncate block">
                          ID: {item.tenantId}
                        </span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${item.healthColor}`}>
                      {item.healthLabel}
                    </span>
                  </div>

                  {/* Financial Stats Mini-Grid */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 mb-4 min-w-0">
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Omzet</p>
                      <p className="text-xs font-bold font-mono text-white mt-0.5 truncate">
                        {formatRupiah(item.revenue)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Net Profit</p>
                      <p className={`text-xs font-bold font-mono mt-0.5 truncate ${item.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatRupiah(item.netProfit)}
                      </p>
                    </div>
                    <div className="mt-1 pt-1 border-t border-slate-800/60 min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Kas Tersedia</p>
                      <p className="text-xs font-bold font-mono text-purple-300 mt-0.5 truncate">
                        {formatRupiah(item.cashBalance)}
                      </p>
                    </div>
                    <div className="mt-1 pt-1 border-t border-slate-800/60 min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">Margin</p>
                      <p className="text-xs font-bold font-mono text-slate-200 mt-0.5 truncate">
                        {item.marginPercentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Action Button */}
                <button
                  type="button"
                  onClick={() => handleJumpToTenant(item.tenantId)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-brand-emerald text-slate-200 hover:text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer group/btn shadow-md border border-slate-700/80 hover:border-brand-emerald shrink-0"
                >
                  <span className="truncate">Buka Workspace Cabang Ini</span>
                  <ArrowRight size={13} className="group-hover/btn:translate-x-1 transition-transform shrink-0" />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Kontribusi Penjualan & Perbandingan Kinerja */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribusi Kontribusi Omzet (1 Kolom) */}
        <div className="bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 flex flex-col justify-between shadow-xl min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-base font-bold text-white flex items-center gap-2 truncate">
                <PieChart size={18} className="text-brand-emerald shrink-0" />
                <span className="truncate">Pangsa Omzet per Outlet</span>
              </h2>
              <span className="text-[10px] text-slate-400 font-mono shrink-0">
                {userTenants.length} Outlet
              </span>
            </div>

            <div className="space-y-3.5">
              {contributions.map((c, idx) => (
                <div key={c.tenantId} className="space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-bold text-slate-200 truncate flex-1">
                      {idx + 1}. {c.tenantName}
                    </span>
                    <span className="font-mono text-slate-400 font-semibold shrink-0">
                      {c.percentage.toFixed(1)}% ({formatRupiah(c.revenue)})
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        idx === 0 
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                          : idx === 1 
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-400' 
                            : 'bg-gradient-to-r from-purple-500 to-indigo-400'
                      }`}
                      style={{ width: `${Math.max(c.percentage, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between gap-2">
            <span className="shrink-0">Kontributor Utama</span>
            <span className="font-bold text-brand-emerald truncate">
              {contributions[0]?.tenantName || '-'}
            </span>
          </div>
        </div>

        {/* Tabel Matriks Perbandingan Outlet Side-by-Side (2 Kolom) */}
        <div className="lg:col-span-2 bg-slate-900/90 p-5 sm:p-6 rounded-3xl border border-slate-800 flex flex-col justify-between shadow-xl min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 size={18} className="text-cyan-400 shrink-0" />
                  <span>Matriks Finansial & Profitabilitas Cabang</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Perbandingan langsung omzet, pengeluaran, margin, dan ketersediaan kas per toko.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
              <table className="w-full text-left text-xs min-w-[540px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-1">Nama Outlet</th>
                    <th className="pb-3 text-right">Omzet</th>
                    <th className="pb-3 text-right">Pengeluaran</th>
                    <th className="pb-3 text-right">Net Profit</th>
                    <th className="pb-3 text-right">Kas Aktif</th>
                    <th className="pb-3 text-center">Status</th>
                    <th className="pb-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {breakdown.map((item) => {
                    const isCurrent = item.tenantId === activeTenant?.id
                    return (
                      <tr 
                        key={item.tenantId} 
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isCurrent ? 'bg-brand-emerald/5' : ''
                        }`}
                      >
                        <td className="py-3.5 pl-1 max-w-[150px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                              <Store size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-200 truncate flex items-center gap-1.5">
                                <span className="truncate">{item.tenantName}</span>
                                {isCurrent && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                                    Aktif
                                  </span>
                                )}
                              </p>
                              <span className="text-[10px] text-slate-400 font-mono truncate block">
                                {item.transactionCount} transaksi
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                          {formatRupiah(item.revenue)}
                        </td>
                        <td className="py-3.5 text-right font-mono text-rose-300 whitespace-nowrap">
                          {formatRupiah(item.expenses)}
                        </td>
                        <td className="py-3.5 text-right font-mono font-bold whitespace-nowrap">
                          <span className={item.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {formatRupiah(item.netProfit)}
                          </span>
                          <span className="block text-[10px] text-slate-400 font-normal">
                            ({item.marginPercentage.toFixed(1)}%)
                          </span>
                        </td>
                        <td className="py-3.5 text-right font-mono font-bold text-purple-300 whitespace-nowrap">
                          {formatRupiah(item.cashBalance)}
                        </td>
                        <td className="py-3.5 text-center whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.healthColor}`}>
                            {item.healthLabel}
                          </span>
                        </td>
                        <td className="py-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleJumpToTenant(item.tenantId)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold border border-slate-700 transition-all inline-flex items-center gap-1 cursor-pointer"
                            title="Beralih ke outlet ini & lihat operasionalnya"
                          >
                            <span>Kelola</span>
                            <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-400">
            <span>* Data dihitung berdasarkan total penjualan dikurangi beban operasional tiap cabang.</span>
            <span className="text-slate-500 font-mono text-[10px]">
              Terakhir diperbarui: {lastRefreshed.toLocaleTimeString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* Modal Wizard Setup Cabang Baru (Khusus Owner) */}
      <OnboardingWizardModal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        ownerUser={user}
        onCompleted={handleWizardCompleted}
      />
    </div>
  )
}
