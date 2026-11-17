/**
 * HPP & Margin Calculator for RelayPOS (Cafe & F&B Menu Management)
 * Handles recipe unit conversion, food cost breakdown, overhead allocation,
 * and margin simulation according to standard F&B cost accounting.
 */

/**
 * Mengonversi harga satuan bahan baku dari satuan stok ke satuan resep
 * Contoh: Stok Rp 200.000 / kg -> Resep gram -> Rp 200 / gram
 */
export const calculateIngredientCost = (stockItem, recipeQty, recipeUnit) => {
  const qty = parseFloat(recipeQty) || 0
  if (!stockItem || qty <= 0) {
    return {
      unitCost: 0,
      subtotalCost: 0,
      isStockPriceZero: true
    }
  }

  const baseCost = parseFloat(stockItem.harga_satuan || stockItem.harga_beli || 0)
  if (baseCost <= 0) {
    return {
      unitCost: 0,
      subtotalCost: 0,
      isStockPriceZero: true
    }
  }

  const sUnit = (stockItem.satuan || '').trim().toLowerCase()
  const rUnit = (recipeUnit || stockItem.satuan || '').trim().toLowerCase()

  let unitCost = baseCost

  if (sUnit !== rUnit) {
    // 1. Berat: kg vs gram / gr / g
    if ((sUnit === 'kg' || sUnit === 'kilogram') && (rUnit === 'gram' || rUnit === 'gr' || rUnit === 'g')) {
      unitCost = baseCost / 1000
    } else if ((sUnit === 'gram' || sUnit === 'gr' || sUnit === 'g') && (rUnit === 'kg' || rUnit === 'kilogram')) {
      unitCost = baseCost * 1000
    }
    // 2. Volume: liter / ltr / l vs ml / mililiter
    else if ((sUnit === 'liter' || sUnit === 'ltr' || sUnit === 'l') && (rUnit === 'ml' || rUnit === 'mililiter')) {
      unitCost = baseCost / 1000
    } else if ((sUnit === 'ml' || sUnit === 'mililiter') && (rUnit === 'liter' || rUnit === 'ltr' || rUnit === 'l')) {
      unitCost = baseCost * 1000
    }
    // 3. Ons (1 ons = 100 gram)
    else if (sUnit === 'kg' && rUnit === 'ons') {
      unitCost = baseCost / 10
    } else if (sUnit === 'ons' && (rUnit === 'gram' || rUnit === 'gr' || rUnit === 'g')) {
      unitCost = baseCost / 100
    }
  }

  const subtotalCost = Math.round(qty * unitCost * 100) / 100

  return {
    unitCost,
    subtotalCost,
    isStockPriceZero: false
  }
}

/**
 * Menghitung Total HPP suatu menu dari daftar bahan baku resep + biaya packaging & overhead
 */
export const calculateMenuHpp = ({
  recipeList = [],
  stockItems = [],
  packagingCost = 0,
  overheadCost = 0
}) => {
  const safePackaging = Math.max(0, parseFloat(packagingCost) || 0)
  const safeOverhead = Math.max(0, parseFloat(overheadCost) || 0)

  let foodCost = 0
  let hasMissingPrices = false

  const breakdown = (recipeList || []).map(r => {
    const matchedStock = (stockItems || []).find(b => 
      b.nama_bahan === r.nama_bahan ||
      b.nama_produk === r.nama_bahan ||
      (r.id_bahan_baku && (b.id_bahan_baku === r.id_bahan_baku || b.id === r.id_bahan_baku))
    )

    const costResult = calculateIngredientCost(matchedStock, r.jumlah_dibutuhkan, r.satuan)
    if (costResult.isStockPriceZero) {
      hasMissingPrices = true
    }

    foodCost += costResult.subtotalCost

    return {
      nama_bahan: r.nama_bahan,
      jumlah_dibutuhkan: r.jumlah_dibutuhkan,
      satuan: r.satuan,
      stockSatuan: matchedStock?.satuan || r.satuan,
      unitCost: costResult.unitCost,
      subtotalCost: costResult.subtotalCost,
      isStockPriceZero: costResult.isStockPriceZero,
      stockName: matchedStock?.nama_produk || matchedStock?.nama_bahan || r.nama_bahan
    }
  })

  foodCost = Math.round(foodCost)
  const totalHpp = Math.round(foodCost + safePackaging + safeOverhead)

  return {
    foodCost,
    packagingCost: safePackaging,
    overheadCost: safeOverhead,
    totalHpp,
    breakdown,
    hasMissingPrices
  }
}

/**
 * Mensimulasikan Margin, Gross Profit, Food Cost %, dan Rekomendasi Harga Jual
 */
export const calculateMarginSimulation = ({
  sellingPrice = 0,
  totalHpp = 0,
  targetMargin = 60
}) => {
  const price = Math.max(0, parseFloat(sellingPrice) || 0)
  const hpp = Math.max(0, parseFloat(totalHpp) || 0)
  const marginGoal = Math.max(0, Math.min(99, parseFloat(targetMargin) || 60))

  const grossProfit = price - hpp
  const marginPercent = price > 0 ? Math.round((grossProfit / price) * 1000) / 10 : 0
  const foodCostPercent = price > 0 ? Math.round((hpp / price) * 1000) / 10 : 0

  // Rekomendasi Harga Jual: Total HPP / (1 - Target Margin %)
  // Dibulatkan ke atas ke kelipatan 500 (standar pecahan uang tunai Indonesia)
  let recommendedPrice = 0
  if (hpp > 0 && marginGoal < 100) {
    const rawTarget = hpp / (1 - (marginGoal / 100))
    recommendedPrice = Math.ceil(rawTarget / 500) * 500
  }

  let marginStatus = 'EMPTY'
  if (price > 0) {
    if (grossProfit < 0) {
      marginStatus = 'LOSS'
    } else if (marginPercent < 30) {
      marginStatus = 'LOW'
    } else if (marginPercent < 60) {
      marginStatus = 'MODERATE'
    } else {
      marginStatus = 'HEALTHY'
    }
  }

  return {
    grossProfit,
    marginPercent,
    foodCostPercent,
    recommendedPrice,
    marginStatus
  }
}
