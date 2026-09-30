# 🗺️ ROADMAP & STATUS KESIAPAN RILIS RELAYPOS SAAS ERP
**Laporan Lengkap Progres Pengembangan, Audit Fitur, Persentase Kesiapan, dan Master TODO List Menuju Peluncuran**  
*Tanggal Pembaruan:* 22 September 2026  
*Status Sistem Saat Ini:* **90% - FONDASI SISTEM ERP & MESIN MULTI-TENANT STABIL**  
*Maturity Level:* **Level 3 (Micro-ERP with Double-Entry General Ledger, BOM Inventory, and Multi-Tenant Relay Engine)**  
*Hasil Pengujian Otomatis:* **18 Test Files | 118/118 Tests Passing (100% Green) | 0 AST Scope Errors**

---

## 📊 1. RINGKASAN PERSENTASE KESIAPAN PER MODUL

| No | Modul / Sub-Sistem | Status | Persentase | Keterangan |
| :--- | :--- | :---: | :---: | :--- |
| 1 | **Sistem Autentikasi & RBAC 4-Tier** (`/login`) | ✅ Selesai | **100%** | Multi-role (Super Admin, Owner, Admin, Kasir), 1-click switcher, route guard. |
| 2 | **Executive Cockpit Dashboard** (`/`) | ✅ Selesai | **100%** | 4 KPI makro, audit kasir harian (Cash vs Non-Tunai), liquidity cards, operational alerts. |
| 3 | **Kasir Point of Sales (POS)** (`/pos`) | ✅ Selesai | **100%** | F&B Catalog, Carwash intake, shared cart, split payment, bon gantung, riwayat, stok opname. |
| 4 | **Antrean Layanan & Alur Estafet** (`/queue`) | ✅ Selesai | **100%** | Alur pengerjaan bay, live count badge, date picker, filter kru pencuci, status auto-switch. |
| 5 | **Keuangan Operasional & Cashflow** (`/finance`) | ✅ Selesai | **100%** | Pencatatan beban per segmen vs bersama, role-gated expense, sinkronisasi mutasi kas/bank. |
| 6 | **Akuntansi SAK EMKM & General Ledger** (`/reports`) | ✅ Selesai | **100%** | Double-Entry auto-posting, Trial Balance, P&L, Balance Sheet, interactive drilldown 2-way sync. |
| 7 | **Inventori, BOM Resep & Mutasi Stok** (`/database`) | ✅ Selesai | **100%** | Auto-deduct bahan saat POS checkout, valuasi Moving Average Cost (MAC), barang masuk/keluar. |
| 8 | **SDM, Payroll & Komisi Kru** (`/karyawan`) | ✅ Selesai | **100%** | Kalkulasi komisi bertingkat/persen/flat, penarikan kasbon, direktori karyawan auto-sync. |
| 9 | **CRM & Retensi Pelanggan** (`/crm`) | ✅ Selesai | **100%** | Segmentasi VIP/Reguler/Baru, histori plat kendaraan, direct WhatsApp link (`wa.me`), ekspor CSV. |
| 10 | **Pengaturan Master & Customizer Struk** (`/admin`) | ✅ Selesai | **100%** | CRUD paket cuci, master rekening kas/bank, WYSIWYG struk thermal 58mm/80mm, aktivasi lisensi. |
| 11 | **Super Admin Platform Console** (`/super-admin`) | ✅ Selesai | **100%** | Onboarding tenant baru bersih, generator serial key, reset transaksi demo, direktori klien. |
| 12 | **Pencetakan Struk Thermal & Slip Drop-Off** | ✅ Selesai | **100%** | Dual-receipt (Order Slip Drop-off vs Bukti Bayar), perbaikan bug halaman ke-2 kosong, watermark demo. |
| 13 | **Infrastruktur Database & Offline Hybrid Engine** | ✅ Selesai | **100%** | `localDbEngine.js`, zero-remote mutation, lazy query builder, relasi nested join, multi-tenancy. |
| 14 | **Multi-Tenant Switcher di Header/Sidebar** | ⏳ **PENDING SPRINT 1** | **0%** | Dropdown pemilihan outlet aktif bagi Owner yang memiliki lebih dari 1 tenant. |
| 15 | **Deployment & Setup Domain Produksi** | ⏳ **PENDING SPRINT 2** | **40%** | Build lokal siap, setup hosting Vercel/Cloudflare & koneksi Supabase Cloud Live. |
| 16 | **Uji Fisik Hardware Thermal Printer & Web Bluetooth** | ✅ Selesai | **100%** | Uji cetak fisik lapangan Bluetooth 58mm/80mm sukses, integrasi Web Bluetooth ESC/POS engine 100% bebas watermark. |
| **TOTAL KESIAPAN KESELURUHAN** | | 🚀 **STABIL & AKTIF** | **90%** | **Sistem Inti Siap, Tinggal Melengkapi Tenant Switcher & Deployment** |

---

## ✅ 2. DAFTAR PEKERJAAN YANG SUDAH SELESAI (DONE LIST)

### A. Fondasi Arsitektur & Database
- [x] **Multi-Tenancy Row-Level Isolation**: Struktur tabel terisolasi dengan `tenant_id` dan `branch_id`.
- [x] **Double-Entry General Ledger Engine**: Auto-posting jurnal berpasangan ($\sum \text{Debit} == \sum \text{Credit}$) pada setiap transaksi struk, pembelian bahan baku, dan pengeluaran operasional.
- [x] **Local Database Hybrid Engine (`localDbEngine.js`)**: Query builder rantai kompatibel Supabase Client, auto-join relasi `struk -> cafe[]`, `struk -> carwash[]`.
- [x] **Pragmatic 4-Tier RBAC**: Super Admin, Owner, Admin (Supervisor), dan Kasir dengan batas hak akses ketat.

### B. Operasional Garis Depan & Kasir
- [x] **All-in-One POS (`/pos`)**: Katalog menu F&B, form pendaftaran plat cuci mobil, shared cart (gabung cuci + cafe), split payment, bon gantung pending, riwayat transaksi, dan tab stok opname *Read-Only*.
- [x] **Antrean Layanan Alur Estafet (`/queue`)**: Alur pengerjaan slot bay, live badges count, date picker fleksibel, auto-switch tab cerdas.
- [x] **Cetak Thermal & Digital Receipt**: Format 58mm & 80mm thermal roll, pemisahan *Bukti Drop-Off* vs *Bukti Bayar*, eliminasi bug halaman ke-2 kosong, link WhatsApp receipt otomatis.

### C. Manajemen Logistik, SDM & Akuntansi
- [x] **Inventori & BOM Resep (`/database`)**: Pemotongan otomatis stok bahan saat POS checkout, valuasi Moving Average Cost (MAC), log barang masuk/keluar.
- [x] **SDM & Komisi Kru (`/karyawan`)**: Kalkulasi otomatis bagi hasil cuci (skema bertingkat, persentase, atau flat) dan potongan kasbon harian.
- [x] **CRM & Retensi Pelanggan (`/crm`)**: Segmentasi VIP/Reguler/Baru, histori servis plat nomor, WhatsApp deep-link.
- [x] **Laporan Keuangan SAK EMKM (`/reports`)**: Laporan Laba Rugi per unit usaha & konsolidasi, Neraca Seimbang, drilldown interaktif 2-way sync.
- [x] **Executive Cockpit Dashboard (`/`)**: 4 KPI makro, rekap setoran kasir harian (Uang Tunai vs QRIS/Transfer).

### D. Fitur Komersialisasi & Kontrol Solo Founder
- [x] **Pengaturan Master Toko (`/admin`)**: CRUD paket cuci, master akun kas/bank, WYSIWYG kustomisasi struk thermal.
- [x] **Manajemen Lisensi B2B Direct Sales (`LicenseManager`)**: Grace period 7 hari, tombol WhatsApp order perpanjangan, aktivasi serial key 1 tahun.
- [x] **Super Admin Platform Console (`/super-admin`)**: Pendaftaran tenant baru bersih (*Clean State*), generator serial key lisensi, pembersihan transaksi demo toko.

---

## 📋 3. MASTER TODO LIST (URUTAN SEMUA PEKERJAAN YANG AKAN DIKERJAKAN)

Berikut adalah urutan seluruh tugas yang akan kita eksekusi dari sekarang hingga aplikasi meluncur ke pasar:

### 🎯 SPRINT 1: Alur Hybrid Auth, Onboarding Wizard, Fitur Operasional Kasir & Multi-Tenant Switcher
- [x] **TODO-1.1: Alur Hybrid Google Auth untuk Owner & Lead Capture**:
  - ✅ Terpasang tombol "Lanjutkan dengan Google (Pemilik Usaha)" di `Login.jsx`.
  - ✅ Lead calon klien otomatis terdeteksi dengan role Owner.
- [x] **TODO-1.2: Onboarding Setup Wizard 3 Langkah bagi Owner Baru**:
  - ✅ Komponen `OnboardingWizardModal.jsx` siap: Identitas toko & printer thermal (Langkah 1), Model bisnis (Langkah 2), Akun kasir pertama (Langkah 3).
  - ✅ Auto-generate payload tenant bersih, lisensi serial key, branch, dan pos saldo awal.
- [x] **TODO-1.3: Pintu Masuk Kasir & Staf Toko (Username & PIN Cepat)**:
  - ✅ Form Username & PIN cepat kasir aktif di `Login.jsx` dan terkunci ke tenant outlet tanpa perlu akun Google.
- [x] **TODO-1.4: Modal Alasan Pembatalan Nota Kasir (Void Reason & Audit Trail)**:
  - ✅ Komponen `VoidReasonModal.jsx` dengan chip preset cepat (Salah Menu, Ganti Pesanan, Batal Keluar, Kendala Mesin) dan input keterangan custom wajib.
  - ✅ Kebijakan Zero Hard Delete: status diubah jadi 'Batal', alasan tersimpan, dan pengembalian stok bahan baku F&B otomatis (*auto-restore*).
- [x] **TODO-1.5: Rekap Tutup Kasir Interaktif (Model Terbuka) & Kirim Laporan ke WhatsApp Owner**:
  - ✅ Komponen `ShiftClosingModal.jsx` model terbuka: rincian modal awal, penerimaan tunai, QRIS/bank, pengeluaran kasir, ekspektasi laci, input fisik kasir, deteksi selisih real-time, dan 1-klik kirim laporan elegan ke WhatsApp Owner via `wa.me`.
- [x] **TODO-1.6: Integrasi Pintar Form Pengeluaran ke Stok Gudang (Expense-to-Inventory Sync)**:
  - ✅ Integrasi belanja bahan baku langsung dari pengeluaran di `localDbEngine.js` & `financeHelpers.js`.
  - ✅ Otomatis mencatat ke `barang_masuk`, menambah `stok_barang`, dan menghitung harga pokok rata-rata (Moving Average Cost / MAC).
- [x] **TODO-1.7: Slip & Rekap Transparan Komisi Kru Harian di Kasir POS**:
  - ✅ Komponen `CrewDailyCommissionModal.jsx`: perhitungan otomatis Solo 100% vs Tim 50%, rekap total mobil dan upah bersih harian, serta tombol cetak slip thermal mini.
- [x] **TODO-1.8: Tombol Cepat "Tarik Saldo / Prive Pemilik" di Dashboard & Keuangan**:
  - ✅ Komponen `OwnerWithdrawalModal.jsx` untuk mencatat penarikan pribadi owner dari kas laci atau bank.
  - ✅ Penjurnalan double-entry otomatis ke akun `[3002] Prive Pemilik` tanpa merusak laba operasional bersih toko.
- [x] **TODO-1.9: State `activeTenant` di `AuthContext`**:
  - ✅ State `activeTenant` dan `userTenants` aktif di `AuthContext.jsx`, persistensi `localStorage`, dan event listener `relaypos:tenant_changed`.
- [x] **TODO-1.10: Komponen Dropdown Tenant Switcher di Sidebar & Header**:
  - ✅ Komponen `TenantSwitcher.jsx` di Sidebar desktop dan mobile drawer (Dropdown aktif untuk Owner & Super Admin, badge read-only untuk Kasir).
- [x] **TODO-1.11: Modul Penjualan Merchandise & Produk Retail Carwash**:
  - ✅ Tab "Merchandise & Retail" di kasir POS (`MerchandiseCatalog.jsx`) untuk penjualan parfum mobil, lap microfiber, kanebo chamois, semir ban spray, dan aksesoris.
  - ✅ Terintegrasi ke Shared Cart (cuci mobil + cafe + merchandise dalam 1 struk).
  - ✅ Pemotongan stok otomatis di `stok_barang` tanpa resep bahan mentah dan pemulihan otomatis saat transaksi dibatalkan (Void).
- [x] **TODO-1.12: Halaman Mandiri Multi-Gudang 3 Divisi (`/gudang`)**:
  - ✅ Halaman terpisah mandiri `src/pages/Gudang.jsx` dengan 3 tab divisi: (1) Gudang Cafe (Bahan Baku F&B), (2) Gudang Carwash (Shampo, Semir, Chemical Cuci), (3) Gudang Merchandise (Produk Retail Siap Jual).
  - ✅ Fitur lengkap: KPI nilai aset inventori, deteksi stok kritis/menipis, modal restock masuk cepat, dan modal stock opname penyesuaian fisik.
  - ✅ Terdaftar di Sidebar navigasi bawah kategori `LOGISTIK & SDM` untuk peran Owner, Admin, dan Kasir.
- [ ] **TODO-1.13: Sinkronisasi Filter Kueri ke Seluruh Halaman**:
  - Memastikan seluruh kueri halaman (`/`, `/pos`, `/queue`, `/gudang`, `/database`, `/finance`, `/reports`, `/karyawan`, `/crm`, `/admin`) otomatis me-load ulang data sesuai `activeTenant.id` saat tenant diganti.

---

### 🌐 SPRINT 2: Subdomain Routing, Isolasi Super Admin, Pemulihan Link Toko & Deployment Cloud
- [ ] **TODO-2.1: Arsitektur Wildcard Subdomain (`*.relaypos.com`)**:
  - Konfigurasi pembacaan subdomain URL dinamis pada `AuthContext` (`window.location.hostname`).
  - Kunci proses login staf/kasir secara mutlak pada tenant subdomain terkait (`WHERE tenant_slug = :subdomain`).
- [ ] **TODO-2.2: Fitur Self-Serve "Cari / Lupa Link Toko Saya" via Verifikasi Email**:
  - Buat halaman `/find-store` pada domain utama (`relaypos.com`).
  - Pengguna memasukkan email terdaftar $\rightarrow$ sistem memverifikasi kecocokan akun.
  - Jika cocok, sistem mengirimkan email konfirmasi / tautan ajaib (Magic Link) yang memuat daftar seluruh URL subdomain toko miliknya beserta tombol langsung menuju halaman login masing-masing toko.
  - Tampilan pesan sukses aman tanpa membocorkan data toko di layar publik.
- [ ] **TODO-2.3: Pemisahan Fisik Super Admin (Opsi 3: Zero Exposure Architecture)**:
  - Pisahkan modul Super Admin (`/super-admin`) dari aplikasi klien (`app.relaypos.com`).
  - Buat konfigurasi routing/entry point terisolasi atau subdomain khusus Solo Founder (`console.relaypos.com`).
  - Pastikan bundle produksi untuk klien **100% bersih tanpa sebaris pun kode JavaScript SuperAdmin**, sehingga mustahil di-reverse-engineer atau di-bypass lewat DevTools.
- [ ] **TODO-2.4: Row-Level Security (RLS) & Server-Side JWT Claims**:
  - Terapkan kebijakan PostgreSQL RLS di Supabase Cloud: tabel `tenants` dan `tenant_licenses` hanya dapat dimodifikasi oleh token dengan role `Super Admin`.
- [ ] **TODO-2.5: Environment Variable Produksi**:
  - Siapkan konfigurasi `.env.production` untuk menampung `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
- [ ] **TODO-2.6: Switcher Database Mode (Cloud Live vs Local Offline)**:
  - Berikan flag cerdas pada `src/supabaseClient.js` agar aplikasi bisa berjalan pada mode Cloud Live PostgreSQL (Production) atau Local Engine (Demo Sandbox).
- [ ] **TODO-2.7: Deployment ke Hosting & Wildcard DNS**:
  - Setup Wildcard DNS di Cloudflare (`*.relaypos.com`).
  - Deploy frontend build (`dist/`) ke Vercel / Cloudflare Pages dengan konfigurasi rewrite rules SPA.
- [ ] **TODO-2.8: Setup Domain Kustom & SSL**:
  - Hubungkan domain resmi aplikasi klien (`*.relaypos.com`) dan konsol founder (`console.relaypos.com`) lengkap dengan proteksi HTTPS/Cloudflare SSL.

---

### 🖨️ SPRINT 3: Validasi Hardware & Uji Lapangan (Pilot Testing)
- [x] **TODO-3.1: Uji Cetak Thermal Printer Fisik 58mm & 80mm & Web Bluetooth Direct Integration**:
  - ✅ Berhasil uji tes print fisik Bluetooth di lapangan.
  - ✅ Implementasi arsitektur **Direct Web Bluetooth ESC/POS Engine** (`src/utils/bluetoothPrinter.js`) sehingga kasir dapat mencetak instan (0.5s) **100% bebas watermark / footnote pihak ketiga (RawBT)**.
  - ✅ Verifikasi kejelasan font monospace, pemisah garis putus-putus, tabulasi harga, dan auto-cut di modal kasir (`ThermalReceiptModal.jsx`) & menu Admin (`ReceiptCustomizer.jsx`).
- [ ] **TODO-3.2: Validasi Ergonomi Layar Sentuh di Kasir Fisik**:
  - Uji kemudahan staf kasir dalam mengetuk menu cafe, memilih plat nomor, dan menyelesaikan split payment di tablet.
- [ ] **TODO-3.3: Onboarding Toko Pilot Pertama**:
  - Buka `/super-admin`, buat tenant toko pilot pertama dalam status data bersih (*Clean State*).
  - Terbitkan lisensi tahunan perdana dan serahkan akses ke pemilik toko.

---

### 🚀 SPRINT 4: Add-on Berbayar WhatsApp Gateway & Peningkatan Skalabilitas (Fase 2)
- [ ] **TODO-4.1: Paket Add-on Berbayar: Integrasi WhatsApp Gateway API (WAHA Bot Otomatis)**:
  - *Satu-satunya fitur berbayar tambahan*: Menggunakan server bot WhatsApp Gateway (WAHA) untuk otomasi pengiriman pesan di latar belakang tanpa interaksi browser/klik manual kasir:
    1. Pengiriman otomatis struk digital langsung ke nomor WhatsApp pelanggan saat kasir klik bayar.
    2. Pengiriman otomatis pesan pengingat mobil pasif >30 hari secara robotik (background cron).
- [ ] **TODO-4.2: Struktur Profil CRM Fleksibel & Pengingat Servis (Fitur Standar Toko - Gratis/Termasuk Paket Pokok)**:
  - Pemetaan entitas pelanggan: 1 nomor telepon WhatsApp dapat memiliki banyak plat kendaraan (*Multi-Vehicle per Customer*).
  - Filter analitik di layar CRM: "Pelanggan Pasif (>30 Hari Belum Cuci)" dengan tombol manual WhatsApp (`wa.me`) bebas biaya tambahan.
- [ ] **TODO-4.3: Dashboard Konsolidasi Multi-Cabang**:
  - Layar ringkasan gabungan total omzet, laba bersih, dan arus kas dari seluruh cabang bagi pengusaha yang memiliki banyak outlet.
- [ ] **TODO-4.4: Automated Daily Database Backup Script**:
  - Script cron untuk membackup snapshot database secara berkala ke cloud storage cadangan.

---

## 🧭 4. PANDUAN EKSEKUSI TAHAP DEMI TAHAP

```text
LANGKAH 1 (Saat ini):
-> Selesaikan SPRINT 1 (Multi-Tenant Switcher di Header/Sidebar) agar Owner bebas berpindah outlet.

LANGKAH 2:
-> Lakukan build produksi ($ npm run build) dan deploy ke hosting (SPRINT 2).

LANGKAH 3:
-> Buka /super-admin dan daftarkan outlet klien baru.

LANGKAH 4:
-> Uji cetak printer thermal fisik dan serah terima akun ke klien (SPRINT 3).
```

---

*Dokumen ini menjadi rujukan resmi seluruh daftar tugas (Master TODO List) hingga RelayPOS rilis penuh.*
