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
