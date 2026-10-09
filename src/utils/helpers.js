export const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export const formatRupiah = (val) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(val)
}

export const parseDateSafe = (dateStr) => {
  if (!dateStr) return new Date()
  if (dateStr instanceof Date) return dateStr

  const str = String(dateStr).trim()
  if (str.includes('T')) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) return d
  }

  const parts = str.split(/[\sT]+/)
  if (parts.length > 0) {
    const d = new Date(parts[0])
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

export const getShiftForCashier = (cashierName) => {
  if (!cashierName) return 'Shift 1'
  const name = cashierName.toUpperCase()
  if (name === 'SYAFA') return 'Shift 2'
  if (name === 'ALEXA') return 'Shift 1'
  if (name === 'VIRA') return 'Shift 1'
  
  const currentHour = new Date().getHours()
  return currentHour < 14 ? 'Shift 1' : 'Shift 2'
}

export const calculateTutupKasirRecap = ({
  receipts = [],
  expenses = [],
  carwashList = [],
  cafeList = [],
  cashierName = 'Kasir',
  todayDate,
  timestamp
}) => {
  const ts = timestamp || new Date().toISOString()
  const dateStr = todayDate || new Date().toLocaleDateString('en-CA')

  let carwashCash = 0
  let carwashQris = 0
  let cafeCash = 0
  let cafeQris = 0
  let legacyCash = 0
  let legacyQris = 0

  if (Array.isArray(receipts)) {
    receipts.forEach((s) => {
      if (s.status_bayar === 'Batal' || s.status_bayar === 'Cancelled') return

      let cwAmount = 0
      let cfAmount = 0

      // 1. Dari array joined yang melekat pada receipt
      if (Array.isArray(s.carwash) && s.carwash.length > 0) {
        cwAmount = s.carwash
          .filter((c) => c.status !== 'Batal')
          .reduce((sum, c) => sum + (parseFloat(c.harga || 0)), 0)
      }
      if (Array.isArray(s.cafe) && s.cafe.length > 0) {
        cfAmount = s.cafe
          .filter((c) => c.status !== 'Batal')
          .reduce((sum, c) => sum + (parseFloat(c.subtotal || (c.qty * c.harga_satuan) || 0)), 0)
      }

      // 2. Dari daftar terpisah carwashList dan cafeList bila dikirim
      if (cwAmount === 0 && Array.isArray(carwashList) && carwashList.length > 0) {
        cwAmount = carwashList
          .filter((c) => (c.id_struk === s.id_struk || c.struk_id === s.id_struk) && c.status !== 'Batal')
          .reduce((sum, c) => sum + (parseFloat(c.harga || 0)), 0)
      }
      if (cfAmount === 0 && Array.isArray(cafeList) && cafeList.length > 0) {
        cfAmount = cafeList
          .filter((c) => (c.id_struk === s.id_struk || c.struk_id === s.id_struk) && c.status !== 'Batal')
          .reduce((sum, c) => sum + (parseFloat(c.subtotal || (c.qty * c.harga_satuan) || 0)), 0)
      }

      // 3. Fallback bila hanya terisi tag kategori/unit
      if (cwAmount === 0 && cfAmount === 0) {
        const kat = String(s.kategori || s.jenis || '').toLowerCase()
        if (kat.includes('carwash') || kat.includes('cuci')) {
          cwAmount = parseFloat(s.total_tagihan || 0)
        } else if (kat.includes('cafe') || kat.includes('f&b') || kat.includes('resto')) {
          cfAmount = parseFloat(s.total_tagihan || 0)
        }
      }

      const totalItems = cwAmount + cfAmount
      const totalStruk = parseFloat(s.total_tagihan || 0)

      if (totalItems > 0) {
        // Terdapat rincian item (Tunggal Carwash, Tunggal Cafe, atau Hybrid)
        if (s.metode_bayar === 'CASH') {
          carwashCash += cwAmount
          cafeCash += cfAmount
        } else if (s.metode_bayar === 'QRIS' || s.metode_bayar === 'TRANSFER' || s.metode_bayar === 'DEBIT') {
          carwashQris += cwAmount
          cafeQris += cfAmount
        } else if (s.metode_bayar === 'SPLIT') {
          const cashPart = parseFloat(s.nominal_cash || 0)
          const qrisPart = parseFloat(s.nominal_qris || 0)
          const cwRatio = totalItems > 0 ? (cwAmount / totalItems) : 0
          const cfRatio = totalItems > 0 ? (cfAmount / totalItems) : 0
          carwashCash += cashPart * cwRatio
          carwashQris += qrisPart * cwRatio
          cafeCash += cashPart * cfRatio
          cafeQris += qrisPart * cfRatio
        } else {
          // Default ke Cash
          carwashCash += cwAmount
          cafeCash += cfAmount
        }
      } else if (totalStruk > 0) {
        // Struk legacy tanpa detail item
        if (s.metode_bayar === 'CASH') {
          legacyCash += totalStruk
        } else if (s.metode_bayar === 'QRIS' || s.metode_bayar === 'TRANSFER' || s.metode_bayar === 'DEBIT') {
          legacyQris += totalStruk
        } else if (s.metode_bayar === 'SPLIT') {
          legacyCash += parseFloat(s.nominal_cash || 0)
          legacyQris += parseFloat(s.nominal_qris || 0)
        } else {
          legacyCash += totalStruk
        }
      }
    })
  }

  const insertions = []

  // 1. CARWASH CASH
  if (carwashCash > 0) {
    insertions.push({
      id_cashflow: generateUUID(),
      tanggal: dateStr,
      jenis: 'pemasukan carwash',
      kategori: 'pemasukan',
      pemasukan: Math.round(carwashCash),
      pengeluaran: 0,
      pos: 'SALDO CASH',
      keterangan_transaksi: `omset cash carwash (Tutup Kasir - ${cashierName})`,
      created_at: ts
    })
  }

  // 2. CARWASH QRIS
  if (carwashQris > 0) {
    insertions.push({
      id_cashflow: generateUUID(),
      tanggal: dateStr,
      jenis: 'pemasukan carwash',
      kategori: 'pemasukan',
      pemasukan: Math.round(carwashQris),
      pengeluaran: 0,
      pos: 'SALDO REKENING Y',
      keterangan_transaksi: `omset qris carwash (Tutup Kasir - ${cashierName})`,
      created_at: ts
    })
  }

  // 3. CAFE CASH
  if (cafeCash > 0) {
    insertions.push({
      id_cashflow: generateUUID(),
      tanggal: dateStr,
      jenis: 'pemasukan cafe',
      kategori: 'pemasukan',
      pemasukan: Math.round(cafeCash),
      pengeluaran: 0,
      pos: 'SALDO CASH',
      keterangan_transaksi: `omset cash cafe (Tutup Kasir - ${cashierName})`,
      created_at: ts
    })
  }

  // 4. CAFE QRIS
  if (cafeQris > 0) {
    insertions.push({
      id_cashflow: generateUUID(),
      tanggal: dateStr,
      jenis: 'pemasukan cafe',
      kategori: 'pemasukan',
      pemasukan: Math.round(cafeQris),
      pengeluaran: 0,
      pos: 'SALDO REKENING Y',
      keterangan_transaksi: `omset qris cafe (Tutup Kasir - ${cashierName})`,
      created_at: ts
    })
  }

  // 5. LEGACY OMZET (Bila struk tidak memiliki rincian item)
  if (legacyCash > 0) {
    insertions.push({
      id_cashflow: generateUUID(),
      tanggal: dateStr,
      jenis: 'Pemasukan',
      kategori: 'Omzet Harian (CASH)',
      pemasukan: Math.round(legacyCash),
      pengeluaran: 0,
      pos: 'SALDO CASH',
      keterangan_transaksi: `Rekap Tutup Kasir (CASH) - Kasir: ${cashierName}`,
      created_at: ts
    })
  }

  if (legacyQris > 0) {
    insertions.push({
      id_cashflow: generateUUID(),
      tanggal: dateStr,
      jenis: 'Pemasukan',
      kategori: 'Omzet Harian (QRIS)',
      pemasukan: Math.round(legacyQris),
      pengeluaran: 0,
      pos: 'SALDO REKENING Y',
      keterangan_transaksi: `Rekap Tutup Kasir (QRIS) - Kasir: ${cashierName}`,
      created_at: ts
    })
  }

  // 6. EXPENSES (Bila disediakan)
  if (Array.isArray(expenses) && expenses.length > 0) {
    const totalExpense = expenses.reduce((sum, item) => sum + (parseFloat(item.nominal || item.pengeluaran || 0)), 0)
    if (totalExpense > 0) {
      insertions.push({
        id_cashflow: generateUUID(),
        tanggal: dateStr,
        jenis: 'Pengeluaran Bersama',
        kategori: 'Operasional',
        pemasukan: 0,
        pengeluaran: Math.round(totalExpense),
        pos: 'SALDO CASH',
        keterangan_transaksi: `Rekap Pengeluaran Kasir - Kasir: ${cashierName}`,
        created_at: ts
      })
    }
  }

  return insertions
}

export const calculateDailyCashierRecap = (receipts, targetDate = null) => {
  const target = targetDate || new Date().toLocaleDateString('en-CA')
  let totalCash = 0
  let totalNonCash = 0
  let cashTxCount = 0
  let nonCashTxCount = 0
  let splitTxCount = 0

  if (Array.isArray(receipts)) {
    receipts.forEach(s => {
      if (s.status_bayar === 'Batal' || s.status_bayar === 'Cancelled') return
      const sDate = s.tanggal ? String(s.tanggal).substring(0, 10) : ''
      if (target && sDate !== target) return

      const total = parseFloat(s.total_tagihan || 0)
      const cashPart = parseFloat(s.nominal_cash || 0)
      const qrisPart = parseFloat(s.nominal_qris || 0)

      if (s.metode_bayar === 'CASH') {
        totalCash += total > 0 ? total : cashPart
        cashTxCount += 1
      } else if (s.metode_bayar === 'SPLIT') {
        totalCash += cashPart
        totalNonCash += qrisPart
        splitTxCount += 1
      } else {
        // QRIS, TRANSFER, DEBIT, dll
        totalNonCash += total > 0 ? total : qrisPart
        nonCashTxCount += 1
      }
    })
  }

  const totalOmzet = totalCash + totalNonCash
  const totalTxCount = cashTxCount + nonCashTxCount + splitTxCount
  const cashPercentage = totalOmzet > 0 ? Math.round((totalCash / totalOmzet) * 100) : 0
  const nonCashPercentage = totalOmzet > 0 ? Math.round((totalNonCash / totalOmzet) * 100) : 0

  return {
    targetDate: target,
    totalCash,
    totalNonCash,
    totalOmzet,
    cashTxCount,
    nonCashTxCount,
    splitTxCount,
    totalTxCount,
    cashPercentage,
    nonCashPercentage
  }
}

