import React, { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Plus, Sparkles, X, Tag } from 'lucide-react'

/**
 * CustomCategoryPicker
 * Pengganti native select browser untuk kategori menu cafe.
 * 100% custom UI dark theme RelayPOS, mendukung pencarian cepat,
 * penambahan kategori baru on-the-fly, dan badge visual.
 */
export default function CustomCategoryPicker({
  categories = [],
  value = '',
  onChange,
  onAddCategory,
  label = 'Kategori Menu'
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newCatInput, setNewCatInput] = useState('')
  const dropdownRef = useRef(null)

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
        setIsAddingNew(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredCategories = categories.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (cat) => {
    onChange && onChange(cat)
    setIsOpen(false)
    setIsAddingNew(false)
    setSearch('')
  }

  const handleAddNew = (e) => {
    e.preventDefault()
    const trimmed = newCatInput.trim()
    if (!trimmed) return
    if (onAddCategory) {
      onAddCategory(trimmed)
    }
    onChange && onChange(trimmed)
    setNewCatInput('')
    setIsAddingNew(false)
    setIsOpen(false)
  }

  return (
    <div className="space-y-1.5 relative" ref={dropdownRef}>
      <div className="flex justify-between items-center">
        <label className="block text-xs font-semibold text-[#bbcbb2] uppercase tracking-wider">
          {label}
        </label>
        <button
          type="button"
          onClick={() => {
            setIsOpen(true)
            setIsAddingNew(!isAddingNew)
            setNewCatInput('')
          }}
          className="text-[11px] font-bold text-[#ffc71f] hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Plus size={12} /> Tambah Kategori
        </button>
      </div>

      {/* Trigger Button (Custom UI, Bebas dari Native Select) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-[#1b1b1d] border text-left rounded-sm py-2 px-3 flex items-center justify-between text-xs transition-all outline-none cursor-pointer ${
          isOpen
            ? 'border-[#00ffff]'
            : 'border-[#26272d] hover:border-[#3f414a] hover:bg-[#242428]'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <Tag size={14} className="text-[#00ffff] shrink-0" />
          <span className="font-bold text-white truncate">
            {value || 'Pilih Kategori Menu'}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-[#bbcbb2] transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-[#00ffff]' : ''
          }`}
        />
      </button>

      {/* Custom Dropdown Modal Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-[#0f0f0f] border border-[#26272d] rounded-md shadow-2xl p-2 space-y-2 backdrop-blur-xl animate-pop-in">
          {/* Form Tambah Kategori Cepat */}
          {isAddingNew ? (
            <div className="p-2 rounded-sm bg-[#1b1b1d] border border-[#ffc71f]/30 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-[#ffc71f] flex items-center gap-1">
                  <Sparkles size={12} /> Buat Kategori Baru
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="text-[#bbcbb2] hover:text-white p-0.5"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ketik kategori (misal: Mocktail Signature)..."
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  className="flex-1 bg-[#0f0f0f] border border-[#26272d] rounded-sm px-2.5 py-1 text-xs text-white placeholder-[#6b7367] focus:outline-none focus:border-[#ffc71f]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddNew(e)
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddNew}
                  className="px-3 py-1 bg-[#ffc71f] hover:bg-[#ffc71f]/90 text-[#0f0f0f] font-bold text-xs rounded-sm shadow-xs cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </div>
          ) : (
            /* Input Pencarian Kategori */
            <div className="relative">
              <input
                type="text"
                placeholder="Cari kategori..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#1b1b1d] border border-[#26272d] rounded-sm px-3 py-1 text-xs text-white placeholder-[#6b7367] focus:outline-none focus:border-[#00ffff]"
                autoFocus
              />
            </div>
          )}

          {/* List Kategori Item */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
            {filteredCategories.length === 0 ? (
              <div className="p-3 text-center text-xs text-[#6b7367]">
                Tidak ada kategori "{search}".
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(true)
                    setNewCatInput(search)
                  }}
                  className="block mx-auto mt-1 text-[#ffc71f] font-bold hover:underline cursor-pointer"
                >
                  + Tambah "{search}" sekarang
                </button>
              </div>
            ) : (
              filteredCategories.map((cat) => {
                const isSelected = value === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelect(cat)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#00ffff] text-[#0f0f0f] font-bold'
                        : 'text-[#bbcbb2] hover:bg-[#1b1b1d] hover:text-white'
                    }`}
                  >
                    <span>{cat}</span>
                    {isSelected && <Check size={13} className="text-[#0f0f0f]" />}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer Aksi Tambah */}
          {!isAddingNew && (
            <button
              type="button"
              onClick={() => {
                setIsAddingNew(true)
                setNewCatInput('')
              }}
              className="w-full py-1.5 px-3 rounded-sm border border-dashed border-[#26272d] hover:border-[#ffc71f]/50 bg-[#1b1b1d]/40 text-[#bbcbb2] hover:text-[#ffc71f] text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus size={13} />
              <span>Tambah Kategori Baru</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
