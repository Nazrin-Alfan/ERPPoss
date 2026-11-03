# Checkout authorization and cash tender correction

This change is prepared on `fix/checkout-tenant-isolation`, based on `3828c2d`.
It is not a production deployment. Do not apply the disposable SQL fixtures to a
hosted database.

## Reproduced defects

Migration 012 replaced the checkout function with a `SECURITY DEFINER` body that
checked only that the supplied tenant was non-null. A user from QA tenant A could
create a completed sale in QA tenant D, changing D's receipt, inventory, cashflow
and journal. A replay also returned D's payment details to A. Table RLS alone does
not protect privileged function internals.

For a legitimate cash sale of 36,000 with 50,000 handed over, the request included
`uang_diterima: 50000`, but the stored receipt had only applied payment 36,000 and
change 14,000. The amount handed over was not persisted. The service also trusted
the supplied change instead of deriving it.

## Intended contract

- Authenticate from `auth.uid()` and authorize against an active database profile.
- Require tenant equality and an allowed checkout role; no platform-admin bypass.
- Validate the effective branch and the cashier's branch access before any receipt
  lookup, replay response or mutation.
- Preserve transaction atomicity and idempotency. An unauthorized call must leave
  receipts, stock, movements, cashflow and journal data unchanged.
- Persist cash handed over as `uang_diterima`; retain `nominal_bayar` and `bayar`
  as the payment applied to the sale. Calculate change on the server. For the
  reproduced sale the values are 50,000, 36,000 and 14,000 respectively; cashflow
  and revenue remain 36,000.
- Pass the persisted tender and change through receipt history and reprint.
- Revoke execution from `PUBLIC` and `anon`, and explicitly grant the intended
  authenticated entry point. Authorization inside the function remains required.

## Release procedure

1. Review the forward migration and diff against the base commit. Do not edit or
   rerun migration 012 as the fix.
2. Run the JavaScript suite, production build and disposable PostgreSQL checks
   described in `supabase/tests/README.md`.
3. Apply the forward migration to a staging copy with the actual deployed schema,
   grants, RLS and ledger triggers. Exercise fresh signup, checkout, replay,
   insufficient stock rollback, branch access and nonzero inventory costs.
4. Deploy the matching frontend to staging. Sell for 36,000 with cash 50,000,
   reload/login again, and reprint the persisted receipt: change must be 14,000.
5. Deploy to production only through the project's separate release process.
   Until then, the currently deployed application still has the audited defects.

The forward migration is
`supabase/migrations/20261103003944_checkout_tenant_authorization_and_cash_tender.sql`.
Apply it before the matching frontend: the history query selects the new column.

## Verification on this branch

- `npm test -- --reporter=dot`: 62 files, 369 tests passed.
- `npm run build`: passed.
- `npm run lint`: exit code 0; the repository still reports warnings.
- Disposable PostgreSQL 16: migration 012 reproduced the cross-tenant failure;
  the forward migration passed authorization, ACL, replay, branch stock selection,
  payment, positive-cost HPP and rollback assertions. Thirteen denied scenarios
  compared persisted data before and after and found no mutations.
- Independent backend review approved the scoped correction. Receipt history
  transformation tests cover persisted tender/change and historical NULL fallback.
  No browser test against a deployed copy of this branch has been performed.

## Boundaries

The isolated SQL harness runs the real checkout body against a minimal fixture.
It establishes function behavior, not complete Supabase Auth/PostgREST, migration
chain, RLS, browser or production compatibility. Positive-cost journal checks
prove the exercised cost scenario, not every inventory valuation method.

The existing direct-update pending-bill settlement flow and other privileged
RPCs require separate review. This patch must not be described as certification
of all payment paths or of the whole application. Historical receipts without
stored tender cannot have their original cash amount reconstructed reliably.

Historical receipts with a NULL branch fail the new replay branch check because
their original branch cannot be established safely. Do not automatically backfill
or retry them under a new receipt ID: reconcile the original transaction first.
The existing catalog fallback for unknown item names, mixed-payment accounting,
and cancellation/reversal behavior have not been certified by this patch.
