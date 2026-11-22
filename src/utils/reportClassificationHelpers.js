/**
 * Shared transaction filtering and P&L expense classification helpers
 * used across Reports.jsx and Dashboard.jsx so numbers always match cleanly
 * without false-positive substring matches like "test" in "kontes" or "air" in "repair".
 */

const TEST_OR_CALIBRATION_WORD_REGEX = /\b(kalibrasi|test|testing|uji\s*coba)\b/i
const TUKAR_UANG_PHRASES = ['tukar uang', 'tarik tunai', 'tukar cash', 'lebih qris']

const PAYROLL_WORD_REGEX = /\b(gaji|upah|kasbon|casbon|payroll|komisi|pinjaman)\b/i
const UTILITIES_WORD_REGEX = /\b(listrik|pdam|wifi|internet|utilitas|pln)\b/i
const WATER_CATEGORY_REGEX = /\bair\b/i
const NON_WATER_AIR_PHRASE_REGEX = /\bair\s*(freshener|filter|con|conditioner|dry|dryer|gun)\b/i
const WATER_UTILITY_PHRASE_REGEX = /\b(tagihan\s+air|air\s+(bersih|pdam|pam|minum|galon))\b/i

export function isTestOrCancelledStruk(struk) {
  if (!struk) return false
  if (struk.is_test === true) return true
  const status = String(struk.status_bayar || '').trim().toLowerCase()
  if (status === 'batal' || status === 'cancelled') return true
  const ket = String(struk.keterangan || '')
  return TEST_OR_CALIBRATION_WORD_REGEX.test(ket)
}

export function isTukarUangStruk(struk) {
  if (!struk) return false
  const ket = String(struk.keterangan || '').toLowerCase()
  return TUKAR_UANG_PHRASES.some((phrase) => ket.includes(phrase))
}

/**
 * Classifies an expense / cashflow row into a P&L bucket using structured fields first
 * (`karyawan_id`, `jenis`, `kategori`) and whole-word matching instead of loose substrings.
 * @returns {'cafe_bahan'|'cafe_ops'|'carwash_bahan'|'carwash_ops'|'overhead_gaji'|'overhead_utilitas'|'overhead_lain'}
 */
export function classifyExpenseBucket({
  jenis = '',
  kategori = '',
  keterangan = '',
  karyawan_id = null,
  fromCashflow = false,
} = {}) {
  const jLow = String(jenis || '').toLowerCase()
  const kLow = String(kategori || '').toLowerCase()
  const descLow = String(keterangan || '').toLowerCase()

  if (jLow.includes('cafe')) {
    const isMaterial = kLow.includes('bahan') || kLow.includes('kulakan') ||
      (!fromCashflow && (descLow.includes('biji kopi') || descLow.includes('susu') || descLow.includes('sirup')))
    return isMaterial ? 'cafe_bahan' : 'cafe_ops'
  }

  if (jLow.includes('carwash')) {
    const isMaterial = kLow.includes('bahan') || kLow.includes('chemical') ||
      (!fromCashflow && (descLow.includes('shampoo') || descLow.includes('sabun') || descLow.includes('semir')))
    return isMaterial ? 'carwash_bahan' : 'carwash_ops'
  }

  // Shared / Overhead: structured employee link OR payroll/kasbon/casbon whole words
  const isPayroll = Boolean(karyawan_id) ||
    PAYROLL_WORD_REGEX.test(kategori || '') ||
    PAYROLL_WORD_REGEX.test(jenis || '') ||
    PAYROLL_WORD_REGEX.test(keterangan || '')
  if (isPayroll) {
    return 'overhead_gaji'
  }

  // Utilities: match category word 'air' (e.g. "Listrik, Air & Utilitas") or explicit utility keywords/phrases
  const isWaterCategory =
    WATER_CATEGORY_REGEX.test(kategori || '') && !NON_WATER_AIR_PHRASE_REGEX.test(kategori || '')
  const isUtilities =
    UTILITIES_WORD_REGEX.test(kategori || '') ||
    UTILITIES_WORD_REGEX.test(keterangan || '') ||
    isWaterCategory ||
    WATER_UTILITY_PHRASE_REGEX.test(keterangan || '')

  if (isUtilities) {
    return 'overhead_utilitas'
  }

  return 'overhead_lain'
}
