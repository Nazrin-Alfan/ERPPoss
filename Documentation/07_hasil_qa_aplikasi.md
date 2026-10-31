# Hasil kampanye QA RelayPOS — 31 Oktober 2026

Commit dasar: `18ce5b5` pada branch `fix/cloud-auth-qa`. Kode aplikasi dan mock tidak diubah oleh kampanye ini. Seluruh mutasi dilakukan pada browser context/database lokal terisolasi dengan data sintetis. Tidak ada push, deployment, atau perubahan Supabase produksi.

## Kesimpulan

Baseline otomatis lulus, tetapi pengujian negatif menemukan empat cacat. Aplikasi belum dinyatakan lolos seluruh katalog atau siap rilis. Setiap use case induk menggabungkan beberapa variasi; PARTIAL berarti hanya sebagian variasi punya bukti, bukan seluruh use case lulus.

Cakupan 98 use case: 4 FAIL, 80 PARTIAL, 14 NOT RUN. Tidak ada label lulus menyeluruh untuk use case gabungan yang variasinya belum diuji lengkap.

## Hasil eksekusi

- Vitest: 52 berkas, 310 tes lulus; 0 gagal dan 0 pending.
- Build berhasil; peringatan ukuran chunk tetap ada. Lint exit 0: 419 warning, 0 error.
- Browser akses: 80 assertion lulus, 1 KNOWN_MOCK, tanpa kegagalan produk terkonfirmasi pada subset akses/Founder. Termasuk 48 kombinasi empat role × 12 route, onboarding tiga tipe usaha, arsip/pemulihan, impersonasi, tenant Kasir, dan viewport 390/768/1440.
- PostgreSQL 16: harness menerapkan migrasi 001 dan 003 (003 dua kali), menguji provisioning, rollback awal/akhir, metadata palsu, undangan staf dan RLS lintas tenant; seluruh assertion lulus. Auth HTTP Supabase tetap tidak diuji.
- Simulasi 13 prosedur lulus. Stress 10.000 transaksi/20.000 baris jurnal menghasilkan neraca seimbang; ini tidak membuktikan mutasi konkuren atau target latency produksi.
- Bukti operasional browser ada pada `ops-results.json`; hanya variasi yang tertulis dalam assertion yang dianggap diperiksa. Tidak menganggap checkout struk sebagai bukti pengurangan stok, anti-double-submit, atau rekonsiliasi keuangan lengkap.

## Temuan terkonfirmasi

| ID | Prioritas | Temuan dan reproduksi | Batas bukti |
|---|---|---|---|
| QA-PAY-01 / HR-03 | P1 | Pada 31 Oktober 2026 halaman Karyawan menampilkan periode 16 Oktober–15 Desember; seharusnya 16 Oktober–15 November. `Karyawan.jsx:93` memanggil setMonth sebelum menormalkan tanggal sehingga bulan dengan 30 hari overflow. | Browser dan perhitungan tanggal; belum mengeksekusi pembayaran gaji. |
| QA-REWARD-01 / CRM-04 | P1 | Dua pemanggilan redeemCustomerReward untuk plat baru dengan nol kunjungan sama-sama berhasil dan menyimpan dua klaim. `crmService.js:510` tidak memeriksa kelayakan/idempotensi pada batas mutasi. | Layanan lokal langsung; tidak mengklaim exploit browser atau cloud. |
| QA-CSV-01 / RES-04 | P2 | generateCSVString mempertahankan input =1+1 sebagai sel formula. CSV quoting belum menetralkan formula spreadsheet. `financeHelpers.js:296`. | Isi file diuji; spreadsheet/payload eksternal tidak dieksekusi. |
| QA-UX-01 / UX-02 | P2 | Dialog Ganti Kata Sandi tidak memindahkan fokus ke dalam dialog dan tidak menutup dengan Escape. Role dialog dan aria-modal tersedia, tetapi perilaku keyboard belum sesuai. Sumber ChangePasswordModal.jsx:85. | Browser; bukan audit aksesibilitas lengkap. |

## Batasan mock dan koreksi harness

- AUTH-03: browser lokal baru dapat otomatis memakai sesi Owner demo dari loadAuth. Ini KNOWN_MOCK yang sengaja dipertahankan, bukan bukti akses anonim pada cloud.
- Assertion awal Founder arsip/restore dijalankan sebelum debounce penyimpanan selesai. Setelah menunggu penyimpanan, enam assertion Founder lulus; timeout awal tidak dianggap bug produk.
- Runner simulasi asli menangkap error tanpa menjamin exit status gagal. Kampanye memakai wrapper dengan assertion hasil; label PASS bawaan saja tidak dipakai sebagai jaminan.
- Operasi yang disebut concurrent checkout pada stress runner hanya membaca data, sehingga RES-02 belum dibuktikan penuh.

## Skenario terblokir dan belum lengkap

Tidak ditemukan konfigurasi VITE_SUPABASE_URL/ANON_KEY, WACRM, atau berkas env lokal. Email/OAuth, sesi cloud, callback, dan undangan staf HTTP membutuhkan Supabase staging yang dikonfigurasi. Printer Bluetooth membutuhkan perangkat testing. Tidak dilakukan pengiriman WhatsApp/email nyata. Jangan memasukkan secret ke chat.

Skenario lokal yang belum lengkap tetap ditandai NOT RUN/PARTIAL pada matriks: variasi pembayaran/discount, semua refund dan stok/reversal, mutasi simultan, laporan lintas periode, gaji berbayar, validasi form menyeluruh, audit keyboard/screen reader, dan pengukuran performa browser. Ditemukannya cacat di alur kritis berarti kampanye ini belum merupakan sign-off rilis.

## Matriks seluruh use case

| ID | Prioritas | Status | Bukti dan batas cakupan |
|---|---|---|---|
| AUTH-01 | P0 | PARTIAL | signInWithPassword checks role Owner/Admin/Kasir; founderLoginAuth covers founder Sumber: src/services/__tests__/rbacRoles.test.js:30 Browser: Login owner: PASS; Login admin: PASS; Login kasir: PASS; Login superadmin: PASS |
| AUTH-02 | P0 | PARTIAL | invalid password and unknown account rejected; empty UI form not proven Sumber: src/services/__tests__/rbacRoles.test.js:126 Browser: Wrong password rejected with accessible error: PASS; Unknown account rejected: PASS |
| AUTH-03 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Anonymous protected route redirects: KNOWN_MOCK; Logout control clears session and blocks route until refresh: PASS; Refresh after logout local mock behavior: KNOWN_MOCK |
| AUTH-04 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: owner session survives reload: PASS; admin session survives reload: PASS; kasir session survives reload: PASS; superadmin session survives reload: PASS |
| AUTH-05 | P0 | PARTIAL | reauth before update, wrong password, missing/different user, short/empty fields and errors Sumber: src/services/__tests__/cloudPasswordChange.test.js:22 |
| AUTH-06 | P1 | PARTIAL | new password succeeds and old password fails after local change Sumber: src/services/__tests__/changePasswordAndUxPolish.test.js:16 |
| AUTH-07 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Google local mock creates simulated owner workspace: PASS |
| ONB-01 | P0 | PARTIAL | new owner isolated workspace; tenantBusinessProfiles checks CAFE no carwash packages Sumber: src/services/__tests__/rbacRoles.test.js:146 Browser: Local owner registration CAFE: PASS; Local owner registration CARWASH: PASS; Local owner registration HYBRID: PASS SQL: postgres.log (Auth stub, bukan Supabase HTTP). |
| ONB-02 | P0 | PARTIAL | no session skips profile read; session requires tenant/branch/Owner Sumber: src/services/__tests__/cloudOwnerRegistration.test.js:17 |
| ONB-03 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Empty registration is rejected by form validity: PASS; Malformed email rejected by browser validity: PASS; Short password is rejected visibly: PASS; Duplicate Owner email rejected without creating tenant: PASS |
| ONB-04 | P0 | PARTIAL | server error propagates; SQL rollback separately tested by parent Sumber: src/services/__tests__/cloudOwnerRegistration.test.js:43 SQL: postgres.log (Auth stub, bukan Supabase HTTP). |
| ONB-05 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. SQL: postgres.log (Auth stub, bukan Supabase HTTP). |
| ONB-06 | P1 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| ONB-07 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. SQL: postgres.log (Auth stub, bukan Supabase HTTP). |
| ACL-01 | P0 | PARTIAL | helper route-role matrix only, browser/real backend requires separate proof Sumber: src/services/__tests__/rbacRoles.test.js:78 Browser: owner direct route /dashboard: PASS; owner direct route /konsolidasi: PASS; owner direct route /pos: PASS; owner direct route /queue: PASS; owner direct route /finance: PASS; owner direct route /reports: PASS; owner direct route /crm: PASS; owner direct route /karyawan: PASS; owner direct route /admin: PASS; owner direct route /founder: PASS; owner direct route /gudang: PASS; owner direct route /database: PASS; admin direct route /dashboard: PASS; admin direct route /konsolidasi: PASS; admin direct route /pos: PASS; admin direct route /queue: PASS; admin direct route /finance: PASS; admin direct route /reports: PASS; admin direct route /crm: PASS; admin direct route /karyawan: PASS; admin direct route /admin: PASS; admin direct route /founder: PASS; admin direct route /gudang: PASS; admin direct route /database: PASS; kasir direct route /dashboard: PASS; kasir direct route /konsolidasi: PASS; kasir direct route /pos: PASS; kasir direct route /queue: PASS; kasir direct route /finance: PASS; kasir direct route /reports: PASS; kasir direct route /crm: PASS; kasir direct route /karyawan: PASS; kasir direct route /admin: PASS; kasir direct route /founder: PASS; kasir direct route /gudang: PASS; kasir direct route /database: PASS; superadmin direct route /dashboard: PASS; superadmin direct route /konsolidasi: PASS; superadmin direct route /pos: PASS; superadmin direct route /queue: PASS; superadmin direct route /finance: PASS; superadmin direct route /reports: PASS; superadmin direct route /crm: PASS; superadmin direct route /karyawan: PASS; superadmin direct route /admin: PASS; superadmin direct route /founder: PASS; superadmin direct route /gudang: PASS; superadmin direct route /database: PASS |
| ACL-02 | P0 | PARTIAL | cross-tenant transaction reads and mutations isolated local engine Sumber: src/services/__tests__/multiTenantIsolation.test.js:25 SQL: postgres.log (Auth stub, bukan Supabase HTTP). |
| ACL-03 | P0 | PARTIAL | cashier tenant Alpha/Beta resolution and transaction tenant binding Sumber: src/services/__tests__/cashierMultiTenantRouting.test.js:61 Browser: Cashier persisted tenant spoof resets to own tenant after reload: PASS |
| ACL-04 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Owner switches own outlets across two tabs: PASS |
| ACL-05 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. SQL: postgres.log (Auth stub, bukan Supabase HTTP). |
| ACL-06 | P1 | PARTIAL | business capabilities differ by CAFE/CARWASH/HYBRID; CAFE carwash insert denied Sumber: src/services/__tests__/tenantBusinessProfiles.test.js:12 Browser: CAFE feature gate /queue: PASS; CAFE feature gate /crm: PASS; CARWASH feature gate /queue: PASS; CARWASH feature gate /crm: PASS; HYBRID feature gate /queue: PASS; HYBRID feature gate /crm: PASS |
| ACL-07 | P1 | PARTIAL | grace/expired status calculation only; blocked account routes not proven Sumber: src/utils/__tests__/licenseHelpers.test.js:24 |
| POS-01 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Opening shift creates one starting-capital record: PASS |
| POS-02 | P1 | PARTIAL | add/increment/decrement/remove and item notes Sumber: src/utils/__tests__/cartHelpers.test.js:16 |
| POS-03 | P0 | PARTIAL | cash/QRIS/split allocation; paid-short UI and change calculation not all proven Sumber: src/utils/__tests__/helpers.test.js:116 Browser: Cafe checkout creates receipt once with correct line and total: PASS |
| POS-04 | P0 | PARTIAL | hybrid receipt splits revenue into cafe and carwash Sumber: src/services/__tests__/businessModelEodRecap.test.js:263 |
| POS-05 | P0 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| POS-06 | P0 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| POS-07 | P0 | PARTIAL | void restores cafe and merchandise stock; edit/reversal browser paths separate Sumber: src/services/__tests__/sprint1Features.test.js:62 Browser: Void and reactivate newly paid receipt through history: PASS |
| POS-08 | P1 | PARTIAL | order/payment receipt fields and ESC/POS byte buffer unit tests; physical printer not covered Sumber: src/utils/__tests__/receiptHelpers.test.js:49 |
| BILL-01 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Create pending cafe bill, reload then cancel with matching item status: PASS |
| BILL-02 | P0 | PARTIAL | yesterday bill settled today belongs to today cash totals; UI settlement not proven Sumber: src/utils/__tests__/cashierDrawer.test.js:57 |
| BILL-03 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Create pending cafe bill, reload then cancel with matching item status: PASS |
| BILL-04 | P0 | PARTIAL | cash expense deducted from drawer; finance expense payload validates fields Sumber: src/utils/__tests__/cashierDrawer.test.js:136 |
| BILL-05 | P0 | PARTIAL | cash exchange creates transfer-classified cashflow, not ordinary income/expense Sumber: src/services/__tests__/tukarUangCash.test.js:34 |
| BILL-06 | P0 | PARTIAL | void excluded from closing recap; helpers cash/split/expense totals Sumber: src/services/__tests__/businessModelEodRecap.test.js:387 |
| BILL-07 | P1 | PARTIAL | shift name/time mapping; midnight concurrent shift lifecycle not proven Sumber: src/utils/__tests__/helpers.test.js:55 |
| CW-01 | P1 | PARTIAL | plate lookup accepts plat_nomor from POS Sumber: src/services/__tests__/crmService.test.js:410 |
| CW-02 | P0 | PARTIAL | multi-item POS connects receipt/cafe/carwash relational tables Sumber: src/services/__tests__/e2eIntegration.test.js:78 |
| CW-03 | P0 | PARTIAL | queue waiting/washing/finishing/completed lifecycle local engine Sumber: src/services/__tests__/fullFeaturesSimulation.test.js:136 |
| CW-04 | P0 | PARTIAL | solo/duet commission and cash advance; package FLAT/PERCENT in carwashHelpers tests Sumber: src/services/__tests__/fullFeaturesSimulation.test.js:204 |
| CW-05 | P1 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| CW-06 | P1 | PARTIAL | static filtering logic only, parallel operator updates not proven Sumber: src/pages/__tests__/CarwashQueueKanban.test.jsx:225 |
| CW-07 | P1 | PARTIAL | WhatsApp text composition only, no live send Sumber: src/pages/__tests__/CarwashQueueKanban.test.jsx:204 |
| FIN-01 | P0 | PARTIAL | positive amount/required fields and payload validation; local DB journal auto-posting Sumber: src/utils/__tests__/financeHelpers.test.js:19 Browser: Manual cash income persists once with positive amount: PASS; Manual cash expense persists with correct amount: PASS |
| FIN-02 | P0 | PARTIAL | manual transaction create/update/delete two-way GL sync Sumber: src/services/__tests__/generalLedger.test.js:308 |
| FIN-03 | P0 | PARTIAL | same account/insufficient funds rejected at validator; actual atomic transfer not proven Sumber: src/pages/__tests__/FinanceModals.test.jsx:130 |
| FIN-04 | P0 | PARTIAL | prive modal guidance/render only; payment mutation not proven Sumber: src/pages/__tests__/FinanceModals.test.jsx:72 |
| FIN-05 | P0 | PARTIAL | financial metrics exclude void/non-OPEX; finance vs non-sales separation in integration Sumber: src/services/__tests__/intelligenceEngine.test.js:147 |
| FIN-06 | P0 | PARTIAL | trial balance and balance sheet equality, MAC precision and journal backfill Sumber: src/services/__tests__/generalLedger.test.js:140 |
| FIN-07 | P1 | PARTIAL | CSV quotes/BOM; existing static Finance render has filters but full filter export flow untested Sumber: src/utils/__tests__/financeHelpers.test.js:265 |
| FIN-08 | P1 | PARTIAL | date normalization basic cases; month-end/retroactive full accounting not proven Sumber: src/utils/__tests__/cashierDrawer.test.js:6 |
| INV-01 | P1 | PARTIAL | inventory CRUD local query builder; reference-delete safety not proven Sumber: src/services/__tests__/localDbEngine.test.js:46 Browser: Add inventory item through UI and retain after refresh: PASS |
| INV-02 | P0 | PARTIAL | goods receipt cash/credit inventory and journal; sprint1 expense-restock linkage Sumber: src/services/__tests__/generalLedger.test.js:60 Browser: Restock new item adds exact stock quantity: PASS |
| INV-03 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Stock opname sets exact physical inventory quantity: PASS |
| INV-04 | P0 | PARTIAL | 2 Americano deduct exactly36g and log goods-out36g Sumber: src/services/__tests__/localDbEngine.test.js:79 |
| INV-05 | P0 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| INV-06 | P0 | PARTIAL | cafe void restore; merchandise checkout/void restore Sumber: src/services/__tests__/sprint1Features.test.js:62 |
| INV-07 | P1 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| HR-01 | P1 | PARTIAL | profile to employee sync/dedup only; full employee UI CRUD not covered Sumber: src/utils/__tests__/staffHelpers.test.js:5 |
| HR-02 | P0 | PARTIAL | tiered, FLAT, PERCENT and custom commission amounts Sumber: src/utils/__tests__/carwashHelpers.test.js:9 |
| HR-03 | P0 | FAIL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Payroll displayed period spans 16th to next 15th only: FAIL |
| HR-04 | P0 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| HR-05 | P0 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| HR-06 | P1 | PARTIAL | profiles populate employee list; trusted cloud invite separately requires DB/Auth Sumber: src/services/__tests__/rbacRoles.test.js:67 |
| CRM-01 | P1 | PARTIAL | customer aggregation, tenant isolation, plate lookup Sumber: src/services/__tests__/crmService.test.js:264 Browser: Customer plate search narrows visible rows: PASS |
| CRM-02 | P1 | PARTIAL | save/update special preference note Sumber: src/services/__tests__/crmService.test.js:328 |
| CRM-03 | P0 | PARTIAL | loyalty stamp cycle math only; void/reversal behavior not fully covered Sumber: src/services/__tests__/crmService.test.js:162 |
| CRM-04 | P0 | FAIL | FAIL: two reward redemptions for new plate without any qualifying visit both accepted Sumber: negative-probes.mjs |
| CRM-05 | P1 | PARTIAL | tenant settings save/retrieve and custom VIP thresholds; reset/historical policy not proven Sumber: src/services/__tests__/crmService.test.js:193 |
| CRM-06 | P1 | PARTIAL | template variables/spintax and WhatsApp number normalization; live send/export not proven Sumber: src/services/__tests__/crmService.test.js:237 |
| RPT-01 | P0 | PARTIAL | division revenue/expense recap; ExpenseDetailModal renders safely Sumber: src/services/__tests__/businessModelEodRecap.test.js:19 Browser: CAFE dashboard renders without uncaught errors: PASS; CARWASH dashboard renders without uncaught errors: PASS; HYBRID dashboard renders without uncaught errors: PASS |
| RPT-02 | P0 | PARTIAL | consolidation filters userTenants; combined metrics simulation has known inputs Sumber: src/services/__tests__/tenantOnboardingAndIsolation.test.js:62 |
| RPT-03 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Holding outlet card opens correct workspace: PASS |
| RPT-04 | P0 | PARTIAL | income statement/balance sheet and manual two-way journal sync Sumber: src/services/__tests__/generalLedger.test.js:171 |
| RPT-05 | P1 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| RPT-06 | P1 | PARTIAL | prompt no PII, JSON output, sector-context specialization Sumber: src/services/__tests__/intelligenceEngine.test.js:289 |
| ADM-01 | P1 | PARTIAL | custom FLAT/PERCENT packages created and isolated; full menu CRUD broader Sumber: src/services/__tests__/carwashMasterIntegration.test.js:32 |
| ADM-02 | P1 | PARTIAL | custom liquidity account CRUD and query only; related referential safety not proven Sumber: src/services/__tests__/localDbEngine.test.js:141 |
| ADM-03 | P0 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| ADM-04 | P0 | PARTIAL | license read/update/isolation and active/grace/expired helper outcomes Sumber: src/services/__tests__/licenseIntegration.test.js:13 |
| ADM-05 | P0 | PARTIAL | clean tenant payload with credentials/license zero transactions; local owner signup Sumber: src/utils/__tests__/superAdminHelpers.test.js:16 Browser: Founder creates synthetic tenant, branch, owner and license: PASS; Provisioned Owner can authenticate and sees only own outlet: PASS |
| ADM-06 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Archive cancellation leaves tenant active: PASS; Archive and restore retains synthetic owner branch and license: PASS |
| ADM-07 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Founder impersonates newly created tenant: PASS |
| ADM-08 | P1 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| UX-01 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Owner dashboard viewport 390: PASS; Owner dashboard viewport 768: PASS; Owner dashboard viewport 1440: PASS |
| UX-02 | P1 | FAIL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Password dialog focus and Escape behavior: FAIL |
| UX-03 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Founder workflow uncaught page errors: PASS |
| UX-04 | P1 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| UX-05 | P1 | PARTIAL | rupiah/date basics and currency formatting/parsing; timezone and layout coverage separate Sumber: src/utils/__tests__/helpers.test.js:13 |
| UX-06 | P2 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Dashboard at 200% zoom equivalent and reduced motion preference: PARTIAL |
| RES-01 | P0 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| RES-02 | P0 | NOT RUN | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. |
| RES-03 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Corrupt persisted database falls back without blank screen: PASS |
| RES-04 | P0 | FAIL | FAIL: finance CSV cell =1+1 remains formula-capable text rather than neutralized Sumber: negative-probes.mjs |
| RES-05 | P0 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: limited static scan of built bundle only; not proof no secrets anywhere: PASS |
| RES-06 | P1 | PARTIAL | No concrete existing unit assertion mapped in this review; browser/SQL report may provide evidence. Browser: Deep-link dashboard reload and unknown route dispatch: PASS |
| RES-07 | P1 | PARTIAL | ESC/POS formatting/buffer only; physical devices and live services blocked Sumber: src/utils/__tests__/bluetoothPrinter.test.js:14 |
| RES-08 | P2 | PARTIAL | 10000 in-memory tx /20000 journal lines balanced; no agreed latency target or browser load budget Sumber: assert-simulations.mjs |

## Artefak

Bukti terstruktur disimpan di `qa/2026-10-31/`: coverage JSON seluruh 98 ID, hasil browser final, hasil probe negatif, simulasi dan log SQL. Detail repro dua probe ada pada unit-findings.md. Skrip browser/log lengkap/screenshot tersedia di `/workspace/scratch/qa-campaign`; direktori scratch bukan artefak deployment.

Langkah berikutnya: perbaiki empat cacat, buat regression test yang awalnya gagal untuk perilaku yang benar, ulangi alur terdampak, lalu tuntaskan variasi PARTIAL/NOT RUN dan integrasi staging sebelum sign-off.
