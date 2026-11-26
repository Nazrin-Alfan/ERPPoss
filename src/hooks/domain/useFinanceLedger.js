/**
 * useFinanceLedger.js - Tenant-scoped finance custom options, pockets, and COA categories hook.
 */

import { useCallback, useEffect, useState } from 'react'
import { financeService } from '../../services/financeService'

export function useFinanceLedger({ tenantId = null } = {}) {
  const [customOptions, setCustomOptions] = useState(() => financeService.getCustomFinanceOptions(tenantId))
  const [pockets, setPockets] = useState([])
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCustomOptions(financeService.getCustomFinanceOptions(tenantId))
      const [pkRows, catRows] = await Promise.all([
        financeService.fetchPocketBalances(tenantId),
        financeService.fetchMasterCategories(tenantId)
      ])
      setPockets(pkRows)
      setCategories(catRows)
    } catch (err) {
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    reload()
  }, [reload])

  const saveCustomOption = useCallback(
    (type, value, defaults = [], normalizer) => {
      const updated = financeService.saveCustomFinanceOption(tenantId, type, value, defaults, normalizer)
      if (updated) {
        setCustomOptions(financeService.getCustomFinanceOptions(tenantId))
      }
      return updated
    },
    [tenantId]
  )

  return {
    data: { customOptions, pockets, categories },
    isLoading,
    isEmpty: !isLoading && pockets.length === 0,
    error,
    reload,
    actions: { saveCustomOption }
  }
}

export default useFinanceLedger
