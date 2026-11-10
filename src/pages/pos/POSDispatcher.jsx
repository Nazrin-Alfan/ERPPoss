import React, { Suspense, lazy } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { getTenantFeatures, BUSINESS_TYPES } from '../../utils/businessCapabilities.js'

const CafePOSPage = lazy(() => import('./CafePOSPage.jsx'))
const CarwashPOSPage = lazy(() => import('./CarwashPOSPage.jsx'))
const HybridPOSPage = lazy(() => import('./HybridPOSPage.jsx'))

export const getPOSType = (businessType) => {
  const features = getTenantFeatures(businessType)
  if (features.isCafeOnly) return BUSINESS_TYPES.CAFE
  if (features.isCarwashOnly) return BUSINESS_TYPES.CARWASH
  return BUSINESS_TYPES.HYBRID
}

export const POSDispatcher = ({ overrideType = null }) => {
  const { activeTenant } = useAuth()
  const businessType = overrideType || activeTenant?.business_type
  const posType = getPOSType(businessType)

  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center text-xs text-slate-400">Memuat Ruang Kasir...</div>}>
      {posType === BUSINESS_TYPES.CAFE ? (
        <CafePOSPage />
      ) : posType === BUSINESS_TYPES.CARWASH ? (
        <CarwashPOSPage />
      ) : (
        <HybridPOSPage />
      )}
    </Suspense>
  )
}

export default POSDispatcher
