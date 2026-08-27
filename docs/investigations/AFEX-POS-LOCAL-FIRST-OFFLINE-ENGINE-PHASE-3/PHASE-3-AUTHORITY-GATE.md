# Phase 3 Authority Gate

Classification: **B — PERSISTENT_UNWRAP_AUTHORITY_REQUIRED**

## Determination

The approved Primary Auth/POS actor context can derive and revalidate the exact namespace, but it cannot persistently re-issue a non-extractable, device-bound unwrap authority after browser/app restart. A POS actor cookie or browser boolean is authorization context, not cryptographic device authority.

Therefore:

- Production persistent sensitive command payload persistence: **BLOCKED**.
- Synthetic test-only encrypted persistence outside production: **ALLOWED**.
- Schema, immutable contracts, state-machine modeling and authorized aggregate counters: **ALLOWED**.
- Command dispatch/replay/business interception: **false**.

`Phase3CommandRepository.requireAuthority` rejects production persistence with `OFFLINE_AUTHORITY_UNAVAILABLE` before opening IndexedDB. Synthetic authority is accepted only when explicitly constructed and `NODE_ENV !== production`; it still requires the exact unlocked namespace key. There is no plaintext, volatile-as-durable, localStorage/sessionStorage, PIN-derived, service-role or provider-secret fallback.

## Future prerequisites

Production durability remains dependent on a reviewed server/device-bound, revocable, namespace-specific persistent unwrap envelope. End-to-end idempotency, command acceptance, server receipts, conflict authority, transactional ordering, invoice/order numbering and replay authorization require Core V2/server authority. Any schema/RLS/RPC/device registry work requires a separate SQL/security review. None is implemented or implied here.

## Fail-closed capabilities

| Capability | Phase 3 value |
| --- | --- |
| production sensitive command persistence | false |
| command dispatch | false |
| command replay | false |
| current write-path interception | false |
| optimistic business success | false |
| Service Worker dispatch | false |
| synthetic non-production persistence | explicit test boundary only |

