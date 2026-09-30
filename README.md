# 🚀 Jaya Bersama POS & Manajemen Operasional (Cafe & Carwash)

Aplikasi WebApp Point of Sale (POS) modern, manajemen antrean cuci mobil *real-time*, akuntansi dua tingkat (*Two-Tier Accounting*), penggajian komisi kru cuci, dan analitik loyalitas pelanggan (CRM) yang dibangun untuk **Jaya Bersama Cafe & Carwash**.

---

## 📚 Pusat Dokumentasi Proyek

Seluruh dokumentasi teknis, kamus data, hasil audit, dan panduan penggunaan (*User Manual / SOP*) telah dikonsolidasikan secara rapi di dalam direktori **[`Documentation/`](./Documentation/)**:

1. 📖 **[01. Panduan Penggunaan Aplikasi (User Manual & SOP)](./Documentation/01_panduan_penggunaan_aplikasi_user_manual.md)**  
   *Panduan operasional harian untuk Kasir, Pengawas Antrean Cuci, dan Finance/Owner (Buka/Tutup Kasir, Smart Auto-Fill Plat, Pending Bills, Komisi Gaji 16-15, dll).*

2. 🏗️ **[02. Arsitektur & Arus Data Teknis](./Documentation/02_arsitektur_dan_arus_data_teknis.md)**  
   *Spesifikasi teknis, arsitektur Two-Tier Accounting, diagram Mermaid alur data, integrasi Supabase & Google Sheets.*

3. 📋 **[03. Laporan Audit Arsitektur QA/QC](./Documentation/03_laporan_audit_arsitektur_qa.md)**  
   *Laporan audit performa, stabilitas fungsional, analisis keamanan API key, dan rekomendasi solusi prioritas.*

4. 🗄️ **[04. Skema Database & Kamus Data](./Documentation/04_skema_database_dan_kamus_data.md)**  
   *Definisi 13 tabel database, tipe data, relasi foreign keys, database views, dan indeks optimasi.*

---

## ⚡ Fitur Utama Aplikasi

- **POS Kasir Cepat (Cafe & Carwash)**: Mendukung transaksi satuan maupun gabungan F&B + Cuci Mobil dalam 1 struk nota.
- **Smart Auto-Fill Plat Nomor**: Mengenali riwayat mobil pelanggan (merk, tipe, varian, nomor WhatsApp) secara otomatis dalam hitungan milidetik.
- **Display Antrean Carwash Real-time**: Layar antrean kendaraan interaktif dengan status *Dalam Antrean*, *Sedang Dicuci*, dan *Selesai*.
- **Manajemen Penggajian Komisi Kru Cuci**: Rekapitulasi upah cuci otomatis dengan sistem cut-off tanggal 16–15 dan rincian per pekerjaan.
- **Akuntansi Arus Kas Laci & Rekening**: Pelacakan saldo `SALDO CASH`, `REKENING Y (BCA)`, dan `REKENING N (Mandiri)` secara *real-time*.
- **Analitik Laba & Food Cost**: Perhitungan HPP Cafe berbasis takaran resep otomatis dengan fallback cerdas 35%.
- **Loyalty CRM WhatsApp**: Pelacakan riwayat kunjungan pelanggan (VIP, Reguler, Baru) dan kesiapan integrasi pesan WhatsApp otomatis.

---

## 💻 Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide React
- **Backend & Database**: Supabase (PostgreSQL 15+, Auth, Realtime) & Cloudflare D1
- **Integrasi**: Google Apps Script (AppSheet), WhatsApp Gateway

---

## 🛠️ Menjalankan Aplikasi di Lingkungan Lokal

```bash
# 1. Install dependensi
npm install

# 2. Jalankan server pengembang lokal
npm run dev

# 3. Build untuk produksi
npm run build
```
