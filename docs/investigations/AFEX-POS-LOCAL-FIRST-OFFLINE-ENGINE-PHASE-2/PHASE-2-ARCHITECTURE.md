# Phase 2 Safe-Subset Architecture

## Resulting layers

1. **Phase 1 authority and crypto boundary** remains the only namespace/key/lock/purge authority.
2. **IndexedDB database version 2** extends the same `afex-pos-local-v1` database; it does not create a parallel cache engine.
3. **Encrypted dataset repository contract** supports bounded pages, closure hashes, invisible incomplete snapshots, atomic completion, current plus previous complete versions, encrypted record AAD, cursor reads and a recoverable writer lease.
4. **Bootstrap coordinator contract** exposes only safe states and remains `locked` under authority classification B. It starts no request and stores no plaintext.
5. **Application shell** is a static lock-only HTML fallback. It cannot display operational data or dispatch work.
6. **Current online routes** remain unchanged and continue to use their existing API behavior because every dataset read flag is false.

## Capability flags

`offlineShell`, `encryptedDatasetStore`, `datasetBootstrap`, `catalogReads`, `customerReads`, `orderInvoiceReads`, and `mediaCache` are separate. The shell is public-env controlled and defaults false. Every sensitive capability is hard false until reviewed unwrap authority exists. Business mutation dispatch is false in both Phase 1 and Phase 2.

## Atomic snapshot protocol

- A manifest begins as `incomplete` under one namespace/dataset/version writer lease.
- Each page is limited to 200 records, canonicalized, hashed and encrypted before storage.
- Each encrypted record binds namespace, dataset store, snapshot version and record key through AES-GCM AAD.
- Completion revalidates writer ownership, page sequence, page count, record count and closure hash in a read/write transaction.
- Only then is the manifest marked `complete`.
- Reads select only the newest complete manifest and use a compound indexed cursor with a maximum page size of 200.
- After completion, only the newest two complete versions remain. Incomplete versions never become readable.

## Concurrency and cross-tab safety

IndexedDB provides the atomic transaction boundary and a 30-second manifest writer lease allows exactly one writer for the same namespace/dataset/version. A stale lease can be reclaimed. No PII is sent over BroadcastChannel. Because bootstrap is locked under B, request-level cross-tab coordination and a version-state BroadcastChannel are deliberately not enabled; duplicate sensitive bootstrap requests are zero because sensitive requests are zero.

## Shell lifecycle

The registration component runs only when the shell flag is true and only after the IndexedDB initialization/migration gate succeeds. The worker installs the lock shell, waits for the explicit activation message, retains compatible `afex-pos-shell-v0`, removes only obsolete AFEX-owned shell caches, caches only same-origin `/_next/static/` assets and never intercepts `/api/` or non-GET requests.

## Deliberate omissions under authority B

- No persistent PII/financial dataset ingestion.
- No page reads from IndexedDB.
- No customer/catalog 10k persistent index.
- No media download/eviction engine.
- No route-level freshness UI.
- No API extension or delta/tombstone protocol.
- No offline customer creation, order completion, status mutation, WhatsApp, print replay or Outbox.

These are blocked capabilities, not hidden placeholders or claims of completion.
