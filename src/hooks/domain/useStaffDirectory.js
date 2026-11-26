/**
 * useStaffDirectory.js - Tenant-reactive staff directory and payroll data hook.
 */

import { useCallback, useEffect, useState } from 'react'
import { staffService } from '../../services/staffService'

const EMPTY_STAFF = {
  karyawanCuciList: [],
  karyawanKantorList: [],
  staffList: [],
  tenantBranches: [],
  pocketOptions: []
}

export function useStaffDirectory({ tenantId = null } = {}) {
  const [data, setData] = useState(EMPTY_STAFF)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const directory = await staffService.fetchStaffDirectory({ tenantId })
      setData(directory)
    } catch (err) {
      setError(err)
      setData(EMPTY_STAFF)
    } finally {
      setIsLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    reload()
  }, [reload])

  return {
    data,
    isLoading,
    isEmpty: !isLoading && data.staffList.length === 0 && data.karyawanCuciList.length === 0,
    error,
    reload
  }
}

export default useStaffDirectory
