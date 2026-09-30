/**
 * Helper pemetaan kategori presisi
 * Menjamin kecocokan kategori secara ketat (strict), dengan normalisasi case-insensitive
 * dan pemisahan eksplisit antara Kopi/Coffee dan Non-Coffee/Teh.
 */
export const normalizeCategory = (cat) => {
  return String(cat || '').trim().toLowerCase()
}

export const isCategoryMatch = (itemCat, selectedCat) => {
  const normSelected = normalizeCategory(selectedCat)
  if (!normSelected || normSelected === 'semua' || normSelected === 'all') return true

  const normItem = normalizeCategory(itemCat)
  if (!normItem) return false

  // 1. Exact match (case-insensitive & trimmed)
  if (normItem === normSelected) return true

  // 2. Deteksi grup Kopi vs Non-Coffee
  const isSelectedNonCoffee = normSelected.includes('non-coffee') || normSelected.includes('non coffee') || (normSelected.includes('teh') && !normSelected.includes('kopi'))
  const isItemNonCoffee = normItem.includes('non-coffee') || normItem.includes('non coffee') || (normItem.includes('teh') && !normItem.includes('kopi'))

  const isSelectedCoffee = !isSelectedNonCoffee && (normSelected.includes('kopi') || normSelected.includes('coffee'))
  const isItemCoffee = !isItemNonCoffee && (normItem.includes('kopi') || normItem.includes('coffee'))

  // Proteksi Isolasi Keras: Kopi vs Non-Coffee tidak boleh saling mencemari
  if (isSelectedCoffee && isItemNonCoffee) return false
  if (isSelectedNonCoffee && isItemCoffee) return false

  if (isSelectedCoffee && isItemCoffee) return true
  if (isSelectedNonCoffee && isItemNonCoffee) return true

  // 3. Makanan Berat
  if (normSelected.includes('makanan berat') || normSelected === 'makanan') {
    return normItem.includes('makanan berat') || normItem === 'makanan'
  }

  // 4. Camilan / Snack
  if (normSelected.includes('camilan') || normSelected.includes('snack')) {
    return normItem.includes('camilan') || normItem.includes('snack')
  }

  // 5. Dessert / Pastry
  if (normSelected.includes('dessert') || normSelected.includes('pastry')) {
    return normItem.includes('dessert') || normItem.includes('pastry')
  }

  // 6. Jus / Smoothies
  if (normSelected.includes('jus') || normSelected.includes('smoothies')) {
    return normItem.includes('jus') || normItem.includes('smoothies')
  }

  return false
}
