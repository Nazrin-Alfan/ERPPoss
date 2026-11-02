import os
import psycopg2
from pathlib import Path

env_file = Path.home() / ".hermes" / ".env"
db_url = None
if env_file.exists():
    for line in env_file.read_text().splitlines():
        if line.startswith("SUPABASE_DATABASE_URL="):
            db_url = line.split("=", 1)[1].strip()

if not db_url:
    print("Database URL not found in ~/.hermes/.env")
    exit(1)

migration_file = Path("supabase/migrations/011_reconcile_live_audit_fixes.sql")
sql = migration_file.read_text(encoding="utf-8")

conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

print("Applying migration 011_reconcile_live_audit_fixes.sql...")
cur.execute(sql)
print("Migration 011 applied successfully!")

# Verify trigger and functions
cur.execute("SELECT proname FROM pg_proc WHERE proname IN ('fn_apply_barang_masuk_to_stock', 'fn_sync_barang_masuk', 'fn_execute_checkout', 'fn_initialize_tenant_defaults', 'fn_sync_stok_barang_advanced');")
rows = cur.fetchall()
print("Updated database routines:", [r[0] for r in rows])

# Check Tenant A license status
cur.execute("SELECT license_key, plan, status FROM public.tenant_licenses WHERE tenant_id = '44ad5f1e-c777-4a76-8b51-251201dacdf8';")
licenses = cur.fetchall()
print("Tenant A Licenses:", licenses)

conn.close()
