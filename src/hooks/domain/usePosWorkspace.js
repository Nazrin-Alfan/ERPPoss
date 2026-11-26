/**
 * usePosWorkspace.js - Headless POS operations facade decoupling pages from raw RPCs & storage.
 */

import { useMemo } from 'react'
import { posService } from '../../services/posService'

export function usePosWorkspace({ tenantId = null, branchId = null } = {}) {
  const actions = useMemo(
    () => ({
      executeCheckout: ({ strukPayload, cafeItems, carwashPayload }) =>
        posService.executeCheckout({ tenantId, branchId, strukPayload, cafeItems, carwashPayload }),
      settlePendingBill: ({ settlePayload }) =>
        posService.settlePendingBill({ tenantId, branchId, settlePayload }),
      voidTransaction: ({ idStruk, reason }) =>
        posService.voidTransaction({ tenantId, idStruk, reason }),
      closeCashierShift: ({ kasir, tanggal, modalAwal, kasFisik, catatan }) =>
        posService.closeCashierShift({ tenantId, branchId, kasir, tanggal, modalAwal, kasFisik, catatan }),
      recordMoneyExchange: ({ kasir, cashOut, qrisIn, customer, tanggal }) =>
        posService.recordMoneyExchange({ tenantId, branchId, kasir, cashOut, qrisIn, customer, tanggal }),
      getPendingBills: () => posService.getPendingBills({ tenantId }),
      getStartingCapital: (date) => posService.getTodayStartingCapital(tenantId, date),
      saveStartingCapital: (amount, date) => posService.saveTodayStartingCapital(tenantId, amount, date)
    }),
    [tenantId, branchId]
  )

  return {
    tenantId,
    branchId,
    actions
  }
}

export default usePosWorkspace
