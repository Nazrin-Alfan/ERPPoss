import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import Finance from '../Finance.jsx'
import OwnerWithdrawalModal from '../../components/finance/OwnerWithdrawalModal.jsx'
import {
  formatCurrencyInput,
  parseCurrencyInput,
  validateExpenseWithPosBalance,
  validateIncomeForm,
  validateTransferForm
} from '../../utils/financeHelpers'

// Mock Supabase Client
vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { total_income: 1000000, total_expense: 500000, total_balance: 500000 } })),
        order: vi.fn(() => ({
          range: vi.fn(() => Promise.resolve({
            data: [
              {
                id_cashflow: 'cf-1',
                tanggal: '2026-09-28',
                jenis: 'Pengeluaran Bersama',
                kategori: 'Listrik, Air & Utilitas',
                keterangan_transaksi: 'Listrik Toko',
                pos: 'SALDO CASH',
                pemasukan: 0,
                pengeluaran: 150000,
                created_at: '2026-09-28T10:00:00Z'
              }
            ]
          }))
        })),
        range: vi.fn(() => Promise.resolve({ data: [] }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    }))
  }
}))

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    activeTenant: {
      id: 'tenant-123',
      name: 'RelayPOS Outlet Pusat',
      business_type: 'CARWASH_CAFE'
    },
    profile: {
      id: 'user-1',
      nama: 'Budi Santoso',
      role: 'Owner'
    },
    user: { id: 'user-1' }
  })
}))

describe('Finance Modals & Real-time Balance Safeguards', () => {
  it('TC_FM_01: Renders Finance page with quick action buttons including Tarik Prive Owner', () => {
    const html = renderToString(React.createElement(Finance))
    expect(html).toContain('+ Pemasukan')
    expect(html).toContain('+ Pengeluaran')
    expect(html).toContain('⇄ Pindah Saldo')
    expect(html).toContain('Tarik Prive Owner')
  })

  it('TC_FM_02: OwnerWithdrawalModal renders with live saldo and prive guidance when open', () => {
    const balances = [
      { pos: 'SALDO CASH', type: 'CASH', currentBalance: 2500000 },
      { pos: 'SALDO REKENING Y', type: 'BANK', currentBalance: 15000000 }
    ]
    const html = renderToString(
      React.createElement(OwnerWithdrawalModal, {
        isOpen: true,
        onClose: () => {},
        currentBalances: balances
      })
    )
    expect(html).toContain('Tarik Saldo / Prive Pemilik')
    expect(html).toContain('Penarikan Pribadi Owner Tanpa Merusak Laba Bersih')
    expect(html).toContain('Kas Laci Kasir')
    expect(html).toContain('Rekening Bank')
  })

  it('TC_FM_03: Currency formatting and parsing maintains Indonesian thousand separators', () => {
    expect(formatCurrencyInput(1500000)).toBe('1.500.000')
    expect(formatCurrencyInput('2500000')).toBe('2.500.000')
    expect(parseCurrencyInput('1.500.000')).toBe(1500000)
    expect(parseCurrencyInput('Rp 2.500.000')).toBe(2500000)
  })

  it('TC_FM_04: validateExpenseWithPosBalance flags overdraft against pos balance', () => {
    const posBalances = {
      'SALDO CASH': 200000,
      'SALDO REKENING OPERASIONAL': 1000000
    }
    const overdraftResult = validateExpenseWithPosBalance(
      { pos: 'SALDO CASH', kategori: 'Listrik', total_harga: 500000 },
      posBalances,
      false,
      []
    )
    expect(overdraftResult.isValid).toBe(false)
    expect(overdraftResult.isOverdraft).toBe(true)
    expect(overdraftResult.error).toContain('Saldo pada pos SALDO CASH tidak mencukupi')

    const validResult = validateExpenseWithPosBalance(
      { pos: 'SALDO CASH', kategori: 'Listrik', total_harga: 100000 },
      posBalances,
      false,
      []
    )
    expect(validResult.isValid).toBe(true)
    expect(validResult.isOverdraft).toBe(false)
  })

  it('TC_FM_05: validateIncomeForm verifies required fields and positive amount', () => {
    const invalid = validateIncomeForm({ nominal: 0, pos: '', kategori: '', keterangan: '' })
    expect(invalid.isValid).toBe(false)

    const valid = validateIncomeForm({ nominal: 500000, pos: 'SALDO CASH', kategori: 'Pendapatan Lain-lain', keterangan: 'Bonus Penjualan' })
    expect(valid.isValid).toBe(true)
  })

  it('TC_FM_06: validateTransferForm verifies distinct pos accounts and balance sufficiency', () => {
    const posBalances = {
      'SALDO CASH': 500000,
      'SALDO REKENING Y': 2000000
    }
    // Same source and destination
    const samePos = validateTransferForm(
      { pos_asal: 'SALDO CASH', pos_tujuan: 'SALDO CASH', nominal: 100000 },
      posBalances
    )
    expect(samePos.isValid).toBe(false)
    expect(samePos.error).toContain('tidak boleh sama')

    // Overdraft
    const overdraft = validateTransferForm(
      { pos_asal: 'SALDO CASH', pos_tujuan: 'SALDO REKENING Y', nominal: 1000000 },
      posBalances
    )
    expect(overdraft.isValid).toBe(false)
    expect(overdraft.error).toContain('tidak mencukupi')

    // Valid transfer
    const valid = validateTransferForm(
      { pos_asal: 'SALDO CASH', pos_tujuan: 'SALDO REKENING Y', nominal: 250000 },
      posBalances
    )
    expect(valid.isValid).toBe(true)
  })
})
