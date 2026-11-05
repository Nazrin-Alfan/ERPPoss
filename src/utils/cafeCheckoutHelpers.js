import { generateUUID } from './helpers'
import { posService } from '../services/posService'
import { buildPaymentReceiptData, getReceiptConfig } from './receiptHelpers'

/**
 * Helper eksekusi transaksi checkout dan pelunasan bill meja Cafe.
 * Menjamin isolasi parameter, integritas kembalian, dan proteksi dari error 'kembalian is not defined'.
 */
export const processCafeCheckout = async ({
  cart = [],
  settlingBill = null,
  selectedPayment = 'CASH',
  nominalBayar = 0,
  tableOrCustomer = '',
  orderNotes = '',
  selectedCashier = 'KASIR UTAMA',
  effectiveTenantId,
  activeTenant = null,
  subtotal = 0,
  diskonAmount = 0,
  grandTotal = 0,
  effectiveSubtotal = 0,
  effectiveDiskon = 0,
  effectiveGrandTotal = 0,
  effectiveKembalian = 0,
  posServiceInstance = posService,
  receiptConfigGetter = getReceiptConfig,
  receiptBuilder = buildPaymentReceiptData,
  setActiveReceipt = () => {},
  setSuccess = () => {},
  setError = () => {},
  setLoading = () => {},
  handleClearCart = () => {},
  loadPendingBills = () => {}
}) => {
  if (cart.length === 0) {
    const msg = 'Keranjang belanja masih kosong.'
    setError(msg)
    return { success: false, error: msg }
  }

  if (selectedPayment === 'CASH' && (Number(nominalBayar) || 0) < effectiveGrandTotal) {
    const msg = 'Nominal pembayaran tunai kurang dari total tagihan.'
    setError(msg)
    return { success: false, error: msg }
  }

  setLoading(true)
  setError('')
  try {
    const todayDate = new Date().toLocaleDateString('en-CA')
    const currentTime = new Date().toTimeString().split(' ')[0]
    const strukId = settlingBill?.id_struk || `STRUK-${Date.now().toString().slice(-6)}`

    // 1. Simpan Header Struk Lunas via posService Atomic RPC
    const strukPayload = {
      id_struk: strukId,
      tenant_id: effectiveTenantId,
      tanggal: todayDate,
      jam: currentTime,
      nama_pelanggan: (tableOrCustomer || '').trim() || 'Pelanggan Walk-In',
      no_meja: (tableOrCustomer || '').trim() || '-',
      total_biaya: grandTotal,
      total_tagihan: grandTotal,
      subtotal: subtotal,
      diskon: diskonAmount,
      metode_bayar: selectedPayment,
      nominal_bayar: Number(nominalBayar) || grandTotal,
      nominal_cash: selectedPayment === 'CASH' ? (Number(nominalBayar) || grandTotal) : 0,
      nominal_qris: selectedPayment !== 'CASH' ? grandTotal : 0,
      kembalian: effectiveKembalian,
      status_bayar: 'Selesai',
      kasir: selectedCashier || 'KASIR UTAMA',
      catatan: orderNotes,
      created_at: new Date().toISOString(),
      waktu_dibayar: new Date().toISOString()
    }

    // 2. Siapkan Item Menu
    const itemsPayload = cart.map(item => ({
      id_detail: generateUUID(),
      id_struk: strukId,
      tenant_id: effectiveTenantId,
      tanggal: todayDate,
      jam: currentTime,
      nama_menu: item.nama_menu,
      harga: item.harga,
      qty: item.qty,
      total: item.harga * item.qty,
      catatan: item.catatan || '',
      created_at: new Date().toISOString()
    }))

    let settleRes = null
    let receiptData = null

    // 3. Eksekusi Atomic Server-side Checkout / Settlement
    if (settlingBill) {
      // Pelunasan tagihan meja terbuka atomik (mencegah pemotongan stok ganda & inkonsistensi keranjang)
      const settleBillTotal = effectiveGrandTotal
      const settleUangDiterima = selectedPayment === 'CASH' ? (Number(nominalBayar) || settleBillTotal) : settleBillTotal
      const settleKembalian = selectedPayment === 'CASH' && settleUangDiterima > settleBillTotal
        ? Math.round((settleUangDiterima - settleBillTotal) * 100) / 100
        : 0

      settleRes = await posServiceInstance.settlePendingBill({
        tenantId: effectiveTenantId,
        branchId: null,
        settlePayload: {
          id_struk: settlingBill.id_struk,
          metode_bayar: selectedPayment,
          base_total: settleBillTotal,
          total_tagihan: settleBillTotal,
          nominal_bayar: settleBillTotal,
          uang_diterima: settleUangDiterima,
          nominal_cash: selectedPayment === 'CASH' ? settleBillTotal : 0,
          nominal_qris: selectedPayment !== 'CASH' ? settleBillTotal : 0,
          kembalian: settleKembalian,
          idempotency_key: settlingBill.attemptKey
        }
      })

      // 4. Siapkan Data Struk Cetak Thermal Menggunakan Kontrak Helper Asli & Nilai Tersimpan DB
      const receiptConfig = receiptConfigGetter()
      if (receiptConfig?.autoPrintOnCheckout !== false) {
        const settledData = settleRes?.data || {}
        const receiptItems = (settlingBill.savedItems && settlingBill.savedItems.length > 0)
          ? settlingBill.savedItems
          : cart

        receiptData = receiptBuilder({
          id_struk: settlingBill.id_struk,
          receiptNumber: settlingBill.id_struk,
          tanggal: todayDate,
          jam: currentTime,
          kasir: selectedCashier || settlingBill.kasir || 'KASIR',
          no_meja: tableOrCustomer || settlingBill.no_meja || '',
          nama_pelanggan: tableOrCustomer || settlingBill.nama_pelanggan || 'Pelanggan Cafe',
          cafe: receiptItems.map(i => ({
            nama_menu: i.nama_menu || i.name,
            qty: Number(i.qty || 1),
            harga_satuan: Number(i.harga || i.price || 0),
            subtotal: Number(i.subtotal || (Number(i.qty || 1) * Number(i.harga || i.price || 0))),
            catatan: i.catatan || i.notes || ''
          })),
          subtotal: effectiveSubtotal,
          diskon_cafe: effectiveDiskon,
          total_tagihan: Number(settledData.total_tagihan || settleBillTotal),
          metode_bayar: selectedPayment,
          uang_diterima: Number(settledData.uang_diterima || settleUangDiterima),
          kembalian: settledData.kembalian !== undefined ? Number(settledData.kembalian) : settleKembalian,
          tenantName: activeTenant?.nama || activeTenant?.name || 'Cafe RelayPOS'
        })
        setActiveReceipt(receiptData)
      }
    } else {
      // Transaksi baru langsung lunas (termasuk pengurangan stok BOM otomatis)
      await posServiceInstance.executeCheckout({
        tenantId: effectiveTenantId,
        branchId: null,
        strukPayload,
        cafeItems: itemsPayload,
        carwashPayload: null
      })

      // 4. Siapkan Data Struk Cetak Thermal Menggunakan Kontrak Helper Asli
      const receiptConfig = receiptConfigGetter()
      if (receiptConfig?.autoPrintOnCheckout !== false) {
        receiptData = receiptBuilder({
          id_struk: strukId,
          receiptNumber: strukId,
          tanggal: todayDate,
          jam: currentTime,
          kasir: selectedCashier || 'KASIR',
          no_meja: tableOrCustomer || '',
          nama_pelanggan: tableOrCustomer || 'Pelanggan Cafe',
          cafe: cart.map(i => ({
            nama_menu: i.nama_menu,
            qty: Number(i.qty || 1),
            harga_satuan: Number(i.harga || 0),
            subtotal: Number(i.harga * i.qty),
            catatan: i.catatan || ''
          })),
          subtotal: subtotal,
          diskon_cafe: diskonAmount,
          total_tagihan: grandTotal,
          metode_bayar: selectedPayment,
          uang_diterima: Number(nominalBayar) || grandTotal,
          kembalian: effectiveKembalian,
          tenantName: activeTenant?.nama || activeTenant?.name || 'Cafe RelayPOS'
        })
        setActiveReceipt(receiptData)
      }
    }

    setSuccess(true)
    handleClearCart()
    loadPendingBills()
    setTimeout(() => setSuccess(false), 3000)
    return { success: true, strukPayload, settleRes, receiptData }
  } catch (err) {
    console.error('Checkout error:', err)
    setError(err.message || 'Gagal memproses transaksi kasir')
    return { success: false, error: err.message || 'Gagal memproses transaksi kasir' }
  } finally {
    setLoading(false)
  }
}
