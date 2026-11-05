# Matrix Kontrak Akses & Keamanan SaaS ERP RelayPOS (PR-1)

Tanggal: 5 November 2026  
Status: **DRAFT KONTRAK RESMI (BASELINE AUDIT PR-1)**  
Tujuan: Menjadi sumber kebenaran tunggal (*Single Source of Truth*) untuk otorisasi database (RLS & Grants), RPC Stored Procedures, serta kontrol antarmuka pengguna (Frontend Guards & Resolvers).

---

## 1. Definisi Peran (*Canonical Roles*) & Cakupan (*Scope*)

| Role Identifier | Display Label | Scope Wilayah | Deskripsi Tanggung Jawab Bisnis |
|---|---|---|---|
| `Super Admin` | Super Admin (Platform Founder) | Lintas Tenant (Platform-wide) | Mengelola siklus hidup tenant, lisensi global, dan pemantauan infrastruktur. Tidak terlibat dalam operasional harian kasir toko. |
| `Owner` | Pemilik Usaha (Tenant Owner) | Seluruh Cabang dalam Tenant Sendiri | Mengelola seluruh cabang toko miliknya, mengakses laporan keuangan konsolidasi, laba rugi, neraca, manajemen COA, staf, lisensi, dan master katalog. |
| `Admin` | Manajer Operasional (Tenant Admin) | Cabang Tertentu / Seluruh Cabang Ditugaskan | Mengelola operasional harian cabang tugas: inventori (restock & opname), katalog menu/harga, operasional kasir, dan pengeluaran harian. Dibatasi dari aktivasi lisensi resmi dan laporan laba rugi level holding. |
| `Kasir` | Kasir / Teller POS | **Hanya Cabang Tugas (`branch_id`)** | Melayani penjualan, menerima pembayaran (Tunai, QRIS, Transfer, Split), memeriksa stok cabang tugas, menukarkan reward pelanggan (via RPC), dan mencetak struk. DILARANG membaca payroll, mengubah master harga/resep, memutasi akun bank/kas selain penjualan, atau mengubah cabang diri sendiri. |
| `Staff Kantor` | Staf Administrasi / Purchasing | Cabang Tugas / Kantor Tenant | Mengelola pencatatan operasional, faktur pembelian, dan koordinasi logistik. Tidak melayani kasir POS secara langsung. |
| `Karyawan Cuci` | Kru Pencuci Mobil / Bay Operator | Cabang Tugas | Menjalankan pengerjaan slot cuci. Diberi visibilitas antrean cuci cabang tugas; DILARANG mengakses data keuangan, pembukuan, stok master, maupun akun pengguna. |
| `Inactive` | Akun Dinonaktifkan (`is_active = FALSE`) | **Nol Akses (Tolak Total)** | Seluruh permintaan diblokir (*Fail Closed*), token kadaluarsa/lama ditolak untuk seluruh operasi tabel maupun RPC `SECURITY DEFINER`. |

---

## 2. Matrix Akses Kemampuan (*Capability Matrix*)

| Kemampuan (*Capability*) | Owner | Admin | Kasir | Staff Kantor | Karyawan Cuci | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `tenant.read` (Informasi tenant sendiri) | ✅ Penuh | ✅ Operasional | ⚠️ Minimum | ⚠️ Minimum | ⚠️ Minimum | 🌐 Scope Platform |
| `pos.sell` (Buat transaksi penjualan) | ✅ | ✅ | ✅ (Cabang Tugas) | ❌ | ❌ | ❌ |
| `pos.settle` (Pelunasan tagihan pending) | ✅ | ✅ | ✅ (Cabang Tugas) | ❌ | ❌ | ❌ |
| `inventory.stock.read` (Lihat sisa stok fisik) | ✅ Semua Cabang | ✅ Cabang Tugas | ✅ Cabang Tugas | ✅ Cabang Tugas | ❌ | ❌ |
| `inventory.cost.read` (Lihat HPP / Harga Beli) | ✅ | ⚠️ Bila diberi akses | ❌ **Dilarang** | ⚠️ Purchasing | ❌ | ❌ |
| `inventory.restock` (Catat barang masuk) | ✅ | ✅ | ❌ **Dilarang** | ✅ | ❌ | ❌ |
| `inventory.opname` (Penyesuaian stok / selisih) | ✅ | ✅ | ❌ **Dilarang** | ❌ | ❌ | ❌ |
| `catalog.master.write` (Ubah harga/menu/resep) | ✅ | ⚠️ Bila diberi akses | ❌ **Dilarang** | ❌ | ❌ | ❌ |
| `finance.payroll.read` (Baca gaji & komisi SDM) | ✅ | ⚠️ Khusus Payroll | ❌ **Dilarang** | ❌ | ❌ | ❌ |
| `finance.ledger.read` (Baca Jurnal & Buku Besar) | ✅ | ❌ | ❌ **Dilarang** | ❌ | ❌ | ❌ |
| `finance.cashflow.write` (Mutasi kas/biaya langsung) | ✅ | ✅ (Operasional) | ❌ (Hanya via POS) | ❌ | ❌ | ❌ |
| `journal.post` (Posting jurnal akuntansi) | ✅ (Via RPC/Sistem) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `journal.modify_posted` (Ubah jurnal posted) | ❌ **Dilarang** (Pakai Reversal) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `membership.manage` (Kelola staf & role) | ✅ Dalam Tenant | ⚠️ Role Rendah | ❌ **Dilarang** | ❌ | ❌ | 🌐 Scope Platform |
| `profile.self_update` (Ubah profil diri) | ✅ Nama/Pref | ✅ Nama/Pref | ⚠️ Nama/Pref saja | ⚠️ Nama/Pref saja | ⚠️ Nama/Pref saja | ✅ |
| `license.activate` (Aktivasi lisensi resmi) | ✅ Tenant Target | ❌ | ❌ | ❌ | ❌ | 🌐 Scope Platform |
| `reward.redeem` (Tukar poin/stamp loyalty) | ✅ | ✅ | ✅ (Cabang Tugas via RPC) | ❌ | ❌ | ❌ |

---

## 3. Inventaris 35 Objek Publik & Target Kebijakan Keamanan (Database Level)

### A. Kelompok Master Katalog & Operasional Kasir (7 Tabel)
*Tabel*: `daftar_harga_menu`, `carwash_packages`, `resep`, `diskon`, `metode_bayar`, `master_categories`, `kasir`
- **SELECT**: Kasir & Kru diizinkan membaca katalog yang aktif dan sesuai cabang tugas (`branch_id = current_branch_id() OR branch_id IS NULL`).
- **INSERT / UPDATE / DELETE**: Dibatasi mutlak hanya untuk `Owner` dan `Admin`. Kasir ditolak keras jika memanggil REST Data API langsung.

### B. Kelompok Inventori & Bill of Materials (3 Tabel)
*Tabel*: `stok_barang`, `barang_masuk`, `barang_keluar`
- **SELECT**: Kasir boleh membaca kuantitas sisa stok (`stok`) untuk cabang tugasnya. HPP / `harga_beli` tidak boleh terekspos ke kasir.
- **INSERT / UPDATE / DELETE**: Direct overwrite dilarang bagi Kasir. Mutasi stok kasir hanya terjadi secara atomik melalui Stored Procedure checkout POS (`fn_execute_checkout`). Aksi restock dan penyesuaian opname di `Gudang.jsx` dikunci untuk `Owner` dan `Admin`.

### C. Kelompok Finansial, Kas, & Buku Besar (6 Tabel)
*Tabel*: `cashflow`, `pengeluaran`, `pos_balances`, `chart_of_accounts`, `journal_entries`, `journal_entry_lines`
- **SELECT**: Dibatasi hanya untuk `Owner` (laporan lengkap) dan `Admin` (pengeluaran operasional cabang tugas). Kasir **DILARANG** melakukan SELECT pada `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, maupun `pos_balances`.
- **INSERT / UPDATE / DELETE**: Jurnal `journal_entries` dan `journal_entry_lines` yang sudah berstatus `POSTED` bersifat **immutable** (tidak boleh di-UPDATE/DELETE oleh role apa pun; perbaikan wajib melalui jurnal pembalik / reversal). Mutasi saldo `pos_balances` wajib melalui transaksi command RPC.

### D. Kelompok SDM & Payroll (2 Tabel)
*Tabel*: `karyawan_cuci`, `karyawan_kantor`
- **Pemisahan Data**: Kasir hanya membutuhkan daftar nama teller / anggota kru cuci untuk pencatatan transaksi POS. Data gaji, komisi (`gaji_anggota`), nomor rekening, dan payroll **DILARANG** dibaca oleh Kasir melalui Data API.

### E. Kelompok CRM & Loyalty Rewards (4 Tabel)
*Tabel*: `crm_customers`, `crm_loyalty_programs`, `crm_loyalty_logs`, `customer_reward_claims`
- **SELECT**: Kasir dapat mencari pelanggan berdasarkan nomor plat kendaraan (`plat`) pada cabang tugas.
- **INSERT / UPDATE / DELETE**: Kasir **DILARANG** melakukan direct INSERT ke `crm_loyalty_logs` atau mengubah `crm_loyalty_programs`. Penukaran reward wajib melalui RPC `redeem_customer_reward` yang memverifikasi kepemilikan tenant, keaktifan akun, status lunas struk asal, dan concurrency locking.

### F. Kelompok Entitas Organisasi & Keamanan Akun (3 Tabel)
*Tabel*: `tenants`, `branches`, `profiles`
- **`profiles` Protection**:
  - Kolom `role`, `tenant_id`, `branch_id`, dan `is_active` dikunci mutlak dari direct UPDATE pengguna non-Owner/non-Super Admin.
  - Self-update kasir hanya diizinkan untuk kolom aman (`nama`, preferensi visual).
  - Kasir tidak boleh menonaktifkan rekan atau mengubah cabang tugas dirinya sendiri.
  - Delete profil dilarang via REST (`REVOKE DELETE ON profiles FROM authenticated`).

### G. Kelompok Lisensi & Telemetri Platform (3 Tabel)
*Tabel*: `tenant_licenses`, `license_keys`, `intelligence_daily_snapshots`
- `license_keys`: Hak akses `anon`, `authenticated`, dan `PUBLIC` dicabut total. Hanya dapat diakses oleh `postgres` / `service_role`.
- `tenant_licenses`: Read-only untuk `Owner` tenant target. Mutasi hanya via RPC aktivasi resmi (`fn_activate_license_key`).
- `intelligence_daily_snapshots`: Read-only untuk `Owner` dan `Admin` tenant target.

### H. Kelompok Views Kompatibilitas (4 Views)
*Views*: `bahan_baku`, `transaksi`, `finance_summary`, `akun_keuangan`
- Seluruh view wajib mempertahankan atribut `WITH (security_invoker = true)` sehingga tunduk 100% pada RLS tabel dasar pemanggil.
- Hak akses `anon` dan `PUBLIC` dicabut total; hanya `authenticated` dan `service_role` yang diberi hak `SELECT`.

---

## 4. Kriteria Penerimaan (*Acceptance Criteria* AC-01 s.d. AC-17)

| ID | Skenario Pengujian | Hasil yang Diharapkan (*Expected Outcome*) |
|---|---|---|
| **AC-01** | Tenant A meminta fixture Tenant D pada seluruh 35 objek | Nol baris dikembalikan (`[]`); data Tenant D terbukti ada dan terbaca oleh aktor Tenant D. |
| **AC-02** | Tenant A UPDATE/DELETE data Tenant D atau INSERT dengan `tenant_id` D | Operasi menghasilkan 0 row termutasi atau ditolak error RLS/trigger; state Tenant D tidak berubah. |
| **AC-03** | Pengguna Anonim (Unauthenticated) melakukan GET/INSERT/RPC | Ditolak HTTP 401 / permission denied; nol data bocor. |
| **AC-04** | Kasir Tenant A membaca payroll (`karyawan_cuci`, `karyawan_kantor`) dan finance (`cashflow`, `chart_of_accounts`, `journal_entries`) | Ditolak / mengembalikan 0 baris; ringkasan shift kasir sah tetap berfungsi via proyeksi aman. |
| **AC-05** | Kasir memodifikasi harga menu (`daftar_harga_menu`), resep (`resep`), paket cuci, atau saldo akun | Ditolak (0 baris diupdate atau error RLS); nilai fixture tidak berubah. |
| **AC-06** | Kasir Cabang A1 membaca atau menulis data Cabang A2 pada tenant yang sama | Ditolak pada tabel operasional, view, RPC, dan ekspor CSV; Owner Tenant A tetap dapat mengakses A1 dan A2. |
| **AC-07** | Kasir mengubah `branch_id`, `role`, atau `is_active` dirinya sendiri maupun rekan kerja | Ditolak oleh trigger keamanan profil; self-update kolom aman (nama tampilan) tetap berhasil. |
| **AC-08** | Admin biasa mencoba mengangkat akun menjadi `Owner` atau `Super Admin` | Ditolak keras dengan exception `FORBIDDEN_ROLE_ESCALATION`. |
| **AC-09** | Pengguna yang dinonaktifkan (`is_active = FALSE`) mencoba memanggil API/RPC dengan token lama | Seluruh operasi ditolak (`USER_INACTIVE` / session revoked), termasuk pada RPC `SECURITY DEFINER`. |
| **AC-10** | RPC `redeem_customer_reward` dipanggil saat program loyalitas tidak aktif atau target stamps = 0 | Ditolak dengan pesan error eksplisit `LOYALTY_PROGRAM_UNAVAILABLE`; nol baris log redemption tercatat. |
| **AC-11** | Pemanggil dari Tenant A memanggil `redeem_customer_reward` dengan parameter `p_tenant_id` Tenant D | Ditolak sebelum perhitungan atau penulisan mutasi; nol log reward terbentuk di Tenant D. |
| **AC-11b** | Pelanggan memiliki 5 kunjungan cuci berstatus `Pending` (belum lunas) | Reward ditolak; hanya kunjungan dengan transaksi lunas (`status_bayar = 'Selesai'`) yang diakui sebagai stamp sah. |
| **AC-12** | Dua permintaan paralel klaim reward dengan stamp yang sama atau replay permintaan | Maksimum tepat 1 penukaran berhasil; permintaan paralel kedua ditolak karena stamp sudah terpakai (Row Lock / Idempotency). |
| **AC-13** | Audit metadata grant database terhadap role `authenticated` | `has_table_privilege('authenticated', tbl, 'TRUNCATE')` bernilai `FALSE` pada seluruh tabel. Hak `REFERENCES`, `TRIGGER`, `MAINTAIN` dicabut dari browser. |
| **AC-14** | Audit 4 Views (`bahan_baku`, `transaksi`, `finance_summary`, `akun_keuangan`) | Seluruh view berstatus `security_invoker = true`; kasir tidak dapat membypass proteksi RLS tabel dasar melalui view. |
| **AC-15** | Pemanggilan tanpa konteks tenant atau trigger auto-populate | Fail-closed: Operasi gagal, data tidak dialihkan diam-diam ke tenant pertama (`DEFAULT_TENANT_ID`). |
| **AC-16** | Operasi bisnis yang sah (*Positive Flow*) | Alur checkout kasir, pelunasan tagihan tersimpan, pencatatan transaksi sah, laporan konsolidasi owner, dan mutasi sah tetap berjalan 100% lancar. |
| **AC-17** | Validasi integritas kode dan rilis | Seluruh test suite Vitest (395+ tests) lulus, SQL harness lulus, build produksi sukses tanpa error. |

---

## 5. Rencana Pelaksanaan Bertahap (PR-1 s.d. PR-6)

- **PR-1 (Tahap Saat Ini)**: Kontrak Akses Resmi, Fixture Dua Tenant Dua Cabang, dan Regression Test Harness.
- **PR-2**: Profile Lockdown (`fn_protect_profile_role_and_tenant`), Pencabutan Broad Grants (`TRUNCATE`), dan Penghapusan Tenant Fallback.
- **PR-3**: Penulisan Ulang RLS Granular (Drop `ALL` policy, implementasi `SELECT/INSERT/UPDATE/DELETE` per capability & branch).
- **PR-4**: Pengerasan RPC `redeem_customer_reward` (Caller authentication, active program gate, paid receipts only, row-lock & idempotency).
- **PR-5**: Sinkronisasi Frontend (Aksi row `Gudang.jsx`, `ROLE_PERMISSIONS` central resolver, landing page untuk role operasional).
- **PR-6**: Verifikasi Akhir & Validasi Release Gate (AC-01 s.d. AC-17).
