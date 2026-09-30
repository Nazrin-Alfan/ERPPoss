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
  Coffee,
  Search,
  CheckCircle,
  AlertCircle,
  Wallet,
  History,
  TrendingDown,
  RefreshCw,
  Printer,
  FileText,
  Clock,
  User,
  Tag,
  CreditCard,
  DollarSign
} from 'lucide-react'

import ThermalReceiptModal from '../../components/pos/ThermalReceiptModal'
import CustomSelect from '../../components/common/CustomSelect'
import {
  buildOrderReceiptData,
  buildPaymentReceiptData,
  calculateSettlementWithSurcharge,
  getReceiptConfig
} from '../../utils/receiptHelpers'

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
import { isCategoryMatch } from '../../utils/categoryMatchingHelpers'

const getMenuPhoto = (menuName) => {
  const name = String(menuName || '').toLowerCase()
  if (name.includes('le mineral') || name.includes('air mineral')) {
    return 'https://images.unsplash.com/photo-1608885898957-a599fb18ec3f?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('badak')) {
    return 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('americano') || name.includes('espresso')) {
    return 'https://images.unsplash.com/photo-1551030173-122aabc4489c?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('sanger') || name.includes('kopi susu')) {
    return 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('late') || name.includes('latte') || name.includes('cappuccino')) {
    return 'https://images.unsplash.com/photo-1570968915860-54d5c301fc9f?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('teh') || name.includes('tea')) {
    return 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('ayam')) {
    return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('nasi')) {
    return 'https://images.unsplash.com/photo-1617470703128-26a0fc9af10f?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('mie') || name.includes('indomie')) {
    return 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&auto=format&fit=crop&q=60'
  }
  if (name.includes('kentang') || name.includes('fries')) {
    return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&auto=format&fit=crop&q=60'
  }
  return 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&auto=format&fit=crop&q=60'
}

export const CafePOSPage = () => {
  const { profile, activeTenant } = useAuth()
  const effectiveTenantId = activeTenant?.id || profile?.tenant_id || DEFAULT_TENANT_ID

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Master Data
  const [cashiers, setCashiers] = useState(() => (DEFAULT_MASTER_DATA.kasir || []).filter(k => k.is_active))
  const [paymentMethods, setPaymentMethods] = useState(() => (DEFAULT_MASTER_DATA.metode_bayar || []).filter(p => p.is_active))
  const [menuItems, setMenuItems] = useState(() => (DEFAULT_MASTER_DATA.daftar_harga_menu || []).map(m => ({ ...m, nama_menu: m.daftar_menu })))
  const [resepList, setResepList] = useState(() => DEFAULT_MASTER_DATA.resep || [])
  const [diskonList, setDiskonList] = useState([])
  const [masterCategories, setMasterCategories] = useState([])

  // Form Header State
  const [selectedCashier, setSelectedCashier] = useState(() => {
    const active = (DEFAULT_MASTER_DATA.kasir || []).filter(k => k.is_active)
    return active.length > 0 ? (active[0].nama || '').toUpperCase() : ''
  })
  const [selectedPayment, setSelectedPayment] = useState(() => {
    const active = (DEFAULT_MASTER_DATA.metode_bayar || []).filter(p => p.is_active)
    return active.length > 0 ? active[0].nama : 'CASH'
  })

  // Cart & Order State
  const [cart, setCart] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('SEMUA')
  const [searchQuery, setSearchQuery] = useState('')
  const [tableOrCustomer, setTableOrCustomer] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [selectedDiskonId, setSelectedDiskonId] = useState('')
  const [nominalBayar, setNominalBayar] = useState('')

  // Pending Bills State (Pesanan Meja yang belum dibayar)
  const [pendingBills, setPendingBills] = useState([])
  const [showPendingModal, setShowPendingModal] = useState(false)
  const [settlingBill, setSettlingBill] = useState(null)

  // Active Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState(null)

  // Load Data
  const loadMasterData = async () => {
    try {
      const [resKasir, resPayment, resMenu, resResep, resDiskon, resCategories] = await Promise.allSettled([
        supabase.from('kasir').select('*').eq('is_active', true),
        supabase.from('metode_bayar').select('*').eq('is_active', true),
        supabase.from('daftar_harga_menu').select('*'),
        supabase.from('resep').select('*'),
        supabase.from('diskon').select('*').order('created_at', { ascending: false }),
        supabase.from('master_categories').select('*').eq('is_active', true)
      ])

      if (resKasir.status === 'fulfilled' && resKasir.value.data) setCashiers(resKasir.value.data)
      if (resPayment.status === 'fulfilled' && resPayment.value.data) setPaymentMethods(resPayment.value.data)
      if (resMenu.status === 'fulfilled' && resMenu.value.data) {
        setMenuItems(resMenu.value.data.map(m => ({ ...m, nama_menu: m.daftar_menu || m.nama_menu })))
      }
      if (resResep.status === 'fulfilled' && resResep.value.data) setResepList(resResep.value.data)
      if (resDiskon.status === 'fulfilled' && resDiskon.value.data) setDiskonList(resDiskon.value.data)
      if (resCategories.status === 'fulfilled' && resCategories.value.data) setMasterCategories(resCategories.value.data)
    } catch (err) {
      console.error('Error loadMasterData CafePOS:', err)
    }
  }

  // Load Pending Bills
  const loadPendingBills = async () => {
    try {
      const { data } = await supabase
        .from('struk')
        .select('*')
        .eq('status_pembayaran', 'Pending')
        .order('created_at', { ascending: false })

      if (data) setPendingBills(data)
    } catch (err) {
      console.error('Error loadPendingBills CafePOS:', err)
    }
  }

  useEffect(() => {
    loadMasterData()
    loadPendingBills()
  }, [effectiveTenantId])

  // Kategori Menu Dinamis (Diambil dari master_categories di Admin + item menu)
  const categories = useMemo(() => {
    return getCategoriesForPOS({
      type: 'CAFE',
      masterCategories,
      items: menuItems
    })
  }, [masterCategories, menuItems])

  // Filtered Menu List
  const filteredMenu = useMemo(() => {
    return menuItems.filter(item => {
      const matchesSearch = !searchQuery || 
        String(item.nama_menu || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCat = isCategoryMatch(item.kategori, selectedCategory)
      return matchesSearch && matchesCat
    })
  }, [menuItems, searchQuery, selectedCategory])

  // Cart Operations
  const handleAddToCart = (menu) => {
    setCart(prev => cartAdd(prev, menu))
  }

  const handleUpdateQty = (menuName, delta) => {
    setCart(prev => cartUpdate(prev, menuName, delta))
  }

  const handleUpdateNotes = (menuName, note) => {
    setCart(prev => cartUpdateNotes(prev, menuName, note))
  }

  const handleRemoveItem = (menuName) => {
    setCart(prev => cartRemove(prev, menuName))
  }

  const handleClearCart = () => {
    setCart([])
    setSelectedDiskonId('')
    setNominalBayar('')
    setTableOrCustomer('')
    setOrderNotes('')
    setSettlingBill(null)
  }

  // Perhitungan Keuangan Cart
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.harga * item.qty), 0)
  }, [cart])

  const selectedDiskon = useMemo(() => {
    return diskonList.find(d => d.id === selectedDiskonId)
  }, [diskonList, selectedDiskonId])

  const diskonAmount = useMemo(() => {
    if (!selectedDiskon) return 0
    if (selectedDiskon.tipe === 'PERSEN') {
      return (subtotal * (selectedDiskon.nilai || 0)) / 100
    }
    return Number(selectedDiskon.nominal || selectedDiskon.nilai || 0)
  }, [selectedDiskon, subtotal])

  const grandTotal = Math.max(0, subtotal - diskonAmount)
  const kembalian = Math.max(0, (Number(nominalBayar) || 0) - grandTotal)

  // Simpan Pesanan sebagai Pending (Dine-in Order / Bill Meja)
  const handleSaveBill = async () => {
    if (cart.length === 0) return setError('Pilih minimal 1 menu sebelum menyimpan bill.')
    if (!tableOrCustomer.trim()) return setError('Harap masukkan nomor meja atau nama pelanggan.')

    setLoading(true)
    setError('')
    try {
      const todayDate = new Date().toLocaleDateString('en-CA')
      const currentTime = new Date().toTimeString().split(' ')[0]
      const strukId = settlingBill?.id_struk || `BILL-${Date.now().toString().slice(-6)}`

      // 1. Simpan atau Update Header Struk (Status Pending)
      const strukPayload = {
        id_struk: strukId,
        tanggal: todayDate,
        jam: currentTime,
        nama_pelanggan: tableOrCustomer.trim(),
        no_meja: tableOrCustomer.trim(),
        total_biaya: grandTotal,
        subtotal: subtotal,
        diskon: diskonAmount,
        status_pembayaran: 'Pending',
        kasir: selectedCashier || 'KASIR UTAMA',
        catatan: orderNotes,
        created_at: new Date().toISOString()
      }

      if (settlingBill) {
        await supabase
          .from('struk')
          .update(strukPayload)
          .eq('id_struk', settlingBill.id_struk)

        // Hapus item lama lalu masukkan item baru
        await supabase.from('cafe').delete().eq('id_struk', settlingBill.id_struk)
      } else {
        await supabase.from('struk').insert([strukPayload])
      }

      // 2. Simpan Rincian Item Menu
      const itemsPayload = cart.map(item => ({
        id_struk: strukId,
        tanggal: todayDate,
        jam: currentTime,
        daftar_menu: item.nama_menu,
        harga: item.harga,
        qty: item.qty,
        total: item.harga * item.qty,
        catatan: item.catatan || '',
        created_at: new Date().toISOString()
      }))

      const { error: itemsErr } = await supabase.from('cafe').insert(itemsPayload)
      if (itemsErr) throw itemsErr

      setSuccess(true)
      handleClearCart()
      loadPendingBills()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving pending bill:', err)
      setError(err.message || 'Gagal menyimpan pesanan meja')
    } finally {
      setLoading(false)
    }
  }

  // Checkout Pembayaran Selesai (Lunas)
  const handleCheckout = async () => {
    if (cart.length === 0) return setError('Keranjang belanja masih kosong.')
    if (selectedPayment === 'CASH' && (Number(nominalBayar) || 0) < grandTotal) {
      return setError('Nominal pembayaran tunai kurang dari total tagihan.')
    }

    setLoading(true)
    setError('')
    try {
      const todayDate = new Date().toLocaleDateString('en-CA')
      const currentTime = new Date().toTimeString().split(' ')[0]
      const strukId = settlingBill?.id_struk || `STRUK-${Date.now().toString().slice(-6)}`

      // 1. Simpan Header Struk Lunas
      const strukPayload = {
        id_struk: strukId,
        tanggal: todayDate,
        jam: currentTime,
        nama_pelanggan: tableOrCustomer.trim() || 'Pelanggan Walk-In',
        no_meja: tableOrCustomer.trim() || '-',
        total_biaya: grandTotal,
        subtotal: subtotal,
        diskon: diskonAmount,
        metode_pembayaran: selectedPayment,
        nominal_bayar: Number(nominalBayar) || grandTotal,
        kembalian: kembalian,
        status_pembayaran: 'Lunas',
        kasir: selectedCashier || 'KASIR UTAMA',
        catatan: orderNotes,
        created_at: new Date().toISOString()
      }

      if (settlingBill) {
        await supabase
          .from('struk')
          .update(strukPayload)
          .eq('id_struk', settlingBill.id_struk)

        await supabase.from('cafe').delete().eq('id_struk', settlingBill.id_struk)
      } else {
        await supabase.from('struk').insert([strukPayload])
      }

      // 2. Simpan Item Menu
      const itemsPayload = cart.map(item => ({
        id_struk: strukId,
        tanggal: todayDate,
        jam: currentTime,
        daftar_menu: item.nama_menu,
        harga: item.harga,
        qty: item.qty,
        total: item.harga * item.qty,
        catatan: item.catatan || '',
        created_at: new Date().toISOString()
      }))

      const { error: itemsErr } = await supabase.from('cafe').insert(itemsPayload)
      if (itemsErr) throw itemsErr

      // 3. Potong Stok Bahan Baku Resep (BOM Otomatis)
      try {
        for (const item of cart) {
          const resepItems = resepList.filter(r => r.nama_menu === item.nama_menu)
          for (const r of resepItems) {
            const usage = (parseFloat(r.jumlah_dibutuhkan) || 0) * item.qty
            if (usage > 0) {
              const { data: currentBahan } = await supabase
                .from('bahan_baku')
                .select('stok')
                .eq('nama_bahan', r.nama_bahan)
                .single()

              if (currentBahan) {
                const updatedStok = Math.max(0, (parseFloat(currentBahan.stok) || 0) - usage)
                await supabase
                  .from('bahan_baku')
                  .update({ stok: updatedStok })
                  .eq('nama_bahan', r.nama_bahan)
              }
            }
          }
        }
      } catch (bomErr) {
        console.warn('Gagal update BOM bahan baku:', bomErr)
      }

      // 4. Siapkan Data Struk Cetak Thermal
      const receiptConfig = getReceiptConfig()
      if (receiptConfig?.autoPrintOnCheckout !== false) {
        const receiptData = buildPaymentReceiptData({
          receiptNumber: strukId,
          date: todayDate,
          time: currentTime,
          cashier: selectedCashier || 'KASIR',
          customerName: tableOrCustomer || 'Pelanggan Cafe',
          items: cart.map(i => ({
            name: i.nama_menu,
            qty: i.qty,
            price: i.harga,
            subtotal: i.harga * i.qty,
            notes: i.catatan
          })),
          subtotal: subtotal,
          discount: diskonAmount,
          total: grandTotal,
          paymentMethod: selectedPayment,
          cashTendered: Number(nominalBayar) || grandTotal,
          kembalian: kembalian,
          tenantName: activeTenant?.name || 'Cafe RelayPOS'
        })
        setActiveReceipt(receiptData)
      }

      setSuccess(true)
      handleClearCart()
      loadPendingBills()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Checkout error:', err)
      setError(err.message || 'Gagal memproses transaksi kasir')
    } finally {
      setLoading(false)
    }
  }

  // Buka Bill Pending untuk diselesaikan
  const handleOpenPendingBill = async (bill) => {
    try {
      const { data: items } = await supabase
        .from('cafe')
        .select('*')
        .eq('id_struk', bill.id_struk)

      if (items && items.length > 0) {
        setCart(items.map(i => ({
          nama_menu: i.daftar_menu,
          harga: i.harga,
          qty: i.qty,
          catatan: i.catatan
        })))
      }

      setTableOrCustomer(bill.no_meja || bill.nama_pelanggan || '')
      setSelectedCashier(bill.kasir || selectedCashier)
      setSettlingBill(bill)
      setShowPendingModal(false)
    } catch (err) {
      console.error('Error opening bill:', err)
    }
  }

  return (
    <div className="flex flex-col min-h-screen lg:h-[calc(100vh-4rem)] w-full max-w-full bg-canvas text-white overflow-x-hidden">
      {/* TOP BAR: Kasir, Meja, Status Shift */}
      <header className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2.5 bg-surface border-b border-border gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-subsurface border border-border text-primary flex items-center justify-center shrink-0 shadow-xs">
            <Coffee className="w-5 h-5" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-bold text-xs sm:text-sm text-white uppercase tracking-wider leading-tight">
              Kasir Kafe & Resto (POS)
            </h1>
            <p className="text-[11px] text-muted">Katalog Menu F&B & Pengaturan Meja Dine-in</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Kasir Selector */}
          <div className="flex items-center gap-1.5 bg-subsurface px-2.5 py-1 rounded-lg border border-border text-xs">
            <User className="w-3.5 h-3.5 text-muted shrink-0" />
            <CustomSelect
              value={selectedCashier}
              onChange={(val) => setSelectedCashier(val)}
              options={cashiers.map(k => ({ value: (k.nama || '').toUpperCase(), label: k.nama }))}
              size="xs"
              className="w-28 sm:w-32"
            />
          </div>

          {/* Pending Bills Button */}
          <button
            onClick={() => setShowPendingModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-subsurface hover:bg-[#242428] text-white border border-border rounded-lg text-xs font-semibold transition cursor-pointer relative"
          >
            <Clock className="w-3.5 h-3.5 text-warning" />
            <span>Bill Meja</span>
            {pendingBills.length > 0 && (
              <span className="px-1.5 py-0.2 bg-primary text-primary-foreground rounded-full text-[10px] font-mono font-bold">
                {pendingBills.length}
              </span>
            )}
          </button>

          {/* Shift Status Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-subsurface border border-border rounded-lg text-xs text-primary font-mono font-semibold">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span>Shift Aktif</span>
          </div>
        </div>
      </header>

      {/* FEEDBACK BANNER */}
      {error && (
        <div className="bg-destructive/15 border-b border-[#ff5102]/30 p-2.5 px-4 text-xs text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-white hover:text-destructive font-bold text-sm cursor-pointer">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-primary/15 border-b border-primary/30 p-2.5 px-4 text-xs text-primary flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>Transaksi berhasil diproses & dicatat ke laporan!</span>
        </div>
      )}

      {/* WORKSPACE DUA KOLOM */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-x-hidden min-h-0">
        {/* KOLOM KIRI: KATALOG MENU */}
        <section className="flex-1 flex flex-col min-w-0 w-full max-w-full bg-canvas overflow-hidden">
          {/* SEARCH & DYNAMIC CATEGORY FILTER BADGES */}
          <div className="p-3 sm:p-4 border-b border-border space-y-2.5 bg-surface shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kopi, espresso, makanan, cemilan..."
                className="w-full pl-9 pr-3 py-2 bg-subsurface border border-border rounded-lg text-xs text-white placeholder-[#6b7367] focus:outline-none focus:border-primary focus:ring-1 focus:ring-[#00ffff] transition-all"
              />
            </div>

            {/* Dynamic Category Badges from Admin Settings */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 w-full max-w-full flex-nowrap overscroll-x-contain">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer active:scale-[0.98] shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs border border-primary'
                      : 'bg-subsurface text-muted hover:text-white border border-border hover:border-border-hover'
                  }`}
                >
                  {cat === 'ALL' || cat === 'SEMUA' ? 'Semua Menu' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* MENU GRID */}
          <div className="flex-1 p-2 sm:p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 w-full max-w-full min-w-0">
            {filteredMenu.length === 0 ? (
              <div className="col-span-full py-16 flex flex-col items-center justify-center text-muted gap-2">
                <Coffee className="w-10 h-10 text-muted-dark" />
                <p className="text-sm font-semibold text-white">Tidak ada menu ditemukan</p>
                <p className="text-xs text-muted">Coba ganti kata kunci pencarian atau kategori filter</p>
              </div>
            ) : (
              filteredMenu.map(menu => {
                const inCart = cart.find(c => c.nama_menu === menu.nama_menu)
                return (
                  <div
                    key={menu.id || menu.nama_menu}
                    onClick={() => handleAddToCart(menu)}
                    className="group relative flex flex-col bg-surface rounded-xl border border-border hover:border-primary/60 overflow-hidden cursor-pointer hover:shadow-lg active:scale-[0.98] transition-all justify-between"
                  >
                    <div className="aspect-[4/3] w-full bg-subsurface overflow-hidden relative">
                      <img
                        src={menu.foto || getMenuPhoto(menu.nama_menu)}
                        alt={menu.nama_menu}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90 group-hover:opacity-100"
                        loading="lazy"
                      />
                      {inCart && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 flex items-center justify-center bg-primary text-primary-foreground rounded-full text-xs font-bold font-mono shadow-md">
                          +{inCart.qty}
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between">
                      <h3 className="font-bold text-xs text-white line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors">
                        {menu.nama_menu}
                      </h3>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                        <span className="text-xs font-mono font-bold text-primary">
                          {formatRupiah(menu.harga)}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-subsurface text-muted border border-border truncate max-w-[80px]">
                          {menu.kategori || 'Menu'}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* KOLOM KANAN: ORDER SUMMARY & CART */}
        <aside className="w-full lg:w-80 xl:w-96 max-w-full flex flex-col bg-surface border-t lg:border-t-0 lg:border-l border-border shrink-0 h-full">
          {/* HEADER CART */}
          <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-xs uppercase tracking-wider text-white">Detail Pesanan</h2>
              {settlingBill && (
                <span className="px-2 py-0.5 bg-warning/15 border border-[#ffc71f]/30 text-warning rounded text-[10px] font-bold">
                  Selesaikan Meja
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="text-[11px] text-destructive hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          {/* INPUT NO MEJA / NAMA TAMU */}
          <div className="p-3 border-b border-border bg-subsurface shrink-0">
            <label className="text-[11px] font-semibold text-muted block mb-1">
              Nomor Meja / Atas Nama Tamu
            </label>
            <input
              type="text"
              value={tableOrCustomer}
              onChange={(e) => setTableOrCustomer(e.target.value)}
              placeholder="Contoh: Meja 04 / Bpk. Rudi"
              className="w-full px-2.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-white placeholder-[#6b7367] focus:border-primary focus:ring-1 focus:ring-[#00ffff] focus:outline-none font-medium"
            />
          </div>

          {/* ITEM LIST */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <div className="h-full py-10 flex flex-col items-center justify-center text-muted gap-2">
                <Coffee className="w-8 h-8 text-muted-dark opacity-60" />
                <p className="text-xs font-semibold text-white">Keranjang masih kosong</p>
                <p className="text-[11px] text-muted">Pilih menu di sebelah kiri untuk menambah</p>
              </div>
            ) : (
              cart.map(item => (
                <div
                  key={item.nama_menu}
                  className="bg-subsurface p-2.5 rounded-xl border border-border flex flex-col gap-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-white leading-tight truncate">{item.nama_menu}</span>
                    <span className="text-xs font-mono font-bold text-primary shrink-0">
                      {formatRupiah(item.harga * item.qty)}
                    </span>
                  </div>

                  {/* Quantity & Notes Controls */}
                  <div className="flex items-center justify-between pt-1">
                    <input
                      type="text"
                      value={item.catatan || ''}
                      onChange={(e) => handleUpdateNotes(item.nama_menu, e.target.value)}
                      placeholder="Catatan: less sugar, pedas..."
                      className="text-[10px] text-muted placeholder-[#6b7367] bg-transparent border-b border-dotted border-border focus:border-primary focus:outline-none w-32 sm:w-40"
                    />

                    <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-1.5 py-0.5">
                      <button
                        onClick={() => handleUpdateQty(item.nama_menu, -1)}
                        className="text-muted hover:text-destructive transition cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold font-mono px-1 text-white">{item.qty}</span>
                      <button
                        onClick={() => handleUpdateQty(item.nama_menu, 1)}
                        className="text-muted hover:text-primary transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* CHECKOUT CALCULATION & PAYMENT CONTROLS */}
          <div className="p-3 border-t border-border bg-surface space-y-2.5 shrink-0">
            {/* Diskon Selector */}
            {diskonList.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted flex items-center gap-1">
                  <Tag className="w-3 h-3 text-warning" /> Diskon Promo
                </span>
                <CustomSelect
                  value={selectedDiskonId}
                  onChange={(val) => setSelectedDiskonId(val)}
                  options={[
                    { value: '', label: 'Tanpa Diskon' },
                    ...diskonList.map(d => ({
                      value: d.id,
                      label: `${d.nama_diskon} (${d.tipe === 'PERSEN' ? `${d.nilai}%` : formatRupiah(d.nilai)})`
                    }))
                  ]}
                  size="xs"
                  className="w-44"
                />
              </div>
            )}

            {/* Subtotal & Diskon Display */}
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-muted">
                <span>Subtotal Menu</span>
                <span className="font-mono text-white">{formatRupiah(subtotal)}</span>
              </div>
              {diskonAmount > 0 && (
                <div className="flex justify-between text-primary font-medium">
                  <span>Potongan Promo</span>
                  <span className="font-mono">-{formatRupiah(diskonAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-border">
                <span className="text-white">Total Tagihan</span>
                <span className="font-mono text-lg font-bold text-primary">{formatRupiah(grandTotal)}</span>
              </div>
            </div>

            {/* Metode Bayar */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {paymentMethods.map(pm => (
                <button
                  key={pm.id || pm.nama}
                  onClick={() => setSelectedPayment(pm.nama)}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    selectedPayment === pm.nama
                      ? 'bg-primary border-primary text-primary-foreground shadow-xs'
                      : 'bg-subsurface border-border text-muted hover:text-white hover:border-border-hover'
                  }`}
                >
                  {pm.nama}
                </button>
              ))}
            </div>

            {/* Cash Input & Kembalian */}
            {selectedPayment === 'CASH' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={nominalBayar}
                    onChange={(e) => setNominalBayar(e.target.value)}
                    placeholder="Nominal uang diterima..."
                    className="w-full px-2.5 py-1.5 bg-subsurface border border-border rounded-lg text-xs font-mono text-white placeholder-[#6b7367] focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => setNominalBayar(grandTotal)}
                    className="px-2.5 py-1.5 bg-subsurface hover:bg-[#242428] border border-border text-primary text-[11px] font-mono font-bold rounded-lg whitespace-nowrap cursor-pointer transition"
                  >
                    Uang Pas
                  </button>
                </div>
                {Number(nominalBayar) >= grandTotal && (
                  <div className="flex justify-between items-center text-xs bg-subsurface p-2 rounded-lg border border-border">
                    <span className="font-semibold text-muted">Kembalian:</span>
                    <span className="font-mono font-bold text-sm text-primary">{formatRupiah(kembalian)}</span>
                  </div>
                )}
              </div>
            )}

            {/* ACTION BUTTONS: Simpan Meja (Dine-in Pending) & Bayar Langsung */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                disabled={loading}
                onClick={handleSaveBill}
                className="h-11 px-2 bg-subsurface hover:bg-[#242428] text-white border border-border rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Clock className="w-3.5 h-3.5 text-warning" />
                <span>Simpan Meja</span>
              </button>

              <button
                disabled={loading}
                onClick={handleCheckout}
                className="h-11 px-3 bg-primary hover:brightness-110 active:scale-[0.98] text-primary-foreground rounded-xl text-xs font-bold transition shadow-md shadow-[#00ffff]/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" strokeWidth={2.5} />
                <span>{loading ? 'Menyimpan...' : 'Bayar Sekarang'}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL BILL MEJA (PENDING BILLS) */}
      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-lg p-4 sm:p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                <h3 className="font-bold text-sm text-white">Daftar Bill Meja Aktif (Pending)</h3>
              </div>
              <button
                onClick={() => setShowPendingModal(false)}
                className="p-1 rounded-md text-muted hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2.5">
              {pendingBills.length === 0 ? (
                <div className="py-8 text-center text-muted text-xs">
                  Tidak ada bill meja yang sedang menunggu pembayaran.
                </div>
              ) : (
                pendingBills.map(bill => (
                  <div
                    key={bill.id_struk}
                    className="p-3 bg-subsurface rounded-xl border border-border hover:border-primary/50 flex items-center justify-between gap-3 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-white">
                          {bill.no_meja || bill.nama_pelanggan}
                        </span>
                        <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.2 rounded border border-primary/20">
                          {bill.id_struk}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">
                        Waktu: {bill.jam} • Kasir: {bill.kasir}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-xs text-primary">
                        {formatRupiah(bill.total_biaya)}
                      </span>
                      <button
                        onClick={() => handleOpenPendingBill(bill)}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:brightness-110 active:scale-[0.98] transition cursor-pointer"
                      >
                        Selesaikan
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* THERMAL RECEIPT MODAL */}
      {activeReceipt && (
        <ThermalReceiptModal
          receiptData={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  )
}

export default CafePOSPage
