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
  MoreHorizontal
} from 'lucide-react'
import InteractiveCalendar from '../components/InteractiveCalendar'
import AIPromptBuilderModal from '../components/dashboard/AIPromptBuilderModal'
import ExecutivePromptStudio from '../components/dashboard/ExecutivePromptStudio'
import ExpenseDetailModal from '../components/dashboard/ExpenseDetailModal'
import { formatRupiah, parseDateSafe, calculateDailyCashierRecap } from '../utils/helpers'
import { isPindahSaldo } from '../utils/financeHelpers'

// Helper function to fetch all rows beyond Supabase's default 1000 row REST limit
const fetchAllRows = async (table, select = '*', dateColumn = null, start = null, end = null) => {
  let allData = []
  let from = 0
  const step = 1000
  while (true) {
    let query = supabase.from(table).select(select)
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

const fetchCafeRows = async (start = null, end = null) => {
  let allData = []
  let from = 0
  const step = 1000
  while (true) {
    let query = supabase.from('cafe').select('*, struk!inner(tanggal)')
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

const Dashboard = () => {
  const navigate = useNavigate()
  const { activeTenant } = useAuth()
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
  const [timeRange, setTimeRange] = useState('month') // 'today', 'month', 'custom', 'all'
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showCustomCalendar, setShowCustomCalendar] = useState(false)
  const [showAIPromptModal, setShowAIPromptModal] = useState(false)
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [selectedExpenseDivision, setSelectedExpenseDivision] = useState('CARWASH')
  const [activeInsightTab, setActiveInsightTab] = useState('sinergi') // 'sinergi', 'rekap', 'stok'
  const [errorMsg, setErrorMsg] = useState('')

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
        fetchAllRows('struk'),
        fetchAllRows('carwash'),
        fetchCafeRows(),
        fetchAllRows('cashflow'),
        fetchAllRows('stok_barang'),
        fetchAllRows('pengeluaran')
      ])

      const { data: dbBal, error: balErr } = await supabase
        .from('pos_balances')
        .select('*')

      if (balErr) throw balErr

      let cash = 0, rekY = 0, rekN = 0, rekR = 0
      if (dbBal) {
        dbBal.forEach(item => {
          const bal = parseFloat(item.balance) || 0
          if (item.pos === 'SALDO CASH') cash = bal
          else if (item.pos === 'SALDO REKENING Y') rekY = bal
          else if (item.pos === 'SALDO REKENING N') rekN = bal
          else if (item.pos === 'SALDO REKENING R') rekR = bal
        })
      }

      setStrukList(dbStruk || [])
      setCarwashList(dbCw || [])
      setCafeList(dbCafe || [])
      setCashflowLogs(dbCf || [])
      setStokList(dbStok || [])
      setPengeluaranList(dbExp || [])
      setPosBalances({ cash, rekY, rekN, rekR })
      setPosAccountList(dbBal || [])

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
    return list.filter(s => {
      const ket = String(s.keterangan || '').toLowerCase()
      const isTestOrBatal = ket.includes('kalibrasi') || ket.includes('test') || s.status_bayar === 'Batal'
      const isTukarUang = ket.includes('tukar uang') || ket.includes('tarik tunai') || ket.includes('tukar cash') || ket.includes('lebih qris')
      return !isTestOrBatal && !isTukarUang
    })
  }, [strukList, isDateInRange, timeRange])

  const filteredCarwashList = useMemo(() => {
    let list = carwashList
    if (timeRange !== 'all') {
      list = carwashList.filter(cw => isDateInRange(cw.tanggal))
    }
    return list.filter(cw => {
      const parentStruk = strukMap.get(cw.id_struk)
      if (parentStruk) {
        const ket = String(parentStruk.keterangan || '').toLowerCase()
        if (ket.includes('kalibrasi') || ket.includes('test') || parentStruk.status_bayar === 'Batal') {
          return false
        }
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
      if (parentStruk) {
        const ket = String(parentStruk.keterangan || '').toLowerCase()
        if (ket.includes('kalibrasi') || ket.includes('test') || parentStruk.status_bayar === 'Batal') {
          return false
        }
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
    const totalRevenue = filteredStrukByTime.reduce((sum, item) => sum + parseFloat(item.total_tagihan || 0), 0)
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
      processedExpIds.add(exp.id_pengeluaran)
      const nom = parseFloat(exp.nominal || exp.total_harga || 0)
      if (nom <= 0) return

      const jenis = String(exp.jenis || '').toLowerCase()
      const kat = String(exp.kategori || '').toLowerCase()
      const ket = String(exp.nama_pengeluaran || exp.keterangan || '').toLowerCase()

      const itemObj = {
        id: exp.id_pengeluaran || `exp-${exp.id}`,
        tanggal: exp.tanggal || '',
        kategori: exp.kategori || (jenis.includes('cafe') ? 'Bahan Cafe' : jenis.includes('carwash') ? 'Chemical Cuci' : 'Operasional'),
        keterangan: exp.nama_pengeluaran || exp.keterangan || 'Pengeluaran Kasir',
        akun: exp.akun_sumber || exp.pos || 'Laci Kasir',
        nominal: nom
      }

      if (jenis.includes('cafe')) {
        itemObj.divisi = 'CAFE'
        cafeExpenseItems.push(itemObj)
        if (kat.includes('bahan') || kat.includes('kulakan') || ket.includes('biji kopi') || ket.includes('susu') || ket.includes('sirup')) {
          cafeBahanBaku += nom
        } else {
          cafeOperasional += nom
        }
      } else if (jenis.includes('carwash')) {
        itemObj.divisi = 'CARWASH'
        carwashExpenseItems.push(itemObj)
        if (kat.includes('bahan') || kat.includes('chemical') || ket.includes('shampoo') || kat.includes('sabun') || ket.includes('semir')) {
          carwashBahan += nom
        } else {
          carwashOperasional += nom
        }
      } else {
        itemObj.divisi = 'SHARED'
        sharedExpenseItems.push(itemObj)
        // Beban Bersama / Overhead
        if (kat.includes('gaji') || kat.includes('casbon') || jenis.includes('casbon') || ket.includes('gaji') || ket.includes('casbon')) {
          bebanBersamaGaji += nom
        } else if (kat.includes('listrik') || kat.includes('air') || kat.includes('pdam') || kat.includes('wifi') || kat.includes('utilitas') || ket.includes('listrik') || ket.includes('air')) {
          bebanBersamaUtilitas += nom
        } else {
          bebanBersamaLain += nom
        }
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
        id: c.id_cashflow || `cf-${c.id || idx}`,
        tanggal: c.tanggal || '',
        kategori: c.kategori || 'Beban Kas',
        keterangan: c.keterangan_transaksi || c.keterangan || 'Log Pengeluaran',
        akun: c.pos || 'Kasir',
        nominal: nom
      }

      if (jenis.includes('cafe')) {
        itemObj.divisi = 'CAFE'
        cafeExpenseItems.push(itemObj)
        if (kat.includes('bahan') || kat.includes('kulakan')) cafeBahanBaku += nom
        else cafeOperasional += nom
      } else if (jenis.includes('carwash')) {
        itemObj.divisi = 'CARWASH'
        carwashExpenseItems.push(itemObj)
        if (kat.includes('bahan') || kat.includes('chemical')) carwashBahan += nom
        else carwashOperasional += nom
      } else {
        itemObj.divisi = 'SHARED'
        sharedExpenseItems.push(itemObj)
        if (ket.includes('casbon') || kat.includes('casbon') || ket.includes('gaji')) bebanBersamaGaji += nom
        else if (ket.includes('listrik') || kat.includes('air') || kat.includes('wifi')) bebanBersamaUtilitas += nom
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

    const carwashProfitMargin = carwashAnalytics.totalRevenue > 0 ? ((carwashNetProfit / carwashAnalytics.totalRevenue) * 100).toFixed(1) : '0.0'
    const cafeProfitMargin = cafeAnalytics.totalRevenue > 0 ? ((cafeNetProfit / cafeAnalytics.totalRevenue) * 100).toFixed(1) : '0.0'
    const holdingProfitMargin = overviewStats.totalRevenue > 0 ? ((holdingNetProfit / overviewStats.totalRevenue) * 100).toFixed(1) : '0.0'

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

    return {
      totalExpenses: segmentedExpenses.totalExpenses,
      trendData
    }
  }, [filteredStrukByTime, filteredCarwashList, filteredCafeList, filteredPengeluaranList, filteredCashflowLogs, strukMap, segmentedExpenses.totalExpenses])

  // CFO Health & Expense Ratio
  const cfoHealth = useMemo(() => {
    const expenseRatio = overviewStats.totalRevenue > 0
      ? ((segmentedExpenses.totalExpenses / overviewStats.totalRevenue) * 100).toFixed(1)
      : '0.0'
    const avgDailyOmzet = operatingDays > 0
      ? Math.round(overviewStats.totalRevenue / operatingDays)
      : 0
    return {
      expenseRatio,
      avgDailyOmzet
    }
  }, [overviewStats.totalRevenue, segmentedExpenses.totalExpenses, operatingDays])

  // Daily Cashier Recap (Cash vs QRIS / Non-Tunai)
  const todayDateStr = useMemo(() => new Date().toLocaleDateString('en-CA'), [])
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
      if (activeSection === 'CAFE') {
        return [
          { id: 1, name: 'Kopi Susu Aren Gula Aren', category: 'Cafe F&B', sales: 289, revenue: 'Rp 6.358.000', growth: '+15%', rating: 4.8, stock: 65 },
          { id: 2, name: 'Matcha Latte Iced', category: 'Cafe F&B', sales: 142, revenue: 'Rp 3.976.000', growth: '+14%', rating: 4.6, stock: 42 },
          { id: 3, name: 'French Fries Crispy', category: 'Cafe Snack', sales: 110, revenue: 'Rp 2.200.000', growth: '+8%', rating: 4.7, stock: 30 }
        ]
      }
      if (activeSection === 'CARWASH') {
        return [
          { id: 1, name: 'Paket Cuci Snow Carwash', category: 'Carwash', sales: 342, revenue: 'Rp 15.390.000', growth: '+23%', rating: 4.9, stock: 100 },
          { id: 2, name: 'Cuci Hidrolik + Wax', category: 'Carwash', sales: 198, revenue: 'Rp 11.880.000', growth: '+9%', rating: 4.7, stock: 100 },
          { id: 3, name: 'Detailing Interior Mobil', category: 'Detailing', sales: 45, revenue: 'Rp 6.750.000', growth: '+11%', rating: 4.9, stock: 100 }
        ]
      }
      return [
        { id: 1, name: 'Paket Cuci Snow Carwash', category: 'Carwash', sales: 342, revenue: 'Rp 15.390.000', growth: '+23%', rating: 4.9, stock: 100 },
        { id: 2, name: 'Kopi Susu Aren Gula Aren', category: 'Cafe F&B', sales: 289, revenue: 'Rp 6.358.000', growth: '+15%', rating: 4.8, stock: 65 },
        { id: 3, name: 'Cuci Hidrolik + Wax', category: 'Carwash', sales: 198, revenue: 'Rp 11.880.000', growth: '+9%', rating: 4.7, stock: 100 },
        { id: 4, name: 'Matcha Latte Iced', category: 'Cafe F&B', sales: 142, revenue: 'Rp 3.976.000', growth: '+14%', rating: 4.6, stock: 42 }
      ]
    }
    return combined.sort((a, b) => b.sales - a.sales).slice(0, 5)
  }, [activeSection, cafeAnalytics.topMenus, carwashAnalytics.topModels, carwashAnalytics.carwashAOV])

  // Custom SVG Trend Line Chart
  const renderTrendChart = () => {
    const data = financialAnalytics.trendData
    if (!data || data.length === 0) {
      return (
        <div className="h-44 flex items-center justify-center text-slate-600 text-xs font-semibold">
          Belum ada riwayat transaksi pada rentang waktu ini.
        </div>
      )
    }

    const trendKey = activeSection === 'CAFE' ? 'cafeOmzet' : activeSection === 'CARWASH' ? 'carwashOmzet' : 'omzet'
    const trendLabel = activeSection === 'CAFE' ? 'Omzet Penjualan Cafe' : activeSection === 'CARWASH' ? 'Omzet Layanan Carwash' : 'Omzet Penjualan Holding'
    const lineColor = activeSection === 'CAFE' ? '#ffc71f' : '#00ffff'

    const maxVal = Math.max(...data.map(d => Math.max(d[trendKey] || 0, d.pengeluaran)), 100000)
    const svgWidth = 600
    const svgHeight = 180
    const padding = 28

    const pointsOmzet = data.map((d, i) => {
      const x = padding + (i / Math.max(data.length - 1, 1)) * (svgWidth - padding * 2)
      const y = svgHeight - padding - ((d[trendKey] || 0) / maxVal) * (svgHeight - padding * 2)
      return `${x},${y}`
    }).join(' ')

    const pointsExp = data.map((d, i) => {
      const x = padding + (i / Math.max(data.length - 1, 1)) * (svgWidth - padding * 2)
      const y = svgHeight - padding - (d.pengeluaran / maxVal) * (svgHeight - padding * 2)
      return `${x},${y}`
    }).join(' ')

    const firstX = padding
    const lastX = padding + (Math.max(data.length - 1, 1) / Math.max(data.length - 1, 1)) * (svgWidth - padding * 2)
    const areaPointsOmzet = `${firstX},${svgHeight - padding} ${pointsOmzet} ${lastX},${svgHeight - padding}`

    return (
      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-44 overflow-visible">
            <defs>
              <linearGradient id="omzetAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="#26272d" strokeDasharray="3 3" opacity="0.6" />
            <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="#26272d" strokeDasharray="3 3" opacity="0.6" />
            <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="#26272d" strokeWidth="1" />

            {/* Translucent Area Gradient */}
            <polygon
              fill="url(#omzetAreaGrad)"
              points={areaPointsOmzet}
            />

            {/* Omzet Curve */}
            <polyline
              fill="none"
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsOmzet}
            />

            {/* Expense Curve */}
            <polyline
              fill="none"
              stroke="#ff5102"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsExp}
            />

            {data.map((d, i) => {
              const labelInterval = Math.max(Math.ceil(data.length / 8), 1)
              const showLabel = i % labelInterval === 0 || i === data.length - 1
              const x = padding + (i / Math.max(data.length - 1, 1)) * (svgWidth - padding * 2)
              const valOmzet = d[trendKey] || 0
              const yOmzet = svgHeight - padding - (valOmzet / maxVal) * (svgHeight - padding * 2)
              const yExp = svgHeight - padding - (d.pengeluaran / maxVal) * (svgHeight - padding * 2)
              const tooltipY = Math.max(5, Math.min(yOmzet, yExp) - 42)
              const dateLabel = d.date ? d.date.substring(5) : ''

              return (
                <g key={i} className="group cursor-pointer">
                  <rect x={x - 8} y={Math.min(yOmzet, yExp) - 8} width="16" height={Math.abs(yOmzet - yExp) + 16} fill="transparent" />
                  <circle cx={x} cy={yOmzet} r="4" fill={lineColor} className="transition-all group-hover:r-6" />
                  <circle cx={x} cy={yExp} r="3.5" fill="#ff5102" className="transition-all group-hover:r-5" />
                  <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <rect x={x - 55} y={tooltipY} width="110" height="34" rx="4" fill="#121215" stroke="#26272d" strokeWidth="1" />
                    <text x={x} y={tooltipY + 12} fontSize="9" fill={lineColor} fontWeight="bold" textAnchor="middle">
                      {formatRupiah(valOmzet)}
                    </text>
                    <text x={x} y={tooltipY + 26} fontSize="9" fill="#ff5102" fontWeight="bold" textAnchor="middle">
                      {formatRupiah(d.pengeluaran)}
                    </text>
                  </g>
                  {showLabel && (
                    <text x={x} y={svgHeight - 8} fontSize="9" fill="#bbcbb2" textAnchor="middle" className="font-mono">
                      {dateLabel}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>

          <div className="flex justify-center items-center gap-6 mt-3 text-xs font-semibold">
            <span className="flex items-center gap-2" style={{ color: lineColor }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lineColor }}></span>
              {trendLabel}
            </span>
            <span className="flex items-center gap-2 text-[#ff5102]">
              <span className="w-3 h-0.5 border-t-2 border-dashed border-[#ff5102]"></span>
              Pengeluaran Operasional
            </span>
          </div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-5 pb-24 md:pb-8 space-y-4 max-w-7xl mx-auto bg-[#000000]">
      {/* Top Header & Context Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-[#26272d] pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#18181c] border border-[#26272d] flex items-center justify-center text-[#00ffff] shadow-xs shrink-0">
            <BarChart3 size={20} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
              Ikhtisar Performa Bisnis
            </h1>
            <p className="text-[#bbcbb2] text-xs mt-0.5 truncate">Monitoring operasional kasir, omzet & likuiditas multi-divisi</p>
          </div>
        </div>

        {/* Right Header Controls: Time Filter + AI Button + Refresh */}
        <div className="flex items-center gap-2 flex-wrap w-full xl:w-auto justify-start xl:justify-end">
          {/* Time Range Filter */}
          <div className="relative flex bg-[#18181c] p-0.5 rounded-lg border border-[#26272d] text-xs">
            <button
              onClick={() => { setTimeRange('today'); setShowCustomCalendar(false) }}
              className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer active:scale-[0.98] ${timeRange === 'today' ? 'bg-[#00ffff] text-[#121215] shadow-xs' : 'text-[#bbcbb2] hover:text-white'}`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => { setTimeRange('month'); setShowCustomCalendar(false) }}
              className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer active:scale-[0.98] ${timeRange === 'month' ? 'bg-[#00ffff] text-[#121215] shadow-xs' : 'text-[#bbcbb2] hover:text-white'}`}
            >
              Bulan Ini
            </button>
            <button
              onClick={() => { setTimeRange('custom'); setShowCustomCalendar(!showCustomCalendar) }}
              className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer active:scale-[0.98] ${timeRange === 'custom' ? 'bg-[#00ffff] text-[#121215] shadow-xs' : 'text-[#bbcbb2] hover:text-white'}`}
            >
              Kustom
            </button>
            <button
              onClick={() => { setTimeRange('all'); setShowCustomCalendar(false) }}
              className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer active:scale-[0.98] ${timeRange === 'all' ? 'bg-[#00ffff] text-[#121215] shadow-xs' : 'text-[#bbcbb2] hover:text-white'}`}
            >
              Semua
            </button>

            {timeRange === 'custom' && showCustomCalendar && (
              <div className="absolute right-0 top-full mt-2 z-50">
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

          {/* AI Executive Intelligence Button */}
          <button
            onClick={() => {
              const el = document.getElementById('ai-prompt-studio')
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' })
              } else {
                setShowAIPromptModal(true)
              }
            }}
            className="px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 text-[#00ffff] bg-[#00ffff]/15 hover:bg-[#00ffff]/25 border border-[#00ffff]/40 text-xs cursor-pointer active:scale-[0.98] shadow-xs shrink-0"
            title="Buka Asisten Analisis Bisnis"
          >
            <Bot size={14} strokeWidth={2} />
            <span>Asisten Analitik</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchAllAnalyticsData}
            disabled={loading}
            className="p-2 bg-[#18181c] hover:bg-[#242428] border border-[#26272d] text-[#bbcbb2] hover:text-white rounded-lg transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 shrink-0"
            title="Refresh Data"
          >
            <RefreshCw size={15} strokeWidth={1.75} className={loading ? 'animate-spin text-[#00ffff]' : ''} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-[#ff5102]/10 border border-[#ff5102]/30 text-[#ff5102] text-xs flex items-center gap-2">
          <AlertTriangle size={15} strokeWidth={1.75} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Sektor Usaha & Aksi Cepat Navigation Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#121215] p-2.5 sm:p-3 rounded-xl border border-[#26272d]">
        {/* Sektor Usaha Switcher */}
        <div className="overflow-x-auto no-scrollbar max-w-full">
          {tenantBusinessType === 'HYBRID' ? (
            <div className="flex items-center gap-1 bg-[#18181c] p-0.5 rounded-lg border border-[#26272d] text-xs shrink-0 flex-nowrap">
              <button
                type="button"
                onClick={() => setActiveSection('ALL')}
                className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                  activeSection === 'ALL'
                    ? 'bg-[#00ffff] text-[#121215] shadow-xs'
                    : 'text-[#bbcbb2] hover:text-white hover:bg-[#242428]'
                }`}
              >
                <Store size={13} strokeWidth={1.75} />
                <span>Sinergi Holding</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('CAFE')}
                className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                  activeSection === 'CAFE'
                    ? 'bg-[#ffc71f] text-[#121215] shadow-xs'
                    : 'text-[#bbcbb2] hover:text-white hover:bg-[#242428]'
                }`}
              >
                <Coffee size={13} strokeWidth={1.75} />
                <span>Divisi Cafe</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('CARWASH')}
                className={`px-3 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-[0.98] ${
                  activeSection === 'CARWASH'
                    ? 'bg-[#00ffff] text-[#121215] shadow-xs'
                    : 'text-[#bbcbb2] hover:text-white hover:bg-[#242428]'
                }`}
              >
                <Car size={13} strokeWidth={1.75} />
                <span>Divisi Carwash</span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-bold text-white flex items-center gap-1.5 px-2 py-1">
              {tenantBusinessType === 'CAFE' ? (
                <>
                  <Coffee size={15} strokeWidth={1.75} className="text-[#ffc71f]" />
                  <span>Operasional Cafe & Resto</span>
                </>
              ) : (
                <>
                  <Car size={15} strokeWidth={1.75} className="text-[#00ffff]" />
                  <span>Operasional Carwash & Detailing</span>
                </>
              )}
            </span>
          )}
        </div>

        {/* Quick Navigation Links */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full flex-nowrap shrink-0">
          <button
            onClick={() => navigate('/pos')}
            className="px-2.5 py-1.5 rounded-lg bg-[#18181c] hover:bg-[#242428] text-[#ffc71f] border border-[#26272d] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] whitespace-nowrap"
          >
            <Coffee size={13} strokeWidth={1.75} />
            <span>Kasir POS</span>
          </button>
          {activeSection !== 'CAFE' && (
            <button
              onClick={() => navigate('/queue')}
              className="px-2.5 py-1.5 rounded-lg bg-[#18181c] hover:bg-[#242428] text-[#00ffff] border border-[#26272d] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] whitespace-nowrap"
            >
              <Car size={13} strokeWidth={1.75} />
              <span>Antrean</span>
            </button>
          )}
          <button
            onClick={() => navigate('/finance')}
            className="px-2.5 py-1.5 rounded-lg bg-[#18181c] hover:bg-[#242428] text-white border border-[#26272d] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] whitespace-nowrap"
          >
            <DollarSign size={13} strokeWidth={1.75} className="text-[#00ffff]" />
            <span>Buku Kas</span>
          </button>
          <button
            onClick={() => navigate('/reports')}
            className="px-2.5 py-1.5 rounded-lg bg-[#18181c] hover:bg-[#242428] text-white border border-[#26272d] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-[0.98] whitespace-nowrap"
          >
            <FileText size={13} strokeWidth={1.75} className="text-[#ff5102]" />
            <span>Laporan</span>
          </button>
        </div>
      </div>

      {/* Main Dashboard Grid: shadcn dashboard-2 style */}
      <div className="space-y-6">
        {/* Top Row - Key Metrics (4 Bento Cards) */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {/* Mode ALL (Sinergi Holding) */}
          {activeSection === 'ALL' && (
            <>
              {/* Metric 1: Total Revenue Holding */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-[#bbcbb2]">Total Revenue Holding</p>
                    <h3 className="text-2xl font-bold text-white mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(overviewStats.totalRevenue)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30 font-mono">
                    <TrendingUp size={12} strokeWidth={2} />
                    +12.4%
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Trending up this month <TrendingUp size={13} className="text-[#00ffff]" />
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    CW: {formatRupiah(carwashAnalytics.totalRevenue)} • Cafe: {formatRupiah(cafeAnalytics.totalRevenue)}
                  </p>
                </div>
              </div>

              {/* Metric 2: Total Pengeluaran Konsolidasi */}
              <div
                onClick={() => { setSelectedExpenseDivision('ALL'); setShowExpenseModal(true) }}
                className="bg-[#121215] border border-[#26272d] hover:border-[#ff5102]/50 rounded-xl p-5 flex flex-col justify-between transition-all shadow-xs group cursor-pointer"
                title="Klik untuk melihat rincian seluruh pengeluaran holding"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-[#bbcbb2]">Total Pengeluaran Holding</p>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#ff5102]/10 text-[#ff5102] font-semibold flex items-center gap-0.5">
                        <Eye size={10} />
                        Detail
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-[#ff5102] mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(segmentedExpenses.totalExpenses)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30 font-mono">
                    <TrendingDown size={12} strokeWidth={2} />
                    {cfoHealth.expenseRatio}% Beban
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Beban Divisi & Operasional <ArrowRight size={13} className="text-[#ff5102] group-hover:translate-x-0.5 transition-transform" />
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate" title={`CW: ${formatRupiah(segmentedExpenses.carwashExp)} • Cafe: ${formatRupiah(segmentedExpenses.cafeExp)} • Bersama: ${formatRupiah(segmentedExpenses.sharedExp)}`}>
                    CW: {formatRupiah(segmentedExpenses.carwashExp)} • Cafe: {formatRupiah(segmentedExpenses.cafeExp)} • Bersama: {formatRupiah(segmentedExpenses.sharedExp)}
                  </p>
                </div>
              </div>

              {/* Metric 3: Kas Bersih (Net Profit) Holding */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-[#bbcbb2]">Kas Bersih Holding (Net Profit)</p>
                    <h3 className={`text-2xl font-bold mt-1 font-mono tabular-nums tracking-tight ${segmentedExpenses.holdingNetProfit >= 0 ? 'text-[#00ffff]' : 'text-[#ff5102]'}`}>
                      {formatRupiah(segmentedExpenses.holdingNetProfit)}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md font-mono ${
                    segmentedExpenses.holdingNetProfit >= 0 ? 'bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30' : 'bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30'
                  }`}>
                    {segmentedExpenses.holdingNetProfit >= 0 ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
                    {segmentedExpenses.holdingProfitMargin}% Margin
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Likuiditas Sehat & Terjaga <CheckCircle size={13} className="text-[#00ffff]" />
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    Omzet dikurangi beban CW, Cafe & bersama
                  </p>
                </div>
              </div>

              {/* Metric 4: Conversion Rate & Likuiditas Kas */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-[#bbcbb2]">Sinergi Estafet & Kas</p>
                    <h3 className="text-2xl font-bold text-white mt-1 font-mono tabular-nums tracking-tight">
                      {advancedKPIs.crossConversionRate}% <span className="text-xs text-[#bbcbb2] font-normal font-sans">Estafet</span>
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#f57733]/15 text-[#f57733] border border-[#f57733]/30 font-mono">
                    <Store size={12} strokeWidth={2} />
                    {advancedKPIs.crossCount} Pesanan
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Total Kas Aktif: <strong className="text-[#00ffff] font-mono">{formatRupiah(overviewStats.totalLiquid)}</strong>
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    {filteredStrukByTime.length} struk • AOV: {formatRupiah(advancedKPIs.combinedARPU)}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Mode CARWASH (Divisi Carwash & Detailing) */}
          {activeSection === 'CARWASH' && (
            <>
              {/* CW Card 1: Omzet Divisi Carwash */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-[#bbcbb2]">Omzet Divisi Carwash</p>
                    <h3 className="text-2xl font-bold text-[#00ffff] mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(carwashAnalytics.totalRevenue)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30 font-mono">
                    <Car size={12} strokeWidth={2} />
                    {overviewStats.totalRevenue > 0 ? ((carwashAnalytics.totalRevenue / overviewStats.totalRevenue) * 100).toFixed(0) : 0}% Holding
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Rata-rata: {formatRupiah(Math.round(carwashAnalytics.totalRevenue / operatingDays))}/hari
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    {carwashAnalytics.totalUnits} unit dicuci • AOV: {formatRupiah(carwashAnalytics.carwashAOV)}
                  </p>
                </div>
              </div>

              {/* CW Card 2: Total Pengeluaran Carwash */}
              <div
                onClick={() => { setSelectedExpenseDivision('CARWASH'); setShowExpenseModal(true) }}
                className="bg-[#121215] border border-[#26272d] hover:border-[#00ffff]/50 rounded-xl p-5 flex flex-col justify-between transition-all shadow-xs group cursor-pointer"
                title="Klik untuk melihat rincian pengeluaran divisi carwash"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-[#bbcbb2]">Pengeluaran Carwash</p>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#00ffff]/10 text-[#00ffff] font-semibold flex items-center gap-0.5">
                        <Eye size={10} />
                        Detail
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-[#ff5102] mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(segmentedExpenses.carwashExp)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30 font-mono">
                    <TrendingDown size={12} strokeWidth={2} />
                    Beban Cuci
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Chemical, Operasional & Komisi <ArrowRight size={13} className="text-[#00ffff] group-hover:translate-x-0.5 transition-transform" />
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    Komisi kru: {formatRupiah(segmentedExpenses.carwashCommission)} • Bahan & utilitas
                  </p>
                </div>
              </div>

              {/* CW Card 3: Kas Bersih Carwash (Net Profit) */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-[#bbcbb2]">Kas Bersih Carwash</p>
                    <h3 className={`text-2xl font-bold mt-1 font-mono tabular-nums tracking-tight ${segmentedExpenses.carwashNetProfit >= 0 ? 'text-[#00ffff]' : 'text-[#ff5102]'}`}>
                      {formatRupiah(segmentedExpenses.carwashNetProfit)}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md font-mono ${
                    segmentedExpenses.carwashNetProfit >= 0 ? 'bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30' : 'bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30'
                  }`}>
                    {segmentedExpenses.carwashNetProfit >= 0 ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
                    {segmentedExpenses.carwashProfitMargin}% Margin
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Laba Bersih Operasional Cuci <CheckCircle size={13} className="text-[#00ffff]" />
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    Omzet carwash dikurangi beban operasional cuci
                  </p>
                </div>
              </div>

              {/* CW Card 4: Volume & Utilisasi Bay */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-[#bbcbb2]">Utilisasi Bay Cuci</p>
                    <h3 className="text-2xl font-bold text-[#00ffff] mt-1 font-mono tabular-nums tracking-tight">
                      {advancedKPIs.capacityEfficiency}%
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#f57733]/15 text-[#f57733] border border-[#f57733]/30 font-mono">
                    <Layers size={12} strokeWidth={2} />
                    Target {targetCapacity}/Hari
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Cross-Sell Cafe: {advancedKPIs.crossConversionRate}% <TrendingUp size={13} className="text-[#f57733]" />
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
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
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-[#bbcbb2]">Omzet Divisi Cafe & Resto</p>
                    <h3 className="text-2xl font-bold text-[#ffc71f] mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(cafeAnalytics.totalRevenue)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#ffc71f]/15 text-[#ffc71f] border border-[#ffc71f]/30 font-mono">
                    <Coffee size={12} strokeWidth={2} />
                    {overviewStats.totalRevenue > 0 ? ((cafeAnalytics.totalRevenue / overviewStats.totalRevenue) * 100).toFixed(0) : 0}% Holding
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Rata-rata: {formatRupiah(Math.round(cafeAnalytics.totalRevenue / operatingDays))}/hari
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    {cafeAnalytics.totalItems} porsi • {cafeAnalytics.cafeStrukCount} struk pesanan F&B
                  </p>
                </div>
              </div>

              {/* Cafe Card 2: Total Pengeluaran Cafe */}
              <div
                onClick={() => { setSelectedExpenseDivision('CAFE'); setShowExpenseModal(true) }}
                className="bg-[#121215] border border-[#26272d] hover:border-[#ffc71f]/50 rounded-xl p-5 flex flex-col justify-between transition-all shadow-xs group cursor-pointer"
                title="Klik untuk melihat rincian pengeluaran divisi cafe & resto"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-[#bbcbb2]">Pengeluaran Cafe & Resto</p>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#ffc71f]/10 text-[#ffc71f] font-semibold flex items-center gap-0.5">
                        <Eye size={10} />
                        Detail
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-[#ff5102] mt-1 font-mono tabular-nums tracking-tight">
                      {formatRupiah(segmentedExpenses.cafeExp)}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30 font-mono">
                    <TrendingDown size={12} strokeWidth={2} />
                    Beban F&B
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Bahan Baku & Dapur <ArrowRight size={13} className="text-[#ffc71f] group-hover:translate-x-0.5 transition-transform" />
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    Kulakan kopi, susu, sirup, kemasan & gas dapur
                  </p>
                </div>
              </div>

              {/* Cafe Card 3: Kas Bersih Cafe (Net Profit) */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-[#bbcbb2]">Kas Bersih Cafe</p>
                    <h3 className={`text-2xl font-bold mt-1 font-mono tabular-nums tracking-tight ${segmentedExpenses.cafeNetProfit >= 0 ? 'text-[#ffc71f]' : 'text-[#ff5102]'}`}>
                      {formatRupiah(segmentedExpenses.cafeNetProfit)}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md font-mono ${
                    segmentedExpenses.cafeNetProfit >= 0 ? 'bg-[#ffc71f]/15 text-[#ffc71f] border border-[#ffc71f]/30' : 'bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30'
                  }`}>
                    {segmentedExpenses.cafeNetProfit >= 0 ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
                    {segmentedExpenses.cafeProfitMargin}% Margin
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1">
                    Laba Bersih Operasional F&B <CheckCircle size={13} className="text-[#ffc71f]" />
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    Omzet F&B dikurangi beban bahan & dapur
                  </p>
                </div>
              </div>

              {/* Cafe Card 4: Top Seller Menu & AOV */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-medium text-[#bbcbb2]">Menu Terlaris (Champion)</p>
                    <h3 className="text-lg font-bold text-[#ffc71f] mt-1 tracking-tight truncate" title={cafeAnalytics.topMenus[0]?.nama || 'Kopi / Minuman'}>
                      {cafeAnalytics.topMenus[0]?.nama || 'Menu Favorit'}
                    </h3>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#ffc71f]/15 text-[#ffc71f] border border-[#ffc71f]/30 font-mono shrink-0">
                    <Star size={12} strokeWidth={2} className="fill-[#ffc71f]" />
                    {cafeAnalytics.topMenus[0]?.qty || 0} Porsi
                  </span>
                </div>
                <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
                  <p className="font-semibold text-white flex items-center gap-1 truncate">
                    AOV: <strong className="font-mono text-white">{formatRupiah(cafeAnalytics.cafeAOV)}</strong> • {formatRupiah(cafeAnalytics.topMenus[0]?.revenue || 0)}
                  </p>
                  <p className="text-[11px] text-[#bbcbb2] mt-0.5 truncate">
                    Item F&B dengan volume pemesanan tertinggi
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Second Row - Charts in 6-6 columns (Sales Performance & Revenue Breakdown) */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 xl:grid-cols-2">
          {/* Chart 1: Sales Performance (Area Chart) */}
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-[#26272d]">
              <div>
                <h3 className="text-base font-bold text-white">Sales Performance</h3>
                <p className="text-xs text-[#bbcbb2]">Tren pergerakan omzet harian vs pengeluaran operasional</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-[#00ffff] bg-[#18181c] px-2.5 py-1 rounded-lg border border-[#26272d]">
                  Rasio Beban: {cfoHealth.expenseRatio}%
                </span>
                <button
                  onClick={() => navigate('/reports')}
                  className="px-2.5 py-1 rounded-lg bg-[#18181c] hover:bg-[#242428] text-white border border-[#26272d] text-xs font-semibold transition-all cursor-pointer"
                >
                  Export
                </button>
              </div>
            </div>

            <div className="py-4">
              {renderTrendChart()}
            </div>

            <div className="pt-3 border-t border-[#26272d] flex items-center justify-between text-xs text-[#bbcbb2]">
              <span>Rata-rata Omzet: <strong className="text-[#00ffff] font-mono">{formatRupiah(cfoHealth.avgDailyOmzet)}/hari</strong></span>
              <span>
                Kas Bersih: <strong className={`font-mono ${
                  activeSection === 'CAFE' ? (segmentedExpenses.cafeNetProfit >= 0 ? 'text-[#ffc71f]' : 'text-[#ff5102]')
                  : activeSection === 'CARWASH' ? (segmentedExpenses.carwashNetProfit >= 0 ? 'text-[#00ffff]' : 'text-[#ff5102]')
                  : (segmentedExpenses.holdingNetProfit >= 0 ? 'text-[#00ffff]' : 'text-[#ff5102]')
                }`}>
                  {formatRupiah(activeSection === 'CAFE' ? segmentedExpenses.cafeNetProfit : activeSection === 'CARWASH' ? segmentedExpenses.carwashNetProfit : segmentedExpenses.holdingNetProfit)}
                </strong>
              </span>
            </div>
          </div>

          {/* Chart 2: Revenue & Expense Breakdown by Source */}
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-[#26272d]">
              <div>
                <h3 className="text-base font-bold text-white">
                  {activeSection === 'CAFE' ? 'Struktur Beban & Penjualan Cafe' : activeSection === 'CARWASH' ? 'Struktur Beban & Layanan Carwash' : 'Struktur Beban & Pengeluaran Holding'}
                </h3>
                <p className="text-xs text-[#bbcbb2]">
                  {activeSection === 'CAFE' ? 'Distribusi pengeluaran bahan baku, dapur & menu terlaris' : activeSection === 'CARWASH' ? 'Distribusi pengeluaran komisi, chemical & model mobil' : 'Rincian pengeluaran carwash, cafe & beban bersama'}
                </p>
              </div>
              <button
                onClick={() => navigate('/reports')}
                className="px-2.5 py-1 rounded-lg bg-[#18181c] hover:bg-[#242428] text-white border border-[#26272d] text-xs font-semibold transition-all cursor-pointer"
              >
                Laporan Lengkap
              </button>
            </div>

            <div className="py-4 space-y-4">
              {activeSection === 'ALL' && (
                <>
                  {/* Category 1: Pengeluaran Carwash */}
                  <div
                    onClick={() => { setSelectedExpenseDivision('CARWASH'); setShowExpenseModal(true) }}
                    className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] hover:border-[#00ffff]/50 transition-all cursor-pointer group space-y-2"
                    title="Klik untuk rincian pengeluaran divisi carwash"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#00ffff]"></span>
                        <span className="font-semibold text-white group-hover:text-[#00ffff] transition-colors flex items-center gap-1.5">
                          Pengeluaran Divisi Carwash
                          <Eye size={12} className="text-[#00ffff] opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#00ffff]">{formatRupiah(segmentedExpenses.carwashExp)}</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">
                          ({segmentedExpenses.totalExpenses > 0 ? ((segmentedExpenses.carwashExp / segmentedExpenses.totalExpenses) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div
                        className="bg-[#00ffff] h-full rounded-full transition-all duration-500"
                        style={{ width: `${segmentedExpenses.totalExpenses > 0 ? (segmentedExpenses.carwashExp / segmentedExpenses.totalExpenses) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Category 2: Pengeluaran Cafe */}
                  <div
                    onClick={() => { setSelectedExpenseDivision('CAFE'); setShowExpenseModal(true) }}
                    className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] hover:border-[#ffc71f]/50 transition-all cursor-pointer group space-y-2"
                    title="Klik untuk rincian pengeluaran divisi cafe"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#ffc71f]"></span>
                        <span className="font-semibold text-white group-hover:text-[#ffc71f] transition-colors flex items-center gap-1.5">
                          Pengeluaran Divisi Cafe
                          <Eye size={12} className="text-[#ffc71f] opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#ffc71f]">{formatRupiah(segmentedExpenses.cafeExp)}</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">
                          ({segmentedExpenses.totalExpenses > 0 ? ((segmentedExpenses.cafeExp / segmentedExpenses.totalExpenses) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div
                        className="bg-[#ffc71f] h-full rounded-full transition-all duration-500"
                        style={{ width: `${segmentedExpenses.totalExpenses > 0 ? (segmentedExpenses.cafeExp / segmentedExpenses.totalExpenses) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Category 3: Pengeluaran Bersama (Shared Overhead) */}
                  <div
                    onClick={() => { setSelectedExpenseDivision('SHARED'); setShowExpenseModal(true) }}
                    className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] hover:border-[#f57733]/50 transition-all cursor-pointer group space-y-2"
                    title="Klik untuk rincian pengeluaran bersama / overhead"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#f57733]"></span>
                        <span className="font-semibold text-white group-hover:text-[#f57733] transition-colors flex items-center gap-1.5">
                          Pengeluaran Bersama (Gaji/Utilitas/Holding)
                          <Eye size={12} className="text-[#f57733] opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#f57733]">{formatRupiah(segmentedExpenses.sharedExp)}</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">
                          ({segmentedExpenses.totalExpenses > 0 ? ((segmentedExpenses.sharedExp / segmentedExpenses.totalExpenses) * 100).toFixed(1) : 0}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div
                        className="bg-[#f57733] h-full rounded-full transition-all duration-500"
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
                    onClick={() => { setSelectedExpenseDivision('CARWASH'); setShowExpenseModal(true) }}
                    className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] hover:border-[#ff5102]/50 transition-all cursor-pointer group space-y-2"
                    title="Klik untuk rincian pengeluaran operasional & komisi cuci"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#ff5102]"></span>
                        <span className="font-semibold text-white group-hover:text-[#ff5102] transition-colors flex items-center gap-1.5">
                          Beban Operasional & Chemical Cuci
                          <Eye size={12} className="text-[#ff5102] opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#ff5102]">{formatRupiah(segmentedExpenses.carwashExp)}</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">
                          ({carwashAnalytics.totalRevenue > 0 ? ((segmentedExpenses.carwashExp / carwashAnalytics.totalRevenue) * 100).toFixed(1) : 0}% omzet)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div
                        className="bg-[#ff5102] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(carwashAnalytics.totalRevenue > 0 ? (segmentedExpenses.carwashExp / carwashAnalytics.totalRevenue) * 100 : 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 2: Kas Bersih Carwash */}
                  <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#00ffff]"></span>
                        <span className="font-semibold text-white">Kas Bersih Divisi Carwash</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#00ffff]">{formatRupiah(segmentedExpenses.carwashNetProfit)}</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">({segmentedExpenses.carwashProfitMargin}% Margin)</span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div
                        className="bg-[#00ffff] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(Math.min(parseFloat(segmentedExpenses.carwashProfitMargin) || 0, 100), 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 3: Cross-sell to cafe */}
                  <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#f57733]"></span>
                        <span className="font-semibold text-white">Konversi Tambahan: Cross-Order ke Cafe</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#f57733]">{advancedKPIs.crossCount} Mobil</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">({advancedKPIs.crossConversionRate}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div className="bg-[#f57733] h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(parseFloat(advancedKPIs.crossConversionRate) || 0, 100)}%` }} />
                    </div>
                  </div>
                </>
              )}

              {activeSection === 'CAFE' && (
                <>
                  {/* Row 1: Pengeluaran Bahan Baku & Operasional Cafe */}
                  <div
                    onClick={() => { setSelectedExpenseDivision('CAFE'); setShowExpenseModal(true) }}
                    className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] hover:border-[#ff5102]/50 transition-all cursor-pointer group space-y-2"
                    title="Klik untuk rincian pengeluaran bahan & operasional cafe"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#ff5102]"></span>
                        <span className="font-semibold text-white group-hover:text-[#ff5102] transition-colors flex items-center gap-1.5">
                          Beban Bahan Baku & Operasional F&B
                          <Eye size={12} className="text-[#ff5102] opacity-80" />
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#ff5102]">{formatRupiah(segmentedExpenses.cafeExp)}</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">
                          ({cafeAnalytics.totalRevenue > 0 ? ((segmentedExpenses.cafeExp / cafeAnalytics.totalRevenue) * 100).toFixed(1) : 0}% omzet)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div
                        className="bg-[#ff5102] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(cafeAnalytics.totalRevenue > 0 ? (segmentedExpenses.cafeExp / cafeAnalytics.totalRevenue) * 100 : 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 2: Kas Bersih Cafe */}
                  <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#ffc71f]"></span>
                        <span className="font-semibold text-white">Kas Bersih Divisi Cafe & Resto</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-[#ffc71f]">{formatRupiah(segmentedExpenses.cafeNetProfit)}</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">({segmentedExpenses.cafeProfitMargin}% Margin)</span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div
                        className="bg-[#ffc71f] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(Math.min(parseFloat(segmentedExpenses.cafeProfitMargin) || 0, 100), 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Row 3: Cafe Struk Count summary row */}
                  <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[#00ffff]"></span>
                        <span className="font-semibold text-white">Struk Pesanan F&B Diterbitkan</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-white">{cafeAnalytics.cafeStrukCount} Struk</span>
                        <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">(AOV: {formatRupiah(cafeAnalytics.cafeAOV)})</span>
                      </div>
                    </div>
                    <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                      <div className="bg-[#00ffff] h-full rounded-full transition-all duration-500" style={{ width: '100%' }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="pt-3 border-t border-[#26272d] flex items-center justify-between text-xs text-[#bbcbb2]">
              <span>
                {activeSection === 'CAFE' ? 'Total Pengeluaran Cafe: ' : activeSection === 'CARWASH' ? 'Total Pengeluaran CW: ' : 'Total Pengeluaran Holding: '}
                <strong className="text-[#ff5102] font-mono">
                  {formatRupiah(activeSection === 'CAFE' ? segmentedExpenses.cafeExp : activeSection === 'CARWASH' ? segmentedExpenses.carwashExp : segmentedExpenses.totalExpenses)}
                </strong>
              </span>
              <span>
                Kas Bersih: <strong className={`font-mono ${
                  activeSection === 'CAFE' ? (segmentedExpenses.cafeNetProfit >= 0 ? 'text-[#ffc71f]' : 'text-[#ff5102]')
                  : activeSection === 'CARWASH' ? (segmentedExpenses.carwashNetProfit >= 0 ? 'text-[#00ffff]' : 'text-[#ff5102]')
                  : (segmentedExpenses.holdingNetProfit >= 0 ? 'text-[#00ffff]' : 'text-[#ff5102]')
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
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#26272d]">
              <div>
                <h3 className="text-base font-bold text-white">Recent Transactions</h3>
                <p className="text-xs text-[#bbcbb2]">Struk kasir & pembayaran masuk terkini</p>
              </div>
              <button
                onClick={() => navigate('/reports')}
                className="px-2.5 py-1 rounded-lg bg-[#18181c] hover:bg-[#242428] text-white border border-[#26272d] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Eye size={13} className="text-[#00ffff]" />
                View All
              </button>
            </div>

            <div className="py-4 space-y-3">
              {recentTransactionsList.length === 0 ? (
                <p className="text-xs text-[#6b7367] italic py-6 text-center">Belum ada transaksi pada periode ini.</p>
              ) : (
                recentTransactionsList.map((tx) => (
                  <div key={tx.id} className="flex items-center p-3 rounded-xl bg-[#18181c] border border-[#26272d] gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#26272d] border border-[#3f414a] flex items-center justify-center text-xs font-bold text-[#00ffff] shrink-0 font-mono">
                      {tx.customer.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-white truncate">{tx.customer.name}</p>
                        <span className="text-xs font-mono font-bold text-white shrink-0">{tx.amount}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-[11px] text-[#bbcbb2] truncate">{tx.customer.email}</p>
                        <span className="text-[10px] text-[#6b7367] font-mono shrink-0">{tx.date}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#26272d] flex items-center justify-between text-xs text-[#bbcbb2]">
              <span>Tercatat: <strong className="text-white font-mono">{filteredStrukByTime.length} transaksi</strong></span>
              <button onClick={() => navigate('/pos')} className="text-[#00ffff] hover:underline font-semibold flex items-center gap-1 cursor-pointer">
                Buka Layar Kasir <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* Column 2: Top Products & Services */}
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#26272d]">
              <div>
                <h3 className="text-base font-bold text-white">Top Products & Services</h3>
                <p className="text-xs text-[#bbcbb2]">Item & layanan paling diminati periode ini</p>
              </div>
              <button
                onClick={() => navigate('/database')}
                className="px-2.5 py-1 rounded-lg bg-[#18181c] hover:bg-[#242428] text-white border border-[#26272d] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Eye size={13} className="text-[#ffc71f]" />
                View All
              </button>
            </div>

            <div className="py-4 space-y-3">
              {topProductsList.map((prod, idx) => (
                <div key={prod.id || idx} className="flex items-center p-3 rounded-xl bg-[#18181c] border border-[#26272d] gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30 flex items-center justify-center text-xs font-bold font-mono shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{prod.name}</p>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#26272d] text-[#bbcbb2] shrink-0 font-medium">
                          {prod.category}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-white shrink-0">{prod.revenue}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <div className="flex items-center gap-1 text-[11px] text-[#bbcbb2]">
                        <Star size={11} className="text-[#ffc71f] fill-[#ffc71f]" />
                        <span>{prod.rating}</span>
                        <span>•</span>
                        <span className="font-mono text-[#ffc71f] font-semibold">{prod.sales} order</span>
                      </div>
                      <span className="text-[10px] text-[#00ffff] font-semibold font-mono bg-[#00ffff]/10 px-1.5 py-0.2 rounded border border-[#00ffff]/20">
                        {prod.growth}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#26272d] flex items-center justify-between text-xs text-[#bbcbb2]">
              <span>Ranking Top Menu & Layanan</span>
              <button onClick={() => navigate('/gudang')} className="text-[#ffc71f] hover:underline font-semibold flex items-center gap-1 cursor-pointer">
                Kelola Stok Gudang <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* Fourth Row - Customer Insights & Operational Tabs */}
        <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#26272d]">
            <div>
              <h3 className="text-base font-bold text-white">Customer Insights & Operations</h3>
              <p className="text-xs text-[#bbcbb2]">Monitoring sinergi estafet, setoran kasir & batas aman persediaan</p>
            </div>
            {/* Tabs List Navigation */}
            <div className="flex bg-[#18181c] p-0.5 rounded-lg border border-[#26272d] text-xs">
              <button
                onClick={() => setActiveInsightTab('sinergi')}
                className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeInsightTab === 'sinergi'
                    ? 'bg-[#00ffff] text-[#121215] shadow-xs'
                    : 'text-[#bbcbb2] hover:text-white'
                }`}
              >
                <TrendingUp size={13} strokeWidth={1.75} />
                <span>Sinergi & Utilisasi</span>
              </button>
              <button
                onClick={() => setActiveInsightTab('rekap')}
                className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeInsightTab === 'rekap'
                    ? 'bg-[#00ffff] text-[#121215] shadow-xs'
                    : 'text-[#bbcbb2] hover:text-white'
                }`}
              >
                <DollarSign size={13} strokeWidth={1.75} />
                <span>Rekap Kasir & Saldo</span>
              </button>
              <button
                onClick={() => setActiveInsightTab('stok')}
                className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeInsightTab === 'stok'
                    ? 'bg-[#00ffff] text-[#121215] shadow-xs'
                    : 'text-[#bbcbb2] hover:text-white'
                }`}
              >
                <AlertTriangle size={13} strokeWidth={1.75} />
                <span>Peringatan Stok</span>
              </button>
            </div>
          </div>

          {/* Tab Content 1: Sinergi & Utilisasi */}
          {activeInsightTab === 'sinergi' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#18181c] border border-[#26272d] space-y-1">
                <span className="text-[10px] text-[#6b7367] uppercase font-bold tracking-wider">ARPU Gabungan</span>
                <p className="text-xl font-bold text-white font-mono">{formatRupiah(advancedKPIs.combinedARPU)}</p>
                <p className="text-[11px] text-[#00ffff] font-medium">+12.5% dari target rata-rata</p>
              </div>
              <div className="p-4 rounded-xl bg-[#18181c] border border-[#26272d] space-y-1">
                <span className="text-[10px] text-[#6b7367] uppercase font-bold tracking-wider">Utilisasi Bay Cuci</span>
                <p className="text-xl font-bold text-[#00ffff] font-mono">{advancedKPIs.capacityEfficiency}%</p>
                <p className="text-[11px] text-[#bbcbb2]">Kapasitas target {targetCapacity} unit/hari</p>
              </div>
              <div className="p-4 rounded-xl bg-[#18181c] border border-[#26272d] space-y-1">
                <span className="text-[10px] text-[#6b7367] uppercase font-bold tracking-wider">Rata-rata Unit Cuci</span>
                <p className="text-xl font-bold text-white font-mono">{carwashAnalytics.avgCarsPerDay} mobil</p>
                <p className="text-[11px] text-[#ffc71f]">Volume kedatangan pelanggan</p>
              </div>
              <div className="p-4 rounded-xl bg-[#18181c] border border-[#26272d] space-y-1">
                <span className="text-[10px] text-[#6b7367] uppercase font-bold tracking-wider">Porsi Cafe Terjual</span>
                <p className="text-xl font-bold text-[#ffc71f] font-mono">{cafeAnalytics.totalItems} item</p>
                <p className="text-[11px] text-[#bbcbb2]">Total pesanan dapur & barista</p>
              </div>
            </div>
          )}

          {/* Tab Content 2: Rekap Kasir & Saldo */}
          {activeInsightTab === 'rekap' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d]">
                  <span className="text-[10px] font-bold text-[#00ffff] uppercase tracking-wider block">Uang Fisik Kasir (Cash)</span>
                  <p className="text-lg font-bold text-[#00ffff] font-mono mt-1">{formatRupiah(dailyCashierRecap.totalCash)}</p>
                  <span className="text-[11px] text-[#bbcbb2]">{dailyCashierRecap.cashPercentage}% total setoran</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d]">
                  <span className="text-[10px] font-bold text-[#ffc71f] uppercase tracking-wider block">QRIS & Non-Tunai</span>
                  <p className="text-lg font-bold text-[#ffc71f] font-mono mt-1">{formatRupiah(dailyCashierRecap.totalNonCash)}</p>
                  <span className="text-[11px] text-[#bbcbb2]">{dailyCashierRecap.nonCashPercentage}% digital payment</span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d]">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider block">Total Bruto Kasir</span>
                  <p className="text-lg font-bold text-white font-mono mt-1">{formatRupiah(dailyCashierRecap.totalOmzet)}</p>
                  <span className="text-[11px] text-[#bbcbb2]">{dailyCashierRecap.totalTxCount} transaksi hari ini</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d]">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="font-semibold text-white">Posisi Saldo Kas & Rekening Bank Terdaftar:</span>
                  <button onClick={() => navigate('/finance')} className="text-[#00ffff] hover:underline font-semibold flex items-center gap-1 cursor-pointer">
                    Buku Kas <ArrowRight size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-[#121215] border border-[#26272d] text-center">
                    <span className="text-[10px] text-[#6b7367] uppercase block font-bold">Laci Kasir</span>
                    <span className="font-mono font-bold text-white text-xs">{formatRupiah(posBalances.cash)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#121215] border border-[#26272d] text-center">
                    <span className="text-[10px] text-[#6b7367] uppercase block font-bold">Rekening Y</span>
                    <span className="font-mono font-bold text-white text-xs">{formatRupiah(posBalances.rekY)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#121215] border border-[#26272d] text-center">
                    <span className="text-[10px] text-[#6b7367] uppercase block font-bold">Rekening N</span>
                    <span className="font-mono font-bold text-white text-xs">{formatRupiah(posBalances.rekN)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[#121215] border border-[#26272d] text-center">
                    <span className="text-[10px] text-[#6b7367] uppercase block font-bold">Rekening R</span>
                    <span className="font-mono font-bold text-white text-xs">{formatRupiah(posBalances.rekR)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content 3: Peringatan Stok Kritis */}
          {activeInsightTab === 'stok' && (
            <div className="space-y-3">
              {criticalStockItems.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#18181c] border border-[#26272d] text-center text-xs text-[#bbcbb2] flex items-center justify-center gap-2">
                  <CheckCircle size={16} strokeWidth={1.75} className="text-[#00ffff]" />
                  <span>Seluruh persediaan stok bahan baku & chemical dalam batas aman.</span>
                </div>
              ) : (
                criticalStockItems.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-3 rounded-xl bg-[#18181c] border border-[#26272d]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-md bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30 shrink-0">
                        <AlertTriangle size={14} />
                      </div>
                      <span className="font-medium text-white truncate">{item.nama_barang || item.nama_produk}</span>
                    </div>
                    <span className="font-mono font-bold text-[#ff5102] bg-[#ff5102]/15 px-2.5 py-1 rounded-md border border-[#ff5102]/30 shrink-0">
                      Sisa: {item.stok} {item.satuan || 'unit'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Station 4: Dedicated Section AI Executive Intelligence & Prompt Studio */}
      <section id="ai-prompt-studio" className="w-full">
        <ExecutivePromptStudio
          strukList={strukList}
          carwashList={carwashList}
          cafeList={cafeList}
          cashflowLogs={cashflowLogs}
          stokList={stokList}
          posAccountList={posAccountList}
          tenantBusinessType={tenantBusinessType}
          activeTenant={activeTenant}
          targetCapacity={advancedKPIs?.targetCapacity || 30}
        />
      </section>

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
    </div>
  )
}

export default Dashboard
