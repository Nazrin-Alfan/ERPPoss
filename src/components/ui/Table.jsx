import React, { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

/**
 * Enterprise Semantic Table Suite (VRS_2026 Cyan Master)
 * Standardized data-dense tabular presentation for ERP & POS systems with interactive sorting.
 */

/**
 * Hook Pembantu Sortir Data Otomatis (String, Number, Date)
 */
export function useTableSort(data = [], defaultKey = '', defaultDirection = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDirection, setSortDirection] = useState(defaultDirection) // 'asc' | 'desc' | null

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

      // 1. Sort Number / Financials
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA
      }

      // 2. Sort Date / String representation of number
      const numA = Number(valA)
      const numB = Number(valB)
      if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean') {
        return sortDirection === 'asc' ? numA - numB : numB - numA
      }

      // 3. Sort String
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

/**
 * 1. TableContainer: Wrapper pelindung tabel
 */
export function TableContainer({
  children,
  className = '',
  ...props
}) {
  return (
    <div
      className={`w-full max-w-full min-w-0 overflow-x-auto no-scrollbar overscroll-x-contain rounded-xl border border-border bg-surface ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

/**
 * 2. Table: Elemen table utama
 */
export function Table({
  children,
  className = '',
  dense = false,
  ...props
}) {
  return (
    <table
      className={`w-full text-left text-xs border-collapse ${dense ? 'text-[11px]' : ''} ${className}`}
      {...props}
    >
      {children}
    </table>
  )
}

/**
 * 3. TableHeader: Wadah baris kepala tabel (thead)
 */
export function TableHeader({
  children,
  className = '',
  ...props
}) {
  return (
    <thead
      className={`bg-subsurface/80 border-b border-border text-muted text-[10px] sm:text-xs font-bold uppercase tracking-wider sticky top-0 z-10 backdrop-blur-xs ${className}`}
      {...props}
    >
      {children}
    </thead>
  )
}

/**
 * 4. TableBody: Wadah baris konten data (tbody)
 */
export function TableBody({
  children,
  className = '',
  ...props
}) {
  return (
    <tbody
      className={`divide-y divide-border/60 font-medium ${className}`}
      {...props}
    >
      {children}
    </tbody>
  )
}

/**
 * 5. TableRow: Baris tabel dengan efek hover halus
 */
export function TableRow({
  children,
  className = '',
  selected = false,
  ...props
}) {
  return (
    <tr
      className={`transition-colors ${
        selected
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-subsurface/60'
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  )
}

/**
 * 6. TableHead: Sel kolom header (th) statis
 */
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
      className={`px-3 py-3 sm:px-4 sm:py-3.5 whitespace-nowrap ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </th>
  )
}

/**
 * 7. TableSortHead: Sel kolom header interaktif dengan tombol sorting terintegrasi
 */
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
      className={`px-3 py-3 sm:px-4 sm:py-3.5 whitespace-nowrap select-none ${className}`}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort && onSort(currentKey)}
        className={`group flex items-center gap-1.5 w-full font-bold uppercase tracking-wider transition-colors hover:text-white ${alignClass} ${
          isSorted ? 'text-primary' : 'text-muted'
        }`}
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

/**
 * 8. TableCell: Sel data tabel (td)
 */
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
  const colorClass = highlight ? 'text-primary' : 'text-slate-200'

  return (
    <td
      className={`px-3 py-2.5 sm:px-4 sm:py-3 whitespace-nowrap ${alignClass} ${fontClass} ${colorClass} ${className}`}
      {...props}
    >
      {children}
    </td>
  )
}

/**
 * 9. TableEmpty: Baris saat data kosong (Zero Data State)
 */
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
          <p className="font-bold text-slate-300 text-xs">{message}</p>
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
