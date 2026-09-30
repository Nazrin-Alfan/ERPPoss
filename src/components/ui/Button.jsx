import React from 'react'

export default function Button({
  children,
  variant = 'secondary', // primary, secondary, ghost, outline, destructive, brand
  size = 'md', // xs, sm, md, lg, icon-xs, icon-sm, icon-md
  icon: Icon = null,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  title,
  ...props
}) {
  const baseStyles = 'inline-flex items-center justify-center font-semibold cursor-pointer select-none active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none'

  const variants = {
    primary: 'bg-[#00ffff] hover:bg-[#00e6e6] text-[#0f0f0f] font-bold border border-transparent shadow-xs',
    secondary: 'bg-[#18181c] hover:bg-[#202025] text-white border border-[#26272d] hover:border-[#3f414a] shadow-xs',
    ghost: 'text-[#bbcbb2] hover:text-white hover:bg-[#18181c] border border-transparent',
    outline: 'bg-transparent border border-[#26272d] hover:border-[#3f414a] text-[#bbcbb2] hover:text-white hover:bg-[#18181c]',
    destructive: 'bg-[#ff5102]/15 hover:bg-[#ff5102]/25 text-[#ff5102] border border-[#ff5102]/30',
    brand: 'bg-[#00ffff] hover:bg-[#00e6e6] text-[#0f0f0f] font-bold border border-transparent shadow-xs'
  }

  const sizes = {
    xs: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-md',
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
    md: 'h-9 px-3.5 text-xs gap-2 rounded-lg',
    lg: 'h-10 px-4 text-sm gap-2.5 rounded-xl font-bold',
    'icon-xs': 'w-7 h-7 p-0 rounded-md',
    'icon-sm': 'w-8 h-8 p-0 rounded-lg',
    'icon-md': 'w-9 h-9 p-0 rounded-lg'
  }

  const variantClass = variants[variant] || variants.secondary
  const sizeClass = sizes[size] || sizes.md

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      className={`${baseStyles} ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        Icon && iconPosition === 'left' && <Icon size={size === 'xs' || size === 'icon-xs' ? 13 : 15} strokeWidth={1.75} className="shrink-0" />
      )}
      {children}
      {!loading && Icon && iconPosition === 'right' && (
        <Icon size={size === 'xs' || size === 'icon-xs' ? 13 : 15} strokeWidth={1.75} className="shrink-0" />
      )}
    </button>
  )
}
