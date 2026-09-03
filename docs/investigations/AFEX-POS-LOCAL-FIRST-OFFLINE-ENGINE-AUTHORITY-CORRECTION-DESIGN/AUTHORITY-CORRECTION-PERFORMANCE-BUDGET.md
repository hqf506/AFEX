# Authority Correction Performance Budget

## Principles

Authorization is never removed for speed. Each request resolves one trusted authority context and reuses it through acquisition/execution. Predicates use indexed immutable IDs; policy helpers are statement-stable and avoid N+1 profile lookups. Receipt lookup precedes replay, batches are bounded, and all locks use deterministic order.

## Design budgets

| Boundary | Query/lock design | Review budget before pilot | Required evidence |
| --- | --- | --- | --- |
| Retained direct catalog/branch/VAT reads | one subject→tenant/branch resolution plus indexed scan | authority overhead p95 ≤ 15 ms and no full-table scan | plans at representative cardinality |
| Shared profile presentation route | one verified Auth/session context, one indexed full-profile lookup through the exact server-only database gateway reused for authorization, and one exact serializer; no user-bound authenticated database lookup and no per-page profile lookup | p95 ≤ 100 ms and exactly one authority lookup per request/context | database-caller identity, call-count trace, response-field allowlist, direct Data API denial |
| Inventory-movement history route | trusted tenant/branch predicate, deterministic time/index scan, default 10 and max 50 rows, default 30-day and max 366-day UTC window | p95 ≤ 250 ms/page and no full-table scan | cross-scope tests, route timing, page/window limit and plans |
| Customer phone lookup | one normalized tenant identity lookup | p95 ≤ 100 ms server-side; bounded result | duplicate/collision/load test |
| Customer create | one trusted route transaction and unique identity check | p95 ≤ 300 ms excluding client network | concurrent duplicate test |
| Device reconnect | one device and employee-generation join-set | p95 ≤ 100 ms | revoked/replaced/generation load |
| Device activation/replacement | branch-scoped serialization | p95 ≤ 1 s; no dual-active result | concurrent activation drill |
| Core acquisition | one authority join-set, command uniqueness and fingerprint | added database p95 ≤ 40 ms, p99 ≤ 100 ms | cold/hot and duplicate benchmark |
| Receipt batch lookup | set-based, max 100 command identities per request | p95 ≤ 200 ms | mixed authorized/denied batch |
| Inventory snapshot | consistent branch page, max 500 items/page | p95 ≤ 500 ms/page | frontier consistency/load |
| Core execution | deterministic item locks and one business transaction | no >20% p95 regression from qualified Online Core baseline | order sizes 1/10/50, contention |
| Review queue | no join on normal-success hot path | p95 ≤ 250 ms/page of 50 | tenant/branch/status queue load |
| Effect claim | indexed state/next-attempt, max 100 intents | p95 ≤ 200 ms/claim batch | two-worker contention/backlog |
| Cancellation | original command/order plus ordered item locks | p95 ≤ 750 ms at 50 items, excluding provider action | duplicate/cross-cancel load |

Budgets are acceptance targets, not grounds to skip authority. Any miss blocks the pilot and triggers index/query/batch redesign under review.

## Index and query requirements

- Unique device/local-command and device/local-sequence identities.
- Unique active device per tenant/branch invariant.
- Employee package lookups by device/employee/status and exact generations.
- Existing Core idempotency/fingerprint/claim identities preserved.
- Customer identity uniqueness by tenant and normalized phone.
- Catalog/VAT predicates led by tenant/branch/subject.
- Trusted profile lookup led by the verified Auth subject; the shared presentation response is serialized to `username`, `full_name`, `contact_email`, `phone`, `tenant_name`, `branch_name` and the six enumerated UI capabilities only.
- Inventory history led by `(tenant_id, branch_id, created_at DESC, id DESC)`, with `(tenant_id, branch_id, catalog_item_id, created_at DESC, id DESC)` for item-constrained history.
- Stock uniqueness by tenant/branch/item; item locks sorted by immutable item ID.
- Snapshot/frontier and command-inclusion indexes.
- Review queue by tenant/branch/status/created; effect claim by state/next-attempt.

## Contention and failure controls

Activation locks only the branch device slot. Acquisition does not hold inventory or effect locks. Execution locks command claim, numbering row and stock rows in a documented deterministic order. Cancellation uses the same order plus the original business link. Effect workers never lock business rows.

Lock waits, deadlocks, transaction retries, backlog age and batch duration are recorded without payload/PII. A bounded database timeout produces unknown/retryable state followed by receipt lookup; it never invokes the legacy engine.

## Migration performance

ACL, policy and function catalog changes should avoid data rewrite but may take metadata locks. Before any revocation, compatibility measurements must prove that all current profile consumers use the one shared trusted presentation response and that inventory history uses the bounded trusted route. A missing caller or response mismatch aborts the wave; speed is never grounds to restore broad privileges. New constraints/indexes and any companion backfill require separately measured lock/rewrite plans. Historical rows receive explicit unknown/not-applicable values rather than fabricated employee/device identities. Rollout windows and abort thresholds must be approved per wave.
