import React from 'react'
import { Inbox, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import Badge from './Badge'
import Button from './Button'

/**
 * State 1: Loading Skeleton (Shimmer)
 */
export function LoadingState({
  rows = 4,
  label = 'Memuat data...',
  badgeLabel = 'SHIMMER',
  className = ''
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('bg-surface border border-border rounded-2xl p-4 sm:p-5 space-y-3', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="h-3.5 w-32 rounded-full bg-subsurface animate-pulse" />
        <Badge variant="neutral" size="sm">{badgeLabel}</Badge>
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-b-0">
            <div className="h-3.5 w-2/5 rounded-full bg-subsurface animate-pulse" />
            <div className="h-3.5 w-16 rounded-full bg-subsurface animate-pulse" />
            <div className="h-3.5 w-20 rounded-full bg-subsurface animate-pulse" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}

/**
 * State 3: Actionable Empty State
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'Belum ada data tersedia',
  description = 'Data transaksi atau pencatatan akan muncul di sini.',
  badgeLabel = 'ACTIONABLE',
  actionLabel = null,
  onAction = null,
  actionVariant = 'ink',
  className = ''
}) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center',
        className
      )}
    >
      {badgeLabel && (
        <div className="mb-3">
          <Badge variant="neutral" size="sm">{badgeLabel}</Badge>
        </div>
      )}
      <div className="w-12 h-12 rounded-full bg-subsurface border border-border flex items-center justify-center text-muted mb-3">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted max-w-xs leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant={actionVariant} size="md" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

/**
 * State 4: Recoverable Error State with optional Retry CTA
 */
export function ErrorState({
  code = 'SYNC_TIMEOUT • 504',
  title = 'Gagal memuat data',
  description = 'Periksa koneksi gateway outlet atau coba muat ulang beberapa saat lagi.',
  badgeLabel = 'OFFLINE',
  retryLabel = 'Coba Lagi',
  onRetry = null,
  className = ''
}) {
  return (
    <div
      role="alert"
      className={cn(
        'bg-surface border border-destructive/30 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
        <Badge variant="error" size="sm" dot>{code}</Badge>
        {badgeLabel && <Badge variant="error" size="sm">{badgeLabel}</Badge>}
      </div>
      <div className="w-11 h-11 rounded-full bg-destructive-bg border border-destructive/25 flex items-center justify-center text-destructive mb-3">
        <AlertTriangle size={18} strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted max-w-sm leading-relaxed">{description}</p>
      )}
      {onRetry && (
        <Button variant="destructive" size="md" icon={RefreshCw} onClick={onRetry} className="mt-4">
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export default {
  LoadingState,
  EmptyState,
  ErrorState
}
