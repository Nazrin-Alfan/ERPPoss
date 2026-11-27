import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase, isCloudBackend } from '../supabaseClient'
import {
  calculateConsolidatedMetrics,
  calculateOutletBreakdown,
  calculateRevenueContribution,
  filterTenantScopedRecords
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
  ArrowRight,
  Settings,
  Users,
  Layers
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
  const [branches, setBranches] = useState([])
  const [cloudOutletsSummary, setCloudOutletsSummary] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(new Date())

  // Muat data dari seluruh tenant milik owner yang berhak diakses
  const loadConsolidatedData = async () => {
    setIsLoading(true)
    try {
      const allowedTenantIds = new Set((userTenants || []).map(t => t.id))

      if (isCloudBackend && typeof supabase.rpc === 'function') {
        const now = new Date()
        const todayStr = now.toLocaleDateString('en-CA')
        const monthStart = `${todayStr.slice(0, 7)}-01`
        const pStart = selectedPeriod === 'TODAY' ? todayStr : selectedPeriod === 'THIS_MONTH' ? monthStart : null
        const pEnd = selectedPeriod === 'TODAY' || selectedPeriod === 'THIS_MONTH' ? todayStr : null

        const [{ data: rpcRes, error: rpcErr }, { data: activeBranches }] = await Promise.all([
          supabase.rpc('fn_get_owner_consolidated_summary', {
            p_start_date: pStart,
            p_end_date: pEnd
          }),
          supabase.from('branches').select('*').eq('is_active', true)
        ])
        if (!rpcErr && rpcRes?.outlets) {
          setCloudOutletsSummary(rpcRes.outlets)
          setBranches(filterTenantScopedRecords(activeBranches, allowedTenantIds))
          setLastRefreshed(new Date())
          return
        }
      }

      const [{ data: allStruk }, { data: allTx }, { data: allExp }, { data: allAcc }, { data: allPocketView }, { data: allPosBal }, { data: allBranches }] = await Promise.all([
        supabase.from('struk').select('*'),
        supabase.from('transaksi').select('*'),
        supabase.from('pengeluaran').select('*'),
        supabase.from('akun_keuangan').select('*'),
        supabase.from('v_pocket_balances').select('*'),
        supabase.from('pos_balances').select('*'),
        supabase.from('branches').select('*').eq('is_active', true)
      ])

      const sourceTx = Array.isArray(allStruk) && allStruk.length > 0 ? allStruk : (allTx || [])
      const myTx = filterTenantScopedRecords(sourceTx, allowedTenantIds)
      const myExp = filterTenantScopedRecords(allExp, allowedTenantIds)
        .map(e => ({ ...e, jumlah: e.jumlah ?? e.nominal ?? 0 }))
      const rawAccounts =
        Array.isArray(allAcc) && allAcc.length > 0
          ? allAcc
          : Array.isArray(allPocketView) && allPocketView.length > 0
          ? allPocketView
          : (allPosBal || [])
      const myAcc = filterTenantScopedRecords(rawAccounts, allowedTenantIds)
        .filter(a => a.is_active !== false)
        .map(a => ({ ...a, saldo: Number(a.saldo ?? a.current_balance ?? a.balance ?? 0) }))
      const myBranches = filterTenantScopedRecords(allBranches, allowedTenantIds)

      setTransactions(myTx)
      setExpenses(myExp)
      setCashAccounts(myAcc)
      setBranches(myBranches)
      setLastRefreshed(new Date())
    } catch (err) {
      console.error('Gagal memuat data konsolidasi:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadConsolidatedData()
  }, [userTenants, selectedPeriod])

  // Filter waktu transaksi & pengeluaran (zona waktu lokal toko)
  const filteredData = useMemo(() => {
    const now = new Date()
    const todayStr = now.toLocaleDateString('en-CA')
    const currentYearMonth = todayStr.slice(0, 7)

    let tx = transactions
    let exp = expenses

    if (selectedPeriod === 'TODAY') {
      tx = transactions.filter(t => (t.tanggal || t.created_at || '').startsWith(todayStr))
      exp = expenses.filter(e => (e.tanggal || '').startsWith(todayStr))
    } else if (selectedPeriod === 'THIS_MONTH') {
      tx = transactions.filter(t => (t.tanggal || t.created_at || '').startsWith(currentYearMonth))
      exp = expenses.filter(e => (e.tanggal || '').startsWith(currentYearMonth))
    }

    return { tx, exp }
  }, [transactions, expenses, selectedPeriod])

  // Agregasi Finansial dengan Parameter userRole untuk Zero-Trust RBAC Gate
  const metrics = useMemo(() => {
    if (Array.isArray(cloudOutletsSummary) && cloudOutletsSummary.length > 0) {
      const baseAuth = calculateConsolidatedMetrics({ userRole: currentRole, tenants: userTenants, transactions: [], expenses: [], cashAccounts: [] })
      if (!baseAuth.isAuthorized) return baseAuth
      const totalRevenue = cloudOutletsSummary.reduce((s, o) => s + Number(o.revenue || 0), 0)
      const totalExpenses = cloudOutletsSummary.reduce((s, o) => s + Number(o.expenses || 0), 0)
      const totalCashBalance = cloudOutletsSummary.reduce((s, o) => s + Number(o.cash_balance || 0), 0)
      const totalTransactionsCount = cloudOutletsSummary.reduce((s, o) => s + Number(o.transactions_count || 0), 0)
      const netProfit = totalRevenue - totalExpenses
      return {
        isAuthorized: true,
        totalRevenue,
        totalExpenses,
        netProfit,
        netMarginPercentage: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
        totalCashBalance,
        totalTransactionsCount,
        totalOutlets: cloudOutletsSummary.length
      }
    }
    return calculateConsolidatedMetrics({
      userRole: currentRole,
      tenants: userTenants,
      transactions: filteredData.tx,
      expenses: filteredData.exp,
      cashAccounts
    })
  }, [currentRole, userTenants, filteredData, cashAccounts, cloudOutletsSummary])

  const breakdown = useMemo(() => {
    if (Array.isArray(cloudOutletsSummary) && cloudOutletsSummary.length > 0) {
      return cloudOutletsSummary.map((o) => {
        const rev = Number(o.revenue || 0)
        const exp = Number(o.expenses || 0)
        const netProfit = rev - exp
        const marginPercentage = rev > 0 ? (netProfit / rev) * 100 : 0
        return {
          tenantId: o.tenant_id,
          tenantName: o.tenant_name || 'Outlet',
          businessType: o.business_type || 'HYBRID',
          revenue: rev,
          expenses: exp,
          netProfit,
          marginPercentage,
          cashBalance: Number(o.cash_balance || 0),
          transactionCount: Number(o.transactions_count || 0),
          healthLabel: rev === 0 ? 'Baru' : marginPercentage >= 20 ? 'Sehat' : 'Perlu Pantauan',
          healthColor: rev === 0
            ? 'bg-subsurface text-muted border-border'
            : marginPercentage >= 20
            ? 'bg-success-bg text-success border-success/30'
            : 'bg-warning-bg text-warning border-warning/30'
        }
      })
    }
    return calculateOutletBreakdown({
      userRole: currentRole,
      tenants: userTenants,
      transactions: filteredData.tx,
      expenses: filteredData.exp,
      cashAccounts
    })
  }, [currentRole, userTenants, filteredData, cashAccounts, cloudOutletsSummary])

  const contributions = useMemo(() => {
    if (Array.isArray(cloudOutletsSummary) && cloudOutletsSummary.length > 0) {
      const totalRev = cloudOutletsSummary.reduce((s, o) => s + Number(o.revenue || 0), 0)
      return cloudOutletsSummary.map((o) => {
        const rev = Number(o.revenue || 0)
        const pct = totalRev > 0 ? (rev / totalRev) * 100 : 0
        return {
          tenantId: o.tenant_id,
          tenantName: o.tenant_name || 'Outlet',
          revenue: rev,
          percentage: pct,
          sharePercentage: pct
        }
      })
    }
    return calculateRevenueContribution({
      userRole: currentRole,
      tenants: userTenants,
      transactions: filteredData.tx
    })
  }, [currentRole, userTenants, filteredData, cloudOutletsSummary])

  // Aksi berpindah tenant & langsung masuk ke operasional toko tersebut
  const handleJumpToTenant = async (tenantId) => {
    await switchTenant(tenantId)
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
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 bg-surface rounded-3xl border border-destructive/30">
        <div className="w-14 h-14 rounded-2xl bg-destructive-bg border border-destructive/30 text-destructive flex items-center justify-center mb-4">
          <AlertCircle size={28} />
        </div>
        <h2 className="text-xl font-bold text-foreground">Akses Eksekutif Dibatasi</h2>
        <p className="text-sm text-muted max-w-md mt-1 mb-5">
          Halaman Konsolidasi Portofolio ini hanya dapat diakses oleh akun Pemilik (Owner) dan Founder.
        </p>
        <button
          onClick={() => navigate('/pos')}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary-hover transition-all cursor-pointer shadow-lg"
        >
          Kembali ke Layar Kasir POS
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-full space-y-6 pb-12 animate-fade-in text-foreground overflow-x-hidden">
      {/* Top Header Executive Bar */}
      <div className="bg-surface flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl border border-border shadow-2xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-success tracking-wider uppercase">
            <ShieldCheck size={16} className="shrink-0" />
            <span>Portofolio Finansial Gabungan</span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-foreground tracking-wide mt-1 truncate">
            Ringkasan Finansial Multi-Cabang
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Data ringkasan eksekutif seluruh outlet tanpa bias operasional harian.
          </p>
        </div>

        {/* Filter Periode & Refresh */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-surface border border-border rounded-2xl p-1 text-xs shadow-inner">
            <button
              onClick={() => setSelectedPeriod('TODAY')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                selectedPeriod === 'TODAY'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setSelectedPeriod('THIS_MONTH')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                selectedPeriod === 'THIS_MONTH'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => setSelectedPeriod('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                selectedPeriod === 'ALL'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Semua Waktu
            </button>
          </div>

          <button
            onClick={loadConsolidatedData}
            disabled={isLoading}
            className="p-2.5 rounded-2xl bg-surface border border-border hover:border-border-hover text-muted hover:text-foreground transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-sm"
            title="Muat ulang data terbaru"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin text-success' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Hero KPI Cards (4 Kolom Rapi & Terstandarisasi) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Omzet */}
        <div className="bg-surface p-5 rounded-3xl border border-border relative overflow-hidden group hover:border-border-active transition-all shadow-xl min-w-0">
          <div className="flex items-center justify-between text-muted text-xs font-bold uppercase tracking-wider mb-2">
            <span className="truncate pr-1">Total Omzet Gabungan</span>
            <div className="p-2.5 rounded-2xl bg-success-bg text-success border border-success/30 shrink-0">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-foreground tracking-tight truncate">
            {formatRupiah(metrics.totalRevenue)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>{metrics.totalTransactionsCount} Total Transaksi</span>
            <span className="text-success font-bold">Semua Cabang</span>
          </div>
        </div>

        {/* Total Pengeluaran */}
        <div className="bg-surface p-5 rounded-3xl border border-border relative overflow-hidden group hover:border-destructive/50 transition-all shadow-xl min-w-0">
          <div className="flex items-center justify-between text-muted text-xs font-bold uppercase tracking-wider mb-2">
            <span className="truncate pr-1">Beban Operasional</span>
            <div className="p-2.5 rounded-2xl bg-destructive-bg text-destructive border border-destructive/30 shrink-0">
              <ArrowDownRight size={16} />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-foreground tracking-tight truncate">
            {formatRupiah(metrics.totalExpenses)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>HPP, Gaji, & Sewa</span>
            <span className="text-destructive font-bold">Pengeluaran</span>
          </div>
        </div>

        {/* Laba Bersih Konsolidasi */}
        <div className="bg-surface p-5 rounded-3xl border border-border relative overflow-hidden group hover:border-border-active transition-all shadow-xl min-w-0">
          <div className="flex items-center justify-between text-muted text-xs font-bold uppercase tracking-wider mb-2">
            <span className="truncate pr-1">Net Profit Bersih</span>
            <div className="p-2.5 rounded-2xl bg-primary-soft text-primary-soft-foreground border border-primary/30 shrink-0">
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-black font-mono tracking-tight truncate ${metrics.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
            {formatRupiah(metrics.netProfit)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            <span className="text-muted">Rata-rata Margin</span>
            <span className={`font-bold font-mono px-2 py-0.5 rounded-full ${
              metrics.netMarginPercentage >= 20 
                ? 'bg-success-bg text-success' 
                : 'bg-warning-bg text-warning'
            }`}>
              {metrics.netMarginPercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Total Kas & Bank */}
        <div className="bg-surface p-5 rounded-3xl border border-border relative overflow-hidden group hover:border-border-active transition-all shadow-xl min-w-0">
          <div className="flex items-center justify-between text-muted text-xs font-bold uppercase tracking-wider mb-2">
            <span className="truncate pr-1">Total Likuiditas Kas</span>
            <div className="p-2.5 rounded-2xl bg-primary-soft text-primary-soft-foreground border border-primary/30 shrink-0">
              <Wallet size={16} />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-primary tracking-tight truncate">
            {formatRupiah(metrics.totalCashBalance)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>Kas Laci & Bank</span>
            <span className="text-primary font-bold">Kas Likuid Siap Pakai</span>
          </div>
        </div>
      </div>

      {/* Panduan Langkah Awal Memulai Toko (First-Time Store Onboarding Guide) */}
      {(metrics.totalRevenue === 0 || userTenants.length === 1) && (
        <div className="bg-surface p-5 sm:p-6 rounded-3xl border border-primary/25 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-success-bg text-success border border-success/30">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  Langkah Awal Memulai Toko Baru
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success-bg text-success font-bold">
                    Setup Cepat 4 Langkah
                  </span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Ikuti panduan berikut agar toko siap melayani transaksi pelanggan pertama Anda.
                </p>
              </div>
            </div>

            {userTenants.length > 0 && (
              <button
                type="button"
                onClick={() => handleJumpToTenant(userTenants[0].id)}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 shadow-lg"
              >
                <span>Masuk ke Workspace Toko ({userTenants[0].nama})</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Step 1 */}
            <div className="bg-subsurface p-3.5 rounded-2xl border border-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-muted mb-2">
                  <span className="font-mono text-[10px] bg-surface px-2 py-0.5 rounded border border-border text-muted">LANGKAH 1</span>
                  <Settings size={14} className="text-success" />
                </div>
                <h4 className="font-bold text-foreground mb-1">Pengaturan Toko & Struk</h4>
                <p className="text-[11px] text-muted leading-relaxed mb-3">
                  Atur nama toko, alamat, footer struk, dan koneksi printer thermal Bluetooth/USB.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (userTenants[0]) switchTenant(userTenants[0].id)
                  navigate('/admin?tab=receipt-settings')
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-subsurface hover:bg-surface-hover text-success font-semibold text-center text-[11px] transition cursor-pointer"
              >
                Buka Pengaturan Struk →
              </button>
            </div>

            {/* Step 2 */}
            <div className="bg-subsurface p-3.5 rounded-2xl border border-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-muted mb-2">
                  <span className="font-mono text-[10px] bg-surface px-2 py-0.5 rounded border border-border text-muted">LANGKAH 2</span>
                  <Users size={14} className="text-primary" />
                </div>
                <h4 className="font-bold text-foreground mb-1">Daftarkan Akun Kasir</h4>
                <p className="text-[11px] text-muted leading-relaxed mb-3">
                  Buat akun login staf kasir agar kasir bisa langsung melayani pelanggan di POS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (userTenants[0]) switchTenant(userTenants[0].id)
                  navigate('/admin?tab=cashier-pay')
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-subsurface hover:bg-surface-hover text-primary font-semibold text-center text-[11px] transition cursor-pointer"
              >
                Tambah Akun Kasir →
              </button>
            </div>

            {/* Step 3 */}
            <div className="bg-subsurface p-3.5 rounded-2xl border border-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-muted mb-2">
                  <span className="font-mono text-[10px] bg-surface px-2 py-0.5 rounded border border-border text-muted">LANGKAH 3</span>
                  <Layers size={14} className="text-warning" />
                </div>
                <h4 className="font-bold text-foreground mb-1">Atur Katalog Produk</h4>
                <p className="text-[11px] text-muted leading-relaxed mb-3">
                  Sesuaikan menu kafe, paket cuci/detailing, harga, dan metode pembayaran.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (userTenants[0]) switchTenant(userTenants[0].id)
                  navigate('/admin?tab=menu')
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-subsurface hover:bg-surface-hover text-warning font-semibold text-center text-[11px] transition cursor-pointer"
              >
                Kelola Katalog →
              </button>
            </div>

            {/* Step 4 */}
            <div className="bg-subsurface p-3.5 rounded-2xl border border-border flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-muted mb-2">
                  <span className="font-mono text-[10px] bg-surface px-2 py-0.5 rounded border border-border text-muted">LANGKAH 4</span>
                  <CheckCircle2 size={14} className="text-success" />
                </div>
                <h4 className="font-bold text-foreground mb-1">Mulai Transaksi Kasir</h4>
                <p className="text-[11px] text-muted leading-relaxed mb-3">
                  Buka layar kasir POS untuk menguji transaksi perdana dan mencetak struk.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (userTenants[0]) switchTenant(userTenants[0].id)
                  navigate('/pos')
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-center text-[11px] transition cursor-pointer shadow"
              >
                Buka Kasir POS →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outlet Entity Cards Grid (Tampilan Representasi Toko Mandiri) */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Store size={18} className="text-success" />
              <span>Portofolio Unit Usaha & Cabang ({userTenants.length})</span>
            </h2>
            <p className="text-xs text-muted">
              Pilih salah satu unit usaha di bawah untuk masuk ke ruang kerja operasional toko tersebut.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sm transition-all cursor-pointer shrink-0 self-start sm:self-auto"
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
                className={`bg-surface p-5 rounded-3xl border transition-all duration-300 flex flex-col justify-between group hover:border-border-active shadow-xl min-w-0 ${
                  isCurrent 
                    ? 'border-success/30 ring-1 ring-ring/30 bg-surface' 
                    : 'border-border'
                }`}
              >
                <div className="min-w-0">
                  {/* Card Header: Outlet Name & Status Badge */}
                  <div className="flex items-start justify-between gap-2 mb-4 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-surface border border-border flex items-center justify-center text-success shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                        <Store size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-foreground text-sm truncate">
                            {item.tenantName}
                          </h3>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                            item.businessType === 'CAFE'
                              ? 'bg-warning-bg text-warning border-warning/30'
                              : item.businessType === 'CARWASH'
                              ? 'bg-primary-soft text-primary-soft-foreground border-primary/30'
                              : 'bg-success-bg text-success border-success/30'
                          }`}>
                            {item.businessType === 'CAFE' ? '☕ Cafe' : item.businessType === 'CARWASH' ? '🚗 Carwash' : '⚡ Hybrid'}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-dark font-mono truncate block">
                          ID: {item.tenantId}
                        </span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold leading-none border shrink-0 whitespace-nowrap ${item.healthColor}`}>
                      {item.healthLabel}
                    </span>
                  </div>

                  {/* Financial Stats Mini-Grid */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-subsurface border border-border mb-4 min-w-0">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted uppercase font-semibold">Omzet</p>
                      <p className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                        {formatRupiah(item.revenue)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted uppercase font-semibold">Net Profit</p>
                      <p className={`text-xs font-bold font-mono mt-0.5 truncate ${item.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatRupiah(item.netProfit)}
                      </p>
                    </div>
                    <div className="mt-1 pt-1 border-t border-border min-w-0">
                      <p className="text-[10px] text-muted uppercase font-semibold">Kas Tersedia</p>
                      <p className="text-xs font-bold font-mono text-primary mt-0.5 truncate">
                        {formatRupiah(item.cashBalance)}
                      </p>
                    </div>
                    <div className="mt-1 pt-1 border-t border-border min-w-0">
                      <p className="text-[10px] text-muted uppercase font-semibold">Margin</p>
                      <p className="text-xs font-bold font-mono text-foreground mt-0.5 truncate">
                        {item.marginPercentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Daftar Cabang Aktif pada Outlet Ini */}
                {(() => {
                  const outletBranches = branches.filter(b => b.tenant_id === item.tenantId)
                  if (outletBranches.length === 0) return null
                  return (
                    <div className="mb-3 pt-2 border-t border-border space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                        Cabang Aktif ({outletBranches.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {outletBranches.map(br => (
                          <button
                            key={br.id}
                            type="button"
                            onClick={() => handleJumpToTenant(item.tenantId)}
                            className="px-2 py-1 rounded-lg bg-subsurface hover:bg-surface-hover border border-border hover:border-border-active text-[10px] font-medium text-muted hover:text-primary transition-colors cursor-pointer"
                            title={`Switch ke ${br.nama || br.name}`}
                          >
                            {br.nama || br.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Card Footer: Action Button */}
                <button
                  type="button"
                  onClick={() => handleJumpToTenant(item.tenantId)}
                  className="w-full py-2.5 px-3 rounded-xl bg-subsurface hover:bg-primary-hover text-foreground hover:text-foreground font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer group/btn shadow-md border border-border hover:border-border-active shrink-0"
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
        <div className="bg-surface p-5 sm:p-6 rounded-3xl border border-border flex flex-col justify-between shadow-xl min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2 truncate">
                <PieChart size={18} className="text-success shrink-0" />
                <span className="truncate">Pangsa Omzet per Outlet</span>
              </h2>
              <span className="text-[10px] text-muted font-mono shrink-0">
                {userTenants.length} Outlet
              </span>
            </div>

            <div className="space-y-3.5">
              {contributions.map((c, idx) => (
                <div key={c.tenantId} className="space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-bold text-foreground truncate flex-1">
                      {idx + 1}. {c.tenantName}
                    </span>
                    <span className="font-mono text-muted font-semibold shrink-0">
                      {Number(c.percentage ?? c.sharePercentage ?? 0).toFixed(1)}% ({formatRupiah(c.revenue)})
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 w-full bg-surface rounded-full overflow-hidden border border-border">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        idx === 0 
                          ? 'bg-primary' 
                          : idx === 1 
                            ? 'bg-primary' 
                            : 'bg-primary'
                      }`}
                      style={{ width: `${Math.max(Number(c.percentage ?? c.sharePercentage ?? 0), 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border text-[11px] text-muted flex items-center justify-between gap-2">
            <span className="shrink-0">Kontributor Utama</span>
            <span className="font-bold text-success truncate">
              {contributions[0]?.tenantName || '-'}
            </span>
          </div>
        </div>

        {/* Tabel Matriks Perbandingan Outlet Side-by-Side (2 Kolom) */}
        <div className="lg:col-span-2 bg-surface p-5 sm:p-6 rounded-3xl border border-border flex flex-col justify-between shadow-xl min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <BarChart3 size={18} className="text-primary shrink-0" />
                  <span>Matriks Finansial & Profitabilitas Cabang</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Perbandingan langsung omzet, pengeluaran, margin, dan ketersediaan kas per toko.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0">
              <table className="w-full text-left text-xs min-w-[680px]">
                <thead>
                  <tr className="border-b border-border text-muted text-[11px] font-bold uppercase tracking-wider">
                    <th className="pb-3 pl-2 pr-4">Nama Outlet</th>
                    <th className="pb-3 px-3.5 text-right">Omzet</th>
                    <th className="pb-3 px-3.5 text-right">Pengeluaran</th>
                    <th className="pb-3 px-3.5 text-right">Net Profit</th>
                    <th className="pb-3 px-3.5 text-right">Kas Aktif</th>
                    <th className="pb-3 px-3.5 text-center">Status</th>
                    <th className="pb-3 pl-3 pr-2 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {breakdown.map((item) => {
                    const isCurrent = item.tenantId === activeTenant?.id
                    return (
                      <tr 
                        key={item.tenantId} 
                        className={`hover:bg-surface-hover transition-colors ${
                          isCurrent ? 'bg-success-bg' : ''
                        }`}
                      >
                        <td className="py-3.5 pl-2 pr-4 max-w-[180px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-subsurface border border-border flex items-center justify-center text-muted shrink-0">
                              <Store size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-foreground truncate flex items-center gap-1.5">
                                <span className="truncate">{item.tenantName}</span>
                                {isCurrent && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-success-bg text-success border border-success/30 shrink-0">
                                    Aktif
                                  </span>
                                )}
                              </p>
                              <span className="text-[10px] text-muted font-mono truncate block">
                                {item.transactionCount} transaksi
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3.5 text-right font-mono tabular-nums font-bold text-foreground whitespace-nowrap">
                          {formatRupiah(item.revenue)}
                        </td>
                        <td className="py-3.5 px-3.5 text-right font-mono tabular-nums text-destructive whitespace-nowrap">
                          {formatRupiah(item.expenses)}
                        </td>
                        <td className="py-3.5 px-3.5 text-right font-mono tabular-nums font-bold whitespace-nowrap">
                          <span className={item.netProfit >= 0 ? 'text-success' : 'text-destructive'}>
                            {formatRupiah(item.netProfit)}
                          </span>
                          <span className="block text-[10px] text-muted font-normal">
                            ({item.marginPercentage.toFixed(1)}%)
                          </span>
                        </td>
                        <td className="py-3.5 px-3.5 text-right font-mono tabular-nums font-bold text-primary whitespace-nowrap">
                          {formatRupiah(item.cashBalance)}
                        </td>
                        <td className="py-3.5 px-3.5 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-[11px] font-semibold leading-tight border whitespace-nowrap ${item.healthColor}`}>
                            {item.healthLabel}
                          </span>
                        </td>
                        <td className="py-3.5 pl-3 pr-2 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleJumpToTenant(item.tenantId)}
                            className="px-3 py-1.5 rounded-lg bg-subsurface hover:bg-surface-hover text-muted hover:text-foreground text-[11px] font-bold border border-border transition-all inline-flex items-center gap-1 cursor-pointer"
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

          <div className="mt-4 pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-muted">
            <span>* Data dihitung berdasarkan total penjualan dikurangi beban operasional tiap cabang.</span>
            <span className="text-muted-dark font-mono text-[10px]">
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
