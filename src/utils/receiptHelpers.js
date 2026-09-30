/**
 * Helper Utility for POS Receipt Management (Bukti Order & Bukti Pembayaran)
 * RelayPOS Carwash & Cafe Enterprise System
 */

export const PERMANENT_RELAYPOS_FOOTER = 'Powered by RelayPOS • Cloud Enterprise System'

export const DEFAULT_RECEIPT_CONFIG = {
  storeName: 'RELAYPOS CARWASH & CAFE',
  storeTagline: 'Professional Car Wash, Detailing & Cafe',
  storeAddress: 'Jl. Boulevard Raya Blok A No. 12',
  storePhone: '0812-3456-7890',
  storeSocial: '@relaypos.id',
  orderReceiptTitle: 'BUKTI PENERIMAAN KENDARAAN',
  orderReceiptSubtitle: 'Tanda Terima Drop-Off / Penitipan',
  orderDisclaimer: 'Simpan bukti ini sebagai tanda terima sah saat pengambilan kendaraan. Mohon tidak meninggalkan barang berharga di dalam kendaraan.',
  paymentReceiptTitle: 'STRUK BUKTI PEMBAYARAN',
  paymentReceiptSubtitle: 'Struk Resmi Transaksi Lunas',
  paymentDisclaimer: 'Terima kasih atas kepercayaan Anda. Harap periksa kembali kendaraan dan barang bawaan Anda sebelum meninggalkan area RelayPOS.',
  footerText: PERMANENT_RELAYPOS_FOOTER,
  paperWidth: '72mm', // '58mm' | '72mm' | '80mm'
  showStorePhone: true,
  showStoreAddress: true
}

let _inMemoryConfigStorage = null

const getStorageConfig = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('relaypos_receipt_config')
      if (saved) return JSON.parse(saved)
    }
  } catch {}
  return _inMemoryConfigStorage
}

const setStorageConfig = (cfg) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('relaypos_receipt_config', JSON.stringify(cfg))
    }
  } catch {}
  _inMemoryConfigStorage = cfg
}

export const clearReceiptStorageMock = () => {
  _inMemoryConfigStorage = null
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('relaypos_receipt_config')
    }
  } catch {}
}

export const getReceiptConfig = () => {
  const saved = getStorageConfig()
  if (saved) {
    return { ...DEFAULT_RECEIPT_CONFIG, ...saved }
  }
  return { ...DEFAULT_RECEIPT_CONFIG }
}

export const saveReceiptConfig = (newConfig) => {
  const current = getReceiptConfig()
  const merged = { ...current, ...newConfig }
  setStorageConfig(merged)
  return merged
}

export const formatRupiahReceipt = (val) => {
  const num = parseFloat(val) || 0
  return 'Rp ' + Math.round(num).toLocaleString('id-ID')
}

export const formatReceiptDate = (dateStr, timeStr) => {
  try {
    let d
    if (dateStr) {
      d = new Date(dateStr)
    } else {
      d = new Date()
    }

    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const time = timeStr || new Date().toTimeString().split(' ')[0]

    return `${day}/${month}/${year} ${time}`
  } catch {
    return `${dateStr || ''} ${timeStr || ''}`.trim()
  }
}

/**
 * Normalizes an Indonesian phone number to international WhatsApp format (628...)
 */
export const normalizeWhatsAppPhone = (phone) => {
  if (!phone) return ''
  let cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1)
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned
  }
  return cleaned
}

/**
 * Builds standard receipt data for Bukti Order (Drop-off / In-Progress)
 */
export const buildOrderReceiptData = (order, customConfig = null) => {
  const config = customConfig || getReceiptConfig()
  const carwashItem = order?.carwash?.[0] || {}
  const items = []

  // Carwash items
  if (order?.carwash && order.carwash.length > 0) {
    order.carwash.forEach(cw => {
      items.push({
        type: 'CARWASH',
        name: `${cw.paket || 'Cuci Mobil'} (${cw.ukuran || 'Reguler'})`,
        detail: cw.variant && cw.variant !== 'Regular' ? `Variant: ${cw.variant}` : null,
        qty: 1,
        price: parseFloat(cw.harga || 0),
        subtotal: parseFloat(cw.harga || 0)
      })
    })
  }

  // Cafe items if any
  if (order?.cafe && order.cafe.length > 0) {
    order.cafe.forEach(c => {
      const qty = parseInt(c.qty || c.jumlah || 1)
      const price = parseFloat(c.harga_satuan || c.harga || 0)
      const note = c.catatan || c.notes || null
      items.push({
        type: 'CAFE',
        name: c.nama_menu || 'Menu Cafe',
        detail: note ? `Catatan: ${note}` : null,
        catatan: note,
        qty,
        price,
        subtotal: parseFloat(c.subtotal || qty * price)
      })
    })
  }

  const rawId = (order?.id_struk || order?.id || '00000000').toString()
  let cleanId = rawId.toUpperCase().replace(/^ORD-?/, '')
  const shortId = cleanId.length >= 8 ? cleanId.substring(0, 8) : cleanId
  const orderNumber = `ORD-${shortId}`

  const total = parseFloat(order?.total_tagihan || order?.total_harga || 0)

  const hasCarwashItems = !!(carwashItem.plat || carwashItem.plat_nomor || carwashItem.layanan || carwashItem.paket || (order.carwash && order.carwash.length > 0))

  const rawKehadiran = (carwashItem.kehadiran || order?.kehadiran || 'TINGGAL').toUpperCase()
  const formatKehadiran = rawKehadiran === 'TINGGAL' ? 'DITINGGAL' : (rawKehadiran === 'TUNGGU' ? 'DITUNGGU' : rawKehadiran)

  const tipePesanan = (order?.tipe_pesanan || (carwashItem.paket ? 'ESTAFET' : 'DINE IN')).toUpperCase()
  const nomorMejaAntrean = order?.no_meja || order?.nomor_meja_antrean || order?.nama_pelanggan || ''

  const orderTitle = config.orderReceiptTitle !== undefined ? config.orderReceiptTitle : DEFAULT_RECEIPT_CONFIG.orderReceiptTitle
  const orderSubtitle = config.orderReceiptSubtitle !== undefined ? config.orderReceiptSubtitle : DEFAULT_RECEIPT_CONFIG.orderReceiptSubtitle
  const orderDisclaimer = config.orderDisclaimer !== undefined ? config.orderDisclaimer : DEFAULT_RECEIPT_CONFIG.orderDisclaimer

  return {
    type: 'ORDER_DROP_OFF',
    hasCarwash: hasCarwashItems,
    title: orderTitle,
    subtitle: orderSubtitle,
    storeName: config.storeName || DEFAULT_RECEIPT_CONFIG.storeName,
    storeTagline: config.storeTagline !== undefined ? config.storeTagline : DEFAULT_RECEIPT_CONFIG.storeTagline,
    storeAddress: config.storeAddress || '',
    storePhone: config.storePhone || '',
    storeSocial: config.storeSocial || '',
    showStorePhone: config.showStorePhone !== false,
    showStoreAddress: config.showStoreAddress !== false,
    footerText: PERMANENT_RELAYPOS_FOOTER,
    paperWidth: config.paperWidth || '72mm',
    orderId: rawId,
    orderNumber,
    tipePesanan,
    nomorMejaAntrean,
    tanggal: formatReceiptDate(order?.tanggal, order?.jam),
    kasir: (order?.kasir || 'KASIR').toUpperCase(),
    plat: hasCarwashItems ? (carwashItem.plat || carwashItem.plat_nomor || '-').toUpperCase() : '',
    model: hasCarwashItems ? (carwashItem.model || carwashItem.merk_mobil || 'Kendaraan') : '',
    kehadiran: hasCarwashItems ? formatKehadiran : '',
    noTelepon: carwashItem.no_telepon || order?.no_telepon || '',
    items,
    subtotal: items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0) || total,
    diskonCarwash: parseFloat(order?.diskon_carwash || 0),
    diskonCafe: parseFloat(order?.diskon_cafe || 0),
    totalTagihan: total,
    total: total,
    isPaid: false,
    statusBayar: 'PENDING (BELUM LUNAS)',
    disclaimer: orderDisclaimer
  }
}

/**
 * Builds standard receipt data for Bukti Pembayaran (Lunas)
 */
export const buildPaymentReceiptData = (order, customConfig = null) => {
  const config = customConfig || getReceiptConfig()
  const baseData = buildOrderReceiptData(order, config)
  const metodeBayar = order?.metode_bayar || 'CASH'
  const total = parseFloat(order?.total_tagihan || order?.total_harga || 0)
  const cashAmount = parseFloat(order?.nominal_cash || (metodeBayar === 'CASH' ? total : 0))
  const qrisAmount = parseFloat(order?.nominal_qris || (metodeBayar === 'QRIS' ? total : 0))
  const uangDiterima = parseFloat(order?.uang_diterima || cashAmount || total)
  const kembalian = parseFloat(order?.kembalian || (metodeBayar === 'CASH' && uangDiterima >= total ? uangDiterima - total : 0))

  const paymentTitle = config.paymentReceiptTitle !== undefined ? config.paymentReceiptTitle : DEFAULT_RECEIPT_CONFIG.paymentReceiptTitle
  const paymentSubtitle = config.paymentReceiptSubtitle !== undefined ? config.paymentReceiptSubtitle : DEFAULT_RECEIPT_CONFIG.paymentReceiptSubtitle
  const paymentDisclaimer = config.paymentDisclaimer !== undefined ? config.paymentDisclaimer : DEFAULT_RECEIPT_CONFIG.paymentDisclaimer

  return {
    ...baseData,
    type: 'PAYMENT_RECEIPT',
    title: paymentTitle,
    subtitle: paymentSubtitle,
    isPaid: true,
    statusBayar: 'LUNAS',
    subtotal: baseData.subtotal,
    total: total,
    totalTagihan: total,
    metodeBayar,
    nominalCash: cashAmount,
    nominalQris: qrisAmount,
    uangDiterima,
    kembalian,
    bayarNominal: uangDiterima,
    kembalianNominal: kembalian,
    waktuDibayar: formatReceiptDate(order?.waktu_dibayar || order?.tanggal, order?.jam),
    disclaimer: paymentDisclaimer
  }
}

/**
 * Generates WhatsApp formatted text message and wa.me URL
 */
export const generateWhatsAppReceiptMessage = (receiptData, overridePhone = '') => {
  const targetPhone = normalizeWhatsAppPhone(overridePhone || receiptData.noTelepon)
  const isDropOff = receiptData.type === 'ORDER_DROP_OFF'

  let msg = `*${receiptData.storeName}*\n`
  if (receiptData.storeTagline) {
    msg += `_${receiptData.storeTagline}_\n`
  }
  if (receiptData.showStoreAddress && receiptData.storeAddress) {
    msg += `📍 ${receiptData.storeAddress}\n`
  }
  if (receiptData.showStorePhone && receiptData.storePhone) {
    msg += `📞 Hub: ${receiptData.storePhone}\n`
  }
  msg += `--------------------------------\n`
  msg += `*${receiptData.title}*\n`
  msg += `No. Transaksi : *${receiptData.orderNumber}*\n`
  msg += `Tanggal/Jam   : ${receiptData.tanggal}\n`
  msg += `Kasir         : ${receiptData.kasir}\n`

  const hasCarwashInfo = receiptData.hasCarwash || (receiptData.plat && receiptData.plat !== '-')
  if (hasCarwashInfo) {
    msg += `No. Polisi    : *${receiptData.plat}*\n`
    if (receiptData.model && receiptData.model !== '-') {
      msg += `Tipe Unit     : ${receiptData.model}\n`
    }
    if (receiptData.kehadiran) {
      msg += `Kehadiran     : *${receiptData.kehadiran}*\n`
    }
  } else if (receiptData.nomorMejaAntrean || receiptData.tipePesanan) {
    msg += `Meja / Pesanan: *${receiptData.nomorMejaAntrean || receiptData.tipePesanan}*\n`
  }
  msg += `--------------------------------\n`
  msg += `*RINCIAN LAYANAN & PESANAN:*\n`

  receiptData.items.forEach(item => {
    msg += `• ${item.name} x${item.qty} = ${formatRupiahReceipt(item.subtotal)}\n`
    if (item.detail) msg += `  _${item.detail}_\n`
  })

  if (receiptData.diskonCarwash > 0) {
    msg += `Diskon Carwash: -${formatRupiahReceipt(receiptData.diskonCarwash)}\n`
  }
  if (receiptData.diskonCafe > 0) {
    msg += `Diskon Cafe   : -${formatRupiahReceipt(receiptData.diskonCafe)}\n`
  }

  msg += `--------------------------------\n`
  msg += `*TOTAL ${isDropOff ? 'ESTIMASI' : 'TAGIHAN'} : ${formatRupiahReceipt(receiptData.totalTagihan)}*\n`
  msg += `STATUS          : *${receiptData.statusBayar}*\n`

  if (receiptData.isPaid) {
    msg += `Metode Bayar    : ${receiptData.metodeBayar}\n`
    if (receiptData.metodeBayar === 'CASH') {
      msg += `Uang Diterima   : ${formatRupiahReceipt(receiptData.uangDiterima)}\n`
      msg += `Kembalian       : ${formatRupiahReceipt(receiptData.kembalian)}\n`
    }
  }

  msg += `--------------------------------\n`
  msg += `${receiptData.disclaimer}\n\n`
  msg += `_${receiptData.footerText}_`

  const encoded = encodeURIComponent(msg)
  const url = targetPhone ? `https://wa.me/${targetPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`

  return {
    phone: targetPhone,
    message: msg,
    url
  }
}

/**
 * Calculates final total when custom overnight surcharge or late pickup fee is added
 */
export const calculateSettlementWithSurcharge = (baseTotal, surcharge = {}) => {
  const base = parseFloat(baseTotal) || 0
  if (!surcharge || !surcharge.enabled) {
    return {
      finalTotal: base,
      surchargeAmount: 0,
      surchargeDescription: ''
    }
  }

  const amount = parseFloat(surcharge.nominal) || 0
  const description = surcharge.keterangan || 'Biaya Inap Kendaraan'

  return {
    finalTotal: Math.max(0, base + amount),
    surchargeAmount: amount,
    surchargeDescription: description
  }
}

/**
 * Builds Kitchen / Bar Order Slip Data (Tiket Dapur Tanpa Nominal Uang)
 */
export const buildKitchenTicketData = (order, customConfig = null) => {
  const config = customConfig || getReceiptConfig()
  const rawId = (order?.id_struk || order?.id || '00000000').toString()
  let cleanId = rawId.toUpperCase().replace(/^ORD-?/, '')
  const shortId = cleanId.length >= 8 ? cleanId.substring(0, 8) : cleanId
  const orderNumber = `KTC-${shortId}`

  const items = []
  if (order?.cafe && order.cafe.length > 0) {
    order.cafe.forEach(c => {
      const qty = parseInt(c.qty || c.jumlah || 1)
      const note = c.catatan || c.notes || null
      items.push({
        name: c.nama_menu || 'Menu Cafe',
        qty,
        catatan: note
      })
    })
  }

  const tipePesanan = (order?.tipe_pesanan || 'DINE IN').toUpperCase()
  const nomorMejaAntrean = order?.no_meja || order?.nomor_meja_antrean || order?.nama_pelanggan || '-'

  return {
    type: 'KITCHEN_TICKET',
    title: 'TIKET PESANAN DAPUR / BAR',
    subtitle: `${tipePesanan} • ${nomorMejaAntrean}`,
    storeName: config.storeName || DEFAULT_RECEIPT_CONFIG.storeName,
    paperWidth: config.paperWidth || '72mm',
    orderNumber,
    tipePesanan,
    nomorMejaAntrean,
    tanggal: formatReceiptDate(order?.tanggal, order?.jam),
    kasir: (order?.kasir || 'KASIR').toUpperCase(),
    items,
    totalItems: items.reduce((sum, it) => sum + it.qty, 0),
    footerText: 'Segera Siapkan & Sajikan Pesanan Pelanggan'
  }
}
