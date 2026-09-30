import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  OperationalTable,
  LedgerTable,
  InventoryTable,
  RelationTable,
} from '../tables'

describe('Enterprise Table Archetypes', () => {
  describe('OperationalTable', () => {
    const columns = [
      { key: 'item', label: 'Item' },
      { key: 'qty', label: 'Qty', numeric: true },
      { key: 'status', label: 'Status' },
    ]

    const data = [
      { id: 1, item: 'Kopi Susu', qty: 2, status: 'Antre' },
      { id: 2, item: 'Cuci Salju', qty: 1, status: 'Bay 1' },
    ]

    it('renders dense operational table with data', () => {
      const html = renderToString(React.createElement(OperationalTable, { columns, data }))
      expect(html).toContain('Kopi Susu')
      expect(html).toContain('Cuci Salju')
      expect(html).toContain('Antre')
      expect(html).toContain('Bay 1')
    })

    it('renders empty message when data is empty', () => {
      const html = renderToString(React.createElement(OperationalTable, { columns, data: [], emptyMessage: 'Data Operasional Kosong' }))
      expect(html).toContain('Data Operasional Kosong')
    })

    it('renders sortable header with chevron indicator', () => {
      const sortableCols = [
        { key: 'item', label: 'Item', sortable: true },
        { key: 'qty', label: 'Qty', numeric: true },
      ]
      const html = renderToString(
        React.createElement(OperationalTable, {
          columns: sortableCols,
          data,
          sortState: { column: 'item', direction: 'asc' },
          onSort: vi.fn(),
        })
      )
      expect(html).toContain('Item')
      expect(html).toContain('lucide-chevron-up')
    })
  })

  describe('LedgerTable', () => {
    const columns = [
      { key: 'keterangan', label: 'Keterangan' },
      { key: 'debit', label: 'Debit', numeric: true },
      { key: 'kredit', label: 'Kredit', numeric: true },
    ]

    const data = [
      { id: 1, keterangan: 'Penjualan Cafe', debit: '150.000', kredit: '0' },
      { id: 2, keterangan: 'Beli Sabun Cuci', debit: '0', kredit: '50.000' },
    ]

    it('renders ledger table with footer totals', () => {
      const footerTotals = {
        debit: '150.000',
        kredit: '50.000',
      }
      const html = renderToString(React.createElement(LedgerTable, { columns, data, footerTotals }))
      expect(html).toContain('Penjualan Cafe')
      expect(html).toContain('Beli Sabun Cuci')
      expect(html).toContain('TOTAL')
      expect(html).toContain('150.000')
      expect(html).toContain('50.000')
      expect(html).toContain('<tfoot')
    })
  })

  describe('InventoryTable', () => {
    const columns = [
      { key: 'kode', label: 'SKU' },
      { key: 'nama', label: 'Nama Barang' },
      { key: 'stok', label: 'Stok', numeric: true },
    ]

    const data = [
      { id: 1, kode: 'SHM-01', nama: 'Shampoo Touchless', stok: 12 },
    ]

    it('renders inventory catalog table correctly', () => {
      const html = renderToString(React.createElement(InventoryTable, { columns, data }))
      expect(html).toContain('SHM-01')
      expect(html).toContain('Shampoo Touchless')
      expect(html).toContain('12')
    })
  })

  describe('RelationTable', () => {
    const columns = [
      { key: 'plat', label: 'Plat Nomor' },
      { key: 'nama', label: 'Nama Pemilik' },
      { key: 'tier', label: 'Loyalty' },
    ]

    const data = [
      { id: 1, plat: 'B 1234 XYZ', nama: 'Budi Santoso', tier: 'Gold' },
    ]

    it('renders CRM relation table correctly', () => {
      const html = renderToString(React.createElement(RelationTable, { columns, data }))
      expect(html).toContain('B 1234 XYZ')
      expect(html).toContain('Budi Santoso')
      expect(html).toContain('Gold')
    })
  })
})
