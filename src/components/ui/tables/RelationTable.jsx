import React from 'react'
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableEmpty, TableSortHead } from '../Table'

/**
 * RelationTable:
 * Dirancang khusus untuk modul CRM (Pelanggan, Riwayat Kunjungan Plat Kendaraan) & Karyawan (Daftar Staf, Komisi Cuci).
 * Sifat: Penonjolan entitas kunci (Plat Nomor Kendaraan / Nama Pelanggan / Avatar),
 * badge tingkat loyalitas pelanggan (New/Silver/Gold/VIP), serta tombol aksi langsung (WhatsApp / Detail Riwayat).
 */
export function RelationTable({
  columns = [],
  data = [],
  sortState = null,
  onSort = null,
  emptyMessage = 'Belum ada data relasi atau pelanggan',
  emptyIcon = null,
  className = '',
  keyExtractor = (item, idx) => item.id || item.phone || item.plat || idx,
}) {
  return (
    <TableContainer className={`border border-border rounded-xl ${className}`}>
      <Table>
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
                className="hover:bg-subsurface/80 transition-colors border-b border-border/50 text-xs"
              >
                {columns.map((col, colIdx) => (
                  <TableCell
                    key={col.key || colIdx}
                    align={col.align || (col.numeric ? 'right' : 'left')}
                    numeric={col.numeric}
                    highlight={col.highlight}
                    className={`py-3 px-3.5 ${col.className || ''}`}
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
