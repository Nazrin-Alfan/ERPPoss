#!/usr/bin/env bash
# ==============================================================================
# PR-6 MASTER RELEASE GATE REGRESSION TEST RUNNER
# Full pipeline validation: PR-1 s.d. PR-6 across all SQL test harnesses
# ==============================================================================
set -euo pipefail

QA_DB_NAME="erpposs_qa_pr6_$(date +%s)"
PGUSER="${PGUSER:-postgres}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"

echo "=================================================================="
echo " Starting Master PR-6 Release Gate Verification on: ${QA_DB_NAME}"
echo "=================================================================="

cleanup() {
    echo "Tearing down disposable QA database: ${QA_DB_NAME}..."
    dropdb --if-exists -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" "${QA_DB_NAME}" 2>/dev/null || true
}
trap cleanup EXIT

# 1. Create disposable database
echo "[1/7] Creating disposable database..."
createdb -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" "${QA_DB_NAME}"

# 2. Apply Unified Cloud Schema & Base Fixtures
echo "[2/7] Applying access_control_fixture.sql..."
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/tests/access_control_fixture.sql > /dev/null

# 3. Apply Hardened Migrations in Order (012 -> 013 -> 014)
echo "[3/7] Applying hardened enterprise migrations..."
echo "  -> 012_pr2_profile_lockdown_and_privilege_containment.sql"
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/migrations/012_pr2_profile_lockdown_and_privilege_containment.sql > /dev/null

echo "  -> 013_pr3_granular_rls_and_branch_scoping.sql"
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/migrations/013_pr3_granular_rls_and_branch_scoping.sql > /dev/null

echo "  -> 014_pr4_harden_customer_reward_rpc.sql"
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/migrations/014_pr4_harden_customer_reward_rpc.sql > /dev/null

# 4. Execute PR-2 Lockdown Harness
echo "[4/7] Running PR-2 profile lockdown harness..."
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/tests/pr2_lockdown_harness.sql

# 5. Execute PR-3 Granular RLS & Branch Scoping Harness
echo "[5/7] Running PR-3 granular RLS & branch scoping harness..."
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/tests/pr3_granular_rls_harness.sql

# 6. Execute PR-4 Customer Reward RPC Hardening Harness
echo "[6/7] Running PR-4 customer reward RPC hardening harness..."
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/tests/pr4_reward_rpc_harness.sql

# 7. Execute Master PR-6 Release Gate Harness
echo "[7/7] Running Master PR-6 Release Gate harness (AC-01 s.d. AC-17)..."
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/tests/pr6_release_gate_harness.sql

echo "=================================================================="
echo " MASTER RELEASE GATE AUDIT: ALL 17 ACCEPTANCE CRITERIA PASSED"
echo " Zero-Defect Security & RBAC Hardening Confirmed for Production"
echo "=================================================================="
