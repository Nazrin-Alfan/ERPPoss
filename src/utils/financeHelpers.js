import { generateUUID } from './helpers.js'

export const normalizeCategory = (cat) => {
  if (!cat || typeof cat !== 'string') return ''
  const trimmed = cat.trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()

  if (lower === 'operasional') return 'Operasional'
  if (lower === 'bahan baku' || lower === 'bahan_baku') return 'Bahan Baku'
  if (lower === 'sewa') return 'Sewa'
  if (lower === 'casbon') return 'Casbon'
  if (lower.startsWith('casbon -')) {
    return 'Casbon - ' + trimmed.substring(8).trim()
  }
  if (lower === 'ambil uang paketan') return 'Ambil Uang Paketan'
  if (lower === 'barang') return 'Barang'
  if (lower === 'lain-lain' || lower === 'lain lain' || lower === 'lainnya') return 'Lain-lain'
  if (lower === 'modal awal' || lower === 'modal') return 'Modal Awal'
  if (lower === 'pemasukan lain-lain' || lower === 'pemasukan lain') return 'Pemasukan Lain-lain'
  if (lower === 'omzet penjualan' || lower === 'omset' || lower === 'omzet' || lower === 'omset harian' || lower === 'omzet harian') return 'Omzet Penjualan'
  if (lower === 'gaji karyawan' || lower === 'gaji') return 'Gaji Karyawan'

  const acronyms = { 'f&b': 'F&B', 'pam': 'PAM', 'atk': 'ATK', 'qris': 'QRIS', 'pos': 'POS', 'hpp': 'HPP', 'wifi': 'WiFi' }
  return trimmed
    .split(/\s+/)
    .map(word => {
      const wLow = word.toLowerCase()
      if (acronyms[wLow]) return acronyms[wLow]
      if (wLow.startsWith('(') && wLow.endsWith(')') && acronyms[wLow.slice(1, -1)]) {
        return `(${acronyms[wLow.slice(1, -1)]})`
      }
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

export const normalizeJenis = (jenis) => {
  if (!jenis || typeof jenis !== 'string') return ''
  const trimmed = jenis.trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()

  if (lower === 'pengeluaran cafe' || lower === 'cafe') return 'Pengeluaran Cafe'
  if (lower === 'pengeluaran carwash' || lower === 'carwash') return 'Pengeluaran Carwash'
  if (lower === 'pengeluaran bersama' || lower === 'bersama') return 'Pengeluaran Bersama'
  if (lower === 'pengeluaran') return 'Pengeluaran'
  if (lower === 'operasional') return 'Operasional'
  if (lower === 'casbon') return 'Casbon'
  if (lower === 'pemasukan') return 'Pemasukan'
  if (lower === 'pemasukan cafe') return 'Pemasukan Cafe'
  if (lower === 'pemasukan carwash') return 'Pemasukan Carwash'
  if (lower === 'pemasukan lain-lain' || lower === 'pemasukan lain') return 'Pemasukan Lain-lain'
  if (lower === 'pindah' || lower === 'pindah saldo' || lower === 'transfer') return 'Pindah'

  return trimmed
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export const validateExpenseForm = (form, barangMasukList) => {
  const totalVal = parseFloat(form.total_harga)
  if (isNaN(totalVal) || totalVal <= 0) {
    return { isValid: false, error: 'Total harga pengeluaran harus lebih besar dari 0.' }
  }
  const normKat = normalizeCategory(form.kategori)
  if (normKat === 'Bahan Baku' && (!barangMasukList || barangMasukList.length === 0)) {
    return { isValid: false, error: 'Daftar barang masuk/restok wajib diisi untuk kategori Bahan Baku.' }
  }
  return { isValid: true }
}

export const formatExpensePayload = ({
  form,
  barangMasukList,
  stokBahan,
  newCfId,
  todayDate,
  timestamp
}) => {
  const totalVal = parseFloat(form.total_harga)
  const normKat = normalizeCategory(form.kategori || 'Operasional')
  const normJenis = normalizeJenis(form.jenis || 'Pengeluaran')
  const isBahanBaku = normKat === 'Bahan Baku' && barangMasukList && barangMasukList.length > 0
  const txDate = form.tanggal || todayDate

  const cashflow = {
    id_cashflow: newCfId,
    id_sumber: null,
    tanggal: txDate,
    keterangan_transaksi: form.keterangan,
    jenis: normJenis,
    kategori: normKat,
    pemasukan: 0,
    pengeluaran: totalVal,
    pos: form.pos,
    apakah_stok: isBahanBaku ? 'Ya' : 'Tidak',
    qty: isBahanBaku ? barangMasukList.reduce((sum, item) => sum + parseFloat(item.jumlah || 0), 0) : 0,
    created_at: timestamp
  }

  const details = isBahanBaku
    ? barangMasukList.map(item => {
        const matchingBahan = stokBahan.find(b => b.id_bahan_baku === item.id_bahan_baku || b.nama_bahan === item.id_bahan_baku || b.nama_produk === item.id_bahan_baku)
        return {
          id_masuk: generateUUID(),
          id_pengeluaran: null,
          id_cashflow: newCfId,
          id_bahan_baku: item.id_bahan_baku,
          tanggal: txDate,
          nama_produk: matchingBahan ? (matchingBahan.nama_produk || matchingBahan.nama_bahan) : item.id_bahan_baku,
          jumlah_masuk: parseFloat(item.jumlah) || 0,
          harga_satuan: parseFloat(item.harga_satuan) || 0
        }
      })
    : []

  return { cashflow, details }
}

export const validateIncomeForm = (form) => {
  const nominalVal = parseFloat(form.nominal)
  if (!form.keterangan || !form.keterangan.trim()) {
    return { isValid: false, error: 'Keterangan pemasukan wajib diisi.' }
  }
  if (isNaN(nominalVal) || nominalVal <= 0) {
    return { isValid: false, error: 'Nominal pemasukan harus lebih besar dari 0.' }
  }
  return { isValid: true }
}

export const formatIncomePayload = ({ form, newCfId, todayDate, timestamp }) => {
  const nominalVal = parseFloat(form.nominal)
  return {
    id_cashflow: newCfId,
    id_sumber: null,
    tanggal: form.tanggal || todayDate,
    keterangan_transaksi: form.keterangan,
    jenis: normalizeJenis(form.jenis || 'Pemasukan'),
    kategori: normalizeCategory(form.kategori || 'Pemasukan Lain-lain'),
    pemasukan: nominalVal,
    pengeluaran: 0,
    pos: form.pos,
    created_at: timestamp
  }
}

export const validatePosExpenseForm = (form) => {
  const nominalVal = parseFloat(form.nominal)
  const normKat = normalizeCategory(form.kategori)
  if (['Casbon', 'Ambil Uang Paketan'].includes(normKat) && (!form.karyawan || !form.karyawan.trim())) {
    return { isValid: false, error: 'Pilih karyawan penerima terlebih dahulu.' }
  }
  if (!form.keterangan || !form.keterangan.trim()) {
    return { isValid: false, error: 'Keterangan pengeluaran wajib diisi.' }
  }
  if (isNaN(nominalVal) || nominalVal <= 0) {
    return { isValid: false, error: 'Nominal pengeluaran harus lebih besar dari 0.' }
  }
  return { isValid: true }
}

export const formatPosExpensePayload = ({ form, todayDate, currentTime, newExpId }) => {
  const nominalVal = parseFloat(form.nominal)
  const normKat = normalizeCategory(form.kategori || 'Operasional')
  const isCasbon = normKat === 'Casbon'
  const isPaketan = normKat === 'Ambil Uang Paketan'
  const isTukarUang =
    normKat.toLowerCase().includes('tukar') ||
    normKat.toLowerCase().includes('pindah') ||
    (form.keterangan || '').toLowerCase().includes('tukar uang') ||
    (form.keterangan || '').toLowerCase().includes('keluar uang cash') ||
    (form.keterangan || '').toLowerCase().includes('tukar cash')
  const isEmployeeRelated = isCasbon || isPaketan
  const jenisVal = isCasbon
    ? 'Casbon'
    : isPaketan
    ? 'Ambil Uang Paketan'
    : isTukarUang
    ? 'Pindah'
    : normalizeJenis(form.jenis || `Pengeluaran ${form.unit || 'Cafe'}`)
  
  const rawItemId = form.id_barang || form.id_bahan_baku || ''
  const hasRawMaterial = Boolean(rawItemId)
  const qtyVal = parseFloat(form.qty || 0)

  const res = {
    id_pengeluaran: newExpId,
    tanggal: form.tanggal || todayDate,
    jam: form.jam || currentTime,
    jenis: jenisVal,
    kategori: isEmployeeRelated ? `${normKat} - ${form.karyawan}` : normKat,
    nominal: nominalVal,
    nama_pengeluaran: isEmployeeRelated ? `${normKat} ${form.karyawan} (${form.keterangan || 'Tanpa catatan'})` : form.keterangan,
    apakah_stok: hasRawMaterial ? 'Ya' : 'Tidak',
    id_bahan_baku: rawItemId,
    qty: qtyVal
  }

  if (form.id_barang) {
    res.id_barang = form.id_barang
  }

  return res
}

export const validateEditCashflowForm = (form) => {
  const pemasukanVal = parseFloat(form.pemasukan || 0)
  const pengeluaranVal = parseFloat(form.pengeluaran || 0)
  if (!form.keterangan_transaksi || !form.keterangan_transaksi.trim()) {
    return { isValid: false, error: 'Keterangan transaksi wajib diisi.' }
  }
  if (pemasukanVal <= 0 && pengeluaranVal <= 0) {
    return { isValid: false, error: 'Nominal pemasukan atau pengeluaran harus lebih besar dari 0.' }
  }
  return { isValid: true }
}

export const generateCSVString = (headers, rows) => {
  const escapeCell = (cell) => {
    if (cell === null || cell === undefined) return '""'
    const str = String(cell).replace(/"/g, '""')
    return `"${str}"`
  }

  const headerLine = headers.map(h => escapeCell(h.label)).join(',')
  const rowLines = rows.map(row => {
    return headers.map(h => {
      const val = typeof h.accessor === 'function' ? h.accessor(row) : row[h.key]
      return escapeCell(val)
    }).join(',')
  })

  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n')
}

export const downloadCSV = (csvContent, fileName) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', fileName.endsWith('.csv') ? fileName : `${fileName}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const isPindahSaldo = (item) => {
  if (!item) return false
  const j = String(item.jenis || '').toLowerCase().trim()
  const k = String(item.kategori || '').toLowerCase().trim()
  const ket = String(item.keterangan_transaksi || item.keterangan || item.nama_pengeluaran || '').toLowerCase().trim()

  // Jika transaksi adalah biaya admin / fee penukaran uang, ini adalah pendapatan riil toko (bukan pindah saldo)
  if (ket.includes('biaya admin') || ket.includes('admin fee') || ket.includes('fee tukar') || k.includes('admin fee')) {
    return false
  }

  return (
    j.includes('pindah') ||
    k.includes('pindah') ||
    j.includes('transfer saldo') ||
    k.includes('transfer saldo') ||
    ket.includes('pindah saldo') ||
    ket.includes('transfer saldo') ||
    ket.includes('mutasi saldo') ||
    k.includes('tukar uang') ||
    k.includes('tukar cash') ||
    ket.includes('tukar uang') ||
    ket.includes('tukar cash') ||
    ket.includes('keluar uang cash') ||
    ket.includes('tarik tunai') ||
    ket.includes('lebih qris')
  )
}

export const getLockedCategoriesForJenis = (jenis, masterCategories = [], customKategoriList = [], isIncome = false) => {
  const normJenis = normalizeJenis(jenis || '')
  const map = new Map()

  // 1. Filter dari Master Categories Database yang terkunci ke jenis terpilih
  if (masterCategories && Array.isArray(masterCategories)) {
    masterCategories
      .filter(c => {
        if (c.is_active === false) return false
        if (isIncome && c.tipe_arus !== 'PEMASUKAN') return false
        if (!isIncome && c.tipe_arus === 'PEMASUKAN') return false

        const cJenis = normalizeJenis(c.jenis || '')
        if (!normJenis) return true

        // Cocokkan jenis spesifik
        if (cJenis.toLowerCase() === normJenis.toLowerCase()) return true

        // Relasi saling dukung untuk Bersama & Operasional
        if (
          (normJenis.toLowerCase().includes('bersama') || normJenis.toLowerCase() === 'operasional') &&
          (cJenis.toLowerCase().includes('bersama') || cJenis.toLowerCase() === 'operasional')
        ) {
          return true
        }

        return false
      })
      .forEach(c => {
        const norm = normalizeCategory(c.nama_kategori)
        if (norm) map.set(norm.toLowerCase(), norm)
      })
  }

  // 2. Default standard categories jika di DB belum ada mapping untuk jenis ini
  if (map.size === 0) {
    if (isIncome) {
      if (normJenis.toLowerCase().includes('cafe')) {
        ['Omzet Penjualan F&B', 'Penjualan Cafe', 'Pemasukan Lain-lain'].forEach(k => map.set(k.toLowerCase(), k))
      } else if (normJenis.toLowerCase().includes('carwash')) {
        ['Omzet Penjualan Cuci', 'Penjualan Carwash', 'Pemasukan Lain-lain'].forEach(k => map.set(k.toLowerCase(), k))
      } else {
        ['Omzet Penjualan', 'Pendapatan Sewa Tenant', 'Suntikan Modal Pemilik', 'Pelunasan Casbon', 'Pemasukan Lain-lain'].forEach(k => map.set(k.toLowerCase(), k))
      }
    } else {
      if (normJenis === 'Pengeluaran Cafe') {
        ['Bahan Baku F&B', 'Listrik Cafe', 'Operasional Cafe', 'Servis Mesin Cafe', 'Bahan Baku', 'Operasional'].forEach(k => map.set(k.toLowerCase(), k))
      } else if (normJenis === 'Pengeluaran Carwash') {
        ['Bahan Cuci & Chemical', 'Listrik Carwash', 'Air PAM & Perawatan Mesin Air', 'Servis Hidrolik & Kompresor', 'Perlengkapan Cuci Mobil', 'Operasional'].forEach(k => map.set(k.toLowerCase(), k))
      } else if (normJenis === 'Pengeluaran Bersama') {
        ['Sewa Tempat Usaha (Bang Awal)', 'Gaji Karyawan Tetap & Leader', 'Listrik, Air & Utilitas', 'Biaya Admin Bank / QRIS', 'Casbon Karyawan'].forEach(k => map.set(k.toLowerCase(), k))
      } else if (normJenis === 'Casbon') {
        ['Casbon Karyawan', 'Casbon'].forEach(k => map.set(k.toLowerCase(), k))
      } else if (normJenis === 'Operasional') {
        ['Operasional Cafe', 'Operasional Carwash', 'Operasional Bersama', 'Listrik, Air & Utilitas', 'Sewa', 'Lain-lain'].forEach(k => map.set(k.toLowerCase(), k))
      } else {
        ['Operasional', 'Bahan Baku', 'Sewa', 'Casbon', 'Lain-lain'].forEach(k => map.set(k.toLowerCase(), k))
      }
    }
  }

  // 3. Tambahkan custom kategori jika ada
  if (customKategoriList && Array.isArray(customKategoriList)) {
    customKategoriList.forEach(k => {
      const norm = normalizeCategory(k)
      if (norm && !map.has(norm.toLowerCase())) map.set(norm.toLowerCase(), norm)
    })
  }

  return Array.from(map.values())
}

