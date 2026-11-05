#!/usr/bin/env bash
# ==============================================================================
# Runner for Access Control & RBAC Regression Test Harness (PR-1)
# Executes on a disposable PostgreSQL database inside erpposs-checkout-qa.
# NEVER run on production or hosted databases.
# ==============================================================================
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "$0")/.." && pwd)"
container_name="${CHECKOUT_QA_CONTAINER:-erpposs-checkout-qa}"

if [[ ! "$container_name" =~ ^erpposs[-_]checkout[-_]qa ]]; then
  echo 'Error: Use a dedicated erpposs-checkout-qa container' >&2
  exit 1
fi

qa_database="erpposs_qa_rbac_${RANDOM}_$$"

cleanup() {
  docker exec "$container_name" dropdb -U postgres --if-exists "$qa_database" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "--> Initializing disposable test database: $qa_database..."
docker exec "$container_name" createdb -U postgres "$qa_database"

psql_qa() {
  docker exec -i "$container_name" psql -U postgres -d "$qa_database" -v ON_ERROR_STOP=1 "$@"
}

echo "--> Seeding access control fixtures for 35 objects (Tenants A & D)..."
psql_qa < "$repo_dir/supabase/tests/access_control_fixture.sql" >/dev/null

echo "--> Executing Access Control & RBAC Harness..."
psql_qa < "$repo_dir/supabase/tests/access_control_harness.sql"

echo "--> Access control regression harness completed cleanly."
