# Phase 2 Bootstrap Lifecycle

## Authority-B runtime behavior

The coordinator is intentionally fail-closed:

1. Primary Auth may be verified by the existing server route.
2. The exact Phase 1 namespace can be derived.
3. `prepareBeforePin()` transitions `idle -> preparing -> locked`.
4. It returns `requestsStarted: 0` and `plaintextStored: false`.
5. `afterPin()` remains locked because no persistent unwrap authority exists.
6. No dataset becomes readable and no page integrates a local repository.

This is the only safe behavior under classification B. The PIN remains governed by the existing online flow and is not made dependent on dataset work.

## Implemented reusable lifecycle primitives

- States: `idle`, `preparing`, `downloading`, `partially_ready`, `ready`, `stale`, `offline_ready`, `locked`, `failed`.
- Safe state subscription contains no payload or PII.
- A namespace/dataset/version manifest has one 30-second writer lease.
- A different writer is rejected while the lease is live.
- A stale lease is recoverable.
- Incomplete data is invisible.
- Complete version selection and `as of` freshness are deterministic.
- Full checked purge includes all Phase 2 stores and proves zero matching namespace records while preserving another namespace byte-identically.

## Future lifecycle requiring separate approval

The following sequence is specified but not activated: encrypted bootstrap after verified Primary Auth, durable envelope issuance, exact namespace unlock after valid PIN, immediate complete-snapshot read, background completion, safe state-only cross-tab broadcast, retained ciphertext across employee switch/logout, and refresh on network return. It cannot be enabled by a feature flag until the cryptographic authority described in `PHASE-2-AUTHORITY-GATE.md` is reviewed and implemented.

## Mutation boundary

There is no Outbox, Background Sync claim, offline customer creation, checkout completion, order/status mutation, invoice issuance, print replay or WhatsApp replay. Both Phase 1 and Phase 2 dispatch constants remain false.
