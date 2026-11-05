import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processCafeCheckout } from '../../../utils/cafeCheckoutHelpers'

describe('TC-POS-CAFE: CafePOS Checkout Handler & Pending Settlement Execution', () => {
  let mockPosService
  let mockReceiptConfigGetter
  let mockReceiptBuilder
  let mockSetActiveReceipt
  let mockSetSuccess
  let mockSetError
  let mockSetLoading
  let mockHandleClearCart
  let mockLoadPendingBills

  beforeEach(() => {
    mockPosService = {
      executeCheckout: vi.fn().mockResolvedValue({
        success: true,
        struk: { id_struk: 'STRUK-CAFE-101', total_tagihan: 36000 }
      }),
      settlePendingBill: vi.fn().mockResolvedValue({
        success: true,
        data: {
          id_struk: 'BILL-PENDING-001',
          total_tagihan: 30000,
          uang_diterima: 50000,
          kembalian: 20000
        }
      })
    }

    mockReceiptConfigGetter = vi.fn().mockReturnValue({ autoPrintOnCheckout: true })
    mockReceiptBuilder = vi.fn().mockImplementation((payload) => ({
      ...payload,
      printed: true
    }))
    mockSetActiveReceipt = vi.fn()
    mockSetSuccess = vi.fn()
    mockSetError = vi.fn()
    mockSetLoading = vi.fn()
    mockHandleClearCart = vi.fn()
    mockLoadPendingBills = vi.fn()
  })

  it('1. Checkout Baru: harus berhasil mengeksekusi checkout tanpa ReferenceError kembalian', async () => {
    const cart = [
      { nama_menu: 'Kopi Susu Gula Aren', harga: 18000, qty: 2 }
    ]
    const subtotal = 36000
    const diskonAmount = 0
    const grandTotal = 36000
    const nominalBayar = 50000
    const effectiveKembalian = 14000

    const result = await processCafeCheckout({
      cart,
      settlingBill: null,
      selectedPayment: 'CASH',
      nominalBayar,
      tableOrCustomer: 'Meja 5',
      orderNotes: 'Less ice',
      selectedCashier: 'Budi Kasir',
      effectiveTenantId: 'tenant-cafe-uuid',
      activeTenant: { nama: 'Cafe Uji Coba' },
      subtotal,
      diskonAmount,
      grandTotal,
      effectiveSubtotal: subtotal,
      effectiveDiskon: diskonAmount,
      effectiveGrandTotal: grandTotal,
      effectiveKembalian,
      posServiceInstance: mockPosService,
      receiptConfigGetter: mockReceiptConfigGetter,
      receiptBuilder: mockReceiptBuilder,
      setActiveReceipt: mockSetActiveReceipt,
      setSuccess: mockSetSuccess,
      setError: mockSetError,
      setLoading: mockSetLoading,
      handleClearCart: mockHandleClearCart,
      loadPendingBills: mockLoadPendingBills
    })

    expect(result.success).toBe(true)
    expect(mockPosService.executeCheckout).toHaveBeenCalledTimes(1)

    const checkoutArgs = mockPosService.executeCheckout.mock.calls[0][0]
    expect(checkoutArgs.strukPayload.kembalian).toBe(14000)
    expect(checkoutArgs.strukPayload.total_tagihan).toBe(36000)
    expect(checkoutArgs.strukPayload.kasir).toBe('Budi Kasir')

    // Verifikasi data struk cetak
    expect(mockReceiptBuilder).toHaveBeenCalledTimes(1)
    const receiptArgs = mockReceiptBuilder.mock.calls[0][0]
    expect(receiptArgs.kembalian).toBe(14000)
    expect(receiptArgs.uang_diterima).toBe(50000)
    expect(mockSetActiveReceipt).toHaveBeenCalledWith(expect.objectContaining({
      kembalian: 14000,
      printed: true
    }))
    expect(mockSetError).not.toHaveBeenCalledWith(expect.stringMatching(/kembalian is not defined/i))
  })

  it('2. Pelunasan Pending: harus memanggil settlePendingBill dan membentuk struk tanpa ReferenceError kembalian', async () => {
    const cart = [
      { nama_menu: 'Americano', harga: 15000, qty: 2 }
    ]
    const settlingBill = {
      id_struk: 'BILL-PENDING-001',
      total_tagihan: 30000,
      subtotal: 30000,
      diskon: 0,
      attemptKey: 'BILL-PENDING-001:settle:attempt-key-1',
      savedItems: [
        { nama_menu: 'Americano', harga: 15000, qty: 2, subtotal: 30000 }
      ]
    }
    const nominalBayar = 50000
    const effectiveGrandTotal = 30000
    const effectiveKembalian = 20000

    const result = await processCafeCheckout({
      cart,
      settlingBill,
      selectedPayment: 'CASH',
      nominalBayar,
      tableOrCustomer: 'Meja 2',
      effectiveTenantId: 'tenant-cafe-uuid',
      activeTenant: { nama: 'Cafe Uji Coba' },
      subtotal: 30000,
      diskonAmount: 0,
      grandTotal: 30000,
      effectiveSubtotal: 30000,
      effectiveDiskon: 0,
      effectiveGrandTotal,
      effectiveKembalian,
      posServiceInstance: mockPosService,
      receiptConfigGetter: mockReceiptConfigGetter,
      receiptBuilder: mockReceiptBuilder,
      setActiveReceipt: mockSetActiveReceipt,
      setSuccess: mockSetSuccess,
      setError: mockSetError,
      setLoading: mockSetLoading,
      handleClearCart: mockHandleClearCart,
      loadPendingBills: mockLoadPendingBills
    })

    expect(result.success).toBe(true)
    expect(mockPosService.settlePendingBill).toHaveBeenCalledTimes(1)
    expect(mockPosService.executeCheckout).not.toHaveBeenCalled()

    const settleArgs = mockPosService.settlePendingBill.mock.calls[0][0]
    expect(settleArgs.settlePayload.id_struk).toBe('BILL-PENDING-001')
    expect(settleArgs.settlePayload.total_tagihan).toBe(30000)
    expect(settleArgs.settlePayload.uang_diterima).toBe(50000)
    expect(settleArgs.settlePayload.kembalian).toBe(20000)
    expect(settleArgs.settlePayload.idempotency_key).toBe('BILL-PENDING-001:settle:attempt-key-1')

    // Verifikasi data struk dari hasil transaksi tersimpan DB
    expect(mockReceiptBuilder).toHaveBeenCalledTimes(1)
    const receiptArgs = mockReceiptBuilder.mock.calls[0][0]
    expect(receiptArgs.kembalian).toBe(20000)
    expect(receiptArgs.total_tagihan).toBe(30000)
    expect(mockSetActiveReceipt).toHaveBeenCalled()
    expect(mockSetError).not.toHaveBeenCalledWith(expect.stringMatching(/kembalian is not defined/i))
  })

  it('3. Validasi Pembayaran Tunai Kurang: harus ditolak sebelum RPC dipanggil', async () => {
    const cart = [{ nama_menu: 'Matcha Latte', harga: 25000, qty: 1 }]
    const result = await processCafeCheckout({
      cart,
      settlingBill: null,
      selectedPayment: 'CASH',
      nominalBayar: 20000, // Kurang dari 25000
      effectiveGrandTotal: 25000,
      effectiveKembalian: 0,
      posServiceInstance: mockPosService,
      setError: mockSetError,
      setLoading: mockSetLoading
    })

    expect(result.success).toBe(false)
    expect(mockSetError).toHaveBeenCalledWith('Nominal pembayaran tunai kurang dari total tagihan.')
    expect(mockPosService.executeCheckout).not.toHaveBeenCalled()
    expect(mockPosService.settlePendingBill).not.toHaveBeenCalled()
  })
})
