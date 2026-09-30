/**
 * Business Model Capabilities & Feature Gating
 * Menentukan modul, navigasi, dan fitur yang aktif berdasarkan model usaha tenant:
 * 1. 'CAFE' (Murni Cafe / F&B & Retail)
 * 2. 'CARWASH' (Murni Carwash, Salon & Detailing Kendaraan)
 * 3. 'HYBRID' (Carwash + Cafe & Resto dalam 1 ekosistem estafet)
 */

export const BUSINESS_TYPES = {
  CAFE: 'CAFE',
  CARWASH: 'CARWASH',
  HYBRID: 'HYBRID'
}

export const getTenantFeatures = (businessType = 'HYBRID') => {
  const normType = String(businessType || 'HYBRID').toUpperCase()
  const isCafe = normType === BUSINESS_TYPES.CAFE
  const isCarwash = normType === BUSINESS_TYPES.CARWASH
  const isHybrid = normType === BUSINESS_TYPES.HYBRID || (!isCafe && !isCarwash)

  return {
    businessType: isCafe ? 'CAFE' : isCarwash ? 'CARWASH' : 'HYBRID',
    isCafeOnly: isCafe,
    isCarwashOnly: isCarwash,
    isHybrid: isHybrid,

    // Modul & Fitur Khusus Carwash
    hasCarwash: isCarwash || isHybrid,
    hasQueue: isCarwash || isHybrid,
    hasPlateTracking: isCarwash || isHybrid,
    hasCrewCommission: isCarwash || isHybrid,
    hasCarwashPackages: isCarwash || isHybrid,
    hasCarwashWarehouse: isCarwash || isHybrid,

    // Modul & Fitur Khusus Cafe / F&B
    hasCafe: isCafe || isHybrid,
    hasMenuCatalog: isCafe || isHybrid,
    hasRecipeBOM: isCafe || isHybrid,
    hasCafeWarehouse: isCafe || isHybrid,
    hasTableManagement: isCafe || isHybrid,

    // Modul CRM (Khusus Kendaraan / Jasa Servis: Carwash & Hybrid)
    hasCRM: isCarwash || isHybrid,

    // Modul Umum & Retail (Aktif di Semua Model)
    hasMerchandise: true,
    hasRetailWarehouse: true,
    hasFinanceCashflow: true,
    hasDoubleEntryLedger: true,
    hasMultiWarehouse: true,
  }
}
