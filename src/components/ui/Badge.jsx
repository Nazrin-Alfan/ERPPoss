import React from 'react'

export default function Badge({
  children,
  variant = 'neutral', // neutral, success, warning, error, info, outline
  size = 'sm', // sm, md
  className = '',
  dot = false,
  icon: Icon = null
}) {
  const baseStyles = 'inline-flex items-center font-semibold select-none tracking-tight'

  const variants = {
    neutral: 'bg-[#1b1b1d] text-[#bbcbb2] border border-[#26272d]',
    success: 'bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30',
    warning: 'bg-[#ff9821]/15 text-[#ff9821] border border-[#ff9821]/30',
    error: 'bg-[#ff5102]/15 text-[#ff5102] border border-[#ff5102]/30',
    info: 'bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30',
    outline: 'bg-transparent text-[#bbcbb2] border border-[#26272d]'
  }

  const dotColors = {
    neutral: 'bg-[#bbcbb2]',
    success: 'bg-[#00ffff]',
    warning: 'bg-[#ff9821]',
    error: 'bg-[#ff5102]',
    info: 'bg-[#00ffff]',
    outline: 'bg-[#6b7367]'
  }

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 rounded-md gap-1.5',
    md: 'text-xs px-2.5 py-1 rounded-lg gap-1.5'
  }

  return (
    <span className={`${baseStyles} ${variants[variant] || variants.neutral} ${sizes[size] || sizes.sm} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant] || dotColors.neutral}`} />}
      {Icon && <Icon size={12} strokeWidth={2} className="shrink-0" />}
      {children}
    </span>
  )
}
