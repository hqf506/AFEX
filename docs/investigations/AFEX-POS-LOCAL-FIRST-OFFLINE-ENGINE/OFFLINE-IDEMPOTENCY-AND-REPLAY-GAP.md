# Idempotency and Replay Gap

## What exists

### Client checkout identity

`lib/pos-checkout-identity.ts` canonicalizes the checkout draft, hashes it, stores a UUID/fingerprint/state record in `sessionStorage`, and refuses to reuse the identity for a different fingerprint. This is useful protection inside one browser session.

Limitations:

- `sessionStorage` is not a durable outbox and is not shared across all process contexts;
- it has only `pending|succeeded`;
- it is not tenant/branch/device/actor namespaced;
- it has no server receipt, lease, attempt classification or conflict evidence;
- clearing browser session state can sever the identity from a plaintext offline draft.

### Local offline draft retry

`lib/pos-offline-draft.ts` stores a stable `clientIdempotencyKey`, attempts and timestamps. It retries the first record serially and deletes it after an apparent successful response.

Limitations:

- plaintext PII/financial state in `localStorage`;
- module-scoped `isSyncing` is not a durable or cross-tab lock;
- online detection is advisory and no backoff/jitter/lease exists;
- failure type is flattened into an exception and no `conflict|blocked` states exist;
- no payload immutability hash is enforced after save;
- drafts may receive generated keys during normalization, weakening historical stability;
- no command dependencies or per-aggregate ordering;
- a separate cost-snapshot POST occurs after order success;
- the record is deleted before all follow-up effects have a durable receipt;
- there is no recovery query for an unknown result after a timeout.

### Legacy server idempotency

`orders.client_idempotency_key` has a unique partial index and the order RPC accepts the key. This prevents a class of duplicate order inserts, but it is not a general typed command ledger. It does not by itself provide canonical fingerprint conflict detection, actor lease provenance, status/customer command replay, durable external effects or complete response receipts.

### Core V2

Core V2 provides the right foundation for `order.create`:

- acquisition by stable request ID;
- canonical payload and fingerprint projection;
- command claim/lease;
- durable response snapshot;
- business links and audit;
- replay, reconciliation and manual-hold states;
- bounded retry authority.

Current gaps for the local-first goal:

1. only `order.create` is integrated as an application command;
2. the route passes the primary `auth.user.id` into Core V2 acquisition while effective employee attribution is handled separately;
3. no signed offline actor lease is accepted/validated;
4. status transitions and customer writes do not share the Core command ledger;
5. provider/external effects do not use a durable event outbox keyed to the command;
6. device sync has no batch/receipt protocol or cursor.

## Exactly-once statement

Exactly-once delivery is not achievable over an unreliable network. The achievable contract is:

```text
at-least-once delivery from durable device outbox
+ server-side idempotent command acquisition
+ exactly-once business effect per command identity
+ durable replayable terminal result
+ idempotent server-owned external-effect outbox
```

Any design that deletes the local command after an HTTP 200 without storing and verifying a terminal server receipt is insufficient.

## Required local command record

Minimum immutable fields:

- `commandId` and stable `idempotencyKey` generated once with secure randomness;
- `commandType`, `schemaVersion`, `payloadVersion`;
- canonical encrypted payload and SHA-256 fingerprint;
- namespace and local device sequence;
- primary subject, effective POS actor and offline-lease reference;
- base dataset/version references;
- dependency command IDs and aggregate key;
- local creation wall clock plus monotonic ordering evidence;
- state, claim owner/expiry, attempt count and retry-after;
- last safe classification without secret/internal payload leakage;
- terminal server response version/hash and official business links;
- immutable history events and acknowledgement/tombstone timestamps.

## Required server protocol

1. Accept a typed command envelope, not arbitrary replay of route bodies.
2. Verify organization session and/or signed offline actor lease, tenant, branch, device and command capability.
3. Acquire by stable command identity before business validation.
4. Compare canonical fingerprint; same key/different payload is a hard conflict.
5. Return replayable states: accepted, in_progress, succeeded, failed_final, conflict, blocked, reconciliation/manual_hold.
6. Persist the effective POS actor in the command authority context and resulting business/audit links.
7. Keep official sequence allocation, price/VAT/inventory validation and business writes in a short server transaction.
8. Emit server-owned external effects into an idempotent outbox in the same authoritative transaction where possible.
9. Provide receipt lookup by command ID and a cursor-based batch sync response.

## Replay policies

- Network timeout after dispatch: query/replay same command ID; never generate a new ID.
- 401/actor expiry: set `blocked`, reauthenticate, then resume the same immutable command only if policy permits.
- 409 fingerprint conflict: security/manual review; never mutate payload under the same ID.
- price/VAT/inventory/customer conflict: preserve original, create a new user-approved replacement command.
- 5xx retryable: exponential backoff with jitter and server `Retry-After`; bounded automatic attempts.
- reconciliation/manual hold: stop all dependents and surface support reference.
- external effects: device only observes server effect status; it never calls provider on replay.

## Required regression tests

- browser killed before/after local commit;
- two tabs and page/service-worker race for one command;
- timeout before headers, during body and after server commit;
- same key/same payload replay returns one business effect;
- same key/different payload is blocked;
- actor expires before dispatch and during unknown-result recovery;
- branch/tenant switches with pending records;
- price, stock, customer and status conflicts;
- server success persisted before local deletion;
- cost snapshot/audit/WhatsApp cannot duplicate;
- quota, corrupt record, local migration interruption and device reboot recovery.

## Gate

`order.create` may enter an offline execution pilot only after Core V2 is enabled for that path, effective actor authority is integrated, and the device outbox uses durable immutable records. Other business commands remain blocked until equivalent server contracts exist.

