import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import ExecutivePromptStudio from '../components/dashboard/ExecutivePromptStudio'

const fetchAllRows = async (table, select = '*', tenantId = null) => {
  let allData = []
  let from = 0
  const step = 1000
  while (true) {
    let query = supabase.from(table).select(select)
    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }
    const { data, error } = await query.range(from, from + step - 1)
    if (error || !data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < step) break
    from += step
  }
  return allData
}

const fetchCafeRows = async (tenantId = null) => {
  let allData = []
  let from = 0
  const step = 1000
  while (true) {
    let query = supabase.from('cafe').select('*, struk!inner(tanggal)')
    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }
    const { data, error } = await query.range(from, from + step - 1)
    if (error || !data || data.length === 0) break
    allData = allData.concat(data)
    if (data.length < step) break
    from += step
  }
  return allData
}

const AIStudio = () => {
  const navigate = useNavigate()
  const { activeTenant, profile } = useAuth()
  const targetTenantId = activeTenant?.id || profile?.tenant_id || null
  const tenantBusinessType = activeTenant?.business_type || 'HYBRID'

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [strukList, setStrukList] = useState([])
  const [carwashList, setCarwashList] = useState([])
  const [cafeList, setCafeList] = useState([])
  const [cashflowLogs, setCashflowLogs] = useState([])
  const [stokList, setStokList] = useState([])
  const [posAccountList, setPosAccountList] = useState([])

  const targetCapacity = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedCap = parseInt(window.localStorage.getItem('erp_carwash_target_capacity'), 10)
      if (!Number.isNaN(savedCap) && savedCap > 0) return savedCap
    }
    return 30
  }, [])

  const fetchStudioData = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const [dbStruk, dbCw, dbCafe, dbCf, dbStok] = await Promise.all([
        fetchAllRows('struk', '*', targetTenantId),
        fetchAllRows('carwash', '*', targetTenantId),
        fetchCafeRows(targetTenantId),
        fetchAllRows('cashflow', '*', targetTenantId),
        fetchAllRows('stok_barang', '*', targetTenantId)
      ])

      let balQuery = supabase.from('v_pocket_balances').select('*')
      if (targetTenantId) balQuery = balQuery.eq('tenant_id', targetTenantId)
      let { data: dbBal, error: balErr } = await balQuery
      if (balErr || !Array.isArray(dbBal)) {
        let fbQuery = supabase.from('pos_balances').select('*')
        if (targetTenantId) fbQuery = fbQuery.eq('tenant_id', targetTenantId)
        const fbRes = await fbQuery
        dbBal = fbRes.data
        balErr = fbRes.error
      }
      if (balErr) throw balErr

      const normalizedBal = (dbBal || [])
        .filter((item) => item.is_active !== false)
        .map((item) => {
          const liveBal = parseFloat(item.current_balance ?? item.balance ?? 0) || 0
          return { ...item, balance: liveBal, current_balance: liveBal }
        })

      setStrukList(dbStruk || [])
      setCarwashList(dbCw || [])
      setCafeList(dbCafe || [])
      setCashflowLogs(dbCf || [])
      setStokList(dbStok || [])
      setPosAccountList(normalizedBal)
    } catch (err) {
      console.error('Error fetching AI Studio data:', err)
      setErrorMsg(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [targetTenantId])

  useEffect(() => {
    fetchStudioData()
  }, [fetchStudioData])

  return (
    <div className="p-4 sm:p-6 pb-24 md:pb-8 space-y-6 max-w-7xl mx-auto animate-fade-in bg-canvas text-foreground">
      {/* Header Workspace AI Data Studio & Canvas */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface border border-border p-4 sm:p-5 rounded-2xl shadow-xs">
        <div className="min-w-0 space-y-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-soft border border-primary/25 text-primary-soft-foreground text-[11px] font-bold uppercase tracking-wider">
            <Sparkles size={12} strokeWidth={2} />
            <span>AI Canvas &amp; Data Studio</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            AI Data Studio &amp; Canvas
          </h1>
          <p className="text-xs text-muted max-w-2xl">
            Workspace khusus untuk kurasi blok data Zero-PII, komparasi historis deterministik, dan fondasi AI Canvas interaktif terpisah dari ringkasan Dashboard harian.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-subsurface hover:bg-surface-hover border border-border text-xs font-semibold text-foreground flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            <span>Kembali ke Dashboard</span>
          </button>

          <button
            type="button"
            onClick={fetchStudioData}
            disabled={loading}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
            <span>{loading ? 'Memuat...' : 'Segarkan Data'}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} strokeWidth={1.75} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={fetchStudioData}
            className="px-3 py-1.5 rounded-lg bg-surface border border-border text-foreground font-semibold text-xs hover:bg-surface-hover cursor-pointer shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {loading && strukList.length === 0 && cashflowLogs.length === 0 ? (
        <div className="space-y-4">
          <div className="h-28 rounded-2xl bg-surface border border-border animate-pulse" />
          <div className="h-72 rounded-2xl bg-surface border border-border animate-pulse" />
        </div>
      ) : (
        <section id="ai-prompt-studio" className="w-full">
          <ExecutivePromptStudio
            strukList={strukList}
            carwashList={carwashList}
            cafeList={cafeList}
            cashflowLogs={cashflowLogs}
            stokList={stokList}
            posAccountList={posAccountList}
            tenantBusinessType={tenantBusinessType}
            activeTenant={activeTenant}
            targetCapacity={targetCapacity}
          />
        </section>
      )}
    </div>
  )
}

export default AIStudio
