# Release & Sprint QA Test Plan (`test-planning`)

- **Release / Branch:** `main` (Commit `94c5236` — Post-PR2/PR3/PR4/PR5/PR6 Convergence)
- **Target Environment:** Live Supabase Cloud (`jutidxobdedygmjngmcq`, PostgreSQL 17) + Local Vite Dev/Preview (`http://localhost:5173`)
- **Total Testing Window:** 16.0 Hours (12.0 Hours Planned [75% Utilization] + 4.0 Hours Explicit Buffer [25% Buffer])
- **Lead Agents:** `[@Lead_Orchestrator]`, `[@ERP_Architect]`, `[@TDD_ERP_Engineer]`, `[@QA_ERP_Auditor]`

---

## 1. Scope Table

| Ticket / Risk ID | Feature / Module | Change Status | Risk Zone (Score) | In Scope? | Target Depth |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **R-01** | Hybrid POS Checkout & Atomic Pending Bill Settlement | Changed (`20261103`, `20261104`) | CRITICAL (25) | ✅ Yes | Full (Unit + Live DB RPC + E2E) |
| **R-02** | Double-Entry General Ledger, Cashflow & Owner Withdrawal | Changed (`20261107000002`, PR-5) | CRITICAL (25) | ✅ Yes | Full (Unit + Trigger Immutability + E2E) |
| **R-03** | Granular RBAC & Multi-Tenant / Multi-Branch RLS Isolation | Changed (`20261107000001..0002`) | CRITICAL (20) | ✅ Yes | Full (64 Policies + Breach/IDOR + E2E) |
| **R-04** | POS Inventory Stock Deduction, Recipe BOM & HPP Masking | Changed (`94c5236`, PR-3, PR-5) | CRITICAL (16) | ✅ Yes | Full (RPC Masking + Cast + UI) |
| **R-05** | Dual-Engine Parity (Cloud Supabase vs `localDbEngine.js`) | Changed (PR-4, PR-5) | CRITICAL (16) | ✅ Yes | Contract & Signature Verification |
| **R-07** | Staff Payroll, Kasbon, Commissions & Carwash Crew | Changed (PR-3, PR-5) | CRITICAL (16) | ✅ Yes | Full (UUID Guard + RPC + UI) |
| **R-08** | Multi-Tenant Onboarding, Founder Console & License Lockout | Unchanged / Core | CRITICAL (15) | ✅ Yes | Regression + E2E Lockout Gate |
| **R-06** | CRM Loyalty Stamp & Atomic Customer Reward Redemption | Changed (`20261107000003`) | HIGH (12) | ✅ Yes | Full RPC Idempotency + Spot UI |
| **R-09** | Executive Dashboard & Multi-Branch Financial Consolidation | Unchanged | MEDIUM (9) | ✅ Yes | Happy Path + Smoke Check |
| **R-10** | Thermal Receipt Formatting & Bluetooth Printer | Unchanged | LOW (4) | ⚠️ Partial | Unit Only (Hardware E2E Deferred) |

---

## 2. Feature Analysis & Scenario Decomposition (Step 1)

Every in-scope feature is decomposed across the 6 mandatory scenario categories:

### R-01: Hybrid POS Checkout & Atomic Pending Bill Settlement
- **SC-01.1 (Happy Path):** Execute `fn_execute_checkout` for TUNAI/QRIS and `fn_settle_pending_bill` for an existing `BELUM_LUNAS` bill; pass criteria: status transitions to `LUNAS`, `cashflow` and balanced `journal_entries` created.
- **SC-01.2 (Validation):** Submit `fn_settle_pending_bill` with `p_cash_received < grand_total` on TUNAI or blank `p_id_struk`; pass criteria: raises `P0001` with clear message, zero DB mutation.
- **SC-01.3 (Error Conditions):** Attempt to settle a non-existent `id_struk` or cancelled bill; pass criteria: raises `P0002` / `P0001` cleanly.
- **SC-01.4 (Edge Cases):** Exact tender (`p_cash_received == grand_total`, `change_amount == 0`) and high-value Rupiah integer amounts (`Numeric(18,4)` without float drift).
- **SC-01.5 (Concurrency / Race Conditions):** Double invocation / replay of `fn_settle_pending_bill` on the same `id_struk`; pass criteria: `pg_advisory_xact_lock` + `status_pembayaran` check rejects the second call (`already settled`), preventing duplicate cashflow/journal rows.
- **SC-01.6 (Integration Points):** Frontend `HybridPOSPage.jsx` and `CafePOSPage.jsx` settlement handlers pass `activeBranchId` (UUID) and synchronize local/cloud state.

### R-02: Double-Entry General Ledger, Cashflow & Owner Withdrawal
- **SC-02.1 (Happy Path):** Post a balanced journal entry (`SUM(debit) == SUM(credit)`) and record an Owner Withdrawal with valid UUID `branch_id`; pass criteria: journal saved with `status = 'POSTED'`.
- **SC-02.2 (Validation):** Attempt Owner Withdrawal in Cloud mode when `branch_id` is non-UUID (`'branch_medan_main'`); pass criteria: `OwnerWithdrawalModal.jsx` blocks submission before hitting Postgres `22P02` error.
- **SC-02.3 (Error Conditions):** Attempt `UPDATE` or `DELETE` on a `POSTED` row in `journal_entries` or `journal_entry_lines`; pass criteria: `trg_prevent_posted_journal_mutation` and `trg_prevent_posted_journal_line_mutation` abort transaction with exception.
- **SC-02.4 (Edge Cases):** Multi-line split journal entry (1 debit, 3 credits) verifying exact `NUMERIC(18,4)` sum equality.
- **SC-02.5 (Concurrency):** Simultaneous journal entry numbering within the same tenant; pass criteria: unique constraint / lock prevents duplicate corruption.
- **SC-02.6 (Integration Points):** `Finance.jsx` and `OwnerWithdrawalModal.jsx` reflect updated COA balances accurately.

### R-03: Granular RBAC & Multi-Tenant / Multi-Branch RLS Isolation
- **SC-03.1 (Happy Path):** `Owner` accesses all branches within own tenant; `Kasir` reads/inserts operational records (`struk`, `cafe`, `carwash`, `pengeluaran`) only for assigned `branch_id`.
- **SC-03.2 (Validation):** `Kasir` attempts `UPDATE` on own `profiles.role` to `'Owner'` or `profiles.tenant_id` to another tenant; pass criteria: `trg_protect_profile_sensitive_columns` blocks mutation.
- **SC-03.3 (Error Conditions / Security Breach):** Authenticated user from Tenant A queries/mutates Tenant B rows, or Branch A `Kasir` queries Branch B `struk`/`pengeluaran`; pass criteria: RLS returns 0 rows / `42501 permission denied`.
- **SC-03.4 (Edge Cases):** Operational row `UPDATE` attempting to move `struk.branch_id` or `pengeluaran.tenant_id` post-creation; pass criteria: `trg_protect_*_branch` blocks mutation.
- **SC-03.5 (Concurrency):** Session switch between roles in `AuthContext.jsx` immediately clears stale branch privileges.
- **SC-03.6 (Integration Points):** `TRUNCATE` privilege check confirms `authenticated` has `0` base tables with `TRUNCATE` grant in Live DB.

### R-04: POS Inventory Stock Deduction, Recipe BOM & HPP Masking
- **SC-04.1 (Happy Path):** `Kasir` fetches POS inventory via `fn_get_pos_inventory_stock(p_branch_id)`; pass criteria: returns 21 operational columns (`stok`, `harga_jual`, etc.) and excludes `harga_beli` / HPP.
- **SC-04.2 (Validation):** `Kasir` queries `SELECT * FROM public.stok_barang` directly; pass criteria: RLS policy `stok_barang_select` denies access to `Kasir`.
- **SC-04.3 (Error Conditions):** Call `fn_get_pos_inventory_stock` with a `branch_id` belonging to another branch/tenant; pass criteria: returns empty set or raises access error via `fn_has_operational_branch_access`.
- **SC-04.4 (Edge Cases):** Join between `public.resep.id_bahan_baku` (`VARCHAR`) and `public.stok_barang.id` (`UUID`); pass criteria: `::text` cast executes with zero `42883` errors.
- **SC-04.5 (Concurrency):** Concurrent stock deductions on checkout do not corrupt `stok_barang.stok`.
- **SC-04.6 (Integration Points):** `HybridPOSPage.jsx` (`fetchInventory`) routes `Kasir` through `supabase.rpc('fn_get_pos_inventory_stock')` and `Owner`/`Admin` through `stok_barang`.

### R-05, R-06, R-07, R-08, R-09, R-10 Decomposition Summary
- **SC-05.1 (Integration / Contract):** Live PostgreSQL `pg_proc` signatures for all 11 security-critical RPCs match `localDbEngine.js` and frontend `.rpc()` callers 1:1.
- **SC-06.1 (Concurrency / Idempotency):** `redeem_customer_reward` with duplicate `p_request_key` returns idempotent result without double-deducting `poin_member`; `poin_member < 10` raises `P0001`.
- **SC-07.1 (Validation & Integration):** `Karyawan.jsx` and `staffHelpers.js` reject non-UUID `branch_id` in Cloud mode (`branch_id: null` instead of `'branch_medan_main'`); `fn_get_active_carwash_crew` returns only active crew for the authorized branch.
- **SC-08.1 (Happy Path & Lockout):** Expired license triggers `LicenseExpiredLockout.jsx` screen; valid tenant login routes to role-appropriate workspace.
- **SC-09.1 (Happy Path):** `Dashboard.jsx` and `consolidationService.js` aggregate multi-branch metrics without cross-tenant leakage.
- **SC-10.1 (Unit Only):** `receiptHelpers.js` and `bluetoothPrinter.js` format ESC/POS receipt lines accurately.

---

## 3. Requirements-to-Test Coverage Matrix (Step 2)

| Req / Scenario ID | Requirement Description | Test Type | Automated Test File / Live Harness | Status | Gap / Action Decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SC-01.1 – SC-01.6** | Checkout & Atomic Pending Bill Settlement | Unit + DB + E2E | `src/services/__tests__/pendingSettlement.test.js`, `src/pages/pos/__tests__/hybridSettlementHandler.test.js` | ⚠️ Partial | **ACTION (P0):** Execute Live DB verification in Tahap 2 + Playwright E2E in Tahap 3 |
| **SC-02.1 – SC-02.6** | Double-Entry Ledger Immutability & Owner Withdrawal UUID Guard | Unit + DB + E2E | `src/services/__tests__/generalLedger.test.js`, `src/pages/__tests__/FinanceModals.test.jsx` | ⚠️ Partial | **ACTION (P0):** Execute Live DB trigger immutability test in Tahap 2 + E2E in Tahap 3 |
| **SC-03.1 – SC-03.6** | 64 Granular RLS Policies, Profile Lockdown & Branch Triggers | Unit + DB Security | `src/services/__tests__/rbacPr3GranularPolicies.test.js`, `supabase/tests/pr2_lockdown_harness.sql`, `pr3_granular_rls_harness.sql` | ⚠️ Partial | **ACTION (P0):** Execute Live DB security & IDOR verification in Tahap 2 + RBAC E2E in Tahap 3 |
| **SC-04.1 – SC-04.6** | POS Inventory RPC Masking (`fn_get_pos_inventory_stock`) & Recipe Cast | Unit + DB | `src/services/__tests__/rbacPr5FrontendSync.test.jsx`, `supabase/migrations/20261107000002*.sql` | ⚠️ Partial | **ACTION (P0):** Verify Live DB RPC column projection & recipe join in Tahap 2 |
| **SC-05.1** | Cloud `pg_proc` vs `localDbEngine` & Frontend RPC Contract Parity | Integration / Contract | `src/services/__tests__/accessControlContract.test.js` | ⚠️ Partial | **ACTION (P1):** Run automated live contract audit in Tahap 2 |
| **SC-06.1** | Atomic Customer Reward Redemption (`redeem_customer_reward`) | Unit + DB | `src/services/__tests__/rbacPr4RewardRpc.test.js`, `supabase/tests/pr4_reward_rpc_harness.sql` | ⚠️ Partial | **ACTION (P1):** Verify Live DB RPC behavior & idempotency in Tahap 2 |
| **SC-07.1** | Staff UUID Guard & `fn_get_active_carwash_crew` RPC | Unit + DB | `src/utils/__tests__/staffHelpers.test.js` | ⚠️ Partial | **ACTION (P1):** Verify Live DB `fn_get_active_carwash_crew` in Tahap 2 |
| **SC-08.1** | License Lockout & Multi-Tenant Onboarding | Unit + E2E | `src/components/auth/__tests__/LicenseExpiredLockout.test.jsx`, `src/services/__tests__/licenseIntegration.test.js` | ⚠️ Partial | **ACTION (P1):** Add Playwright E2E smoke & auth flow in Tahap 3 |
| **SC-09.1** | Multi-Branch Consolidation & Executive Dashboard | Unit + E2E Smoke | `tests/consolidationService.test.js`, `tests/consolidationSecurity.test.js` | ✅ Covered | Included in Vitest regression + E2E smoke in Tahap 3 |
| **SC-10.1** | Thermal Receipt & Web Bluetooth Printer | Unit | `src/utils/__tests__/bluetoothPrinter.test.js`, `src/utils/__tests__/receiptHelpers.test.js` | ✅ Covered | **DEFER Hardware E2E:** Web Bluetooth requires physical thermal printer; unit tests sufficient |

---

## 4. Effort Estimation & Prioritization Matrix (Steps 3 & 4)

### Effort Budget Worksheet (Available Window: 16.0 Hours)

| Activity / Work Item | Test Type | Priority (Risk × Effort) | Est. Write/Setup | Est. Execute & Review | Total Effort |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Tahap 1:** Risk Matrix & Release Test Plan (`risk-based-testing`, `test-planning`) | Strategy & Planning | **DO FIRST** | 1.5 hr | 0.5 hr | **2.0 hrs** |
| **Tahap 2A:** Live DB Schema, Trigger Immutability & Migration Integrity (`database-testing`) | DB Integration | **DO FIRST** | 1.5 hr | 1.0 hr | **2.5 hrs** |
| **Tahap 2B:** Multi-Tenant / Multi-Branch RLS Breach, IDOR & Privilege Containment (`security-testing`) | Security / Pentest | **DO FIRST** | 2.0 hr | 1.0 hr | **3.0 hrs** |
| **Tahap 3A:** RPC & PostgREST API Contract Suite (`api-testing`) | API / Contract | **DO SECOND** | 1.0 hr | 0.5 hr | **1.5 hrs** |
| **Tahap 3B:** Playwright Browser E2E Suite for Critical Flows (`playwright-automation`) | E2E Browser | **DO SECOND** | 2.0 hr | 1.0 hr | **3.0 hrs** |
| **Planned Work Subtotal (75.0% Utilization)** | — | — | **8.0 hrs** | **4.0 hrs** | **12.0 hrs** |
| **Explicit Bug Fix, Re-Test & Remediation Buffer (25.0% Buffer)** | Buffer | **RESERVED** | — | — | **4.0 hrs** |
| **Total Testing Window** | — | — | — | — | **16.0 hrs** |

### Risk × Effort Prioritization Grid

```text
                  EFFORT
                  Low (< 2 hrs)                       Medium (2-3 hrs)                     High (> 3 hrs)
                 +-----------------------------------+------------------------------------+----------------------------------+
  CRITICAL/HIGH  | [DO FIRST]                        | [DO SECOND]                        | [DO THIRD]                       |
  (Score 12-25)  | - Live DB Trigger & RPC Checks    | - Full 64-Policy RLS Breach Audit  | - Multi-Terminal Stress Load     |
                 | - Cloud vs Local Contract Parity  | - Playwright E2E Critical Flows    |   (Deferred to post-release k6)  |
                 | - Vitest 70-File Regression Suite |   (Auth, POS, Finance, RBAC)       |                                  |
                 +-----------------------------------+------------------------------------+----------------------------------+
  MEDIUM         | [DO SECOND]                       | [DEFER]                            | [DEFER]                          |
  (Score 5-9)    | - Consolidation & Dashboard Smoke | - Cross-browser Safari/Edge matrix | - Visual pixel-diff baselines    |
                 +-----------------------------------+------------------------------------+----------------------------------+
  LOW            | [DO THIRD]                        | [SKIP]                             | [SKIP]                           |
  (Score 1-4)    | - Receipt Formatter Unit Tests    | - Physical Bluetooth Printer E2E   | - Cosmetic tooltip pixel checks  |
                 +-----------------------------------+------------------------------------+----------------------------------+
```

---

## 5. Resource Allocation & Execution Schedule (Steps 5 & 6)

| Role / Agent | Assigned Work | Planned Hours | Buffer Hours | Total Capacity |Utilization |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `👑 [@Lead_Orchestrator]` | Gatekeeping, test plan tracking, release sign-off | 1.5 hrs | 0.5 hrs | 2.0 hrs | 75% |
| `📐 [@ERP_Architect]` & `🧪 [@TDD_ERP_Engineer]` | `database-testing`, `api-testing`, Playwright E2E authoring | 5.25 hrs | 1.75 hrs | 7.0 hrs | 75% |
| `✅ [@QA_ERP_Auditor]` & `🎨 [@UIUX_Design_Auditor]` | `security-testing` (RLS/OWASP), E2E verification, UI/UX audit | 5.25 hrs | 1.75 hrs | 7.0 hrs | 75% |

### Phased Execution Schedule
1. **Tahap 1 (Completed):** `risk-based-testing` + `test-planning` — Risk Matrix & Release Test Plan documented and tracked.
2. **Tahap 2 (Next Immediately):** `database-testing` + `security-testing` — Live Supabase (`jutidxobdedygmjngmcq`) transactional integrity, trigger immutability, recipe type-cast regression, and 64-policy RLS / IDOR / RBAC security verification + automated Vitest suite.
3. **Tahap 3 (Final Gate):** `api-testing` + `playwright-automation` — RPC/API contract tests + Playwright headless browser E2E tests against the running application, followed by `release-readiness` Go/No-Go sign-off.

---

## 6. Entry & Exit Criteria (First-Class Gates)

### Entry Criteria (All Met ✅)
- [x] `main` branch synced with `origin/main` (`94c5236`) and all obsolete branches pruned.
- [x] All 5 migrations (`20261103023738` through `20261107000003`) applied to Live Supabase (`jutidxobdedygmjngmcq`).
- [x] Zero `NULL` values on mandatory `branch_id` operational records in Live DB.
- [x] Existing 70 Vitest unit/integration test files passing (422/422 green) and `vite build` + `oxlint` passing with 0 errors.

### Exit Criteria (Required for Release Sign-Off)
- [ ] **100% CRITICAL & HIGH Risk Scenarios Verified:** All scenarios `SC-01` through `SC-08` pass across Unit, Live DB, and E2E layers.
- [ ] **Zero Multi-Tenant / Cross-Branch Leaks:** Confirmed `ZERO_LEAK_CONFIRMED` across all 64 RLS policies and `SECURITY DEFINER` RPCs.
- [ ] **Exact Financial Precision:** Zero rounding drift and confirmed immutability of `POSTED` double-entry journal rows (`trg_prevent_posted_journal_*_mutation`).
- [ ] **Zero Open P0 / P1 Defects:** Any P0/P1 defect discovered during Tahap 2 or Tahap 3 is fixed, regression-tested, and verified green within the 25% buffer.
- [ ] **Zero Unexplained Coverage Gaps:** Every row in the Coverage Matrix is either `PASS` or carries an explicit signed-off `DEFER` justification.
