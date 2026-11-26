import React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../../lib/cn'

export const badgeVariants = cva(
  'inline-flex items-center font-semibold select-none tracking-tight rounded-full border',
  {
    variants: {
      variant: {
        neutral: 'bg-subsurface text-muted border-border',
        primary: 'bg-primary text-primary-foreground border-transparent font-bold',
        'primary-soft': 'bg-primary-soft text-primary-soft-foreground border-primary/25',
        ink: 'bg-ink text-ink-foreground border-transparent font-bold',
        success: 'bg-success-bg text-success border-success/25',
        warning: 'bg-warning-bg text-warning border-warning/25',
        error: 'bg-destructive-bg text-destructive border-destructive/25',
        info: 'bg-primary-soft text-primary-soft-foreground border-primary/25',
        outline: 'bg-transparent text-muted border-border'
      },
      size: {
        sm: 'text-[11px] px-2.5 py-0.5 gap-1.5',
        md: 'text-xs px-3 py-1 gap-1.5'
      }
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'sm'
    }
  }
)

const DOT_COLORS = {
  neutral: 'bg-muted-dark',
  primary: 'bg-primary-foreground',
  'primary-soft': 'bg-primary',
  ink: 'bg-ink-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  info: 'bg-primary',
  outline: 'bg-muted-dark'
}

export default function Badge({
  children,
  variant = 'neutral',
  size = 'sm',
  className = '',
  dot = false,
  icon: Icon = null
}) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', DOT_COLORS[variant] || DOT_COLORS.neutral)} />}
      {Icon && <Icon size={12} strokeWidth={2} className="shrink-0" />}
      {children}
    </span>
  )
}
