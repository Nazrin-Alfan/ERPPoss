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
  if (n.includes('kopi')) return { emoji: '☕', gradient: 'from-amber-700/40 via-amber-900/30 to-slate-950', badge: 'Parfum' }
  if (n.includes('vanila') || n.includes('parfum')) return { emoji: '🌸', gradient: 'from-pink-700/40 via-rose-900/30 to-slate-950', badge: 'Parfum' }
  if (n.includes('microfiber') || n.includes('kain')) return { emoji: '✨', gradient: 'from-cyan-700/40 via-blue-900/30 to-slate-950', badge: 'Lap Micro' }
  if (n.includes('kanebo') || n.includes('chamois')) return { emoji: '🧽', gradient: 'from-yellow-700/40 via-amber-900/30 to-slate-950', badge: 'Kanebo' }
  if (n.includes('semir') || n.includes('tire') || n.includes('spray')) return { emoji: '🧴', gradient: 'from-emerald-700/40 via-teal-900/30 to-slate-950', badge: 'Detailing' }
  return { emoji: '🛍️', gradient: 'from-purple-700/40 via-slate-900/30 to-slate-950', badge: 'Retail' }
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari merchandise (parfum, lap, aksesoris)..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-all"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {cat === 'ALL' ? 'Semua Retail' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Merchandise Products - 100% Identical Dimensions to Cafe Menu Cards */}
      {displayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800/60 min-h-[300px]">
          <Package className="w-10 h-10 text-slate-600 mb-2 animate-pulse" />
          <p className="text-xs font-semibold text-slate-400">
            {(!items || items.length === 0) 
              ? 'Belum ada produk merchandise retail'
              : 'Tidak ada produk merchandise ditemukan'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {(!items || items.length === 0)
              ? 'Tambahkan produk merchandise baru melalui menu Kelola Admin > Tab Merchandise.'
              : 'Coba kata kunci lain atau pilih Semua Kategori.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 pr-1 content-start min-h-[450px]">
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
                      id_barang: prod.id_barang,
                      nama_menu: prodName,
                      harga: prodPrice,
                      kategori: 'Merchandise',
                      tipe: 'MERCHANDISE',
                      foto_url: prod.foto_url || ''
                    })
                  }
                }}
                className={`glass-card hover:border-amber-400/50 p-0 rounded-2xl flex flex-col justify-between text-left transition-all duration-300 group overflow-hidden h-[185px] relative shrink-0 cursor-pointer ${
                  inCart 
                    ? 'border-amber-400/70 ring-1 ring-amber-400/40 shadow-[0_0_15px_rgba(251,191,36,0.15)]' 
                    : 'border-slate-800'
                }`}
              >
                {/* Visual Banner / Gambar Icon */}
                <div className={`w-full h-24 relative overflow-hidden bg-gradient-to-br ${visual.gradient} flex items-center justify-center`}>
                  {/* Foto Produk atau Big Emoji Icon */}
                  {prod.foto_url ? (
                    <img
                      src={prod.foto_url}
                      alt={prodName}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <span className="text-4xl drop-shadow-lg group-hover:scale-110 transition-transform duration-300">
                      {prod.emoji || visual.emoji}
                    </span>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none"></div>

                  {/* Kategori Badge di sudut kiri atas */}
                  <span className="absolute top-2 left-2 text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase backdrop-blur-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm z-20">
                    {visual.badge}
                  </span>

                  {/* Stok / Counter Badge di sudut kanan atas */}
                  {inCart ? (
                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-lg shadow-amber-400/30 animate-pop-in z-20">
                      {inCart.qty}
                    </span>
                  ) : (
                    <span className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-md border backdrop-blur-md z-20 ${
                      currentStock <= 5 
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' 
                        : 'bg-slate-900/80 text-slate-300 border-slate-700/60'
                    }`}>
                      Stok: {currentStock}
                    </span>
                  )}
                </div>

                {/* Informasi Produk & Harga */}
                <div className="p-2.5 flex-1 flex flex-col justify-between bg-slate-950/80 backdrop-blur-md relative w-full">
                  <h4 className="font-bold text-xs text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-2 leading-tight">
                    {prodName}
                  </h4>

                  <div className="mt-1.5 flex justify-between items-center">
                    <span className="text-xs font-black text-amber-400 font-mono">
                      {formatRupiah(prodPrice)}
                    </span>

                    {/* Stepper jika ada di Cart, atau Plus Button */}
                    {inCart ? (
                      <div 
                        className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/30 rounded-lg p-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onUpdateQty && onUpdateQty(prodName, -1)}
                          className="w-5 h-5 rounded bg-slate-900 text-amber-400 hover:bg-slate-800 flex items-center justify-center font-bold text-xs"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="text-xs font-mono font-bold text-white px-0.5">
                          {inCart.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty && onUpdateQty(prodName, 1)}
                          className="w-5 h-5 rounded bg-slate-900 text-amber-400 hover:bg-slate-800 flex items-center justify-center font-bold text-xs"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={currentStock <= 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddToCart && onAddToCart({
                            id_barang: prod.id_barang,
                            nama_menu: prodName,
                            harga: prodPrice,
                            kategori: 'Merchandise',
                            tipe: 'MERCHANDISE'
                          })
                        }}
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs transition-all ${
                          currentStock <= 0
                            ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                            : 'bg-slate-800 text-slate-300 group-hover:bg-amber-400 group-hover:text-slate-950'
                        }`}
                      >
                        <Plus size={12} />
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
