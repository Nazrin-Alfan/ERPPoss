import { InventoryTable } from '../components/ui/tables'
import React, { useState, useEffect, useMemo } from 'react'
import { 
  Boxes, 
  Package, 
  Search, 
  Plus, 
  ArrowDownRight, 
  ArrowUpRight, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Coffee, 
  Car, 
  ShoppingBag, 
  Edit2, 
  Trash2, 
  History, 
  X,
  SlidersHorizontal,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  Barcode
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getTenantFeatures } from '../utils/businessCapabilities'
import { formatRupiah } from '../utils/helpers'

// Default seed data jika tabel stok_barang masih kosong
const DEFAULT_GUDANG_DATA = [
  // 1. GUDANG CAFE (F&B)
  { id_barang: 'CF-01', id_bahan_baku: 'CF-01', nama_barang: 'Biji Kopi Arabica Gayo', nama_produk: 'Biji Kopi Arabica Gayo', gudang: 'CAFE', kategori: 'Biji Kopi', stok: 4500, satuan: 'Gram', harga_beli: 250, harga_jual: 0, min_stok: 1000 },
  { id_barang: 'CF-02', id_bahan_baku: 'CF-02', nama_barang: 'Susu UHT Fresh Full Cream', nama_produk: 'Susu UHT Fresh Full Cream', gudang: 'CAFE', kategori: 'Dairy & Milk', stok: 24, satuan: 'Liter', harga_beli: 18500, harga_jual: 0, min_stok: 6 },
  { id_barang: 'CF-03', id_bahan_baku: 'CF-03', nama_barang: 'Sirup Karamel Monin', nama_produk: 'Sirup Karamel Monin', gudang: 'CAFE', kategori: 'Sirup & Flavour', stok: 3, satuan: 'Botol', harga_beli: 145000, harga_jual: 0, min_stok: 2 },
  { id_barang: 'CF-04', id_bahan_baku: 'CF-04', nama_barang: 'Paper Cup & Tutup 12oz', nama_produk: 'Paper Cup & Tutup 12oz', gudang: 'CAFE', kategori: 'Kemasan & Packaging', stok: 350, satuan: 'Pcs', harga_beli: 850, harga_jual: 0, min_stok: 100 },
  { id_barang: 'CF-05', id_bahan_baku: 'CF-05', nama_barang: 'Gula Cair Fruktosa', nama_produk: 'Gula Cair Fruktosa', gudang: 'CAFE', kategori: 'Pemanis', stok: 8, satuan: 'Liter', harga_beli: 22000, harga_jual: 0, min_stok: 3 },
  { id_barang: 'CF-06', id_bahan_baku: 'CF-06', nama_barang: 'Biji Kopi Robusta Lampung', nama_produk: 'Biji Kopi Robusta Lampung', gudang: 'CAFE', kategori: 'Biji Kopi', stok: 2800, satuan: 'Gram', harga_beli: 160, harga_jual: 0, min_stok: 1000 },

  // 2. GUDANG CARWASH (Chemicals & Consumables)
  { id_barang: 'CW-01', id_bahan_baku: 'CW-01', nama_barang: 'Shampo Snow Foam Carwash Super', nama_produk: 'Shampo Snow Foam Carwash Super', gudang: 'CARWASH', kategori: 'Chemical Cuci', stok: 120, satuan: 'Liter', harga_beli: 12000, harga_jual: 0, min_stok: 30 },
  { id_barang: 'CW-02', id_bahan_baku: 'CW-02', nama_barang: 'Semir Ban Silikon Curah (Tire Gel)', nama_produk: 'Semir Ban Silikon Curah (Tire Gel)', gudang: 'CARWASH', kategori: 'Chemical Cuci', stok: 45, satuan: 'Liter', harga_beli: 28000, harga_jual: 0, min_stok: 15 },
  { id_barang: 'CW-03', id_bahan_baku: 'CW-03', nama_barang: 'Degreaser Mesin & Velg', nama_produk: 'Degreaser Mesin & Velg', gudang: 'CARWASH', kategori: 'Chemical Khusus', stok: 18, satuan: 'Liter', harga_beli: 35000, harga_jual: 0, min_stok: 5 },
  { id_barang: 'CW-04', id_bahan_baku: 'CW-04', nama_barang: 'Cairan Wax Pengkilap Bodi (Spray On)', nama_produk: 'Cairan Wax Pengkilap Bodi (Spray On)', gudang: 'CARWASH', kategori: 'Finishing & Wax', stok: 12, satuan: 'Liter', harga_beli: 55000, harga_jual: 0, min_stok: 4 },
  { id_barang: 'CW-05', id_bahan_baku: 'CW-05', nama_barang: 'Kanebo Lap Serap Basah Kru Cuci', nama_produk: 'Kanebo Lap Serap Basah Kru Cuci', gudang: 'CARWASH', kategori: 'Peralatan Operasional', stok: 15, satuan: 'Pcs', harga_beli: 14000, harga_jual: 0, min_stok: 8 },

  // 3. GUDANG MERCHANDISE (Retail Finished Goods)
  { id_barang: 'MCH-01', id_bahan_baku: 'MCH-01', nama_barang: 'Parfum Mobil Aroma Kopi Bali', nama_produk: 'Parfum Mobil Aroma Kopi Bali', gudang: 'MERCHANDISE', kategori: 'Parfum Mobil', stok: 25, satuan: 'Botol', harga_beli: 18000, harga_jual: 35000, min_stok: 5 },
  { id_barang: 'MCH-02', id_bahan_baku: 'MCH-02', nama_barang: 'Kain Microfiber Premium 40x40', nama_produk: 'Kain Microfiber Premium 40x40', gudang: 'MERCHANDISE', kategori: 'Lap & Perawatan', stok: 40, satuan: 'Pcs', harga_beli: 12000, harga_jual: 25000, min_stok: 10 },
  { id_barang: 'MCH-03', id_bahan_baku: 'MCH-03', nama_barang: 'Lap Kanebo Chamois Super Serap', nama_produk: 'Lap Kanebo Chamois Super Serap', gudang: 'MERCHANDISE', kategori: 'Lap & Perawatan', stok: 30, satuan: 'Pcs', harga_beli: 15000, harga_jual: 30000, min_stok: 8 },
  { id_barang: 'MCH-04', id_bahan_baku: 'MCH-04', nama_barang: 'Semir Ban Spray Glossy 250ml', nama_produk: 'Semir Ban Spray Glossy 250ml', gudang: 'MERCHANDISE', kategori: 'Aksesoris & Detailing', stok: 18, satuan: 'Botol', harga_beli: 22000, harga_jual: 45000, min_stok: 5 },
  { id_barang: 'MCH-05', id_bahan_baku: 'MCH-05', nama_barang: 'Parfum Gantung Aroma Vanila', nama_produk: 'Parfum Gantung Aroma Vanila', gudang: 'MERCHANDISE', kategori: 'Parfum Mobil', stok: 50, satuan: 'Pcs', harga_beli: 9000, harga_jual: 20000, min_stok: 10 },
  { id_barang: 'MCH-06', id_bahan_baku: 'MCH-06', nama_barang: 'Gantungan Kunci & Bantal Leher', nama_produk: 'Gantungan Kunci & Bantal Leher', gudang: 'MERCHANDISE', kategori: 'Aksesoris & Detailing', stok: 12, satuan: 'Set', harga_beli: 35000, harga_jual: 65000, min_stok: 3 }
]

export default function Gudang() {
  const { profile, activeTenant } = useAuth()
  const isOwnerOrAdmin = profile?.role === 'Owner' || profile?.role === 'Admin' || profile?.role === 'Super Admin'
  const features = getTenantFeatures(activeTenant?.business_type)

  // Tab Gudang Aktif: 'CAFE' | 'CARWASH' | 'MERCHANDISE'
  const defaultGudang = features.isCarwashOnly ? 'CARWASH' : 'CAFE'
  const [activeGudang, setActiveGudang] = useState(defaultGudang)

  useEffect(() => {
    if (features.isCarwashOnly && activeGudang === 'CAFE') {
      setActiveGudang('CARWASH')
    } else if (features.isCafeOnly && activeGudang === 'CARWASH') {
      setActiveGudang('CAFE')
    }
  }, [features.isCarwashOnly, features.isCafeOnly])

  // Data Stok
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [stockStatusFilter, setStockStatusFilter] = useState('ALL') // ALL, SAFE, LOW, EMPTY
  const [selectedKategori, setSelectedKategori] = useState('ALL')

  // Modals
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [showRestockModal, setShowRestockModal] = useState(false)
  const [restockTarget, setRestockTarget] = useState(null)
  const [restockQty, setRestockQty] = useState('')
  const [restockCost, setRestockCost] = useState('')
  const [showOpnameModal, setShowOpnameModal] = useState(false)
  const [opnameTarget, setOpnameTarget] = useState(null)
  const [opnameRealQty, setOpnameRealQty] = useState('')
  const [opnameCatatan, setOpnameCatatan] = useState('')

  // Form State untuk Tambah / Edit Barang
  const [itemForm, setItemForm] = useState({
    id_barang: '',
    nama_barang: '',
    kategori: '',
    satuan: 'Pcs',
    harga_beli: '',
    harga_jual: '',
    min_stok: 5,
    gudang: 'CAFE'
  })

  // Load Inventory Data
  const loadInventory = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: fetchErr } = await supabase
        .from('stok_barang')
        .select('*')
        .order('nama_produk', { ascending: true })

      if (fetchErr) throw fetchErr

      if (data && data.length > 0) {
        // Normalisasi data dengan gudang mapper jika belum ada properti gudang
        const mapped = data.map(item => {
          let determinedGudang = item.gudang
          if (!determinedGudang) {
            const namaLow = String(item.nama_produk || item.nama_barang || '').toLowerCase()
            const katLow = String(item.kategori || '').toLowerCase()
            if (katLow.includes('merchandise') || katLow.includes('retail') || namaLow.includes('parfum') || namaLow.includes('microfiber')) {
              determinedGudang = 'MERCHANDISE'
            } else if (katLow.includes('cuci') || namaLow.includes('shampo') || namaLow.includes('semir') || namaLow.includes('degreaser') || namaLow.includes('carwash')) {
              determinedGudang = 'CARWASH'
            } else {
              determinedGudang = 'CAFE'
            }
          }
          return {
            ...item,
            id_barang: item.id_barang || item.id_bahan_baku,
            nama_barang: item.nama_produk || item.nama_barang,
            gudang: determinedGudang,
            harga_beli: item.harga_beli || item.harga_satuan || item.hpp || 0,
            harga_jual: item.harga_jual || item.harga || 0,
            min_stok: item.min_stok !== undefined ? item.min_stok : 5
          }
        })
        setInventory(mapped)
      } else {
        setInventory(DEFAULT_GUDANG_DATA)
      }
    } catch (err) {
      console.warn('Fallback to local default warehouse data:', err)
      setInventory(DEFAULT_GUDANG_DATA)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInventory()
  }, [])

  // Filter Items per Gudang Aktif
  const gudangItems = useMemo(() => {
    return inventory.filter(item => (item.gudang || 'CAFE') === activeGudang)
  }, [inventory, activeGudang])

  // Kategori list unik di gudang aktif
  const kategoriList = useMemo(() => {
    const cats = new Set(gudangItems.map(i => i.kategori).filter(Boolean))
    return ['ALL', ...Array.from(cats)]
  }, [gudangItems])

  // Filtered Items berdasarkan Search, Kategori & Status Stok
  const filteredItems = useMemo(() => {
    return gudangItems.filter(item => {
      // 1. Search Query
      const q = searchQuery.toLowerCase().trim()
      const matchSearch = !q || 
        (item.nama_barang || '').toLowerCase().includes(q) ||
        (item.id_barang || '').toLowerCase().includes(q) ||
        (item.kategori || '').toLowerCase().includes(q)

      // 2. Kategori Filter
      const matchKategori = selectedKategori === 'ALL' || item.kategori === selectedKategori

      // 3. Status Stok Filter
      const stokNum = parseFloat(item.stok) || 0
      const minNum = parseFloat(item.min_stok) || 5
      let matchStatus = true
      if (stockStatusFilter === 'SAFE') matchStatus = stokNum > minNum
      if (stockStatusFilter === 'LOW') matchStatus = stokNum > 0 && stokNum <= minNum
      if (stockStatusFilter === 'EMPTY') matchStatus = stokNum <= 0

      return matchSearch && matchKategori && matchStatus
    })
  }, [gudangItems, searchQuery, selectedKategori, stockStatusFilter])

  // Ringkasan KPI Gudang Aktif
  const kpiStats = useMemo(() => {
    const totalItems = gudangItems.length
    const totalAssetValue = gudangItems.reduce((sum, item) => {
      const qty = Math.max(0, parseFloat(item.stok) || 0)
      const cost = parseFloat(item.harga_beli) || 0
      return sum + (qty * cost)
    }, 0)

    const lowStockCount = gudangItems.filter(i => {
      const s = parseFloat(i.stok) || 0
      const m = parseFloat(i.min_stok) || 5
      return s > 0 && s <= m
    }).length

    const emptyStockCount = gudangItems.filter(i => (parseFloat(i.stok) || 0) <= 0).length

    return {
      totalItems,
      totalAssetValue,
      lowStockCount,
      emptyStockCount
    }
  }, [gudangItems])

  // Handler Buka Modal Tambah Barang
  const handleOpenAddModal = () => {
    setEditingItem(null)
    const nextId = `${activeGudang.substring(0, 2)}-${String(gudangItems.length + 1).padStart(2, '0')}`
    setItemForm({
      id_barang: nextId,
      nama_barang: '',
      kategori: activeGudang === 'MERCHANDISE' ? 'Parfum Mobil' : activeGudang === 'CARWASH' ? 'Chemical Cuci' : 'Biji Kopi',
      satuan: activeGudang === 'CAFE' ? 'Gram' : activeGudang === 'CARWASH' ? 'Liter' : 'Pcs',
      harga_beli: '',
      harga_jual: activeGudang === 'MERCHANDISE' ? '' : 0,
      min_stok: 5,
      gudang: activeGudang
    })
    setShowItemModal(true)
  }

  // Handler Buka Modal Edit Barang
  const handleOpenEditModal = (item) => {
    setEditingItem(item)
    setItemForm({
      id_barang: item.id_barang,
      nama_barang: item.nama_barang,
      kategori: item.kategori || '',
      satuan: item.satuan || 'Pcs',
      harga_beli: item.harga_beli || '',
      harga_jual: item.harga_jual || '',
      min_stok: item.min_stok !== undefined ? item.min_stok : 5,
      gudang: item.gudang || activeGudang
    })
    setShowItemModal(true)
  }

  // Simpan Barang Baru / Update
  const handleSaveItem = async (e) => {
    e.preventDefault()
    if (!itemForm.nama_barang.trim()) {
      return setError('Nama barang tidak boleh kosong.')
    }

    try {
      const payload = {
        id_barang: itemForm.id_barang.trim().toUpperCase(),
        id_bahan_baku: itemForm.id_barang.trim().toUpperCase(),
        nama_produk: itemForm.nama_barang.trim(),
        nama_barang: itemForm.nama_barang.trim(),
        kategori: itemForm.kategori.trim(),
        satuan: itemForm.satuan.trim(),
        harga_beli: parseFloat(itemForm.harga_beli) || 0,
        harga_satuan: parseFloat(itemForm.harga_beli) || 0,
        harga_jual: parseFloat(itemForm.harga_jual) || 0,
        min_stok: parseFloat(itemForm.min_stok) || 0,
        gudang: activeGudang
      }

      if (editingItem) {
        // Update
        const { error: updErr } = await supabase
          .from('stok_barang')
          .update(payload)
          .eq('id_bahan_baku', editingItem.id_barang)

        if (updErr) throw updErr
        setSuccess(`Barang "${payload.nama_barang}" berhasil diperbarui!`)
      } else {
        // Insert Baru
        payload.stok = 0
        const { error: insErr } = await supabase
          .from('stok_barang')
          .insert(payload)

        if (insErr) throw insErr
        setSuccess(`Barang baru "${payload.nama_barang}" berhasil ditambahkan ke Gudang!`)
      }

      setShowItemModal(false)
      await loadInventory()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message || 'Gagal menyimpan barang gudang.')
    }
  }

  // Handler Hapus Barang
  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Yakin ingin menghapus barang "${item.nama_barang}" dari gudang?`)) return
    try {
      const { error: delErr } = await supabase
        .from('stok_barang')
        .delete()
        .eq('id_bahan_baku', item.id_barang)

      if (delErr) throw delErr
      setSuccess(`Barang "${item.nama_barang}" berhasil dihapus.`)
      await loadInventory()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message || 'Gagal menghapus barang.')
    }
  }

  // Handler Restock Masuk Cepat
  const handleOpenRestock = (item) => {
    setRestockTarget(item)
    setRestockQty('')
    setRestockCost(item.harga_beli || '')
    setShowRestockModal(true)
  }

  const handleConfirmRestock = async (e) => {
    e.preventDefault()
    const qtyVal = parseFloat(restockQty)
    const costVal = parseFloat(restockCost) || 0

    if (!qtyVal || qtyVal <= 0) {
      return setError('Jumlah stok masuk harus lebih dari 0.')
    }

    try {
      const totalAmount = qtyVal * costVal
      // Catat ke tabel barang_masuk
      const { error: bmErr } = await supabase
        .from('barang_masuk')
        .insert({
          id_barang: restockTarget.id_barang,
          id_bahan_baku: restockTarget.id_barang,
          nama_barang: restockTarget.nama_barang,
          jumlah_masuk: qtyVal,
          harga_satuan: costVal,
          total_harga: totalAmount,
          tanggal: new Date().toISOString().split('T')[0]
        })

      if (bmErr) throw bmErr

      setSuccess(`Berhasil restock +${qtyVal} ${restockTarget.satuan} untuk "${restockTarget.nama_barang}"!`)
      setShowRestockModal(false)
      await loadInventory()
      setTimeout(() => setSuccess(''), 3500)
    } catch (err) {
      setError(err.message || 'Gagal memproses restock masuk.')
    }
  }

  // Handler Stock Opname (Penyesuaian Fisik)
  const handleOpenOpname = (item) => {
    setOpnameTarget(item)
    setOpnameRealQty(item.stok !== undefined ? item.stok : '')
    setOpnameCatatan('')
    setShowOpnameModal(true)
  }

  const handleConfirmOpname = async (e) => {
    e.preventDefault()
    const realQtyNum = parseFloat(opnameRealQty)
    if (isNaN(realQtyNum) || realQtyNum < 0) {
      return setError('Stok fisik aktual harus berupa angka 0 atau lebih.')
    }

    try {
      const selisih = realQtyNum - (parseFloat(opnameTarget.stok) || 0)
      const { error: updErr } = await supabase
        .from('stok_barang')
        .update({
          stok: realQtyNum,
          stok_akhir: realQtyNum,
          updated_at: new Date().toISOString()
        })
        .eq('id_bahan_baku', opnameTarget.id_barang)

      if (updErr) throw updErr

      setSuccess(`Stock opname selesai! Stok "${opnameTarget.nama_barang}" disesuaikan ke ${realQtyNum} ${opnameTarget.satuan} (Selisih: ${selisih >= 0 ? `+${selisih}` : selisih}).`)
      setShowOpnameModal(false)
      await loadInventory()
      setTimeout(() => setSuccess(''), 3500)
    } catch (err) {
      setError(err.message || 'Gagal menyimpan penyesuaian stock opname.')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. TOP HEADER & GUDANG TAB SELECTOR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-brand-emerald/15 border border-primary/30 text-brand-emerald">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <span>Manajemen Multi-Gudang & Inventori</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                Pusat pengawasan bahan baku, chemical cuci mobil, dan produk retail merchandise
              </p>
            </div>
          </div>
        </div>

        {/* 3 PILIHAN GUDANG TABS */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-x-auto">
          {features.hasCafeWarehouse && (
            <button
              onClick={() => {
                setActiveGudang('CAFE')
                setSelectedKategori('ALL')
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm transition-all whitespace-nowrap ${
                activeGudang === 'CAFE'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Coffee size={16} />
              <span>Gudang Cafe (F&B)</span>
            </button>
          )}

          {features.hasCarwashWarehouse && (
            <button
              onClick={() => {
                setActiveGudang('CARWASH')
                setSelectedKategori('ALL')
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm transition-all whitespace-nowrap ${
                activeGudang === 'CARWASH'
                  ? 'bg-brand-blue text-slate-950 shadow-md shadow-brand-blue/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Car size={16} />
              <span>Gudang Carwash</span>
            </button>
          )}

          <button
            onClick={() => {
              setActiveGudang('MERCHANDISE')
              setSelectedKategori('ALL')
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm transition-all whitespace-nowrap ${
              activeGudang === 'MERCHANDISE'
                ? 'bg-emerald-400 text-slate-950 shadow-md shadow-emerald-400/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShoppingBag size={16} />
            <span>Gudang Merchandise</span>
          </button>
        </div>
      </div>

      {/* ALERT NOTIFIKASI */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="p-1 hover:bg-rose-500/20 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess('')} className="p-1 hover:bg-emerald-500/20 rounded">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. KPI METRICS CARDS GUDANG AKTIF */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Total Item */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Item Barang</span>
            <h3 className="text-xl md:text-2xl font-black text-white mt-1">{kpiStats.totalItems} <span className="text-xs font-normal text-slate-500">item</span></h3>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/60 text-slate-300">
            <Package size={22} />
          </div>
        </div>

        {/* Total Nilai Aset */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Nilai Inventori</span>
            <h3 className="text-xl md:text-2xl font-black text-brand-emerald font-mono mt-1">
              {formatRupiah(kpiStats.totalAssetValue)}
            </h3>
          </div>
          <div className="p-3 rounded-xl bg-brand-emerald/15 text-brand-emerald">
            <DollarSign size={22} />
          </div>
        </div>

        {/* Stok Menipis */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Stok Menipis (&lt; Min)</span>
            <h3 className="text-xl md:text-2xl font-black text-amber-400 mt-1">{kpiStats.lowStockCount} <span className="text-xs font-normal text-slate-500">item</span></h3>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/15 text-amber-400">
            <AlertTriangle size={22} />
          </div>
        </div>

        {/* Stok Habis / Kritis */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Stok Habis / Kritis</span>
            <h3 className="text-xl md:text-2xl font-black text-rose-400 mt-1">{kpiStats.emptyStockCount} <span className="text-xs font-normal text-slate-500">item</span></h3>
          </div>
          <div className="p-3 rounded-xl bg-rose-500/15 text-rose-400">
            <AlertTriangle size={22} />
          </div>
        </div>
      </div>

      {/* 3. CONTROLS, SEARCH & BUTTONS */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search & Filter */}
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Cari di ${activeGudang === 'CAFE' ? 'Gudang Cafe' : activeGudang === 'CARWASH' ? 'Gudang Carwash' : 'Gudang Merchandise'}...`}
              className="w-full pl-10 pr-4 py-2 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs md:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary"
            />
          </div>

          {/* Kategori Filter */}
          <select
            value={selectedKategori}
            onChange={(e) => setSelectedKategori(e.target.value)}
            className="px-3 py-2 bg-slate-900/90 border border-slate-700/80 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-primary cursor-pointer"
          >
            {kategoriList.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'ALL' ? 'Semua Kategori' : cat}
              </option>
            ))}
          </select>

          {/* Status Stok Filter */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setStockStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                stockStatusFilter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStockStatusFilter('SAFE')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                stockStatusFilter === 'SAFE' ? 'bg-emerald-500/20 text-emerald-300 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Aman
            </button>
            <button
              onClick={() => setStockStatusFilter('LOW')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                stockStatusFilter === 'LOW' ? 'bg-amber-500/20 text-amber-300 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Menipis
            </button>
            <button
              onClick={() => setStockStatusFilter('EMPTY')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                stockStatusFilter === 'EMPTY' ? 'bg-rose-500/20 text-rose-300 shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Habis
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={loadInventory}
            className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/80 transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={15} />
          </button>

          {isOwnerOrAdmin && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-emerald hover:bg-brand-emerald/90 text-slate-950 font-bold text-xs md:text-sm transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Plus size={16} />
              <span>Tambah Barang</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. TABEL DATA STOK GUDANG */}
      <InventoryTable
        data={filteredBahan}
        keyExtractor={(item) => item.id_bahan_baku}
        emptyMessage="Tidak ada data bahan baku ditemukan."
        columns={[
          {
            key: 'id_bahan_baku',
            label: 'KODE / BARCODE',
            render: (val, item) => (
              <div>
                <div className="font-mono font-bold text-primary flex items-center gap-1.5">
                  <Barcode className="w-3.5 h-3.5 text-muted" />
                  {item.barcode || val}
                </div>
                {item.barcode && (
                  <span className="text-[10px] text-muted-dark font-mono">
                    ID: {val}
                  </span>
                )}
              </div>
            ),
          },
          {
            key: 'nama_produk',
            label: 'NAMA BAHAN BAKU',
            className: 'font-bold text-white',
            render: (val, item) => (
              <div>
                <div>{val}</div>
                <div className="text-[10px] text-muted-dark font-normal flex items-center gap-2">
                  <span className="uppercase text-muted">{item.kategori || 'BAHAN'}</span>
                  {item.merk && <span>• {item.merk}</span>}
                </div>
              </div>
            ),
          },
          {
            key: 'stok',
            label: 'STOK SISTEM',
            numeric: true,
            render: (val, item) => {
              const s = Number(val) || 0
              const min = Number(item.stok_minimum) || 5
              const isSafe = s > min
              const isLow = s > 0 && s <= min
              return (
                <div>
                  <span
                    className={`font-mono text-sm font-bold ${
                      isSafe
                        ? 'text-primary'
                        : isLow
                        ? 'text-warning'
                        : 'text-destructive'
                    }`}
                  >
                    {s.toLocaleString('id-ID')}
                  </span>{' '}
                  <span className="text-[11px] text-muted-dark font-medium">
                    {item.satuan || 'Pcs'}
                  </span>
                </div>
              )
            },
          },
          {
            key: 'status',
            label: 'STATUS AMBANG',
            render: (_, item) => {
              const s = Number(item.stok) || 0
              const min = Number(item.stok_minimum) || 5
              const isSafe = s > min
              const isLow = s > 0 && s <= min
              return isSafe ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Aman
                </span>
              ) : isLow ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-warning/10 text-warning border border-warning/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                  Menipis (Min: {min})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  Habis
                </span>
              )
            },
          },
          {
            key: 'harga_satuan',
            label: 'ESTIMASI HPP',
            numeric: true,
            render: (val, item) => (
              <span className="font-mono text-xs text-muted font-medium">
                {formatRupiah(val || 0)}/{item.satuan || 'pcs'}
              </span>
            ),
          },
          {
            key: 'nilai_aset',
            label: 'TOTAL NILAI ASET',
            numeric: true,
            render: (_, item) => {
              const total = (Number(item.stok) || 0) * (Number(item.harga_satuan) || 0)
              return (
                <span className="font-mono text-xs font-bold text-foreground">
                  {formatRupiah(total)}
                </span>
              )
            },
          },
          {
            key: 'actions',
            label: 'AKSI',
            align: 'center',
            render: (_, item) => (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => handleOpenStockAdjust(item)}
                  className="px-2.5 py-1 rounded bg-subsurface hover:bg-border text-muted-foreground hover:text-white border border-border text-[11px] font-medium transition-colors"
                  title="Sesuaikan Stok Fisik"
                >
                  Audit
                </button>
                <button
                  onClick={() => handleOpenForm(item)}
                  className="px-2.5 py-1 rounded bg-subsurface hover:bg-border text-muted-foreground hover:text-white border border-border text-[11px] font-medium transition-colors"
                >
                  Edit
                </button>
              </div>
            ),
          },
        ]}
      />

      {/* ========================================================================= */}
      {/* MODAL 1: TAMBAH / EDIT BARANG GUDANG */}
      {/* ========================================================================= */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Boxes className="w-5 h-5 text-brand-emerald" />
                <span>{editingItem ? 'Edit Data Barang' : `Tambah Barang ke Gudang ${activeGudang}`}</span>
              </h3>
              <button
                onClick={() => setShowItemModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">ID / Kode Barang (SKU)</label>
                <input
                  type="text"
                  value={itemForm.id_barang}
                  onChange={(e) => setItemForm({ ...itemForm, id_barang: e.target.value })}
                  disabled={!!editingItem}
                  placeholder="Contoh: CF-01, CW-01, MCH-01"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase focus:outline-none focus:border-primary disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Nama Barang / Bahan Baku</label>
                <input
                  type="text"
                  value={itemForm.nama_barang}
                  onChange={(e) => setItemForm({ ...itemForm, nama_barang: e.target.value })}
                  placeholder="Nama barang..."
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Kategori</label>
                  <input
                    type="text"
                    value={itemForm.kategori}
                    onChange={(e) => setItemForm({ ...itemForm, kategori: e.target.value })}
                    placeholder="Kategori..."
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Satuan</label>
                  <select
                    value={itemForm.satuan}
                    onChange={(e) => setItemForm({ ...itemForm, satuan: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-primary"
                  >
                    <option value="Gram">Gram</option>
                    <option value="Kg">Kg</option>
                    <option value="Ml">Ml</option>
                    <option value="Liter">Liter</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Botol">Botol</option>
                    <option value="Set">Set</option>
                    <option value="Galon">Galon</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Harga Beli / HPP (Rp)</label>
                  <input
                    type="number"
                    value={itemForm.harga_beli}
                    onChange={(e) => setItemForm({ ...itemForm, harga_beli: e.target.value })}
                    placeholder="0"
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Batas Min. Stok</label>
                  <input
                    type="number"
                    value={itemForm.min_stok}
                    onChange={(e) => setItemForm({ ...itemForm, min_stok: e.target.value })}
                    placeholder="5"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {activeGudang === 'MERCHANDISE' && (
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Harga Jual ke Pelanggan (Rp)</label>
                  <input
                    type="number"
                    value={itemForm.harga_jual}
                    onChange={(e) => setItemForm({ ...itemForm, harga_jual: e.target.value })}
                    placeholder="Harga jual..."
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-brand-emerald hover:bg-brand-emerald/90 text-slate-950 font-bold shadow-md"
                >
                  Simpan Barang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RESTOCK / STOK MASUK */}
      {/* ========================================================================= */}
      {showRestockModal && restockTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-emerald-400" />
                <span>Restock Masuk: {restockTarget.nama_barang}</span>
              </h3>
              <button
                onClick={() => setShowRestockModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmRestock} className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                <span className="text-slate-400">Sisa Stok Sekarang:</span>
                <span className="font-mono font-bold text-white text-sm">
                  {restockTarget.stok} {restockTarget.satuan}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Jumlah Stok Masuk ({restockTarget.satuan})
                </label>
                <input
                  type="number"
                  step="any"
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  placeholder="Jumlah..."
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-base font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Harga Beli / Satuan (Rp)
                </label>
                <input
                  type="number"
                  value={restockCost}
                  onChange={(e) => setRestockCost(e.target.value)}
                  placeholder="Harga beli..."
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  *Otomatis menghitung Moving Average Cost (MAC) harga pokok baru.
                </span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between font-mono">
                <span className="text-emerald-400 font-bold text-[11px]">Total Tagihan Restock:</span>
                <span className="text-emerald-300 font-bold text-sm">
                  {formatRupiah((parseFloat(restockQty) || 0) * (parseFloat(restockCost) || 0))}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRestockModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-md"
                >
                  Konfirmasi Restock Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: STOCK OPNAME (PENYESUAIAN STOK FISIK) */}
      {/* ========================================================================= */}
      {showOpnameModal && opnameTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-blue-400" />
                <span>Stock Opname: {opnameTarget.nama_barang}</span>
              </h3>
              <button
                onClick={() => setShowOpnameModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmOpname} className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                <span className="text-slate-400">Tercatat di Sistem:</span>
                <span className="font-mono font-bold text-slate-300">
                  {opnameTarget.stok} {opnameTarget.satuan}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Hitungan Fisik Nyata di Gudang ({opnameTarget.satuan})
                </label>
                <input
                  type="number"
                  step="any"
                  value={opnameRealQty}
                  onChange={(e) => setOpnameRealQty(e.target.value)}
                  placeholder="Kuantitas aktual..."
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-base font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between font-mono">
                <span className="text-blue-400 font-bold text-[11px]">Selisih Penyesuaian:</span>
                <span className={`font-bold text-sm ${
                  (parseFloat(opnameRealQty) || 0) - (parseFloat(opnameTarget.stok) || 0) < 0
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}>
                  {((parseFloat(opnameRealQty) || 0) - (parseFloat(opnameTarget.stok) || 0)).toFixed(1)} {opnameTarget.satuan}
                </span>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Catatan / Alasan Penyesuaian
                </label>
                <textarea
                  value={opnameCatatan}
                  onChange={(e) => setOpnameCatatan(e.target.value)}
                  placeholder="Misal: Tumpah, susut, atau koreksi hitung..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOpnameModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold shadow-md"
                >
                  Simpan Penyesuaian Opname
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
