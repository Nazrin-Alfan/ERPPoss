import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
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
  Layers
} from 'lucide-react'
import { formatRupiah, calculateTutupKasirRecap } from '../utils/helpers'
import { getTenantFeatures } from '../utils/businessCapabilities'
import InteractiveCalendar from '../components/InteractiveCalendar'
import ReceiptCustomizer from '../components/admin/ReceiptCustomizer'
import CarwashPackageManager from '../components/admin/CarwashPackageManager'
import MerchandiseManager from '../components/admin/MerchandiseManager'
import LicenseManager from '../components/admin/LicenseManager'
import ImageUploadPaste from '../components/common/ImageUploadPaste'
import CustomCategoryPicker from '../components/common/CustomCategoryPicker'
import CustomSelect from '../components/common/CustomSelect'
import { DEFAULT_CARWASH_PACKAGES } from '../utils/carwashHelpers'
import { getReceiptConfig } from '../utils/receiptHelpers'

const Admin = () => {
  const { registerKasir, activeTenant } = useAuth()
  const features = getTenantFeatures(activeTenant?.business_type)
  const defaultTab = features.isCarwashOnly ? 'carwash-packages' : 'menu'
  const [activeTab, setActiveTab] = useState(defaultTab)

  useEffect(() => {
    if (features.isCarwashOnly && activeTab === 'menu') {
      setActiveTab('carwash-packages')
    } else if (features.isCafeOnly && activeTab === 'carwash-packages') {
      setActiveTab('menu')
    }
  }, [features.isCarwashOnly, features.isCafeOnly])
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
  const [stokBahan, setStokBahan] = useState([])
  const [resepList, setResepList] = useState([])

  const [balances, setBalances] = useState({ cash: 0, rekY: 0, rekN: 0, rekR: 0 })
  const [targetBalances, setTargetBalances] = useState({ cash: '', rekY: '', rekN: '', rekR: '' })

  // State Akun Likuiditas (Kas & Rekening Dinamis)
  const [posAccountList, setPosAccountList] = useState([])
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
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
        supabase.from('pos_balances').select('*'),
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
        harga_satuan: parseFloat(item.harga_satuan || 0)
      }))
      const realResep = (rs || []).map(item => ({
        ...item,
        jumlah_dibutuhkan: item.jumlah
      }))

      let cashVal = 0, rekYVal = 0, rekNVal = 0, rekRVal = 0
      const balancesMap = {}
      if (bal) {
        bal.forEach(item => {
          const val = parseFloat(item.balance) || 0
          balancesMap[item.pos] = val
          if (item.pos === 'SALDO CASH') cashVal = val
          else if (item.pos === 'SALDO REKENING Y') rekYVal = val
          else if (item.pos === 'SALDO REKENING N') rekNVal = val
          else if (item.pos === 'SALDO REKENING R') rekRVal = val
        })
      }
      setBalances({ cash: cashVal, rekY: rekYVal, rekN: rekNVal, rekR: rekRVal, ...balancesMap })
      setPosAccountList(bal || [])

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

      setCarwashPackages(cp && cp.length > 0 ? cp : DEFAULT_CARWASH_PACKAGES)

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
  }, [])



  // 1. Kasir & Metode Bayar Handlers
  const handleAddCashier = async (e) => {
    e.preventDefault()
    if (!newCashier) return
    try {
      const { error } = await supabase.from('kasir').insert({ nama: newCashier.toUpperCase() })
      if (error) throw error
      setNewCashier('')
      setSuccess('Kasir berhasil ditambahkan!')
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal menambahkan kasir.')
    }
  }

  const toggleCashierActive = async (nama, currentVal) => {
    try {
      const { error } = await supabase.from('kasir').update({ is_active: !currentVal }).eq('nama', nama)
      if (error) throw error
      await loadAdminData()
    } catch (err) {
      setError(err.message || 'Gagal mengupdate kasir.')
    }
  }

  const handleAddPayment = async (e) => {
    e.preventDefault()
    if (!newPayment) return
    try {
      const { error } = await supabase.from('metode_bayar').insert({ nama: newPayment.toUpperCase() })
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

  // Carwash Packages Handlers
  const handleSaveCarwashPackage = async (pkgPayload) => {
    try {
      setLoading(true)
      const payload = {
        nama_paket: pkgPayload.nama_paket,
        keterangan: pkgPayload.keterangan,
        komisi_skema: pkgPayload.komisi_skema,
        komisi_value: pkgPayload.komisi_value,
        tarif: pkgPayload.tarif,
        is_active: pkgPayload.is_active
      }

      if (pkgPayload.id) {
        const { error } = await supabase
          .from('carwash_packages')
          .update(payload)
          .eq('id', pkgPayload.id)
        if (error) throw error
        setSuccess(`Paket "${pkgPayload.nama_paket}" berhasil diperbarui!`)
      } else {
        const newId = 'pkg_' + Date.now().toString(36)
        const { error } = await supabase
          .from('carwash_packages')
          .insert({
            id: newId,
            ...payload,
            sort_order: carwashPackages.length + 1
          })
        if (error) throw error
        setSuccess(`Paket cuci baru "${pkgPayload.nama_paket}" berhasil ditambahkan!`)
      }

      // Sinkronisasi resep bahan kimia cuci ke tabel resep
      await supabase
        .from('resep')
        .delete()
        .eq('nama_menu', pkgPayload.nama_paket)

      if (pkgPayload.resep_bahan && pkgPayload.resep_bahan.length > 0) {
        for (const b of pkgPayload.resep_bahan) {
          if (b.nama_bahan && parseFloat(b.jumlah) > 0) {
            await supabase.from('resep').insert({
              id_resep: `rsp_cw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              nama_menu: pkgPayload.nama_paket,
              id_bahan_baku: b.id_bahan_baku || '',
              nama_bahan: b.nama_bahan,
              jumlah: parseFloat(b.jumlah),
              jumlah_dibutuhkan: parseFloat(b.jumlah),
              satuan: b.satuan || 'Liter'
            })
          }
        }
      }

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
      const { error } = await supabase.from('carwash_packages').delete().eq('id', pkgId)
      if (error) throw error
      if (pkg?.nama_paket) {
        await supabase.from('resep').delete().eq('nama_menu', pkg.nama_paket)
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
      const { error } = await supabase
        .from('carwash_packages')
        .update({ is_active: !currentStatus })
        .eq('id', pkgId)
      if (error) throw error
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
        s.kategori === 'MERCHANDISE' ||
        s.sub_kategori === 'Parfum' ||
        s.sub_kategori === 'Lap & Perawatan' ||
        s.sub_kategori === 'Aksesoris & Detailing' ||
        s.kategori === 'Parfum Mobil' ||
        s.kategori === 'Lap & Perawatan' ||
        s.kategori === 'Aksesoris & Detailing' ||
        s.kategori === 'Chemical Retail' ||
        s.kategori === 'Snack & Minuman Ringan'
    )
  }, [stokBahan])

  const handleSaveMerchandise = async (itemPayload) => {
    try {
      setLoading(true)
      const existing = (stokBahan || []).find(
        (s) => s.id_barang === itemPayload.id_barang || s.id_bahan_baku === itemPayload.id_barang
      )

      if (existing) {
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
          .eq('id_barang', itemPayload.id_barang)
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
    const item = (stokBahan || []).find((s) => s.id_barang === itemId || s.id_bahan_baku === itemId)
    if (!window.confirm(`Yakin ingin menghapus produk merchandise "${item?.nama_barang || item?.nama_produk || 'ini'}"?`)) return
    try {
      setLoading(true)
      const { error } = await supabase.from('stok_barang').delete().eq('id_barang', itemId)
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
      const { error } = await supabase
        .from('stok_barang')
        .update({ is_active: !currentActive })
        .eq('id_barang', itemId)
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
      throw new Error('Format serial key tidak valid. Periksa kembali kode lisensi Anda.')
    }

    // Perpanjang 1 tahun (365 hari) dari tanggal berakhir saat ini atau dari hari ini
    const baseDate = (licenseData?.expires_at && new Date(licenseData.expires_at) > new Date())
      ? new Date(licenseData.expires_at)
      : new Date()
    
    const newExpiry = new Date(baseDate)
    newExpiry.setFullYear(newExpiry.getFullYear() + 1)

    const updatedLicense = {
      license_key: serialKey,
      status: 'ACTIVE',
      tier: 'PRO_ANNUAL',
      expires_at: newExpiry.toISOString(),
      notes: `Diaktivasi pada ${new Date().toLocaleDateString('id-ID')} via Serial Key`
    }

    if (licenseData?.id) {
      const { error } = await supabase
        .from('tenant_licenses')
        .update(updatedLicense)
        .eq('id', licenseData.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('tenant_licenses')
        .insert({
          id: 'lic_' + Date.now(),
          ...updatedLicense
        })
      if (error) throw error
    }

    await loadAdminData()
    setSuccess('Lisensi berhasil diaktivasi! Masa aktif sistem diperpanjang 1 Tahun.')
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
      const { error } = await supabase.from('stok_barang').update({
        nama_produk: editingIngredient.nama_produk.trim(),
        stok: parseFloat(editingIngredient.stok) || 0,
        satuan: editingIngredient.satuan,
        harga_satuan: parseFloat(editingIngredient.harga_satuan) || 0
      }).eq('id_bahan_baku', editingIngredient.id_bahan_baku)

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
      const { error } = await supabase.from('stok_barang').delete().eq('id_bahan_baku', id)
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
      const { error } = await supabase.from('stok_barang').update({
        stok: fisik,
        updated_at: new Date().toISOString()
      }).eq('id_bahan_baku', opnameIngredient.id_bahan_baku)
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
    const defaultBahan = stokBahan[0]?.nama_bahan || ''
    const defaultSatuan = stokBahan[0]?.satuan || 'Gram'
    setMenuRecipe(prev => [...prev, { nama_bahan: defaultBahan, jumlah_dibutuhkan: 1, satuan: defaultSatuan }])
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
            const match = stokBahan.find(b => b.nama_bahan === value)
            if (match) updated.satuan = match.satuan
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
      id_menu: menu.id_menu,
      nama_menu: menu.nama_menu,
      harga: parseFloat(menu.harga),
      kategori: menu.kategori || 'Minuman',
      deskripsi: menu.deskripsi || '',
      foto_url: menu.foto_url || '',
      is_bundling: menu.is_bundling,
      is_active: menu.is_active
    })
    
    // Cari resep yang terkait
    const recipeRows = resepList
      .filter(r => r.nama_menu === menu.nama_menu)
      .map(r => ({
        nama_bahan: r.nama_bahan,
        jumlah_dibutuhkan: parseFloat(r.jumlah_dibutuhkan),
        satuan: r.satuan
      }))

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

    if (!categoryForm.nama_kategori.trim()) {
      return setError('Nama kategori wajib diisi.')
    }

    setLoading(true)
    try {
      if (editingCategory) {
        const { error: err } = await supabase
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

        if (err) throw err
        setSuccess(`Kategori "${categoryForm.nama_kategori}" berhasil diperbarui!`)
      } else {
        const newCatId = `kat_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 5)}`
        const { error: err } = await supabase
          .from('master_categories')
          .insert({
            id: newCatId,
            nama_kategori: categoryForm.nama_kategori.trim(),
            jenis: categoryForm.jenis,
            tipe_arus: categoryForm.tipe_arus,
            account_id: categoryForm.account_id,
            boleh_kasir: categoryForm.boleh_kasir,
            is_active: true,
          })

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
      setError('Gagal menyimpan kategori: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCategory = async (cat) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus kategori "${cat.nama_kategori}"?`, 'Hapus Kategori')
    if (!confirmed) return
    setLoading(true)
    try {
      const { error: err } = await supabase
        .from('master_categories')
        .delete()
        .eq('id', cat.id)

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
      // 1. Simpan Menu (Insert / Update)
      if (isEditingMenu) {
        // Update menu properties
        const { error: menuErr } = await supabase
          .from('daftar_harga_menu')
          .update({
            daftar_menu: menuForm.nama_menu.trim(),
            harga: parseFloat(menuForm.harga),
            kategori: finalKategori,
            deskripsi: menuForm.deskripsi,
            foto_url: menuForm.foto_url || '',
            is_bundling: menuForm.is_bundling,
            is_active: menuForm.is_active
          })
          .eq('id_menu', menuForm.id_menu)

        if (menuErr) throw menuErr

        // Delete existing recipe rows to rewrite them
        await supabase
          .from('resep')
          .delete()
          .eq('id_menu', menuForm.id_menu)
      } else {
        // Insert new menu
        const { error: menuErr } = await supabase
          .from('daftar_harga_menu')
          .insert({
            id_menu: menuForm.nama_menu.trim(),
            daftar_menu: menuForm.nama_menu.trim(),
            harga: parseFloat(menuForm.harga),
            kategori: finalKategori,
            deskripsi: menuForm.deskripsi,
            foto_url: menuForm.foto_url || '',
            is_bundling: menuForm.is_bundling,
            is_active: menuForm.is_active
          })

        if (menuErr) throw menuErr
      }

      // 2. Simpan Resep (jika ada)
      if (menuRecipe.length > 0) {
        const resolvedMenuId = menuForm.id_menu || menuForm.nama_menu.trim();
        const insertRecipes = menuRecipe.map(r => {
          const matchedBahan = stokBahan.find(b => b.nama_bahan === r.nama_bahan);
          const resolvedBahanId = matchedBahan ? matchedBahan.id_bahan_baku : r.nama_bahan;
          return {
            id_menu: resolvedMenuId,
            nama_menu: menuForm.nama_menu,
            id_bahan_baku: resolvedBahanId,
            nama_bahan: r.nama_bahan,
            jumlah: parseFloat(r.jumlah_dibutuhkan),
            satuan: r.satuan
          };
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

  const handleDeleteMenu = async (menuName) => {
    const confirmed = await showConfirm(`Apakah Anda yakin ingin menghapus menu "${menuName}"? Tindakan ini akan menghapus data resep yang melekat.`, 'Hapus Menu')
    if (!confirmed) return
    try {
      const { error } = await supabase
        .from('daftar_harga_menu')
        .delete()
        .eq('daftar_menu', menuName)

      if (error) throw error
      setSuccess('Menu berhasil dihapus!')
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
    setShowAccountModal(true)
  }

  const handleOpenEditAccount = (acc) => {
    setEditingAccount(acc)
    setAccountForm({
      pos: acc.pos,
      label: acc.label || acc.pos,
      tipe: acc.tipe || 'BANK',
      balance: acc.balance || 0,
      keterangan: acc.keterangan || '',
      color: acc.color || 'blue',
      is_active: acc.is_active !== false
    })
    setShowAccountModal(true)
  }

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      const posCode = accountForm.pos.trim().toUpperCase()
      if (!posCode) return setError('Kode / Nama Pos akun wajib diisi.')
      const normalizedPos = posCode.startsWith('SALDO ') ? posCode : `SALDO ${posCode}`

      const payload = {
        pos: normalizedPos,
        label: accountForm.label.trim() || normalizedPos,
        tipe: accountForm.tipe || 'BANK',
        keterangan: accountForm.keterangan || '',
        color: accountForm.color || 'blue',
        is_active: accountForm.is_active !== false,
        balance: parseFloat(accountForm.balance || 0)
      }

      if (editingAccount) {
        const { error: updErr } = await supabase.from('pos_balances').update(payload).eq('pos', editingAccount.pos)
        if (updErr) throw updErr
        setSuccess(`Akun likuiditas "${payload.label}" berhasil diperbarui!`)
      } else {
        const exists = posAccountList.some(a => a.pos === normalizedPos)
        if (exists) {
          return setError(`Akun dengan nama pos "${normalizedPos}" sudah ada.`)
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
      setError(err.message || 'Gagal menyimpan akun likuiditas.')
    }
  }

  const handleDeleteAccount = async (account) => {
    if (account.pos === 'SALDO CASH') {
      return setError('Akun SALDO CASH adalah kas fisik utama kasir dan tidak boleh dihapus.')
    }
    if (!window.confirm(`Yakin ingin menghapus akun likuiditas "${account.label || account.pos}"?`)) return
    try {
      const { error: delErr } = await supabase.from('pos_balances').delete().eq('pos', account.pos)
      if (delErr) throw delErr
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
            const currentBal = parseFloat(acc.balance || 0)
            const diff = target - currentBal
            if (diff !== 0) {
              inserts.push({
                id_cashflow: self.crypto.randomUUID(),
                tanggal: currentTimestamp,
                jenis: diff > 0 ? 'Pemasukan' : 'Pengeluaran',
                pos: acc.pos,
                pemasukan: diff > 0 ? Math.abs(diff) : 0,
                pengeluaran: diff < 0 ? Math.abs(diff) : 0,
                keterangan_transaksi: `Kalibrasi Saldo ${acc.label || acc.pos} (Penyesuaian Manual Admin)`
              })

              // Sinkronkan saldo langsung di tabel pos_balances
              await supabase.from('pos_balances').update({ balance: target }).eq('pos', acc.pos)
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
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <Settings size={32} className="text-brand-blue" />
          Kelola Admin
        </h1>
        <p className="text-slate-400 text-sm mt-1">Konfigurasi menu cafe, stok bahan baku, kasir/metode bayar, & hak akses staf</p>
      </div>

      {/* Popups Alert */}
      {success && (
        <div className="p-4 rounded-xl bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald text-sm flex items-center gap-3">
          <CheckCircle size={18} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="glass-panel p-2 rounded-xl flex flex-wrap gap-2 border border-slate-800/80 shrink-0">
        {features.hasMenuCatalog && (
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'menu' ? 'bg-brand-blue text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Utensils size={14} />
            Menu & Resep
          </button>
        )}
        {features.hasCarwashPackages && (
          <button
            onClick={() => setActiveTab('carwash-packages')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
              activeTab === 'carwash-packages' ? 'bg-cyan-400 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles size={14} />
            Paket & Tarif Cuci
          </button>
        )}
        <button
          onClick={() => setActiveTab('merchandise')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'merchandise' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShoppingBag size={14} />
          Produk Merchandise
        </button>
        <button
          onClick={() => setActiveTab('cashier-pay')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'cashier-pay' ? 'bg-brand-blue text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard size={14} />
          Kasir & Metode Bayar
        </button>
        <button
          onClick={() => setActiveTab('calibration')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'calibration' ? 'bg-brand-blue text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wallet size={14} />
          Rekening & Saldo Likuiditas
        </button>
        <button
          onClick={() => setActiveTab('discounts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'discounts' ? 'bg-brand-blue text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Percent size={14} />
          Kelola Diskon
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'categories' ? 'bg-brand-emerald text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tag size={14} />
          Kategori & Akun Kasir
        </button>
        <button
          onClick={() => setActiveTab('manual-eod')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'manual-eod' ? 'bg-amber-400 text-slate-950 shadow-md' : 'text-amber-400/80 hover:text-amber-300'
          }`}
        >
          <CalendarCheck size={14} />
          Tutup Kasir Manual (Susulan)
        </button>
        <button
          onClick={() => setActiveTab('receipt-settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'receipt-settings' ? 'bg-cyan-400 text-slate-950 shadow-md ring-2 ring-cyan-400/30' : 'text-cyan-400 hover:text-cyan-200 hover:bg-slate-800/60'
          }`}
        >
          <Printer size={14} />
          Printer Thermal & Kustomisasi Struk
        </button>
        <button
          onClick={() => setActiveTab('license')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'license' ? 'bg-amber-400 text-slate-950 shadow-md' : 'text-amber-400/90 hover:text-amber-300'
          }`}
        >
          <ShieldCheck size={14} />
          Lisensi & Langganan
        </button>
      </div>

      {/* CONTENT TAB 1: Menu & Resep */}
      {activeTab === 'menu' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">Daftar Menu F&B & Resep Cafe</h3>
              <p className="text-xs text-slate-400">Kelola katalog makanan, minuman, snack, dan formulasi resep bahan baku (BOM).</p>
            </div>
            <button
              onClick={openAddMenuModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-emerald hover:bg-emerald-500 active:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs self-start sm:self-auto shadow-sm"
            >
              <Plus size={14} />
              Tambah Menu F&B
            </button>
          </div>

          {/* Quick Category Manager Bar (Admin Filter & Overview) */}
          <div className="glass-panel p-3 rounded-2xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full scrollbar-none">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <Tag size={13} className="text-brand-emerald" /> Kategori:
              </span>
              {cafeCategories.map((cat) => {
                const count = menuItems.filter(m => m.kategori === cat).length
                return (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 shrink-0"
                  >
                    <span>{cat}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-brand-emerald font-mono">
                      {count}
                    </span>
                  </span>
                )
              })}
            </div>
            <button
              type="button"
              onClick={openAddMenuModal}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors shrink-0"
            >
              <Plus size={13} /> Tambah Menu Baru
            </button>
          </div>

          <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm text-slate-300">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                    <th className="p-4">Foto & Menu</th>
                    <th className="p-4">Kategori</th>
                    <th className="p-4">Harga</th>
                    <th className="p-4">Bahan Baku Resep</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {menuItems.map((item) => {
                    const menuRecipes = resepList.filter(r => r.nama_menu === item.nama_menu)
                    return (
                      <tr key={item.nama_menu} className="hover:bg-slate-800/20 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {item.foto_url ? (
                              <img
                                src={item.foto_url}
                                alt={item.nama_menu}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-base shrink-0">
                                ☕
                              </div>
                            )}
                            <span className="font-bold text-white">{item.nama_menu}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            item.is_bundling ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {item.is_bundling ? 'Promo/Bundling' : item.kategori}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-brand-emerald">{formatRupiah(item.harga)}</td>
                        <td className="p-4 text-xs text-slate-400 max-w-xs truncate">
                          {menuRecipes.length > 0 ? (
                            menuRecipes.map((r, i) => (
                              <span key={i} className="block">
                                • {r.nama_bahan} ({r.jumlah_dibutuhkan} {r.satuan})
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-600 font-medium italic">Tidak ada bahan baku</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                            item.is_active ? 'bg-brand-emerald/15 text-brand-emerald' : 'bg-slate-800 text-slate-500'
                          }`}>
                            {item.is_active ? 'AKTIF' : 'NONAKTIF'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => openEditMenuModal(item)}
                              className="p-1.5 bg-slate-850 hover:bg-slate-800 text-brand-blue rounded-lg transition-colors"
                              title="Edit Menu & Resep"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteMenu(item.nama_menu)}
                              className="p-1.5 bg-slate-850 hover:bg-slate-800 text-brand-rose rounded-lg transition-colors"
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
              </table>
            </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Kelola Nama Kasir */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 space-y-4">
            <h3 className="text-base font-bold text-white">Daftar Pilihan Kasir Aktif</h3>
            
            <form onSubmit={handleAddCashier} className="flex gap-2">
              <input
                type="text"
                placeholder="Tambah nama kasir (misal: RISA)"
                value={newCashier}
                onChange={(e) => setNewCashier(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white text-xs uppercase focus:outline-none focus:border-brand-blue"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-brand-blue text-slate-950 font-bold rounded-lg text-xs"
              >
                + Tambah
              </button>
            </form>

            <div className="divide-y divide-slate-800/50 pt-2">
              {cashiers.map(c => (
                <div key={c.nama} className="flex justify-between items-center py-2.5">
                  <span className="text-sm font-bold text-slate-200">{c.nama}</span>
                  <button
                    onClick={() => toggleCashierActive(c.nama, c.is_active)}
                    className={`text-[10px] px-3 py-1 rounded font-bold border transition-colors ${
                      c.is_active 
                        ? 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20' 
                        : 'bg-slate-950 text-slate-500 border-slate-800'
                    }`}
                  >
                    {c.is_active ? '✓ AKTIF' : 'NONAKTIF'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Kelola Metode Pembayaran */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 space-y-4">
            <h3 className="text-base font-bold text-white">Daftar Pilihan Metode Bayar</h3>
            
            <form onSubmit={handleAddPayment} className="flex gap-2">
              <input
                type="text"
                placeholder="Tambah metode bayar (misal: SHOPEEPAY)"
                value={newPayment}
                onChange={(e) => setNewPayment(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white text-xs uppercase focus:outline-none focus:border-brand-blue"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-brand-blue text-slate-950 font-bold rounded-lg text-xs"
              >
                + Tambah
              </button>
            </form>

            <div className="divide-y divide-slate-800/50 pt-2">
              {paymentMethods.map(p => (
                <div key={p.nama} className="flex justify-between items-center py-2.5">
                  <span className="text-sm font-bold text-slate-200">{p.nama}</span>
                  <button
                    onClick={() => togglePaymentActive(p.nama, p.is_active)}
                    className={`text-[10px] px-3 py-1 rounded font-bold border transition-colors ${
                      p.is_active 
                        ? 'bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20' 
                        : 'bg-slate-950 text-slate-500 border-slate-800'
                    }`}
                  >
                    {p.is_active ? '✓ AKTIF' : 'NONAKTIF'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}



      {/* CONTENT TAB 5: Rekening & Saldo Likuiditas */}
      {activeTab === 'calibration' && (
        <div className="space-y-6">
          {/* Section 1: Master Rekening & Akun Likuiditas */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Wallet className="text-brand-blue" size={20} />
                  <span>Master Rekening & Akun Likuiditas (Kas & Bank)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Atur daftar kas fisik dan rekening bank yang dipantau di dashboard eksekutif dan laporan keuangan.
                </p>
              </div>
              <button
                onClick={handleOpenAddAccount}
                className="flex items-center gap-1.5 px-4 py-2 bg-brand-blue hover:bg-cyan-500 active:bg-cyan-600 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-brand-blue/10"
              >
                <Plus size={15} />
                Tambah Akun Rekening / Kas
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {posAccountList.map((acc, idx) => {
                const colorBorder = acc.color === 'emerald' ? 'border-emerald-500/30'
                  : acc.color === 'blue' ? 'border-brand-blue/30'
                  : acc.color === 'cyan' ? 'border-cyan-500/30'
                  : acc.color === 'purple' ? 'border-purple-500/30'
                  : 'border-amber-500/30'
                const colorText = acc.color === 'emerald' ? 'text-emerald-400'
                  : acc.color === 'blue' ? 'text-brand-blue'
                  : acc.color === 'cyan' ? 'text-cyan-400'
                  : acc.color === 'purple' ? 'text-purple-400'
                  : 'text-amber-400'

                const isProtected = acc.pos === 'SALDO CASH'

                return (
                  <div key={acc.pos || idx} className={`p-4 rounded-xl bg-slate-900/60 border ${colorBorder} flex flex-col justify-between space-y-3 transition-all hover:bg-slate-900/90`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${
                            acc.tipe === 'CASH' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-brand-blue/10 text-brand-blue border-brand-blue/20'
                          }`}>
                            {acc.tipe || (acc.pos === 'SALDO CASH' ? 'CASH' : 'BANK')}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{acc.pos}</span>
                        </div>
                        <h4 className="font-bold text-white text-sm mt-1.5">{acc.label || acc.pos}</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">{acc.keterangan || (acc.pos === 'SALDO CASH' ? 'Uang fisik di kasir' : 'Rekening bank operasional')}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenEditAccount(acc)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                          title="Edit Akun"
                        >
                          <Edit3 size={13} />
                        </button>
                        {!isProtected && (
                          <button
                            onClick={() => handleDeleteAccount(acc)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
                            title="Hapus Akun"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Saldo Berjalan</span>
                      <span className={`font-mono font-black text-base ${colorText}`}>
                        {formatRupiah(balances[acc.pos] ?? acc.balance ?? 0)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 2: Form Sinkronisasi & Kalibrasi Saldo */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 max-w-2xl mx-auto space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="text-brand-emerald" size={20} />
                <span>Sinkronisasi & Kalibrasi Saldo Fisik</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
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
                    <div key={acc.pos || idx} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-300">
                          {acc.label || acc.pos} <span className="text-[10px] text-slate-500 font-mono">({acc.pos})</span>
                        </span>
                        <span className="font-bold text-brand-emerald">
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-brand-emerald"
                      />
                    </div>
                  )
                })}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-brand-emerald hover:bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-xl shadow-lg shadow-brand-emerald/20 transition-all text-sm mt-3"
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
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Form Tambah Diskon Baru */}
            <div className="md:col-span-1 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="text-brand-blue" size={18} />
                  <span>Tambah Diskon</span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Daftarkan promo atau diskon baru untuk digunakan di kasir.</p>
              </div>

              <form onSubmit={handleSaveDiscount} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Nama Diskon / Promo</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PROMO MEMBER"
                    value={discountForm.nama}
                    onChange={(e) => setDiscountForm(prev => ({ ...prev, nama: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-xs uppercase focus:outline-none focus:border-brand-blue"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Tipe Potongan</label>
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
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
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
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-xs focus:outline-none focus:border-brand-blue"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Kategori Berlaku</label>
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
                  className="w-full py-2 bg-brand-blue hover:bg-cyan-500 active:bg-cyan-600 disabled:opacity-50 text-slate-950 font-bold rounded-lg transition-all text-xs"
                >
                  {loading ? 'Menyimpan...' : 'Simpan Promo'}
                </button>
              </form>
            </div>

            {/* List Diskon Terdaftar */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Percent className="text-brand-blue" size={18} />
                  <span>Daftar Diskon Terdaftar</span>
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Daftar promo aktif yang dapat dipilih oleh kasir.</p>
              </div>

              <div className="bg-slate-950/40 border border-slate-850 rounded-xl overflow-hidden divide-y divide-slate-850">
                {discounts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">Belum ada promo/diskon yang didaftarkan.</div>
                ) : (
                  discounts.map((d) => (
                    <div key={d.id_diskon} className="p-3.5 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-extrabold text-white uppercase tracking-wide flex items-center gap-2">
                          <span>{d.nama}</span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-mono bg-slate-850 text-slate-400">
                            {d.kategori === 'Semua' ? 'Cafe & Carwash' : d.kategori}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          Tipe: {d.tipe === 'Persen' ? 'Persentase' : 'Rupiah'}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono font-black text-brand-emerald text-sm">
                          {d.tipe === 'Persen' ? `${d.nominal}%` : formatRupiah(d.nominal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteDiscount(d.id_diskon, d.nama)}
                          className="text-rose-400 hover:text-rose-500 p-1 bg-slate-900 border border-slate-850 rounded-lg"
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
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Lock className="text-brand-emerald" size={20} />
                <span>Master Jenis & Kategori Terkunci (Cashflow & COA)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
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
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-emerald hover:bg-emerald-500 active:scale-[0.98] text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-brand-emerald/20 transition-all"
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
                  ? 'bg-brand-emerald text-slate-950 shadow-md shadow-brand-emerald/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
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
                      ? 'bg-brand-emerald text-slate-950 shadow-md shadow-brand-emerald/20'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{j}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isActive ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Table of Categories */}
          <div className="glass-panel rounded-2xl border border-slate-800/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Nama Kategori</th>
                    <th className="py-3 px-4">Jenis Terkunci</th>
                    <th className="py-3 px-4">Tipe Arus</th>
                    <th className="py-3 px-4">Akun Buku Besar (COA)</th>
                    <th className="py-3 px-4 text-center">Akses Kasir</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredMasterCategories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        <Tag size={32} className="mx-auto text-slate-600 mb-2 opacity-50" />
                        <p className="font-semibold text-slate-400">Belum ada kategori untuk jenis ini ({categoryFilterJenis}).</p>
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
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/30 rounded-xl font-bold text-xs"
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
                        <tr key={cat.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-bold text-white">
                            <div className="flex items-center gap-2">
                              <span>{cat.nama_kategori}</span>
                              {cat.is_active === false && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-400">Nonaktif</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                              isCafe ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
                              isCarwash ? 'bg-brand-blue/10 text-brand-blue border border-brand-blue/20' :
                              isBersama ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' :
                              isCasbon ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              <Lock size={10} />
                              {cat.jenis}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              cat.tipe_arus === 'PEMASUKAN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {cat.tipe_arus}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            {cat.account_id || 'acc_6004'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {cat.boleh_kasir ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-[10px]">
                                Kasir Boleh
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold text-[10px]">
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
                                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                                title="Edit Kategori"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteCategory(cat)}
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
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
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT TAB 7: Tutup Kasir Manual (Susulan EOD) */}
      {activeTab === 'manual-eod' && (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* Header Panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <CalendarCheck className="text-amber-400" size={20} />
                  <span>Tutup Kasir Manual (Rekap Susulan ke Cashflow)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Fitur darurat untuk merekap omzet (Cash & QRIS) serta pengeluaran harian kasir pada tanggal tertentu yang terlewat atau belum sempat di-End Kasir.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchManualEodPreview(manualEodDate)}
                  disabled={manualEodLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
                >
                  <RotateCcw size={13} className={manualEodLoading ? 'animate-spin' : ''} />
                  Segarkan Data
                </button>
              </div>
            </div>

            {/* Input Controls Filter Tanggal & Kasir */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  1. Pilih Tanggal Transaksi
                </label>
                <input
                  type="date"
                  value={manualEodDate}
                  onChange={(e) => setManualEodDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} />
                    <span><strong>Status: Belum Ada Rekap di Cashflow</strong> — Data omzet & pengeluaran untuk tanggal <strong>{manualEodDate}</strong> aman untuk dimasukkan.</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Siap Proses</span>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertCircle size={16} className="text-amber-400 shrink-0" />
                      <span>Perhatian: Tanggal {manualEodDate} sudah memiliki {manualEodData.existingCashflows.length} transaksi rekap di Cashflow!</span>
                    </div>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">Sudah Ada Rekap</span>
                  </div>
                  <div className="pl-6 text-[11px] text-amber-200/80 space-y-1">
                    {manualEodData.existingCashflows.map((cf, idx) => (
                      <div key={cf.id_cashflow || idx} className="flex justify-between border-b border-amber-500/10 pb-1">
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
            <div className="glass-panel p-4.5 rounded-2xl border border-slate-800/80">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Pemasukan Cash (Omzet Tunai)</span>
              <h3 className="text-xl font-black text-brand-emerald mt-1">{formatRupiah(manualEodData.totalCash)}</h3>
              <span className="text-[10px] text-slate-500 mt-1 block">Tujuan: SALDO CASH</span>
            </div>

            <div className="glass-panel p-4.5 rounded-2xl border border-slate-800/80">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Pemasukan QRIS / Transfer</span>
              <h3 className="text-xl font-black text-cyan-400 mt-1">{formatRupiah(manualEodData.totalQris)}</h3>
              <span className="text-[10px] text-slate-500 mt-1 block truncate">Tujuan: {manualEodQrisPos}</span>
            </div>

            <div className="glass-panel p-4.5 rounded-2xl border border-slate-800/80">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Pengeluaran Kasir</span>
              <h3 className="text-xl font-black text-rose-400 mt-1">{formatRupiah(manualEodData.totalExpense)}</h3>
              <span className="text-[10px] text-slate-500 mt-1 block">Sumber: SALDO CASH</span>
            </div>

            <div className="glass-panel p-4.5 rounded-2xl border border-slate-800/80">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Estimasi Kas Bersih Hari Ini</span>
              <h3 className="text-xl font-black text-white mt-1">
                {formatRupiah(manualEodData.totalCash + manualEodData.totalQris - manualEodData.totalExpense)}
              </h3>
              <span className="text-[10px] text-slate-500 mt-1 block">Total Omzet - Beban Kasir</span>
            </div>
          </div>

          {/* Breakdown Tables (Struk Selesai & Pengeluaran Kasir) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Table 1: Struk Selesai */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <FileText size={14} className="text-brand-blue" />
                  Struk Transaksi Lunas ({manualEodData.strukList.length})
                </h4>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  Total: {formatRupiah(manualEodData.totalCash + manualEodData.totalQris)}
                </span>
              </div>

              <div className="overflow-x-auto max-h-60 overflow-y-auto pr-1">
                {manualEodData.strukList.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">Tidak ada struk lunas pada tanggal {manualEodDate}</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-800/80 text-[10px] uppercase">
                        <th className="py-2">No. Struk</th>
                        <th className="py-2">Metode</th>
                        <th className="py-2 text-right">Tagihan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-slate-300">
                      {manualEodData.strukList.map(s => (
                        <tr key={s.id_struk} className="hover:bg-slate-850/30">
                          <td className="py-2 font-mono text-[11px] text-slate-400">{s.id_struk}</td>
                          <td className="py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              s.metode_bayar === 'CASH' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'
                            }`}>
                              {s.metode_bayar}
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-white">
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
            <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowDownRight size={14} className="text-rose-400" />
                  Pengeluaran Kasir ({manualEodData.expenseList.length})
                </h4>
                <span className="text-xs font-mono font-bold text-rose-400">
                  Total: {formatRupiah(manualEodData.totalExpense)}
                </span>
              </div>

              <div className="overflow-x-auto max-h-60 overflow-y-auto pr-1">
                {manualEodData.expenseList.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">Tidak ada pengeluaran kasir pada tanggal {manualEodDate}</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-800/80 text-[10px] uppercase">
                        <th className="py-2">Keterangan</th>
                        <th className="py-2">Kategori</th>
                        <th className="py-2 text-right">Nominal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-slate-300">
                      {manualEodData.expenseList.map(e => (
                        <tr key={e.id_pengeluaran || e.id} className="hover:bg-slate-850/30">
                          <td className="py-2 text-white font-medium">{e.nama_pengeluaran || e.keterangan}</td>
                          <td className="py-2 text-slate-400 text-[11px]">{e.kategori || 'Operasional'}</td>
                          <td className="py-2 text-right font-mono font-bold text-rose-400">
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
          <div className="glass-panel p-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-white">Siap Memasukkan Rekap ke Cashflow?</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Sistem akan membuat 3 entri akuntansi (Omzet Cash, Omzet QRIS, dan Pengeluaran) pada tanggal <strong>{manualEodDate}</strong>.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExecuteManualEod}
              disabled={manualEodProcessing || (manualEodData.totalCash === 0 && manualEodData.totalQris === 0 && manualEodData.totalExpense === 0)}
              className="w-full sm:w-auto px-6 py-3 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 disabled:opacity-50 text-slate-950 font-black rounded-xl shadow-lg shadow-amber-400/20 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl shadow-2xl border border-slate-800 bg-slate-900 text-slate-200 animate-pop-in">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="text-brand-emerald" size={18} />
                <span>{editingCategory ? 'Edit Kategori Terkunci' : 'Tambah Kategori Terkunci Baru'}</span>
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nama Kategori
                </label>
                <input
                  type="text"
                  placeholder="Misal: Bahan Baku F&B, Chemical Snow Wash, Listrik Cafe, Sewa..."
                  value={categoryForm.nama_kategori}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, nama_kategori: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-emerald"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Jenis Pengunci (Kelompok)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCustomCategoryJenis(!isCustomCategoryJenis)}
                      className="text-[11px] text-brand-emerald hover:underline font-medium"
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
                      className="w-full bg-slate-950 border border-brand-emerald rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
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

              <div className="p-3 rounded-xl bg-brand-emerald/5 border border-brand-emerald/20 text-xs text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-brand-emerald">
                  <Lock size={13} />
                  <span>Proteksi Kategori Terkunci:</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Kategori <strong>"{categoryForm.nama_kategori || '...'}"</strong> hanya akan muncul ketika pengguna memilih jenis <strong>"{categoryForm.jenis}"</strong> di form input.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <input
                  type="checkbox"
                  id="chk_boleh_kasir"
                  checked={categoryForm.boleh_kasir}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, boleh_kasir: e.target.checked }))}
                  className="w-4 h-4 text-brand-emerald rounded border-slate-700 bg-slate-900 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="chk_boleh_kasir" className="text-xs text-slate-300 select-none cursor-pointer">
                  <strong className="block text-white font-semibold">Izinkan Kasir Mencatat Kategori Ini di POS</strong>
                  Beri centang jika kasir diperbolehkan mencatat biaya belanja laci kasir untuk kategori ini.
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-brand-emerald hover:bg-emerald-500 active:scale-[0.98] text-slate-950 font-black text-xs shadow-lg shadow-brand-emerald/20 transition-all disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Simpan Kategori'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MASTER AKUN LIKUIDITAS (KAS & BANK) */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl shadow-2xl border border-slate-800 bg-slate-900 text-slate-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="text-brand-blue" size={18} />
                <span>{editingAccount ? 'Edit Akun Likuiditas' : 'Tambah Akun Kas / Bank Baru'}</span>
              </h3>
              <button
                onClick={() => setShowAccountModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Kode / Nama Pos Akun
                </label>
                <input
                  type="text"
                  placeholder="Misal: SALDO REKENING BCA atau BCA OPERASIONAL"
                  value={accountForm.pos}
                  onChange={(e) => setAccountForm(prev => ({ ...prev, pos: e.target.value }))}
                  disabled={!!editingAccount && editingAccount.pos === 'SALDO CASH'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue disabled:opacity-50"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">Kode unik yang dicatat di tabel mutasi cashflow.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Label Tampilan di Dashboard
                </label>
                <input
                  type="text"
                  placeholder="Misal: BCA Operasional Utama, Kasir Laci, Tabungan Owner"
                  value={accountForm.label}
                  onChange={(e) => setAccountForm(prev => ({ ...prev, label: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Saldo Awal (Rp)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={accountForm.balance}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, balance: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Keterangan Singkat
                </label>
                <input
                  type="text"
                  placeholder="Misal: Rekening penampungan EDC & QRIS kasir"
                  value={accountForm.keterangan}
                  onChange={(e) => setAccountForm(prev => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-blue"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-blue hover:bg-cyan-500 text-slate-950 shadow-lg shadow-brand-blue/20 transition-all"
                >
                  {editingAccount ? 'Simpan Akun' : 'Tambah Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: Tambah/Edit Menu & Resep */}
      {showMenuModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-2xl p-6 rounded-2xl shadow-2xl border border-slate-800 max-h-[90vh] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                <h3 className="text-lg font-bold text-white">
                  {isEditingMenu ? 'Edit Menu & Resep' : 'Tambah Menu Baru'}
                </h3>
                <button 
                  onClick={() => setShowMenuModal(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveMenu} className="space-y-4 overflow-y-auto max-h-[60vh] pr-2">
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
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Nama Menu
                    </label>
                    <input
                      type="text"
                      placeholder="Misal: Ice Americano"
                      value={menuForm.nama_menu}
                      onChange={(e) => setMenuForm(prev => ({ ...prev, nama_menu: e.target.value }))}
                      disabled={isEditingMenu}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm disabled:opacity-50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Harga Jual (Rp)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={menuForm.harga}
                      onChange={(e) => setMenuForm(prev => ({ ...prev, harga: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm"
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
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer">
                      <input
                        type="checkbox"
                        checked={menuForm.is_bundling}
                        onChange={(e) => setMenuForm(prev => ({ ...prev, is_bundling: e.target.checked }))}
                        className="rounded border-slate-800 bg-slate-900 text-brand-emerald focus:ring-brand-emerald"
                      />
                      Paket Bundling
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer">
                      <input
                        type="checkbox"
                        checked={menuForm.is_active}
                        onChange={(e) => setMenuForm(prev => ({ ...prev, is_active: e.target.checked }))}
                        className="rounded border-slate-800 bg-slate-900 text-brand-emerald focus:ring-brand-emerald"
                      />
                      Aktif/Jual
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Deskripsi Menu
                  </label>
                  <textarea
                    placeholder="Tulis detail menu..."
                    value={menuForm.deskripsi}
                    onChange={(e) => setMenuForm(prev => ({ ...prev, deskripsi: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm h-16 focus:outline-none"
                  />
                </div>

                {/* Resep List */}
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Resep Bahan Baku Terpakai
                    </span>
                    <button
                      type="button"
                      onClick={handleAddRecipeRow}
                      className="px-3 py-1 bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald font-bold rounded-lg text-xs"
                    >
                      + Tambah Bahan
                    </button>
                  </div>

                  {menuRecipe.map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-center p-2 rounded-xl bg-slate-900/60 border border-slate-850">
                      <div className="flex-1 min-w-[120px]">
                        <CustomSelect
                          value={row.nama_bahan}
                          onChange={(val) => updateRecipeRow(idx, 'nama_bahan', val)}
                          options={stokBahan.map(b => ({ value: b.nama_bahan, label: b.nama_bahan }))}
                          size="xs"
                          variant="emerald"
                          className="w-full"
                        />
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          placeholder="Jumlah"
                          value={row.jumlah_dibutuhkan}
                          onChange={(e) => updateRecipeRow(idx, 'jumlah_dibutuhkan', parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded py-1 px-2 text-white text-xs text-center"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 w-12 font-mono">{row.satuan}</span>
                      <button
                        type="button"
                        onClick={() => removeRecipeRow(idx)}
                        className="text-rose-400 hover:text-rose-500 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </form>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
              <button
                type="button"
                onClick={() => setShowMenuModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                onClick={handleSaveMenu}
                className="px-4 py-2 bg-brand-emerald hover:bg-emerald-500 active:bg-emerald-600 text-slate-950 font-bold rounded-xl text-sm"
              >
                Simpan Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Tambah Bahan Baku Baru */}
      {showIngredientModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl shadow-2xl border border-slate-800">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-lg font-bold text-white">Tambah Bahan Baku Baru</h3>
              <button 
                type="button" 
                onClick={() => {
                  setShowIngredientModal(false)
                  setIngredientForm({ id_bahan_baku: '', nama_bahan: '', stok: 0, satuan: 'Gram/Ml', harga_satuan: 0 })
                }} 
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveIngredient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    ID Bahan Baku
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: BK-01, MB-01"
                    value={ingredientForm.id_bahan_baku}
                    onChange={(e) => setIngredientForm(prev => ({ ...prev, id_bahan_baku: e.target.value.toUpperCase() }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nama Bahan Baku
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Biji Kopi"
                    value={ingredientForm.nama_bahan}
                    onChange={(e) => setIngredientForm(prev => ({ ...prev, nama_bahan: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Harga Satuan (Rp)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={ingredientForm.harga_satuan}
                    onChange={(e) => setIngredientForm(prev => ({ ...prev, harga_satuan: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Stok Awal
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={ingredientForm.stok}
                  onChange={(e) => setIngredientForm(prev => ({ ...prev, stok: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowIngredientModal(false)
                    setIngredientForm({ id_bahan_baku: '', nama_bahan: '', stok: 0, satuan: 'Gram/Ml', harga_satuan: 0 })
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-emerald hover:bg-emerald-500 active:bg-emerald-600 text-slate-950 font-bold rounded-xl text-sm"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl shadow-2xl border border-slate-800">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-lg font-bold text-white">Edit Bahan Baku</h3>
              <button 
                type="button" 
                onClick={() => setEditingIngredient(null)} 
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateIngredient} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    ID Bahan Baku
                  </label>
                  <input
                    type="text"
                    value={editingIngredient.id_bahan_baku}
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono font-bold opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nama Bahan Baku
                  </label>
                  <input
                    type="text"
                    value={editingIngredient.nama_produk}
                    onChange={(e) => setEditingIngredient(prev => ({ ...prev, nama_produk: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
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
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Harga Satuan (Rp)
                  </label>
                  <input
                    type="number"
                    value={editingIngredient.harga_satuan}
                    onChange={(e) => setEditingIngredient(prev => ({ ...prev, harga_satuan: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Stok Saat Ini
                </label>
                <input
                  type="number"
                  value={editingIngredient.stok}
                  onChange={(e) => setEditingIngredient(prev => ({ ...prev, stok: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 text-white text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setEditingIngredient(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold rounded-xl text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-emerald hover:bg-emerald-500 active:bg-emerald-600 text-slate-950 font-bold rounded-xl text-sm"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex justify-center items-center p-4 z-50">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-slate-700 relative">
            <h3 className="text-xl font-bold text-white mb-2">Opname & Kebocoran</h3>
            <p className="text-xs text-slate-400 mb-6 border-b border-slate-800 pb-4">
              Hitung selisih stok aplikasi dengan stok fisik gudang.
            </p>
            
            <div className="space-y-4 mb-6">
              <div className="flex justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                <span className="text-sm font-semibold text-slate-400">Bahan Baku:</span>
                <span className="text-sm font-bold text-white">{opnameIngredient.nama_bahan}</span>
              </div>
              <div className="flex justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                <span className="text-sm font-semibold text-slate-400">Stok Sistem Saat Ini:</span>
                <span className="text-sm font-bold text-brand-blue">{parseFloat(opnameIngredient.stok).toFixed(2)} {opnameIngredient.satuan}</span>
              </div>
            </div>

            <form onSubmit={handleSimpanOpname} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Stok Fisik Gudang ({opnameIngredient.satuan})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={stokFisik}
                  onChange={(e) => setStokFisik(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-brand-emerald transition-colors"
                  placeholder="Masukkan jumlah asli di gudang"
                />
              </div>

              {stokFisik !== '' && !isNaN(parseFloat(stokFisik)) && (
                <div className="p-4 rounded-xl border mt-4 bg-slate-900/50">
                  {(() => {
                    const diff = parseFloat(opnameIngredient.stok) - parseFloat(stokFisik);
                    const isBocor = diff > 0;
                    const isLebih = diff < 0;
                    const nilaiKerugian = Math.abs(diff) * parseFloat(opnameIngredient.harga_satuan || 0);

                    if (diff === 0) {
                      return (
                        <div className="text-brand-emerald text-sm text-center font-bold">
                          Stok Cocok! Tidak ada kebocoran.
                        </div>
                      )
                    }

                    if (isBocor) {
                      return (
                        <div className="space-y-2">
                          <div className="flex justify-between text-rose-400 font-bold text-sm">
                            <span>Selisih Kebocoran:</span>
                            <span>{diff.toFixed(2)} {opnameIngredient.satuan}</span>
                          </div>
                          <div className="flex justify-between text-rose-500 font-black">
                            <span>Estimasi Kerugian:</span>
                            <span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(nilaiKerugian)}</span>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between text-amber-400 font-bold text-sm">
                          <span>Selisih Kelebihan:</span>
                          <span>{Math.abs(diff).toFixed(2)} {opnameIngredient.satuan}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setOpnameIngredient(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-emerald text-slate-950 font-bold rounded-xl text-sm shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all"
                >
                  Update & Sesuaikan Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* CUSTOM MODAL: Alert / Confirm */}
      {customAlert && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="glass-panel w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-slate-800 shadow-[0_0_50px_rgba(16,185,129,0.08)] animate-pop-in text-center">
            <div className="mb-4">
              {customAlert.title === 'Sukses' ? (
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="text-emerald-400" size={24} />
                </div>
              ) : customAlert.title === 'Error' || customAlert.title === 'Hapus Bahan Baku' || customAlert.title === 'Hapus Menu' || customAlert.title === 'Hapus Karyawan' ? (
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
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold rounded-xl text-xs transition-all w-24"
                >
                  Batal
                </button>
              )}
              <button
                type="button"
                onClick={customAlert.onConfirm}
                className={`px-4 py-2 active:scale-95 font-bold rounded-xl text-xs transition-all w-24 ${
                  customAlert.title === 'Error' || customAlert.title === 'Hapus Bahan Baku' || customAlert.title === 'Hapus Menu' || customAlert.title === 'Hapus Karyawan'
                    ? 'bg-rose-500 hover:bg-rose-600 text-white'
                    : 'bg-brand-emerald hover:bg-emerald-500 text-slate-950'
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
