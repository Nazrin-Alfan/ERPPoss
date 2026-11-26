import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createDefaultAuthState, createMockSupabaseClient, renderWithRouter } from '../../testUtils/renderPageHelper'

const mockState = vi.hoisted(() => ({
  auth: null
}))

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createPortal: (node) => node
  }
})

vi.mock('../../supabaseClient', () => {
  const client = createMockSupabaseClient()
  return {
    supabase: client,
    default: client,
    isCloudBackend: false
  }
})

vi.mock('../../context/AuthContext', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => mockState.auth
}))

vi.mock('../../context/ThemeContext', () => ({
  ThemeProvider: ({ children }) => <>{children}</>,
  useTheme: () => ({ theme: 'dark', toggleTheme: () => {}, setTheme: () => {} }),
  useAppTheme: () => ({
    activeThemeId: 1,
    currentTheme: {
      id: 1,
      name: 'RelayPOS Obsidian & Deep Blue',
      logo: '/relaypos-logo.svg',
      subText: 'Estafet Service & POS',
      colors: { primary: '#2563eb', secondary: '#1e40af', bg: '#06090e', bgLight: '#0d131f', textAccent: '#60a5fa' }
    },
    setThemeById: () => {}
  })
}))

import Login from '../Login'
import ForgotPassword from '../ForgotPassword'
import ResetPassword from '../ResetPassword'
import LandingPage from '../LandingPage'
import UserManualPage from '../UserManualPage'
import Dashboard from '../Dashboard'
import HybridPOSPage from '../pos/HybridPOSPage'
import CarwashQueue from '../CarwashQueue'
import Finance from '../Finance'
import Gudang from '../Gudang'
import Reports from '../Reports'
import Karyawan from '../Karyawan'
import CRM from '../CRM'
import Admin from '../Admin'
import Konsolidasi from '../Konsolidasi'
import Founder from '../Founder'
import SuperAdmin from '../SuperAdmin'
import Database from '../Database'

import ExpenseDetailModal from '../../components/dashboard/ExpenseDetailModal'
import OwnerWithdrawalModal from '../../components/finance/OwnerWithdrawalModal'
import VoidReasonModal from '../../components/pos/VoidReasonModal'
import ShiftClosingModal from '../../components/pos/ShiftClosingModal'
import ThermalReceiptModal from '../../components/pos/ThermalReceiptModal'

describe('Phase 1.5: All 18 Production Pages & Critical Modals SSR Render Integrity', () => {
  beforeEach(() => {
    mockState.auth = createDefaultAuthState()
  })

  const pageCases = [
    { name: 'Login (/login)', route: '/login', Component: Login, role: 'guest', markers: ['Masuk'] },
    { name: 'ForgotPassword (/forgot-password)', route: '/forgot-password', Component: ForgotPassword, role: 'guest', markers: ['Lupa Kata Sandi'] },
    { name: 'ResetPassword (/reset-password)', route: '/reset-password', Component: ResetPassword, role: 'guest', markers: ['Kata Sandi Baru', '/login'] },
    { name: 'LandingPage (/welcome)', route: '/welcome', Component: LandingPage, role: 'guest', markers: ['RelayPOS', '/login'] },
    { name: 'UserManualPage (/panduan)', route: '/panduan', Component: UserManualPage, role: 'guest', markers: ['Panduan Penggunaan'] },
    { name: 'Dashboard (/dashboard)', route: '/dashboard', Component: Dashboard, role: 'Owner', markers: ['Ikhtisar Performa Bisnis'] },
    { name: 'HybridPOSPage (/pos)', route: '/pos', Component: HybridPOSPage, role: 'Owner', markers: ['Kasir'] },
    { name: 'CarwashQueue (/queue)', route: '/queue', Component: CarwashQueue, role: 'Owner', markers: ['Antrean'] },
    { name: 'Finance (/finance)', route: '/finance', Component: Finance, role: 'Owner', markers: ['Monitoring Keuangan', 'tabular-nums'] },
    { name: 'Gudang (/gudang)', route: '/gudang', Component: Gudang, role: 'Owner', markers: ['Gudang'] },
    { name: 'Reports (/reports)', route: '/reports', Component: Reports, role: 'Owner', markers: ['print-area', 'Laporan'] },
    { name: 'Karyawan (/karyawan)', route: '/karyawan', Component: Karyawan, role: 'Owner', markers: ['Karyawan'] },
    { name: 'CRM (/crm)', route: '/crm', Component: CRM, role: 'Owner', markers: ['CRM'] },
    { name: 'Admin (/admin)', route: '/admin', Component: Admin, role: 'Owner', markers: ['Admin'] },
    { name: 'Konsolidasi (/konsolidasi)', route: '/konsolidasi', Component: Konsolidasi, role: 'Owner', markers: ['Ringkasan Finansial Multi-Cabang'] },
    { name: 'Founder (/founder)', route: '/founder', Component: Founder, role: 'Super Admin', markers: ['Founder'] },
    { name: 'SuperAdmin (/super-admin)', route: '/super-admin', Component: SuperAdmin, role: 'Super Admin', markers: ['RelayPOS Founder Console'] },
    { name: 'Database (/database)', route: '/database', Component: Database, role: 'Super Admin', markers: ['Database'] }
  ]

  it.each(pageCases)('renders $name cleanly without ReferenceError or empty shell', ({ route, Component, role, markers }) => {
    if (role === 'guest') {
      mockState.auth = createDefaultAuthState({ user: null, profile: null, activeTenant: null })
    } else if (role === 'Super Admin') {
      mockState.auth = createDefaultAuthState({
        isSuperAdmin: true,
        profile: {
          ...createDefaultAuthState().profile,
          role: 'Super Admin',
          is_super_admin: true
        }
      })
    } else {
      mockState.auth = createDefaultAuthState()
    }

    const html = renderWithRouter(<Component />, route)
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(100)
    for (const marker of markers) {
      expect(html).toContain(marker)
    }
  })

  it('enforces financial tabular-nums & Reports #print-area invariants across rendered HTML', () => {
    const reportsHtml = renderWithRouter(<Reports />, '/reports')
    expect(reportsHtml).toContain('id="print-area"')
    expect(reportsHtml).toMatch(/font-mono|tabular-nums/)

    const financeHtml = renderWithRouter(<Finance />, '/finance')
    expect(financeHtml).toMatch(/font-mono|tabular-nums/)
  })

  it('renders 5 critical POS/Finance/Dashboard modals cleanly in open state', () => {
    const expenseHtml = renderToString(
      <ExpenseDetailModal
        isOpen={true}
        onClose={() => {}}
        division="CARWASH"
        expenseData={{
          carwashExpenses: [{ id: '1', tanggal: '2026-10-09', kategori: 'Chemical', keterangan: 'Shampoo', akun: 'Kasir', nominal: 50000 }],
          totalCarwashExp: 50000
        }}
      />
    )
    expect(expenseHtml).toContain('Shampoo')

    const withdrawalHtml = renderToString(
      <OwnerWithdrawalModal
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        currentBalances={[{ pos: 'SALDO CASH', type: 'CASH', currentBalance: 2500000 }]}
      />
    )
    expect(withdrawalHtml).toContain('Tarik Saldo / Prive Pemilik')

    const voidHtml = renderToString(
      <VoidReasonModal
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        transaction={{ id_struk: 'STR-001', total_tagihan: 75000 }}
      />
    )
    expect(voidHtml).toContain('STR-001')

    const shiftHtml = renderToString(
      <ShiftClosingModal
        isOpen={true}
        onClose={() => {}}
        cashierName="Budi"
        storeName="RelayPOS"
        ownerPhone="081234"
        startingCapital={200000}
        todayCashSales={500000}
        todayQrisSales={150000}
        todayExpenses={50000}
        todayExchangeOut={0}
        onConfirmClose={() => {}}
      />
    )
    expect(shiftHtml).toContain('Budi')

    const prevDoc = globalThis.document
    globalThis.document = prevDoc || { body: {} }
    let receiptHtml = ''
    try {
      receiptHtml = renderToString(
        <ThermalReceiptModal
          receiptData={{
            orderNumber: 'STR-999',
            date: '2026-11-27',
            cashierName: 'Budi',
            grandTotal: 50000,
            cashReceived: 50000,
            change: 0,
            paymentMethod: 'TUNAI',
            items: [{ name: 'Kopi Susu', qty: 2, price: 25000, subtotal: 50000 }]
          }}
          onClose={() => {}}
        />
      )
    } finally {
      if (prevDoc === undefined) delete globalThis.document
      else globalThis.document = prevDoc
    }
    expect(receiptHtml).toContain('id="thermal-receipt-print-wrapper"')
    expect(receiptHtml).toContain('Kopi Susu')
  })
})
