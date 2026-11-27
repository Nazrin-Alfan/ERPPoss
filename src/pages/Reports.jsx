import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import {
  FileText,
  Printer,
  Calendar,
  RefreshCw,
  TrendingUp,
  DollarSign,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Building,
  CheckCircle2,
  Scale
} from 'lucide-react'
import InteractiveCalendar from '../components/InteractiveCalendar'
import { formatRupiah, parseDateSafe } from '../utils/helpers'
import { isPindahSaldo } from '../utils/financeHelpers'
import {
  isTestOrCancelledStruk,
  isTukarUangStruk,
  classifyExpenseBucket
} from '../utils/reportClassificationHelpers'
import { getTenantFeatures } from '../utils/businessCapabilities'
import GeneralLedgerView from '../components/reports/GeneralLedgerView'
import { DEFAULT_TENANT_ID } from '../constants/erpConfig.js'
import { getReceiptConfig } from '../utils/receiptHelpers'

const fetchAllRows = async (table, select = '*', dateColumn = null, start = null, end = null, tenantId = null) => {
  let allData = []
  let from = 0
  const step = 1000
  while (true) {
    let query = supabase.from(table).select(select)
    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }
    if (dateColumn && start) {
      query = query.gte(dateColumn, start)
    }
    if (dateColumn && end) {
      const safeEnd = end.length <= 10 ? `${end}T23:59:59.999Z` : end
      query = query.lte(dateColumn, safeEnd)
    }
    const { data, error } = await query.range(from, from + step - 1)
    if (error || !data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < step) break
    from += step
  }
  return allData
}

const fetchCafeRows = async (start = null, end = null, tenantId = null) => {
  let allData = []
  let from = 0
  const step = 1000
  while (true) {
    let query = supabase.from('cafe').select('*, struk!inner(tanggal)')
    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }
    if (start) {
      query = query.gte('struk.tanggal', start)
    }
    if (end) {
      query = query.lte('struk.tanggal', end)
    }
    const { data, error } = await query.range(from, from + step - 1)
    if (error || !data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < step) break
    from += step
  }
  return allData
}

const Reports = () => {
  const { activeTenant, profile } = useAuth()
  const targetTenantId = activeTenant?.id || profile?.tenant_id
  const features = getTenantFeatures(activeTenant?.business_type)
  const [reportViewMode, setReportViewMode] = useState('operational') // 'operational' | 'general_ledger'
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('month') // 'today', 'month', 'custom', 'all'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showCustomCalendar, setShowCustomCalendar] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [strukList, setStrukList] = useState([])
  const [carwashList, setCarwashList] = useState([])
  const [cafeList, setCafeList] = useState([])
  const [cashflowLogs, setCashflowLogs] = useState([])
  const [pengeluaranList, setPengeluaranList] = useState([])
  const [posBalances, setPosBalances] = useState({ cash: 0, rekY: 0, rekN: 0, rekR: 0 })
  const [posAccountList, setPosAccountList] = useState([])
  const receiptConfig = useMemo(() => getReceiptConfig(), [])

  const fetchReportsData = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      let filterStart = null
      let filterEnd = null

      if (timeRange !== 'all') {
        const now = new Date()
        if (timeRange === 'today') {
          filterStart = now.toLocaleDateString('en-CA')
          filterEnd = filterStart
        } else if (timeRange === 'month') {
          const y = now.getFullYear()
          const m = String(now.getMonth() + 1).padStart(2, '0')
          filterStart = `${y}-${m}-01`
          const lastDay = new Date(y, now.getMonth() + 1, 0)
          filterEnd = lastDay.toLocaleDateString('en-CA')
        } else if (timeRange === 'custom' && startDate && endDate) {
          filterStart = startDate
          filterEnd = endDate
        }
      }

      const [dbStruk, dbCw, dbCafe, dbCf, dbExp] = await Promise.all([
        fetchAllRows('struk', '*', 'tanggal', filterStart, filterEnd, targetTenantId),
        fetchAllRows('carwash', '*', 'tanggal', filterStart, filterEnd, targetTenantId),
        fetchCafeRows(filterStart, filterEnd, targetTenantId),
        fetchAllRows('cashflow', '*', 'tanggal', filterStart, filterEnd, targetTenantId),
        fetchAllRows('pengeluaran', '*', 'tanggal', filterStart, filterEnd, targetTenantId)
      ])

      let balQuery = supabase.from('v_pocket_balances').select('*')
      if (targetTenantId) balQuery = balQuery.eq('tenant_id', targetTenantId)
      let { data: dbBal, error: balErr } = await balQuery
      if (balErr || !Array.isArray(dbBal)) {
        let fbQuery = supabase.from('pos_balances').select('*')
        if (targetTenantId) fbQuery = fbQuery.eq('tenant_id', targetTenantId)
        const fbRes = await fbQuery
        dbBal = fbRes.data
        balErr = fbRes.error
      }

      if (balErr) throw balErr

      let cash = 0, rekY = 0, rekN = 0, rekR = 0
      const activePockets = (dbBal || [])
        .filter(item => item.is_active !== false)
        .map(item => {
          const liveBal = parseFloat(item.current_balance ?? item.balance ?? 0) || 0
          if (item.pos === 'SALDO CASH') cash = liveBal
          else if (item.pos === 'SALDO REKENING Y') rekY = liveBal
          else if (item.pos === 'SALDO REKENING N') rekN = liveBal
          else if (item.pos === 'SALDO REKENING R') rekR = liveBal
          return { ...item, balance: liveBal, current_balance: liveBal }
        })

      setStrukList(dbStruk || [])
      setCarwashList(dbCw || [])
      setCafeList(dbCafe || [])
      setCashflowLogs(dbCf || [])
      setPengeluaranList(dbExp || [])
      setPosBalances({ cash, rekY, rekN, rekR })
      setPosAccountList(activePockets)

    } catch (err) {
      console.error('Error fetching reports data:', err)
      setErrorMsg(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (timeRange === 'custom' && (!startDate || !endDate)) return
    fetchReportsData()
  }, [timeRange, startDate, endDate, activeTenant?.id])

  const isDateInRange = useCallback((dateStr) => {
    if (!dateStr) return false
    const todayDate = new Date().toLocaleDateString('en-CA')
    if (timeRange === 'today') {
      return String(dateStr).startsWith(todayDate)
    }
    if (timeRange === 'month') {
      const now = new Date()
      const startVal = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime()
      const endVal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime()
      const currentDayVal = parseDateSafe(dateStr).getTime()
      return currentDayVal >= startVal && currentDayVal <= endVal
    }
    if (timeRange === 'custom') {
      const currentVal = parseDateSafe(dateStr).getTime()
      const startVal = startDate ? parseDateSafe(startDate).setHours(0, 0, 0, 0) : 0
      const endVal = endDate ? parseDateSafe(endDate).setHours(23, 59, 59, 999) : Infinity
      return currentVal >= startVal && currentVal <= endVal
    }
    return true
  }, [timeRange, startDate, endDate])

  const strukMap = useMemo(() => {
    return new Map((strukList || []).map(s => [s.id_struk, s]))
  }, [strukList])

  const filteredStrukByTime = useMemo(() => {
    let list = strukList
    if (timeRange !== 'all') {
      list = strukList.filter(s => isDateInRange(s.tanggal))
    }
    return list.filter(s => !isTestOrCancelledStruk(s) && !isTukarUangStruk(s))
  }, [strukList, isDateInRange, timeRange])

  const filteredCarwashList = useMemo(() => {
    let list = carwashList
    if (timeRange !== 'all') {
      list = carwashList.filter(cw => isDateInRange(cw.tanggal))
    }
    return list.filter(cw => {
      const parentStruk = strukMap.get(cw.id_struk)
      if (parentStruk && isTestOrCancelledStruk(parentStruk)) {
        return false
      }
      return cw.status !== 'Batal' && cw.status !== 'Cancelled' && parseFloat(cw.harga || 0) > 0
    })
  }, [carwashList, strukMap, isDateInRange, timeRange])

  const filteredCafeList = useMemo(() => {
    return (cafeList || []).filter(c => {
      if (c.status === 'Batal' || c.status === 'Cancelled' || !(parseFloat(c.subtotal) > 0)) {
        return false
      }
      const parentStruk = strukMap.get(c.id_struk)
      if (timeRange !== 'all') {
        const dateStr = parentStruk?.tanggal || c.struk?.tanggal || c.created_at
        if (!isDateInRange(dateStr)) return false
      }
      if (parentStruk && isTestOrCancelledStruk(parentStruk)) {
        return false
      }
      return true
    })
  }, [cafeList, strukMap, isDateInRange, timeRange])

  const filteredCashflowLogs = useMemo(() => {
    if (timeRange === 'all') return cashflowLogs
    return cashflowLogs.filter(c => isDateInRange(c.tanggal))
  }, [cashflowLogs, isDateInRange, timeRange])

  const filteredPengeluaranList = useMemo(() => {
    let list = pengeluaranList
    if (timeRange !== 'all') {
      list = pengeluaranList.filter(e => isDateInRange(e.tanggal))
    }
    return list.filter(e => !isPindahSaldo(e))
  }, [pengeluaranList, isDateInRange, timeRange])

  // Consolidated Statement Computations: Segmented P&L (Cafe vs Carwash vs Overhead)
  const statements = useMemo(() => {
    let cafeRevenue = 0
    filteredCafeList.forEach(item => {
      cafeRevenue += parseFloat(item.subtotal || item.harga_satuan * item.qty || 0)
    })

    let carwashRevenue = 0
    let carwashCommission = 0
    filteredCarwashList.forEach(cw => {
      carwashRevenue += parseFloat(cw.harga || 0)
      carwashCommission += (parseFloat(cw.komisi_1 || 0) + parseFloat(cw.komisi_2 || 0))
    })

    let otherIncome = 0
    filteredCashflowLogs.forEach(c => {
      const inc = parseFloat(c.pemasukan || 0)
      const jenisLower = String(c.jenis || '').toLowerCase()
      const katLower = String(c.kategori || '').toLowerCase()
      const ketLower = String(c.keterangan_transaksi || '').toLowerCase()
      const sumberUpper = String(c.id_sumber || '').toUpperCase()
      const isPosAutoCashflow =
        sumberUpper.startsWith('CF-POS-') ||
        sumberUpper.startsWith('CF-SETTLE-') ||
        sumberUpper.startsWith('CF-VOID-') ||
        jenisLower.includes('pendapatan pos') ||
        jenisLower.includes('pendapatan carwash') ||
        jenisLower.includes('pendapatan cafe') ||
        jenisLower.includes('struk') ||
        katLower.includes('pendapatan kasir') ||
        ketLower.includes('penjualan kasir pos') ||
        ketLower.includes('pelunasan pos')

      if (inc > 0 && !isPosAutoCashflow) {
        otherIncome += inc
      }
    })

    // Breakdown Pengeluaran berbasis Jenis & Kategori
    let cafeBahanBaku = 0
    let cafeOperasional = 0

    let carwashBahan = 0
    let carwashOperasional = 0

    let bebanBersamaUtilitas = 0
    let bebanBersamaGaji = 0
    let bebanBersamaLain = 0

    // Sumber 1: Tabel Pengeluaran resmi
    const processedExpIds = new Set()
    filteredPengeluaranList.forEach(exp => {
      if (exp.id_pengeluaran) processedExpIds.add(exp.id_pengeluaran)
      if (exp.id) processedExpIds.add(exp.id)
      const nom = parseFloat(exp.nominal || exp.total_harga || 0)
      if (nom <= 0) return

      const bucket = classifyExpenseBucket({
        jenis: exp.jenis,
        kategori: exp.kategori,
        keterangan: exp.nama_pengeluaran || exp.keterangan || '',
        karyawan_id: exp.karyawan_id,
        fromCashflow: false
      })
      if (bucket === 'cafe_bahan') cafeBahanBaku += nom
      else if (bucket === 'cafe_ops') cafeOperasional += nom
      else if (bucket === 'carwash_bahan') carwashBahan += nom
      else if (bucket === 'carwash_ops') carwashOperasional += nom
      else if (bucket === 'overhead_gaji') bebanBersamaGaji += nom
      else if (bucket === 'overhead_utilitas') bebanBersamaUtilitas += nom
      else bebanBersamaLain += nom
    })

    // Sumber 2: Fallback Cashflow Logs untuk pengeluaran manual yang belum ada di tabel pengeluaran
    filteredCashflowLogs.forEach(c => {
      const nom = parseFloat(c.pengeluaran || 0)
      if (nom <= 0) return
      // Jika sumbernya sudah tercakup di pengeluaran, abaikan agar tidak double-count
      if (c.id_sumber && processedExpIds.has(c.id_sumber)) return

      const jenis = String(c.jenis || '').toLowerCase()
      const kat = String(c.kategori || '').toLowerCase()
      const ket = String(c.keterangan_transaksi || '').toLowerCase()

      if (jenis.includes('pindah') || jenis.includes('transfer') || isPindahSaldo(c)) return
      // Abaikan entri rekap kasir / rekap tutup kasir agar tidak menduplikasi rincian tabel pengeluaran
      // dan tidak salah diklasifikasikan ke Cafe akibat anomali label 'pengeluaran Cafe' pada log rekap kasir.
      if (
        ket.includes('rekap pengeluaran') ||
        ket.includes('rekap tutup kasir') ||
        ket.includes('rekap kasir') ||
        kat.includes('rekap') ||
        jenis.includes('rekap')
      ) return

      const bucket = classifyExpenseBucket({
        jenis: c.jenis,
        kategori: c.kategori,
        keterangan: c.keterangan_transaksi || c.keterangan || '',
        karyawan_id: c.karyawan_id,
        fromCashflow: true
      })
      if (bucket === 'cafe_bahan') cafeBahanBaku += nom
      else if (bucket === 'cafe_ops') cafeOperasional += nom
      else if (bucket === 'carwash_bahan') carwashBahan += nom
      else if (bucket === 'carwash_ops') carwashOperasional += nom
      else if (bucket === 'overhead_gaji') bebanBersamaGaji += nom
      else if (bucket === 'overhead_utilitas') bebanBersamaUtilitas += nom
      else if (!jenis.includes('pindah')) bebanBersamaLain += nom
    })

    const totalBebanCafe = cafeBahanBaku + cafeOperasional
    const labaOperasionalCafe = cafeRevenue - totalBebanCafe
    const marginCafe = cafeRevenue > 0 ? (labaOperasionalCafe / cafeRevenue) * 100 : 0

    const totalBebanCarwash = carwashCommission + carwashBahan + carwashOperasional
    const labaOperasionalCarwash = carwashRevenue - totalBebanCarwash
    const marginCarwash = carwashRevenue > 0 ? (labaOperasionalCarwash / carwashRevenue) * 100 : 0

    const totalBebanBersama = bebanBersamaUtilitas + bebanBersamaGaji + bebanBersamaLain
    const consolidatedRevenue = cafeRevenue + carwashRevenue
    const totalRevenue = consolidatedRevenue + otherIncome
    const totalOperatingExpenses = totalBebanCafe + totalBebanCarwash + totalBebanBersama
    const netProfit = totalRevenue - totalOperatingExpenses
    const totalLiquid = posAccountList.length > 0
      ? posAccountList.reduce((sum, item) => sum + (parseFloat(item.current_balance ?? item.balance ?? 0) || 0), 0)
      : (posBalances.cash + posBalances.rekY + posBalances.rekN + posBalances.rekR)

    return {
      // Unit Cafe
      cafeRevenue,
      cafeBahanBaku,
      cafeOperasional,
      totalBebanCafe,
      labaOperasionalCafe,
      marginCafe,

      // Unit Carwash
      carwashRevenue,
      carwashCommission,
      carwashBahan,
      carwashOperasional,
      totalBebanCarwash,
      labaOperasionalCarwash,
      marginCarwash,

      // Overhead Bersama
      bebanBersamaUtilitas,
      bebanBersamaGaji,
      bebanBersamaLain,
      totalBebanBersama,

      // Konsolidasi
      consolidatedRevenue,
      otherIncome,
      totalRevenue,
      totalOperatingExpenses,
      netProfit,
      totalLiquid,
      totalCafeItems: filteredCafeList.reduce((sum, c) => sum + (c.qty || 1), 0),
      totalCars: filteredCarwashList.length,
      aov: filteredStrukByTime.length > 0 ? Math.round(totalRevenue / filteredStrukByTime.length) : 0
    }
  }, [filteredCafeList, filteredCarwashList, filteredCashflowLogs, filteredPengeluaranList, filteredStrukByTime, posBalances, posAccountList])

  return (
    <div className="p-6 pb-24 md:pb-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Actions */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-border pb-5 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <div className="bg-surface w-10 h-10 rounded-xl border border-destructive/30 flex items-center justify-center text-destructive shadow-lg shadow-sm">
              <FileText size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                Laporan Keuangan Konsolidasi
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-destructive-bg text-destructive border border-destructive/30 uppercase tracking-wider">
                  Standar EMKM
                </span>
              </h1>
              <p className="text-muted text-xs mt-0.5">Rekonsiliasi Laba Rugi Segmen Usaha, Posisi Saldo Kas & Rekapitulasi Neraca</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Time Range Filter */}
          <div className="relative flex bg-subsurface p-1 rounded-xl border border-border text-xs shadow-inner">
            <button
              onClick={() => { setTimeRange('today'); setShowCustomCalendar(false) }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${timeRange === 'today' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => { setTimeRange('month'); setShowCustomCalendar(false) }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${timeRange === 'month' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => { setTimeRange('custom'); setShowCustomCalendar(!showCustomCalendar) }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${timeRange === 'custom' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              Kustom
            </button>
            <button
              onClick={() => { setTimeRange('all'); setShowCustomCalendar(false) }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${timeRange === 'all' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground'}`}
            >
              Semua
            </button>

            {timeRange === 'custom' && showCustomCalendar && (
              <div className="absolute left-0 lg:left-auto lg:right-0 top-full mt-2 z-50">
                <InteractiveCalendar
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(start, end) => {
                    setStartDate(start)
                    setEndDate(end)
                  }}
                  onClose={() => setShowCustomCalendar(false)}
                />
              </div>
            )}
          </div>

          <button
            onClick={fetchReportsData}
            disabled={loading}
            className="p-2 bg-subsurface hover:bg-surface-hover border border-border text-foreground rounded-xl transition-all active:scale-95 disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-destructive-solid hover:opacity-90 text-white font-bold rounded-xl shadow-lg shadow-sm transition-all text-xs active:scale-95"
          >
            <Printer size={15} />
            Cetak Laporan (PDF)
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-center gap-2 print:hidden">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Primary Report Mode Switcher: Operational vs General Ledger */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-subsurface p-2 rounded-2xl border border-border print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setReportViewMode('operational')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              reportViewMode === 'operational'
                ? 'bg-destructive-solid text-white shadow-lg shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <FileText size={16} />
            <span>Rekap Operasional Segmen (Kasir POS)</span>
            <span className="text-[9px] bg-white/20 text-foreground px-1.5 py-0.5 rounded font-extrabold normal-case">
              Rekomendasi
            </span>
          </button>
          <button
            onClick={() => setReportViewMode('general_ledger')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              reportViewMode === 'general_ledger'
                ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
          >
            <Scale size={16} />
            <span>Buku Besar & Jurnal ERP (Double-Entry)</span>
          </button>
        </div>

        <p className="text-[11px] text-muted px-2 italic">
          {reportViewMode === 'operational'
            ? '💡 Menampilkan omzet riil kasir, beban operasional unit, dan margin bersih tanpa istilah akuntansi rumit.'
            : '📘 Modul pembukuan akuntansi formal dengan bagan akun (COA), neraca saldo, debit/kredit, dan rekonsiliasi.'}
        </p>
      </div>

      {reportViewMode === 'general_ledger' ? (
        <GeneralLedgerView tenantId={targetTenantId} />
      ) : (
        /* Printable Sheet Area */
        <div id="print-area" className="bg-surface border border-border p-8 rounded-2xl bg-subsurface text-foreground print:bg-white print:text-black print:p-0 print:border-none print:shadow-none space-y-8">
        {/* Header Laporan Resmi */}
        <div className="text-center border-b-2 border-border pb-6 print:border-black print:pb-4">
          <div className="flex justify-center items-center gap-2 mb-1">
            <Building size={20} className="text-destructive print:text-black" />
            <h2 className="text-2xl font-black tracking-tight text-foreground print:text-black uppercase">
              {receiptConfig.storeName || 'RELAYPOS CARWASH & CAFE'}
            </h2>
          </div>
          <p className="text-xs text-muted uppercase tracking-widest font-bold print:text-slate-600">Laporan Keuangan Konsolidasi (Segmen Usaha Terpadu)</p>
          <p className="text-xs text-primary font-mono mt-1 font-bold print:text-slate-700">
            Periode: {timeRange === 'all' ? 'Seluruh Periode' : `${parseDateSafe(startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA')).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} s/d ${parseDateSafe(endDate || new Date().toLocaleDateString('en-CA')).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`}
          </p>
          <span className="text-[10px] text-muted-dark block mt-1.5 print:text-slate-600 font-medium">Mata Uang: Rupiah Indonesia (IDR) • Basis Pencatatan: Akrual & Kas Riil</span>
        </div>

        {/* Bento Overview: Performa Unit Usaha (Cafe vs Carwash) */}
        <div className={`grid grid-cols-1 gap-4 ${features.isHybrid ? 'md:grid-cols-4 print:grid-cols-4' : 'md:grid-cols-3 print:grid-cols-3'}`}>
          {/* Card Cafe */}
          {features.hasCafe && (
            <div className="p-4 rounded-2xl border border-border bg-surface print:border-black print:bg-transparent">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-warning">Unit Cafe & F&B</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning-bg text-warning font-bold">
                  Margin {statements.marginCafe.toFixed(0)}%
                </span>
              </div>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted">Omzet: <span className="text-foreground font-bold">{formatRupiah(statements.cafeRevenue)}</span></p>
                <p className="text-xs text-muted">Beban: <span className="text-destructive font-bold">({formatRupiah(statements.totalBebanCafe)})</span></p>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Laba Cafe:</span>
                  <span className={`text-sm font-black ${statements.labaOperasionalCafe >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatRupiah(statements.labaOperasionalCafe)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Card Carwash */}
          {features.hasCarwash && (
            <div className="p-4 rounded-2xl border border-border bg-surface print:border-black print:bg-transparent">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-primary">Unit Carwash</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground font-bold">
                  Margin {statements.marginCarwash.toFixed(0)}%
                </span>
              </div>
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted">Omzet: <span className="text-foreground font-bold">{formatRupiah(statements.carwashRevenue)}</span></p>
                <p className="text-xs text-muted">Beban: <span className="text-destructive font-bold">({formatRupiah(statements.totalBebanCarwash)})</span></p>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Laba Carwash:</span>
                  <span className={`text-sm font-black ${statements.labaOperasionalCarwash >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatRupiah(statements.labaOperasionalCarwash)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Card Overhead Bersama */}
          <div className="p-4 rounded-2xl border border-border bg-surface print:border-black print:bg-transparent">
            <span className="text-[11px] font-black uppercase tracking-wider text-primary block">Biaya Bersama</span>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted">Listrik & Air: <span className="text-foreground font-bold">{formatRupiah(statements.bebanBersamaUtilitas)}</span></p>
              <p className="text-xs text-muted">Gaji/Casbon: <span className="text-foreground font-bold">{formatRupiah(statements.bebanBersamaGaji)}</span></p>
              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Total Overhead:</span>
                <span className="text-sm font-black text-destructive">
                  ({formatRupiah(statements.totalBebanBersama)})
                </span>
              </div>
            </div>
          </div>

          {/* Card Laba Bersih Konsolidasi */}
          <div className="p-4 rounded-2xl border border-border bg-surface print:border-black print:bg-transparent">
            <span className="text-[11px] font-black uppercase tracking-wider text-primary block">Laba Bersih Konsolidasi</span>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted">Total Omzet: <span className="text-foreground font-bold">{formatRupiah(statements.totalRevenue)}</span></p>
              <p className="text-xs text-muted">Total Beban: <span className="text-destructive font-bold">({formatRupiah(statements.totalOperatingExpenses)})</span></p>
              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Net Profit:</span>
                <span className={`text-base font-black ${statements.netProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {formatRupiah(statements.netProfit)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Laporan Laba Rugi Segmen */}
        <div className="space-y-4">
          <h3 className="text-sm font-extrabold text-foreground border-l-4 border-destructive/30 pl-2.5 uppercase tracking-wider print:text-black print:border-black">
            I. Laporan Laba Rugi Segmen (Consolidated Profit & Loss)
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted font-bold uppercase print:border-black print:text-black">
                  <th className="py-2.5">Deskripsi Akun</th>
                  <th className="py-2.5 text-right pr-4">Segmen Cafe</th>
                  <th className="py-2.5 text-right pr-4">Segmen Carwash</th>
                  <th className="py-2.5 text-right pr-4">Beban Bersama</th>
                  <th className="py-2.5 text-right font-black">Konsolidasi (Total)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border print:divide-slate-200">
                <tr>
                  <td className="py-3 font-semibold text-foreground print:text-black">PENDAPATAN USAHA (OMZET)</td>
                  <td className="py-3 text-right pr-4 text-primary font-bold print:text-black">{formatRupiah(statements.cafeRevenue)}</td>
                  <td className="py-3 text-right pr-4 text-primary font-bold print:text-black">{formatRupiah(statements.carwashRevenue)}</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right font-bold text-primary print:text-black">{formatRupiah(statements.consolidatedRevenue)}</td>
                </tr>
                <tr>
                  <td className="py-3 pl-4 text-muted print:text-slate-600">Pendapatan Lain-lain (Non-Operasional)</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right text-foreground print:text-black">{formatRupiah(statements.otherIncome)}</td>
                </tr>
                <tr className="bg-subsurface font-bold border-y border-border print:bg-slate-100 print:border-black">
                  <td className="py-3 text-foreground print:text-black">TOTAL PENDAPATAN KOTOR</td>
                  <td className="py-3 text-right pr-4 print:text-black">{formatRupiah(statements.cafeRevenue)}</td>
                  <td className="py-3 text-right pr-4 print:text-black">{formatRupiah(statements.carwashRevenue)}</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right font-black print:text-black">{formatRupiah(statements.totalRevenue)}</td>
                </tr>

                {/* Beban Langsung & Bahan */}
                <tr>
                  <td className="py-3 pl-4 text-muted print:text-slate-600">Bahan Baku & Kemasan Cafe (COGS)</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.cafeBahanBaku)})</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right text-destructive print:text-black">({formatRupiah(statements.cafeBahanBaku)})</td>
                </tr>
                <tr>
                  <td className="py-3 pl-4 text-muted print:text-slate-600">Chemical Cucian & Komisi Kru Pencuci</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.carwashCommission + statements.carwashBahan)})</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right text-destructive print:text-black">({formatRupiah(statements.carwashCommission + statements.carwashBahan)})</td>
                </tr>
                <tr>
                  <td className="py-3 pl-4 text-muted print:text-slate-600">Beban Operasional Khusus Segmen</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.cafeOperasional)})</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.carwashOperasional)})</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right text-destructive print:text-black">({formatRupiah(statements.cafeOperasional + statements.carwashOperasional)})</td>
                </tr>
                <tr>
                  <td className="py-3 pl-4 text-muted print:text-slate-600">Beban Utilitas Bersama (Listrik, Air PDAM, Wi-Fi)</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.bebanBersamaUtilitas)})</td>
                  <td className="py-3 text-right text-destructive print:text-black">({formatRupiah(statements.bebanBersamaUtilitas)})</td>
                </tr>
                <tr>
                  <td className="py-3 pl-4 text-muted print:text-slate-600">Beban Gaji Kasir/Umum & Casbon</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.bebanBersamaGaji)})</td>
                  <td className="py-3 text-right text-destructive print:text-black">({formatRupiah(statements.bebanBersamaGaji)})</td>
                </tr>
                {statements.bebanBersamaLain > 0 && (
                  <tr>
                    <td className="py-3 pl-4 text-muted print:text-slate-600">Beban Operasional Lain-lain</td>
                    <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                    <td className="py-3 text-right pr-4 text-muted-dark">-</td>
                    <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.bebanBersamaLain)})</td>
                    <td className="py-3 text-right text-destructive print:text-black">({formatRupiah(statements.bebanBersamaLain)})</td>
                  </tr>
                )}

                <tr className="bg-subsurface font-bold border-y border-border print:bg-slate-100 print:border-black">
                  <td className="py-3 text-foreground print:text-black">TOTAL BEBAN OPERASIONAL</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.totalBebanCafe)})</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.totalBebanCarwash)})</td>
                  <td className="py-3 text-right pr-4 text-destructive print:text-black">({formatRupiah(statements.totalBebanBersama)})</td>
                  <td className="py-3 text-right font-black text-destructive print:text-black">({formatRupiah(statements.totalOperatingExpenses)})</td>
                </tr>

                {/* Net Profit Segmen & Konsolidasi */}
                <tr className="bg-destructive-bg border-y-2 border-border font-extrabold text-sm print:bg-slate-200 print:border-black print:text-black">
                  <td className="py-3.5 text-foreground print:text-black">LABA BERSIH BERJALAN (NET PROFIT)</td>
                  <td className={`py-3.5 text-right pr-4 font-black ${statements.labaOperasionalCafe >= 0 ? 'text-primary' : 'text-destructive'} print:text-black`}>
                    {formatRupiah(statements.labaOperasionalCafe)}
                  </td>
                  <td className={`py-3.5 text-right pr-4 font-black ${statements.labaOperasionalCarwash >= 0 ? 'text-primary' : 'text-destructive'} print:text-black`}>
                    {formatRupiah(statements.labaOperasionalCarwash)}
                  </td>
                  <td className="py-3.5 text-right pr-4 font-black text-destructive print:text-black">
                    ({formatRupiah(statements.totalBebanBersama)})
                  </td>
                  <td className={`py-3.5 text-right font-black ${statements.netProfit >= 0 ? 'text-primary' : 'text-destructive'} print:text-black`}>
                    {formatRupiah(statements.netProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Posisi Saldo Kas & Rekening */}
        <div className="space-y-4">
          <h3 className="text-sm font-extrabold text-foreground border-l-4 border-destructive/30 pl-2.5 uppercase tracking-wider print:text-black print:border-black">
            II. Laporan Rekonsiliasi & Posisi Saldo Kas (Cash Position)
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4">
            {posAccountList.length > 0 ? (
              posAccountList.map((acc) => (
                <div key={acc.id || acc.pos} className="p-4 rounded-xl border border-border bg-subsurface text-center print:border-black print:bg-transparent">
                  <span className="text-[10px] text-muted-dark uppercase font-semibold block truncate" title={acc.label || acc.pos}>
                    {acc.label || acc.pos}
                  </span>
                  <h4 className="text-lg font-mono tabular-nums font-black text-foreground mt-1 print:text-black">
                    {formatRupiah(acc.current_balance ?? acc.balance ?? 0)}
                  </h4>
                  <span className="text-[9px] text-muted-dark block mt-0.5 print:text-black">Saldo Buku ERPPoss</span>
                </div>
              ))
            ) : (
              <>
                <div className="p-4 rounded-xl border border-border bg-subsurface text-center print:border-black print:bg-transparent">
                  <span className="text-[10px] text-muted-dark uppercase font-semibold">Kas Laci Kasir</span>
                  <h4 className="text-lg font-mono tabular-nums font-black text-foreground mt-1 print:text-black">{formatRupiah(posBalances.cash)}</h4>
                </div>
                <div className="p-4 rounded-xl border border-border bg-subsurface text-center print:border-black print:bg-transparent">
                  <span className="text-[10px] text-muted-dark uppercase font-semibold">Rekening Utama</span>
                  <h4 className="text-lg font-mono tabular-nums font-black text-foreground mt-1 print:text-black">{formatRupiah(posBalances.rekY)}</h4>
                </div>
              </>
            )}
          </div>

          <div className="p-4 rounded-xl border border-border bg-subsurface flex justify-between items-center text-xs font-bold print:border-black print:bg-slate-100">
            <span className="text-muted print:text-black">TOTAL KAS LIKUID PERUSAHAAN (CASH & EQUIVALENTS)</span>
            <span className="text-success text-sm font-black print:text-black">
              {formatRupiah(statements.totalLiquid)}
            </span>
          </div>
        </div>

        {/* Section 3: Catatan Metrik Penunjang */}
        <div className="space-y-4">
          <h3 className="text-sm font-extrabold text-foreground border-l-4 border-destructive/30 pl-2.5 uppercase tracking-wider print:text-black print:border-black">
            III. Catatan Penunjang Laporan (Usaha & Metrik Operasional)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 text-xs">
            <div className="p-4 rounded-xl border border-border bg-subsurface space-y-2 print:border-black print:bg-transparent">
              <h4 className="font-bold text-warning uppercase tracking-wide print:text-black">Segmen Cafe</h4>
              <div className="space-y-1 text-foreground print:text-black">
                <div className="flex justify-between">
                  <span className="text-muted-dark print:text-slate-600">Total Porsi / Cup Terjual:</span>
                  <span className="font-bold text-foreground print:text-black">{statements.totalCafeItems} unit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-dark print:text-slate-600">Rata-rata Transaksi (AOV):</span>
                  <span className="font-bold text-foreground print:text-black">{formatRupiah(statements.aov)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border bg-subsurface space-y-2 print:border-black print:bg-transparent">
              <h4 className="font-bold text-primary uppercase tracking-wide print:text-black">Segmen Carwash</h4>
              <div className="space-y-1 text-foreground print:text-black">
                <div className="flex justify-between">
                  <span className="text-muted-dark print:text-slate-600">Total Unit Mobil Dicuci:</span>
                  <span className="font-bold text-foreground print:text-black">{statements.totalCars} unit</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-dark print:text-slate-600">Total Alokasi Komisi Kru:</span>
                  <span className="font-bold text-foreground print:text-black">{formatRupiah(statements.carwashCommission)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Lembar Cetak */}
        <div className="hidden print:flex justify-between items-center text-[10px] text-muted-dark border-t border-border mt-12 pt-4">
          <span>Dicetak otomatis oleh Sistem ERP {receiptConfig.storeName || 'RelayPOS'}</span>
          <span>Waktu Cetak: {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB</span>
          <div className="flex flex-col items-center gap-1">
            <span>Disetujui Oleh:</span>
            <span className="font-bold mt-8 text-foreground border-t border-black px-8 text-center">Owner / Manajemen</span>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

export default Reports
