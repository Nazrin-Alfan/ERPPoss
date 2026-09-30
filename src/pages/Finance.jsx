import {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from '../components/ui/Table'
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getTenantFeatures } from '../utils/businessCapabilities'
import { 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Plus, 
  Trash2,
  AlertCircle,
  CheckCircle,
  FileText,
  TrendingDown,
  Car,
  Coffee,
  Download,
  Search,
  Filter,
  Calendar,
  Edit2,
  Eye,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Receipt,
  RotateCcw
} from 'lucide-react'
import { formatRupiah, parseDateSafe, generateUUID } from '../utils/helpers'
import CustomSelect from '../components/common/CustomSelect'
import {
  validateExpenseForm,
  formatExpensePayload,
  validateIncomeForm,
  formatIncomePayload,
  validateEditCashflowForm,
  generateCSVString,
  downloadCSV,
  isPindahSaldo,
  normalizeCategory,
  normalizeJenis,
  getLockedCategoriesForJenis
} from '../utils/financeHelpers'

const Finance = () => {
  const { activeTenant } = useAuth()
  const features = getTenantFeatures(activeTenant?.business_type)

  // Navigation & Loading States
  const [activeTab, setActiveTab] = useState('cashflow') // 'cashflow' | 'carwash' | 'cafe' | 'expenses'

  useEffect(() => {
    if (activeTab === 'carwash' && !features.hasCarwash) {
      setActiveTab('cashflow')
    } else if (activeTab === 'cafe' && !features.hasCafe) {
      setActiveTab('cashflow')
    }
  }, [activeTab, features.hasCarwash, features.hasCafe])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Universal Filter States
  const [filterPeriodMode, setFilterPeriodMode] = useState('month') // 'month' | 'quick' | 'custom'
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toLocaleDateString('en-CA').substring(0, 7))
  const [quickPreset, setQuickPreset] = useState('this_month') // 'all' | 'today' | 'yesterday' | '7days' | 'this_month'
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')
  })
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [searchQuery, setSearchQuery] = useState('')
  
  // Table Sorting States
  const [sortKey, setSortKey] = useState('tanggal') // 'tanggal' | 'nominal'
  const [sortOrder, setSortOrder] = useState('desc') // 'desc' (menurun) | 'asc' (menaik)

  // Specific Column Filters
  const [filterType, setFilterType] = useState('all') // 'all' | 'pemasukan' | 'pengeluaran' | 'pindah'
  const [filterPos, setFilterPos] = useState('all') // 'all' | 'SALDO CASH' | 'SALDO REKENING Y' | 'SALDO REKENING N' | 'SALDO REKENING R'
  const [filterCashflowJenis, setFilterCashflowJenis] = useState('all')
  const [filterCashflowKategori, setFilterCashflowKategori] = useState('all')
  const [filterExpenseJenis, setFilterExpenseJenis] = useState('all')
  const [filterExpenseCategory, setFilterExpenseCategory] = useState('all')
  const [filterCarwashPayment, setFilterCarwashPayment] = useState('all')
  const [filterCarwashStatus, setFilterCarwashStatus] = useState('all')
  const [filterCafeCategory, setFilterCafeCategory] = useState('all')

  // Pagination State
  const [pageSize, setPageSize] = useState(25) // 25, 50, 100, 0 (all)
  const [currentPage, setCurrentPage] = useState(1)

  // Master Data Lists from Database
  const [cashflowList, setCashflowList] = useState([])
  const [carwashList, setCarwashList] = useState([])
  const [cafeList, setCafeList] = useState([])
  const [expensesList, setExpensesList] = useState([])
  const [masterCategories, setMasterCategories] = useState([])
  const [stokBahan, setStokBahan] = useState([])
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0, totalBalance: 0 })

  // Modal States
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [customAlert, setCustomAlert] = useState(null)

  // Form States
  const [expenseForm, setExpenseForm] = useState({
    tanggal: new Date().toLocaleDateString('en-CA'),
    jenis: 'Pengeluaran Bersama',
    kategori: 'Listrik, Air & Utilitas',
    pos: 'SALDO CASH',
    keterangan: '',
    total_harga: ''
  })
  const [incomeForm, setIncomeForm] = useState({
    tanggal: new Date().toLocaleDateString('en-CA'),
    nominal: '',
    keterangan: '',
    jenis: 'Pemasukan',
    kategori: 'Pemasukan Lain-lain',
    pos: 'SALDO CASH'
  })
  const [transferForm, setTransferForm] = useState({
    tanggal: new Date().toLocaleDateString('en-CA'),
    pos_asal: 'SALDO CASH',
    pos_tujuan: 'SALDO REKENING Y',
    nominal: '',
    keterangan: ''
  })
  const [barangMasukList, setBarangMasukList] = useState([])

  // Edit Form State
  const [editForm, setEditForm] = useState({
    table: 'cashflow',
    id: null,
    tanggal: '',
    jam: '',
    keterangan: '',
    jenis: '',
    kategori: '',
    pos: 'SALDO CASH',
    pemasukan: 0,
    pengeluaran: 0,
    harga: 0,
    diskon: 0,
    metode_bayar: 'CASH',
    status: 'Selesai'
  })

  // Base Default Options (Concise, Clean & Standard Title Case - Filtered by Tenant Model)
  const defaultJenisOptions = useMemo(() => {
    if (features.isCafeOnly) {
      return ['Pengeluaran Cafe', 'Pengeluaran Bersama', 'Operasional', 'Casbon']
    }
    if (features.isCarwashOnly) {
      return ['Pengeluaran Carwash', 'Pengeluaran Bersama', 'Operasional', 'Casbon']
    }
    return ['Pengeluaran Cafe', 'Pengeluaran Carwash', 'Pengeluaran Bersama', 'Operasional', 'Casbon']
  }, [features.isCafeOnly, features.isCarwashOnly])

  const defaultKategoriOptions = ['Operasional', 'Bahan Baku', 'Sewa', 'Casbon', 'Lain-lain']

  const defaultIncomeJenisOptions = useMemo(() => {
    if (features.isCafeOnly) {
      return ['Pemasukan', 'Pemasukan Cafe']
    }
    if (features.isCarwashOnly) {
      return ['Pemasukan', 'Pemasukan Carwash']
    }
    return ['Pemasukan', 'Pemasukan Cafe', 'Pemasukan Carwash']
  }, [features.isCafeOnly, features.isCarwashOnly])

  const defaultIncomeKategoriOptions = ['Omzet Penjualan', 'Modal Awal', 'Pemasukan Lain-lain']
  const posOptions = ['SALDO CASH', 'SALDO REKENING Y', 'SALDO REKENING N', 'SALDO REKENING R']

  // Custom Options State (from localStorage)
  const [customJenisList, setCustomJenisList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jb_custom_jenis_list') || '[]') } catch { return [] }
  })
  const [customKategoriList, setCustomKategoriList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jb_custom_kategori_list') || '[]') } catch { return [] }
  })
  const [customIncomeJenisList, setCustomIncomeJenisList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jb_custom_income_jenis_list') || '[]') } catch { return [] }
  })
  const [customIncomeKategoriList, setCustomIncomeKategoriList] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jb_custom_income_kategori_list') || '[]') } catch { return [] }
  })

  // Mode Custom input toggles
  const [isCustomExpenseJenis, setIsCustomExpenseJenis] = useState(false)
  const [isCustomExpenseKategori, setIsCustomExpenseKategori] = useState(false)
  const [isCustomIncomeJenis, setIsCustomIncomeJenis] = useState(false)
  const [isCustomIncomeKategori, setIsCustomIncomeKategori] = useState(false)

  const saveCustomOption = (type, val) => {
    if (!val || typeof val !== 'string' || !val.trim()) return
    if (type === 'jenis') {
      const norm = normalizeJenis(val)
      if (!norm || defaultJenisOptions.some(d => d.toLowerCase() === norm.toLowerCase())) return
      setCustomJenisList(prev => {
        if (prev.some(p => p.toLowerCase() === norm.toLowerCase())) return prev
        const updated = [...prev, norm]
        try { localStorage.setItem('jb_custom_jenis_list', JSON.stringify(updated)) } catch {}
        return updated
      })
    } else if (type === 'kategori') {
      const norm = normalizeCategory(val)
      if (!norm || defaultKategoriOptions.some(d => d.toLowerCase() === norm.toLowerCase())) return
      setCustomKategoriList(prev => {
        if (prev.some(p => p.toLowerCase() === norm.toLowerCase())) return prev
        const updated = [...prev, norm]
        try { localStorage.setItem('jb_custom_kategori_list', JSON.stringify(updated)) } catch {}
        return updated
      })
    } else if (type === 'income_jenis') {
      const norm = normalizeJenis(val)
      if (!norm || defaultIncomeJenisOptions.some(d => d.toLowerCase() === norm.toLowerCase())) return
      setCustomIncomeJenisList(prev => {
        if (prev.some(p => p.toLowerCase() === norm.toLowerCase())) return prev
        const updated = [...prev, norm]
        try { localStorage.setItem('jb_custom_income_jenis_list', JSON.stringify(updated)) } catch {}
        return updated
      })
    } else if (type === 'income_kategori') {
      const norm = normalizeCategory(val)
      if (!norm || defaultIncomeKategoriOptions.some(d => d.toLowerCase() === norm.toLowerCase())) return
      setCustomIncomeKategoriList(prev => {
        if (prev.some(p => p.toLowerCase() === norm.toLowerCase())) return prev
        const updated = [...prev, norm]
        try { localStorage.setItem('jb_custom_income_kategori_list', JSON.stringify(updated)) } catch {}
        return updated
      })
    }
  }

  // Combined options (Standard choices + intentional custom choices, normalized with deduplication)
  const allJenisOptions = useMemo(() => {
    const map = new Map()
    defaultJenisOptions.forEach(j => {
      const norm = normalizeJenis(j)
      if (norm) map.set(norm.toLowerCase(), norm)
    })
    customJenisList.forEach(j => {
      const norm = normalizeJenis(j)
      if (norm && !map.has(norm.toLowerCase())) map.set(norm.toLowerCase(), norm)
    })
    return Array.from(map.values())
  }, [customJenisList])

  const allKategoriOptions = useMemo(() => {
    const map = new Map()
    // Kategori dari Master Categories (Database)
    masterCategories.filter(c => c.tipe_arus === 'PENGELUARAN').forEach(c => {
      const norm = normalizeCategory(c.nama_kategori)
      if (norm) map.set(norm.toLowerCase(), norm)
    })
    defaultKategoriOptions.forEach(k => {
      const norm = normalizeCategory(k)
      if (norm && !map.has(norm.toLowerCase())) map.set(norm.toLowerCase(), norm)
    })
    customKategoriList.forEach(k => {
      const norm = normalizeCategory(k)
      if (norm && !map.has(norm.toLowerCase())) map.set(norm.toLowerCase(), norm)
    })
    return Array.from(map.values())
  }, [masterCategories, customKategoriList])

  const allIncomeJenisOptions = useMemo(() => {
    const map = new Map()
    defaultIncomeJenisOptions.forEach(j => {
      const norm = normalizeJenis(j)
      if (norm) map.set(norm.toLowerCase(), norm)
    })
    customIncomeJenisList.forEach(j => {
      const norm = normalizeJenis(j)
      if (norm && !map.has(norm.toLowerCase())) map.set(norm.toLowerCase(), norm)
    })
    return Array.from(map.values())
  }, [customIncomeJenisList])

  const allIncomeKategoriOptions = useMemo(() => {
    const map = new Map()
    // Kategori dari Master Categories (Database)
    masterCategories.filter(c => c.tipe_arus === 'PEMASUKAN').forEach(c => {
      const norm = normalizeCategory(c.nama_kategori)
      if (norm) map.set(norm.toLowerCase(), norm)
    })
    defaultIncomeKategoriOptions.forEach(k => {
      const norm = normalizeCategory(k)
      if (norm && !map.has(norm.toLowerCase())) map.set(norm.toLowerCase(), norm)
    })
    customIncomeKategoriList.forEach(k => {
      const norm = normalizeCategory(k)
      if (norm && !map.has(norm.toLowerCase())) map.set(norm.toLowerCase(), norm)
    })
    return Array.from(map.values())
  }, [masterCategories, customIncomeKategoriList])

  // Backward compatibility alias
  const jenisOptions = allJenisOptions
  const kategoriOptions = allKategoriOptions
  const incomeKategoriOptions = allIncomeKategoriOptions

  // Available Categories Locked to the Selected Jenis in Modal Forms
  const availableExpenseCategories = useMemo(() => {
    return getLockedCategoriesForJenis(expenseForm.jenis, masterCategories, customKategoriList, false)
  }, [expenseForm.jenis, masterCategories, customKategoriList])

  const availableIncomeCategories = useMemo(() => {
    return getLockedCategoriesForJenis(incomeForm.jenis, masterCategories, customIncomeKategoriList, true)
  }, [incomeForm.jenis, masterCategories, customIncomeKategoriList])

  const handleExpenseJenisSelect = (selectedJenis) => {
    if (selectedJenis === '__CUSTOM__') {
      setIsCustomExpenseJenis(true)
      setExpenseForm(prev => ({ ...prev, jenis: '' }))
    } else {
      const nextCats = getLockedCategoriesForJenis(selectedJenis, masterCategories, customKategoriList, false)
      setExpenseForm(prev => {
        const isCurrentValid = nextCats.some(c => c.toLowerCase() === (prev.kategori || '').toLowerCase())
        const newCat = isCurrentValid ? prev.kategori : (nextCats[0] || 'Operasional')
        return {
          ...prev,
          jenis: selectedJenis,
          kategori: newCat,
          total_harga: newCat === 'Bahan Baku' ? 0 : prev.total_harga
        }
      })
      if (nextCats[0] !== 'Bahan Baku') setBarangMasukList([])
    }
  }

  const handleIncomeJenisSelect = (selectedJenis) => {
    if (selectedJenis === '__CUSTOM__') {
      setIsCustomIncomeJenis(true)
      setIncomeForm(prev => ({ ...prev, jenis: '' }))
    } else {
      const nextCats = getLockedCategoriesForJenis(selectedJenis, masterCategories, customIncomeKategoriList, true)
      setIncomeForm(prev => {
        const isCurrentValid = nextCats.some(c => c.toLowerCase() === (prev.kategori || '').toLowerCase())
        return {
          ...prev,
          jenis: selectedJenis,
          kategori: isCurrentValid ? prev.kategori : (nextCats[0] || 'Omzet Penjualan')
        }
      })
    }
  }

  // Dynamic filter options extracted from lists
  const cashflowJenisList = useMemo(() => {
    const map = new Map()
    cashflowList.forEach(item => {
      const j = item.jenis
      if (j && !map.has(j.toLowerCase())) map.set(j.toLowerCase(), j)
    })
    allJenisOptions.forEach(j => {
      if (j && !map.has(j.toLowerCase())) map.set(j.toLowerCase(), j)
    })
    allIncomeJenisOptions.forEach(j => {
      if (j && !map.has(j.toLowerCase())) map.set(j.toLowerCase(), j)
    })
    return Array.from(map.values())
  }, [cashflowList, allJenisOptions, allIncomeJenisOptions])

  const cashflowKategoriList = useMemo(() => {
    const map = new Map()
    cashflowList.forEach(item => {
      const k = item.kategori
      if (k && !map.has(k.toLowerCase())) map.set(k.toLowerCase(), k)
    })
    allKategoriOptions.forEach(k => {
      if (k && !map.has(k.toLowerCase())) map.set(k.toLowerCase(), k)
    })
    allIncomeKategoriOptions.forEach(k => {
      if (k && !map.has(k.toLowerCase())) map.set(k.toLowerCase(), k)
    })
    return Array.from(map.values())
  }, [cashflowList, allKategoriOptions, allIncomeKategoriOptions])

  const expenseJenisList = useMemo(() => {
    const map = new Map()
    expensesList.forEach(item => {
      const j = item.jenis
      if (j && !map.has(j.toLowerCase())) map.set(j.toLowerCase(), j)
    })
    allJenisOptions.forEach(j => {
      if (j && !map.has(j.toLowerCase())) map.set(j.toLowerCase(), j)
    })
    return Array.from(map.values())
  }, [expensesList, allJenisOptions])

  const expenseKategoriList = useMemo(() => {
    const map = new Map()
    expensesList.forEach(item => {
      const k = item.kategori
      if (k && !map.has(k.toLowerCase())) map.set(k.toLowerCase(), k)
    })
    allKategoriOptions.forEach(k => {
      if (k && !map.has(k.toLowerCase())) map.set(k.toLowerCase(), k)
    })
    return Array.from(map.values())
  }, [expensesList, allKategoriOptions])

  // Filtered Kategori lists locked by selected Jenis in table filter bars
  const cashflowFilteredKategoriOptions = useMemo(() => {
    if (filterCashflowJenis === 'all') return cashflowKategoriList
    return getLockedCategoriesForJenis(filterCashflowJenis, masterCategories, [], false)
  }, [filterCashflowJenis, cashflowKategoriList, masterCategories])

  const expenseFilteredKategoriOptions = useMemo(() => {
    if (filterExpenseJenis === 'all') return expenseKategoriList
    return getLockedCategoriesForJenis(filterExpenseJenis, masterCategories, [], false)
  }, [filterExpenseJenis, expenseKategoriList, masterCategories])

  const editAvailableCategories = useMemo(() => {
    const isInc = parseFloat(editForm.pemasukan || 0) > 0 || String(editForm.jenis || '').toLowerCase().includes('pemasukan')
    return getLockedCategoriesForJenis(editForm.jenis, masterCategories, [], isInc)
  }, [editForm.jenis, editForm.pemasukan, masterCategories])

  const handleFilterCashflowJenisChange = (newJenis) => {
    setFilterCashflowJenis(newJenis)
    if (newJenis !== 'all') {
      const validCats = getLockedCategoriesForJenis(newJenis, masterCategories, [], false)
      if (!validCats.some(k => k.toLowerCase() === (filterCashflowKategori || '').toLowerCase())) {
        setFilterCashflowKategori('all')
      }
    }
  }

  const handleFilterExpenseJenisChange = (newJenis) => {
    setFilterExpenseJenis(newJenis)
    if (newJenis !== 'all') {
      const validCats = getLockedCategoriesForJenis(newJenis, masterCategories, [], false)
      if (!validCats.some(k => k.toLowerCase() === (filterExpenseCategory || '').toLowerCase())) {
        setFilterExpenseCategory('all')
      }
    }
  }

  // Sort toggle handler
  const handleSortToggle = (colKey) => {
    if (sortKey === colKey) {
      setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(colKey)
      setSortOrder('desc')
    }
  }

  // Reset all filters & sorting
  const handleResetFilters = () => {
    setFilterType('all')
    setFilterPos('all')
    setFilterCashflowJenis('all')
    setFilterCashflowKategori('all')
    setFilterExpenseJenis('all')
    setFilterExpenseCategory('all')
    setFilterCarwashPayment('all')
    setFilterCarwashStatus('all')
    setFilterCafeCategory('all')
    setSearchQuery('')
    setSortKey('tanggal')
    setSortOrder('desc')
  }

  // Alert & Confirm Helpers
  const showAlert = (message, title = 'Informasi') => {
    return new Promise((resolve) => {
      setCustomAlert({
        title,
        message,
        type: 'alert',
        onConfirm: () => {
          setCustomAlert(null)
          resolve(true)
        }
      })
    })
  }

  const showConfirm = (message, title = 'Konfirmasi') => {
    return new Promise((resolve) => {
      setCustomAlert({
        title,
        message,
        type: 'confirm',
        onConfirm: () => {
          setCustomAlert(null)
          resolve(true)
        },
        onCancel: () => {
          setCustomAlert(null)
          resolve(false)
        }
      })
    })
  }

  // 12 Months Dropdown Options
  const monthOptions = useMemo(() => {
    const options = []
    const currentDate = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1)
      const value = d.toLocaleDateString('en-CA').substring(0, 7) // YYYY-MM
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      options.push({ value, label })
    }
    return options
  }, [])

  // Fetch All Finance Data from Supabase
  const fetchFinanceData = async () => {
    setLoading(true)
    setError('')
    try {
      // 1. Fetch Summary View
      const { data: sumData } = await supabase.from('finance_summary').select('*').single()
      if (sumData) {
        setSummary({
          totalIncome: parseFloat(sumData.total_income) || 0,
          totalExpense: parseFloat(sumData.total_expense) || 0,
          totalBalance: parseFloat(sumData.total_balance) || 0
        })
      }

      // Helper to fetch all rows beyond 1000 rows
      const fetchAllData = async (table, select = '*', orderCol = null) => {
        let allData = []
        let from = 0
        const step = 1000
        while (true) {
          let query = supabase.from(table).select(select)
          if (orderCol) {
            query = query.order(orderCol, { ascending: false })
          }
          const { data, error } = await query.range(from, from + step - 1)
          if (error) throw error
          if (!data || data.length === 0) break
          allData = allData.concat(data)
          if (data.length < step) break
          from += step
        }
        return allData
      }

      // 2-6. Fetch Cashflow, Carwash, Cafe, Expenses, Master Categories, & Stok Barang secara paralel
      const [
        cfData,
        cwData,
        cafeData,
        expData,
        resMc,
        resSb
      ] = await Promise.all([
        fetchAllData('cashflow', '*', 'tanggal'),
        fetchAllData('carwash', '*', 'tanggal'),
        fetchAllData('cafe', '*, struk(tanggal, jam, kasir, metode_bayar, status_bayar)'),
        fetchAllData('pengeluaran', '*', 'tanggal'),
        supabase.from('master_categories').select('*'),
        supabase.from('stok_barang').select('*')
      ])

      const mcData = resMc?.data
      const sbData = resSb?.data

      setCashflowList(cfData || [])
      setCarwashList(cwData || [])
      setCafeList(cafeData || [])
      setExpensesList(expData || [])

      if (mcData && mcData.length > 0) {
        setMasterCategories(mcData)
      }

      const formattedStok = sbData?.length ? sbData.map(b => ({
        id_bahan_baku: b.id_bahan_baku || b.id || b.id_barang,
        nama_bahan: b.nama_produk || b.nama_barang || b.id_bahan_baku,
        nama_produk: b.nama_produk || b.nama_barang || b.id_bahan_baku,
        satuan: b.satuan || 'Gram'
      })) : []
      setStokBahan(formattedStok)

    } catch (err) {
      console.error('Error fetching finance data:', err)
      setError('Gagal memuat data keuangan: ' + (err.message || 'Error jaringan'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchFinanceData()
  }, [])

  // Universal Date Filter Matcher
  const isDateInRange = (itemDateStr) => {
    if (!itemDateStr) return true
    const dStr = String(itemDateStr).substring(0, 10)

    if (filterPeriodMode === 'month') {
      return dStr.startsWith(selectedMonth)
    }
    if (filterPeriodMode === 'custom') {
      if (customStartDate && dStr < customStartDate) return false
      if (customEndDate && dStr > customEndDate) return false
      return true
    }
    if (filterPeriodMode === 'quick') {
      const todayStr = new Date().toLocaleDateString('en-CA')
      if (quickPreset === 'today') return dStr === todayStr
      if (quickPreset === 'yesterday') {
        const y = new Date()
        y.setDate(y.getDate() - 1)
        return dStr === y.toLocaleDateString('en-CA')
      }
      if (quickPreset === '7days') {
        const d7 = new Date()
        d7.setDate(d7.getDate() - 7)
        return dStr >= d7.toLocaleDateString('en-CA') && dStr <= todayStr
      }
      if (quickPreset === 'this_month') {
        return dStr.startsWith(todayStr.substring(0, 7))
      }
      return true // 'all'
    }
    return true
  }

  // Active Period Label Description
  const activePeriodLabel = useMemo(() => {
    if (filterPeriodMode === 'month') {
      const opt = monthOptions.find(m => m.value === selectedMonth)
      return opt ? opt.label : selectedMonth
    }
    if (filterPeriodMode === 'custom') {
      return `${customStartDate || 'Awal'} s/d ${customEndDate || 'Sekarang'}`
    }
    if (filterPeriodMode === 'quick') {
      const map = {
        all: 'Semua Waktu',
        today: 'Hari Ini',
        yesterday: 'Kemarin',
        '7days': '7 Hari Terakhir',
        this_month: 'Bulan Ini'
      }
      return map[quickPreset] || 'Periode Aktif'
    }
    return 'Semua Periode'
  }, [filterPeriodMode, selectedMonth, monthOptions, quickPreset, customStartDate, customEndDate])

  // ==========================================
  // TAB 1: CASHFLOW FILTERED & METRICS
  // ==========================================
  const filteredCashflow = useMemo(() => {
    const list = cashflowList.filter(item => {
      if (!isDateInRange(item.tanggal)) return false

      const isPindah = isPindahSaldo(item)
      if (filterType === 'pemasukan' && (!(parseFloat(item.pemasukan || 0) > 0) || isPindah)) return false
      if (filterType === 'pengeluaran' && (!(parseFloat(item.pengeluaran || 0) > 0) || isPindah)) return false
      if (filterType === 'pindah' && !isPindah) return false

      if (filterPos !== 'all' && item.pos !== filterPos) return false

      if (filterCashflowJenis !== 'all' && String(item.jenis || '').toLowerCase() !== filterCashflowJenis.toLowerCase()) return false
      if (filterCashflowKategori !== 'all' && String(item.kategori || '').toLowerCase() !== filterCashflowKategori.toLowerCase()) return false

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchKet = String(item.keterangan_transaksi || '').toLowerCase().includes(q)
        const matchJenis = String(item.jenis || '').toLowerCase().includes(q)
        const matchKat = String(item.kategori || '').toLowerCase().includes(q)
        const matchPos = String(item.pos || '').toLowerCase().includes(q)
        if (!matchKet && !matchJenis && !matchKat && !matchPos) return false
      }

      return true
    })

    return [...list].sort((a, b) => {
      if (sortKey === 'nominal') {
        const isIncA = parseFloat(a.pemasukan || 0) > 0
        const isIncB = parseFloat(b.pemasukan || 0) > 0
        const nomA = parseFloat(isIncA ? a.pemasukan : a.pengeluaran || 0)
        const nomB = parseFloat(isIncB ? b.pemasukan : b.pengeluaran || 0)
        return sortOrder === 'asc' ? nomA - nomB : nomB - nomA
      }
      // default: tanggal
      const dateA = String(a.tanggal || '')
      const dateB = String(b.tanggal || '')
      if (dateA !== dateB) {
        return sortOrder === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA)
      }
      const createdA = String(a.created_at || a.id_cashflow || '')
      const createdB = String(b.created_at || b.id_cashflow || '')
      return sortOrder === 'asc' ? createdA.localeCompare(createdB) : createdB.localeCompare(createdA)
    })
  }, [cashflowList, filterPeriodMode, selectedMonth, quickPreset, customStartDate, customEndDate, filterType, filterPos, filterCashflowJenis, filterCashflowKategori, searchQuery, sortKey, sortOrder])

  // All-time real summary (Mengecualikan Pindah Saldo antar rekening)
  const allTimeSummary = useMemo(() => {
    let inc = 0
    let exp = 0
    cashflowList.forEach(item => {
      if (!isPindahSaldo(item)) {
        inc += parseFloat(item.pemasukan || 0)
        exp += parseFloat(item.pengeluaran || 0)
      }
    })
    return {
      totalIncome: inc,
      totalExpense: exp,
      totalBalance: inc - exp
    }
  }, [cashflowList])

  // Saldo Fisik & Rekening Real-time (All-time per masing-masing POS)
  const posAllTimeBalances = useMemo(() => {
    let cash = 0
    let rekY = 0
    let rekN = 0
    let rekR = 0

    cashflowList.forEach(item => {
      const p = parseFloat(item.pemasukan || 0)
      const k = parseFloat(item.pengeluaran || 0)
      const net = p - k

      if (item.pos === 'SALDO CASH') cash += net
      else if (item.pos === 'SALDO REKENING Y') rekY += net
      else if (item.pos === 'SALDO REKENING N') rekN += net
      else if (item.pos === 'SALDO REKENING R') rekR += net
    })

    return { cash, rekY, rekN, rekR }
  }, [cashflowList])

  const cashflowKpis = useMemo(() => {
    let inc = 0
    let exp = 0
    let cashNet = 0
    let rekYNet = 0
    let rekNNet = 0
    let rekRNet = 0

    filteredCashflow.forEach(item => {
      const p = parseFloat(item.pemasukan || 0)
      const k = parseFloat(item.pengeluaran || 0)
      const isPindah = isPindahSaldo(item)

      // Pemasukan & Pengeluaran murni di luar Pindah Saldo / Mutasi Rekening
      if (!isPindah) {
        inc += p
        exp += k
      }

      // Mutasi per dompet kas (Laci Cash & Rekening Bank) tetap mencatat perpindahan fisik
      const net = p - k
      if (item.pos === 'SALDO CASH') cashNet += net
      else if (item.pos === 'SALDO REKENING Y') rekYNet += net
      else if (item.pos === 'SALDO REKENING N') rekNNet += net
      else if (item.pos === 'SALDO REKENING R') rekRNet += net
    })

    return {
      totalInc: inc,
      totalExp: exp,
      netKas: inc - exp,
      cashNet,
      rekYNet,
      rekNNet,
      rekRNet,
      bankNet: rekYNet + rekNNet + rekRNet
    }
  }, [filteredCashflow])

  // ==========================================
  // TAB 2: CARWASH FILTERED & KPIS
  // ==========================================
  const filteredCarwash = useMemo(() => {
    const list = carwashList.filter(item => {
      if (!isDateInRange(item.tanggal)) return false

      if (filterCarwashPayment !== 'all' && item.metode_bayar !== filterCarwashPayment) return false
      if (filterCarwashStatus !== 'all' && item.status !== filterCarwashStatus) return false

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchPlat = String(item.plat_nomor || '').toLowerCase().includes(q)
        const matchModel = String(item.model || '').toLowerCase().includes(q)
        const matchLayanan = String(item.layanan || '').toLowerCase().includes(q)
        const matchTipe = String(item.tipe_kendaraan || '').toLowerCase().includes(q)
        if (!matchPlat && !matchModel && !matchLayanan && !matchTipe) return false
      }

      return true
    })

    return [...list].sort((a, b) => {
      if (sortKey === 'nominal') {
        const nomA = parseFloat(a.harga || 0)
        const nomB = parseFloat(b.harga || 0)
        return sortOrder === 'asc' ? nomA - nomB : nomB - nomA
      }
      const dtA = `${a.tanggal || ''} ${a.jam || ''}`
      const dtB = `${b.tanggal || ''} ${b.jam || ''}`
      return sortOrder === 'asc' ? dtA.localeCompare(dtB) : dtB.localeCompare(dtA)
    })
  }, [carwashList, filterPeriodMode, selectedMonth, quickPreset, customStartDate, customEndDate, filterCarwashPayment, filterCarwashStatus, searchQuery, sortKey, sortOrder])

  const carwashKpis = useMemo(() => {
    let units = 0
    let grossRev = 0
    let discount = 0
    let netRev = 0

    filteredCarwash.forEach(c => {
      if (c.status === 'Selesai') {
        units += 1
        const h = parseFloat(c.harga || 0)
        const d = parseFloat(c.diskon || 0)
        grossRev += (h + d)
        discount += d
        netRev += h
      }
    })

    return { units, grossRev, discount, netRev }
  }, [filteredCarwash])

  const itemTotalHarga = (item) => {
    return item?.subtotal || item?.total_harga || ((parseFloat(item?.qty || item?.jumlah || 1)) * (parseFloat(item?.harga_satuan) || 0))
  }

  // ==========================================
  // TAB 3: CAFE FILTERED & KPIS
  // ==========================================
  const filteredCafe = useMemo(() => {
    const list = cafeList.filter(item => {
      const itemDate = item.struk?.tanggal || ''
      if (!isDateInRange(itemDate)) return false

      const itemKat = item.kategori || 'Menu'
      if (filterCafeCategory !== 'all' && itemKat !== filterCafeCategory) return false

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchItem = String(item.nama_menu || item.nama_item || '').toLowerCase().includes(q)
        const matchKat = String(itemKat).toLowerCase().includes(q)
        const matchStruk = String(item.id_struk || '').toLowerCase().includes(q)
        const matchKasir = String(item.struk?.kasir || '').toLowerCase().includes(q)
        if (!matchItem && !matchKat && !matchStruk && !matchKasir) return false
      }

      return true
    })

    return [...list].sort((a, b) => {
      if (sortKey === 'nominal') {
        const totA = parseFloat(itemTotalHarga(a)) || 0
        const totB = parseFloat(itemTotalHarga(b)) || 0
        return sortOrder === 'asc' ? totA - totB : totB - totA
      }
      const dtA = `${a.struk?.tanggal || ''} ${a.struk?.jam || ''}`
      const dtB = `${b.struk?.tanggal || ''} ${b.struk?.jam || ''}`
      return sortOrder === 'asc' ? dtA.localeCompare(dtB) : dtB.localeCompare(dtA)
    })
  }, [cafeList, filterPeriodMode, selectedMonth, quickPreset, customStartDate, customEndDate, filterCafeCategory, searchQuery, sortKey, sortOrder])

  const cafeKpis = useMemo(() => {
    let totalItems = 0
    let totalRev = 0
    const countMap = {}

    filteredCafe.forEach(item => {
      const qty = parseFloat(item.qty || item.jumlah || 1)
      const tot = parseFloat(item.subtotal || item.total_harga || (qty * (parseFloat(item.harga_satuan) || 0)))
      totalItems += qty
      totalRev += tot

      const name = item.nama_menu || item.nama_item || 'Item Lain'
      countMap[name] = (countMap[name] || 0) + qty
    })

    let topSellingItem = '-'
    let maxCount = 0
    Object.entries(countMap).forEach(([name, count]) => {
      if (count > maxCount) {
        maxCount = count
        topSellingItem = `${name} (${count}x)`
      }
    })

    return { totalItems, totalRev, topSellingItem }
  }, [filteredCafe])

  const cafeCategoryOptions = useMemo(() => {
    const set = new Set()
    cafeList.forEach(c => {
      if (c.kategori) set.add(c.kategori)
    })
    return Array.from(set)
  }, [cafeList])

  // ==========================================
  // TAB 4: EXPENSES (PENGELUARAN) FILTERED & KPIS
  // ==========================================
  const filteredExpenses = useMemo(() => {
    const list = expensesList.filter(item => {
      if (!isDateInRange(item.tanggal)) return false
      if (isPindahSaldo(item)) return false

      if (filterExpenseJenis !== 'all' && String(item.jenis || '').toLowerCase() !== filterExpenseJenis.toLowerCase()) return false
      if (filterExpenseCategory !== 'all' && String(item.kategori || '').toLowerCase() !== filterExpenseCategory.toLowerCase()) return false
      if (filterPos !== 'all' && item.pos !== filterPos) return false

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const matchNama = String(item.nama_pengeluaran || item.keterangan || '').toLowerCase().includes(q)
        const matchJenis = String(item.jenis || '').toLowerCase().includes(q)
        const matchKat = String(item.kategori || '').toLowerCase().includes(q)
        if (!matchNama && !matchJenis && !matchKat) return false
      }

      return true
    })

    return [...list].sort((a, b) => {
      if (sortKey === 'nominal') {
        const nomA = parseFloat(a.nominal || a.total_harga || 0)
        const nomB = parseFloat(b.nominal || b.total_harga || 0)
        return sortOrder === 'asc' ? nomA - nomB : nomB - nomA
      }
      const dtA = `${a.tanggal || ''} ${a.jam || ''}`
      const dtB = `${b.tanggal || ''} ${b.jam || ''}`
      return sortOrder === 'asc' ? dtA.localeCompare(dtB) : dtB.localeCompare(dtA)
    })
  }, [expensesList, filterPeriodMode, selectedMonth, quickPreset, customStartDate, customEndDate, filterExpenseJenis, filterExpenseCategory, filterPos, searchQuery, sortKey, sortOrder])

  const expensesKpis = useMemo(() => {
    let opTotal = 0
    let rawTotal = 0
    let casbonTotal = 0
    let totalAll = 0

    filteredExpenses.forEach(item => {
      const nom = parseFloat(item.nominal || item.total_harga || 0)
      totalAll += nom
      const kat = String(item.kategori || '').toLowerCase()
      if (kat.includes('bahan baku')) rawTotal += nom
      else if (kat.includes('casbon')) casbonTotal += nom
      else opTotal += nom
    })

    return { opTotal, rawTotal, casbonTotal, totalAll }
  }, [filteredExpenses])

  // ==========================================
  // PAGINATION CONTROLLER
  // ==========================================
  const currentActiveList = useMemo(() => {
    if (activeTab === 'cashflow') return filteredCashflow
    if (activeTab === 'carwash') return filteredCarwash
    if (activeTab === 'cafe') return filteredCafe
    if (activeTab === 'expenses') return filteredExpenses
    return []
  }, [activeTab, filteredCashflow, filteredCarwash, filteredCafe, filteredExpenses])

  const totalPages = useMemo(() => {
    if (pageSize === 0) return 1
    return Math.ceil(currentActiveList.length / pageSize) || 1
  }, [currentActiveList, pageSize])

  const paginatedList = useMemo(() => {
    if (pageSize === 0) return currentActiveList
    const start = (currentPage - 1) * pageSize
    return currentActiveList.slice(start, start + pageSize)
  }, [currentActiveList, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [
    activeTab, 
    filterPeriodMode, 
    selectedMonth, 
    quickPreset, 
    customStartDate, 
    customEndDate, 
    searchQuery, 
    filterType, 
    filterPos, 
    filterCashflowJenis,
    filterCashflowKategori,
    filterExpenseJenis,
    filterExpenseCategory,
    filterCarwashPayment,
    filterCarwashStatus,
    filterCafeCategory,
    sortKey,
    sortOrder,
    pageSize
  ])

  // ==========================================
  // EXPORT CSV HANDLER
  // ==========================================
  const handleExportCSV = () => {
    const dateTag = filterPeriodMode === 'month' ? selectedMonth : 
                    filterPeriodMode === 'custom' ? `${customStartDate}_sd_${customEndDate}` : quickPreset

    if (activeTab === 'cashflow') {
      const headers = [
        { label: 'ID Transaksi', key: 'id_cashflow' },
        { label: 'Tanggal', key: 'tanggal' },
        { label: 'Jenis', key: 'jenis' },
        { label: 'Kategori', key: 'kategori' },
        { label: 'Keterangan', key: 'keterangan_transaksi' },
        { label: 'POS Kas', key: 'pos' },
        { label: 'Pemasukan (Rp)', key: 'pemasukan' },
        { label: 'Pengeluaran (Rp)', key: 'pengeluaran' },
        { label: 'Waktu Input', key: 'created_at' }
      ]
      const csvStr = generateCSVString(headers, filteredCashflow)
      downloadCSV(csvStr, `Laporan_Cashflow_JayaBersama_${dateTag}`)
    } else if (activeTab === 'carwash') {
      const headers = [
        { label: 'ID Carwash', key: 'id_carwash' },
        { label: 'ID Struk', key: 'id_struk' },
        { label: 'Tanggal', key: 'tanggal' },
        { label: 'Jam', key: 'jam' },
        { label: 'Plat Nomor', key: 'plat_nomor' },
        { label: 'Tipe', key: 'tipe_kendaraan' },
        { label: 'Model', key: 'model' },
        { label: 'Layanan', key: 'layanan' },
        { label: 'Harga (Rp)', key: 'harga' },
        { label: 'Diskon (Rp)', key: 'diskon' },
        { label: 'Metode Bayar', key: 'metode_bayar' },
        { label: 'Status', key: 'status' }
      ]
      const csvStr = generateCSVString(headers, filteredCarwash)
      downloadCSV(csvStr, `Laporan_Carwash_JayaBersama_${dateTag}`)
    } else if (activeTab === 'cafe') {
      const headers = [
        { label: 'ID Detail', key: 'id_detail' },
        { label: 'ID Struk', key: 'id_struk' },
        { label: 'Tanggal', accessor: (r) => r.struk?.tanggal || '' },
        { label: 'Jam', accessor: (r) => r.struk?.jam || '' },
        { label: 'Kasir', accessor: (r) => r.struk?.kasir || '' },
        { label: 'Nama Menu', accessor: (r) => r.nama_menu || r.nama_item || '' },
        { label: 'Kategori', accessor: (r) => r.kategori || 'Menu' },
        { label: 'Qty', accessor: (r) => r.qty || r.jumlah || 1 },
        { label: 'Harga Satuan (Rp)', key: 'harga_satuan' },
        { label: 'Subtotal (Rp)', accessor: (r) => r.subtotal || r.total_harga || ((r.qty || r.jumlah || 1) * (r.harga_satuan || 0)) }
      ]
      const csvStr = generateCSVString(headers, filteredCafe)
      downloadCSV(csvStr, `Laporan_Cafe_JayaBersama_${dateTag}`)
    } else if (activeTab === 'expenses') {
      const headers = [
        { label: 'ID Pengeluaran', key: 'id_pengeluaran' },
        { label: 'Tanggal', key: 'tanggal' },
        { label: 'Jam', key: 'jam' },
        { label: 'Keterangan', accessor: (r) => r.nama_pengeluaran || r.keterangan || '' },
        { label: 'Jenis', key: 'jenis' },
        { label: 'Kategori', key: 'kategori' },
        { label: 'POS Kas', key: 'pos' },
        { label: 'Nominal (Rp)', accessor: (r) => r.nominal || r.total_harga || 0 }
      ]
      const csvStr = generateCSVString(headers, filteredExpenses)
      downloadCSV(csvStr, `Laporan_Pengeluaran_JayaBersama_${dateTag}`)
    }
  }

  // ==========================================
  // CRUD OPERATIONS
  // ==========================================
  
  // 1. Create Expense
  const handleSaveExpense = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const validation = validateExpenseForm(expenseForm, barangMasukList)
    if (!validation.isValid) return setError(validation.error)

    setSubmitting(true)
    try {
      const newCfId = generateUUID()
      const todayDate = new Date().toLocaleDateString('en-CA')
      const timestamp = new Date().toISOString()

      const payload = formatExpensePayload({
        form: expenseForm,
        barangMasukList,
        stokBahan,
        newCfId,
        todayDate,
        timestamp
      })

      const { error: cfErr } = await supabase.from('cashflow').insert(payload.cashflow)
      if (cfErr) throw cfErr

      if (payload.details && payload.details.length > 0) {
        const { error: bmErr } = await supabase.from('barang_masuk').insert(payload.details)
        if (bmErr) throw bmErr
      }

      // Save custom options if applicable
      saveCustomOption('jenis', expenseForm.jenis)
      saveCustomOption('kategori', expenseForm.kategori)

      setSuccess('Pengeluaran berhasil dicatat langsung ke Cashflow!')
      setExpenseForm({
        tanggal: new Date().toLocaleDateString('en-CA'),
        jenis: 'Pengeluaran Bersama',
        kategori: 'Listrik, Air & Utilitas',
        total_harga: '',
        keterangan: '',
        pos: 'SALDO CASH'
      })
      setIsCustomExpenseJenis(false)
      setIsCustomExpenseKategori(false)
      setBarangMasukList([])
      setShowExpenseModal(false)
      await fetchFinanceData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Error saving expense:', err)
      setError(err.message || 'Gagal menyimpan pengeluaran.')
    } finally {
      setSubmitting(false)
    }
  }

  // 2. Create Income
  const handleSaveIncome = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const validation = validateIncomeForm(incomeForm)
    if (!validation.isValid) return setError(validation.error)

    setSubmitting(true)
    try {
      const newCfId = generateUUID()
      const todayDate = new Date().toLocaleDateString('en-CA')
      const timestamp = new Date().toISOString()

      const payload = formatIncomePayload({
        form: incomeForm,
        newCfId,
        todayDate,
        timestamp
      })

      const { error: cfErr } = await supabase.from('cashflow').insert(payload)
      if (cfErr) throw cfErr

      // Save custom options if applicable
      saveCustomOption('income_jenis', incomeForm.jenis)
      saveCustomOption('income_kategori', incomeForm.kategori)

      setSuccess('Pemasukan manual berhasil dicatat!')
      setIncomeForm({
        tanggal: new Date().toLocaleDateString('en-CA'),
        nominal: '',
        keterangan: '',
        jenis: 'Pemasukan',
        kategori: 'Pemasukan Lain-lain',
        pos: 'SALDO CASH'
      })
      setIsCustomIncomeJenis(false)
      setIsCustomIncomeKategori(false)
      setShowIncomeModal(false)
      await fetchFinanceData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Error saving income:', err)
      setError(err.message || 'Gagal menyimpan pemasukan.')
    } finally {
      setSubmitting(false)
    }
  }

  // 2B. Process Pindah Saldo (Transfer Antar Rekening/Kas)
  const handleSaveTransfer = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const nom = parseFloat(transferForm.nominal)
    if (isNaN(nom) || nom <= 0) {
      return setError('Nominal perpindahan saldo harus lebih besar dari 0.')
    }
    if (transferForm.pos_asal === transferForm.pos_tujuan) {
      return setError('Pos asal dan Pos tujuan tidak boleh sama.')
    }

    setSubmitting(true)
    try {
      const timestamp = new Date().toISOString()
      const ket = transferForm.keterangan?.trim() || `Pindah Saldo dari ${transferForm.pos_asal} ke ${transferForm.pos_tujuan}`

      const insertions = [
        // 1. Pengeluaran dari Pos Asal
        {
          id_cashflow: generateUUID(),
          tanggal: transferForm.tanggal || new Date().toLocaleDateString('en-CA'),
          jenis: 'Pindah',
          kategori: 'Pindah',
          pos: transferForm.pos_asal,
          pemasukan: 0,
          pengeluaran: nom,
          keterangan_transaksi: ket,
          created_at: timestamp
        },
        // 2. Pemasukan ke Pos Tujuan
        {
          id_cashflow: generateUUID(),
          tanggal: transferForm.tanggal || new Date().toLocaleDateString('en-CA'),
          jenis: 'Pindah',
          kategori: 'Pindah',
          pos: transferForm.pos_tujuan,
          pemasukan: nom,
          pengeluaran: 0,
          keterangan_transaksi: ket,
          created_at: timestamp
        }
      ]

      const { error: insErr } = await supabase.from('cashflow').insert(insertions)
      if (insErr) throw insErr

      setSuccess(`Berhasil memindahkan saldo sebesar ${formatRupiah(nom)} dari ${transferForm.pos_asal} ke ${transferForm.pos_tujuan}!`)
      setShowTransferModal(false)
      setTransferForm({
        tanggal: new Date().toLocaleDateString('en-CA'),
        pos_asal: 'SALDO CASH',
        pos_tujuan: 'SALDO REKENING Y',
        nominal: '',
        keterangan: ''
      })
      await fetchFinanceData()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      console.error('Error transferring balance:', err)
      setError(err.message || 'Gagal memproses pindah saldo.')
    } finally {
      setSubmitting(false)
    }
  }

  // 3. Open Edit Modal
  const handleOpenEdit = (item, type) => {
    setEditingItem(item)
    if (type === 'cashflow') {
      setEditForm({
        table: 'cashflow',
        id: item.id_cashflow,
        tanggal: item.tanggal || '',
        jam: '',
        keterangan: item.keterangan_transaksi || '',
        jenis: item.jenis || '',
        kategori: item.kategori || '',
        pos: item.pos || 'SALDO CASH',
        pemasukan: parseFloat(item.pemasukan) || 0,
        pengeluaran: parseFloat(item.pengeluaran) || 0
      })
    } else if (type === 'carwash') {
      setEditForm({
        table: 'carwash',
        id: item.id_carwash,
        tanggal: item.tanggal || '',
        jam: item.jam || '',
        keterangan: `${item.plat_nomor} - ${item.model}`,
        plat_nomor: item.plat_nomor,
        model: item.model,
        layanan: item.layanan,
        harga: parseFloat(item.harga) || 0,
        diskon: parseFloat(item.diskon) || 0,
        metode_bayar: item.metode_bayar || 'CASH',
        status: item.status || 'Selesai'
      })
    } else if (type === 'cafe') {
      setEditForm({
        table: 'cafe',
        id: item.id_detail,
        tanggal: item.struk?.tanggal || '',
        jam: item.struk?.jam || '',
        nama_item: item.nama_item || '',
        kategori: item.kategori || '',
        jumlah: item.jumlah || 1,
        harga_satuan: item.harga_satuan || 0,
        total_harga: item.total_harga || 0,
        diskon: item.diskon || 0
      })
    } else if (type === 'expenses') {
      setEditForm({
        table: 'pengeluaran',
        id: item.id_pengeluaran,
        tanggal: item.tanggal || '',
        jam: item.jam || '',
        keterangan: item.nama_pengeluaran || item.keterangan || '',
        jenis: item.jenis || 'pengeluaran Cafe',
        kategori: item.kategori || 'Operasional',
        pos: item.pos || 'SALDO CASH',
        nominal: parseFloat(item.nominal || item.total_harga || 0)
      })
    }
    setShowEditModal(true)
  }

  // 4. Submit Edit Modal
  const handleSaveEdit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      if (editForm.table === 'cashflow') {
        const validation = validateEditCashflowForm({
          keterangan_transaksi: editForm.keterangan,
          pemasukan: editForm.pemasukan,
          pengeluaran: editForm.pengeluaran
        })
        if (!validation.isValid) throw new Error(validation.error)

        const { error: updErr } = await supabase
          .from('cashflow')
          .update({
            tanggal: editForm.tanggal,
            keterangan_transaksi: editForm.keterangan,
            jenis: editForm.jenis,
            kategori: editForm.kategori,
            pos: editForm.pos,
            pemasukan: parseFloat(editForm.pemasukan) || 0,
            pengeluaran: parseFloat(editForm.pengeluaran) || 0
          })
          .eq('id_cashflow', editForm.id)
        if (updErr) throw updErr
      } else if (editForm.table === 'carwash') {
        const { error: updErr } = await supabase
          .from('carwash')
          .update({
            tanggal: editForm.tanggal,
            jam: editForm.jam,
            plat_nomor: editForm.plat_nomor,
            model: editForm.model,
            layanan: editForm.layanan,
            harga: parseFloat(editForm.harga) || 0,
            diskon: parseFloat(editForm.diskon) || 0,
            metode_bayar: editForm.metode_bayar,
            status: editForm.status
          })
          .eq('id_carwash', editForm.id)
        if (updErr) throw updErr
      } else if (editForm.table === 'cafe') {
        const { error: updErr } = await supabase
          .from('cafe')
          .update({
            nama_item: editForm.nama_item,
            kategori: editForm.kategori,
            jumlah: parseFloat(editForm.jumlah) || 1,
            harga_satuan: parseFloat(editForm.harga_satuan) || 0,
            total_harga: parseFloat(editForm.total_harga) || 0,
            diskon: parseFloat(editForm.diskon) || 0
          })
          .eq('id_detail', editForm.id)
        if (updErr) throw updErr
      } else if (editForm.table === 'pengeluaran') {
        const { error: updErr } = await supabase
          .from('pengeluaran')
          .update({
            tanggal: editForm.tanggal,
            jam: editForm.jam,
            nama_pengeluaran: editForm.keterangan,
            jenis: editForm.jenis,
            kategori: editForm.kategori,
            pos: editForm.pos,
            nominal: parseFloat(editForm.nominal) || 0
          })
          .eq('id_pengeluaran', editForm.id)
        if (updErr) throw updErr
      }

      setSuccess('Data transaksi berhasil diperbarui!')
      setShowEditModal(false)
      await fetchFinanceData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Error updating transaction:', err)
      setError(err.message || 'Gagal memperbarui transaksi.')
    } finally {
      setSubmitting(false)
    }
  }

  // 5. Delete Action
  const handleDeleteItem = async (item, type) => {
    const label = type === 'cashflow' ? item.keterangan_transaksi :
                  type === 'carwash' ? `${item.plat_nomor} (${item.layanan})` :
                  type === 'cafe' ? `${item.nama_item} (ID: ${item.id_detail})` :
                  (item.nama_pengeluaran || item.keterangan)

    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus data: "${label}"?`, `Hapus Data ${type.toUpperCase()}`)
    if (!confirmed) return

    setLoading(true)
    setError('')
    setSuccess('')
    try {
      if (type === 'cashflow') {
        const { error: delErr } = await supabase.from('cashflow').delete().eq('id_cashflow', item.id_cashflow)
        if (delErr) throw delErr
        await supabase.from('barang_masuk').delete().eq('id_cashflow', item.id_cashflow)
      } else if (type === 'carwash') {
        const { error: delErr } = await supabase.from('carwash').delete().eq('id_carwash', item.id_carwash)
        if (delErr) throw delErr
      } else if (type === 'cafe') {
        const { error: delErr } = await supabase.from('cafe').delete().eq('id_detail', item.id_detail)
        if (delErr) throw delErr
      } else if (type === 'expenses') {
        const { error: delErr } = await supabase.from('pengeluaran').delete().eq('id_pengeluaran', item.id_pengeluaran)
        if (delErr) throw delErr
      }

      setSuccess('Data berhasil dihapus!')
      await fetchFinanceData()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Error deleting item:', err)
      setError(err.message || 'Gagal menghapus data.')
    } finally {
      setLoading(false)
    }
  }

  // Stock Material Helpers
  const addBarangMasukItem = () => {
    const defaultBahan = stokBahan[0]?.id_bahan_baku || ''
    const defaultSatuan = stokBahan[0]?.satuan || 'Gram'
    setBarangMasukList(prev => [
      ...prev,
      { id_bahan_baku: defaultBahan, jumlah: '', harga_satuan: '', satuan: defaultSatuan }
    ])
  }
  const removeBarangMasukItem = (index) => {
    setBarangMasukList(prev => prev.filter((_, i) => i !== index))
  }
  const updateBarangMasukItem = (index, field, value) => {
    setBarangMasukList(prev => 
      prev.map((item, i) => {
        if (i === index) {
          const updated = { ...item, [field]: value }
          if (field === 'id_bahan_baku') {
            const match = stokBahan.find(b => b.id_bahan_baku === value || b.nama_bahan === value || b.nama_produk === value)
            if (match) updated.satuan = match.satuan
          }
          return updated
        }
        return item
      })
    )
  }

  useEffect(() => {
    if (expenseForm.kategori === 'Bahan Baku' && barangMasukList.length > 0) {
      const computedTotal = barangMasukList.reduce((sum, item) => sum + ((parseFloat(item.jumlah) || 0) * (parseFloat(item.harga_satuan) || 0)), 0)
      setExpenseForm(prev => ({ ...prev, total_harga: computedTotal > 0 ? computedTotal : '' }))
    }
  }, [barangMasukList, expenseForm.kategori])

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <DollarSign size={28} className="text-primary" />
            Monitoring Keuangan
          </h1>
          <p className="text-slate-400 text-xs md:text-sm mt-0.5">
            Pusat pengelolaan cashflow, log carwash, log cafe, pengeluaran & ekspor data
          </p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button
            onClick={() => { setRefreshing(true); fetchFinanceData(); }}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded-xl text-xs font-bold border border-slate-800 transition-all"
            title="Refresh Data"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-brand-blue' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setShowIncomeModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-emerald-400 active:bg-emerald-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-brand-emerald/20 transition-all text-xs"
          >
            <Plus size={15} />
            + Pemasukan
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-rose hover:bg-rose-500 active:bg-rose-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-brand-rose/20 transition-all text-xs"
          >
            <Plus size={15} />
            + Pengeluaran
          </button>
          <button
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-sky-500/20 transition-all text-xs"
          >
            <RotateCcw size={14} />
            ⇄ Pindah Saldo
          </button>
        </div>
      </div>

      {/* Alert Notices */}
      {success && (
        <div className="p-3.5 rounded-xl bg-primary/10 border border-brand-emerald/20 text-primary text-xs flex items-center gap-2.5 animate-fade-in">
          <CheckCircle size={16} />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5 animate-fade-in">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Global Net Balance Summary Cards */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">Ringkasan Finansial Akumulatif (Sepanjang Waktu)</span>
          <span className="text-[10px] text-slate-500">Total riil sistem sejak awal operasional</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="glass-panel p-4.5 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors">
            <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Total Kas Bersih (All-time)</p>
            <h3 className={`text-2xl font-black mt-1.5 ${allTimeSummary.totalBalance >= 0 ? 'text-primary' : 'text-rose-400'}`}>
              {formatRupiah(allTimeSummary.totalBalance)}
            </h3>
            <span className="text-[10px] text-slate-500 mt-1 block">Net akumulasi seluruh pemasukan riil - pengeluaran riil</span>
          </div>
          <div className="glass-panel p-4.5 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="flex justify-between items-center">
              <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Total Pemasukan Riil (All-time)</p>
              <ArrowUpRight size={16} className="text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-white mt-1.5">{formatRupiah(allTimeSummary.totalIncome)}</h3>
            <span className="text-[10px] text-slate-500 mt-1 block">Akumulasi struk lunas & kas masuk (di luar pindah saldo)</span>
          </div>
          <div className="glass-panel p-4.5 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="flex justify-between items-center">
              <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Total Pengeluaran Riil (All-time)</p>
              <ArrowDownRight size={16} className="text-brand-rose" />
            </div>
            <h3 className="text-2xl font-bold text-white mt-1.5">{formatRupiah(allTimeSummary.totalExpense)}</h3>
            <span className="text-[10px] text-slate-500 mt-1 block">Akumulasi beban operasional riil (di luar pindah saldo)</span>
          </div>
        </div>
      </div>

      {/* Real-Time Wallet Balances Cards (Laci Cash, Mandiri Utama, Mandiri Ops, Rekening R) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">Posisi Saldo Riil per Dompet / Rekening (Saat Ini)</span>
          <span className="text-[10px] text-slate-500">Saldo fisik di laci kasir & mutasi bank</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-colors">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Laci Kasir (Cash Fisik)</span>
              <h4 className={`text-base md:text-lg font-black mt-0.5 ${posAllTimeBalances.cash >= 0 ? 'text-white' : 'text-rose-400'}`}>
                {formatRupiah(posAllTimeBalances.cash)}
              </h4>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-800/80 text-slate-300 flex items-center justify-center font-bold text-xs">
              💵
            </div>
          </div>

          <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-colors">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Mandiri Utama (Rek Y)</span>
              <h4 className={`text-base md:text-lg font-black mt-0.5 ${posAllTimeBalances.rekY >= 0 ? 'text-primary' : 'text-rose-400'}`}>
                {formatRupiah(posAllTimeBalances.rekY)}
              </h4>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs">
              Y
            </div>
          </div>

          <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-colors">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Mandiri Ops (Rek N)</span>
              <h4 className={`text-base md:text-lg font-black mt-0.5 ${posAllTimeBalances.rekN >= 0 ? 'text-brand-blue' : 'text-rose-400'}`}>
                {formatRupiah(posAllTimeBalances.rekN)}
              </h4>
            </div>
            <div className="w-8 h-8 rounded-lg bg-brand-blue/10 text-brand-blue flex items-center justify-center font-bold text-xs">
              N
            </div>
          </div>

          <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-colors">
            <div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Saldo Rekening R (Cadangan)</span>
              <h4 className={`text-base md:text-lg font-black mt-0.5 ${posAllTimeBalances.rekR >= 0 ? 'text-purple-400' : 'text-rose-400'}`}>
                {formatRupiah(posAllTimeBalances.rekR)}
              </h4>
            </div>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-xs">
              R
            </div>
          </div>
        </div>
      </div>

      {/* Universal Flexible Filter Panel */}
      <div className="glass-panel p-4 md:p-5 rounded-2xl border border-slate-800 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-brand-blue" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Filter Rentang Waktu:</span>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
              {activePeriodLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setFilterPeriodMode('month')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  filterPeriodMode === 'month' ? 'bg-brand-blue text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pilih Bulan
              </button>
              <button
                onClick={() => setFilterPeriodMode('quick')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  filterPeriodMode === 'quick' ? 'bg-brand-blue text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Preset Cepat
              </button>
              <button
                onClick={() => setFilterPeriodMode('custom')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  filterPeriodMode === 'custom' ? 'bg-brand-blue text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Kustom Tanggal
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Period Inputs */}
        <div className="flex flex-wrap items-center gap-3">
          {filterPeriodMode === 'month' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 font-semibold">Bulan:</label>
              <CustomSelect
                value={selectedMonth}
                onChange={(val) => setSelectedMonth(val)}
                options={monthOptions}
                size="xs"
                variant="blue"
                className="w-48"
              />
            </div>
          )}

          {filterPeriodMode === 'quick' && (
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'today', label: 'Hari Ini' },
                { id: 'yesterday', label: 'Kemarin' },
                { id: '7days', label: '7 Hari Terakhir' },
                { id: 'this_month', label: 'Bulan Ini' },
                { id: 'all', label: 'Semua Waktu' }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setQuickPreset(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    quickPreset === p.id ? 'bg-slate-800 text-white border border-brand-blue/50' : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {filterPeriodMode === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>Dari:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>Sampai:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white text-xs"
                />
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="flex-1 min-w-[200px] relative ml-auto">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Cari keterangan, menu, plat nomor, kategori..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-emerald"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2 text-slate-500 hover:text-white">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Main Tabs Navigation based on Tenant Capabilities */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
        {[
          { id: 'cashflow', label: '1. Arus Kas (Cashflow)', icon: DollarSign, count: filteredCashflow.length, visible: true },
          { id: 'carwash', label: '2. Log Carwash', icon: Car, count: filteredCarwash.length, visible: features.hasCarwash },
          { id: 'cafe', label: '3. Log Cafe (F&B)', icon: Coffee, count: filteredCafe.length, visible: features.hasCafe },
          { id: 'expenses', label: '4. Pengeluaran (Expenses)', icon: Receipt, count: filteredExpenses.length, visible: true }
        ].filter(t => t.visible).map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-bold text-xs md:text-sm border-b-2 transition-all whitespace-nowrap ${
                isActive 
                  ? 'border-brand-emerald text-primary bg-primary/5' 
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                isActive ? 'bg-primary text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* TAB CONTENT 1: CASHFLOW */}
      {activeTab === 'cashflow' && (
        <div className="space-y-6 animate-fade-in">
          {/* Mini KPI Bar */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Pemasukan Periode</span>
              <p className="text-sm md:text-base font-black text-primary mt-1">{formatRupiah(cashflowKpis.totalInc)}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Pengeluaran Periode</span>
              <p className="text-sm md:text-base font-black text-rose-400 mt-1">{formatRupiah(cashflowKpis.totalExp)}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Net Laci Cash</span>
              <p className={`text-sm md:text-base font-black mt-1 ${cashflowKpis.cashNet >= 0 ? 'text-white' : 'text-rose-400'}`}>
                {formatRupiah(cashflowKpis.cashNet)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Net Rekening Y</span>
              <p className={`text-sm md:text-base font-black mt-1 ${cashflowKpis.rekYNet >= 0 ? 'text-primary' : 'text-rose-400'}`}>
                {formatRupiah(cashflowKpis.rekYNet)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Net Rekening N</span>
              <p className={`text-sm md:text-base font-black mt-1 ${cashflowKpis.rekNNet >= 0 ? 'text-brand-blue' : 'text-rose-400'}`}>
                {formatRupiah(cashflowKpis.rekNNet)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Net Rekening R</span>
              <p className={`text-sm md:text-base font-black mt-1 ${cashflowKpis.rekRNet >= 0 ? 'text-purple-400' : 'text-rose-400'}`}>
                {formatRupiah(cashflowKpis.rekRNet)}
              </p>
            </div>
          </div>

          {/* Cashflow Table Section */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">Log Transaksi Cashflow</h3>
                
                {/* Specific Filters: Arus */}
                <CustomSelect
                  value={filterType}
                  onChange={(val) => setFilterType(val)}
                  options={[
                    { value: 'all', label: 'Semua Arus' },
                    { value: 'pemasukan', label: 'Pemasukan Murni (+)' },
                    { value: 'pengeluaran', label: 'Pengeluaran Murni (-)' },
                    { value: 'pindah', label: 'Pindah Saldo (Mutasi)' }
                  ]}
                  size="xs"
                  variant="emerald"
                />

                {/* Specific Filters: Jenis */}
                <CustomSelect
                  value={filterCashflowJenis}
                  onChange={(val) => handleFilterCashflowJenisChange(val)}
                  options={[
                    { value: 'all', label: 'Semua Jenis' },
                    ...cashflowJenisList.map(j => ({ value: j, label: j }))
                  ]}
                  searchable={cashflowJenisList.length > 5}
                  size="xs"
                  variant="emerald"
                />

                {/* Specific Filters: Kategori (Terkunci sesuai jenis yang dipilih) */}
                <CustomSelect
                  value={filterCashflowKategori}
                  onChange={(val) => setFilterCashflowKategori(val)}
                  options={[
                    { value: 'all', label: `Semua Kategori ${filterCashflowJenis !== 'all' ? `(${filterCashflowJenis})` : ''}` },
                    ...cashflowFilteredKategoriOptions.map(k => ({ value: k, label: k }))
                  ]}
                  searchable={cashflowFilteredKategoriOptions.length > 5}
                  size="xs"
                  variant="emerald"
                />

                {/* Specific Filters: POS Kas */}
                <CustomSelect
                  value={filterPos}
                  onChange={(val) => setFilterPos(val)}
                  options={[
                    { value: 'all', label: 'Semua POS Kas' },
                    ...posOptions.map(p => ({ value: p, label: p }))
                  ]}
                  size="xs"
                  variant="emerald"
                />

                {/* Reset filter button if active */}
                {(filterType !== 'all' || filterCashflowJenis !== 'all' || filterCashflowKategori !== 'all' || filterPos !== 'all' || searchQuery !== '' || sortKey !== 'tanggal' || sortOrder !== 'desc') && (
                  <button
                    onClick={handleResetFilters}
                    className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-bold px-2 py-1 rounded bg-amber-400/10 border border-amber-400/20 transition-colors"
                    title="Reset Filter Tabel"
                  >
                    <RotateCcw size={12} />
                    Reset
                  </button>
                )}
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors"
              >
                <Download size={14} className="text-primary" />
                Unduh CSV
              </button>
            </div>

            {/* Table */}
            <TableContainer>
              <Table>
                <thead>
                  <tr className="bg-subsurface/90 border-b border-border text-muted font-bold uppercase text-[10px] sm:text-xs">
                    <th 
                      className="p-3 cursor-pointer select-none hover:bg-slate-900/60 transition-colors group"
                      onClick={() => handleSortToggle('tanggal')}
                      title="Klik untuk mengurutkan tanggal (menaik/menurun)"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tanggal</span>
                        {sortKey === 'tanggal' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={14} className="text-primary" />
                          ) : (
                            <ArrowUp size={14} className="text-primary" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span>Jenis / Kategori</span>
                        {(filterCashflowJenis !== 'all' || filterCashflowKategori !== 'all') && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" title="Filter Jenis/Kategori Aktif" />
                        )}
                      </div>
                    </th>
                    <th className="p-3">Keterangan</th>
                    <th className="p-3">POS Kas</th>
                    <th 
                      className="p-3 text-right cursor-pointer select-none hover:bg-slate-900/60 transition-colors group"
                      onClick={() => handleSortToggle('nominal')}
                      title="Klik untuk mengurutkan nominal (menaik/menurun)"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Nominal</span>
                        {sortKey === 'nominal' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={14} className="text-primary" />
                          ) : (
                            <ArrowUp size={14} className="text-primary" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {paginatedList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted">
                        <DollarSign size={32} className="mx-auto text-slate-600 mb-2 opacity-60" />
                        <p className="font-bold text-sm text-slate-300">Tidak ada log cashflow pada periode ini ({activePeriodLabel})</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          Gunakan filter tanggal di atas atau klik tombol berikut untuk melihat riwayat:
                        </p>
                        <button
                          onClick={() => { setFilterPeriodMode('quick'); setQuickPreset('all'); }}
                          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-brand-emerald/30 text-xs font-bold transition-all"
                        >
                          Tampilkan Semua Waktu ({cashflowList.length} Transaksi)
                        </button>
                      </td>
                    </tr>
                  ) : (
                    paginatedList.map(item => {
                      const isPindah = isPindahSaldo(item)
                      const isInc = parseFloat(item.pemasukan || 0) > 0
                      const nominal = isInc ? item.pemasukan : item.pengeluaran
                      return (
                        <tr key={item.id_cashflow} className="hover:bg-slate-850/30 transition-colors">
                          <td className="p-3 text-slate-400 font-mono">{item.tanggal}</td>
                          <td className="p-3">
                            {isPindah ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                ⇄ Pindah Saldo
                              </span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isInc ? 'bg-primary/10 text-primary' : 'bg-brand-rose/10 text-brand-rose'
                              }`}>
                                {item.jenis || (isInc ? 'Pemasukan' : 'Pengeluaran')}
                              </span>
                            )}
                            {item.kategori && !isPindah && <span className="ml-1 text-[10px] text-slate-500 font-sans">({item.kategori})</span>}
                          </td>
                          <td className="p-3 font-semibold text-white max-w-xs truncate">{item.keterangan_transaksi}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded font-mono text-[10px] text-slate-400 bg-slate-900 border border-slate-800">
                              {item.pos}
                            </span>
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${
                            isPindah ? 'text-sky-300' : (isInc ? 'text-primary' : 'text-rose-400')
                          }`}>
                            {isInc ? '+' : '-'} {formatRupiah(nominal)}
                            {isPindah && <span className="text-[9px] text-slate-500 block font-sans font-normal">[Mutasi Kas/Bank]</span>}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(item, 'cashflow')}
                                className="p-1 text-slate-400 hover:text-brand-blue transition-colors"
                                title="Edit Transaksi"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item, 'cashflow')}
                                className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                                title="Hapus Transaksi"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </Table>
            </TableContainer>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 text-xs text-slate-400 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <span>Baris per halaman:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white text-xs font-semibold focus:outline-none focus:border-brand-emerald cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>Semua</option>
                </select>
                <span>Total: <strong className="text-white">{filteredCashflow.length}</strong> data</span>
              </div>

              {pageSize > 0 && totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span>Halaman <strong className="text-white">{currentPage}</strong> dari {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: CARWASH LOG */}
      {activeTab === 'carwash' && (
        <div className="space-y-6 animate-fade-in">
          {/* Mini KPI Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Total Unit Dicuci</span>
              <p className="text-base md:text-lg font-black text-white mt-1">{carwashKpis.units} Kendaraan</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Total Omzet Kotor</span>
              <p className="text-base md:text-lg font-black text-primary mt-1">{formatRupiah(carwashKpis.grossRev)}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Total Diskon Diberikan</span>
              <p className="text-base md:text-lg font-black text-rose-400 mt-1">{formatRupiah(carwashKpis.discount)}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Omzet Bersih (Pemasukan)</span>
              <p className="text-base md:text-lg font-black text-brand-blue mt-1">{formatRupiah(carwashKpis.netRev)}</p>
            </div>
          </div>

          {/* Carwash Table Section */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">Log Transaksi Carwash</h3>
                <CustomSelect
                  value={filterCarwashPayment}
                  onChange={(val) => setFilterCarwashPayment(val)}
                  options={[
                    { value: 'all', label: 'Semua Metode Bayar' },
                    { value: 'CASH', label: 'CASH' },
                    { value: 'QRIS', label: 'QRIS' },
                    { value: 'SPLIT', label: 'SPLIT' }
                  ]}
                  size="xs"
                  variant="blue"
                />
                <CustomSelect
                  value={filterCarwashStatus}
                  onChange={(val) => setFilterCarwashStatus(val)}
                  options={[
                    { value: 'all', label: 'Semua Status' },
                    { value: 'Selesai', label: 'Selesai' },
                    { value: 'Proses', label: 'Proses' },
                    { value: 'Antre', label: 'Antre' }
                  ]}
                  size="xs"
                  variant="blue"
                />
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors"
              >
                <Download size={14} className="text-primary" />
                Unduh CSV
              </button>
            </div>

            <TableContainer>
              <Table>
                <thead>
                  <tr className="bg-subsurface/90 border-b border-border text-muted font-bold uppercase text-[10px] sm:text-xs">
                    <th 
                      className="p-3 cursor-pointer select-none hover:bg-slate-900/60 transition-colors group"
                      onClick={() => handleSortToggle('tanggal')}
                      title="Klik untuk mengurutkan tanggal (menaik/menurun)"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tanggal & Jam</span>
                        {sortKey === 'tanggal' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={14} className="text-primary" />
                          ) : (
                            <ArrowUp size={14} className="text-primary" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3">Plat & Model</th>
                    <th className="p-3">Layanan</th>
                    <th className="p-3">Metode Bayar</th>
                    <th className="p-3">Status</th>
                    <th 
                      className="p-3 text-right cursor-pointer select-none hover:bg-slate-900/60 transition-colors group"
                      onClick={() => handleSortToggle('nominal')}
                      title="Klik untuk mengurutkan harga (menaik/menurun)"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Harga Bersih</span>
                        {sortKey === 'nominal' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={14} className="text-primary" />
                          ) : (
                            <ArrowUp size={14} className="text-primary" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {paginatedList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-muted">
                        <Car size={32} className="mx-auto text-slate-600 mb-2 opacity-60" />
                        <p className="font-bold text-sm text-slate-300">Tidak ada log carwash pada periode ini ({activePeriodLabel})</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          Gunakan filter tanggal di atas atau klik tombol berikut untuk melihat riwayat:
                        </p>
                        <button
                          onClick={() => { setFilterPeriodMode('quick'); setQuickPreset('all'); }}
                          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-brand-emerald/30 text-xs font-bold transition-all"
                        >
                          Tampilkan Semua Waktu ({carwashList.length} Kendaraan)
                        </button>
                      </td>
                    </tr>
                  ) : (
                    paginatedList.map(item => (
                      <tr key={item.id_carwash} className="hover:bg-slate-855/30 transition-colors">
                        <td className="p-3 font-mono text-slate-400">
                          {item.tanggal} <span className="text-[10px] text-slate-500">{item.jam || ''}</span>
                        </td>
                        <td className="p-3">
                          <span className="font-extrabold text-white font-mono">{item.plat_nomor}</span>
                          <span className="text-[10px] text-slate-400 block">{item.model || item.tipe_kendaraan}</span>
                        </td>
                        <td className="p-3 font-semibold text-slate-200">{item.layanan}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                            {item.metode_bayar || 'CASH'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.status === 'Selesai' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-primary">
                          {formatRupiah(item.harga)}
                          {parseFloat(item.diskon) > 0 && (
                            <span className="text-[10px] text-slate-500 block font-normal line-through">
                              {formatRupiah(parseFloat(item.harga) + parseFloat(item.diskon))}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(item, 'carwash')}
                              className="p-1 text-slate-400 hover:text-brand-blue transition-colors"
                              title="Edit Transaksi"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item, 'carwash')}
                              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Hapus Transaksi"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableContainer>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 text-xs text-slate-400 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <span>Baris:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white text-xs font-semibold focus:outline-none focus:border-brand-emerald cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>Semua</option>
                </select>
                <span>Total: <strong className="text-white">{filteredCarwash.length}</strong> data</span>
              </div>

              {pageSize > 0 && totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white">
                    <ChevronLeft size={14} />
                  </button>
                  <span>Halaman <strong className="text-white">{currentPage}</strong> dari {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white">
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: CAFE LOG */}
      {activeTab === 'cafe' && (
        <div className="space-y-6 animate-fade-in">
          {/* Mini KPI Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Total Item / Porsi Terjual</span>
              <p className="text-base md:text-lg font-black text-white mt-1">{cafeKpis.totalItems} Porsi/Item</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Menu Terlaris (Top Seller)</span>
              <p className="text-base md:text-lg font-black text-brand-blue mt-1 truncate">{cafeKpis.topSellingItem}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Total Omzet Cafe (F&B)</span>
              <p className="text-base md:text-lg font-black text-primary mt-1">{formatRupiah(cafeKpis.totalRev)}</p>
            </div>
          </div>

          {/* Cafe Table Section */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">Log Detail Penjualan Cafe</h3>
                <CustomSelect
                  value={filterCafeCategory}
                  onChange={(val) => setFilterCafeCategory(val)}
                  options={[
                    { value: 'all', label: 'Semua Kategori Menu' },
                    ...cafeCategoryOptions.map(c => ({ value: c, label: c }))
                  ]}
                  searchable={cafeCategoryOptions.length > 5}
                  size="xs"
                  variant="blue"
                />
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors"
              >
                <Download size={14} className="text-primary" />
                Unduh CSV
              </button>
            </div>

            <TableContainer>
              <Table>
                <thead>
                  <tr className="bg-subsurface/90 border-b border-border text-muted font-bold uppercase text-[10px] sm:text-xs">
                    <th 
                      className="p-3 cursor-pointer select-none hover:bg-slate-900/60 transition-colors group"
                      onClick={() => handleSortToggle('tanggal')}
                      title="Klik untuk mengurutkan waktu/tanggal (menaik/menurun)"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Waktu & Struk</span>
                        {sortKey === 'tanggal' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={14} className="text-primary" />
                          ) : (
                            <ArrowUp size={14} className="text-primary" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3">Nama Menu</th>
                    <th className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span>Kategori</span>
                        {filterCafeCategory !== 'all' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" title="Filter Kategori Aktif" />
                        )}
                      </div>
                    </th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Harga Satuan</th>
                    <th 
                      className="p-3 text-right cursor-pointer select-none hover:bg-slate-900/60 transition-colors group"
                      onClick={() => handleSortToggle('nominal')}
                      title="Klik untuk mengurutkan total tagihan (menaik/menurun)"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Total Tagihan</span>
                        {sortKey === 'nominal' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={14} className="text-primary" />
                          ) : (
                            <ArrowUp size={14} className="text-primary" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {paginatedList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-muted">
                        <Coffee size={32} className="mx-auto text-slate-600 mb-2 opacity-60" />
                        <p className="font-bold text-sm text-slate-300">Tidak ada log cafe pada periode ini ({activePeriodLabel})</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          Data transaksi cafe di database berada pada periode April – Juli 2026. Anda dapat mengganti filter bulan di atas atau klik tombol berikut:
                        </p>
                        <button
                          onClick={() => { setFilterPeriodMode('quick'); setQuickPreset('all'); }}
                          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-blue/10 hover:bg-brand-blue/20 text-brand-blue border border-brand-blue/30 text-xs font-bold transition-all"
                        >
                          Tampilkan Semua Waktu ({cafeList.length} Item)
                        </button>
                      </td>
                    </tr>
                  ) : (
                    paginatedList.map(item => (
                      <tr key={item.id_detail} className="hover:bg-slate-850/30 transition-colors">
                        <td className="p-3 font-mono text-slate-400">
                          {item.struk?.tanggal || '-'}
                          <span className="text-[10px] text-slate-500 block">Kasir: {item.struk?.kasir || 'Admin'}</span>
                        </td>
                        <td className="p-3 font-extrabold text-white">{item.nama_menu || item.nama_item || 'Menu'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                            {item.kategori || 'Menu'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-brand-blue">{item.qty || item.jumlah || 1}x</td>
                        <td className="p-3 text-right font-mono text-slate-300">{formatRupiah(item.harga_satuan)}</td>
                        <td className="p-3 text-right font-mono font-bold text-primary">
                          {formatRupiah(item.subtotal || item.total_harga || ((item.qty || item.jumlah || 1) * (item.harga_satuan || 0)))}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(item, 'cafe')}
                              className="p-1 text-slate-400 hover:text-brand-blue transition-colors"
                              title="Edit Transaksi"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item, 'cafe')}
                              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Hapus Transaksi"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableContainer>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 text-xs text-slate-400 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <span>Baris:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white text-xs font-semibold focus:outline-none focus:border-brand-emerald cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>Semua</option>
                </select>
                <span>Total: <strong className="text-white">{filteredCafe.length}</strong> data</span>
              </div>

              {pageSize > 0 && totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white">
                    <ChevronLeft size={14} />
                  </button>
                  <span>Halaman <strong className="text-white">{currentPage}</strong> dari {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white">
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: EXPENSES LOG */}
      {activeTab === 'expenses' && (
        <div className="space-y-6 animate-fade-in">
          {/* Mini KPI Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Beban Operasional Murni</span>
              <p className="text-base md:text-lg font-black text-rose-400 mt-1">{formatRupiah(expensesKpis.opTotal)}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Belanja Bahan Baku</span>
              <p className="text-base md:text-lg font-black text-amber-400 mt-1">{formatRupiah(expensesKpis.rawTotal)}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Kasbon Karyawan</span>
              <p className="text-base md:text-lg font-black text-brand-blue mt-1">{formatRupiah(expensesKpis.casbonTotal)}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Total Seluruh Pengeluaran</span>
              <p className="text-base md:text-lg font-black text-white mt-1">{formatRupiah(expensesKpis.totalAll)}</p>
            </div>
          </div>

          {/* Expenses Table Section */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">Log Pengeluaran Lengkap</h3>
                
                {/* Specific Filters: Jenis */}
                <CustomSelect
                  value={filterExpenseJenis}
                  onChange={(val) => handleFilterExpenseJenisChange(val)}
                  options={[
                    { value: 'all', label: 'Semua Jenis' },
                    ...expenseJenisList.map(j => ({ value: j, label: j }))
                  ]}
                  searchable={expenseJenisList.length > 5}
                  size="xs"
                  variant="rose"
                />

                {/* Specific Filters: Kategori (Terkunci sesuai jenis pengeluaran) */}
                <CustomSelect
                  value={filterExpenseCategory}
                  onChange={(val) => setFilterExpenseCategory(val)}
                  options={[
                    { value: 'all', label: `Semua Kategori ${filterExpenseJenis !== 'all' ? `(${filterExpenseJenis})` : ''}` },
                    ...expenseFilteredKategoriOptions.map(k => ({ value: k, label: k }))
                  ]}
                  searchable={expenseFilteredKategoriOptions.length > 5}
                  size="xs"
                  variant="rose"
                />

                {/* Specific Filters: POS Kas */}
                <CustomSelect
                  value={filterPos}
                  onChange={(val) => setFilterPos(val)}
                  options={[
                    { value: 'all', label: 'Semua POS Kas' },
                    ...posOptions.map(p => ({ value: p, label: p }))
                  ]}
                  size="xs"
                  variant="rose"
                />

                {/* Reset filter button if active */}
                {(filterExpenseJenis !== 'all' || filterExpenseCategory !== 'all' || filterPos !== 'all' || searchQuery !== '' || sortKey !== 'tanggal' || sortOrder !== 'desc') && (
                  <button
                    onClick={handleResetFilters}
                    className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-bold px-2 py-1 rounded bg-amber-400/10 border border-amber-400/20 transition-colors"
                    title="Reset Filter Tabel"
                  >
                    <RotateCcw size={12} />
                    Reset
                  </button>
                )}
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors"
              >
                <Download size={14} className="text-primary" />
                Unduh CSV
              </button>
            </div>

            <TableContainer>
              <Table>
                <thead>
                  <tr className="bg-subsurface/90 border-b border-border text-muted font-bold uppercase text-[10px] sm:text-xs">
                    <th 
                      className="p-3 cursor-pointer select-none hover:bg-slate-900/60 transition-colors group"
                      onClick={() => handleSortToggle('tanggal')}
                      title="Klik untuk mengurutkan tanggal (menaik/menurun)"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Tanggal & Jam</span>
                        {sortKey === 'tanggal' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={14} className="text-brand-rose" />
                          ) : (
                            <ArrowUp size={14} className="text-brand-rose" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3">Keterangan / Item</th>
                    <th className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span>Jenis & Kategori</span>
                        {(filterExpenseJenis !== 'all' || filterExpenseCategory !== 'all') && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-rose animate-pulse" title="Filter Jenis/Kategori Aktif" />
                        )}
                      </div>
                    </th>
                    <th className="p-3">POS Kas</th>
                    <th 
                      className="p-3 text-right cursor-pointer select-none hover:bg-slate-900/60 transition-colors group"
                      onClick={() => handleSortToggle('nominal')}
                      title="Klik untuk mengurutkan nominal beban (menaik/menurun)"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Nominal</span>
                        {sortKey === 'nominal' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown size={14} className="text-brand-rose" />
                          ) : (
                            <ArrowUp size={14} className="text-brand-rose" />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="text-slate-600 group-hover:text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th className="p-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {paginatedList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted">
                        <Receipt size={32} className="mx-auto text-slate-600 mb-2 opacity-60" />
                        <p className="font-bold text-sm text-slate-300">Tidak ada log pengeluaran pada periode ini ({activePeriodLabel})</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          Gunakan filter tanggal di atas atau klik tombol berikut untuk melihat riwayat:
                        </p>
                        <button
                          onClick={() => { setFilterPeriodMode('quick'); setQuickPreset('all'); }}
                          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-rose/10 hover:bg-brand-rose/20 text-brand-rose border border-brand-rose/30 text-xs font-bold transition-all"
                        >
                          Tampilkan Semua Waktu ({expensesList.length} Pengeluaran)
                        </button>
                      </td>
                    </tr>
                  ) : (
                    paginatedList.map(item => (
                      <tr key={item.id_pengeluaran} className="hover:bg-slate-850/30 transition-colors">
                        <td className="p-3 font-mono text-slate-400">
                          {item.tanggal} <span className="text-[10px] text-slate-500">{item.jam || ''}</span>
                        </td>
                        <td className="p-3 font-semibold text-white max-w-xs truncate">
                          {item.nama_pengeluaran || item.keterangan || '-'}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                            {item.kategori || item.jenis || 'Operasional'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] text-slate-400 bg-slate-900 border border-slate-800">
                            {item.pos || 'SALDO CASH'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-rose-400">
                          -{formatRupiah(item.nominal || item.total_harga || 0)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(item, 'expenses')}
                              className="p-1 text-slate-400 hover:text-brand-blue transition-colors"
                              title="Edit Pengeluaran"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item, 'expenses')}
                              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                              title="Hapus Pengeluaran"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </TableContainer>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 text-xs text-slate-400 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <span>Baris:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-white text-xs font-semibold focus:outline-none focus:border-brand-emerald cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>Semua</option>
                </select>
                <span>Total: <strong className="text-white">{filteredExpenses.length}</strong> data</span>
              </div>

              {pageSize > 0 && totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white">
                    <ChevronLeft size={14} />
                  </button>
                  <span>Halaman <strong className="text-white">{currentPage}</strong> dari {totalPages}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-white">
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CATAT PENGELUARAN BARU */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-2xl p-6 rounded-2xl shadow-2xl border border-slate-800 max-h-[90vh] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingDown className="text-brand-rose" />
                  Catat Pengeluaran Baru
                </h3>
                <button 
                  onClick={() => { setShowExpenseModal(false); setBarangMasukList([]); }}
                  className="text-slate-400 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSaveExpense} className="space-y-4 overflow-y-auto max-h-[50vh] pr-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Tanggal
                    </label>
                    <input
                      type="date"
                      value={expenseForm.tanggal}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, tanggal: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-rose"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Jenis Pengeluaran
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomExpenseJenis(!isCustomExpenseJenis)}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        {isCustomExpenseJenis ? '← List' : '+ Custom'}
                      </button>
                    </div>
                    {isCustomExpenseJenis ? (
                      <input
                        type="text"
                        placeholder="Ketik jenis..."
                        value={expenseForm.jenis}
                        onChange={(e) => handleExpenseJenisSelect(e.target.value)}
                        className="w-full bg-slate-900 border border-brand-emerald rounded-xl py-2 px-3 text-white text-xs md:text-sm focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <CustomSelect
                        value={expenseForm.jenis}
                        onChange={(val) => {
                          if (val === '__CUSTOM__') {
                            setIsCustomExpenseJenis(true)
                            setExpenseForm(prev => ({ ...prev, jenis: '' }))
                          } else {
                            handleExpenseJenisSelect(val)
                          }
                        }}
                        options={[
                          ...allJenisOptions.map(o => ({ value: o, label: o })),
                          { value: '__CUSTOM__', label: '✨ + Custom (Ketik Sendiri)...' }
                        ]}
                        size="md"
                        variant="rose"
                        className="w-full"
                      />
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Kategori (Terkunci)
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomExpenseKategori(!isCustomExpenseKategori)}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        {isCustomExpenseKategori ? '← List' : '+ Custom'}
                      </button>
                    </div>
                    {isCustomExpenseKategori ? (
                      <input
                        type="text"
                        placeholder="Ketik kategori..."
                        value={expenseForm.kategori}
                        onChange={(e) => {
                          const newCat = e.target.value
                          setExpenseForm(prev => ({ 
                            ...prev, 
                            kategori: newCat,
                            total_harga: newCat === 'Bahan Baku' ? 0 : prev.total_harga
                          }))
                          if (newCat !== 'Bahan Baku') setBarangMasukList([])
                        }}
                        className="w-full bg-slate-900 border border-brand-emerald rounded-xl py-2 px-3 text-white text-xs md:text-sm focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <CustomSelect
                        value={expenseForm.kategori}
                        onChange={(val) => {
                          if (val === '__CUSTOM__') {
                            setIsCustomExpenseKategori(true)
                            setExpenseForm(prev => ({ ...prev, kategori: '' }))
                            setBarangMasukList([])
                          } else {
                            setExpenseForm(prev => ({ 
                              ...prev, 
                              kategori: val,
                              total_harga: val === 'Bahan Baku' ? 0 : prev.total_harga
                            }))
                            if (val !== 'Bahan Baku') setBarangMasukList([])
                          }
                        }}
                        options={[
                          ...availableExpenseCategories.map(o => ({ value: o, label: o })),
                          { value: '__CUSTOM__', label: '✨ + Custom (Ketik Sendiri)...' }
                        ]}
                        size="md"
                        variant="rose"
                        className="w-full"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      POS Kas
                    </label>
                    <CustomSelect
                      value={expenseForm.pos}
                      onChange={(val) => setExpenseForm(prev => ({ ...prev, pos: val }))}
                      options={posOptions.map(o => ({ value: o, label: o }))}
                      size="md"
                      variant="rose"
                      className="w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Keterangan
                  </label>
                  <textarea
                    placeholder="Beli sabun cuci mobil, bayar listrik cafe, casbon staff..."
                    value={expenseForm.keterangan}
                    onChange={(e) => setExpenseForm(prev => ({ ...prev, keterangan: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm h-20 placeholder-slate-600 focus:outline-none focus:border-brand-rose"
                  />
                </div>

                {expenseForm.kategori !== 'Bahan Baku' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Total Nominal (Rp)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={expenseForm.total_harga}
                      onChange={(e) => setExpenseForm(prev => ({ ...prev, total_harga: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono focus:outline-none focus:border-brand-rose"
                    />
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Detail Restok Bahan Baku (Barang Masuk)
                      </span>
                      <button
                        type="button"
                        onClick={addBarangMasukItem}
                        className="px-3 py-1 bg-brand-blue/10 border border-brand-blue/20 text-brand-blue font-bold rounded-lg text-xs"
                      >
                        + Tambah Item
                      </button>
                    </div>

                    {barangMasukList.map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                        <div className="flex-1 min-w-[120px]">
                          <select
                            value={item.id_bahan_baku}
                            onChange={(e) => updateBarangMasukItem(idx, 'id_bahan_baku', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded py-1.5 px-2 text-white text-xs font-semibold focus:outline-none focus:border-brand-rose"
                          >
                            {stokBahan.map(b => (
                              <option key={b.id_bahan_baku} value={b.id_bahan_baku}>
                                {b.nama_produk} ({b.satuan})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-20">
                          <input
                            type="number"
                            placeholder="Qty"
                            value={item.jumlah}
                            onChange={(e) => updateBarangMasukItem(idx, 'jumlah', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded py-1.5 px-2 text-white text-xs text-center font-mono focus:outline-none focus:border-brand-rose"
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 w-12 font-mono">{item.satuan}</span>
                        <div className="flex-1 min-w-[100px]">
                          <input
                            type="number"
                            placeholder="Harga Satuan"
                            value={item.harga_satuan}
                            onChange={(e) => updateBarangMasukItem(idx, 'harga_satuan', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded py-1.5 px-2 text-white text-xs text-right font-mono focus:outline-none focus:border-brand-rose"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBarangMasukItem(idx)}
                          className="text-rose-400 hover:text-rose-500 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    <div className="p-3 rounded-lg bg-brand-rose/5 border border-brand-rose/10 flex justify-between items-center text-xs font-bold mt-2">
                      <span className="text-slate-400">Total Biaya Restok</span>
                      <span className="text-brand-rose text-sm font-black">{formatRupiah(expenseForm.total_harga)}</span>
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
              <button
                type="button"
                onClick={() => { setShowExpenseModal(false); setBarangMasukList([]); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                onClick={handleSaveExpense}
                disabled={submitting}
                className="px-4 py-2 bg-brand-rose hover:bg-rose-500 active:bg-rose-600 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Transaksi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CATAT PEMASUKAN BARU */}
      {showIncomeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-xl p-6 rounded-2xl shadow-2xl border border-slate-800 max-h-[90vh] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Plus className="text-primary" />
                  Catat Pemasukan Baru
                </h3>
                <button onClick={() => setShowIncomeModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>

              {error && (
                <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSaveIncome} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Tanggal
                    </label>
                    <input
                      type="date"
                      value={incomeForm.tanggal}
                      onChange={(e) => setIncomeForm(prev => ({ ...prev, tanggal: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-emerald"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Jenis Pemasukan
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomIncomeJenis(!isCustomIncomeJenis)}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        {isCustomIncomeJenis ? '← List' : '+ Custom'}
                      </button>
                    </div>
                    {isCustomIncomeJenis ? (
                      <input
                        type="text"
                        placeholder="Ketik jenis..."
                        value={incomeForm.jenis}
                        onChange={(e) => handleIncomeJenisSelect(e.target.value)}
                        className="w-full bg-slate-900 border border-brand-emerald rounded-xl py-2 px-3 text-white text-xs md:text-sm focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <CustomSelect
                        value={incomeForm.jenis}
                        onChange={(val) => {
                          if (val === '__CUSTOM__') {
                            setIsCustomIncomeJenis(true)
                            setIncomeForm(prev => ({ ...prev, jenis: '' }))
                          } else {
                            handleIncomeJenisSelect(val)
                          }
                        }}
                        options={[
                          ...allIncomeJenisOptions.map(o => ({ value: o, label: o })),
                          { value: '__CUSTOM__', label: '✨ + Custom (Ketik Sendiri)...' }
                        ]}
                        size="md"
                        variant="emerald"
                        className="w-full"
                      />
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Kategori Pemasukan (Terkunci)
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomIncomeKategori(!isCustomIncomeKategori)}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        {isCustomIncomeKategori ? '← List' : '+ Custom'}
                      </button>
                    </div>
                    {isCustomIncomeKategori ? (
                      <input
                        type="text"
                        placeholder="Ketik kategori..."
                        value={incomeForm.kategori}
                        onChange={(e) => setIncomeForm(prev => ({ ...prev, kategori: e.target.value }))}
                        className="w-full bg-slate-900 border border-brand-emerald rounded-xl py-2 px-3 text-white text-xs md:text-sm focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <CustomSelect
                        value={incomeForm.kategori}
                        onChange={(val) => {
                          if (val === '__CUSTOM__') {
                            setIsCustomIncomeKategori(true)
                            setIncomeForm(prev => ({ ...prev, kategori: '' }))
                          } else {
                            setIncomeForm(prev => ({ ...prev, kategori: val }))
                          }
                        }}
                        options={[
                          ...availableIncomeCategories.map(o => ({ value: o, label: o })),
                          { value: '__CUSTOM__', label: '✨ + Custom (Ketik Sendiri)...' }
                        ]}
                        size="md"
                        variant="emerald"
                        className="w-full"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      POS Kas Tujuan
                    </label>
                    <CustomSelect
                      value={incomeForm.pos}
                      onChange={(val) => setIncomeForm(prev => ({ ...prev, pos: val }))}
                      options={posOptions.map(o => ({ value: o, label: o }))}
                      size="md"
                      variant="emerald"
                      className="w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Keterangan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Setoran modal awal owner, pendapatan iklan..."
                    value={incomeForm.keterangan}
                    onChange={(e) => setIncomeForm(prev => ({ ...prev, keterangan: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-emerald"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nominal Pemasukan (Rp)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={incomeForm.nominal}
                    onChange={(e) => setIncomeForm(prev => ({ ...prev, nominal: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono focus:outline-none focus:border-brand-emerald"
                  />
                </div>
              </form>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
              <button
                type="button"
                onClick={() => setShowIncomeModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                onClick={handleSaveIncome}
                disabled={submitting}
                className="px-4 py-2 bg-primary hover:bg-emerald-400 active:bg-emerald-500 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Transaksi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2B: PINDAH SALDO (TRANSFER ANTAR REKENING/KAS) */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="glass-panel w-full max-w-xl p-6 rounded-2xl shadow-2xl border border-slate-800 max-h-[90vh] flex flex-col justify-between animate-pop-in">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <RotateCcw className="text-sky-400" />
                  Pindah Saldo (Mutasi Kas / Bank)
                </h3>
                <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>

              {error && (
                <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSaveTransfer} className="space-y-4">
                {/* Tanggal */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Tanggal Perpindahan
                  </label>
                  <input
                    type="date"
                    value={transferForm.tanggal}
                    onChange={(e) => setTransferForm(prev => ({ ...prev, tanggal: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono focus:outline-none focus:border-sky-400"
                    required
                  />
                </div>

                {/* Dropdowns Dari POS Asal ke POS Tujuan */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                    <label className="block text-xs font-bold text-rose-400 uppercase tracking-wider">
                      1. Dari Pos Kas (Sumber / Asal)
                    </label>
                    <CustomSelect
                      value={transferForm.pos_asal}
                      onChange={(val) => setTransferForm(prev => ({ ...prev, pos_asal: val }))}
                      options={posOptions.map(p => ({
                        value: p,
                        label: `${p} (${formatRupiah(posAllTimeBalances[p === 'SALDO CASH' ? 'cash' : p === 'SALDO REKENING Y' ? 'rekY' : p === 'SALDO REKENING N' ? 'rekN' : 'rekR'])})`
                      }))}
                      size="sm"
                      variant="rose"
                      className="w-full"
                    />
                    <span className="text-[10px] text-slate-500 block">Saldo akan berkurang (-)</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                    <label className="block text-xs font-bold text-primary uppercase tracking-wider">
                      2. Ke Pos Kas (Tujuan)
                    </label>
                    <CustomSelect
                      value={transferForm.pos_tujuan}
                      onChange={(val) => setTransferForm(prev => ({ ...prev, pos_tujuan: val }))}
                      options={posOptions.map(p => ({
                        value: p,
                        label: `${p} (${formatRupiah(posAllTimeBalances[p === 'SALDO CASH' ? 'cash' : p === 'SALDO REKENING Y' ? 'rekY' : p === 'SALDO REKENING N' ? 'rekN' : 'rekR'])})`
                      }))}
                      size="sm"
                      variant="emerald"
                      className="w-full"
                    />
                    <span className="text-[10px] text-slate-500 block">Saldo akan bertambah (+)</span>
                  </div>
                </div>

                {/* Nominal */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nominal Perpindahan (Rp)
                  </label>
                  <input
                    type="number"
                    placeholder="Contoh: 1500000"
                    value={transferForm.nominal}
                    onChange={(e) => setTransferForm(prev => ({ ...prev, nominal: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2.5 px-3 text-white text-base font-mono font-bold focus:outline-none focus:border-sky-400"
                    required
                  />
                </div>

                {/* Keterangan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Keterangan / Catatan (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder={`Pindah Saldo dari ${transferForm.pos_asal} ke ${transferForm.pos_tujuan}`}
                    value={transferForm.keterangan}
                    onChange={(e) => setTransferForm(prev => ({ ...prev, keterangan: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-sky-400"
                  />
                </div>

                {/* Preview Mutasi Box */}
                {parseFloat(transferForm.nominal) > 0 && (
                  <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300 flex items-center justify-between">
                    <span>Mutasi Antar Kas:</span>
                    <strong className="font-mono">{transferForm.pos_asal} ➔ {transferForm.pos_tujuan} ({formatRupiah(parseFloat(transferForm.nominal))})</strong>
                  </div>
                )}
              </form>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                onClick={handleSaveTransfer}
                disabled={submitting || !parseFloat(transferForm.nominal)}
                className="px-5 py-2 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 font-black rounded-xl text-sm disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-sky-500/20 transition-all"
              >
                {submitting ? 'Memproses...' : 'Konfirmasi Pindah Saldo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT TRANSAKSI (UNIVERSAL) */}
      {showEditModal && editForm.id && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-xl p-6 rounded-2xl shadow-2xl border border-slate-800 max-h-[90vh] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit2 className="text-brand-blue" size={18} />
                  Edit Data Transaksi ({editForm.table.toUpperCase()})
                </h3>
                <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSaveEdit} className="space-y-3.5">
                {/* Tanggal & Jam */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Tanggal</label>
                    <input
                      type="date"
                      value={editForm.tanggal}
                      onChange={(e) => setEditForm(prev => ({ ...prev, tanggal: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs"
                      required
                    />
                  </div>
                  {editForm.table !== 'cashflow' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Jam</label>
                      <input
                        type="time"
                        value={editForm.jam}
                        onChange={(e) => setEditForm(prev => ({ ...prev, jam: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Fields for CASHFLOW */}
                {editForm.table === 'cashflow' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Keterangan</label>
                      <input
                        type="text"
                        value={editForm.keterangan}
                        onChange={(e) => setEditForm(prev => ({ ...prev, keterangan: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">POS Kas</label>
                        <select
                          value={editForm.pos}
                          onChange={(e) => setEditForm(prev => ({ ...prev, pos: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-white text-xs font-semibold focus:outline-none focus:border-brand-emerald cursor-pointer"
                        >
                          {posOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Jenis</label>
                        <input
                          type="text"
                          list="edit-cf-jenis-list"
                          placeholder="Jenis transaksi"
                          value={editForm.jenis || ''}
                          onChange={(e) => {
                            const newJ = e.target.value
                            const nextCats = getLockedCategoriesForJenis(newJ, masterCategories, [], parseFloat(editForm.pemasukan || 0) > 0)
                            setEditForm(prev => {
                              const isCurrentValid = nextCats.some(c => c.toLowerCase() === (prev.kategori || '').toLowerCase())
                              return {
                                ...prev,
                                jenis: newJ,
                                kategori: isCurrentValid ? prev.kategori : (nextCats[0] || prev.kategori)
                              }
                            })
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-white text-xs font-semibold focus:outline-none focus:border-brand-emerald"
                        />
                        <datalist id="edit-cf-jenis-list">
                          {Array.from(new Set([...allJenisOptions, ...allIncomeJenisOptions])).map((opt, i) => (
                            <option key={i} value={opt} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Kategori (Terkunci)</label>
                        <input
                          type="text"
                          list="edit-cf-kategori-list"
                          placeholder="Kategori transaksi"
                          value={editForm.kategori || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, kategori: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-white text-xs font-semibold focus:outline-none focus:border-brand-emerald"
                        />
                        <datalist id="edit-cf-kategori-list">
                          {editAvailableCategories.map((opt, i) => (
                            <option key={i} value={opt} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Pemasukan (Rp)</label>
                        <input
                          type="number"
                          value={editForm.pemasukan}
                          onChange={(e) => setEditForm(prev => ({ ...prev, pemasukan: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Pengeluaran (Rp)</label>
                        <input
                          type="number"
                          value={editForm.pengeluaran}
                          onChange={(e) => setEditForm(prev => ({ ...prev, pengeluaran: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs font-mono"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Fields for CARWASH */}
                {editForm.table === 'carwash' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Plat Nomor</label>
                        <input
                          type="text"
                          value={editForm.plat_nomor}
                          onChange={(e) => setEditForm(prev => ({ ...prev, plat_nomor: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs font-mono font-bold"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Model Mobil/Motor</label>
                        <input
                          type="text"
                          value={editForm.model}
                          onChange={(e) => setEditForm(prev => ({ ...prev, model: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Paket Layanan</label>
                        <input
                          type="text"
                          value={editForm.layanan}
                          onChange={(e) => setEditForm(prev => ({ ...prev, layanan: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Metode Bayar</label>
                        <CustomSelect
                          value={editForm.metode_bayar}
                          onChange={(val) => setEditForm(prev => ({ ...prev, metode_bayar: val }))}
                          options={[
                            { value: 'CASH', label: 'CASH' },
                            { value: 'QRIS', label: 'QRIS' },
                            { value: 'SPLIT', label: 'SPLIT' }
                          ]}
                          size="xs"
                          variant="blue"
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Harga Bersih (Rp)</label>
                        <input
                          type="number"
                          value={editForm.harga}
                          onChange={(e) => setEditForm(prev => ({ ...prev, harga: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs font-mono"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Status</label>
                        <CustomSelect
                          value={editForm.status}
                          onChange={(val) => setEditForm(prev => ({ ...prev, status: val }))}
                          options={[
                            { value: 'Selesai', label: 'Selesai' },
                            { value: 'Proses', label: 'Proses' },
                            { value: 'Antre', label: 'Antre' }
                          ]}
                          size="xs"
                          variant="blue"
                          className="w-full"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Fields for CAFE */}
                {editForm.table === 'cafe' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Nama Menu</label>
                      <input
                        type="text"
                        value={editForm.nama_item}
                        onChange={(e) => setEditForm(prev => ({ ...prev, nama_item: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Qty</label>
                        <input
                          type="number"
                          value={editForm.jumlah}
                          onChange={(e) => {
                            const q = parseFloat(e.target.value) || 1
                            setEditForm(prev => ({ ...prev, jumlah: q, total_harga: q * prev.harga_satuan }))
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs text-center font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Harga Satuan</label>
                        <input
                          type="number"
                          value={editForm.harga_satuan}
                          onChange={(e) => {
                            const hs = parseFloat(e.target.value) || 0
                            setEditForm(prev => ({ ...prev, harga_satuan: hs, total_harga: prev.jumlah * hs }))
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Total Tagihan</label>
                        <input
                          type="number"
                          value={editForm.total_harga}
                          onChange={(e) => setEditForm(prev => ({ ...prev, total_harga: parseFloat(e.target.value) || 0 }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs font-mono font-bold"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Fields for PENGELUARAN */}
                {editForm.table === 'pengeluaran' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Keterangan / Nama Beban</label>
                      <input
                        type="text"
                        value={editForm.keterangan}
                        onChange={(e) => setEditForm(prev => ({ ...prev, keterangan: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Kategori (Terkunci)</label>
                        <input
                          type="text"
                          list="edit-exp-kategori-list"
                          placeholder="Kategori beban"
                          value={editForm.kategori || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, kategori: e.target.value }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-white text-xs font-semibold focus:outline-none focus:border-brand-rose"
                        />
                        <datalist id="edit-exp-kategori-list">
                          {editAvailableCategories.map((k, i) => (
                            <option key={i} value={k} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">POS Kas</label>
                        <CustomSelect
                          value={editForm.pos}
                          onChange={(val) => setEditForm(prev => ({ ...prev, pos: val }))}
                          options={posOptions.map(p => ({ value: p, label: p }))}
                          size="xs"
                          variant="rose"
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">Nominal Beban (Rp)</label>
                      <input
                        type="number"
                        value={editForm.nominal}
                        onChange={(e) => setEditForm(prev => ({ ...prev, nominal: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 text-white text-xs font-mono font-bold focus:outline-none focus:border-brand-blue"
                        required
                      />
                    </div>
                  </>
                )}
              </form>
            </div>

            <div className="flex justify-end gap-2.5 border-t border-slate-800 pt-3.5 mt-5">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                onClick={handleSaveEdit}
                disabled={submitting}
                className="px-4 py-1.5 bg-brand-blue hover:bg-blue-500 text-slate-950 font-bold rounded-xl text-xs disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM POPUP MODAL: Alert / Confirm */}
      {customAlert && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="glass-panel w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-slate-800 animate-pop-in text-center">
            <div className="mb-4">
              {customAlert.title.includes('Hapus') || customAlert.title === 'Error' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center">
                  <AlertCircle className="text-rose-400" size={24} />
                </div>
              ) : customAlert.title === 'Sukses' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="text-emerald-400" size={24} />
                </div>
              ) : (
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
                  <AlertCircle className="text-amber-400" size={24} />
                </div>
              )}
            </div>
            
            <h4 className="text-base font-extrabold text-white mb-2">{customAlert.title}</h4>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">{customAlert.message}</p>
            
            <div className="flex justify-center gap-3">
              {customAlert.type === 'confirm' && (
                <button
                  type="button"
                  onClick={customAlert.onCancel}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs w-24"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={customAlert.onConfirm}
                className={`px-4 py-2 font-bold rounded-xl text-xs w-24 ${
                  customAlert.title.includes('Hapus') || customAlert.title === 'Error'
                    ? 'bg-rose-500 hover:bg-rose-600 text-white'
                    : 'bg-primary hover:bg-emerald-500 text-slate-950'
                }`}
              >
                {customAlert.type === 'confirm' ? 'Ya' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Finance
