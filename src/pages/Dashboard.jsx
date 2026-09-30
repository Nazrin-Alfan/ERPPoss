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
import { formatRupiah, parseDateSafe, calculateDailyCashierRecap } from '../utils/helpers'

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
  const [activeInsightTab, setActiveInsightTab] = useState('sinergi') // 'sinergi', 'rekap', 'stok'
  const [errorMsg, setErrorMsg] = useState('')

  // Raw DB Data
  const [strukList, setStrukList] = useState([])
  const [carwashList, setCarwashList] = useState([])
  const [cafeList, setCafeList] = useState([])
  const [cashflowLogs, setCashflowLogs] = useState([])
  const [stokList, setStokList] = useState([])
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
      const [dbStruk, dbCw, dbCafe, dbCf, dbStok] = await Promise.all([
        fetchAllRows('struk'),
        fetchAllRows('carwash'),
        fetchCafeRows(),
        fetchAllRows('cashflow'),
        fetchAllRows('stok_barang')
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

  const filteredStrukByTime = useMemo(() => {
    let list = strukList
    if (timeRange !== 'all') {
      list = strukList.filter(s => isDateInRange(s.tanggal))
    }
    return list.filter(s => {
      const ket = String(s.keterangan || '').toLowerCase()
      return !ket.includes('kalibrasi') && !ket.includes('test') && s.status_bayar !== 'Batal'
    })
  }, [strukList, isDateInRange, timeRange])

  const filteredCarwashList = useMemo(() => {
    let list = carwashList
    if (timeRange !== 'all') {
      list = carwashList.filter(cw => isDateInRange(cw.tanggal))
    }
    return list.filter(cw => {
      const parentStruk = strukList.find(s => s.id_struk === cw.id_struk)
      if (parentStruk) {
        const ket = String(parentStruk.keterangan || '').toLowerCase()
        if (ket.includes('kalibrasi') || ket.includes('test') || parentStruk.status_bayar === 'Batal') {
          return false
        }
      }
      return cw.status !== 'Batal' && cw.status !== 'Cancelled' && parseFloat(cw.harga || 0) > 0
    })
  }, [carwashList, strukList, isDateInRange, timeRange])

  const filteredCafeList = useMemo(() => {
    let list = cafeList
    if (timeRange !== 'all') {
      list = cafeList.filter(c => {
        const parentStruk = strukList.find(s => s.id_struk === c.id_struk)
        const dateStr = parentStruk?.tanggal || c.struk?.tanggal || c.created_at
        return isDateInRange(dateStr)
      })
    }
    return list.filter(c => {
      const parentStruk = strukList.find(s => s.id_struk === c.id_struk)
      if (parentStruk) {
        const ket = String(parentStruk.keterangan || '').toLowerCase()
        if (ket.includes('kalibrasi') || ket.includes('test') || parentStruk.status_bayar === 'Batal') {
          return false
        }
      }
      if (c.status === 'Batal' || c.status === 'Cancelled') {
        return false
      }
      return parseFloat(c.subtotal) > 0
    })
  }, [cafeList, strukList, isDateInRange, timeRange])

  const filteredCashflowLogs = useMemo(() => {
    if (timeRange === 'all') return cashflowLogs
    return cashflowLogs.filter(c => isDateInRange(c.tanggal))
  }, [cashflowLogs, isDateInRange, timeRange])

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

  // Financial Analytics & Trend Data
  const financialAnalytics = useMemo(() => {
    let totalExp = 0
    const dailyDataMap = {}

    filteredStrukByTime.forEach(s => {
      const d = s.tanggal ? s.tanggal.substring(0, 10) : ''
      if (!d) return
      if (!dailyDataMap[d]) dailyDataMap[d] = { date: d, omzet: 0, pengeluaran: 0 }
      dailyDataMap[d].omzet += parseFloat(s.total_tagihan || 0)
    })

    filteredCashflowLogs.forEach(c => {
      const d = c.tanggal ? c.tanggal.substring(0, 10) : ''
      const exp = parseFloat(c.pengeluaran || 0)
      const jenisLower = String(c.jenis || '').toLowerCase()

      if (jenisLower.includes('pindah') || jenisLower.includes('casbon')) return

      if (exp > 0) {
        totalExp += exp
        if (d) {
          if (!dailyDataMap[d]) dailyDataMap[d] = { date: d, omzet: 0, pengeluaran: 0 }
          dailyDataMap[d].pengeluaran += exp
        }
      }
    })

    const trendData = Object.values(dailyDataMap).sort((a, b) => a.date.localeCompare(b.date))

    return {
      totalExpenses: totalExp,
      trendData
    }
  }, [filteredStrukByTime, filteredCashflowLogs])

  // Overview Stats
  const overviewStats = useMemo(() => {
    const totalRevenue = filteredStrukByTime.reduce((sum, item) => sum + parseFloat(item.total_tagihan || 0), 0)
    const netProfit = totalRevenue - financialAnalytics.totalExpenses
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0
    const totalLiquid = posAccountList.length > 0
      ? posAccountList.reduce((sum, item) => sum + (parseFloat(item.balance) || 0), 0)
      : (posBalances.cash + posBalances.rekY + posBalances.rekN + posBalances.rekR)

    return {
      totalRevenue,
      netProfit,
      profitMargin,
      totalLiquid,
      todayCwCount: carwashAnalytics.totalUnits,
      todayCafeCount: cafeAnalytics.totalItems,
      avgCarsPerDay: carwashAnalytics.avgCarsPerDay
    }
  }, [filteredStrukByTime, financialAnalytics, posBalances, posAccountList, carwashAnalytics, cafeAnalytics])

  // CFO Health & Expense Ratio
  const cfoHealth = useMemo(() => {
    const expenseRatio = overviewStats.totalRevenue > 0
      ? ((financialAnalytics.totalExpenses / overviewStats.totalRevenue) * 100).toFixed(1)
      : '0.0'
    const avgDailyOmzet = operatingDays > 0
      ? Math.round(overviewStats.totalRevenue / operatingDays)
      : 0
    return {
      expenseRatio,
      avgDailyOmzet
    }
  }, [overviewStats.totalRevenue, financialAnalytics.totalExpenses, operatingDays])

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
    const list = filteredStrukByTime.length > 0 ? filteredStrukByTime : strukList
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
  }, [filteredStrukByTime, strukList])

  // Top Products & Services Data (shadcn dashboard-2)
  const topProductsList = useMemo(() => {
    const combined = []
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
    if (carwashAnalytics.topModels && carwashAnalytics.topModels.length > 0) {
      carwashAnalytics.topModels.forEach((m, idx) => {
        combined.push({
          id: `cw-${idx}`,
          name: `Cuci Mobil ${m.model}`,
          category: 'Carwash Service',
          sales: m.count,
          revenue: formatRupiah(m.count * 45000),
          growth: '+12%',
          rating: 4.8,
          stock: 100
        })
      })
    }
    if (combined.length === 0) {
      return [
        { id: 1, name: 'Paket Cuci Snow Carwash', category: 'Carwash', sales: 342, revenue: 'Rp 15.390.000', growth: '+23%', rating: 4.9, stock: 100 },
        { id: 2, name: 'Kopi Susu Aren Gula Aren', category: 'Cafe F&B', sales: 289, revenue: 'Rp 6.358.000', growth: '+15%', rating: 4.8, stock: 65 },
        { id: 3, name: 'Cuci Hidrolik + Wax', category: 'Carwash', sales: 198, revenue: 'Rp 11.880.000', growth: '+9%', rating: 4.7, stock: 100 },
        { id: 4, name: 'Matcha Latte Iced', category: 'Cafe F&B', sales: 142, revenue: 'Rp 3.976.000', growth: '+14%', rating: 4.6, stock: 42 }
      ]
    }
    return combined.sort((a, b) => b.sales - a.sales).slice(0, 5)
  }, [cafeAnalytics.topMenus, carwashAnalytics.topModels])

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

    const maxVal = Math.max(...data.map(d => Math.max(d.omzet, d.pengeluaran)), 100000)
    const svgWidth = 600
    const svgHeight = 180
    const padding = 28

    const pointsOmzet = data.map((d, i) => {
      const x = padding + (i / Math.max(data.length - 1, 1)) * (svgWidth - padding * 2)
      const y = svgHeight - padding - (d.omzet / maxVal) * (svgHeight - padding * 2)
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
                <stop offset="0%" stopColor="#00ffff" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#00ffff" stopOpacity="0.0" />
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
              stroke="#00ffff"
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
              const yOmzet = svgHeight - padding - (d.omzet / maxVal) * (svgHeight - padding * 2)
              const yExp = svgHeight - padding - (d.pengeluaran / maxVal) * (svgHeight - padding * 2)
              const tooltipY = Math.max(5, Math.min(yOmzet, yExp) - 42)
              const dateLabel = d.date ? d.date.substring(5) : ''

              return (
                <g key={i} className="group cursor-pointer">
                  <rect x={x - 8} y={Math.min(yOmzet, yExp) - 8} width="16" height={Math.abs(yOmzet - yExp) + 16} fill="transparent" />
                  <circle cx={x} cy={yOmzet} r="4" fill="#00ffff" className="transition-all group-hover:r-6" />
                  <circle cx={x} cy={yExp} r="3.5" fill="#ff5102" className="transition-all group-hover:r-5" />
                  <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    <rect x={x - 55} y={tooltipY} width="110" height="34" rx="4" fill="#121215" stroke="#26272d" strokeWidth="1" />
                    <text x={x} y={tooltipY + 12} fontSize="9" fill="#00ffff" fontWeight="bold" textAnchor="middle">
                      {formatRupiah(d.omzet)}
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
            <span className="flex items-center gap-2 text-[#00ffff]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00ffff]"></span>
              Omzet Penjualan
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
          {/* Metric 1: Total Revenue */}
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-[#bbcbb2]">
                  {activeSection === 'CAFE' ? 'Total Revenue (Cafe)' : activeSection === 'CARWASH' ? 'Total Revenue (Carwash)' : 'Total Revenue'}
                </p>
                <h3 className="text-2xl font-bold text-white mt-1 font-mono tabular-nums tracking-tight">
                  {formatRupiah(activeSection === 'CAFE' ? cafeAnalytics.totalRevenue : activeSection === 'CARWASH' ? carwashAnalytics.totalRevenue : overviewStats.totalRevenue)}
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
              <p className="text-[11px] text-[#bbcbb2] mt-0.5">
                {activeSection === 'CAFE'
                  ? `${overviewStats.totalRevenue > 0 ? ((cafeAnalytics.totalRevenue / overviewStats.totalRevenue) * 100).toFixed(1) : 0}% kontribusi omzet total`
                  : activeSection === 'CARWASH'
                  ? `${overviewStats.totalRevenue > 0 ? ((carwashAnalytics.totalRevenue / overviewStats.totalRevenue) * 100).toFixed(1) : 0}% kontribusi omzet total`
                  : 'Gabungan Divisi Cafe & Carwash'}
              </p>
            </div>
          </div>

          {/* Metric 2: Net Profit & Margin */}
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-[#bbcbb2]">
                  {activeSection === 'CAFE' ? 'Porsi Terjual' : activeSection === 'CARWASH' ? 'Kendaraan Dicuci' : 'Estimasi Laba Bersih'}
                </p>
                <h3 className={`text-2xl font-bold mt-1 font-mono tabular-nums tracking-tight ${
                  activeSection === 'ALL'
                    ? (overviewStats.netProfit >= 0 ? 'text-[#00ffff]' : 'text-[#ff5102]')
                    : 'text-white'
                }`}>
                  {activeSection === 'CAFE'
                    ? `${cafeAnalytics.totalItems} Porsi`
                    : activeSection === 'CARWASH'
                    ? `${carwashAnalytics.totalUnits} Unit`
                    : formatRupiah(overviewStats.netProfit)}
                </h3>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md font-mono ${
                overviewStats.netProfit >= 0
                  ? 'bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30'
                  : 'bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30'
              }`}>
                {overviewStats.netProfit >= 0 ? <TrendingUp size={12} strokeWidth={2} /> : <TrendingDown size={12} strokeWidth={2} />}
                {overviewStats.profitMargin}% Margin
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
              <p className="font-semibold text-white flex items-center gap-1">
                Likuiditas Sehat & Terjaga <CheckCircle size={13} className="text-[#00ffff]" />
              </p>
              <p className="text-[11px] text-[#bbcbb2] mt-0.5">
                {activeSection === 'CAFE'
                  ? `${cafeAnalytics.cafeStrukCount} struk pesanan F&B`
                  : activeSection === 'CARWASH'
                  ? `Rata-rata ${carwashAnalytics.avgCarsPerDay} mobil/hari`
                  : 'Setelah beban operasional & HPP'}
              </p>
            </div>
          </div>

          {/* Metric 3: Total Orders / Struk */}
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-[#bbcbb2]">Total Orders / Struk</p>
                <h3 className="text-2xl font-bold text-white mt-1 font-mono tabular-nums tracking-tight">
                  {filteredStrukByTime.length} Struk
                </h3>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#ffc71f]/15 text-[#ffc71f] border border-[#ffc71f]/30 font-mono">
                <ShoppingCart size={12} strokeWidth={2} />
                AOV: {formatRupiah(advancedKPIs.combinedARPU)}
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
              <p className="font-semibold text-white flex items-center gap-1">
                Volume Transaksi Kasir Stabil <TrendingUp size={13} className="text-[#ffc71f]" />
              </p>
              <p className="text-[11px] text-[#bbcbb2] mt-0.5">
                {activeSection === 'CAFE'
                  ? `AOV Cafe: ${formatRupiah(cafeAnalytics.cafeAOV)}`
                  : activeSection === 'CARWASH'
                  ? `Utilisasi Bay: ${advancedKPIs.capacityEfficiency}%`
                  : `Frekuensi belanja harian pelanggan`}
              </p>
            </div>
          </div>

          {/* Metric 4: Conversion Rate / Sinergi Estafet */}
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between hover:border-[#3f414a] transition-all shadow-xs group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-[#bbcbb2]">
                  {activeSection === 'ALL' ? 'Conversion Rate Sinergi' : 'Total Kas & Rekening'}
                </p>
                <h3 className="text-2xl font-bold text-[#00ffff] mt-1 font-mono tabular-nums tracking-tight">
                  {activeSection === 'ALL' ? `${advancedKPIs.crossConversionRate}%` : formatRupiah(overviewStats.totalLiquid)}
                </h3>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#f57733]/15 text-[#f57733] border border-[#f57733]/30 font-mono">
                <Store size={12} strokeWidth={2} />
                {activeSection === 'ALL' ? `${advancedKPIs.crossCount} Estafet` : 'Kas Aktif'}
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-[#26272d] text-xs">
              <p className="font-semibold text-white flex items-center gap-1">
                Cross-Order Cuci ➔ Ngopi <TrendingUp size={13} className="text-[#f57733]" />
              </p>
              <p className="text-[11px] text-[#bbcbb2] mt-0.5">
                {activeSection === 'ALL'
                  ? `${advancedKPIs.crossCount} dari ${advancedKPIs.totalCarwashStruks} mobil pesan cafe`
                  : 'Saldo laci kasir + bank terdaftar'}
              </p>
            </div>
          </div>
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
              <span>Estimasi Laba: <strong className={`font-mono ${overviewStats.netProfit >= 0 ? 'text-[#00ffff]' : 'text-[#ff5102]'}`}>{formatRupiah(overviewStats.netProfit)}</strong></span>
            </div>
          </div>

          {/* Chart 2: Revenue Breakdown by Source */}
          <div className="bg-[#121215] border border-[#26272d] rounded-xl p-5 flex flex-col justify-between shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 border-b border-[#26272d]">
              <div>
                <h3 className="text-base font-bold text-white">Revenue Breakdown</h3>
                <p className="text-xs text-[#bbcbb2]">Distribusi pendapatan per divisi & sinergi usaha</p>
              </div>
              <button
                onClick={() => navigate('/database')}
                className="px-2.5 py-1 rounded-lg bg-[#18181c] hover:bg-[#242428] text-white border border-[#26272d] text-xs font-semibold transition-all cursor-pointer"
              >
                Detail Master
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Category 1: Carwash Services */}
              <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#00ffff]"></span>
                    <span className="font-semibold text-white">Carwash & Detailing Services</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-white">{formatRupiah(carwashAnalytics.totalRevenue)}</span>
                    <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">
                      ({overviewStats.totalRevenue > 0 ? ((carwashAnalytics.totalRevenue / overviewStats.totalRevenue) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                  <div
                    className="bg-[#00ffff] h-full rounded-full transition-all duration-500"
                    style={{ width: `${overviewStats.totalRevenue > 0 ? (carwashAnalytics.totalRevenue / overviewStats.totalRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Category 2: Cafe F&B */}
              <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#ffc71f]"></span>
                    <span className="font-semibold text-white">Cafe, Resto & Beverages</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[#ffc71f]">{formatRupiah(cafeAnalytics.totalRevenue)}</span>
                    <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">
                      ({overviewStats.totalRevenue > 0 ? ((cafeAnalytics.totalRevenue / overviewStats.totalRevenue) * 100).toFixed(1) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                  <div
                    className="bg-[#ffc71f] h-full rounded-full transition-all duration-500"
                    style={{ width: `${overviewStats.totalRevenue > 0 ? (cafeAnalytics.totalRevenue / overviewStats.totalRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Category 3: Cross-Order Sinergi Estafet */}
              <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#f57733]"></span>
                    <span className="font-semibold text-white">Cross-Order Sinergi Estafet</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-[#f57733]">{advancedKPIs.crossCount} Transaksi</span>
                    <span className="text-[11px] text-[#bbcbb2] ml-1.5 font-mono">({advancedKPIs.crossConversionRate}%)</span>
                  </div>
                </div>
                <div className="w-full bg-[#121215] h-2 rounded-full overflow-hidden border border-[#26272d]">
                  <div
                    className="bg-[#f57733] h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(parseFloat(advancedKPIs.crossConversionRate) || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#26272d] flex items-center justify-between text-xs text-[#bbcbb2]">
              <span>Total Unit Usaha: <strong className="text-white">2 Divisi Aktif</strong></span>
              <span>Total Omzet: <strong className="text-[#00ffff] font-mono">{formatRupiah(overviewStats.totalRevenue)}</strong></span>
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
    </div>
  )
}

export default Dashboard
