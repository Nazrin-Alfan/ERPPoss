/**
 * Carwash Packages & Commission Calculation Helpers
 */

export const DEFAULT_CARWASH_PACKAGES = [
  {
    id: 'pkg_cuci_biasa',
    nama_paket: 'PAKET CUCI BIASA',
    keterangan: 'Cuci bersih body luar dan vakum interior standar',
    tarif: {
      Small: { Regular: 50000, 'Body only': 35000 },
      Medium: { Regular: 55000, 'Body only': 40000 },
      Large: { Regular: 60000, 'Body only': 45000 },
      'Extra Large': { Regular: 80000, 'Body only': 80000 }
    },
    komisi_skema: 'TIERED', // 'TIERED', 'PERCENT', 'FLAT'
    komisi_value: 0,
    is_active: true
  },
  {
    id: 'pkg_kaca_bening',
    nama_paket: 'PAKET KACA BENING (CUCI + JAMUR KACA)',
    keterangan: 'Cuci reguler ditambah pembersihan jamur kaca depan/samping',
    tarif: {
      Small: { Regular: 150000, 'Body only': 135000 },
      Medium: { Regular: 155000, 'Body only': 140000 },
      Large: { Regular: 160000, 'Body only': 145000 },
      'Extra Large': { Regular: 180000, 'Body only': 180000 }
    },
    komisi_skema: 'TIERED',
    komisi_value: 0,
    is_active: true
  },
  {
    id: 'pkg_daun_talas',
    nama_paket: 'PAKET DAUN TALAS (CUCI + WAX KACA)',
    keterangan: 'Cuci reguler ditambah coating efek daun talas pada kaca',
    tarif: {
      Small: { Regular: 100000, 'Body only': 85000 },
      Medium: { Regular: 105000, 'Body only': 90000 },
      Large: { Regular: 110000, 'Body only': 95000 },
      'Extra Large': { Regular: 130000, 'Body only': 130000 }
    },
    komisi_skema: 'TIERED',
    komisi_value: 0,
    is_active: true
  },
  {
    id: 'pkg_juragan',
    nama_paket: 'PAKET JURAGAN (CUCI + JAMUR KACA + WAX KACA)',
    keterangan: 'Treatment kaca lengkap jamur + wax hydrophobic',
    tarif: {
      Small: { Regular: 200000, 'Body only': 185000 },
      Medium: { Regular: 205000, 'Body only': 190000 },
      Large: { Regular: 210000, 'Body only': 195000 },
      'Extra Large': { Regular: 230000, 'Body only': 230000 }
    },
    komisi_skema: 'TIERED',
    komisi_value: 0,
    is_active: true
  },
  {
    id: 'pkg_glow_up',
    nama_paket: 'PAKET GLOW UP (CUCI + WAX BODY)',
    keterangan: 'Cuci reguler ditambah wax kilap body mobil',
    tarif: {
      Small: { Regular: 100000, 'Body only': 85000 },
      Medium: { Regular: 110000, 'Body only': 95000 },
      Large: { Regular: 120000, 'Body only': 105000 },
      'Extra Large': { Regular: 160000, 'Body only': 160000 }
    },
    komisi_skema: 'TIERED',
    komisi_value: 0,
    is_active: true
  },
  {
    id: 'pkg_pejabat',
    nama_paket: 'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)',
    keterangan: 'Pembersihan jamur body menyeluruh ditambah wax finishing',
    tarif: {
      Small: { Regular: 180000, 'Body only': 165000 },
      Medium: { Regular: 200000, 'Body only': 185000 },
      Large: { Regular: 220000, 'Body only': 205000 },
      'Extra Large': { Regular: 300000, 'Body only': 300000 }
    },
    komisi_skema: 'TIERED',
    komisi_value: 0,
    is_active: true
  },
  {
    id: 'pkg_sultan',
    nama_paket: 'PAKET SULTAN (FULL EXTERIOR)',
    keterangan: 'Full detailing exterior kaca, body, velg, dan mesin',
    tarif: {
      Small: { Regular: 310000, 'Body only': 295000 },
      Medium: { Regular: 330000, 'Body only': 315000 },
      Large: { Regular: 350000, 'Body only': 335000 },
      'Extra Large': { Regular: 430000, 'Body only': 430000 }
    },
    komisi_skema: 'TIERED',
    komisi_value: 0,
    is_active: true
  }
]

export const DEFAULT_BASIC_WASH_PRICES = {
  Small: { Regular: 50000, 'Body only': 35000 },
  Medium: { Regular: 55000, 'Body only': 40000 },
  Large: { Regular: 60000, 'Body only': 45000 },
  'Extra Large': { Regular: 80000, 'Body only': 80000 },
  Custom: { Regular: 80000, 'Body only': 80000 }
}

/**
 * Menghitung tarif cuci mobil dan komisi kru pencuci secara dinamis
 */
export const calculateCarwashPriceAndCommission = ({
  packageItem,
  ukuran = 'Medium',
  variant = 'Regular',
  customHarga = 0,
  basicWashPrices = DEFAULT_BASIC_WASH_PRICES
}) => {
  let finalHarga = 0

  if (ukuran === 'Custom') {
    finalHarga = parseFloat(customHarga) || 0
  } else if (packageItem && packageItem.tarif) {
    const sizeData = packageItem.tarif[ukuran] || packageItem.tarif['Large'] || {}
    finalHarga = sizeData[variant] || sizeData['Regular'] || 0
  } else {
    // Fallback standard basic wash
    const sizeData = DEFAULT_BASIC_WASH_PRICES[ukuran] || DEFAULT_BASIC_WASH_PRICES['Large'] || {}
    finalHarga = sizeData[variant] || sizeData['Regular'] || 0
  }

  // Hitung Komisi Kru Pencuci berdasarkan skema paket
  const skema = (packageItem?.komisi_skema || 'TIERED').toUpperCase()
  const komisiVal = parseFloat(packageItem?.komisi_value || 0)
  let totalGaji = 0

  if (skema === 'PERCENT' && komisiVal > 0) {
    // Persentase Flat dari Total Harga Cuci
    totalGaji = Math.round(finalHarga * (komisiVal / 100))
  } else if (skema === 'FLAT' && komisiVal > 0) {
    // Nominal Flat Tetap per Kendaraan
    totalGaji = Math.min(komisiVal, finalHarga)
  } else {
    // Skema TIERED (Standar Bertingkat: 1/3 Cuci Dasar + 1/2 Treatment Tambahan)
    const basicPrices = basicWashPrices || DEFAULT_BASIC_WASH_PRICES
    const basicSize = basicPrices[ukuran] ? ukuran : 'Custom'
    const basicVar = variant === 'Body only' ? 'Body only' : 'Regular'
    const basicWashPrice = basicPrices[basicSize]?.[basicVar] || 50000

    let washPortion = basicWashPrice
    if (ukuran === 'Custom') {
      washPortion = Math.min(finalHarga, basicWashPrice)
    }
    const gajiCuci = Math.floor(washPortion / 3)
    const treatmentPrice = Math.max(0, finalHarga - washPortion)
    const gajiPaket = Math.floor(treatmentPrice / 2)

    totalGaji = gajiCuci + gajiPaket
  }

  return {
    harga: finalHarga,
    gaji_pencuci: totalGaji
  }
}
