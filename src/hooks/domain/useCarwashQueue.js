/**
 * useCarwashQueue.js - Tenant-scoped Carwash Queue hook & debounced Realtime subscriber.
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

export function subscribeCarwashQueueRealtime({
  client = supabase,
  tenantId = null,
  onChange,
  debounceMs = 250
} = {}) {
  if (!client || typeof client.channel !== 'function') {
    return () => {}
  }

  let timerId = null
  const scheduleRefresh = () => {
    if (timerId !== null) {
      clearTimeout(timerId)
    }
    timerId = setTimeout(() => {
      timerId = null
      if (typeof onChange === 'function') {
        onChange()
      }
    }, debounceMs)
  }

  const channelName = tenantId ? `carwash-queue-realtime-${tenantId}` : 'carwash-queue-realtime'
  const filterConfig = {
    event: '*',
    schema: 'public',
    table: 'carwash',
    ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {})
  }

  let channel = null
  try {
    channel = client
      .channel(channelName)
      .on('postgres_changes', filterConfig, scheduleRefresh)
      .subscribe()
  } catch {
    return () => {}
  }

  return () => {
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
    try {
      if (channel && typeof client.removeChannel === 'function') {
        client.removeChannel(channel)
      }
    } catch {
      // Safe cleanup ignore
    }
  }
}

export function useCarwashQueue({ tenantId = null, selectedDate = null } = {}) {
  const [data, setData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const targetDate = selectedDate || new Date().toLocaleDateString('en-CA')

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('carwash')
        .select('*')
        .eq('tanggal', targetDate)
      if (tenantId && typeof query.eq === 'function') {
        query = query.eq('tenant_id', tenantId)
      }
      if (typeof query.order === 'function') {
        query = query.order('jam', { ascending: true })
      }
      const { data: rows, error: fetchErr } = await query
      if (fetchErr) throw fetchErr
      setData(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setError(err)
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [tenantId, targetDate])

  useEffect(() => {
    reload()
    return subscribeCarwashQueueRealtime({
      client: supabase,
      tenantId,
      onChange: reload,
      debounceMs: 250
    })
  }, [reload, tenantId])

  return {
    data,
    isLoading,
    isEmpty: !isLoading && data.length === 0,
    error,
    reload
  }
}

export default useCarwashQueue
