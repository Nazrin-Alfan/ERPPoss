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
  echo 'Usage: bash scripts/test_checkout_isolation.sh supabase/migrations/<checkout-fix>.sql' >&2
  exit 1
fi
migration_file="$1"
qa_database="erpposs_qa_checkout_${RANDOM}_$$"
qa_tmp="$(mktemp -d)"
cleanup() {
 docker exec "$container_name" dropdb -U postgres --if-exists "$qa_database" >/dev/null
 rm -rf -- "$qa_tmp"
}
trap cleanup EXIT
psql_qa() { docker exec -i "$container_name" psql -U postgres -d "$qa_database" -v ON_ERROR_STOP=1; }
docker exec "$container_name" createdb -U postgres "$qa_database"
psql_qa < "$repo_dir/supabase/tests/checkout_fixture.sql" >/dev/null
python3 - "$repo_dir" "$qa_tmp/baseline.sql" <<'PY'
import sys
from pathlib import Path
source=(Path(sys.argv[1])/'supabase/migrations/012_reconcile_registration_and_checkout_pipeline.sql').read_text()
# Execute the actual historical checkout body without unrelated registration DDL.
Path(sys.argv[2]).write_text(source[source.index('CREATE OR REPLACE FUNCTION public.fn_execute_checkout('):])
PY
psql_qa < "$qa_tmp/baseline.sql" >/dev/null
if psql_qa < "$repo_dir/supabase/tests/checkout_isolation.sql" > "$qa_tmp/red.log" 2>&1; then
 echo 'ERROR: vulnerable migration012 unexpectedly passed regression test' >&2
 exit 1
fi
if ! rg -q 'cross-tenant write unexpectedly succeeded' "$qa_tmp/red.log"; then
 cat "$qa_tmp/red.log" >&2
 exit 1
fi
echo 'RED confirmed: migration012 permits cross-tenant checkout'
psql_qa < "$migration_file" >/dev/null
psql_qa < "$repo_dir/supabase/tests/checkout_isolation.sql"
echo 'GREEN: checkout authorization, payment, replay, rollback, stock and HPP checks passed'
