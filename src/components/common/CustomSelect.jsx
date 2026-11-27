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
 * - listMaxHeightClass?: string
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
  listMaxHeightClass = 'max-h-60',
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

  // Color variants mapping (RelayPOS v5.0 Dual-Mode Cobalt & Semantic Accents)
  const variantStyles = {
    emerald: {
      borderActive: 'border-success ring-2 ring-success/20',
      activeItem: 'bg-success-bg text-success font-bold',
      checkColor: 'text-success',
      badge: 'bg-success-bg text-success border-success/25',
      arrowColor: 'text-success'
    },
    cyan: {
      borderActive: 'border-ring ring-2 ring-ring/20',
      activeItem: 'bg-primary-soft text-primary-soft-foreground font-bold',
      checkColor: 'text-primary',
      badge: 'bg-primary-soft text-primary-soft-foreground border-primary/25',
      arrowColor: 'text-primary'
    },
    blue: {
      borderActive: 'border-ring ring-2 ring-ring/20',
      activeItem: 'bg-primary-soft text-primary-soft-foreground font-bold',
      checkColor: 'text-primary',
      badge: 'bg-primary-soft text-primary-soft-foreground border-primary/25',
      arrowColor: 'text-primary'
    },
    rose: {
      borderActive: 'border-destructive ring-2 ring-destructive/20',
      activeItem: 'bg-destructive-bg text-destructive font-bold',
      checkColor: 'text-destructive',
      badge: 'bg-destructive-bg text-destructive border-destructive/25',
      arrowColor: 'text-destructive'
    },
    amber: {
      borderActive: 'border-warning ring-2 ring-warning/20',
      activeItem: 'bg-warning-bg text-warning font-bold',
      checkColor: 'text-warning',
      badge: 'bg-warning-bg text-warning border-warning/25',
      arrowColor: 'text-warning'
    },
    purple: {
      borderActive: 'border-ring ring-2 ring-ring/20',
      activeItem: 'bg-primary-soft text-primary-soft-foreground font-bold',
      checkColor: 'text-primary',
      badge: 'bg-primary-soft text-primary-soft-foreground border-primary/25',
      arrowColor: 'text-primary'
    },
    slate: {
      borderActive: 'border-border-hover',
      activeItem: 'bg-subsurface text-foreground font-bold',
      checkColor: 'text-foreground',
      badge: 'bg-subsurface text-muted border-border',
      arrowColor: 'text-muted'
    }
  }

  const currentVariant = variantStyles[variant] || variantStyles.blue

  const sizeStyles = {
    xs: 'min-h-[34px] py-1 px-2.5 text-[11px] rounded-lg',
    sm: 'min-h-[38px] py-1.5 px-3 text-xs rounded-xl',
    md: 'min-h-[44px] py-2 px-3.5 text-sm rounded-xl',
    lg: 'min-h-[48px] py-2.5 px-4 text-base rounded-full'
  }

  const iconSizes = {
    xs: 12,
    sm: 14,
    md: 15,
    lg: 16
  }

  const chevronSize = iconSizes[size] || 14

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
          {label}
        </label>
      )}

      {/* Custom Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-subsurface border text-left flex items-center justify-between gap-2 transition-all outline-none cursor-pointer select-none font-semibold ${
          sizeStyles[size] || sizeStyles.sm
        } ${
          isOpen
            ? currentVariant.borderActive
            : 'border-border hover:border-border-hover hover:bg-surface'
        } ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {icon && <span className="shrink-0">{icon}</span>}
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className={`truncate ${selectedOption ? 'text-foreground' : 'text-muted-dark font-normal'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold shrink-0 border ${currentVariant.badge}`}>
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          size={chevronSize}
          className={`shrink-0 transition-transform duration-200 ${currentVariant.arrowColor} ${
            isOpen ? 'rotate-180' : 'text-muted-dark'
          }`}
        />
      </button>

      {/* Custom Floating Popover Menu */}
      {isOpen && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 z-30 min-w-[180px] max-w-xs w-max bg-surface border border-border rounded-xl shadow-2xl p-1.5 space-y-1 backdrop-blur-xl animate-pop-in ${menuClassName}`}
          style={{ minWidth: '100%' }}
        >
          {searchable && (
            <div className="p-1 pb-1.5 border-b border-border">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-muted-dark" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-subsurface border border-border rounded-lg pl-8 pr-7 py-1.5 text-xs text-foreground placeholder:text-muted-dark focus:outline-none focus:border-ring font-normal"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-2 text-muted-dark hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={`${listMaxHeightClass} overflow-y-auto space-y-0.5 pr-0.5 custom-dropdown-scrollbar`}>
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-dark font-normal">
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
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-all cursor-pointer select-none ${
                      isSelected
                        ? currentVariant.activeItem
                        : 'text-muted hover:bg-subsurface hover:text-foreground'
                    } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <div>
                        <span className="font-semibold block truncate">{opt.label}</span>
                        {opt.subtitle && (
                          <span className="text-[10px] text-muted-dark block truncate font-normal">
                            {opt.subtitle}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold bg-subsurface text-muted border border-border">
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
