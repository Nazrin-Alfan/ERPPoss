#!/usr/bin/env bash
# PR-2 Lockdown Harness Runner
# Urutan: Pastikan DB → Fixture (jika belum) → Migration 012 → Harness
# TIDAK menyentuh produksi. DB disposable: erpposs_qa_pr2
set -euo pipefail

CONTAINER="erpposs-checkout-qa"
DB="erpposs_qa_pr2"

echo "=== PR-2 Profile Lockdown & Privilege Containment Test Harness ==="
echo "Container : $CONTAINER"
echo "Database  : $DB (disposable)"
echo ""

# 1. Pastikan DB ada; buat + extensions jika belum
docker exec "$CONTAINER" psql -U postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1 || {
    echo "[SETUP] Creating database $DB..."
    docker exec "$CONTAINER" psql -U postgres -c "CREATE DATABASE $DB;"
    docker exec "$CONTAINER" psql -U postgres -d "$DB" -c \
      "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";"
}

# 2. Load fixture hanya jika tabel profiles belum ada
FIXTURE_LOADED=$(docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc \
  "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='profiles'")

if [ "$FIXTURE_LOADED" = "0" ]; then
  echo "[SETUP] Loading fixture..."
  docker cp supabase/tests/access_control_fixture.sql "$CONTAINER:/tmp/access_control_fixture.sql"
  docker exec "$CONTAINER" psql -U postgres -d "$DB" --no-psqlrc --set=ON_ERROR_STOP=1 \
    -f /tmp/access_control_fixture.sql > /dev/null
  echo "[SETUP] Fixture loaded."
else
  echo "[SETUP] Fixture already present (skipping reload)."
fi

# 3. Apply migration 20261107000001 (CREATE OR REPLACE = idempotent)
echo "[SETUP] Applying migration 20261107000001..."
docker cp supabase/migrations/20261107000001_pr2_profile_lockdown_and_privilege_containment.sql \
  "$CONTAINER:/tmp/012_migration.sql"
docker exec "$CONTAINER" psql -U postgres -d "$DB" --no-psqlrc --set=ON_ERROR_STOP=1 \
  -f /tmp/012_migration.sql 2>&1 | grep -v "^$" | sed 's/^/  [MIG] /'

# 4. Run harness (ON_ERROR_STOP=0 agar seluruh kasus dieksekusi)
echo ""
echo "[RUN] PR-2 Test Harness..."
docker cp supabase/tests/pr2_lockdown_harness.sql "$CONTAINER:/tmp/pr2_lockdown_harness.sql"
docker exec "$CONTAINER" psql -U postgres -d "$DB" --no-psqlrc --set=ON_ERROR_STOP=0 \
  -f /tmp/pr2_lockdown_harness.sql 2>&1 | tee /tmp/pr2_harness_output.txt

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "=== RINGKASAN ==="
grep -E "PR2-(PASS|FAIL)|verdict|passed_count|failed_count|ALL PR2" \
  /tmp/pr2_harness_output.txt 2>/dev/null || true

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "EXIT 0 — Harness selesai. Lihat verdict di atas."
else
  echo "EXIT $EXIT_CODE — Harness error. Lihat output di atas."
fi
exit "$EXIT_CODE"
