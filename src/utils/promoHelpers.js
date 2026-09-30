/**
 * Helper logika bisnis dan kalkulasi ROI untuk Halaman Promosi SaaS ERP
 */

export const PRICING_TIERS = {
  starter: {
    name: 'Starter Outlet',
    monthlyPrice: 199000,
    annualMonthlyPrice: 159000, // Diskon 20%
    badge: 'Cocok untuk 1 Bisnis',
    description: 'Solusi esensial untuk outlet cafe tunggal atau unit carwash mandiri.',
    features: [
      '1 Outlet / Cabang',
      'Hingga 3 Akun Kasir',
      'Kasir POS Touch-Ready Cepat',
      'Manajemen Antrean Servis',
      'Riwayat Transaksi Real-Time',
      'Dukungan Struk Thermal 58/80mm',
      'Database Cloud Hosting Termasuk',
      'Export Laporan Transaksi CSV'
    ],
    recommended: false
  },
  pro: {
    name: 'Pro Enterprise',
    monthlyPrice: 399000,
    annualMonthlyPrice: 319000, // Diskon 20%
    badge: 'Paling Populer & Best Value',
    description: 'Integrasi penuh Cafe + Carwash dengan akuntansi SAK EMKM dan CRM otomatis.',
    features: [
      'Semua Fitur Starter',
      'Multi-Bisnis (Cafe + Carwash Terpadu)',
      'Resep & Inventori Bahan Baku BOM Otomatis',
      'Peringatan Stok Kritis Gudang',
      'Buku Kas & Rekonsiliasi 3 Rekening Bank',
      'Laporan Keuangan SAK EMKM Resmi (PDF)',
      'CRM Pelanggan & WhatsApp 1-Klik',
      'Kalkulasi Komisi Kru & Kasbon Otomatis',
      'Akun Kasir & Supervisor Tak Terbatas',
      'Multi-Tenant Data Isolation'
    ],
    recommended: true
  },
  ultimate: {
    name: 'Multi-Branch Ultimate',
    monthlyPrice: 799000,
    annualMonthlyPrice: 639000, // Diskon 20%
    badge: 'Skala Multi-Outlet & Holding',
    description: 'Solusi korporasi untuk jaringan multi-cabang dengan konsolidasi grup usaha.',
    features: [
      'Semua Fitur Pro Enterprise',
      'Hingga 5 Cabang Outlet',
      'Konsolidasi Keuangan Antar Cabang',
      'Multi-Gudang & Transfer Stok Antar Cabang',
      'Hak Akses Custom & Audit Trail Penuh',
      'Prioritas Setup & Pelatihan Staf',
      'Backup Cloud Otomatis Harian',
      'Dukungan Teknis VIP 24/7'
    ],
    recommended: false
  }
}

export const HOURLY_LABOR_RATE_IDR = 25000 // Rata-rata biaya efisiensi tenaga kerja per jam

/**
 * Menghitung estimasi ROI dan penghematan dari penggunaan ERP
 * @param {Object} params
 * @param {number} params.monthlyRevenue - Omzet bulanan dalam Rupiah
 * @param {number} params.wastePercent - Estimasi kebocoran stok bahan baku (%)
 * @param {number} params.hoursSavedDaily - Jam rekap manual yang diselamatkan per hari
 * @returns {Object} Hasil kalkulasi efisiensi
 */
export const calculateROI = ({
  monthlyRevenue = 50000000,
  wastePercent = 5,
  hoursSavedDaily = 2
}) => {
  const safeRevenue = Math.max(0, Number(monthlyRevenue) || 0)
  const safeWaste = Math.max(0, Math.min(50, Number(wastePercent) || 0))
  const safeHours = Math.max(0, Math.min(24, Number(hoursSavedDaily) || 0))

  // Penghematan dari eliminasi kebocoran stok
  const monthlyWasteSavings = Math.round(safeRevenue * (safeWaste / 100))

  // Penghematan dari otomatisasi jam rekap manual kasir/owner (30 hari operasional)
  const monthlyHoursSaved = safeHours * 30
  const monthlyLaborSavings = Math.round(monthlyHoursSaved * HOURLY_LABOR_RATE_IDR)

  // Total penghematan
  const totalMonthlySavings = monthlyWasteSavings + monthlyLaborSavings
  const totalAnnualSavings = totalMonthlySavings * 12

  // Perbandingan terhadap biaya paket Pro Enterprise
  const proMonthlyCost = PRICING_TIERS.pro.monthlyPrice
  const netMonthlyBenefit = totalMonthlySavings - proMonthlyCost
  const roiMultiplier = proMonthlyCost > 0 ? (totalMonthlySavings / proMonthlyCost).toFixed(1) : '0'

  return {
    monthlyWasteSavings,
    monthlyHoursSaved,
    monthlyLaborSavings,
    totalMonthlySavings,
    totalAnnualSavings,
    netMonthlyBenefit,
    roiMultiplier: Number(roiMultiplier)
  }
}
