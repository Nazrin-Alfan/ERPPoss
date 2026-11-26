import React, { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Enterprise Semantic Table Suite (RelayPOS v5.0 Dual-Mode)
 * Standardized data-dense tabular presentation for ERP & POS systems with interactive sorting.
 */
export function useTableSort(data = [], defaultKey = '', defaultDirection = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDirection, setSortDirection] = useState(defaultDirection)

  const handleSort = (key) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc')
      else if (sortDirection === 'desc') {
        setSortKey('')
        setSortDirection('asc')
      }
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection || !data || data.length === 0) return data

    return [...data].sort((a, b) => {
      let valA = a[sortKey]
      let valB = b[sortKey]

      if (valA === undefined || valA === null) valA = ''
      if (valB === undefined || valB === null) valB = ''

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA
      }

      const numA = Number(valA)
      const numB = Number(valB)
      if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean') {
        return sortDirection === 'asc' ? numA - numB : numB - numA
      }

      const strA = String(valA).toLowerCase()
      const strB = String(valB).toLowerCase()
      if (strA < strB) return sortDirection === 'asc' ? -1 : 1
      if (strA > strB) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [data, sortKey, sortDirection])

  return {
    sortedData,
    sortKey,
    sortDirection,
    handleSort,
    setSortKey,
    setSortDirection,
  }
}

export function TableContainer({
  children,
  className = '',
  ...props
}) {
  return (
    <div
      className={cn(
        'w-full max-w-full min-w-0 overflow-x-auto no-scrollbar overscroll-x-contain rounded-xl border border-border bg-surface text-foreground',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function Table({
  children,
  className = '',
  dense = false,
  striped = false,
  ...props
}) {
  return (
    <table
      className={cn(
        'w-full text-left text-xs border-collapse text-foreground',
        dense && 'text-[11px]',
        striped && '[&_tbody>tr:nth-child(even)]:bg-subsurface/40',
        className
      )}
      {...props}
    >
      {children}
    </table>
  )
}

export function TableHeader({
  children,
  className = '',
  sticky = true,
  ...props
}) {
  return (
    <thead
      className={cn(
        'bg-subsurface/90 border-b border-border text-muted text-[10px] sm:text-xs font-bold uppercase tracking-wider backdrop-blur-xs',
        sticky && 'sticky top-0 z-10',
        className
      )}
      {...props}
    >
      {children}
    </thead>
  )
}

export function TableBody({
  children,
  className = '',
  striped = false,
  ...props
}) {
  return (
    <tbody
      className={cn(
        'divide-y divide-border/70 font-medium',
        striped && '[&>tr:nth-child(even)]:bg-subsurface/40',
        className
      )}
      {...props}
    >
      {children}
    </tbody>
  )
}

export function TableRow({
  children,
  className = '',
  selected = false,
  ...props
}) {
  return (
    <tr
      className={cn(
        'transition-colors',
        selected ? 'bg-selected-surface border-l-2 border-l-primary' : 'hover:bg-subsurface/60',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TableHead({
  children,
  className = '',
  align = 'left',
  ...props
}) {
  const alignClass =
    align === 'right'
      ? 'text-right'
      : align === 'center'
        ? 'text-center'
        : 'text-left'

  return (
    <th
      className={cn('px-3 py-3 sm:px-4 sm:py-3.5 whitespace-nowrap', alignClass, className)}
      {...props}
    >
      {children}
    </th>
  )
}

export function TableSortHead({
  children,
  sortKey: currentKey,
  currentSortKey,
  currentDirection,
  onSort,
  align = 'left',
  className = '',
  ...props
}) {
  const isSorted = currentSortKey === currentKey
  const isAsc = isSorted && currentDirection === 'asc'
  const isDesc = isSorted && currentDirection === 'desc'

  const alignClass =
    align === 'right'
      ? 'justify-end text-right'
      : align === 'center'
        ? 'justify-center text-center'
        : 'justify-start text-left'

  return (
    <th
      className={cn('px-3 py-3 sm:px-4 sm:py-3.5 whitespace-nowrap select-none', className)}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort && onSort(currentKey)}
        className={cn(
          'group flex items-center gap-1.5 w-full font-bold uppercase tracking-wider transition-colors hover:text-foreground cursor-pointer',
          alignClass,
          isSorted ? 'text-primary' : 'text-muted'
        )}
      >
        <span>{children}</span>
        <span className="shrink-0 transition-transform">
          {isAsc ? (
            <ChevronUp size={13} className="text-primary" />
          ) : isDesc ? (
            <ChevronDown size={13} className="text-primary" />
          ) : (
            <ChevronsUpDown size={13} className="text-muted-dark group-hover:text-muted" />
          )}
        </span>
      </button>
    </th>
  )
}

export function TableCell({
  children,
  className = '',
  align = 'left',
  numeric = false,
  highlight = false,
  ...props
}) {
  const alignClass =
    align === 'right' || numeric
      ? 'text-right'
      : align === 'center'
        ? 'text-center'
        : 'text-left'

  const fontClass = numeric ? 'font-mono tabular-nums font-bold' : ''
  const colorClass = highlight ? 'text-primary' : 'text-foreground'

  return (
    <td
      className={cn('px-3 py-2.5 sm:px-4 sm:py-3 whitespace-nowrap', alignClass, fontClass, colorClass, className)}
      {...props}
    >
      {children}
    </td>
  )
}

export function TableEmpty({
  colSpan = 5,
  message = 'Belum ada data tersedia',
  subtitle = 'Data transaksi atau pencatatan akan muncul di sini.',
  icon: IconComponent = null,
}) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="py-10 text-center text-muted"
      >
        <div className="flex flex-col items-center justify-center space-y-1.5">
          {IconComponent && <IconComponent size={24} className="text-muted-dark mb-1" />}
          <p className="font-bold text-foreground text-xs">{message}</p>
          {subtitle && <p className="text-[11px] text-muted-dark">{subtitle}</p>}
        </div>
      </TableCell>
    </TableRow>
  )
}

export default {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableSortHead,
  TableCell,
  TableEmpty,
  useTableSort,
}
