import React from 'react'
import { cn } from '../../lib/cn'

/**
 * Semantic Container Suite (RelayPOS v5.0 Dual-Mode)
 * Preserves existing utility classes while adapting cleanly across Light & Pure Carbon D1.
 */
export function Canvas({
  children,
  className = '',
  as: Component = 'div',
  ...props
}) {
  return (
    <Component
      className={cn('min-h-screen w-full max-w-full min-w-0 bg-canvas text-foreground overflow-x-hidden', className)}
      {...props}
    >
      {children}
    </Component>
  )
}

export function SurfaceCard({
  children,
  className = '',
  hover = false,
  selected = false,
  as: Component = 'div',
  ...props
}) {
  return (
    <Component
      className={cn(
        'bg-surface border border-border rounded-xl p-3 sm:p-4 text-foreground transition-colors',
        hover && 'hover:border-border-hover',
        selected && 'bg-selected-surface border-ring ring-1 ring-ring/30',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

export function SubsurfaceCard({
  children,
  className = '',
  interactive = false,
  selected = false,
  as: Component = 'div',
  ...props
}) {
  return (
    <Component
      className={cn(
        'bg-subsurface border border-border rounded-xl p-2.5 sm:p-3 text-foreground transition-all',
        interactive && 'hover:border-border-hover active:scale-[0.98] cursor-pointer',
        selected && 'bg-selected-surface border-ring ring-1 ring-ring/30',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

export function HeaderPanel({
  children,
  className = '',
  ...props
}) {
  return (
    <header
      className={cn(
        'bg-surface border border-border p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 relative z-20 w-full max-w-full overflow-hidden text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </header>
  )
}

export function GridContainer({
  children,
  className = '',
  ...props
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 w-full max-w-full min-w-0 content-start',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export default {
  Canvas,
  SurfaceCard,
  SubsurfaceCard,
  HeaderPanel,
  GridContainer,
}
