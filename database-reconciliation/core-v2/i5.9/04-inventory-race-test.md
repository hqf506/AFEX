# AFEX Core V2 — Package 4T Inventory Race Test

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production execution: prohibited

## Objective

Prove deterministic inventory locking, correct deductions and movements, and
atomic failure when concurrent demand exceeds stock.

## Fixture

- One isolated tenant and branch.
- One tracked product with known stock and record version.
- One untracked product and one service.
- Two independent authorized sessions.
- Fresh contexts, quotes, keys, and correlation IDs.

## Cases

1. Two orders whose combined tracked quantity is below available stock.
2. Two simultaneous orders competing for the final unit.
3. Two multi-item orders submitting catalog items in opposite client order.
4. Missing stock row for a tracked product.
5. Ambiguous duplicate stock identity fixture, if safely isolated.
6. Stale inventory record version.
7. Untracked product and service in the same cart.
8. Injected failure after movement preparation and before stock update.
9. Injected failure after stock update and before transaction completion.
10. Replay of the winning committed command.

## Assertions

- Locks are acquired by catalog item and stock row ID.
- No deadlock occurs.
- Stock never becomes negative.
- Exactly one contender wins the final-unit race.
- Loser receives the reviewed stock/conflict error.
- Each committed tracked line has one matching movement.
- Movement before/after quantities equal the stock change.
- Inventory record version changes exactly as designed.
- Untracked products and services create no stock mutation.
- Failed transactions leave neither movement nor stock delta.
- Replay creates no second movement or deduction.
- No other tenant or branch stock changes.

## Evidence

Capture sanitized fixture IDs, initial/final quantities, versions, movements,
transaction results, SQLSTATEs, wait durations, and correlation IDs.

## STOP conditions

- Negative stock.
- Duplicate or missing movement.
- Partial mutation after failure.
- Cross-scope mutation.
- Deadlock or unbounded wait.
- A test requires Production data or permission broadening.

