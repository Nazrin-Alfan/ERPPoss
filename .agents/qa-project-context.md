# QA Project Context

## Product

- **Name:** RelayPOS / Jaya Bersama Enterprise SaaS ERP
- **Type:** Multi-Tenant B2B SaaS ERP & POS (Carwash, Cafe, Retail, Accounting, Inventory)
- **Description:** Complete enterprise SaaS ERP & POS with strict multi-tenancy, dual-engine (Local IndexedDB + Supabase Cloud PostgreSQL 17), double-entry accounting ledger, and RBAC security.
- **URLs:**
  - Production: Local / Cloud Hosted Supabase (`jutidxobdedygmjngmcq`)
  - Staging: Local QA harnesses
  - Development: `http://localhost:5173`
- **Key User Flows:**
  - Multi-tenant Founder / Owner Onboarding & Serial License Activation
  - Multi-outlet POS Operations (Carwash Queue Kanban, Cafe POS, Retail/Merchandise)
  - Real-time Split Payment Tender & Atomic Bill Settlement (`fn_execute_checkout`, `fn_settle_pending_bill`)
  - Double-Entry General Ledger (`journal_entries`, `journal_entry_lines`, `cashflow`, COA)
  - CRM Loyalty Stamp Accumulation & One-Time Atomic Reward Redemption (`redeem_customer_reward`)
  - Granular RBAC & Privilege Containment (`Super Admin`, `Owner`, `Admin`, `Kasir`, `Staff Kantor`, `Karyawan Cuci`)

---

## Tech Stack

### Frontend
- **Framework:** React 19 + Vite 8
- **Language:** JavaScript (ESNext / JSX)
- **Styling:** Tailwind CSS + Radix UI + Lucide Icons (Dense Enterprise UI / Anti-AI Slop)
- **State Management:** React Context (`AuthContext`, `POSContext`) + LocalDbEngine Store

### Backend & Cloud
- **Platform:** Supabase Cloud (PostgreSQL 17.2, Project ID: `jutidxobdedygmjngmcq`)
- **API Style:** Supabase PostgREST Data API + Security Definer RPCs
- **Client SDK:** `@supabase/supabase-js` v2.49 + `cloudClientAdapter` fallback bridge
- **Offline / Local Engine:** Custom In-Memory & IndexedDB Mock SQL Engine (`localDbEngine.js`)

### Database
- **Primary:** PostgreSQL 17 (Supabase Managed)
- **Security:** Row Level Security (RLS) on all 34 tables with `(tenant_id, branch_id)` scoping
- **Integrity Invariants:** Advisory Locks (`pg_advisory_xact_lock`), Double-Entry Balanced Ledger triggers, Immutable Posted Journals

---

## Test Stack

### Unit & Integration
- **Framework:** Vitest v4.1.11
- **Config Location:** `vite.config.js`
- **Test Directories:** `src/**/__tests__/`, `tests/`
- **Current Coverage:** 70 test files, 422 passing tests (100% green)

### Database & Harnesses
- **SQL Test Harnesses:**
  - `supabase/tests/access_control_fixture.sql`
  - `supabase/tests/pr2_lockdown_harness.sql`
  - `supabase/tests/pr3_granular_rls_harness.sql`
  - `supabase/tests/pr4_reward_rpc_harness.sql`
  - `supabase/tests/pr6_release_gate_harness.sql`
- **Runner Scripts:** `scripts/test_pr6_release_gate.sh`

---

## Conventions & Rules

- **Multi-Tenancy:** Zero cross-tenant data leaks. All queries MUST filter by `tenant_id` or invoke tenant-scoped RPCs.
- **Branch Scoping:** Operational records (`struk`, `cafe`, `carwash`, `stok_barang`) are strictly scoped by `branch_id`.
- **Financial Precision:** Currency is represented using exact decimals (`NUMERIC(18, 4)`) or Rupiah integer cents. Never use float.
- **Anti-AI Slop:** Data density, tabular numerals (`text-right font-mono tabular-nums`), WCAG AA contrast >= 4.5:1, tactile button states.


---

## Risk Matrix & Assessment (`risk-based-testing`)

### 1. Code Churn Signal (Last 3 Months)
Top modified application files driving Probability scores:
- `src/pages/pos/HybridPOSPage.jsx` (24 commits) — **Probability: 5 (Frequent)**
- `src/pages/Finance.jsx` (24 commits) — **Probability: 5 (Frequent)**
- `src/pages/Admin.jsx` (17 commits) — **Probability: 4 (Likely)**
- `src/pages/Karyawan.jsx` (17 commits) — **Probability: 4 (Likely)**
- `src/services/localDbEngine.js` (16 commits) — **Probability: 4 (Likely)**
- `src/context/AuthContext.jsx` (15 commits) — **Probability: 4 (Likely)**
- `src/utils/financeHelpers.js` (12 commits) — **Probability: 4 (Likely)**
- `src/pages/Founder.jsx` (12 commits) — **Probability: 3 (Possible)**
- `src/pages/Gudang.jsx` (12 commits) — **Probability: 4 (Likely)**
- `src/pages/pos/CafePOSPage.jsx` (11 commits) — **Probability: 4 (Likely)**
- `src/pages/CRM.jsx` (10 commits) — **Probability: 3 (Possible)**

### 2. Scored Risk Matrix (Impact × Probability)

| ID | Feature / Component | Primary Files / DB Objects | Impact (1-5) | Probability (1-5) | Score | Risk Zone | Prescribed Testing Action |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **R-01** | **Hybrid POS Checkout & Atomic Pending Bill Settlement** | `HybridPOSPage.jsx`, `CafePOSPage.jsx`, `fn_execute_checkout`, `fn_settle_pending_bill` | 5 | 5 | **25** | **CRITICAL** | Automate fully (Unit + Live DB RPC + E2E) + concurrency lock test + exploratory |
| **R-02** | **Double-Entry General Ledger, Cashflow & Owner Withdrawal** | `Finance.jsx`, `OwnerWithdrawalModal.jsx`, `financeHelpers.js`, `journal_entries`, `journal_entry_lines` | 5 | 5 | **25** | **CRITICAL** | Automate fully + immutable journal trigger test + exact decimal precision check |
| **R-03** | **Granular RBAC & Multi-Tenant / Multi-Branch RLS Isolation** | `20261107000001..0003.sql`, 64 RLS policies, `fn_has_operational_branch_access`, `AuthContext.jsx` | 5 | 4 | **20** | **CRITICAL** | Automate fully + multi-tenant/cross-branch IDOR & privilege escalation suite |
| **R-04** | **POS Inventory Stock Deduction, Recipe BOM & HPP Masking** | `Gudang.jsx`, `stok_barang`, `resep`, `fn_get_pos_inventory_stock` | 4 | 4 | **16** | **CRITICAL** | Automate fully + Kasir HPP non-leakage test + negative stock & recipe cast test |
| **R-05** | **Dual-Engine Parity (Cloud Supabase vs Local IndexedDB Fallback)** | `localDbEngine.js`, `cloudClientAdapter.js`, `apiAdapter.js`, `posService.js` | 4 | 4 | **16** | **CRITICAL** | Automate fully + contract parity test between `localDbEngine` and Live Cloud RPCs |
| **R-06** | **CRM Loyalty Stamp & Atomic Customer Reward Redemption** | `CRM.jsx`, `redeem_customer_reward`, `customer_reward_claims` | 4 | 3 | **12** | **HIGH** | Automate fully + idempotency `p_request_key` replay test + cross-tenant plat test |
| **R-07** | **Staff Payroll, Kasbon, Commissions & Carwash Crew Assignment** | `Karyawan.jsx`, `staffHelpers.js`, `fn_get_active_carwash_crew`, `carwash` | 4 | 4 | **16** | **CRITICAL** | Automate fully + UUID guard validation + payroll period calculation test |
| **R-08** | **Multi-Tenant Onboarding, Founder Console & License Lockout** | `Founder.jsx`, `SuperAdmin.jsx`, `LicenseExpiredLockout.jsx`, `licenses` | 5 | 3 | **15** | **CRITICAL** | Automate fully + expired license lockout E2E + tenant provisioning isolation |
| **R-09** | **Executive Dashboard & Multi-Branch Financial Consolidation** | `Dashboard.jsx`, `consolidationService.js` | 3 | 3 | **9** | **MEDIUM** | Automate happy path + cross-branch aggregation accuracy |
| **R-10** | **Thermal Receipt Formatting & Bluetooth Printer Integration** | `bluetoothPrinter.js`, `receiptHelpers.js` | 2 | 2 | **4** | **LOW** | Unit happy path on formatting helpers; skip hardware E2E |

### 3. Risk Heatmap (5×5)

```text
                    PROBABILITY
                    Rare(1)   Unlikely(2)  Possible(3)  Likely(4)         Frequent(5)
                   +----------+-----------+-----------+-----------------+------------------+
  Catastrophic(5)  |          |           | R-08(15)  | R-03(20)        | R-01(25),R-02(25)|
                   +----------+-----------+-----------+-----------------+------------------+
  Major(4)         |          |           | R-06(12)  | R-04,R-05,R-07  |                  |
I                  +----------+-----------+-----------+-----------------+------------------+
M  Moderate(3)     |          |           | R-09(9)   |                 |                  |
P                  +----------+-----------+-----------+-----------------+------------------+
A  Minor(2)        |          | R-10(4)   |           |                 |                  |
C                  +----------+-----------+-----------+-----------------+------------------+
T  Negligible(1)   |          |           |           |                 |                  |
                   +----------+-----------+-----------+-----------------+------------------+
```

### 4. Failure Mode Analysis (All Items Scoring ≥ 10)

```text
Feature/Component: R-01 Hybrid POS Checkout & Atomic Pending Bill Settlement
Risk Score: 25 (Impact 5 × Probability 5)
Failure Mode 1: Double settlement or race condition on pending Open Bill (`status_pembayaran = 'BELUM_LUNAS'`)
  Trigger:            Two cashier terminals settling the same `id_struk` simultaneously or network retry
  Blast Radius:       Duplicate `cashflow` and `journal_entries` records; inflated daily revenue
  Detection Method:   SQL harness & integration test asserting `pg_advisory_xact_lock` + `FOR UPDATE` rejection
  Current Mitigation: `fn_settle_pending_bill` uses advisory lock and status check (`20261104000001`)
  Gap:                Live DB automated execution of concurrent/repeat settlement in QA suite

Failure Mode 2: Split payment / cash tender underpayment or mismatched change calculation
  Trigger:            Cashier submits `p_cash_received < grand_total` on TUNAI or invalid payment method
  Blast Radius:       Corrupted drawer balance and unbalanced ledger
  Detection Method:   RPC error code `P0001` validation test
  Current Mitigation: `fn_execute_checkout` & `fn_settle_pending_bill` validate tender amount
  Gap:                Browser E2E test verifying UI error feedback on HybridPOSPage & CafePOSPage

Feature/Component: R-02 Double-Entry General Ledger, Cashflow & Owner Withdrawal
Risk Score: 25 (Impact 5 × Probability 5)
Failure Mode 1: Unbalanced journal entry (`SUM(debit) != SUM(credit)`) or mutation of `POSTED` journal
  Trigger:            Direct REST API `PATCH`/`DELETE` on `journal_entries` or `journal_entry_lines`, or faulty withdrawal payload
  Blast Radius:       Corrupted Balance Sheet & Profit/Loss statements across tenant
  Detection Method:   Database trigger test (`trg_prevent_posted_journal_mutation`)
  Current Mitigation: Triggers installed in `20261107000002` + `isValidUUID` guard in `OwnerWithdrawalModal.jsx`
  Gap:                Live Supabase verification of trigger rejection when mutating `POSTED` rows

Failure Mode 2: Mock/fallback string `branch_id` (`'branch_medan_main'`) sent to Cloud UUID column during Owner Withdrawal
  Trigger:            User session missing UUID branch selection in Cloud mode
  Blast Radius:       PostgreSQL `22P02 invalid input syntax for type uuid` error blocking financial entry
  Detection Method:   Unit & component tests on `OwnerWithdrawalModal.jsx`
  Current Mitigation: `isValidUUID` check added in `OwnerWithdrawalModal.jsx`
  Gap:                Full E2E modal submission verification

Feature/Component: R-03 Granular RBAC & Multi-Tenant / Multi-Branch RLS Isolation
Risk Score: 20 (Impact 5 × Probability 4)
Failure Mode 1: Cross-tenant or cross-branch data leak (IDOR) or self-role escalation (`role = 'Owner'`)
  Trigger:            Authenticated `Kasir` querying another branch's `struk`/`pengeluaran` or updating own `profiles.role`
  Blast Radius:       Full tenant privilege escalation or branch financial espionage
  Detection Method:   SQL security harness (`pr2_lockdown_harness.sql`, `pr3_granular_rls_harness.sql`)
  Current Mitigation: 64 granular RLS policies + `trg_protect_profile_sensitive_columns` + `trg_protect_*_branch`
  Gap:                Execute full PR-2/PR-3/PR-4/PR-6 security assertions against Live Cloud schema

Feature/Component: R-04 POS Inventory Stock Deduction, Recipe BOM & HPP Masking
Risk Score: 16 (Impact 4 × Probability 4)
Failure Mode 1: `Kasir` role reading `harga_beli` / HPP cost columns directly from `stok_barang`
  Trigger:            Direct `SELECT * FROM stok_barang` by `Kasir` or frontend not routing via `fn_get_pos_inventory_stock`
  Blast Radius:       Exposure of confidential COGS/margins to store cashiers
  Detection Method:   RLS policy test & `HybridPOSPage` RPC invocation test
  Current Mitigation: `stok_barang_select` restricted to privileged roles; `Kasir` uses `fn_get_pos_inventory_stock`
  Gap:                Live DB verification of `fn_get_pos_inventory_stock` column set & RLS block for `Kasir`

Failure Mode 2: Type mismatch (`VARCHAR = UUID`) between `resep.id_bahan_baku` and `stok_barang.id`
  Trigger:            SQL joins without explicit `::text` cast
  Blast Radius:       PostgreSQL `42883` runtime failure during recipe deduction or migration
  Detection Method:   Database migration & query test on `resep` ↔ `stok_barang`
  Current Mitigation: Fixed in commit `94c5236` (`sb.id::text = r.id_bahan_baku::text`)
  Gap:                Automated regression check in `database-testing` suite

Feature/Component: R-05 Dual-Engine Parity (Cloud Supabase vs Local IndexedDB Fallback)
Risk Score: 16 (Impact 4 × Probability 4)
Failure Mode 1: RPC signature drift between `localDbEngine.js` and Live PostgreSQL functions
  Trigger:            Updating SQL migration parameters without updating `localDbEngine.rpc()` handlers
  Blast Radius:       Tests pass in local mock mode but fail in Cloud production (or vice versa)
  Detection Method:   Contract test comparing `pg_proc` parameter signatures in Live DB against `localDbEngine.js`
  Current Mitigation: Manual alignment in PR-4/PR-5
  Gap:                Automated schema/RPC contract test verifying Live DB vs `localDbEngine`

Feature/Component: R-07 Staff Payroll, Kasbon, Commissions & Carwash Crew Assignment
Risk Score: 16 (Impact 4 × Probability 4)
Failure Mode 1: Invalid non-UUID `branch_id` on employee creation or carwash crew lookup failure for `Kasir`
  Trigger:            `Karyawan.jsx` fallback to `'branch_medan_main'` or `Kasir` blocked from `karyawan` table during carwash queue assignment
  Blast Radius:       Employee save failure in Cloud mode; Carwash POS unable to assign washing crew
  Detection Method:   Unit test on `staffHelpers.js` + RPC test on `fn_get_active_carwash_crew`
  Current Mitigation: `isValidUUID` in `staffHelpers.js`/`Karyawan.jsx` + `fn_get_active_carwash_crew` RPC
  Gap:                Live DB RPC verification for `fn_get_active_carwash_crew`

Feature/Component: R-08 Multi-Tenant Onboarding, Founder Console & License Lockout
Risk Score: 15 (Impact 5 × Probability 3)
Failure Mode 1: Expired tenant license still allows POS mutations or new tenant provisioning leaks data
  Trigger:            Missing license status gate in UI/AuthContext or RLS bypass
  Blast Radius:       Unpaid SaaS usage or cross-tenant contamination during onboarding
  Detection Method:   `LicenseExpiredLockout.test.jsx` & `tenantOnboardingAndIsolation.test.js`
  Current Mitigation: AuthContext lockout gate + RLS policies
  Gap:                E2E browser verification of login & route protection

Feature/Component: R-06 CRM Loyalty Stamp & Atomic Customer Reward Redemption
Risk Score: 12 (Impact 4 × Probability 3)
Failure Mode 1: Replay attack or double-spend of customer loyalty stamps (`poin_member < 10`)
  Trigger:            Double-click on reward claim button or cross-branch claim manipulation
  Blast Radius:       Free carwash/cafe rewards issued without sufficient stamps
  Detection Method:   `pr4_reward_rpc_harness.sql` & `rbacPr4RewardRpc.test.js`
  Current Mitigation: `redeem_customer_reward` row locking + `customer_reward_claims.request_key` idempotency
  Gap:                Live DB execution of PR-4 reward harness assertions
```

### 5. Coverage Gap Analysis Worksheet

| ID | Feature | Zone (Score) | Unit Target vs Actual | Integration / DB Target vs Actual | E2E Target vs Actual | Priority | Owner | Target Phase |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| **R-01** | Hybrid POS Checkout & Pending Settlement | CRITICAL (25) | 90%+ / ✅ Covered (`pendingSettlement.test.js`) | All boundaries / ⚠️ Needs Live DB verification | Full journey / ⚠️ Needs Playwright E2E | **P0** | `@QA_ERP_Auditor` | Tahap 2 & 3 |
| **R-02** | Double-Entry Ledger & Owner Withdrawal | CRITICAL (25) | 90%+ / ✅ Covered (`generalLedger.test.js`) | Trigger immutability / ⚠️ Needs Live DB check | Modal & Finance view / ⚠️ Needs E2E | **P0** | `@QA_ERP_Auditor` | Tahap 2 & 3 |
| **R-03** | Granular RBAC & Multi-Branch RLS | CRITICAL (20) | 90%+ / ✅ Covered (`rbacPr3GranularPolicies.test.js`) | 64 Live policies / ⚠️ Needs Live DB breach test | Role routing / ⚠️ Needs Playwright E2E | **P0** | `@QA_ERP_Auditor` | Tahap 2 & 3 |
| **R-04** | POS Inventory, Recipe & HPP Masking | CRITICAL (16) | 90%+ / ✅ Covered (`rbacPr5FrontendSync.test.jsx`) | `fn_get_pos_inventory_stock` / ⚠️ Needs Live DB check | Kasir POS stock view / ⚠️ Needs E2E | **P0** | `@QA_ERP_Auditor` | Tahap 2 & 3 |
| **R-05** | Dual-Engine Parity (Cloud vs Local) | CRITICAL (16) | 90%+ / ✅ Covered (`cloudClientAdapter.test.js`) | Live `pg_proc` vs `localDbEngine` / ⚠️ Gap | Covered via E2E | **P1** | `@QA_ERP_Auditor` | Tahap 2 |
| **R-07** | Staff Payroll, Kasbon & Carwash Crew | CRITICAL (16) | 90%+ / ✅ Covered (`staffHelpers.test.js`) | `fn_get_active_carwash_crew` / ⚠️ Needs Live DB check | Carwash Kanban / ⚠️ Needs E2E | **P1** | `@QA_ERP_Auditor` | Tahap 2 & 3 |
| **R-08** | Multi-Tenant Onboarding & License Lockout | CRITICAL (15) | 90%+ / ✅ Covered (`licenseIntegration.test.js`) | Tenant isolation / ✅ Covered | Login & Lockout UI / ⚠️ Needs E2E | **P1** | `@QA_ERP_Auditor` | Tahap 3 |
| **R-06** | CRM Loyalty & Atomic Reward Redemption | HIGH (12) | 80%+ / ✅ Covered (`rbacPr4RewardRpc.test.js`) | `redeem_customer_reward` / ⚠️ Needs Live DB check | CRM page / Spot check | **P1** | `@QA_ERP_Auditor` | Tahap 2 |
| **R-09** | Executive Dashboard & Consolidation | MEDIUM (9) | 70%+ / ✅ Covered (`consolidationService.test.js`) | Happy path / ✅ Covered | Smoke check | **P2** | `@QA_ERP_Auditor` | Tahap 3 |
| **R-10** | Thermal Receipt & Bluetooth Printer | LOW (4) | Basic / ✅ Covered (`bluetoothPrinter.test.js`) | None required | Skip (Hardware bound) | **P3** | `@QA_ERP_Auditor` | Deferred |

### 6. Reassessment Triggers & Cadence
- **Post-Incident (within 48 hours):** Re-score affected modules, inspect Supabase Postgres logs, and update the Gap Analysis Worksheet.
- **Schema / Migration Change:** Every new file in `supabase/migrations/` triggers an immediate re-score of **R-03 (RBAC/RLS)** and **R-05 (Dual-Engine Parity)**.
- **Quarterly Cadence:** Re-run git code churn (`git log --since="3 months ago"`) every quarter and promote any module with ≥15 commits to Probability ≥ 4.
