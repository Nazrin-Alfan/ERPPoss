import React, { useState, useMemo } from 'react'
import { ShoppingBag, Search, Plus, Minus, Check, Package, Sparkles } from 'lucide-react'
import { formatRupiah } from '../../utils/helpers'

export const DEFAULT_MERCHANDISE_ITEMS = [
  {
    id_barang: 'MCH-01',
    nama_barang: 'Parfum Mobil Aroma Kopi Bali',
    kategori: 'Parfum Mobil',
    harga_jual: 35000,
    harga_beli: 18000,
    stok: 25,
    satuan: 'botol',
    emoji: '☕',
    description: 'Aroma kopi fresh biji sangrai asli tahan 30 hari.'
  },
  {
    id_barang: 'MCH-02',
    nama_barang: 'Kain Microfiber Premium 40x40',
    kategori: 'Lap & Perawatan',
    harga_jual: 25000,
    harga_beli: 12000,
    stok: 40,
    satuan: 'pcs',
    emoji: '✨',
    description: 'Serat halus 350 GSM tidak bikin baret bodi mobil.'
  },
  {
    id_barang: 'MCH-03',
    nama_barang: 'Lap Kanebo Chamois Super Serap',
    kategori: 'Lap & Perawatan',
    harga_jual: 30000,
    harga_beli: 15000,
    stok: 30,
    satuan: 'pcs',
    emoji: '🧽',
    description: 'Daya serap air tinggi dan awet digunakan berkali-kali.'
  },
  {
    id_barang: 'MCH-04',
    nama_barang: 'Semir Ban Spray Glossy 250ml',
    kategori: 'Aksesoris & Detailing',
    harga_jual: 45000,
    harga_beli: 22000,
    stok: 18,
    satuan: 'botol',
    emoji: '🧴',
    description: 'Efek wet look mengkilap hitam pekat tahan air.'
  },
  {
    id_barang: 'MCH-05',
    nama_barang: 'Parfum Gantung Aroma Vanila',
    kategori: 'Parfum Mobil',
    harga_jual: 20000,
    harga_beli: 9000,
    stok: 50,
    satuan: 'pcs',
    emoji: '🌸',
    description: 'Aroma vanila manis lembut tidak bikin pusing.'
  },
  {
    id_barang: 'MCH-06',
    nama_barang: 'Gantungan Kunci & Bantal Leher',
    kategori: 'Aksesoris & Detailing',
    harga_jual: 65000,
    harga_beli: 35000,
    stok: 12,
    satuan: 'set',
    emoji: '🚗',
    description: 'Bantal leher ergonomis nyaman untuk perjalanan jauh.'
  }
]

const getMerchandiseVisual = (name = '') => {
  const n = name.toLowerCase()
  if (n.includes('kopi')) return { toneClass: 'bg-warning-bg text-warning border border-warning/30', badge: 'Parfum' }
  if (n.includes('vanila') || n.includes('parfum')) return { toneClass: 'bg-primary-soft text-primary-soft-foreground border border-primary/30', badge: 'Parfum' }
  if (n.includes('microfiber') || n.includes('kain')) return { toneClass: 'bg-primary-soft text-primary-soft-foreground border border-primary/30', badge: 'Lap Micro' }
  if (n.includes('kanebo') || n.includes('chamois')) return { toneClass: 'bg-warning-bg text-warning border border-warning/30', badge: 'Kanebo' }
  if (n.includes('semir') || n.includes('tire') || n.includes('spray')) return { toneClass: 'bg-success-bg text-success border border-success/30', badge: 'Detailing' }
  return { toneClass: 'bg-surface text-foreground border border-border', badge: 'Retail' }
}

export default function MerchandiseCatalog({ 
  items = [], 
  cart = [], 
  onAddToCart, 
  onUpdateQty, 
  onRemoveFromCart 
}) {
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Dynamic stock items from active tenant inventory
  const displayItems = useMemo(() => {
    const list = Array.isArray(items) ? items : []
    return list.filter(item => {
      const matchCat = selectedCategory === 'ALL' || item.kategori === selectedCategory
      const matchQuery = !searchQuery || 
        (item.nama_barang || item.nama_produk || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.id_barang || item.id_bahan_baku || '').toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchQuery
    })
  }, [items, selectedCategory, searchQuery])

  const categories = useMemo(() => {
    const list = Array.isArray(items) ? items : []
    const cats = new Set(list.map(i => i.kategori || 'Merchandise'))
    return ['ALL', ...Array.from(cats)]
  }, [items])

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-dark" />
          <input
            type="text"
            aria-label="Cari merchandise"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari merchandise (parfum, lap, aksesoris)..."
            className="w-full min-h-[44px] pl-10 pr-3 py-2 bg-subsurface border border-border rounded-xl text-base sm:text-xs text-foreground placeholder:text-muted-dark focus:outline-none focus:border-ring transition-all"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-subsurface text-muted hover:text-foreground border border-border'
              }`}
            >
              {cat === 'ALL' ? 'Semua Retail' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Merchandise Products - Compact Two-Column Mobile Friendly */}
      {displayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-surface rounded-xl border border-border min-h-[300px]">
          <Package className="w-10 h-10 text-muted-dark mb-2" />
          <p className="text-xs font-semibold text-foreground">
            {(!items || items.length === 0) 
              ? 'Belum ada produk merchandise retail'
              : 'Tidak ada produk merchandise ditemukan'}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            {(!items || items.length === 0)
              ? 'Tambahkan produk merchandise baru melalui menu Kelola Admin > Tab Merchandise.'
              : 'Coba kata kunci lain atau pilih Semua Kategori.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 pr-1 content-start min-h-[420px]">
          {displayItems.map((prod) => {
            const prodName = prod.nama_barang || prod.nama_produk
            const prodPrice = prod.harga_jual || prod.harga || 0
            const inCart = cart.find((c) => c.nama_menu === prodName)
            const currentStock = prod.stok !== undefined ? prod.stok : 20
            const visual = getMerchandiseVisual(prodName)

            return (
              <div
                key={prod.id_barang || prodName}
                onClick={() => {
                  if (currentStock > 0 && !inCart) {
                    onAddToCart && onAddToCart({
                      stok_barang_id: prod.id || null,
                      id_barang: prod.id_barang,
                      nama_menu: prodName,
                      harga: prodPrice,
                      kategori: 'Merchandise',
                      tipe: 'MERCHANDISE',
                      foto_url: prod.foto_url || ''
                    })
                  }
                }}
                className={`border p-0 rounded-xl flex flex-col justify-between text-left transition-all duration-200 group overflow-hidden min-h-[188px] relative shrink-0 cursor-pointer ${
                  inCart 
                    ? 'bg-selected-surface border-border-active ring-1 ring-ring/40 shadow-sm' 
                    : 'bg-surface border-border hover:border-border-hover'
                }`}
              >
                {/* Visual Banner */}
                <div className="w-full h-24 relative overflow-hidden bg-subsurface flex items-center justify-center border-b border-border/50">
                  {prod.foto_url ? (
                    <>
                      <img
                        src={prod.foto_url}
                        alt={prodName}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent pointer-events-none" />
                    </>
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-surface border border-border flex items-center justify-center text-muted group-hover:text-primary group-hover:scale-105 transition-all">
                      <ShoppingBag size={24} />
                    </div>
                  )}

                  {/* Kategori Badge */}
                  <span className={`absolute top-2 left-2 text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase backdrop-blur-md shadow-sm z-[5] ${visual.toneClass}`}>
                    {visual.badge}
                  </span>

                  {/* Stok / Counter Badge */}
                  {inCart ? (
                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground font-black text-xs flex items-center justify-center shadow-sm animate-pop-in z-[5] tabular-nums">
                      {inCart.qty}
                    </span>
                  ) : (
                    <span className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md border backdrop-blur-md z-[5] tabular-nums ${
                      currentStock <= 5 
                        ? 'bg-destructive-bg text-destructive border-destructive/30' 
                        : 'bg-surface/90 text-foreground border-border'
                    }`}>
                      Stok: {currentStock}
                    </span>
                  )}
                </div>

                {/* Informasi Produk & Harga */}
                <div className={`p-2.5 flex-1 flex flex-col justify-between relative w-full ${inCart ? 'bg-selected-surface' : 'bg-surface'}`}>
                  <h4 className="font-bold text-xs text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                    {prodName}
                  </h4>

                  <div className="mt-1.5 flex justify-between items-center gap-1.5">
                    <span className="text-xs font-black text-foreground font-mono tabular-nums">
                      {formatRupiah(prodPrice)}
                    </span>

                    {/* Stepper jika ada di Cart, atau Plus Button */}
                    {inCart ? (
                      <div 
                        className="flex items-center gap-1 bg-subsurface border border-border rounded-full p-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label={`Kurangi ${prodName}`}
                          onClick={() => onUpdateQty && onUpdateQty(prodName, -1)}
                          className="w-7 h-7 rounded-full bg-surface text-foreground hover:bg-surface-hover border border-border flex items-center justify-center font-bold text-xs"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="text-xs font-mono font-bold text-foreground px-1 tabular-nums">
                          {inCart.qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`Tambah ${prodName}`}
                          onClick={() => onUpdateQty && onUpdateQty(prodName, 1)}
                          className="w-7 h-7 rounded-full bg-primary text-primary-foreground hover:bg-primary-hover flex items-center justify-center font-bold text-xs"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Tambah ${prodName} ke keranjang`}
                        disabled={currentStock <= 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddToCart && onAddToCart({
                            stok_barang_id: prod.id || null,
                            id_barang: prod.id_barang,
                            nama_menu: prodName,
                            harga: prodPrice,
                            kategori: 'Merchandise',
                            tipe: 'MERCHANDISE'
                          })
                        }}
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all border ${
                          currentStock <= 0
                            ? 'bg-subsurface border-border text-muted-dark cursor-not-allowed'
                            : 'bg-subsurface border-border text-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary'
                        }`}
                      >
                        <Plus size={14} />
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
  )
}
