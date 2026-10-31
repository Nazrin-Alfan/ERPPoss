// ==============================================================================
// DEFAULT MASTER DATA - STERILE PRODUCTION DEFAULTS
// Format generik dan netral untuk inisialisasi awal tenant / fallback sistem
// ==============================================================================

export const DEFAULT_MASTER_DATA = {
  kasir: [
    { nama: 'Kasir Utama', is_active: true }
  ],
  metode_bayar: [
    { nama: 'CASH', is_active: true },
    { nama: 'QRIS', is_active: true },
    { nama: 'TRANSFER', is_active: true }
  ],
  karyawan_cuci: [
    { nama: 'Operator 1', is_active: true },
    { nama: 'Operator 2', is_active: true }
  ],
  daftar_harga_menu: [],
  resep: [],
  diskon: [
    { nama_diskon: 'Promo Toko', tipe_diskon: 'PERSEN', nilai_diskon: 10, is_active: true }
  ],
  daftar_harga_layanan: [
    { id_layanan: 'SRV-01', nama_layanan: 'Cuci Mobil Standar', harga: 50000, kategori: 'Cuci Mobil', is_active: true }
  ]
};
