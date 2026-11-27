/**
 * Helper Utility for POS Receipt Management (Bukti Order & Bukti Pembayaran)
 * RelayPOS Carwash & Cafe Enterprise System
 */

export const PERMANENT_RELAYPOS_FOOTER = 'Powered by RelayPOS • Cloud Enterprise System'

export const DEFAULT_WA_ORDER_TEMPLATE = `*{nama_toko}*
*BUKTI PENERIMAAN KENDARAAN*

Halo Kak, pesanan Anda sudah kami terima:
No. Order: *{no_order}*
Waktu: {tanggal}
{info_kendaraan_atau_meja}

*Rincian Pesanan:*
{rincian_item}
{diskon}
*Total Estimasi: {total}*
Status: *{status}*

Kami akan segera mengabarkan via WhatsApp bila pesanan selesai. Simpan pesan ini sebagai tanda terima.`

export const DEFAULT_WA_PAYMENT_TEMPLATE = `*{nama_toko}*
*E-STRUK PEMBAYARAN LUNAS*

Terima kasih sudah berkunjung ke {nama_toko}! Berikut ringkasan transaksi Anda:
No. Transaksi: *{no_order}*
Waktu: {tanggal}
{info_kendaraan_atau_meja}

*Rincian Pesanan:*
{rincian_item}
{diskon}
*Total Bayar: {total}*
Status: *{status}*
{rincian_pembayaran}

Semoga puas dengan layanan kami dan sampai jumpa kembali!`

export const WA_TEMPLATE_VARIABLES = [
  { token: '{nama_toko}', label: 'Nama Toko', group: 'Toko' },
  { token: '{slogan}', label: 'Slogan', group: 'Toko' },
  { token: '{alamat}', label: 'Alamat', group: 'Toko' },
  { token: '{telepon}', label: 'Telepon/WA', group: 'Toko' },
  { token: '{sosmed}', label: 'Sosmed', group: 'Toko' },
  { token: '{no_order}', label: 'No. Order', group: 'Transaksi' },
  { token: '{tanggal}', label: 'Tanggal/Jam', group: 'Transaksi' },
  { token: '{kasir}', label: 'Nama Kasir', group: 'Transaksi' },
  { token: '{info_kendaraan_atau_meja}', label: 'Kendaraan / Meja (Otomatis)', group: 'Transaksi' },
  { token: '{plat}', label: 'No. Polisi', group: 'Transaksi' },
  { token: '{model}', label: 'Model Mobil', group: 'Transaksi' },
  { token: '{kehadiran}', label: 'Kehadiran', group: 'Transaksi' },
  { token: '{meja}', label: 'No. Meja / Tipe', group: 'Transaksi' },
  { token: '{rincian_item}', label: 'Daftar Item', group: 'Item & Bayar' },
  { token: '{diskon}', label: 'Potongan Diskon', group: 'Item & Bayar' },
  { token: '{total}', label: 'Total Tagihan', group: 'Item & Bayar' },
  { token: '{status}', label: 'Status Bayar', group: 'Item & Bayar' },
  { token: '{metode_bayar}', label: 'Metode Bayar', group: 'Item & Bayar' },
  { token: '{uang_diterima}', label: 'Uang Diterima', group: 'Item & Bayar' },
  { token: '{kembalian}', label: 'Kembalian', group: 'Item & Bayar' },
  { token: '{rincian_pembayaran}', label: 'Detail Bayar & Kembali', group: 'Item & Bayar' }
]

export const WA_TEMPLATE_PRESETS = [
  {
    id: 'default',
    label: 'Ramah & Jelas',
    orderTemplate: DEFAULT_WA_ORDER_TEMPLATE,
    paymentTemplate: DEFAULT_WA_PAYMENT_TEMPLATE
  },
  {
    id: 'express',
    label: 'Singkat Express',
    orderTemplate: `*{nama_toko}* - Order *{no_order}*
{info_kendaraan_atau_meja}
{rincian_item}
Total: *{total}* ({status})
Kami kabari segera saat selesai.`,
    paymentTemplate: `*{nama_toko}* - Nota *{no_order}*
{rincian_item}
Total: *{total}* ({status})
{rincian_pembayaran}
Terima kasih!`
  },
  {
    id: 'formal',
    label: 'Lengkap & Resmi',
    orderTemplate: `*{nama_toko}*
{alamat}
Telp/WA: {telepon}

*TANDA TERIMA ORDER RESMI*
No. Order: *{no_order}*
Tanggal: {tanggal}
Kasir: {kasir}
{info_kendaraan_atau_meja}

*Rincian Layanan / Menu:*
{rincian_item}
{diskon}
*Total Estimasi: {total}*
Status: *{status}*

Mohon simpan pesan ini sebagai bukti pengambilan unit/pesanan.`,
    paymentTemplate: `*{nama_toko}*
{alamat}
Telp/WA: {telepon}

*BUKTI PEMBAYARAN RESMI*
No. Struk: *{no_order}*
Tanggal: {tanggal}
Kasir: {kasir}
{info_kendaraan_atau_meja}

*Rincian Transaksi:*
{rincian_item}
{diskon}
*Total Dibayar: {total}*
Status: *{status}*
{rincian_pembayaran}

Terima kasih atas kepercayaan Anda.`
  },
  {
    id: 'review',
    label: 'Ajak Review & Follow',
    orderTemplate: `*{nama_toko}*
Halo Kak! Order *{no_order}* sudah masuk antrean kami.
{info_kendaraan_atau_meja}
{rincian_item}
Estimasi: *{total}* ({status})

Sambil menunggu, nikmati kopi & menu cafe kami atau tunggu kabar WA dari kami ya Kak.`,
    paymentTemplate: `*{nama_toko}*
Terima kasih Kak! Pembayaran *{no_order}* sebesar *{total}* sudah *{status}*.
{rincian_item}
{rincian_pembayaran}

Puas dengan layanan kami? Follow {sosmed} atau balas pesan ini jika ada masukan ya Kak!`
  }
]

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
  showStoreAddress: true,
  // Dedicated WhatsApp E-Receipt Freeform Templates (Terpisah dari Struk Printer Thermal)
  waOrderTemplate: DEFAULT_WA_ORDER_TEMPLATE,
  waPaymentTemplate: DEFAULT_WA_PAYMENT_TEMPLATE,
  waGreeting: 'Halo Kak! Terima kasih sudah berkunjung ke {storeName}. Berikut e-struk digital transaksi Anda:',
  waOrderTitle: 'BUKTI PENERIMAAN KENDARAAN',
  waPaymentTitle: 'E-STRUK PEMBAYARAN LUNAS',
  waOrderClosing: 'Kami akan segera mengabarkan via WhatsApp begitu kendaraan Anda selesai dikerjakan. Simpan pesan ini sebagai tanda terima.',
  waPaymentClosing: 'Terima kasih banyak atas kunjungan Anda! Semoga puas dengan layanan kami dan sampai jumpa kembali.',
  waExtraNote: '',
  waShowAddress: true,
  waShowPhone: true,
  waShowSocial: true,
  waShowCashier: true,
  waShowItemDetails: true,
  waShowPaymentBreakdown: true
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
  const cafeList = order?.cafe || (Array.isArray(order?.items) ? order.items : [])
  if (cafeList && cafeList.length > 0) {
    cafeList.forEach(c => {
      const qty = parseInt(c.qty || c.jumlah || 1)
      const price = parseFloat(c.harga_satuan || c.harga || c.price || 0)
      const note = c.catatan || c.notes || null
      items.push({
        type: c.type || 'CAFE',
        name: c.nama_menu || c.name || 'Menu Cafe',
        detail: note ? `Catatan: ${note}` : null,
        catatan: note,
        qty,
        price,
        subtotal: parseFloat(c.subtotal || qty * price)
      })
    })
  }

  const rawId = (order?.id_struk || order?.id || order?.receiptNumber || '00000000').toString().trim()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId)
  const cleanId = rawId.toUpperCase().replace(/^ORD-?/, '')
  const orderNumber = isUuid ? `ORD-${cleanId.substring(0, 8)}` : rawId.toUpperCase()

  const total = parseFloat(order?.total_tagihan || order?.total_harga || order?.total || 0)

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
    storeName: order?.tenantName || order?.tenant_nama || order?.storeName || config.storeName || DEFAULT_RECEIPT_CONFIG.storeName,
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
    pajak: parseFloat(order?.pajak || 0),
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
  const metodeBayar = order?.metode_bayar || order?.paymentMethod || 'CASH'
  const total = parseFloat(order?.total_tagihan || order?.total_harga || order?.total || 0)
  const cashAmount = parseFloat(order?.nominal_cash || (metodeBayar === 'CASH' ? total : 0))
  const qrisAmount = parseFloat(order?.nominal_qris || (metodeBayar === 'QRIS' ? total : 0))
  const uangDiterima = parseFloat(order?.uang_diterima || order?.cashTendered || cashAmount || total)
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
 * Tokenizes WhatsApp inline formatting (*bold*, _italic_, ~strike~, ```mono```)
 * into safe React-renderable spans without turning URLs/snake_case underscores into italics.
 */
export const parseWhatsAppInlineFormatting = (line) => {
  const input = String(line || '')
  if (!input) return []

  const tokenRe = /```([^`]+)```|\*([^*\n]+)\*|(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])|~([^~\n]+)~/g
  const tokens = []
  let lastIndex = 0
  let match

  while ((match = tokenRe.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: input.slice(lastIndex, match.index) })
    }
    if (match[1] !== undefined) {
      tokens.push({ type: 'mono', text: match[1] })
    } else if (match[2] !== undefined) {
      tokens.push({ type: 'bold', text: match[2] })
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'italic', text: match[3] })
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'strike', text: match[4] })
    }
    lastIndex = tokenRe.lastIndex
  }

  if (lastIndex < input.length) {
    tokens.push({ type: 'text', text: input.slice(lastIndex) })
  }

  return tokens
}

/**
 * Renders a configurable WhatsApp template string using receipt variables,
 * automatically collapsing lines that contain only empty placeholders.
 */
export const renderWhatsAppTemplate = (template, vars = {}) => {
  const tokenRegex = /\{([a-z0-9_]+)\}/gi
  const lines = String(template || '').split(/\r?\n/)
  const renderedLines = []

  for (const line of lines) {
    const trimmed = line.trim()
    const matches = [...trimmed.matchAll(tokenRegex)]
    if (matches.length > 0) {
      const leftoverText = trimmed.replace(tokenRegex, '').trim()
      const allEmpty = matches.every((m) => !String(vars[m[1].toLowerCase()] ?? '').trim())
      if (!leftoverText && allEmpty) {
        continue
      }
    }
    const replaced = line.replace(tokenRegex, (full, key) => {
      const k = key.toLowerCase()
      return vars[k] !== undefined ? String(vars[k]) : full
    })
    renderedLines.push(replaced.replace(/[ \t]+$/g, ''))
  }

  return renderedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Generates WhatsApp formatted text message and wa.me URL
 * Menggunakan template konfigurasi WhatsApp khusus (terpisah dari struk kertas thermal)
 * dengan watermark RelayPOS yang selalu dipertahankan di bagian bawah.
 */
export const generateWhatsAppReceiptMessage = (receiptData, overridePhone = '', customConfig = null) => {
  const cfg = customConfig
    ? { ...DEFAULT_RECEIPT_CONFIG, ...customConfig }
    : getReceiptConfig()
  const targetPhone = normalizeWhatsAppPhone(overridePhone || receiptData.noTelepon)
  const isDropOff = receiptData.type === 'ORDER_DROP_OFF'
  const storeName = receiptData.storeName || cfg.storeName || DEFAULT_RECEIPT_CONFIG.storeName
  const storeTagline = (receiptData.storeTagline !== undefined ? receiptData.storeTagline : cfg.storeTagline) || ''
  const storeAddress = receiptData.storeAddress || cfg.storeAddress || ''
  const storePhone = receiptData.storePhone || cfg.storePhone || ''
  const storeSocial = receiptData.storeSocial || cfg.storeSocial || ''

  const hasCarwashInfo = Boolean(receiptData.hasCarwash || (receiptData.plat && receiptData.plat !== '-'))
  const infoLines = []
  if (hasCarwashInfo) {
    const modelSuffix = receiptData.model && receiptData.model !== '-' ? ` (${receiptData.model})` : ''
    infoLines.push(`No. Polisi: *${receiptData.plat || '-'}*${modelSuffix}`)
    if (receiptData.kehadiran) {
      infoLines.push(`Kehadiran: *${receiptData.kehadiran}*`)
    }
  } else if (receiptData.nomorMejaAntrean || receiptData.tipePesanan) {
    infoLines.push(`Meja / Pesanan: *${receiptData.nomorMejaAntrean || receiptData.tipePesanan}*`)
  }

  const itemLines = []
  ;(receiptData.items || []).forEach((item) => {
    itemLines.push(`• ${item.name} x${item.qty} - ${formatRupiahReceipt(item.subtotal)}`)
    if (item.detail) itemLines.push(`  _${item.detail}_`)
  })

  const discountLines = []
  if (receiptData.diskonCarwash > 0) {
    discountLines.push(`Diskon Carwash: -${formatRupiahReceipt(receiptData.diskonCarwash)}`)
  }
  if (receiptData.diskonCafe > 0) {
    discountLines.push(`Diskon Cafe: -${formatRupiahReceipt(receiptData.diskonCafe)}`)
  }

  const paymentLines = []
  if (receiptData.isPaid) {
    paymentLines.push(`Metode Bayar: ${receiptData.metodeBayar || '-'}`)
    if (receiptData.metodeBayar === 'CASH' || receiptData.metodeBayar === 'SPLIT') {
      paymentLines.push(`Uang Diterima: ${formatRupiahReceipt(receiptData.uangDiterima || 0)}`)
      paymentLines.push(`Kembalian: ${formatRupiahReceipt(receiptData.kembalian || 0)}`)
    }
  }

  const vars = {
    nama_toko: storeName,
    slogan: storeTagline,
    alamat: storeAddress,
    telepon: storePhone,
    sosmed: storeSocial,
    no_order: receiptData.orderNumber || '-',
    tanggal: receiptData.tanggal || '-',
    kasir: receiptData.kasir || 'KASIR',
    info_kendaraan_atau_meja: infoLines.join('\n'),
    plat: hasCarwashInfo ? (receiptData.plat || '-') : '',
    model: hasCarwashInfo && receiptData.model && receiptData.model !== '-' ? receiptData.model : '',
    kehadiran: hasCarwashInfo ? (receiptData.kehadiran || '') : '',
    meja: receiptData.nomorMejaAntrean || receiptData.tipePesanan || '',
    rincian_item: itemLines.join('\n'),
    diskon: discountLines.join('\n'),
    total: formatRupiahReceipt(receiptData.totalTagihan ?? receiptData.total ?? 0),
    status: receiptData.statusBayar || (isDropOff ? 'PENDING (BELUM LUNAS)' : 'LUNAS'),
    metode_bayar: receiptData.isPaid ? (receiptData.metodeBayar || '-') : '-',
    uang_diterima: receiptData.isPaid ? formatRupiahReceipt(receiptData.uangDiterima || 0) : '-',
    kembalian: receiptData.isPaid ? formatRupiahReceipt(receiptData.kembalian || 0) : '-',
    rincian_pembayaran: paymentLines.join('\n')
  }

  const activeTemplate = isDropOff
    ? (cfg.waOrderTemplate !== undefined ? cfg.waOrderTemplate : DEFAULT_WA_ORDER_TEMPLATE)
    : (cfg.waPaymentTemplate !== undefined ? cfg.waPaymentTemplate : DEFAULT_WA_PAYMENT_TEMPLATE)

  const body = renderWhatsAppTemplate(activeTemplate, vars)
  // Watermark RelayPOS wajib selalu tersemat di paling bawah pesan WA
  const msg = body
    ? `${body}\n\n_${PERMANENT_RELAYPOS_FOOTER}_`
    : `_${PERMANENT_RELAYPOS_FOOTER}_`

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
