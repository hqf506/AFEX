# Security Authority Performance Assessment

## Captured state

No query plans or load tests were executed. The approved bounded Production snapshot found no locks on targeted relations. Relevant relation statistics were: `orders` 284/14 estimated live/dead rows, `invoices` 284/8, `invoice_items` 406/18, `inventory_stock` 5/14, `atomic_order_commands` 12/24, `actor_sessions` 133/29, and `auth_session_locks` 119/18.

## Policy and function cost

- The advisor reported 23 RLS init-plan findings and 45 multiple-permissive-policy findings. Repeated `auth.*`/profile helper evaluation and permissive OR composition are both a security and query-cost problem.
- Broad raw grants increase the number of reachable paths that must be planned and audited.
- `actor_sessions` and `auth_session_locks` are frequently checked/serialized; their partial indexes are important and the owner-function boundary should be preserved.
- Core command, payload, claim, link, and receipt lookups are bounded by unique identities.

## Lock order and replay

Core locks command, authorization context, catalog rows in deterministic ID order, inventory rows in deterministic item order, and numbering state. This order is reusable for Offline acquisition. A large backlog must still be processed in bounded receipt-first batches with backoff; parallel replay of the same branch/item set can contend on inventory and numbering.

Legacy cancellation/manual adjustment may acquire invoice, inventory, and movement locks in a different order. Production cancellation drift means parity cannot be assumed. No Offline cancellation or adjustment command should be introduced before this path is reconciled.

## Read and review surfaces

`invoices` showed 505,413 sequential scans versus 1,673 index scans in the bounded snapshot, disproportionate to its size. Any review queue, receipt recovery, or sync-status UI must use bounded tenant/branch/state/time keys and measured query plans. A new review/effect table will need unique command/effect identity plus tenant/branch/state/created-time access, but this investigation does not propose indexes or SQL.

## Operational conclusion

Security closure should reduce duplicated policy evaluation rather than add more overlapping policies. Performance acceptance requires isolated plans and concurrency tests after authority design, then Preview/pilot monitoring of lock waits, deadlocks, latency, duplicate claims, and queue depth. Current statistics do not authorize Phase 5.
