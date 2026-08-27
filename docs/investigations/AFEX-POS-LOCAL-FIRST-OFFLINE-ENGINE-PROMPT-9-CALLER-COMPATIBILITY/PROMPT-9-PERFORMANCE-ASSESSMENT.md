# Performance and lock assessment

All conclusions below are static estimates or inherited historical evidence. No p95, throughput, real-device, lock-wait, or Production claim is made.

| Area | Finding | Classification | Required evidence |
| --- | --- | --- | --- |
| Profile route | One server route can replace several browser lookups, but capability/tenant/branch joins and caching policy are not implemented. | STATIC_ESTIMATE | local/runtime contract and latency tests |
| Inventory history | Current page causes up to three relation requests: movements view, catalog items, branches. | STATIC_SOURCE_PROOF | query plan and read-only Production index evidence |
| Inventory ordering | Existing migration indexes do not statically prove the target `created_at DESC,id DESC` path. | REQUIRES_PRODUCTION_READ_ONLY_EVIDENCE | exact indexes and EXPLAIN under representative filters |
| Offset pagination | Increasing offsets are less stable under concurrent inserts and can scan more rows than cursor pagination. | STATIC_ESTIMATE | runtime plan/latency comparison |
| Customer lookup | Composite normalized-phone identity and advisory locking bound duplicate races; fallback legacy search may be less selective. | STATIC_ESTIMATE | read-only index/plan evidence |
| Customer UI | Debounce, TTL cache, abort, and request IDs reduce duplicate/stale work. | STATIC_SOURCE_PROOF | browser timing test |
| Core acquisition | Command/payload/context locking and payload fingerprint preserve current idempotency semantics. | HISTORICAL_EVIDENCE | fresh runtime concurrency test before Core evolution |
| Core business execution | Catalog/inventory row locks create a critical section, but adding authority/snapshot/effect locks may alter order and duration. | STATIC_ESTIMATE | isolated concurrency/deadlock tests |
| Device enrollment | One-device-per-branch and 25-employee cap concentrate writes on branch/device authority. | REQUIRES_RUNTIME_TEST | concurrent enrollment/revocation matrix |
| Review CAS | Single review-row serialization is required; hot reviews can contend. | REQUIRES_RUNTIME_TEST | same-version and adjacent-version concurrency |
| Payment reconciliation | Provider updates must serialize per attestation/provider identity without holding Core business locks. | STATIC_ESTIMATE | provider retry/ambiguity concurrency |
| Snapshot generation | Header/item generation can be a large transaction; scope model changes query/index width. | REQUIRES_RUNTIME_TEST | representative branch-size batch tests |
| Effect claims | Small bounded claim batches and short transactions are required; no worker exists to measure. | REQUIRES_RUNTIME_TEST | lease/reclaim/duplicate dispatch tests |
| Rollback | Restoring broad privileges is forbidden; rollback depends on qualified trusted routes and versioned Core compatibility. | STATIC_INFERENCE | independent rollback drill |

## N+1 and duplicate fetching

No per-row N+1 loop is evident in the inventory-history route, but it performs two enrichment fetches after the movement view. Profile consumers currently repeat profile/tenant/branch reads across surfaces. Customer profile/activity endpoints can fetch invoice/order activity after the identity row; pagination and field minimization must be preserved.

## Deadlock and transaction risks

Future work must publish one cross-feature lock order before implementation. A safe review target is: immutable authority/command scope, business/review row, inventory snapshot or stock rows in stable key order, payment attestation, effect intent. This is not executable SQL guidance; it is a design prerequisite. External provider or messaging calls must never occur while database locks are held.

## Rollback safety

A failed authority deployment must not restore browser profile reads, broad `public` CREATE, or direct business writes. Versioned application/Core compatibility must remain available long enough to roll back code while keeping restrictive invariants. Prompt 9 did not perform a rollback drill.


