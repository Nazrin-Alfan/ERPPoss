/**
 * posService.js - POS Service Module for RelayPOS SaaS ERP
 * Enforces atomic checkout execution, server-side price validation,
 * and anti-overselling error handling.
 */

import { api } from './apiAdapter'

export class PosCheckoutError extends Error {
  constructor(message, code, details = {}) {
    super(message)
    this.name = 'PosCheckoutError'
    this.code = code
    this.details = details
  }
}

export const posService = {
  /**
   * Parse database RPC errors into user-friendly typed errors
   */
  parseCheckoutError(error) {
    const rawMsg = error?.message || String(error || '')

    if (rawMsg.includes('INSUFFICIENT_STOCK')) {
      const match = rawMsg.match(/INSUFFICIENT_STOCK:\s*(.*)/)
      const cleanDesc = match ? match[1].trim() : 'Stok produk/bahan baku di sistem tidak mencukupi untuk pesanan ini.'
      return new PosCheckoutError(cleanDesc, 'INSUFFICIENT_STOCK', { raw: rawMsg })
    }

    if (rawMsg.includes('PRICE_MISMATCH')) {
      const match = rawMsg.match(/PRICE_MISMATCH:\s*(.*)/)
      const cleanDesc = match ? match[1].trim() : 'Harga menu tidak sesuai dengan katalog resmi database.'
      return new PosCheckoutError(cleanDesc, 'PRICE_MISMATCH', { raw: rawMsg })
    }

    if (rawMsg.includes('MENU_NOT_FOUND')) {
      const match = rawMsg.match(/MENU_NOT_FOUND:\s*(.*)/)
      const cleanDesc = match ? match[1].trim() : 'Item menu tidak terdaftar dalam katalog resmi.'
      return new PosCheckoutError(cleanDesc, 'MENU_NOT_FOUND', { raw: rawMsg })
    }

    if (rawMsg.includes('INVALID_DISCOUNT')) {
      const match = rawMsg.match(/INVALID_DISCOUNT:\s*(.*)/)
      const cleanDesc = match ? match[1].trim() : 'Nominal diskon tidak valid atau melebihi total pesanan.'
      return new PosCheckoutError(cleanDesc, 'INVALID_DISCOUNT', { raw: rawMsg })
    }

    if (rawMsg.includes('DUPLICATE_TRANSACTION')) {
      return new PosCheckoutError('Nomor struk transaksi ini sudah pernah tersimpan sebelumnya.', 'DUPLICATE_TRANSACTION', { raw: rawMsg })
    }

    if (rawMsg.includes('PAYMENT_UNDERPAID')) {
      const match = rawMsg.match(/PAYMENT_UNDERPAID:\s*(.*)/)
      const cleanDesc = match ? match[1].trim() : 'Nominal pembayaran kurang dari total tagihan.'
      return new PosCheckoutError(cleanDesc, 'PAYMENT_UNDERPAID', { raw: rawMsg })
    }

    if (rawMsg.includes('FORBIDDEN')) {
      return new PosCheckoutError('Akses tenant tidak sah atau sesi telah berakhir.', 'FORBIDDEN', { raw: rawMsg })
    }

    if (rawMsg.includes('chk_stok_barang_non_negative')) {
      return new PosCheckoutError('Transaksi dibatalkan karena menyebabkan stok menjadi negatif.', 'INSUFFICIENT_STOCK', { raw: rawMsg })
    }

    return new PosCheckoutError(rawMsg || 'Terjadi kesalahan sistem saat memproses checkout.', 'UNKNOWN_ERROR', { raw: rawMsg })
  },

  /**
   * Executes atomic checkout via Backend RPC
   * Guarantees all-or-nothing execution across struk, cafe, carwash, and BOM inventory.
   */
  async executeCheckout({ tenantId, branchId, strukPayload, cafeItems = [], carwashPayload = null }) {
    if (!tenantId) {
      throw new PosCheckoutError('Tenant ID wajib disertakan untuk transaksi POS.', 'MISSING_TENANT_ID')
    }

    try {
      const result = await api.transaksi.executeCheckout({
        tenant_id: tenantId,
        branch_id: branchId || null,
        struk_payload: strukPayload,
        cafe_items: cafeItems,
        carwash_payload: carwashPayload
      })

      return {
        success: true,
        data: result
      }
    } catch (err) {
      throw this.parseCheckoutError(err)
    }
  },

  /**
   * Pre-flight stock availability checker for UI validation before submission
   */
  validateCartStock(cart = [], inventoryList = [], resepList = []) {
    const warnings = []

    for (const item of cart) {
      const recipes = resepList.filter(
        r => r.nama_menu === item.nama_menu || r.daftar_menu === item.nama_menu
      )

      if (recipes.length > 0) {
        for (const r of recipes) {
          const needed = (parseFloat(r.jumlah_dibutuhkan || r.jumlah || 0)) * (item.qty || 1)
          const stockItem = inventoryList.find(
            s => s.nama_produk === r.nama_bahan || s.nama_produk === r.nama_bahan_baku
          )
          if (stockItem && parseFloat(stockItem.stok || 0) < needed) {
            warnings.push({
              item: item.nama_menu,
              material: stockItem.nama_produk,
              available: parseFloat(stockItem.stok || 0),
              needed
            })
          }
        }
      } else {
        const directStock = inventoryList.find(
          s => (s.nama_produk || '').toLowerCase() === (item.nama_menu || '').toLowerCase()
        )
        if (directStock && parseFloat(directStock.stok || 0) < (item.qty || 1)) {
          warnings.push({
            item: item.nama_menu,
            material: directStock.nama_produk,
            available: parseFloat(directStock.stok || 0),
            needed: item.qty || 1
          })
        }
      }
    }

    return {
      isValid: warnings.length === 0,
      warnings
    }
  }
}

export default posService
