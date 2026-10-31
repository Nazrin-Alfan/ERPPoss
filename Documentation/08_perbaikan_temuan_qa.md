# Perbaikan temuan QA — 31 Oktober 2026

Dokumen ini menindaklanjuti laporan 07. Laporan 07 dan bukti awal tetap menjadi
riwayat sebelum perbaikan, bukan status terbaru setelah patch ini.

## Perubahan

- **QA-PAY-01:** periode gaji dibentuk langsung dari batas tanggal 16 dan 15,
  sehingga tanggal 31 tidak overflow ke bulan berikutnya. Regresi mencakup
  pergantian tahun, tahun kabisat, dan cut-off 15/16. Browser memverifikasi
  31 Januari, 31 Maret, dan 31 Oktober menghasilkan akhir periode yang benar.
- **QA-CSV-01:** teks berawalan formula/control/whitespace berbahaya dinetralkan
  sebelum CSV di-quote. Nilai angka asli, termasuk nominal negatif, tetap angka.
  Ekspor Finance, CRM, rincian biaya dashboard, dan Database memakai helper yang
  sama; escaping tanda kutip tetap dipertahankan.
- **QA-UX-01:** dialog password memindahkan fokus awal ke input, menahan Tab dan
  Shift+Tab di dialog, mendukung Escape, serta mengembalikan fokus ke pemicu yang
  masih terhubung. Uji browser awal 6 gagal/2 lulus; sesudah patch 8 lulus.
- **QA-REWARD-01:** layanan klaim lokal memeriksa kunjungan yang memenuhi syarat,
  target program tersimpan, klaim terdahulu, tenant, dan plat yang dinormalisasi.
  Panggilan paralel dalam runtime yang sama diserialisasi, termasuk melalui
  wrapper klien berbeda. CRM dan POS menggunakan batas validasi yang sama.
  Ketersediaan reward memperhitungkan entitlement yang sudah dipakai.

## Batas kemampuan reward yang disengaja

**Reward pada checkout POS sementara tidak dapat digunakan.** Kode sebelumnya
menerapkan diskon sebelum menyimpan klaim dan mengabaikan kegagalan klaim.
Kedua handler POS kini menolak state reward sebelum mutasi nota/item, dan banner
menjelaskan ketidaktersediaannya. Ini mitigasi aman, bukan implementasi lengkap
checkout + konsumsi reward atomik. Checkout biasa tetap tersedia.

Mode cloud memerlukan RPC `redeem_customer_reward` sesuai dokumen 09. Endpoint
belum tersedia dalam migrasi repositori ini; layanan menolak klaim jika tidak
ada konfirmasi commit dari server dan tidak fallback ke INSERT mentah.
Local Web Locks/per-runtime lock tidak membuktikan transaksi lintas tab dengan
cache in-memory independen. Jangan menyatakan klaim cloud/lintas tab siap rilis.

Riwayat pelanggan historis tetap ditampilkan, termasuk seed dengan referensi
nota yang tidak lengkap. Penghitungan kunjungan untuk reward dipisahkan;
referensi nota yang tidak dapat diverifikasi tidak memberi entitlement baru.
Dua tes regresi tambahan memverifikasi pemisahan ini.

## Validasi gabungan

- 56 berkas / **344 tes lulus** setelah patch; baseline sebelumnya 310 tes.
- Build berhasil. Lint: **418 warning, 0 error**.
- Tes baru mula-mula mendeteksi masalah: payroll/CSV 21 gagal dari 22 kasus,
  reward 10 gagal; hasil regresi sesudah patch lulus.
- Tes CRM lama yang mengklaim reward tanpa kunjungan diberi prasyarat lima
  kunjungan yang sah. Assertion klaim tetap diperiksa, tidak dimatikan.
- Mock autentikasi, localDbEngine, dan seed demo tidak diubah.
- CSV CRM hasil unduhan berisi nama/catatan formula telah diuji sebagai teks inert.
- Browser dengan state reward stale dan keranjang valid ditolak sebelum mutasi:
  jumlah nota, item Cafe, dan Carwash sebelum/sesudah sama.
- Bukti browser tambahan dan log ada di `qa/2026-10-31-repairs/`.

Pengujian ini tidak menuntaskan seluruh variasi katalog 98 use case. Integrasi
staging, perangkat nyata, serta skenario NOT RUN/PARTIAL pada laporan awal tetap
harus diselesaikan sebelum sign-off rilis. Patch belum di-commit atau di-push
pada saat catatan ini dibuat; tidak ada deployment atau migrasi produksi.
