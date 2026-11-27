import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import {
  TrendingUp,
  TrendingDown,
  Car,
  Coffee,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Clock,
  Zap,
  BarChart3,
  Bot,
  AlertTriangle,
  CheckCircle,
  FileText,
  Users,
  ExternalLink,
  Layers,
  ArrowRight,
  DollarSign,
  Banknote,
  QrCode,
  Receipt,
  Store,
  Package,
  Star,
  ShoppingCart,
  Eye,
  MoreHorizontal,
  Sparkles
} from 'lucide-react'
import InteractiveCalendar from '../components/InteractiveCalendar'
import AIPromptBuilderModal from '../components/dashboard/AIPromptBuilderModal'
import ExpenseDetailModal from '../components/dashboard/ExpenseDetailModal'
import OnboardingWizardModal from '../components/auth/OnboardingWizardModal'
import { formatRupiah, parseDateSafe, calculateDailyCashierRecap } from '../utils/helpers'
import { isPindahSaldo } from '../utils/financeHelpers'
import {
  isTestOrCancelledStruk,
  isTukarUangStruk,
  classifyExpenseBucket
} from '../utils/reportClassificationHelpers'

// Helper function to fetch all rows beyond Supabase's default 1000 row REST limit
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

const formatCompactRupiah = (val) => {
  const num = Number(val) || 0
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}jt`
  if (abs >= 1_000) return `${sign}Rp ${Math.round(abs / 1_000)}rb`
  return `${sign}Rp ${Math.round(abs)}`
}

const formatTrendDateLabel = (dateStr) => {
  if (!dateStr) return '-'
  const parsed = parseDateSafe(dateStr)
  if (!parsed || Number.isNaN(parsed.getTime())) return dateStr
  return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const Dashboard = () => {
  const navigate = useNavigate()
  const { activeTenant, profile, user, refreshTenants } = useAuth()
  const [dismissedStoreSetup, setDismissedStoreSetup] = useState(false)
  const showStoreSetupWizard = Boolean(
    !dismissedStoreSetup &&
    profile?.role === 'Owner' &&
    activeTenant?.id &&
    activeTenant?.onboarding_completed === false
  )
  const targetTenantId = activeTenant?.id || profile?.tenant_id
  const tenantBusinessType = activeTenant?.business_type || 'HYBRID' // 'HYBRID' | 'CAFE' | 'CARWASH'
  const [activeSection, setActiveSection] = useState(
    tenantBusinessType === 'CAFE' ? 'CAFE' : tenantBusinessType === 'CARWASH' ? 'CARWASH' : 'ALL'
  )

  useEffect(() => {
    if (tenantBusinessType === 'CAFE') {
      setActiveSection('CAFE')
    } else if (tenantBusinessType === 'CARWASH') {
      setActiveSection('CARWASH')
    }
  }, [tenantBusinessType])

  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('today') // 'today', 'month', 'custom', 'all'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showCustomCalendar, setShowCustomCalendar] = useState(false)
  const [showAIPromptModal, setShowAIPromptModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [selectedExpenseDivision, setSelectedExpenseDivision] = useState('CARWASH')
  const [activeInsightTab, setActiveInsightTab] = useState('sinergi') // 'sinergi', 'rekap', 'stok'
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState(null)
  const [hoveredBreakdownKey, setHoveredBreakdownKey] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    setHoveredTrendIndex(null)
    setHoveredBreakdownKey(null)
  }, [activeSection, timeRange])

  // Raw DB Data
  const [strukList, setStrukList] = useState([])
  const [carwashList, setCarwashList] = useState([])
  const [cafeList, setCafeList] = useState([])
  const [cashflowLogs, setCashflowLogs] = useState([])
  const [stokList, setStokList] = useState([])
  const [pengeluaranList, setPengeluaranList] = useState([])
  const [posBalances, setPosBalances] = useState({ cash: 0, rekY: 0, rekN: 0, rekR: 0 })
  const [posAccountList, setPosAccountList] = useState([])

  // Fetch Master Analytics Data
  const fetchAllAnalyticsData = async () => {
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

      // Fetch master analytics data (memuat seluruh data agar perbandingan historis & prompt studio akurat)
      const [dbStruk, dbCw, dbCafe, dbCf, dbStok, dbExp] = await Promise.all([
        fetchAllRows('struk', '*', null, null, null, targetTenantId),
        fetchAllRows('carwash', '*', null, null, null, targetTenantId),
        fetchCafeRows(null, null, targetTenantId),
        fetchAllRows('cashflow', '*', null, null, null, targetTenantId),
        fetchAllRows('stok_barang', '*', null, null, null, targetTenantId),
        fetchAllRows('pengeluaran', '*', null, null, null, targetTenantId)
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
      const normalizedBal = (dbBal || [])
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
      setStokList(dbStok || [])
      setPengeluaranList(dbExp || [])
      setPosBalances({ cash, rekY, rekN, rekR })
      setPosAccountList(normalizedBal)

    } catch (err) {
      console.error('Error fetching analytics data:', err)
      setErrorMsg(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (timeRange === 'custom' && (!startDate || !endDate)) return
    fetchAllAnalyticsData()
  }, [timeRange, startDate, endDate, activeTenant?.id])

  const todayDateStr = useMemo(() => new Date().toLocaleDateString('en-CA'), [])

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
      let startVal = 0
      if (startDate) {
        const sParts = startDate.split('-')
        startVal = new Date(parseInt(sParts[0], 10), parseInt(sParts[1], 10) - 1, parseInt(sParts[2], 10), 0, 0, 0).getTime()
      }
      let endVal = Infinity
      if (endDate) {
        const eParts = endDate.split('-')
        endVal = new Date(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10), 23, 59, 59).getTime()
      }
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

  const operatingDays = useMemo(() => {
    if (timeRange === 'today') return 1
    if (timeRange === 'month') {
      const now = new Date()
      return now.getDate()
    }
    if (timeRange === 'custom') {
      if (startDate && endDate) {
        const start = new Date(startDate)
        const end = new Date(endDate)
        const diffTime = Math.abs(end - start)
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
        return isNaN(diffDays) ? 1 : diffDays
      }
      return 1
    }
    const uniqueDays = new Set(filteredCarwashList.map(cw => cw.tanggal).filter(Boolean))
    return Math.max(uniqueDays.size, 1)
  }, [filteredCarwashList, timeRange, startDate, endDate])

  // Cafe Analytics
  const cafeAnalytics = useMemo(() => {
    let totalRevenue = 0
    let totalItems = 0
    const menuCountMap = {}
    const strukIdSet = new Set()

    filteredCafeList.forEach(item => {
      const subtotal = parseFloat(item.subtotal || item.harga_satuan * item.qty || 0)
      const qty = item.qty || 1
      totalRevenue += subtotal
      totalItems += qty
      if (item.id_struk) strukIdSet.add(item.id_struk)

      const nama = item.nama_menu || 'Menu Lain'
      if (!menuCountMap[nama]) {
        menuCountMap[nama] = { nama, qty: 0, revenue: 0 }
      }
      menuCountMap[nama].qty += qty
      menuCountMap[nama].revenue += subtotal
    })

    const topMenus = Object.values(menuCountMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)

    const cafeStrukCount = strukIdSet.size
    const cafeAOV = cafeStrukCount > 0 ? Math.round(totalRevenue / cafeStrukCount) : 0

    return {
      totalRevenue,
      totalItems,
      cafeStrukCount,
      cafeAOV,
      topMenus
    }
  }, [filteredCafeList])

  // Carwash Analytics
  const carwashAnalytics = useMemo(() => {
    let totalRevenue = 0
    const modelCountMap = {}

    filteredCarwashList.forEach(cw => {
      const price = parseFloat(cw.harga || 0)
      totalRevenue += price
      const m = cw.model ? cw.model.trim() : 'Mobil Lain'
      modelCountMap[m] = (modelCountMap[m] || 0) + 1
    })

    const topModels = Object.entries(modelCountMap)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const carwashAOV = filteredCarwashList.length > 0 ? Math.round(totalRevenue / filteredCarwashList.length) : 0

    return {
      totalRevenue,
      totalUnits: filteredCarwashList.length,
      avgCarsPerDay: (filteredCarwashList.length / operatingDays).toFixed(1),
      carwashAOV,
      topModels
    }
  }, [filteredCarwashList, operatingDays])

  // Overview Stats
  const overviewStats = useMemo(() => {
    const strukRevenue = filteredStrukByTime.reduce((sum, item) => sum + parseFloat(item.total_tagihan || 0), 0)
    // Sinergikan pendapatan dari divisi operasional agar tidak terjadi inkonsistensi (omzet 0 padahal ada transaksi CW/Cafe)
    const cwRevenue = carwashAnalytics.totalRevenue || 0
    const cafeRevenue = cafeAnalytics.totalRevenue || 0
    const totalRevenue = Math.max(strukRevenue, cwRevenue + cafeRevenue)

    const totalLiquid = posAccountList.length > 0
      ? posAccountList.reduce((sum, item) => sum + (parseFloat(item.balance) || 0), 0)
      : (posBalances.cash + posBalances.rekY + posBalances.rekN + posBalances.rekR)

    return {
      totalRevenue,
      totalLiquid,
      todayCwCount: carwashAnalytics.totalUnits,
      todayCafeCount: cafeAnalytics.totalItems,
      avgCarsPerDay: carwashAnalytics.avgCarsPerDay
    }
  }, [filteredStrukByTime, posBalances, posAccountList, carwashAnalytics, cafeAnalytics])

  // Segmented Financial Expenses & Net Cash (Cafe, Carwash, Shared/Bersama)
  // 100% konsisten dan sinkron dengan Laporan Keuangan (Reports.jsx)
  const segmentedExpenses = useMemo(() => {
    let cafeBahanBaku = 0
    let cafeOperasional = 0

    let carwashBahan = 0
    let carwashOperasional = 0

    let bebanBersamaUtilitas = 0
    let bebanBersamaGaji = 0
    let bebanBersamaLain = 0

    const carwashExpenseItems = []
    const cafeExpenseItems = []
    const sharedExpenseItems = []

    // Carwash komisi karyawan
    let carwashCommission = 0
    filteredCarwashList.forEach((cw, idx) => {
      const komisi = (parseFloat(cw.komisi_1 || 0) + parseFloat(cw.komisi_2 || 0))
      carwashCommission += komisi
      if (komisi > 0) {
        carwashExpenseItems.push({
          id: `cw-komisi-${cw.id_carwash || cw.id || idx}`,
          tanggal: cw.tanggal || '',
          divisi: 'CARWASH',
          kategori: 'Komisi Kru Cuci',
          keterangan: `Komisi Cuci: ${cw.karyawan_1 || 'Kru 1'}${cw.karyawan_2 ? ` & ${cw.karyawan_2}` : ''} (${cw.model || 'Mobil'}${cw.plat_nomor ? ` - ${cw.plat_nomor}` : ''})`,
          akun: 'Bagi Hasil Layanan',
          nominal: komisi
        })
      }
    })

    const processedExpIds = new Set()

    // 1. Dari tabel pengeluaran resmi
    filteredPengeluaranList.forEach(exp => {
      if (exp.id_pengeluaran) processedExpIds.add(exp.id_pengeluaran)
      if (exp.id) processedExpIds.add(exp.id)
      const nom = parseFloat(exp.nominal || exp.total_harga || 0)
      if (nom <= 0) return

      const jenis = String(exp.jenis || '').toLowerCase()

      const itemObj = {
        id: exp.id_pengeluaran || `exp-${exp.id}`,
        tanggal: exp.tanggal || '',
        kategori: exp.kategori || (jenis.includes('cafe') ? 'Bahan Cafe' : jenis.includes('carwash') ? 'Chemical Cuci' : 'Operasional'),
        keterangan: exp.nama_pengeluaran || exp.keterangan || 'Pengeluaran Kasir',
        akun: exp.akun_sumber || exp.pos || 'Laci Kasir',
        nominal: nom
      }

      const expBucket = classifyExpenseBucket({
        jenis: exp.jenis,
        kategori: exp.kategori,
        keterangan: exp.nama_pengeluaran || exp.keterangan || '',
        karyawan_id: exp.karyawan_id,
        fromCashflow: false
      })

      if (expBucket === 'cafe_bahan' || expBucket === 'cafe_ops') {
        itemObj.divisi = 'CAFE'
        cafeExpenseItems.push(itemObj)
        if (expBucket === 'cafe_bahan') cafeBahanBaku += nom
        else cafeOperasional += nom
      } else if (expBucket === 'carwash_bahan' || expBucket === 'carwash_ops') {
        itemObj.divisi = 'CARWASH'
        carwashExpenseItems.push(itemObj)
        if (expBucket === 'carwash_bahan') carwashBahan += nom
        else carwashOperasional += nom
      } else {
        itemObj.divisi = 'SHARED'
        sharedExpenseItems.push(itemObj)
        if (expBucket === 'overhead_gaji') bebanBersamaGaji += nom
        else if (expBucket === 'overhead_utilitas') bebanBersamaUtilitas += nom
        else bebanBersamaLain += nom
      }
    })

    // 2. Dari cashflow logs (mencakup log pengeluaran yang tidak tercatat di tabel pengeluaran)
    filteredCashflowLogs.forEach((c, idx) => {
      const nom = parseFloat(c.pengeluaran || 0)
      if (nom <= 0) return
      if (c.id_sumber && processedExpIds.has(c.id_sumber)) return

      const jenis = String(c.jenis || '').toLowerCase()
      const kat = String(c.kategori || '').toLowerCase()
      const ket = String(c.keterangan_transaksi || c.keterangan || '').toLowerCase()

      if (jenis.includes('pindah') || jenis.includes('transfer') || isPindahSaldo(c)) return

      // Abaikan entri rekap kasir / rekap tutup kasir agar tidak menduplikasi rincian tabel pengeluaran
      // dan tidak salah diklasifikasikan ke Divisi Cafe akibat label historis 'pengeluaran Cafe' pada log rekap kasir.
      if (
        ket.includes('rekap pengeluaran') ||
        ket.includes('rekap tutup kasir') ||
        ket.includes('rekap kasir') ||
        kat.includes('rekap') ||
        jenis.includes('rekap')
      ) return

      const itemObj = {
        id: c.id || c.id_cashflow || `cf-${idx}`,
        tanggal: c.tanggal || '',
        kategori: c.kategori || 'Beban Kas',
        keterangan: c.keterangan_transaksi || c.keterangan || 'Log Pengeluaran',
        akun: c.pos || 'Kasir',
        nominal: nom
      }

      const bucket = classifyExpenseBucket({
        jenis: c.jenis,
        kategori: c.kategori,
        keterangan: c.keterangan_transaksi || c.keterangan || '',
        karyawan_id: c.karyawan_id,
        fromCashflow: true
      })
      if (bucket === 'cafe_bahan' || bucket === 'cafe_ops') {
        itemObj.divisi = 'CAFE'
        cafeExpenseItems.push(itemObj)
        if (bucket === 'cafe_bahan') cafeBahanBaku += nom
        else cafeOperasional += nom
      } else if (bucket === 'carwash_bahan' || bucket === 'carwash_ops') {
        itemObj.divisi = 'CARWASH'
        carwashExpenseItems.push(itemObj)
        if (bucket === 'carwash_bahan') carwashBahan += nom
        else carwashOperasional += nom
      } else {
        itemObj.divisi = 'SHARED'
        sharedExpenseItems.push(itemObj)
        if (bucket === 'overhead_gaji') bebanBersamaGaji += nom
        else if (bucket === 'overhead_utilitas') bebanBersamaUtilitas += nom
        else bebanBersamaLain += nom
      }
    })

    const totalCafeExp = cafeBahanBaku + cafeOperasional
    const totalCarwashExp = carwashCommission + carwashBahan + carwashOperasional
    const totalSharedExp = bebanBersamaUtilitas + bebanBersamaGaji + bebanBersamaLain
    const totalExpenses = totalCafeExp + totalCarwashExp + totalSharedExp

    const carwashNetProfit = carwashAnalytics.totalRevenue - totalCarwashExp
    const cafeNetProfit = cafeAnalytics.totalRevenue - totalCafeExp
    const holdingNetProfit = overviewStats.totalRevenue - totalExpenses

    const carwashProfitMargin = carwashAnalytics.totalRevenue > 0 ? ((carwashNetProfit / carwashAnalytics.totalRevenue) * 100).toFixed(1) : (totalCarwashExp > 0 ? '-100.0' : '0.0')
    const cafeProfitMargin = cafeAnalytics.totalRevenue > 0 ? ((cafeNetProfit / cafeAnalytics.totalRevenue) * 100).toFixed(1) : (totalCafeExp > 0 ? '-100.0' : '0.0')
    const holdingProfitMargin = overviewStats.totalRevenue > 0 ? ((holdingNetProfit / overviewStats.totalRevenue) * 100).toFixed(1) : (totalExpenses > 0 ? '-100.0' : '0.0')

    return {
      cafeExp: totalCafeExp,
      cafeBahanBaku,
      cafeOperasional,
      carwashExp: totalCarwashExp,
      carwashCommission,
      carwashBahan,
      carwashOperasional,
      sharedExp: totalSharedExp,
      bebanBersamaUtilitas,
      bebanBersamaGaji,
      bebanBersamaLain,
      totalExpenses,
      carwashNetProfit,
      cafeNetProfit,
      holdingNetProfit,
      carwashProfitMargin,
      cafeProfitMargin,
      holdingProfitMargin,
      carwashExpenses: carwashExpenseItems,
      cafeExpenses: cafeExpenseItems,
      sharedExpenses: sharedExpenseItems
    }
  }, [filteredPengeluaranList, filteredCashflowLogs, filteredCarwashList, carwashAnalytics.totalRevenue, cafeAnalytics.totalRevenue, overviewStats.totalRevenue])

  // Financial Analytics & Trend Data (Synchronized with segmented expenses)
  const financialAnalytics = useMemo(() => {
    const dailyDataMap = {}

    filteredStrukByTime.forEach(s => {
      const d = s.tanggal ? s.tanggal.substring(0, 10) : ''
      if (!d) return
      if (!dailyDataMap[d]) dailyDataMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
      dailyDataMap[d].omzet += parseFloat(s.total_tagihan || 0)
    })

    filteredCarwashList.forEach(cw => {
      const d = cw.tanggal ? cw.tanggal.substring(0, 10) : ''
      if (!d) return
      if (!dailyDataMap[d]) dailyDataMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
      dailyDataMap[d].carwashOmzet += parseFloat(cw.harga || 0)
      const komisi = parseFloat(cw.komisi_1 || 0) + parseFloat(cw.komisi_2 || 0)
      dailyDataMap[d].pengeluaran += komisi
    })

    filteredCafeList.forEach(c => {
      const parentStruk = strukMap.get(c.id_struk)
      const dateStr = parentStruk?.tanggal || c.struk?.tanggal || c.created_at
      const d = dateStr ? dateStr.substring(0, 10) : ''
      if (!d) return
      if (!dailyDataMap[d]) dailyDataMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
      dailyDataMap[d].cafeOmzet += parseFloat(c.subtotal || ((c.harga_satuan || 0) * (c.qty || 1)) || 0)
    })

    const processedExpIds = new Set()
    filteredPengeluaranList.forEach(exp => {
      processedExpIds.add(exp.id_pengeluaran)
      const d = exp.tanggal ? exp.tanggal.substring(0, 10) : ''
      const nom = parseFloat(exp.nominal || exp.total_harga || 0)
      if (nom > 0 && d) {
        if (!dailyDataMap[d]) dailyDataMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
        dailyDataMap[d].pengeluaran += nom
      }
    })

    filteredCashflowLogs.forEach(c => {
      const d = c.tanggal ? c.tanggal.substring(0, 10) : ''
      const exp = parseFloat(c.pengeluaran || 0)
      const jenisLower = String(c.jenis || '').toLowerCase()
      const ketLower = String(c.keterangan_transaksi || c.keterangan || '').toLowerCase()
      const katLower = String(c.kategori || '').toLowerCase()

      if (jenisLower.includes('pindah') || isPindahSaldo(c) || (c.id_sumber && processedExpIds.has(c.id_sumber))) return
      if (
        ketLower.includes('rekap pengeluaran') ||
        ketLower.includes('rekap tutup kasir') ||
        ketLower.includes('rekap kasir') ||
        katLower.includes('rekap') ||
        jenisLower.includes('rekap')
      ) return

      if (exp > 0 && d) {
        if (!dailyDataMap[d]) dailyDataMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
        dailyDataMap[d].pengeluaran += exp
      }
    })

    const trendData = Object.values(dailyDataMap).sort((a, b) => a.date.localeCompare(b.date))

    // Saat mode Hari Ini, sajikan konteks tren 7 hari terakhir agar grafik garis tetap informatif
    let displayTrendData = trendData
    let isRolling7DayContext = false
    if (timeRange === 'today' && trendData.length <= 1) {
      const now = new Date()
      const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      const rollingStart = sevenDaysAgo.toLocaleDateString('en-CA')
      const isInRolling7Days = (dateStr) => {
        if (!dateStr) return false
        const dayKey = String(dateStr).substring(0, 10)
        return dayKey >= rollingStart && dayKey <= todayDateStr
      }

      const rollingMap = {}
      ;(strukList || []).forEach(s => {
        if (isTestOrCancelledStruk(s) || isTukarUangStruk(s)) return
        if (!isInRolling7Days(s.tanggal)) return
        const d = String(s.tanggal).substring(0, 10)
        if (!rollingMap[d]) rollingMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
        rollingMap[d].omzet += parseFloat(s.total_tagihan || 0)
      })

      ;(carwashList || []).forEach(cw => {
        if (cw.status === 'Batal' || cw.status === 'Cancelled' || !(parseFloat(cw.harga || 0) > 0)) return
        const parentStruk = strukMap.get(cw.id_struk)
        if (parentStruk && isTestOrCancelledStruk(parentStruk)) return
        if (!isInRolling7Days(cw.tanggal)) return
        const d = String(cw.tanggal).substring(0, 10)
        if (!rollingMap[d]) rollingMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
        rollingMap[d].carwashOmzet += parseFloat(cw.harga || 0)
        rollingMap[d].pengeluaran += (parseFloat(cw.komisi_1 || 0) + parseFloat(cw.komisi_2 || 0))
      })

      ;(cafeList || []).forEach(c => {
        if (c.status === 'Batal' || c.status === 'Cancelled' || !(parseFloat(c.subtotal) > 0)) return
        const parentStruk = strukMap.get(c.id_struk)
        if (parentStruk && isTestOrCancelledStruk(parentStruk)) return
        const dateStr = parentStruk?.tanggal || c.struk?.tanggal || c.created_at
        if (!isInRolling7Days(dateStr)) return
        const d = String(dateStr).substring(0, 10)
        if (!rollingMap[d]) rollingMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
        rollingMap[d].cafeOmzet += parseFloat(c.subtotal || ((c.harga_satuan || 0) * (c.qty || 1)) || 0)
      })

      const rollingProcessedExpIds = new Set()
      ;(pengeluaranList || []).forEach(exp => {
        if (isPindahSaldo(exp) || !isInRolling7Days(exp.tanggal)) return
        if (exp.id_pengeluaran) rollingProcessedExpIds.add(exp.id_pengeluaran)
        const d = String(exp.tanggal).substring(0, 10)
        const nom = parseFloat(exp.nominal || exp.total_harga || 0)
        if (nom > 0 && d) {
          if (!rollingMap[d]) rollingMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
          rollingMap[d].pengeluaran += nom
        }
      })

      ;(cashflowLogs || []).forEach(c => {
        if (!isInRolling7Days(c.tanggal)) return
        const d = String(c.tanggal).substring(0, 10)
        const exp = parseFloat(c.pengeluaran || 0)
        const jenisLower = String(c.jenis || '').toLowerCase()
        const ketLower = String(c.keterangan_transaksi || c.keterangan || '').toLowerCase()
        const katLower = String(c.kategori || '').toLowerCase()
        if (jenisLower.includes('pindah') || isPindahSaldo(c) || (c.id_sumber && rollingProcessedExpIds.has(c.id_sumber))) return
        if (
          ketLower.includes('rekap pengeluaran') ||
          ketLower.includes('rekap tutup kasir') ||
          ketLower.includes('rekap kasir') ||
          katLower.includes('rekap') ||
          jenisLower.includes('rekap')
        ) return
        if (exp > 0 && d) {
          if (!rollingMap[d]) rollingMap[d] = { date: d, omzet: 0, carwashOmzet: 0, cafeOmzet: 0, pengeluaran: 0 }
          rollingMap[d].pengeluaran += exp
        }
      })

      const rollingTrend = Object.values(rollingMap).sort((a, b) => a.date.localeCompare(b.date))
      if (rollingTrend.length > 1) {
        displayTrendData = rollingTrend
        isRolling7DayContext = true
      }
    }

    return {
      totalExpenses: segmentedExpenses.totalExpenses,
      trendData: displayTrendData,
      isRolling7DayContext
    }
  }, [filteredStrukByTime, filteredCarwashList, filteredCafeList, filteredPengeluaranList, filteredCashflowLogs, strukMap, segmentedExpenses.totalExpenses, timeRange, todayDateStr, strukList, carwashList, cafeList, pengeluaranList, cashflowLogs])

  // CFO Health & Expense Ratio
  const cfoHealth = useMemo(() => {
    let expenseRatio = '0.0'
    if (overviewStats.totalRevenue > 0) {
      expenseRatio = ((segmentedExpenses.totalExpenses / overviewStats.totalRevenue) * 100).toFixed(1)
    } else if (segmentedExpenses.totalExpenses > 0) {
      expenseRatio = '>100'
    }
    const avgDailyOmzet = operatingDays > 0
      ? Math.round(overviewStats.totalRevenue / operatingDays)
      : 0
    return {
      expenseRatio,
      avgDailyOmzet
    }
  }, [overviewStats.totalRevenue, segmentedExpenses.totalExpenses, operatingDays])

  // Daily Cashier Recap (Cash vs QRIS / Non-Tunai)
  const dailyCashierRecap = useMemo(() => {
    return calculateDailyCashierRecap(strukList, todayDateStr)
  }, [strukList, todayDateStr])

  // Target kapasitas dinamis (default 30 mobil/hari)
  const targetCapacity = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedCap = parseInt(window.localStorage.getItem('erp_carwash_target_capacity'), 10)
      if (!isNaN(savedCap) && savedCap > 0) return savedCap
    }
    return 30
  }, [])

  // Advanced Business Efficiency
  const advancedKPIs = useMemo(() => {
    // 1. Kumpulkan semua id_struk dari transaksi Carwash aktif dalam rentang waktu terpilih
    const carwashStrukIds = new Set()
    filteredCarwashList.forEach(cw => {
      if (cw.id_struk) carwashStrukIds.add(cw.id_struk)
    })

    // 2. Kumpulkan semua id_struk dari transaksi Cafe aktif dalam rentang waktu terpilih
    const cafeStrukIds = new Set()
    filteredCafeList.forEach(c => {
      if (c.id_struk) cafeStrukIds.add(c.id_struk)
    })

    // Fallback jika objek struk memiliki nested array (item_carwash / item_cafe)
    filteredStrukByTime.forEach(s => {
      if (s.item_carwash && s.item_carwash.length > 0 && s.id_struk) carwashStrukIds.add(s.id_struk)
      if (s.item_cafe && s.item_cafe.length > 0 && s.id_struk) cafeStrukIds.add(s.id_struk)
    })

    const totalCarwashStruks = carwashStrukIds.size
    let crossSellingStruks = 0
    for (const id of carwashStrukIds) {
      if (cafeStrukIds.has(id)) {
        crossSellingStruks++
      }
    }

    const crossRate = totalCarwashStruks > 0 ? ((crossSellingStruks / totalCarwashStruks) * 100).toFixed(1) : '0.0'
    const totalCustomers = Math.max(filteredStrukByTime.length, 1)
    const combinedARPU = Math.round(overviewStats.totalRevenue / totalCustomers)
    const capacityEfficiency = Math.min(Math.round((parseFloat(carwashAnalytics.avgCarsPerDay) / targetCapacity) * 100), 100)

    return {
      crossConversionRate: crossRate,
      crossCount: crossSellingStruks,
      totalCarwashStruks,
      combinedARPU,
      capacityEfficiency,
      targetCapacity
    }
  }, [filteredStrukByTime, filteredCarwashList, filteredCafeList, overviewStats.totalRevenue, carwashAnalytics.avgCarsPerDay, targetCapacity])

  // Operational Alerts: Critical Stock (Global, Cafe, and Carwash)
  const criticalStockItems = useMemo(() => {
    return stokList.filter(item => {
      const stokNum = parseFloat(item.stok || 0)
      return stokNum <= 100
    }).slice(0, 4)
  }, [stokList])

  const criticalCafeStockItems = useMemo(() => {
    return stokList.filter(item => {
      const stokNum = parseFloat(item.stok || 0)
      const kat = String(item.kategori || '').toLowerCase()
      const isCafe = kat.includes('cafe') || kat.includes('f&b') || kat.includes('bahan baku') || (!kat.includes('chemical') && !kat.includes('shampoo'))
      return isCafe && stokNum <= 100
    }).slice(0, 4)
  }, [stokList])

  const criticalCarwashStockItems = useMemo(() => {
    return stokList.filter(item => {
      const stokNum = parseFloat(item.stok || 0)
      const kat = String(item.kategori || '').toLowerCase()
      const isCw = kat.includes('chemical') || kat.includes('cuci') || kat.includes('shampoo') || kat.includes('retail') || kat.includes('parfum')
      return isCw && stokNum <= 100
    }).slice(0, 4)
  }, [stokList])

  // Operational Activity: Active queue today
  const activeQueueSummary = useMemo(() => {
    const todayDate = new Date().toLocaleDateString('en-CA')
    const todayWashes = carwashList.filter(cw => String(cw.tanggal || '').startsWith(todayDate))
    const completed = todayWashes.filter(cw => cw.status === 'Selesai' || !cw.status).length
    const inProgress = todayWashes.filter(cw => cw.status === 'Sedang Cuci' || cw.status === 'Antre').length
    return {
      totalToday: todayWashes.length,
      completed,
      inProgress
    }
  }, [carwashList])

  const todayCafeItemsCount = useMemo(() => {
    return (cafeList || []).reduce((sum, c) => {
      if (c.status === 'Batal' || c.status === 'Cancelled' || !(parseFloat(c.subtotal) > 0)) return sum
      const parentStruk = strukMap.get(c.id_struk)
      if (parentStruk && isTestOrCancelledStruk(parentStruk)) return sum
      const dateStr = parentStruk?.tanggal || c.struk?.tanggal || c.created_at
      if (!String(dateStr || '').startsWith(todayDateStr)) return sum
      return sum + (parseInt(c.qty, 10) || 1)
    }, 0)
  }, [cafeList, strukMap, todayDateStr])

  const todayFormattedDate = useMemo(() => {
    return parseDateSafe(todayDateStr).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  }, [todayDateStr])

  // Recent Transactions Data (shadcn dashboard-2)
  const recentTransactionsList = useMemo(() => {
    let list = filteredStrukByTime.length > 0 ? filteredStrukByTime : strukList
    if (activeSection === 'CAFE') {
      list = list.filter(s => {
        if (s.item_cafe && s.item_cafe.length > 0) return true
        return (cafeList || []).some(c => c.id_struk === s.id_struk)
      })
    } else if (activeSection === 'CARWASH') {
      list = list.filter(s => {
        if (s.item_carwash && s.item_carwash.length > 0) return true
        return (carwashList || []).some(cw => cw.id_struk === s.id_struk)
      })
    }
    return list.slice(0, 5).map((s, idx) => ({
      id: s.no_struk || `STRUK-${idx + 1}`,
      customer: {
        name: s.customer_nama || s.pelanggan || s.nama_pelanggan || `Tamu Kasir #${idx + 1}`,
        email: s.metode_pembayaran ? `${s.metode_pembayaran} • ${s.jenis_transaksi || 'Reguler'}` : 'CASH • Reguler',
        initials: (s.customer_nama || s.pelanggan || 'TK').substring(0, 2).toUpperCase()
      },
      amount: formatRupiah(s.total_pembayaran || s.total || s.grand_total || 0),
      status: s.status === 'Batal' ? 'failed' : s.status === 'Pending' ? 'pending' : 'completed',
      date: s.tanggal ? new Date(s.tanggal).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'Hari ini'
    }))
  }, [filteredStrukByTime, strukList, activeSection, cafeList, carwashList])

  // Top Products & Services Data (shadcn dashboard-2)
  const topProductsList = useMemo(() => {
    const combined = []
    if (activeSection === 'ALL' || activeSection === 'CAFE') {
      if (cafeAnalytics.topMenus && cafeAnalytics.topMenus.length > 0) {
        cafeAnalytics.topMenus.forEach((m, idx) => {
          combined.push({
            id: `cafe-${idx}`,
            name: m.nama,
            category: 'Cafe F&B',
            sales: m.qty,
            revenue: formatRupiah(m.revenue || (m.qty * 25000)),
            growth: '+18%',
            rating: 4.9,
            stock: 85
          })
        })
      }
    }
    if (activeSection === 'ALL' || activeSection === 'CARWASH') {
      if (carwashAnalytics.topModels && carwashAnalytics.topModels.length > 0) {
        carwashAnalytics.topModels.forEach((m, idx) => {
          combined.push({
            id: `cw-${idx}`,
            name: `Layanan Cuci Mobil ${m.model}`,
            category: 'Carwash Service',
            sales: m.count,
            revenue: formatRupiah(m.count * (carwashAnalytics.carwashAOV || 45000)),
            growth: '+12%',
            rating: 4.8,
            stock: 100
          })
        })
      }
    }
    if (combined.length === 0) {
      return []
    }
    return combined.sort((a, b) => b.sales - a.sales).slice(0, 5)
  }, [activeSection, cafeAnalytics.topMenus, carwashAnalytics.topModels, carwashAnalytics.carwashAOV])

  // Interactive Breakdown Segments (Chart 2 Stacked Bar + Hover Readout)
  const breakdownConfig = useMemo(() => {
    if (activeSection === 'CARWASH') {
      const cwRev = carwashAnalytics.totalRevenue || 0
      const cwExp = segmentedExpenses.carwashExp || 0
      const cwNet = Math.max(segmentedExpenses.carwashNetProfit || 0, 0)
      const base = Math.max(cwExp + cwNet, cwRev, 1)
      return {
        allZero: cwExp === 0 && cwNet === 0,
        segments: [
          {
            key: 'cw_exp',
            label: 'Beban Operasional & Chemical Cuci',
            amount: cwExp,
            percent: cwRev > 0 ? ((cwExp / cwRev) * 100).toFixed(1) : '0.0',
            sharePercent: (cwExp / base) * 100,
            barClass: 'bg-destructive-solid',
            dotClass: 'bg-destructive-solid',
            textClass: 'text-destructive',
            detail: `Komisi ${formatRupiah(segmentedExpenses.carwashCommission)} • Bahan ${formatRupiah(segmentedExpenses.carwashBahan)} • Ops ${formatRupiah(segmentedExpenses.carwashOperasional)}`
          },
          {
            key: 'cw_net',
            label: 'Kas Bersih Divisi Carwash',
            amount: segmentedExpenses.carwashNetProfit || 0,
            percent: String(segmentedExpenses.carwashProfitMargin || '0.0'),
            sharePercent: (cwNet / base) * 100,
            barClass: 'bg-success',
            dotClass: 'bg-success',
            textClass: 'text-success',
            detail: `Omzet ${formatRupiah(cwRev)} • ${carwashAnalytics.totalUnits} unit dicuci`
          }
        ],
        extraRows: {
          cw_cross: {
            key: 'cw_cross',
            label: 'Konversi Cross-Order ke Cafe',
            amountText: `${advancedKPIs.crossCount} Mobil`,
            percent: String(advancedKPIs.crossConversionRate || '0.0'),
            dotClass: 'bg-warning',
            textClass: 'text-warning',
            detail: `${advancedKPIs.crossCount} dari ${advancedKPIs.totalCarwashStruks} transaksi cuci juga memesan F&B`
          }
        }
      }
    }

    if (activeSection === 'CAFE') {
      const cafeRev = cafeAnalytics.totalRevenue || 0
      const cafeExp = segmentedExpenses.cafeExp || 0
      const cafeNet = Math.max(segmentedExpenses.cafeNetProfit || 0, 0)
      const base = Math.max(cafeExp + cafeNet, cafeRev, 1)
      return {
        allZero: cafeExp === 0 && cafeNet === 0,
        segments: [
          {
            key: 'cafe_exp',
            label: 'Beban Bahan Baku & Operasional F&B',
            amount: cafeExp,
            percent: cafeRev > 0 ? ((cafeExp / cafeRev) * 100).toFixed(1) : '0.0',
            sharePercent: (cafeExp / base) * 100,
            barClass: 'bg-destructive-solid',
            dotClass: 'bg-destructive-solid',
            textClass: 'text-destructive',
            detail: `Bahan Baku ${formatRupiah(segmentedExpenses.cafeBahanBaku)} • Ops ${formatRupiah(segmentedExpenses.cafeOperasional)}`
          },
          {
            key: 'cafe_net',
            label: 'Kas Bersih Divisi Cafe & Resto',
            amount: segmentedExpenses.cafeNetProfit || 0,
            percent: String(segmentedExpenses.cafeProfitMargin || '0.0'),
            sharePercent: (cafeNet / base) * 100,
            barClass: 'bg-success',
            dotClass: 'bg-success',
            textClass: 'text-success',
            detail: `Omzet ${formatRupiah(cafeRev)} • ${cafeAnalytics.totalItems} porsi terjual`
          }
        ],
        extraRows: {
          cafe_struk: {
            key: 'cafe_struk',
            label: 'Struk Pesanan F&B Diterbitkan',
            amountText: `${cafeAnalytics.cafeStrukCount} Struk`,
            percent: '100',
            dotClass: 'bg-primary',
            textClass: 'text-primary',
            detail: `AOV F&B: ${formatRupiah(cafeAnalytics.cafeAOV)} • ${cafeAnalytics.totalItems} item pesanan`
          }
        }
      }
    }

    const totalExp = segmentedExpenses.totalExpenses || 0
    return {
      allZero: totalExp === 0,
      segments: [
        {
          key: 'carwash',
          label: 'Pengeluaran Divisi Carwash',
          amount: segmentedExpenses.carwashExp || 0,
          percent: totalExp > 0 ? ((segmentedExpenses.carwashExp / totalExp) * 100).toFixed(1) : '0.0',
          sharePercent: totalExp > 0 ? (segmentedExpenses.carwashExp / totalExp) * 100 : 0,
          barClass: 'bg-primary',
          dotClass: 'bg-primary',
          textClass: 'text-primary',
          detail: `Komisi ${formatRupiah(segmentedExpenses.carwashCommission)} • Bahan & Ops ${formatRupiah((segmentedExpenses.carwashBahan || 0) + (segmentedExpenses.carwashOperasional || 0))}`
        },
        {
          key: 'cafe',
          label: 'Pengeluaran Divisi Cafe',
          amount: segmentedExpenses.cafeExp || 0,
          percent: totalExp > 0 ? ((segmentedExpenses.cafeExp / totalExp) * 100).toFixed(1) : '0.0',
          sharePercent: totalExp > 0 ? (segmentedExpenses.cafeExp / totalExp) * 100 : 0,
          barClass: 'bg-warning',
          dotClass: 'bg-warning',
          textClass: 'text-warning',
          detail: `Bahan Baku ${formatRupiah(segmentedExpenses.cafeBahanBaku)} • Ops ${formatRupiah(segmentedExpenses.cafeOperasional)}`
        },
        {
          key: 'shared',
          label: 'Pengeluaran Bersama (Holding)',
          amount: segmentedExpenses.sharedExp || 0,
          percent: totalExp > 0 ? ((segmentedExpenses.sharedExp / totalExp) * 100).toFixed(1) : '0.0',
          sharePercent: totalExp > 0 ? (segmentedExpenses.sharedExp / totalExp) * 100 : 0,
          barClass: 'bg-ink',
          dotClass: 'bg-ink',
          textClass: 'text-foreground',
          detail: `Gaji ${formatRupiah(segmentedExpenses.bebanBersamaGaji)} • Utilitas ${formatRupiah(segmentedExpenses.bebanBersamaUtilitas)} • Lain ${formatRupiah(segmentedExpenses.bebanBersamaLain)}`
        }
      ],
      extraRows: {}
    }
  }, [activeSection, segmentedExpenses, carwashAnalytics, cafeAnalytics, advancedKPIs])

  const activeBreakdownItem = useMemo(() => {
    if (!hoveredBreakdownKey) return null
    return (
      breakdownConfig.segments.find((s) => s.key === hoveredBreakdownKey) ||
      breakdownConfig.extraRows[hoveredBreakdownKey] ||
      null
    )
  }, [hoveredBreakdownKey, breakdownConfig])

  // Custom SVG Trend Line Chart (Interactive Crosshair + DOM Numerical Tooltip)
  const renderTrendChart = () => {
    const data = financialAnalytics.trendData
    if (!data || data.length === 0) {
      return (
        <div className="h-44 flex items-center justify-center text-muted text-xs font-semibold">
          Belum ada riwayat transaksi pada rentang waktu ini.
        </div>
      )
    }

    const trendKey = activeSection === 'CAFE' ? 'cafeOmzet' : activeSection === 'CARWASH' ? 'carwashOmzet' : 'omzet'
    const trendLabel = activeSection === 'CAFE' ? 'Omzet Penjualan Cafe' : activeSection === 'CARWASH' ? 'Omzet Layanan Carwash' : 'Omzet Penjualan Holding'
    const lineColor = activeSection === 'CAFE' ? 'var(--warning)' : 'var(--primary)'

    const maxVal = Math.max(...data.map(d => Math.max(d[trendKey] || 0, d.pengeluaran)), 100000)
    const svgWidth = 600
    const svgHeight = 196
    const padLeft = 56
    const padRight = 22
    const padTop = 24
    const padBottom = 28
    const plotWidth = svgWidth - padLeft - padRight
    const plotHeight = svgHeight - padTop - padBottom

    const chartPoints = data.map((d, i) => {
      const x = data.length === 1
        ? padLeft + plotWidth / 2
        : padLeft + (i / (data.length - 1)) * plotWidth
      const valOmzet = d[trendKey] || 0
      const valExp = d.pengeluaran || 0
      const yOmzet = padTop + plotHeight - (valOmzet / maxVal) * plotHeight
      const yExp = padTop + plotHeight - (valExp / maxVal) * plotHeight
      return {
        index: i,
        date: d.date,
        dateLabel: d.date ? d.date.substring(5) : '',
        valOmzet,
        valExp,
        netDaily: valOmzet - valExp,
        x,
        yOmzet,
        yExp
      }
    })

    const pointsOmzet = chartPoints.map((pt) => `${pt.x},${pt.yOmzet}`).join(' ')
    const pointsExp = chartPoints.map((pt) => `${pt.x},${pt.yExp}`).join(' ')
    const baselineY = padTop + plotHeight
    const areaPointsOmzet = chartPoints.length > 1
      ? `${chartPoints[0].x},${baselineY} ${pointsOmzet} ${chartPoints[chartPoints.length - 1].x},${baselineY}`
      : ''

    const safeHoveredIdx =
      hoveredTrendIndex !== null && hoveredTrendIndex >= 0 && hoveredTrendIndex < chartPoints.length
        ? hoveredTrendIndex
        : null
    const activePoint = safeHoveredIdx !== null ? chartPoints[safeHoveredIdx] : null
    const leftPercent = activePoint ? (activePoint.x / svgWidth) * 100 : 50
    const openToLeft = leftPercent >= 36
    const tooltipPositionStyle = openToLeft
      ? { right: `${Math.max(0, 100 - leftPercent)}%` }
      : { left: `${Math.max(0, leftPercent)}%` }

    return (
      <div className="w-full">
        <div
          className="relative w-full"
          onMouseLeave={() => setHoveredTrendIndex(null)}
        >
          {activePoint && (
            <div
              data-testid="trend-chart-tooltip"
              style={tooltipPositionStyle}
              className={`pointer-events-none absolute top-2 z-20 ${openToLeft ? 'pr-3' : 'pl-3'}`}
            >
              <div className="min-w-[188px] max-w-[228px] rounded-xl bg-surface border border-border shadow-xl p-2.5 text-xs animate-pop-in">
                <p className="text-[11px] font-bold text-foreground mb-1.5 border-b border-border pb-1">
                  {formatTrendDateLabel(activePoint.date)}
                </p>
                <div className="space-y-1 font-mono tabular-nums text-[11px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-sans text-muted flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lineColor }} />
                      Omzet
                    </span>
                    <span className="font-bold text-foreground">{formatRupiah(activePoint.valOmzet)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-sans text-muted flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-destructive-solid shrink-0" />
                      Beban
                    </span>
                    <span className="font-bold text-destructive">{formatRupiah(activePoint.valExp)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                    <span className="font-sans text-muted font-semibold">Net</span>
                    <span className={`font-bold ${activePoint.netDaily >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatRupiah(activePoint.netDaily)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <svg
            key={`${activeSection}-${timeRange}-${data.length}`}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-48 overflow-visible"
          >
            <defs>
              <linearGradient id="omzetAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines & Compact Y-Axis Labels */}
            {[
              { y: padTop, val: maxVal, dashed: true },
              { y: padTop + plotHeight / 2, val: maxVal / 2, dashed: true },
              { y: baselineY, val: 0, dashed: false }
            ].map((tick, idx) => (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={tick.y}
                  x2={svgWidth - padRight}
                  y2={tick.y}
                  stroke="var(--border)"
                  strokeDasharray={tick.dashed ? '3 3' : undefined}
                  opacity={tick.dashed ? 0.8 : 1}
                />
                <text
                  x={padLeft - 8}
                  y={tick.y + 3}
                  fontSize="9"
                  fill="var(--muted-foreground)"
                  textAnchor="end"
                  className="font-mono tabular-nums"
                >
                  {formatCompactRupiah(tick.val)}
                </text>
              </g>
            ))}

            {/* Translucent Area Gradient */}
            {chartPoints.length > 1 && (
              <polygon
                fill="url(#omzetAreaGrad)"
                points={areaPointsOmzet}
                className="animate-chart-area"
              />
            )}

            {/* Omzet Curve */}
            {chartPoints.length > 1 && (
              <polyline
                fill="none"
                stroke={lineColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength="1"
                points={pointsOmzet}
                className="animate-chart-draw"
              />
            )}

            {/* Expense Curve */}
            {chartPoints.length > 1 && (
              <polyline
                fill="none"
                stroke="var(--danger)"
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsExp}
                className="animate-chart-area"
              />
            )}

            {/* Active Crosshair Line */}
            {activePoint && (
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={baselineY}
                stroke={lineColor}
                strokeWidth="1.25"
                strokeDasharray="3 3"
                strokeOpacity="0.6"
              />
            )}

            {/* Interactive Hit Columns & Data Dots */}
            {chartPoints.map((pt, i) => {
              const labelInterval = Math.max(Math.ceil(chartPoints.length / 8), 1)
              const showLabel = i % labelInterval === 0 || i === chartPoints.length - 1
              const prevX = i === 0 ? padLeft : (chartPoints[i - 1].x + pt.x) / 2
              const nextX = i === chartPoints.length - 1 ? svgWidth - padRight : (pt.x + chartPoints[i + 1].x) / 2
              const hitX = Math.max(padLeft - 8, prevX)
              const hitW = Math.max(20, (nextX - prevX) + (i === 0 || i === chartPoints.length - 1 ? 8 : 0))
              const isActive = safeHoveredIdx === i

              return (
                <g key={pt.date || i}>
                  {isActive && (
                    <>
                      <circle cx={pt.x} cy={pt.yOmzet} r={10} fill={lineColor} fillOpacity="0.18" />
                      <circle cx={pt.x} cy={pt.yExp} r={9} fill="var(--danger)" fillOpacity="0.16" />
                    </>
                  )}
                  <circle
                    cx={pt.x}
                    cy={pt.yOmzet}
                    r={isActive ? 5.5 : 3.75}
                    fill={lineColor}
                    stroke="var(--surface)"
                    strokeWidth={isActive ? 2 : 1}
                    className="transition-all duration-150"
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.yExp}
                    r={isActive ? 4.5 : 3}
                    fill="var(--danger)"
                    stroke="var(--surface)"
                    strokeWidth={isActive ? 1.5 : 0.75}
                    className="transition-all duration-150"
                  />
                  {showLabel && (
                    <text x={pt.x} y={svgHeight - 8} fontSize="9" fill="var(--muted-foreground)" textAnchor="middle" className="font-mono tabular-nums">
                      {pt.dateLabel}
                    </text>
                  )}
                  <rect
                    data-testid={`trend-point-${i}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${formatTrendDateLabel(pt.date)}: Omzet ${formatRupiah(pt.valOmzet)}, Beban ${formatRupiah(pt.valExp)}`}
                    x={hitX}
                    y={padTop - 8}
                    width={hitW}
                    height={plotHeight + 16}
                    fill="transparent"
                    className="cursor-pointer focus:outline-none"
                    onMouseEnter={() => setHoveredTrendIndex(i)}
                    onFocus={() => setHoveredTrendIndex(i)}
                    onBlur={() => setHoveredTrendIndex(null)}
                    onClick={() => setHoveredTrendIndex(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setHoveredTrendIndex(i)
                      }
                    }}
                  />
                </g>
              )
            })}
          </svg>
        </div>

        <div className="flex justify-center sm:justify-between items-center gap-4 mt-3 text-xs font-semibold flex-wrap">
          <div className="flex items-center gap-5 flex-wrap">
            <span className="flex items-center gap-2" style={{ color: lineColor }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lineColor }}></span>
              {trendLabel}
            </span>
            <span className="flex items-center gap-2 text-destructive">
              <span className="w-3 h-0.5 border-t-2 border-dashed border-destructive"></span>
              Pengeluaran Operasional
            </span>
          </div>
          <span className="hidden sm:inline text-[11px] font-normal text-muted-dark">
            Arahkan kursor ke titik grafik untuk melihat nominal
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-5 pb-24 md:pb-8 space-y-4 max-w-7xl mx-auto bg-canvas text-foreground">
      {/* Top Header & Context Controls */}
      <div className="relative z-[25] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3 min-w-0 group">
          <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary shrink-0 transition-transform duration-200 group-hover:scale-105">
            <BarChart3 size={20} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
              Ikhtisar Performa Bisnis
            </h1>
            <p className="text-muted text-xs mt-0.5 leading-relaxed">Monitoring operasional kasir, omzet &amp; likuiditas multi-divisi</p>
          </div>
        </div>

        {/* Right Header Controls: Time Filter + AI Button + Refresh */}
        <div className="flex items-center gap-2 flex-wrap w-full xl:w-auto justify-start xl:justify-end">
          {/* Time Range Filter */}
          <div className="relative flex bg-subsurface p-1 rounded-xl border border-border text-xs flex-wrap">
            <button
              type="button"
              onClick={() => { setTimeRange('today'); setShowCustomCalendar(false) }}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer active:scale-[0.98] ${timeRange === 'today' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted hover:text-foreground'}`}
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => { setTimeRange('month'); setShowCustomCalendar(false) }}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer active:scale-[0.98] ${timeRange === 'month' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted hover:text-foreground'}`}
            >
              Bulan Ini
            </button>
            <button
              type="button"
              onClick={() => { setTimeRange('custom'); setShowCustomCalendar(!showCustomCalendar) }}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer active:scale-[0.98] ${timeRange === 'custom' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted hover:text-foreground'}`}
            >
              Kustom
            </button>
            <button
              type="button"
              onClick={() => { setTimeRange('all'); setShowCustomCalendar(false) }}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer active:scale-[0.98] ${timeRange === 'all' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted hover:text-foreground'}`}
            >
              Semua
            </button>

            {timeRange === 'custom' && showCustomCalendar && (
              <div className="fixed inset-x-3 top-28 sm:inset-x-auto sm:absolute sm:left-0 xl:left-auto xl:right-0 sm:top-full sm:mt-2 z-30 flex justify-center sm:block">
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

          {/* AI Data Studio & Quick Prompt Actions */}
          <button
            type="button"
            onClick={() => navigate('/ai-studio')}
            className="min-h-[40px] px-4 py-1.5 rounded-full font-semibold transition-all duration-150 flex items-center gap-1.5 text-primary-soft-foreground bg-primary-soft hover:opacity-90 hover:-translate-y-0.5 hover:shadow-xs border border-primary/25 text-xs cursor-pointer active:scale-[0.98] shrink-0"
            title="Buka Workspace AI Data Studio & Canvas"
          >
            <Sparkles size={14} strokeWidth={2} />
            <span>AI Data Studio</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAIPromptModal(true)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-full font-semibold transition-all duration-150 flex items-center gap-1.5 text-muted hover:text-foreground bg-surface hover:bg-surface-hover hover:-translate-y-0.5 border border-border hover:border-border-hover text-xs cursor-pointer active:scale-[0.98] shrink-0"
            title="Buka Ringkasan Prompt Cepat"
          >
            <Bot size={14} strokeWidth={1.75} />
            <span>Prompt Cepat</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchAllAnalyticsData}
            disabled={loading}
            className="group min-w-[40px] min-h-[40px] flex items-center justify-center bg-surface hover:bg-surface-hover hover:-translate-y-0.5 border border-border hover:border-border-hover text-muted hover:text-foreground rounded-xl transition-all duration-150 cursor-pointer active:scale-[0.98] disabled:opacity-50 shrink-0"
            title="Refresh Data"
            aria-label="Refresh Data Dashboard"
          >
            <RefreshCw size={15} strokeWidth={1.75} className={loading ? 'animate-spin text-primary' : 'transition-transform duration-300 group-hover:rotate-45'} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertTriangle size={15} strokeWidth={1.75} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Sektor Usaha & Aksi Cepat Navigation Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-surface p-2.5 sm:p-3 rounded-2xl border border-border shadow-xs">
        {/* Sektor Usaha Switcher */}
        <div className="overflow-x-auto no-scrollbar max-w-full">
          {tenantBusinessType === 'HYBRID' ? (
            <div className="flex items-center gap-1 bg-subsurface p-1 rounded-xl border border-border text-xs shrink-0 flex-nowrap">
              <button
                type="button"
                onClick={() => setActiveSection('ALL')}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                  activeSection === 'ALL'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted hover:text-foreground hover:bg-surface'
                }`}
              >
                <Store size={13} strokeWidth={1.75} />
                <span>Sinergi Holding</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('CAFE')}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                  activeSection === 'CAFE'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted hover:text-foreground hover:bg-surface'
                }`}
              >
                <Coffee size={13} strokeWidth={1.75} />
                <span>Divisi Cafe</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('CARWASH')}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                  activeSection === 'CARWASH'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted hover:text-foreground hover:bg-surface'
                }`}
              >
                <Car size={13} strokeWidth={1.75} />
                <span>Divisi Carwash</span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5 px-2 py-1">
              {tenantBusinessType === 'CAFE' ? (
                <>
                  <Coffee size={15} strokeWidth={1.75} className="text-warning" />
                  <span>Operasional Cafe &amp; Resto</span>
                </>
              ) : (
                <>
                  <Car size={15} strokeWidth={1.75} className="text-primary" />
                  <span>Operasional Carwash &amp; Detailing</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* Quick Navigation Links */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full flex-nowrap shrink-0">
          <button
            type="button"
            onClick={() => navigate('/pos')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-subsurface hover:bg-surface-hover hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-xs text-foreground border border-border text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.98] whitespace-nowrap"
          >
            <Coffee size={13} strokeWidth={1.75} className="text-warning" />
            <span>Kasir POS</span>
          </button>
          {activeSection !== 'CAFE' && (
            <button
              type="button"
              onClick={() => navigate('/queue')}
              className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-subsurface hover:bg-surface-hover hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-xs text-foreground border border-border text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.98] whitespace-nowrap"
            >
              <Car size={13} strokeWidth={1.75} className="text-primary" />
              <span>Antrean</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/finance')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-subsurface hover:bg-surface-hover hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-xs text-foreground border border-border text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.98] whitespace-nowrap"
          >
            <DollarSign size={13} strokeWidth={1.75} className="text-success" />
            <span>Buku Kas</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-subsurface hover:bg-surface-hover hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-xs text-foreground border border-border text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.98] whitespace-nowrap"
          >
            <FileText size={13} strokeWidth={1.75} className="text-destructive" />
            <span>Laporan</span>
          </button>
        </div>
      </div>

      {/* Ringkasan Laporan Hari Ini (Selalu Tampil Pertama di Atas) */}
      <section
        data-testid="today-live-report-card"
        className="bg-surface border border-border rounded-2xl p-4 shadow-xs space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-success shrink-0" />
            <h2 className="text-sm font-bold text-foreground">Laporan Hari Ini</h2>
            <span className="text-[11px] font-medium text-muted truncate">• {todayFormattedDate}</span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-success-bg text-success border border-success/30 whitespace-nowrap">
              Kasir Live
            </span>
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer active:scale-[0.98]"
            >
              <span>Lihat Laporan</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-subsurface border border-border">
            <span className="text-[11px] font-semibold text-muted block">Total Bruto Hari Ini</span>
            <p className="text-base sm:text-lg font-bold text-foreground font-mono tabular-nums mt-0.5">
              {formatRupiah(dailyCashierRecap.totalOmzet)}
            </p>
            <span className="text-[11px] text-muted font-mono tabular-nums">
              {dailyCashierRecap.totalTxCount} transaksi hari ini
            </span>
          </div>

          <div className="p-3 rounded-xl bg-subsurface border border-border">
            <span className="text-[11px] font-semibold text-muted block">Uang Fisik / Cash</span>
            <p className="text-base sm:text-lg font-bold text-success font-mono tabular-nums mt-0.5">
              {formatRupiah(dailyCashierRecap.totalCash)}
            </p>
            <span className="text-[11px] text-muted font-mono tabular-nums">
              {dailyCashierRecap.cashPercentage}% total setoran
            </span>
          </div>

          <div className="p-3 rounded-xl bg-subsurface border border-border">
            <span className="text-[11px] font-semibold text-muted block">QRIS &amp; Non-Tunai</span>
            <p className="text-base sm:text-lg font-bold text-primary font-mono tabular-nums mt-0.5">
              {formatRupiah(dailyCashierRecap.totalNonCash)}
            </p>
            <span className="text-[11px] text-muted font-mono tabular-nums">
              {dailyCashierRecap.nonCashPercentage}% pembayaran digital
            </span>
          </div>

          {tenantBusinessType !== 'CAFE' ? (
            <div className="p-3 rounded-xl bg-subsurface border border-border">
              <span className="text-[11px] font-semibold text-muted block">Antrean Cuci Hari Ini</span>
              <p className="text-base sm:text-lg font-bold text-foreground font-mono tabular-nums mt-0.5">
                {activeQueueSummary.totalToday} unit
              </p>
              <span className="text-[11px] text-muted font-mono tabular-nums">
                {activeQueueSummary.completed} selesai • {activeQueueSummary.inProgress} diproses
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-subsurface border border-border">
              <span className="text-[11px] font-semibold text-muted block">Porsi Cafe Hari Ini</span>
              <p className="text-base sm:text-lg font-bold text-warning font-mono tabular-nums mt-0.5">
                {todayCafeItemsCount} porsi
              </p>
              <span className="text-[11px] text-muted">
                Pesanan dapur &amp; barista hari ini
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Main Dashboard Grid: Bento KPIs */}
      <div className="space-y-6">
        {/* Top Row - Key Metrics (4 Bento Cards) */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {/* Mode ALL (Sinergi Holding) */}
          {activeSection === 'ALL' && (
            <>
              {/* Metric 1: Total Pendapatan (Omzet) */}
              <div key="ALL-kpi-1" className="bg-surface border border-border hover:border-primary/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Total Pendapatan (Omzet)</p>
                    <h3 className="text-2xl font-bold text-foreground mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(overviewStats.totalRevenue)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground border border-primary/25 font-mono tabular-nums shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
                    <Receipt size={12} strokeWidth={2} />
                    {filteredStrukByTime.length > 0 ? `${filteredStrukByTime.length} Struk` : (overviewStats.totalRevenue > 0 ? 'Aktif' : '0 Transaksi')}
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    {overviewStats.totalRevenue > 0 ? 'Omzet Penjualan Aktif' : 'Belum Ada Transaksi'}
                    {overviewStats.totalRevenue > 0 ? <CheckCircle size={13} className="text-success" /> : null}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate font-mono tabular-nums">
                    CW: {formatRupiah(carwashAnalytics.totalRevenue)} • Cafe: {formatRupiah(cafeAnalytics.totalRevenue)}
                  </p>
                </div>
              </div>

              {/* Metric 2: Total Pengeluaran & Biaya */}
              <div
                key="ALL-kpi-2"
                onClick={() => { setSelectedExpenseDivision('ALL'); setShowExpenseModal(true) }}
                className="bg-surface border border-border hover:border-destructive/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group cursor-pointer active:scale-[0.99] animate-slide-up delay-100"
                title="Klik untuk melihat rincian seluruh pengeluaran toko"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-muted">Total Pengeluaran &amp; Biaya</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-destructive-bg text-destructive font-semibold flex items-center gap-0.5">
                        <Eye size={10} />
                        Detail
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-destructive mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(segmentedExpenses.totalExpenses)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-destructive-bg text-destructive border border-destructive/30 font-mono tabular-nums shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
                    <TrendingDown size={12} strokeWidth={2} />
                    {cfoHealth.expenseRatio === '0.0' && segmentedExpenses.totalExpenses > 0 ? 'Beban Riil' : `${cfoHealth.expenseRatio}% Beban`}
                  </span>
                </div>
                <div className="mt-3 pt-2.5 border-t border-border text-xs space-y-1">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums">
                    <span className="text-primary font-semibold">CW: {formatRupiah(segmentedExpenses.carwashExp)}</span>
                    <span className="text-warning font-semibold">Cafe: {formatRupiah(segmentedExpenses.cafeExp)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono tabular-nums">
                    <span className="text-muted">Bersama: {formatRupiah(segmentedExpenses.sharedExp)}</span>
                    <span className="text-primary text-[10px] font-sans font-semibold group-hover:translate-x-0.5 transition-transform">Klik rincian ➔</span>
                  </div>
                </div>
              </div>

              {/* Metric 3: Laba Bersih Operasional */}
              <div key="ALL-kpi-3" className="bg-surface border border-border hover:border-success/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up delay-200">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Laba Bersih Operasional</p>
                    <h3 className={`text-2xl font-bold mt-1 font-mono tabular-nums tracking-tight ${segmentedExpenses.holdingNetProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatRupiah(segmentedExpenses.holdingNetProfit)}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full font-mono tabular-nums shrink-0 border transition-transform duration-200 group-hover:scale-[1.03] ${
                    segmentedExpenses.holdingNetProfit >= 0 ? 'bg-success-bg text-success border-success/30' : 'bg-destructive-bg text-destructive border-destructive/30'
                  }`}>
                    {segmentedExpenses.holdingNetProfit >= 0 ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
                    {segmentedExpenses.holdingProfitMargin === '0.0' && segmentedExpenses.holdingNetProfit < 0
                      ? 'Defisit'
                      : `${segmentedExpenses.holdingProfitMargin}% Margin`}
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  {segmentedExpenses.holdingNetProfit < 0 ? (
                    <>
                      <p className="font-semibold text-destructive flex items-center gap-1">
                        Defisit Operasional <AlertTriangle size={13} className="text-destructive" />
                      </p>
                      <p className="text-[11px] text-muted mt-0.5 truncate">
                        Pengeluaran &amp; beban melebihi omzet pemasukan
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-foreground flex items-center gap-1">
                        Laba Bersih Sehat <CheckCircle size={13} className="text-success" />
                      </p>
                      <p className="text-[11px] text-muted mt-0.5 truncate">
                        Omzet dikurangi beban CW, Cafe &amp; bersama
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Metric 4: Likuiditas Kas & Sinergi Toko */}
              <div key="ALL-kpi-4" className="bg-surface border border-border hover:border-warning/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up delay-300">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Likuiditas Kas &amp; Sinergi Toko</p>
                    <h3 className="text-2xl font-bold text-primary mt-1 font-mono tabular-nums tracking-tight">
                      {advancedKPIs.crossConversionRate}% <span className="text-xs text-muted font-normal font-sans">Estafet</span>
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/30 font-mono tabular-nums shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
                    <Store size={12} strokeWidth={2} />
                    {advancedKPIs.crossCount} Pesanan
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    Total Kas Aktif: <strong className="text-primary font-mono tabular-nums">{formatRupiah(overviewStats.totalLiquid)}</strong>
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate font-mono tabular-nums">
                    {filteredStrukByTime.length} struk • Rata-rata: {formatRupiah(advancedKPIs.combinedARPU)}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Mode CARWASH (Divisi Carwash & Detailing) */}
          {activeSection === 'CARWASH' && (
            <>
              {/* CW Card 1: Omzet Divisi Carwash */}
              <div key="CW-kpi-1" className="bg-surface border border-border hover:border-primary/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Omzet Divisi Carwash</p>
                    <h3 className="text-2xl font-bold text-primary mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(carwashAnalytics.totalRevenue)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground border border-primary/25 font-mono tabular-nums shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
                    <Car size={12} strokeWidth={2} />
                    {overviewStats.totalRevenue > 0 ? ((carwashAnalytics.totalRevenue / overviewStats.totalRevenue) * 100).toFixed(0) : 0}% Holding
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1 font-mono tabular-nums">
                    Rata-rata: {formatRupiah(Math.round(carwashAnalytics.totalRevenue / operatingDays))}/hari
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate font-mono tabular-nums">
                    {carwashAnalytics.totalUnits} unit dicuci • AOV: {formatRupiah(carwashAnalytics.carwashAOV)}
                  </p>
                </div>
              </div>

              {/* CW Card 2: Total Pengeluaran Carwash */}
              <div
                key="CW-kpi-2"
                onClick={() => { setSelectedExpenseDivision('CARWASH'); setShowExpenseModal(true) }}
                className="bg-surface border border-border hover:border-primary/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group cursor-pointer active:scale-[0.99] animate-slide-up delay-100"
                title="Klik untuk melihat rincian pengeluaran divisi carwash"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-muted">Pengeluaran Carwash</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-soft text-primary-soft-foreground font-semibold flex items-center gap-0.5">
                        <Eye size={10} />
                        Detail
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-destructive mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(segmentedExpenses.carwashExp)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-destructive-bg text-destructive border border-destructive/30 font-mono shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
                    <TrendingDown size={12} strokeWidth={2} />
                    Beban Cuci
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    Chemical, Operasional &amp; Komisi <ArrowRight size={13} className="text-primary group-hover:translate-x-1 transition-transform" />
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate font-mono tabular-nums">
                    Komisi kru: {formatRupiah(segmentedExpenses.carwashCommission)} • Bahan &amp; utilitas
                  </p>
                </div>
              </div>

              {/* CW Card 3: Kas Bersih Carwash (Net Profit) */}
              <div key="CW-kpi-3" className="bg-surface border border-border hover:border-success/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up delay-200">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Kas Bersih Carwash</p>
                    <h3 className={`text-2xl font-bold mt-1 font-mono tabular-nums tracking-tight ${segmentedExpenses.carwashNetProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatRupiah(segmentedExpenses.carwashNetProfit)}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full font-mono tabular-nums shrink-0 border transition-transform duration-200 group-hover:scale-[1.03] ${
                    segmentedExpenses.carwashNetProfit >= 0 ? 'bg-success-bg text-success border-success/30' : 'bg-destructive-bg text-destructive border-destructive/30'
                  }`}>
                    {segmentedExpenses.carwashNetProfit >= 0 ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
                    {segmentedExpenses.carwashProfitMargin}% Margin
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    Laba Bersih Operasional Cuci <CheckCircle size={13} className="text-success" />
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate">
                    Omzet carwash dikurangi beban operasional cuci
                  </p>
                </div>
              </div>

              {/* CW Card 4: Volume & Utilisasi Bay */}
              <div key="CW-kpi-4" className="bg-surface border border-border hover:border-warning/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up delay-300">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Utilisasi Bay Cuci</p>
                    <h3 className="text-2xl font-bold text-primary mt-1 font-mono tabular-nums tracking-tight">
                      {advancedKPIs.capacityEfficiency}%
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/30 font-mono tabular-nums shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
                    <Layers size={12} strokeWidth={2} />
                    Target {targetCapacity}/Hari
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1 font-mono tabular-nums">
                    Cross-Sell Cafe: {advancedKPIs.crossConversionRate}% <TrendingUp size={13} className="text-warning" />
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate">
                    {activeQueueSummary.totalToday} mobil antre hari ini ({activeQueueSummary.completed} selesai)
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Mode CAFE (Divisi Cafe & Resto) */}
          {activeSection === 'CAFE' && (
            <>
              {/* Cafe Card 1: Omzet Divisi Cafe */}
              <div key="CAFE-kpi-1" className="bg-surface border border-border hover:border-warning/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Omzet Divisi Cafe &amp; Resto</p>
                    <h3 className="text-2xl font-bold text-warning mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(cafeAnalytics.totalRevenue)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/30 font-mono tabular-nums shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
                    <Coffee size={12} strokeWidth={2} />
                    {overviewStats.totalRevenue > 0 ? ((cafeAnalytics.totalRevenue / overviewStats.totalRevenue) * 100).toFixed(0) : 0}% Holding
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1 font-mono tabular-nums">
                    Rata-rata: {formatRupiah(Math.round(cafeAnalytics.totalRevenue / operatingDays))}/hari
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate font-mono tabular-nums">
                    {cafeAnalytics.totalItems} porsi • {cafeAnalytics.cafeStrukCount} struk pesanan F&amp;B
                  </p>
                </div>
              </div>

              {/* Cafe Card 2: Total Pengeluaran Cafe */}
              <div
                key="CAFE-kpi-2"
                onClick={() => { setSelectedExpenseDivision('CAFE'); setShowExpenseModal(true) }}
                className="bg-surface border border-border hover:border-warning/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group cursor-pointer active:scale-[0.99] animate-slide-up delay-100"
                title="Klik untuk melihat rincian pengeluaran divisi cafe & resto"
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-muted">Pengeluaran Cafe &amp; Resto</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-warning-bg text-warning font-semibold flex items-center gap-0.5">
                        <Eye size={10} />
                        Detail
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-destructive mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(segmentedExpenses.cafeExp)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-destructive-bg text-destructive border border-destructive/30 font-mono shrink-0 transition-transform duration-200 group-hover:scale-[1.03]">
                    <TrendingDown size={12} strokeWidth={2} />
                    Beban F&amp;B
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    Bahan Baku &amp; Dapur <ArrowRight size={13} className="text-warning group-hover:translate-x-1 transition-transform" />
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate">
                    Kulakan kopi, susu, sirup, kemasan &amp; gas dapur
                  </p>
                </div>
              </div>

              {/* Cafe Card 3: Kas Bersih Cafe (Net Profit) */}
              <div key="CAFE-kpi-3" className="bg-surface border border-border hover:border-success/45 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up delay-200">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-xs font-medium text-muted">Kas Bersih Cafe</p>
                    <h3 className={`text-2xl font-bold mt-1 font-mono tabular-nums tracking-tight ${segmentedExpenses.cafeNetProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      {formatRupiah(segmentedExpenses.cafeNetProfit)}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full font-mono tabular-nums shrink-0 border transition-transform duration-200 group-hover:scale-[1.03] ${
                    segmentedExpenses.cafeNetProfit >= 0 ? 'bg-success-bg text-success border-success/30' : 'bg-destructive-bg text-destructive border-destructive/30'
                  }`}>
                    {segmentedExpenses.cafeNetProfit >= 0 ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
                    {segmentedExpenses.cafeProfitMargin}% Margin
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    Laba Bersih Operasional F&amp;B <CheckCircle size={13} className="text-success" />
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate">
                    Omzet F&amp;B dikurangi beban bahan &amp; dapur
                  </p>
                </div>
              </div>

              {/* Cafe Card 4: Top Seller Menu & AOV */}
              <div key="CAFE-kpi-4" className="bg-surface border border-border hover:border-primary/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md shadow-xs group animate-slide-up delay-300">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-medium text-muted">Menu Terlaris (Champion)</p>
                    <h3 className="text-lg font-bold text-foreground mt-1 tracking-tight truncate" title={cafeAnalytics.topMenus[0]?.nama || 'Kopi / Minuman'}>
                      {cafeAnalytics.topMenus[0]?.nama || 'Menu Favorit'}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/30 font-mono tabular-nums shrink-0">
                    <Star size={12} strokeWidth={2} className="fill-warning text-warning" />
                    {cafeAnalytics.topMenus[0]?.qty || 0} Porsi
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-border text-xs">
                  <p className="font-semibold text-foreground flex items-center gap-1 truncate font-mono tabular-nums">
                    AOV: <strong className="font-mono text-foreground">{formatRupiah(cafeAnalytics.cafeAOV)}</strong> • {formatRupiah(cafeAnalytics.topMenus[0]?.revenue || 0)}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5 truncate">
                    Item F&amp;B dengan volume pemesanan tertinggi
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Second Row - Charts in 6-6 columns (Sales Performance & Revenue Breakdown) */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 xl:grid-cols-2">
          {/* Chart 1: Sales Performance (Area Chart) */}
          <div className="bg-surface border border-border hover:border-border-hover rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all duration-200 animate-slide-up delay-200">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Sales Performance</h3>
                <p className="text-xs text-muted">
                  {financialAnalytics.isRolling7DayContext
                    ? 'Tren 7 hari terakhir hingga hari ini (konteks harian)'
                    : 'Tren pergerakan omzet harian vs pengeluaran operasional'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono tabular-nums font-bold text-primary-soft-foreground bg-primary-soft px-2.5 py-1 rounded-full border border-primary/25">
                  Rasio Beban: {cfoHealth.expenseRatio}%
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/reports')}
                  className="min-h-[34px] px-3 py-1 rounded-full bg-subsurface hover:bg-surface-hover hover:-translate-y-0.5 text-foreground border border-border text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98]"
                >
                  Export
                </button>
              </div>
            </div>

            <div className="py-4">
              {renderTrendChart()}
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
              <span>Rata-rata Omzet: <strong className="text-primary font-mono tabular-nums">{formatRupiah(cfoHealth.avgDailyOmzet)}/hari</strong></span>
              <span>
                Kas Bersih: <strong className={`font-mono tabular-nums ${
                  activeSection === 'CAFE' ? (segmentedExpenses.cafeNetProfit >= 0 ? 'text-success' : 'text-destructive')
                  : activeSection === 'CARWASH' ? (segmentedExpenses.carwashNetProfit >= 0 ? 'text-success' : 'text-destructive')
                  : (segmentedExpenses.holdingNetProfit >= 0 ? 'text-success' : 'text-destructive')
                }`}>
                  {formatRupiah(activeSection === 'CAFE' ? segmentedExpenses.cafeNetProfit : activeSection === 'CARWASH' ? segmentedExpenses.carwashNetProfit : segmentedExpenses.holdingNetProfit)}
                </strong>
              </span>
            </div>
          </div>

          {/* Chart 2: Revenue & Expense Breakdown by Source */}
          <div className="bg-surface border border-border hover:border-border-hover rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all duration-200 animate-slide-up delay-300">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {activeSection === 'CAFE' ? 'Struktur Beban & Penjualan Cafe' : activeSection === 'CARWASH' ? 'Struktur Beban & Layanan Carwash' : 'Struktur Beban & Pengeluaran Holding'}
                </h3>
                <p className="text-xs text-muted">
                  {activeSection === 'CAFE' ? 'Distribusi pengeluaran bahan baku, dapur & menu terlaris' : activeSection === 'CARWASH' ? 'Distribusi pengeluaran komisi, chemical & model mobil' : 'Rincian pengeluaran carwash, cafe & beban bersama'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="min-h-[34px] px-3 py-1 rounded-full bg-subsurface hover:bg-surface-hover hover:-translate-y-0.5 text-foreground border border-border text-xs font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98]"
              >
                Laporan Lengkap
              </button>
            </div>

            <div className="py-4 space-y-3.5" onMouseLeave={() => setHoveredBreakdownKey(null)}>
              {/* Interactive Stacked Composition Overview Bar */}
              <div className="space-y-2">
                <div
                  data-testid="breakdown-stacked-bar"
                  className="flex h-3.5 w-full rounded-full overflow-hidden bg-subsurface border border-border p-0.5 gap-0.5"
                >
                  {breakdownConfig.segments.map((seg) => (
                    <button
                      key={seg.key}
                      type="button"
                      data-testid={`breakdown-segment-${seg.key}`}
                      aria-label={`${seg.label}: ${formatRupiah(seg.amount)} (${seg.percent}%)`}
                      onMouseEnter={() => setHoveredBreakdownKey(seg.key)}
                      onFocus={() => setHoveredBreakdownKey(seg.key)}
                      onBlur={() => setHoveredBreakdownKey(null)}
                      onClick={() => setHoveredBreakdownKey(seg.key)}
                      style={{
                        width: breakdownConfig.allZero
                          ? `${100 / breakdownConfig.segments.length}%`
                          : `${Math.max(seg.sharePercent, seg.amount > 0 ? 4 : 0)}%`
                      }}
                      className={`h-full rounded-full ${seg.barClass} ${
                        breakdownConfig.allZero ? 'opacity-35 hover:opacity-80' : 'hover:brightness-110'
                      } ${
                        hoveredBreakdownKey && hoveredBreakdownKey !== seg.key ? 'opacity-45' : ''
                      } transition-all duration-200 cursor-pointer focus:outline-none`}
                    />
                  ))}
                </div>

                {/* Animated Live Numeric Hover Readout Strip */}
                <div
                  data-testid="breakdown-hover-tooltip"
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-subsurface border border-border flex flex-wrap items-center justify-between gap-2 text-xs transition-all duration-150"
                >
                  {activeBreakdownItem ? (
                    <div key={activeBreakdownItem.key} className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-1 animate-fade-in">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeBreakdownItem.dotClass}`} />
                        <span className="font-semibold text-foreground truncate">{activeBreakdownItem.label}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums text-[11px] shrink-0">
                        <span className={`font-bold ${activeBreakdownItem.textClass}`}>
                          {activeBreakdownItem.amountText || formatRupiah(activeBreakdownItem.amount)}
                        </span>
                        <span className="text-muted">({activeBreakdownItem.percent}%)</span>
                        <span className="hidden md:inline text-muted-dark font-sans">• {activeBreakdownItem.detail}</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-dark">
                      Arahkan kursor ke diagram batang atau baris divisi untuk melihat rincian nominal
                    </span>
                  )}
                </div>
              </div>

              {activeSection === 'ALL' && (
                <>
                  {/* Category 1: Pengeluaran Carwash */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('carwash')}
                    onClick={() => { setSelectedExpenseDivision('CARWASH'); setShowExpenseModal(true) }}
                    className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer group space-y-2 ${
                      hoveredBreakdownKey === 'carwash'
                        ? '-translate-y-0.5 bg-surface border-primary/40 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-border-hover'
                    }`}
                    title="Klik untuk rincian pengeluaran divisi carwash"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-primary transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                          Pengeluaran Divisi Carwash
                          <Eye size={12} className="text-primary opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-primary">{formatRupiah(segmentedExpenses.carwashExp)}</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">
                          ({segmentedExpenses.totalExpenses > 0 ? ((segmentedExpenses.carwashExp / segmentedExpenses.totalExpenses) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div
                        key={`ALL-cw-${timeRange}`}
                        className="bg-primary h-full rounded-full transition-all duration-500 animate-bar-grow"
                        style={{ width: `${segmentedExpenses.totalExpenses > 0 ? (segmentedExpenses.carwashExp / segmentedExpenses.totalExpenses) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Category 2: Pengeluaran Cafe */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('cafe')}
                    onClick={() => { setSelectedExpenseDivision('CAFE'); setShowExpenseModal(true) }}
                    className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer group space-y-2 ${
                      hoveredBreakdownKey === 'cafe'
                        ? '-translate-y-0.5 bg-surface border-warning/50 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-border-hover'
                    }`}
                    title="Klik untuk rincian pengeluaran divisi cafe"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-warning transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground group-hover:text-warning transition-colors flex items-center gap-1.5">
                          Pengeluaran Divisi Cafe
                          <Eye size={12} className="text-warning opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-warning">{formatRupiah(segmentedExpenses.cafeExp)}</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">
                          ({segmentedExpenses.totalExpenses > 0 ? ((segmentedExpenses.cafeExp / segmentedExpenses.totalExpenses) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div
                        key={`ALL-cafe-${timeRange}`}
                        className="bg-warning h-full rounded-full transition-all duration-500 animate-bar-grow"
                        style={{ width: `${segmentedExpenses.totalExpenses > 0 ? (segmentedExpenses.cafeExp / segmentedExpenses.totalExpenses) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Category 3: Pengeluaran Bersama (Shared Overhead) */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('shared')}
                    onClick={() => { setSelectedExpenseDivision('SHARED'); setShowExpenseModal(true) }}
                    className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer group space-y-2 ${
                      hoveredBreakdownKey === 'shared'
                        ? '-translate-y-0.5 bg-surface border-primary/40 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-border-hover'
                    }`}
                    title="Klik untuk rincian pengeluaran bersama / overhead"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-ink transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                          Pengeluaran Bersama (Gaji/Utilitas/Holding)
                          <Eye size={12} className="text-muted opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-foreground">{formatRupiah(segmentedExpenses.sharedExp)}</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">
                          ({segmentedExpenses.totalExpenses > 0 ? ((segmentedExpenses.sharedExp / segmentedExpenses.totalExpenses) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div
                        key={`ALL-shared-${timeRange}`}
                        className="bg-ink h-full rounded-full transition-all duration-500 animate-bar-grow"
                        style={{ width: `${segmentedExpenses.totalExpenses > 0 ? (segmentedExpenses.sharedExp / segmentedExpenses.totalExpenses) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </>
              )}

              {activeSection === 'CARWASH' && (
                <>
                  {/* Row 1: Pengeluaran Operasional Cuci */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('cw_exp')}
                    onClick={() => { setSelectedExpenseDivision('CARWASH'); setShowExpenseModal(true) }}
                    className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer group space-y-2 ${
                      hoveredBreakdownKey === 'cw_exp'
                        ? '-translate-y-0.5 bg-surface border-destructive/45 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-destructive/40'
                    }`}
                    title="Klik untuk rincian pengeluaran operasional & komisi cuci"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-destructive-solid transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground group-hover:text-destructive transition-colors flex items-center gap-1.5">
                          Beban Operasional &amp; Chemical Cuci
                          <Eye size={12} className="text-destructive opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-destructive">{formatRupiah(segmentedExpenses.carwashExp)}</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">
                          ({carwashAnalytics.totalRevenue > 0 ? ((segmentedExpenses.carwashExp / carwashAnalytics.totalRevenue) * 100).toFixed(1) : 0}% omzet)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div
                        key={`CW-exp-${timeRange}`}
                        className="bg-destructive-solid h-full rounded-full transition-all duration-500 animate-bar-grow"
                        style={{ width: `${Math.min(carwashAnalytics.totalRevenue > 0 ? (segmentedExpenses.carwashExp / carwashAnalytics.totalRevenue) * 100 : 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 2: Kas Bersih Carwash */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('cw_net')}
                    className={`p-3.5 rounded-xl border transition-all duration-150 group space-y-2 ${
                      hoveredBreakdownKey === 'cw_net'
                        ? '-translate-y-0.5 bg-surface border-success/45 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-border-hover'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-success transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground">Kas Bersih Divisi Carwash</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-success">{formatRupiah(segmentedExpenses.carwashNetProfit)}</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">({segmentedExpenses.carwashProfitMargin}% Margin)</span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div
                        key={`CW-net-${timeRange}`}
                        className="bg-success h-full rounded-full transition-all duration-500 animate-bar-grow"
                        style={{ width: `${Math.max(Math.min(parseFloat(segmentedExpenses.carwashProfitMargin) || 0, 100), 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 3: Cross-sell to cafe */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('cw_cross')}
                    className={`p-3.5 rounded-xl border transition-all duration-150 group space-y-2 ${
                      hoveredBreakdownKey === 'cw_cross'
                        ? '-translate-y-0.5 bg-surface border-warning/45 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-border-hover'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-warning transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground">Konversi Tambahan: Cross-Order ke Cafe</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-warning">{advancedKPIs.crossCount} Mobil</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">({advancedKPIs.crossConversionRate}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div key={`CW-cross-${timeRange}`} className="bg-warning h-full rounded-full transition-all duration-500 animate-bar-grow" style={{ width: `${Math.min(parseFloat(advancedKPIs.crossConversionRate) || 0, 100)}%` }} />
                    </div>
                  </div>
                </>
              )}

              {activeSection === 'CAFE' && (
                <>
                  {/* Row 1: Pengeluaran Bahan Baku & Operasional Cafe */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('cafe_exp')}
                    onClick={() => { setSelectedExpenseDivision('CAFE'); setShowExpenseModal(true) }}
                    className={`p-3.5 rounded-xl border transition-all duration-150 cursor-pointer group space-y-2 ${
                      hoveredBreakdownKey === 'cafe_exp'
                        ? '-translate-y-0.5 bg-surface border-destructive/45 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-destructive/40'
                    }`}
                    title="Klik untuk rincian pengeluaran bahan & operasional cafe"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-destructive-solid transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground group-hover:text-destructive transition-colors flex items-center gap-1.5">
                          Beban Bahan Baku &amp; Operasional F&amp;B
                          <Eye size={12} className="text-destructive opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-destructive">{formatRupiah(segmentedExpenses.cafeExp)}</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">
                          ({cafeAnalytics.totalRevenue > 0 ? ((segmentedExpenses.cafeExp / cafeAnalytics.totalRevenue) * 100).toFixed(1) : 0}% omzet)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div
                        key={`CAFE-exp-${timeRange}`}
                        className="bg-destructive-solid h-full rounded-full transition-all duration-500 animate-bar-grow"
                        style={{ width: `${Math.min(cafeAnalytics.totalRevenue > 0 ? (segmentedExpenses.cafeExp / cafeAnalytics.totalRevenue) * 100 : 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 2: Kas Bersih Cafe */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('cafe_net')}
                    className={`p-3.5 rounded-xl border transition-all duration-150 group space-y-2 ${
                      hoveredBreakdownKey === 'cafe_net'
                        ? '-translate-y-0.5 bg-surface border-success/45 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-border-hover'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-success transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground">Kas Bersih Divisi Cafe &amp; Resto</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-success">{formatRupiah(segmentedExpenses.cafeNetProfit)}</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">({segmentedExpenses.cafeProfitMargin}% Margin)</span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div
                        key={`CAFE-net-${timeRange}`}
                        className="bg-success h-full rounded-full transition-all duration-500 animate-bar-grow"
                        style={{ width: `${Math.max(Math.min(parseFloat(segmentedExpenses.cafeProfitMargin) || 0, 100), 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 3: Cafe Struk Count summary row */}
                  <div
                    onMouseEnter={() => setHoveredBreakdownKey('cafe_struk')}
                    className={`p-3.5 rounded-xl border transition-all duration-150 group space-y-2 ${
                      hoveredBreakdownKey === 'cafe_struk'
                        ? '-translate-y-0.5 bg-surface border-primary/45 shadow-xs'
                        : hoveredBreakdownKey
                          ? 'bg-subsurface border-border opacity-75'
                          : 'bg-subsurface border-border hover:border-border-hover'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-primary transition-transform duration-200 group-hover:scale-125"></span>
                        <span className="font-semibold text-foreground">Struk Pesanan F&amp;B Diterbitkan</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono tabular-nums font-bold text-foreground">{cafeAnalytics.cafeStrukCount} Struk</span>
                        <span className="text-[11px] text-muted ml-1.5 font-mono tabular-nums">(AOV: {formatRupiah(cafeAnalytics.cafeAOV)})</span>
                      </div>
                    </div>
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
                      <div key={`CAFE-struk-${timeRange}`} className="bg-primary h-full rounded-full transition-all duration-500 animate-bar-grow" style={{ width: '100%' }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
              <span>
                {activeSection === 'CAFE' ? 'Total Pengeluaran Cafe: ' : activeSection === 'CARWASH' ? 'Total Pengeluaran CW: ' : 'Total Pengeluaran Holding: '}
                <strong className="text-destructive font-mono tabular-nums">
                  {formatRupiah(activeSection === 'CAFE' ? segmentedExpenses.cafeExp : activeSection === 'CARWASH' ? segmentedExpenses.carwashExp : segmentedExpenses.totalExpenses)}
                </strong>
              </span>
              <span>
                Kas Bersih: <strong className={`font-mono tabular-nums ${
                  activeSection === 'CAFE' ? (segmentedExpenses.cafeNetProfit >= 0 ? 'text-success' : 'text-destructive')
                  : activeSection === 'CARWASH' ? (segmentedExpenses.carwashNetProfit >= 0 ? 'text-success' : 'text-destructive')
                  : (segmentedExpenses.holdingNetProfit >= 0 ? 'text-success' : 'text-destructive')
                }`}>
                  {formatRupiah(activeSection === 'CAFE' ? segmentedExpenses.cafeNetProfit : activeSection === 'CARWASH' ? segmentedExpenses.carwashNetProfit : segmentedExpenses.holdingNetProfit)}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Third Row - Two Column Layout (Recent Transactions & Top Products) */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 xl:grid-cols-2">
          {/* Column 1: Recent Transactions */}
          <div className="bg-surface border border-border hover:border-border-hover rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all duration-200 animate-slide-up delay-300">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Recent Transactions</h3>
                <p className="text-xs text-muted">Struk kasir &amp; pembayaran masuk terkini</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="min-h-[34px] px-3 py-1 rounded-full bg-subsurface hover:bg-surface-hover hover:-translate-y-0.5 text-foreground border border-border text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
              >
                <Eye size={13} className="text-primary" />
                View All
              </button>
            </div>

            <div className="py-4 space-y-3">
              {recentTransactionsList.length === 0 ? (
                <p className="text-xs text-muted-dark italic py-6 text-center">Belum ada transaksi pada periode ini.</p>
              ) : (
                recentTransactionsList.map((tx) => (
                  <div key={tx.id} className="group flex items-center p-3 rounded-xl bg-subsurface border border-border gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-primary/30 hover:shadow-xs">
                    <div className="w-9 h-9 rounded-full bg-primary-soft border border-primary/25 flex items-center justify-center text-xs font-bold text-primary-soft-foreground shrink-0 font-mono transition-transform duration-150 group-hover:scale-105">
                      {tx.customer.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-foreground truncate">{tx.customer.name}</p>
                        <span className="text-xs font-mono tabular-nums font-bold text-foreground shrink-0">{tx.amount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-[11px] text-muted truncate">{tx.customer.email}</p>
                        <span className="text-[10px] text-muted-dark font-mono tabular-nums shrink-0">{tx.date}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
              <span>Tercatat: <strong className="text-foreground font-mono tabular-nums">{filteredStrukByTime.length} transaksi</strong></span>
              <button type="button" onClick={() => navigate('/pos')} className="group text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer">
                Buka Layar Kasir <ArrowRight size={12} className="transition-transform duration-150 group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          {/* Column 2: Top Products & Services */}
          <div className="bg-surface border border-border hover:border-border-hover rounded-2xl p-5 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all duration-200 animate-slide-up delay-400">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Top Products &amp; Services</h3>
                <p className="text-xs text-muted">Item &amp; layanan paling diminati periode ini</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/database')}
                className="min-h-[34px] px-3 py-1 rounded-full bg-subsurface hover:bg-surface-hover hover:-translate-y-0.5 text-foreground border border-border text-xs font-semibold transition-all duration-150 flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
              >
                <Eye size={13} className="text-warning" />
                View All
              </button>
            </div>

            <div className="py-4 space-y-3">
              {topProductsList.length === 0 ? (
                <div className="py-8 text-center text-muted">
                  <p className="text-xs font-semibold text-foreground">Belum ada transaksi pada periode ini</p>
                  <p className="text-[11px] text-muted-dark mt-1">Data penjualan produk dan layanan akan muncul secara otomatis setelah transaksi POS dicatat.</p>
                </div>
              ) : (
                topProductsList.map((prod, idx) => (
                  <div key={prod.id || idx} className="group flex items-center p-3 rounded-xl bg-subsurface border border-border gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-primary/30 hover:shadow-xs">
                    <div className="w-8 h-8 rounded-lg bg-primary-soft text-primary-soft-foreground border border-primary/25 flex items-center justify-center text-xs font-bold font-mono tabular-nums shrink-0 transition-transform duration-150 group-hover:scale-105">
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{prod.name}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface border border-border text-muted shrink-0 font-medium">
                            {prod.category}
                          </span>
                        </div>
                        <span className="text-xs font-mono tabular-nums font-bold text-foreground shrink-0">{prod.revenue}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-1 text-[11px] text-muted">
                          <Star size={11} className="text-warning fill-warning" />
                          <span>{prod.rating}</span>
                          <span>•</span>
                          <span className="font-mono tabular-nums text-warning font-semibold">{prod.sales} order</span>
                        </div>
                        <span className="text-[10px] text-success font-semibold font-mono bg-success-bg px-2 py-0.5 rounded-full border border-success/30">
                          {prod.growth}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
              <span>Ranking Top Menu &amp; Layanan</span>
              <button type="button" onClick={() => navigate('/gudang')} className="group text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer">
                Kelola Stok Gudang <ArrowRight size={12} className="transition-transform duration-150 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>

        {/* Fourth Row - Customer Insights & Operational Tabs */}
        <div className="bg-surface border border-border hover:border-border-hover rounded-2xl p-5 shadow-xs hover:shadow-sm transition-all duration-200 space-y-5 animate-slide-up delay-400">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <h3 className="text-base font-bold text-foreground">Customer Insights &amp; Operations</h3>
              <p className="text-xs text-muted">Monitoring sinergi estafet, setoran kasir &amp; batas aman persediaan</p>
            </div>
            {/* Tabs List Navigation */}
            <div className="overflow-x-auto no-scrollbar max-w-full">
              <div className="flex bg-subsurface p-1 rounded-xl border border-border text-xs flex-nowrap">
                <button
                  type="button"
                  onClick={() => setActiveInsightTab('sinergi')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap active:scale-[0.98] ${
                    activeInsightTab === 'sinergi'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <TrendingUp size={13} strokeWidth={1.75} />
                  <span>Sinergi &amp; Utilisasi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInsightTab('rekap')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap active:scale-[0.98] ${
                    activeInsightTab === 'rekap'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <DollarSign size={13} strokeWidth={1.75} />
                  <span>Rekap Kasir &amp; Saldo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInsightTab('stok')}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap active:scale-[0.98] ${
                    activeInsightTab === 'stok'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  <AlertTriangle size={13} strokeWidth={1.75} />
                  <span>Peringatan Stok</span>
                </button>
              </div>
            </div>
          </div>

          {/* Tab Content 1: Sinergi & Utilisasi */}
          {activeInsightTab === 'sinergi' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-in">
              <div className="p-4 rounded-xl bg-subsurface border border-border space-y-1 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-primary/35 hover:shadow-xs">
                <span className="text-[10px] text-muted-dark uppercase font-bold tracking-wider">ARPU Gabungan</span>
                <p className="text-xl font-bold text-foreground font-mono tabular-nums">{formatRupiah(advancedKPIs.combinedARPU)}</p>
                <p className="text-[11px] text-primary font-medium">+12.5% dari target rata-rata</p>
              </div>
              <div className="p-4 rounded-xl bg-subsurface border border-border space-y-1 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-primary/35 hover:shadow-xs">
                <span className="text-[10px] text-muted-dark uppercase font-bold tracking-wider">Utilisasi Bay Cuci</span>
                <p className="text-xl font-bold text-primary font-mono tabular-nums">{advancedKPIs.capacityEfficiency}%</p>
                <p className="text-[11px] text-muted">Kapasitas target {targetCapacity} unit/hari</p>
              </div>
              <div className="p-4 rounded-xl bg-subsurface border border-border space-y-1 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-primary/35 hover:shadow-xs">
                <span className="text-[10px] text-muted-dark uppercase font-bold tracking-wider">Rata-rata Unit Cuci</span>
                <p className="text-xl font-bold text-foreground font-mono tabular-nums">{carwashAnalytics.avgCarsPerDay} mobil</p>
                <p className="text-[11px] text-warning font-medium">Volume kedatangan pelanggan</p>
              </div>
              <div className="p-4 rounded-xl bg-subsurface border border-border space-y-1 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-primary/35 hover:shadow-xs">
                <span className="text-[10px] text-muted-dark uppercase font-bold tracking-wider">Porsi Cafe Terjual</span>
                <p className="text-xl font-bold text-warning font-mono tabular-nums">{cafeAnalytics.totalItems} item</p>
                <p className="text-[11px] text-muted">Total pesanan dapur &amp; barista</p>
              </div>
            </div>
          )}

          {/* Tab Content 2: Rekap Kasir & Saldo */}
          {activeInsightTab === 'rekap' && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div className="p-3.5 rounded-xl bg-subsurface border border-border transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-success/35 hover:shadow-xs">
                  <span className="text-[10px] font-bold text-success uppercase tracking-wider block">Uang Fisik Kasir (Cash)</span>
                  <p className="text-lg font-bold text-success font-mono tabular-nums mt-1">{formatRupiah(dailyCashierRecap.totalCash)}</p>
                  <span className="text-[11px] text-muted">{dailyCashierRecap.cashPercentage}% total setoran</span>
                </div>
                <div className="p-3.5 rounded-xl bg-subsurface border border-border transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-primary/35 hover:shadow-xs">
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">QRIS &amp; Non-Tunai</span>
                  <p className="text-lg font-bold text-primary font-mono tabular-nums mt-1">{formatRupiah(dailyCashierRecap.totalNonCash)}</p>
                  <span className="text-[11px] text-muted">{dailyCashierRecap.nonCashPercentage}% digital payment</span>
                </div>
                <div className="p-3.5 rounded-xl bg-subsurface border border-border transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-primary/35 hover:shadow-xs">
                  <span className="text-[10px] font-bold text-foreground uppercase tracking-wider block">Total Bruto Kasir</span>
                  <p className="text-lg font-bold text-foreground font-mono tabular-nums mt-1">{formatRupiah(dailyCashierRecap.totalOmzet)}</p>
                  <span className="text-[11px] text-muted">{dailyCashierRecap.totalTxCount} transaksi hari ini</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-subsurface border border-border">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="font-semibold text-foreground">Posisi Saldo Buku Kas &amp; Rekening Terdaftar:</span>
                  <button type="button" onClick={() => navigate('/finance')} className="group text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer">
                    Buku Kas <ArrowRight size={12} className="transition-transform duration-150 group-hover:translate-x-1" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {posAccountList.length > 0 ? (
                    posAccountList.map((acc) => (
                      <div key={acc.id || acc.pos} className="p-2.5 rounded-lg bg-surface border border-border text-center transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xs">
                        <span className="text-[10px] text-muted uppercase block font-bold truncate" title={acc.label || acc.pos}>
                          {acc.label || acc.pos}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-foreground text-xs">
                          {formatRupiah(acc.current_balance ?? acc.balance ?? 0)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="p-2.5 rounded-lg bg-surface border border-border text-center transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xs">
                        <span className="text-[10px] text-muted uppercase block font-bold">Laci Kasir</span>
                        <span className="font-mono tabular-nums font-bold text-foreground text-xs">{formatRupiah(posBalances.cash)}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-surface border border-border text-center transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xs">
                        <span className="text-[10px] text-muted uppercase block font-bold">Rekening Utama</span>
                        <span className="font-mono tabular-nums font-bold text-foreground text-xs">{formatRupiah(posBalances.rekY)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 3: Peringatan Stok Kritis */}
          {activeInsightTab === 'stok' && (
            <div className="space-y-3 animate-fade-in">
              {criticalStockItems.length === 0 ? (
                <div className="p-4 rounded-xl bg-subsurface border border-border text-center text-xs text-muted flex items-center justify-center gap-2">
                  <CheckCircle size={16} strokeWidth={1.75} className="text-success" />
                  <span>Seluruh persediaan stok bahan baku &amp; chemical dalam batas aman.</span>
                </div>
              ) : (
                criticalStockItems.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-3 rounded-xl bg-subsurface border border-border gap-2 transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface hover:border-destructive/35 hover:shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-md bg-destructive-bg text-destructive border border-destructive/30 shrink-0">
                        <AlertTriangle size={14} />
                      </div>
                      <span className="font-medium text-foreground truncate">{item.nama_barang || item.nama_produk}</span>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-destructive bg-destructive-bg px-2.5 py-1 rounded-full border border-destructive/30 shrink-0">
                      Sisa: {item.stok} {item.satuan || 'unit'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal AI Prompt Builder */}
      <AIPromptBuilderModal
        isOpen={showAIPromptModal}
        onClose={() => setShowAIPromptModal(false)}
        dashboardData={{
          activeTenant,
          tenantBusinessType,
          timeRangeLabel: timeRange === 'today' ? 'Hari Ini' : timeRange === 'month' ? 'Bulan Ini' : timeRange === 'custom' ? 'Kustom' : 'Semua',
          overviewStats,
          financialAnalytics,
          cfoHealth,
          cafeAnalytics,
          carwashAnalytics,
          advancedKPIs,
          dailyCashierRecap,
          criticalStockItems,
          strukList: filteredStrukByTime,
          carwashList: filteredCarwashList,
          cafeList: filteredCafeList,
          cashflowLogs: filteredCashflowLogs,
          stokList,
          posAccountList,
          operatingDays
        }}
      />

      {/* Modal Rincian Pengeluaran Divisi & Holding */}
      <ExpenseDetailModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        division={selectedExpenseDivision}
        expenseData={{
          carwashExpenses: segmentedExpenses.carwashExpenses || [],
          cafeExpenses: segmentedExpenses.cafeExpenses || [],
          sharedExpenses: segmentedExpenses.sharedExpenses || [],
          carwashCommission: segmentedExpenses.carwashCommission || 0,
          carwashBahan: segmentedExpenses.carwashBahan || 0,
          carwashOperasional: segmentedExpenses.carwashOperasional || 0,
          cafeBahanBaku: segmentedExpenses.cafeBahanBaku || 0,
          cafeOperasional: segmentedExpenses.cafeOperasional || 0,
          bebanBersamaUtilitas: segmentedExpenses.bebanBersamaUtilitas || 0,
          bebanBersamaGaji: segmentedExpenses.bebanBersamaGaji || 0,
          bebanBersamaLain: segmentedExpenses.bebanBersamaLain || 0,
          totalCarwashExp: segmentedExpenses.carwashExp || 0,
          totalCafeExp: segmentedExpenses.cafeExp || 0,
          totalSharedExp: segmentedExpenses.sharedExp || 0,
          totalExpenses: segmentedExpenses.totalExpenses || 0
        }}
        timeRangeLabel={timeRange === 'today' ? 'Hari Ini' : timeRange === 'month' ? 'Bulan Ini' : timeRange === 'custom' ? 'Kustom' : 'Semua'}
      />

      {/* Wizard Konfigurasi Awal Toko (Muncul 1x untuk tenant dengan onboarding_completed === false) */}
      <OnboardingWizardModal
        isOpen={showStoreSetupWizard}
        onClose={() => setDismissedStoreSetup(true)}
        ownerUser={user}
        existingTenant={activeTenant}
        onCompleted={async () => {
          setDismissedStoreSetup(true)
          if (refreshTenants) await refreshTenants()
        }}
      />
    </div>
  )
}

export default Dashboard
