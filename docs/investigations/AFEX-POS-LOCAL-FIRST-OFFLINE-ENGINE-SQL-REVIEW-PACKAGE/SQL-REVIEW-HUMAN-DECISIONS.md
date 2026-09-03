# SQL Review Human Decisions — Scope Integrity Correction

## Preserved approved decisions

1. Mode: `MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`.
2. Authority expiry: `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`.
3. Connectivity: `OPPORTUNISTIC_NOT_MANDATORY`; last synchronization age never blocks operation.
4. Core V2 remains the sole future order/invoice mutation engine.
5. Direct authenticated business writes, profile access and inventory base/view access remain zero.
6. Dedicated Review Container remains selected, but its DDL and writer are blocked.
7. Payment methods remain distinct: `mada`, `cash`, `visa`, `cod`, `card`, `bank_transfer`, `transfer`, `on_delivery`.
8. Effect identity remains `(serverCommandId,effectType,effectVersion)`, but no ledger/dispatcher is emitted.
9. One active device and the 25-package cap remain requirements, not executable claims.
10. Persistent unwrap, effect dispatch/replay, pilot, Prompt 9 and Phase 5 remain disabled or blocked.

## Human-review corrections accepted in this package

- Independent tenant and branch foreign keys are rejected as insufficient.
- Employee authority dependents require a complete immutable composite key.
- Core command dependents require command plus trusted scope closure.
- Snapshot items require header plus tenant/branch closure.
- Review arithmetic constraints do not replace serialized compare-and-set.
- Employee payment paths must force `employee_attested` plus `unverified`; provider paths are separate.
- Effect replay safety is not claimed without complete writers/state invariants.
- Existing AFEX `rolinherit` is not asserted without exact evidence.
- Existing `public` schema CREATE privileges are not changed before caller compatibility.

## Current answers

- Any SQL authorized: **NO**.
- Wave 1 authorized: **NO**.
- Production write: **NO**.
- Prompt 9: **NOT STARTED; requires later human authorization**.
- Phase 5: **NOT AUTHORIZED / BLOCKED**.
