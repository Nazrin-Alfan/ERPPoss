#!/usr/bin/env bash
# Execute only in a disposable local PostgreSQL container (never a hosted database).
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "$0")/.." && pwd)"
container_name="${CHECKOUT_QA_CONTAINER:-erpposs-checkout-qa}"
if [[ ! "$container_name" =~ ^erpposs[-_]checkout[-_]qa ]]; then
  echo 'Use a dedicated erpposs-checkout-qa container' >&2
  exit 1
fi
if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo 'Usage: bash scripts/test_pending_settlement_isolation.sh supabase/migrations/<settlement-fix>.sql' >&2
  exit 1
fi
migration_file="$1"
qa_database="erpposs_qa_settle_${RANDOM}_$$"
qa_tmp="$(mktemp -d)"
cleanup() {
 docker exec "$container_name" dropdb -U postgres --if-exists "$qa_database" >/dev/null || true
 rm -rf -- "$qa_tmp"
}
trap cleanup EXIT
psql_qa() { docker exec -i "$container_name" psql -U postgres -d "$qa_database" -v ON_ERROR_STOP=1; }
docker exec "$container_name" createdb -U postgres "$qa_database"
psql_qa < "$repo_dir/supabase/tests/checkout_fixture.sql" >/dev/null

# Apply the checkout authorization migration so fn_execute_checkout is current
psql_qa < "$repo_dir/supabase/migrations/20261103003944_checkout_tenant_authorization_and_cash_tender.sql" >/dev/null

# Apply forward settlement migration
psql_qa < "$migration_file" >/dev/null

# Run the pending settlement isolation test suite
psql_qa < "$repo_dir/supabase/tests/pending_settlement_isolation.sql"
echo 'GREEN: pending settlement authorization, atomicity, idempotency replay, stock invariant and ledger checks passed'
