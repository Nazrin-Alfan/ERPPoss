/**
 * Centralized Transaction, Status, and Payment Constants for RelayPOS SaaS ERP
 */

export const PAYMENT_METHODS = {
  CASH: 'CASH',
  QRIS: 'QRIS',
  TRANSFER: 'TRANSFER',
  DEBIT: 'DEBIT',
}

export const PAYMENT_METHOD_ACCOUNTS = {
  [PAYMENT_METHODS.CASH]: 'acc_1001', // SALDO CASH
  [PAYMENT_METHODS.QRIS]: 'acc_1002', // SALDO REKENING Y / QRIS
  [PAYMENT_METHODS.TRANSFER]: 'acc_1002', // SALDO REKENING Y / TRANSFER
  [PAYMENT_METHODS.DEBIT]: 'acc_1002', // SALDO REKENING Y / EDC
}

export const TRANSACTION_STATUS = {
  ANTRI: 'Antri',
  PROSES: 'Proses',
  SELESAI: 'Selesai',
  BATAL: 'Batal',
  PENDING: 'Pending',
}

export const ORDER_STATUS = {
  SUBMITTED: 'Submitted',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export const EXPENSE_CATEGORIES = {
  BAHAN_BAKU: 'Bahan Baku',
  OPERASIONAL: 'Operasional',
  GAJI: 'Gaji / Komisi',
  CASBON: 'Casbon',
  MAINTENANCE: 'Maintenance / Servis',
  MARKETING: 'Marketing / Promosi',
  LAINNYA: 'Lain-lain',
}

export const MERCHANDISE_CATEGORIES = [
  'MERCHANDISE',
  'Merchandise',
  'Parfum Mobil',
  'Lap & Perawatan',
  'Aksesoris & Detailing',
  'Chemical Retail',
  'Snack & Minuman Ringan',
]

/**
 * Checks if a given category is a merchandise retail category
 */
export function isMerchandiseCategory(categoryName, subCategoryName) {
  if (!categoryName && !subCategoryName) return false
  const cat = (categoryName || '').trim()
  const sub = (subCategoryName || '').trim()
  return (
    MERCHANDISE_CATEGORIES.includes(cat) ||
    MERCHANDISE_CATEGORIES.includes(sub) ||
    cat.toLowerCase() === 'merchandise' ||
    sub.toLowerCase() === 'merchandise'
  )
}

/**
 * Resolves the Chart of Accounts (COA) account_id for a given payment method
 */
export function resolveAccountForPaymentMethod(method, masterPaymentMethods = []) {
  if (!method) return 'acc_1001'
  
  // 1. Cek dari master payment methods jika ada account_id terdaftar
  if (Array.isArray(masterPaymentMethods) && masterPaymentMethods.length > 0) {
    const found = masterPaymentMethods.find(
      (m) => m && (m.nama?.toUpperCase() === String(method).toUpperCase() || m.id === method)
    )
    if (found && found.account_id) {
      return found.account_id
    }
  }

  // 2. Fallback berdasarkan mapping konstanta
  const m = String(method).trim().toUpperCase()
  if (m === PAYMENT_METHODS.QRIS || m === PAYMENT_METHODS.TRANSFER || m === PAYMENT_METHODS.DEBIT || m === 'BANK' || m === 'EDC') {
    return 'acc_1002'
  }
  if (m === 'TEMPO' || m === 'HUTANG' || m === 'CREDIT') {
    return 'acc_2001'
  }
  return 'acc_1001'
}
