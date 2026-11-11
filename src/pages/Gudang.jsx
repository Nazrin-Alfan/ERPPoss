import { InventoryTable } from '../components/ui/tables'
import React, { useState, useEffect, useMemo } from 'react'
import CustomSelect from '../components/common/CustomSelect'
import { ROLES, isManagement, hasPermission } from '../constants/roles'
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
  Barcode,
  Calculator
} from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getTenantFeatures } from '../utils/businessCapabilities'
import { formatRupiah } from '../utils/helpers'

// Default fallback steril jika tabel stok_barang masih kosong
const DEFAULT_GUDANG_DATA = []

export default function Gudang() {
  const { profile, activeTenant } = useAuth()
  const currentRole = profile?.role || ROLES.KASIR
  const isOwnerOrAdmin = isManagement(currentRole)
  const canViewCost = hasPermission(currentRole, 'CAN_VIEW_INVENTORY_COST')
  const canRestock = hasPermission(currentRole, 'CAN_MANAGE_INVENTORY')
  const canOpnameOrEdit = hasPermission(currentRole, 'CAN_OPNAME_INVENTORY')
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

  // State Kalkulator HPP Cerdas
  const [showHppCalculator, setShowHppCalculator] = useState(false)
  const [hppCalcInput, setHppCalcInput] = useState({
    totalBeli: '',
    jumlahQty: '',
    satuanBeli: 'Kotak / Pack',
    isiPerKemasan: '',
    satuanPemakaian: ''
  })

  // Load Inventory Data
  const loadInventory = async () => {
    setLoading(true)
    setError('')
    try {
      let rawData = null
      // P1-05: Non-financial roles (e.g. Kasir) consume safe stock projection RPC without HPP
      if (!canViewCost && typeof supabase.rpc === 'function') {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('fn_get_pos_inventory_stock')
          if (!rpcErr && rpcData) {
            rawData = rpcData
          }
        } catch {
          // Fallback to table query if RPC unavailable
        }
      }

      if (!rawData) {
        const { data, error: fetchErr } = await supabase
          .from('stok_barang')
          .select('*')
          .order('nama_produk', { ascending: true })

        if (fetchErr) throw fetchErr
        rawData = data
      }

      if (rawData && rawData.length > 0) {
        // Normalisasi data dengan gudang mapper jika belum ada properti gudang
        const mapped = rawData.map(item => {
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
            harga_beli: canViewCost ? (item.harga_beli || item.harga_satuan || item.hpp || 0) : null,
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

  // Opsi Dropdown Kategori untuk Form Tambah / Edit Barang (Dinamis dari item tersimpan + preset standar)
  const formKategoriOptions = useMemo(() => {
    const defaultCatsPerGudang = {
      CAFE: ['Bahan Baku', 'Packaging & Cup', 'Snack & Makanan'],
      CARWASH: ['Chemical Cuci', 'Perlengkapan Cuci'],
      MERCHANDISE: ['Parfum Mobil', 'Lap & Perawatan', 'Aksesoris & Detailing', 'Chemical Retail', 'Snack & Minuman Ringan']
    }

    const setCats = new Set(defaultCatsPerGudang[activeGudang] || ['Bahan Baku', 'Lainnya'])
    
    // Sertakan juga kategori yang sudah pernah ada di database/inventory pada gudang aktif
    gudangItems.forEach(item => {
      if (item.kategori && item.kategori.trim()) {
        setCats.add(item.kategori.trim())
      }
    })

    // Pastikan kategori yang sedang terpilih di itemForm juga masuk jika bukan preset
    if (itemForm.kategori && itemForm.kategori.trim()) {
      setCats.add(itemForm.kategori.trim())
    }

    return Array.from(setCats).map(cat => ({ value: cat, label: cat }))
  }, [activeGudang, gudangItems, itemForm.kategori])

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

    const emptyStockCount = gudangItems.filter(i => (parseFloat(i.stok) || 0) === 0).length
    const negativeStockCount = gudangItems.filter(i => (parseFloat(i.stok) || 0) < 0).length

    return {
      totalItems,
      totalAssetValue,
      lowStockCount,
      emptyStockCount,
      negativeStockCount
    }
  }, [gudangItems])

  // Handler Buka Modal Tambah Barang
  const handleOpenAddModal = () => {
    if (!canOpnameOrEdit) return setError('Akses ditolak: Hanya manajemen yang berhak menambah item master.')
    setEditingItem(null)
    setShowHppCalculator(false)
    setHppCalcInput({
      totalBeli: '',
      jumlahQty: '',
      satuanBeli: 'Kotak / Pack',
      isiPerKemasan: '',
      satuanPemakaian: ''
    })
    const nextId = `${activeGudang.substring(0, 2)}-${String(gudangItems.length + 1).padStart(2, '0')}`
    setItemForm({
      id_barang: nextId,
      nama_barang: '',
      kategori: activeGudang === 'MERCHANDISE' ? 'Parfum Mobil' : activeGudang === 'CARWASH' ? 'Chemical Cuci' : 'Bahan Baku',
      satuan: activeGudang === 'CAFE' ? 'Liter' : activeGudang === 'CARWASH' ? 'Liter' : 'Pcs',
      harga_beli: '',
      harga_jual: activeGudang === 'MERCHANDISE' ? '' : 0,
      min_stok: 5,
      gudang: activeGudang
    })
    setShowItemModal(true)
  }

  // Handler Buka Modal Edit Barang
  const handleOpenEditModal = (item) => {
    if (!canOpnameOrEdit) return setError('Akses ditolak: Hanya manajemen yang berhak mengedit data barang.')
    setEditingItem(item)
    setShowHppCalculator(false)
    setHppCalcInput({
      totalBeli: '',
      jumlahQty: '',
      satuanBeli: 'Kotak / Pack',
      isiPerKemasan: '',
      satuanPemakaian: ''
    })
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
    if (!canOpnameOrEdit) return setError('Akses ditolak: Hanya manajemen yang berhak memodifikasi master barang.')
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
        const updQuery = editingItem.id
          ? supabase.from('stok_barang').update(payload).eq('id', editingItem.id)
          : supabase.from('stok_barang').update(payload).eq('id_bahan_baku', editingItem.id_barang)

        const { error: updErr } = await updQuery
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
    if (!canOpnameOrEdit) return setError('Akses ditolak: Hanya manajemen yang berhak menghapus data barang.')
    if (!window.confirm(`Yakin ingin menghapus barang "${item.nama_barang}" dari gudang?`)) return
    try {
      const delQuery = item.id
        ? supabase.from('stok_barang').delete().eq('id', item.id)
        : supabase.from('stok_barang').delete().eq('id_bahan_baku', item.id_barang)

      const { error: delErr } = await delQuery

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
    if (!canRestock) return setError('Akses ditolak: Role Anda tidak diizinkan mencatat restock masuk.')
    setRestockTarget(item)
    setRestockQty('')
    setRestockCost(item.harga_beli || '')
    setShowRestockModal(true)
  }

  const handleConfirmRestock = async (e) => {
    e.preventDefault()
    if (!canRestock) return setError('Akses ditolak: Role Anda tidak diizinkan mencatat restock masuk.')
    const qtyVal = parseFloat(restockQty)
    const costVal = parseFloat(restockCost) || 0

    if (!qtyVal || qtyVal <= 0) {
      return setError('Jumlah stok masuk harus lebih dari 0.')
    }

    try {
      const totalAmount = qtyVal * costVal
      const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
      const targetUuid = isUuid(restockTarget.id) ? restockTarget.id : (isUuid(restockTarget.id_bahan_baku) ? restockTarget.id_bahan_baku : null)

      // Catat ke tabel barang_masuk
      const { error: bmErr } = await supabase
        .from('barang_masuk')
        .insert({
          id_barang: restockTarget.id_barang || restockTarget.id,
          id_bahan_baku: targetUuid,
          nama_barang: restockTarget.nama_barang || restockTarget.nama_produk,
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
    if (!canOpnameOrEdit) return setError('Akses ditolak: Role Anda tidak diizinkan melakukan stock opname.')
    setOpnameTarget(item)
    setOpnameRealQty(item.stok !== undefined ? item.stok : '')
    setOpnameCatatan('')
    setShowOpnameModal(true)
  }

  const handleConfirmOpname = async (e) => {
    e.preventDefault()
    if (!canOpnameOrEdit) return setError('Akses ditolak: Role Anda tidak diizinkan melakukan stock opname.')
    const realQtyNum = parseFloat(opnameRealQty)
    if (isNaN(realQtyNum) || realQtyNum < 0) {
      return setError('Stok fisik aktual harus berupa angka 0 atau lebih.')
    }

    try {
      const selisih = realQtyNum - (parseFloat(opnameTarget.stok) || 0)
      const opnameQuery = opnameTarget.id
        ? supabase.from('stok_barang').update({
            stok: realQtyNum,
            stok_akhir: realQtyNum,
            updated_at: new Date().toISOString()
          }).eq('id', opnameTarget.id)
        : supabase.from('stok_barang').update({
            stok: realQtyNum,
            stok_akhir: realQtyNum,
            updated_at: new Date().toISOString()
          }).eq('id_bahan_baku', opnameTarget.id_barang)

      const { error: updErr } = await opnameQuery

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
            <div className="p-2.5 rounded-xl bg-[#00ffff]/15 border border-[#00ffff]/30 text-[#00ffff]">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                <span>Manajemen Multi-Gudang & Inventori</span>
              </h1>
              <p className="text-xs md:text-sm text-[#bbcbb2] mt-0.5">
                Pusat pengawasan bahan baku, chemical cuci mobil, dan produk retail merchandise
              </p>
            </div>
          </div>
        </div>

        {/* 3 PILIHAN GUDANG TABS */}
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[#121215] border border-[#26272d] shadow-xl overflow-x-auto no-scrollbar shrink-0">
          {features.hasCafeWarehouse && (
            <button
              onClick={() => {
                setActiveGudang('CAFE')
                setSelectedKategori('ALL')
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm transition-all whitespace-nowrap shrink-0 ${
                activeGudang === 'CAFE'
                  ? 'bg-[#ffc71f] text-[#0f0f0f] font-bold shadow-sm'
                  : 'text-[#bbcbb2] hover:text-white hover:bg-[#18181c]'
              }`}
            >
              <Coffee size={16} />
              <span className="whitespace-nowrap">Gudang Cafe (F&B)</span>
            </button>
          )}

          {features.hasCarwashWarehouse && (
            <button
              onClick={() => {
                setActiveGudang('CARWASH')
                setSelectedKategori('ALL')
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm transition-all whitespace-nowrap shrink-0 ${
                activeGudang === 'CARWASH'
                  ? 'bg-[#f57733] text-white font-bold shadow-sm'
                  : 'text-[#bbcbb2] hover:text-white hover:bg-[#18181c]'
              }`}
            >
              <Car size={16} />
              <span className="whitespace-nowrap">Gudang Carwash</span>
            </button>
          )}

          <button
            onClick={() => {
              setActiveGudang('MERCHANDISE')
              setSelectedKategori('ALL')
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs md:text-sm transition-all whitespace-nowrap shrink-0 ${
              activeGudang === 'MERCHANDISE'
                ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-sm'
                : 'text-[#bbcbb2] hover:text-white hover:bg-[#18181c]'
            }`}
          >
            <ShoppingBag size={16} />
            <span className="whitespace-nowrap">Gudang Merchandise</span>
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
            <CheckCircle2 className="w-4 h-4 text-[#00ffff] shrink-0" />
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
        <div className="bg-[#121215] p-4 rounded-2xl border border-[#26272d] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#bbcbb2] uppercase tracking-wider">Total Item Barang</span>
            <h3 className="text-xl md:text-2xl font-black text-white mt-1">{kpiStats.totalItems} <span className="text-xs font-normal text-[#6b7367]">item</span></h3>
          </div>
          <div className="p-3 rounded-xl bg-[#18181c] text-white border border-[#26272d]">
            <Package size={22} />
          </div>
        </div>

        {/* Total Nilai Aset */}
        {canViewCost ? (
          <div className="bg-[#121215] p-4 rounded-2xl border border-[#26272d] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#bbcbb2] uppercase tracking-wider">Total Nilai Inventori</span>
              <h3 className="text-xl md:text-2xl font-black text-[#00ffff] font-mono mt-1">
                {formatRupiah(kpiStats.totalAssetValue)}
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-[#00ffff]/15 text-[#00ffff]">
              <DollarSign size={22} />
            </div>
          </div>
        ) : (
          <div className="bg-[#121215] p-4 rounded-2xl border border-[#26272d] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#bbcbb2] uppercase tracking-wider">Status Valuasi</span>
              <h3 className="text-sm font-semibold text-[#bbcbb2] mt-1">
                Akses Terbatas Kasir
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-[#18181c] text-[#bbcbb2] border border-[#26272d]">
              <Boxes size={22} />
            </div>
          </div>
        )}

        {/* Stok Menipis */}
        <div className="bg-[#121215] p-4 rounded-2xl border border-[#26272d] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#bbcbb2] uppercase tracking-wider">Stok Menipis (&lt; Min)</span>
            <h3 className="text-xl md:text-2xl font-black text-[#ffc71f] font-mono mt-1">{kpiStats.lowStockCount} <span className="text-xs font-normal text-[#6b7367]">item</span></h3>
          </div>
          <div className="p-3 rounded-xl bg-[#ffc71f]/15 text-[#ffc71f]">
            <AlertTriangle size={22} />
          </div>
        </div>

        {/* Stok Habis / Kritis */}
        <div className="bg-[#121215] p-4 rounded-2xl border border-[#26272d] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[#bbcbb2] uppercase tracking-wider">
              {kpiStats.negativeStockCount > 0 ? 'Defisit & Kritis' : 'Stok Habis / Kritis'}
            </span>
            <h3 className="text-xl md:text-2xl font-black text-[#ff5102] font-mono mt-1">
              {kpiStats.emptyStockCount + kpiStats.negativeStockCount} <span className="text-xs font-normal text-[#6b7367]">item</span>
            </h3>
            {kpiStats.negativeStockCount > 0 && (
              <p className="text-[10px] text-rose-400 mt-0.5">({kpiStats.negativeStockCount} barang tercatat minus/defisit)</p>
            )}
          </div>
          <div className="p-3 rounded-xl bg-[#ff5102]/15 text-[#ff5102]">
            <AlertTriangle size={22} />
          </div>
        </div>
      </div>

      {/* 3. CONTROLS, SEARCH & BUTTONS */}
      <div className="bg-[#121215] p-4 rounded-2xl border border-[#26272d] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search & Filter */}
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7367]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Cari di ${activeGudang === 'CAFE' ? 'Gudang Cafe' : activeGudang === 'CARWASH' ? 'Gudang Carwash' : 'Gudang Merchandise'}...`}
              className="w-full pl-10 pr-4 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-xs md:text-sm text-white placeholder-[#6b7367] focus:outline-none focus:border-[#00ffff]"
            />
          </div>

          {/* Kategori Filter */}
          <CustomSelect
            value={selectedKategori}
            onChange={(val) => setSelectedKategori(val)}
            options={kategoriList.map(cat => ({
              value: cat,
              label: cat === 'ALL' ? 'Semua Kategori' : cat
            }))}
            variant="cyan"
            size="sm"
            className="min-w-[150px]"
          />

          {/* Status Stok Filter */}
          <div className="flex items-center gap-1 bg-[#18181c] p-1 rounded-xl border border-[#26272d]">
            <button
              onClick={() => setStockStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                stockStatusFilter === 'ALL' ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-sm' : 'text-[#bbcbb2] hover:text-white'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStockStatusFilter('SAFE')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                stockStatusFilter === 'SAFE' ? 'bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30' : 'text-[#bbcbb2] hover:text-white'
              }`}
            >
              Aman
            </button>
            <button
              onClick={() => setStockStatusFilter('LOW')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                stockStatusFilter === 'LOW' ? 'bg-[#ffc71f]/15 text-[#ffc71f] border border-[#ffc71f]/30' : 'text-[#bbcbb2] hover:text-white'
              }`}
            >
              Menipis
            </button>
            <button
              onClick={() => setStockStatusFilter('EMPTY')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                stockStatusFilter === 'EMPTY' ? 'bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30' : 'text-[#bbcbb2] hover:text-white'
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
            className="p-2.5 rounded-xl bg-[#18181c] hover:bg-[#26272d] text-[#bbcbb2] hover:text-white border border-[#26272d] transition-all cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={15} />
          </button>

          {canOpnameOrEdit && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00ffff] hover:bg-[#00ffff]/90 text-[#0f0f0f] font-bold text-xs md:text-sm transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              <Plus size={16} />
              <span>Tambah Barang</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. TABEL DATA STOK GUDANG */}
      <InventoryTable
        data={filteredItems}
        keyExtractor={(item) => item.id_barang || item.id_bahan_baku}
        emptyMessage="Tidak ada data barang ditemukan pada gudang ini."
        columns={[
          {
            key: 'id_barang',
            label: 'KODE / BARCODE',
            render: (val, item) => (
              <div>
                <div className="font-mono font-bold text-primary flex items-center gap-1.5">
                  <Barcode className="w-3.5 h-3.5 text-muted" />
                  {val || item.id_bahan_baku}
                </div>
                {item.barcode && (
                  <span className="text-[10px] text-muted-dark font-mono">
                    BARCODE: {item.barcode}
                  </span>
                )}
              </div>
            ),
          },
          {
            key: 'nama_barang',
            label: 'NAMA BARANG',
            className: 'font-bold text-white',
            render: (val, item) => (
              <div>
                <div>{val || item.nama_produk}</div>
                <div className="text-[10px] text-muted-dark font-normal flex items-center gap-2">
                  <span className="uppercase text-muted">{item.kategori || 'BAHAN'}</span>
                  <span className="px-1.5 py-0.2 rounded bg-subsurface border border-border text-[9px] text-muted font-mono">{item.gudang}</span>
                </div>
              </div>
            ),
          },
          {
            key: 'stok',
            label: 'STOK SISTEM',
            numeric: true,
            render: (val, item) => {
              const s = parseFloat(val) || 0
              const min = parseFloat(item.min_stok || item.stok_minimum) || 5
              const isSafe = s > min
              const isLow = s > 0 && s <= min
              const isNegative = s < 0
              return (
                <div>
                  <span
                    className={`font-mono text-sm font-bold ${
                      isNegative
                        ? 'text-rose-400'
                        : isSafe
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
                  {isNegative && (
                    <div className="text-[10px] text-rose-400 font-bold">
                      Defisit {Math.abs(s)} {item.satuan}
                    </div>
                  )}
                </div>
              )
            },
          },
          {
            key: 'status',
            label: 'STATUS AMBANG',
            render: (_, item) => {
              const s = parseFloat(item.stok) || 0
              const min = parseFloat(item.min_stok || item.stok_minimum) || 5
              const isSafe = s > min
              const isLow = s > 0 && s <= min
              const isNegative = s < 0
              return isNegative ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Defisit Opname
                </span>
              ) : isSafe ? (
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
          ...(canViewCost ? [
            {
              key: 'harga_beli',
              label: 'ESTIMASI HPP',
              numeric: true,
              render: (val, item) => (
                <span className="font-mono text-xs text-muted font-medium">
                  {formatRupiah(val || item.harga_satuan || 0)}/{item.satuan || 'pcs'}
                </span>
              ),
            },
            {
              key: 'nilai_aset',
              label: 'TOTAL NILAI ASET',
              numeric: true,
              render: (_, item) => {
                const qty = Math.max(0, parseFloat(item.stok) || 0)
                const cost = parseFloat(item.harga_beli || item.harga_satuan) || 0
                return (
                  <span className="font-mono text-xs font-bold text-foreground">
                    {formatRupiah(qty * cost)}
                  </span>
                )
              },
            },
          ] : []),
          ...((canRestock || canOpnameOrEdit) ? [
            {
              key: 'actions',
              label: 'AKSI',
              align: 'center',
              render: (_, item) => (
                <div className="flex items-center justify-center gap-2">
                  {canRestock && (
                    <button
                      onClick={() => handleOpenRestock(item)}
                      className="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[11px] font-bold transition-colors cursor-pointer active:scale-[0.98]"
                      title="Restock Masuk"
                    >
                      + Masuk
                    </button>
                  )}
                  {canOpnameOrEdit && (
                    <>
                      <button
                        onClick={() => handleOpenOpname(item)}
                        className="px-2.5 py-1 rounded bg-subsurface hover:bg-border text-muted-foreground hover:text-white border border-border text-[11px] font-medium transition-colors cursor-pointer active:scale-[0.98]"
                        title="Sesuaikan Stok Fisik (Opname)"
                      >
                        Opname
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(item)}
                        className="px-2.5 py-1 rounded bg-subsurface hover:bg-border text-muted-foreground hover:text-white border border-border text-[11px] font-medium transition-colors cursor-pointer active:scale-[0.98]"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ] : []),
        ]}
      />

      {/* ========================================================================= */}
      {/* MODAL 1: TAMBAH / EDIT BARANG GUDANG */}
      {/* ========================================================================= */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#18181c] border border-[#26272d] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#26272d]">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Boxes className="w-5 h-5 text-[#00ffff]" />
                <span>{editingItem ? 'Edit Data Barang' : `Tambah Barang ke Gudang ${activeGudang}`}</span>
              </h3>
              <button
                onClick={() => setShowItemModal(false)}
                className="p-1 rounded-lg text-[#bbcbb2] hover:text-white hover:bg-[#26272d]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[#bbcbb2] font-semibold mb-1">ID / Kode Barang (SKU)</label>
                <input
                  type="text"
                  value={itemForm.id_barang}
                  onChange={(e) => setItemForm({ ...itemForm, id_barang: e.target.value })}
                  disabled={!!editingItem}
                  placeholder="Contoh: CF-01, CW-01, MCH-01"
                  required
                  className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white font-mono uppercase focus:outline-none focus:border-[#00ffff] disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[#bbcbb2] font-semibold mb-1">Nama Barang / Bahan Baku</label>
                <input
                  type="text"
                  value={itemForm.nama_barang}
                  onChange={(e) => setItemForm({ ...itemForm, nama_barang: e.target.value })}
                  placeholder="Nama barang..."
                  required
                  className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white focus:outline-none focus:border-[#00ffff]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#bbcbb2] font-semibold mb-1">Kategori</label>
                  <CustomSelect
                    value={itemForm.kategori}
                    onChange={(val) => setItemForm({ ...itemForm, kategori: val })}
                    options={formKategoriOptions}
                    placeholder="Pilih Kategori..."
                    variant="cyan"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-[#bbcbb2] font-semibold mb-1">Satuan</label>
                  <CustomSelect
                    value={itemForm.satuan}
                    onChange={(val) => setItemForm({ ...itemForm, satuan: val })}
                    options={[
                      { value: 'Gram', label: 'Gram' },
                      { value: 'Kg', label: 'Kg' },
                      { value: 'Ml', label: 'Ml' },
                      { value: 'Liter', label: 'Liter' },
                      { value: 'Pcs', label: 'Pcs' },
                      { value: 'Botol', label: 'Botol' },
                      { value: 'Set', label: 'Set' },
                      { value: 'Galon', label: 'Galon' }
                    ]}
                    placeholder="Pilih Satuan..."
                    variant="cyan"
                    className="w-full"
                  />
                </div>
              </div>

              {/* KALKULATOR HPP PEMBELIAN OTOMATIS */}
              <div className="bg-[#121215] border border-[#26272d] rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-[#00ffff]" />
                    <span className="font-bold text-xs text-white">Bantu Hitung HPP Otomatis</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHppCalculator(!showHppCalculator)}
                    className="text-[11px] text-[#00ffff] hover:underline font-semibold"
                  >
                    {showHppCalculator ? 'Tutup Kalkulator' : '+ Buka Kalkulator'}
                  </button>
                </div>

                {showHppCalculator && (
                  <div className="space-y-3 pt-2 border-t border-[#26272d] animate-in fade-in duration-150">
                    <p className="text-[11px] text-[#bbcbb2] leading-relaxed">
                      Masukkan total biaya beli faktur dan jumlah kuantitas yang dibeli. Sistem akan otomatis membagi biaya menjadi harga satuan (HPP).
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[#bbcbb2] font-semibold mb-1 text-[11px]">
                          Total Harga Beli (Rp)
                        </label>
                        <input
                          type="number"
                          value={hppCalcInput.totalBeli}
                          onChange={(e) => {
                            const val = e.target.value
                            setHppCalcInput(prev => ({ ...prev, totalBeli: val }))
                            const total = parseFloat(val) || 0
                            const qty = parseFloat(hppCalcInput.jumlahQty) || 0
                            if (total > 0 && qty > 0) {
                              const calculatedHpp = Math.round(total / qty)
                              setItemForm(prev => ({ ...prev, harga_beli: calculatedHpp }))
                            }
                          }}
                          placeholder="Misal: 240000"
                          className="w-full px-3 py-1.5 bg-[#18181c] border border-[#26272d] rounded-xl text-white font-mono focus:outline-none focus:border-[#00ffff]"
                        />
                      </div>

                      <div>
                        <label className="block text-[#bbcbb2] font-semibold mb-1 text-[11px]">
                          Jumlah / Qty Beli ({itemForm.satuan || 'Pcs'})
                        </label>
                        <input
                          type="number"
                          value={hppCalcInput.jumlahQty}
                          onChange={(e) => {
                            const val = e.target.value
                            setHppCalcInput(prev => ({ ...prev, jumlahQty: val }))
                            const qty = parseFloat(val) || 0
                            const total = parseFloat(hppCalcInput.totalBeli) || 0
                            if (total > 0 && qty > 0) {
                              const calculatedHpp = Math.round(total / qty)
                              setItemForm(prev => ({ ...prev, harga_beli: calculatedHpp }))
                            }
                          }}
                          placeholder="Misal: 12"
                          className="w-full px-3 py-1.5 bg-[#18181c] border border-[#26272d] rounded-xl text-white font-mono focus:outline-none focus:border-[#00ffff]"
                        />
                      </div>
                    </div>

                    {parseFloat(hppCalcInput.totalBeli) > 0 && parseFloat(hppCalcInput.jumlahQty) > 0 && (
                      <div className="p-2.5 rounded-lg bg-[#00ffff]/10 border border-[#00ffff]/20 flex items-center justify-between">
                        <span className="text-[11px] text-[#bbcbb2]">Hasil HPP per {itemForm.satuan || 'Satuan'}:</span>
                        <span className="text-sm font-bold text-[#00ffff] font-mono tabular-nums">
                          {formatRupiah(Math.round(parseFloat(hppCalcInput.totalBeli) / parseFloat(hppCalcInput.jumlahQty)))}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#bbcbb2] font-semibold mb-1">Harga Beli / HPP per {itemForm.satuan || 'Satuan'} (Rp)</label>
                  <input
                    type="number"
                    value={itemForm.harga_beli}
                    onChange={(e) => setItemForm({ ...itemForm, harga_beli: e.target.value })}
                    placeholder="0"
                    required
                    className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white font-mono focus:outline-none focus:border-[#00ffff]"
                  />
                  {parseFloat(itemForm.harga_beli) > 0 && (
                    <span className="block mt-1 text-[10px] text-[#bbcbb2] font-mono">
                      {formatRupiah(parseFloat(itemForm.harga_beli) || 0)} / {itemForm.satuan || 'satuan'}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-[#bbcbb2] font-semibold mb-1">Batas Min. Stok</label>
                  <input
                    type="number"
                    value={itemForm.min_stok}
                    onChange={(e) => setItemForm({ ...itemForm, min_stok: e.target.value })}
                    placeholder="5"
                    className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white font-mono focus:outline-none focus:border-[#00ffff]"
                  />
                </div>
              </div>

              {activeGudang === 'MERCHANDISE' && (
                <div>
                  <label className="block text-[#bbcbb2] font-semibold mb-1">Harga Jual ke Pelanggan (Rp)</label>
                  <input
                    type="number"
                    value={itemForm.harga_jual}
                    onChange={(e) => setItemForm({ ...itemForm, harga_jual: e.target.value })}
                    placeholder="Harga jual..."
                    required
                    className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#26272d]">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#18181c] hover:bg-[#26272d] text-white font-semibold border border-[#26272d]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#00ffff] hover:bg-[#00ffff]/90 text-[#0f0f0f] font-bold active:scale-[0.98] shadow-md"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-[#18181c] border border-[#26272d] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-[#26272d]">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-[#00ffff]" />
                <span>Restock Masuk: {restockTarget.nama_barang}</span>
              </h3>
              <button
                onClick={() => setShowRestockModal(false)}
                className="p-1 rounded-lg text-[#bbcbb2] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmRestock} className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]/80 flex items-center justify-between">
                <span className="text-[#bbcbb2]">Sisa Stok Sekarang:</span>
                <span className="font-mono font-bold text-white text-sm">
                  {restockTarget.stok} {restockTarget.satuan}
                </span>
              </div>

              <div>
                <label className="block text-[#bbcbb2] font-semibold mb-1">
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
                  className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white font-mono text-base font-bold focus:outline-none focus:border-[#00ffff]"
                />
              </div>

              <div>
                <label className="block text-[#bbcbb2] font-semibold mb-1">
                  Harga Beli / Satuan (Rp)
                </label>
                <input
                  type="number"
                  value={restockCost}
                  onChange={(e) => setRestockCost(e.target.value)}
                  placeholder="Harga beli..."
                  required
                  className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white font-mono focus:outline-none focus:border-[#00ffff]"
                />
                <span className="text-[11px] text-[#6b7367] mt-1 block">
                  *Otomatis menghitung Moving Average Cost (MAC) harga pokok baru.
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#00ffff]/10 border border-[#00ffff]/30 flex items-center justify-between font-mono">
                <span className="text-[#00ffff] font-bold text-[11px]">Total Tagihan Restock:</span>
                <span className="text-white font-bold text-sm">
                  {formatRupiah((parseFloat(restockQty) || 0) * (parseFloat(restockCost) || 0))}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#26272d]">
                <button
                  type="button"
                  onClick={() => setShowRestockModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#18181c] hover:bg-[#26272d] text-white font-semibold border border-[#26272d]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#00ffff] hover:bg-[#00ffff]/90 text-[#0f0f0f] font-bold shadow-md active:scale-[0.98]"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-[#18181c] border border-[#26272d] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-[#26272d]">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-blue-400" />
                <span>Stock Opname: {opnameTarget.nama_barang}</span>
              </h3>
              <button
                onClick={() => setShowOpnameModal(false)}
                className="p-1 rounded-lg text-[#bbcbb2] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmOpname} className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-[#18181c] border border-[#26272d]/80 flex items-center justify-between">
                <span className="text-[#bbcbb2]">Tercatat di Sistem:</span>
                <span className="font-mono font-bold text-white">
                  {opnameTarget.stok} {opnameTarget.satuan}
                </span>
              </div>

              <div>
                <label className="block text-[#bbcbb2] font-semibold mb-1">
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
                  className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white font-mono text-base font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between font-mono">
                <span className="text-blue-400 font-bold text-[11px]">Selisih Penyesuaian:</span>
                <span className={`font-bold text-sm ${
                  (parseFloat(opnameRealQty) || 0) - (parseFloat(opnameTarget.stok) || 0) < 0
                    ? 'text-rose-400'
                    : 'text-[#00ffff]'
                }`}>
                  {((parseFloat(opnameRealQty) || 0) - (parseFloat(opnameTarget.stok) || 0)).toFixed(1)} {opnameTarget.satuan}
                </span>
              </div>

              <div>
                <label className="block text-[#bbcbb2] font-semibold mb-1">
                  Catatan / Alasan Penyesuaian
                </label>
                <textarea
                  value={opnameCatatan}
                  onChange={(e) => setOpnameCatatan(e.target.value)}
                  placeholder="Misal: Tumpah, susut, atau koreksi hitung..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#18181c] border border-[#26272d] rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#26272d]">
                <button
                  type="button"
                  onClick={() => setShowOpnameModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#18181c] hover:bg-[#26272d] text-white font-semibold border border-[#26272d]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#00ffff] hover:bg-[#00ffff]/90 text-[#0f0f0f] font-bold shadow-md active:scale-[0.98]"
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
