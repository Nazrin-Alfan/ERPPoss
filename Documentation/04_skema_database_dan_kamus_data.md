# 🗄️ SKEMA DATABASE & KAMUS DATA (DATA DICTIONARY)
**Sistem Basis Data POS & Manajemen Operasional Jaya Bersama**

Dokumen ini berisi spesifikasi teknis basis data relasional (PostgreSQL di Supabase & SQLite D1 di Cloudflare), mencakup relasi foreign key, tipe data, indeks performa, serta fungsi kueri view.

---

## 📑 Daftar Tabel

| No | Nama Tabel | Deskripsi Fungsi | Level Arsitektur |
| :---: | :--- | :--- | :---: |
| 1 | `profiles` / `users` | Data akun pengguna (Owner & Kasir) | Master Data |
| 2 | `stok_barang` | Inventaris bahan baku F&B dan stok cuci | Master Data |
| 3 | `daftar_harga_menu` | Master katalog menu makanan & minuman | Master Data |
| 4 | `resep` | Komposisi bahan baku per menu (HPP) | Master Data |
| 5 | `karyawan_cuci` | Daftar anggota kru pencuci mobil | Master Data |
| 6 | `karyawan_kantor` | Daftar staf administrasi & operasional | Master Data |
| 7 | `struk` | Induk transaksi penjualan / nota kasir | Transaksi (Sub-Ledger) |
| 8 | `cafe` | Rincian item menu F&B per transaksi | Transaksi (Sub-Ledger) |
| 9 | `carwash` | Rincian pendaftaran jasa cuci mobil per transaksi | Transaksi (Sub-Ledger) |
| 10 | `cashflow` | Buku besar mutasi arus kas masuk & keluar | Finansial (General Ledger) |
| 11 | `pengeluaran` | Rincian beban belanja operasional | Finansial (General Ledger) |
| 12 | `barang_masuk` | Catatan restock / pembelian bahan baku | Inventaris |
| 13 | `barang_keluar` | Catatan pemakaian bahan baku di luar resep | Inventaris |

---

## 1. Kamus Data Master Data

### 1.1 Tabel `profiles`
*Menyimpan profil pengguna yang terotentikasi.*
* **`id`** (`UUID` / `TEXT`, Primary Key): ID unik terikat dengan `auth.users.id`.
* **`nama`** (`TEXT`, Not Null): Nama lengkap kasir/owner.
* **`role`** (`TEXT`, Not Null): Level hak akses (`'Owner'` atau `'Kasir'`).
* **`created_at`** (`TIMESTAMP`): Waktu pendaftaran akun.

### 1.2 Tabel `stok_barang`
*Menyimpan katalog bahan baku dan stok fisik.*
* **`id_bahan_baku`** (`TEXT`, Primary Key): Kode unik bahan baku (misal: `BB-001`).
* **`nama_bahan` / `nama_produk`** (`TEXT`, Not Null): Nama bahan baku.
* **`satuan`** (`TEXT`, Not Null): Satuan ukur (misal: `gr`, `ml`, `pcs`, `botol`).
* **`stok`** (`NUMERIC`, Default `0.0`): Kuantitas sisa stok fisik.
* **`harga_satuan`** (`NUMERIC`, Default `0.0`): Harga beli rata-rata per satuan.

### 1.3 Tabel `daftar_harga_menu`
*Katalog menu F&B Cafe yang dijual ke pelanggan.*
* **`id_menu`** (`TEXT`, Primary Key): Kode unik menu (misal: `MNU-001`).
* **`daftar_menu`** (`TEXT`, Not Null): Nama item menu (misal: `Americano`, `Sanger Panas`).
* **`harga`** (`NUMERIC`, Not Null): Harga jual ke konsumen.
* **`kategori`** (`TEXT`): Kategori menu (*Kopi, Non-Kopi, Makanan, Snack*).
* **`is_active`** (`INTEGER` / `BOOLEAN`): Status aktif menu.

### 1.4 Tabel `resep`
*Relasi many-to-many antara menu dan bahan baku untuk perhitungan HPP otomatis.*
* **`id_resep`** (`TEXT`, Primary Key): Kode unik resep.
* **`id_menu`** (`TEXT`, FK $\rightarrow$ `daftar_harga_menu.id_menu` ON DELETE CASCADE).
* **`id_bahan_baku`** (`TEXT`, FK $\rightarrow$ `stok_barang.id_bahan_baku` ON DELETE RESTRICT).
* **`jumlah`** (`NUMERIC`, Not Null): Takaran bahan yang digunakan per 1 porsi menu.
* **`satuan`** (`TEXT`, Not Null): Satuan takaran.

---

## 2. Kamus Data Transaksi (Sub-Ledger)

### 2.1 Tabel `struk`
*Induk transaksi kasir yang mengelompokkan pesanan Cafe dan Carwash.*
* **`id_struk`** (`TEXT`, Primary Key): Nomor unik struk (misal: `STR-20260903-001`).
* **`tanggal`** (`DATE`, Not Null): Tanggal transaksi (`YYYY-MM-DD`).
* **`jam`** (`TIME` / `TEXT`): Waktu cetak transaksi (`HH:MM:SS`).
* **`nama_pelanggan`** (`TEXT`): Nama pemesan atau nomor meja.
* **`metode_bayar`** (`TEXT`, Not Null): `'CASH'`, `'QRIS'`, atau `'SPLIT'`.
* **`nominal_cash`** (`NUMERIC`, Default `0.0`): Porsi pembayaran tunai.
* **`nominal_qris`** (`NUMERIC`, Default `0.0`): Porsi pembayaran non-tunai.
* **`diskon_carwash`** (`NUMERIC`, Default `0.0`): Potongan harga layanan cuci.
* **`diskon_cafe`** (`NUMERIC`, Default `0.0`): Potongan harga menu F&B.
* **`total_tagihan`** (`NUMERIC`, Not Null): Total akhir yang harus dibayar konsumen.
* **`status_bayar`** (`TEXT`, Not Null): `'Selesai'`, `'Pending'`, atau `'Batal'`.
* **`kasir`** (`TEXT`, Not Null): Nama kasir yang melayani.

### 2.2 Tabel `cafe`
*Rincian item makanan/minuman yang terjual pada satu struk.*
* **`id_detail`** (`TEXT`, Primary Key): ID baris pesanan.
* **`id_struk`** (`TEXT`, FK $\rightarrow$ `struk.id_struk` ON DELETE CASCADE).
* **`nama_menu`** (`TEXT`, Not Null): Nama menu yang dipesan.
* **`qty`** (`INTEGER`, Not Null): Jumlah porsi yang dipesan.
* **`harga_satuan`** (`NUMERIC`, Not Null): Harga satuan saat transaksi dibuat.
* **`subtotal`** (`NUMERIC`, Not Null): Hasil kali `qty * harga_satuan`.

### 2.3 Tabel `carwash`
*Rincian kendaraan cuci mobil pada satu struk.*
* **`id_transaksi`** (`TEXT`, Primary Key): ID unik cuci mobil.
* **`id_struk`** (`TEXT`, FK $\rightarrow$ `struk.id_struk` ON DELETE CASCADE).
* **`tanggal`** (`DATE`, Not Null): Tanggal kedatangan mobil.
* **`jam`** (`TIME` / `TEXT`): Jam kedatangan mobil.
* **`plat`** (`TEXT`, Not Null): Nomor polisi mobil.
* **`model`** (`TEXT`): Merk/model mobil (misal: *Avanza, HR-V*).
* **`no_telepon`** (`TEXT`): Nomor WhatsApp pemilik untuk CRM.
* **`ukuran`** (`TEXT`): `'Small'`, `'Medium'`, `'Large'`, `'Extra Large'`, `'Custom'`.
* **`variant`** (`TEXT`): `'Regular'` (luar-dalam) atau `'Body only'`.
* **`paket`** (`TEXT`): Paket layanan tambahan (misal: *Wax, Jamur Kaca*).
* **`kehadiran`** (`TEXT`): `'TUNGGU'` atau `'TINGGAL'`.
* **`harga`** (`NUMERIC`, Not Null): Biaya total cuci mobil.
* **`anggota_1`** (`TEXT`, Not Null): Nama kru pencuci utama.
* **`anggota_2`** (`TEXT`): Nama kru pencuci pembantu (opsional).
* **`gaji_pencuci`** (`NUMERIC`): Total alokasi anggaran komisi cuci.
* **`gaji_anggota`** (`NUMERIC`): Komisi bersih yang diterima per kru cuci.
* **`status`** (`TEXT`): `'Dalam Antrean'`, `'Sedang Dicuci'`, `'Selesai'`, `'Batal'`.

---

## 3. Kamus Data Finansial (General Ledger)

### 3.1 Tabel `cashflow`
*Buku kas besar mencatat seluruh aliran uang masuk dan keluar.*
* **`id_cashflow`** (`TEXT`, Primary Key): Kode unik jurnal arus kas.
* **`id_sumber`** (`TEXT`): Menghubungkan ke `id_struk` (Tutup Kasir) atau `id_pengeluaran`.
* **`tanggal`** (`DATE`, Not Null): Tanggal jurnal.
* **`keterangan_transaksi`** (`TEXT`, Not Null): Deskripsi transaksi.
* **`jenis`** (`TEXT`, Not Null): `'Pemasukan'` atau `'Pengeluaran'`.
* **`kategori`** (`TEXT`, Not Null): Kategori biaya/pendapatan (misal: *Omzet Harian (CASH), Omzet Harian (QRIS), Modal Awal, Bahan Baku, Gaji Kru, Sewa, Listrik, Kasbon*).
* **`pemasukan`** (`NUMERIC`, Default `0.0`): Nilai uang masuk.
* **`pengeluaran`** (`NUMERIC`, Default `0.0`): Nilai uang keluar.
* **`pos`** (`TEXT`, Not Null): Akun laci/rekening penampung (`'SALDO CASH'`, `'SALDO REKENING Y'`, `'SALDO REKENING N'`).

### 3.2 Tabel `pengeluaran`
*Rincian pencatatan nota belanja operasional.*
* **`id_pengeluaran`** (`TEXT`, Primary Key): Kode pengeluaran.
* **`id_cashflow`** (`TEXT`, FK $\rightarrow$ `cashflow.id_cashflow` ON DELETE SET NULL).
* **`tanggal`** (`DATE`, Not Null): Tanggal belanja.
* **`jam`** (`TIME`): Jam transaksi.
* **`nama_pengeluaran`** (`TEXT`, Not Null): Rincian barang/jasa yang dibeli.
* **`jenis`** (`TEXT`): Divisi beban (*Beban Cafe, Beban Carwash, Beban Umum*).
* **`kategori`** (`TEXT`): *Bahan Baku, Listrik, Perlengkapan, dsb.*
* **`nominal`** (`NUMERIC`, Not Null): Jumlah uang yang dikeluarkan.

---

## 4. Database Views & Agregasi

### 4.1 View `pos_balances`
Menghitung saldo sisa berjalan per pos rekening:
```sql
CREATE OR REPLACE VIEW public.pos_balances AS
SELECT 
    pos,
    COALESCE(SUM(pemasukan - pengeluaran), 0.00) AS balance
FROM public.cashflow
GROUP BY pos;
```

---

## 5. Indeks Kinerja yang Disarankan (Performance Indices)

Untuk mempercepat query filtering tanggal pada ribuan baris data:
```sql
CREATE INDEX IF NOT EXISTS idx_struk_tanggal ON public.struk(tanggal);
CREATE INDEX IF NOT EXISTS idx_carwash_tanggal ON public.carwash(tanggal);
CREATE INDEX IF NOT EXISTS idx_carwash_plat ON public.carwash(plat);
CREATE INDEX IF NOT EXISTS idx_cashflow_tanggal ON public.cashflow(tanggal);
CREATE INDEX IF NOT EXISTS idx_cashflow_pos ON public.cashflow(pos);
CREATE INDEX IF NOT EXISTS idx_cafe_id_struk ON public.cafe(id_struk);
```
