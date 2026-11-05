# Rekonsiliasi Baseline dan Aturan Akuntansi Pembayaran (Tahap 0 - Revisi Komprehensif)

Dokumen ini merekonsiliasi kondisi aktual sistem pembayaran, eksekusi checkout, tagihan tertunda (pending bills), mutasi persediaan, dan pencatatan akuntansi pada RelayPOS (`Nazrin-Alfan/ERPPoss`) per 4 November 2026.

---

## 1. Status Baseline Lingkungan, Git, dan Perbedaan Versi Migrasi

### A. Repositori & Git
- **Repository**: `Nazrin-Alfan/ERPPoss`
- **Active Working Branch**: `fix/pending-settlement-atomicity` (dibuat dari `main`)
- **Base Commit**: `cb00973` (*docs: document merge verification for fix/checkout-tenant-isolation (commit 3cc1845)*)
- **Deployment Terakhir**: Commit `3cc1845` (PR #1: isolasi tenant checkout dan persistensi `uang_diterima`)
- **Status Test Suite**: **62 test files, 369 passed** (100% kelulusan baseline terjaga).

### B. Dokumentasi Perbedaan Versi Migrasi Cloud vs Repositori Lokal
Terdapat perbedaan penomoran riwayat migrasi antara repositori lokal dan tabel internal Supabase:
1. **Di Repositori Lokal (`supabase/migrations/`)**:
   - Migrasi historis diberi nama serial: `001_initial_relaypos_cloud_schema.sql` s/d `012_reconcile_registration_and_checkout_pipeline.sql`.
   - Migrasi terakhir PR #1 dinamai: `20261103003944_checkout_tenant_authorization_and_cash_tender.sql`.
2. **Di Cloud Supabase (`jutidxobdedygmjngmcq`)**:
   - Migrasi 001 s/d 012 diterapkan langsung melalui automasi skrip / MCP SQL runner.
   - Tabel `supabase_migrations.schema_migrations` pada instance cloud merekam versi CLI resmi:
     `version = '20261103023738'`, `name = 'checkout_tenant_authorization_and_cash_tender'`.
3. **Keputusan Standarisasi Migrasi Maju**:
   - Migrasi baru Tahap 1 menggunakan format penamaan timestamp standar Supabase:
     `supabase/migrations/20261104000001_atomic_pending_bill_settlement.sql`.
   - Hal ini memastikan kompatibilitas penuh baik dengan Supabase CLI lokal maupun pelacakan versi cloud.

---

## 2. Bukti Reproduksi Cacat & Temuan Kritis (Evidence of Findings)

Pemeriksaan statis dan runtime terhadap codebase dan database membuktikan 4 cacat utama pada alur transaksi tertunda:

### Bukti 1: Pelunasan Tagihan Menghilangkan Cashflow & Jurnal Akuntansi
- **Lokasi Kode**: `src/pages/pos/HybridPOSPage.jsx`, baris 1384–1426 (`handleSettleBill`).
- **Bukti Mekanisme**:
  ```javascript
  // 1. Simpan item biaya inap / cas tambahan jika ada
  if (surchargeAmount > 0) {
    await supabase.from('cafe').insert({ ... nama_menu: surchargeDescription ... })
  }
  // 2. Update status struk menjadi lunas
  const { error: strukErr } = await supabase.from('struk').update({
    status_bayar: 'Selesai',
    metode_bayar: settlePaymentMethod,
    total_tagihan: finalTotal,
    ...
  }).eq('id_struk', settlingBill.id)
  // 3. Update status carwash & cafe
  await supabase.from('carwash').update({ status: 'Selesai' }).eq('id_struk', settlingBill.id)
  await supabase.from('cafe').update({ status: 'Selesai' }).eq('id_struk', settlingBill.id)
  ```
- **Dampak Nyata**: Tidak ada baris yang disisipkan ke `public.cashflow` dan tidak ada jurnal yang dibuat ke `public.journal_entries` / `public.journal_entry_lines`. Semua uang yang diterima kasir pada pelunasan tertunda **hilang dari buku kas dan laporan laba rugi**.
- **Kerentanan Non-Atomik**: Jika jaringan putus setelah langkah 1, biaya inap tersimpan tapi status struk tetap pending. Tanpa `FOR UPDATE` atau advisory lock, klik ganda atau akses paralel kasir lain dapat memicu inkonsistensi data.

### Bukti 2: Pemotongan Stok Persediaan Berulang (Double Stock Deduction)
- **Lokasi Kode**: `src/pages/pos/CafePOSPage.jsx`, baris 316–363 (`handleCheckout` saat `settlingBill` ada).
- **Bukti Mekanisme**:
  `CafePOSPage` menyelesaikan tagihan meja yang pending dengan memanggil ulang:
  ```javascript
  await posService.executeCheckout({
    tenantId: effectiveTenantId,
    strukPayload,
    cafeItems: itemsPayload,
    carwashPayload: null
  })
  ```
  Pada server PostgreSQL (`fn_execute_checkout`):
  Langkah 12 mengeksekusi pemotongan bahan baku BOM:
  ```sql
  UPDATE public.stok_barang SET stok = stok - v_needed ...;
  INSERT INTO public.barang_keluar (...) VALUES (...);
  ```
  Pemotongan ini tidak dibatasi oleh kondisi status bayar. Akibatnya, saat pesanan meja dibuat pertama kali, stok sudah dipotong; saat diselesaikan via `handleCheckout`, **stok gudang dipotong untuk kedua kalinya** dan rincian item di `public.cafe` terduplikasi.

### Bukti 3: Pembatalan Tagihan Tertunda Tanpa Pemulihan Persediaan (Inventory Loss)
- **Lokasi Kode**: `src/pages/pos/HybridPOSPage.jsx`, baris 1491–1524 (`handleCancelBill`).
- **Bukti Mekanisme**:
  `handleCancelBill` hanya memperbarui kolom status:
  `struk.update({ status_bayar: 'Batal' })`, `carwash.update({ status: 'Batal' })`, dan `cafe.update({ status: 'Batal' })`.
- **Dampak Nyata**: Bahan baku fisik yang telah terpotong di `stok_barang` dan `barang_keluar` saat draft pesanan disimpan **tidak dikembalikan**. Ini menciptakan kebocoran persediaan dan selisih opname fisik tanpa jejak koreksi.

### Bukti 4: Misklasifikasi Biaya Inap Kendaraan sebagai Menu Cafe
- **Lokasi Kode**: `src/pages/pos/HybridPOSPage.jsx`, baris 1385–1397.
- **Bukti Mekanisme**:
  Biaya penitipan kendaraan (biaya inap Rp50.000) disisipkan ke tabel `public.cafe`:
  `nama_menu: surchargeDescription || 'Biaya Inap Kendaraan'`
- **Dampak Nyata**: Biaya penitipan kendaraan tercatat sebagai penjualan produk makanan/minuman dapur cafe. Data analitik cafe terdistorsi, dan jika diposting ke jurnal akuntansi secara membabi-buta, omzet cafe menggelembung sedangkan pendapatan jasa kendaraan tidak tercatat.

---

## 3. Inventarisasi Trigger Database Terkait

Berdasarkan audit langsung pada skema PostgreSQL Supabase:

| Tabel | Nama Trigger | Timing & Event | Fungsi Eksekusi | Analisis Dampak |
|---|---|---|---|---|
| `struk` | `trg_auto_tenant_and_branch` | BEFORE INSERT | `fn_auto_set_tenant_and_branch()` | Memastikan tenant/branch terisi dari sesi |
| `struk` | `trg_struk_sync` | BEFORE INSERT/UPDATE | `fn_sync_struk()` | Normalisasi kolom camelCase (`platNomor` <-> `plat_nomor`) |
| `struk` | `trg_sync_struk` | BEFORE INSERT/UPDATE | `fn_sync_struk_columns()` | Normalisasi field `id_struk`, `total_tagihan`, `status_bayar`, dll. |
| `stok_barang` | `trg_auto_tenant_and_branch` | BEFORE INSERT | `fn_auto_set_tenant_and_branch()` | Isolasi tenant pada mutasi stok |
| `stok_barang` | `trg_stok_barang_sync` | BEFORE INSERT/UPDATE | `fn_sync_stok_barang_advanced()` | Sinkronisasi field kompatibilitas stok |
| `barang_keluar` | `trg_auto_tenant_and_branch` | BEFORE INSERT | `fn_auto_set_tenant_and_branch()` | Isolasi tenant |
| `barang_keluar` | `trg_sync_barang_keluar` | BEFORE INSERT/UPDATE | `fn_sync_barang_keluar_columns()` | Normalisasi nomor `id_keluar` |
| `cashflow` | `trg_auto_tenant_and_branch` | BEFORE INSERT | `fn_auto_set_tenant_and_branch()` | Isolasi tenant |
| `journal_entries` | `trg_defer_check_journal_balance` | AFTER INSERT/UPDATE | `fn_check_journal_balance()` | **ACID Ledger Invariant**: Menolak status `POSTED` jika debit != credit atau < 2 baris |
| `journal_entries` | `trg_enforce_journal_immutability` | BEFORE UPDATE/DELETE | `fn_enforce_journal_immutability()` | **Strict Ledger Immutability**: Jurnal `POSTED` haram diubah atau dihapus |
| `journal_entry_lines` | `trg_defer_check_lines_balance` | AFTER INSERT/UPDATE/DELETE | `fn_check_journal_lines_balance()` | Memastikan keseimbangan debit/kredit per journal entry |
| `journal_entry_lines` | `trg_enforce_lines_immutability` | BEFORE INSERT/UPDATE/DELETE | `fn_enforce_journal_immutability()` | Baris jurnal `POSTED` tidak boleh ditambah, diubah, atau dihapus |

*Catatan Kritis:* Pengurangan `stok_barang` pada saat checkout dilakukan via perintah SQL langsung di dalam `fn_execute_checkout`, bukan via trigger `barang_keluar`.

---

## 4. Keputusan Akuntansi Sistemik & Rekonsiliasi Persediaan

Berikut adalah 6 keputusan akuntansi sistemik yang ditetapkan berdasarkan perilaku riil aplikasi dan standar akuntansi double-entry ERP:

### 1. Metode Penilaian Persediaan yang Sebenarnya
- **Metode**: **Perpetual Standard Costing (Biaya Standar Perpetual)**.
- **Bukti Database**:
  - Master `public.stok_barang` menyimpan `harga_beli` (unit cost standar).
  - Trigger pembelian `trg_apply_barang_masuk_to_stock` (`fn_apply_barang_masuk_to_stock`) **hanya menambah kuantitas stok** (`stok` dan `stok_akhir`), tanpa menghitung ulang harga rata-rata tertimbang (Moving Weighted Average) dan tanpa membuat lot/layer FIFO terpisah.
  - Setiap porsi resep bahan baku dikalikan dengan `unit_cost` standar yang aktif pada saat mutasi terjadi.

### 2. Simpan dan Gunakan Biaya Pengeluaran Asal untuk HPP
- **Masalah Lama**:
  Saat checkout pending dijalankan, `fn_execute_checkout` menghitung `v_total_cogs` di memori, tetapi nilainya tidak disimpan ke tabel manapun karena struk pending tidak menerbitkan jurnal saat itu. Saat tagihan dilunasi belakangan, nilai HPP asal tersebut telah hilang.
- **Solusi Arsitektur**:
  1. Tambahkan kolom ke tabel `public.struk`:
     `total_cogs NUMERIC(15, 2) NOT NULL DEFAULT 0.00;`
  2. Saat `fn_execute_checkout` pertama kali memotong stok untuk transaksi pending, simpan nilai `v_total_cogs` yang dihitung secara persis ke kolom `struk.total_cogs`.
  3. Saat `fn_settle_pending_bill` melunasi tagihan, RPC membaca nilai asal dari `struk.total_cogs`. Nilai inilah yang digunakan untuk memposting jurnal:
     - **Debit**: `5101` Beban Pokok Pendapatan (HPP) sebesar `total_cogs`.
     - **Kredit**: `1103` Persediaan Bahan Baku & Barang Dagang sebesar `total_cogs`.
  4. Keuntungan: HPP transaksi tidak akan berubah meskipun harga beli master barang diubah oleh pemilik usaha di kemudian hari.

### 3. Rekonsiliasi Persediaan Selama Status Transaksi Pending
- **Status Fisik & Stok**:
  - Begitu pesanan dicatat (`fn_execute_checkout` dengan status `Pending`), bahan baku langsung dikeluarkan untuk peracikan (stok fisik berkurang).
  - `stok_barang.stok` langsung dipotong dan mutasi dicatat pada `barang_keluar` dengan keterangan `'BOM Pemakaian POS Struk: ' || id_struk`.
- **Status Keuangan**:
  - Beban HPP dan pendapatan kas/bank belum diakui di General Ledger karena transaksi belum diselesaikan pembayarannya.
  - Persediaan fisik riil tetap sinkron dengan angka sistem (`stok_barang.stok`).
- **Saat Pelunasan (`fn_settle_pending_bill`)**:
  - Stok **TIDAK DIKURANGI KEMBALI** (mencegah pengurangan ganda).
  - HPP asal yang tersimpan di `struk.total_cogs` dibukukan ke General Ledger bersamaan dengan pengakuan pendapatan dan kas masuk.

### 4. Definisi Idempotency Key dan Fingerprint Payload Pelunasan
Untuk mencegah klik ganda dan inkonsistensi jaringan, pelunasan menerapkan protokol idempotensi berbasis kunci dan fingerprint:
- **`p_idempotency_key`**: Nilai unik string (UUID atau token klien) yang dikirim oleh antarmuka kasir. Jika tidak dikirim oleh pemanggil legacy, default ke `v_id_struk || ':settle'`.
- **`settle_fingerprint` (Fingerprint Hash)**:
  Nilai MD5 kanonikal yang dihitung di server:
  ```sql
  v_settle_fingerprint := md5(
      p_tenant_id::text || '|' ||
      v_id_struk || '|' ||
      UPPER(TRIM(v_metode_bayar)) || '|' ||
      v_uang_diterima::text || '|' ||
      v_nominal_bayar::text || '|' ||
      v_nominal_cash::text || '|' ||
      v_nominal_qris::text || '|' ||
      v_surcharge_amount::text
  );
  ```
- **Aturan Evaluasi**:
  1. `pg_advisory_xact_lock(tenant_id:id_struk)` dikunci sebelum pembacaan baris.
  2. Kunci baris header: `SELECT ... FROM public.struk ... FOR UPDATE`.
  3. Jika `struk.status_bayar IN ('Selesai', 'Paid', 'Lunas')`:
     - Jika `struk.settle_hash` identik dengan `v_settle_fingerprint`: Kembalikan hasil pelunasan sebelumnya dengan `'was_replayed': TRUE` tanpa menyentuh buku kas maupun jurnal.
     - Jika `struk.settle_hash` berbeda atau pelunasan baru mencoba mengubah transaksi yang sudah lunas: Tolak dengan pengecualian `IDEMPOTENCY_CONFLICT` (kode `40900`).
  4. Jika `struk.status_bayar = 'Batal'`: Tolak dengan `BILL_CANCELLED`.

### 5. Klasifikasi Akuntansi Biaya Inap Kendaraan (Surcharge)
- **Pemisahan Kategori**: Biaya inap kendaraan adalah pendapatan jasa parkir/fasilitas kendaraan, **bukan penjualan makanan/minuman cafe**.
- **Pencatatan Database**:
  - Disimpan pada kolom tersendiri di header `struk`:
    - `biaya_inap NUMERIC(15, 2) NOT NULL DEFAULT 0.00;`
    - `catatan_inap TEXT;`
  - **Dilarang keras menyisipkan baris fiktif ke tabel `public.cafe`**.
- **Alokasi Bagan Akun (COA)**:
  - Cari akun COA `4103` (*Pendapatan Jasa & Penitipan Kendaraan* / *Pendapatan Lain-lain*).
  - Jika `4103` belum tersedia pada tenant, alokasikan ke COA `4101` (*Pendapatan Layanan Carwash*), **bukan ke 4102 Pendapatan Cafe**.
  - Total jurnal seimbang:
    - **Debit**: Kas (1101) / Bank (1102) = Total Tagihan (Termasuk Biaya Inap).
    - **Kredit**: Pendapatan Carwash (4101) = Subtotal Carwash (+ Biaya Inap jika COA 4103 nihil).
    - **Kredit**: Pendapatan Jasa Inap (4103) = Biaya Inap (jika COA 4103 tersedia).
    - **Kredit**: Pendapatan Cafe (4102) = Subtotal Murni Cafe.
    - Total Debit == Total Kredit (100% Berimbang).

### 6. Dukungan Pembayaran Sebagian & Piutang Usaha
- **Piutang Usaha**: Tidak diakui untuk transaksi kasir walk-in (tidak ada COA piutang walk-in).
- **Pembayaran Sebagian**: Tidak didukung. Pelunasan adalah pelunasan penuh. Jika tender pembayaran kurang dari total tagihan terutang, server menolak dengan `PAYMENT_UNDERPAID`.

---

## 5. Penanganan Data Historis & Pembedaan Biaya (NULL vs 0.00)

1. **Skema Migrasi Aman**:
   - Kolom pendukung ditambahkan dengan klausa `ADD COLUMN IF NOT EXISTS`:
     ```sql
     ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS total_cogs NUMERIC(15, 2) DEFAULT NULL;
     ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS biaya_inap NUMERIC(15, 2) NOT NULL DEFAULT 0.00;
     ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS catatan_inap TEXT;
     ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
     ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS settle_hash TEXT;

     ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS id_struk VARCHAR(100);
     ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS biaya_satuan NUMERIC(15, 4);
     ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS total_biaya NUMERIC(15, 2);
     ```

2. **Pembedaan Tegas Biaya Historis Tidak Diketahui (`NULL`) vs Biaya Nol (`0.00`)**:
   - **`total_cogs IS NULL` (Biaya Historis Tidak Diketahui / Untracked Legacy)**:
     - Terjadi pada transaksi pending lama yang dibuat sebelum migrasi ini atau tanpa modul persediaan.
     - Penanganan di `fn_settle_pending_bill`: Sistem memeriksa tabel `barang_keluar` untuk mutasi yang berelasi (`id_struk = v_id_struk` atau regex token boundary `(^|[^a-zA-Z0-9_-])Struk:\s*<id_struk>($|[^a-zA-Z0-9_-])`) yang terisolasi ketat pada `tenant_id = p_tenant_id`.
       - HANYA menggunakan snapshot biaya asal (`COALESCE(total_biaya, jumlah_keluar * biaya_satuan)`).
       - Jika catatan biaya asal tidak lengkap atau salah satu mutasi tidak memiliki snapshot biaya: `cogs_status = 'HISTORICAL_UNKNOWN'`. Sistem **DILARANG fallback ke harga master terbaru** agar tidak mendistorsi pembukuan historis. Baris jurnal HPP/Persediaan ditiadakan, dan memo jurnal ditandai `(HPP historis tidak diketahui)`.
       - Jika snapshot biaya asal lengkap: `cogs_status = 'HISTORICAL_RESOLVED'`, nilai HPP diposting presisi ke GL.
   - **`total_cogs = 0.00` (Biaya Nol Terverifikasi / Legitimate Zero-Cost)**:
     - Terjadi pada transaksi murni layanan jasa carwash, penyerahan barang promo gratis, atau item tanpa pemakaian bahan baku BOM.
     - Penanganan di `fn_settle_pending_bill`: `cogs_status = 'ZERO_COST'`. Baris jurnal HPP (5101) dan Persediaan (1103) **secara sengaja tidak diterbitkan** karena biaya riil adalah Rp 0,00 dan trigger kekekalan jurnal `fn_check_journal_balance` menolak debit/kredit <= 0.
   - **`total_cogs > 0.00` (Snapshot Biaya Asal Terkunci / Snapshot Recorded)**:
     - Snapshot biaya satuan saat barang keluar dikunci di `struk.total_cogs` dan `barang_keluar.total_biaya`. HPP dibukukan secara presisi ke GL. Perubahan harga pada master barang di kemudian hari **100% diabaikan**.

---

## 6. Hubungan Mutasi Pengeluaran ke Struk & Snapshot Biaya Asal

1. **Relasi Mekanikal `barang_keluar` &rarr; `struk`**:
   - Kolom `barang_keluar.id_struk` menampung nomor struk secara eksplisit.
   - Kolom `barang_keluar.biaya_satuan` mencatat harga perolehan bahan baku per unit saat pesanan dibuat (`v_stock_record.unit_cost`).
   - Kolom `barang_keluar.total_biaya` mencatat perkalian kuantitas keluar dengan biaya satuan asal (`v_needed * v_stock_record.unit_cost`).
2. **Kekebalan Integritas Terhadap Perubahan Master (`Master Price Tampering Immunity`)**:
   - Terbukti melalui pengujian database nyata: Ketika master `stok_barang.harga_beli` dinaikkan dari Rp 100.000 menjadi Rp 500.000 setelah pesanan pending dibuat, eksekusi pelunasan `fn_settle_pending_bill` tetap membukukan HPP sebesar snapshot biaya asal (Rp 4.000), bukan harga baru (Rp 20.000).

---

## 7. Penyimpanan Idempotency Key & Fingerprint Kanonikal

1. **Persistensi Data**:
   - `struk.idempotency_key`: Menyimpan UUID atau token idempotensi yang dikirim klien (fallback: `id_struk || ':settle'`).
   - `struk.settle_hash`: Menyimpan hash kanonikal seluruh parameter transaksi.
2. **Kanonikal Fingerprint Formula (Representasi Terstruktur Canonical JSONB)**:
   ```sql
   v_canonical_settle_payload := jsonb_build_object(
       'tenant_id', p_tenant_id,
       'id_struk', v_id_struk,
       'branch_id', v_effective_branch_id,
       'metode_bayar', v_metode_bayar,
       'final_total', ROUND(v_final_total, 2),
       'uang_diterima', ROUND(v_uang_diterima, 2),
       'nominal_cash', ROUND(v_nominal_cash, 2),
       'nominal_qris', ROUND(v_nominal_qris, 2),
       'nominal_transfer', ROUND(v_nominal_transfer, 2),
       'surcharge_nominal', ROUND(v_surcharge_nominal, 2),
       'surcharge_keterangan', COALESCE(v_surcharge_keterangan, ''),
       'idempotency_key', v_idempotency_key
   );
   v_current_settle_fingerprint := md5(v_canonical_settle_payload::text);
   ```
3. **Penegakan Aturan Idempotensi**:
   - Jika struk telah berstatus `Selesai`:
     - Payload hash cocok &rarr; kembalikan status `ALREADY_COMPLETED`, `was_replayed: true` (tanpa membuat duplikasi cashflow/jurnal).
     - Payload hash berbeda &rarr; tolak dengan error `IDEMPOTENCY_CONFLICT` (kode `40900`).

---

## 8. Validasi & Pengamanan Biaya Inap (Overnight Surcharge)

1. **Validasi Server-Side**:
   - Nominal biaya inap tidak boleh negatif (`INVALID_SURCHARGE`).
   - Jika nominal > 0, keterangan wajib diisi (`INVALID_SURCHARGE: Keterangan biaya inap wajib disertakan`).
   - Batas wajar operasional: Maksimum Rp 5.000.000 (`INVALID_SURCHARGE`).
   - Batas otorisasi peran: Kasir hanya dapat menetapkan hingga Rp 500.000. Nominal di atas Rp 500.000 memerlukan otorisasi Owner atau Admin (`SURCHARGE_UNAUTHORIZED`).
2. **Isolasi Database & Akuntansi**:
   - Biaya inap disimpan di header `struk.biaya_inap` dan `struk.catatan_inap`.
   - **TIDAK disisipkan ke tabel `cafe`** (terverifikasi 0 baris tambahan di tabel cafe).
   - Di General Ledger: Dikreditkan ke akun `4103` (*Pendapatan Jasa Inap Kendaraan*) atau `4101` (*Pendapatan Layanan Kendaraan*). **DILARANG MASUK ke akun 4102 Cafe**.

---

## 9. Hasil Pengujian Database Nyata & Regresi

1. **Pengujian Database Langsung (`scripts/test_real_db_pending_settlement.py`)**:
   - Test 1A (Unauthorized Anonymous): `[PASS]` Ditolak dengan `UNAUTHORIZED`.
   - Test 1B (Inactive User): `[PASS]` Ditolak dengan `USER_INACTIVE`.
   - Test 1C (Cross-Tenant): `[PASS]` Ditolak dengan `TENANT_FORBIDDEN`.
   - Test 2 (Origin Cost Tracking): `[PASS]` Terbukti relasi `barang_keluar.id_struk` dan snapshot biaya asal tercatat presisi.
   - Test 3A (Kasir > 500k Surcharge): `[PASS]` Ditolak dengan `SURCHARGE_UNAUTHORIZED`.
   - Test 3B (Surcharge Tanpa Keterangan): `[PASS]` Ditolak dengan `INVALID_SURCHARGE`.
   - Test 4A (Zero Double Stock Deduction): `[PASS]` Terbukti stok tetap 9.960 kg sebelum dan sesudah pelunasan.
   - Test 4B (Surcharge Isolation): `[PASS]` Terbukti 0 baris fiktif disisipkan ke tabel `cafe`.
   - Test 4C (Master Price Change Immunity): `[PASS]` HPP diposting tetap Rp 4.000 meskipun harga master naik 5x lipat. Surcharge dikreditkan ke 4103.
   - Test 5A (Idempotent Replay): `[PASS]` Replay identik menghasilkan `was_replayed: true` tanpa duplikasi cashflow (tepat 1 baris).
   - Test 5B (Idempotency Conflict): `[PASS]` Perubahan tender uang_diterima ditolak dengan `IDEMPOTENCY_CONFLICT`.
   - Test 6A (Data Historis NULL COGS): `[PASS]` Berhasil diselesaikan dengan status `HISTORICAL_UNKNOWN` tanpa ketidakseimbangan jurnal.
   - Test 6B (Data Biaya Nol 0.00 COGS): `[PASS]` Berhasil diselesaikan dengan status `ZERO_COST` tanpa baris HPP nol.
   - Test 7 (Rollback Atomicity): `[PASS]` Kegagalan tender kurang membatalkan seluruh mutasi dan membiarkan status tetap Pending.
   - Status Rollback Akhir: Seluruh data uji di-rollback secara transaksional bersih (`TEST_ALL_PASSED_TRANSACTION_ROLLED_BACK`).

2. **Pengujian Konkurensi 2 Koneksi Tumpang Tindih (`scripts/test_real_db_concurrency_overlap.py`)**:
   - **Test 2A (Payload Sama)**: `[PASS]` Koneksi 1 sukses melunasi bill (`COMPLETED`), Koneksi 2 mendeteksi selesai dan mengembalikan `was_replayed=true`. Database mencatat tepat 1 baris cashflow dan 1 journal entry (0 duplikasi).
   - **Test 2B (Payload Berbeda)**: `[PASS]` Koneksi 1 sukses melunasi tunai, Koneksi 2 (tender berbeda) secara tegas ditolak dengan `IDEMPOTENCY_CONFLICT` (kode `40900`). Database mencatat tepat 1 transaksi tanpa korupsi data.

3. **Pengujian Pembayaran SPLIT & Kegagalan Jurnal (`scripts/test_real_db_forced_failure_and_split.py`)**:
   - **Alokasi SPLIT**: `[PASS]` Terbukti matematis dan akuntansi:
     - Cashflow: 1 entri Rp 20.000 ke `SALDO CASH`, 1 entri Rp 30.000 ke `SALDO REKENING (N)`.
     - GL: Debit 1101 (Kas) Rp 20.000, Debit 1102 (Bank) Rp 30.000, Kredit 4101 (Carwash) Rp 30.000, Kredit 4102 (Cafe) Rp 20.000. Total Debit = Total Kredit = Rp 50.000 (100% Berimbang).
   - **Forced Failure Rollback**: `[PASS]` Snapshot tabel `struk`, `cashflow`, `journal_entries`, `carwash`, `cafe` sebelum dan sesudah kegagalan pelunasan 100% identik (Zero Partial State).

4. **Pengujian Regresi Checkout Database (`scripts/test_real_db_checkout_regression.py`)**:
   - `[PASS]` Test 1 (Missing Auth): `UNAUTHORIZED`.
   - `[PASS]` Test 2 (Cross-Tenant): `TENANT_FORBIDDEN`.
   - `[PASS]` Test 3 (Cash Underpaid): `PAYMENT_UNDERPAID`.
   - `[PASS]` Test 4 (Insufficient Stock): Gagal dan me-rollback tanpa menyimpan struk.
   - `[PASS]` Test 5 (Valid Checkout): Tender Rp 50k, Tagihan Rp 36k, Kembalian Rp 14k, Stok terpotong 0.040 kg, `barang_keluar` dan `struk.total_cogs` mencatat snapshot Rp 2.000, Cashflow mencatat penjualan bersih Rp 36k, Jurnal berimbang Debit=Kredit=Rp 38k.
   - `[PASS]` Test 6 (Idempotent Replay): Mengembalikan `ALREADY_COMPLETED` dengan data kembalian/tender utuh, 0 duplikasi cashflow/stok.
   - Rollback transaksional: `REGRESSION_ALL_PASSED_TRANSACTION_ROLLED_BACK`.

5. **Pengujian Regresi Unit & E2E**:
   - `src/services/__tests__/checkoutPaymentRegression.test.js`: `4 passed` (100%).
   - `src/services/__tests__/pendingSettlement.test.js`: `19 passed` (100% Green, termasuk uji stabilitas idempotency key retry, validasi COA pra-mutasi, dan SPLIT overpayment).
   - Seluruh test suite lokal: `63 test files passed, 388 passed` (100% Green).
   - Linter (`oxlint`) & Vite Build: Sukses tanpa error.

---

## 10. Penyelesaian Komprehensif Temuan Peninjauan Independen (Review Commit 6305974)

1. **Jurnal Tagihan Berdiskon (Debit == Kredit)**:
   - Menghitung diskon riil dari selisih `(total_carwash + total_cafe) - base_total`.
   - Jika bagan akun menyediakan akun potongan penjualan (`4104` / `4201`), debit dicatat ke akun potongan penjualan.
   - Jika tidak ada akun potongan, diskon dialokasikan langsung memotong kredit pendapatan Carwash dan Cafe (Metode Net Revenue). Baris penyeimbang arbitrer dihapus total.
2. **Validasi Bagan Akun (COA) Pra-Mutasi**:
   - Seluruh akun kas (1101), bank (1102), pendapatan carwash (4101), pendapatan cafe (4102), biaya inap (4103), serta HPP/Persediaan (5101/1103) divalidasi keberadaannya sebelum mutasi apa pun dieksekusi.
   - Ketidaklengkapan akun memicu `ACCOUNT_MAPPING_MISSING` dan membatalkan transaksi seketika tanpa meninggalkan perubahan parsial.
3. **Idempotency Key Stabil Lintas Percobaan Retry**:
   - Menghapus pembuatan key dinamis berbasis timestamp `Date.now()`.
   - Menggunakan token percobaan stabil yang dipertahankan dalam state UI dan cache sesi `posService` selama upaya pelunasan tagihan yang sama.
   - Menjamin pengulangan klik atau retry pasca respons terputus tidak menimbulkan `IDEMPOTENCY_CONFLICT`.
4. **Konsistensi Keranjang Cafe & Struk dari Transaksi Tersimpan**:
   - Mengunci keranjang `CafePOSPage` saat mode pelunasan aktif (mencegah penambahan/pengurangan item lokal yang tidak tercatat di DB).
   - Sumber cetak struk kasir dialihkan menggunakan data transaksi tersimpan dari respons RPC (`settleRes.data`) dan rincian item database (`settlingBill.savedItems`).
5. **Penyelarasan Fixture SQL & Pemanggilan RPC Riil**:
   - Menambahkan kolom `total_biaya`, `total_cogs`, dan `cogs_status` pada `checkout_fixture.sql`.
   - Memperbarui `supabase/tests/pending_settlement_isolation.sql` untuk memanggil RPC riil `fn_settle_pending_bill`, menguji error spesifik `ACCOUNT_MAPPING_MISSING`, serta memverifikasi alokasi SPLIT tunai berlebih dan jurnal diskon berimbang.
6. **Retensi Nilai NULL & Kolom Status Biaya Historis**:
   - Menambahkan kolom eksplisit `cogs_status VARCHAR(30)` pada tabel `struk`.
   - Data historis yang belum diketahui biayanya mempertahankan `total_cogs = NULL` (tidak ditimpa `0.00`) dengan status `HISTORICAL_UNKNOWN`.

---

## 11. Penyelesaian Tuntas 5 Penghambat P1 & Harness SQL PostgreSQL

1. **Pencegahan Pemotongan Stok Ganda ("Simpan Meja")**:
   - `handleSaveBill` di `CafePOSPage.jsx` diblokir ketika `settlingBill` aktif.
   - Tombol UI "Simpan Meja" dinonaktifkan (`disabled={loading || !!settlingBill}`) saat tagihan pending dibuka.
2. **Standardisasi Kontrak Field Struk Kasir**:
   - `CafePOSPage.jsx` mengirim payload kanonikal (`id_struk`, `cafe`, `total_tagihan`, `metode_bayar`, `uang_diterima`, `kembalian`).
   - `src/utils/receiptHelpers.js` mendukung alias fallback dan diuji via unit test otomatis.
3. **Sinkronisasi Total Layar Tagihan Berdiskon**:
   - `effectiveSubtotal`, `effectiveDiskon`, dan `effectiveGrandTotal` digunakan di seluruh tampilan layar, validasi pembayaran, dan perhitungan kembalian saat pelunasan aktif.
4. **Penegakan Akun Bank (1102) Tanpa Fallback Kas**:
   - Fallback `COALESCE(v_coa_bank, v_coa_kas)` dihapus. Pembayaran digital (QRIS/Transfer) wajib memiliki akun bank 1102 di COA; jika tidak ada, transaksi langsung gagal dengan `ACCOUNT_MAPPING_MISSING`.
5. **Penjurnalan Komponen Tambahan / Pajak (Kewajiban 2102/2101)**:
   - Selisih positif tagihan di atas subtotal item dikreditkan secara eksplisit ke akun kewajiban/utang pajak `v_coa_tax` (2102/2101). Jurnal terbukti seimbang (Debit == Kredit).
6. **Eksekusi Harness PostgreSQL**:
   - `scripts/test_pending_settlement_isolation.sh` dieksekusi pada kontainer PostgreSQL `erpposs-checkout-qa` lokal. Seluruh 9 skenario pengujian lulus dengan exit code 0.
