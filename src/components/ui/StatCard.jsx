import React from 'react'
import { cn } from '../../lib/cn'
import Badge from './Badge'

/**
 * Executive Bento KPI StatCard (Fintech Cobalt + Pure Carbon D1).
 */
export default function StatCard({
  label,
  value,
  subtitle = null,
  delta = null,
  deltaTone = 'primary', // 'primary' | 'success' | 'warning' | 'error' | 'neutral'
  variant = 'surface', // 'surface' | 'hero'
  icon: Icon = null,
  footer = null,
  className = ''
}) {
  const isHero = variant === 'hero'

  return (
    <div
      className={cn(
        'rounded-2xl p-4 sm:p-5 border transition-colors shadow-xs',
        isHero
          ? 'bg-ink text-ink-foreground border-transparent dark:bg-surface dark:text-foreground dark:border-ring/60'
          : 'bg-surface text-foreground border-border hover:border-border-hover',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              'text-[11px] font-bold uppercase tracking-wider truncate',
              isHero ? 'opacity-75 dark:text-muted' : 'text-muted'
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              'mt-1.5 text-xl sm:text-2xl font-extrabold font-mono tabular-nums tracking-tight truncate',
              isHero ? 'text-current' : 'text-foreground'
            )}
          >
            {value}
          </p>
        </div>

        {Icon && (
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border',
              isHero
                ? 'bg-white/10 border-white/15 text-current dark:bg-primary-soft dark:border-primary/30 dark:text-primary-soft-foreground'
                : 'bg-primary-soft border-primary/20 text-primary-soft-foreground'
            )}
          >
            <Icon size={18} strokeWidth={1.75} />
          </div>
        )}
      </div>

      {(delta || subtitle) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {delta && (
            <Badge variant={deltaTone === 'primary' && isHero ? 'primary' : deltaTone} size="sm" dot>
              {delta}
            </Badge>
          )}
          {subtitle && (
            <span className={cn('text-xs truncate', isHero ? 'opacity-75 dark:text-muted' : 'text-muted')}>
              {subtitle}
            </span>
          )}
        </div>
      )}

      {footer && (
        <div className={cn('mt-3 pt-3 border-t text-xs', isHero ? 'border-white/15 dark:border-border' : 'border-border')}>
          {footer}
        </div>
      )}
    </div>
  )
}
