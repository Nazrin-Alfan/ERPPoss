import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildPaymentReceiptData, calculateSettlementWithSurcharge } from '../../../utils/receiptHelpers'

// Execute the actual component handler body with its closure dependencies, rather
// than a duplicate helper implementation. This catches undeclared identifiers that
// a successful Vite build and service-only tests cannot detect.
const source = readFileSync(new URL('../HybridPOSPage.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  const handleSettleBill = async (e) => {')
const end = source.indexOf('  const handleCancelBill = ', start)
if (start < 0 || end < 0) throw new Error('Hybrid settlement handler boundaries changed; update extraction')
const handlerSource = source.slice(start, end)

function settlementHarness({ profile, method = 'CASH' }) {
  const setters = Object.fromEntries([
    'setError', 'setLoading', 'setSuccess', 'setSettlingBill', 'setSettlePaymentMethod',
    'setSplitCashAmount', 'setSplitQrisAmount', 'setSettleCashReceived',
    'setSettleSurcharge', 'setActiveReceipt',
  ].map(name => [name, vi.fn()]))
  const posService = { settlePendingBill: vi.fn().mockResolvedValue({ data: { kembalian: 14000 } }) }
  const receiptBuilder = vi.fn(order => buildPaymentReceiptData(order, {}))
  const dependencies = {
    ...setters, profile, posService, settlePaymentMethod: method,
    settlingBill: {
      id: 'QA-PENDING-001', attemptKey: 'QA-PENDING-001:attempt-1',
      total_harga: 36000, tanggal: '2026-11-05', jam: '10:00:00',
      cafe: [{ nama_menu: 'QA Coffee', jumlah: 2, harga_satuan: 18000 }], carwash: [],
    },
    settleSurcharge: { enabled: false },
    splitCashAmount: '16000', splitQrisAmount: '20000',
    settleCashReceived: method === 'SPLIT' ? '30000' : '50000',
    effectiveTenantId: '11111111-1111-1111-1111-111111111111',
    selectedCashier: 'QA Kasir', activeTenant: { nama: 'QA Tenant' },
    calculateSettlementWithSurcharge, buildPaymentReceiptData: receiptBuilder,
    formatRupiah: n => String(n),
    fetchPendingBills: vi.fn().mockResolvedValue(undefined),
    fetchCashierCash: vi.fn().mockResolvedValue(undefined),
    fetchTodayTransactions: vi.fn().mockResolvedValue(undefined),
    showAlert: vi.fn().mockResolvedValue(undefined),
    setTimeout: vi.fn(), console: { error: vi.fn() },
  }
  const handler = new Function(...Object.keys(dependencies), `${handlerSource}; return handleSettleBill`)(...Object.values(dependencies))
  return { handler, dependencies, setters, posService, receiptBuilder }
}

describe('HybridPOS pending settlement actual submit handler', () => {
  it.each([
    ['CASH', { branch_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 36000, 0, 50000],
    ['CASH', null, null, 36000, 0, 50000],
    ['SPLIT', { branch_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 16000, 20000, 30000],
  ])('%s reaches settlement RPC with profile branch %j', async (method, profile, branch, cash, qris, received) => {
    const h = settlementHarness({ profile, method })
    const preventDefault = vi.fn()
    await h.handler({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(h.setters.setError.mock.calls.flat().filter(Boolean)).toEqual([])
    expect(h.posService.settlePendingBill).toHaveBeenCalledExactlyOnceWith({
      tenantId: '11111111-1111-1111-1111-111111111111', branchId: branch,
      settlePayload: expect.objectContaining({
        id_struk: 'QA-PENDING-001', idempotency_key: 'QA-PENDING-001:attempt-1',
        metode_bayar: method, total_tagihan: 36000, nominal_bayar: 36000,
        nominal_cash: cash, nominal_qris: qris, uang_diterima: received,
      }),
    })
    expect(h.setters.setActiveReceipt).toHaveBeenCalledWith(expect.objectContaining({
      totalTagihan: 36000, nominalCash: cash, nominalQris: qris,
      uangDiterima: received, kembalian: 14000, isPaid: true,
    }))
    expect(h.dependencies.fetchPendingBills).toHaveBeenCalledOnce()
    expect(h.dependencies.fetchCashierCash).toHaveBeenCalledOnce()
    expect(h.dependencies.fetchTodayTransactions).toHaveBeenCalledOnce()
    expect(h.setters.setSettlingBill).toHaveBeenCalledWith(null)
    expect(h.setters.setLoading).toHaveBeenLastCalledWith(false)
  })
})
