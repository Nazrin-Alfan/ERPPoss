# 📖 PANDUAN PENGGUNAAN APLIKASI (USER MANUAL & SOP)
**Sistem WebApp POS & Manajemen Operasional Jaya Bersama (Cafe & Carwash)**

Dokumen ini merupakan panduan operasional langkah-demi-langkah bagi **Kasir**, **Operator/Pengawas Cuci**, serta **Owner/Finance Administrator** dalam mengoperasikan aplikasi POS Jaya Bersama.

---

## 📑 Daftar Isi
1. [Akses Masuk & Autentikasi](#1-akses-masuk--autentikasi)
2. [SOP Kasir: Modul POS Cafe & Carwash (`CafePOS.jsx`)](#2-sop-kasir-modul-pos-cafe--carwash)
   - [2.1 Buka Kasir & Input Modal Awal](#21-buka-kasir--input-modal-awal)
   - [2.2 Transaksi F&B Cafe](#22-transaksi-fb-cafe)
   - [2.3 Pendaftaran Layanan Carwash & Smart Auto-Fill](#23-pendaftaran-layanan-carwash--smart-auto-fill)
   - [2.4 Gabungan Transaksi (Cafe + Carwash)](#24-gabungan-transaksi-cafe--carwash)
   - [2.5 Penerapan Diskon / Promo](#25-penerapan-diskon--promo)
   - [2.6 Metode Pembayaran (CASH, QRIS, & Split Payment)](#26-metode-pembayaran-cash-qris--split-payment)
   - [2.7 Pembayaran Pending (Sistem Meja / Bayar Nanti)](#27-pembayaran-pending-sistem-meja--bayar-nanti)
   - [2.8 Input Pengeluaran Kasir Cepat (Petty Cash)](#28-input-pengeluaran-kasir-cepat-petty-cash)
   - [2.9 Cetak Struk Fisik & Digital](#29-cetak-struk-fisik--digital)
   - [2.10 Prosedur Tutup Kasir / End of Day (EOD)](#210-prosedur-tutup-kasir--end-of-day-eod)
3. [SOP Pengawas Cuci: Modul Antrean Carwash (`CarwashQueue.jsx`)](#3-sop-pengawas-cuci-modul-antrean-carwash)
   - [3.1 Memantau Antrean Mobil Masuk](#31-memantau-antrean-mobil-masuk)
   - [3.2 Memfilter Antrean (Tunggu vs Tinggal)](#32-memfilter-antrean-tunggu-vs-tinggal)
   - [3.3 Mengubah Status Pengerjaan (Antrean → Cuci → Selesai)](#33-mengubah-status-pengerjaan-antrean--cuci--selesai)
4. [SOP Finance & Owner: Modul Keuangan (`Finance.jsx`)](#4-sop-finance--owner-modul-keuangan)
   - [4.1 Memantau Saldo POS (Laci Cash, Mandiri, BCA)](#41-memantau-saldo-pos-laci-cash-mandiri-bca)
   - [4.2 Input Pengeluaran Operasional & Modal](#42-input-pengeluaran-operasional--modal)
   - [4.3 Filter Periode Transaksi & Audit Mutasi](#43-filter-periode-transaksi--audit-mutasi)
   - [4.4 Ekspor Laporan Keuangan ke CSV / Excel](#44-ekspor-laporan-keuangan-ke-csv--excel)
5. [SOP Payroll & HRD: Modul Karyawan (`Karyawan.jsx`)](#5-sop-payroll--hrd-modul-karyawan)
   - [5.1 Setup Master Kru Cuci & Staf Kantor](#51-setup-master-kru-cuci--staf-kantor)
   - [5.2 Perhitungan Komisi Kru Cuci Periode Gaji (Cut-off 16-15)](#52-perhitungan-komisi-kru-cuci-periode-gaji-cut-off-16-15)
   - [5.3 Crosscheck Rincian Pekerjaan Pencuci](#53-crosscheck-rincian-pekerjaan-pencuci)
   - [5.4 Proses Pembayaran Gaji / Kasbon](#54-proses-pembayaran-gaji--kasbon)
6. [SOP Manajemen Data: Modul Database (`Database.jsx`)](#6-sop-manajemen-data-modul-database)
   - [6.1 Manajemen Menu F&B & Resep HPP](#61-manajemen-menu-fb--resep-hpp)
   - [6.2 Manajemen Stok Bahan Baku](#62-manajemen-stok-bahan-baku)
   - [6.3 Koreksi & Edit Data Transaksi](#63-koreksi--edit-data-transaksi)
7. [Panduan Dashboard & Analitik CRM (`Dashboard.jsx`)](#7-panduan-dashboard--analitik-crm)
   - [7.1 Monitoring KPI Omzet & Profitabilitas](#71-monitoring-kpi-omzet--profitabilitas)
   - [7.2 Analisis Food Cost Cafe & Efisiensi Bahan](#72-analisis-food-cost-cafe--efisiensi-bahan)
   - [7.3 Analisis Loyalitas Pelanggan (VIP, Reguler, Baru)](#73-analisis-loyalitas-pelanggan-vip-reguler-baru)
8. [Panduan Troubleshooting & FAQ](#8-panduan-troubleshooting--faq)

---

## 1. Akses Masuk & Autentikasi

1. Buka URL aplikasi POS pada browser (Google Chrome / Microsoft Edge disarankan).
2. Masukkan **Email** dan **Password** yang telah didaftarkan.
3. Klik tombol **Masuk**.
4. Sistem membagi hak akses ke dalam dua level:
   * **Role Kasir**: Memiliki akses ke menu *POS Kasir*, *Antrean Carwash*, dan *Dashboard*.
   * **Role Owner / Admin**: Memiliki akses penuh ke seluruh menu termasuk *Keuangan (Finance)*, *Karyawan (Payroll)*, *Master Database*, dan *Admin Settings*.

---

## 2. SOP Kasir: Modul POS Cafe & Carwash (`CafePOS.jsx`)

Modul ini adalah pusat transaksi kasir harian untuk melayani pelanggan Cafe dan pendaftaran cuci mobil.

### 2.1 Buka Kasir & Input Modal Awal
1. Saat pertama kali membuka halaman POS di awal shift, periksa apakah modal awal hari ini sudah terisi.
2. Jika belum, klik banner **Modal Kasir** / tombol **Input Modal Awal**.
3. Masukkan nominal uang pecahan kecil/kembalian di laci kasir (misal: `Rp 200.000`).
4. Klik **Simpan Modal**. Sistem akan mencatat saldo awal ke rekening `SALDO CASH`.

---

### 2.2 Transaksi F&B Cafe
1. Pilih tab **Menu Cafe** di bagian atas.
2. Pilih nama **Kasir Bertugas** pada dropdown kasir.
3. Pilih kategori menu (Kopi, Non-Kopi, Makanan, Snack) atau gunakan kolom **Pencarian Menu**.
4. Klik pada kartu menu untuk menambahkan ke keranjang:
   * Gunakan tombol `+` atau `-` untuk mengubah kuantitas (*quantity*).
   * Tambahkan catatan khusus (misal: *Less Sugar*, *Pedas Sedang*) jika diperlukan.
   * Klik ikon tong sampah jika ingin menghapus item dari keranjang.

---

### 2.3 Pendaftaran Layanan Carwash & Smart Auto-Fill
1. Pilih tab **Carwash**.
2. Masukkan **Plat Nomor Kendaraan** (contoh: `BK 1234 AB`):
   * **Fitur Smart Auto-Fill**: Jika kendaraan pernah mencuci sebelumnya, setelah Anda mengetik $\ge 4$ karakter, sistem otomatis mengisi **Merk/Tipe Mobil**, **Ukuran**, **Varian**, dan **No WhatsApp Pelanggan**.
3. Jika kendaraan baru:
   * Masukkan **Model/Merk Mobil** (misal: *Avanza, Innova, Fortuner*).
   * Pilih **Ukuran**: *Small, Medium, Large, Extra Large, Custom*.
   * Pilih **Varian**: *Regular* (cuci lengkap luar dalam) atau *Body Only* (hanya bodi luar).
   * Masukkan **No WhatsApp** pelanggan (diawali format `08...`) untuk pengiriman struk/CRM.
4. Pilih **Status Kehadiran**:
   * **Tunggu**: Pelanggan menunggu di tempat (ruang tunggu cafe).
   * **Tinggal**: Pelanggan meninggalkan kendaraan dan akan kembali nanti.
5. **Alokasi Kru Cuci (Komisi)**:
   * Pilih **Pencuci 1** (Wajib).
   * Pilih **Pencuci 2** (Opsional jika pengerjaan berdua).
   * Sistem otomatis membagi jatah upah cuci secara adil (50:50 jika berdua).
6. Klik tombol **Tambah ke Transaksi**.

---

### 2.4 Gabungan Transaksi (Cafe + Carwash)
Aplikasi mendukung satu struk untuk pesanan Cafe dan Carwash sekaligus:
* Anda dapat mengisi pesanan Cafe, lalu beralih ke tab Carwash untuk memasukkan mobil, atau sebaliknya.
* Seluruh item akan terakumulasi di panel **Ringkasan Tagihan (Keranjang Transaksi)** sebelah kanan.

---

### 2.5 Penerapan Diskon / Promo
Jika ada program promo atau voucher:
1. Di bawah ringkasan tagihan, klik tombol **Tambah Diskon**.
2. Masukkan nominal diskon untuk item Carwash atau Cafe.
3. Total tagihan otomatis terpotong secara transparan.

---

### 2.6 Metode Pembayaran (CASH, QRIS, & Split Payment)
Pilih metode bayar pada panel kasir:
1. **CASH (Tunai)**:
   * Masukkan jumlah uang tunai yang diterima dari pelanggan.
   * Gunakan tombol nominal cepat (*Uang Pas, 50k, 100k*).
   * Sistem akan otomatis menampilkan **Uang Kembalian**.
2. **QRIS (Non-Tunai)**:
   * Arahkan pelanggan untuk memindai QRIS statis/dinamis yang tersedia di meja kasir.
   * Pastikan notifikasi dana masuk telah terverifikasi sebelum menekan tombol bayar.
3. **Split Payment (Kombinasi Tunai + QRIS)**:
   * Aktifkan opsi **Split Payment**.
   * Masukkan nominal porsi **CASH** dan porsi **QRIS**.
   * Pastikan total kombinasi pas dengan total tagihan.

---

### 2.7 Pembayaran Pending (Sistem Meja / Bayar Nanti)
Jika pelanggan cafe memesan terlebih dahulu dan akan membayar setelah selesai makan:
1. Masukkan nama/nomor meja di kolom **Nama Pelanggan / No Meja**.
2. Ubah status bayar menjadi **Pending (Bayar Nanti)**.
3. Klik **Simpan Transaksi**.
4. Pesanan akan tersimpan di daftar **Tagihan Tertunda (Pending Bills)**.
5. Saat pelanggan hendak membayar, buka daftar *Pending Bills*, klik **Selesaikan Pembayaran**, lalu lakukan proses pelunasan.

---

### 2.8 Input Pengeluaran Kasir Cepat (Petty Cash)
Jika kasir mengeluarkan uang tunai dari laci untuk keperluan darurat (misal: beli es batu, galon aqua, gas):
1. Klik tombol **Catat Pengeluaran Laci** pada halaman POS.
2. Masukkan **Nama Pengeluaran** dan **Nominal**.
3. Pilih Kategori (*Bahan Baku, Operasional, dll.*).
4. Klik **Simpan**. Sistem langsung memotong posisi saldo fisik `SALDO CASH` secara akurat.

---

### 2.9 Cetak Struk Fisik & Digital
Setelah transaksi selesai:
1. Dialog **Transaksi Berhasil** akan muncul.
2. **Cetak Thermal USB / Bluetooth**: Klik **Cetak Struk 58mm / 80mm**. Struk kasir akan dicetak ke printer POS.
3. **Kirim Struk WhatsApp**: Jika nomor telepon pelanggan terisi, klik **Kirim Struk WA** untuk mengirim rincian transaksi langsung ke WhatsApp pelanggan.

---

### 2.10 Prosedur Tutup Kasir / End of Day (EOD)
Dilakukan di akhir jam operasional sebelum kasir pulang:
1. Klik tombol **Tutup Kasir (End of Day)** di sudut atas halaman POS.
2. Modal ringkasan tutup kasir akan menampilkan:
   * **Total Omzet CASH Harian**
   * **Total Omzet QRIS Harian**
   * **Total Pengeluaran Kasir dari Laci**
   * **Total Uang Fisik yang Seharusnya Ada di Laci**:
     $$\text{Uang Fisik Seharusnya} = \text{Modal Awal} + \text{Omzet CASH} - \text{Pengeluaran Laci}$$
3. Hitung uang fisik nyata di laci kasir, lalu masukkan nominalnya ke kolom **Uang Fisik Dihitung (Aktual)**.
4. Jika terdapat selisih (lebih/kurang), sistem akan menghitung nilai selisih kas.
5. Masukkan catatan jika ada keterangan khusus.
6. Klik **Konfirmasi & Tutup Kasir**. Sistem akan memposting jurnal cashflow harian ke buku besar (*General Ledger*).

---

## 3. SOP Pengawas Cuci: Modul Antrean Carwash (`CarwashQueue.jsx`)

Halaman ini digunakan oleh mandor/pengawas cuci atau dipasang pada monitor area cuci (*Wash Bay Display*).

### 3.1 Memantau Antrean Mobil Masuk
* Layar menampilkan daftar seluruh mobil yang masuk hari ini secara berurutan sesuai jam kedatangan.
* Setiap kartu menampilkan: Plat Nomor, Tipe/Merk Mobil, Paket Cuci, Nama Kru Cuci yang bertugas, serta Status Bayar (Lunas/Pending).

### 3.2 Memfilter Antrean (Tunggu vs Tinggal)
* Gunakan tombol filter di bagian atas:
  * **SEMUA**: Menampilkan seluruh kendaraan.
  * **TUNGGU**: Kendaraan yang pemiliknya menunggu di tempat (Prioritas kecepatan pengerjaan).
  * **TINGGAL**: Kendaraan yang ditinggal pemiliknya.

### 3.3 Mengubah Status Pengerjaan
Klik tombol status pada kartu antrean untuk memperbarui progres:
1. **Dalam Antrean** *(Kuning)*: Mobil baru datang dan sedang menunggu giliran.
2. **Sedang Dicuci** *(Biru)*: Mobil telah masuk ke pit pencucian dan sedang dikerjakan oleh kru.
3. **Selesai** *(Hijau)*: Mobil selesai dicuci, divakum, dan siap diserahkan ke pelanggan.

---

## 4. SOP Finance & Owner: Modul Keuangan (`Finance.jsx`)

Modul untuk manajemen arus kas, rekonsiliasi bank, dan audit mutasi keuangan menyeluruh.

### 4.1 Memantau Saldo POS
Halaman menampilkan 3 kartu saldo utama secara *real-time*:
* **SALDO CASH**: Saldo uang fisik di laci kasir operasional.
* **SALDO REKENING Y (BCA)**: Saldo rekening penerimaan/omzet utama.
* **SALDO REKENING N (Mandiri)**: Saldo rekening operasional/cadangan.

---

### 4.2 Input Pengeluaran Operasional & Modal
1. Klik tombol **+ Tambah Pengeluaran** atau **+ Tambah Pemasukan**.
2. Lengkapi formulir:
   * **Tanggal Transaksi**
   * **Kategori**: *Bahan Baku, Gaji Kru, Sewa, Listrik & Air, Kasbon, Pindah Saldo, dll.*
   * **Sumber / Tujuan POS**: Pilih apakah uang keluar dari *SALDO CASH*, *REKENING Y*, atau *REKENING N*.
   * **Nominal (Rp)** dan **Keterangan Detail**.
3. Klik **Simpan Transaksi**. Saldo POS terkait akan otomatis bertambah atau berkurang.

---

### 4.3 Filter Periode Transaksi & Audit Mutasi
* Gunakan preset periode cepat: **Hari Ini**, **Kemarin**, **7 Hari Terakhir**, **Bulan Ini**, atau **Custom Tanggal** (Pilih rentang tanggal bebas).
* Gunakan tab filter:
  * **Semua Cashflow**: Mutasi keseluruhan uang masuk & keluar.
  * **Omzet Carwash**: Detail performa pendapatan carwash.
  * **Omzet Cafe**: Detail penjualan makanan & minuman.
  * **Pengeluaran**: Rekapitulasi seluruh beban biaya operasional.

---

### 4.4 Ekspor Laporan Keuangan ke CSV / Excel
1. Terapkan filter tanggal dan kategori yang ingin dilaporkan.
2. Klik tombol **Export CSV / Excel** di pojok kanan atas tabel.
3. File `.csv` siap dibuka langsung menggunakan Microsoft Excel atau Google Sheets untuk laporan pajak dan pembukuan bulanan.

---

## 5. SOP Payroll & HRD: Modul Karyawan (`Karyawan.jsx`)

Modul ini digunakan untuk mengelola komisi kru cuci mobil dan staf kantor.

### 5.1 Setup Master Kru Cuci & Staf Kantor
* Buka tab **Kru Cuci** untuk menambah atau menonaktifkan nama pencuci mobil.
* Buka tab **Staf Kantor** untuk mengelola staf administrasi.
* Buka tab **Registrasi Akun Kasir** untuk mendaftarkan akun login baru bagi kasir.

---

### 5.2 Perhitungan Komisi Kru Cuci (Periode Cut-Off 16-15)
Sistem penggajian Jaya Bersama menggunakan siklus tutup buku tanggal **16 bulan berjalan s/d tanggal 15 bulan berikutnya**:
1. Buka tab **Laporan Upah Cuci (Wages)**.
2. Sistem otomatis menetapkan rentang tanggal cut-off aktif (misal: *16 Agustus - 15 September*). Anda juga dapat mengubah tanggal secara fleksibel menggunakan kalender interaktif.
3. Tabel menampilkan rekapitulasi per pekerja:
   * **Nama Pekerja**
   * **Total Mobil Dicuci (Unit)**
   * **Total Upah Kotor Dihasilkan**
   * **Total Kasbon / Potongan**
   * **Sisa Upah Bersih yang Harus Dibayarkan (Outstanding)**

---

### 5.3 Crosscheck Rincian Pekerjaan Pencuci
1. Klik tombol **Rincian / Detail Mobil** di samping nama pekerja.
2. Modal akan menampilkan daftar seluruh mobil (Plat nomor, tanggal, jam, tipe paket, dan nominal komisi yang didapat) yang dikerjakan oleh pekerja tersebut.
3. Menjamin transparansi 100% antara manajemen dan kru cuci.

---

### 5.4 Proses Pembayaran Gaji / Kasbon
1. Klik tombol **Bayar Gaji** pada nama kru yang bersangkutan.
2. Masukkan nominal pembayaran dan pilih sumber dana (*SALDO CASH* atau *REKENING Y*).
3. Klik **Konfirmasi Pembayaran**.
4. Sistem otomatis memotong saldo rekening yang dipilih dan mencatat log pengeluaran gaji ke tabel `cashflow`.

---

## 6. SOP Manajemen Data: Modul Database (`Database.jsx`)

Modul pengelolaan master data dan inventaris oleh Admin/Owner.

### 6.1 Manajemen Menu F&B & Resep HPP
1. Buka tabel **Daftar Harga Menu**:
   * Klik **+ Tambah Baris** untuk mendaftarkan menu minuman/makanan baru beserta harga jualnya.
2. Buka tabel **Resep**:
   * Hubungkan `id_menu` dengan bahan baku di tabel `stok_barang` dan masukkan takaran/jumlah yang digunakan per porsi.
   * Sistem akan menggunakan data ini untuk menghitung HPP riil pada Dashboard.

---

### 6.2 Manajemen Stok Bahan Baku
* Buka tabel **Stok Barang** untuk memantau stok bahan minuman, makanan, sabun cuci, semir ban, dll.
* Update jumlah stok fisik saat terjadi *Stock Opname* berkala.

---

### 6.3 Koreksi & Edit Data Transaksi
Jika terjadi salah input pada masa lampau:
1. Buka tabel transaksi terkait (`carwash`, `struk`, `cafe`, atau `cashflow`).
2. Gunakan filter pencarian tanggal atau plat nomor / ID Struk.
3. Klik ikon **Edit (Pensil)** untuk memperbaiki data atau ikon **Hapus (Tong Sampah)** jika transaksi dibatalkan.

---

## 7. Panduan Dashboard & Analitik CRM (`Dashboard.jsx`)

### 7.1 Monitoring KPI Omzet & Profitabilitas
* **Total Omzet Gabungan**: Performa bruto dari divisi Cafe dan Carwash.
* **Total Pengeluaran & Laba Bersih**: Analisis margin keuntungan riil setelah dikurangi beban operasional dan HPP.
* **Volume Transaksi**: Grafik tren jam sibuk (*peak hours*) harian dan mingguan.

---

### 7.2 Analisis Food Cost Cafe & Efisiensi Bahan
* Menampilkan breakdown HPP setiap menu yang terjual.
* Memastikan rasio Food Cost Cafe berada dalam rentang ideal (standar $\le 35\%$).

---

### 7.3 Analisis Loyalitas Pelanggan (VIP, Reguler, Baru)
* Buka tab **Laporan Customer**:
  * **Badge Hijau (VIP / Pelanggan Setia)**: Kendaraan dengan $\ge 5$ kali kunjungan.
  * **Badge Ungu (Pelanggan Reguler)**: Kendaraan dengan 2 s/d 4 kali kunjungan.
  * **Badge Cyan (Pelanggan Baru)**: Kendaraan dengan 1 kali kunjungan.
* Gunakan daftar nomor WhatsApp dan tanggal kunjungan terakhir untuk mengirimkan pesan promosi loyalitas atau pengingat servis.

---

## 8. Panduan Troubleshooting & FAQ

| Masalah | Penyebab Umum | Solusi Cepat |
| :--- | :--- | :--- |
| **Printer Thermal tidak mencetak struk** | Kabel USB longgar atau Bluetooth printer terputus. | Pastikan lampu printer berwarna biru/hijau menyala, periksa koneksi USB/Bluetooth, dan lakukan tes cetak dari pengaturan printer Windows/Android. |
| **Auto-Fill Plat Nomor tidak muncul** | Kendaraan belum pernah bertransaksi sebelumnya atau format plat salah ketik. | Masukkan data merk dan ukuran mobil secara manual. Untuk kunjungan berikutnya data akan otomatis tersimpan. |
| **Selisih Saldo Kas saat Tutup Kasir** | Ada pengeluaran laci kasir yang lupa dicatat, atau salah memberikan uang kembalian. | Periksa struk nota fisik di laci dan cocokkan dengan riwayat transaksi cashflow hari ini di modul Finance. |
| **Gagal Login Kasir** | Salah memasukkan password atau koneksi internet terputus. | Periksa jaringan internet, pastikan tombol Caps Lock tidak aktif, atau hubungi Owner untuk reset password melalui modul Admin. |

---
*Dokumen ini disusun untuk mendukung kelancaran operasional harian POS Jaya Bersama.*
