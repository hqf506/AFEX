# Phase 3 Idempotency Contract

## Stable identities

- `localCommandId`: cryptographically random UUID prefixed with `lc_`; created once and retained.
- `idempotencyKey`: SHA-256 of contract version, exact namespace, command type, strict canonical payload hash and a bounded caller-held deduplication key.
- `localSequence`: atomic namespace-local IndexedDB counter; never timestamp-only and never reused after commitment. Crash gaps are allowed.
- `aggregateId`, `causationId`, `correlationId`: bounded opaque identifiers generated once or accepted from a verified caller contract before command persistence.

The repository verifies a caller-supplied identity against the recalculated payload hash and idempotency key. Retry/reload/app restart reuses the persisted command. If two tabs submit the same semantic request concurrently, the unique `(namespaceId,idempotencyKey)` index permits one record and the loser returns the stored command. Different commands receive distinct `(namespaceId,localSequence)` values.

## Boundary

This is local duplicate convergence, not end-to-end idempotency. End-to-end acceptance requires Core V2/server enforcement of the same identity/fingerprint and a transactional server receipt contract. Phase 3 never generates final order or invoice numbers and never dispatches.

## Hashes

Payload hash uses the reviewed Phase 2 strict canonical JSON serializer. Dependency IDs are sorted/deduplicated before a separate dependency projection hash. Envelope hash covers immutable non-ciphertext projection; AES-GCM/AAD authenticates ciphertext, namespace, store and record key.

