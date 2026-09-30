import React, { useState, useMemo } from 'react'
import {
  ShoppingBag,
  Plus,
  Edit3,
  Trash2,
  CheckCircle,
  AlertCircle,
  Search,
  Tag,
  DollarSign,
  Package,
  TrendingUp,
  Percent,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
  Boxes
} from 'lucide-react'
import { formatRupiah } from '../../utils/helpers'
import ImageUploadPaste from '../common/ImageUploadPaste'

// Kategori default merchandise retail
export const MERCHANDISE_CATEGORIES = [
  'Semua Kategori',
  'Parfum Mobil',
  'Lap & Perawatan',
  'Aksesoris & Detailing',
  'Chemical Retail',
  'Snack & Minuman Ringan'
]

// Preset emoji/icon untuk merchandise
const EMOJI_OPTIONS = ['☕', '🚗', '🧽', '🧼', '✨', '🧴', '🔑', '🏷️', '🏎️', '🫧', '🎁', '📦']

export default function MerchandiseManager({
  merchandiseList = [],
  onSaveMerchandise,
  onDeleteMerchandise,
  onToggleActive,
  loading = false
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Semua Kategori')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  // Form State
  const [formData, setFormData] = useState({
    id_barang: '',
    nama_barang: '',
    kategori: 'Parfum Mobil',
    harga_beli: '',
    harga_jual: '',
    stok: 10,
    min_stok: 5,
    satuan: 'Pcs',
    emoji: '✨',
    foto_url: '',
    is_active: true,
    keterangan: ''
  })

  const [formError, setFormError] = useState('')

  // Filter List
  const filteredList = useMemo(() => {
    return merchandiseList.filter(item => {
      const matchSearch =
        (item.nama_barang || item.nama_produk || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.id_barang || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchCategory =
        selectedCategory === 'Semua Kategori' || item.kategori === selectedCategory || item.sub_kategori === selectedCategory
      return matchSearch && matchCategory
    })
  }, [merchandiseList, searchQuery, selectedCategory])

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalItems = merchandiseList.length
    const totalActive = merchandiseList.filter(m => m.is_active !== false).length
    const totalStok = merchandiseList.reduce((acc, curr) => acc + (parseFloat(curr.stok) || 0), 0)
    const totalNilaiJual = merchandiseList.reduce(
      (acc, curr) => acc + (parseFloat(curr.harga_jual) || 0) * (parseFloat(curr.stok) || 0),
      0
    )
    return { totalItems, totalActive, totalStok, totalNilaiJual }
  }, [merchandiseList])

  const openNewModal = () => {
    setEditingItem(null)
    setFormData({
      id_barang: 'MCH-' + Date.now().toString(36).toUpperCase().substring(2, 6),
      nama_barang: '',
      kategori: 'Parfum Mobil',
      harga_beli: '',
      harga_jual: '',
      stok: 10,
      min_stok: 5,
      satuan: 'Pcs',
      emoji: '✨',
      foto_url: '',
      is_active: true,
      keterangan: ''
    })
    setFormError('')
    setIsModalOpen(true)
  }

  const openEditModal = (item) => {
    setEditingItem(item)
    setFormData({
      id_barang: item.id_barang || item.id_bahan_baku || '',
      nama_barang: item.nama_barang || item.nama_produk || '',
      kategori: item.kategori || 'Parfum Mobil',
      harga_beli: item.harga_beli !== undefined ? item.harga_beli : '',
      harga_jual: item.harga_jual !== undefined ? item.harga_jual : '',
      stok: item.stok !== undefined ? item.stok : 0,
      min_stok: item.min_stok !== undefined ? item.min_stok : 5,
      satuan: item.satuan || 'Pcs',
      emoji: item.emoji || item.icon || '✨',
      foto_url: item.foto_url || '',
      is_active: item.is_active !== false,
      keterangan: item.keterangan || ''
    })
    setFormError('')
    setIsModalOpen(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.nama_barang.trim()) {
      setFormError('Nama produk merchandise wajib diisi.')
      return
    }
    const hj = parseFloat(formData.harga_jual) || 0
    if (hj <= 0) {
      setFormError('Harga jual ke pelanggan harus lebih dari Rp 0.')
      return
    }

    onSaveMerchandise({
      id_barang: formData.id_barang,
      id_bahan_baku: formData.id_barang,
      nama_barang: formData.nama_barang.trim(),
      nama_produk: formData.nama_barang.trim(),
      gudang: 'MERCHANDISE',
      kategori: formData.kategori,
      sub_kategori: formData.kategori,
      harga_beli: parseFloat(formData.harga_beli) || 0,
      harga_jual: hj,
      stok: parseFloat(formData.stok) || 0,
      min_stok: parseFloat(formData.min_stok) || 0,
      satuan: formData.satuan,
      emoji: formData.emoji,
      icon: formData.emoji,
      foto_url: formData.foto_url,
      is_active: formData.is_active,
      keterangan: formData.keterangan
    })

    setIsModalOpen(false)
  }

  // Margin calculation
  const hb = parseFloat(formData.harga_beli) || 0
  const hj = parseFloat(formData.harga_jual) || 0
  const marginRp = hj - hb
  const marginPct = hj > 0 ? ((marginRp / hj) * 100).toFixed(1) : 0

  return (
    <div className="space-y-6">
      {/* Header & Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ShoppingBag className="text-amber-400" size={24} />
            Katalog Menu Merchandise & Retail
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Kelola produk fisik siap jual di kasir POS (parfum mobil, lap microfiber, aksesoris, & oleh-oleh)
          </p>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95 shrink-0"
        >
          <Plus size={16} />
          + Tambah Merchandise Baru
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Item</div>
            <div className="text-2xl font-black text-slate-100 mt-1">{metrics.totalItems}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Package size={20} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Aktif di Kasir</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{metrics.totalActive}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <CheckCircle size={20} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Stok Fisik</div>
            <div className="text-2xl font-black text-cyan-400 mt-1">{metrics.totalStok}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Boxes size={20} />
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Potensi Nilai Jual</div>
            <div className="text-lg font-black text-amber-400 font-mono mt-1">
              {formatRupiah(metrics.totalNilaiJual)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Cari nama produk, kode barang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
          {MERCHANDISE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product List Grid */}
      {filteredList.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-2xl border border-slate-800">
          <ShoppingBag className="mx-auto text-slate-600 mb-3" size={48} />
          <h3 className="text-base font-bold text-slate-300">Belum Ada Produk Merchandise</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Tambahkan produk retail pertama Anda seperti parfum mobil, lap microfiber, atau kanebo untuk dijual di kasir POS.
          </p>
          <button
            onClick={openNewModal}
            className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2"
          >
            <Plus size={14} /> + Tambah Produk
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredList.map((item) => {
            const hBeli = parseFloat(item.harga_beli) || 0
            const hJual = parseFloat(item.harga_jual) || 0
            const margin = hJual - hBeli
            const marginPercent = hJual > 0 ? ((margin / hJual) * 100).toFixed(0) : 0
            const isActive = item.is_active !== false

            return (
              <div
                key={item.id_barang || item.id_bahan_baku}
                className={`glass-card p-4 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                  isActive ? 'border-slate-800 hover:border-amber-500/50' : 'border-slate-800/40 opacity-60 bg-slate-950/40'
                }`}
              >
                {/* Top Badge & Status */}
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      {item.foto_url ? (
                        <img
                          src={item.foto_url}
                          alt={item.nama_barang || item.nama_produk}
                          className="w-11 h-11 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                      ) : (
                        <span className="text-2xl p-2 rounded-xl bg-slate-900 border border-slate-800">
                          {item.emoji || item.icon || '🛍️'}
                        </span>
                      )}
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {item.kategori || 'Merchandise'}
                        </span>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          ID: {item.id_barang || item.id_bahan_baku}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleActive(item.id_barang || item.id_bahan_baku, isActive)}
                      title={isActive ? 'Nonaktifkan dari Kasir' : 'Aktifkan ke Kasir'}
                      className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 font-bold transition-all ${
                        isActive
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                      }`}
                    >
                      {isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                      <span>{isActive ? 'Aktif' : 'Off'}</span>
                    </button>
                  </div>

                  <h3 className="font-bold text-sm text-slate-100 line-clamp-1">
                    {item.nama_barang || item.nama_produk}
                  </h3>

                  {/* Pricing Matrix & Margin */}
                  <div className="mt-3 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400">Harga Jual (Kasir)</div>
                      <div className="font-black text-amber-400 font-mono text-sm">
                        {formatRupiah(hJual)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">HPP / Beli</div>
                      <div className="font-bold text-slate-300 font-mono">
                        {formatRupiah(hBeli)}
                      </div>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Margin Profit:</span>
                      <span className="font-bold text-emerald-400 font-mono">
                        +{formatRupiah(margin)} ({marginPercent}%)
                      </span>
                    </div>
                  </div>

                  {/* Stock Information */}
                  <div className="mt-2.5 flex items-center justify-between text-xs px-1">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Boxes size={13} className="text-cyan-400" />
                      Stok Fisik:
                    </span>
                    <span className={`font-mono font-bold ${item.stok <= (item.min_stok || 5) ? 'text-rose-400' : 'text-slate-200'}`}>
                      {item.stok} {item.satuan || 'Pcs'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEditModal(item)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Edit3 size={14} className="text-cyan-400" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => onDeleteMerchandise(item.id_barang || item.id_bahan_baku)}
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-all"
                    title="Hapus Produk"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Tambah / Edit Merchandise */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/60">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <ShoppingBag className="text-amber-400" size={18} />
                {editingItem ? 'Edit Produk Merchandise' : 'Tambah Produk Merchandise Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle size={15} />
                  <span>{formError}</span>
                </div>
              )}

              {/* Upload Foto Produk (PNG/JPG, Copy-Paste, Max 2MB) */}
              <ImageUploadPaste
                value={formData.foto_url}
                onChange={(val) => setFormData(prev => ({ ...prev, foto_url: val }))}
                maxSizeMB={2}
                label="Foto Produk Merchandise (Opsional)"
                helperText="Upload file atau tekan Ctrl+V untuk Paste gambar (PNG/JPG, maks 2MB, auto-kompres)"
              />

              {/* Emoji & Nama Produk */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  Ikon & Nama Produk Merchandise <span className="text-rose-400">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={formData.emoji}
                      onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xl focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      {EMOJI_OPTIONS.map((em) => (
                        <option key={em} value={em}>
                          {em}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Parfum Mobil Kopi Bali 50ml"
                    value={formData.nama_barang}
                    onChange={(e) => setFormData({ ...formData, nama_barang: e.target.value })}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>
              </div>

              {/* Kategori & Satuan */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Kategori Retail</label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Parfum Mobil">Parfum Mobil</option>
                    <option value="Lap & Perawatan">Lap & Perawatan</option>
                    <option value="Aksesoris & Detailing">Aksesoris & Detailing</option>
                    <option value="Chemical Retail">Chemical Retail</option>
                    <option value="Snack & Minuman Ringan">Snack & Minuman Ringan</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Satuan Penjualan</label>
                  <select
                    value={formData.satuan}
                    onChange={(e) => setFormData({ ...formData, satuan: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Pcs">Pcs</option>
                    <option value="Botol">Botol</option>
                    <option value="Set">Set</option>
                    <option value="Pack">Pack</option>
                    <option value="Kaleng">Kaleng</option>
                  </select>
                </div>
              </div>

              {/* Harga Jual & Harga Beli */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-amber-400">
                    Harga Jual Kasir (Rp) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="35000"
                    value={formData.harga_jual}
                    onChange={(e) => setFormData({ ...formData, harga_jual: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-amber-500/50 text-xs font-mono font-bold text-amber-400 placeholder-slate-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    Harga Beli HPP (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="18000"
                    value={formData.harga_beli}
                    onChange={(e) => setFormData({ ...formData, harga_beli: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Live Margin Calculation Alert */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Percent size={14} className="text-amber-400" />
                  Estimasi Profit Margin:
                </span>
                <span className="font-mono font-bold text-amber-400">
                  +{formatRupiah(marginRp)} ({marginPct}%)
                </span>
              </div>

              {/* Stok Awal & Min Stok */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Stok Awal Fisik</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stok}
                    onChange={(e) => setFormData({ ...formData, stok: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">Batas Minimum Stok (Alert)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.min_stok}
                    onChange={(e) => setFormData({ ...formData, min_stok: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Status Tampil di Kasir */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <input
                  type="checkbox"
                  id="chk_active_pos"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-slate-700 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="chk_active_pos" className="text-xs text-slate-200 font-bold cursor-pointer">
                  Tampilkan Produk ini di Katalog Kasir POS
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20"
                >
                  {loading ? 'Menyimpan...' : 'Simpan Produk Merchandise'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
