# Inventaris use case QA RelayPOS

Draf berdasarkan route, handler UI, layanan, dan pengujian pada branch `fix/cloud-auth-qa` (dasar commit `18ce5b5`). Ini daftar kandidat pengujian, bukan hasil eksekusi atau jaminan fitur sudah benar. Kode aplikasi dan mock tidak diubah pada tahap ini.

## Ruang lingkup dan aturan

- Peran: Founder/Super Admin, Owner, Admin, Kasir. Tipe usaha: Cafe, Carwash, Hybrid.
- P0: autentikasi, isolasi data, uang/stok, dan alur utama. P1: operasional/regresi. P2: peningkatan kualitas dan pengukuran.
- Jalur eksekusi: unit/helper, integrasi layanan/database, E2E browser, manual/perangkat. Pilih lapisan yang dapat membuktikan hasil; tidak semua variasi harus berupa E2E.
- Mode lokal/mock dan cloud staging dicatat terpisah. Mock sengaja dipertahankan, termasuk simulasi Google; kelulusan mock tidak membuktikan keamanan cloud.
- Seluruh mutasi menggunakan tenant/data sintetis terisolasi. Pengiriman WhatsApp, email, pembayaran, dan printer nyata memerlukan tujuan testing.
- Status awal seluruh use case: BELUM DIEKSEKUSI dalam kampanye QA ini. Riwayat 310 tes sebelumnya adalah baseline, bukan bukti semua use case berikut sudah tercakup.
- Untuk setiap baris, turunkan variasi positif, negatif, batas nilai, kegagalan/rollback, duplikasi, dan lintas tenant yang relevan.

## Matriks akses route yang perlu diverifikasi

Ini kebijakan route yang teramati pada `src/App.jsx`; validasi izin aksi backend tetap diperlukan. Akses yang tidak sesuai tujuan bisnis dilaporkan sebagai temuan, bukan dibenarkan hanya karena mengikuti kode.

| Route/modul | Peran pada guard saat ini | Batas tambahan |
|---|---|---|
| Dashboard, konsolidasi | Owner, Super Admin | Konteks dan kepemilikan tenant |
| POS, gudang | Owner, Admin, Kasir | Tipe usaha dan izin aksi perlu diuji |
| Antrean | Owner, Admin, Kasir | Fitur antrean Carwash/Hybrid |
| Keuangan, karyawan | Owner, Admin | Isolasi tenant |
| CRM | Owner, Admin | Fitur CRM Carwash/Hybrid |
| Laporan | Owner | Pembatasan laporan resmi |
| Pengaturan /admin | Owner, Super Admin | Bukan otomatis untuk role bernama Admin |
| Founder, database | Super Admin | Konteks platform dan audit |

## Katalog skenario

### AUTH — Autentikasi dan akun

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| AUTH-01 | P0 | Login setiap peran dengan kredensial benar | Sesi terbentuk dan pengguna diarahkan ke halaman sesuai peran. |
| AUTH-02 | P0 | Login password salah, akun tidak dikenal, dan input kosong | Ditolak dengan pesan jelas; tidak terbentuk sesi. |
| AUTH-03 | P0 | Logout, refresh, back/forward, dan akses URL terlindungi | Sesi berakhir; halaman sensitif tidak dapat digunakan tanpa login. |
| AUTH-04 | P1 | Pemulihan sesi setelah refresh dan sesi cloud kedaluwarsa | Sesi sah dipulihkan; sesi kedaluwarsa ditangani tanpa loop atau layar kosong. |
| AUTH-05 | P0 | Ganti password: benar, salah, kosong, pendek, dan identitas tidak cocok | Hanya password lama terverifikasi yang boleh mengubah password; error tidak mengubah akun. |
| AUTH-06 | P1 | Login kembali setelah perubahan password | Password baru diterima dan password lama ditolak. |
| AUTH-07 | P1 | Google mock lokal dan Google cloud | Mock tetap tersedia sebagai simulasi; cloud memakai provider nyata dan callback yang benar. |

### ONB — Onboarding toko

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| ONB-01 | P0 | Registrasi Owner baru pada Cafe, Carwash, dan Hybrid | Tenant, cabang utama, dan profil Owner konsisten; akun lain tidak terpengaruh. |
| ONB-02 | P0 | Konfirmasi email cloud diperlukan versus sesi langsung tersedia | Tanpa sesi tampil instruksi email; tidak ada login semu. Dengan sesi, profil tenant wajib lengkap. |
| ONB-03 | P1 | Form registrasi: email duplikat, nama kosong, tipe tidak valid, dan password pendek | Input tidak valid ditolak tanpa data parsial atau duplikasi. |
| ONB-04 | P0 | Kegagalan di tengah provisioning tenant/cabang/profil | Seluruh transaksi dibatalkan; tidak ada data yatim. |
| ONB-05 | P0 | Metadata registrasi mencoba memilih tenant lain atau Super Admin | Peran istimewa dan keanggotaan tenant tidak diberikan dari metadata pengguna. |
| ONB-06 | P1 | Wizard onboarding selesai, dibatalkan, dibuka ulang, dan disubmit ganda | State konsisten; tidak menciptakan toko atau cabang ganda. |
| ONB-07 | P1 | Undangan staf cloud dari backend tepercaya | Staf masuk tenant/cabang yang diizinkan; cabang lintas tenant ditolak. |

### ACL — Otorisasi dan isolasi tenant

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| ACL-01 | P0 | Akses seluruh route per peran melalui menu dan URL langsung | Izin mengikuti kebijakan bisnis; menyembunyikan menu saja tidak dianggap cukup. |
| ACL-02 | P0 | Baca, ubah, hapus, dan ekspor data tenant lain menggunakan ID yang ditebak | Tidak ada data tenant lain terbaca atau termutasi; RLS diuji di cloud. |
| ACL-03 | P0 | Kasir memanipulasi tenant aktif di localStorage atau parameter | Tetap dibatasi ke tenant akun; mock dicatat terpisah dari keamanan produksi. |
| ACL-04 | P0 | Owner berpindah tenant dan membuka tab berbeda | Data, cache, kas, profil, dan transaksi mengikuti konteks tenant yang benar. |
| ACL-05 | P0 | Perubahan role dan profil otorisasi setelah sesi berjalan | Hak akses memakai sumber tepercaya; metadata pengguna tidak menaikkan hak. |
| ACL-06 | P1 | Pembatasan fitur Cafe/Carwash/Hybrid melalui URL langsung | Fitur yang tidak tersedia tidak dapat dipakai lewat bypass navigasi. |
| ACL-07 | P1 | Tenant nonaktif, diarsipkan, atau lisensi kedaluwarsa | Perilaku akses sesuai aturan yang ditetapkan; tidak membocorkan data. |

### POS — Kasir dan transaksi penjualan

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| POS-01 | P0 | Buka kasir dan simpan modal awal | Modal hanya dicatat sekali dan memengaruhi kas tanpa menjadi omzet. |
| POS-02 | P1 | Pilih menu/paket/merchandise, cari kategori, ubah jumlah dan catatan | Keranjang dan total mengikuti item yang dipilih; tipe usaha membatasi katalog. |
| POS-03 | P0 | Checkout tunai, non-tunai, uang pas, lebih, dan kurang | Total, pembayaran, kembalian, akun kas/bank, dan struk benar; pembayaran kurang ditolak. |
| POS-04 | P0 | Checkout gabungan Cafe dan Carwash | Satu nota memiliki rincian dan alokasi pendapatan divisi yang konsisten. |
| POS-05 | P0 | Diskon nominal/persen, promo, dan kombinasi item | Aturan diskon dipenuhi; total tidak negatif; pembulatan konsisten. |
| POS-06 | P0 | Double-click checkout, retry setelah timeout, dan request gagal | Tidak ada nota, pengurangan stok, atau pemasukan kas ganda. |
| POS-07 | P0 | Edit transaksi lunas, void dengan alasan, dan reaktivasi | Riwayat tersedia; kas, stok, antrean, komisi, serta laporan disesuaikan tepat sekali. |
| POS-08 | P1 | Struk tampil, cetak ulang, kustomisasi, dan printer tidak tersedia | Nomor/rincian nota benar; kegagalan printer tidak menggandakan penjualan. |

### BILL — Pending bill dan tutup kasir

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| BILL-01 | P0 | Simpan pending bill dan buka ulang setelah refresh | Item dan pelanggan tersimpan; belum dianggap pembayaran lunas. |
| BILL-02 | P0 | Lunasi pending bill dengan metode berbeda | Status dan kas diperbarui tepat sekali; nota tetap terhubung. |
| BILL-03 | P0 | Batalkan pending bill dan batalkan pelunasan yang diizinkan | Efek keuangan/stok sesuai aturan; tidak menyisakan transaksi yatim. |
| BILL-04 | P0 | Pengeluaran langsung dari POS | Saldo laci berkurang dan expense tercatat sekali pada divisi/periode yang benar. |
| BILL-05 | P0 | Tukar uang kasir dan transfer kas/bank | Saldo asal/tujuan berubah seimbang; tidak menjadi omzet atau beban. |
| BILL-06 | P0 | Tutup kasir dengan kas sesuai, selisih, dan pending bill | Rekap modal, tunai, pengeluaran, transfer, dan selisih dapat direkonsiliasi. |
| BILL-07 | P1 | Buka shift berikutnya, pergantian kasir, dan transaksi lintas tengah malam | Tidak ada pencampuran transaksi atau modal antarshift. |

### CW — Operasional Carwash

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| CW-01 | P1 | Input plat baru, plat lama, normalisasi plat, dan autofill pelanggan | Data kendaraan cocok; tidak mengubah kendaraan lain yang mirip. |
| CW-02 | P0 | Checkout layanan menjadi antrean yang benar | Nota, kendaraan, paket, dan tenant antrean saling cocok. |
| CW-03 | P0 | Pindah antrean ke proses cuci lalu QC/selesai | Transisi sah saja; waktu dan status tetap konsisten setelah refresh. |
| CW-04 | P0 | Pilih kru, kru kosong, dan pembagian pekerjaan | Pekerjaan serta komisi dikaitkan ke kru dan transaksi yang benar. |
| CW-05 | P1 | Edit/void transaksi yang sudah masuk antrean | Antrean dan komisi mengikuti perubahan tanpa duplikasi. |
| CW-06 | P1 | Filter hari, pencarian plat, antrean kosong, dan pembaruan paralel | Daftar benar; perubahan tidak hilang ketika operator lain memperbarui. |
| CW-07 | P1 | Notifikasi WhatsApp selesai cuci | Pesan/nomor sesuai pelanggan; tidak dikirim otomatis ke kontak nyata saat QA. |

### FIN — Keuangan dan akuntansi

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| FIN-01 | P0 | Tambah pemasukan dan pengeluaran per akun/divisi | Saldo, klasifikasi, dan sumber transaksi benar; angka tidak valid ditolak. |
| FIN-02 | P0 | Edit/hapus pemasukan atau pengeluaran yang sudah tersimpan | Saldo lama dibalik dan nilai baru diterapkan tepat sekali. |
| FIN-03 | P0 | Transfer antar akun dengan akun sama, saldo kurang, atau kegagalan parsial | Transfer tidak sah ditolak; transfer sah atomik dan total dana tetap. |
| FIN-04 | P0 | Prive Owner dan pembatasan peran | Dana berkurang; klasifikasi prive tidak menjadi biaya operasional. |
| FIN-05 | P0 | Rekonsiliasi omzet, HPP, biaya, laba, dan saldo kas | Angka bisa ditelusuri ke transaksi sumber; tidak menghitung transfer sebagai pendapatan. |
| FIN-06 | P0 | Jurnal debit/kredit, reversal, dan pembulatan uang | Jurnal seimbang dan pembulatan konsisten; perubahan tidak merusak periode lain. |
| FIN-07 | P1 | Filter tanggal/divisi/akun, sorting, pencarian, dan ekspor CSV | Total dan baris ekspor sesuai filter; data tenant lain tidak ikut. |
| FIN-08 | P1 | Tanggal akhir bulan/tahun, transaksi mundur, dan rentang kosong | Transaksi masuk periode bisnis yang benar; rentang kosong menampilkan nol secara jelas. |

### INV — Gudang, stok, resep, dan HPP

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| INV-01 | P1 | Tambah/edit/hapus barang dan pencarian kategori/gudang | Barang benar; referensi transaksi/resep yang masih dipakai ditangani aman. |
| INV-02 | P0 | Restock serta biaya pembelian bahan/barang | Stok dan biaya/arus kas sesuai aturan tanpa pencatatan ganda. |
| INV-03 | P0 | Stock opname naik/turun dan pembatasan angka tidak valid | Selisih stok tercatat dan dapat ditelusuri; stok tidak berubah diam-diam. |
| INV-04 | P0 | Penjualan menu dengan resep dan pengurangan bahan | Takaran serta satuan konsisten; stok dan HPP mengikuti jumlah penjualan. |
| INV-05 | P0 | Penjualan saat stok habis/kurang dan penjualan paralel | Perilaku sesuai kebijakan stok; tidak terjadi overselling tanpa peringatan yang disepakati. |
| INV-06 | P0 | Void/edit nota mengembalikan atau menyesuaikan stok | Perubahan dihitung dari selisih transaksi; tidak restore dua kali. |
| INV-07 | P1 | Resep belum lengkap dan fallback HPP | Fallback terlihat/terdefinisi dan tidak menghasilkan laba menyesatkan. |

### HR — Karyawan dan penggajian

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| HR-01 | P1 | Tambah/hapus kru cuci serta karyawan kantor | Validasi identitas dan referensi pekerjaan; akun tenant lain tidak berubah. |
| HR-02 | P0 | Komisi kru berdasarkan layanan dan pembagian kru | Nominal mengikuti paket/pekerjaan dan dapat ditelusuri. |
| HR-03 | P0 | Cut-off gaji tanggal 16–15 termasuk bulan pendek dan pergantian tahun | Tidak ada pekerjaan terlewat atau dihitung pada dua periode. |
| HR-04 | P0 | Pembayaran gaji/komisi sebagian atau penuh dan retry | Sisa kewajiban dan saldo kas benar; pembayaran tidak ganda. |
| HR-05 | P0 | Void transaksi setelah komisi dihitung atau dibayar | Koreksi kewajiban dan riwayat mengikuti aturan bisnis yang disepakati. |
| HR-06 | P1 | Daftar akun staf, role Admin/Kasir, dan pembatasan pengelola | Hanya pihak berizin membuat akun; undangan cloud memakai backend tepercaya. |

### CRM — Pelanggan dan loyalitas

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| CRM-01 | P1 | Cari pelanggan berdasarkan plat/nama/nomor dan buka riwayat | Riwayat sesuai pelanggan dan tenant, termasuk penjualan lintas kunjungan. |
| CRM-02 | P1 | Simpan catatan pelanggan dan batalkan perubahan | Catatan bertahan setelah refresh; pembatalan tidak menyimpan. |
| CRM-03 | P0 | Akumulasi kunjungan/poin setelah lunas dan setelah void | Hanya transaksi yang memenuhi syarat dihitung; reversal konsisten. |
| CRM-04 | P0 | Klaim reward, klaim berulang, dan saldo poin tidak cukup | Reward dipakai sekali; syarat diperiksa ulang saat penyimpanan. |
| CRM-05 | P1 | Ubah pengaturan loyalitas dan kembalikan default | Aturan baru diterapkan sesuai periode/keputusan bisnis tanpa menghapus riwayat. |
| CRM-06 | P1 | Template retensi, copy pesan, WhatsApp, dan ekspor | Data kontak benar; kirim nyata dipisahkan dari simulasi testing. |

### RPT — Dashboard, laporan, dan konsolidasi

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| RPT-01 | P0 | Dashboard divisi Cafe/Carwash/Hybrid dan modal detail biaya | Kartu, grafik, dan rincian memakai populasi transaksi yang sama. |
| RPT-02 | P0 | Konsolidasi multi-outlet milik Owner | Total gabungan sama dengan penjumlahan outlet yang boleh diakses. |
| RPT-03 | P1 | Pindah dari portal holding ke workspace outlet | Tenant terpilih, menu, kas, dan laporan berubah bersama. |
| RPT-04 | P0 | Laporan laba rugi, buku besar, arus kas, dan laporan resmi yang tersedia | Saldo dan transaksi antar laporan dapat direkonsiliasi. |
| RPT-05 | P1 | Filter hari/bulan/kustom/semua dan ekspor/cetak | Judul periode, total, serta ekspor sesuai pilihan pengguna. |
| RPT-06 | P1 | Asisten analitik/prompt, data kosong, dan data sangat besar | Hasil sesuai konteks; tidak memasukkan data tenant lain atau klaim angka tanpa sumber. |

### ADM — Master data, lisensi, dan platform Founder

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| ADM-01 | P1 | Kelola menu, kategori, paket cuci, merchandise, dan status aktif | Katalog POS mengikuti master; penonaktifan tidak merusak nota lama. |
| ADM-02 | P1 | Kelola metode bayar, akun kas/bank, diskon, dan resep | Referensi dan validasi benar; akun terpakai tidak dihapus tanpa penanganan. |
| ADM-03 | P0 | Kalibrasi saldo, EOD manual, dan pengulangan proses | Hanya pihak berizin; hasil tidak menggandakan pencatatan. |
| ADM-04 | P0 | Aktivasi lisensi valid/salah/kedaluwarsa dan lisensi tenant lain | Hak fitur tidak dapat dipindah atau dinaikkan tanpa izin. |
| ADM-05 | P0 | Founder membuat tenant dan provisioning kredensial/lisensi | Identitas Owner serta tenant/cabang tidak tercampur dengan toko lain. |
| ADM-06 | P0 | Founder arsip dan restore tenant, termasuk pembatalan konfirmasi | Status konsisten; pemulihan mempertahankan data; tidak ada hard delete tak disengaja. |
| ADM-07 | P0 | Founder impersonation dan kembali ke konteks platform | Tenant target benar; tidak tersisa konteks atau izin yang salah setelah keluar. |
| ADM-08 | P1 | Perpanjang langganan, lihat Owner, audit aktivitas, dan ekspor snapshot | Data konsisten; ekspor hanya untuk peran berizin dan tidak memuat secret. |

### UX — Kualitas UI dan aksesibilitas

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| UX-01 | P1 | Seluruh halaman pada ponsel, tablet, dan desktop | Aksi utama bisa dipakai; sidebar, tabel, dan modal tidak menutupi kontrol. |
| UX-02 | P1 | Navigasi keyboard, fokus modal, Escape, dan pembaca layar | Kontrol bernama jelas; fokus tidak hilang; pesan error/status diumumkan. |
| UX-03 | P1 | State loading, kosong, berhasil, gagal, dan retry | Tidak ada layar kosong atau spinner abadi; pengguna mendapat langkah berikutnya. |
| UX-04 | P1 | Validasi formulir, submit ganda, dan batal ketika data berubah | Error terkait input; perubahan tidak hilang tanpa penanganan yang jelas. |
| UX-05 | P1 | Format rupiah, tanggal, zona waktu, angka negatif, dan teks panjang | Informasi terbaca dan konsisten; perhitungan tidak mengikuti format tampilan. |
| UX-06 | P2 | Kontras, zoom, reduced motion, dan target sentuh | Kontrol tetap bisa dibaca dan dioperasikan tanpa bergantung warna/hover saja. |

### RES — Ketahanan, keamanan, dan integrasi

| ID | Prioritas | Use case | Hasil yang harus diverifikasi |
|---|---|---|---|
| RES-01 | P0 | Cloud offline, timeout, error otorisasi, dan pemulihan jaringan | Tidak melaporkan sukses palsu; retry tidak menggandakan mutasi. |
| RES-02 | P0 | Dua kasir mengubah nota/stok/kas yang sama | Konflik ditangani dan invarians keuangan/stok tetap benar. |
| RES-03 | P1 | LocalStorage kosong, data lama, penuh, dan rusak | Error dapat dipulihkan; tidak menghapus data diam-diam. |
| RES-04 | P0 | Input HTML/script pada pelanggan, catatan, nama toko, dan ekspor CSV | Tidak ada eksekusi script/formula berbahaya atau kebocoran data. |
| RES-05 | P0 | Secret dalam bundle, log, snapshot, dan pesan error | Tidak ada service-role key atau kredensial produksi terekspos. |
| RES-06 | P1 | Refresh deep link, route tak dikenal, browser berbeda, dan restart server | SPA dapat dibuka kembali; perilaku sesi dan data konsisten. |
| RES-07 | P1 | Cetak Bluetooth, WhatsApp, Google OAuth, dan email staging | Integrasi nyata diuji terpisah memakai perangkat/akun/kontak testing. |
| RES-08 | P2 | Volume data besar, respons pencarian, dan ukuran bundle | Waktu respons diukur terhadap target yang disepakati; UI tetap responsif. |

## Bentuk test case rinci

Setiap test case memiliki ID turunan (mis. POS-03-A), referensi use case, role, tipe usaha, mode backend, prasyarat/data awal, langkah, expected result per langkah, invariant kas/stok/tenant, cleanup, metode pengujian, bukti, hasil aktual, dan tautan bug. Status: NOT RUN, PASS, FAIL, BLOCKED, atau SKIPPED dengan alasan.

## Urutan pelaksanaan yang diusulkan

1. Pemetaan tes yang sudah ada ke ID di atas; tandai cakupan parsial dan celah. Jangan menulis ulang tes yang sudah membuktikan perilaku yang sama.
2. Smoke E2E tiap role dan tipe usaha: login → halaman utama → transaksi sederhana → laporan → logout.
3. P0 isolasi tenant, alur pembayaran, void, stok, kas, komisi, dan rekonsiliasi.
4. P1 operasional lengkap, validasi form, ekspor, dan responsivitas.
5. Cloud staging: migrasi, RLS, sesi, email/OAuth, dan undangan staf. Jalur undangan staf cloud masih membutuhkan backend tepercaya.
6. Perangkat/integrasi nyata dan P2 performa; laporkan target pengukuran sebelum menyimpulkan lulus.

## Keputusan bisnis yang perlu dicatat saat merinci tes

- Apakah stok negatif diperbolehkan, siapa yang boleh void/edit, dan bagaimana koreksi komisi yang sudah dibayar?
- Bagaimana aturan diskon gabungan, refund, shift lintas hari, tenant berakhir lisensi, dan perubahan loyalitas berlaku terhadap data lama?
- Apakah reset password merupakan fitur rilis? `ForgotPassword.jsx` ada, tetapi route reset password belum ditemukan pada App.jsx. Perlakukan sebagai kandidat gap, bukan fitur yang sudah tersedia.
- Tetapkan browser/perangkat target, zona waktu bisnis per outlet, volume data, serta target respons. Untuk tanggal bisnis gunakan pengaturan outlet yang disepakati.
- Endpoint undangan staf cloud dan aturan otorisasi tiap aksi harus menjadi prasyarat sebelum mengklaim seluruh alur cloud lulus.

Total: **98 use case induk** pada **14 kelompok**. Variasi rinci akan menghasilkan lebih banyak test case.
