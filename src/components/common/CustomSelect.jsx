import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Search, X } from 'lucide-react'

/**
 * CustomSelect
 * Komponen Dropdown 100% Custom UI (Bebas dari Native Select OS/Browser).
 * 
 * Props:
 * - value: string | number
 * - onChange: (value) => void
 * - options: Array<{ value: string|number, label: string, icon?: any, badge?: string, subtitle?: string }> | Array<string>
 * - placeholder?: string
 * - label?: string
 * - searchable?: boolean
 * - searchPlaceholder?: string
 * - size?: 'xs' | 'sm' | 'md' | 'lg'
 * - variant?: 'emerald' | 'blue' | 'rose' | 'amber' | 'purple' | 'cyan' | 'slate'
 * - disabled?: boolean
 * - className?: string
 * - menuClassName?: string
 * - align?: 'left' | 'right'
 * - icon?: React.ReactNode
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Pilih...',
  label = null,
  searchable = false,
  searchPlaceholder = 'Cari pilihan...',
  size = 'sm',
  variant = 'emerald',
  disabled = false,
  className = '',
  menuClassName = '',
  align = 'left',
  icon = null
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)

  // Normalize options array into { value, label } shape
  const normalizedOptions = React.useMemo(() => {
    return options.map(opt => {
      if (typeof opt === 'object' && opt !== null) {
        return {
          value: opt.value !== undefined ? opt.value : opt.label,
          label: opt.label !== undefined ? opt.label : String(opt.value),
          badge: opt.badge,
          subtitle: opt.subtitle,
          icon: opt.icon,
          disabled: opt.disabled
        }
      }
      return {
        value: opt,
        label: String(opt)
      }
    })
  }, [options])

  // Selected Option Object
  const selectedOption = React.useMemo(() => {
    return normalizedOptions.find(opt => String(opt.value) === String(value))
  }, [normalizedOptions, value])

  // Filtered options based on search
  const filteredOptions = React.useMemo(() => {
    if (!searchable || !search.trim()) return normalizedOptions
    const q = search.toLowerCase()
    return normalizedOptions.filter(opt => 
      opt.label.toLowerCase().includes(q) || 
      (opt.subtitle && opt.subtitle.toLowerCase().includes(q))
    )
  }, [normalizedOptions, search, searchable])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  // Auto focus search input when opened
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen, searchable])

  // Handle keyboard events (Escape to close)
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setSearch('')
    }
  }

  const handleSelect = (optVal) => {
    if (disabled) return
    onChange && onChange(optVal)
    setIsOpen(false)
    setSearch('')
  }

  // Color variants mapping (VRS_2026 Cyan Theme)
  const variantStyles = {
    emerald: {
      borderActive: 'border-[#00ffff]',
      activeItem: 'bg-[#00ffff]/15 text-[#00ffff] font-bold',
      checkColor: 'text-[#00ffff]',
      badge: 'bg-[#00ffff]/10 text-[#00ffff] border-[#00ffff]/20',
      arrowColor: 'text-[#00ffff]'
    },
    cyan: {
      borderActive: 'border-[#00ffff]',
      activeItem: 'bg-[#00ffff]/15 text-[#00ffff] font-bold',
      checkColor: 'text-[#00ffff]',
      badge: 'bg-[#00ffff]/10 text-[#00ffff] border-[#00ffff]/20',
      arrowColor: 'text-[#00ffff]'
    },
    blue: {
      borderActive: 'border-[#00ffff]',
      activeItem: 'bg-[#00ffff]/15 text-[#00ffff] font-bold',
      checkColor: 'text-[#00ffff]',
      badge: 'bg-[#00ffff]/10 text-[#00ffff] border-[#00ffff]/20',
      arrowColor: 'text-[#00ffff]'
    },
    rose: {
      borderActive: 'border-[#ff5102]',
      activeItem: 'bg-[#ff5102]/15 text-[#ff5102] font-bold',
      checkColor: 'text-[#ff5102]',
      badge: 'bg-[#ff5102]/10 text-[#ff5102] border-[#ff5102]/20',
      arrowColor: 'text-[#ff5102]'
    },
    amber: {
      borderActive: 'border-[#ffc71f]',
      activeItem: 'bg-[#ffc71f]/15 text-[#ffc71f] font-bold',
      checkColor: 'text-[#ffc71f]',
      badge: 'bg-[#ffc71f]/10 text-[#ffc71f] border-[#ffc71f]/20',
      arrowColor: 'text-[#ffc71f]'
    },
    purple: {
      borderActive: 'border-[#f57733]',
      activeItem: 'bg-[#f57733]/15 text-[#f57733] font-bold',
      checkColor: 'text-[#f57733]',
      badge: 'bg-[#f57733]/10 text-[#f57733] border-[#f57733]/20',
      arrowColor: 'text-[#f57733]'
    },
    slate: {
      borderActive: 'border-[#3f414a]',
      activeItem: 'bg-[#1b1b1d] text-white font-bold',
      checkColor: 'text-white',
      badge: 'bg-[#1b1b1d] text-[#bbcbb2] border-[#26272d]',
      arrowColor: 'text-[#bbcbb2]'
    }
  }

  const currentVariant = variantStyles[variant] || variantStyles.cyan

  // Sizing styles mapping (VRS_2026 compact radius 0.25rem)
  const sizeStyles = {
    xs: 'py-1 px-2.5 text-[11px] rounded-sm',
    sm: 'py-1.5 px-3 text-xs rounded-sm',
    md: 'py-2 px-3 text-xs md:text-sm rounded-sm',
    lg: 'py-2.5 px-3.5 text-sm rounded-sm'
  }

  const iconSizes = {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 16
  }

  const chevronSize = iconSizes[size] || 13

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label className="block text-[11px] font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}

      {/* Custom Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-[#1b1b1d] border text-left flex items-center justify-between gap-2 transition-all outline-none cursor-pointer select-none font-semibold ${
          sizeStyles[size] || sizeStyles.sm
        } ${
          isOpen
            ? currentVariant.borderActive
            : 'border-[#26272d] hover:border-[#3f414a] hover:bg-[#242428]'
        } ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {icon && <span className="shrink-0">{icon}</span>}
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className={`truncate ${selectedOption ? 'text-white' : 'text-[#6b7367] font-normal'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-sm font-mono font-bold shrink-0 border ${currentVariant.badge}`}>
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          size={chevronSize}
          className={`shrink-0 transition-transform duration-200 ${currentVariant.arrowColor} ${
            isOpen ? 'rotate-180' : 'text-[#6b7367]'
          }`}
        />
      </button>

      {/* Custom Floating Popover Menu */}
      {isOpen && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 z-[100] min-w-[180px] max-w-xs w-max bg-[#0f0f0f] border border-[#26272d] rounded-md shadow-2xl p-1.5 space-y-1 backdrop-blur-xl animate-pop-in ${menuClassName}`}
          style={{ minWidth: '100%' }}
        >
          {/* Optional Search Box */}
          {searchable && (
            <div className="p-1 pb-1.5 border-b border-[#26272d]">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2 text-[#6b7367]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#1b1b1d] border border-[#26272d] rounded-sm pl-7 pr-6 py-1 text-xs text-white placeholder-[#6b7367] focus:outline-none focus:border-[#00ffff] font-normal"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1.5 text-[#6b7367] hover:text-white"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5 custom-dropdown-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-[#6b7367] font-normal">
                Tidak ada pilihan ditemukan
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value)
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-sm text-xs flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
                      isSelected
                        ? currentVariant.activeItem
                        : 'text-[#bbcbb2] hover:bg-[#1b1b1d] hover:text-white'
                    } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <div>
                        <span className="font-semibold block truncate">{opt.label}</span>
                        {opt.subtitle && (
                          <span className="text-[10px] text-[#6b7367] block truncate font-normal">
                            {opt.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-sm font-mono font-bold bg-[#1b1b1d] text-[#bbcbb2] border border-[#26272d]">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <Check size={13} className={currentVariant.checkColor} />}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
