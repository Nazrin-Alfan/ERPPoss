/**
 * Helper pemetaan kategori fleksibel
 * Menjamin kecocokan kategori baik exact match, case-insensitive, maupun alias mapping
 */
export const normalizeCategory = (cat) => {
  return String(cat || '').trim().toLowerCase()
}

export const isCategoryMatch = (itemCat, selectedCat) => {
  const normSelected = normalizeCategory(selectedCat)
  if (!normSelected || normSelected === 'semua' || normSelected === 'all') return true

  const normItem = normalizeCategory(itemCat)
  if (normItem === normSelected) return true

  // Alias / Substring matching untuk variasi label Admin
  // Contoh: 'Kopi (Coffee)' vs 'Kopi' / 'Coffee'
  if (normSelected.includes('kopi') && normItem.includes('kopi')) return true
  if (normSelected.includes('coffee') && normItem.includes('coffee')) return true
  if (normSelected.includes('teh') && (normItem.includes('teh') || normItem.includes('non-coffee'))) return true
  if (normSelected.includes('makanan') && normItem.includes('makanan')) return true
  if (normSelected.includes('snack') && (normItem.includes('snack') || normItem.includes('camilan'))) return true
  if (normSelected.includes('camilan') && (normItem.includes('snack') || normItem.includes('camilan'))) return true
  if (normSelected.includes('dessert') && (normItem.includes('dessert') || normItem.includes('pastry'))) return true
  if (normSelected.includes('jus') && (normItem.includes('jus') || normItem.includes('smoothies'))) return true

  return false
}
