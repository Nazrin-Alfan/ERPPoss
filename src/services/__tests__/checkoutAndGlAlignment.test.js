import { describe, it, expect, vi, beforeEach } from 'vitest'
import posService, { PosCheckoutError } from '../posService'
import api from '../apiAdapter'

describe('posService Item Contract & Schema Alignment', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('TC_CHK_01: rejects checkout when tenantId is missing', async () => {
    await expect(
      posService.executeCheckout({
        tenantId: null,
        strukPayload: { id_struk: 'STRUK-123' },
        cafeItems: []
      })
    ).rejects.toThrow('Tenant ID wajib disertakan')
  })

  it('TC_CHK_02: normalizes cafeItems contract with harga_satuan, qty, and subtotal', async () => {
    const executeSpy = vi.spyOn(api.transaksi, 'executeCheckout').mockResolvedValue({
      status: 'SUCCESS',
      id_struk: 'STRUK-TEST-001'
    })

    const payload = {
      tenantId: '11111111-1111-1111-1111-111111111111',
      branchId: '22222222-2222-2222-2222-222222222222',
      strukPayload: {
        id_struk: 'STRUK-TEST-001',
        total_biaya: 50000,
        nominal_bayar: 50000,
        pajak: 2500,
        diskon: 0
      },
      cafeItems: [
        {
          id_menu: 'menu-1',
          nama_menu: 'Kopi Susu Aren',
          price: 25000,
          quantity: 2
        }
      ]
    }

    const res = await posService.executeCheckout(payload)
    expect(res.success).toBe(true)

    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: '11111111-1111-1111-1111-111111111111',
        branch_id: '22222222-2222-2222-2222-222222222222',
        struk_payload: expect.objectContaining({
          id_struk: 'STRUK-TEST-001',
          pajak: 2500,
          total_tagihan: 50000,
          nominal_bayar: 50000,
          bayar: 50000
        }),
        cafe_items: [
          expect.objectContaining({
            nama_menu: 'Kopi Susu Aren',
            nama: 'Kopi Susu Aren',
            harga: 25000,
            harga_satuan: 25000,
            qty: 2,
            quantity: 2,
            subtotal: 50000,
            total: 50000
          })
        ]
      })
    )
  })

  it('TC_CHK_03: parses stock insufficiency error properly', () => {
    const rawError = new Error('INSUFFICIENT_STOCK: Stok bahan baku Biji Kopi tidak mencukupi (Tersedia: 0.1, Dibutuhkan: 0.5).')
    const parsed = posService.parseCheckoutError(rawError)
    expect(parsed.code).toBe('INSUFFICIENT_STOCK')
    expect(parsed.isStockError).toBe(true)
    expect(parsed.message).toContain('Biji Kopi')
  })

  it('TC_CHK_04: parses underpaid payment error properly', () => {
    const rawError = new Error('PAYMENT_UNDERPAID: Pembayaran kurang dari total tagihan.')
    const parsed = posService.parseCheckoutError(rawError)
    expect(parsed.code).toBe('PAYMENT_UNDERPAID')
    expect(parsed.isPaymentError).toBe(true)
  })
})
