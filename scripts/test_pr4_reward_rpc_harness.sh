#!/usr/bin/env bash
# ==============================================================================
# PR-4 REWARD RPC HARDENING REGRESSION TEST RUNNER
# Sourced from: AGENTS.md Zero-Defect QA Guidelines
# ==============================================================================
set -euo pipefail

QA_DB_NAME="erpposs_qa_pr4_$(date +%s)"
PGUSER="${PGUSER:-postgres}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"

echo "=================================================================="
echo " Starting PR-4 Reward RPC Hardening Harness on: ${QA_DB_NAME}"
echo "=================================================================="

# Cleanup handler on exit
cleanup() {
    echo "Tearing down disposable QA database: ${QA_DB_NAME}..."
    dropdb --if-exists -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" "${QA_DB_NAME}" 2>/dev/null || true
}
trap cleanup EXIT

# 1. Create disposable database
createdb -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" "${QA_DB_NAME}"

# 2. Apply Unified Cloud Schema & Base Fixtures
echo "Applying base schema and fixtures..."
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/tests/access_control_fixture.sql > /dev/null

# 3. Apply Migrations (000001 -> 000002 -> 000003)
echo "Applying migrations in dependency order..."
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/migrations/20261107000001_pr2_profile_lockdown_and_privilege_containment.sql > /dev/null
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/migrations/20261107000002_pr3_granular_rls_and_branch_scoping.sql > /dev/null
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/migrations/20261107000003_pr4_harden_customer_reward_rpc.sql > /dev/null

# 4. Execute PR-4 Test Harness
echo "Running PR-4 test harness..."
psql -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${QA_DB_NAME}" -f supabase/tests/pr4_reward_rpc_harness.sql

echo "=================================================================="
echo " PR-4 REWARD RPC HARDENING VERIFICATION: ALL PASSED"
echo "=================================================================="
