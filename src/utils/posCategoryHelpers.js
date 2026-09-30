/**
 * POS Category Helpers
 * Mengelola kategori katalog produk / layanan secara dinamis dari master_categories (Pengaturan Admin)
 * Digunakan oleh CafePOSPage, CarwashPOSPage, dan HybridPOSPage
 */

export const getCategoriesForPOS = ({ type = 'CAFE', masterCategories = [], items = [] }) => {
  const result = new Set()

  const isCafe = type.toUpperCase() === 'CAFE'
  const isCarwash = type.toUpperCase() === 'CARWASH'
  const isRetail = type.toUpperCase() === 'RETAIL' || type.toUpperCase() === 'MERCHANDISE'

  // 1. Ekstrak dari master_categories yang aktif dan sesuai jenis
  ;(masterCategories || []).forEach(cat => {
    if (!cat || !cat.is_active || !cat.nama_kategori) return
    const jenis = String(cat.jenis || '').toLowerCase()
    const tipeArus = String(cat.tipe_arus || '').toUpperCase()

    // Jangan masukkan kategori pengeluaran / beban operasional ke filter katalog produk/layanan
    if (tipeArus === 'PENGELUARAN' || jenis.includes('pengeluaran') || jenis.includes('beban')) {
      return
    }

    if (isCafe) {
      if (
        jenis.includes('cafe') || 
        jenis.includes('f&b') || 
        jenis.includes('menu') || 
        jenis.includes('makanan') || 
        jenis.includes('minuman')
      ) {
        result.add(cat.nama_kategori.trim())
      }
    } else if (isCarwash) {
      if (
        jenis.includes('carwash') || 
        jenis.includes('cuci') || 
        jenis.includes('detailing') || 
        jenis.includes('layanan')
      ) {
        result.add(cat.nama_kategori.trim())
      }
    } else if (isRetail) {
      if (
        jenis.includes('retail') || 
        jenis.includes('merchandise') || 
        jenis.includes('produk') || 
        jenis.includes('barang')
      ) {
        result.add(cat.nama_kategori.trim())
      }
    }
  })

  // 2. Ekstrak dari items / paket yang tersimpan di database
  ;(items || []).forEach(item => {
    if (!item) return
    const catName = item.kategori || item.sub_kategori || item.category
    if (catName && typeof catName === 'string') {
      const trimmed = catName.trim()
      const lower = trimmed.toLowerCase()
      // Skip jika bernilai generic atau bertabrakan antar sektor
      if (lower === 'all' || lower === 'semua') return
      if (isCafe && (lower === 'carwash' || lower.includes('cuci mobil'))) return
      if (isCarwash && (lower === 'cafe' || lower === 'makanan' || lower === 'minuman')) return

      result.add(trimmed)
    }
  })

  return ['SEMUA', ...Array.from(result)]
}
