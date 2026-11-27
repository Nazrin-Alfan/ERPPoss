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
      id: item.id || null,
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
      ...(formData.id ? { id: formData.id } : {}),
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
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShoppingBag className="text-warning" size={24} />
            Katalog Menu Merchandise & Retail
          </h2>
          <p className="text-xs text-muted mt-1">
            Kelola produk fisik siap jual di kasir POS (parfum mobil, lap microfiber, aksesoris, & oleh-oleh)
          </p>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-warning hover:opacity-90 text-ink-foreground font-bold text-xs shadow-lg shadow-sm transition-all active:scale-95 shrink-0"
        >
          <Plus size={16} />
          + Tambah Merchandise Baru
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface border border-border shadow-sm p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-muted uppercase tracking-wider">Total Item</div>
            <div className="text-2xl font-black text-foreground mt-1">{metrics.totalItems}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-warning-bg text-warning flex items-center justify-center">
            <Package size={20} />
          </div>
        </div>

        <div className="bg-surface border border-border shadow-sm p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-muted uppercase tracking-wider">Aktif di Kasir</div>
            <div className="text-2xl font-black text-success mt-1">{metrics.totalActive}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success-bg text-success flex items-center justify-center">
            <CheckCircle size={20} />
          </div>
        </div>

        <div className="bg-surface border border-border shadow-sm p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-muted uppercase tracking-wider">Total Stok Fisik</div>
            <div className="text-2xl font-black text-primary mt-1">{metrics.totalStok}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary-soft-foreground flex items-center justify-center">
            <Boxes size={20} />
          </div>
        </div>

        <div className="bg-surface border border-border shadow-sm p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-muted uppercase tracking-wider">Potensi Nilai Jual</div>
            <div className="text-lg font-black text-warning font-mono mt-1">
              {formatRupiah(metrics.totalNilaiJual)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-warning-bg text-warning flex items-center justify-center">
            <TrendingUp size={20} />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Cari nama produk, kode barang..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface border border-border text-xs text-foreground placeholder:text-muted-dark focus:outline-none focus:border-ring"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
          {MERCHANDISE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-warning text-ink-foreground shadow-md shadow-sm'
                  : 'bg-surface border border-border text-muted hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product List Grid */}
      {filteredList.length === 0 ? (
        <div className="bg-surface border border-border shadow-sm p-12 text-center rounded-2xl">
          <ShoppingBag className="mx-auto text-muted-dark mb-3" size={48} />
          <h3 className="text-base font-bold text-muted">Belum Ada Produk Merchandise</h3>
          <p className="text-xs text-muted-dark mt-1 max-w-sm mx-auto">
            Tambahkan produk retail pertama Anda seperti parfum mobil, lap microfiber, atau kanebo untuk dijual di kasir POS.
          </p>
          <button
            onClick={openNewModal}
            className="mt-4 px-4 py-2 rounded-xl bg-warning hover:opacity-90 text-ink-foreground font-bold text-xs inline-flex items-center gap-2"
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
                className={`bg-surface border border-border shadow-sm p-4 rounded-2xl transition-all relative overflow-hidden flex flex-col justify-between ${
                  isActive ? 'border-border hover:border-warning/50' : 'border-border opacity-60 bg-surface'
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
                          className="w-11 h-11 rounded-xl object-cover border border-border shrink-0"
                        />
                      ) : (
                        <span className="text-2xl p-2 rounded-xl bg-surface border border-border">
                          {item.emoji || item.icon || '🛍️'}
                        </span>
                      )}
                      <div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/30">
                          {item.kategori || 'Merchandise'}
                        </span>
                        <div className="text-[10px] text-muted-dark font-mono mt-0.5">
                          ID: {item.id_barang || item.id_bahan_baku}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleActive(item.id || item.id_barang || item.id_bahan_baku, isActive)}
                      title={isActive ? 'Nonaktifkan dari Kasir' : 'Aktifkan ke Kasir'}
                      className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 font-bold transition-all ${
                        isActive
                          ? 'bg-success-bg border-success/30 text-success hover:bg-primary-hover'
                          : 'bg-destructive-bg border-destructive/30 text-destructive hover:bg-destructive-bg'
                      }`}
                    >
                      {isActive ? <Eye size={12} /> : <EyeOff size={12} />}
                      <span>{isActive ? 'Aktif' : 'Off'}</span>
                    </button>
                  </div>

                  <h3 className="font-bold text-sm text-foreground line-clamp-1">
                    {item.nama_barang || item.nama_produk}
                  </h3>

                  {/* Pricing Matrix & Margin */}
                  <div className="mt-3 p-2.5 rounded-xl bg-surface border border-border grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[10px] text-muted">Harga Jual (Kasir)</div>
                      <div className="font-black text-warning font-mono text-sm">
                        {formatRupiah(hJual)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted">HPP / Beli</div>
                      <div className="font-bold text-muted font-mono">
                        {formatRupiah(hBeli)}
                      </div>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-border flex items-center justify-between text-[11px]">
                      <span className="text-muted">Margin Profit:</span>
                      <span className="font-bold text-success font-mono">
                        +{formatRupiah(margin)} ({marginPercent}%)
                      </span>
                    </div>
                  </div>

                  {/* Stock Information */}
                  <div className="mt-2.5 flex items-center justify-between text-xs px-1">
                    <span className="text-muted flex items-center gap-1">
                      <Boxes size={13} className="text-primary" />
                      Stok Fisik:
                    </span>
                    <span className={`font-mono font-bold ${item.stok <= (item.min_stok || 5) ? 'text-destructive' : 'text-foreground'}`}>
                      {item.stok} {item.satuan || 'Pcs'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEditModal(item)}
                    className="p-2 rounded-xl bg-subsurface hover:bg-surface-hover text-foreground text-xs font-bold flex items-center gap-1.5 transition-all"
                  >
                    <Edit3 size={14} className="text-primary" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => onDeleteMerchandise(item.id || item.id_barang || item.id_bahan_baku)}
                    className="p-2 rounded-xl bg-destructive-bg hover:bg-destructive-bg text-destructive border border-destructive/30 text-xs font-bold transition-all"
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
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 z-50 bg-[var(--overlay-backdrop)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border shadow-sm w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex justify-between items-center bg-surface">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <ShoppingBag className="text-warning" size={18} />
                {editingItem ? 'Edit Produk Merchandise' : 'Tambah Produk Merchandise Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-foreground p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-center gap-2">
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
                <label className="block text-xs font-bold text-muted">
                  Ikon & Nama Produk Merchandise <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={formData.emoji}
                      onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
                      className="px-3 py-2 rounded-xl bg-surface border border-border text-xl focus:outline-none focus:border-ring cursor-pointer"
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
                    className="flex-1 px-3.5 py-2 rounded-xl bg-surface border border-border text-xs text-foreground placeholder:text-muted-dark focus:outline-none focus:border-ring font-medium"
                  />
                </div>
              </div>

              {/* Kategori & Satuan */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-muted">Kategori Retail</label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-foreground focus:outline-none focus:border-ring"
                  >
                    <option value="Parfum Mobil">Parfum Mobil</option>
                    <option value="Lap & Perawatan">Lap & Perawatan</option>
                    <option value="Aksesoris & Detailing">Aksesoris & Detailing</option>
                    <option value="Chemical Retail">Chemical Retail</option>
                    <option value="Snack & Minuman Ringan">Snack & Minuman Ringan</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-muted">Satuan Penjualan</label>
                  <select
                    value={formData.satuan}
                    onChange={(e) => setFormData({ ...formData, satuan: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs text-foreground focus:outline-none focus:border-ring"
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
                  <label className="block text-xs font-bold text-warning">
                    Harga Jual Kasir (Rp) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="35000"
                    value={formData.harga_jual}
                    onChange={(e) => setFormData({ ...formData, harga_jual: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface border border-warning/30 text-xs font-mono font-bold text-warning placeholder:text-muted-dark focus:outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-muted">
                    Harga Beli HPP (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="18000"
                    value={formData.harga_beli}
                    onChange={(e) => setFormData({ ...formData, harga_beli: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-foreground placeholder:text-muted-dark focus:outline-none focus:border-ring"
                  />
                </div>
              </div>

              {/* Live Margin Calculation Alert */}
              <div className="p-3 rounded-xl bg-warning-bg border border-warning/30 flex items-center justify-between text-xs">
                <span className="text-muted flex items-center gap-1.5">
                  <Percent size={14} className="text-warning" />
                  Estimasi Profit Margin:
                </span>
                <span className="font-mono font-bold text-warning">
                  +{formatRupiah(marginRp)} ({marginPct}%)
                </span>
              </div>

              {/* Stok Awal & Min Stok */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-muted">Stok Awal Fisik</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stok}
                    onChange={(e) => setFormData({ ...formData, stok: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-foreground focus:outline-none focus:border-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-muted">Batas Minimum Stok (Alert)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.min_stok}
                    onChange={(e) => setFormData({ ...formData, min_stok: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border text-xs font-mono text-foreground focus:outline-none focus:border-ring"
                  />
                </div>
              </div>

              {/* Status Tampil di Kasir */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border">
                <input
                  type="checkbox"
                  id="chk_active_pos"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-border text-warning focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="chk_active_pos" className="text-xs text-foreground font-bold cursor-pointer">
                  Tampilkan Produk ini di Katalog Kasir POS
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-subsurface hover:bg-surface-hover text-muted text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl bg-warning hover:opacity-90 text-ink-foreground font-bold text-xs shadow-lg shadow-sm"
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
