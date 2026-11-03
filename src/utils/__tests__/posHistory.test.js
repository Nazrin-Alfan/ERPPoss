import { describe, expect, it } from 'vitest'
import { mapPosHistoryTransaction, buildHistoryPaymentReceipt } from '../posHistory'

describe('persisted checkout receipt history', () => {
  it('reprints stored tender and server change after the checkout UI state is gone', () => {
    const persistedRow = JSON.parse(JSON.stringify({
      id_struk: 'QA-RELOAD', tanggal: '2026-11-03', jam: '10:00:00', kasir: 'QA',
      total_tagihan: 36000, metode_bayar: 'CASH', status_bayar: 'Selesai',
      nominal_cash: 36000, nominal_qris: 0, uang_diterima: 50000, kembalian: 14000,
      cafe: [{ nama_menu: 'Kopi', qty: 2, harga_satuan: 18000 }]
    }))
    const tx = mapPosHistoryTransaction(persistedRow)
    const receipt = buildHistoryPaymentReceipt(tx, 'Tenant QA')
    expect(receipt.uangDiterima).toBe(50000)
    expect(receipt.kembalian).toBe(14000)
    expect(receipt.totalTagihan).toBe(36000)
    expect(receipt.items[0].subtotal).toBe(36000)
    expect(receipt.storeName).toBe('Tenant QA')
  })

  it('keeps legacy receipts without tender printable using the existing fallback', () => {
    const tx = mapPosHistoryTransaction({
      id_struk: 'QA-LEGACY', total_tagihan: 12000, nominal_cash: 12000,
      metode_bayar: 'CASH', uang_diterima: null, kembalian: null, cafe: []
    })
    const receipt = buildHistoryPaymentReceipt(tx, 'Tenant QA')
    expect(receipt.uangDiterima).toBe(12000)
    expect(receipt.kembalian).toBe(0)
  })
})
