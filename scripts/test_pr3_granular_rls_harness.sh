#!/usr/bin/env bash
# PR-3 Granular RLS & Branch Scoping Test Harness Runner
# Disposable Database Target: erpposs_qa_pr3
# Order of operations:
# 1. Ensure DB exists (erpposs_qa_pr3)
# 2. Load access_control_fixture.sql
# 3. Apply migration 012 (Profile lockdown)
# 4. Apply migration 013 (Granular RLS & Branch Scoping)
# 5. Run test harness pr3_granular_rls_harness.sql
set -euo pipefail

CONTAINER="erpposs-checkout-qa"
DB="erpposs_qa_pr3"

echo "=== PR-3 Granular RLS & Branch Scoping Test Harness ==="
echo "Container : $CONTAINER"
echo "Database  : $DB (disposable)"
echo ""

# 1. Pastikan DB ada
docker exec "$CONTAINER" psql -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || {
    echo "[SETUP] Creating disposable database $DB..."
    docker exec "$CONTAINER" psql -U postgres -c "CREATE DATABASE $DB;"
    docker exec "$CONTAINER" psql -U postgres -d "$DB" -c \
      "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";"
}

# 2. Load fixture jika belum ada
FIXTURE_LOADED=$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='profiles'")

if [ "$FIXTURE_LOADED" = "0" ]; then
  echo "[SETUP] Loading baseline fixture..."
  docker cp supabase/tests/access_control_fixture.sql "$CONTAINER:/tmp/access_control_fixture.sql"
  docker exec "$CONTAINER" psql -U postgres -d "$DB" --no-psqlrc --set=ON_ERROR_STOP=1 \
    -f /tmp/access_control_fixture.sql > /dev/null
  echo "[SETUP] Fixture loaded."
fi

# 3. Apply migration 20261107000001
echo "[SETUP] Applying migration 20261107000001 (PR-2 Profile Lockdown)..."
docker cp supabase/migrations/20261107000001_pr2_profile_lockdown_and_privilege_containment.sql \
  "$CONTAINER:/tmp/012_migration.sql"
docker exec "$CONTAINER" psql -U postgres -d "$DB" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -f /tmp/012_migration.sql 2>&1 | grep -v "^$" | sed 's/^/  [MIG 20261107000001] /'

# 4. Apply migration 20261107000002
echo "[SETUP] Applying migration 20261107000002 (PR-3 Granular RLS & Branch Scoping)..."
docker cp supabase/migrations/20261107000002_pr3_granular_rls_and_branch_scoping.sql \
  "$CONTAINER:/tmp/013_migration.sql"
docker exec "$CONTAINER" psql -U postgres -d "$DB" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -f /tmp/013_migration.sql 2>&1 | grep -v "^$" | sed 's/^/  [MIG 20261107000002] /'

# 5. Run harness
echo ""
echo "[RUN] PR-3 Test Harness..."
docker cp supabase/tests/pr3_granular_rls_harness.sql "$CONTAINER:/tmp/pr3_granular_rls_harness.sql"
docker exec "$CONTAINER" psql -U postgres -d "$DB" --no-psqlrc --set=ON_ERROR_STOP=0 \
  -f /tmp/pr3_granular_rls_harness.sql 2>&1 | tee /tmp/pr3_harness_output.txt

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "=== RINGKASAN VERIFIKASI PR-3 ==="
grep -E "PR3-(PASS|FAIL)|passed_count|failed_count" /tmp/pr3_harness_output.txt 2>/dev/null || true

exit $EXIT_CODE
