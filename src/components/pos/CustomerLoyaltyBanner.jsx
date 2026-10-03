import React, { useState, useEffect } from 'react'
import {
  Crown,
  Car,
  Gift,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Clock,
  Phone,
  FileText,
  UserCheck,
  Check,
  X
} from 'lucide-react'
import { lookupCustomerByPlate } from '../../services/crmService'
import { formatRupiah } from '../../utils/helpers'

/**
 * CustomerLoyaltyBanner
 * Real-time two-way CRM integration banner displayed directly inside POS Cashier.
 *
 * Props:
 * - db: Supabase / Local database client
 * - tenantId: Current active tenant ID
 * - plateNumber: Current input plate number
 * - onApplyProfile: (profile: { model, noTelepon, catatan_kendaraan, nama }) => void
 * - onClaimReward: (rewardInfo: { title, type, isClaimed }) => void
 * - isRewardClaimed: boolean
 * - claimedRewardTitle: string
 */
export const CustomerLoyaltyBanner = ({
  db,
  tenantId,
  plateNumber = '',
  onApplyProfile,
  onClaimReward,
  isRewardClaimed = false,
  claimedRewardTitle = ''
}) => {
  const [customerData, setCustomerData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [applied, setApplied] = useState(false)

  // Debounced lookup when plateNumber changes and has length >= 3
  useEffect(() => {
    const trimmed = (plateNumber || '').trim()
    if (trimmed.length < 3) {
      setCustomerData(null)
      setApplied(false)
      return
    }

    let isMounted = true
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const result = await lookupCustomerByPlate(db, tenantId, trimmed)
        if (isMounted) {
          setCustomerData(result)
          setApplied(false)
        }
      } catch (err) {
        console.warn('Error fetching customer CRM in POS banner:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }, 250)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [db, tenantId, plateNumber])

  if (!plateNumber || plateNumber.trim().length < 3) {
    return null
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse flex items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-slate-800" />
          <span>Memeriksa database CRM & status loyalitas {plateNumber.toUpperCase()}...</span>
        </div>
      </div>
    )
  }

  // Customer not found in history -> New Customer intake
  if (!customerData) {
    return (
      <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Sparkles size={15} className="text-amber-400 shrink-0" />
          <span>
            <strong className="text-white font-mono">{plateNumber.toUpperCase()}</strong> belum tercatat di CRM (Pelanggan Baru). Data yang kasir masukkan akan otomatis didaftarkan.
          </span>
        </div>
      </div>
    )
  }

  const {
    segment,
    loyalty,
    model,
    noTelepon,
    catatanKhusus,
    nama,
    totalVisits,
    totalSpent
  } = customerData

  // Segment icon helper
  const renderSegmentIcon = () => {
    if (segment.code === 'VIP') return <Crown size={14} className="text-emerald-400" />
    if (segment.code === 'LOYAL') return <Car size={14} className="text-cyan-400" />
    if (segment.code === 'AT_RISK') return <AlertTriangle size={14} className="text-rose-400" />
    return <Sparkles size={14} className="text-amber-400" />
  }

  const handleApplyClick = () => {
    if (onApplyProfile) {
      onApplyProfile({
        model: model !== 'Mobil' ? model : '',
        noTelepon: noTelepon !== '-' ? noTelepon : '',
        catatan_kendaraan: catatanKhusus || '',
        nama: nama || ''
      })
      setApplied(true)
      setTimeout(() => setApplied(false), 2500)
    }
  }

  const handleToggleReward = () => {
    if (!onClaimReward) return
    if (isRewardClaimed) {
      onClaimReward({ isClaimed: false, title: '', type: '' })
    } else {
      onClaimReward({
        isClaimed: true,
        title: loyalty?.rewardTitle || 'Gratis Hadiah Loyalty',
        type: customerData.settings?.reward_type || 'FREE_SERVICE'
      })
    }
  }

  return (
    <div className={`p-3.5 rounded-xl border transition-all text-xs space-y-2.5 ${
      loyalty?.isRewardReady
        ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/20'
        : 'bg-slate-900/90 border-slate-800'
    }`}>
      {/* Top Header: Badge, Segment, Visits */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black font-mono text-sm text-white tracking-wide">
            {plateNumber.toUpperCase()}
          </span>

          {/* Segment Badge */}
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border flex items-center gap-1 ${segment.badgeClass}`}>
            {renderSegmentIcon()}
            {segment.label}
          </span>

          {/* Visit count */}
          <span className="text-[11px] text-slate-400 font-mono">
            Kunjungan ke-<strong className="text-white font-bold">{totalVisits + 1}</strong> ({totalVisits}x tercatat)
          </span>
        </div>

        {/* Loyalty Stamp Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono">
          <Gift size={13} className="text-amber-400" />
          <span className="text-slate-400">Loyalty:</span>
          <span className="font-bold text-amber-300 tabular-nums">
            {loyalty.stamps} / {loyalty.stampTarget} Stamp
          </span>
        </div>
      </div>

      {/* Middle Info: Customer Details & Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1.5 px-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 text-[11px] text-slate-300">
        <div className="flex items-center gap-1.5 truncate">
          <Car size={13} className="text-slate-500 shrink-0" />
          <span className="text-slate-400">Model:</span>
          <span className="font-semibold text-white truncate">{model || 'Standar'}</span>
        </div>

        <div className="flex items-center gap-1.5 truncate">
          <Phone size={13} className="text-slate-500 shrink-0" />
          <span className="text-slate-400">WA:</span>
          <span className="font-mono text-white truncate">{noTelepon || 'Belum ada'}</span>
        </div>

        <div className="flex items-center gap-1.5 truncate sm:col-span-1">
          <FileText size={13} className="text-slate-500 shrink-0" />
          <span className="text-slate-400">Catatan:</span>
          <span className="text-amber-200 truncate italic">{catatanKhusus || 'Tidak ada catatan'}</span>
        </div>
      </div>

      {/* Reward Ready Alert Box if eligible */}
      {loyalty?.isRewardReady && (
        <div className="p-2.5 rounded-lg bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-amber-400 shrink-0 animate-bounce" />
            <div>
              <span className="text-xs font-black text-amber-300 block">
                🎁 REWARD LOYALTY SIAP DIKLAIM!
              </span>
              <span className="text-[11px] text-slate-300">
                Hak Hadiah: <strong className="text-white underline">{loyalty.rewardTitle}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleReward}
            className={`px-3 py-1.5 rounded-lg font-black text-xs transition-all flex items-center gap-1.5 active:scale-[0.98] ${
              isRewardClaimed
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-md shadow-amber-500/20'
            }`}
          >
            {isRewardClaimed ? (
              <>
                <Check size={14} />
                <span>Hadiah Diterapkan (-100%)</span>
              </>
            ) : (
              <>
                <Gift size={14} />
                <span>Klaim ke Transaksi Ini</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Action Strip: 1-Click Auto Fill */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-slate-500">
          Total Belanja Tercatat: <strong className="text-slate-300 font-mono">{formatRupiah(totalSpent)}</strong>
        </span>

        {(model !== 'Mobil' || noTelepon || catatanKhusus) && (
          <button
            type="button"
            onClick={handleApplyClick}
            disabled={applied}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 active:scale-[0.98] ${
              applied
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:text-white'
            }`}
          >
            {applied ? (
              <>
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>Data Profil Diterapkan!</span>
              </>
            ) : (
              <>
                <UserCheck size={13} className="text-cyan-400" />
                <span>Gunakan Data Profil</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default CustomerLoyaltyBanner
