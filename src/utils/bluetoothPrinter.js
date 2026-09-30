/**
 * Web Bluetooth ESC/POS Direct Thermal Printer Utility
 * RelayPOS Enterprise System
 *
 * Mengirim byte stream biner ESC/POS langsung ke printer thermal Bluetooth (58mm / 80mm)
 * via Web Bluetooth API (navigator.bluetooth).
 * 100% bebas watermark, tanpa aplikasi pihak ketiga (RawBT), instan dan bersih.
 */

// Daftar UUID Service Bluetooth umum pada printer thermal BLE (ZJiang, Xprinter, Panda, GOOJPRT, MPT, dsb.)
export const PRINTER_BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
  '0000ff00-0000-1000-8000-00805f9b34fb', // Custom ESC/POS Service (ZJiang/Xprinter)
  '0000ae00-0000-1000-8000-00805f9b34fb', // Panda / MPT BLE
  '0000fee7-0000-1000-8000-00805f9b34fb', // POS BLE
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000180a-0000-1000-8000-00805f9b34fb'  // Device Info
]

// ESC/POS Command Constants
export const ESC_COMMANDS = {
  INIT: [0x1B, 0x40],                     // ESC @ : Inisialisasi printer
  LINE_SPACING_DEFAULT: [0x1B, 0x32],     // ESC 2 : Spasi baris default standar (proporsional & nyaman dibaca)
  LINE_SPACING_COMFORTABLE: [0x1B, 0x33, 32], // ESC 3 32 : Spasi baris 32 dots
  ALIGN_LEFT: [0x1B, 0x61, 0x00],         // ESC a 0 : Rata kiri
  ALIGN_CENTER: [0x1B, 0x61, 0x01],       // ESC a 1 : Rata tengah
  ALIGN_RIGHT: [0x1B, 0x61, 0x02],        // ESC a 2 : Rata kanan
  BOLD_ON: [0x1B, 0x45, 0x01],            // ESC E 1 : Cetak tebal
  BOLD_OFF: [0x1B, 0x45, 0x00],           // ESC E 0 : Nonaktifkan tebal
  DOUBLE_HEIGHT_ON: [0x1D, 0x21, 0x01],   // GS ! 1 : Dobel tinggi
  DOUBLE_WIDTH_ON: [0x1D, 0x21, 0x10],    // GS ! 16 : Dobel lebar
  DOUBLE_SIZE_ON: [0x1D, 0x21, 0x11],     // GS ! 17 : Dobel tinggi & lebar
  TEXT_NORMAL: [0x1D, 0x21, 0x00],        // GS ! 0 : Ukuran teks normal
  FEED_LINES_2: [0x1B, 0x64, 0x02],       // ESC d 2 : Feed 2 baris
  FEED_LINES_3: [0x1B, 0x64, 0x03],       // ESC d 3 : Feed 3 baris
  FEED_LINES_4: [0x1B, 0x64, 0x04],       // ESC d 4 : Feed 4 baris
  CUT_PAPER: [0x1D, 0x56, 0x42, 0x00],    // GS V 66 0 : Auto-cut paper (partial)
  DRAWER_KICK: [0x1B, 0x70, 0x00, 0x32, 0xFA] // ESC p 0 50 250 : Buka laci uang
}

// State koneksi aktif di browser memory
let activeBluetoothDevice = null
let activeCharacteristic = null

/**
 * Cek apakah browser mendukung Web Bluetooth API
 */
export const isWebBluetoothSupported = () => {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && (typeof window === 'undefined' || window.isSecureContext)
}

/**
 * Diagnosa mendalam penyebab Web Bluetooth tidak aktif di perangkat
 */
export const getBluetoothDiagnosticInfo = () => {
  const isBrowser = typeof window !== 'undefined'
  const isSecure = isBrowser ? Boolean(window.isSecureContext) : false
  const hasBluetooth = isBrowser ? ('bluetooth' in navigator) : false
  const protocol = isBrowser ? window.location.protocol : ''
  const hostname = isBrowser ? window.location.hostname : ''
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  const isHttps = protocol === 'https:'
  
  const origin = isBrowser && window.location ? window.location.origin : 'http://192.168.x.x:5173'
  
  let reason = null
  let fixSuggestion = null

  if (!isSecure && !isLocalhost && !isHttps) {
    reason = `Aplikasi dibuka melalui alamat IP '${protocol}//${hostname}' (Bukan HTTPS/localhost).`
    fixSuggestion = `Google Chrome mewajibkan protokol aman (HTTPS atau localhost) untuk Bluetooth. Jika mengakses dari HP/Tablet via IP WiFi PC, buka 'chrome://flags' di HP, cari 'unsafely-treat-insecure-origin-as-secure', masukkan '${origin}', pilih Enabled, lalu restart Chrome.`
  } else if (!hasBluetooth) {
    reason = 'Fitur Web Bluetooth dinonaktifkan oleh pengaturan Chrome di perangkat ini.'
    fixSuggestion = `Buka tab baru di Chrome: 'chrome://flags/#enable-web-bluetooth', ubah menjadi 'Enabled', lalu klik tombol 'Relaunch' di kanan bawah Chrome.`
  }

  return {
    isSupported: hasBluetooth && isSecure,
    hasBluetooth,
    isSecure,
    protocol,
    hostname,
    isLocalhost,
    reason,
    fixSuggestion
  }
}

/**
 * Mendapatkan nama printer yang sedang terhubung di session
 */
export const getConnectedPrinterName = () => {
  if (activeBluetoothDevice && activeBluetoothDevice.gatt && activeBluetoothDevice.gatt.connected) {
    return activeBluetoothDevice.name || 'Thermal Printer'
  }
  return null
}

/**
 * Membuka dialog resmi browser untuk pairing ke printer Bluetooth BLE
 */
export const connectBluetoothPrinter = async () => {
  const diag = getBluetoothDiagnosticInfo()
  if (!diag.isSupported) {
    const errorMsg = diag.reason 
      ? `${diag.reason} ${diag.fixSuggestion || ''}`
      : 'Web Bluetooth API tidak didukung di browser ini. Gunakan Google Chrome pada Android/Windows/Mac dan buka via HTTPS atau http://localhost.'
    throw new Error(errorMsg)
  }

  // Jika sudah terhubung, langsung gunakan
  if (activeBluetoothDevice && activeBluetoothDevice.gatt && activeBluetoothDevice.gatt.connected && activeCharacteristic) {
    return {
      device: activeBluetoothDevice,
      characteristic: activeCharacteristic,
      name: activeBluetoothDevice.name || 'Thermal Printer'
    }
  }

  try {
    // Request device dengan scan seluruh printer di sekitar
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_BLE_SERVICES
    })

    if (!device) {
      throw new Error('Tidak ada perangkat printer yang dipilih.')
    }

    // Connect ke GATT Server
    const server = await device.gatt.connect()
    
    // Cari characteristic yang mendukung fungsi write
    let targetCharacteristic = null

    // Coba iterasi service yang dikenal
    for (const serviceUuid of PRINTER_BLE_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid)
        const characteristics = await service.getCharacteristics()
        
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            targetCharacteristic = char
            break
          }
        }
      } catch (err) {
        // Service mungkin tidak ada di printer tipe ini, lanjut ke service berikutnya
      }
      if (targetCharacteristic) break
    }

    // Jika belum ketemu dari daftar eksplisit, coba query semua primary services
    if (!targetCharacteristic) {
      try {
        const services = await server.getPrimaryServices()
        for (const service of services) {
          try {
            const characteristics = await service.getCharacteristics()
            for (const char of characteristics) {
              if (char.properties.write || char.properties.writeWithoutResponse) {
                targetCharacteristic = char
                break
              }
            }
          } catch {}
          if (targetCharacteristic) break
        }
      } catch {}
    }

    if (!targetCharacteristic) {
      throw new Error('Gagal menemukan jalur penulisan data (Writable Characteristic) pada printer ini.')
    }

    // Pasang listener disconnect
    device.addEventListener('gattserverdisconnected', () => {
      activeBluetoothDevice = null
      activeCharacteristic = null
    })

    activeBluetoothDevice = device
    activeCharacteristic = targetCharacteristic

    // Simpan riwayat nama printer di LocalStorage untuk referensi kasir
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('relaypos_last_bt_printer_name', device.name || 'Bluetooth Printer')
      }
    } catch {}

    return {
      device,
      characteristic: targetCharacteristic,
      name: device.name || 'Thermal Printer'
    }
  } catch (error) {
    activeBluetoothDevice = null
    activeCharacteristic = null
    throw error
  }
}

/**
 * Memutuskan koneksi Bluetooth
 */
export const disconnectBluetoothPrinter = () => {
  if (activeBluetoothDevice && activeBluetoothDevice.gatt && activeBluetoothDevice.gatt.connected) {
    activeBluetoothDevice.gatt.disconnect()
  }
  activeBluetoothDevice = null
  activeCharacteristic = null
}

/**
 * Helper pemecah teks panjang menjadi beberapa baris sesuai batas kolom (Word Wrap)
 */
export const wordWrapText = (text = '', maxCols = 32) => {
  if (!text) return []
  const words = String(text).trim().split(/\s+/)
  const lines = []
  let current = ''

  for (const w of words) {
    if (!current) {
      current = w
    } else if ((current + ' ' + w).length <= maxCols) {
      current += ' ' + w
    } else {
      lines.push(current)
      current = w
    }
  }
  if (current) {
    lines.push(current)
  }
  return lines
}

/**
 * Helper pembagi baris 2 kolom (Kiri Teks, Kanan Nilai) dengan perataan presisi
 */
export const formatEscPosRow = (leftText = '', rightText = '', totalCols = 32) => {
  const left = String(leftText)
  const right = String(rightText)
  const spaceNeeded = totalCols - left.length - right.length

  if (spaceNeeded >= 0) {
    return left + ' '.repeat(spaceNeeded) + right + '\n'
  }

  // Jika terlalu panjang, bungkus teks kiri ke baris atas
  return left + '\n' + ' '.repeat(Math.max(0, totalCols - right.length)) + right + '\n'
}

/**
 * Text Encoder ke Uint8Array (ASCII / ISO-8859-1 compatible)
 */
export const stringToBytes = (str) => {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code < 128) {
      bytes.push(code)
    } else {
      // Ganti karakter non-ASCII dengan representasi aman
      bytes.push(0x20)
    }
  }
  return new Uint8Array(bytes)
}

/**
 * ESC/POS Receipt Payload Builder (Ultra-Compact & 1:1 Preview Matching)
 * Mengonversi receiptData RelayPOS menjadi deretan byte ESC/POS lengkap dan hemat kertas
 */
export const buildEscPosReceiptBuffer = (receiptData, paperWidth = '58mm') => {
  const is58mm = paperWidth === '58mm'
  const cols = is58mm ? 32 : 48
  const separator = '-'.repeat(cols) + '\n'
  const dottedSeparator = '= '.repeat(Math.floor(cols / 2)) + '\n'

  const bufferChunks = []

  const appendBytes = (bytes) => {
    if (Array.isArray(bytes)) {
      bufferChunks.push(new Uint8Array(bytes))
    } else if (bytes instanceof Uint8Array) {
      bufferChunks.push(bytes)
    }
  }

  const appendText = (text) => {
    if (text) {
      appendBytes(stringToBytes(text))
    }
  }

  // 1. Inisialisasi Printer & Spasi Baris Standar Nyaman
  appendBytes(ESC_COMMANDS.INIT)
  appendBytes(ESC_COMMANDS.LINE_SPACING_DEFAULT)

  // Normalisasi Data Keuangan (Mendukung baik POS maupun Admin Customizer)
  const itemsSubtotal = (receiptData.items || []).reduce((acc, item) => {
    const itemSub = Number(item.subtotal) || (Number(item.price || 0) * Number(item.qty || 1))
    return acc + itemSub
  }, 0)

  const finalSubtotal = Number(receiptData.subtotal !== undefined ? receiptData.subtotal : itemsSubtotal)

  const diskonVal = Number(receiptData.diskonNominal || 0) + 
                    Number(receiptData.diskonCarwash || 0) + 
                    Number(receiptData.diskonCafe || 0)

  const finalTotal = Number(
    receiptData.totalTagihan !== undefined 
      ? receiptData.totalTagihan 
      : (receiptData.total !== undefined ? receiptData.total : Math.max(0, finalSubtotal - diskonVal))
  )

  const isPaid = receiptData.isPaid !== undefined 
    ? Boolean(receiptData.isPaid) 
    : (receiptData.type !== 'ORDER_DROP_OFF' && receiptData.statusBayar !== 'Pending' && !String(receiptData.statusBayar || '').toUpperCase().includes('BELUM'))

  const isDropOff = receiptData.type === 'ORDER_DROP_OFF' || !isPaid

  const finalBayar = Number(
    receiptData.uangDiterima !== undefined 
      ? receiptData.uangDiterima 
      : (receiptData.bayarNominal !== undefined ? receiptData.bayarNominal : (receiptData.nominalCash || 0))
  )

  const finalKembalian = receiptData.kembalian !== undefined 
    ? Number(receiptData.kembalian) 
    : (receiptData.kembalianNominal !== undefined ? Number(receiptData.kembalianNominal) : null)

  // 2. Header Toko (Center, Bold Nama Toko, Ukuran Standar Font A yang Tajam & Nyaman)
  appendBytes(ESC_COMMANDS.ALIGN_CENTER)
  appendBytes(ESC_COMMANDS.BOLD_ON)
  appendText((receiptData.storeName || 'RELAYPOS CARWASH & CAFE').toUpperCase() + '\n')
  appendBytes(ESC_COMMANDS.BOLD_OFF)

  if (receiptData.storeTagline) {
    appendText(receiptData.storeTagline + '\n')
  }
  if (receiptData.showStoreAddress && receiptData.storeAddress) {
    const addrLines = wordWrapText(receiptData.storeAddress, cols)
    addrLines.forEach(l => appendText(l + '\n'))
  }
  if (receiptData.showStorePhone && receiptData.storePhone) {
    appendText('Telp/WA: ' + receiptData.storePhone + '\n')
  }

  // Title Struk
  appendText('\n')
  appendBytes(ESC_COMMANDS.BOLD_ON)
  appendText(`[ ${receiptData.title || 'STRUK TRANSAKSI'} ]\n`)
  appendBytes(ESC_COMMANDS.BOLD_OFF)
  appendText(separator)

  // 3. Metadata Order (Rata Kiri, Format 1:1 dengan Pratinjau Layar)
  appendBytes(ESC_COMMANDS.ALIGN_LEFT)
  appendText(formatEscPosRow('No. Order :', receiptData.orderNumber || receiptData.orderId || '-', cols))
  appendText(formatEscPosRow('Waktu     :', receiptData.tanggal || '-', cols))
  appendText(formatEscPosRow('Kasir     :', (receiptData.kasir || 'Kasir').toUpperCase(), cols))
  
  const hasCarwashInfo = receiptData.hasCarwash || (receiptData.plat && receiptData.plat !== '-')
  if (hasCarwashInfo) {
    appendText(formatEscPosRow('No. Polisi:', (receiptData.plat || '-').toUpperCase(), cols))
    const vehicle = receiptData.model || receiptData.tipeMobil
    if (vehicle && vehicle !== '-') {
      appendText(formatEscPosRow('Kendaraan :', vehicle, cols))
    }
    if (receiptData.kehadiran) {
      appendText(formatEscPosRow('Kehadiran :', receiptData.kehadiran, cols))
    }
  } else if (receiptData.nomorMejaAntrean || receiptData.meja || receiptData.tipePesanan) {
    const tableOrType = receiptData.nomorMejaAntrean || (receiptData.meja ? `Meja ${receiptData.meja}` : receiptData.tipePesanan)
    appendText(formatEscPosRow('Meja/Order:', tableOrType, cols))
  }

  appendText(separator)

  // 4. Detail Item Transaksi (1:1 Sesuai Layout Layar)
  appendText('Rincian Pesanan:\n')
  if (receiptData.items && receiptData.items.length > 0) {
    receiptData.items.forEach((item) => {
      // Baris 1: Nama Item (Font Normal, Tidak Tebal agar Bersih & Lega)
      appendText(item.name + '\n')

      // Baris 2: Qty x Harga di kiri, Subtotal di kanan
      const itemQty = Number(item.qty || 1)
      const itemPrice = Number(item.price || 0)
      const itemSub = Number(item.subtotal !== undefined ? item.subtotal : (itemQty * itemPrice))

      const qtyPriceStr = `  ${itemQty} x Rp ${itemPrice.toLocaleString('id-ID')}`
      const subtotalStr = `Rp ${itemSub.toLocaleString('id-ID')}`
      appendText(formatEscPosRow(qtyPriceStr, subtotalStr, cols))

      const note = item.detail || item.note
      if (note) {
        appendText(`  * ${note}\n`)
      }
    })
  } else {
    appendText('  (Tidak ada item rincian)\n')
  }

  appendText(separator)

  // 5. Total & Pembayaran (Rata Kanan/Kiri Rapih, Standar Kasir)
  appendText(formatEscPosRow('Subtotal', `Rp ${finalSubtotal.toLocaleString('id-ID')}`, cols))

  if (diskonVal > 0) {
    const diskonLabel = receiptData.diskonKode ? `Diskon (${receiptData.diskonKode})` : 'Diskon'
    appendText(formatEscPosRow(diskonLabel, `- Rp ${diskonVal.toLocaleString('id-ID')}`, cols))
  }

  appendText(separator)

  // TOTAL (Bold)
  appendBytes(ESC_COMMANDS.BOLD_ON)
  const totalLabel = isDropOff ? 'TOTAL ESTIMASI:' : 'TOTAL TAGIHAN:'
  appendText(formatEscPosRow(totalLabel, `Rp ${finalTotal.toLocaleString('id-ID')}`, cols))
  appendBytes(ESC_COMMANDS.BOLD_OFF)

  appendText(separator)

  // Rincian Pembayaran
  if (isPaid) {
    appendText(formatEscPosRow('Metode Bayar', (receiptData.metodeBayar || 'TUNAI').toUpperCase(), cols))
    if (finalBayar > 0) {
      appendText(formatEscPosRow('Uang Diterima', `Rp ${finalBayar.toLocaleString('id-ID')}`, cols))
    }
    if (finalKembalian !== null && finalKembalian >= 0) {
      appendBytes(ESC_COMMANDS.BOLD_ON)
      appendText(formatEscPosRow('Kembalian', `Rp ${finalKembalian.toLocaleString('id-ID')}`, cols))
      appendBytes(ESC_COMMANDS.BOLD_OFF)
    }
    appendText(formatEscPosRow('Status', 'LUNAS (PAID)', cols))
  } else {
    appendText(formatEscPosRow('Status Order', 'BELUM DIBAYAR (PENDING)', cols))
  }

  appendText(separator)

  // 6. Disclaimer & Footer (Rata Tengah, Rapi & Lega)
  appendBytes(ESC_COMMANDS.ALIGN_CENTER)
  if (receiptData.disclaimer) {
    const discLines = wordWrapText(receiptData.disclaimer, cols)
    discLines.forEach(l => appendText(l + '\n'))
    appendText('\n')
  }

  // Footer Resmi RelayPOS (White-label & Professional)
  appendBytes(ESC_COMMANDS.BOLD_ON)
  appendText((receiptData.footerText || 'Powered by RelayPOS • Cloud Enterprise System') + '\n')
  appendBytes(ESC_COMMANDS.BOLD_OFF)

  // 7. Feed Kertas 3 Baris & Cut Paper
  appendBytes(ESC_COMMANDS.FEED_LINES_3)
  appendBytes(ESC_COMMANDS.CUT_PAPER)

  // Gabungkan semua chunk menjadi satu Uint8Array besar
  const totalLength = bufferChunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const finalBuffer = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of bufferChunks) {
    finalBuffer.set(chunk, offset)
    offset += chunk.length
  }

  return finalBuffer
}

/**
 * Mengirim byte buffer ke Bluetooth Characteristic dengan proteksi Flow Control (Chunking)
 */
export const writeBufferToCharacteristic = async (characteristic, buffer, chunkSize = 100, delayMs = 25) => {
  let offset = 0
  while (offset < buffer.length) {
    const chunk = buffer.slice(offset, offset + chunkSize)
    
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk)
    } else {
      await characteristic.writeValue(chunk)
    }

    offset += chunkSize
    if (offset < buffer.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

/**
 * Fungsi Utama Eksekusi Cetak Struk via Web Bluetooth
 */
export const printReceiptViaBluetooth = async (receiptData, paperWidth = '58mm') => {
  // 1. Dapatkan koneksi printer aktif atau trigger pairing
  const { characteristic, name } = await connectBluetoothPrinter()

  // 2. Buat ESC/POS Byte Buffer
  const buffer = buildEscPosReceiptBuffer(receiptData, paperWidth)

  // 3. Kirim data ke printer via BLE
  await writeBufferToCharacteristic(characteristic, buffer)

  return {
    success: true,
    printerName: name,
    bytesSent: buffer.length
  }
}

/**
 * Fungsi Test Print Cepat untuk Verifikasi Hardware di Admin
 */
export const testPrintViaBluetooth = async (storeName = 'RELAYPOS CARWASH & CAFE', paperWidth = '58mm') => {
  const dummyReceipt = {
    storeName,
    storeTagline: 'Professional Car Wash, Detailing & Cafe',
    storeAddress: 'Jl. Boulevard Raya Blok A No. 12',
    storePhone: '0812-3456-7890',
    title: 'TES CETAK BLUETOOTH DIRECT',
    orderNumber: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
    tanggal: new Date().toLocaleString('id-ID'),
    kasir: 'Administrator',
    plat: 'B 1234 TES',
    tipeMobil: 'Sedan Medium',
    items: [
      { name: 'Paket Cuci Salju Premium', qty: 1, price: 50000, subtotal: 50000 },
      { name: 'Kopi Susu Gula Aren (Cold)', qty: 1, price: 20000, subtotal: 20000 }
    ],
    subtotal: 70000,
    diskonNominal: 0,
    total: 70000,
    metodeBayar: 'QRIS / TRANSFER',
    bayarNominal: 70000,
    kembalianNominal: 0,
    type: 'PAYMENT_RECEIPT',
    disclaimer: 'Printer Bluetooth terhubung dengan baik! 100% bebas watermark pihak ketiga.',
    footerText: 'Powered by RelayPOS • Cloud Enterprise System',
    showStoreAddress: true,
    showStorePhone: true
  }

  return printReceiptViaBluetooth(dummyReceipt, paperWidth)
}
