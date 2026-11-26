/**
 * useWarehouseInventory.js - Tenant-reactive warehouse inventory hook.
 */

import { useCallback, useEffect, useState } from 'react'
import { inventoryService } from '../../services/inventoryService'

export function useWarehouseInventory({ tenantId = null, canViewCost = false } = {}) {
  const [data, setData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const items = await inventoryService.fetchWarehouseInventory({ tenantId, canViewCost })
      setData(items)
    } catch (err) {
      setError(err)
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [tenantId, canViewCost])

  useEffect(() => {
    reload()
  }, [reload])

  return {
    data,
    isLoading,
    isEmpty: !isLoading && data.length === 0,
    error,
    reload
  }
}

export default useWarehouseInventory
