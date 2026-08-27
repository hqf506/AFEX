# Phase 1 Architecture

## Authoritative boundary

```text
POS UI
  -> logout / runtime integration
  -> EncryptedOfflineRepository
  -> versioned IndexedDB transactions
  -> OfflineKeyManager + WebCrypto AES-GCM
```

`lib/offline/phase1.ts` is the only new operational persistence boundary. UI code never opens IndexedDB directly. The design extends the current POS shell/logout lifecycle and gates the old plaintext offline draft writer instead of creating a parallel command system.

## Runtime authority

`GET /api/pos/offline-context` derives primary subject, tenant, and active branch from the existing server authorization context. Browser-supplied tenant, branch, or employee identifiers are not accepted. `deviceCacheId` is created locally for coordination only and does not grant authority.

A durable namespace is the opaque SHA-256 derivation of:

```text
primarySubjectId + tenantId + branchId + deviceCacheId + schemaGeneration
```

Primary Auth alone remains locked. POS actor authority is required, but persistent unwrap is additionally disabled until a reviewed server/device authority exists.

## Scope deliberately absent

- no command/outbox store;
- no order dispatch or replay;
- no catalog/customer/order/invoice ingestion;
- no Service Worker or cache storage;
- no local PIN verifier or PIN-derived key;
- no SQL, RPC, migration, database, or Core V2 change.

Capability flags keep encrypted writes and legacy migration off by default. Scoped logout purge is separately enabled because it is explicit deletion of already scoped local evidence, not business ingestion.

## Final restart-recovery correction

Cold startup now performs storage initialization and safe tombstone discovery only. `initializeOfflinePhase1Runtime()` never requests an authorization context and never resumes a purge. Its one-time promise therefore caches only schema/coordination initialization, not a failed or unauthenticated authority decision.

After successful employee PIN issuance, `completePosPinOfflineRecoveryGate()` calls the re-runnable `resumeAuthorizedPurgesForCurrentScope()` before employee presentation, plaintext-capable state, or navigation is enabled. The gate derives a fresh server-verified primary/tenant/branch context, requires an active POS actor, issues an internal exact-namespace capability, and selects only that namespace's tombstone. Other account or branch tombstones remain untouched and are reported only as a safe deferred count.

Exact resume takes the namespace lease before rechecking the tombstone. This makes two-tab attempts idempotent: one tab may complete the deletion, while the other observes no remaining matching tombstone and performs no second destructive pass. Binding mismatch, unavailable authority, storage failure, and purge failure all remain locked; offline-store unavailability does not prevent the already-authorized online POS session from continuing.
