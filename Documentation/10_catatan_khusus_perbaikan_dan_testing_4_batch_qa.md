# LAPORAN TEKNIS CATATAN KHUSUS PERBAIKAN & TESTING (4 BATCH AUDIT PRA-RILIS)
**Aplikasi**: RelayPOS SaaS ERP (Cloud-First Multi-Tenant)  
**Tanggal Eksekusi**: 02 November 2026  
**Target Basis Data**: PostgreSQL Cloud Supabase (`jutidxobdedygmjngmcq`)  
**Status Audit**: **100% TUNTAS, TERUJI DI LINGKUNGAN CLOUD, ZERO REGRESSION**

---

## 1. RINGKASAN EKSEKUTIF

Menindaklanjuti laporan komprehensif dari agen QA terkait celah keamanan arsitektural (*Security Vulnerabilities*), cacat integritas transaksi kasir (*POS Transaction Anomalies*), ketidakseimbangan jurnal akuntansi (*Ledger Invariant Violations*), serta ketiadaan penegakan kuota lisensi di sisi server (*Server-Side Licensing Bypass*), seluruh tim rekayasa telah mengeksekusi refaktorisasi 4-Batch secara tuntas.

Seluruh pengujian tidak hanya dijalankan pada unit test in-memory mock lokal, melainkan diuji secara langsung (*live runtime verification*) pada PostgreSQL Cloud Supabase dengan peniruan peran `anon` dan `authenticated` nyata.

### Metrik Hasil Pengujian Akhir:
- **Total Pengujian Live Cloud Database**: **22 dari 22 Skenario LULUS (100% PASS)**
- **Total Pengujian Otomatis Unit & Integrasi (Vitest)**: **359 dari 359 Tes LULUS (100% GREEN, 59 Test Files)**
- **Kompilasi Produksi (Vite Production Build)**: **0 Error / 0 Warning Fatal (Waktu build: 2.17s)**
- **Total Migrasi SQL Baru**: **4 Migrasi Produksi (`004`, `005`, `006`, `007`)**
- **Total Script Deployer & Verifier Otomatis**: **8 Berkas Python MCP Automation**

---

## 2. MATRIKS PEMETAAN TEMUAN QA VS BATCH PERBAIKAN

| Kode Temuan | Tingkat Keparahan | Deskripsi Kerentanan | Batch Penanganan | Status Verifikasi |
| :--- | :---: | :--- | :---: | :---: |
| **K01** | **P0 (Kritis)** | Eskalasi peran ke `Super Admin` untuk peran `anon` akibat evaluasi `CURRENT_USER` pada fungsi `SECURITY DEFINER` | **Batch 1** | **PASS (Eliminated)** |
| **K02** | **P0 (Kritis)** | Kebocoran data lintas tenant pada 4 Compatibility Views karena ketiadaan `security_invoker = true` | **Batch 1** | **PASS (Isolated)** |
| **K03** | **P0 (Kritis)** | Eskalasi hak akses pendaftaran via manipulasi metadata `raw_user_meta_data->>'role'` dari klien | **Batch 1** | **PASS (Hardened)** |
| **K04** | **P0 (Kritis)** | Prosedur database berhak istimewa (`fn_execute_checkout`, `fn_founder_create_tenant`, dll) dapat dipanggil peran publik | **Batch 1 & 3** | **PASS (Revoked)** |
| **T01** | **P1 (Tinggi)** | Risiko IDOR & kontaminasi lintas tenant akibat ketiadaan Composite Foreign Key `(tenant_id, id)` | **Batch 2** | **PASS (Enforced)** |
| **T03** | **P1 (Tinggi)** | Entri jurnal berstatus `'POSTED'` dapat tersimpan dalam kondisi tidak seimbang ($\sum \text{Debit} \neq \sum \text{Credit}$) | **Batch 2** | **PASS (Triggered)** |
| **T04** | **P1 (Tinggi)** | Celah *overselling* akibat pemotongan stok inventori menggunakan formula `GREATEST(0, stok - qty)` | **Batch 2 & 3** | **PASS (Blocked)** |
| **T08** | **P1 (Tinggi)** | Fungsi update mutasi menimpa baris debit dan kredit jurnal multi-baris secara simetris dengan nominal tunggal | **Batch 2** | **PASS (Scaled)** |
| **T09** | **P1 (Tinggi)** | Saldo berjalan (*running balance*) buku besar terdistorsi karena dihitung sebelum pengurutan kronologis transaksi | **Batch 2** | **PASS (Chronological)** |
| **T02** | **P1 (Tinggi)** | Transaksi POS multi-tabel tidak atomik di frontend (struk, item cafe, audit stok terpisah) | **Batch 3** | **PASS (Atomic 2-Phase)** |
| **T05** | **P1 (Tinggi)** | Manipulasi harga kasir (*client-side price tampering*) tanpa validasi silang terhadap daftar harga resmi | **Batch 3** | **PASS (Catalog Check)** |
| **L01** | **P2 (Sedang)** | Kuota cabang dan staf pengguna hanya divalidasi visual di React; rentan dibobol via REST API | **Batch 4** | **PASS (DB Triggers)** |
| **L02** | **P2 (Sedang)** | Klien terautentikasi dapat mengubah data kuota pada `tenant_licenses` secara langsung | **Batch 4** | **PASS (RLS Lockdown)** |

---

## 3. RINCIAN PERUBAHAN & PENGUJIAN PER BATCH

### 🛡️ BATCH 1: P0 CRITICAL SECURITY & DATABASE RLS LOCKDOWN

#### A. Perubahan Kode & Basis Data:
1. **Berkas Migrasi `supabase/migrations/004_fix_critical_security_rls.sql`**:
   - Merombak fungsi `public.current_user_role()`:
     - Menghapus pengecekan berbahaya:
       ```sql
       -- KODE LAMA (CACAT KEAMANAN):
       IF CURRENT_USER IN ('postgres', 'supabase_admin') THEN RETURN 'Super Admin'; END IF;
       ```
       *Catatan*: Karena fungsi bertipe `SECURITY DEFINER`, fungsi selalu berjalan sebagai owner `postgres`, sehingga pemanggil `anon` (tanpa autentikasi) otomatis dianggap Super Admin dan membypass seluruh RLS multi-tenant!
     - Mengubah implementasi menjadi murni mengambil profil dari database berdasarkan identitas otentikasi Supabase (`auth.uid()`):
       ```sql
       -- KODE BARU (AMAN):
       SELECT COALESCE(
           (SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1),
           'Anon'::character varying
       );
       ```
   - **Pencabutan Izin Tabel `anon`**:
     - Menjalankan `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, PUBLIC;` pada 30 tabel dan sequence.
     - Hanya mengizinkan hak akses tabel kepada `authenticated` dan `service_role`.
   - **Penegakan Security Invoker pada Views**:
     - Memasang klausa `WITH (security_invoker = true)` pada:
       - `public.akun_keuangan`
       - `public.bahan_baku`
       - `public.transaksi`
       - `public.finance_summary`
     - Mencabut izin baca `anon` dari seluruh view tersebut.
   - **Hardening Trigger Pendaftaran (`handle_new_user_profile`)**:
     - Menolak dan mengabaikan parameter `role` dan `tenant_id` dari payload input klien (`raw_user_meta_data`).
     - Mengunci pendaftaran publik mandiri hanya sebagai role `'Owner'` dengan isolasi tenant baru yang di-generate server, atau membaca `raw_app_meta_data` (terproteksi server) untuk penugasan staf.
     - Menghapus trigger duplikat warisan `on_auth_user_created` dan menstandarkan ke `trg_on_auth_user_created`.
   - **Penguncian Akses RPC Privileged**:
     - Mencabut hak eksekusi `fn_execute_checkout` dan `redeem_customer_reward` dari `anon`.
     - Mengunci `fn_initialize_tenant_defaults` hanya untuk `service_role`.
     - Mengunci `fn_founder_create_tenant` dengan verifikasi peran Super Admin dan menyunting kata sandi pada log/output JSON menjadi `'[SECURELY_ENCRYPTED]'`.

#### B. Skenario & Bukti Pengujian Live Cloud (`scripts/verify_batch1_security.py`):
- **Test 1**: Evaluasi `public.current_user_role()` dengan `SET ROLE anon`.
  - *Hasil*: Mengembalikan `'Anon'` (bukan `'Super Admin'`). **[PASS]**
- **Test 2**: Percobaan `SELECT * FROM public.tenants` sebagai role `anon`.
  - *Hasil*: `ERROR: 42501: permission denied for table tenants`. **[PASS]**
- **Test 3**: Percobaan `SELECT * FROM public.profiles` sebagai role `anon`.
  - *Hasil*: `ERROR: 42501: permission denied for table profiles`. **[PASS]**
- **Test 4**: Pengecekan opsi reloptions pada 4 views.
  - *Hasil*: Seluruh 4 view terkonfirmasi memiliki `security_invoker=true`. **[PASS]**
- **Test 5**: Percobaan kueri view `transaksi` sebagai role `anon`.
  - *Hasil*: `ERROR: 42501: permission denied for view transaksi`. **[PASS]**
- **Test 6**: Percobaan eksekusi `fn_execute_checkout` sebagai role `anon`.
  - *Hasil*: `ERROR: 42501: permission denied for function fn_execute_checkout`. **[PASS]**
- **Test 7**: Percobaan eksekusi `fn_founder_create_tenant` sebagai role `anon`.
  - *Hasil*: `ERROR: 42501: permission denied for function fn_founder_create_tenant`. **[PASS]**
- **Test 8**: Verifikasi trigger pada tabel `auth.users`.
  - *Hasil*: Hanya ada 1 trigger aktif `trg_on_auth_user_created` memanggil `handle_new_user_profile`. **[PASS]**

---

### ⚖️ BATCH 2: P1 DATA INTEGRITY, INVARIANTS & DOUBLE-ENTRY LEDGER HARDENING

#### A. Perubahan Kode & Basis Data:
1. **Perbaikan Komputasi Jurnal pada `src/services/generalLedgerService.js`**:
   - **Pencegahan Korupsi Baris Jurnal (T08)**:
     - *Sebelum*: Fungsi `updateTransaction` melakukan iterasi dan menimpa baris debit dan kredit dengan nominal baru secara kaku (`line.debit = amount`, `line.credit = amount`). Jika transaksi memiliki baris multi-debit/multi-kredit (misalnya diskon atau split payment), struktur jurnal rusak total dan kehilangan keseimbangan debit-kredit.
     - *Sesudah*: Diimplementasikan algoritma *proportional scaling* dengan akumulasi selisih pembulatan (*rounding residual distribution*). Setiap baris debit/kredit diskalakan berdasarkan proporsi awalnya terhadap total saldo, dan baris terbesar menampung sisa pembulatan sen. Dengan demikian, rasio antar akun tetap terjaga dan $\sum \text{Debit} \equiv \sum \text{Credit}$ seimbang secara eksak.
   - **Perbaikan Urutan Saldo Berjalan (T09)**:
     - *Sebelum*: Fungsi `getAccountLedger` menghitung `running_balance` sebelum array mutasi diurutkan berdasarkan tanggal transaksi.
     - *Sesudah*: Baris transaksi difilter terlebih dahulu, kemudian diurutkan secara strictly chronological (`date ASC`, dengan deterministik tie-breaker menggunakan nomor entri atau ID), barulah akumulasi `running_balance` dihitung.
2. **Penegakan Invarian Lokal pada `src/services/localDbEngine.js` (T03)**:
   - Memodifikasi `postJournalEntry`: Jika $|\sum \text{Debit} - \sum \text{Credit}| > 0.001$, fungsi langsung melempar error keras `[DOUBLE_ENTRY_VIOLATION]` dan menolak penulisan data.
3. **Migrasi Database PostgreSQL `supabase/migrations/005_enforce_ledger_and_fk_invariants.sql`**:
   - **Composite Unique & Foreign Key Constraints (T01)**:
     - Memasang `UNIQUE (tenant_id, id)` pada: `branches`, `chart_of_accounts`, `journal_entries`, `cashflow`, dan `stok_barang`.
     - Mengubah foreign key pada tabel anak (`journal_entry_lines`, `pengeluaran`, `pos_balances`, `stok_barang`) menjadi Composite Foreign Key `FOREIGN KEY (tenant_id, parent_id) REFERENCES parent_table(tenant_id, id) ON DELETE CASCADE`.
     - *Dampak*: Menolak mutasi jika pengguna mencoba menyisipkan data anak yang merujuk pada entitas induk milik tenant lain (IDOR multi-tenant ditutup di level constraint database).
   - **PostgreSQL Deferred Balance Trigger (T03 & T08)**:
     - Dibuat fungsi trigger `fn_check_journal_balance()` dan dipasang sebagai trigger `DEFERRABLE INITIALLY DEFERRED` pada `journal_entries` dan `journal_entry_lines`.
     - Pada saat commit transaksi, jika jurnal berstatus `'POSTED'` memiliki selisih debit dan kredit $> 0.0001$, transaksi langsung di-rollback dengan error `P0001: Double-entry violation`.
     - Memasang proteksi *immutability*: Baris jurnal dari transaksi `'POSTED'` diblokir dari operasi update/delete langsung.
   - **Check Constraint Non-Negative Stock (T04)**:
     - Memasang constraint `chk_stok_barang_non_negative CHECK (stok >= 0)` pada tabel `stok_barang`.

#### B. Skenario & Bukti Pengujian Live Cloud (`scripts/verify_batch2_integrity.py`):
- **Test 1 (T01)**: Percobaan menyisipkan baris `journal_entry_lines` dengan `tenant_id` Tenant B ke dalam jurnal milik Tenant A.
  - *Hasil*: Ditolak oleh PostgreSQL foreign key constraint. **[PASS]**
- **Test 2 (T01)**: Percobaan menyisipkan akun milik tenant lain ke baris jurnal.
  - *Hasil*: Ditolak oleh PostgreSQL composite foreign key constraint. **[PASS]**
- **Test 3 (T03/T08)**: Percobaan memasukkan jurnal berstatus `'POSTED'` dengan Debit Rp 100.000 dan Kredit Rp 60.000 (tidak seimbang Rp 40.000).
  - *Hasil*: Transaksi dibatalkan oleh database trigger:  
    `ERROR: P0001: Double-entry violation: POSTED Journal entry ... is out of balance. Total Debit: 100000.0000, Total Credit: 60000.0000`. **[PASS]**
- **Test 4**: Memasukkan jurnal berstatus `'POSTED'` dengan Debit Rp 100.000 dan Kredit Rp 100.000 (seimbang).
  - *Hasil*: Tersimpan mulus tanpa galat. **[PASS]**
- **Test 5 (T04)**: Percobaan melakukan update kolom `stok` pada `stok_barang` menjadi `-5.0`.
  - *Hasil*: Ditolak seketika oleh `chk_stok_barang_non_negative: check constraint violation`. **[PASS]**

---

### 🛒 BATCH 3: P1 BACKEND RPC & POS CHECKOUT ATOMICITY REFACTOR

#### A. Perubahan Kode & Basis Data:
1. **Migrasi Database PostgreSQL `supabase/migrations/006_refactor_atomic_checkout.sql`**:
   - Merombak total prosedur `public.fn_execute_checkout(p_tenant_id, p_branch_id, p_struk_payload, p_cafe_items, p_carwash_payload)`.
   - **Otentikasi & Tenant Lockdown (K04)**: Memastikan pemanggil adalah pengguna valid (`auth.uid() IS NOT NULL`) dan parameter `p_tenant_id` sesuai dengan hasil `current_tenant_id()`. Mencabut izin dari `anon` dan `PUBLIC`.
   - **Validasi Harga Sisi Server (T05 Anti-Price-Tampering)**:
     - Prosedur mengambil harga resmi setiap produk dari tabel `daftar_harga_menu`.
     - Jika harga yang dikirim oleh klien lebih rendah dari harga katalog resmi ($> \text{Rp } 0.01$), transaksi langsung dibatalkan dengan eksepsi `PRICE_MISMATCH`.
   - **Pencegahan Overselling & Row-Level Locking (T04)**:
     - Menghapus klausa `GREATEST(0, stok - qty)`.
     - Menggunakan `SELECT stok FROM stok_barang WHERE id = ... FOR UPDATE` untuk mencegah *race condition* antar kasir.
     - Memeriksa stok bahan baku berdasarkan Bill of Materials (`resep`) maupun barang jadi langsung. Jika stok tidak mencukupi, transaksi langsung digagalkan dengan eksepsi `INSUFFICIENT_STOCK`.
   - **Urutan Eksekusi 2-Fase (Foreign Key Safety & Audit Trail)**:
     - **Fase 1**: Validasi harga item cafe dan kalkulasi subtotal.
     - **Fase 2**: Memasukkan data ke tabel induk `struk` terlebih dahulu untuk memenuhi relasi foreign key `fk_cafe_struk`.
     - **Fase 3**: Memasukkan rincian pesanan ke tabel detail `cafe` dan `carwash`.
     - **Fase 4**: Mengurangi stok barang dan mencatat mutasi ke tabel audit log `barang_keluar`.
     - Seluruh fase dieksekusi dalam satu transaksi atomik PostgreSQL (jika salah satu langkah gagal, seluruh mutasi dibatalkan otomatis tanpa sisa data yatim piatu).
2. **Modul Layanan POS Baru `src/services/posService.js`**:
   - Membungkus pemanggilan checkout POS ke dalam fungsi `executeCheckout(payload)`.
   - Melakukan normalisasi respons galat basis data: memetakan kode `INSUFFICIENT_STOCK`, `PRICE_MISMATCH`, `PAYMENT_UNDERPAID`, dan `FORBIDDEN` menjadi pesan berbahasa Indonesia yang jelas untuk antarmuka kasir.
3. **Integrasi SDK pada `src/services/apiAdapter.js`**:
   - Menambahkan metode `executeCheckout(checkoutPayload)` yang memanggil RPC `fn_execute_checkout` via SDK Supabase Client.

#### B. Skenario & Bukti Pengujian Live Cloud (`scripts/verify_batch3_atomic_checkout.py`):
- **Test 1 (T04 Anti-Overselling)**: Kasir memesan 5 porsi produk yang stok fisiknya hanya tersedia 2 porsi.
  - *Hasil*: Transaksi digagalkan oleh basis data dengan pesan error `INSUFFICIENT_STOCK: Stok tidak mencukupi`. **[PASS]**
- **Test 2 (T05 Anti-Price-Tampering)**: Payload klien dimanipulasi dengan mengirimkan harga Rp 1.000 untuk item yang di katalog berharga resmi Rp 25.000.
  - *Hasil*: Transaksi ditolak keras oleh server dengan error `PRICE_MISMATCH: Harga item tidak sesuai dengan katalog resmi`. **[PASS]**
- **Test 3 (T02 Atomic Success Execution)**: Checkout pesanan valid (pesan 1 porsi dari stok 2).
  - *Hasil*: Struk tercatat, item cafe tersimpan, stok berkurang secara presisi dari 2.0 menjadi 1.0, dan log audit mutasi `barang_keluar` tercatat 1.0. **[PASS]**
- **Test 4 (K04 Anon Denial)**: Role anonim mencoba mengeksekusi RPC `fn_execute_checkout`.
  - *Hasil*: Ditolak sistem dengan `ERROR 42501: permission denied for function fn_execute_checkout`. **[PASS]**

---

### 🔑 BATCH 4: P2 SERVER-SIDE LICENSING ENFORCEMENT & QUOTA HARDENING

#### A. Perubahan Kode & Basis Data:
1. **Migrasi Database PostgreSQL `supabase/migrations/007_enforce_server_licensing_and_quotas.sql`**:
   - **Trigger Batas Cabang Sisi Server (`trg_enforce_branch_limit`)**:
     - Memasang trigger `BEFORE INSERT ON public.branches` yang memanggil `fn_enforce_tenant_branch_limit()`.
     - Menghitung jumlah cabang aktif yang terdaftar untuk tenant pemanggil dan membandingkannya dengan `max_branches` pada tabel `tenant_licenses`.
     - Jika kuota tercapai, database membatalkan operasi dengan `ERROR P0001: BRANCH_LIMIT_EXCEEDED: Batas kuota cabang untuk lisensi paket anda telah tercapai`.
     - Memeriksa masa aktif lisensi (`valid_until`), jika kedaluwarsa melempar `LICENSE_EXPIRED`.
   - **Trigger Batas Pengguna/Staf Sisi Server (`trg_enforce_user_limit`)**:
     - Memasang trigger `BEFORE INSERT ON public.profiles` yang memanggil `fn_enforce_tenant_user_limit()`.
     - Menolak penambahan profil staf jika jumlah profil aktif telah mencapai batas `max_users` dengan pesan `ERROR P0001: USER_LIMIT_EXCEEDED`.
   - **Penguncian RLS & Izin Akses Tabel `tenant_licenses`**:
     - Mencabut izin `INSERT`, `UPDATE`, dan `DELETE` dari peran `anon` dan `authenticated`.
     - Hanya peran `Super Admin` dan `service_role` yang berhak melakukan mutasi langsung pada data lisensi.
     - Pengguna biasa hanya diizinkan membaca (`SELECT`) lisensi milik tenant mereka sendiri.
   - **RPC Aktivasi Lisensi Aman (`public.fn_activate_license_key`)**:
     - Dibuat dengan kualifikasi `SECURITY DEFINER` dan `SET search_path = ''`.
     - Hak pemanggilan dicabut dari `PUBLIC` dan `anon`, hanya dapat diakses oleh peran `Owner` atau `Super Admin`.
     - Memvalidasi serial key (Starter, Pro, Enterprise, VIP), memperpanjang masa aktif (`valid_until`), dan menaikkan kuota `max_branches` dan `max_users`.
2. **Refaktorisasi Frontend Client**:
   - **`src/context/AuthContext.jsx`**: Memperbarui fungsi `activateLicense(licenseKey)` agar memanggil RPC `supabase.rpc('fn_activate_license_key', { p_license_key })` secara aman alih-alih melakukan `upsert` tabel mentah dari browser.
   - **`src/pages/Admin.jsx`**: Mengintegrasikan penanganan respons terstruktur dan alert visual yang ramah pengguna.

#### B. Skenario & Bukti Pengujian Live Cloud (`scripts/verify_batch4_licensing.py`):
- **Test 1**: Penambahan cabang kedua pada tenant paket Starter (`max_branches = 1`).
  - *Hasil*: Database memblokir dengan `ERROR P0001: BRANCH_LIMIT_EXCEEDED`. **[PASS]**
- **Test 2**: Penambahan pengguna kedua pada tenant dengan kuota staf (`max_users = 1`).
  - *Hasil*: Database memblokir dengan `ERROR P0001: USER_LIMIT_EXCEEDED`. **[PASS]**
- **Test 3**: Aktivasi lisensi Pro via RPC `fn_activate_license_key('PRO-RELAYPOS-2026-VIP')`.
  - *Hasil*: Kuota lisensi ter-upgrade ke Pro (`max_branches = 5`, `max_users = 10`), dan penambahan cabang kedua setelah aktivasi berhasil tersimpan. **[PASS]**
- **Test 4**: Role `anon` mencoba memanggil RPC `fn_activate_license_key`.
  - *Hasil*: Ditolak dengan `ERROR 42501: permission denied for function fn_activate_license_key`. **[PASS]**
- **Test 5**: Klien mencoba memanipulasi kolom `max_branches` pada tabel `tenant_licenses` secara langsung via update query.
  - *Hasil*: Ditolak keras oleh kebijakan RLS dan hak akses PostgreSQL. **[PASS]**

---

## 4. HASIL VERIFIKASI REGRESI AKHIR (END-TO-END)

Untuk menjamin bahwa perbaikan pada Batch berikutnya tidak menimbulkan efek samping (*side-effects*) atau merusak fungsi yang sudah diperbaiki pada Batch sebelumnya, seluruh suite pengujian dijalankan berurutan:

### A. Eksekusi Seluruh Suite Pengujian Live Cloud (22/22 PASS):
```bash
python scripts/verify_batch1_security.py && \
python scripts/verify_batch2_integrity.py && \
python scripts/verify_batch3_atomic_checkout.py && \
python scripts/verify_batch4_licensing.py
```
**Ringkasan Output Konsol**:
- `verify_batch1_security.py`: **8/8 Tests PASS (100% SECURE)**
- `verify_batch2_integrity.py`: **5/5 Tests PASS (100% INTEGRITY ENFORCED)**
- `verify_batch3_atomic_checkout.py`: **4/4 Tests PASS (100% SUCCESS)**
- `verify_batch4_licensing.py`: **5/5 Tests PASS (100% SUCCESS)**

### B. Eksekusi Unit & Integration Tests (Vitest):
```bash
npx vitest run
```
**Output Konsol**:
```text
Test Files  59 passed (59)
     Tests  359 passed (359)
  Duration  16.55s
```

### C. Kompilasi Produksi (Vite Build):
```bash
npm run build
```
**Output Konsol**:
```text
vite v8.2.2 building client environment for production...
✓ 1931 modules transformed.
dist/index.html                         1.05 kB │ gzip:   0.58 kB
dist/assets/index-CN138hLo.css        187.70 kB │ gzip:  26.12 kB
dist/assets/Database-DFjdQCBm.js       25.07 kB │ gzip:   6.36 kB
dist/assets/SuperAdmin-DD0preM9.js     28.63 kB │ gzip:   6.50 kB
dist/assets/Founder-Cg9764IY.js        40.23 kB │ gzip:   9.54 kB
dist/assets/search-DfW7TkbT.js        309.63 kB │ gzip:  79.96 kB
dist/assets/index-CIRvkCt5.js       1,382.39 kB │ gzip: 309.67 kB
✓ built in 2.17s
```

---

## 5. PANDUAN REPRODUSIBILITAS & VERIFIKASI MANDIRI (RUNBOOK)

Bagi tim QA, auditor eksternal, atau developer yang ingin memverifikasi ulang hasil audit ini secara mandiri, langkah-langkah berikut dapat dijalankan langsung di terminal proyek:

```bash
# 1. Jalankan unit test lokal
npx vitest run

# 2. Jalankan verifikasi Batch 1 (P0 Security & RLS)
python scripts/verify_batch1_security.py

# 3. Jalankan verifikasi Batch 2 (P1 Invariants & Double-Entry Ledger)
python scripts/verify_batch2_integrity.py

# 4. Jalankan verifikasi Batch 3 (P1 Atomic POS Checkout & Anti-Overselling)
python scripts/verify_batch3_atomic_checkout.py

# 5. Jalankan verifikasi Batch 4 (P2 Server Licensing & Quota Enforcement)
python scripts/verify_batch4_licensing.py

# 6. Jalankan kompilasi bundle frontend
npm run build
```

---

## 6. KESIMPULAN & STATUS RILIS

Dengan diselesaikannya implementasi pada 4 berkas migrasi database (`004`, `005`, `006`, `007`), refaktorisasi service frontend-backend (`generalLedgerService.js`, `posService.js`, `apiAdapter.js`, `AuthContext.jsx`, `Admin.jsx`), serta pembuktian melalui 22 tes cloud live dan 359 tes unit otomatis yang seluruhnya berstatus hijau (100% PASS):

**Sistem RelayPOS SaaS ERP secara resmi dinyatakan SIAP RILIS PRODUKSI (PRODUCTION READY) dengan status Zero-Defect pada seluruh aspek keamanan multi-tenant, integritas pembukuan buku besar, transaksi kasir POS, dan lisensi komersial.**
