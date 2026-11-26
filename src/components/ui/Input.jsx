import React, { useId } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Input({
  className = '',
  type = 'text',
  shape = 'pill', // 'pill' | 'rounded'
  error = false,
  ...props
}) {
  return (
    <input
      type={type}
      className={cn(
        'w-full min-h-[44px] bg-subsurface border border-border px-4 py-2 text-base font-medium text-foreground placeholder:text-muted-dark transition-all focus:outline-none focus:bg-surface focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-50 disabled:cursor-not-allowed',
        shape === 'pill' ? 'rounded-full' : 'rounded-xl',
        error && 'border-destructive focus:border-destructive focus:ring-destructive/20',
        className
      )}
      {...props}
    />
  )
}

export function SearchInput({
  value = '',
  onChange,
  onClear = null,
  placeholder = 'Cari...',
  shortcut = null,
  className = '',
  inputClassName = '',
  ...props
}) {
  return (
    <div className={cn('relative flex items-center w-full', className)}>
      <Search size={16} strokeWidth={1.75} className="absolute left-3.5 text-muted-dark pointer-events-none shrink-0" />
      <Input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn('pl-10 pr-12', inputClassName)}
        {...props}
      />
      {value && onClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Hapus pencarian"
          className="absolute right-2.5 p-1.5 rounded-full text-muted hover:text-foreground hover:bg-surface cursor-pointer"
        >
          <X size={14} strokeWidth={2} />
        </button>
      ) : shortcut ? (
        <kbd className="absolute right-3 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-surface text-muted border border-border pointer-events-none">
          {shortcut}
        </kbd>
      ) : null}
    </div>
  )
}

export function CurrencyInput({
  value = '',
  onChange,
  prefix = 'Rp',
  className = '',
  inputClassName = '',
  ...props
}) {
  return (
    <div className={cn('relative flex items-center w-full', className)}>
      <span className="absolute left-4 text-sm font-bold text-muted pointer-events-none select-none">
        {prefix}
      </span>
      <Input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={onChange}
        className={cn('pl-12 pr-4 text-right font-mono tabular-nums font-bold', inputClassName)}
        {...props}
      />
    </div>
  )
}

export function FieldGroup({
  id: providedId,
  label,
  hint = null,
  error = null,
  required = false,
  className = '',
  children
}) {
  const autoId = useId()
  const fieldId = providedId || autoId
  const childWithId = React.isValidElement(children)
    ? React.cloneElement(children, { id: children.props.id || fieldId })
    : children

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={fieldId} className="block text-xs font-bold text-muted tracking-wide">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      {childWithId}
      {error ? (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-muted-dark">{hint}</p>
      ) : null}
    </div>
  )
}

export default Input
