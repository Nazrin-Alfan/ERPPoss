import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import Gudang from '../Gudang'
import CRM from '../CRM'
import Dashboard from '../Dashboard'
import HybridPOSPage from '../pos/HybridPOSPage'
import ExpenseDetailModal from '../../components/dashboard/ExpenseDetailModal'

// Mock dependencies
describe('Page Render Integrity Tests', () => {
  it('checks imports and identifiers without ReferenceError', () => {
    expect(Gudang).toBeDefined()
    expect(CRM).toBeDefined()
    expect(Dashboard).toBeDefined()
    expect(HybridPOSPage).toBeDefined()
    expect(ExpenseDetailModal).toBeDefined()
  })

  it('renders ExpenseDetailModal safely when open and closed', () => {
    const htmlClosed = renderToString(
      <ExpenseDetailModal
        isOpen={false}
        onClose={() => {}}
        division="CARWASH"
        expenseData={{ carwashExpenses: [], totalCarwashExp: 0 }}
      />
    )
    expect(htmlClosed).toBe('')

    const htmlOpen = renderToString(
      <ExpenseDetailModal
        isOpen={true}
        onClose={() => {}}
        division="CARWASH"
        expenseData={{
          carwashExpenses: [
            { id: '1', tanggal: '2026-10-09', kategori: 'Chemical Cuci', keterangan: 'Shampoo Mobil', akun: 'Kasir', nominal: 50000 }
          ],
          totalCarwashExp: 50000
        }}
      />
    )
    expect(htmlOpen).toContain('Rincian Pengeluaran Divisi Carwash')
    expect(htmlOpen).toContain('Shampoo Mobil')
  })
})
