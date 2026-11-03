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

## Checkout isolation and payment regression

Run a disposable PostgreSQL 16 container named `erpposs-checkout-qa` with networking
 disabled, then execute from the repository root:

```sh
bash scripts/test_checkout_isolation.sh \
  supabase/migrations/20261103003944_checkout_tenant_authorization_and_cash_tender.sql
npm test -- --run src/services/__tests__/checkoutPaymentRegression.test.js
```

The SQL runner creates a temporary `erpposs_qa_*` database, loads the minimal
`checkout_fixture.sql` schema and the **real historical migration 012 checkout
function**, and requires its cross-tenant test to fail. It then applies the forward
migration and runs the same regression suite. The temporary database is dropped on
exit. No hosted credentials, customer data or deployed Supabase project are used.
The fixture refuses database names outside `erpposs_qa_*`.

Assertions cover authenticated cross-tenant writes and replays, missing identity
and profile, inactive profiles and branches, role and branch restrictions, anonymous
and PUBLIC execute privileges, authorized owner/cashier/admin checkouts, cash tender
Rp50,000 versus applied payment Rp36,000 and server-calculated change Rp14,000,
idempotent replay, insufficient-stock rollback with unchanged persisted data,
branch-local stock preference, a nonzero Rp2,000 HPP and equal Rp38,000 debit/credit.

**Limits:** this is an isolated function-level integration test using PostgreSQL's
actual PL/pgSQL runtime and a schema subset. It does not validate the complete
historical migration chain, hosted Auth/JWT verification, deployed table RLS,
production schema drift, browser behavior, network concurrency or license policy.
Those require a separate staging deployment and broader release tests. Auth helpers
here emulate the identity supplied by Supabase after JWT verification; they do not
verify JWTs themselves.
