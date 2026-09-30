import React from 'react'
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty, TableSortHead } from '../Table'

/**
 * LedgerTable:
 * Dirancang khusus untuk modul Akuntansi & Keuangan (Jurnal Umum, Buku Besar, Neraca Saldo, Laba Rugi).
 * Sifat: Font mono rata kanan super ketat untuk nominal, zebra striping halus untuk audit,
 * baris penutup akuntansi wajib (<tfoot>) untuk membuktikan keseimbangan debit vs kredit.
 */
export function LedgerTable({
  columns = [],
  data = [],
  sortState = null,
  onSort = null,
  footerTotals = null, // e.g. { debit: 1500000, kredit: 1500000, balance: true }
  emptyMessage = 'Belum ada catatan jurnal pada periode ini',
  emptyIcon = null,
  className = '',
  keyExtractor = (item, idx) => item.id || idx,
}) {
  return (
    <TableContainer className={`border border-border rounded-xl ${className}`}>
      <Table striped>
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
                    align={col.align || (col.numeric ? 'right' : 'left')}
                    className={col.headerClassName || ''}
                  >
                    {col.label}
                  </TableSortHead>
                )
              }
              return (
                <TableHead
                  key={col.key || idx}
                  align={col.align || (col.numeric ? 'right' : 'left')}
                  className={col.headerClassName || ''}
                >
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
                className="hover:bg-primary/5 transition-colors border-b border-border/50 text-xs"
              >
                {columns.map((col, colIdx) => (
                  <TableCell
                    key={col.key || colIdx}
                    align={col.align || (col.numeric ? 'right' : 'left')}
                    numeric={col.numeric}
                    highlight={col.highlight}
                    className={`py-2.5 px-3 ${col.className || ''}`}
                  >
                    {col.render ? col.render(row[col.key], row, rowIdx) : row[col.key] ?? '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {footerTotals && (
          <tfoot className="bg-subsurface font-bold border-t-2 border-border text-xs">
            <tr>
              {columns.map((col, idx) => {
                const footerVal = footerTotals[col.key]
                return (
                  <td
                    key={idx}
                    className={`py-3 px-3 ${
                      col.numeric || col.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left'
                    } ${footerVal !== undefined ? 'text-foreground' : 'text-muted'}`}
                  >
                    {footerVal !== undefined ? footerVal : idx === 0 ? 'TOTAL' : ''}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        )}
      </Table>
    </TableContainer>
  )
}
