# AFEX Core V2 — Package 4T Concurrency Test Plan

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production execution: prohibited

## Objective

Prove deterministic locking, bounded conflicts, atomic rollback, and absence of
duplicate financial, numbering, customer, inventory, audit, and outbox state.

## Required harness

- Two or more independent database sessions.
- A barrier that releases requests simultaneously.
- Sanitized isolated tenant/branch fixtures.
- Per-session correlation IDs and idempotency keys.
- Server-side timing and SQLSTATE capture.
- Read-only reconciliation after every scenario.

## Lock order under test

1. Authorization-context row.
2. Idempotency-command identity row.
3. Customer identity row.
4. Financial quote row.
5. Catalog, branch-price, discount, and VAT rows.
6. Inventory rows ordered by catalog item and row ID.
7. Tenant/branch/month number row.
8. Persistence, movement, stock, audit, outbox, and idempotency completion.

## Scenarios

1. Same key and same fingerprint, two sessions.
2. Same key and different fingerprint.
3. Different keys resolving the same normalized customer identity.
4. Different keys consuming the same authorization context.
5. Different keys consuming the same quote.
6. Different orders competing for sufficient shared stock.
7. Different orders competing for the last stock unit.
8. Different orders allocating the same branch/month sequence.
9. Multi-item carts with reversed client item order.
10. Failure after inventory lock but before mutation.
11. Failure after numbering but before order persistence.
12. Failure after persistence but before idempotency commit.

## Assertions

- No deadlock occurs under the reviewed lock order.
- At most one transaction consumes a single-use context or quote.
- One idempotency identity exists for one scoped key.
- Same-fingerprint retry resolves to one committed response.
- Conflicting fingerprint never replays.
- Customer canonical identity remains unique per tenant.
- Stock never becomes negative.
- Movement totals equal stock deltas.
- Order/invoice numbering has no duplicate.
- Failed transactions consume no durable number and leave no partial rows.
- Audit and outbox events occur exactly once for a committed command.

## Performance evidence

Record wait duration, transaction duration, SQLSTATE, retry outcome, row counts,
and lock-wait diagnostics without storing secrets or customer PII.

## STOP conditions

- Deadlock.
- Unbounded wait.
- Cross-tenant/branch interaction.
- Duplicate identity, number, movement, audit, or outbox event.
- Partial commit.
- Any need to weaken isolation or runtime permissions.

