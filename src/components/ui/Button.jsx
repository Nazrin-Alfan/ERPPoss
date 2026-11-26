import React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center font-semibold cursor-pointer select-none active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  {
    variants: {
      variant: {
        primary: 'bg-primary hover:bg-primary-hover text-primary-foreground font-bold border border-transparent shadow-xs',
        brand: 'bg-primary hover:bg-primary-hover text-primary-foreground font-bold border border-transparent shadow-xs',
        ink: 'bg-ink hover:opacity-90 text-ink-foreground font-bold border border-transparent shadow-xs',
        secondary: 'bg-subsurface hover:bg-surface-hover text-foreground border border-border hover:border-border-hover shadow-xs',
        outline: 'bg-surface hover:bg-subsurface text-foreground border border-border-hover hover:border-ring/50',
        ghost: 'text-muted hover:text-foreground hover:bg-subsurface border border-transparent',
        destructive: 'bg-destructive-solid hover:opacity-90 text-white font-bold border border-transparent shadow-xs',
        'destructive-soft': 'bg-destructive-bg hover:bg-destructive/15 text-destructive border border-destructive/30 font-semibold'
      },
      size: {
        xs: 'h-8 px-3 text-xs gap-1.5',
        sm: 'h-9 px-3.5 text-xs gap-1.5',
        md: 'h-11 px-4 text-sm gap-2',
        lg: 'h-12 px-5 text-sm gap-2 font-bold',
        cta: 'h-14 px-6 text-base gap-2.5 font-bold',
        'icon-xs': 'w-8 h-8 p-0',
        'icon-sm': 'w-9 h-9 p-0',
        'icon-md': 'w-11 h-11 p-0',
        'icon-rail': 'w-12 h-12 p-0'
      },
      shape: {
        pill: 'rounded-full',
        rounded: 'rounded-xl'
      }
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
      shape: 'pill'
    }
  }
)

export default function Button({
  children,
  variant = 'secondary',
  size = 'md',
  shape = 'pill',
  icon: Icon = null,
  iconPosition = 'left',
  shortcut = null,
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  title,
  ...props
}) {
  const iconSize = size === 'xs' || size === 'icon-xs' ? 14 : size === 'sm' || size === 'icon-sm' ? 16 : size === 'icon-rail' ? 20 : 18

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      title={title}
      className={cn(buttonVariants({ variant, size, shape }), className)}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
      ) : (
        Icon && iconPosition === 'left' && <Icon size={iconSize} strokeWidth={1.75} className="shrink-0" />
      )}
      {children}
      {shortcut && !loading && (
        <kbd className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-white/20 text-current border border-white/25">
          {shortcut}
        </kbd>
      )}
      {!loading && Icon && iconPosition === 'right' && (
        <Icon size={iconSize} strokeWidth={1.75} className="shrink-0" />
      )}
    </button>
  )
}
