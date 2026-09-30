import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
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
} from '../Table'

describe('Enterprise Semantic Table Suite with Sorting (VRS_2026)', () => {
  it('renders TableContainer with safe scroll boundary and surface style', () => {
    const html = renderToString(
      React.createElement(TableContainer, null, 'Table Content')
    )
    expect(html).toContain('Table Content')
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('overscroll-x-contain')
    expect(html).toContain('bg-surface')
    expect(html).toContain('border-border')
    expect(html).toContain('rounded-xl')
  })

  it('renders Table with dense mode support', () => {
    const normalHtml = renderToString(React.createElement(Table, null, 'Normal'))
    expect(normalHtml).toContain('w-full')
    expect(normalHtml).toContain('text-xs')

    const denseHtml = renderToString(React.createElement(Table, { dense: true }, 'Dense'))
    expect(denseHtml).toContain('text-[11px]')
  })

  it('renders TableHead with proper alignment', () => {
    const leftHtml = renderToString(React.createElement(TableHead, null, 'Produk'))
    expect(leftHtml).toContain('text-left')

    const rightHtml = renderToString(React.createElement(TableHead, { align: 'right' }, 'Harga'))
    expect(rightHtml).toContain('text-right')
  })

  it('renders TableSortHead with active indicator and sort chevron', () => {
    const sortHeadHtml = renderToString(
      React.createElement(
        TableSortHead,
        {
          sortKey: 'harga',
          currentSortKey: 'harga',
          currentDirection: 'asc',
          onSort: vi.fn(),
          align: 'right',
        },
        'Harga'
      )
    )
    expect(sortHeadHtml).toContain('Harga')
    expect(sortHeadHtml).toContain('text-primary')
    expect(sortHeadHtml).toContain('justify-end')
  })

  it('renders TableCell with automatic numeric formatting and primary highlight', () => {
    const cellHtml = renderToString(
      React.createElement(TableCell, { numeric: true, highlight: true }, 'Rp 50.000')
    )
    expect(cellHtml).toContain('font-mono')
    expect(cellHtml).toContain('tabular-nums')
    expect(cellHtml).toContain('text-right')
    expect(cellHtml).toContain('text-primary')
  })

  it('renders TableEmpty state with message and subtitle', () => {
    const emptyHtml = renderToString(
      React.createElement(
        Table,
        null,
        React.createElement(
          TableBody,
          null,
          React.createElement(TableEmpty, {
            colSpan: 4,
            message: 'Tidak ada transaksi',
            subtitle: 'Silakan lakukan order kasir baru.',
          })
        )
      )
    )
    expect(emptyHtml).toContain('Tidak ada transaksi')
    expect(emptyHtml).toContain('Silakan lakukan order kasir baru.')
    expect(emptyHtml.toLowerCase()).toContain('colspan="4"')
  })
})
