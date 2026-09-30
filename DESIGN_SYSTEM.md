# RELAYPOS ENTERPRISE DESIGN SYSTEM & UI/UX MASTER ARCHITECTURE (V3.0)
> **Status Dokumen:** FULLY APPROVED (ACC) oleh User  
> **Platform Target:** Tablet Android (Google Chrome Landscape) & Mobile Crew  
> **Filosofi Inti:** Solid Tactile Enterprise, Zero-Body-Scroll, Touch-First Ergonomics, Zero-AI-Slop (21st.dev Standard).

---

## 🎨 1. MASTER UI KIT (SATU DESIGN SYSTEM TUNGGAL)

### 1.1 Palet Warna Baku (Solid Enterprise Slate Hierarchy)
Menghilangkan semua blur berat (`backdrop-blur-xl`), gradasi ungu neon generik (*AI slop*), dan bayangan tebal yang memicu throttling pada GPU tablet Android:

| Peran Token | Kode Hex | Kelas Tailwind | Rasional & Fungsi Bisnis |
| :--- | :--- | :--- | :--- |
| **Canvas / Root BG** | `#080C14` | `bg-[#080C14]` | Obsidian Dark pekat; hemat baterai layar tablet OLED/IPS, kontras teks maksimal. |
| **Surface Card / Base** | `#0F172A` | `bg-slate-900 border border-slate-800` | Kontainer data utama dengan garis pembatas tegas 1px tanpa blur. |
| **Surface Interactive** | `#1E293B` | `bg-slate-800 hover:bg-slate-750` | Latar tombol sekunder, pill kategori aktif, dan card keranjang. |
| **Primary Action (CTA)** | `#2563EB` | `bg-blue-600 hover:bg-blue-500` | Tombol utama (Bayar, Simpan, Konfirmasi). Netral dan fokus. |
| **Success / Lunas** | `#16A34A` | `bg-emerald-600 text-emerald-100` | Transaksi lunas, mobil selesai cuci, stok aman. |
| **Warning / Pending** | `#D97706` | `bg-amber-600 text-amber-100` | Antrean pengerjaan, pesanan open-bill meja cafe. |
| **Danger / Destruktif** | `#DC2626` | `bg-rose-600 text-rose-100` | Hapus item, void nota, pembatalan (wajib modal konfirmasi ganda). |
| **Financial Monospace** | `#38BDF8` | `text-sky-400 font-mono` | Nominal uang & angka kalkulasi kasir agar angka tidak lompat lebar. |

---

### 1.2 Standar Ikonografi & Logo (21st.dev & Linear Standard)
1. **Eliminasi Total "AI Slop"**:
   - Dilarang keras menggunakan ikon `<Sparkles />` pada fungsi non-AI.
   - Dilarang membungkus ikon dalam kotak gradasi ungu/neon menyala (`bg-gradient-to-br from-blue-600/20 via-indigo-600/10` dsb).
   - Menghapus efek `animate-pulse-glow`, `animate-blob`, dan bayangan bercahaya pada ikon.
2. **Standar Ikon Baku**:
   - Seluruh ikon menggunakan Lucide React dengan ketebalan seragam `strokeWidth={1.75}`.
   - Status netral berwujud monokrom telanjang (*naked*) `text-slate-400` / `text-slate-500`.
   - Warna aksen hanya digunakan untuk status semantik nyata (Hijau = Berhasil/Kas Masuk, Kuning = Antre/Pending, Merah = Void/Beban).
3. **Redesain Brand & Logo**:
   - Menanggalkan logo lama bertema cyberpunk/glow.
   - Menyiapkan logo monogram geometris modern yang tajam, minimalis, dan sangat terbaca pada resolusi 16px hingga 32px di tablet, siap untuk adaptasi Nama Brand Baru pilihan User.

---

### 1.3 Standar Tipografi & Format Angka
- **Font Utama (Display & UI Body)**: `Plus Jakarta Sans` / `Inter`, sans-serif.
- **Font Finansial & Data Tabular**: `JetBrains Mono` / Monospace dengan utility `tabular-nums` dan `text-right` untuk kolom uang.
- **Skala Hirarki Teks**:
  - `Header H1 (Judul Modul)`: `text-lg sm:text-xl font-bold tracking-tight text-white`
  - `Header H2 (Sub-modul/Section)`: `text-sm sm:text-base font-bold text-slate-200`
  - `Body / Label Form`: `text-xs sm:text-sm font-semibold text-slate-400`
  - `Financial Total (Kasir)`: `text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-400`
  - `Micro Badges & Shortcuts`: `text-[10px] sm:text-[11px] font-bold uppercase tracking-wider`

---

### 1.4 Standar Komponen Baku

#### A. Topbar Baku
- Tinggi baku: **`h-14` (56px) sticky top-0 z-40**.
- Komponen: Toggle sidebar + Logo Brand + Badge Outlet Aktif + Status Shift Kasir + Indikator Cloud Sync + Jam Digital Operasional + Profil & Logout.

#### B. Sidebar Baku (Collapsible Rail Mode)
- **Tablet Landscape**: Default **Icon-Only Rail Mode (Lebar 72px / `w-[72px]`)** menyisakan 93% area horizontal layar untuk stasiun kasir dan antrean. Dilengkapi tooltip nama menu saat di-hover/di-tap.
- **Mobile Portrait**: Tersembunyi penuh (`hidden`), dibuka sebagai drawer mengambang (`fixed inset-0 z-50`).

#### C. Card Baku (Data & Touch-Dense)
- Radius: `rounded-xl`, Border: `border border-slate-800 bg-slate-900`, Padding: `p-3 sm:p-4`, Tactile feedback: `active:scale-[0.98] transition-all duration-100 select-none`.

#### D. Input Box & Form Controls
- Tinggi sentuh: **Minimal `h-11` (44px) hingga `h-12` (48px)**.
- Ukuran font input: **Minimal `16px` (`text-base` di mobile/tablet)** untuk mencegah auto-zoom paksa oleh browser Chrome Android.
- Input Rupiah: Rata kanan (`text-right font-mono`) dengan prefix `Rp` permanen.

---

## 📱 2. SPESIFIKASI RESPONSIF & ERGONOMI TABLET ANDROID

### 2.1 Viewport Stability & Zero-Body-Scroll
- **Zero Viewport Jitter**: Wajib menggunakan `100dvh` (Dynamic Viewport Height) dan `overflow-hidden` pada container utama aplikasi.
- **Zero Body Scroll**: Dilarang ada scroll pada level `window` atau `body` di halaman kasir/operasional.

### 2.2 Ergonomi Sentuh (Fitts's Law)
- Semua tombol aksi sering (Tombol Tambah/Kurang Qty, Tombol Numpad, Pilihan Tunai/QRIS) memiliki target tap minimal **48px x 48px** dengan jarak minimal `gap-2` (8px).

---

## 🏛️ 3. ARSITEKTUR LAYOUT PER HALAMAN (PAGE SPECIFICATIONS)

### 3.1 POS Kasir (`/pos` - Cafe, Carwash & Hybrid)
- **The Split-Station Layout (Rasio 64% : 36%)**:
  - **Kolom Kiri (64% Lebar)**: Search bar + pill filter kategori horizontal swipe-able + Grid produk menu dengan foto terkontrol (`aspect-[4/3]`) + Scroll vertikal mandiri `overflow-y-auto`.
  - **Kolom Kanan (36% Lebar) - Dock Keranjang Terkunci**: Header (Meja / Plat Nomor) + Daftar item keranjang (tombol `+` / `-` ukuran 44px) + Footer Terkunci Permanen dengan **Tombol Bayar Raksasa (Tinggi `h-14` / 56px)** di Thumb Zone kasir.

### 3.2 Antrean Carwash (`/queue`)
- **Live Kanban Bay Board**:
  - Kolom 1 (Kuning): Antrean Masuk (Waiting).
  - Kolom 2 (Biru): Sedang Cuci (Bay Slots 1, 2, 3...) dilengkapi timer durasi pengerjaan aktif & penugasan kru.
  - Kolom 3 (Hijau): Selesai Cuci & Siap Diserahkan (Tombol Bayar di POS / Cetak Struk).

### 3.3 Keuangan & Laporan Akuntansi (`/finance` & `/reports`)
- **Dual-Station Accounting Hub**: Ribbon Saldo Kas Ringkas + Filter Periode & Kategori Akun COA + Tabel Data-Dense `font-mono tabular-nums text-right` + Modal Catat Pengeluaran berbasis RBAC (Kasir vs Owner).

### 3.4 Gudang & Inventori BOM (`/gudang`)
- **Categorized Inventory Hub**: Tab Bahan Baku/Konsumabel (BOM) + Tab Barang Dagangan Jadi + Tab Kartu Stok/Stock Opname + Badge Stok Visual (`🟢 Aman`, `🟡 Kritis`, `🔴 Habis`).

### 3.5 CRM & Pelanggan (`/crm`)
- **Vehicle & Loyalty Card View**: Quick Search terfokus Plat Nomor (3-4 digit) + Progress stampel loyalty cuci gratis + Catatan kondisi fisik kendaraan.

### 3.6 Pengaturan & Master Data (`/admin`)
- **Settings Bento Master**: Arsitektur Tab Sub-Navigasi (Layanan Cuci, Menu Cafe, Struk Thermal Live Preview, Tim & Komisi, Lisensi Outlet).

### 3.7 Konsolidasi Multi-Outlet (`/konsolidasi`)
- **Card-per-Branch Matrix**: Matrix performa komparatif antar outlet cabang dengan tombol 1-ketukan untuk beralih workspace.

---

## 🗄️ 4. PEMETAAN OLAH DATA & 5 SKEMA DATABASE BARU (APPROVED)

### 4.1 Pemetaan Data Eksisting yang Siap Diolah (Tanpa Ubah DB)
1. **Pola Jam Sibuk (08:00 – 22:00)**: Dari `struk.jam` & `carwash.jam`.
2. **Siklus Hari Kunjungan (Senin – Minggu)**: Dari `struk.tanggal`.
3. **Matriks Sinergi Estafet (Cross-Selling Cuci x Kopi)**: Dari relasi `carwash.id_struk` dan `cafe.id_struk`.
4. **Tingkat Retensi Kendaraan (Repeat Rate)**: Dari frekuensi plat nomor di tabel `carwash`.
5. **Produktivitas & Komisi Kru Cuci**: Dari `carwash.anggota_1`, `anggota_2`, dan `gaji_anggota`.
6. **BCG Matrix Menu Cafe**: Dari `cafe` dikaitkan dengan `resep` dan `stok_barang`.

### 4.2 5 Atribut / Skema Database Baru yang Ditambahkan
1. `no_bay` (`carwash`): Mengukur efisiensi dan utilisasi fisik per slot bay cuci.
2. `waktu_selesai` (`carwash`): Mengukur rata-rata kecepatan pengerjaan (*Turnaround Time SLA*).
3. `cogs_per_unit` (`cafe` & `carwash`): Mengunci modal bahan baku pada saat transaksi terjadi untuk kalkulasi laba kotor absolut.
4. `rating` (`struk`): Menangkap skor kepuasan pelanggan (1-5) untuk korelasi kualitas layanan.
5. Tabel `business_targets`: Menyimpan target omzet dan kapasitas bulanan untuk membandingkan realisasi vs target (KPI).

---

## 🤖 5. SPESIFIKASI "AI EXECUTIVE PROMPT BUILDER"

### 5.1 Alur Kerja & Jangkauan Waktu (Ultra-Lean Querying)
- Mengambil data dengan query kolom terarah (hanya mengambil kolom metrik esensial untuk menghemat bandwidth 90% pada tablet).
- **Pilihan 4 Rentang Waktu**:
  1. `📅 1 Minggu Terakhir`: Evaluasi taktikal jadwal shift kru dan persiapan akhir pekan.
  2. `🏢 1 Bulan Terakhir` *(Default)*: Evaluasi target bulanan, margin laba bersih, dan audit biaya operasional.
  3. `📈 3 Bulan Terakhir`: Evaluasi tren pertumbuhan kuartalan (*Quarterly Growth Trend*).
  4. `🌐 All-Time (Semua Waktu)`: Evaluasi kelayakan model bisnis jangka panjang dan kesiapan ekspansi cabang baru.

### 5.2 Aturan Isolasi Ketat Multi-Tenant (Strict Zero-Leakage)
- **Tenant Murni Cafe (`CAFE`)**: 100% bebas dari istilah kendaraan, plat mobil, bay cuci, dan kru cuci. Fokus murni pada food cost, menu engineering, dan meja cafe.
- **Tenant Murni Carwash (`CARWASH`)**: 100% bebas dari istilah menu makanan, minuman, porsi, meja, dan resep F&B. Fokus murni pada utilisasi bay, antrean mobil, dan komisi kru.
- **Tenant Hybrid (`HYBRID`)**: Menjalankan evaluasi sinergi estafet penuh (The Relay Effect).

### 5.3 Ragam Mode Konsultasi yang Tersedia
1. `🎯 Performa Bisnis & Penjualan`: Fokus jam sibuk, promo hari sepi, dan AOV.
2. `💰 Audit Finansial & CFO`: Fokus arus kas, rasio OPEX, kesehatan dividen/prive owner, dan dana darurat.
3. `☕ Menu Engineering & Resep`: Fokus klasifikasi menu bintang vs beban dan kontrol food waste.
4. `🔄 Loyalitas & CRM Pelanggan`: Fokus retensi pelanggan dan program cuci gratis.
5. `🌐 Rekapitulasi 360° & Skor Kesehatan Bisnis`: Evaluasi helikopter komprehensif (Skor 1-100, SWOT, dan Kesiapan Ekspansi Cabang) untuk Owner dan Investor.

### 5.4 Jaminan Privasi (Non-Negotiable)
- 100% Nomor WhatsApp/Telepon dibuang.
- Nomor plat kendaraan di-anonymize menjadi representasi frekuensi acak.
- Data pribadi pelanggan tidak pernah bocor ke server AI publik.

---

## 🚀 6. ROADMAP EKSEKUSI BERTAHAP (EXECUTION STAGES)

1. **Stage 1 (Fondasi Global)**:
   - Sidebar Rail 72px (Tablet landscape) + Topbar Baku 56px di `App.jsx`, `Sidebar.jsx`, dan `ExecutiveLayout.jsx`.
   - Penerapan `100dvh` dan Zero-Body-Scroll.
   - Pembersihan ikon ala AI (`<Sparkles />`, kotak gradasi glow) di seluruh fondasi layout.
2. **Stage 2 (Database Migration & Helper)**:
   - Migrasi SQL untuk 5 atribut data baru (`no_bay`, `waktu_selesai`, `cogs_per_unit`, `rating`, `business_targets`).
   - Implementasi utility engine `generateBusinessAIPrompt.js`.
3. **Stage 3 (Operasional POS & Antrean)**:
   - Rekayasa Ulang Layout POS Kasir (Split-Station 64:36, tombol bayar raksasa terkunci).
   - Rekayasa Ulang Antrean Carwash (Live Kanban Bay Board).
4. **Stage 4 (Executive Cockpit & Modal AI Prompt Builder)**:
   - Dashboard 3-Station + Analisis Jam Sibuk, Hari Sibuk & Sinergi Cuci-Kopi.
   - Pemasangan Modal "AI Prompt Builder" di Dashboard dan Keuangan.
5. **Stage 5 (Audit UI/UX & QA Testing)**:
   - Verifikasi kerapian layout tablet, uji zero-blank-screen, dan lint check 100% lolos.
