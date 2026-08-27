# Phase 3 Architecture

Phase 3 extends the single existing database `afex-pos-local-v1` from version 2 to version 3. It adds only `commandOutbox` and `commandDependencies`. Attempt/result state remains on the outbox record; no redundant receipt or dead-letter store was added.

## Layers

1. Phase 1 remains the sole namespace, key, AES-GCM/AAD, purge and lock boundary.
2. Phase 2 supplies the reviewed strict recursive canonical JSON contract.
3. Phase 3 validates allowlisted typed payloads, calculates stable identities/hashes, allocates a namespace-local sequence, encrypts the payload and atomically stores command plus dependency edges.
4. Operational state is separate from immutable content and indexed without exposing payload data.
5. The future-dispatch plan only validates/order dependencies and always reports dispatch disabled.

## Version-aware schema gate

Schema requirements are structural descriptors, not store-name checks. A v1 origin must match every approved Phase 1 store key path and index definition before Phase 2/3 stores may be added. A v2 origin must additionally match every corrected Phase 2 store and required index; missing or incompatible Phase 2 structure aborts before Phase 3 creation. A freshly created database may build the complete v3 schema. Every opened v3 database is revalidated structurally, including Phase 3 stores/indexes. Unsupported origins and destructive repair/downgrade are rejected.

## Plaintext operational metadata

Only version numbers, random local command/idempotency/correlation identifiers, command type, namespace digest, hashed authority references, local sequence, dependency command IDs, hashes, timestamps, state, bounded safe error classification and future opaque receipt digest are plaintext. These values are required for recovery, indexes, counters and integrity. Customer/order/payment content and raw authority identities exist only inside AES-GCM ciphertext or as namespace-bound one-way digests.

## Concurrency

- Sequence allocation is a serialized IndexedDB `meta` read/write transaction per namespace. Gaps after a crash are allowed; committed sequence values are never reused.
- The unique `(namespaceId,idempotencyKey)` index converges duplicate submissions, including concurrent tabs.
- The unique `(namespaceId,localSequence)` index rejects sequence collisions.
- Dispatcher lease metadata is namespace/owner scoped, expiring, renewable and atomic. It cannot dispatch.
- Dependency validation first verifies the complete immutable ancestor closure, then re-reads and matches that closure within the final command/edge write transaction. Exact dependency policy binds payment to the same order aggregate, local customer references to `customer.create`, local order status to `order.create`, and audit events to the exact causal command.

## Lifecycle

Normal creation ends in `pending`. The production-facing repository exports no transition to `syncing` or `synced`. Local validation/dependency failures may become `failed`/`blocked`. A synthetic-only qualification hook can seed an abandoned `syncing` record; recovery returns it to `pending` with `ABANDONED_SYNCING_RECOVERED_NO_DISPATCH` and performs zero network/business work.

## Dormancy

No Phase 3 module is mounted by application routes. There is no startup scan, fetch, timer, polling loop, Service Worker hook, SWR/React mutation, write-path interception or external effect. Current checkout/customer/status/audit/WhatsApp/print/PDF code imports no Phase 3 symbol.
