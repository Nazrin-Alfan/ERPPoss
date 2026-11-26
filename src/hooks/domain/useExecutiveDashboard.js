/**
 * useExecutiveDashboard.js - Tenant-scoped executive dashboard summary facade.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

export function useExecutiveDashboard({ tenantId = null } = {}) {
  const [pockets, setPockets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      let query = supabase.from('v_pocket_balances').select('*')
      if (tenantId && query && typeof query.eq === 'function') {
        query = query.eq('tenant_id', tenantId)
      }
      const { data, error: fetchErr } = await query
      if (fetchErr) throw fetchErr
      setPockets(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err)
      setPockets([])
    } finally {
      setIsLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    reload()
  }, [reload])

  return {
    data: { pockets },
    isLoading,
    isEmpty: !isLoading && pockets.length === 0,
    error,
    reload
  }
}

export default useExecutiveDashboard
