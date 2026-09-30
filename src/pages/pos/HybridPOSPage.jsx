import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { DEFAULT_TENANT_ID } from '../../constants/erpConfig'
import {
  Plus,
  Minus,
  Trash2,
  Check,
  ShoppingCart,
  Car,
  Coffee,
  Search,
  CheckCircle,
  AlertCircle,
  Wallet,
  History,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  TrendingDown,
  RefreshCw,
  Calendar,
  Boxes,
  Package,
  Info,
  AlertTriangle,
  Printer,
  Send,
  FileText,
  ShoppingBag
} from 'lucide-react'

import ThermalReceiptModal from '../../components/pos/ThermalReceiptModal'
import MerchandiseCatalog from '../../components/pos/MerchandiseCatalog'
import CustomSelect from '../../components/common/CustomSelect'
import {
  buildOrderReceiptData,
  buildPaymentReceiptData,
  calculateSettlementWithSurcharge,
  getReceiptConfig
} from '../../utils/receiptHelpers'

import {
  DEFAULT_CARWASH_PACKAGES,
  calculateCarwashPriceAndCommission
} from '../../utils/carwashHelpers'
import { getTenantFeatures } from '../../utils/businessCapabilities'

import {
  generateUUID,
  formatRupiah,
  parseDateSafe,
  getShiftForCashier,
  calculateTutupKasirRecap
} from '../../utils/helpers'
import { addToCart as cartAdd, updateQty as cartUpdate, updateItemNotes as cartUpdateNotes, removeFromCart as cartRemove } from '../../utils/cartHelpers'
import { validatePosExpenseForm, formatPosExpensePayload } from '../../utils/financeHelpers'
import { DEFAULT_MASTER_DATA } from '../../constants/masterDataDefaults'
import { getCategoriesForPOS } from '../../utils/posCategoryHelpers'

const getMenuPhoto = (menuName) => {
  const name = String(menuName).toLowerCase()
  if (name.includes('le mineral') || name.includes('air mineral')) {
    return 'https://images.unsplash.com/photo-1608885898957-a599fb18ec3f?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('badak')) {
    return 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('americano')) {
    return 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('sanger') || name.includes('kopi susu')) {
    return 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('late')) {
    return 'https://images.unsplash.com/photo-1570968915860-54d5c301fc9f?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('teh')) {
    return 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('ayam penyet') || name.includes('ayam geprek')) {
    return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('sosis')) {
    return 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('nugget')) {
    return 'https://images.unsplash.com/photo-1562967914-6c82c65e4ff8?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('kentang')) {
    return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('nasi goreng')) {
    return 'https://images.unsplash.com/photo-1617470703128-26a0fc9af10f?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('indomie') || name.includes('mie')) {
    return 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&auto=format&fit=crop&q=60'
  }
  return 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&auto=format&fit=crop&q=60'
}

const getMenuTheme = (menuName) => {
  const name = String(menuName || '').toLowerCase()
  if (name.includes('americano') || name.includes('espresso') || name.includes('sanger') || name.includes('kopi') || name.includes('late')) {
    return {
      gradient: 'from-amber-700/40 via-amber-900/30 to-slate-950',
      badgeBg: 'bg-amber-500/25 text-amber-300 border border-amber-500/30',
      tag: 'Kopi',
      emoji: '☕'
    }
  }
  if (name.includes('teh') || name.includes('tea')) {
    return {
      gradient: 'from-emerald-700/40 via-teal-900/30 to-slate-950',
      badgeBg: 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/30',
      tag: 'Teh Segar',
      emoji: '🍵'
    }
  }
  if (name.includes('badak') || name.includes('susu') || name.includes('mineral') || name.includes('air')) {
    return {
      gradient: 'from-cyan-700/40 via-blue-900/30 to-slate-950',
      badgeBg: 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/30',
      tag: 'Minuman Dingin',
      emoji: '🥤'
    }
  }
  if (name.includes('ayam') || name.includes('penyet') || name.includes('geprek')) {
    return {
      gradient: 'from-rose-700/40 via-red-900/30 to-slate-950',
      badgeBg: 'bg-rose-500/25 text-rose-300 border border-rose-500/30',
      tag: 'Ayam & Lauk',
      emoji: '🍗'
    }
  }
  if (name.includes('nasi')) {
    return {
      gradient: 'from-orange-700/40 via-amber-900/30 to-slate-950',
      badgeBg: 'bg-orange-500/25 text-orange-300 border border-orange-500/30',
      tag: 'Nasi Goreng',
      emoji: '🍚'
    }
  }
  if (name.includes('mie') || name.includes('indomie')) {
    return {
      gradient: 'from-yellow-700/40 via-amber-900/30 to-slate-950',
      badgeBg: 'bg-yellow-500/25 text-yellow-300 border border-yellow-500/30',
      tag: 'Indomie',
      emoji: '🍜'
    }
  }
  return {
    gradient: 'from-purple-700/40 via-indigo-900/30 to-slate-950',
    badgeBg: 'bg-purple-500/25 text-purple-300 border border-purple-500/30',
    tag: 'Camilan',
    emoji: '🍟'
  }
}

const CafePOS = () => {
  const { profile, activeTenant } = useAuth()
  const effectiveTenantId = activeTenant?.id || profile?.tenant_id || DEFAULT_TENANT_ID
  const features = getTenantFeatures(activeTenant?.business_type)
  const defaultTab = features.isCarwashOnly ? 'carwash' : 'cafe'
  const [activeTab, setActiveTab] = useState(defaultTab)

  // Auto-switch tab jika tipe bisnis tenant berganti
  useEffect(() => {
    if (features.isCarwashOnly && activeTab === 'cafe') {
      setActiveTab('carwash')
    } else if (features.isCafeOnly && activeTab === 'carwash') {
      setActiveTab('cafe')
    }
  }, [features.isCarwashOnly, features.isCafeOnly])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Master Data awal langsung terisi dari default master data (Zero Blank Screen / Instant Render)
  const [cashiers, setCashiers] = useState(() => (DEFAULT_MASTER_DATA.kasir || []).filter(k => k.is_active))
  const [paymentMethods, setPaymentMethods] = useState(() => (DEFAULT_MASTER_DATA.metode_bayar || []).filter(p => p.is_active))
  const [menuItems, setMenuItems] = useState(() => (DEFAULT_MASTER_DATA.daftar_harga_menu || []).map(m => ({ ...m, nama_menu: m.daftar_menu })))
  const [resepList, setResepList] = useState(() => DEFAULT_MASTER_DATA.resep || [])

  // Form State
  const [selectedCashier, setSelectedCashier] = useState(() => {
    const active = (DEFAULT_MASTER_DATA.kasir || []).filter(k => k.is_active)
    return active.length > 0 ? (active[0].nama || '').toUpperCase() : ''
  })
  const [selectedPayment, setSelectedPayment] = useState(() => {
    const active = (DEFAULT_MASTER_DATA.metode_bayar || []).filter(p => p.is_active)
    return active.length > 0 ? active[0].nama : 'CASH'
  })
  const [paymentStatus, setPaymentStatus] = useState('Pending') // 'Pending' or 'Selesai'

  // Modal Hari Ini (Starting Capital)
  const [showModalModal, setShowModalModal] = useState(false)
  const [startingCapitalInput, setStartingCapitalInput] = useState('')
  const [hasStartingCapital, setHasStartingCapital] = useState(true)
  const [todayStartingCapital, setTodayStartingCapital] = useState(0)

  // Pending Bills States
  const [pendingBills, setPendingBills] = useState([])
  const [settlingBill, setSettlingBill] = useState(null)

  // Cashier Cash Register Stats
  const [cashierCash, setCashierCash] = useState({
    balance: 0,
    todayIn: 0,
    todayOut: 0,
    todayQRIS: 0
  })
  const [todayTransactions, setTodayTransactions] = useState([])
  const [settlePaymentMethod, setSettlePaymentMethod] = useState('')
  const [settleCashReceived, setSettleCashReceived] = useState('')

  // Search & Filter States for Pending Bills & Transaction History
  const [pendingSearchQuery, setPendingSearchQuery] = useState('')
  const [historySearchQuery, setHistorySearchQuery] = useState('')
  const [historyDate, setHistoryDate] = useState(() => new Date().toLocaleDateString('en-CA'))

  // Inventory (Stok Gudang) states for Cashier Monitoring
  const [inventoryList, setInventoryList] = useState([])
  const [merchandiseList, setMerchandiseList] = useState([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventorySearchQuery, setInventorySearchQuery] = useState('')
  const [inventoryFilter, setInventoryFilter] = useState('ALL') // 'ALL' | 'SAFE' | 'LOW' | 'CRITICAL'

  // Cash Drawer popover state
  const [showCashDrawerDetail, setShowCashDrawerDetail] = useState(false)
  const [showCashOpsMenu, setShowCashOpsMenu] = useState(false)

  // Split Payment states
  const [splitCashAmount, setSplitCashAmount] = useState('')
  const [splitQrisAmount, setSplitQrisAmount] = useState('')

  // Tukar Uang (Cash Out) states
  const [exchangeCash, setExchangeCash] = useState('')
  const [exchangeQris, setExchangeQris] = useState('')
  const [exchangeCustomer, setExchangeCustomer] = useState('')

  const [editingStrukId, setEditingStrukId] = useState(null)

  // State Diskon & Kembalian
  const [discounts, setDiscounts] = useState([])
  const [selectedDiskonCarwash, setSelectedDiskonCarwash] = useState(null)
  const [selectedDiskonCafe, setSelectedDiskonCafe] = useState(null)
  const [uangDiterima, setUangDiterima] = useState('')

  // Receipt & Thermal Print State
  const [activeReceipt, setActiveReceipt] = useState(null)
  const [settleSurcharge, setSettleSurcharge] = useState({
    enabled: false,
    nominal: 50000,
    keterangan: 'Biaya Inap Kendaraan (1 Malam)'
  })

  // Order Type & Table/Buzzer identifier states (Cafe & Resto Enhancements)
  const [orderType, setOrderType] = useState('DINE IN') // 'DINE IN' | 'TAKE AWAY'
  const [tableOrQueueNumber, setTableOrQueueNumber] = useState('')
  const [activeNoteMenu, setActiveNoteMenu] = useState(null)
  const [activeNoteText, setActiveNoteText] = useState('')

  const handleSetItemNote = (menuName, note) => {
    setCart(prev => cartUpdateNotes(prev, menuName, note))
    setActiveNoteMenu(null)
    setActiveNoteText('')
  }

  // Custom Alert / Confirm Modal State
  const [customAlert, setCustomAlert] = useState(null)

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

  // POS State - Expense
  const [posExpenseForm, setPosExpenseForm] = useState({
    tanggal: new Date().toLocaleDateString('en-CA'),
    keterangan: '',
    nominal: '',
    unit: 'Cafe',
    kategori: 'Operasional',
    karyawan: '',
    category_id: ''
  })
  const [cashierAllowedCategories, setCashierAllowedCategories] = useState([])
  const [posMasterCategories, setPosMasterCategories] = useState([])
  const [isCustomPosExpenseKat, setIsCustomPosExpenseKat] = useState(false)
  const [todayExpenses, setTodayExpenses] = useState([])
  const [editingExpenseId, setEditingExpenseId] = useState(null)

  // Kategori terfilter berdasarkan unit usaha POS (Cafe / Carwash / Bersama)
  const filteredCashierCategories = useMemo(() => {
    const unit = String(posExpenseForm.unit || '').toLowerCase()
    return cashierAllowedCategories.filter(c => {
      const cJenis = String(c.jenis || '').toLowerCase()
      if (unit === 'cafe') {
        return cJenis.includes('cafe') || cJenis.includes('bersama') || cJenis === 'operasional' || cJenis === 'casbon'
      }
      if (unit === 'carwash') {
        return cJenis.includes('carwash') || cJenis.includes('bersama') || cJenis === 'operasional' || cJenis === 'casbon'
      }
      // 'bersama'
      return cJenis.includes('bersama') || cJenis === 'operasional' || cJenis === 'casbon' || cJenis.includes('umum')
    })
  }, [cashierAllowedCategories, posExpenseForm.unit])

  // POS State - Cafe
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCafeCategory, setSelectedCafeCategory] = useState('SEMUA')
  const [cart, setCart] = useState([])
  const [showMobileCart, setShowMobileCart] = useState(false)

  // POS State - Carwash
  const [carwashForm, setCarwashForm] = useState({
    kehadiran: 'TUNGGU',
    variant: 'Regular',
    ukuran: 'Small',
    paket: 'PAKET CUCI BIASA',
    anggota1: 'ANGGA',
    anggota2: '',
    platNomor: '',
    model: 'Mobil',
    noTelepon: '',
    harga: 50000,
    customHarga: 100000,
    gaji_pencuci: 16000,
    kondisi_bodi: 'Normal',
    barang_berharga: 'Aman',
    catatan_kendaraan: ''
  })
  const [hasCarwash, setHasCarwash] = useState(false)

  // Reset status carwash jika tenant tidak mendukung fitur carwash (murni Cafe)
  useEffect(() => {
    if (!features.hasCarwash && hasCarwash) {
      setHasCarwash(false)
    }
  }, [features.hasCarwash, hasCarwash])

  // ENUM Options (Static fields)
  const kehadiranOptions = ['TUNGGU', 'TINGGAL']
  const variantOptions = ['Regular', 'Body only']
  const ukuranOptions = ['Small', 'Medium', 'Large', 'Extra Large', 'Custom']

  // Master Paket & Karyawan Cuci Dinamis
  const [carwashPackages, setCarwashPackages] = useState(DEFAULT_CARWASH_PACKAGES)
  const [anggotaOptions, setAnggotaOptions] = useState([])

  const paketOptions = useMemo(() => {
    if (!carwashPackages || carwashPackages.length === 0) {
      return DEFAULT_CARWASH_PACKAGES.map(p => ({ nama: p.nama_paket, ...p }))
    }
    return carwashPackages
      .filter(p => p.is_active !== false)
      .map(p => ({ nama: p.nama_paket, ...p }))
  }, [carwashPackages])

  const loadMasterData = async () => {
    try {
      const results = await Promise.allSettled([
        supabase.from('kasir').select('*').eq('is_active', true),
        supabase.from('metode_bayar').select('*').eq('is_active', true),
        supabase.from('daftar_harga_menu').select('*'),
        supabase.from('resep').select('*'),
        supabase.from('diskon').select('*').order('created_at', { ascending: false }),
        supabase.from('carwash_packages').select('*').order('sort_order', { ascending: true }),
        supabase.from('karyawan_cuci').select('*').eq('is_active', true)
      ])

      const dbCashiers = results[0].status === 'fulfilled' ? results[0].value : { data: [] }
      const dbPayments = results[1].status === 'fulfilled' ? results[1].value : { data: [] }
      const dbMenu = results[2].status === 'fulfilled' ? results[2].value : { data: [] }
      const dbResep = results[3].status === 'fulfilled' ? results[3].value : { data: [] }
      const dbDiskon = results[4].status === 'fulfilled' ? results[4].value : { data: [] }
      const dbPackages = results[5].status === 'fulfilled' ? results[5].value : { data: [] }
      const dbKaryawan = results[6].status === 'fulfilled' ? results[6].value : { data: [] }

      if (dbPackages.data && dbPackages.data.length > 0) {
        setCarwashPackages(dbPackages.data)
      }
      if (dbKaryawan.data && dbKaryawan.data.length > 0) {
        setAnggotaOptions(dbKaryawan.data.map(k => k.nama || k.name).filter(Boolean))
      }

      const defaultCashiers = dbCashiers.data && dbCashiers.data.length > 0 ? dbCashiers.data : null
      const defaultPayments = dbPayments.data && dbPayments.data.length > 0 ? dbPayments.data : null
      const defaultMenus = dbMenu.data && dbMenu.data.length > 0
        ? dbMenu.data.map(m => ({ ...m, nama_menu: m.daftar_menu }))
        : null
      const defaultResep = dbResep.data && dbResep.data.length > 0 ? dbResep.data : null
      const defaultDiskon = dbDiskon.data && dbDiskon.data.length > 0 ? dbDiskon.data : null

      if (defaultCashiers) setCashiers(defaultCashiers)
      if (defaultPayments) {
        if (!defaultPayments.some(p => p.nama === 'SPLIT')) {
          defaultPayments.push({ nama: 'SPLIT', is_active: true })
        }
        setPaymentMethods(defaultPayments)
      }
      if (defaultMenus) setMenuItems(defaultMenus)
      if (defaultResep) setResepList(defaultResep)
      if (defaultDiskon) setDiscounts(defaultDiskon)

      // Fetch dynamic washing employees from karyawan_cuci
      try {
        const { data: dbKaryawan, error: karyawanErr } = await supabase
          .from('karyawan_cuci')
          .select('*')
          .order('nama', { ascending: true })

        if (!karyawanErr && dbKaryawan && dbKaryawan.length > 0) {
          const names = dbKaryawan.map(k => k.nama.toUpperCase().trim())
          setAnggotaOptions(names)
          setCarwashForm(prev => ({
            ...prev,
            anggota1: names[0] || 'ANGGA'
          }))
        }
      } catch (err) {
        console.warn('Fallback to static washing employees:', err)
      }

      if (profile && profile.role === 'Kasir') {
        setSelectedCashier(profile.nama ? profile.nama.toUpperCase() : '')
      } else if (defaultCashiers.length > 0) {
        setSelectedCashier(defaultCashiers[0].nama ? defaultCashiers[0].nama.toUpperCase() : '')
      }

      if (defaultPayments.length > 0) setSelectedPayment(defaultPayments[0].nama)

      await Promise.all([
        fetchPendingBills(),
        fetchCashierCash(),
        fetchTodayTransactions(),
        fetchTodayExpenses(),
        fetchInventory()
      ])

    } catch (err) {
      console.error('Error loading master data:', err)
    }
  }

  const fetchCashierCash = async () => {
    try {
      // 1. Fetch balance dari pos_balances
      const { data: balData } = await supabase
        .from('pos_balances')
        .select('*')
        .eq('pos', 'SALDO CASH')
        .single()

      const bal = balData ? parseFloat(balData.balance) : 0

      const todayDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
      const { data: todayStruk } = await supabase
        .from('struk')
        .select('total_tagihan, metode_bayar, nominal_cash, nominal_qris, waktu_dibayar, tanggal')
        .eq('status_bayar', 'Selesai')

      let todayIn = 0
      let todayQRIS = 0
      if (todayStruk) {
        todayStruk.forEach(s => {
          // Uang masuk ke kasir dihitung berdasarkan tanggal penyelesaian/pembayaran fisik
          const settlementDate = (s.waktu_dibayar ? s.waktu_dibayar.split('T')[0] : null) || s.tanggal
          if (settlementDate === todayDate) {
            if (s.metode_bayar === 'CASH') {
              todayIn += parseFloat(s.total_tagihan || 0)
            } else if (s.metode_bayar === 'QRIS') {
              todayQRIS += parseFloat(s.total_tagihan || 0)
            } else if (s.metode_bayar === 'SPLIT') {
              todayIn += parseFloat(s.nominal_cash || 0)
              todayQRIS += parseFloat(s.nominal_qris || 0)
            }
          }
        })
      }

      // 3. Fetch today's cash outflow
      const { data: todayExp } = await supabase
        .from('pengeluaran')
        .select('nominal')
        .eq('tanggal', todayDate)

      const todayOut = todayExp ? todayExp.reduce((sum, item) => sum + parseFloat(item.nominal || 0), 0) : 0

      setCashierCash({
        balance: bal,
        todayIn: todayIn,
        todayOut: todayOut,
        todayQRIS: todayQRIS
      })
    } catch (err) {
      console.error('Error fetching cashier cash status:', err)
    }
  }

  const fetchTodayTransactions = async (targetDate = historyDate) => {
    try {
      const { data, error } = await supabase
        .from('struk')
        .select(`
          id_struk,
          tanggal,
          jam,
          kasir,
          total_tagihan,
          metode_bayar,
          status_bayar,
          nama_pelanggan,
          nominal_cash,
          nominal_qris,
          waktu_dibayar,
          cafe (nama_menu, qty, harga_satuan),
          carwash (paket, plat, harga, model, no_telepon, kehadiran)
        `)
        .order('jam', { ascending: false })

      if (error) throw error

      if (data) {
        const filtered = data.filter(item => {
          const settleDate = (item.waktu_dibayar ? item.waktu_dibayar.split('T')[0] : null) || item.tanggal
          return item.tanggal === targetDate || settleDate === targetDate
        })

        const formatted = filtered.map(item => ({
          id: item.id_struk,
          tanggal: item.tanggal,
          jam: item.jam,
          kasir: item.kasir,
          total_harga: item.total_tagihan,
          metode_bayar: item.metode_bayar,
          status_bayar: item.status_bayar,
          nama_pelanggan: item.nama_pelanggan,
          nominal_cash: item.nominal_cash,
          nominal_qris: item.nominal_qris,
          waktu_dibayar: item.waktu_dibayar,
          cafe: (item.cafe || []).map(c => ({
            nama_menu: c.nama_menu,
            jumlah: c.qty,
            harga_satuan: c.harga_satuan
          })),
          carwash: (item.carwash || []).map(cw => ({
            paket: cw.paket,
            plat_nomor: cw.plat,
            harga: cw.harga,
            merk_mobil: cw.model,
            no_telepon: cw.no_telepon,
            kehadiran: cw.kehadiran
          }))
        }))
        setTodayTransactions(formatted)
      } else {
        setTodayTransactions([])
      }
    } catch (err) {
      console.error('Error fetching today transactions:', err)
    }
  }

  useEffect(() => {
    fetchTodayTransactions(historyDate)
  }, [historyDate])

  const filteredPendingBills = useMemo(() => {
    if (!pendingSearchQuery.trim()) return pendingBills
    const q = pendingSearchQuery.toLowerCase().trim()
    return pendingBills.filter((bill) => {
      const matchId = (bill.id || '').toLowerCase().includes(q)
      const matchKasir = (bill.kasir || '').toLowerCase().includes(q)
      const matchDate = (bill.tanggal || '').toLowerCase().includes(q)
      const matchCafe = bill.cafe?.some((c) => (c.nama_menu || '').toLowerCase().includes(q))
      const matchCw = bill.carwash?.some(
        (cw) =>
          (cw.plat_nomor || '').toLowerCase().includes(q) ||
          (cw.paket || '').toLowerCase().includes(q) ||
          (cw.merk_mobil || '').toLowerCase().includes(q)
      )
      return matchId || matchKasir || matchDate || matchCafe || matchCw
    })
  }, [pendingBills, pendingSearchQuery])

  const filteredTodayTransactions = useMemo(() => {
    if (!historySearchQuery.trim()) return todayTransactions
    const q = historySearchQuery.toLowerCase().trim()
    return todayTransactions.filter((tx) => {
      const matchId = (tx.id || '').toLowerCase().includes(q)
      const matchKasir = (tx.kasir || '').toLowerCase().includes(q)
      const matchCust = (tx.nama_pelanggan || '').toLowerCase().includes(q)
      const matchMethod = (tx.metode_bayar || '').toLowerCase().includes(q)
      const matchStatus = (tx.status_bayar || '').toLowerCase().includes(q)
      const matchCafe = tx.cafe?.some((c) => (c.nama_menu || '').toLowerCase().includes(q))
      const matchCw = tx.carwash?.some(
        (cw) =>
          (cw.plat_nomor || '').toLowerCase().includes(q) ||
          (cw.paket || '').toLowerCase().includes(q) ||
          (cw.merk_mobil || '').toLowerCase().includes(q)
      )
      return matchId || matchKasir || matchCust || matchMethod || matchStatus || matchCafe || matchCw
    })
  }, [todayTransactions, historySearchQuery])

  const fetchInventory = async () => {
    try {
      setInventoryLoading(true)
      const { data, error } = await supabase
        .from('stok_barang')
        .select('*')
        .order('nama_produk', { ascending: true })

      if (error) throw error
      const fetched = data || []
      setInventoryList(fetched)
      const merch = fetched.filter(i => 
        (
          i.gudang === 'MERCHANDISE' ||
          i.tipe_barang === 'MERCHANDISE' || 
          i.kategori === 'MERCHANDISE' || 
          i.kategori === 'Merchandise' || 
          i.kategori === 'Parfum Mobil' ||
          i.kategori === 'Lap & Perawatan' ||
          i.kategori === 'Aksesoris & Detailing' ||
          i.kategori === 'Chemical Retail' ||
          i.kategori === 'Snack & Minuman Ringan' ||
          i.tipe === 'BARANG_JADI' ||
          String(i.kategori || '').toLowerCase().includes('retail')
        ) && i.is_active !== false
      )
      setMerchandiseList(merch)
    } catch (err) {
      console.error('Error fetching inventory stock:', err)
    } finally {
      setInventoryLoading(false)
    }
  }

  const filteredInventory = useMemo(() => {
    return inventoryList.filter((item) => {
      const stokVal = Number(item.stok) || 0
      if (inventoryFilter === 'SAFE' && stokVal <= 10) return false
      if (inventoryFilter === 'LOW' && (stokVal <= 0 || stokVal > 10)) return false
      if (inventoryFilter === 'CRITICAL' && stokVal > 0) return false

      if (!inventorySearchQuery.trim()) return true
      const q = inventorySearchQuery.toLowerCase().trim()
      const matchName = (item.nama_produk || '').toLowerCase().includes(q)
      const matchCode = (item.id_bahan_baku || '').toLowerCase().includes(q)
      const matchSatuan = (item.satuan || '').toLowerCase().includes(q)
      return matchName || matchCode || matchSatuan
    })
  }, [inventoryList, inventorySearchQuery, inventoryFilter])

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchPendingBills()
    } else if (activeTab === 'history') {
      fetchTodayTransactions(historyDate)
    } else if (activeTab === 'inventory') {
      fetchInventory()
    }
  }, [activeTab])

  const fetchTodayExpenses = async () => {
    try {
      const todayDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
      const { data, error } = await supabase
        .from('pengeluaran')
        .select('*')
        .eq('tanggal', todayDate)
        .order('jam', { ascending: false })

      if (error) throw error
      setTodayExpenses(data || [])

      // Fetch kategori yang diizinkan untuk kasir & seluruh master categories
      const [resAllowed, resAll] = await Promise.allSettled([
        supabase.from('master_categories').select('*').eq('boleh_kasir', true),
        supabase.from('master_categories').select('*').eq('is_active', true)
      ])

      if (resAllowed.status === 'fulfilled' && resAllowed.value.data) {
        setCashierAllowedCategories(resAllowed.value.data)
      }
      if (resAll.status === 'fulfilled' && resAll.value.data) {
        setPosMasterCategories(resAll.value.data)
      }
    } catch (err) {
      console.error('Error fetching today expenses:', err)
    }
  }

  const handleSavePosExpense = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    const validation = validatePosExpenseForm(posExpenseForm)
    if (!validation.isValid) {
      setLoading(false)
      return setError(validation.error)
    }

    try {
      if (editingExpenseId) {
        // Mode Edit: Update data pengeluaran
        const isCasbon = posExpenseForm.kategori === 'Casbon'
        const updatePayload = {
          jenis: isCasbon ? 'Casbon' : `pengeluaran ${posExpenseForm.unit}`,
          kategori: isCasbon ? `Casbon - ${posExpenseForm.karyawan}` : posExpenseForm.kategori,
          nominal: parseFloat(posExpenseForm.nominal),
          nama_pengeluaran: isCasbon ? `Casbon ${posExpenseForm.karyawan} (${posExpenseForm.keterangan})` : posExpenseForm.keterangan,
        }

        const { error: updErr } = await supabase
          .from('pengeluaran')
          .update(updatePayload)
          .eq('id_pengeluaran', editingExpenseId)

        if (updErr) throw updErr
        setEditingExpenseId(null)
      } else {
        // Mode Baru: Insert data pengeluaran
        const todayDate = new Date().toLocaleDateString('en-CA')
        const currentTime = new Date().toTimeString().split(' ')[0]
        const newExpId = generateUUID()

        const payload = formatPosExpensePayload({
          form: posExpenseForm,
          todayDate,
          currentTime,
          newExpId
        })

        const { error: insErr } = await supabase
          .from('pengeluaran')
          .insert(payload)

        if (insErr) throw insErr
      }

      setSuccess(true)
      setPosExpenseForm({
        tanggal: new Date().toLocaleDateString('en-CA'),
        keterangan: '',
        nominal: '',
        unit: 'Cafe',
        kategori: 'Operasional',
        karyawan: ''
      })
      setIsCustomPosExpenseKat(false)
      await fetchTodayExpenses()
      await fetchCashierCash()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving POS expense:', err)
      setError(err.message || 'Gagal menyimpan pengeluaran.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveExchange = async (e) => {
    e.preventDefault()

    const cashOut = parseFloat(exchangeCash || 0)
    const qrisIn = parseFloat(exchangeQris || 0)
    const adminFee = qrisIn - cashOut

    if (cashOut <= 0 || qrisIn <= 0) {
      await showAlert('Jumlah uang tunai dan transfer QRIS harus lebih besar dari 0!', 'Input Tidak Valid')
      return
    }

    if (adminFee < 0) {
      const confirmed = await showConfirm('PERINGATAN: Nominal QRIS masuk lebih kecil dari Cash keluar. Ini berarti toko Anda rugi selisih. Tetap lanjutkan?', 'Perhatian')
      if (!confirmed) {
        return
      }
    }

    if (!selectedCashier) {
      await showAlert('Silakan pilih kasir terlebih dahulu di bagian atas halaman!', 'Kasir Belum Dipilih')
      return
    }

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const todayDate = new Date().toLocaleDateString('en-CA')
      const currentTime = new Date().toTimeString().split(' ')[0]
      const timestamp = new Date().toISOString()

      const newStrukId = generateUUID()
      const newPengeluaranId = generateUUID()

      // 1. Catat Struk Pemasukan QRIS
      const { error: strukErr } = await supabase
        .from('struk')
        .insert({
          id_struk: newStrukId,
          tanggal: todayDate,
          jam: currentTime,
          metode_bayar: 'QRIS',
          status_bayar: 'Selesai',
          kasir: selectedCashier.toUpperCase(),
          total_tagihan: qrisIn,
          keterangan: `Tukar Uang (Tarik Tunai) - Cust: ${exchangeCustomer || 'Umum'}`,
          waktu_dibuat: timestamp,
          waktu_dibayar: timestamp
        })

      if (strukErr) throw strukErr

      // 2. Catat Pengeluaran Cash Laci
      const { error: expErr } = await supabase
        .from('pengeluaran')
        .insert({
          id_pengeluaran: newPengeluaranId,
          tanggal: todayDate,
          jam: currentTime,
          nominal: cashOut,
          nama_pengeluaran: `Tukar Uang Cash Keluar - Cust: ${exchangeCustomer || 'Umum'}`,
          jenis: 'pengeluaran Bersama',
          kategori: 'Tukar Uang',
          apakah_stok: 'tidak',
          created_at: timestamp
        })

      if (expErr) throw expErr

      await showAlert('Transaksi Tukar Uang berhasil dicatat!', 'Sukses')
      setExchangeCash('')
      setExchangeQris('')
      setExchangeCustomer('')
      await fetchCashierCash()
    } catch (err) {
      console.error(err)
      await showAlert('Gagal mencatat Tukar Uang: ' + err.message, 'Error')
    } finally {
      setLoading(false)
    }
  }

  const handleStartEditTransaction = async (struk) => {
    setLoading(true)
    setError('')
    setSuccess(false)
    try {
      // 1. Ambil data Cafe items
      const { data: dbCafe, error: cafeErr } = await supabase
        .from('cafe')
        .select('*')
        .eq('id_struk', struk.id_struk)

      if (cafeErr) throw cafeErr

      // 2. Ambil data Carwash item
      const { data: dbCw, error: cwErr } = await supabase
        .from('carwash')
        .select('*')
        .eq('id_struk', struk.id_struk)
        .maybeSingle()

      if (cwErr) throw cwErr

      // 3. Masukkan ke state Cart Cafe
      const cartItems = (dbCafe || []).map(item => ({
        nama_menu: item.nama_menu,
        qty: item.qty,
        harga: item.harga_satuan
      }))
      setCart(cartItems)

      // 4. Masukkan ke state Carwash Form
      if (dbCw) {
        setHasCarwash(true)
        setCarwashForm({
          platNomor: dbCw.plat || '',
          model: dbCw.model || 'Mobil',
          noTelepon: dbCw.no_telepon || '',
          ukuran: dbCw.ukuran || 'Medium',
          variant: dbCw.variant || 'Regular',
          paket: dbCw.paket || 'PAKET CUCI BIASA',
          harga: parseFloat(dbCw.harga || 0),
          gaji_pencuci: parseFloat(dbCw.gaji_pencuci || 0),
          kehadiran: dbCw.kehadiran || 'hadir',
          anggota1: dbCw.anggota_1 || '',
          anggota2: dbCw.anggota_2 || ''
        })
      } else {
        setHasCarwash(false)
      }

      // 5. Masukkan state bayar
      setEditingStrukId(struk.id_struk)
      setSelectedPayment(struk.metode_bayar || 'CASH')
      setPaymentStatus(struk.status_bayar || 'Selesai')

      if (struk.metode_bayar === 'SPLIT') {
        setSplitCashAmount(String(struk.nominal_cash || 0))
        setSplitQrisAmount(String(struk.nominal_qris || 0))
      } else {
        setSplitCashAmount('')
        setSplitQrisAmount('')
      }

      if (struk.diskon_carwash && parseFloat(struk.diskon_carwash) > 0) {
        setSelectedDiskonCarwash({ nama: 'Diskon Terpasang', nominal: parseFloat(struk.diskon_carwash), tipe: 'Rupiah' })
      } else {
        setSelectedDiskonCarwash(null)
      }

      if (struk.diskon_cafe && parseFloat(struk.diskon_cafe) > 0) {
        setSelectedDiskonCafe({ nama: 'Diskon Terpasang', nominal: parseFloat(struk.diskon_cafe), tipe: 'Rupiah' })
      } else {
        setSelectedDiskonCafe(null)
      }
      setUangDiterima('')

      // 6. Switch tab ke cafe agar kasir langsung melihat keranjang belanjanya
      setActiveTab('cafe')
      await showAlert(`Berhasil memuat transaksi #${struk.id_struk.substring(0, 8)} untuk diedit.`, 'Sukses')
    } catch (err) {
      console.error(err)
      await showAlert('Gagal memuat detail transaksi: ' + err.message, 'Error')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelEditTransaction = async () => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin membatalkan pengeditan? Keranjang belanja saat ini akan dikosongkan.', 'Batal Edit')
    if (confirmed) {
      setEditingStrukId(null)
      setCart([])
      setHasCarwash(false)
      setSelectedDiskonCarwash(null)
      setSelectedDiskonCafe(null)
      setUangDiterima('')
      setCarwashForm({
        platNomor: '',
        model: 'Mobil',
        noTelepon: '',
        ukuran: 'Medium',
        variant: 'Regular',
        paket: 'PAKET CUCI BIASA',
        harga: 55000,
        gaji_pencuci: 12000,
        kehadiran: 'hadir',
        anggota1: anggotaOptions[0] || 'ANGGA',
        anggota2: ''
      })
      setSplitCashAmount('')
      setSplitQrisAmount('')
    }
  }

  const handleStartEditPosExpense = (exp) => {
    const isCasbon = exp.jenis === 'Casbon' || String(exp.kategori || '').startsWith('Casbon')
    let employeeName = ''
    let cleanKeterangan = exp.nama_pengeluaran || ''

    if (isCasbon) {
      employeeName = String(exp.kategori || '').replace('Casbon - ', '').trim()
      const match = String(exp.nama_pengeluaran || '').match(/\((.*)\)/)
      if (match && match[1]) {
        cleanKeterangan = match[1]
      } else if (String(exp.nama_pengeluaran || '').startsWith(`Casbon ${employeeName}`)) {
        cleanKeterangan = String(exp.nama_pengeluaran || '').replace(`Casbon ${employeeName}`, '').replace(/^\s*-\s*/, '').trim()
      }
    }

    setPosExpenseForm({
      tanggal: exp.tanggal || new Date().toLocaleDateString('en-CA'),
      keterangan: cleanKeterangan,
      nominal: String(exp.nominal || ''),
      unit: exp.jenis ? exp.jenis.replace('pengeluaran ', '') : 'Cafe',
      kategori: isCasbon ? 'Casbon' : (exp.kategori || 'Operasional'),
      karyawan: employeeName
    })
    setEditingExpenseId(exp.id_pengeluaran)
  }

  const handleDeletePosExpense = async (idExp) => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin menghapus catatan pengeluaran kasir ini?', 'Hapus Pengeluaran')
    if (!confirmed) return
    setLoading(true)
    setError('')
    try {
      const { error: delErr } = await supabase
        .from('pengeluaran')
        .delete()
        .eq('id_pengeluaran', idExp)

      if (delErr) throw delErr

      setSuccess(true)
      await fetchTodayExpenses()
      await fetchCashierCash()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error deleting POS expense:', err)
      setError(err.message || 'Gagal menghapus pengeluaran.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelPaidTransaction = async (idStruk) => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin MEMBATALKAN transaksi yang sudah lunas ini? Status transaksi akan diubah menjadi Batal dan stok bahan baku akan dikembalikan otomatis.', 'Batalkan Transaksi')
    if (!confirmed) return
    setLoading(true)
    setError('')
    setSuccess(false)
    try {
      // 1. Update status_bayar di tabel struk menjadi 'Batal'
      const { error: strukErr } = await supabase
        .from('struk')
        .update({ status_bayar: 'Batal' })
        .eq('id_struk', idStruk)

      if (strukErr) throw strukErr

      // 2. Update status di tabel cafe menjadi 'Batal' (memicu trigger pengembalian stok)
      const { error: cafeErr } = await supabase
        .from('cafe')
        .update({ status: 'Batal' })
        .eq('id_struk', idStruk)

      if (cafeErr) throw cafeErr

      // 3. Update status di tabel carwash menjadi 'Batal'
      const { error: cwErr } = await supabase
        .from('carwash')
        .update({ status: 'Batal' })
        .eq('id_struk', idStruk)

      if (cwErr) throw cwErr

      setSuccess(true)
      await fetchTodayTransactions()
      await fetchCashierCash()
      await fetchPendingBills()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error canceling paid transaction:', err)
      setError(err.message || 'Gagal membatalkan transaksi.')
    } finally {
      setLoading(false)
    }
  }

  const handleReactivatePaidTransaction = async (idStruk) => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin MENGAKTIFKAN KEMBALI transaksi yang telah dibatalkan ini? Status transaksi akan diubah menjadi Selesai dan stok bahan baku akan dipotong kembali.', 'Pulihkan Transaksi')
    if (!confirmed) return
    setLoading(true)
    setError('')
    setSuccess(false)
    try {
      // 1. Update status_bayar di tabel struk menjadi 'Selesai'
      const { error: strukErr } = await supabase
        .from('struk')
        .update({ status_bayar: 'Selesai' })
        .eq('id_struk', idStruk)

      if (strukErr) throw strukErr

      // 2. Update status di tabel cafe menjadi 'Selesai' (memicu trigger pengurangan stok)
      const { error: cafeErr } = await supabase
        .from('cafe')
        .update({ status: 'Selesai' })
        .eq('id_struk', idStruk)

      if (cafeErr) throw cafeErr

      // 3. Update status di tabel carwash menjadi 'Selesai'
      const { error: cwErr } = await supabase
        .from('carwash')
        .update({ status: 'Selesai' })
        .eq('id_struk', idStruk)

      if (cwErr) throw cwErr

      setSuccess(true)
      await fetchTodayTransactions()
      await fetchCashierCash()
      await fetchPendingBills()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error reactivating transaction:', err)
      setError(err.message || 'Gagal mengaktifkan kembali transaksi.')
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingBills = async () => {
    try {
      const { data, error } = await supabase
        .from('struk')
        .select(`
          id_struk,
          tanggal,
          jam,
          kasir,
          total_tagihan,
          metode_bayar,
          created_at,
          cafe (nama_menu, qty, harga_satuan),
          carwash (paket, plat, harga, model, no_telepon, kehadiran)
        `)
        .eq('status_bayar', 'Pending')
        .order('tanggal', { ascending: false })

      if (error) throw error

      if (data) {
        const formatted = data.map(item => ({
          id: item.id_struk,
          tanggal: item.tanggal,
          jam: item.jam,
          created_at: item.created_at || `${item.tanggal}T${item.jam || '00:00:00'}`,
          kasir: item.kasir || 'Kasir',
          total_harga: item.total_tagihan || 0,
          metode_bayar: item.metode_bayar || 'CASH',
          cafe: (item.cafe || []).map(c => ({
            nama_menu: c.nama_menu,
            jumlah: c.qty,
            harga_satuan: c.harga_satuan
          })),
          carwash: (item.carwash || []).map(cw => ({
            paket: cw.paket,
            plat_nomor: cw.plat,
            harga: cw.harga,
            merk_mobil: cw.model,
            no_telepon: cw.no_telepon,
            kehadiran: cw.kehadiran
          }))
        }))
        setPendingBills(formatted)
      } else {
        setPendingBills([])
      }
    } catch (err) {
      console.error('Error fetching pending bills:', err)
    }
  }

  const checkTodayStartingCapital = async () => {
    try {
      const todayDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
      const localCapital = localStorage.getItem(`starting_capital_${todayDate}`)

      if (localCapital !== null) {
        setHasStartingCapital(true)
        setTodayStartingCapital(parseFloat(localCapital) || 0)
      } else {
        setHasStartingCapital(false)
        setShowModalModal(true)
      }
    } catch (err) {
      console.error('Error checking starting capital:', err)
    }
  }

  const handleSaveStartingCapital = async (e) => {
    e.preventDefault()
    const amount = parseFloat(startingCapitalInput)
    if (isNaN(amount) || amount < 0) {
      return setError('Modal awal harus berupa angka positif.')
    }
    setLoading(true)
    setError('')
    try {
      const todayDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
      localStorage.setItem(`starting_capital_${todayDate}`, amount.toString())

      setHasStartingCapital(true)
      setShowModalModal(false)
      setTodayStartingCapital(amount)
      setStartingCapitalInput('')
      await fetchCashierCash()
    } catch (err) {
      console.error('Error saving starting capital:', err)
      setError('Gagal menyimpan modal awal secara lokal.')
    } finally {
      setLoading(false)
    }
  }

  const handleTutupKasir = async () => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin Tutup Kasir hari ini? Ini akan merekap total omzet (Cash & QRIS) serta pengeluaran kasir ke dalam tabel Cashflow. Lakukan ini HANYA SEKALI di akhir shift terakhir.', 'Tutup Kasir (EOD)')
    if (!confirmed) return
    setLoading(true)
    setError('')
    try {
      const todayDate = new Date().toLocaleDateString('en-CA')

      // 1. Ambil semua struk lunas hari ini beserta rincian carwash & cafe
      const { data: strukHariIni, error: errStruk } = await supabase
        .from('struk')
        .select(`
          id_struk, total_tagihan, metode_bayar, nominal_cash, nominal_qris,
          cafe (subtotal, status),
          carwash (harga, status)
        `)
        .eq('status_bayar', 'Selesai')
        .eq('tanggal', todayDate)

      if (errStruk) throw errStruk

      // 2. Ambil total pengeluaran kasir hari ini (pengeluaran sudah tercatat real-time, tidak diduplikasi)
      const { data: expHariIni, error: errExp } = await supabase
        .from('pengeluaran')
        .select('nominal')
        .eq('tanggal', todayDate)

      if (errExp) throw errExp

      const timestamp = new Date().toISOString()
      const insertions = calculateTutupKasirRecap({
        receipts: strukHariIni || [],
        expenses: [], // Pengeluaran sudah tercatat otomatis per transaksi real-time ke cashflow
        cashierName: selectedCashier,
        todayDate,
        timestamp
      })

      if (insertions.length > 0) {
        const { error: insErr } = await supabase.from('cashflow').insert(insertions)
        if (insErr) throw insErr
      }

      await showAlert('Berhasil Tutup Kasir. Rekap Omzet Harian (Carwash & Cafe) telah masuk ke Cashflow.', 'Sukses')
    } catch (err) {
      console.error('Error Tutup Kasir:', err)
      await showAlert('Gagal tutup kasir: ' + err.message, 'Error')
    } finally {
      setLoading(false)
    }
  }

  const handleSettleBill = async (e) => {
    e.preventDefault()
    if (!settlingBill) return
    if (!settlePaymentMethod) return setError('Pilih metode pembayaran terlebih dahulu.')

    const { finalTotal, surchargeAmount, surchargeDescription } = calculateSettlementWithSurcharge(
      settlingBill.total_harga,
      settleSurcharge
    )

    const targetCashToPay = settlePaymentMethod === 'SPLIT' 
      ? (parseFloat(splitCashAmount) || 0) 
      : (settlePaymentMethod === 'CASH' ? finalTotal : 0)

    if (settleCashReceived && targetCashToPay > 0 && parseFloat(settleCashReceived) < targetCashToPay) {
      setError(`Uang yang diterima (${formatRupiah(parseFloat(settleCashReceived))}) kurang dari jumlah yang harus dibayar (${formatRupiah(targetCashToPay)}).`)
      return
    }

    setLoading(true)
    setError('')
    try {
      let nCash = 0
      let nQris = 0
      if (settlePaymentMethod === 'SPLIT') {
        nCash = parseFloat(splitCashAmount || 0)
        nQris = parseFloat(splitQrisAmount || 0)
        if (Math.abs((nCash + nQris) - finalTotal) > 0.01) {
          setError(`Gagal Pelunasan: Jumlah bayar Tunai (${formatRupiah(nCash)}) + QRIS (${formatRupiah(nQris)}) tidak sama dengan Total Tagihan (${formatRupiah(finalTotal)}).`)
          setLoading(false)
          return
        }
      } else if (settlePaymentMethod === 'CASH') {
        nCash = finalTotal
      } else if (settlePaymentMethod === 'QRIS') {
        nQris = finalTotal
      }

      // 1. Simpan item biaya inap / cas tambahan jika ada
      if (surchargeAmount > 0) {
        await supabase.from('cafe').insert({
          id_detail: generateUUID(),
          id_struk: settlingBill.id,
          nama_menu: surchargeDescription || 'Biaya Inap Kendaraan',
          qty: 1,
          harga_satuan: surchargeAmount,
          subtotal: surchargeAmount,
          status: 'Selesai'
        })
      }

      // 2. Update status struk menjadi lunas dengan total tagihan yang telah disesuaikan
      const { error: strukErr } = await supabase
        .from('struk')
        .update({
          status_bayar: 'Selesai',
          metode_bayar: settlePaymentMethod,
          total_tagihan: finalTotal,
          nominal_cash: nCash,
          nominal_qris: nQris,
          waktu_dibayar: new Date().toISOString()
        })
        .eq('id_struk', settlingBill.id)

      if (strukErr) throw strukErr

      // Update status carwash jika ada
      await supabase
        .from('carwash')
        .update({ status: 'Selesai' })
        .eq('id_struk', settlingBill.id)

      // Update status cafe jika ada
      await supabase
        .from('cafe')
        .update({ status: 'Selesai' })
        .eq('id_struk', settlingBill.id)

      const finalKembalian = (settleCashReceived && targetCashToPay > 0) ? Math.max(0, parseFloat(settleCashReceived) - targetCashToPay) : 0

      // Siapkan payload struk bukti pembayaran untuk kasir
      const settledReceiptData = buildPaymentReceiptData({
        id_struk: settlingBill.id,
        tanggal: settlingBill.tanggal,
        jam: settlingBill.jam,
        kasir: (selectedCashier || settlingBill.kasir || 'KASIR').toUpperCase(),
        status_bayar: 'Selesai',
        metode_bayar: settlePaymentMethod,
        total_tagihan: finalTotal,
        nominal_cash: nCash,
        nominal_qris: nQris,
        uang_diterima: parseFloat(settleCashReceived) || nCash || finalTotal,
        kembalian: finalKembalian,
        carwash: settlingBill.carwash?.map(cw => ({
          plat: cw.plat_nomor || cw.plat,
          model: cw.merk_mobil || cw.model,
          paket: cw.paket,
          harga: cw.harga,
          kehadiran: cw.kehadiran || 'TINGGAL',
          no_telepon: cw.no_telepon || ''
        })) || [],
        cafe: [
          ...(settlingBill.cafe?.map(c => ({
            nama_menu: c.nama_menu,
            qty: c.jumlah || c.qty,
            harga_satuan: c.harga_satuan,
            subtotal: (c.jumlah || c.qty) * c.harga_satuan
          })) || []),
          ...(surchargeAmount > 0 ? [{
            nama_menu: surchargeDescription || 'Biaya Inap Kendaraan',
            qty: 1,
            harga_satuan: surchargeAmount,
            subtotal: surchargeAmount
          }] : [])
        ]
      })

      setActiveReceipt(settledReceiptData)

      setSuccess(true)
      setSettlingBill(null)
      setSettlePaymentMethod('')
      setSplitCashAmount('')
      setSplitQrisAmount('')
      setSettleCashReceived('')
      setSettleSurcharge({ enabled: false, nominal: 50000, keterangan: 'Biaya Inap Kendaraan (1 Malam)' })
      await fetchPendingBills()
      await fetchCashierCash()
      await fetchTodayTransactions()

      if (finalKembalian > 0) {
        await showAlert(`Pelunasan Tagihan Berhasil!\n\nUang Diterima: ${formatRupiah(parseFloat(settleCashReceived))}\nKembalian: ${formatRupiah(finalKembalian)}`, 'Sukses Pelunasan')
      }
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error settling bill:', err)
      setError(err.message || 'Gagal menyelesaikan pembayaran.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelBill = async (billId) => {
    const confirmed = await showConfirm('Apakah Anda yakin ingin membatalkan transaksi ini? Transaksi yang dibatalkan tidak dapat dikembalikan.', 'Batalkan Transaksi')
    if (!confirmed) return
    setLoading(true)
    setError('')
    setSuccess(false)
    try {
      // 1. Update status_bayar di struk menjadi 'Batal'
      const { error: strukErr } = await supabase
        .from('struk')
        .update({ status_bayar: 'Batal' })
        .eq('id_struk', billId)

      if (strukErr) throw strukErr

      // 2. Update status di carwash (jika ada) menjadi 'Batal'
      await supabase
        .from('carwash')
        .update({ status: 'Batal' })
        .eq('id_struk', billId)

      // 3. Update status di cafe (jika ada) menjadi 'Batal'
      await supabase
        .from('cafe')
        .update({ status: 'Batal' })
        .eq('id_struk', billId)

      setSuccess(true)
      await fetchPendingBills()
      await fetchTodayTransactions()
      await fetchCashierCash()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Cancel bill error:', err)
      setError(err.message || 'Gagal membatalkan transaksi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setCart([])
    loadMasterData()
    checkTodayStartingCapital()
  }, [effectiveTenantId])

  // Auto-fill car details based on plate number
  useEffect(() => {
    const plat = carwashForm.platNomor;
    if (!plat || plat.trim().length < 4) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        const cleanPlat = plat.replace(/\s+/g, '').toUpperCase();
        const { data, error } = await supabase
          .from('carwash')
          .select('model, no_telepon, ukuran, variant, paket')
          .eq('plat', cleanPlat)
          .order('created_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          const latest = data[0];
          setCarwashForm(prev => ({
            ...prev,
            model: latest.model || prev.model,
            noTelepon: latest.no_telepon || prev.noTelepon,
            ukuran: latest.ukuran || prev.ukuran,
            variant: latest.variant || prev.variant,
            paket: latest.paket || prev.paket
          }));
        }
      } catch (err) {
        console.error('Error fetching customer history:', err);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [carwashForm.platNomor]);

  // Update Harga Carwash otomatis berdasarkan master paket cuci & skema komisi
  useEffect(() => {
    const selectedPkg = carwashPackages.find(p => p.nama_paket === carwashForm.paket) || carwashPackages[0]
    const basicPkg = carwashPackages.find(p => p.nama_paket === 'PAKET CUCI BIASA') || carwashPackages[0]
    const { harga, gaji_pencuci } = calculateCarwashPriceAndCommission({
      packageItem: selectedPkg,
      ukuran: carwashForm.ukuran,
      variant: carwashForm.variant,
      customHarga: carwashForm.customHarga,
      basicWashPrices: basicPkg?.tarif
    })

    setCarwashForm(prev => ({
      ...prev,
      harga,
      gaji_pencuci
    }))
  }, [carwashForm.paket, carwashForm.ukuran, carwashForm.variant, carwashForm.customHarga, carwashPackages])

  // Cart Handlers
  const addToCart = (menu) => {
    setCart(prev => cartAdd(prev, menu))
  }

  const updateQty = (menuName, delta) => {
    setCart(prev => cartUpdate(prev, menuName, delta))
  }

  const removeFromCart = (menuName) => {
    setCart(prev => cartRemove(prev, menuName))
  }

  // Calculate Totals
  const effectiveHasCarwash = Boolean(features.hasCarwash && hasCarwash)
  const cafeTotal = cart.reduce((sum, item) => sum + (item.harga * item.qty), 0)
  const carwashTotal = effectiveHasCarwash ? parseFloat(carwashForm.harga) : 0
  
  const diskonCarwashNominal = selectedDiskonCarwash 
    ? (selectedDiskonCarwash.tipe === 'Persen' 
        ? (carwashTotal * parseFloat(selectedDiskonCarwash.nominal)) / 100 
        : parseFloat(selectedDiskonCarwash.nominal))
    : 0;

  const diskonCafeNominal = selectedDiskonCafe 
    ? (selectedDiskonCafe.tipe === 'Persen' 
        ? (cafeTotal * parseFloat(selectedDiskonCafe.nominal)) / 100 
        : parseFloat(selectedDiskonCafe.nominal))
    : 0;

  const grandTotal = Math.max(0, cafeTotal - diskonCafeNominal) + Math.max(0, carwashTotal - diskonCarwashNominal)
  
  const kembalian = uangDiterima ? parseFloat(uangDiterima) - grandTotal : 0
  const isUangKurang = uangDiterima && kembalian < 0

  // Checkout Handler
  const handleCheckout = async () => {
    if (!selectedCashier) return setError('Pilih kasir terlebih dahulu.')
    if (paymentStatus === 'Selesai' && !selectedPayment) return setError('Pilih metode pembayaran.')
    if (cart.length === 0 && !effectiveHasCarwash) return setError('Keranjang belanja kosong.')
    if (effectiveHasCarwash && !carwashForm.platNomor) return setError('Plat nomor mobil wajib diisi.')

    // Validasi Resep Bahan Baku
    if (cart.length > 0) {
      const missingRecipes = []
      for (const item of cart) {
        const hasRecipe = resepList.some(r => r.nama_menu.toLowerCase() === item.nama_menu.toLowerCase())
        // Kita abaikan minuman botol/kemasan jika tidak ada di resep, asalkan mereka terdaftar di tabel stok langsung.
        // Tapi asumsikan kebijakan: semua menu Cafe yang dijual HARUS memiliki resep di master data.
        if (!hasRecipe) {
          missingRecipes.push(item.nama_menu)
        }
      }
      if (missingRecipes.length > 0) {
        return setError(`Gagal Checkout: Menu berikut belum memiliki resep bahan baku: ${missingRecipes.join(', ')}. Silakan atur resep terlebih dahulu di Kelola Admin.`)
      }
    }

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const effectiveStrukId = editingStrukId || generateUUID()
      const todayDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
      const currentTime = new Date().toTimeString().split(' ')[0] // HH:MM:SS

      // 1. Simpan Transaksi Struk
      const effectivePayment = paymentStatus === 'Selesai' ? selectedPayment : (selectedPayment || paymentMethods[0]?.nama || 'CASH')

      let nCash = 0
      let nQris = 0
      if (effectivePayment === 'SPLIT') {
        nCash = parseFloat(splitCashAmount || 0)
        nQris = parseFloat(splitQrisAmount || 0)
        if (Math.abs((nCash + nQris) - grandTotal) > 0.01) {
          setError(`Gagal Checkout: Jumlah bayar Tunai (${formatRupiah(nCash)}) + QRIS (${formatRupiah(nQris)}) tidak sama dengan Total Tagihan (${formatRupiah(grandTotal)}).`)
          setLoading(false)
          return
        }
      } else if (effectivePayment === 'CASH') {
        nCash = grandTotal
      } else if (effectivePayment === 'QRIS') {
        nQris = grandTotal
      }

      if (editingStrukId) {
        const { error: strukErr } = await supabase
          .from('struk')
          .update({
            metode_bayar: effectivePayment,
            nominal_cash: nCash,
            nominal_qris: nQris,
            status_bayar: paymentStatus,
            kasir: selectedCashier.toUpperCase(),
            diskon_carwash: diskonCarwashNominal,
            diskon_cafe: diskonCafeNominal,
            total_tagihan: grandTotal,
            tipe_pesanan: orderType,
            no_meja: tableOrQueueNumber || (effectiveHasCarwash ? carwashForm.platNomor : ''),
            nama_pelanggan: tableOrQueueNumber || (effectiveHasCarwash ? carwashForm.platNomor : '') || 'Pelanggan',
            waktu_dibayar: paymentStatus === 'Selesai' ? new Date().toISOString() : null
          })
          .eq('id_struk', effectiveStrukId)

        if (strukErr) throw strukErr

        // Hapus item cafe lama
        const { error: delCafeErr } = await supabase
          .from('cafe')
          .delete()
          .eq('id_struk', effectiveStrukId)

        if (delCafeErr) throw delCafeErr

        // Hapus item carwash lama
        const { error: delCwErr } = await supabase
          .from('carwash')
          .delete()
          .eq('id_struk', effectiveStrukId)

        if (delCwErr) throw delCwErr
      } else {
        const { error: strukErr } = await supabase
          .from('struk')
          .insert({
            id_struk: effectiveStrukId,
            tenant_id: effectiveTenantId,
            tanggal: todayDate,
            jam: currentTime,
            metode_bayar: effectivePayment,
            nominal_cash: nCash,
            nominal_qris: nQris,
            status_bayar: paymentStatus,
            kasir: selectedCashier.toUpperCase(),
            diskon_carwash: diskonCarwashNominal,
            diskon_cafe: diskonCafeNominal,
            total_tagihan: grandTotal,
            tipe_pesanan: orderType,
            no_meja: tableOrQueueNumber || (effectiveHasCarwash ? carwashForm.platNomor : ''),
            nama_pelanggan: tableOrQueueNumber || (effectiveHasCarwash ? carwashForm.platNomor : '') || 'Pelanggan',
            waktu_dibuat: new Date().toISOString(),
            waktu_dibayar: paymentStatus === 'Selesai' ? new Date().toISOString() : null
          })

        if (strukErr) throw strukErr
      }

      // 2. Simpan Item Cafe (jika ada)
      if (cart.length > 0) {
        const cafeItems = cart.map(item => ({
          id_detail: generateUUID(),
          id_struk: effectiveStrukId,
          tenant_id: effectiveTenantId,
          nama_menu: item.nama_menu,
          qty: item.qty,
          harga_satuan: item.harga,
          subtotal: item.qty * item.harga,
          catatan: item.catatan || '',
          status: paymentStatus
        }))

        const { error: cafeErr } = await supabase
          .from('cafe')
          .insert(cafeItems)

        if (cafeErr) throw cafeErr
      }

      // 3. Simpan Item Carwash (jika ada & didukung oleh model tenant)
      if (effectiveHasCarwash) {
        const hasAnggota2 = carwashForm.anggota2 && carwashForm.anggota2.trim() ? true : false;
        const gajiPerAnggota = hasAnggota2 ? carwashForm.gaji_pencuci / 2 : carwashForm.gaji_pencuci;

        // Hitung harga_cuci dan harga_paket dasar secara dinamis
        const basicPkg = carwashPackages.find(p => p.nama_paket === 'PAKET CUCI BIASA') || carwashPackages[0]
        const basicWashPrices = basicPkg?.tarif || {
          Small: { Regular: 50000, 'Body only': 35000 },
          Medium: { Regular: 55000, 'Body only': 40000 },
          Large: { Regular: 60000, 'Body only': 45000 },
          'Extra Large': { Regular: 80000, 'Body only': 80000 },
          Custom: { Regular: 80000, 'Body only': 80000 }
        }
        const basicSize = basicWashPrices[carwashForm.ukuran] ? carwashForm.ukuran : 'Custom';
        const basicVar = carwashForm.variant === 'Body only' ? 'Body only' : 'Regular';
        const basicWashPrice = basicWashPrices[basicSize]?.[basicVar] || 50000;
        const treatmentPrice = Math.max(0, carwashForm.harga - basicWashPrice);
        const cashierShift = getShiftForCashier(selectedCashier)

        const { error: cwErr } = await supabase
          .from('carwash')
          .insert({
            id_transaksi: generateUUID(),
            id_struk: effectiveStrukId,
            tenant_id: effectiveTenantId,
            tanggal: todayDate,
            jam: currentTime,
            kehadiran: carwashForm.kehadiran,
            model: carwashForm.model || 'Mobil',
            plat: (carwashForm.platNomor || '').replace(/\s+/g, '').toUpperCase(),
            no_telepon: carwashForm.noTelepon || null,
            variant: carwashForm.variant,
            ukuran: carwashForm.ukuran,
            paket: carwashForm.paket,
            metode: effectivePayment,
            harga: carwashForm.harga,
            harga_cuci: basicWashPrice,
            harga_paket: treatmentPrice,
            harga_custom: carwashForm.ukuran === 'Custom' ? carwashForm.harga : 0,
            anggota_1: carwashForm.anggota1,
            anggota_2: carwashForm.anggota2 || null,
            status: paymentStatus === 'Selesai' ? 'Selesai' : 'Pending',
            status_pengerjaan: paymentStatus === 'Selesai' ? 'Siap Diambil' : 'Sedang Dicuci',
            kondisi_bodi: carwashForm.kondisi_bodi || 'Normal',
            barang_berharga: carwashForm.barang_berharga || 'Aman',
            catatan_kendaraan: carwashForm.catatan_kendaraan || '',
            gaji_anggota: gajiPerAnggota,
            gaji_pencuci: carwashForm.gaji_pencuci,
            shift: cashierShift
          })

        if (cwErr) throw cwErr

        // Integrasi WA CRM: Daftarkan kontak & Kirim Kupon jika kunjungan pertama
        const cleanPlat = (carwashForm.platNomor || '').replace(/\s+/g, '').toUpperCase();
        if (carwashForm.noTelepon && cleanPlat) {
          (async () => {
            try {
              const apiUrl = import.meta.env.VITE_WACRM_API_URL;
              const apiKey = import.meta.env.VITE_WACRM_API_KEY;

              if (apiUrl && apiKey) {
                // Normalize phone
                let phone = carwashForm.noTelepon.replace(/\D/g, '');
                if (phone.startsWith('0')) {
                  phone = '62' + phone.slice(1);
                }
                if (!phone.startsWith('62') && phone.length > 5) {
                  phone = '62' + phone;
                }

                const model = carwashForm.model || 'Mobil';
                const todayStr = new Date().toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                });

                // 1. Dapatkan jumlah kunjungan untuk plat tersebut dari database (termasuk hari ini)
                let visitCount = 1;
                try {
                  const { count, error: countErr } = await supabase
                    .from('carwash')
                    .select('id_transaksi', { count: 'exact', head: true })
                    .eq('plat', cleanPlat);
                  if (!countErr && count !== null) {
                    visitCount = count;
                  }
                } catch (countErr) {
                  console.error('WACRM: Gagal menghitung jumlah kunjungan:', countErr);
                }

                // 2. Mendaftarkan / memperbarui data kehadiran pelanggan sebagai kontak di WACRM (dengan tag jumlah kehadiran & plat akumulatif)
                try {
                  // Kirim POST tanpa tag terlebih dahulu untuk find-or-create kontak
                  const contactRes = await fetch(`${apiUrl}/api/v1/contacts`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                      phone: '+' + phone,
                      name: `${cleanPlat} (${model})`,
                      company: getReceiptConfig().storeName || 'RelayPOS Carwash'
                    })
                  });

                  if (contactRes.ok) {
                    const resJson = await contactRes.json();
                    const contactData = resJson.data || {};
                    const contactId = contactData.id;

                    // Dapatkan daftar tag lama
                    const existingTags = Array.isArray(contactData.tags)
                      ? contactData.tags.map(t => t.name)
                      : [];

                    // Gabungkan dengan tag baru (tambahkan Plat_X baru, Carwash, dan update Kehadiran_X)
                    const cleanNewPlatTag = `Plat_${cleanPlat}`;
                    const mergedTags = [
                      ...existingTags.filter(t => !t.startsWith('Kehadiran_') && t !== cleanNewPlatTag && t !== 'Carwash'),
                      'Carwash',
                      cleanNewPlatTag,
                      `Kehadiran_${visitCount}`
                    ];

                    // Perbarui tag di kontak WACRM via PATCH
                    const patchRes = await fetch(`${apiUrl}/api/v1/contacts/${contactId}`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                      },
                      body: JSON.stringify({
                        tags: mergedTags
                      })
                    });

                    if (!patchRes.ok) {
                      console.warn('WACRM: Gagal memperbarui tag kontak:', await patchRes.text());
                    }
                  } else {
                    console.warn('WACRM: Gagal mendaftarkan kontak:', await contactRes.text());
                  }
                } catch (contactErr) {
                  console.error('WACRM: Error saat sinkronisasi kontak:', contactErr);
                }

                // 3. Periksa apakah ini kunjungan pertama untuk plat tersebut untuk mengirim kupon
                if (visitCount === 1) {
                  const paket = carwashForm.paket || 'Cuci';
                  // Kirim menggunakan template dari CRM
                  await fetch(`${apiUrl}/api/v1/messages`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                      to: phone,
                      type: 'template',
                      template: {
                        name: 'first_visit_coupon',
                        language: 'id',
                        params: [cleanPlat, model, paket, todayStr]
                      },
                      name: cleanPlat
                    })
                  });
                }
              }
            } catch (err) {
              console.error('Failed to run WACRM integration:', err);
            }
          })();
        }
      }

      // Siapkan payload struk untuk cetak thermal / kirim WhatsApp
      const receiptOrderPayload = {
        id_struk: effectiveStrukId,
        tanggal: todayDate,
        jam: currentTime,
        kasir: selectedCashier.toUpperCase(),
        status_bayar: paymentStatus,
        metode_bayar: effectivePayment,
        nominal_cash: nCash,
        nominal_qris: nQris,
        diskon_carwash: diskonCarwashNominal,
        diskon_cafe: diskonCafeNominal,
        total_tagihan: grandTotal,
        uang_diterima: parseFloat(uangDiterima) || nCash || grandTotal,
        kembalian: parseFloat(kembalian) || 0,
        tipe_pesanan: orderType,
        no_meja: tableOrQueueNumber,
        nomor_meja_antrean: tableOrQueueNumber || (hasCarwash ? carwashForm.platNomor : ''),
        carwash: hasCarwash ? [{
          plat: (carwashForm.platNomor || '').replace(/\s+/g, '').toUpperCase(),
          model: carwashForm.model || 'Mobil',
          paket: carwashForm.paket,
          ukuran: carwashForm.ukuran,
          variant: carwashForm.variant,
          harga: carwashForm.harga,
          kehadiran: carwashForm.kehadiran,
          no_telepon: carwashForm.noTelepon || ''
        }] : [],
        cafe: cart.map(item => ({
          nama_menu: item.nama_menu,
          qty: item.qty,
          harga_satuan: item.harga,
          subtotal: item.qty * item.harga,
          catatan: item.catatan || ''
        }))
      }

      // Alur Operasional:
      // 1. Jika order berstatus Pending dan mobil DITINGGAL -> Tampilkan Bukti Order (Drop-Off Slip)
      // 2. Jika order Selesai (Lunas) -> Tampilkan Bukti Pembayaran Resmi
      if (paymentStatus === 'Pending' && carwashForm.kehadiran === 'TINGGAL') {
        setActiveReceipt(buildOrderReceiptData(receiptOrderPayload))
      } else if (paymentStatus === 'Selesai') {
        setActiveReceipt(buildPaymentReceiptData(receiptOrderPayload))
      }

      if (editingStrukId) {
        setEditingStrukId(null)
      }
      setSuccess(true)
      setCart([])
      setHasCarwash(false)
      setSelectedDiskonCarwash(null)
      setSelectedDiskonCafe(null)
      setUangDiterima('')
      setSplitCashAmount('')
      setSplitQrisAmount('')
      setCarwashForm(prev => ({
        ...prev,
        platNomor: '',
        model: 'Mobil',
        noTelepon: ''
      }))
      await fetchPendingBills()
      await fetchCashierCash()
      await fetchTodayTransactions()

      // Auto close success popup
      setTimeout(() => setSuccess(false), 3000)

    } catch (err) {
      console.error('Checkout error:', err)
      setError(err.message || 'Terjadi kesalahan saat memproses transaksi.')
    } finally {
      setLoading(false)
    }
  }

  // Filter menu dinamis (mengambil dari master_categories di Admin + menu items)
  const cafeCategoriesList = useMemo(() => {
    return getCategoriesForPOS({
      type: 'CAFE',
      masterCategories: posMasterCategories,
      items: menuItems
    })
  }, [posMasterCategories, menuItems])

  const filteredMenus = (menuItems || []).filter(item => {
    if (!item || item.kategori === 'Carwash') return false
    const matchSearch = (item.nama_menu || item.daftar_menu || '').toLowerCase().includes((searchQuery || '').toLowerCase())
    const matchCat = selectedCafeCategory === 'SEMUA' || item.kategori === selectedCafeCategory
    return matchSearch && matchCat
  })

  const isOrderTab = activeTab === 'cafe' || activeTab === 'carwash' || activeTab === 'merchandise'

  return (
    <div className="p-3 md:p-4 md:pb-6 flex flex-col max-w-7xl mx-auto min-h-[calc(100vh-4rem)] w-full space-y-3">
      {/* 1. TOP HEADER FULL-WIDTH (BEBAS DARI SCROLL SAMPING & TAMPIL 100% LEGA) */}
      <div className="glass-panel px-3.5 py-2.5 rounded-xl flex flex-wrap items-center justify-between gap-2.5 shrink-0 relative z-20">
        {/* Sisi Kiri: Navigasi Tabs Lengkap Terbuka Tanpa Scroll Samping */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Grup 1: Penjualan / Transaksi Langsung */}
          <div className="flex items-center gap-1 bg-[#18181c] p-1 rounded-xl border border-[#26272d]">
            {features.hasCafe && (
              <button
                onClick={() => setActiveTab('cafe')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                  activeTab === 'cafe'
                    ? 'bg-[#00ffff] text-[#0f0f0f] text-slate-950 shadow-sm shadow-brand-emerald/20'
                    : 'text-[#bbcbb2] hover:text-slate-200'
                }`}
              >
                <Coffee size={14} />
                <span>Cafe</span>
              </button>
            )}
            {features.hasCarwash && (
              <button
                onClick={() => setActiveTab('carwash')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                  activeTab === 'carwash'
                    ? 'bg-[#00ffff] text-[#0f0f0f] text-slate-950 shadow-sm shadow-brand-blue/20'
                    : 'text-[#bbcbb2] hover:text-slate-200'
                }`}
              >
                <Car size={14} />
                <span>Carwash</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('merchandise')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                activeTab === 'merchandise'
                  ? 'bg-amber-400 text-slate-950 shadow-sm shadow-amber-400/20'
                  : 'text-[#bbcbb2] hover:text-slate-200'
              }`}
            >
              <ShoppingBag size={14} />
              <span>Merchandise</span>
            </button>
          </div>

          <span className="text-slate-700 font-mono hidden sm:inline px-0.5">|</span>

          {/* Grup 2: Audit & Monitoring Lapangan */}
          <div className="flex items-center gap-1 bg-[#18181c] p-1 rounded-xl border border-[#26272d]">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                activeTab === 'pending'
                  ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                  : 'text-[#bbcbb2] hover:text-slate-200'
              }`}
            >
              <ShoppingCart size={13} />
              <span>Bon Pending</span>
              {pendingBills.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'pending' ? 'bg-[#18181c] text-amber-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {pendingBills.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                activeTab === 'history'
                  ? 'bg-purple-500 text-white shadow-sm shadow-purple-500/20'
                  : 'text-[#bbcbb2] hover:text-slate-200'
              }`}
            >
              <History size={13} />
              <span>Riwayat</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'history' ? 'bg-[#18181c] text-purple-300' : 'bg-purple-500/20 text-purple-300'
              }`}>
                {todayTransactions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all ${
                activeTab === 'inventory'
                  ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20'
                  : 'text-[#bbcbb2] hover:text-slate-200'
              }`}
            >
              <Boxes size={13} />
              <span>Stok Gudang</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                activeTab === 'inventory' ? 'bg-[#18181c] text-amber-300' : 'bg-amber-600/20 text-amber-300'
              }`}>
                {inventoryList.length}
              </span>
            </button>
          </div>

          <span className="text-slate-700 font-mono hidden sm:inline px-0.5">|</span>

          {/* Grup 3: Dropdown Operasional Kas & Shift */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCashOpsMenu(!showCashOpsMenu)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all border ${
                activeTab === 'expense' || activeTab === 'exchange'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-[#121215] text-slate-200 hover:text-white border-[#26272d] hover:border-[#3f414a]'
              }`}
              title="Operasional Laci Kasir & Pergantian Shift"
            >
              <TrendingDown size={13} className="text-rose-400" />
              <span>
                {activeTab === 'expense' ? 'Pengeluaran' : activeTab === 'exchange' ? 'Tukar Uang' : 'Shift & Kas'}
              </span>
              <ChevronDown size={12} className={`transition-transform ${showCashOpsMenu ? 'rotate-180' : ''}`} />
            </button>

            {showCashOpsMenu && (
              <>
                <div className="fixed inset-0 z-20 bg-transparent" onClick={() => setShowCashOpsMenu(false)} />
                <div className="absolute left-0 top-full mt-2 w-52 bg-[#121215] backdrop-blur-md border border-[#26272d] rounded-xl p-1.5 shadow-2xl z-30 space-y-1 animate-slide-up">
                  <button
                    type="button"
                    onClick={() => { setActiveTab('expense'); setShowCashOpsMenu(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-colors ${
                      activeTab === 'expense' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-200 hover:bg-[#18181c] hover:text-white'
                    }`}
                  >
                    <TrendingDown size={14} className="text-rose-400" />
                    <span>Catat Pengeluaran Kas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => { setActiveTab('exchange'); setShowCashOpsMenu(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-colors ${
                      activeTab === 'exchange' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-200 hover:bg-[#18181c] hover:text-white'
                    }`}
                  >
                    <RefreshCw size={14} className="text-cyan-400" />
                    <span>Tukar Uang / Tarik Kas</span>
                  </button>

                  <div className="border-t border-[#26272d] my-1" />

                  <button
                    type="button"
                    onClick={() => { setShowCashOpsMenu(false); handleTutupKasir(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left text-rose-400 hover:bg-rose-500/20 transition-colors"
                  >
                    <AlertCircle size={14} />
                    <span>Tutup Shift Kasir</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sisi Kanan: Kasir Aktif & Status Laci Kas Ringkas */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {/* Status Kasir & Shift */}
          <div className="flex items-center gap-1.5 bg-[#18181c] border border-[#26272d] rounded-xl px-2.5 py-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-[#00ffff] text-[#0f0f0f] animate-pulse shrink-0"></span>
            <span className="text-[#6b7367] text-[10px] font-semibold hidden sm:inline uppercase tracking-wider">Kasir:</span>
            {profile?.role === 'Kasir' ? (
              <span className="font-bold text-white uppercase text-xs">{selectedCashier}</span>
            ) : (
              <CustomSelect
                value={selectedCashier}
                onChange={(val) => setSelectedCashier(val)}
                options={cashiers.map(c => ({ value: c.nama, label: c.nama }))}
                size="xs"
                variant="emerald"
                className="w-28"
              />
            )}
            <span className="text-slate-700 font-mono">|</span>
            <span className="text-[#00ffff] font-bold font-mono text-[11px]">
              {getShiftForCashier(selectedCashier)}
            </span>
          </div>

          {/* Pill Saldo Laci Kasir (Interactive Popover) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowCashDrawerDetail(!showCashDrawerDetail)}
              className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg px-2.5 py-1 text-xs transition-colors"
              title="Klik untuk melihat rincian modal & arus kas laci"
            >
              <Wallet size={13} className="text-purple-400" />
              <span className="font-bold text-white font-mono text-xs">
                {formatRupiah(todayStartingCapital + cashierCash.todayIn - cashierCash.todayOut)}
              </span>
              <ChevronDown size={12} className={`text-purple-400 transition-transform ${showCashDrawerDetail ? 'rotate-180' : ''}`} />
            </button>

            {/* Popover Rincian Arus Kas */}
            {showCashDrawerDetail && (
              <>
                <div
                  className="fixed inset-0 z-20 bg-black/20 backdrop-blur-[0.5px]"
                  onClick={() => setShowCashDrawerDetail(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-72 bg-[#121215] backdrop-blur-md border border-[#26272d] rounded-xl p-3.5 shadow-2xl z-30 space-y-2.5 animate-slide-up">
                  <div className="flex items-center justify-between border-b border-[#26272d] pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Wallet size={14} className="text-purple-400" />
                      Rincian Uang Kasir
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCashDrawerDetail(false)}
                      className="text-[#6b7367] hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-[#bbcbb2]">
                      <span>Modal Awal</span>
                      <span className="font-mono text-slate-200 font-bold">{formatRupiah(todayStartingCapital)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[#bbcbb2]">
                      <span>Uang Masuk (Cash)</span>
                      <span className="font-mono text-[#00ffff] font-bold">+{formatRupiah(cashierCash.todayIn)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[#bbcbb2]">
                      <span>Uang Keluar (Cash)</span>
                      <span className="font-mono text-rose-400 font-bold">-{formatRupiah(cashierCash.todayOut)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[#bbcbb2]">
                      <span>Total QRIS Masuk</span>
                      <span className="font-mono text-cyan-400 font-bold">{formatRupiah(cashierCash.todayQRIS)}</span>
                    </div>
                    <div className="border-t border-[#26272d] pt-1.5 flex justify-between items-center font-bold text-white">
                      <span>Sisa Fisik di Laci</span>
                      <span className="font-mono text-purple-300 font-black">
                        {formatRupiah(todayStartingCapital + cashierCash.todayIn - cashierCash.todayOut)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. AREA KERJA UTAMA: 2-KOLOM SAAT JUALAN, FULL-WIDTH SAAT AUDIT/MONITORING */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row items-start gap-3 md:gap-4 w-full">
        {/* Kolom Kiri: Pilihan Item / Form / Tabel Audit (64% di tablet landscape) */}
        <div className={`${isOrderTab ? 'md:w-[64%]' : 'w-full'} flex flex-col flex-1 min-h-0 min-w-0`}>
          {/* Tab 1: Menu Cafe */}
          {activeTab === 'cafe' && (
            <div className="flex-1 flex flex-col bg-[#121215] border border-[#26272d] rounded-xl p-4 min-h-[500px]">
              {/* Search Bar & Filter Kategori Chips */}
              <div className="space-y-2.5 mb-4 shrink-0 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3.5 top-3 text-[#6b7367]" size={16} />
                  <input
                    type="text"
                    placeholder="Cari makanan, minuman, atau paket bundling..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#121215] border border-[#26272d] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#00ffff]/60 text-sm"
                  />
                </div>

                {/* Filter Kategori Chips (Bisa Kustom Dinamis) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
                  {cafeCategoriesList.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCafeCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        selectedCafeCategory === cat
                          ? 'bg-[#00ffff] text-[#0f0f0f] text-slate-950 shadow-sm shadow-brand-emerald/20'
                          : 'bg-[#18181c] border border-[#26272d] text-[#bbcbb2] hover:text-slate-200'
                      }`}
                    >
                      {cat === 'SEMUA' ? '🌟 Semua Menu' : cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid Item Menu (Scrollable) */}
              <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 pr-1 content-start min-h-[450px]">
              {filteredMenus.map((menu, idx) => {
                const theme = getMenuTheme(menu.nama_menu)
                const inCartItem = cart.find(c => c.nama_menu === menu.nama_menu)
                return (
                  <button
                    key={menu.nama_menu}
                    type="button"
                    onClick={() => addToCart({ nama_menu: menu.nama_menu, harga: menu.harga })}
                    className={`glass-card hover:border-brand-emerald/50 p-0 rounded-2xl flex flex-col justify-between text-left transition-all duration-300 active:scale-95 group overflow-hidden h-[185px] relative shrink-0 ${
                      inCartItem ? 'border-brand-emerald/60 ring-1 ring-brand-emerald/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'border-[#26272d]'
                    }`}
                  >
                    {/* Visual Banner / Gambar Menu */}
                    <div className={`w-full h-24 relative overflow-hidden bg-gradient-to-br ${theme.gradient} flex items-center justify-center`}>
                      {/* Fallback Icon & Emoji saat gambar offline/error/loading */}
                      <div className="fallback-placeholder absolute inset-0 flex items-center justify-center text-3xl drop-shadow-lg pointer-events-none transition-opacity">
                        <span>{theme.emoji}</span>
                      </div>

                      {/* Foto Menu dengan graceful fallback */}
                      <img
                        src={menu.foto_url || getMenuPhoto(menu.nama_menu)}
                        alt={menu.nama_menu}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 relative z-10"
                        onLoad={(e) => {
                          const placeholder = e.currentTarget.parentElement.querySelector('.fallback-placeholder');
                          if (placeholder) placeholder.style.display = 'none';
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.parentElement.querySelector('.fallback-placeholder');
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                      />
                      
                      {/* Gradient Overlay di atas gambar */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent pointer-events-none z-20"></div>

                      {/* Kategori Badge di sudut kiri atas */}
                      <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase backdrop-blur-md shadow-sm z-30 ${
                        menu.is_bundling
                          ? 'bg-rose-500/90 text-white'
                          : theme.badgeBg
                      }`}>
                        {menu.is_bundling ? 'Bundling' : theme.tag}
                      </span>

                      {/* Counter Badge jika sudah ada di cart */}
                      {inCartItem && (
                        <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#00ffff] text-[#0f0f0f] text-slate-950 font-black text-xs flex items-center justify-center shadow-lg shadow-brand-emerald/30 animate-pop-in z-30">
                          {inCartItem.qty}
                        </span>
                      )}
                    </div>

                    {/* Informasi Menu & Harga */}
                    <div className="p-3 flex-1 flex flex-col justify-between bg-[#18181c] backdrop-blur-md relative w-full">
                      <h4 className="font-bold text-xs text-slate-100 group-hover:text-[#00ffff] transition-colors line-clamp-2 leading-tight">
                        {menu.nama_menu}
                      </h4>
                      <div className="mt-2 flex justify-between items-center">
                        <span className="text-xs font-black text-emerald-400 font-mono">
                          {formatRupiah(menu.harga)}
                        </span>
                        <span className="w-6 h-6 rounded-lg bg-[#18181c] text-[#bbcbb2] flex items-center justify-center font-bold text-xs group-hover:bg-[#00ffff] group-hover:text-[#0f0f0f] transition-all">
                          <Plus size={12} />
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}

              {filteredMenus.length === 0 && (
                <div className="col-span-full py-16 flex flex-col items-center justify-center text-center text-[#6b7367]">
                  <Coffee size={36} className="text-[#6b7367] mb-2 opacity-60" />
                  <p className="text-sm font-semibold text-[#bbcbb2]">
                    {menuItems.length === 0 ? 'Memuat daftar menu cafe...' : 'Tidak ada menu yang sesuai pencarian'}
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-2 text-xs text-[#00ffff] hover:underline font-medium"
                    >
                      Reset kata kunci pencarian
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Cuci Mobil (Carwash) */}
        {activeTab === 'carwash' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#121215] border border-[#26272d] rounded-xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Layanan Cuci Mobil</h3>
                <p className="text-xs text-[#6b7367] mt-0.5">Lengkapi form transaksi cucian mobil pelanggan</p>
              </div>
              <button
                type="button"
                onClick={() => setHasCarwash(!hasCarwash)}
                className={`px-4 py-2 rounded-lg font-bold text-xs transition-colors border ${hasCarwash
                  ? 'bg-[#00ffff] text-[#0f0f0f] text-slate-950 border-brand-blue'
                  : 'bg-transparent text-[#bbcbb2] border-[#26272d] hover:border-[#3f414a]'
                  }`}
              >
                {hasCarwash ? '✓ Aktif dalam Transaksi' : '+ Tambah ke Transaksi'}
              </button>
            </div>

            {hasCarwash && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Plat Nomor */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    Plat Nomor Kendaraan
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: AD 1234 AB"
                    value={carwashForm.platNomor}
                    onChange={(e) => setCarwashForm(prev => ({ ...prev, platNomor: e.target.value.toUpperCase() }))}
                    className="w-full px-4 py-2 bg-[#121215] border border-[#26272d] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#00ffff] text-sm uppercase font-mono tracking-widest font-bold"
                  />
                </div>

                {/* Paket Cuci */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    Pilihan Paket Layanan
                  </label>
                  <CustomSelect
                    value={carwashForm.paket}
                    onChange={(val) => setCarwashForm(prev => ({ ...prev, paket: val }))}
                    options={paketOptions.map(p => ({ value: p.nama, label: p.nama }))}
                    size="md"
                    variant="blue"
                    className="w-full"
                  />
                </div>

                {/* Merk/Model Mobil */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    Merk / Model Mobil
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Avanza, Fortuner, Civic"
                    value={carwashForm.model}
                    onChange={(e) => setCarwashForm(prev => ({ ...prev, model: e.target.value }))}
                    className="w-full px-4 py-2 bg-[#121215] border border-[#26272d] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#00ffff] text-sm"
                  />
                </div>

                {/* No Telepon Customer */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    No Telepon Customer (CRM WhatsApp)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 081234567890"
                    value={carwashForm.noTelepon}
                    onChange={(e) => setCarwashForm(prev => ({ ...prev, noTelepon: e.target.value }))}
                    className="w-full px-4 py-2 bg-[#121215] border border-[#26272d] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#00ffff] text-sm"
                  />
                </div>

                {/* Ukuran Kendaraan */}
                <div className="flex flex-col col-span-1 md:col-span-2">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    Ukuran Kendaraan
                  </label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                    {ukuranOptions.map(u => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setCarwashForm(prev => ({ ...prev, ukuran: u }))}
                        className={`py-2 rounded-lg font-bold text-xs transition-all ${carwashForm.ukuran === u
                          ? 'bg-[#00ffff] text-[#0f0f0f]/20 text-[#00ffff] border border-brand-blue/40'
                          : 'bg-[#121215] text-[#bbcbb2] border border-[#26272d]'
                          }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Harga Custom (Hanya tampil jika Ukuran = Custom) */}
                {carwashForm.ukuran === 'Custom' && (
                  <div className="flex flex-col col-span-1 md:col-span-2">
                    <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                      Harga Custom (Rp)
                    </label>
                    <input
                      type="number"
                      placeholder="Masukkan harga custom..."
                      value={carwashForm.customHarga}
                      onChange={(e) => setCarwashForm(prev => ({ ...prev, customHarga: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-4 py-2 bg-[#121215] border border-[#26272d] rounded-lg text-white focus:outline-none focus:border-[#00ffff] text-sm font-bold text-[#00ffff]"
                    />
                  </div>
                )}

                {/* Variant Cuci */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    Variant Cuci
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {variantOptions.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setCarwashForm(prev => ({ ...prev, variant: v }))}
                        className={`py-2 rounded-lg font-bold text-xs transition-all ${carwashForm.variant === v
                          ? 'bg-[#00ffff] text-[#0f0f0f]/20 text-[#00ffff] border border-brand-blue/40'
                          : 'bg-[#121215] text-[#bbcbb2] border border-[#26272d]'
                          }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Anggota 1 */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    Anggota Pencuci 1
                  </label>
                  <CustomSelect
                    value={carwashForm.anggota1}
                    onChange={(val) => setCarwashForm(prev => ({ ...prev, anggota1: val }))}
                    options={anggotaOptions.map(a => ({ value: a, label: a }))}
                    size="md"
                    variant="blue"
                    className="w-full"
                  />
                </div>

                {/* Anggota 2 */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    Anggota Pencuci 2 (Opsional)
                  </label>
                  <CustomSelect
                    value={carwashForm.anggota2}
                    onChange={(val) => setCarwashForm(prev => ({ ...prev, anggota2: val }))}
                    options={[
                      { value: '', label: 'Tidak ada' },
                      ...anggotaOptions.filter(a => a !== carwashForm.anggota1).map(a => ({ value: a, label: a }))
                    ]}
                    size="md"
                    variant="blue"
                    className="w-full"
                  />
                </div>

                {/* Kehadiran */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase tracking-wider">
                    Kehadiran Pelanggan
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {kehadiranOptions.map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setCarwashForm(prev => ({ ...prev, kehadiran: k }))}
                        className={`py-2 rounded-lg font-bold text-xs transition-all ${carwashForm.kehadiran === k
                          ? 'bg-[#00ffff] text-[#0f0f0f]/20 text-[#00ffff] border border-brand-blue/40'
                          : 'bg-[#121215] text-[#bbcbb2] border border-[#26272d]'
                          }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Total Tarif Carwash */}
                <div className="flex flex-col justify-end p-4 rounded-xl bg-[#00ffff] text-[#0f0f0f]/5 border border-brand-blue/10">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6b7367]">Estimasi Tarif Cuci</span>
                  <span className="text-2xl font-black text-[#00ffff] mt-1">{formatRupiah(carwashForm.harga)}</span>
                </div>

                {/* Walkaround Inspection & Catatan Khusus Kendaraan (Estafet Detailing) */}
                <div className="col-span-1 md:col-span-2 p-3.5 rounded-xl bg-[#121215] border border-[#26272d] space-y-3">
                  <div className="flex items-center justify-between border-b border-[#26272d] pb-2">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>🔍</span>
                      <span>Inspeksi Walkaround & Kondisi Masuk</span>
                    </span>
                    <span className="text-[10px] text-[#6b7367] font-medium">Cegah komplain baret/barang</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[#bbcbb2] mb-1 block">Kondisi Bodi Awal</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['Normal', 'Baret Halus', 'Dent/Penyok'].map((cond) => (
                          <button
                            key={cond}
                            type="button"
                            onClick={() => setCarwashForm(prev => ({ ...prev, kondisi_bodi: cond }))}
                            className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all ${
                              carwashForm.kondisi_bodi === cond
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                                : 'bg-[#18181c] text-[#bbcbb2] border border-[#26272d] hover:text-slate-200'
                            }`}
                          >
                            {cond}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-[#bbcbb2] mb-1 block">Barang Berharga Kabin</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {['Aman / Nihil', 'Sudah Diamankan'].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setCarwashForm(prev => ({ ...prev, barang_berharga: val }))}
                            className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-all ${
                              carwashForm.barang_berharga === val
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                                : 'bg-[#18181c] text-[#bbcbb2] border border-[#26272d] hover:text-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[#bbcbb2] mb-1 block">Catatan Khusus Kendaraan (Opsional)</label>
                    <input
                      type="text"
                      placeholder="Cth: Velg baru repaint, kaca film baru 2 hari, wiper getas..."
                      value={carwashForm.catatan_kendaraan}
                      onChange={(e) => setCarwashForm(prev => ({ ...prev, catatan_kendaraan: e.target.value }))}
                      className="w-full bg-[#18181c] border border-[#26272d] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-[#6b7367] focus:outline-hidden focus:border-[#00ffff]"
                    />
                  </div>
                </div>
              </div>
            )}

            {!hasCarwash && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 border border-dashed border-[#26272d] rounded-xl text-[#6b7367]">
                <Car size={36} className="mb-2" />
                <p className="text-sm font-medium">Layanan cuci mobil belum ditambahkan.</p>
                <button
                  type="button"
                  onClick={() => setHasCarwash(true)}
                  className="mt-3 px-4 py-1.5 bg-[#121215] border border-[#26272d] hover:border-[#3f414a] text-slate-200 font-bold rounded-lg text-xs transition-colors"
                >
                  + Aktifkan Carwash
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab Penjualan Merchandise & Retail */}
        {activeTab === 'merchandise' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#121215] border border-[#26272d] rounded-xl p-4 md:p-6 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#26272d]">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-amber-400" />
                  <span>Merchandise & Produk Retail</span>
                </h3>
                <p className="text-xs text-[#6b7367] mt-0.5">Penjualan produk fisik carwash: parfum, lap microfiber, aksesoris & semir mobil</p>
              </div>
            </div>

            <MerchandiseCatalog
              items={merchandiseList}
              cart={cart}
              onAddToCart={(item) => setCart(prev => cartAdd(prev, item))}
              onUpdateQty={(name, delta) => setCart(prev => cartUpdate(prev, name, delta))}
              onRemoveFromCart={(name) => setCart(prev => cartRemove(prev, name))}
            />
          </div>
        )}

        {/* Tab 3: Tagihan Pending */}
        {activeTab === 'pending' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#121215] border border-[#26272d] rounded-xl p-6 overflow-y-auto space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Daftar Tagihan Pending (Bon)</span>
                  <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-black">
                    {pendingBills.length} Bon
                  </span>
                </h3>
                <p className="text-xs text-[#6b7367] mt-0.5">Daftar struk transaksi yang belum dilunasi oleh pelanggan</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchPendingBills}
                  className="px-3 py-1.5 bg-[#18181c] hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                  title="Muat ulang tagihan pending"
                >
                  <RefreshCw size={13} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Search Bar Tagihan Pending */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3 text-[#6b7367]" size={15} />
              <input
                type="text"
                placeholder="Cari nomor struk, nama kasir, plat nomor, menu cafe, atau paket cuci..."
                value={pendingSearchQuery}
                onChange={(e) => setPendingSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-[#18181c] border border-[#26272d] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-xs transition-colors"
              />
              {pendingSearchQuery && (
                <button
                  onClick={() => setPendingSearchQuery('')}
                  className="absolute right-3.5 top-2.5 text-[#6b7367] hover:text-white text-xs font-bold p-1"
                >
                  ✕
                </button>
              )}
            </div>

            {filteredPendingBills.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-[#6b7367]">
                {pendingBills.length === 0 ? (
                  <>
                    <CheckCircle size={36} className="mb-2 text-[#00ffff]/60" />
                    <p className="text-sm font-semibold">Semua tagihan bersih!</p>
                    <p className="text-xs text-slate-700 mt-0.5">Tidak ada bill gantung yang pending.</p>
                  </>
                ) : (
                  <>
                    <Search size={36} className="mb-2 text-[#6b7367]" />
                    <p className="text-sm font-semibold text-[#bbcbb2]">Pencarian Tidak Ditemukan</p>
                    <p className="text-xs text-[#6b7367] mt-0.5">Tidak ada tagihan pending yang cocok dengan "{pendingSearchQuery}"</p>
                    <button
                      onClick={() => setPendingSearchQuery('')}
                      className="mt-3 px-3 py-1.5 bg-[#18181c] hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors"
                    >
                      Reset Filter Pencarian
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[11px] text-[#bbcbb2] font-medium">
                  Menampilkan <span className="text-white font-bold">{filteredPendingBills.length}</span> dari {pendingBills.length} tagihan pending
                </div>
                {filteredPendingBills.map(bill => {
                  const dateStr = parseDateSafe(bill.created_at).toLocaleString('id-ID', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  })

                  return (
                    <div key={bill.id} className="glass-card p-4 rounded-xl border border-[#26272d] hover:border-[#3f414a]/60 transition-all flex flex-col justify-between md:flex-row md:items-center gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-black text-[#00ffff] uppercase">
                            #{bill.id.substring(0, 8)}
                          </span>
                          <span className="text-[10px] bg-[#18181c] text-[#bbcbb2] px-2 py-0.5 rounded font-bold">
                            Kasir: {bill.kasir}
                          </span>
                          <span className="text-[10px] text-[#6b7367]">{dateStr}</span>
                          <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-extrabold uppercase">
                            PENDING
                          </span>
                        </div>

                        {/* Bill Items Detail */}
                        <div className="text-xs text-[#bbcbb2] space-y-0.5 pt-1.5 border-t border-[#26272d]/50 mt-1">
                          {bill.cafe?.map((item, idx) => (
                            <span key={idx} className="block text-[11px]">
                              ☕ {item.nama_menu} x{item.jumlah} ({formatRupiah(item.harga_satuan * item.jumlah)})
                            </span>
                          ))}
                          {bill.carwash?.map((item, idx) => (
                            <span key={idx} className="block text-[11px]">
                              🧼 Carwash: {item.paket} {item.plat_nomor ? `(${item.merk_mobil ? item.merk_mobil + ' - ' : ''}${item.plat_nomor})` : ''} - ({formatRupiah(item.harga)})
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Right Action / Settle */}
                      <div className="flex flex-col items-end gap-2 shrink-0 self-start md:self-center">
                        <span className="text-sm font-black text-[#00ffff]">{formatRupiah(bill.total_harga)}</span>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const receipt = buildOrderReceiptData({
                                id_struk: bill.id,
                                tanggal: bill.tanggal,
                                jam: bill.jam,
                                kasir: bill.kasir,
                                status_bayar: 'Pending',
                                total_tagihan: bill.total_harga,
                                carwash: bill.carwash?.map(cw => ({
                                  plat: cw.plat_nomor,
                                  model: cw.merk_mobil,
                                  paket: cw.paket,
                                  harga: cw.harga,
                                  kehadiran: cw.kehadiran || 'TINGGAL',
                                  no_telepon: cw.no_telepon || ''
                                })),
                                cafe: bill.cafe?.map(c => ({
                                  nama_menu: c.nama_menu,
                                  qty: c.jumlah,
                                  harga_satuan: c.harga_satuan,
                                  subtotal: c.jumlah * c.harga_satuan
                                }))
                              })
                              setActiveReceipt(receipt)
                            }}
                            className="px-2.5 py-1.5 bg-[#18181c] hover:bg-slate-700 border border-[#3f414a] text-slate-200 font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                            title="Pratinjau, Cetak Thermal atau Kirim WA Bukti Order"
                          >
                            <FileText size={12} className="text-amber-400" />
                            <span>Bukti Order</span>
                          </button>
                          <button
                            onClick={() => {
                              setSettlingBill(bill)
                              setSettlePaymentMethod(paymentMethods[0]?.nama || 'CASH')
                              setSettleCashReceived('')
                              setSettleSurcharge({ enabled: false, nominal: 50000, keterangan: 'Biaya Inap Kendaraan (1 Malam)' })
                            }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1"
                          >
                            <Check size={12} />
                            Lunasi
                          </button>
                          <button
                            onClick={() => handleCancelBill(bill.id)}
                            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 text-rose-400 font-bold rounded-lg text-xs transition-colors"
                          >
                            Batalkan
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Riwayat/Daftar Transaksi Hari Ini */}
        {activeTab === 'history' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#121215] border border-[#26272d] rounded-xl p-6 overflow-y-auto space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Daftar Riwayat Transaksi</span>
                  <span className="text-xs bg-[#00ffff] text-[#0f0f0f]/20 text-[#00ffff] border border-brand-blue/30 px-2 py-0.5 rounded-full font-black">
                    {todayTransactions.length} Transaksi
                  </span>
                </h3>
                <p className="text-xs text-[#6b7367] mt-0.5">Daftar seluruh transaksi kasir berdasarkan tanggal terpilih</p>
              </div>

              {/* Date Filter & Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-[#18181c] border border-[#26272d] rounded-lg px-2.5 py-1 text-xs">
                  <Calendar size={13} className="text-[#bbcbb2]" />
                  <input
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                    className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
                  />
                </div>
                <button
                  onClick={() => setHistoryDate(new Date().toLocaleDateString('en-CA'))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                    historyDate === new Date().toLocaleDateString('en-CA')
                      ? 'bg-[#00ffff] text-[#0f0f0f] text-white'
                      : 'bg-[#18181c] hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  onClick={() => fetchTodayTransactions(historyDate)}
                  className="p-1.5 bg-[#18181c] hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all"
                  title="Muat ulang riwayat"
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>

            {/* Search Bar Transaksi */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3 text-[#6b7367]" size={15} />
              <input
                type="text"
                placeholder="Cari ID struk, kasir, nama pelanggan, metode (CASH/QRIS), plat mobil, menu..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-[#18181c] border border-[#26272d] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#00ffff] text-xs transition-colors"
              />
              {historySearchQuery && (
                <button
                  onClick={() => setHistorySearchQuery('')}
                  className="absolute right-3.5 top-2.5 text-[#6b7367] hover:text-white text-xs font-bold p-1"
                >
                  ✕
                </button>
              )}
            </div>

            {filteredTodayTransactions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-[#6b7367]">
                {todayTransactions.length === 0 ? (
                  <>
                    <History size={36} className="mb-2 text-slate-700" />
                    <p className="text-sm font-semibold">Belum ada transaksi pada tanggal ini</p>
                    <p className="text-xs text-slate-700 mt-0.5">Pilih tanggal lain atau kembali ke transaksi hari ini.</p>
                    <button
                      onClick={() => setHistoryDate(new Date().toLocaleDateString('en-CA'))}
                      className="mt-3 px-3 py-1.5 bg-[#00ffff] text-[#0f0f0f] hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      Pilih Hari Ini
                    </button>
                  </>
                ) : (
                  <>
                    <Search size={36} className="mb-2 text-[#6b7367]" />
                    <p className="text-sm font-semibold text-[#bbcbb2]">Pencarian Tidak Ditemukan</p>
                    <p className="text-xs text-[#6b7367] mt-0.5">Tidak ada transaksi yang cocok dengan "{historySearchQuery}"</p>
                    <button
                      onClick={() => setHistorySearchQuery('')}
                      className="mt-3 px-3 py-1.5 bg-[#18181c] hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors"
                    >
                      Reset Filter Pencarian
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] text-[#bbcbb2] font-medium">
                  <div>
                    Menampilkan <span className="text-white font-bold">{filteredTodayTransactions.length}</span> dari {todayTransactions.length} transaksi ({historyDate})
                  </div>
                  <div className="text-[#00ffff] font-bold font-mono">
                    Total: {formatRupiah(filteredTodayTransactions.reduce((acc, t) => t.status_bayar === 'Selesai' ? acc + (t.total_harga || 0) : acc, 0))}
                  </div>
                </div>

                {filteredTodayTransactions.map(tx => {
                  const isSelesai = tx.status_bayar === 'Selesai'
                  const isCash = tx.metode_bayar === 'CASH'
                  const merkWash = tx.carwash?.[0]?.merk_mobil
                  const platWash = tx.carwash?.[0]?.plat_nomor
                  return (
                    <div key={tx.id} className="glass-card p-4 rounded-xl border border-[#26272d] hover:border-slate-750 transition-all flex flex-col justify-between md:flex-row md:items-center gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[#bbcbb2] uppercase">
                            #{tx.id.substring(0, 8)}
                          </span>
                          <span className="text-[10px] bg-[#18181c] text-[#bbcbb2] px-2 py-0.5 rounded font-bold">
                            {tx.kasir}
                          </span>
                          <span className="text-[10px] text-[#6b7367] font-medium">
                            ⏱️ {tx.jam || '00:00'}
                          </span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase ${isSelesai
                            ? 'bg-[#00ffff] text-[#0f0f0f]/15 text-[#00ffff]'
                            : tx.status_bayar === 'Batal'
                              ? 'bg-rose-500/15 text-rose-450 border border-rose-500/15'
                              : 'bg-amber-500/15 text-amber-500'
                            }`}>
                            {tx.status_bayar}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${isCash
                            ? 'bg-purple-500/15 text-purple-400'
                            : 'bg-emerald-500/15 text-emerald-400'
                            }`}>
                            {tx.metode_bayar}
                          </span>
                          {merkWash && (
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded uppercase ${isSelesai
                              ? 'bg-green-500/15 text-green-400'
                              : 'bg-red-500/15 text-red-400'
                              }`}>
                              {merkWash}
                            </span>
                          )}
                          {platWash && (
                            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded uppercase ${isSelesai
                              ? 'bg-green-500/15 text-green-400'
                              : 'bg-red-500/15 text-red-400'
                              }`}>
                              {platWash}
                            </span>
                          )}
                        </div>

                        {/* Transaction Detail Items */}
                        <div className="text-xs text-[#bbcbb2] space-y-0.5 pt-1.5 border-t border-[#26272d]/50 mt-1">
                          {tx.cafe?.map((item, idx) => (
                            <span key={idx} className="block text-[11px]">
                              ☕ {item.nama_menu} x{item.jumlah} ({formatRupiah(item.harga_satuan * item.jumlah)})
                            </span>
                          ))}
                          {tx.carwash?.map((item, idx) => (
                            <span key={idx} className="block text-[11px]">
                              🧼 Carwash: {item.paket} {item.plat_nomor ? `(${item.merk_mobil ? item.merk_mobil + ' - ' : ''}${item.plat_nomor})` : ''} - ({formatRupiah(item.harga)})
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0 self-start md:self-center">
                        <span className="text-sm font-black text-white">{formatRupiah(tx.total_harga)}</span>
                        <div className="flex gap-1.5 flex-wrap justify-end">
                          {/* Tombol Cetak Struk Bukti Pembayaran / Bukti Order */}
                          <button
                            type="button"
                            onClick={() => {
                              const receipt = isSelesai 
                                ? buildPaymentReceiptData({
                                    id_struk: tx.id,
                                    tanggal: tx.tanggal,
                                    jam: tx.jam,
                                    kasir: tx.kasir,
                                    status_bayar: tx.status_bayar,
                                    metode_bayar: tx.metode_bayar,
                                    nominal_cash: tx.nominal_cash,
                                    nominal_qris: tx.nominal_qris,
                                    total_tagihan: tx.total_harga,
                                    carwash: tx.carwash?.map(cw => ({
                                      plat: cw.plat_nomor,
                                      model: cw.merk_mobil,
                                      paket: cw.paket,
                                      harga: cw.harga,
                                      kehadiran: cw.kehadiran || 'hadir',
                                      no_telepon: cw.no_telepon || ''
                                    })) || [],
                                    cafe: tx.cafe?.map(c => ({
                                      nama_menu: c.nama_menu,
                                      qty: c.jumlah,
                                      harga_satuan: c.harga_satuan,
                                      subtotal: c.jumlah * c.harga_satuan
                                    })) || []
                                  })
                                : buildOrderReceiptData({
                                    id_struk: tx.id,
                                    tanggal: tx.tanggal,
                                    jam: tx.jam,
                                    kasir: tx.kasir,
                                    status_bayar: tx.status_bayar,
                                    total_tagihan: tx.total_harga,
                                    carwash: tx.carwash?.map(cw => ({
                                      plat: cw.plat_nomor,
                                      model: cw.merk_mobil,
                                      paket: cw.paket,
                                      harga: cw.harga,
                                      kehadiran: cw.kehadiran || 'TINGGAL',
                                      no_telepon: cw.no_telepon || ''
                                    })) || [],
                                    cafe: tx.cafe?.map(c => ({
                                      nama_menu: c.nama_menu,
                                      qty: c.jumlah,
                                      harga_satuan: c.harga_satuan,
                                      subtotal: c.jumlah * c.harga_satuan
                                    })) || []
                                  })
                              setActiveReceipt(receipt)
                            }}
                            className="px-2 py-1 bg-[#18181c] hover:bg-slate-700 border border-[#3f414a] text-slate-200 font-bold rounded text-[10px] transition-colors flex items-center gap-1 shadow-sm"
                            title="Cetak Struk Thermal atau Kirim WhatsApp"
                          >
                            <Printer size={11} className={isSelesai ? 'text-[#00ffff]' : 'text-amber-400'} />
                            <span>{isSelesai ? 'Struk' : 'Order'}</span>
                          </button>

                          {tx.status_bayar !== 'Batal' && (
                            <button
                              onClick={() => handleStartEditTransaction({
                                id_struk: tx.id,
                                metode_bayar: tx.metode_bayar,
                                status_bayar: tx.status_bayar,
                                nominal_cash: tx.nominal_cash,
                                nominal_qris: tx.nominal_qris
                              })}
                              className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded text-[10px] transition-colors"
                            >
                              Edit
                            </button>
                          )}
                          {!isSelesai && tx.status_bayar === 'Pending' && (
                            <>
                              <button
                                onClick={() => {
                                  setSettlingBill(tx)
                                  setSettlePaymentMethod(paymentMethods[0]?.nama || 'CASH')
                                  setSettleCashReceived('')
                                }}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-[10px] transition-colors flex items-center gap-1"
                              >
                                <Check size={10} />
                                Lunasi
                              </button>
                              <button
                                onClick={() => handleCancelBill(tx.id)}
                                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 text-rose-400 font-bold rounded text-[10px] transition-colors"
                              >
                                Batalkan
                              </button>
                            </>
                          )}
                          {isSelesai && tx.status_bayar === 'Selesai' && (
                            <button
                              onClick={() => handleCancelPaidTransaction(tx.id)}
                              className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 text-rose-450 font-bold rounded text-[10px] transition-colors"
                            >
                              Batalkan
                            </button>
                          )}
                          {tx.status_bayar === 'Batal' && (
                            <button
                              onClick={() => handleReactivatePaidTransaction(tx.id)}
                              className="px-2.5 py-1 bg-[#00ffff] text-[#0f0f0f]/10 hover:bg-[#00ffff] text-[#0f0f0f]/20 border border-brand-emerald/20 hover:border-brand-emerald/30 text-[#00ffff] font-bold rounded text-[10px] transition-colors"
                            >
                              Pulihkan
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Stok Gudang (Pemantauan Kasir / Stock Opname) */}
        {activeTab === 'inventory' && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#121215] border border-[#26272d] rounded-xl p-6 overflow-y-auto space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Boxes className="text-amber-500" size={20} />
                  <span>Stok Gudang & Bahan Baku</span>
                  <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-black">
                    {inventoryList.length} Item
                  </span>
                </h3>
                <p className="text-xs text-[#6b7367] mt-0.5">
                  Pemantauan sisa persediaan fisik untuk pencocokan lapangan (Stock Opname) oleh kasir
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchInventory}
                  disabled={inventoryLoading}
                  className="px-3 py-1.5 bg-[#18181c] hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                  title="Muat ulang data stok gudang"
                >
                  <RefreshCw size={13} className={inventoryLoading ? 'animate-spin' : ''} />
                  <span>Refresh Data</span>
                </button>
              </div>
            </div>

            {/* Read-Only Notice Banner */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3">
              <Info className="text-amber-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-amber-200/90 leading-relaxed">
                <span className="font-bold text-amber-300">Mode Pemantauan Kasir (Hanya Pantau / Read-Only):</span>{' '}
                Halaman ini khusus digunakan kasir untuk mencocokkan stok fisik di gudang dengan catatan sistem.
                Penambahan stok masuk (restok), edit kuantitas, dan penyesuaian master bahan baku dikelola langsung oleh{' '}
                <span className="font-semibold text-white">Owner/Admin</span> di halaman Kelola Admin.
              </div>
            </div>

            {/* Mini Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="glass-card p-3.5 rounded-xl border border-[#26272d] flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-[#bbcbb2] font-medium">Total Bahan Baku</p>
                  <p className="text-lg font-black text-white mt-0.5">{inventoryList.length}</p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-[#18181c] flex items-center justify-center text-[#bbcbb2]">
                  <Package size={18} />
                </div>
              </div>

              <div className="glass-card p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-emerald-400 font-medium">Stok Aman</p>
                  <p className="text-lg font-black text-emerald-400 mt-0.5">
                    {inventoryList.filter((i) => (Number(i.stok) || 0) > 10).length}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CheckCircle size={18} />
                </div>
              </div>

              <div className="glass-card p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-amber-400 font-medium">Stok Menipis (1-10)</p>
                  <p className="text-lg font-black text-amber-400 mt-0.5">
                    {inventoryList.filter((i) => (Number(i.stok) || 0) > 0 && (Number(i.stok) || 0) <= 10).length}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <AlertTriangle size={18} />
                </div>
              </div>

              <div className="glass-card p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-rose-400 font-medium">Habis / Kritis (≤ 0)</p>
                  <p className="text-lg font-black text-rose-400 mt-0.5">
                    {inventoryList.filter((i) => (Number(i.stok) || 0) <= 0).length}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-rose-500/20 flex items-center justify-center text-rose-400">
                  <AlertCircle size={18} />
                </div>
              </div>
            </div>

            {/* Search Bar & Filter Tabs */}
            <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 text-[#6b7367]" size={15} />
                <input
                  type="text"
                  placeholder="Cari nama bahan baku (kopi, gula, teh...), kode (BK-01), atau satuan..."
                  value={inventorySearchQuery}
                  onChange={(e) => setInventorySearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-[#18181c] border border-[#26272d] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-xs transition-colors"
                />
                {inventorySearchQuery && (
                  <button
                    onClick={() => setInventorySearchQuery('')}
                    className="absolute right-3.5 top-2.5 text-[#6b7367] hover:text-white text-xs font-bold p-1"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto shrink-0">
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'SAFE', label: 'Aman' },
                  { id: 'LOW', label: 'Menipis' },
                  { id: 'CRITICAL', label: 'Kritis/Habis' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setInventoryFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      inventoryFilter === tab.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-[#18181c] text-[#bbcbb2] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inventory List / Table */}
            {filteredInventory.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-[#6b7367]">
                <Search size={36} className="mb-2 text-[#6b7367]" />
                <p className="text-sm font-semibold text-[#bbcbb2]">Tidak ada data bahan baku yang cocok</p>
                <p className="text-xs text-[#6b7367] mt-0.5">
                  {inventorySearchQuery
                    ? `Tidak ditemukan hasil untuk "${inventorySearchQuery}"`
                    : 'Belum ada data bahan baku tersimpan.'}
                </p>
                {(inventorySearchQuery || inventoryFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setInventorySearchQuery('')
                      setInventoryFilter('ALL')
                    }}
                    className="mt-3 px-3 py-1.5 bg-[#18181c] hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#26272d]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#18181c] text-[#bbcbb2] border-b border-[#26272d] font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4 w-12 text-center">No</th>
                      <th className="py-3 px-4">Kode</th>
                      <th className="py-3 px-4">Nama Bahan Baku</th>
                      <th className="py-3 px-4">Satuan</th>
                      <th className="py-3 px-4 text-right">Sisa Stok Sistem</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4">Terakhir Diperbarui</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {filteredInventory.map((item, idx) => {
                      const stokVal = Number(item.stok) || 0
                      const isSafe = stokVal > 10
                      const isLow = stokVal > 0 && stokVal <= 10
                      const isCritical = stokVal <= 0

                      const updatedTimeStr = item.updated_at
                        ? parseDateSafe(item.updated_at).toLocaleString('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })
                        : '-'

                      return (
                        <tr
                          key={item.id_bahan_baku || idx}
                          className="hover:bg-[#18181c]/30 transition-colors"
                        >
                          <td className="py-3.5 px-4 text-center font-mono text-[#6b7367] text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-mono text-xs font-bold bg-[#18181c] text-amber-400 border border-[#3f414a]/60 px-2 py-0.5 rounded">
                              {item.id_bahan_baku}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-white">
                            {item.nama_produk}
                          </td>
                          <td className="py-3.5 px-4 text-[#bbcbb2] font-medium">
                            {item.satuan || 'Pcs'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-sm">
                            <span
                              className={
                                isSafe
                                  ? 'text-emerald-400'
                                  : isLow
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                              }
                            >
                              {stokVal.toLocaleString('id-ID')}
                            </span>
                            <span className="text-[10px] text-[#6b7367] font-normal ml-1">
                              {item.satuan || ''}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {isSafe && (
                              <span className="inline-flex items-center gap-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase">
                                <CheckCircle size={10} />
                                Aman
                              </span>
                            )}
                            {isLow && (
                              <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase">
                                <AlertTriangle size={10} />
                                Menipis
                              </span>
                            )}
                            {isCritical && (
                              <span className="inline-flex items-center gap-1 bg-rose-500/15 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase">
                                <AlertCircle size={10} />
                                {stokVal < 0 ? 'Minus' : 'Habis'}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-[#bbcbb2] text-[11px]">
                            {updatedTimeStr}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Catat Pengeluaran Kasir */}
        {activeTab === 'expense' && (
          <div className="glass-panel p-6 rounded-xl border border-[#26272d] flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white">Catat Pengeluaran Laci Kasir</h3>
              <p className="text-xs text-[#6b7367] mt-0.5">Catat pengeluaran operasional hari ini menggunakan uang dari laci kasir</p>
            </div>

            <form onSubmit={handleSavePosExpense} className="space-y-4 max-w-xl shrink-0">
              <div className={`grid grid-cols-1 ${posExpenseForm.kategori === 'Casbon' ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Tanggal</label>
                  <input
                    type="date"
                    value={posExpenseForm.tanggal}
                    onChange={(e) => setPosExpenseForm(prev => ({ ...prev, tanggal: e.target.value }))}
                    className="w-full bg-[#121215] border border-[#26272d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ffff]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Unit Usaha</label>
                  <CustomSelect
                    value={posExpenseForm.unit}
                    onChange={(newUnit) => {
                      const unitStr = String(newUnit || '').toLowerCase()
                      const validCats = cashierAllowedCategories.filter(c => {
                        const cJenis = String(c.jenis || '').toLowerCase()
                        if (unitStr === 'cafe') return cJenis.includes('cafe') || cJenis.includes('bersama') || cJenis === 'operasional' || cJenis === 'casbon'
                        if (unitStr === 'carwash') return cJenis.includes('carwash') || cJenis.includes('bersama') || cJenis === 'operasional' || cJenis === 'casbon'
                        return cJenis.includes('bersama') || cJenis === 'operasional' || cJenis === 'casbon'
                      })
                      const isStillValid = validCats.some(c => c.nama_kategori === posExpenseForm.kategori)
                      setPosExpenseForm(prev => ({
                        ...prev,
                        unit: newUnit,
                        kategori: isStillValid ? prev.kategori : (validCats[0]?.nama_kategori || 'Operasional'),
                        category_id: isStillValid ? prev.category_id : (validCats[0]?.id || '')
                      }))
                    }}
                    options={[
                      { value: 'Cafe', label: 'Cafe' },
                      { value: 'Carwash', label: 'Carwash' },
                      { value: 'Bersama', label: 'Kedua Usaha (Bersama)' }
                    ]}
                    size="md"
                    variant="emerald"
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-[#bbcbb2] uppercase">Kategori (Terkunci)</label>
                    <button
                      type="button"
                      onClick={() => setIsCustomPosExpenseKat(!isCustomPosExpenseKat)}
                      className="text-[11px] text-[#00ffff] hover:underline font-medium"
                    >
                      {isCustomPosExpenseKat ? '← Pilihan' : '+ Custom'}
                    </button>
                  </div>
                  {isCustomPosExpenseKat ? (
                    <input
                      type="text"
                      placeholder="Ketik kategori pengeluaran..."
                      value={posExpenseForm.kategori}
                      onChange={(e) => setPosExpenseForm(prev => ({ ...prev, kategori: e.target.value }))}
                      className="w-full bg-[#121215] border border-brand-emerald rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <CustomSelect
                      value={posExpenseForm.kategori}
                      onChange={(val) => {
                        if (val === '__CUSTOM__') {
                          setIsCustomPosExpenseKat(true)
                          setPosExpenseForm(prev => ({ ...prev, kategori: '', category_id: '' }))
                        } else {
                          const selected = filteredCashierCategories.find(c => c.nama_kategori === val) || cashierAllowedCategories.find(c => c.nama_kategori === val)
                          setPosExpenseForm(prev => ({ 
                            ...prev, 
                            kategori: val,
                            category_id: selected ? selected.id : ''
                          }))
                        }
                      }}
                      options={filteredCashierCategories.length > 0 ? [
                        ...filteredCashierCategories.map(c => ({ value: c.nama_kategori, label: c.nama_kategori })),
                        { value: '__CUSTOM__', label: '✨ + Custom (Ketik Sendiri)...' }
                      ] : [
                        { value: 'Operasional', label: 'Operasional' },
                        { value: 'Bahan Baku', label: 'Bahan Baku' },
                        { value: 'Sewa', label: 'Sewa' },
                        { value: 'Casbon', label: 'Casbon Karyawan' },
                        { value: 'Ambil Uang Paketan', label: 'Ambil Uang Paketan' },
                        { value: 'Lain-lain', label: 'Lain-lain' },
                        { value: '__CUSTOM__', label: '✨ + Custom (Ketik Sendiri)...' }
                      ]}
                      size="md"
                      variant="emerald"
                      className="w-full"
                    />
                  )}
                </div>

                {['Casbon', 'Ambil Uang Paketan'].includes(posExpenseForm.kategori) && (
                  <div>
                    <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Karyawan</label>
                    <CustomSelect
                      value={posExpenseForm.karyawan}
                      onChange={(val) => setPosExpenseForm(prev => ({ ...prev, karyawan: val }))}
                      options={[
                        { value: '', label: '-- Pilih Karyawan --' },
                        ...anggotaOptions.map(name => ({ value: name, label: name }))
                      ]}
                      size="md"
                      variant="emerald"
                      className="w-full"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Keterangan / Nama Pengeluaran</label>
                <input
                  type="text"
                  placeholder="Contoh: Beli es batu, isi ulang gas, sabun cuci"
                  value={posExpenseForm.keterangan}
                  onChange={(e) => setPosExpenseForm(prev => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full bg-[#121215] border border-[#26272d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ffff]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Nominal (Rp)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={posExpenseForm.nominal}
                  onChange={(e) => setPosExpenseForm(prev => ({ ...prev, nominal: e.target.value }))}
                  className="w-full bg-[#121215] border border-[#26272d] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#00ffff]"
                />
              </div>

              {['Casbon', 'Ambil Uang Paketan'].includes(posExpenseForm.kategori) && (
                <p className="text-[10px] text-amber-500 font-medium italic">
                  * Catatan: Input satu per satu per karyawan jika kasbon/ambil paketan diwakili atau diambil oleh lebih dari 1 orang.
                </p>
              )}

              <div className="flex gap-3">
                {editingExpenseId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingExpenseId(null)
                      setPosExpenseForm({
                        keterangan: '',
                        nominal: '',
                        unit: 'Cafe',
                        kategori: 'Operasional',
                        karyawan: ''
                      })
                    }}
                    className="flex-1 py-2.5 bg-[#18181c] hover:bg-slate-700 text-slate-350 font-bold rounded-lg text-sm transition-all"
                  >
                    Batal Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-[#18181c] text-slate-950 font-bold rounded-lg text-sm transition-all"
                >
                  {loading ? 'Menyimpan...' : (editingExpenseId ? 'Simpan Perubahan' : 'Catat Pengeluaran')}
                </button>
              </div>
            </form>

            <div className="border-t border-[#26272d] pt-6">
              <h4 className="font-bold text-sm text-white mb-3">Daftar Pengeluaran Hari Ini</h4>
              {todayExpenses.length === 0 ? (
                <p className="text-xs text-[#6b7367]">Belum ada pengeluaran kasir hari ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#26272d] text-[#6b7367] text-xs font-bold uppercase pb-2">
                        <th className="pb-2">Jam</th>
                        <th className="pb-2">Keterangan</th>
                        <th className="pb-2">Unit</th>
                        <th className="pb-2">Kategori</th>
                        <th className="pb-2 text-right">Nominal</th>
                        <th className="pb-2 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {todayExpenses.map((exp) => (
                        <tr key={exp.id_pengeluaran} className="text-xs text-slate-350 hover:bg-[#18181c]/20">
                          <td className="py-2.5 font-mono text-[#6b7367]">{exp.jam?.substring(0, 5) || '--:--'}</td>
                          <td className="py-2.5 font-medium text-slate-200">{exp.nama_pengeluaran}</td>
                          <td className="py-2.5 uppercase font-bold text-[10px] text-[#bbcbb2]">{exp.jenis?.replace('pengeluaran ', '') || 'Cafe'}</td>
                          <td className="py-2.5">{exp.kategori}</td>
                          <td className="py-2.5 text-right font-bold text-rose-450">{formatRupiah(exp.nominal)}</td>
                          <td className="py-2.5 text-center flex justify-center gap-1.5">
                            <button
                              onClick={() => handleStartEditPosExpense(exp)}
                              className="text-amber-500 hover:text-amber-400 font-bold px-2 py-1"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeletePosExpense(exp.id_pengeluaran)}
                              className="text-rose-500 hover:text-rose-450 font-bold px-2 py-1"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 6: Tukar Uang / Tarik Tunai QRIS */}
        {activeTab === 'exchange' && (
          <div className="glass-panel p-6 rounded-xl border border-[#26272d] flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white">Tukar Uang (Cash Out / QRIS ke Tunai)</h3>
              <p className="text-xs text-[#6b7367] mt-0.5">Catat transaksi penukaran uang: pelanggan transfer QRIS ke toko, kasir memberikan uang tunai dari laci</p>
            </div>

            <form onSubmit={handleSaveExchange} className="space-y-4 max-w-xl shrink-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Jumlah Uang Tunai Diberikan (Cash)</label>
                  <input
                    type="number"
                    value={exchangeCash}
                    onChange={(e) => {
                      const cashVal = e.target.value
                      setExchangeCash(cashVal)
                      // Auto-populate QRIS amount with same amount
                      if (!exchangeQris || parseFloat(exchangeQris) === parseFloat(exchangeCash || 0)) {
                        setExchangeQris(cashVal)
                      }
                    }}
                    placeholder="Contoh: 100000"
                    className="w-full bg-[#121215] border border-[#26272d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ffff] font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Jumlah Transfer QRIS Diterima</label>
                  <input
                    type="number"
                    value={exchangeQris}
                    onChange={(e) => setExchangeQris(e.target.value)}
                    placeholder="Contoh: 102000"
                    className="w-full bg-[#121215] border border-[#26272d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ffff] font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Nama Pelanggan (Keterangan)</label>
                  <input
                    type="text"
                    value={exchangeCustomer}
                    onChange={(e) => setExchangeCustomer(e.target.value)}
                    placeholder="Contoh: Budi (Tukar Uang)"
                    className="w-full bg-[#121215] border border-[#26272d] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ffff]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#bbcbb2] mb-1.5 uppercase">Estimasi Biaya Admin (Pendapatan Toko)</label>
                  <div className="w-full bg-[#18181c] border border-slate-850 rounded-lg px-3 py-2 text-[#00ffff] text-sm font-mono font-bold">
                    {formatRupiah(Math.max(0, parseFloat(exchangeQris || 0) - parseFloat(exchangeCash || 0)))}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-[#18181c] text-slate-950 font-bold rounded-lg text-sm transition-all"
              >
                {loading ? 'Memproses...' : 'Catat Penukaran Uang'}
              </button>
            </form>

            <div className="border-t border-[#26272d] pt-6">
              <h4 className="font-bold text-sm text-white mb-1">Informasi Cara Kerja Tukar Uang:</h4>
              <p className="text-xs text-[#bbcbb2] leading-relaxed">
                Fitur ini mencatat uang masuk QRIS ke rekening bank Anda (menambah saldo QRIS) dan uang keluar Cash dari laci kasir (mengurangi expected cash laci).
                Selisih antara QRIS diterima dan Cash diberikan otomatis tercatat sebagai pendapatan admin (laba bersih bertambah).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Kolom Kanan: Rincian Belanja & Checkout (36% di tablet landscape) */}
      {isOrderTab && (
        <div className="hidden md:flex md:w-[36%] bg-[#121215] border border-[#26272d] p-4 rounded-xl flex-col h-fit min-w-0 shrink-0 sticky top-2">
          <div className="flex items-center justify-between border-b border-[#26272d] pb-3 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="text-[#00ffff]" size={20} />
              <h3 className="font-bold text-base text-white">Struk Belanja</h3>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold hover:underline"
              >
                Kosongkan
              </button>
            )}
          </div>

          {/* Alert Popups */}
          {success && (
            <div className="mb-3 p-3 rounded-xl bg-[#00ffff] text-[#0f0f0f]/10 border border-brand-emerald/20 text-[#00ffff] text-xs flex items-center gap-2 shrink-0">
              <CheckCircle size={15} />
              <span>Transaksi berhasil disimpan!</span>
            </div>
          )}

          {error && (
            <div className="mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 shrink-0">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Header: Tipe Pesanan & Meja/Nomor Antrean Akrilik */}
          <div className="bg-[#121215] p-2.5 rounded-xl border border-[#26272d] mb-2.5 space-y-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOrderType('DINE IN')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  orderType === 'DINE IN'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-[#18181c]/80 text-[#bbcbb2] hover:text-slate-200'
                }`}
              >
                <span>🍽️</span>
                <span>Dine In</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderType('TAKE AWAY')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  orderType === 'TAKE AWAY'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-[#18181c]/80 text-[#bbcbb2] hover:text-slate-200'
                }`}
              >
                <span>🥡</span>
                <span>Take Away</span>
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder={orderType === 'DINE IN' ? "No. Meja / No. Akrilik / Pager (Cth: #12)" : "Nama / Panggilan Pembungkus"}
                value={tableOrQueueNumber}
                onChange={(e) => setTableOrQueueNumber(e.target.value)}
                className="w-full bg-[#18181c] border border-[#26272d] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#6b7367] focus:outline-hidden focus:border-[#00ffff]"
              />
            </div>
          </div>

          {/* List Cart Items (Scrollable jika item banyak, tanpa paksaan tinggi palsu) */}
          <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1 my-1">
            {cart.length === 0 && !hasCarwash && (
              <div className="flex flex-col items-center justify-center text-[#6b7367] text-xs py-5">
                <ShoppingCart size={28} className="mb-2 text-slate-700" />
                <p className="font-semibold text-[#bbcbb2]">Belum ada menu dipilih</p>
                <p className="text-[11px] text-[#6b7367] mt-0.5">Klik menu di samping untuk menambahkan ke struk.</p>
              </div>
            )}

            {/* List Item Cafe */}
            {cart.map((item) => (
              <div key={item.nama_menu} className="p-2 rounded-xl bg-[#121215] border border-[#26272d] hover:border-[#3f414a] transition-all shrink-0">
                <div className="flex justify-between items-start">
                  <div className="overflow-hidden mr-2">
                    <h5 className="font-bold text-xs text-white truncate">{item.nama_menu}</h5>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">{formatRupiah(item.harga)}</span>
                    {item.catatan && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/50">
                        <span>📝</span>
                        <span className="truncate">{item.catatan}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveNoteMenu(item.nama_menu)
                        setActiveNoteText(item.catatan || '')
                      }}
                      className="px-1.5 py-1 rounded-lg bg-[#18181c] hover:bg-slate-700 text-slate-200 text-[10px] font-medium transition-colors"
                      title="Tambah Catatan Rasa"
                    >
                      {item.catatan ? 'Edit Rasa' : '+ Catatan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateQty(item.nama_menu, -1)}
                      className="w-9 h-9 rounded-xl bg-[#18181c] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors font-bold text-xs tap-tactile"
                    >
                      <Minus size={13} strokeWidth={2} />
                    </button>
                    <span className="text-sm font-black text-white w-6 text-center font-mono">{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.nama_menu, 1)}
                      className="w-9 h-9 rounded-xl bg-[#18181c] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors font-bold text-xs tap-tactile"
                    >
                      <Plus size={13} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.nama_menu)}
                      className="text-rose-400 hover:text-rose-500 p-1 ml-0.5 transition-colors"
                      title="Hapus dari pesanan"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Item Carwash */}
            {hasCarwash && (
              <div className="p-3 rounded-lg bg-[#00ffff] text-[#0f0f0f]/5 border border-brand-blue/20 relative">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[8px] bg-[#00ffff] text-[#0f0f0f]/20 text-[#00ffff] px-2 py-0.5 rounded-full font-bold uppercase">Carwash</span>
                    <h5 className="font-bold text-xs text-white mt-1.5">{carwashForm.paket}</h5>
                    <p className="text-[10px] text-[#bbcbb2] mt-0.5 font-mono">
                      {carwashForm.platNomor || '(PLAT KOSONG)'} • {carwashForm.ukuran} • {carwashForm.variant}
                    </p>
                  </div>
                  <button
                    onClick={() => setHasCarwash(false)}
                    className="text-rose-400 hover:text-rose-500 p-1 shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="mt-3 flex justify-between items-center border-t border-[#26272d]/40 pt-2 text-[10px] text-[#6b7367]">
                  <span>Pencuci: {carwashForm.anggota1} {carwashForm.anggota2 && `+ ${carwashForm.anggota2}`}</span>
                  <span className="font-bold text-[#00ffff]">{formatRupiah(carwashForm.harga)}</span>
                </div>
              </div>
            )}
          </div>

        {/* Ringkasan & Checkout Button */}
        <div className="border-t border-[#26272d] pt-4 mt-4 shrink-0 space-y-4">
          <div className="space-y-1.5 text-xs text-[#bbcbb2]">
            {cart.length > 0 && (
              <div className="flex justify-between">
                <span>Total Cafe</span>
                <span>{formatRupiah(cafeTotal)}</span>
              </div>
            )}
             {hasCarwash && (
               <div className="flex justify-between">
                 <span>Total Carwash</span>
                 <span>{formatRupiah(carwashTotal)}</span>
               </div>
             )}
             
             {/* Dropdown Diskon Carwash */}
             {hasCarwash && (
               <div className="space-y-1 py-1">
                 <label className="text-[10px] text-[#6b7367] uppercase tracking-wider font-extrabold block">Diskon Carwash</label>
                 <CustomSelect
                   value={selectedDiskonCarwash ? selectedDiskonCarwash.id_diskon : ''}
                   onChange={(val) => {
                     if (!val) setSelectedDiskonCarwash(null)
                     else {
                       const found = discounts.find(d => d.id_diskon === val)
                       setSelectedDiskonCarwash(found || null)
                     }
                   }}
                   options={[
                     { value: '', label: 'Tanpa Diskon' },
                     ...discounts.filter(d => d.kategori === 'Carwash' || d.kategori === 'Semua').map(d => ({
                       value: d.id_diskon,
                       label: `${d.nama} (${d.tipe === 'Persen' ? `${d.nominal}%` : formatRupiah(d.nominal)})`
                     }))
                   ]}
                   size="xs"
                   variant="blue"
                   className="w-full"
                 />
                 {diskonCarwashNominal > 0 && (
                   <span className="text-[10px] text-[#00ffff] font-semibold block">Potongan: -{formatRupiah(diskonCarwashNominal)}</span>
                 )}
               </div>
             )}

             {/* Dropdown Diskon Cafe */}
             {cart.length > 0 && (
               <div className="space-y-1 py-1">
                 <label className="text-[10px] text-[#6b7367] uppercase tracking-wider font-extrabold block">Diskon Cafe</label>
                 <CustomSelect
                   value={selectedDiskonCafe ? selectedDiskonCafe.id_diskon : ''}
                   onChange={(val) => {
                     if (!val) setSelectedDiskonCafe(null)
                     else {
                       const found = discounts.find(d => d.id_diskon === val)
                       setSelectedDiskonCafe(found || null)
                     }
                   }}
                   options={[
                     { value: '', label: 'Tanpa Diskon' },
                     ...discounts.filter(d => d.kategori === 'Cafe' || d.kategori === 'Semua').map(d => ({
                       value: d.id_diskon,
                       label: `${d.nama} (${d.tipe === 'Persen' ? `${d.nominal}%` : formatRupiah(d.nominal)})`
                     }))
                   ]}
                   size="xs"
                   variant="blue"
                   className="w-full"
                 />
                 {diskonCafeNominal > 0 && (
                   <span className="text-[10px] text-[#00ffff] font-semibold block">Potongan: -{formatRupiah(diskonCafeNominal)}</span>
                 )}
               </div>
             )}

             <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-[#26272d]/50">
               <span>Total Bayar</span>
               <span className="text-[#00ffff]">{formatRupiah(grandTotal)}</span>
             </div>
             </div>

             {/* Pilihan Metode Bayar & Status Transaksi */}
             <div className="grid grid-cols-2 gap-2 p-3 bg-[#121215] rounded-xl border border-[#26272d] my-1">
             <div>
               <label className="text-[10px] text-[#bbcbb2] uppercase tracking-wider font-extrabold block mb-1">Metode Bayar</label>
               <CustomSelect
                 value={selectedPayment}
                 onChange={(val) => setSelectedPayment(val)}
                 options={[
                   ...paymentMethods.map(p => ({ value: p.nama, label: p.nama })),
                   { value: 'SPLIT', label: 'SPLIT (Cash + QRIS)' }
                 ]}
                 size="xs"
                 variant="emerald"
                 className="w-full"
               />
             </div>
             <div>
               <label className="text-[10px] text-[#bbcbb2] uppercase tracking-wider font-extrabold block mb-1">Status</label>
               <CustomSelect
                 value={paymentStatus}
                 onChange={(val) => setPaymentStatus(val)}
                 options={[
                   { value: 'Selesai', label: 'Selesai (Lunas)' },
                   { value: 'Pending', label: 'Pending (Bon)' }
                 ]}
                 size="xs"
                 variant="emerald"
                 className="w-full"
               />
             </div>
             </div>

                 {selectedPayment === 'SPLIT' && (
             <div className="p-3.5 rounded-xl bg-[#121215] border border-slate-850 space-y-3 my-1">
               <span className="text-[10px] text-[#6b7367] uppercase tracking-wider font-extrabold block">Pembayaran Terpisah (Split)</span>
               <div className="space-y-1">
                 <label className="text-[10px] text-[#bbcbb2] font-semibold block">Tunai (Cash):</label>
                 <input
                   type="number"
                   value={splitCashAmount}
                   onChange={(e) => {
                     const cashVal = e.target.value
                     setSplitCashAmount(cashVal)
                     const parsed = parseFloat(cashVal || 0)
                     setSplitQrisAmount(Math.max(0, grandTotal - parsed).toString())
                   }}
                   placeholder="Contoh: 50000"
                   className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-1.5 px-3 text-white text-xs font-bold font-mono focus:outline-none focus:border-[#00ffff]"
                 />
               </div>
               <div className="space-y-1">
                 <label className="text-[10px] text-[#bbcbb2] font-semibold block">Non-Tunai (QRIS):</label>
                 <input
                   type="number"
                   value={splitQrisAmount}
                   onChange={(e) => {
                     const qrisVal = e.target.value
                     setSplitQrisAmount(qrisVal)
                     const parsed = parseFloat(qrisVal || 0)
                     setSplitCashAmount(Math.max(0, grandTotal - parsed).toString())
                   }}
                   placeholder="Contoh: 50000"
                   className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-1.5 px-3 text-white text-xs font-bold font-mono focus:outline-none focus:border-[#00ffff]"
                 />
               </div>
             </div>
           )}

           {/* Input Uang Diterima & Kembalian */}
           {paymentStatus === 'Selesai' && (selectedPayment === 'CASH' || selectedPayment === 'SPLIT') && (
             <div className="p-3.5 rounded-xl bg-[#121215] border border-slate-850 space-y-3 my-1">
               <span className="text-[10px] text-[#6b7367] uppercase tracking-wider font-extrabold block">Kalkulator Kembalian</span>
               <div className="space-y-1">
                 <label className="text-[10px] text-[#bbcbb2] font-semibold block">Uang Diterima (Cash):</label>
                 <div className="relative">
                   <span className="absolute left-3 top-1.5 text-xs text-[#6b7367] font-bold font-mono">Rp</span>
                   <input
                     type="number"
                     value={uangDiterima}
                     onChange={(e) => setUangDiterima(e.target.value)}
                     placeholder="Contoh: 100000"
                     className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-1.5 pl-8 pr-3 text-white text-xs font-bold font-mono focus:outline-none focus:border-[#00ffff]"
                   />
                 </div>
               </div>
               {uangDiterima && (
                 <div className="flex justify-between items-center text-xs border-t border-[#26272d]/50 pt-2">
                   <span className="text-[#bbcbb2]">Kembalian:</span>
                   {isUangKurang ? (
                     <span className="font-mono font-bold text-rose-450 uppercase text-[10px]">Kurang {formatRupiah(Math.abs(kembalian))}</span>
                   ) : (
                     <span className="font-mono font-black text-[#00ffff] text-sm">{formatRupiah(kembalian)}</span>
                   )}
                 </div>
               )}
             </div>
           )}

           {editingStrukId && (
             <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 my-1 text-xs">
               <div className="flex items-center justify-between">
                 <span className="text-xs font-bold text-amber-400">Mode Edit Aktif</span>
                 <span className="text-[10px] bg-amber-500/20 text-amber-350 px-2 py-0.5 rounded-md font-mono">#{editingStrukId.substring(0, 8)}</span>
               </div>
               <p className="text-[10px] text-[#bbcbb2] leading-relaxed">
                 Anda sedang mengubah transaksi ini. Klik "Simpan Perubahan" untuk memperbarui database.
               </p>
               <button
                 type="button"
                 onClick={handleCancelEditTransaction}
                 className="w-full py-1.5 bg-[#18181c] hover:bg-slate-700 active:bg-slate-750 text-slate-350 font-bold rounded-lg text-[10px] transition-colors"
               >
                 Batal Edit
               </button>
             </div>
           )}

           <button
             onClick={handleCheckout}
             disabled={loading || (cart.length === 0 && !hasCarwash) || isUangKurang}
             className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 text-base disabled:opacity-50 tap-tactile cursor-pointer"
           >
             {loading ? 'Memproses Transaksi...' : editingStrukId ? 'Simpan Perubahan' : `Simpan & Cetak (${paymentStatus})`}
           </button>
           </div>
           </div>
           )}
           </div>

           {/* Floating Cart Bar for Mobile */}
           {(cart.length > 0 || hasCarwash) && !showMobileCart ? (
           <button
           onClick={() => setShowMobileCart(true)}
           className="md:hidden fixed bottom-5 left-4 right-4 z-30 bg-[#121215] border border-emerald-500/40 p-3.5 rounded-2xl flex items-center justify-between shadow-2xl animate-slide-up text-left group transition-transform active:scale-[0.98] tap-tactile"
           >
           <div className="flex items-center gap-3 pointer-events-none">
             <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 relative">
               <ShoppingCart size={18} strokeWidth={1.75} />
               <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-slate-950 text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                 {cart.reduce((sum, item) => sum + item.qty, 0) + (hasCarwash ? 1 : 0)}
               </span>
             </div>
             <div>
               <span className="block text-[9px] uppercase tracking-wider font-bold text-[#bbcbb2]">Total Tagihan</span>
               <span className="text-sm font-black font-mono text-emerald-400">{formatRupiah(grandTotal)}</span>
             </div>
           </div>
           <div className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md pointer-events-none">
             Lihat Detail <ChevronUp size={14} strokeWidth={1.75} />
           </div>
           </button>
           ) : null}

           {/* Mobile Cart Overlay/Drawer */}
           {showMobileCart && (
           <div className="md:hidden fixed inset-0 bg-[#18181c] backdrop-blur-sm z-50 flex flex-col justify-end animate-fade-in">
           {/* Backdrop click area to close */}
           <div className="absolute inset-0" onClick={() => setShowMobileCart(false)}></div>

           <div className="relative bg-[#080C14] border-t border-[#26272d] rounded-t-3xl max-h-[85vh] flex flex-col p-5 animate-slide-up shadow-2xl">
            {/* Header of Mobile Cart */}
            <div className="flex items-center justify-between border-b border-slate-850 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="text-[#00ffff]" size={20} />
                <h3 className="font-bold text-lg text-white">Struk Belanja ({cart.reduce((sum, item) => sum + item.qty, 0) + (hasCarwash ? 1 : 0)} item)</h3>
              </div>
              <button
                onClick={() => setShowMobileCart(false)}
                className="text-xs font-bold text-[#bbcbb2] hover:text-white px-3 py-1.5 rounded-lg bg-[#18181c] border border-[#26272d] transition-colors"
              >
                Tutup
              </button>
            </div>

            {/* Alert Popups in Mobile Cart */}
            {success && (
              <div className="mb-4 p-4 rounded-xl bg-[#00ffff] text-[#0f0f0f]/10 border border-brand-emerald/20 text-[#00ffff] text-xs flex items-center gap-3 shrink-0">
                <CheckCircle size={16} />
                <span>Transaksi berhasil disimpan!</span>
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-3 shrink-0">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Quick Mobile Header: Tipe Pesanan & Meja/Nomor Antrean Akrilik */}
            <div className="bg-[#121215] p-2.5 rounded-xl border border-[#26272d] mb-2 space-y-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setOrderType('DINE IN')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    orderType === 'DINE IN'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-[#18181c]/80 text-[#bbcbb2] hover:text-slate-200'
                  }`}
                >
                  <span>🍽️</span>
                  <span>Dine In</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('TAKE AWAY')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    orderType === 'TAKE AWAY'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-[#18181c]/80 text-[#bbcbb2] hover:text-slate-200'
                  }`}
                >
                  <span>🥡</span>
                  <span>Take Away</span>
                </button>
              </div>
              <div>
                <input
                  type="text"
                  placeholder={orderType === 'DINE IN' ? "No. Meja / Akrilik / Pager (#12)" : "Nama Pembungkus"}
                  value={tableOrQueueNumber}
                  onChange={(e) => setTableOrQueueNumber(e.target.value)}
                  className="w-full bg-[#18181c] border border-[#26272d] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-[#6b7367] focus:outline-hidden focus:border-[#00ffff]"
                />
              </div>
            </div>

            {/* List Cart Items (Scrollable) */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-4">
              {cart.map((item) => (
                <div key={item.nama_menu} className="p-2 rounded-xl bg-[#18181c] border border-slate-850">
                  <div className="flex justify-between items-start">
                    <div className="overflow-hidden mr-2">
                      <h5 className="font-bold text-xs text-white truncate">{item.nama_menu}</h5>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">{formatRupiah(item.harga)}</span>
                      {item.catatan && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-300 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/50">
                          <span>📝</span>
                          <span className="truncate">{item.catatan}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveNoteMenu(item.nama_menu)
                          setActiveNoteText(item.catatan || '')
                        }}
                        className="px-1.5 py-1 rounded bg-[#18181c] hover:bg-slate-700 text-slate-200 text-[10px]"
                        title="Catatan Rasa"
                      >
                        {item.catatan ? 'Edit' : '+ Catatan'}
                      </button>
                      <button
                        onClick={() => updateQty(item.nama_menu, -1)}
                        className="w-9 h-9 rounded-xl bg-[#18181c] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors tap-tactile"
                      >
                        <Minus size={13} strokeWidth={2} />
                      </button>
                      <span className="text-sm font-bold text-white w-6 text-center font-mono">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.nama_menu, 1)}
                        className="w-9 h-9 rounded-xl bg-[#18181c] hover:bg-slate-700 text-slate-200 flex items-center justify-center transition-colors tap-tactile"
                      >
                        <Plus size={13} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.nama_menu)}
                        className="text-rose-400 hover:text-rose-500 p-1 ml-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {hasCarwash && (
                <div className="p-3 rounded-lg bg-[#00ffff] text-[#0f0f0f]/5 border border-brand-blue/20 relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[8px] bg-[#00ffff] text-[#0f0f0f]/20 text-[#00ffff] px-2 py-0.5 rounded-full font-bold uppercase">Carwash</span>
                      <h5 className="font-bold text-xs text-white mt-1.5">{carwashForm.paket}</h5>
                      <p className="text-[10px] text-[#bbcbb2] mt-0.5 font-mono">
                        {carwashForm.platNomor || '(PLAT KOSONG)'} • {carwashForm.ukuran} • {carwashForm.variant}
                      </p>
                    </div>
                    <button
                      onClick={() => setHasCarwash(false)}
                      className="text-rose-400 hover:text-rose-500 p-1 shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="mt-3 flex justify-between items-center border-t border-[#26272d]/40 pt-2 text-[10px] text-[#6b7367]">
                    <span>Pencuci: {carwashForm.anggota1} {carwashForm.anggota2 && `+ ${carwashForm.anggota2}`}</span>
                    <span className="font-bold text-[#00ffff]">{formatRupiah(carwashForm.harga)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Ringkasan & Checkout Button */}
            <div className="border-t border-[#26272d] pt-4 shrink-0 space-y-4">
              <div className="space-y-1.5 text-xs text-[#bbcbb2]">
                {cart.length > 0 && (
                  <div className="flex justify-between">
                    <span>Total Cafe</span>
                    <span>{formatRupiah(cafeTotal)}</span>
                  </div>
                )}
                {hasCarwash && (
                  <div className="flex justify-between">
                    <span>Total Carwash</span>
                    <span>{formatRupiah(carwashTotal)}</span>
                  </div>
                )}

                {/* Dropdown Diskon Carwash Mobile */}
                {hasCarwash && (
                  <div className="space-y-1 py-1">
                    <label className="text-[10px] text-[#6b7367] uppercase tracking-wider font-extrabold block">Diskon Carwash</label>
                    <CustomSelect
                      value={selectedDiskonCarwash ? selectedDiskonCarwash.id_diskon : ''}
                      onChange={(val) => {
                        if (!val) setSelectedDiskonCarwash(null)
                        else {
                          const found = discounts.find(d => d.id_diskon === val)
                          setSelectedDiskonCarwash(found || null)
                        }
                      }}
                      options={[
                        { value: '', label: 'Tanpa Diskon' },
                        ...discounts.filter(d => d.kategori === 'Carwash' || d.kategori === 'Semua').map(d => ({
                          value: d.id_diskon,
                          label: `${d.nama} (${d.tipe === 'Persen' ? `${d.nominal}%` : formatRupiah(d.nominal)})`
                        }))
                      ]}
                      size="xs"
                      variant="blue"
                      className="w-full"
                    />
                    {diskonCarwashNominal > 0 && (
                      <span className="text-[10px] text-[#00ffff] font-semibold block">Potongan: -{formatRupiah(diskonCarwashNominal)}</span>
                    )}
                  </div>
                )}

                {/* Dropdown Diskon Cafe Mobile */}
                {cart.length > 0 && (
                  <div className="space-y-1 py-1">
                    <label className="text-[10px] text-[#6b7367] uppercase tracking-wider font-extrabold block">Diskon Cafe</label>
                    <CustomSelect
                      value={selectedDiskonCafe ? selectedDiskonCafe.id_diskon : ''}
                      onChange={(val) => {
                        if (!val) setSelectedDiskonCafe(null)
                        else {
                          const found = discounts.find(d => d.id_diskon === val)
                          setSelectedDiskonCafe(found || null)
                        }
                      }}
                      options={[
                        { value: '', label: 'Tanpa Diskon' },
                        ...discounts.filter(d => d.kategori === 'Cafe' || d.kategori === 'Semua').map(d => ({
                          value: d.id_diskon,
                          label: `${d.nama} (${d.tipe === 'Persen' ? `${d.nominal}%` : formatRupiah(d.nominal)})`
                        }))
                      ]}
                      size="xs"
                      variant="blue"
                      className="w-full"
                    />
                    {diskonCafeNominal > 0 && (
                      <span className="text-[10px] text-[#00ffff] font-semibold block">Potongan: -{formatRupiah(diskonCafeNominal)}</span>
                    )}
                  </div>
                )}

                <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-[#26272d]/50">
                  <span>Total Bayar</span>
                  <span className="text-[#00ffff]">{formatRupiah(grandTotal)}</span>
                </div>
              </div>

              {/* Pilihan Metode Bayar & Status Mobile */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-[#18181c] rounded-xl border border-slate-850 my-1">
                <div>
                  <label className="text-[10px] text-[#bbcbb2] uppercase tracking-wider font-extrabold block mb-1">Metode Bayar</label>
                  <CustomSelect
                    value={selectedPayment}
                    onChange={(val) => setSelectedPayment(val)}
                    options={[
                      ...paymentMethods.map(p => ({ value: p.nama, label: p.nama })),
                      { value: 'SPLIT', label: 'SPLIT (Cash + QRIS)' }
                    ]}
                    size="xs"
                    variant="emerald"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#bbcbb2] uppercase tracking-wider font-extrabold block mb-1">Status</label>
                  <CustomSelect
                    value={paymentStatus}
                    onChange={(val) => setPaymentStatus(val)}
                    options={[
                      { value: 'Selesai', label: 'Selesai (Lunas)' },
                      { value: 'Pending', label: 'Pending (Bon)' }
                    ]}
                    size="xs"
                    variant="emerald"
                    className="w-full"
                  />
                </div>
              </div>

              {/* Input Uang Diterima & Kembalian Mobile */}
              {paymentStatus === 'Selesai' && (selectedPayment === 'CASH' || selectedPayment === 'SPLIT') && (
                <div className="p-3.5 rounded-xl bg-[#18181c] border border-slate-850 space-y-3 my-1">
                  <span className="text-[10px] text-[#6b7367] uppercase tracking-wider font-extrabold block">Kalkulator Kembalian</span>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[#bbcbb2] font-semibold block">Uang Diterima (Cash):</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1.5 text-xs text-[#6b7367] font-bold font-mono">Rp</span>
                      <input
                        type="number"
                        value={uangDiterima}
                        onChange={(e) => setUangDiterima(e.target.value)}
                        placeholder="Contoh: 100000"
                        className="w-full bg-[#121215] border border-[#26272d] rounded-lg py-1.5 pl-8 pr-3 text-white text-xs font-bold font-mono focus:outline-none focus:border-[#00ffff]"
                      />
                    </div>
                  </div>
                  {uangDiterima && (
                    <div className="flex justify-between items-center text-xs border-t border-[#26272d]/50 pt-2">
                      <span className="text-[#bbcbb2]">Kembalian:</span>
                      {isUangKurang ? (
                        <span className="font-mono font-bold text-rose-450 uppercase text-[10px]">Kurang {formatRupiah(Math.abs(kembalian))}</span>
                      ) : (
                        <span className="font-mono font-black text-[#00ffff] text-sm">{formatRupiah(kembalian)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {editingStrukId && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 my-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">Mode Edit Aktif</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-350 px-2 py-0.5 rounded-md font-mono">#{editingStrukId.substring(0, 8)}</span>
                  </div>
                  <p className="text-[10px] text-[#bbcbb2] leading-relaxed">
                    Anda sedang mengubah transaksi ini. Klik "Simpan Perubahan" untuk memperbarui database.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      handleCancelEditTransaction();
                      setShowMobileCart(false);
                    }}
                    className="w-full py-1.5 bg-[#18181c] hover:bg-slate-700 active:bg-slate-750 text-slate-350 font-bold rounded-lg text-[10px] transition-colors"
                  >
                    Batal Edit
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  handleCheckout();
                  setShowMobileCart(false);
                }}
                disabled={loading || (cart.length === 0 && !hasCarwash) || isUangKurang}
                className="w-full py-3 bg-[#00ffff] text-[#0f0f0f] hover:bg-emerald-450 active:bg-emerald-600 text-slate-950 font-extrabold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 animate-pulse-glow"
              >
                {loading ? 'Memproses Transaksi...' : editingStrukId ? 'Simpan Perubahan' : `Simpan & Cetak (${paymentStatus})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Selesaikan Pembayaran Pending */}
      {settlingBill && (
        <div className="fixed inset-0 bg-[#18181c] backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl shadow-2xl border border-[#3f414a] shadow-[0_0_40px_rgba(16,185,129,0.15)] animate-pop-in">
            <div className="flex justify-between items-center border-b border-[#26272d] pb-4 mb-4">
              <h3 className="text-lg font-bold text-white">
                Pelunasan Tagihan #{settlingBill.id.substring(0, 8)}
              </h3>
              <button
                onClick={() => setSettlingBill(null)}
                className="text-[#bbcbb2] hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSettleBill} className="space-y-4">
              {(() => {
                const finalTotalToPay = settlingBill.total_harga + (settleSurcharge.enabled ? (parseFloat(settleSurcharge.nominal) || 0) : 0)

                return (
                  <>
                    <div className="p-4 rounded-xl bg-[#121215]/60 border border-[#26272d] space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#bbcbb2]">Tagihan Layanan:</span>
                        <span className="font-bold text-slate-200 font-mono">{formatRupiah(settlingBill.total_harga)}</span>
                      </div>
                      {settleSurcharge.enabled && (
                        <div className="flex justify-between text-amber-400 font-medium">
                          <span>{settleSurcharge.keterangan || 'Cas Inap'}:</span>
                          <span className="font-bold font-mono">+{formatRupiah(settleSurcharge.nominal || 0)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1.5 border-t border-[#26272d]">
                        <span className="text-white font-bold">Total Pelunasan:</span>
                        <span className="font-black text-[#00ffff] text-base font-mono">{formatRupiah(finalTotalToPay)}</span>
                      </div>
                      <div className="flex justify-between text-[#bbcbb2] text-[11px]">
                        <span>Kasir Pembuka:</span>
                        <span className="text-slate-200 font-bold">{settlingBill.kasir}</span>
                      </div>
                    </div>

                    {/* Fitur Cas Inap / Biaya Tambahan Mobil Menginap */}
                    <div className="p-3.5 rounded-xl bg-[#121215] border border-[#26272d] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-400">
                          <input
                            type="checkbox"
                            checked={settleSurcharge.enabled}
                            onChange={(e) => setSettleSurcharge(prev => ({ ...prev, enabled: e.target.checked }))}
                            className="rounded bg-[#18181c] border-[#3f414a] text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                          />
                          <span>Tambah Biaya Inap / Cas Keterlambatan</span>
                        </label>
                        {settleSurcharge.enabled && (
                          <span className="text-[10px] font-bold text-[#00ffff] bg-[#00ffff] text-[#0f0f0f]/15 px-2 py-0.5 rounded font-mono">
                            +{formatRupiah(settleSurcharge.nominal || 0)}
                          </span>
                        )}
                      </div>

                      {settleSurcharge.enabled && (
                        <div className="space-y-2 pt-2 border-t border-[#26272d] animate-fade-in">
                          {/* Preset Buttons */}
                          <div className="flex gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setSettleSurcharge(prev => ({ ...prev, nominal: 50000, keterangan: 'Biaya Inap Kendaraan (1 Malam)' }))}
                              className={`px-2.5 py-1 text-[10px] rounded-lg font-bold border transition-colors ${
                                settleSurcharge.nominal === 50000 
                                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                                  : 'bg-[#18181c] text-[#bbcbb2] border-[#26272d] hover:text-white'
                              }`}
                            >
                              1 Malam (50rb)
                            </button>
                            <button
                              type="button"
                              onClick={() => setSettleSurcharge(prev => ({ ...prev, nominal: 100000, keterangan: 'Biaya Inap Kendaraan (2 Malam)' }))}
                              className={`px-2.5 py-1 text-[10px] rounded-lg font-bold border transition-colors ${
                                settleSurcharge.nominal === 100000 
                                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                                  : 'bg-[#18181c] text-[#bbcbb2] border-[#26272d] hover:text-white'
                              }`}
                            >
                              2 Malam (100rb)
                            </button>
                            <button
                              type="button"
                              onClick={() => setSettleSurcharge(prev => ({ ...prev, nominal: 35000, keterangan: 'Cas Keterlambatan Pengambilan' }))}
                              className={`px-2.5 py-1 text-[10px] rounded-lg font-bold border transition-colors ${
                                settleSurcharge.nominal === 35000 
                                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                                  : 'bg-[#18181c] text-[#bbcbb2] border-[#26272d] hover:text-white'
                              }`}
                            >
                              Telat Ambil (35rb)
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-[#bbcbb2] font-semibold block mb-1">Nominal Cas (Rp):</label>
                              <input
                                type="number"
                                value={settleSurcharge.nominal}
                                onChange={(e) => setSettleSurcharge(prev => ({ ...prev, nominal: parseFloat(e.target.value) || 0 }))}
                                className="w-full bg-[#18181c] border border-[#26272d] rounded-lg px-2.5 py-1.5 text-white text-xs font-mono font-bold focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-[#bbcbb2] font-semibold block mb-1">Keterangan Biaya:</label>
                              <input
                                type="text"
                                value={settleSurcharge.keterangan}
                                onChange={(e) => setSettleSurcharge(prev => ({ ...prev, keterangan: e.target.value }))}
                                placeholder="Contoh: Biaya Inap 1 Malam"
                                className="w-full bg-[#18181c] border border-[#26272d] rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1.5">
                        Metode Pembayaran Pelunasan
                      </label>
                      <select
                        value={settlePaymentMethod}
                        onChange={(e) => setSettlePaymentMethod(e.target.value)}
                        className="w-full bg-[#121215] border border-slate-850 rounded-lg py-2 px-3 text-white text-sm"
                        required
                      >
                        {paymentMethods.map(p => (
                          <option key={p.nama || p.id} value={p.nama}>{p.nama}</option>
                        ))}
                      </select>
                    </div>

                    {settlePaymentMethod === 'SPLIT' && (
                      <div className="p-3.5 rounded-xl bg-[#18181c] border border-slate-850 space-y-3 my-1">
                        <span className="text-[10px] text-[#6b7367] uppercase tracking-wider font-extrabold block text-[#bbcbb2]">Pembayaran Terpisah (Split)</span>
                        <div className="space-y-1">
                          <label className="text-[10px] text-[#6b7367] font-semibold block">Tunai (Cash):</label>
                          <input
                            type="number"
                            value={splitCashAmount}
                            onChange={(e) => {
                              const cashVal = e.target.value
                              setSplitCashAmount(cashVal)
                              const parsed = parseFloat(cashVal || 0)
                              setSplitQrisAmount(Math.max(0, finalTotalToPay - parsed).toString())
                            }}
                            placeholder="Contoh: 50000"
                            className="w-full bg-[#121215] border border-[#26272d] rounded-lg py-1.5 px-3 text-white text-xs font-bold font-mono focus:outline-none focus:border-[#00ffff]"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-[#6b7367] font-semibold block">Non-Tunai (QRIS):</label>
                          <input
                            type="number"
                            value={splitQrisAmount}
                            onChange={(e) => {
                              const qrisVal = e.target.value
                              setSplitQrisAmount(qrisVal)
                              const parsed = parseFloat(qrisVal || 0)
                              setSplitCashAmount(Math.max(0, finalTotalToPay - parsed).toString())
                            }}
                            placeholder="Contoh: 50000"
                            className="w-full bg-[#121215] border border-[#26272d] rounded-lg py-1.5 px-3 text-white text-xs font-bold font-mono focus:outline-none focus:border-[#00ffff]"
                            required
                          />
                        </div>
                      </div>
                    )}

                    {/* Kalkulator Kembalian untuk Pelunasan (CASH / SPLIT) */}
                    {(settlePaymentMethod === 'CASH' || settlePaymentMethod === 'SPLIT') && (() => {
                      const targetCash = settlePaymentMethod === 'SPLIT' ? (parseFloat(splitCashAmount) || 0) : finalTotalToPay
                      const sKembalian = settleCashReceived ? parseFloat(settleCashReceived) - targetCash : 0
                      const isSKurang = settleCashReceived && sKembalian < 0

                      return (
                        <div className="p-3.5 rounded-xl bg-[#121215] border border-[#26272d] space-y-3 my-1">
                          <span className="text-[10px] text-[#bbcbb2] uppercase tracking-wider font-extrabold block">Kalkulator Kembalian Pelunasan</span>
                          <div className="space-y-1">
                            <label className="text-[10px] text-[#bbcbb2] font-semibold block">
                              Uang Diterima dari Pelanggan (Cash):
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-2 text-xs text-[#6b7367] font-bold font-mono">Rp</span>
                              <input
                                type="number"
                                value={settleCashReceived}
                                onChange={(e) => setSettleCashReceived(e.target.value)}
                                placeholder={targetCash ? `Contoh: ${targetCash}` : 'Contoh: 100000'}
                                className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-2 pl-8 pr-3 text-white text-xs font-bold font-mono focus:outline-none focus:border-[#00ffff]"
                              />
                            </div>
                          </div>
                          {settleCashReceived && (
                            <div className="flex justify-between items-center text-xs border-t border-[#26272d]/60 pt-2">
                              <span className="text-[#bbcbb2]">Kembalian Pelanggan:</span>
                              {isSKurang ? (
                                <span className="font-mono font-bold text-rose-450 uppercase text-[10px]">Kurang {formatRupiah(Math.abs(sKembalian))}</span>
                              ) : (
                                <span className="font-mono font-black text-[#00ffff] text-sm">{formatRupiah(sKembalian)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    <div className="flex justify-end gap-3 pt-4 border-t border-[#26272d] mt-4">
                      <button
                        type="button"
                        onClick={() => setSettlingBill(null)}
                        className="px-4 py-2 bg-[#18181c] hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-sm"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={loading || ((settlePaymentMethod === 'CASH' || settlePaymentMethod === 'SPLIT') && settleCashReceived && (parseFloat(settleCashReceived) < (settlePaymentMethod === 'SPLIT' ? (parseFloat(splitCashAmount) || 0) : finalTotalToPay)))}
                        className="px-4 py-2 bg-[#00ffff] text-[#0f0f0f] hover:bg-emerald-500 active:bg-emerald-600 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50"
                      >
                        {loading ? 'Memproses...' : 'Konfirmasi Lunas & Cetak Struk'}
                      </button>
                    </div>
                  </>
                )
              })()}
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Input Modal Hari Ini */}
      {showModalModal && (
        <div className="fixed inset-0 bg-[#18181c] backdrop-blur-md flex items-center justify-center p-4 z-[70] animate-fade-in">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl shadow-2xl border border-[#26272d] animate-pop-in">
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-tr from-brand-emerald to-brand-blue flex items-center justify-center font-bold text-lg text-slate-900 shadow-md mb-3">
                JB
              </div>
              <h3 className="text-lg font-bold text-white">Masukkan Modal Hari Ini</h3>
              <p className="text-[#bbcbb2] text-xs mt-1">Sistem mendeteksi modal awal untuk hari ini belum dimasukkan.</p>
            </div>

            <form onSubmit={handleSaveStartingCapital} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#bbcbb2] uppercase tracking-wider mb-2">
                  Nominal Modal Awal (Rp)
                </label>
                <input
                  type="number"
                  placeholder="Contoh: 100000"
                  value={startingCapitalInput}
                  onChange={(e) => setStartingCapitalInput(e.target.value)}
                  className="w-full bg-[#121215] border border-[#26272d] rounded-xl py-3 px-4 text-white text-sm text-center font-bold text-[#00ffff] focus:outline-none focus:border-[#00ffff] placeholder-slate-700"
                  required
                  min="0"
                />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#00ffff] text-[#0f0f0f] hover:bg-emerald-500 active:bg-emerald-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-brand-emerald/10 transition-all text-sm disabled:opacity-50"
              >
                {loading ? 'Menyimpan...' : 'Konfirmasi & Mulai Shift'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM MODAL: Alert / Confirm */}
      {customAlert && (
        <div className="fixed inset-0 bg-[#18181c] backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="glass-panel w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-[#26272d] shadow-[0_0_50px_rgba(16,185,129,0.08)] animate-pop-in text-center">
            <div className="mb-4">
              {customAlert.title === 'Sukses' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="text-emerald-400" size={24} />
                </div>
              ) : customAlert.title === 'Error' || customAlert.title === 'Hapus Pengeluaran' || customAlert.title === 'Batalkan Transaksi' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center">
                  <AlertCircle className="text-rose-400" size={24} />
                </div>
              ) : (
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
                  <AlertCircle className="text-amber-400" size={24} />
                </div>
              )}
            </div>

            <h4 className="text-base font-extrabold text-white mb-2">
              {customAlert.title}
            </h4>
            <p className="text-xs text-slate-350 leading-relaxed mb-6">
              {customAlert.message}
            </p>

            <div className="flex justify-center gap-3">
              {customAlert.type === 'confirm' && (
                <button
                  type="button"
                  onClick={customAlert.onCancel}
                  className="px-4 py-2 bg-[#18181c] hover:bg-slate-700 active:scale-95 text-slate-200 font-bold rounded-xl text-xs transition-all w-24"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={customAlert.onConfirm}
                className={`px-4 py-2 active:scale-95 font-bold rounded-xl text-xs transition-all w-24 ${customAlert.title === 'Error' || customAlert.title === 'Hapus Pengeluaran' || customAlert.title === 'Batalkan Transaksi'
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-[#00ffff] text-[#0f0f0f] hover:bg-emerald-500 text-slate-950'
                  }`}
              >
                {customAlert.type === 'confirm' ? 'Ya' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Catatan Rasa / Modifier Menu (Cafe & Resto) */}
      {activeNoteMenu && (
        <div className="fixed inset-0 bg-[#18181c] backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="glass-panel w-full max-w-md p-5 rounded-2xl shadow-2xl border border-[#26272d] animate-pop-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#26272d] mb-3">
              <div>
                <h4 className="text-sm font-bold text-white">Catatan & Preferensi Menu</h4>
                <p className="text-xs text-[#00ffff] font-semibold truncate max-w-[280px]">{activeNoteMenu}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveNoteMenu(null)
                  setActiveNoteText('')
                }}
                className="text-[#bbcbb2] hover:text-white p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1.5">
                  Preset Cepat (1-Klik):
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Less Sugar',
                    'No Sugar',
                    'Normal Ice',
                    'No Ice',
                    'Extra Shot',
                    'Pedas Sedang',
                    'Tidak Pedas',
                    'Pisah Sambal',
                    'Bungkus Terpisah'
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setActiveNoteText(prev => {
                          if (!prev) return preset
                          if (prev.includes(preset)) return prev
                          return `${prev}, ${preset}`
                        })
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs bg-[#18181c] hover:bg-slate-700 text-slate-200 border border-[#3f414a] active:scale-95 transition-all"
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1">
                  Catatan Kustom:
                </label>
                <input
                  type="text"
                  placeholder="Cth: Less sugar, es sedikit, gelas sedang..."
                  value={activeNoteText}
                  onChange={(e) => setActiveNoteText(e.target.value)}
                  className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#00ffff]"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => handleSetItemNote(activeNoteMenu, '')}
                  className="px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-950/30 transition-colors"
                >
                  Hapus Catatan
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveNoteMenu(null)
                      setActiveNoteText('')
                    }}
                    className="px-3 py-2 rounded-xl text-xs bg-[#18181c] hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetItemNote(activeNoteMenu, activeNoteText.trim())}
                    className="px-4 py-2 rounded-xl text-xs bg-[#00ffff] text-[#0f0f0f] hover:bg-emerald-500 text-slate-950 font-bold shadow-md transition-colors"
                  >
                    Simpan Catatan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cetak Struk Kasir Thermal (58mm / 80mm) & Kirim WhatsApp */}
      {activeReceipt && (
        <ThermalReceiptModal
          receiptData={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  )
}

export default CafePOS
