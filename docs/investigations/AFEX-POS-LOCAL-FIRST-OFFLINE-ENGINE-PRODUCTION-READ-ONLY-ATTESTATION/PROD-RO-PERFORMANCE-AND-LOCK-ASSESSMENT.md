# Performance and Lock Assessment

## Snapshot

No locks on the targeted relations were present in the bounded snapshot. No load test or query plan execution was performed.

| Relation | Estimated live/dead | Total bytes | Seq/index scans | Finding |
| --- | ---: | ---: | ---: | --- |
| `orders` | 284/14 | 262144 | 709/8377 | current indexes actively used |
| `invoices` | 284/8 | 229376 | 505413/1673 | disproportionate sequential scans; likely hot read/query shape |
| `invoice_items` | 406/18 | 163840 | 484/102 | small now; join/index review needed before scale |
| `inventory_stock` | 5/14 | 81920 | 11/2899 | row-lock hot point by branch/item |
| `atomic_order_commands` | 12/24 | 245760 | 138/198 | small, bounded unique lookups available |
| `actor_sessions` | 133/29 | 221184 | 33814/10109 | frequent authority checks; partial indexes exist |
| `auth_session_locks` | 119/18 | 65536 | 32519/1555 | frequent serialized session operations |

## Lock order

Core V2 locks command, authorization context, catalog rows in sorted identity order, inventory rows in sorted item order, and then official numbering state. Invoice-item inventory triggers run within the same transaction. Exact duplicates serialize at the command key and claim.

Potential cross-path deadlocks remain where legacy cancellation or manual inventory paths acquire invoice, inventory, and movement locks in a different order. The repository cancellation function uses a tenant/invoice advisory lock, but Production is drifted and must be reconciled before relying on parity.

## Index assessment

Unique indexes exist for command idempotency scope, payload identity, one active claim, business order/invoice links, branch/month numbering, invoice/order numbers, actor-session token, and active authenticated session. Server receipt lookup by command id and business links is bounded.

The advisor returned 140 findings: 70 warnings and 70 informational. Categories were 34 unindexed foreign keys, 23 RLS init-plan findings, 35 unused indexes, 45 multiple-permissive-policy findings, 2 duplicate indexes, and 1 Auth connection-allocation notice. These are advisory signals, not automatic drop/create instructions.

A future review queue requires indexes by tenant/branch/state/created time, immutable local command identity, result references, and unresolved priority. No such queue exists today.

## Conclusion

Current Core idempotency and receipt lookups can remain bounded. The invoice read hot path, duplicated/permissive RLS evaluation, legacy inventory lock ordering, and missing review/effect indexes must be addressed before broad Offline rollout.
