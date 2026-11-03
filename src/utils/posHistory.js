import { buildPaymentReceiptData } from './receiptHelpers'

export const mapPosHistoryTransaction = item => ({
  id: item.id_struk,
  tanggal: item.tanggal,
  jam: item.jam,
  kasir: item.kasir,
  total_harga: item.total_tagihan,
  metode_bayar: item.metode_bayar,
  status_bayar: item.status_bayar,
  nama_pelanggan: item.nama_pelanggan,
  nominal_cash: item.nominal_cash,
  nominal_qris: item.nominal_qris,
  uang_diterima: item.uang_diterima,
  kembalian: item.kembalian,
  waktu_dibayar: item.waktu_dibayar,
  cafe: (item.cafe || []).map(c => ({
    nama_menu: c.nama_menu,
    jumlah: c.qty,
    harga_satuan: c.harga_satuan
  })),
  carwash: (item.carwash || []).map(cw => ({
    paket: cw.paket,
    plat_nomor: cw.plat,
    harga: cw.harga,
    merk_mobil: cw.model,
    no_telepon: cw.no_telepon,
    kehadiran: cw.kehadiran
  }))
})

export const buildHistoryPaymentReceipt = (tx, tenantName) => buildPaymentReceiptData({
  tenantName,
  id_struk: tx.id,
  tanggal: tx.tanggal,
  jam: tx.jam,
  kasir: tx.kasir,
  status_bayar: tx.status_bayar,
  metode_bayar: tx.metode_bayar,
  nominal_cash: tx.nominal_cash,
  nominal_qris: tx.nominal_qris,
  uang_diterima: tx.uang_diterima,
  kembalian: tx.kembalian,
  total_tagihan: tx.total_harga,
  carwash: tx.carwash?.map(cw => ({
    plat: cw.plat_nomor,
    model: cw.merk_mobil,
    paket: cw.paket,
    harga: cw.harga,
    kehadiran: cw.kehadiran || 'hadir',
    no_telepon: cw.no_telepon || ''
  })) || [],
  cafe: tx.cafe?.map(c => ({
    nama_menu: c.nama_menu,
    qty: c.jumlah,
    harga_satuan: c.harga_satuan,
    subtotal: c.jumlah * c.harga_satuan
  })) || []
})
