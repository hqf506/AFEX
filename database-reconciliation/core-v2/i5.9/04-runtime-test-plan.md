# AFEX Core V2 — Package 4T Runtime Test Plan

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production execution: prohibited  
Core V2: disabled unless a separately approved isolated-test gate enables it

## Purpose

Validate the installed atomic runtime without changing Production and without
authorizing activation.

## Preconditions

- All package hashes are externally approved.
- Packages 1R, 2R, 2B, 2B-S, 3R, 4T, 5R-B, 6B, and required activation
  foundations passed isolated installation verification.
- The environment is disposable and independently confirmed not Production.
- Sanitized fixtures belong to one dedicated test tenant and branches.
- Baseline row counts and balances are captured.
- Cleanup or environment destruction is approved.
- No real customer, credential, phone, email, payment, or secret is used.

STOP if any precondition is false.

## Test matrix

1. Core V2 disabled: legacy route remains authoritative.
2. Atomic entry point unavailable to `PUBLIC`, `anon`, `authenticated`, and
   `service_role`.
3. Approved server issuer creates a bound authorization context.
4. Valid context, quote, idempotency key, customer, inventory, and payment
   produce one committed order/invoice pair.
5. Response references exactly the committed order and invoice.
6. Order and invoice numbers are equal and match tenant/branch/month.
7. Invoice and item snapshots match the accepted authoritative quote.
8. Stock mutation and movements match tracked quantities.
9. Audit and outbox evidence is complete.
10. Same key and fingerprint replay without duplicate persistence.
11. Same key with different fingerprint fails.
12. Expired, reused, wrong-actor, wrong-tenant, and wrong-branch contexts fail.
13. Stale or altered quote fails before inventory, numbering, or persistence.
14. Missing/insufficient stock fails atomically.
15. Injected failures at each stage leave no partial committed state.

## Evidence

For every case retain:

- case ID and UTC timestamps;
- package hashes and environment identity;
- sanitized request identity and correlation ID;
- HTTP/RPC status and structured error code;
- before/after counts and relevant immutable hashes;
- order, invoice, inventory, audit, outbox, and idempotency assertions;
- proof no unrelated tenant or branch changed.

## Success criteria

- Every expected-success case passes.
- Every expected-failure case fails with the reviewed error.
- No partial state exists after failure.
- Replay creates no duplicate.
- Financial, inventory, numbering, audit, and outbox evidence reconcile.
- No browser/runtime privilege bypass is possible.

## STOP conditions

- Environment identity uncertainty.
- Any Production endpoint or credential is observed.
- Unexpected write outside the fixture scope.
- Cross-tenant or cross-branch visibility.
- Partial commit, duplicate number, negative stock, or financial drift.
- Any test requires editing approved SQL or broadening permissions.

Completion of this plan does not authorize Production activation.

