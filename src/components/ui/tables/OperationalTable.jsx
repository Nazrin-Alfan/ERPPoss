import React from 'react'
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty, TableSortHead } from '../Table'

/**
 * OperationalTable:
 * Dirancang khusus untuk operasional cepat kasir & bay antrean (POS, Kasir Harian, Real-time queue).
 * Sifat: Super padat (dense), visual status pill/dot kontras tinggi, aksi cepat 1-klik di baris.
 */
export function OperationalTable({
  columns = [],
  data = [],
  sortState = null,
  onSort = null,
  emptyMessage = 'Belum ada data operasional hari ini',
  emptyIcon = null,
  maxHeight = 'max-h-[380px]',
  className = '',
  keyExtractor = (item, idx) => item.id || idx,
}) {
  return (
    <TableContainer className={`${maxHeight} overflow-y-auto no-scrollbar ${className}`}>
      <Table dense>
        <TableHeader sticky>
          <TableRow className="bg-subsurface/95 text-muted uppercase text-[10px] font-bold tracking-wider border-b border-border">
            {columns.map((col, idx) => {
              if (col.sortable && onSort) {
                return (
                  <TableSortHead
                    key={col.key || idx}
                    sortKey={col.key}
                    currentSortKey={sortState?.column}
                    currentDirection={sortState?.direction}
                    onSort={() => onSort(col.key)}
                    align={col.align || 'left'}
                    className={col.headerClassName || ''}
                  >
                    {col.label}
                  </TableSortHead>
                )
              }
              return (
                <TableHead key={col.key || idx} align={col.align || 'left'} className={col.headerClassName || ''}>
                  {col.label}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableEmpty colSpan={columns.length} message={emptyMessage} icon={emptyIcon} />
          ) : (
            data.map((row, rowIdx) => (
              <TableRow
                key={keyExtractor(row, rowIdx)}
                className="hover:bg-subsurface/60 transition-colors border-b border-border/60 text-xs"
              >
                {columns.map((col, colIdx) => (
                  <TableCell
                    key={col.key || colIdx}
                    align={col.align || 'left'}
                    numeric={col.numeric}
                    highlight={col.highlight}
                    className={`py-2 px-2.5 ${col.className || ''}`}
                  >
                    {col.render ? col.render(row[col.key], row, rowIdx) : row[col.key] ?? '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
