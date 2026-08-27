# Offline Storage Options Decision

## Decision

Use IndexedDB as the authoritative local operational database. Use Cache Storage only for a versioned application shell and non-sensitive/cacheable media. Consider OPFS for large encrypted media/blob packs after quota profiling. Do not use `localStorage` or `sessionStorage` for sensitive operational records or the command outbox.

## Comparison

| Option | Strengths | Limits | AFEX decision |
|---|---|---|---|
| IndexedDB | transactional object stores; indexes; structured records; browser support; worker access | migration/error handling is manual; quota/eviction; no built-in encryption; Safari behavior requires testing | primary operational store |
| OPFS | efficient large blobs/files; worker synchronous access where supported; natural snapshot files | weaker tooling/compatibility; transactional metadata still needed; browser eviction; not an authority boundary | optional encrypted media/snapshot store after Phase 2 profiling |
| Cache Storage | request/response cache; service-worker shell/media integration | not suited to relational queries, command state or sensitive PII; eviction opaque | static shell and immutable media only |
| Service Worker | offline navigation, cache orchestration, background opportunity | lifecycle is nondeterministic; Background Sync unavailable/unreliable on some iOS versions; can race page contexts | coordinator, never sole outbox owner or sole sync guarantee |
| Workbox | mature precache/routing patterns | new dependency/build surface; does not solve encryption/authority/command semantics | optional implementation aid after architecture gate |
| localStorage | simple synchronous API | plaintext, global per-origin, blocking, no transactions/indexes/quotas/leases | reject for PII, drafts, datasets and outbox |
| sessionStorage | tab-scoped | not durable across all restarts/contexts; not shared; plaintext | UI-only ephemeral markers |
| native SQLite + Keychain/Keystore | strong mobile durability, transactions, device secure key material | separate native data layer, migrations, plugin/native QA and web parity complexity | later hardening path if strong offline security is required |

## Proposed IndexedDB layout

Database name is derived from a non-secret opaque namespace ID, not readable tenant/customer labels.

| Store | Key | Purpose | Eviction |
|---|---|---|---|
| `meta` | key | schema, namespace, key version, signed manifests, server clock anchor | never while namespace exists |
| `catalog` | item ID | encrypted categories/items/prices/reference inventory | old complete versions only |
| `customers` | customer ID | encrypted bounded customer search/profile cache | retention/LRU after policy |
| `orders` | order ID | encrypted active/recent orders | terminal history by retention |
| `invoices` | invoice ID | encrypted confirmed snapshots | by explicit retention |
| `events` | event ID | encrypted operational/status history | with parent retention |
| `drafts` | local sale ID | encrypted mutable sale draft with revision | explicit success/cancel/purge |
| `commands` | command ID | immutable encrypted command envelope/state | never before terminal acknowledgement |
| `commandEvents` | `[commandId, sequence]` | append-only state/evidence history | with command after support policy |
| `receipts` | command ID | terminal response hashes/business links | never before acknowledgement/retention |
| `conflicts` | conflict ID | safe resolution evidence | explicit resolution only |
| `leases` | resource key | short transaction claims/heartbeats | expired claims recoverable |
| `mediaRefs` | content key | media metadata/reference counts | LRU if unpinned |

Encrypted records contain a small non-sensitive index envelope only where required. Customer names, phones, notes, totals, command payloads and response bodies remain ciphertext.

## Transaction rules

- Draft update and command enqueue occur in one IndexedDB transaction when checkout is finalized offline.
- Claim transition `pending -> syncing` is compare-and-set with owner and expiry.
- Server receipt, command terminal state and cached business link commit in one local transaction.
- The queue record is never physically deleted in the same transaction that first marks success; an acknowledgement/tombstone retention step follows.
- Schema migrations are versioned, restartable and never auto-delete unresolved commands.

## Media strategy

1. Keep product metadata in IndexedDB.
2. Cache only catalog-referenced images with validated response type and size.
3. Prefer content-addressed URLs/digests; otherwise bind URL to dataset version.
4. Pin current visible catalog media; evict unreferenced LRU media first.
5. Do not cache authenticated API JSON in a general Cache Storage rule.
6. Use placeholder assets when image quota/network fails; never block command evidence writes for images.

## Quota and persistence

- Call `navigator.storage.persist()` as a best-effort request and record the result; never assume persistence.
- Monitor `navigator.storage.estimate()` before large refresh and every outbox write.
- At 70% usage, prune safe media/old dataset versions.
- At 90% or on quota error, preserve drafts/outbox/receipts and block new offline financial commands.
- Provide an encrypted diagnostic export only through an approved support flow; never serialize plaintext into logs.

## Local schema migrations

Each release declares:

- database schema version;
- minimum readable version;
- forward migration steps and checksums;
- rollback compatibility for the application release;
- backup/copy strategy for non-evictable stores;
- fail-closed behavior on interruption/corruption.

Application rollback must remain able to read or safely quarantine commands written by the newer schema. A deployment must not ship if rollback would orphan pending commands.

## Decision gates

- IndexedDB durability and crash tests on Chromium, WebKit/iOS PWA, Android WebView and Capacitor.
- Quota eviction simulation with pending commands.
- 10k catalog items/customer index scale profile and image budget measurement using non-production synthetic data.
- cross-tab/page/service-worker lease tests.
- encryption AAD/namespace tamper tests.
- local schema upgrade interruption and application rollback tests.

