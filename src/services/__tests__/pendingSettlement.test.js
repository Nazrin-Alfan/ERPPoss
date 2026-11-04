import { beforeEach, describe, expect, it, vi } from 'vitest'
import posService, { PosCheckoutError } from '../posService'
import api from '../apiAdapter'

describe('pending bill settlement (Tahap 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('parameter validation', () => {
    it('throws error when tenantId is missing', async () => {
      await expect(posService.settlePendingBill({
        tenantId: '',
        settlePayload: { id_struk: 'STRUK-001' }
      })).rejects.toThrow('Tenant ID wajib disertakan')
    })

    it('throws error when id_struk is missing', async () => {
      await expect(posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        settlePayload: {}
      })).rejects.toThrow('Nomor struk wajib disertakan')
    })
  })

  describe('payload normalization and tender calculation', () => {
    it('normalizes cash settlement with surcharge and calculates change', async () => {
      const settleSpy = vi.spyOn(api.transaksi, 'settlePendingBill').mockResolvedValue({
        success: true,
        status: 'COMPLETED',
        id_struk: 'STRUK-PENDING-001',
        total_tagihan: 86000,
        uang_diterima: 100000,
        kembalian: 14000
      })

      const res = await posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        branchId: '22222222-2222-2222-2222-222222222222',
        settlePayload: {
          id_struk: 'STRUK-PENDING-001',
          metode_bayar: 'CASH',
          base_total: 36000,
          uang_diterima: 100000,
          surcharge: {
            enabled: true,
            nominal: 50000,
            keterangan: 'Biaya Inap Kendaraan (1 Malam)'
          }
        }
      })

      expect(settleSpy).toHaveBeenCalledWith(expect.objectContaining({
        tenant_id: '11111111-1111-1111-1111-111111111111',
        branch_id: '22222222-2222-2222-2222-222222222222',
        settle_payload: expect.objectContaining({
          id_struk: 'STRUK-PENDING-001',
          metode_bayar: 'CASH',
          uang_diterima: 100000,
          nominal_bayar: 86000,
          surcharge: expect.objectContaining({
            enabled: true,
            nominal: 50000,
            keterangan: 'Biaya Inap Kendaraan (1 Malam)'
          })
        })
      }))
      expect(res.success).toBe(true)
    })

    it('normalizes SPLIT settlement across cash and digital without double counting', async () => {
      const settleSpy = vi.spyOn(api.transaksi, 'settlePendingBill').mockResolvedValue({
        success: true,
        status: 'COMPLETED',
        id_struk: 'STRUK-SPLIT-001'
      })

      await posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        settlePayload: {
          id_struk: 'STRUK-SPLIT-001',
          metode_bayar: 'SPLIT',
          base_total: 86000,
          split_cash: 36000,
          split_qris: 50000,
          uang_diterima: 50000 // Uang tunai diserahkan 50.000 untuk porsi tunai 36.000
        }
      })

      expect(settleSpy).toHaveBeenCalledWith(expect.objectContaining({
        settle_payload: expect.objectContaining({
          metode_bayar: 'SPLIT',
          nominal_cash: 36000,
          nominal_qris: 50000,
          uang_diterima: 50000,
          kembalian: 14000
        })
      }))
    })

    it('handles SPLIT payment with excess cash tender and calculates exact cash change', async () => {
      const settleSpy = vi.spyOn(api.transaksi, 'settlePendingBill').mockResolvedValue({
        success: true,
        status: 'COMPLETED',
        id_struk: 'STRUK-SPLIT-EXCESS-002'
      })

      const res = await posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        settlePayload: {
          id_struk: 'STRUK-SPLIT-EXCESS-002',
          metode_bayar: 'SPLIT',
          base_total: 100000,
          split_cash: 40000,
          split_qris: 60000,
          uang_diterima: 100000 // Serahkan uang tunai 100.000 untuk porsi tunai 40.000 (kelebihan 60.000)
        }
      })

      expect(res.success).toBe(true)
      expect(settleSpy).toHaveBeenCalledWith(expect.objectContaining({
        settle_payload: expect.objectContaining({
          metode_bayar: 'SPLIT',
          nominal_cash: 40000,
          nominal_qris: 60000,
          uang_diterima: 100000,
          kembalian: 60000,
          nominal_bayar: 100000
        })
      }))
    })

    it('handles journal failure after initial mutations and maps to JOURNAL_POSTING_FAILED error', async () => {
      vi.spyOn(api.transaksi, 'settlePendingBill').mockRejectedValue(
        new Error('JOURNAL_POSTING_FAILED: Trigger fn_check_journal_balance mendeteksi debit != kredit pada journal_entries')
      )

      await expect(posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        settlePayload: {
          id_struk: 'STRUK-FAIL-JOURNAL-001',
          base_total: 75000,
          metode_bayar: 'CASH',
          uang_diterima: 100000
        }
      })).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(PosCheckoutError)
        expect(err.code).toBe('JOURNAL_POSTING_FAILED')
        expect(err.message).toMatch(/jurnal buku besar/i)
        expect(err.message).toMatch(/Zero Partial State/i)
        return true
      })
    })

    it('generates an idempotency key when not explicitly provided', async () => {
      const settleSpy = vi.spyOn(api.transaksi, 'settlePendingBill').mockResolvedValue({
        success: true,
        status: 'COMPLETED'
      })

      await posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        settlePayload: {
          id_struk: 'STRUK-IDEM-001',
          metode_bayar: 'QRIS',
          base_total: 50000,
          uang_diterima: 50000
        }
      })

      expect(settleSpy).toHaveBeenCalledWith(expect.objectContaining({
        settle_payload: expect.objectContaining({
          idempotency_key: expect.stringContaining('STRUK-IDEM-001')
        })
      }))
    })

    it('throws error when surcharge exceeds 5,000,000 limit', async () => {
      await expect(posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        settlePayload: {
          id_struk: 'STRUK-OVERCAP-001',
          base_total: 50000,
          surcharge: {
            enabled: true,
            nominal: 6000000,
            keterangan: 'Melebihi batas wajar'
          }
        }
      })).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(PosCheckoutError)
        expect(err.code).toBe('INVALID_SURCHARGE')
        expect(err.message).toMatch(/melebihi batas/i)
        return true
      })
    })

    it('throws PAYMENT_UNDERPAID when cash tender is insufficient', async () => {
      await expect(posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        settlePayload: {
          id_struk: 'STRUK-SHORT-001',
          base_total: 50000,
          metode_bayar: 'CASH',
          uang_diterima: 40000
        }
      })).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(PosCheckoutError)
        expect(err.code).toBe('PAYMENT_UNDERPAID')
        return true
      })
    })
  })

  describe('error parsing for settlement responses', () => {
    it.each([
      ['PAYMENT_UNDERPAID: Pembayaran kurang', 'PAYMENT_UNDERPAID', /pembayaran kurang/i],
      ['IDEMPOTENCY_CONFLICT: payload berbeda', 'IDEMPOTENCY_CONFLICT', /payload transaksi yang berbeda/i],
      ['BILL_ALREADY_SETTLED: sudah lunas', 'BILL_ALREADY_SETTLED', /sudah diselesaikan/i],
      ['BILL_CANCELLED: tagihan dibatalkan', 'BILL_CANCELLED', /telah dibatalkan/i],
      ['TENANT_FORBIDDEN: lintas tenant', 'TENANT_FORBIDDEN', /lintas tenant/i],
      ['SURCHARGE_UNAUTHORIZED: di atas 500k', 'SURCHARGE_UNAUTHORIZED', /memerlukan otorisasi/i],
      ['INVALID_SURCHARGE: keterangan wajib', 'INVALID_SURCHARGE', /keterangan wajib/i]
    ])('maps server error %s to standardized code %s', async (rawError, expectedCode, expectedMsgRegex) => {
      vi.spyOn(api.transaksi, 'settlePendingBill').mockRejectedValue(new Error(rawError))

      await expect(posService.settlePendingBill({
        tenantId: '11111111-1111-1111-1111-111111111111',
        settlePayload: { id_struk: 'STRUK-ERR-001' }
      })).rejects.toSatisfy((err) => {
        expect(err).toBeInstanceOf(PosCheckoutError)
        expect(err.code).toBe(expectedCode)
        expect(err.message).toMatch(expectedMsgRegex)
        return true
      })
    })
  })
})
