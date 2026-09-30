# 🏗️ ARSITEKTUR SISTEM & DOKUMENTASI TEKNIS POS JAYA BERSAMA
**Sistem Terintegrasi Cafe & Carwash (Web POS, Supabase, Cloudflare, AppSheet, & WhatsApp CRM)**

---

## 📑 Daftar Isi
1. [Ringkasan Arsitektur & Tech Stack](#1-ringkasan-arsitektur--tech-stack)
2. [Arsitektur Akuntansi Dua-Tingkat (Two-Tier Accounting)](#2-arsitektur-akuntansi-dua-tingkat-two-tier-accounting)
3. [Diagram Alur Logika Data (Data Flow Architecture)](#3-diagram-alur-logika-data-data-flow-architecture)
4. [Skema Database Supabase & Kamus Relasi Tabel](#4-skema-database-supabase--kamus-relasi-tabel)
5. [Logika Bisnis & Formula Perhitungan](#5-logika-bisnis--formula-perhitungan)
   - [5.1 Formula HPP F&B Cafe & Fallback 35%](#51-formula-hpp-fb-cafe--fallback-35)
   - [5.2 Formula Alokasi Komisi Kru Cuci](#52-formula-alokasi-komisi-kru-cuci)
   - [5.3 Algoritma Smart Auto-Fill Plat Nomor](#53-algoritma-smart-auto-fill-plat-nomor)
   - [5.4 Rekap Tutup Kasir (End of Day) & Penanganan Split Payment](#54-rekap-tutup-kasir-end-of-day--penanganan-split-payment)
6. [Sinkronisasi Realtime & Integrasi Layanan Eksternal](#6-sinkronisasi-realtime--integrasi-layanan-eksternal)
   - [6.1 Layar Antrean Carwash Real-time](#61-layar-antrean-carwash-real-time)
   - [6.2 Sinkronisasi Google Sheets / AppSheet](#62-sinkronisasi-google-sheets--appsheet)
   - [6.3 Integrasi API Gateway WhatsApp CRM](#63-integrasi-api-gateway-whatsapp-crm)
7. [Struktur Folder & Navigasi Kode Sumber](#7-struktur-folder--navigasi-kode-sumber)

---

## 1. Ringkasan Arsitektur & Tech Stack

| Layer | Teknologi / Layanan | Deskripsi Peran |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, Vite, Tailwind CSS v4, Lucide React | Single Page Application (SPA) responsif untuk kasir, operator, dan owner. |
| **State & Hooks** | React Context (`AuthContext`, `ThemeContext`), Custom Hooks | Pengelolaan sesi login, tema dark/light, serta memoized analytics. |
| **Database & Auth** | Supabase (PostgreSQL 15+, Auth, Realtime) | Database relasional utama, otentikasi user kasir/owner, serta WebSocket event subscription. |
| **Serverless & Edge** | Cloudflare Pages & Workers | Hosting frontend global dan proxy serverless API. |
| **Integrasi Eksternal** | Google Sheets (AppSheet via Apps Script), WhatsApp CRM Gateway | Sinkronisasi data multi-channel dan otomasi retensi pelanggan. |

---

## 2. Arsitektur Akuntansi Dua-Tingkat (Two-Tier Accounting)

Aplikasi POS Jaya Bersama menerapkan pemisahan antara **pencatatan operasional transaksi mikro (Sub-Ledger)** dan **pencatatan arus kas buku besar (General Ledger)**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     LEVEL OPERASIONAL (SUB-LEDGER)                      │
│ - Mencatat detail transaksi satuan secara langsung saat struk dicetak.   │
│ - Tabel: [struk] (parent), [cafe] (makanan/minuman), [carwash] (jasa)    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                         (DIPOSKAN DI AKHIR HARI)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      LEVEL FINANSIAL (GENERAL LEDGER)                   │
│ - Rekapitulasi arus kas fisik masuk/keluar & pengeluaran operasional.    │
│ - Tabel: [cashflow] (arus kas), [pos_balances] (view saldo terkini)     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Mengapa Desain Ini Diterapkan?
1. **Kecepatan Kasir Maksimal**: POS tidak perlu memicu penulisan ke buku kas (*cashflow table*) setiap kali segelas kopi terjual. Penulisan ke *cashflow* hanya terjadi saat **Tutup Kasir (EOD)**, **Input Modal Awal**, atau **Input Pengeluaran Operasional**.
2. **Kesesuaian dengan Uang Fisik**: Kas laci tidak terganggu oleh fluktuasi pencatatan per item dan mempermudah kasir menghitung fisik uang saat serah terima shift.
3. **Analisis Real-Time Tanpa Lag**: Dashboard dapat membaca omzet *real-time* langsung dari tabel sub-ledger tanpa menunggu proses tutup kasir di malam hari.

---

## 3. Diagram Alur Logika Data (Data Flow Architecture)

```mermaid
graph TD
    subgraph Database Supabase
        DB_Struk[(struk)]
        DB_Cafe[(cafe)]
        DB_Cw[(carwash)]
        DB_Cf[(cashflow)]
        DB_Resep[(resep)]
        DB_Bal[(pos_balances)]
    end

    subgraph 1. Pengambilan Data (Data Fetching Layer)
        F_Struk[strukList]
        F_Cafe[cafeList]
        F_Cw[carwashList]
        F_Cf[cashflowLogs]
        F_Resep[resepList]
        F_Bal[posBalances]
    end

    subgraph 2. Filter Waktu (Time Range Filtering)
        FilterTime{Preset Filter Aktif}
        FilterCustomDate[isDateInRange: Today / Month / Custom]
    end

    subgraph 3. Pemrosesan Logika (Memoization Hooks)
        L_Finance[financialAnalytics: Total Masuk, Keluar, Net Laba]
        L_Cafe[cafeAnalytics: Omzet, HPP Resep, Margin]
        L_Cw[carwashAnalytics: Omzet, Gaji Kru, Komisi]
        L_Cust[customerReport: Frekuensi Plat, LTV, Loyalty VIP]
    end

    subgraph 4. Komponen UI Dashboard
        UI_Over[Tab Overview Ringkasan]
        UI_Cafe[Tab Performa Cafe]
        UI_Cw[Tab Performa Carwash]
        UI_Cust[Tab CRM Laporan Customer]
    end

    %% Database to Fetching
    DB_Struk -->|fetchAllRows| F_Struk
    DB_Cafe -->|fetchAllRows| F_Cafe
    DB_Cw -->|fetchAllRows| F_Cw
    DB_Cf -->|fetchAllRows| F_Cf
    DB_Resep -->|fetchAllRows| F_Resep
    DB_Bal -->|SELECT view| F_Bal

    %% Fetching to Filter
    F_Struk & F_Cafe & F_Cw & F_Cf --> FilterTime
    FilterTime -->|today / month / custom| FilterCustomDate

    %% Filtered Data to Logic Hooks
    FilterCustomDate -->|filteredCashflowLogs| L_Finance
    FilterCustomDate -->|filteredCafeList| L_Cafe
    FilterCustomDate -->|filteredCarwashList| L_Cw
    F_Cw -->|allCarwashList sepanjang masa| L_Cust
    F_Resep -->|resepList| L_Cafe

    %% Logic to UI
    L_Finance --> UI_Over
    L_Cafe --> UI_Cafe
    L_Cw --> UI_Cw
    L_Cust --> UI_Cust
```

---

## 4. Skema Database Supabase & Kamus Relasi Tabel

### A. Tabel Master Data
1. **`profiles`**: Data pengguna aplikasi dan peran hak akses.
   * `id` (UUID, PK) $\rightarrow$ Terhubung dengan `auth.users.id`.
   * `nama` (TEXT), `role` (`'Owner'` / `'Kasir'`), `created_at` (TIMESTAMP).
2. **`stok_barang`**: Katalog bahan baku dapur F&B dan perlengkapan cuci.
   * `id_bahan_baku` (TEXT, PK), `nama_bahan` (TEXT), `stok` (NUMERIC), `satuan` (TEXT).
3. **`daftar_harga_menu`**: Menu F&B Cafe.
   * `id_menu` (TEXT, PK), `daftar_menu` (TEXT), `harga` (NUMERIC).
4. **`resep`**: Komposisi bahan per menu (Formula HPP).
   * `id_resep` (TEXT, PK), `id_menu` (FK $\rightarrow$ `daftar_harga_menu.id_menu`), `id_bahan_baku` (FK $\rightarrow$ `stok_barang.id_bahan_baku`), `jumlah` (NUMERIC).
5. **`karyawan_cuci` & `karyawan_kantor`**: Data staf operasional.
   * `id` (TEXT, PK), `nama` (TEXT), `status` (TEXT).

---

### B. Tabel Transaksi (Sub-Ledger)
1. **`struk`**: Induk transaksi pembayaran.
   * `id_struk` (TEXT, PK), `tanggal` (DATE), `jam` (TIME), `nama_pelanggan` (TEXT), `metode_bayar` (`'CASH'`, `'QRIS'`, `'SPLIT'`), `status_bayar` (`'Pending'`, `'Selesai'`, `'Batal'`), `kasir` (TEXT), `diskon_carwash` (NUMERIC), `diskon_cafe` (NUMERIC), `total_tagihan` (NUMERIC), `created_at` (TIMESTAMP).
2. **`cafe`**: Detail item pesanan F&B.
   * `id_detail` (TEXT, PK), `id_struk` (FK $\rightarrow$ `struk.id_struk` ON DELETE CASCADE), `nama_menu` (TEXT), `qty` (INTEGER), `harga_satuan` (NUMERIC), `subtotal` (NUMERIC).
3. **`carwash`**: Detail pendaftaran pencucian mobil.
   * `id_transaksi` (TEXT, PK), `id_struk` (FK $\rightarrow$ `struk.id_struk` ON DELETE CASCADE), `tanggal` (DATE), `jam` (TIME), `plat` (TEXT), `model` (TEXT), `no_telepon` (TEXT), `ukuran` (TEXT), `variant` (TEXT), `paket` (TEXT), `kehadiran` (`'TUNGGU'` / `'TINGGAL'`), `harga` (NUMERIC), `anggota_1` (TEXT), `anggota_2` (TEXT), `gaji_pencuci` (NUMERIC), `gaji_anggota` (NUMERIC), `status` (`'Dalam Antrean'`, `'Sedang Dicuci'`, `'Selesai'`, `'Batal'`).

---

### C. Tabel Finansial (General Ledger)
1. **`cashflow`**: Buku besar mutasi kas riil.
   * `id_cashflow` (TEXT, PK), `id_sumber` (TEXT, Nullable $\rightarrow$ `id_struk` / `id_pengeluaran`), `tanggal` (DATE), `keterangan_transaksi` (TEXT), `jenis` (`'Pemasukan'`, `'Pengeluaran'`), `kategori` (TEXT), `pemasukan` (NUMERIC), `pengeluaran` (NUMERIC), `pos` (`'SALDO CASH'`, `'SALDO REKENING Y'`, `'SALDO REKENING N'`).
2. **`pengeluaran`**: Rincian transaksi belanja beban operasional.
   * `id_pengeluaran` (TEXT, PK), `id_cashflow` (FK $\rightarrow$ `cashflow.id_cashflow`), `tanggal` (DATE), `jam` (TIME), `nama_pengeluaran` (TEXT), `jenis` (TEXT), `kategori` (TEXT), `nominal` (NUMERIC).
3. **`pos_balances`** (Database View):
   ```sql
   CREATE OR REPLACE VIEW public.pos_balances AS
   SELECT pos, COALESCE(SUM(pemasukan - pengeluaran), 0.00) AS balance
   FROM public.cashflow
   GROUP BY pos;
   ```

---

## 5. Logika Bisnis & Formula Perhitungan

### 5.1 Formula HPP F&B Cafe & Fallback 35%
Perhitungan laba kotor Cafe menggunakan data resep riil:
$$\text{HPP Menu (Resep)} = \sum_{i=1}^{n} (\text{Qty Bahan}_i \times \text{Harga Satuan Bahan}_i)$$
Jika menu belum memiliki resep yang terdaftar di database:
$$\text{HPP Menu (Fallback)} = \text{Harga Jual} \times 35\%$$

### 5.2 Formula Alokasi Komisi Kru Cuci
$$\text{gaji\_anggota} = \begin{cases} \text{gaji\_pencuci} & \text{jika hanya ada anggota\_1} \\ \frac{\text{gaji\_pencuci}}{2} & \text{jika ada anggota\_1 dan anggota\_2} \end{cases}$$

### 5.3 Algoritma Smart Auto-Fill Plat Nomor
Saat kasir mengetik plat nomor pada form carwash:
* Sistem mendebounce selama 600ms.
* Melakukan kueri riwayat cuci terakhir:
  ```javascript
  supabase.from('carwash')
    .select('model, no_telepon, ukuran, variant, paket')
    .eq('plat', cleanPlat)
    .order('created_at', { ascending: false }).limit(1)
  ```
* Otomatis mengisi informasi kendaraan dan kontak pelanggan.

### 5.4 Rekap Tutup Kasir (End of Day) & Penanganan Split Payment
Pada akhir hari, sistem merekap:
$$\text{Omzet CASH} = \sum \text{Struk}_{\text{CASH}} + \sum \text{Porsi Tunai}_{\text{SPLIT}}$$
$$\text{Omzet QRIS} = \sum \text{Struk}_{\text{QRIS}} + \sum \text{Porsi Non-Tunai}_{\text{SPLIT}}$$
$$\text{Fisik Kas Seharusnya} = \text{Modal Awal} + \text{Omzet CASH} - \text{Pengeluaran Laci Kasir}$$

---

## 6. Sinkronisasi Realtime & Integrasi Layanan Eksternal

### 6.1 Layar Antrean Carwash Real-time
Komponen `CarwashQueue.jsx` berlangganan perubahan status antrean secara langsung via Supabase Realtime channel postgres_changes untuk tabel `carwash`.

### 6.2 Sinkronisasi Google Sheets / AppSheet
Sinkronisasi dua arah dilakukan via Google Apps Script pada Google Sheets yang mengirimkan payload JSON ke Supabase REST API endpoint.

### 6.3 Integrasi API Gateway WhatsApp CRM
Sistem mendukung webhook database Supabase / backend proxy untuk mengirimkan pesan WhatsApp otomatis:
* Notifikasi Struk Selesai Cuci.
* Voucher Loyalitas Reward untuk member VIP ($\ge 5$ kunjungan).
* Pengingat Servis / Retention untuk pelanggan yang belum berkunjung dalam 30 hari.

---

## 7. Struktur Folder & Navigasi Kode Sumber

```
JB POSS APS/
├── Documentation/                       # 📁 PUSAT DOKUMENTASI LENGKAP
│   ├── README.md                        # Indeks & Panduan Dokumentasi
│   ├── 01_panduan_penggunaan_aplikasi_user_manual.md
│   ├── 02_arsitektur_dan_arus_data_teknis.md
│   ├── 03_laporan_audit_arsitektur_qa.md
│   └── 04_skema_database_dan_kamus_data.md
├── src/
│   ├── components/                      # Komponen UI (Sidebar, InteractiveCalendar, dsb.)
│   ├── context/                         # AuthContext, ThemeContext
│   ├── pages/                           # Halaman Utama (CafePOS, CarwashQueue, Finance, dsb.)
│   ├── utils/                           # Helper functions (helpers.js, financeHelpers.js, dsb.)
│   ├── App.jsx                          # Root Router
│   └── main.jsx                         # React Root Mounting
├── cloudflare/                          # Konfigurasi D1 / Worker / SQL Schema
└── package.json                         # Dependensi Proyek
```
