# QA Framework Walkthrough — RelayPOS (`qa-project-bootstrap`)

Referensi resmi untuk developer dan agen QA sebelum menulis test baru, memperbaiki bug, atau menjalankan **Fase 3–4 UI/UX Rebranding Fintech Cobalt Blue v5.0**.

---

## 1. Architecture Overview

```text
Test Architecture: RelayPOS / Jaya Bersama Enterprise SaaS ERP
══════════════════════════════════════════════════════════════════
Unit & Integration:  Vitest v4.1.11 + React 19 + Oxc AST (`vite`)
DOM Render Smoke:    react-dom/server (`renderToString`) via src/testUtils/renderPageHelper.jsx
Live Browser E2E:    Playwright v1.64.0 (Chromium headless against `vite preview` / `dist`)
Static Code Gates:   Oxlint v1.71.0 (`0` errors) + `scripts/verifyNoUndeclaredVars.js`
SQL Harnesses:       5 PostgreSQL scripts under `supabase/tests/`
CI Pipeline:         `.github/workflows/qa-release-gate.yml` (3 stages)

Directory Structure:
  .agents/qa-project-context.md               → Context utama, Risk Matrix R-01..R-11 & Coverage Gaps
  scripts/
  ├── verifyNoUndeclaredVars.js               → AST Scope Gate (pages, components, hooks)
  ├── __tests__/verifyNoUndeclaredVars.test.js → Unit tests nested destructuring & undeclared trap
  ├── qa_phase1_5_field_section_e2e.mjs       → Playwright 14-route live DOM field/section gate
  ├── qa_tahap3_playwright_e2e.mjs            → Playwright 9 functional workflow checks
  └── qa_tahap4_a11y_perf_and_rbac_e2e.mjs    → Playwright WCAG 2.2 AA, Web Vitals & Kasir RBAC containment
  src/
  ├── utils/astContractValidator.js           → Oxc AST analyzer (JSX components, bindings, handlers, print)
  ├── constants/pageFieldContracts.js         → Master registry (18 routes + 22 interactive subcomponents)
  ├── testUtils/renderPageHelper.jsx          → Universal chainable Supabase mock & router render helper
  ├── pages/__tests__/
  │   ├── pageFieldContracts.test.js          → AST validation across 18 pages + 22 modals + 5 mutation tests
  │   └── pageIntegrity.test.jsx              → SSR smoke render across all 18 pages + 5 critical modals
  └── services/__tests__/
      ├── backendShield.test.js               → Phase 1 domain hooks & service decoupling tests
      └── schemaFormParity.test.js            → SQL DDL (`supabase/migrations/*.sql`) <-> form `dbColumns` parity
```

---

## 2. How to Run Tests

```powershell
# 1. Jalankan seluruh Verification Shield Phase 1.5 sekaligus (AST Scope + Contracts + Lint + Build)
npm run qa:phase1.5

# 2. Jalankan Layer 1: AST Scope Validator (pages, components, hooks)
npm run test:ast-scope

# 3. Jalankan Layer 2-4: AST Field/Modal Contracts + 18-Page SSR Smoke + DB Schema Parity + Scope Tests
npm run test:contracts

# 4. Jalankan seluruh Vitest Unit, Ledger, Security & Integration Suite
npx vitest run

# 5. Jalankan satu file test spesifik
npx vitest run src/pages/__tests__/pageFieldContracts.test.js

# 6. Build & jalankan Layer 5: Playwright Live DOM Suites (PowerShell 5.1)
npm run build; $env:USE_DIST_PREVIEW = "true"; $env:VITE_BACKEND_PROVIDER = "local"; node scripts/qa_phase1_5_field_section_e2e.mjs
$env:USE_DIST_PREVIEW = "true"; $env:VITE_BACKEND_PROVIDER = "local"; node scripts/qa_tahap3_playwright_e2e.mjs
$env:USE_DIST_PREVIEW = "true"; $env:VITE_BACKEND_PROVIDER = "local"; node scripts/qa_tahap4_a11y_perf_and_rbac_e2e.mjs
```

---

## 3. Step-by-Step Guide Saat Memigrasi Halaman di Fase 3–4 (Strangler-Fig)

Setiap kali Anda me-rebrand atau memecah halaman di Fase 4 (terutama *God-Pages* seperti `HybridPOSPage.jsx`, `Finance.jsx`, `Admin.jsx`, `Dashboard.jsx`):

```text
Step 1: Cek kontrak aktif di `src/constants/pageFieldContracts.js` & `docs/PAGE_FIELD_SECTION_CONTRACT.md`
  └─ Pastikan seluruh `requiredTabs`, `requiredRenderedComponents`, `requiredFields`, `requiredHandlers`, dan `dbColumns` tetap dipetakan.

Step 2: Jika memecah file UI menjadi sub-komponen baru (mis. `src/components/pos/PosExchangeTab.jsx`)
  ├─ Tambahkan path file barunya ke `companionFiles: [...]` pada kontrak halaman induk di `pageFieldContracts.js`.
  └─ Jika sub-komponen baru memakai akhiran `*Modal.jsx`, `*Manager.jsx`, dll., daftarkan juga di `SUBCOMPONENT_FIELD_CONTRACTS`.

Step 3: Tanamkan `data-testid` semantik pada kontrol kunci di JSX baru (Q4 strategy)
  └─ Format contoh: `data-testid="pos-tab-exchange"`, `data-testid="finance-modal-withdrawal"`.

Step 4: Verifikasi lokal sebelum lanjut ke halaman berikutnya
  └─ Jalankan: `npm run qa:phase1.5` (WAJIB exit 0 sebelum lanjut!)

Step 5: Verifikasi Live Browser + WCAG + RBAC
  └─ Jalankan `qa_phase1_5_field_section_e2e.mjs`, `qa_tahap3_playwright_e2e.mjs`, dan `qa_tahap4_a11y_perf_and_rbac_e2e.mjs`.
```

---

## 4. Playwright & Vitest Conventions

1. **Prioritas Locator Playwright (Wajib):**
   1. `page.getByRole(...)` (button, heading, tab, textbox)
   2. `page.getByLabel(...)` (input form yang berlabel / `aria-label`)
   3. `page.getByTestId(...)` (untuk elemen padat tanpa teks unik)
   4. `page.getByText(...)` (elemen statis sebagai opsi terakhir)
2. **Larangan Keras Reliability:**
   - **DILARANG** menambahkan `page.waitForTimeout(...)` atau `setTimeout(...)` pada skrip QA baru. Gunakan Playwright auto-waiting (`waitFor({ state: 'visible' })`, `waitForURL`, `waitForFunction`).
   - **DILARANG** menggunakan `force: true` untuk menutupi elemen yang terhalang overflow/z-index.
3. **Aturan SSR Test Helper (`src/testUtils/renderPageHelper.jsx`):**
   - Selalu gunakan `createThenableQuery()` saat mem-mock `supabase.from()` agar rantai `.eq().eq().order().range()` dengan kedalaman berapa pun tidak pernah memicu `TypeError: ... is not a function`.
4. **Aturan Oxlint & Clean Scope:**
   - Jangan menambah warning `oxlint` baru (hindari variabel/import tak terpakai karena `eslint(no-unused-vars)` langsung menandai).

---

## 5. How to Debug Failures

| Pola Kegagalan | Penyebab Umum | Cara Perbaikan Cepat |
| :--- | :--- | :--- |
| **`unrenderedComponents` fail di `pageFieldContracts.test.js`** | Komponen hanya di-`import` tapi lupa dipasang `<Modal />` di JSX (atau lupa didaftarkan di `companionFiles`). | Render komponen di JSX halaman atau tambahkan sub-file baru ke `companionFiles`. |
| **`missingFields` fail di `pageFieldContracts.test.js`** | State masih ada di `useState`, namun `<input>`/`<select>` atau payload submit terhapus saat restyling. | Sambungkan kembali binding JSX (`value={...}` / `onChange`) dan pastikan tidak ada komentar palsu. |
| **`unwiredHandlers` fail di `pageFieldContracts.test.js`** | Fungsi handler masih tertulis, namun tombol pemicu (`onClick`/`onSubmit`) terhapus. | Pasang kembali `onClick`/`onSubmit` ke tombol/form terkait. |
| **`verifyNoUndeclaredVars.js` exit `1`** | Variabel/import terhapus atau terpotong saat copy-paste JSX antar komponen. | Import/deklarasikan ulang simbol yang dilaporkan sebelum melanjutkan. |
| **`schemaFormParity.test.js` fail** | Nama kolom di `dbColumns` salah eja atau tidak ada di DDL `supabase/migrations/*.sql`. | Cocokkan nama kolom persis dengan migrasi PostgreSQL (mis. `nama_produk` di `stok_barang`, `plat` di `carwash`). |
| **Playwright `TimeoutError` / `console.error`** | Selector tab/tombol berubah teks atau terjadi runtime error browser di mode local. | Cek log `pageErrors` & `unexpectedConsoleErrors`, pastikan fallback lokal tetap aman. |
