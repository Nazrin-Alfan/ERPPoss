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
import { api } from '../services/apiAdapter'
import { useAuth } from '../context/AuthContext'
import { isMerchandiseCategory } from '../constants/transactionConstants'
import { 
  Settings, 
  UserPlus, 
  Utensils, 
  Package, 
  CreditCard, 
  Trash2, 
  Edit3, 
  Plus, 
  Check, 
  AlertCircle,
  CheckCircle,
  Eye,
  DollarSign,
  Users,
  Calendar,
  Percent,
  CalendarCheck,
  RotateCcw,
  FileText,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
  Tag,
  Printer,
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  Lock,
  Filter,
  Layers,
  ArrowRight,
  Info,
  Mail
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatRupiah, calculateTutupKasirRecap } from '../utils/helpers'
import { getTenantFeatures } from '../utils/businessCapabilities'
import InteractiveCalendar from '../components/InteractiveCalendar'
import ReceiptCustomizer from '../components/admin/ReceiptCustomizer'
import CarwashPackageManager from '../components/admin/CarwashPackageManager'
import MerchandiseManager from '../components/admin/MerchandiseManager'
import LicenseManager from '../components/admin/LicenseManager'
import MenuHppCalculator from '../components/admin/MenuHppCalculator'
import BankEmailBindingModal from '../components/admin/BankEmailBindingModal'
import ImageUploadPaste from '../components/common/ImageUploadPaste'
import CustomCategoryPicker from '../components/common/CustomCategoryPicker'
import CustomSelect from '../components/common/CustomSelect'
import { DEFAULT_CARWASH_PACKAGES } from '../utils/carwashHelpers'
import { getReceiptConfig } from '../utils/receiptHelpers'
import { calculateIngredientCost, calculateMenuHpp, calculateMarginSimulation } from '../utils/hppCalculator'

const Admin = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const { registerKasir, manageStaff, activeTenant, profile } = useAuth()
  const features = getTenantFeatures(activeTenant?.business_type)
  const defaultTab = tabParam || (features.isCarwashOnly ? 'carwash-packages' : 'menu')
  const [activeTab, setActiveTab] = useState(defaultTab)

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  useEffect(() => {
    if (!tabParam && features.isCarwashOnly && activeTab === 'menu') {
      setActiveTab('carwash-packages')
    } else if (!tabParam && features.isCafeOnly && activeTab === 'carwash-packages') {
      setActiveTab('menu')
    }
  }, [features.isCarwashOnly, features.isCafeOnly, tabParam])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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

  // Database Data
  const [cashiers, setCashiers] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [selectedMenuCategory, setSelectedMenuCategory] = useState('Semua')

  const activeMenuCategories = useMemo(() => {
    const counts = {}
    menuItems.forEach(m => {
      const cat = m.kategori || 'Cafe'
      counts[cat] = (counts[cat] || 0) + 1
    })
    return counts
  }, [menuItems])

  const filteredMenuItems = useMemo(() => {
    if (selectedMenuCategory === 'Semua') return menuItems
    return menuItems.filter(m => (m.kategori || 'Cafe') === selectedMenuCategory)
  }, [menuItems, selectedMenuCategory])
  const [stokBahan, setStokBahan] = useState([])
  const [resepList, setResepList] = useState([])

  const [balances, setBalances] = useState({ cash: 0, rekY: 0, rekN: 0, rekR: 0 })
  const [targetBalances, setTargetBalances] = useState({ cash: '', rekY: '', rekN: '', rekR: '' })

  // State Akun Likuiditas (Kas & Rekening Dinamis)
  const [posAccountList, setPosAccountList] = useState([])
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [showBankEmailModal, setShowBankEmailModal] = useState(false)
  const [selectedBankEmailPocketId, setSelectedBankEmailPocketId] = useState('')
  const [editingAccount, setEditingAccount] = useState(null)
  const [accountModalError, setAccountModalError] = useState('')
  const [accountModalLoading, setAccountModalLoading] = useState(false)
  const [accountForm, setAccountForm] = useState({
    pos: '',
    label: '',
    tipe: 'BANK',
    balance: 0,
    keterangan: '',
    color: 'blue',
    is_active: true
  })

  // State Form Diskon
  const [discounts, setDiscounts] = useState([])
  const [discountForm, setDiscountForm] = useState({
    nama: '',
    nominal: 0,
    tipe: 'Rupiah',
    kategori: 'Carwash'
  })

  // State Master Kategori & Jenis Terkunci
  const [masterCategories, setMasterCategories] = useState([])
  const [categoryFilterJenis, setCategoryFilterJenis] = useState('all')
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [categoryModalError, setCategoryModalError] = useState('')
  const [categoryModalLoading, setCategoryModalLoading] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [isCustomCategoryJenis, setIsCustomCategoryJenis] = useState(false)
  const [categoryForm, setCategoryForm] = useState({
    nama_kategori: '',
    jenis: 'Pengeluaran Cafe',
    tipe_arus: 'PENGELUARAN',
    account_id: 'acc_6004',
    boleh_kasir: false,
    is_active: true,
  })

  // List of distinct Jenis from masterCategories + defaults
  const availableCategoryJenisList = useMemo(() => {
    const defaultJenis = [
      'Kategori Menu Cafe',
      'Kategori Layanan Carwash',
      'Kategori Retail / Merchandise',
      'Pengeluaran Cafe',
      'Pengeluaran Carwash',
      'Pengeluaran Bersama',
      'Operasional',
      'Casbon',
      'Mutasi Internal',
      'Pemasukan Non-POS'
    ]
    const map = new Map()
    defaultJenis.forEach(j => map.set(j.toLowerCase(), j))
    masterCategories.forEach(c => {
      if (c.jenis && !map.has(c.jenis.toLowerCase())) {
        map.set(c.jenis.toLowerCase(), c.jenis)
      }
    })
    return Array.from(map.values())
  }, [masterCategories])

  const filteredMasterCategories = useMemo(() => {
    if (categoryFilterJenis === 'all') return masterCategories
    return masterCategories.filter(c => String(c.jenis || '').toLowerCase() === categoryFilterJenis.toLowerCase())
  }, [masterCategories, categoryFilterJenis])

  // State Form Kasir
  const [newCashier, setNewCashier] = useState('')
  
  // State Form Metode Pembayaran
  const [newPayment, setNewPayment] = useState('')

  // State Form Menu & Resep
  const [showMenuModal, setShowMenuModal] = useState(false)
  const [isEditingMenu, setIsEditingMenu] = useState(false)
  const [menuForm, setMenuForm] = useState({
    nama_menu: '',
    harga: 0,
    kategori: 'Minuman',
    deskripsi: '',
    foto_url: '',
    is_bundling: false,
    is_active: true
  })
  const [menuRecipe, setMenuRecipe] = useState([]) // list of { nama_bahan, jumlah_dibutuhkan, satuan }
  const [menuCalculatorHpp, setMenuCalculatorHpp] = useState(null)

  useEffect(() => {
    if (!showMenuModal) {
      setMenuCalculatorHpp(null)
    }
  }, [showMenuModal])

  const menuFooterSummary = useMemo(() => {
    const recipeHpp = calculateMenuHpp({ recipeList: menuRecipe, stockItems: stokBahan }).totalHpp
    const effectiveHpp = menuCalculatorHpp !== null ? menuCalculatorHpp : recipeHpp
    const appliedPrice = parseFloat(menuForm.harga) || 0
    const sim = calculateMarginSimulation({
      sellingPrice: appliedPrice,
      totalHpp: effectiveHpp,
      targetMargin: 60
    })
    return {
      appliedPrice,
      effectiveHpp,
      marginPercent: sim.marginPercent,
      marginStatus: sim.marginStatus
    }
  }, [menuRecipe, stokBahan, menuCalculatorHpp, menuForm.harga])

  // Daftar Kategori Menu Cafe (Bisa Custom Dinamis)
  const [cafeCategories, setCafeCategories] = useState([
    'Minuman',
    'Kopi (Coffee)',
    'Non-Coffee & Teh',
    'Mocktail & Squash',
    'Jus & Smoothies',
    'Makanan Berat',
    'Camilan & Snack',
    'Dessert',
    'Paket Bundling'
  ])

  // State Form Bahan Baku Baru
  const [showIngredientModal, setShowIngredientModal] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState(null) // for editing existing ingredients
  const [ingredientForm, setIngredientForm] = useState({
    id_bahan_baku: '',
    nama_bahan: '',
    stok: 0,
    satuan: 'Gram/Ml',
    harga_satuan: 0
  })
  
  // State Opname / Kebocoran
  const [opnameIngredient, setOpnameIngredient] = useState(null)
  const [stokFisik, setStokFisik] = useState('')

  // State Tutup Kasir Manual (Susulan EOD)
  const [manualEodDate, setManualEodDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [manualEodCashier, setManualEodCashier] = useState('Admin / Manual')
  const [manualEodQrisPos, setManualEodQrisPos] = useState('SALDO REKENING Y')
  const [manualEodLoading, setManualEodLoading] = useState(false)
  const [manualEodProcessing, setManualEodProcessing] = useState(false)
  const [manualEodData, setManualEodData] = useState({
    strukList: [],
    expenseList: [],
    totalCash: 0,
    totalQris: 0,
    totalExpense: 0,
    existingCashflows: []
  })

  // State Paket & Tarif Cuci
  const [carwashPackages, setCarwashPackages] = useState(DEFAULT_CARWASH_PACKAGES)

  // State Lisensi & Langganan Tenant
  const [licenseData, setLicenseData] = useState(null)

  const loadAdminData = async () => {
    setLoading(true)
    try {
      // Fetch seluruh master data secara paralel (Promise.all)
      const targetTenantId = activeTenant?.id || profile?.tenant_id
      const fetchPockets = async () => {
        let viewQuery = supabase.from('v_pocket_balances').select('*')
        if (targetTenantId) viewQuery = viewQuery.eq('tenant_id', targetTenantId)
        const viewRes = await viewQuery
        if (!viewRes?.error && Array.isArray(viewRes?.data)) return viewRes
        let fallbackQuery = supabase.from('pos_balances').select('*')
        if (targetTenantId) fallbackQuery = fallbackQuery.eq('tenant_id', targetTenantId)
        return fallbackQuery
      }

      const [
        resKc,
        resPm,
        resMn,
        resSb,
        resRs,
        resDk,
        resMc,
        resBal,
        resCp,
        resLic
      ] = await Promise.all([
        supabase.from('kasir').select('*').order('created_at', { ascending: true }),
        supabase.from('metode_bayar').select('*').order('created_at', { ascending: true }),
        supabase.from('daftar_harga_menu').select('*').order('daftar_menu', { ascending: true }),
        supabase.from('stok_barang').select('*').order('nama_produk', { ascending: true }),
        supabase.from('resep').select('*'),
        supabase.from('diskon').select('*').order('created_at', { ascending: false }),
        supabase.from('master_categories').select('*'),
        fetchPockets(),
        supabase.from('carwash_packages').select('*').order('sort_order', { ascending: true }),
        supabase.from('tenant_licenses').select('*').limit(1)
      ])

      const kc = resKc?.data
      const pm = resPm?.data
      const mn = resMn?.data
      const sb = resSb?.data
      const rs = resRs?.data
      const dk = resDk?.data
      const mc = resMc?.data
      const bal = resBal?.data
      const cp = resCp?.data
      const lic = resLic?.data

      const realCashiers = kc || []
      const realPayments = pm || []
      const realMenus = (mn || [])
        .filter(item => item.kategori !== 'Carwash')
        .map(item => ({
          ...item,
          nama_menu: item.daftar_menu
        }))
      const realStok = (sb || []).map(item => ({
        ...item,
        nama_bahan: item.nama_produk,
        harga_satuan: parseFloat(item.harga_satuan || item.harga_beli || 0)
      }))
      const realResep = (rs || []).map(item => ({
        ...item,
        jumlah_dibutuhkan: item.jumlah
      }))

      let cashVal = 0, rekYVal = 0, rekNVal = 0, rekRVal = 0
      const balancesMap = {}
      const normalizedPockets = (bal || []).map(item => {
        const liveVal = parseFloat(item.current_balance ?? item.balance ?? 0) || 0
        const openingVal = parseFloat(item.opening_balance ?? item.balance ?? 0) || 0
        balancesMap[item.pos] = liveVal
        if (item.pos === 'SALDO CASH') cashVal = liveVal
        else if (item.pos === 'SALDO REKENING Y') rekYVal = liveVal
        else if (item.pos === 'SALDO REKENING N') rekNVal = liveVal
        else if (item.pos === 'SALDO REKENING R') rekRVal = liveVal
        return {
          ...item,
          opening_balance: openingVal,
          current_balance: liveVal,
          balance: liveVal
        }
      })
      setBalances({ cash: cashVal, rekY: rekYVal, rekN: rekNVal, rekR: rekRVal, ...balancesMap })
      setPosAccountList(normalizedPockets)

      setCashiers(realCashiers)
      setPaymentMethods(realPayments)
      setMenuItems(realMenus)
      setStokBahan(realStok)
      setResepList(realResep)
      setDiscounts(dk || [])
      setMasterCategories(mc || [])

      // Kumpulkan kategori kustom yang ada dari menu yang tersimpan
      if (realMenus && realMenus.length > 0) {
        const uniqueCats = new Set([
          'Minuman',
          'Kopi (Coffee)',
          'Non-Coffee & Teh',
          'Mocktail & Squash',
          'Jus & Smoothies',
          'Makanan Berat',
          'Camilan & Snack',
          'Dessert',
          'Paket Bundling'
        ])
        realMenus.forEach(m => {
          if (m.kategori && m.kategori !== 'Carwash' && m.kategori !== 'Semua') {
            uniqueCats.add(m.kategori)
          }
        })
        setCafeCategories(Array.from(uniqueCats))
      }

      const normalizedCp = (cp || []).map(p => ({
        ...p,
        nama_paket: p.nama_paket || p.name,
        name: p.name || p.nama_paket,
        keterangan: p.keterangan || p.description,
        tarif: p.tarif_matrix || p.tarif
      }))

      setCarwashPackages(normalizedCp.length > 0 ? normalizedCp : DEFAULT_CARWASH_PACKAGES)

      if (lic && lic.length > 0) {
        setLicenseData(lic[0])
      } else {
        setLicenseData(null)
      }

    } catch (err) {
      console.error('Error loading admin data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAdminData()
  }, [activeTenant?.id, profile?.tenant_id])



  // 1. Kasir & Metode Bayar Handlers
  const handleAddCashier = async (e) => {
    e.preventDefault()
    if (!newCashier) return
    try {
      const targetTenantId = activeTenant?.id || profile?.tenant_id
      const payload = { nama: newCashier.toUpperCase() }
      if (targetTenantId) payload.tenant_id = targetTenantId
      const { error } = await supabase.from('kasir').insert(payload)
      if (error) throw error
      setNewCashier('')
      setSuccess('Kasir berhasil ditambahkan!')
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal menambahkan kasir.')
    }
  }

  const toggleCashierActive = async (cashierOrName, currentVal) => {
    try {
      const targetTenantId = activeTenant?.id || profile?.tenant_id
      const cashierObj = typeof cashierOrName === 'object' && cashierOrName !== null ? cashierOrName : null
      const nama = cashierObj ? cashierObj.nama : cashierOrName
      const cleanNama = (nama || '').trim().toUpperCase()
      const useIdFilter = isPostgresUuid(cashierObj?.id)

      let query = supabase
        .from('kasir')
        .update({ is_active: !currentVal })
        .eq(useIdFilter ? 'id' : 'nama', useIdFilter ? cashierObj.id : nama)
      if (targetTenantId) query = query.eq('tenant_id', targetTenantId)
      const { error } = await query
      if (error) throw error

      // Sinkronkan juga ke profiles & karyawan_kantor: utamakan profile_id jika sudah tertaut
      let targetProfileId = isPostgresUuid(cashierObj?.profile_id) ? cashierObj.profile_id : null
      if (!targetProfileId) {
        let staffQuery = supabase.from('profiles').select('id, nama, role').eq('role', 'Kasir')
        if (targetTenantId) staffQuery = staffQuery.eq('tenant_id', targetTenantId)
        const { data: tenantStaff } = await staffQuery
        const matchedStaff = (tenantStaff || []).find(
          (s) => (s.nama || '').trim().toUpperCase() === cleanNama && s.role === 'Kasir'
        )
        targetProfileId = matchedStaff?.id || null
      }

      if (targetProfileId && typeof manageStaff === 'function') {
        await manageStaff({
          staffId: targetProfileId,
          action: currentVal ? 'DEACTIVATE' : 'ACTIVATE'
        })
      }

      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal mengupdate kasir.')
    }
  }

  const handleAddPayment = async (e) => {
    e.preventDefault()
    if (!newPayment) return
    try {
      const targetTenantId = activeTenant?.id || profile?.tenant_id
      const payload = { nama: newPayment.toUpperCase() }
      if (targetTenantId) payload.tenant_id = targetTenantId
      const { error } = await supabase.from('metode_bayar').insert(payload)
      if (error) throw error
      setNewPayment('')
      setSuccess('Metode Pembayaran berhasil ditambahkan!')
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal menambahkan metode pembayaran.')
    }
  }

  const togglePaymentActive = async (nama, currentVal) => {
    try {
      const { error } = await supabase.from('metode_bayar').update({ is_active: !currentVal }).eq('nama', nama)
      if (error) throw error
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal mengupdate metode pembayaran.')
    }
  }

  // Helper pengecekan UUID standar Postgres
  const isPostgresUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)

  // Carwash Packages Handlers
  const handleSaveCarwashPackage = async (pkgPayload) => {
    try {
      setLoading(true)
      const basePrice = typeof pkgPayload.tarif === 'number' 
        ? pkgPayload.tarif 
        : (pkgPayload.tarif?.Small?.Regular || 50000)

      const payload = {
        nama_paket: pkgPayload.nama_paket,
        name: pkgPayload.nama_paket,
        description: pkgPayload.keterangan || '',
        keterangan: pkgPayload.keterangan || '',
        komisi_skema: pkgPayload.komisi_skema || 'TIERED',
        komisi_value: parseFloat(pkgPayload.komisi_value) || 0,
        price: basePrice,
        tarif: basePrice,
        tarif_matrix: typeof pkgPayload.tarif === 'object' ? pkgPayload.tarif : null,
        is_active: pkgPayload.is_active !== false
      }

      let savedPkgId = isPostgresUuid(pkgPayload.id) ? pkgPayload.id : null
      const previousPkg = savedPkgId ? carwashPackages.find(p => p.id === savedPkgId) : null

      if (savedPkgId) {
        const { error } = await supabase
          .from('carwash_packages')
          .update(payload)
          .eq('id', savedPkgId)
        if (error) throw error
        setSuccess(`Paket "${pkgPayload.nama_paket}" berhasil diperbarui!`)
      } else {
        const { data: insPkg, error } = await supabase
          .from('carwash_packages')
          .insert({
            ...payload,
            sort_order: carwashPackages.length + 1
          })
          .select('id')
          .single()
        if (error) throw error
        savedPkgId = insPkg?.id || null
        setSuccess(`Paket cuci baru "${pkgPayload.nama_paket}" berhasil ditambahkan!`)
      }

      // Sinkronisasi resep bahan kimia cuci ke tabel resep secara batch atomik melalui api.master
      await api.master.replaceCarwashPackageRecipes({
        savedPkgId,
        packageName: pkgPayload.nama_paket,
        previousPackageName: previousPkg?.nama_paket || null,
        resepBahan: pkgPayload.resep_bahan || [],
        stokBahan
      })

      await loadAdminData()
    } catch (err) {
      console.error('Save carwash package error:', err)
      setError(err.message || 'Gagal menyimpan paket cuci.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCarwashPackage = async (pkgId) => {
    const pkg = carwashPackages.find(p => p.id === pkgId)
    if (!window.confirm(`Yakin ingin menghapus paket cuci "${pkg?.nama_paket || 'ini'}"?`)) return
    try {
      setLoading(true)
      if (isPostgresUuid(pkgId)) {
        await supabase.from('resep').delete().eq('carwash_package_id', pkgId)
        if (pkg?.nama_paket) {
          await supabase.from('resep').delete().is('carwash_package_id', null).eq('nama_menu', pkg.nama_paket)
        }
        const { error } = await supabase.from('carwash_packages').delete().eq('id', pkgId)
        if (error) throw error
      } else {
        // Jika data masih berupa template memory (belum ada di DB),
        // persist paket lainnya ke DB sehingga paket ini tidak muncul lagi
        const packagesToSeed = carwashPackages
          .filter(p => p.id !== pkgId)
          .map((p, idx) => {
            const basePrice = typeof p.tarif === 'number' ? p.tarif : (p.tarif?.Small?.Regular || 50000)
            return {
              name: p.nama_paket,
              nama_paket: p.nama_paket,
              description: p.keterangan || '',
              keterangan: p.keterangan || '',
              price: basePrice,
              tarif: basePrice,
              tarif_matrix: typeof p.tarif === 'object' ? p.tarif : null,
              komisi_skema: p.komisi_skema || 'TIERED',
              komisi_value: parseFloat(p.komisi_value) || 0,
              is_active: p.is_active !== false,
              sort_order: idx + 1
            }
          })
        if (packagesToSeed.length > 0) {
          const { error: seedErr } = await supabase.from('carwash_packages').insert(packagesToSeed)
          if (seedErr) throw seedErr
        }
        if (pkg?.nama_paket) {
          await supabase.from('resep').delete().eq('nama_menu', pkg.nama_paket)
        }
      }

      setSuccess('Paket cuci berhasil dihapus.')
      await loadAdminData()
    } catch (err) {
      console.error('Delete carwash package error:', err)
      setError(err.message || 'Gagal menghapus paket cuci.')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleCarwashPackageActive = async (pkgId, currentStatus) => {
    try {
      if (isPostgresUuid(pkgId)) {
        const { error } = await supabase
          .from('carwash_packages')
          .update({ is_active: !currentStatus })
          .eq('id', pkgId)
        if (error) throw error
      } else {
        const packagesToSeed = carwashPackages.map((p, idx) => {
          const basePrice = typeof p.tarif === 'number' ? p.tarif : (p.tarif?.Small?.Regular || 50000)
          return {
            name: p.nama_paket,
            nama_paket: p.nama_paket,
            description: p.keterangan || '',
            keterangan: p.keterangan || '',
            price: basePrice,
            tarif: basePrice,
            tarif_matrix: typeof p.tarif === 'object' ? p.tarif : null,
            komisi_skema: p.komisi_skema || 'TIERED',
            komisi_value: parseFloat(p.komisi_value) || 0,
            is_active: p.id === pkgId ? !currentStatus : (p.is_active !== false),
            sort_order: idx + 1
          }
        })
        const { error: seedErr } = await supabase.from('carwash_packages').insert(packagesToSeed)
        if (seedErr) throw seedErr
      }
      setSuccess('Status paket cuci berhasil diperbarui!')
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal memperbarui status paket.')
    }
  }

  // Merchandise & Retail Handlers
  const merchandiseList = useMemo(() => {
    return (stokBahan || []).filter(
      (s) =>
        s.gudang === 'MERCHANDISE' ||
        isMerchandiseCategory(s.kategori, s.sub_kategori)
    )
  }, [stokBahan])

  const handleSaveMerchandise = async (itemPayload) => {
    try {
      setLoading(true)
      const existing = (stokBahan || []).find(
        (s) => (itemPayload.id && s.id === itemPayload.id) ||
               s.id_barang === itemPayload.id_barang ||
               s.id_bahan_baku === itemPayload.id_barang
      )

      if (existing) {
        const targetFilterCol = isPostgresUuid(existing.id) ? 'id' : 'id_barang'
        const targetFilterVal = isPostgresUuid(existing.id) ? existing.id : itemPayload.id_barang
        const { error } = await supabase
          .from('stok_barang')
          .update({
            nama_barang: itemPayload.nama_barang,
            nama_produk: itemPayload.nama_barang,
            gudang: 'MERCHANDISE',
            kategori: itemPayload.kategori,
            sub_kategori: itemPayload.kategori,
            harga_beli: itemPayload.harga_beli,
            harga_jual: itemPayload.harga_jual,
            stok: itemPayload.stok,
            min_stok: itemPayload.min_stok,
            satuan: itemPayload.satuan,
            emoji: itemPayload.emoji,
            icon: itemPayload.emoji,
            foto_url: itemPayload.foto_url || '',
            is_active: itemPayload.is_active,
            keterangan: itemPayload.keterangan
          })
          .eq(targetFilterCol, targetFilterVal)
        if (error) throw error
        setSuccess(`Produk merchandise "${itemPayload.nama_barang}" berhasil diperbarui!`)
      } else {
        const { error } = await supabase
          .from('stok_barang')
          .insert({
            id_barang: itemPayload.id_barang,
            id_bahan_baku: itemPayload.id_barang,
            nama_barang: itemPayload.nama_barang,
            nama_produk: itemPayload.nama_barang,
            gudang: 'MERCHANDISE',
            kategori: itemPayload.kategori,
            sub_kategori: itemPayload.kategori,
            harga_beli: itemPayload.harga_beli,
            harga_jual: itemPayload.harga_jual,
            stok: itemPayload.stok,
            min_stok: itemPayload.min_stok,
            satuan: itemPayload.satuan,
            emoji: itemPayload.emoji,
            icon: itemPayload.emoji,
            foto_url: itemPayload.foto_url || '',
            is_active: itemPayload.is_active,
            keterangan: itemPayload.keterangan
          })
        if (error) throw error
        setSuccess(`Produk merchandise baru "${itemPayload.nama_barang}" berhasil ditambahkan!`)
      }

      await loadAdminData()
    } catch (err) {
      console.error('Save merchandise error:', err)
      setError(err.message || 'Gagal menyimpan produk merchandise.')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteMerchandise = async (itemId) => {
    const item = (stokBahan || []).find((s) => s.id === itemId || s.id_barang === itemId || s.id_bahan_baku === itemId)
    if (!window.confirm(`Yakin ingin menghapus produk merchandise "${item?.nama_barang || item?.nama_produk || 'ini'}"?`)) return
    try {
      setLoading(true)
      const filterCol = isPostgresUuid(itemId) ? 'id' : 'id_barang'
      const { error } = await supabase.from('stok_barang').delete().eq(filterCol, itemId)
      if (error) throw error
      setSuccess('Produk merchandise berhasil dihapus.')
      await loadAdminData()
    } catch (err) {
      console.error('Delete merchandise error:', err)
      setError(err.message || 'Gagal menghapus produk merchandise.')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleMerchandiseActive = async (itemId, currentActive) => {
    try {
      setLoading(true)
      const filterCol = isPostgresUuid(itemId) ? 'id' : 'id_barang'
      const { error } = await supabase
        .from('stok_barang')
        .update({ is_active: !currentActive })
        .eq(filterCol, itemId)
      if (error) throw error
      setSuccess(`Status produk berhasil diubah menjadi ${!currentActive ? 'Aktif' : 'Non-aktif'}.`)
      await loadAdminData()
    } catch (err) {
      console.error('Toggle merchandise active error:', err)
      setError(err.message || 'Gagal mengubah status aktif produk.')
    } finally {
      setLoading(false)
    }
  }

  // License Activation Handler
  const handleActivateLicenseKey = async (serialKey) => {
    if (!serialKey || serialKey.length < 8) {
      throw new Error('Format serial key tidak valid (minimal 8 karakter). Periksa kembali kode lisensi Anda.')
    }

    // Panggil RPC aman sisi server fn_activate_license_key
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('fn_activate_license_key', {
      p_license_key: serialKey.trim().toUpperCase(),
      p_tenant_id: activeTenant?.id
    })

    if (rpcErr) {
      // Fallback untuk mock database lokal jika RPC belum didaftarkan di client emulator
      const isMissingRpc = rpcErr.message?.includes('function') && rpcErr.message?.includes('does not exist')
      if (isMissingRpc) {
        const baseDate = (licenseData?.expires_at && new Date(licenseData.expires_at) > new Date())
          ? new Date(licenseData.expires_at)
          : new Date()
        
        const newExpiry = new Date(baseDate)
        newExpiry.setFullYear(newExpiry.getFullYear() + 1)

        const updatedLicense = {
          license_key: serialKey,
          status: 'ACTIVE',
          tier: 'PRO_ANNUAL',
          plan: 'pro',
          expires_at: newExpiry.toISOString(),
          valid_until: newExpiry.toISOString(),
          notes: `Diaktivasi pada ${new Date().toLocaleDateString('id-ID')} via Serial Key`
        }

        if (licenseData?.id) {
          const { error } = await supabase
            .from('tenant_licenses')
            .update(updatedLicense)
            .eq('id', licenseData.id)
          if (error) throw error
        }
      } else {
        throw new Error(rpcErr.message || 'Gagal mengaktivasi lisensi di server.')
      }
    }

    await loadAdminData()
    setSuccess(rpcRes?.message || 'Lisensi berhasil diaktivasi! Masa aktif sistem diperpanjang 1 Tahun.')
  }

  // 2. Bahan Baku Handlers
  const handleSaveIngredient = async (e) => {
    e.preventDefault()
    if (!ingredientForm.id_bahan_baku) return setError('ID bahan wajib diisi.')
    if (!ingredientForm.nama_bahan) return setError('Nama bahan wajib diisi.')
    
    try {
      const { error } = await supabase.from('stok_barang').insert({
        id_bahan_baku: ingredientForm.id_bahan_baku.trim().toUpperCase(),
        nama_produk: ingredientForm.nama_bahan.trim(),
        stok: parseFloat(ingredientForm.stok) || 0,
        satuan: ingredientForm.satuan,
        harga_satuan: parseFloat(ingredientForm.harga_satuan) || 0
      })
      if (error) throw error
      setSuccess('Bahan Baku Baru berhasil ditambahkan!')
      setIngredientForm({ id_bahan_baku: '', nama_bahan: '', stok: 0, satuan: 'Gram/Ml', harga_satuan: 0 })
      setShowIngredientModal(false)
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal menambahkan bahan baku.')
    }
  }

  const handleUpdateIngredient = async (e) => {
    e.preventDefault()
    if (!editingIngredient) return
    try {
      const cleanProduk = editingIngredient.nama_produk.trim()
      const useId = isPostgresUuid(editingIngredient.id)
      const { error } = await supabase.from('stok_barang').update({
        nama_produk: cleanProduk,
        nama_barang: cleanProduk,
        stok: parseFloat(editingIngredient.stok) || 0,
        satuan: editingIngredient.satuan,
        harga_satuan: parseFloat(editingIngredient.harga_satuan) || 0
      }).eq(useId ? 'id' : 'id_bahan_baku', useId ? editingIngredient.id : editingIngredient.id_bahan_baku)

      if (error) throw error
      setSuccess('Bahan Baku berhasil diperbarui!')
      setEditingIngredient(null)
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal memperbarui bahan baku.')
    }
  }

  const handleDeleteIngredient = async (id) => {
    const confirmed = await showConfirm('Yakin ingin menghapus bahan baku ini?', 'Hapus Bahan Baku')
    if (!confirmed) return
    try {
      const filterCol = isPostgresUuid(id) ? 'id' : 'id_bahan_baku'
      const { error } = await supabase.from('stok_barang').delete().eq(filterCol, id)
      if (error) throw error
      await showAlert('Berhasil dihapus.', 'Sukses')
      loadAdminData()
    } catch (err) {
      console.error(err)
      await showAlert('Gagal hapus: ' + err.message, 'Error')
    }
  }

  const handleSimpanOpname = async (e) => {
    e.preventDefault()
    if (!opnameIngredient) return
    const fisik = parseFloat(stokFisik)
    if (isNaN(fisik)) {
      await showAlert('Masukkan angka stok fisik yang valid', 'Input Tidak Valid')
      return
    }
    
    // In a full implementation, you would save this to a ledger or history.
    // For now, we update the main stock to match the physical stock to correct the leakage.
    try {
      const useId = isPostgresUuid(opnameIngredient.id)
      const { error } = await supabase.from('stok_barang').update({
        stok: fisik,
        updated_at: new Date().toISOString()
      }).eq(useId ? 'id' : 'id_bahan_baku', useId ? opnameIngredient.id : opnameIngredient.id_bahan_baku)
      if (error) throw error
      
      await showAlert('Stok fisik berhasil disimpan dan diupdate di sistem.', 'Sukses')
      setOpnameIngredient(null)
      setStokFisik('')
      loadAdminData()
    } catch (err) {
      console.error(err)
      await showAlert('Gagal update opname: ' + err.message, 'Error')
    }
  }



  // 4. Menu & Resep Handlers
  const handleAddRecipeRow = () => {
    const defaultItem = stokBahan[0]
    setMenuRecipe(prev => [...prev, {
      stok_barang_id: defaultItem?.id || null,
      nama_bahan: defaultItem?.nama_bahan || '',
      jumlah_dibutuhkan: 1,
      satuan: defaultItem?.satuan || 'Gram'
    }])
  }

  const removeRecipeRow = (index) => {
    setMenuRecipe(prev => prev.filter((_, i) => i !== index))
  }

  const updateRecipeRow = (index, field, value) => {
    setMenuRecipe(prev => 
      prev.map((item, i) => {
        if (i === index) {
          const updated = { ...item, [field]: value }
          if (field === 'nama_bahan') {
            const match = stokBahan.find(b => b.nama_bahan === value || b.nama_produk === value)
            if (match) {
              updated.satuan = match.satuan
              updated.stok_barang_id = match.id || null
            }
          }
          return updated
        }
        return item
      })
    )
  }

  const openAddMenuModal = () => {
    setIsEditingMenu(false)
    setMenuForm({
      id: null,
      id_menu: null,
      original_nama_menu: '',
      nama_menu: '',
      harga: 0,
      kategori: 'Minuman',
      deskripsi: '',
      foto_url: '',
      is_bundling: false,
      is_active: true
    })
    setMenuRecipe([])
    setShowMenuModal(true)
  }

  const openEditMenuModal = (menu) => {
    setIsEditingMenu(true)
    setMenuForm({
      id: menu.id || null,
      id_menu: menu.id_menu,
      original_nama_menu: menu.nama_menu,
      nama_menu: menu.nama_menu,
      harga: parseFloat(menu.harga),
      kategori: menu.kategori || 'Minuman',
      deskripsi: menu.deskripsi || '',
      foto_url: menu.foto_url || '',
      is_bundling: menu.is_bundling,
      is_active: menu.is_active
    })
    
    // Cari resep yang terkait (prioritaskan menu_id, lalu nama_menu lama)
    const recipeRows = resepList
      .filter(r =>
        (isPostgresUuid(menu.id) && r.menu_id === menu.id) ||
        (!r.menu_id && r.nama_menu === menu.nama_menu)
      )
      .map(r => {
        const matchedBahan = stokBahan.find(
          b => (r.stok_barang_id && b.id === r.stok_barang_id) ||
               b.nama_bahan === r.nama_bahan ||
               b.nama_produk === r.nama_bahan
        )
        return {
          stok_barang_id: r.stok_barang_id || matchedBahan?.id || null,
          nama_bahan: r.nama_bahan,
          jumlah_dibutuhkan: parseFloat(r.jumlah_dibutuhkan),
          satuan: r.satuan
        }
      })

    setMenuRecipe(recipeRows)
    setShowMenuModal(true)
  }

  const handleSaveDiscount = async (e) => {
    e.preventDefault()
    if (!discountForm.nama) return setError('Nama diskon wajib diisi.')
    if (parseFloat(discountForm.nominal) <= 0) return setError('Nominal diskon harus lebih dari 0.')
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const { error: err } = await supabase
        .from('diskon')
        .insert({
          nama: discountForm.nama.trim(),
          nominal: parseFloat(discountForm.nominal),
          tipe: discountForm.tipe,
          kategori: discountForm.kategori
        })
      if (err) throw err
      setSuccess('Berhasil menambahkan diskon baru!')
      setDiscountForm({ nama: '', nominal: 0, tipe: 'Rupiah', kategori: 'Carwash' })
      await loadAdminData()
    } catch (err) {
      console.error(err)
      setError('Gagal menyimpan diskon: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDiscount = async (id_diskon, name) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus diskon "${name}"?`, 'Hapus Diskon')
    if (!confirmed) return
    setLoading(true)
    try {
      const { error: err } = await supabase
        .from('diskon')
        .delete()
        .eq('id_diskon', id_diskon)
      if (err) throw err
      await showAlert(`Diskon "${name}" berhasil dihapus.`, 'Sukses')
      await loadAdminData()
    } catch (err) {
      console.error(err)
      await showAlert('Gagal menghapus diskon: ' + err.message, 'Error')
    } finally {
      setLoading(false)
    }
  }

  // =========================================================
  // LOGIKA CRUD MASTER KATEGORI & ARUS CASHFLOW
  // =========================================================
  const handleSaveCategory = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setCategoryModalError('')

    if (!categoryForm.nama_kategori.trim()) {
      setCategoryModalError('Nama kategori wajib diisi.')
      return
    }

    setCategoryModalLoading(true)
    setLoading(true)
    try {
      const targetTenantId = activeTenant?.id || profile?.tenant_id
      if (editingCategory) {
        let q = supabase
          .from('master_categories')
          .update({
            nama_kategori: categoryForm.nama_kategori.trim(),
            jenis: categoryForm.jenis,
            tipe_arus: categoryForm.tipe_arus,
            account_id: categoryForm.account_id,
            boleh_kasir: categoryForm.boleh_kasir,
            is_active: categoryForm.is_active,
          })
          .eq('id', editingCategory.id)
        if (targetTenantId) q = q.eq('tenant_id', targetTenantId)

        const { error: err } = await q
        if (err) throw err
        setSuccess(`Kategori "${categoryForm.nama_kategori}" berhasil diperbarui!`)
      } else {
        const catPayload = {
          nama_kategori: categoryForm.nama_kategori.trim(),
          jenis: categoryForm.jenis,
          tipe_arus: categoryForm.tipe_arus,
          account_id: categoryForm.account_id,
          boleh_kasir: categoryForm.boleh_kasir,
          is_active: true,
        }
        if (targetTenantId) catPayload.tenant_id = targetTenantId

        const { error: err } = await supabase
          .from('master_categories')
          .insert(catPayload)

        if (err) throw err
        setSuccess(`Kategori baru "${categoryForm.nama_kategori}" berhasil disimpan!`)
      }

      setShowCategoryModal(false)
      setEditingCategory(null)
      setCategoryForm({
        nama_kategori: '',
        jenis: 'Pengeluaran Cafe',
        tipe_arus: 'PENGELUARAN',
        account_id: 'acc_6004',
        boleh_kasir: false,
        is_active: true,
      })
      await loadAdminData()
    } catch (err) {
      console.error(err)
      const msg = 'Gagal menyimpan kategori: ' + (err.message || '')
      setCategoryModalError(msg)
      setError(msg)
    } finally {
      setCategoryModalLoading(false)
      setLoading(false)
    }
  }

  const handleDeleteCategory = async (cat) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus kategori "${cat.nama_kategori}"?`, 'Hapus Kategori')
    if (!confirmed) return
    setLoading(true)
    try {
      const targetTenantId = activeTenant?.id || profile?.tenant_id
      let q = supabase
        .from('master_categories')
        .delete()
        .eq('id', cat.id)
      if (targetTenantId) q = q.eq('tenant_id', targetTenantId)
      const { error: err } = await q

      if (err) throw err
      await showAlert(`Kategori "${cat.nama_kategori}" berhasil dihapus.`, 'Sukses')
      await loadAdminData()
    } catch (err) {
      console.error(err)
      await showAlert('Gagal menghapus kategori: ' + err.message, 'Error')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveMenu = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!menuForm.nama_menu) return setError('Nama menu wajib diisi.')
    if (parseFloat(menuForm.harga) < 0) return setError('Harga menu tidak boleh negatif.')

    // Tentukan kategori akhir
    let finalKategori = menuForm.kategori || 'Minuman'
    if (!cafeCategories.includes(finalKategori)) {
      setCafeCategories(prev => [...prev, finalKategori])
    }

    // Cek duplikasi bahan baku dalam resep
    const bahanSet = new Set()
    for (const r of menuRecipe) {
      if (bahanSet.has(r.nama_bahan)) {
        return setError(`Bahan baku "${r.nama_bahan}" tidak boleh diinput lebih dari sekali dalam satu resep menu.`)
      }
      bahanSet.add(r.nama_bahan)
    }

    try {
      const cleanMenuName = menuForm.nama_menu.trim()
      let savedMenuUuid = isPostgresUuid(menuForm.id) ? menuForm.id : null
      let savedMenuCode = menuForm.id_menu || cleanMenuName

      // 1. Simpan Menu (Insert / Update berdasarkan PK UUID id)
      if (isEditingMenu) {
        const useId = isPostgresUuid(savedMenuUuid)
        const { error: menuErr } = await supabase
          .from('daftar_harga_menu')
          .update({
            daftar_menu: cleanMenuName,
            nama_menu: cleanMenuName,
            nama_item: cleanMenuName,
            nama: cleanMenuName,
            harga: parseFloat(menuForm.harga),
            kategori: finalKategori,
            deskripsi: menuForm.deskripsi,
            foto_url: menuForm.foto_url || '',
            is_bundling: menuForm.is_bundling,
            is_active: menuForm.is_active
          })
          .eq(useId ? 'id' : 'id_menu', useId ? savedMenuUuid : menuForm.id_menu)

        if (menuErr) throw menuErr

        // Hapus resep lama terkait menu_id (serta sisa legacy tanpa menu_id)
        if (useId) {
          await supabase.from('resep').delete().eq('menu_id', savedMenuUuid)
          if (menuForm.id_menu) {
            await supabase.from('resep').delete().is('menu_id', null).eq('id_menu', menuForm.id_menu)
          }
          if (menuForm.original_nama_menu) {
            await supabase.from('resep').delete().is('menu_id', null).eq('nama_menu', menuForm.original_nama_menu)
          }
        } else {
          await supabase.from('resep').delete().eq('id_menu', menuForm.id_menu)
        }
      } else {
        const { data: insertedMenu, error: menuErr } = await supabase
          .from('daftar_harga_menu')
          .insert({
            daftar_menu: cleanMenuName,
            nama_menu: cleanMenuName,
            nama_item: cleanMenuName,
            nama: cleanMenuName,
            harga: parseFloat(menuForm.harga),
            kategori: finalKategori,
            deskripsi: menuForm.deskripsi,
            foto_url: menuForm.foto_url || '',
            is_bundling: menuForm.is_bundling,
            is_active: menuForm.is_active
          })
          .select('id, id_menu')
          .single()

        if (menuErr) throw menuErr
        if (isPostgresUuid(insertedMenu?.id)) savedMenuUuid = insertedMenu.id
        if (insertedMenu?.id_menu) savedMenuCode = insertedMenu.id_menu
      }

      // 2. Simpan Resep (tautkan menu_id & stok_barang_id UUID)
      if (menuRecipe.length > 0) {
        const resolvedMenuId = savedMenuCode || cleanMenuName
        const insertRecipes = menuRecipe.map(r => {
          const matchedBahan = stokBahan.find(
            b => (r.stok_barang_id && b.id === r.stok_barang_id) ||
                 b.nama_bahan === r.nama_bahan ||
                 b.nama_produk === r.nama_bahan
          )
          const resolvedStokUuid = r.stok_barang_id || matchedBahan?.id || null
          const resolvedBahanCode = matchedBahan ? (matchedBahan.id_bahan_baku || matchedBahan.id_barang || matchedBahan.id) : r.nama_bahan
          const qtyVal = parseFloat(r.jumlah_dibutuhkan)
          return {
            ...(isPostgresUuid(savedMenuUuid) ? { menu_id: savedMenuUuid } : {}),
            ...(isPostgresUuid(resolvedStokUuid) ? { stok_barang_id: resolvedStokUuid } : {}),
            id_menu: resolvedMenuId,
            nama_menu: cleanMenuName,
            daftar_menu: cleanMenuName,
            id_bahan_baku: resolvedBahanCode,
            nama_bahan: r.nama_bahan,
            jumlah: qtyVal,
            jumlah_pemakaian: qtyVal,
            jumlah_dibutuhkan: qtyVal,
            satuan: r.satuan
          }
        })

        const { error: rErr } = await supabase
          .from('resep')
          .insert(insertRecipes)

        if (rErr) throw rErr
      }

      setSuccess('Menu & Resep berhasil disimpan!')
      setShowMenuModal(false)
      await loadAdminData()
    } catch (err) {
      console.error('Save menu error:', err)
      setError(err.message || 'Gagal menyimpan menu.')
    }
  }

  const handleDeleteMenu = async (menuOrName) => {
    const label = typeof menuOrName === 'object' && menuOrName !== null
      ? (menuOrName.nama_menu || menuOrName.daftar_menu)
      : menuOrName
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus menu "${label}"? Tindakan ini akan menghapus data resep yang melekat.`, 'Hapus Menu')
    if (!confirmed) return
    try {
      await api.master.deleteMenuWithRecipe(menuOrName)
      setSuccess('Menu dan komposisi resep berhasil dihapus!')
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal menghapus menu.')
    }
  }

  const handleOpenAddAccount = () => {
    setEditingAccount(null)
    setAccountForm({
      pos: '',
      label: '',
      tipe: 'BANK',
      balance: 0,
      keterangan: '',
      color: 'blue',
      is_active: true
    })
    setAccountModalError('')
    setAccountModalLoading(false)
    setShowAccountModal(true)
  }

  const handleOpenEditAccount = (acc) => {
    setEditingAccount(acc)
    setAccountForm({
      pos: acc.pos,
      label: acc.label || acc.pos,
      tipe: acc.tipe || 'BANK',
      balance: acc.opening_balance ?? acc.balance ?? 0,
      keterangan: acc.keterangan || '',
      color: acc.color || 'blue',
      is_active: acc.is_active !== false
    })
    setAccountModalError('')
    setAccountModalLoading(false)
    setShowAccountModal(true)
  }

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setAccountModalError('')
    setError('')
    setSuccess('')
    setAccountModalLoading(true)

    try {
      const posCode = accountForm.pos.trim().toUpperCase()
      if (!posCode) {
        setAccountModalError('Kode / Nama Pos akun wajib diisi.')
        setAccountModalLoading(false)
        return
      }
      const normalizedPos = posCode.startsWith('SALDO ') ? posCode : `SALDO ${posCode}`

      let targetTenantId = activeTenant?.id || profile?.tenant_id
      let targetBranchId = profile?.branch_id || null

      if (!targetTenantId) {
        const { data: authData } = await supabase.auth.getUser()
        if (authData?.user) {
          const { data: prof } = await supabase.from('profiles').select('tenant_id, branch_id').eq('id', authData.user.id).maybeSingle()
          if (prof?.tenant_id) targetTenantId = prof.tenant_id
          if (prof?.branch_id) targetBranchId = prof.branch_id
        }
      }

      if (!targetTenantId) {
        throw new Error('Tenant aktif tidak terdeteksi. Silakan muat ulang halaman atau pilih outlet.')
      }

      const payload = {
        tenant_id: targetTenantId,
        branch_id: targetBranchId,
        pos: normalizedPos,
        label: accountForm.label.trim() || normalizedPos,
        tipe: accountForm.tipe || 'BANK',
        keterangan: accountForm.keterangan || '',
        color: accountForm.color || 'blue',
        is_active: accountForm.is_active !== false,
        balance: parseFloat(accountForm.balance || 0)
      }

      if (editingAccount) {
        const updatePayload = {
          pos: normalizedPos,
          label: payload.label,
          tipe: payload.tipe,
          keterangan: payload.keterangan,
          color: payload.color,
          is_active: payload.is_active
        }
        let query = supabase.from('pos_balances').update(updatePayload)
        query = editingAccount.id ? query.eq('id', editingAccount.id) : query.eq('pos', editingAccount.pos)
        if (targetTenantId) query = query.eq('tenant_id', targetTenantId)
        const { error: updErr } = await query
        if (updErr) throw updErr
        setSuccess(`Akun likuiditas "${payload.label}" berhasil diperbarui!`)
      } else {
        const exists = posAccountList.some(a => a.pos === normalizedPos && (a.tenant_id ? a.tenant_id === targetTenantId : true))
        if (exists) {
          setAccountModalError(`Akun dengan nama pos "${normalizedPos}" sudah ada.`)
          setAccountModalLoading(false)
          return
        }
        const { error: insErr } = await supabase.from('pos_balances').insert(payload)
        if (insErr) throw insErr
        setSuccess(`Akun likuiditas baru "${payload.label}" berhasil ditambahkan!`)
      }

      setShowAccountModal(false)
      setEditingAccount(null)
      await loadAdminData()
    } catch (err) {
      console.error('Error saving account:', err)
      const errorMsg = err.message || 'Gagal menyimpan akun likuiditas.'
      setAccountModalError(errorMsg)
      setError(errorMsg)
    } finally {
      setAccountModalLoading(false)
    }
  }

  const handleDeleteAccount = async (account) => {
    if (account.pos === 'SALDO CASH') {
      return setError('Akun SALDO CASH adalah kas fisik utama kasir dan tidak boleh dihapus.')
    }
    const targetTenantId = activeTenant?.id || profile?.tenant_id
    const hasHistory = Number(account.tx_count || 0) > 0
    if (hasHistory) {
      if (!window.confirm(`Akun "${account.label || account.pos}" sudah memiliki ${account.tx_count} transaksi cashflow sehingga tidak dapat dihapus permanen. Nonaktifkan akun ini?`)) return
      try {
        let q = supabase.from('pos_balances').update({ is_active: false })
        q = account.id ? q.eq('id', account.id) : q.eq('pos', account.pos)
        if (targetTenantId) q = q.eq('tenant_id', targetTenantId)
        const { error: deactErr } = await q
        if (deactErr) throw deactErr
        setSuccess(`Akun "${account.label || account.pos}" dinonaktifkan agar histori transaksi tetap utuh.`)
        await loadAdminData()
      } catch (err) {
        setError(err.message || 'Gagal menonaktifkan akun.')
      }
      return
    }
    if (!window.confirm(`Yakin ingin menghapus akun likuiditas "${account.label || account.pos}"?`)) return
    try {
      let query = supabase.from('pos_balances').delete()
      query = account.id ? query.eq('id', account.id) : query.eq('pos', account.pos)
      if (targetTenantId) query = query.eq('tenant_id', targetTenantId)
      const { error: delErr } = await query
      if (delErr) {
        if (String(delErr.code || '') === '23503' || /23503|foreign key|digunakan/i.test(String(delErr.message || ''))) {
          if (window.confirm(`Akun "${account.label || account.pos}" masih direferensikan histori transaksi. Nonaktifkan akun ini saja?`)) {
            let q = supabase.from('pos_balances').update({ is_active: false })
            q = account.id ? q.eq('id', account.id) : q.eq('pos', account.pos)
            if (targetTenantId) q = q.eq('tenant_id', targetTenantId)
            const { error: deactErr } = await q
            if (deactErr) throw deactErr
            setSuccess(`Akun "${account.label || account.pos}" dinonaktifkan agar histori tetap utuh.`)
            await loadAdminData()
            return
          }
        }
        throw delErr
      }
      setSuccess(`Akun "${account.label || account.pos}" berhasil dihapus.`)
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal menghapus akun.')
    }
  }

  const handleCalibrateBalances = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const targetTenantId = activeTenant?.id || profile?.tenant_id
      const targetBranchId = profile?.branch_id || null
      const inserts = []
      const todayDate = new Date().toLocaleDateString('en-CA')
      const currentTime = new Date().toTimeString().split(' ')[0]
      const currentTimestamp = `${todayDate}T${currentTime}`

      // Gunakan posAccountList dinamis jika ada, dengan fallback ke 4 akun default
      const accountsToCalibrate = posAccountList.length > 0
        ? posAccountList
        : [
            { pos: 'SALDO CASH', label: 'Kas Laci Kasir', balance: balances.cash },
            { pos: 'SALDO REKENING Y', label: 'Rekening Operasional Y', balance: balances.rekY },
            { pos: 'SALDO REKENING N', label: 'Rekening Operasional N', balance: balances.rekN },
            { pos: 'SALDO REKENING R', label: 'Rekening Cadangan R', balance: balances.rekR }
          ]

      for (const acc of accountsToCalibrate) {
        // Cek target value di targetBalances baik dengan pos maupun key singkat
        const valStr = targetBalances[acc.pos] !== undefined
          ? targetBalances[acc.pos]
          : acc.pos === 'SALDO CASH' ? targetBalances.cash
          : acc.pos === 'SALDO REKENING Y' ? targetBalances.rekY
          : acc.pos === 'SALDO REKENING N' ? targetBalances.rekN
          : acc.pos === 'SALDO REKENING R' ? targetBalances.rekR
          : ''

        if (valStr !== '' && valStr !== undefined && valStr !== null) {
          const target = parseFloat(valStr)
          if (!isNaN(target)) {
            const currentBal = parseFloat(acc.current_balance ?? acc.balance ?? 0)
            const diff = target - currentBal
            if (diff !== 0) {
              const insertItem = {
                id_cashflow: self.crypto.randomUUID(),
                tanggal: currentTimestamp,
                jenis: diff > 0 ? 'Pemasukan' : 'Pengeluaran',
                pos: acc.pos,
                ...(acc.id ? { pocket_id: acc.id } : {}),
                pemasukan: diff > 0 ? Math.abs(diff) : 0,
                pengeluaran: diff < 0 ? Math.abs(diff) : 0,
                keterangan_transaksi: `Kalibrasi Saldo ${acc.label || acc.pos} (Penyesuaian Manual Admin)`
              }
              if (targetTenantId) insertItem.tenant_id = targetTenantId
              if (acc.branch_id || targetBranchId) insertItem.branch_id = acc.branch_id || targetBranchId
              inserts.push(insertItem)
            }
          }
        }
      }

      if (inserts.length === 0) {
        setLoading(false)
        return setError('Tidak ada perubahan saldo yang dimasukkan.')
      }

      const { error: insertErr } = await supabase
        .from('cashflow')
        .insert(inserts)

      if (insertErr) throw insertErr

      setSuccess('Kalibrasi saldo berhasil dilakukan!')
      setTargetBalances({ cash: '', rekY: '', rekN: '', rekR: '' })
      await loadAdminData()
    } catch (err) {
      console.error('Error calibrating balances:', err)
      setError(err.message || 'Gagal melakukan kalibrasi saldo.')
    } finally {
      setLoading(false)
    }
  }

  // =========================================================
  // LOGIKA TUTUP KASIR MANUAL / SUSULAN (BACKDATE EOD)
  // =========================================================
  const fetchManualEodPreview = async (targetDate) => {
    if (!targetDate) return
    setManualEodLoading(true)
    try {
      // 1. Ambil struk selesai pada tanggal target beserta rincian cafe & carwash
      const { data: strukData, error: sErr } = await supabase
        .from('struk')
        .select('*, cafe(*), carwash(*)')
        .eq('tanggal', targetDate)
        .eq('status_bayar', 'Selesai')

      if (sErr) throw sErr

      // 2. Ambil pengeluaran kasir pada tanggal target
      const { data: expData, error: eErr } = await supabase
        .from('pengeluaran')
        .select('*')
        .eq('tanggal', targetDate)

      if (eErr) throw eErr

      // 3. Ambil cashflow existing pada tanggal target (mencari entri Tutup Kasir)
      const { data: cfData, error: cfErr } = await supabase
        .from('cashflow')
        .select('*')
        .eq('tanggal', targetDate)

      if (cfErr) throw cfErr

      let cashSum = 0
      let qrisSum = 0
      let cwCash = 0
      let cwQris = 0
      let cfCash = 0
      let cfQris = 0

      ;(strukData || []).forEach(s => {
        let cwTotal = (s.carwash || []).filter(c => c.status !== 'Batal').reduce((acc, c) => acc + (parseFloat(c.harga) || 0), 0)
        let cfTotal = (s.cafe || []).filter(c => c.status !== 'Batal').reduce((acc, c) => acc + (parseFloat(c.subtotal || (c.qty * c.harga_satuan)) || 0), 0)

        if (cwTotal === 0 && cfTotal === 0) {
          const tag = String(s.kategori || s.jenis || '').toLowerCase()
          if (tag.includes('carwash') || tag.includes('cuci')) cwTotal = parseFloat(s.total_tagihan || 0)
          else cfTotal = parseFloat(s.total_tagihan || 0)
        }

        const itemsSum = cwTotal + cfTotal

        if (s.metode_bayar === 'CASH') {
          cashSum += parseFloat(s.total_tagihan || 0)
          cwCash += cwTotal
          cfCash += cfTotal
        } else if (s.metode_bayar === 'QRIS' || s.metode_bayar === 'TRANSFER' || s.metode_bayar === 'DEBIT') {
          qrisSum += parseFloat(s.total_tagihan || 0)
          cwQris += cwTotal
          cfQris += cfTotal
        } else if (s.metode_bayar === 'SPLIT') {
          const cashP = parseFloat(s.nominal_cash || 0)
          const qrisP = parseFloat(s.nominal_qris || 0)
          cashSum += cashP
          qrisSum += qrisP
          const cwR = itemsSum > 0 ? (cwTotal / itemsSum) : 0
          const cfR = itemsSum > 0 ? (cfTotal / itemsSum) : 0
          cwCash += cashP * cwR
          cwQris += qrisP * cwR
          cfCash += cashP * cfR
          cfQris += qrisP * cfR
        } else {
          cashSum += parseFloat(s.total_tagihan || 0)
          cwCash += cwTotal
          cfCash += cfTotal
        }
      })

      const expSum = (expData || []).reduce((acc, item) => acc + (parseFloat(item.nominal) || 0), 0)

      const existingRekap = (cfData || []).filter(c => {
        const ket = String(c.keterangan_transaksi || '').toLowerCase()
        const kat = String(c.kategori || '').toLowerCase()
        const jns = String(c.jenis || '').toLowerCase()
        return ket.includes('rekap tutup kasir') || ket.includes('tutup kasir') || ket.includes('omzet harian') || jns.includes('pemasukan carwash') || jns.includes('pemasukan cafe')
      })

      setManualEodData({
        strukList: strukData || [],
        expenseList: expData || [],
        totalCash: cashSum,
        totalQris: qrisSum,
        carwashCash: cwCash,
        carwashQris: cwQris,
        cafeCash: cfCash,
        cafeQris: cfQris,
        totalExpense: expSum,
        existingCashflows: existingRekap
      })
    } catch (err) {
      console.error('Error fetching manual EOD preview:', err)
    } finally {
      setManualEodLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'manual-eod') {
      fetchManualEodPreview(manualEodDate)
    }
  }, [activeTab, manualEodDate])

  const handleExecuteManualEod = async () => {
    if (manualEodData.totalCash === 0 && manualEodData.totalQris === 0 && manualEodData.totalExpense === 0) {
      return setError(`Tidak ada data transaksi (Omzet/Pengeluaran) pada tanggal ${manualEodDate} untuk dimasukkan ke Cashflow.`)
    }

    if (manualEodData.existingCashflows.length > 0) {
      const confirmDup = await showConfirm(
        `PERINGATAN: Tanggal ${manualEodDate} sudah memiliki ${manualEodData.existingCashflows.length} entri rekap Tutup Kasir di tabel Cashflow.\n\nApakah Anda yakin ingin tetap memasukkan rekap susulan ini?`,
        'Konfirmasi Rekap Susulan'
      )
      if (!confirmDup) return
    } else {
      const confirmAction = await showConfirm(
        `Proses Rekap Tutup Kasir untuk tanggal ${manualEodDate}?\n\n• Pemasukan Carwash: Cash ${formatRupiah(manualEodData.carwashCash || 0)} | QRIS ${formatRupiah(manualEodData.carwashQris || 0)}\n• Pemasukan Cafe: Cash ${formatRupiah(manualEodData.cafeCash || 0)} | QRIS ${formatRupiah(manualEodData.cafeQris || 0)}\n• Total Pemasukan: ${formatRupiah((manualEodData.totalCash || 0) + (manualEodData.totalQris || 0))}\n• Kasir / Petugas: ${manualEodCashier}`,
        'Proses Tutup Kasir Manual'
      )
      if (!confirmAction) return
    }

    setManualEodProcessing(true)
    setError('')
    try {
      const timestamp = new Date().toISOString()
      const insertions = calculateTutupKasirRecap({
        receipts: manualEodData.strukList || [],
        expenses: [], // Pengeluaran kasir sudah tercatat otomatis per transaksi real-time ke cashflow
        cashierName: manualEodCashier,
        todayDate: manualEodDate,
        timestamp
      })

      // Jika user memilih pos QRIS custom
      if (manualEodQrisPos && manualEodQrisPos !== 'SALDO REKENING Y') {
        insertions.forEach(item => {
          if (item.pos === 'SALDO REKENING Y') {
            item.pos = manualEodQrisPos
          }
        })
      }

      if (insertions.length > 0) {
        const { error: insErr } = await supabase.from('cashflow').insert(insertions)
        if (insErr) throw insErr
      }

      setSuccess(`Berhasil memproses Tutup Kasir Manual untuk tanggal ${manualEodDate}! Data telah masuk ke Cashflow sesuai metrik bisnis.`)
      await fetchManualEodPreview(manualEodDate)
      await loadAdminData()
    } catch (err) {
      console.error('Error executing manual EOD:', err)
      setError(err.message || 'Gagal memproses Tutup Kasir Manual.')
    } finally {
      setManualEodProcessing(false)
    }
  }




  return (
    <div className="p-6 pb-24 md:pb-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Settings size={32} className="text-primary" />
          Pengaturan Toko & Admin
        </h1>
        <p className="text-muted text-sm mt-1">Konfigurasi profil toko, printer struk thermal, katalog menu, & kasir/metode bayar</p>
      </div>

      {/* Popups Alert */}
      {success && (
        <div className="p-4 rounded-xl bg-primary-soft border border-success/30 text-primary-soft-foreground text-sm flex items-center gap-3">
          <CheckCircle size={18} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-sm flex items-center gap-3">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="bg-surface border border-border p-1.5 rounded-2xl flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth shrink-0">
        {features.hasMenuCatalog && (
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'menu' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            <Utensils size={14} />
            Menu & Resep
          </button>
        )}
        {features.hasCarwashPackages && (
          <button
            onClick={() => setActiveTab('carwash-packages')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'carwash-packages' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover'
            }`}
          >
            <Sparkles size={14} />
            Paket Cuci
          </button>
        )}
        <button
          onClick={() => setActiveTab('merchandise')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'merchandise' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <ShoppingBag size={14} />
          Merchandise
        </button>
        <button
          onClick={() => setActiveTab('cashier-pay')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'cashier-pay' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <CreditCard size={14} />
          Kasir & Bayar
        </button>
        <button
          onClick={() => setActiveTab('calibration')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'calibration' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <Wallet size={14} />
          Rekening Kas
        </button>
        <button
          onClick={() => setActiveTab('discounts')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'discounts' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <Percent size={14} />
          Diskon/Promo
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'categories' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-muted hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <Tag size={14} />
          Kategori Transaksi
        </button>
        <button
          onClick={() => setActiveTab('manual-eod')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'manual-eod' ? 'bg-warning text-ink-foreground font-bold shadow-sm' : 'text-warning hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <CalendarCheck size={14} />
          Tutup Kasir (EOD)
        </button>
        <button
          onClick={() => setActiveTab('receipt-settings')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'receipt-settings' ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-ring/30' : 'text-primary hover:text-primary hover:bg-surface-hover'
          }`}
        >
          <Printer size={14} />
          Printer & Struk
        </button>
        <button
          onClick={() => setActiveTab('license')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'license' ? 'bg-warning text-ink-foreground font-bold shadow-sm' : 'text-warning hover:text-foreground hover:bg-surface-hover'
          }`}
        >
          <ShieldCheck size={14} />
          Lisensi
        </button>
      </div>

      {/* CONTENT TAB 1: Menu & Resep */}
      {activeTab === 'menu' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-lg font-bold text-foreground">Daftar Menu F&B & Resep Cafe</h3>
              <p className="text-xs text-muted">Kelola katalog makanan, minuman, snack, dan formulasi resep bahan baku (BOM).</p>
            </div>
            <button
              onClick={openAddMenuModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-soft active:scale-[0.98] text-primary-foreground font-bold rounded-lg text-xs self-start sm:self-auto shadow-sm"
            >
              <Plus size={14} />
              Tambah Menu F&B
            </button>
          </div>

          {/* Quick Category Filter Bar */}
          <div className="bg-surface border border-border p-3 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <Tag size={13} className="text-primary" /> Filter Kategori:
              </span>
              <button
                type="button"
                onClick={() => setSelectedMenuCategory('Semua')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition-all ${
                  selectedMenuCategory === 'Semua'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-subsurface border border-border text-muted hover:text-foreground'
                }`}
              >
                <span>Semua</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  selectedMenuCategory === 'Semua' ? 'bg-black/20 text-foreground' : 'bg-subsurface text-primary'
                }`}>
                  {menuItems.length}
                </span>
              </button>
              {Object.entries(activeMenuCategories).map(([cat, count]) => {
                const isSelected = selectedMenuCategory === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedMenuCategory(isSelected ? 'Semua' : cat)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold shrink-0 transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-subsurface border border-border text-muted hover:text-foreground'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? 'bg-black/20 text-foreground' : 'bg-subsurface text-primary'
                    }`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <TableContainer>
              <Table>
                <thead>
                  <tr className="border-b border-border text-muted-dark font-semibold text-xs uppercase tracking-wider">
                    <th className="p-4">Foto & Menu</th>
                    <th className="p-4">Kategori</th>
                    <th className="p-4">Harga</th>
                    <th className="p-4">Bahan Baku Resep</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMenuItems.map((item) => {
                    const menuRecipes = resepList.filter(r =>
                      (isPostgresUuid(item.id) && r.menu_id === item.id) ||
                      (!r.menu_id && r.nama_menu === item.nama_menu)
                    )
                    return (
                      <tr key={item.id || item.id_menu || item.nama_menu} className="hover:bg-surface-hover transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {item.foto_url ? (
                              <img
                                src={item.foto_url}
                                alt={item.nama_menu}
                                className="w-10 h-10 rounded-xl object-cover border border-border shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-subsurface border border-border flex items-center justify-center text-base shrink-0">
                                ☕
                              </div>
                            )}
                            <span className="font-bold text-foreground">{item.nama_menu}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            item.is_bundling ? 'bg-destructive-bg text-destructive' : 'bg-subsurface text-muted'
                          }`}>
                            {item.is_bundling ? 'Promo/Bundling' : item.kategori}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-primary">{formatRupiah(item.harga)}</td>
                        <td className="p-4 text-xs text-muted max-w-xs truncate">
                          {menuRecipes.length > 0 ? (
                            menuRecipes.map((r, i) => (
                              <span key={i} className="block">
                                • {r.nama_bahan} ({r.jumlah_dibutuhkan} {r.satuan})
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-dark font-medium italic">Tidak ada bahan baku</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                            item.is_active ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-subsurface text-muted-dark'
                          }`}>
                            {item.is_active ? 'AKTIF' : 'NONAKTIF'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => openEditMenuModal(item)}
                              className="p-1.5 bg-surface hover:bg-surface-hover text-primary rounded-lg transition-colors"
                              title="Edit Menu & Resep"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteMenu(item)}
                              className="p-1.5 bg-surface hover:bg-surface-hover text-destructive rounded-lg transition-colors"
                              title="Hapus Menu"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </TableContainer>
          </div>
        </div>
      )}

      {/* CONTENT TAB: Paket & Tarif Cuci */}
      {activeTab === 'carwash-packages' && (
        <CarwashPackageManager
          packages={carwashPackages}
          resepList={resepList}
          stokBahan={stokBahan}
          onSavePackage={handleSaveCarwashPackage}
          onDeletePackage={handleDeleteCarwashPackage}
          onToggleActive={handleToggleCarwashPackageActive}
          loading={loading}
        />
      )}

      {/* CONTENT TAB: Merchandise & Retail */}
      {activeTab === 'merchandise' && (
        <MerchandiseManager
          merchandiseList={merchandiseList}
          onSaveMerchandise={handleSaveMerchandise}
          onDeleteMerchandise={handleDeleteMerchandise}
          onToggleActive={handleToggleMerchandiseActive}
          loading={loading}
        />
      )}

      {/* CONTENT TAB 3: Kasir & Metode Bayar */}
      {activeTab === 'cashier-pay' && (
        <div className="space-y-6">
          {/* Banner Edukasi: Pembeda Akun Login Kasir vs Pilihan Nama Kasir POS */}
          <div className="p-4 rounded-2xl bg-primary-soft border border-primary/30 text-foreground flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-primary-soft text-primary-soft-foreground border border-primary/30 shrink-0">
                <Users size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <span>Ingin Membuat Akun Login Kasir (Email & Password)?</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground font-bold">
                    Akun Login Sistem
                  </span>
                </h4>
                <p className="text-xs text-muted leading-relaxed">
                  Untuk mendaftarkan akun kasir resmi yang memiliki <strong>Email & Kata Sandi Login</strong>, buat akun melalui modul Karyawan.
                  Kolom daftar kasir di bawah ini difungsikan khusus untuk memilih nama kasir yang aktif bertugas saat mencetak struk transaksi.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/karyawan?tab=staff')}
              className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs flex items-center gap-2 transition cursor-pointer shrink-0 shadow-md"
            >
              <span>+ Daftarkan Akun Login Kasir</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Kelola Nama Kasir */}
            <div className="bg-surface border border-border p-5 rounded-2xl space-y-4">
              <div>
                <h3 className="text-base font-bold text-foreground">Daftar Pilihan Nama Kasir (POS)</h3>
                <p className="text-[11px] text-muted-dark">Pilihan nama kasir yang bertugas saat transaksi & cetak struk</p>
              </div>
              
              <form onSubmit={handleAddCashier} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Tambah nama kasir (misal: RISA)"
                  value={newCashier}
                  onChange={(e) => setNewCashier(e.target.value)}
                  className="flex-1 bg-subsurface border border-border rounded-lg px-3 py-1.5 text-foreground text-xs uppercase focus:outline-none focus:border-ring"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg text-xs hover:bg-primary-hover cursor-pointer"
                >
                  + Tambah
                </button>
              </form>

            <div className="divide-y divide-border pt-2">
              {cashiers.map(c => (
                <div key={c.id || c.nama} className="flex justify-between items-center py-2.5">
                  <span className="text-sm font-bold text-foreground">{c.nama}</span>
                  <button
                    onClick={() => toggleCashierActive(c, c.is_active)}
                    className={`text-[10px] px-3 py-1 rounded font-bold border transition-colors ${
                      c.is_active 
                        ? 'bg-primary-soft text-primary-soft-foreground border-success/30' 
                        : 'bg-subsurface text-muted-dark border-border'
                    }`}
                  >
                    {c.is_active ? '✓ AKTIF' : 'NONAKTIF'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Kelola Metode Pembayaran */}
          <div className="bg-surface border border-border p-5 rounded-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Daftar Pilihan Metode Bayar</h3>
            
            <form onSubmit={handleAddPayment} className="flex gap-2">
              <input
                type="text"
                placeholder="Tambah metode bayar (misal: SHOPEEPAY)"
                value={newPayment}
                onChange={(e) => setNewPayment(e.target.value)}
                className="flex-1 bg-subsurface border border-border rounded-lg px-3 py-1.5 text-foreground text-xs uppercase focus:outline-none focus:border-ring"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg text-xs"
              >
                + Tambah
              </button>
            </form>

            <div className="divide-y divide-border pt-2">
              {paymentMethods.map(p => (
                <div key={p.nama} className="flex justify-between items-center py-2.5">
                  <span className="text-sm font-bold text-foreground">{p.nama}</span>
                  <button
                    onClick={() => togglePaymentActive(p.nama, p.is_active)}
                    className={`text-[10px] px-3 py-1 rounded font-bold border transition-colors ${
                      p.is_active 
                        ? 'bg-primary-soft text-primary-soft-foreground border-success/30' 
                        : 'bg-subsurface text-muted-dark border-border'
                    }`}
                  >
                    {p.is_active ? '✓ AKTIF' : 'NONAKTIF'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}



      {/* CONTENT TAB 5: Rekening & Saldo Likuiditas */}
      {activeTab === 'calibration' && (
        <div className="space-y-6">
          {/* Section 1: Master Rekening & Akun Likuiditas */}
          <div className="bg-surface border border-border p-6 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Wallet className="text-primary" size={20} />
                  <span>Master Rekening & Akun Likuiditas (Kas & Bank)</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Atur daftar kas fisik dan rekening bank yang dipantau di dashboard eksekutif dan laporan keuangan.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBankEmailPocketId('')
                    setShowBankEmailModal(true)
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-subsurface hover:bg-surface-hover active:scale-[0.98] text-primary border border-primary/30 font-bold rounded-xl text-xs transition-all"
                >
                  <Mail size={14} />
                  Integrasi Email Bank
                </button>
                <button
                  onClick={handleOpenAddAccount}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover active:bg-primary-hover text-primary-foreground font-bold rounded-xl text-xs transition-all shadow-md shadow-sm"
                >
                  <Plus size={15} />
                  Tambah Akun Rekening / Kas
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {posAccountList.map((acc, idx) => {
                const colorBorder = acc.color === 'emerald' ? 'border-success/30'
                  : acc.color === 'blue' ? 'border-primary/30'
                  : acc.color === 'cyan' ? 'border-primary/30'
                  : acc.color === 'purple' ? 'border-primary/30'
                  : 'border-warning/30'
                const colorText = acc.color === 'emerald' ? 'text-success'
                  : acc.color === 'blue' ? 'text-primary'
                  : acc.color === 'cyan' ? 'text-primary'
                  : acc.color === 'purple' ? 'text-primary'
                  : 'text-warning'

                const isProtected = acc.pos === 'SALDO CASH'

                return (
                  <div key={acc.pos || idx} className={`p-4 rounded-xl bg-subsurface border ${colorBorder} flex flex-col justify-between space-y-3 transition-all hover:bg-surface-hover`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${
                            acc.tipe === 'CASH' ? 'bg-success-bg text-success border-success/30' : 'bg-primary-soft text-primary-soft-foreground border-primary/30'
                          }`}>
                            {acc.tipe || (acc.pos === 'SALDO CASH' ? 'CASH' : 'BANK')}
                          </span>
                          <span className="text-[10px] text-muted-dark font-mono">{acc.pos}</span>
                        </div>
                        <h4 className="font-bold text-foreground text-sm mt-1.5">{acc.label || acc.pos}</h4>
                        <p className="text-[11px] text-muted mt-0.5">{acc.keterangan || (acc.pos === 'SALDO CASH' ? 'Uang fisik di kasir' : 'Rekening bank operasional')}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isProtected && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBankEmailPocketId(acc.id || '')
                              setShowBankEmailModal(true)
                            }}
                            className="p-1.5 rounded-lg bg-primary-soft hover:bg-primary-soft text-primary-soft-foreground transition-all active:scale-[0.98]"
                            title="Integrasi Email Notifikasi Bank Mandiri"
                          >
                            <Mail size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditAccount(acc)}
                          className="p-1.5 rounded-lg bg-subsurface hover:bg-surface-hover text-foreground hover:text-foreground transition-all"
                          title="Edit Akun"
                        >
                          <Edit3 size={13} />
                        </button>
                        {!isProtected && (
                          <button
                            onClick={() => handleDeleteAccount(acc)}
                            className="p-1.5 rounded-lg bg-destructive-bg hover:bg-destructive-bg text-destructive transition-all"
                            title="Hapus Akun"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border flex justify-between items-center">
                      <span className="text-[10px] text-muted-dark uppercase font-bold">
                        Saldo Buku ERPPoss{acc.is_active === false ? ' (Nonaktif)' : ''}
                      </span>
                      <span className={`font-mono tabular-nums font-black text-base ${colorText}`}>
                        {formatRupiah(balances[acc.pos] ?? acc.current_balance ?? acc.balance ?? 0)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2: Form Sinkronisasi & Kalibrasi Saldo */}
          <div className="bg-surface border border-border p-6 rounded-2xl max-w-2xl mx-auto space-y-6">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Settings className="text-primary" size={20} />
                <span>Sinkronisasi & Kalibrasi Saldo Fisik</span>
              </h3>
              <p className="text-xs text-muted mt-1">
                Gunakan form ini untuk menyinkronkan saldo berjalan di aplikasi dengan saldo riil fisik Anda (kas laci atau mutasi bank). Sistem akan otomatis mencatat penyesuaian cashflow.
              </p>
            </div>

            <form onSubmit={handleCalibrateBalances} className="space-y-4">
              <div className="space-y-3">
                {posAccountList.map((acc, idx) => {
                  const currentVal = balances[acc.pos] ?? acc.balance ?? 0
                  const inputVal = targetBalances[acc.pos] !== undefined
                    ? targetBalances[acc.pos]
                    : acc.pos === 'SALDO CASH' ? targetBalances.cash
                    : acc.pos === 'SALDO REKENING Y' ? targetBalances.rekY
                    : acc.pos === 'SALDO REKENING N' ? targetBalances.rekN
                    : acc.pos === 'SALDO REKENING R' ? targetBalances.rekR
                    : ''

                  return (
                    <div key={acc.pos || idx} className="p-3.5 rounded-xl bg-subsurface border border-border space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-foreground">
                          {acc.label || acc.pos} <span className="text-[10px] text-muted-dark font-mono">({acc.pos})</span>
                        </span>
                        <span className="font-bold text-primary">
                          Berjalan: {formatRupiah(currentVal)}
                        </span>
                      </div>
                      <input
                        type="number"
                        placeholder={`Masukkan target saldo baru (cth: ${Math.round(currentVal)})`}
                        value={inputVal}
                        onChange={(e) => {
                          const val = e.target.value
                          setTargetBalances(prev => ({
                            ...prev,
                            [acc.pos]: val,
                            ...(acc.pos === 'SALDO CASH' ? { cash: val } : {}),
                            ...(acc.pos === 'SALDO REKENING Y' ? { rekY: val } : {}),
                            ...(acc.pos === 'SALDO REKENING N' ? { rekN: val } : {}),
                            ...(acc.pos === 'SALDO REKENING R' ? { rekR: val } : {})
                          }))
                        }}
                        className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm focus:outline-none focus:border-ring"
                      />
                    </div>
                  )
                })}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-primary hover:bg-primary-soft active:scale-[0.98] disabled:opacity-50 text-primary-foreground font-bold rounded-xl shadow-lg shadow-sm transition-all text-sm mt-3"
              >
                {loading ? 'Menyimpan Kalibrasi...' : 'Simpan & Sesuaikan Seluruh Saldo'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CONTENT TAB 6: Kelola Diskon */}
      {activeTab === 'discounts' && (
        <div className="space-y-6">
          <div className="bg-surface border border-border p-6 rounded-2xl max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Form Tambah Diskon Baru */}
            <div className="md:col-span-1 space-y-4">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Plus className="text-primary" size={18} />
                  <span>Tambah Diskon</span>
                </h3>
                <p className="text-[10px] text-muted-dark mt-0.5">Daftarkan promo atau diskon baru untuk digunakan di kasir.</p>
              </div>

              <form onSubmit={handleSaveDiscount} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase tracking-wider block">Nama Diskon / Promo</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PROMO MEMBER"
                    value={discountForm.nama}
                    onChange={(e) => setDiscountForm(prev => ({ ...prev, nama: e.target.value }))}
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-xs uppercase focus:outline-none focus:border-ring"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase tracking-wider block">Tipe Potongan</label>
                  <CustomSelect
                    value={discountForm.tipe}
                    onChange={(val) => setDiscountForm(prev => ({ ...prev, tipe: val }))}
                    options={[
                      { value: 'Rupiah', label: 'Nominal Rupiah (Rp)' },
                      { value: 'Persen', label: 'Persentase (%)' }
                    ]}
                    size="sm"
                    variant="blue"
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase tracking-wider block">
                    {discountForm.tipe === 'Persen' ? 'Besar Persen (%)' : 'Besar Potongan (Rp)'}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={discountForm.tipe === 'Persen' ? '100' : undefined}
                    placeholder={discountForm.tipe === 'Persen' ? 'Contoh: 10' : 'Contoh: 5000'}
                    value={discountForm.nominal || ''}
                    onChange={(e) => setDiscountForm(prev => ({ ...prev, nominal: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-xs focus:outline-none focus:border-ring"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase tracking-wider block">Kategori Berlaku</label>
                  <CustomSelect
                    value={discountForm.kategori}
                    onChange={(val) => setDiscountForm(prev => ({ ...prev, kategori: val }))}
                    options={[
                      { value: 'Carwash', label: 'Hanya Carwash' },
                      { value: 'Cafe', label: 'Hanya Cafe' },
                      { value: 'Semua', label: 'Semua (Carwash & Cafe)' }
                    ]}
                    size="sm"
                    variant="blue"
                    className="w-full"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 bg-primary hover:bg-primary-hover active:bg-primary-hover disabled:opacity-50 text-primary-foreground font-bold rounded-lg transition-all text-xs"
                >
                  {loading ? 'Menyimpan...' : 'Simpan Promo'}
                </button>
              </form>
            </div>

            {/* List Diskon Terdaftar */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Percent className="text-primary" size={18} />
                  <span>Daftar Diskon Terdaftar</span>
                </h3>
                <p className="text-[10px] text-muted-dark mt-0.5">Daftar promo aktif yang dapat dipilih oleh kasir.</p>
              </div>

              <div className="bg-subsurface border border-border rounded-xl overflow-hidden divide-y divide-border">
                {discounts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-dark">Belum ada promo/diskon yang didaftarkan.</div>
                ) : (
                  discounts.map((d) => (
                    <div key={d.id_diskon} className="p-3.5 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-extrabold text-foreground uppercase tracking-wide flex items-center gap-2">
                          <span>{d.nama}</span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-mono bg-surface text-muted">
                            {d.kategori === 'Semua' ? 'Cafe & Carwash' : d.kategori}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-dark mt-1">
                          Tipe: {d.tipe === 'Persen' ? 'Persentase' : 'Rupiah'}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono font-black text-primary text-sm">
                          {d.tipe === 'Persen' ? `${d.nominal}%` : formatRupiah(d.nominal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteDiscount(d.id_diskon, d.nama)}
                          className="text-destructive hover:text-destructive p-1 bg-subsurface border border-border rounded-lg"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* CONTENT TAB 6.5: Kategori & Akun Kasir (Master Jenis & Kategori Terkunci) */}
      {activeTab === 'categories' && (
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div>
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Lock className="text-primary" size={20} />
                <span>Master Jenis & Kategori Terkunci (Cashflow & COA)</span>
              </h3>
              <p className="text-xs text-muted mt-1 max-w-2xl">
                Kunci kategori pengeluaran dan pemasukan per jenisnya (contoh: jenis Cafe hanya berisi kategori F&B dan tidak dapat memilih Chemical Carwash). Atur juga hak akses kasir dan pemetaan akun buku besar (COA).
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCategory(null)
                setIsCustomCategoryJenis(false)
                setCategoryForm({
                  nama_kategori: '',
                  jenis: categoryFilterJenis !== 'all' ? categoryFilterJenis : 'Pengeluaran Cafe',
                  tipe_arus: 'PENGELUARAN',
                  account_id: 'acc_6004',
                  boleh_kasir: false,
                  is_active: true,
                })
                setShowCategoryModal(true)
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-soft active:scale-[0.98] text-primary-foreground font-bold rounded-xl text-xs shadow-lg shadow-sm transition-all"
            >
              <Plus size={14} />
              Tambah Kategori Baru
            </button>
          </div>

          {/* Filter Pills per Kelompok / Jenis Terkunci */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setCategoryFilterJenis('all')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                categoryFilterJenis === 'all'
                  ? 'bg-primary text-primary-foreground shadow-md shadow-sm'
                  : 'bg-subsurface text-muted hover:text-foreground border border-border'
              }`}
            >
              Semua Jenis ({masterCategories.length})
            </button>
            {availableCategoryJenisList.map((j) => {
              const count = masterCategories.filter(c => String(c.jenis || '').toLowerCase() === j.toLowerCase()).length
              const isActive = categoryFilterJenis.toLowerCase() === j.toLowerCase()
              return (
                <button
                  key={j}
                  onClick={() => setCategoryFilterJenis(j)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-md shadow-sm'
                      : 'bg-subsurface text-muted hover:text-foreground border border-border'
                  }`}
                >
                  <span>{j}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? 'bg-subsurface text-foreground' : 'bg-subsurface text-muted'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Table of Categories */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <TableContainer>
              <Table dense>
                <thead>
                  <tr className="border-b border-border bg-subsurface text-muted font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Nama Kategori</th>
                    <th className="py-3 px-4">Jenis Terkunci</th>
                    <th className="py-3 px-4">Tipe Arus</th>
                    <th className="py-3 px-4">Akun Buku Besar (COA)</th>
                    <th className="py-3 px-4 text-center">Akses Kasir</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMasterCategories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-dark">
                        <Tag size={32} className="mx-auto text-muted-dark mb-2 opacity-50" />
                        <p className="font-semibold text-muted">Belum ada kategori untuk jenis ini ({categoryFilterJenis}).</p>
                        <button
                          onClick={() => {
                            setEditingCategory(null)
                            setIsCustomCategoryJenis(false)
                            setCategoryForm({
                              nama_kategori: '',
                              jenis: categoryFilterJenis !== 'all' ? categoryFilterJenis : 'Pengeluaran Cafe',
                              tipe_arus: 'PENGELUARAN',
                              account_id: 'acc_6004',
                              boleh_kasir: false,
                              is_active: true,
                            })
                            setShowCategoryModal(true)
                          }}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-soft text-primary-soft-foreground border border-success/30 rounded-xl font-bold text-xs"
                        >
                          <Plus size={13} />
                          Tambah Kategori Sekarang
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredMasterCategories.map((cat) => {
                      const isCafe = String(cat.jenis || '').toLowerCase().includes('cafe')
                      const isCarwash = String(cat.jenis || '').toLowerCase().includes('carwash')
                      const isBersama = String(cat.jenis || '').toLowerCase().includes('bersama')
                      const isCasbon = String(cat.jenis || '').toLowerCase().includes('casbon')

                      return (
                        <tr key={cat.id} className="hover:bg-surface-hover transition-colors">
                          <td className="py-3 px-4 font-bold text-foreground">
                            <div className="flex items-center gap-2">
                              <span>{cat.nama_kategori}</span>
                              {cat.is_active === false && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-destructive-bg text-destructive">Nonaktif</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                              isCafe ? 'bg-warning-bg text-warning border border-warning/30' :
                              isCarwash ? 'bg-primary-soft text-primary-soft-foreground border border-primary/30' :
                              isBersama ? 'bg-primary-soft text-primary-soft-foreground border border-primary/30' :
                              isCasbon ? 'bg-destructive-bg text-destructive border border-destructive/30' :
                              'bg-subsurface text-foreground border border-border'
                            }`}>
                              <Lock size={10} />
                              {cat.jenis}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              cat.tipe_arus === 'PEMASUKAN' ? 'bg-success-bg text-success' : 'bg-destructive-bg text-destructive'
                            }`}>
                              {cat.tipe_arus}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-foreground">
                            {cat.account_id || 'acc_6004'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {cat.boleh_kasir ? (
                              <span className="px-2 py-0.5 rounded-full bg-success-bg text-success border border-success/30 font-bold text-[10px]">
                                Kasir Boleh
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-subsurface text-muted font-bold text-[10px]">
                                Hanya Owner
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingCategory(cat)
                                  setIsCustomCategoryJenis(!availableCategoryJenisList.some(j => j.toLowerCase() === (cat.jenis || '').toLowerCase()))
                                  setCategoryForm({
                                    nama_kategori: cat.nama_kategori,
                                    jenis: cat.jenis,
                                    tipe_arus: cat.tipe_arus,
                                    account_id: cat.account_id || 'acc_6004',
                                    boleh_kasir: !!cat.boleh_kasir,
                                    is_active: cat.is_active !== false,
                                  })
                                  setShowCategoryModal(true)
                                }}
                                className="p-1.5 rounded-lg bg-subsurface text-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                                title="Edit Kategori"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(cat)}
                                className="p-1.5 rounded-lg bg-destructive-bg text-destructive hover:bg-destructive-bg transition-colors"
                                title="Hapus Kategori"
                              >
                                <Trash2 size={13} />
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
          </div>
        </div>
      )}

      {/* CONTENT TAB 7: Tutup Kasir Manual (Susulan EOD) */}
      {activeTab === 'manual-eod' && (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* Header Panel */}
          <div className="bg-surface border border-border p-6 rounded-2xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <CalendarCheck className="text-warning" size={20} />
                  <span>Tutup Kasir Manual (Rekap Susulan ke Cashflow)</span>
                </h3>
                <p className="text-xs text-muted mt-1">
                  Fitur darurat untuk merekap omzet (Cash & QRIS) serta pengeluaran harian kasir pada tanggal tertentu yang terlewat atau belum sempat di-End Kasir.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchManualEodPreview(manualEodDate)}
                  disabled={manualEodLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-subsurface hover:bg-surface-hover text-foreground rounded-lg text-xs font-semibold border border-border transition-colors"
                >
                  <RotateCcw size={13} className={manualEodLoading ? 'animate-spin' : ''} />
                  Segarkan Data
                </button>
              </div>
            </div>

            {/* Input Controls Filter Tanggal & Kasir */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  1. Pilih Tanggal Transaksi
                </label>
                <input
                  type="date"
                  value={manualEodDate}
                  onChange={(e) => setManualEodDate(e.target.value)}
                  className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm font-mono focus:border-ring focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  2. Kasir / Petugas Rekap
                </label>
                <CustomSelect
                  value={manualEodCashier}
                  onChange={(val) => setManualEodCashier(val)}
                  options={[
                    { value: 'Admin / Manual', label: 'Admin / Manual (Owner)' },
                    ...cashiers.map(c => ({ value: c.nama_kasir, label: `Kasir: ${c.nama_kasir}` }))
                  ]}
                  size="md"
                  variant="amber"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  3. Rekening Penampung QRIS
                </label>
                <CustomSelect
                  value={manualEodQrisPos}
                  onChange={(val) => setManualEodQrisPos(val)}
                  options={[
                    { value: 'SALDO REKENING Y', label: 'SALDO REKENING Y (Mandiri Utama)' },
                    { value: 'SALDO REKENING N', label: 'SALDO REKENING N (Mandiri Ops)' },
                    { value: 'SALDO REKENING R', label: 'SALDO REKENING R (Cadangan)' }
                  ]}
                  size="md"
                  variant="amber"
                  className="w-full"
                />
              </div>
            </div>

            {/* Status Rekap di Cashflow */}
            <div className="pt-2">
              {manualEodData.existingCashflows.length === 0 ? (
                <div className="p-3 rounded-xl bg-success-bg border border-success/30 text-success text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} />
                    <span><strong>Status: Belum Ada Rekap di Cashflow</strong> — Data omzet & pengeluaran untuk tanggal <strong>{manualEodDate}</strong> aman untuk dimasukkan.</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-success-bg text-success">Siap Proses</span>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-warning-bg border border-warning/30 text-warning text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertCircle size={16} className="text-warning shrink-0" />
                      <span>Perhatian: Tanggal {manualEodDate} sudah memiliki {manualEodData.existingCashflows.length} transaksi rekap di Cashflow!</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-warning-bg text-warning">Sudah Ada Rekap</span>
                  </div>
                  <div className="pl-6 text-[11px] text-warning space-y-1">
                    {manualEodData.existingCashflows.map((cf, idx) => (
                      <div key={cf.id_cashflow || idx} className="flex justify-between border-b border-warning/30 pb-1">
                        <span>• {cf.keterangan_transaksi} ({cf.pos})</span>
                        <strong className="font-mono">
                          {cf.pemasukan > 0 ? `+${formatRupiah(cf.pemasukan)}` : `-${formatRupiah(cf.pengeluaran)}`}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-border p-4.5 rounded-2xl">
              <span className="text-muted-dark text-[10px] font-bold uppercase tracking-wider block">Pemasukan Cash (Omzet Tunai)</span>
              <h3 className="text-xl font-black text-primary mt-1">{formatRupiah(manualEodData.totalCash)}</h3>
              <span className="text-[10px] text-muted-dark mt-1 block">Tujuan: SALDO CASH</span>
            </div>

            <div className="bg-surface border border-border p-4.5 rounded-2xl">
              <span className="text-muted-dark text-[10px] font-bold uppercase tracking-wider block">Pemasukan QRIS / Transfer</span>
              <h3 className="text-xl font-black text-primary mt-1">{formatRupiah(manualEodData.totalQris)}</h3>
              <span className="text-[10px] text-muted-dark mt-1 block truncate">Tujuan: {manualEodQrisPos}</span>
            </div>

            <div className="bg-surface border border-border p-4.5 rounded-2xl">
              <span className="text-muted-dark text-[10px] font-bold uppercase tracking-wider block">Pengeluaran Kasir</span>
              <h3 className="text-xl font-black text-destructive mt-1">{formatRupiah(manualEodData.totalExpense)}</h3>
              <span className="text-[10px] text-muted-dark mt-1 block">Sumber: SALDO CASH</span>
            </div>

            <div className="bg-surface border border-border p-4.5 rounded-2xl">
              <span className="text-muted-dark text-[10px] font-bold uppercase tracking-wider block">Estimasi Kas Bersih Hari Ini</span>
              <h3 className="text-xl font-black text-foreground mt-1">
                {formatRupiah(manualEodData.totalCash + manualEodData.totalQris - manualEodData.totalExpense)}
              </h3>
              <span className="text-[10px] text-muted-dark mt-1 block">Total Omzet - Beban Kasir</span>
            </div>
          </div>

          {/* Breakdown Tables (Struk Selesai & Pengeluaran Kasir) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Table 1: Struk Selesai */}
            <div className="bg-surface border border-border p-5 rounded-2xl space-y-3">
              <div className="flex justify-between items-center border-b border-border pb-2.5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-primary" />
                  Struk Transaksi Lunas ({manualEodData.strukList.length})
                </h4>
                <span className="text-xs font-mono font-bold text-success">
                  Total: {formatRupiah(manualEodData.totalCash + manualEodData.totalQris)}
                </span>
              </div>

              <div className="overflow-x-auto max-h-60 overflow-y-auto pr-1">
                {manualEodData.strukList.length === 0 ? (
                  <p className="text-xs text-muted-dark py-6 text-center">Tidak ada struk lunas pada tanggal {manualEodDate}</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-muted-dark font-bold border-b border-border text-[10px] uppercase">
                        <th className="py-2">No. Struk</th>
                        <th className="py-2">Metode</th>
                        <th className="py-2 text-right">Tagihan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-foreground">
                      {manualEodData.strukList.map(s => (
                        <tr key={s.id_struk} className="hover:bg-surface-hover">
                          <td className="py-2 font-mono text-[11px] text-muted">{s.id_struk}</td>
                          <td className="py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              s.metode_bayar === 'CASH' ? 'bg-success-bg text-success' : 'bg-primary-soft text-primary-soft-foreground'
                            }`}>
                              {s.metode_bayar}
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-foreground">
                            {formatRupiah(s.total_tagihan)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Table 2: Pengeluaran Kasir */}
            <div className="bg-surface border border-border p-5 rounded-2xl space-y-3">
              <div className="flex justify-between items-center border-b border-border pb-2.5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowDownRight size={14} className="text-destructive" />
                  Pengeluaran Kasir ({manualEodData.expenseList.length})
                </h4>
                <span className="text-xs font-mono font-bold text-destructive">
                  Total: {formatRupiah(manualEodData.totalExpense)}
                </span>
              </div>

              <div className="overflow-x-auto max-h-60 overflow-y-auto pr-1">
                {manualEodData.expenseList.length === 0 ? (
                  <p className="text-xs text-muted-dark py-6 text-center">Tidak ada pengeluaran kasir pada tanggal {manualEodDate}</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-muted-dark font-bold border-b border-border text-[10px] uppercase">
                        <th className="py-2">Keterangan</th>
                        <th className="py-2">Kategori</th>
                        <th className="py-2 text-right">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-foreground">
                      {manualEodData.expenseList.map(e => (
                        <tr key={e.id_pengeluaran || e.id} className="hover:bg-surface-hover">
                          <td className="py-2 text-foreground font-medium">{e.nama_pengeluaran || e.keterangan}</td>
                          <td className="py-2 text-muted text-[11px]">{e.kategori || 'Operasional'}</td>
                          <td className="py-2 text-right font-mono font-bold text-destructive">
                            -{formatRupiah(e.nominal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Action Submission Button */}
          <div className="bg-surface border border-border p-6 rounded-2xl border-warning/30 bg-warning-bg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-foreground">Siap Memasukkan Rekap ke Cashflow?</h4>
              <p className="text-xs text-muted mt-0.5">
                Sistem akan membuat 3 entri akuntansi (Omzet Cash, Omzet QRIS, dan Pengeluaran) pada tanggal <strong>{manualEodDate}</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExecuteManualEod}
              disabled={manualEodProcessing || (manualEodData.totalCash === 0 && manualEodData.totalQris === 0 && manualEodData.totalExpense === 0)}
              className="w-full sm:w-auto px-6 py-3 bg-warning hover:opacity-90 active:bg-amber-500 disabled:opacity-50 text-ink-foreground font-black rounded-xl shadow-lg shadow-sm transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              {manualEodProcessing ? (
                <>
                  <RotateCcw size={16} className="animate-spin" />
                  <span>Memproses Rekap...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Proses & Masukkan ke Cashflow</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* CONTENT TAB 8: Kustomisasi Teks & Format Struk Kasir Thermal */}
      {activeTab === 'receipt-settings' && (
        <ReceiptCustomizer />
      )}

      {/* CONTENT TAB 9: Status Lisensi & Langganan Software */}
      {activeTab === 'license' && (
        <LicenseManager
          licenseData={licenseData}
          storeName={getReceiptConfig()?.storeName || 'Outlet Carwash & Cafe'}
          onActivateKey={handleActivateLicenseKey}
        />
      )}

      {/* MODAL MASTER KATEGORI CASHFLOW (KUNCI KATEGORI KE JENIS) */}
      {showCategoryModal && (
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 bg-[var(--overlay-backdrop)] backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-surface border border-border w-full max-w-lg p-6 rounded-2xl shadow-2xl bg-subsurface text-foreground animate-pop-in">
            <div className="flex justify-between items-center border-b border-border pb-3 mb-4">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Lock className="text-primary" size={18} />
                <span>{editingCategory ? 'Edit Kategori Terkunci' : 'Tambah Kategori Terkunci Baru'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {categoryModalError && (
              <div className="p-3 mb-4 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{categoryModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Nama Kategori
                </label>
                <input
                  type="text"
                  placeholder="Misal: Bahan Baku F&B, Chemical Snow Wash, Listrik Cafe, Sewa..."
                  value={categoryForm.nama_kategori}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, nama_kategori: e.target.value }))}
                  className="w-full bg-subsurface border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Tipe Arus
                  </label>
                  <CustomSelect
                    value={categoryForm.tipe_arus}
                    onChange={(val) => setCategoryForm(prev => ({ ...prev, tipe_arus: val }))}
                    options={[
                      { value: 'PENGELUARAN', label: 'PENGELUARAN (BEBAN / MUTASI)' },
                      { value: 'PEMASUKAN', label: 'PEMASUKAN (NON-POS / LAIN)' }
                    ]}
                    size="md"
                    variant="emerald"
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider">
                      Jenis Pengunci (Kelompok)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomCategoryJenis(!isCustomCategoryJenis)}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      {isCustomCategoryJenis ? '← Pilihan List' : '+ Custom Jenis'}
                    </button>
                  </div>
                  {isCustomCategoryJenis ? (
                    <input
                      type="text"
                      placeholder="Ketik nama jenis baru..."
                      value={categoryForm.jenis}
                      onChange={(e) => setCategoryForm(prev => ({ ...prev, jenis: e.target.value }))}
                      className="w-full bg-subsurface border border-success/30 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none"
                      autoFocus
                      required
                    />
                  ) : (
                    <CustomSelect
                      value={categoryForm.jenis}
                      onChange={(val) => setCategoryForm(prev => ({ ...prev, jenis: val }))}
                      options={availableCategoryJenisList.map(j => ({ value: j, label: j }))}
                      size="md"
                      variant="emerald"
                      className="w-full"
                    />
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-primary-soft border border-success/30 text-xs text-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-primary">
                  <Lock size={13} />
                  <span>Proteksi Kategori Terkunci:</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  Kategori <strong>"{categoryForm.nama_kategori || '...'}"</strong> hanya akan muncul ketika pengguna memilih jenis <strong>"{categoryForm.jenis}"</strong> di form input.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Akun Buku Besar (COA Akuntansi)
                </label>
                <CustomSelect
                  value={categoryForm.account_id}
                  onChange={(val) => setCategoryForm(prev => ({ ...prev, account_id: val }))}
                  options={[
                    { value: 'acc_5001', label: '[5001] HPP - Bahan Baku F&B Cafe' },
                    { value: 'acc_5002', label: '[5002] HPP - Shampoo & Chemical Carwash' },
                    { value: 'acc_6001', label: '[6001] Beban Komisi & Upah Cuci Mobil / Gaji' },
                    { value: 'acc_6002', label: '[6002] Beban Listrik, Air & Utilitas' },
                    { value: 'acc_6003', label: '[6003] Beban Perawatan & Servis Mesin' },
                    { value: 'acc_6004', label: '[6004] Beban Operasional Umum & Perlengkapan' },
                    { value: 'acc_1300', label: '[1300] Persediaan Bahan Baku & Stok' },
                    { value: 'acc_1002', label: '[1002] Kas Bank / QRIS Settlement' },
                    { value: 'acc_2001', label: '[2001] Hutang Usaha (AP Supplier)' },
                    { value: 'acc_3001', label: '[3001] Modal Disetor Pemilik' },
                    { value: 'acc_3002', label: '[3002] Prive / Penarikan Laba Owner' },
                    { value: 'acc_4003', label: '[4003] Pendapatan Sewa Tenant / Kemitraan' }
                  ]}
                  searchable={true}
                  size="md"
                  variant="emerald"
                  className="w-full font-mono"
                />
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-subsurface border border-border">
                <input
                  type="checkbox"
                  id="chk_boleh_kasir"
                  checked={categoryForm.boleh_kasir}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, boleh_kasir: e.target.checked }))}
                  className="w-4 h-4 text-primary rounded border-border bg-subsurface focus:ring-0 cursor-pointer"
                />
                <label htmlFor="chk_boleh_kasir" className="text-xs text-foreground select-none cursor-pointer">
                  <strong className="block text-foreground font-semibold">Izinkan Kasir Mencatat Kategori Ini di POS</strong>
                  Beri centang jika kasir diperbolehkan mencatat biaya belanja laci kasir untuk kategori ini.
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-xl bg-subsurface hover:bg-surface-hover text-foreground font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={categoryModalLoading || loading}
                  className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-soft active:scale-[0.98] text-primary-foreground font-black text-xs shadow-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {categoryModalLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    'Simpan Kategori'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MASTER AKUN LIKUIDITAS (KAS & BANK) */}
      {showAccountModal && (
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 bg-[var(--overlay-backdrop)] backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-surface border border-border w-full max-w-lg p-6 rounded-2xl shadow-2xl bg-subsurface text-foreground">
            <div className="flex justify-between items-center border-b border-border pb-3 mb-4">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Wallet className="text-primary" size={18} />
                <span>{editingAccount ? 'Edit Akun Likuiditas' : 'Tambah Akun Kas / Bank Baru'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {accountModalError && (
              <div className="p-3 mb-4 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{accountModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Kode / Nama Pos Akun
                </label>
                <input
                  type="text"
                  placeholder="Misal: SALDO REKENING BCA atau BCA OPERASIONAL"
                  value={accountForm.pos}
                  onChange={(e) => setAccountForm(prev => ({ ...prev, pos: e.target.value }))}
                  disabled={!!editingAccount && editingAccount.pos === 'SALDO CASH'}
                  className="w-full bg-subsurface border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring disabled:opacity-50"
                  required
                />
                <p className="text-[10px] text-muted-dark mt-1">Kode unik yang dicatat di tabel mutasi cashflow.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Label Tampilan di Dashboard
                </label>
                <input
                  type="text"
                  placeholder="Misal: BCA Operasional Utama, Kasir Laci, Tabungan Owner"
                  value={accountForm.label}
                  onChange={(e) => setAccountForm(prev => ({ ...prev, label: e.target.value }))}
                  className="w-full bg-subsurface border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Tipe Akun
                  </label>
                  <CustomSelect
                    value={accountForm.tipe}
                    onChange={(val) => setAccountForm(prev => ({ ...prev, tipe: val }))}
                    disabled={!!editingAccount && editingAccount.pos === 'SALDO CASH'}
                    options={[
                      { value: 'BANK', label: 'Bank Transfer' },
                      { value: 'CASH', label: 'Kas Tunai (Fisik)' },
                      { value: 'QRIS', label: 'E-Wallet / QRIS' },
                      { value: 'OTHER', label: 'Lainnya / Simpanan' }
                    ]}
                    size="md"
                    variant="blue"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Warna Kartu Dashboard
                  </label>
                  <CustomSelect
                    value={accountForm.color}
                    onChange={(val) => setAccountForm(prev => ({ ...prev, color: val }))}
                    options={[
                      { value: 'blue', label: 'Biru (Brand Blue)' },
                      { value: 'emerald', label: 'Hijau (Emerald)' },
                      { value: 'cyan', label: 'Sian (Cyan)' },
                      { value: 'purple', label: 'Ungu (Purple)' },
                      { value: 'amber', label: 'Kuning Emas (Amber)' }
                    ]}
                    size="md"
                    variant="blue"
                    className="w-full"
                  />
                </div>
              </div>

              {!editingAccount && (
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Saldo Awal (Rp)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={accountForm.balance}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, balance: e.target.value }))}
                    className="w-full bg-subsurface border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Keterangan Singkat
                </label>
                <input
                  type="text"
                  placeholder="Misal: Rekening penampungan EDC & QRIS kasir"
                  value={accountForm.keterangan}
                  onChange={(e) => setAccountForm(prev => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full bg-subsurface border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-foreground"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={accountModalLoading || loading}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-foreground shadow-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {accountModalLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    editingAccount ? 'Simpan Akun' : 'Tambah Akun'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: Tambah/Edit Menu & Resep */}
      {showMenuModal && (
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 bg-[var(--overlay-backdrop)] backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-surface border border-border w-full max-w-2xl p-4 sm:p-6 rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center border-b border-border pb-4 mb-4 shrink-0">
              <h3 className="text-lg font-bold text-foreground">
                {isEditingMenu ? 'Edit Menu & Resep' : 'Tambah Menu Baru'}
              </h3>
              <button 
                type="button"
                onClick={() => setShowMenuModal(false)}
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMenu} className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-2 pb-24 overscroll-contain">
                {/* Upload Foto Menu (PNG/JPG, Copy-Paste, Max 2MB) */}
                <ImageUploadPaste
                  value={menuForm.foto_url}
                  onChange={(val) => setMenuForm(prev => ({ ...prev, foto_url: val }))}
                  maxSizeMB={2}
                  label="Foto Menu Cafe (Opsional)"
                  helperText="Upload gambar atau tekan Ctrl+V untuk Paste foto makanan/minuman (PNG/JPG, maks 2MB, auto-kompres)"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Nama Menu
                    </label>
                    <input
                      type="text"
                      placeholder="Misal: Ice Americano"
                      value={menuForm.nama_menu}
                      onChange={(e) => setMenuForm(prev => ({ ...prev, nama_menu: e.target.value }))}
                      disabled={isEditingMenu}
                      className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm disabled:opacity-50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Harga Jual (Rp)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={menuForm.harga}
                      onChange={(e) => setMenuForm(prev => ({ ...prev, harga: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm"
                      required
                    />
                  </div>

                  <CustomCategoryPicker
                    categories={cafeCategories}
                    value={menuForm.kategori}
                    onChange={(cat) => setMenuForm(prev => ({ ...prev, kategori: cat }))}
                    onAddCategory={(newCat) => {
                      if (!cafeCategories.includes(newCat)) {
                        setCafeCategories(prev => [...prev, newCat])
                      }
                      setMenuForm(prev => ({ ...prev, kategori: newCat }))
                    }}
                    label="Kategori Menu"
                  />

                  <div className="flex items-center gap-4 pt-4">
                    <label className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer">
                      <input
                        type="checkbox"
                        checked={menuForm.is_bundling}
                        onChange={(e) => setMenuForm(prev => ({ ...prev, is_bundling: e.target.checked }))}
                        className="rounded border-border bg-subsurface text-primary focus:ring-ring/30"
                      />
                      Paket Bundling
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer">
                      <input
                        type="checkbox"
                        checked={menuForm.is_active}
                        onChange={(e) => setMenuForm(prev => ({ ...prev, is_active: e.target.checked }))}
                        className="rounded border-border bg-subsurface text-primary focus:ring-ring/30"
                      />
                      Aktif/Jual
                    </label>
                  </div>
                </div>

                {/* Kalkulator HPP & Simulasi Margin Menu */}
                <MenuHppCalculator
                  menuRecipe={menuRecipe}
                  stokBahan={stokBahan}
                  sellingPrice={parseFloat(menuForm.harga) || 0}
                  onApplyPrice={(newPrice) => setMenuForm(prev => ({ ...prev, harga: newPrice }))}
                  onHppSummaryChange={setMenuCalculatorHpp}
                />

                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Deskripsi Menu
                  </label>
                  <textarea
                    placeholder="Tulis detail menu..."
                    value={menuForm.deskripsi}
                    onChange={(e) => setMenuForm(prev => ({ ...prev, deskripsi: e.target.value }))}
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm h-16 focus:outline-none"
                  />
                </div>

                {/* Resep List */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-muted uppercase tracking-wider">
                      Resep Bahan Baku Terpakai
                    </span>
                    <button
                      type="button"
                      onClick={handleAddRecipeRow}
                      className="px-3 py-1 bg-primary-soft border border-success/30 text-primary-soft-foreground font-bold rounded-lg text-xs"
                    >
                      + Tambah Bahan
                    </button>
                  </div>

                  {menuRecipe.map((row, idx) => {
                    const matchedStock = stokBahan.find(
                      b => (row.stok_barang_id && b.id === row.stok_barang_id) ||
                           b.nama_bahan === row.nama_bahan ||
                           b.nama_produk === row.nama_bahan
                    );
                    const costInfo = calculateIngredientCost(matchedStock, row.jumlah_dibutuhkan, row.satuan);
                    return (
                      <div key={idx} className="flex gap-2 items-center p-2 rounded-xl bg-subsurface border border-border">
                        <div className="flex-1 min-w-[120px]">
                          <CustomSelect
                            value={row.nama_bahan}
                            onChange={(val) => updateRecipeRow(idx, 'nama_bahan', val)}
                            options={stokBahan.map(b => ({ value: b.nama_bahan, label: b.nama_bahan }))}
                            size="xs"
                            variant="emerald"
                            className="w-full"
                            listMaxHeightClass="max-h-[148px]"
                          />
                        </div>
                        <div className="w-20">
                          <input
                            type="number"
                            placeholder="Jumlah"
                            value={row.jumlah_dibutuhkan}
                            onChange={(e) => updateRecipeRow(idx, 'jumlah_dibutuhkan', parseFloat(e.target.value) || 0)}
                            className="w-full bg-subsurface border border-border rounded py-1 px-2 text-foreground text-xs text-center font-mono"
                          />
                        </div>
                        <span className="text-[10px] text-muted-dark w-12 font-mono">{row.satuan}</span>
                        <div className="text-right min-w-[75px] shrink-0">
                          <div className="text-xs font-mono font-bold text-primary tabular-nums">
                            {formatRupiah(costInfo.subtotalCost)}
                          </div>
                          <div className="text-[9px] text-muted-dark font-mono">
                            {costInfo.isStockPriceZero ? 'Rp 0 (stok)' : `@${formatRupiah(costInfo.unitCost)}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRecipeRow(idx)}
                          className="text-destructive hover:text-destructive p-1"
                          title="Hapus Bahan"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}

                  {menuRecipe.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-subsurface border border-border flex items-center justify-between text-xs">
                      <span className="text-muted">
                        Total Bahan Resep: <strong className="text-foreground">{menuRecipe.length} item</strong>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted">Subtotal Food Cost:</span>
                        <span className="font-mono font-bold text-primary text-sm tabular-nums">
                          {formatRupiah(
                            menuRecipe.reduce((acc, r) => {
                              const m = stokBahan.find(b => b.nama_bahan === r.nama_bahan || b.nama_produk === r.nama_bahan);
                              return acc + calculateIngredientCost(m, r.jumlah_dibutuhkan, r.satuan).subtotalCost;
                            }, 0)
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
            </form>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border pt-3.5 mt-4 shrink-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="px-2.5 py-1.5 rounded-lg bg-subsurface border border-border flex items-center gap-1.5">
                  <span className="text-muted">HPP / Porsi:</span>
                  <strong className="font-mono tabular-nums text-foreground">
                    {formatRupiah(menuFooterSummary.effectiveHpp)}
                  </strong>
                </div>
                <div
                  className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                    menuFooterSummary.marginStatus === 'HEALTHY'
                      ? 'bg-success-bg text-success border-success/30'
                      : menuFooterSummary.marginStatus === 'MODERATE'
                      ? 'bg-primary-soft text-primary-soft-foreground border-primary/30'
                      : menuFooterSummary.marginStatus === 'LOW'
                      ? 'bg-warning-bg text-warning border-warning/30'
                      : menuFooterSummary.marginStatus === 'LOSS'
                      ? 'bg-destructive-bg text-destructive border-destructive/30'
                      : 'bg-subsurface text-muted border-border'
                  }`}
                >
                  <span>Margin:</span>
                  <strong className="font-mono tabular-nums">
                    {menuFooterSummary.appliedPrice > 0 ? `${menuFooterSummary.marginPercent}%` : '0%'}
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <div className="text-right pr-2 border-r border-border">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Harga Diterapkan
                  </span>
                  <span className="text-sm font-black font-mono tabular-nums text-primary">
                    {formatRupiah(menuFooterSummary.appliedPrice)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMenuModal(false)}
                  className="px-4 py-2 bg-subsurface hover:bg-surface-hover text-foreground font-bold rounded-xl text-sm cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  onClick={handleSaveMenu}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-foreground font-bold rounded-xl text-sm cursor-pointer"
                >
                  Simpan Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Tambah Bahan Baku Baru */}
      {showIngredientModal && (
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 bg-[var(--overlay-backdrop)] backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-surface border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
              <h3 className="text-lg font-bold text-foreground">Tambah Bahan Baku Baru</h3>
              <button 
                type="button" 
                onClick={() => {
                  setShowIngredientModal(false)
                  setIngredientForm({ id_bahan_baku: '', nama_bahan: '', stok: 0, satuan: 'Gram/Ml', harga_satuan: 0 })
                }} 
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveIngredient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    ID Bahan Baku
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: BK-01, MB-01"
                    value={ingredientForm.id_bahan_baku}
                    onChange={(e) => setIngredientForm(prev => ({ ...prev, id_bahan_baku: e.target.value.toUpperCase() }))}
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Nama Bahan Baku
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Biji Kopi"
                    value={ingredientForm.nama_bahan}
                    onChange={(e) => setIngredientForm(prev => ({ ...prev, nama_bahan: e.target.value }))}
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Satuan Ukuran
                  </label>
                  <CustomSelect
                    value={ingredientForm.satuan}
                    onChange={(val) => setIngredientForm(prev => ({ ...prev, satuan: val }))}
                    options={[
                      { value: 'Gram', label: 'Gram' },
                      { value: 'Ml', label: 'Ml' },
                      { value: 'Pcs', label: 'Pcs' },
                      { value: 'Btl', label: 'Btl' },
                      { value: 'Gram/Ml', label: 'Gram/Ml' }
                    ]}
                    size="md"
                    variant="emerald"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Harga Satuan (Rp)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={ingredientForm.harga_satuan}
                    onChange={(e) => setIngredientForm(prev => ({ ...prev, harga_satuan: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Stok Awal
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={ingredientForm.stok}
                  onChange={(e) => setIngredientForm(prev => ({ ...prev, stok: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowIngredientModal(false)
                    setIngredientForm({ id_bahan_baku: '', nama_bahan: '', stok: 0, satuan: 'Gram/Ml', harga_satuan: 0 })
                  }}
                  className="px-4 py-2 bg-subsurface hover:bg-surface-hover text-foreground font-bold rounded-xl text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary-soft active:scale-[0.98] text-primary-foreground font-bold rounded-xl text-sm"
                >
                  Tambah Bahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2b: Edit Bahan Baku */}
      {editingIngredient && (
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 bg-[var(--overlay-backdrop)] backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-surface border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
              <h3 className="text-lg font-bold text-foreground">Edit Bahan Baku</h3>
              <button 
                type="button" 
                onClick={() => setEditingIngredient(null)} 
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateIngredient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    ID Bahan Baku
                  </label>
                  <input
                    type="text"
                    value={editingIngredient.id_bahan_baku}
                    disabled
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm font-mono font-bold opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Nama Bahan Baku
                  </label>
                  <input
                    type="text"
                    value={editingIngredient.nama_produk}
                    onChange={(e) => setEditingIngredient(prev => ({ ...prev, nama_produk: e.target.value }))}
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Satuan Ukuran
                  </label>
                  <CustomSelect
                    value={editingIngredient.satuan}
                    onChange={(val) => setEditingIngredient(prev => ({ ...prev, satuan: val }))}
                    options={[
                      { value: 'Gram', label: 'Gram' },
                      { value: 'Ml', label: 'Ml' },
                      { value: 'Pcs', label: 'Pcs' },
                      { value: 'Btl', label: 'Btl' },
                      { value: 'Gram/Ml', label: 'Gram/Ml' }
                    ]}
                    size="md"
                    variant="emerald"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Harga Satuan (Rp)
                  </label>
                  <input
                    type="number"
                    value={editingIngredient.harga_satuan}
                    onChange={(e) => setEditingIngredient(prev => ({ ...prev, harga_satuan: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Stok Saat Ini
                </label>
                <input
                  type="number"
                  value={editingIngredient.stok}
                  onChange={(e) => setEditingIngredient(prev => ({ ...prev, stok: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-subsurface border border-border rounded-lg py-2 px-3 text-foreground text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
                <button
                  type="button"
                  onClick={() => setEditingIngredient(null)}
                  className="px-4 py-2 bg-subsurface hover:bg-surface-hover text-muted font-bold rounded-xl text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary-soft active:scale-[0.98] text-primary-foreground font-bold rounded-xl text-sm"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL OPNAME / KEBOCORAN */}
      {opnameIngredient && (
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 bg-[var(--overlay-backdrop)] backdrop-blur-md flex justify-center items-center p-3 sm:p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-surface border border-border w-full max-w-md p-6 rounded-2xl shadow-2xl relative max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <h3 className="text-xl font-bold text-foreground mb-2">Opname & Kebocoran</h3>
            <p className="text-xs text-muted mb-6 border-b border-border pb-4">
              Hitung selisih stok aplikasi dengan stok fisik gudang.
            </p>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between bg-subsurface p-3 rounded-lg border border-border">
                <span className="text-sm font-semibold text-muted">Bahan Baku:</span>
                <span className="text-sm font-bold text-foreground">{opnameIngredient.nama_bahan}</span>
              </div>
              <div className="flex justify-between bg-subsurface p-3 rounded-lg border border-border">
                <span className="text-sm font-semibold text-muted">Stok Sistem Saat Ini:</span>
                <span className="text-sm font-bold text-primary">{parseFloat(opnameIngredient.stok).toFixed(2)} {opnameIngredient.satuan}</span>
              </div>
            </div>

            <form onSubmit={handleSimpanOpname} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Stok Fisik Gudang ({opnameIngredient.satuan})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={stokFisik}
                  onChange={(e) => setStokFisik(e.target.value)}
                  className="w-full bg-subsurface border border-border rounded-xl px-4 py-3 text-foreground focus:border-ring transition-colors"
                  placeholder="Masukkan jumlah asli di gudang"
                />
              </div>

              {stokFisik !== '' && !isNaN(parseFloat(stokFisik)) && (
                <div className="p-4 rounded-xl border mt-4 bg-subsurface">
                  {(() => {
                    const diff = parseFloat(opnameIngredient.stok) - parseFloat(stokFisik);
                    const isBocor = diff > 0;
                    const isLebih = diff < 0;
                    const nilaiKerugian = Math.abs(diff) * parseFloat(opnameIngredient.harga_satuan || 0);

                    if (diff === 0) {
                      return (
                        <div className="text-primary text-sm text-center font-bold">
                          Stok Cocok! Tidak ada kebocoran.
                        </div>
                      )
                    }

                    if (isBocor) {
                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between text-destructive font-bold text-sm">
                            <span>Selisih Kebocoran:</span>
                            <span>{diff.toFixed(2)} {opnameIngredient.satuan}</span>
                          </div>
                          <div className="flex justify-between text-destructive font-black">
                            <span>Estimasi Kerugian:</span>
                            <span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(nilaiKerugian)}</span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between text-warning font-bold text-sm">
                          <span>Selisih Kelebihan:</span>
                          <span>{Math.abs(diff).toFixed(2)} {opnameIngredient.satuan}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setOpnameIngredient(null)}
                  className="px-4 py-2 bg-subsurface hover:bg-surface-hover text-foreground font-bold rounded-xl text-sm transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-primary-foreground font-bold rounded-xl text-sm shadow-sm transition-all"
                >
                  Update & Sesuaikan Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL INTEGRASI EMAIL BANK MANDIRI */}
      <BankEmailBindingModal
        isOpen={showBankEmailModal}
        onClose={() => setShowBankEmailModal(false)}
        onSuccess={() => loadAdminData()}
        pockets={posAccountList}
        initialPocketId={selectedBankEmailPocketId}
      />

      {/* CUSTOM MODAL: Alert / Confirm */}
      {customAlert && (
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 bg-[var(--overlay-backdrop)] backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-surface border border-border w-full max-w-sm p-6 rounded-2xl shadow-2xl shadow-sm animate-pop-in text-center">
            <div className="mb-4">
              {customAlert.title === 'Sukses' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-success-bg flex items-center justify-center">
                  <CheckCircle className="text-success" size={24} />
                </div>
              ) : customAlert.title === 'Error' || customAlert.title === 'Hapus Bahan Baku' || customAlert.title === 'Hapus Menu' || customAlert.title === 'Hapus Karyawan' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-destructive-bg flex items-center justify-center">
                  <AlertCircle className="text-destructive" size={24} />
                </div>
              ) : (
                <div className="w-12 h-12 mx-auto rounded-full bg-warning-bg flex items-center justify-center">
                  <AlertCircle className="text-warning" size={24} />
                </div>
              )}
            </div>
            
            <h4 className="text-base font-extrabold text-foreground mb-2">
              {customAlert.title}
            </h4>
            <p className="text-xs text-muted leading-relaxed mb-6">
              {customAlert.message}
            </p>
            
            <div className="flex justify-center gap-3">
              {customAlert.type === 'confirm' && (
                <button
                  type="button"
                  onClick={customAlert.onCancel}
                  className="px-4 py-2 bg-subsurface hover:bg-surface-hover active:scale-[0.98] text-foreground font-bold rounded-xl text-xs transition-all w-24"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={customAlert.onConfirm}
                className={`px-4 py-2 active:scale-[0.98] font-bold rounded-xl text-xs transition-all w-24 ${
                  customAlert.title === 'Error' || customAlert.title === 'Hapus Bahan Baku' || customAlert.title === 'Hapus Menu' || customAlert.title === 'Hapus Karyawan'
                    ? 'bg-destructive-solid hover:opacity-90 text-white'
                    : 'bg-primary hover:bg-primary-soft text-primary-foreground'
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

export default Admin
