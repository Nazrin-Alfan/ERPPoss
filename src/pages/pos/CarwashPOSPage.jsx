import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { DEFAULT_TENANT_ID } from '../../constants/erpConfig'
import {
  Car,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  Printer,
  Search,
  Plus,
  Trash2,
  Calendar,
  FileText,
  DollarSign,
  ShieldCheck,
  Tag,
  Key,
  CreditCard,
  Sparkles,
  Check,
  CheckCircle2
} from 'lucide-react'

import ThermalReceiptModal from '../../components/pos/ThermalReceiptModal'
import CustomSelect from '../../components/common/CustomSelect'
import {
  buildOrderReceiptData,
  getReceiptConfig
} from '../../utils/receiptHelpers'

import {
  DEFAULT_CARWASH_PACKAGES,
  calculateCarwashPriceAndCommission
} from '../../utils/carwashHelpers'
import {
  generateUUID,
  formatRupiah,
  parseDateSafe
} from '../../utils/helpers'
import { DEFAULT_MASTER_DATA } from '../../constants/masterDataDefaults'
import { getCategoriesForPOS } from '../../utils/posCategoryHelpers'

export const CarwashPOSPage = () => {
  const { profile, activeTenant } = useAuth()
  const effectiveTenantId = activeTenant?.id || profile?.tenant_id || DEFAULT_TENANT_ID

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Master Data
  const [cashiers, setCashiers] = useState(() => (DEFAULT_MASTER_DATA.kasir || []).filter(k => k.is_active))
  const [paymentMethods, setPaymentMethods] = useState(() => (DEFAULT_MASTER_DATA.metode_bayar || []).filter(p => p.is_active))
  const [carwashPackages, setCarwashPackages] = useState(DEFAULT_CARWASH_PACKAGES)
  const [crewList, setCrewList] = useState([])
  const [diskonList, setDiskonList] = useState([])
  const [masterCategories, setMasterCategories] = useState([])

  // Header State
  const [selectedCashier, setSelectedCashier] = useState(() => {
    const active = (DEFAULT_MASTER_DATA.kasir || []).filter(k => k.is_active)
    return active.length > 0 ? (active[0].nama || '').toUpperCase() : ''
  })
  const [selectedPayment, setSelectedPayment] = useState(() => {
    const active = (DEFAULT_MASTER_DATA.metode_bayar || []).filter(p => p.is_active)
    return active.length > 0 ? active[0].nama : 'CASH'
  })

  // Filter & Search
  const [selectedCategory, setSelectedCategory] = useState('SEMUA')
  const [searchQuery, setSearchQuery] = useState('')

  // Form Kendaraan & Layanan Intake
  const [carwashForm, setCarwashForm] = useState({
    kehadiran: 'TUNGGU',
    variant: 'Regular',
    ukuran: 'Small',
    paket: 'PAKET CUCI BIASA',
    anggota1: '',
    anggota2: '',
    platNomor: '',
    model: 'Avanza / Xenia',
    noTelepon: '',
    harga: 50000,
    customHarga: 100000,
    gaji_pencuci: 16000,
    kondisi_bodi: 'Normal',
    barang_berharga: 'Aman',
    catatan_kendaraan: ''
  })

  // Pembayaran & Diskon
  const [selectedDiskonId, setSelectedDiskonId] = useState('')
  const [nominalBayar, setNominalBayar] = useState('')

  // Daftar Kendaraan Sedang Dikerjakan (Antrean Aktif)
  const [activeQueue, setActiveQueue] = useState([])
  const [showQueueModal, setShowQueueModal] = useState(false)
  const [settlingVehicle, setSettlingVehicle] = useState(null)

  // Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState(null)

  // Load Data
  const loadMasterData = async () => {
    try {
      const [resKasir, resPayment, resPackages, resCrew, resDiskon, resCategories] = await Promise.allSettled([
        supabase.from('kasir').select('*').eq('is_active', true),
        supabase.from('metode_bayar').select('*').eq('is_active', true),
        supabase.from('carwash_packages').select('*').eq('is_active', true),
        supabase.from('karyawan_cuci').select('*'),
        supabase.from('diskon').select('*').order('created_at', { ascending: false }),
        supabase.from('master_categories').select('*').eq('is_active', true)
      ])

      if (resKasir.status === 'fulfilled' && resKasir.value.data) setCashiers(resKasir.value.data)
      if (resPayment.status === 'fulfilled' && resPayment.value.data) setPaymentMethods(resPayment.value.data)
      if (resPackages.status === 'fulfilled' && resPackages.value.data && resPackages.value.data.length > 0) {
        setCarwashPackages(resPackages.value.data)
      }
      if (resCrew.status === 'fulfilled' && resCrew.value.data) setCrewList(resCrew.value.data)
      if (resDiskon.status === 'fulfilled' && resDiskon.value.data) setDiskonList(resDiskon.value.data)
      if (resCategories.status === 'fulfilled' && resCategories.value.data) setMasterCategories(resCategories.value.data)
    } catch (err) {
      console.error('Error loadMasterData CarwashPOS:', err)
    }
  }

  const loadActiveQueue = async () => {
    try {
      const { data } = await supabase
        .from('carwash')
        .select('*')
        .eq('status', 'Sedang Cuci')
        .order('created_at', { ascending: false })

      if (data) setActiveQueue(data)
    } catch (err) {
      console.error('Error loadActiveQueue CarwashPOS:', err)
    }
  }

  useEffect(() => {
    loadMasterData()
    loadActiveQueue()
  }, [effectiveTenantId])

  // Kategori Layanan Dinamis (Diambil dari master_categories di Admin + daftar paket)
  const categories = useMemo(() => {
    return getCategoriesForPOS({
      type: 'CARWASH',
      masterCategories,
      items: carwashPackages
    })
  }, [masterCategories, carwashPackages])

  // Filtered Carwash Packages
  const filteredPackages = useMemo(() => {
    return carwashPackages.filter(pkg => {
      const matchesSearch = !searchQuery || 
        String(pkg.nama_paket || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(pkg.deskripsi || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCat = selectedCategory === 'SEMUA' || selectedCategory === 'ALL' || pkg.kategori === selectedCategory
      return matchesSearch && matchesCat
    })
  }, [carwashPackages, searchQuery, selectedCategory])

  // Sinkronisasi Harga & Komisi Dinamis saat Paket atau Ukuran Berubah
  useEffect(() => {
    const selectedPkg = carwashPackages.find(p => p.nama_paket === carwashForm.paket)
    const calc = calculateCarwashPriceAndCommission({
      packageItem: selectedPkg,
      selectedSize: carwashForm.ukuran,
      selectedVariant: carwashForm.variant,
      customPrice: carwashForm.customHarga
    })

    setCarwashForm(prev => ({
      ...prev,
      harga: calc.price,
      gaji_pencuci: calc.commission
    }))
  }, [carwashForm.paket, carwashForm.ukuran, carwashForm.variant, carwashForm.customHarga, carwashPackages])

  // Hitung Diskon & Total
  const subtotal = Number(carwashForm.harga || 0)
  const selectedDiskon = useMemo(() => {
    return diskonList.find(d => String(d.id) === String(selectedDiskonId))
  }, [diskonList, selectedDiskonId])

  const diskonAmount = useMemo(() => {
    if (!selectedDiskon) return 0
    if (selectedDiskon.tipe === 'PERSEN') {
      return (subtotal * Number(selectedDiskon.nilai || 0)) / 100
    }
    return Math.min(subtotal, Number(selectedDiskon.nilai || 0))
  }, [subtotal, selectedDiskon])

  const grandTotal = Math.max(0, subtotal - diskonAmount)
  const kembalian = Math.max(0, (Number(nominalBayar) || 0) - grandTotal)

  // Submit Intake & Bayar
  const handleCheckout = async (isBayarBelakangan = false) => {
    if (!carwashForm.platNomor.trim()) {
      setError('Nomor Plat Kendaraan wajib diisi!')
      return
    }

    if (!selectedCashier) {
      setError('Pilih kasir yang bertugas!')
      return
    }

    if (!isBayarBelakangan && Number(nominalBayar) < grandTotal && selectedPayment === 'CASH') {
      setError(`Nominal pembayaran tunai kurang! Total: ${formatRupiah(grandTotal)}`)
      return
    }

    setLoading(true)
    setError('')

    try {
      const orderId = settlingVehicle?.id_struk || `CW-${Date.now()}`
      const statusBayar = isBayarBelakangan ? 'Pending' : 'Selesai'

      // 1. Simpan ke tabel struk
      const strukPayload = {
        id_struk: orderId,
        kasir: selectedCashier,
        metode_pembayaran: selectedPayment,
        subtotal: subtotal,
        diskon: diskonAmount,
        total: grandTotal,
        nominal_bayar: isBayarBelakangan ? 0 : (Number(nominalBayar) || grandTotal),
        kembalian: isBayarBelakangan ? 0 : kembalian,
        status_pembayaran: statusBayar,
        no_meja: `Bay ${carwashForm.kehadiran}`,
        nama_pelanggan: carwashForm.platNomor.toUpperCase(),
        tenant_id: effectiveTenantId
      }

      const { error: strukErr } = await supabase.from('struk').upsert(strukPayload)
      if (strukErr) throw strukErr

      // 2. Simpan ke tabel carwash
      const carwashPayload = {
        id_struk: orderId,
        plat_nomor: carwashForm.platNomor.toUpperCase(),
        model: carwashForm.model,
        ukuran: carwashForm.ukuran,
        paket: carwashForm.paket,
        variant: carwashForm.variant,
        harga: subtotal,
        anggota_1: carwashForm.anggota1,
        anggota_2: carwashForm.anggota2 || null,
        gaji_pencuci: carwashForm.gaji_pencuci,
        kehadiran: carwashForm.kehadiran,
        no_telepon: carwashForm.noTelepon || '',
        catatan_kendaraan: carwashForm.catatan_kendaraan || '',
        status: isBayarBelakangan ? 'Sedang Cuci' : 'Selesai',
        tenant_id: effectiveTenantId
      }

      const { error: cwErr } = await supabase.from('carwash').insert([carwashPayload])
      if (cwErr) throw cwErr

      // 3. Struk data
      const receiptData = buildOrderReceiptData({
        orderNumber: orderId,
        kasir: selectedCashier,
        tableOrQueueNumber: `Cuci ${carwashForm.kehadiran}`,
        customerName: carwashForm.platNomor.toUpperCase(),
        cart: [],
        hasCarwash: true,
        carwashForm: carwashForm,
        effectiveDiskonNominal: diskonAmount,
        selectedDiskon: selectedDiskon,
        total: grandTotal,
        paymentMethod: selectedPayment,
        cashTendered: Number(nominalBayar) || grandTotal,
        kembalian: kembalian,
        tenantName: activeTenant?.name || 'Carwash RelayPOS'
      })

      setActiveReceipt(receiptData)
      setSuccess(true)
      // Reset form
      setCarwashForm(prev => ({
        ...prev,
        platNomor: '',
        noTelepon: '',
        catatan_kendaraan: ''
      }))
      setNominalBayar('')
      setSelectedDiskonId('')
      setSettlingVehicle(null)
      loadActiveQueue()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Checkout error CarwashPOS:', err)
      setError(err.message || 'Gagal memproses transaksi carwash')
    } finally {
      setLoading(false)
    }
  }

  // Pilih Kendaraan dari antrean untuk diselesaikan pembayaran
  const handleSelectSettlingVehicle = (item) => {
    setSettlingVehicle(item)
    setCarwashForm(prev => ({
      ...prev,
      platNomor: item.plat_nomor,
      model: item.model || 'Avanza / Xenia',
      ukuran: item.ukuran || 'Small',
      paket: item.paket || 'PAKET CUCI BIASA',
      anggota1: item.anggota_1 || '',
      anggota2: item.anggota_2 || '',
      noTelepon: item.no_telepon || '',
      harga: item.harga || 50000
    }))
    setShowQueueModal(false)
  }

  return (
    <div className="flex flex-col min-h-screen lg:h-[calc(100vh-4rem)] w-full max-w-full bg-canvas text-white overflow-x-hidden">
      {/* TOP HEADER */}
      <header className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2.5 bg-surface border-b border-border gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-subsurface border border-border text-primary flex items-center justify-center shrink-0 shadow-xs">
            <Car className="w-5 h-5" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-bold text-xs sm:text-sm text-white uppercase tracking-wider leading-tight">
              Kasir Layanan Cuci Mobil (POS)
            </h1>
            <p className="text-[11px] text-muted">Intake Kendaraan, Paket Layanan & Penugasan Kru Cuci</p>
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

          {/* Antrean Bay Button */}
          <button
            onClick={() => setShowQueueModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-subsurface hover:bg-[#242428] text-white border border-border rounded-lg text-xs font-semibold transition cursor-pointer relative"
          >
            <Clock className="w-3.5 h-3.5 text-warning" />
            <span>Antrean Pengerjaan</span>
            {activeQueue.length > 0 && (
              <span className="px-1.5 py-0.2 bg-primary text-primary-foreground rounded-full text-[10px] font-mono font-bold">
                {activeQueue.length}
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

      {/* ALERT / NOTIFIKASI */}
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
          <span>Kendaraan berhasil didaftarkan ke antrean cuci & struk tercetak!</span>
        </div>
      )}

      {/* WORKSPACE DUA KOLOM */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-x-hidden min-h-0">
        {/* KOLOM KIRI: INTAKE KENDARAAN & KATALOG PAKET */}
        <section className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-3.5 bg-canvas w-full max-w-full">
          {/* KARTU 1: IDENTITAS KENDARAAN & PELANGGAN */}
          <div className="bg-surface p-3.5 sm:p-4 rounded-xl border border-border space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Car className="w-4 h-4 text-primary" /> Identitas Kendaraan & Pelanggan
              </h2>
              {/* OPSI KEHADIRAN (TUNGGU / TINGGAL) */}
              <div className="flex items-center gap-1.5">
                {['TUNGGU', 'TINGGAL'].map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setCarwashForm(prev => ({ ...prev, kehadiran: status }))}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      carwashForm.kehadiran === status
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-subsurface text-muted hover:text-white border border-border'
                    }`}
                  >
                    {status === 'TUNGGU' ? 'Ditunggu' : 'Kunci Ditinggal'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">
                  Nomor Plat Kendaraan <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={carwashForm.platNomor}
                  onChange={(e) => setCarwashForm(prev => ({ ...prev, platNomor: e.target.value.toUpperCase() }))}
                  placeholder="BK 1234 ABC"
                  className="w-full px-3 py-2 bg-subsurface border border-border rounded-lg text-sm font-mono font-bold tracking-wider uppercase text-white placeholder-[#6b7367] focus:border-primary focus:ring-1 focus:ring-[#00ffff] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">
                  Model / Jenis Unit
                </label>
                <input
                  type="text"
                  value={carwashForm.model}
                  onChange={(e) => setCarwashForm(prev => ({ ...prev, model: e.target.value }))}
                  placeholder="Avanza, Innova, Fortuner..."
                  className="w-full px-3 py-2 bg-subsurface border border-border rounded-lg text-xs text-white placeholder-[#6b7367] focus:border-primary focus:ring-1 focus:ring-[#00ffff] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1">
                  WhatsApp Pelanggan (Notif)
                </label>
                <input
                  type="text"
                  value={carwashForm.noTelepon}
                  onChange={(e) => setCarwashForm(prev => ({ ...prev, noTelepon: e.target.value }))}
                  placeholder="0812xxxxxxx"
                  className="w-full px-3 py-2 bg-subsurface border border-border rounded-lg text-xs font-mono text-white placeholder-[#6b7367] focus:border-primary focus:ring-1 focus:ring-[#00ffff] focus:outline-none"
                />
              </div>
            </div>

            {/* UKURAN KENDARAAN & PENUGASAN KRU */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
              {/* Ukuran Kendaraan */}
              <div>
                <label className="text-[11px] font-semibold text-muted block mb-1.5">Ukuran Kendaraan</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['Small', 'Medium', 'Large', 'Extra Large'].map(sz => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setCarwashForm(prev => ({ ...prev, ukuran: sz }))}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        carwashForm.ukuran === sz
                          ? 'bg-primary border-primary text-primary-foreground font-bold shadow-xs'
                          : 'bg-subsurface border-border hover:border-border-hover text-muted hover:text-white'
                      }`}
                    >
                      {sz === 'Extra Large' ? 'XL' : sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Penugasan Kru Cuci */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">Pencuci Utama (Kru 1)</label>
                  <select
                    value={carwashForm.anggota1}
                    onChange={(e) => setCarwashForm(prev => ({ ...prev, anggota1: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-subsurface border border-border rounded-lg text-xs text-white focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">Pilih Kru 1</option>
                    {crewList.map(c => (
                      <option key={c.id || c.nama} value={c.nama}>{c.nama}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted block mb-1">Kru 2 (Opsional)</label>
                  <select
                    value={carwashForm.anggota2}
                    onChange={(e) => setCarwashForm(prev => ({ ...prev, anggota2: e.target.value }))}
                    className="w-full px-2.5 py-1.5 bg-subsurface border border-border rounded-lg text-xs text-white focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">Tidak Ada</option>
                    {crewList.map(c => (
                      <option key={c.id || c.nama} value={c.nama}>{c.nama}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* KARTU 2: SEARCH & DYNAMIC CATEGORY FILTER BADGES */}
          <div className="bg-surface p-3 sm:p-4 rounded-xl border border-border space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center justify-between">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari paket cuci, hidrolik, poles, detailing..."
                  className="w-full pl-9 pr-3 py-2 bg-subsurface border border-border rounded-lg text-xs text-white placeholder-[#6b7367] focus:outline-none focus:border-primary focus:ring-1 focus:ring-[#00ffff] transition-all"
                />
              </div>
            </div>

            {/* Dynamic Category Badges from Admin Settings */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 max-w-full flex-nowrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer active:scale-[0.98] ${
                    selectedCategory === cat
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs border border-primary'
                      : 'bg-subsurface text-muted hover:text-white border border-border hover:border-border-hover'
                  }`}
                >
                  {cat === 'ALL' || cat === 'SEMUA' ? 'Semua Layanan' : cat}
                </button>
              ))}
            </div>

            {/* GRID PAKET LAYANAN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {filteredPackages.map(pkg => {
                const isSelected = carwashForm.paket === pkg.nama_paket
                const sizeKey = `harga_${carwashForm.ukuran.toLowerCase().replace(' ', '_')}`
                const calculatedPrice = pkg[sizeKey] || pkg.harga_small || 50000

                return (
                  <div
                    key={pkg.id || pkg.nama_paket}
                    onClick={() => setCarwashForm(prev => ({ ...prev, paket: pkg.nama_paket }))}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all active:scale-[0.98] flex flex-col justify-between group ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-sm shadow-[#00ffff]/10'
                        : 'border-border bg-subsurface hover:border-primary/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-surface text-primary border border-border'
                          }`}>
                            <Sparkles size={14} />
                          </div>
                          <span className="font-bold text-xs text-white group-hover:text-primary transition-colors">
                            {pkg.nama_paket}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted mt-1.5 line-clamp-2">
                        {pkg.deskripsi || 'Layanan cuci & perawatan kendaraan berkualitas premium.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface text-muted border border-border">
                        {pkg.kategori || 'Cuci Mobil'}
                      </span>
                      <span className="text-xs font-mono font-bold text-primary">
                        {formatRupiah(calculatedPrice)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* KOLOM KANAN: ORDER SUMMARY & CHECKOUT */}
        <aside className="w-full lg:w-80 xl:w-96 max-w-full flex flex-col bg-surface border-t lg:border-t-0 lg:border-l border-border shrink-0 h-full">
          {/* HEADER SUMMARY */}
          <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-xs uppercase tracking-wider text-white">Ringkasan Layanan</h2>
              {settlingVehicle && (
                <span className="px-2 py-0.5 bg-warning/15 border border-[#ffc71f]/30 text-warning rounded text-[10px] font-bold">
                  Selesaikan Antrean
                </span>
              )}
            </div>
            {carwashForm.platNomor && (
              <button
                onClick={() => setCarwashForm(prev => ({ ...prev, platNomor: '', noTelepon: '', catatan_kendaraan: '' }))}
                className="text-[11px] text-destructive hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          {/* ITEM YANG SEDANG DILAYANI */}
          <div className="p-3 border-b border-border bg-subsurface shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Plat Kendaraan:</span>
              <span className="font-mono font-bold text-sm text-primary bg-surface px-2 py-0.5 rounded border border-border">
                {carwashForm.platNomor || 'BELUM DIISI'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Paket Terpilih:</span>
              <span className="font-semibold text-white truncate max-w-[170px]">{carwashForm.paket}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Ukuran & Kru:</span>
              <span className="text-muted font-medium">
                {carwashForm.ukuran} • {carwashForm.anggota1 || 'Kru Cuci'}
              </span>
            </div>
          </div>

          {/* CHECKOUT CALCULATION & PAYMENT CONTROLS */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
                      label: `${d.nama_diskon || d.nama} (${d.tipe === 'PERSEN' ? `${d.nilai}%` : formatRupiah(d.nilai)})`
                    }))
                  ]}
                  size="xs"
                  className="w-44"
                />
              </div>
            )}

            {/* Subtotal & Diskon Display */}
            <div className="space-y-1.5 text-xs bg-subsurface p-3 rounded-xl border border-border">
              <div className="flex justify-between text-muted">
                <span>Tarif Layanan</span>
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
            <div>
              <label className="text-[11px] font-semibold text-muted block mb-1.5">Metode Pembayaran</label>
              <div className="grid grid-cols-3 gap-1.5">
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
          </div>

          {/* ACTION BUTTONS: Bayar Nanti (Masuk Bay) & Bayar Selesai */}
          <div className="p-3 border-t border-border bg-surface shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={loading}
                onClick={() => handleCheckout(true)}
                className="h-11 px-2 bg-subsurface hover:bg-[#242428] text-white border border-border rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Clock className="w-3.5 h-3.5 text-warning" />
                <span>Bayar Nanti</span>
              </button>

              <button
                disabled={loading}
                onClick={() => handleCheckout(false)}
                className="h-11 px-3 bg-primary hover:brightness-110 active:scale-[0.98] text-primary-foreground rounded-xl text-xs font-bold transition shadow-md shadow-[#00ffff]/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" strokeWidth={2.5} />
                <span>{loading ? 'Menyimpan...' : 'Bayar Selesai'}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL ANTREAN PENGERJAAN */}
      {showQueueModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg border border-border overflow-hidden p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-warning" />
                <h3 className="font-bold text-sm text-white">Kendaraan Sedang Dikerjakan (Antrean Bay)</h3>
              </div>
              <button
                onClick={() => setShowQueueModal(false)}
                className="p-1 rounded-md text-muted hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2.5">
              {activeQueue.length === 0 ? (
                <div className="py-8 text-center text-muted text-xs">
                  Tidak ada kendaraan di bay saat ini.
                </div>
              ) : (
                activeQueue.map(item => (
                  <div
                    key={item.id_struk || item.id}
                    className="p-3 bg-subsurface rounded-xl border border-border hover:border-primary/50 flex justify-between items-center gap-3 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-primary bg-surface px-2 py-0.5 rounded border border-border">
                          {item.plat_nomor}
                        </span>
                        <span className="text-[10px] font-mono text-warning bg-warning/10 px-1.5 py-0.2 rounded border border-[#ffc71f]/20">
                          {item.kehadiran || 'TUNGGU'}
                        </span>
                      </div>
                      <p className="text-xs text-white mt-1">{item.model} • {item.paket}</p>
                      <p className="text-[11px] text-muted mt-0.5">Kru: {item.anggota_1} {item.anggota_2 ? `& ${item.anggota_2}` : ''}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-xs text-primary">
                        {formatRupiah(item.harga)}
                      </span>
                      <button
                        onClick={() => handleSelectSettlingVehicle(item)}
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

      {/* STRUK THERMAL MODAL */}
      {activeReceipt && (
        <ThermalReceiptModal
          receiptData={activeReceipt}
          onClose={() => setActiveReceipt(null)}
        />
      )}
    </div>
  )
}

export default CarwashPOSPage
