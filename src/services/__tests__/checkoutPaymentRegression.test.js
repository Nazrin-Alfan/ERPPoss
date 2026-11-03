import { beforeEach, describe, expect, it, vi } from 'vitest'
import posService from '../posService'
import api from '../apiAdapter'

describe('checkout cash tender regression', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('preserves cash handed over independently of net sale and recomputes change', async () => {
    const execute = vi.spyOn(api.transaksi, 'executeCheckout').mockResolvedValue({ status: 'COMPLETED' })
    await posService.executeCheckout({
      tenantId: '11111111-1111-1111-1111-111111111111',
      strukPayload: {
        id_struk: 'QA-CASH-TENDER', total_tagihan: 36000,
        nominal_bayar: 36000, bayar: 36000, uang_diterima: 50000,
        nominal_cash: 36000, metode_bayar: 'CASH', kembalian: 999
      },
      cafeItems: [{ nama_menu: 'Kopi', harga_satuan: 18000, qty: 2 }]
    })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      struk_payload: expect.objectContaining({
        total_tagihan: 36000, uang_diterima: 50000,
        nominal_bayar: 36000, bayar: 36000, kembalian: 14000
      })
    }))
  })

  it('keeps legacy gross nominal_bayar as tender when explicit cash field is absent', async () => {
    const execute = vi.spyOn(api.transaksi, 'executeCheckout').mockResolvedValue({ status: 'COMPLETED' })
    await posService.executeCheckout({
      tenantId: '11111111-1111-1111-1111-111111111111',
      strukPayload: { id_struk: 'QA-LEGACY', total_tagihan: 36000, nominal_bayar: 50000, kembalian: 0 },
      cafeItems: [{ nama_menu: 'Kopi', harga_satuan: 18000, qty: 2 }]
    })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      struk_payload: expect.objectContaining({ uang_diterima: 50000, nominal_bayar: 36000, kembalian: 14000 })
    }))
  })

  it.each([
    ['QRIS', 36000, 0, 0],
    ['SPLIT', 30000, 20000, 14000],
  ])('normalizes %s tender without counting digital funds twice', async (method, received, qris, change) => {
    const execute = vi.spyOn(api.transaksi, 'executeCheckout').mockResolvedValue({ status: 'COMPLETED' })
    await posService.executeCheckout({
      tenantId: '11111111-1111-1111-1111-111111111111',
      strukPayload: {
        id_struk: `QA-${method}`, total_tagihan: 36000, metode_bayar: method,
        nominal_bayar: 36000, uang_diterima: received, nominal_qris: qris,
        kembalian: 999
      },
      cafeItems: [{ nama_menu: 'Kopi', harga_satuan: 18000, qty: 2 }]
    })
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      struk_payload: expect.objectContaining({
        nominal_bayar: 36000, uang_diterima: received, kembalian: change
      })
    }))
  })

})
