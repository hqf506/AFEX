# Phase 4 Performance and Lock Assessment

## Design budgets

These are review targets, not measured Production claims.

| Operation | Target | Query/round-trip shape |
| --- | ---: | --- |
| Device/PIN authority issuance or trusted-reconnect revalidation | p95 ≤ 500 ms | One server call; single authority query/function plus device row lock only during activation/replacement |
| Key-envelope retrieval | p95 ≤ 250 ms | One bounded namespace batch after authority validation |
| Online enrollment bootstrap | p95 ≤ 1.5 s excluding payload transfer | At most three server calls: context/authority, envelopes, versioned projections; Offline restart has zero required server calls |
| Command acquisition | p95 ≤ 350 ms before business execution | One function/transaction, indexed idempotency lookup, no per-field queries |
| Existing receipt lookup | p95 ≤ 200 ms | One indexed lookup or bounded batch |
| Inventory validation | Included in execution; p95 ≤ 300 ms for pilot basket | Set-based branch/item lock/query in deterministic item order |
| Effect-ledger insertion | Included in transaction; ≤ one set-based insert | Unique semantic effect keys |
| Sync receipt batch | 25 commands initial, hard cap 50 | One authority validation plus set/batched acquisition/lookup where safe |

## Hot indexes

- Partial unique active-device index on `(tenant_id, branch_id)`.
- Device lookup by public ID/status/generation.
- Active authority lookup by device/actor/generation/status and package ID primary key; no age-based authority index.
- Existing Core unique idempotency index on tenant/branch/type/key hash.
- Offline binding unique indexes on `(device_id, local_command_id)` and `(device_id, authority_generation, local_sequence)`.
- Receipt lookup by local command and server command.
- Inventory stock unique tenant/branch/item plus snapshot/frontier indexes.
- Effect ledger unique command/effect/version and pending claim index.

## Locking

Device activation/replacement serializes on one branch authority record or the partial uniqueness conflict. Trusted-reconnect revalidation must not hold a branch-wide lock longer than the validating statement.

Order execution locks stock rows in a deterministic item-ID order to reduce deadlocks. It must not hold device-registration or authority-issuance locks while performing numbering, customer, invoice, or external provider work. External effects occur after commit.

Idempotency acquisition uses the unique index and short transaction boundaries. A losing concurrent insert returns/reloads the existing command; it does not create a parallel execution claim.

## N+1 avoidance

A sync batch may validate a common primary account, tenant, branch, device and authority context once, then check each immutable command against that bound context inside one reviewed server operation. Catalog, customer, receipt, and inventory queries should be set-based for all command/item IDs. Validation reuse never skips per-command actor/sequence/hash/dependency checks.

## Contention risks

- A branch-wide device activation row is cold except enrollment/reset.
- Numbering and inventory are hot during order commit and require short deterministic locking.
- Effect claims are decoupled after business commit.
- Snapshot generation must use a consistent database snapshot without locking the branch stock table for the full client download.
- Large offline backlogs must use bounded batches, backoff, receipt-first retries, and stop on dependency conflict.

## Required measurements before pilot

Read-only Production cardinalities/index definitions, execution plans on a safe representative environment, lock-wait/deadlock tests, p50/p95/p99 timings, retry contention, 1/25/50-command batch tests, and effect-claim failure injection. No such runtime measurement was performed in Phase 4.

Worker claim TTLs, retry backoff and inactivity timers are operational concurrency/safety controls only. They must never be reused as Offline employee, read or command authority lifetime. Synchronization UI exposes exact last-sync date/time and age, snapshot marker, inventory frontier, and pending/syncing/synced/failed/conflict/blocked counts without making age a blocking predicate.
