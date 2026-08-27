# Phase 2 Human Review Correction

Date: 2026-08-25  
Baseline tracked HEAD: `37331390ec00bee507f88701365bfebb944db675`  
Authority classification: **B — unchanged**

## Blocking defects resolved

### 1. Service Worker kill switch

When `NEXT_PUBLIC_AFEX_OFFLINE_APPLICATION_SHELL` is false, the client now runs an idempotent neutralization operation rather than returning early. Ownership requires both the exact same-origin script path `/sw.js` and the exact POS scope `/pos/`. Only those registrations are messaged and unregistered. Cache cleanup accepts only names beginning with the exact prefix `afex-pos-shell-`; unrelated registrations and caches are never selected.

The current worker supports `AFEX_DISABLE_SHELL_V1`. It first disables its fetch handler in memory, deletes only AFEX shell caches, unregisters itself, and acknowledges the client. The client independently unregisters the exact owned registration, deletes the exact owned caches, and verifies registration/cache residue. A cleanup result is `complete` only when registration residue and cache residue are both zero and an existing AFEX controller acknowledged neutralization. Therefore a worker that remains capable of acting is never represented as successfully disabled.

The cleanup uses local browser APIs and remains usable while the network is offline. If registration inspection, unregister, cache inspection/deletion, controller acknowledgement, or residue verification partially fails, the result is `incomplete` with safe classifications and the mounted client retries. The online POS remains available, no unrelated storage is touched, and partial cleanup is never promoted to success.

A real loopback Chromium test registers and activates `/sw.js`, populates the AFEX shell cache, registers an unrelated worker/cache, invokes the disabled-shell cleanup, and proves AFEX registration/cache removal, unrelated preservation, controller neutralization, no cache recreation, and no control of a fresh POS page.

### 2. Snapshot availability authority

`getSafeAvailability` now passes through the same `requireReadAuthority` boundary as dataset reads. That boundary normalizes and validates `namespaceId` and `datasetId`, requires the exact unlocked namespace key, applies the dataset read capability, and completes before any IndexedDB open/query. The normalized values are the only values passed to IndexedDB.

The same normalization boundary now protects `readCompleteSnapshotPage`. No public metadata-only bypass was introduced. Private manifest helpers remain reachable only after a write/read authority gate. Chromium tests prove denial before PIN without opening the database, denial after key lock, denial for another namespace, invalid-dataset rejection, authorized synthetic non-production success, and absence of metadata on every denied result.

### 3. Canonical snapshot hashing

Snapshot page and closure hashes now use one strict recursive canonical JSON serializer. The contract is:

- `null`, booleans and strings use their JSON representations;
- finite numbers are accepted, with negative zero serialized as `0`;
- arrays preserve their exact order and reject sparse entries;
- plain objects with `Object.prototype` or a null prototype are accepted;
- every plain-object key must be an enumerable string data property;
- object keys are recursively sorted by deterministic UTF-16 code-unit order;
- `undefined`, functions, symbols, bigint, `NaN`, infinities, cyclic structures, accessors, symbol keys, non-enumerable properties and non-plain objects are rejected as `OFFLINE_CONTEXT_INVALID`.

Existing AFEX canonicalizers were inspected but not reused: the server idempotency serializer imports Node crypto and accepts unsupported/non-plain values, while the checkout serializer also permits ambiguous values. Neither matches this client-side fail-closed snapshot contract.

Future server snapshot endpoints must calculate page and closure hashes from exactly the contract above, preserve array order, apply the same record-key ordering, and reject rather than coerce unsupported values. Tests prove nested insertion-order equivalence, array-order sensitivity, unsupported-value rejection, page retry stability and closure retry stability.

## Security boundary preserved

- `classification=B`.
- `persistentUnwrapAuthority=false`.
- `encryptedDatasetStore=false`.
- `datasetBootstrap=false`.
- catalog/customer/order/invoice/media reads remain false.
- business mutation dispatch remains false.
- PII/financial ingestion remains absent.
- no operational route integration, authenticated bootstrap, Phase 3 or outbox work was added.

## Safety and scope

Corrected application/test files are limited to:

1. `components/pos-offline-shell-registration.tsx`
2. `lib/offline/phase2.ts`
3. `public/sw.js`
4. `tests/pos-offline-phase2.test.mjs`

No SQL, migration, RLS, database, Production, business write, dependency, package/lock, environment, Git write, deployment, or `runtime-integration/R8N-*` change occurred.
