import React, { Suspense, lazy } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { getTenantFeatures, BUSINESS_TYPES } from '../../utils/businessCapabilities.js'
import CafePOSPage from './CafePOSPage.jsx'
import CarwashPOSPage from './CarwashPOSPage.jsx'
import HybridPOSPage from './HybridPOSPage.jsx'

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

  if (posType === BUSINESS_TYPES.CAFE) {
    return <CafePOSPage />
  }

  if (posType === BUSINESS_TYPES.CARWASH) {
    return <CarwashPOSPage />
  }

  // Default atau HYBRID (Sistem Estafet Terintegrasi)
  return <HybridPOSPage />
}

export default POSDispatcher
