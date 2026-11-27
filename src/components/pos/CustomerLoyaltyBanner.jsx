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
  claimedRewardTitle = '',
  rewardCheckoutEnabled = false
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

const getSegmentBadgeClass = (code) => {
  switch (code) {
    case 'VIP':
      return 'bg-success-bg text-success border-success/30'
    case 'LOYAL':
      return 'bg-primary-soft text-primary-soft-foreground border-primary/30'
    case 'AT_RISK':
      return 'bg-destructive-bg text-destructive border-destructive/30'
    case 'NEED_ATTENTION':
      return 'bg-warning-bg text-warning border-warning/30'
    default:
      return 'bg-subsurface text-muted border-border'
  }
}

  // Loading skeleton
  if (loading) {
    return (
      <div className="p-3 rounded-xl bg-surface border border-border animate-pulse flex items-center justify-between gap-3 text-xs text-muted">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-subsurface" />
          <span>Memeriksa database CRM & status loyalitas {plateNumber.toUpperCase()}...</span>
        </div>
      </div>
    )
  }

  // Customer not found in history -> New Customer intake
  if (!customerData) {
    return (
      <div className="p-3 rounded-xl bg-surface border border-border flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-foreground">
          <Sparkles size={15} className="text-warning shrink-0" />
          <span>
            <strong className="text-foreground font-mono mr-1">{plateNumber.toUpperCase()}</strong>
            {' '}belum tercatat di CRM (Pelanggan Baru). Data yang kasir masukkan akan otomatis didaftarkan.
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
    if (segment.code === 'VIP') return <Crown size={14} className="text-primary" />
    if (segment.code === 'LOYAL') return <Car size={14} className="text-primary" />
    if (segment.code === 'AT_RISK') return <AlertTriangle size={14} className="text-destructive" />
    return <Sparkles size={14} className="text-warning" />
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
    if (!onClaimReward || !rewardCheckoutEnabled) return
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
        ? 'bg-warning-bg border-warning/40 ring-1 ring-warning/20'
        : 'bg-surface border-border'
    }`}>
      {/* Top Header: Badge, Segment, Visits */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black font-mono text-sm text-foreground tracking-wide">
            {plateNumber.toUpperCase()}
          </span>

          {/* Segment Badge */}
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border flex items-center gap-1 ${getSegmentBadgeClass(segment.code)}`}>
            {renderSegmentIcon()}
            {segment.label}
          </span>

          {/* Visit count */}
          <span className="text-[11px] text-muted font-mono tabular-nums">
            Kunjungan ke-<strong className="text-foreground font-bold">{totalVisits + 1}</strong> ({totalVisits}x tercatat)
          </span>
        </div>

        {/* Loyalty Stamp Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-subsurface border border-border text-[11px] font-mono">
          <Gift size={13} className="text-warning" />
          <span className="text-muted">Loyalty:</span>
          <span className="font-bold text-warning tabular-nums">
            {loyalty.stamps} / {loyalty.stampTarget} Stamp
          </span>
        </div>
      </div>

      {/* Middle Info: Customer Details & Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1.5 px-2.5 rounded-lg bg-subsurface border border-border text-[11px] text-foreground">
        <div className="flex items-center gap-1.5 truncate">
          <Car size={13} className="text-muted-dark shrink-0" />
          <span className="text-muted">Model:</span>
          <span className="font-semibold text-foreground truncate">{model || 'Standar'}</span>
        </div>

        <div className="flex items-center gap-1.5 truncate">
          <Phone size={13} className="text-muted-dark shrink-0" />
          <span className="text-muted">WA:</span>
          <span className="font-mono text-foreground truncate">{noTelepon || 'Belum ada'}</span>
        </div>

        <div className="flex items-center gap-1.5 truncate sm:col-span-1">
          <FileText size={13} className="text-muted-dark shrink-0" />
          <span className="text-muted">Catatan:</span>
          <span className="text-warning truncate italic">{catatanKhusus || 'Tidak ada catatan'}</span>
        </div>
      </div>

      {/* Reward Ready Alert Box if eligible */}
      {loyalty?.isRewardReady && (
        <div className="p-2.5 rounded-lg bg-warning-bg border border-warning/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-warning shrink-0" />
            <div>
              <span className="text-xs font-black text-warning block">
                REWARD LOYALTY SIAP DIKLAIM!
              </span>
              <span className="text-[11px] text-foreground">
                Hak Hadiah: <strong className="text-foreground underline">{loyalty.rewardTitle}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleReward}
            disabled={!rewardCheckoutEnabled}
            aria-describedby={!rewardCheckoutEnabled ? "pos-reward-unavailable" : undefined}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-full font-bold text-xs transition-all flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50 ${
              isRewardClaimed
                ? 'bg-success-bg text-success border border-success/30 shadow-sm'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm'
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

      {loyalty?.isRewardReady && !rewardCheckoutEnabled && (
        <p id="pos-reward-unavailable" className="text-xs text-warning">
          Hadiah loyalty belum dapat digunakan pada transaksi kasir. Hubungi pengelola toko.
        </p>
      )}

      {/* Action Strip: 1-Click Auto Fill */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-muted-dark tabular-nums">
          Total Belanja Tercatat: <strong className="text-foreground font-mono">{formatRupiah(totalSpent)}</strong>
        </span>

        {(model !== 'Mobil' || noTelepon || catatanKhusus) && (
          <button
            type="button"
            onClick={handleApplyClick}
            disabled={applied}
            className={`min-h-[36px] px-3 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 active:scale-[0.98] ${
              applied
                ? 'bg-selected-surface border-border-active text-primary'
                : 'bg-subsurface hover:bg-surface-hover border-border text-foreground'
            }`}
          >
            {applied ? (
              <>
                <CheckCircle2 size={13} className="text-primary" />
                <span>Data Profil Diterapkan!</span>
              </>
            ) : (
              <>
                <UserCheck size={13} className="text-primary" />
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
