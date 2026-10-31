# Owner provisioning PostgreSQL regression checks

`owner_auth_provisioning.sql` runs the real `001` and `003` migration SQL on an **empty disposable PostgreSQL database** whose name starts with `erpposs_qa_`. Never point this harness at an existing Supabase/production database: it creates an Auth schema stub and test role. It is not a hosted Supabase Auth/OAuth HTTP integration test.

With PostgreSQL 16 and `psql` available:

```sh
createdb erpposs_qa_owner
psql -v ON_ERROR_STOP=1 -d erpposs_qa_owner -f supabase/tests/owner_auth_provisioning.sql
# After inspecting results:
dropdb erpposs_qa_owner
```

For a local isolated PostgreSQL container (no published port), copy `supabase/` into it, create an empty `erpposs_qa_*` database, and invoke `psql -U postgres -d <database> -f <copied-supabase>/tests/owner_auth_provisioning.sql` with `docker exec`. Follow the cloud runtime's local Docker socket, proxy and TLS configuration. No network request is needed inside the container for these tests.

Success ends with `ALL OWNER AUTH SQL CHECKS PASSED`. Checks cover repeated migration application, atomic tenant/branch/profile creation, untrusted role/tenant metadata, early and late signup failure rollback, Google-owner provisioning, server-controlled staff invitations, rejected cross-tenant branch invitations, and authenticated RLS with forged metadata. The test data is synthetic; mutations are rolled back, but schema setup remains until the disposable database is removed.
