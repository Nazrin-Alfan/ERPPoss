import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatReceiptDate,
  formatRupiahReceipt,
  buildOrderReceiptData,
  buildPaymentReceiptData,
  generateWhatsAppReceiptMessage,
  calculateSettlementWithSurcharge,
  DEFAULT_RECEIPT_CONFIG,
  getReceiptConfig,
  saveReceiptConfig,
  clearReceiptStorageMock
} from '../receiptHelpers'

describe('Receipt Generator & Thermal Printing Helpers', () => {
  beforeEach(() => {
    clearReceiptStorageMock()
  })

  const sampleOrder = {
    id_struk: 'ord-12345678-abcd',
    tanggal: '2026-09-20',
    jam: '14:30:00',
    kasir: 'RIAN',
    status_bayar: 'Pending',
    total_tagihan: 75000,
    carwash: [
      {
        plat: 'B 1234 ABC',
        model: 'Innova Reborn',
        paket: 'PAKET CUCI BIASA',
        ukuran: 'Large',
        variant: 'Regular',
        harga: 75000,
        kehadiran: 'TINGGAL',
        no_telepon: '081234567890'
      }
    ],
    cafe: [
      {
        nama_menu: 'Es Kopi Susu',
        qty: 1,
        harga_satuan: 18000,
        subtotal: 18000
      }
    ]
  }

  it('1. should build correct Bukti Order data structure for dropped-off cars', () => {
    const receiptData = buildOrderReceiptData(sampleOrder)

    expect(receiptData.type).toBe('ORDER_DROP_OFF')
    expect(receiptData.title).toBe('BUKTI PENERIMAAN KENDARAAN')
    expect(receiptData.orderNumber).toBe('ORD-12345678')
    expect(receiptData.isPaid).toBe(false)
    expect(receiptData.kehadiran).toBe('DITINGGAL')
    expect(receiptData.plat).toBe('B 1234 ABC')
    expect(receiptData.model).toBe('Innova Reborn')
    expect(receiptData.items.length).toBeGreaterThan(0)
    expect(receiptData.disclaimer).toContain('Simpan bukti ini sebagai tanda terima')
  })

  it('2. should build correct Bukti Pembayaran data structure when paid', () => {
    const paidOrder = {
      ...sampleOrder,
      status_bayar: 'Selesai',
      metode_bayar: 'CASH',
      nominal_cash: 100000,
      nominal_qris: 0,
      uang_diterima: 100000,
      kembalian: 25000
    }

    const receiptData = buildPaymentReceiptData(paidOrder)

    expect(receiptData.type).toBe('PAYMENT_RECEIPT')
    expect(receiptData.title).toBe('STRUK BUKTI PEMBAYARAN')
    expect(receiptData.isPaid).toBe(true)
    expect(receiptData.metodeBayar).toBe('CASH')
    expect(receiptData.uangDiterima).toBe(100000)
    expect(receiptData.kembalian).toBe(25000)
  })

  it('3. should generate clean, formatted WhatsApp message for Bukti Order', () => {
    const receiptData = buildOrderReceiptData(sampleOrder)
    const { phone, url, message } = generateWhatsAppReceiptMessage(receiptData, '081234567890')

    expect(phone).toBe('6281234567890')
    expect(message).toContain('*RELAYPOS CARWASH & CAFE*')
    expect(message).toContain('*BUKTI PENERIMAAN KENDARAAN*')
    expect(message).toContain('B 1234 ABC')
    expect(message).toContain('ORD-12345678')
    expect(message).toContain('DITINGGAL')
    expect(url).toContain('https://wa.me/6281234567890?text=')
  })

  it('4. should calculate settlement correctly when custom overnight surcharge is applied', () => {
    const baseTotal = 75000
    const surcharge = {
      enabled: true,
      nominal: 50000,
      keterangan: 'Biaya Inap Kendaraan (1 Malam)'
    }

    const result = calculateSettlementWithSurcharge(baseTotal, surcharge)

    expect(result.finalTotal).toBe(125000)
    expect(result.surchargeAmount).toBe(50000)
    expect(result.surchargeDescription).toBe('Biaya Inap Kendaraan (1 Malam)')
  })

  it('5. should handle settlement without surcharge when disabled or zero', () => {
    const baseTotal = 75000
    const result = calculateSettlementWithSurcharge(baseTotal, { enabled: false, nominal: 50000 })

    expect(result.finalTotal).toBe(75000)
    expect(result.surchargeAmount).toBe(0)
  })

  it('6. should load default receipt configuration and support custom overrides', () => {
    const defaultConf = getReceiptConfig()
    expect(defaultConf.storeName).toBe('RELAYPOS CARWASH & CAFE')
    expect(defaultConf.orderReceiptTitle).toBe('BUKTI PENERIMAAN KENDARAAN')

    const customUpdate = {
      storeName: 'AUTO GLOSS & CAFE KEMANG',
      storeAddress: 'Jl. Kemang Raya No. 45',
      storePhone: '0811-9988-7766',
      orderReceiptTitle: 'TANDA TERIMA MOBIL MASUK',
      orderDisclaimer: 'Periksa barang berharga sebelum meninggalkan mobil Anda.'
    }

    saveReceiptConfig(customUpdate)
    const saved = getReceiptConfig()

    expect(saved.storeName).toBe('AUTO GLOSS & CAFE KEMANG')
    expect(saved.storeAddress).toBe('Jl. Kemang Raya No. 45')
    expect(saved.orderReceiptTitle).toBe('TANDA TERIMA MOBIL MASUK')

    // Data struk yang dibentuk otomatis menggunakan konfigurasi custom ini
    const customOrderReceipt = buildOrderReceiptData(sampleOrder)
    expect(customOrderReceipt.storeName).toBe('AUTO GLOSS & CAFE KEMANG')
    expect(customOrderReceipt.title).toBe('TANDA TERIMA MOBIL MASUK')
    expect(customOrderReceipt.disclaimer).toBe('Periksa barang berharga sebelum meninggalkan mobil Anda.')
    // Footer catatan kaki wajib terkunci sebagai media branding RelayPOS
    expect(customOrderReceipt.footerText).toBe('Powered by RelayPOS • Cloud Enterprise System')
  })
})
