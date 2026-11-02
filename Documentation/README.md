# 📚 PUSAT DOKUMENTASI SISTEM POS JAYA BERSAMA
**Dokumentasi Resmi Operasional, Arsitektur Teknis, Database, dan Audit QA**

Selamat datang di direktori dokumentasi resmi **Sistem POS & Manajemen Operasional Jaya Bersama (Cafe & Carwash)**. Seluruh panduan dan spesifikasi telah dikonsolidasikan ke dalam folder ini untuk mempermudah navigasi tim operasional maupun tim pengembang.

---

## 🗂️ Struktur & Panduan Dokumen

| No | Dokumen | Target Pembaca | Deskripsi Konten |
| :---: | :--- | :--- | :--- |
| **01** | [**01. Panduan Penggunaan (User Manual & SOP)**](./01_panduan_penggunaan_aplikasi_user_manual.md) | Kasir, Operator Cuci, Finance & Owner | SOP lengkap transaksi kasir, pendaftaran cuci mobil, smart auto-fill plat, cetak struk, penanganan pending bills, tutup kasir (EOD), rekap gaji karyawan cut-off 16-15, dan troubleshooting. |
| **02** | [**02. Arsitektur & Arus Data Teknis**](./02_arsitektur_dan_arus_data_teknis.md) | Software Engineer, System Architect | Arsitektur akuntansi dua tingkat (*Two-Tier Accounting*), diagram Mermaid alur data, integrasi Supabase, sinkronisasi Google Sheets/AppSheet, serta formula bisnis HPP & komisi. |
| **03** | [**03. Laporan Audit Arsitektur QA/QC**](./03_laporan_audit_arsitektur_qa.md) | Lead Developer, QA Tester | Hasil evaluasi mendalam performa, stabilitas fungsional (analisis bug Split Payment), keamanan API Key WhatsApp, dan prioritas action plan perbaikan sistem. |
| **04** | [**04. Skema Database & Kamus Data**](./04_skema_database_dan_kamus_data.md) | Database Administrator, Backend Developer | Definisi kamus data 13 tabel, relasi foreign key, tipe data kolom, view agregasi `pos_balances`, dan indeks optimasi kueri. |
| **08** | [**08. Perbaikan Temuan QA (31 Okt 2026)**](./08_perbaikan_temuan_qa.md) | Engineering Team, QA Tester | Tindak lanjut perbaikan temuan payroll date rollover, CSV formula injection, dan reward entitlement. |
| **10** | [**10. Catatan Khusus Perbaikan & Testing 4-Batch QA (02 Nov 2026)**](./10_catatan_khusus_perbaikan_dan_testing_4_batch_qa.md) | Lead Orchestrator, QA Auditor, DevOps | Catatan lengkap perbaikan keamanan P0 (K01-K04), integritas jurnal & composite FK (T01, T03, T08, T09), checkout atomik POS (T02, T04, T05), penegakan kuota lisensi DB, serta bukti 22 live cloud test. |

---

## 🚀 Ringkasan Modul Aplikasi

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WEBAPP POS JAYA BERSAMA                            │
├───────────────────────┬──────────────────────────┬──────────────────────────┤
│ 🛒 KASIR & OPERASIONAL│ 📊 ANALITIK & CRM        │ 💰 KEUANGAN & HRD        │
├───────────────────────┼──────────────────────────┼──────────────────────────┤
│ • POS Kasir Cafe      │ • Dashboard KPI Omzet    │ • Kas Laci & Bank        │
│ • Pendaftaran Carwash │ • Analisis Laba Bersih   │ • Rekap Upah Cuci (16-15)│
│ • Smart Auto-Fill Plat│ • Food Cost Resep Cafe   │ • Input Beban Operasional│
│ • Display Antrean Live│ • Profiling Loyalitas CRM│ • Manajemen Master Data  │
└───────────────────────┴──────────────────────────┴──────────────────────────┘
```

---

## 🛠️ Stack Teknologi

* **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide React
* **Backend & Database**: Supabase (PostgreSQL 15+, Auth, Realtime WebSocket)
* **Serverless / Edge**: Cloudflare Pages & D1 SQLite
* **Eksternal**: Google Apps Script (AppSheet), WhatsApp Business API CRM Gateway

---
*Untuk pertanyaan teknis atau pembaruan alur SOP, silakan merujuk pada dokumen yang bersangkutan di atas.*
