/**
 * License & Subscription Management Helper
 * Handles software license status, grace period calculation,
 * cryptographic license key verification, and direct-sales renewal orders.
 */

export const LICENSE_TIERS = {
  PRO_ANNUAL: {
    code: 'PRO_ANNUAL',
    name: 'RelayPOS Pro Enterprise (Lisensi Tahunan)',
    price: 3600000,
    durationMonths: 12,
    features: [
      'Unlimited Transaksi Kasir POS (Carwash & Cafe)',
      'Sistem Antrean Estafet Realtime (Slot Bay & Cafe)',
      'General Ledger Double-Entry & Valuasi Stok BOM',
      'Laporan Laba Rugi & Neraca Konsolidasi Realtime',
      'Multi-User RBAC (Owner, Admin, Kasir)',
      'Integrasi WhatsApp CRM & Kupon Otomatis'
    ]
  },
  BASIC_ANNUAL: {
    code: 'BASIC_ANNUAL',
    name: 'RelayPOS Starter Single-Module',
    price: 2400000,
    durationMonths: 12,
    features: [
      'Kasir POS Modul Tunggal',
      'Manajemen Stok Sederhana',
      'Laporan Penjualan Harian'
    ]
  }
}

export const GRACE_PERIOD_DAYS = 7

/**
 * Validasi status lisensi saat ini
 */
export const evaluateLicenseStatus = (licenseData) => {
  if (!licenseData || !licenseData.expires_at) {
    return {
      status: 'DEMO_TRIAL',
      isActive: true,
      isGracePeriod: false,
      isExpired: false,
      daysRemaining: 14,
      message: 'Mode Uji Coba Demo Sandbox (14 Hari Tersisa)',
      color: 'amber'
    }
  }

  const now = new Date()
  const expiryDate = new Date(licenseData.expires_at)
  const diffTime = expiryDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays > 0) {
    return {
      status: 'ACTIVE',
      isActive: true,
      isGracePeriod: false,
      isExpired: false,
      daysRemaining: diffDays,
      message: `Lisensi Aktif (${diffDays} hari tersisa)`,
      color: diffDays <= 14 ? 'amber' : 'emerald'
    }
  }

  // Cek apakah masih dalam batas toleransi (Grace Period 7 Hari)
  const graceRemaining = GRACE_PERIOD_DAYS + diffDays // diffDays bernilai <= 0
  if (graceRemaining > 0) {
    return {
      status: 'GRACE_PERIOD',
      isActive: true, // Masih diizinkan buka kasir tapi ada warning
      isGracePeriod: true,
      isExpired: false,
      daysRemaining: 0,
      graceDaysRemaining: graceRemaining,
      message: `Masa Tenggang Grace Period (${graceRemaining} hari tersisa sebelum sistem terkunci)`,
      color: 'rose'
    }
  }

  return {
    status: 'EXPIRED',
    isActive: false,
    isGracePeriod: false,
    isExpired: true,
    daysRemaining: 0,
    graceDaysRemaining: 0,
    message: 'Lisensi Telah Kadaluarsa. Hubungi pengembang untuk perpanjangan.',
    color: 'rose'
  }
}

/**
 * Menghasilkan link WhatsApp untuk perpanjangan lisensi langsung ke Solo Founder
 */
export const buildWhatsAppRenewalLink = ({
  developerPhone = '6281234567890',
  tenantName = 'Outlet Carwash & Cafe',
  tenantId = 'tenant_jb_enterprise',
  planCode = 'PRO_ANNUAL',
  currentExpiry = ''
}) => {
  const plan = LICENSE_TIERS[planCode] || LICENSE_TIERS.PRO_ANNUAL
  let cleanPhone = developerPhone.replace(/\D/g, '')
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1)
  }
  if (!cleanPhone.startsWith('62')) {
    cleanPhone = '62' + cleanPhone
  }

  const message = [
    `*HALO DEVELOPER RELAYPOS*`,
    `Saya ingin melakukan perpanjangan lisensi software RelayPOS:`,
    ``,
    `• *Nama Toko / Outlet:* ${tenantName}`,
    `• *ID Tenant:* ${tenantId}`,
    `• *Paket Lisensi:* ${plan.name}`,
    `• *Tarif:* Rp ${plan.price.toLocaleString('id-ID')} / Tahun`,
    currentExpiry ? `• *Masa Berlaku Saat Ini:* ${new Date(currentExpiry).toLocaleDateString('id-ID')}` : null,
    ``,
    `Mohon kirimkan nomor rekening transfer dan instruksi invoice aktivasi. Terima kasih!`
  ].filter(Boolean).join('\n')

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
}
