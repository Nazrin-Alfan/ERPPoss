import React from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Tactile 44x44px touch-ergonomic stepper for POS item quantities.
 */
export default function Stepper({
  value = 0,
  onIncrement,
  onDecrement,
  min = 0,
  max = Infinity,
  disabled = false,
  labelPrefix = 'Kuantitas',
  className = ''
}) {
  const canDecrement = !disabled && value > min
  const canIncrement = !disabled && value < max

  return (
    <div className={cn('inline-flex items-center gap-2 select-none', className)}>
      <button
        type="button"
        onClick={onDecrement}
        disabled={!canDecrement}
        aria-label={`Kurangi ${labelPrefix}`}
        className="w-11 h-11 rounded-full bg-surface hover:bg-subsurface border border-border hover:border-border-hover text-foreground flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
      >
        <Minus size={16} strokeWidth={2} />
      </button>
      <span
        aria-live="polite"
        className="min-w-[2rem] text-center font-mono tabular-nums font-bold text-sm text-foreground"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={!canIncrement}
        aria-label={`Tambah ${labelPrefix}`}
        className="w-11 h-11 rounded-full bg-ink hover:opacity-90 text-ink-foreground flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-xs"
      >
        <Plus size={16} strokeWidth={2} />
      </button>
    </div>
  )
}
