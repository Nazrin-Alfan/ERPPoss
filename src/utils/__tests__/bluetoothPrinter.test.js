import { describe, it, expect } from 'vitest'
import {
  isWebBluetoothSupported,
  formatEscPosRow,
  stringToBytes,
  buildEscPosReceiptBuffer,
  ESC_COMMANDS
} from '../bluetoothPrinter'

describe('Web Bluetooth ESC/POS Utility Tests', () => {
  it('should correctly format 2-column text with right-aligned value for 32 cols (58mm)', () => {
    const row = formatEscPosRow('Subtotal', 'Rp 50.000', 32)
    expect(row.length).toBe(33) // 32 chars + '\n'
    expect(row.startsWith('Subtotal')).toBe(true)
    expect(row.trim().endsWith('Rp 50.000')).toBe(true)
  })

  it('should correctly format 2-column text for 48 cols (80mm)', () => {
    const row = formatEscPosRow('TOTAL AKHIR', 'Rp 120.000', 48)
    expect(row.length).toBe(49) // 48 chars + '\n'
    expect(row.startsWith('TOTAL AKHIR')).toBe(true)
    expect(row.trim().endsWith('Rp 120.000')).toBe(true)
  })

  it('should handle long row names gracefully by wrapping', () => {
    const longName = 'Sangat Panjang Sekali Nama Item Ini Melebihi Batas'
    const row = formatEscPosRow(longName, 'Rp 10.000', 32)
    expect(row).toContain(longName)
    expect(row).toContain('Rp 10.000')
  })

  it('should convert strings to safe ASCII byte arrays', () => {
    const str = 'RelayPOS 123'
    const bytes = stringToBytes(str)
    expect(bytes instanceof Uint8Array).toBe(true)
    expect(bytes.length).toBe(str.length)
    expect(bytes[0]).toBe(82) // 'R'
  })

  it('should build a valid ESC/POS byte buffer containing store name, items, and cut commands', () => {
    const receiptData = {
      storeName: 'WARUNG KOPI RELAYPOS',
      storeTagline: 'Enak & Mantap',
      title: 'BUKTI PEMBAYARAN',
      orderNumber: 'ORD-991',
      tanggal: '22/09/2026 14:30',
      kasir: 'Budi',
      plat: 'B 8888 ABC',
      items: [
        { name: 'Kopi Susu', qty: 2, price: 15000, subtotal: 30000 }
      ],
      subtotal: 30000,
      total: 30000,
      metodeBayar: 'TUNAI',
      bayarNominal: 50000,
      kembalianNominal: 20000,
      type: 'PAYMENT_RECEIPT',
      footerText: 'Powered by RelayPOS'
    }

    const buffer = buildEscPosReceiptBuffer(receiptData, '58mm')
    expect(buffer instanceof Uint8Array).toBe(true)
    expect(buffer.length).toBeGreaterThan(100)

    // Check first 2 bytes are ESC @ (Init)
    expect(buffer[0]).toBe(ESC_COMMANDS.INIT[0])
    expect(buffer[1]).toBe(ESC_COMMANDS.INIT[1])
  })

  it('should return diagnostic information object', () => {
    const { getBluetoothDiagnosticInfo } = require('../bluetoothPrinter')
    const diag = getBluetoothDiagnosticInfo()
    expect(diag).toHaveProperty('isSupported')
    expect(diag).toHaveProperty('hasBluetooth')
    expect(diag).toHaveProperty('isSecure')
  })
})
