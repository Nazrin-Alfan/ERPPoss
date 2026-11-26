# Test Architecture Audit Report — RelayPOS (`qa-project-bootstrap`)

**Tanggal Audit:** 2026-11-27  
**Branch / Baseline:** `chore/uiux-rebrand-plan` (setelah Phase 1 Backend Shield + Phase 1.5 Deep Contract & QA Bootstrap Upgrade)  
**Metodologi:** [`qa-project-bootstrap`](../.agents/skills/qa-project-bootstrap/SKILL.md) (5-Dimension Test Architecture Assessment)

---

## 1. Coverage & Distribution Worksheet

```text
Audit Worksheet: Test Suite Health (RelayPOS Post-Phase 1.5)
══════════════════════════════════════════════════════════════

Test Counts:
  Unit & Hook tests (src/utils, src/hooks):     19 files passing / 0 skipped
  Service, Data, Schema & Security tests:       52 files passing / 0 skipped
  Component Render tests (src/components):      12 files passing / 0 skipped
  Page Contract & SSR Smoke tests (src/pages):  14 files passing / 0 skipped
  ────────────────────────────────────────────────────────────────────────────
  Total Vitest Suite:                           97 files (647 tests) passing / 0 skipped
  Playwright Live Chromium E2E Gates (dist/):   3 suites / 31 checks passing (0 skipped)
  PostgreSQL RLS & RPC Harnesses:               5 SQL suites (`supabase/tests/`)

Pyramid Shape: [x] Healthy Backend-Weighted Pyramid (Unit + Contract/Service 71 files > Render/UI 26 files > E2E 31 checks)

Code Coverage: Unknown (v8 coverage threshold belum dikonfigurasi di CI)
  Critical Paths Automated: R-01 s/d R-09 + R-11 (Phase 1.5 AST + 18-Page SSR + DB Parity + 14-Route Live E2E)
  Trend (dari baseline 2026-11-10 -> 2026-11-27): Increasing (+27 file Vitest, +225 tests, +15 Phase 1.5 E2E checks)
```

---

## 2. Reliability Worksheet

```text
Flakiness & Selector Stability:
  Skipped/Quarantined Vitest tests:   0 count (0 .skip, 0 .only, 0 assertionless files)
  Hardcoded sleeps in Vitest suite:   0 count
  New Phase 1.5 Playwright E2E:       0 `waitForTimeout` calls (100% auto-waiting Playwright locators)
  Legacy E2E scripts tech debt:       39 `waitForTimeout` calls tersebar di 4 skrip legacy (`scripts/`)
  `force: true` click workarounds:    0 count di seluruh `scripts/`
  `data-testid` attributes in `src/`:  3 atribut eksisting (`Sidebar.jsx`, `BankEmailBindingModal.jsx`, `BankMutationInboxTab.jsx`)
```

---

## 3. CI Health Worksheet

```text
CI Pipeline (.github/workflows/qa-release-gate.yml):
  Trigger branches:     push (`main`, `chore/uiux-rebrand-plan`), pull_request (`main`), `workflow_dispatch`
  Stage 1 (Static/Build): AST Scope Gate (`verifyNoUndeclaredVars.js`) + `oxlint` (0 errors) + `vite build`
  Stage 2 (Vitest):     `npm run test:contracts` (4 files / 95 checks) + full `npx vitest run` (97 files / 647 tests, ~10.5s lokal)
  Stage 3 (Playwright): Chromium `dist/` preview: `qa_phase1_5_field_section_e2e.mjs` (15) + `qa_tahap3` (9) + `qa_tahap4` (7)
  AST CI Bug Remedied:  `verifyNoUndeclaredVars.js` kini keluar dengan `process.exit(1)` pada undeclared var nyata dan memindai 72 file (`pages`, `components`, `hooks`)
```

---

## 4. Technical Debt Inventory

```text
Tech Debt Inventory (Observed 2026-11-27):
  Skipped/disabled Vitest tests:        0 count
  Tests with `.only` left behind:       0 count
  Vitest files without assertions:      0 count
  Tests with `waitForTimeout`:          0 di CI gates (`qa_phase1_5`, `qa_tahap3`, `qa_tahap4`); 39 di 4 skrip legacy (`e2e_founder_full_audit.mjs`: 14, `e2e_full_verification.mjs`: 13, `e2e_deep_workflow_verification.mjs`: 8, `qa_live_pocket_rbac_e2e.mjs`: 4)
  Tests with `force: true`:             0 count
  Static linter warnings (`oxlint`):    416 warnings across 245 files / 0 errors (297 `no-unused-vars`, 49 `exhaustive-deps`, 48 `set-state-in-effect`)
  Dead handler found via AST audit:     1 (`handleDeleteIngredient` di `src/pages/Admin.jsx:892`, belum di-wire ke JSX)
  Sub-komponen tanpa dedicated `.test`: 18 dari 25 komponen modal/panel (kini seluruh 22 komponen interaktif terkunci via `SUBCOMPONENT_FIELD_CONTRACTS` AST + 5 modal kritis di-render via SSR smoke)
```

---

## 5. Conventions Checklist

```text
Patterns in Use:
  AST Structural Field & Section Locks:  [x] Yes (`astContractValidator.js` + `pageFieldContracts.js`)
  DB Schema <-> Form Column Parity:      [x] Yes (`schemaFormParity.test.js` vs 34 SQL tables)
  Shared SSR Render Mock Helper:         [x] Yes (`src/testUtils/renderPageHelper.jsx`)
  Consistent Test File Naming:           [x] Yes (`__tests__/*.test.js(x)`)
  Playwright Page Objects:               [ ] Partial (shared helpers in `qa_phase1_5` & `qa_tahap3`; semantic locator priority `getByRole > getByLabel > getByTestId`)
  Data Factories & Clean State Setup:    [x] Yes (`localDbEngine` + `createDefaultAuthState`)
```

---

## 6. Categorized Findings & Action Plan (Fase 1.5 → Fase 4)

| Kategori | Item Temuan | Status / Aksi | Target Fase |
| :--- | :--- | :--- | :--- |
| **Strength** | Fondasi ledger double-entry, RLS/RBAC, & Phase 1 Backend Shield teruji padat (`647` Vitest tests, `0` skipped, ~10.5 detik). | Pertahankan sebagai release gate wajib sebelum setiap merge. | Ongoing |
| **Quick Win (Done)** | `verifyNoUndeclaredVars.js` sebelumnya selalu exit `0`, melewatkan `src/components/` & `src/hooks/`, serta memicu 10 false positive nested destructuring. | **Diselesaikan di Phase 1.5:** parser rekursif diperbaiki, cakupan `72` file bersih, `process.exit(1)` aktif, plus unit test. | Phase 1.5 (Selesai) |
| **Quick Win (Done)** | Regex `validatePageContract` lama rentan lolos pada *dead `useState`*, unused `import`, atau komentar palsu, serta belum mengunci 22 sub-komponen & skema DB. | **Diselesaikan di Phase 1.5:** AST JSX validator + `22` kontrak sub-komponen + SSR smoke `18` halaman + `schemaFormParity.test.js` + Playwright `14` rute. | Phase 1.5 (Selesai) |
| **Gap / Risk (Tracked)** | Belum ada coverage reporter (`@vitest/coverage-v8`) & PR coverage ratchet. | Tambahkan v8 coverage check bila tim ingin menegakkan minimum % per modul domain. | Post-Phase 4 |
| **Strategic Work** | Hanya `3` atribut `data-testid` di JSX produksi & `416` warning `oxlint` tersisa di file UI lama. | Tanamkan `data-testid` semantik terstandar & bersihkan warning `oxlint` di setiap file halaman saat migrasi **Fase 3–4**. | Phase 3 & 4 |
| **Strategic Work** | `39` `waitForTimeout` pada 4 skrip E2E legacy (`e2e_founder_full_audit.mjs`, dll.) & 1 dead handler `handleDeleteIngredient` di `Admin.jsx`. | Pensiunkan/refaktor skrip legacy saat migrasi halaman terkait dan putuskan nasib `handleDeleteIngredient` saat migrasi `Admin.jsx` Wave 2. | Phase 4 (Wave 2–3) |
