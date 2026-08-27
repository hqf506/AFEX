# Phase 3 Risk and Rollback

## Remaining risks/prerequisites

1. Persistent unwrap authority is unavailable; production sensitive outbox persistence remains blocked.
2. Local idempotency does not provide end-to-end server idempotency without Core V2 enforcement and receipts.
3. Server transition/conflict/reconciliation semantics, order/invoice numbering and inventory atomicity require server authority.
4. Payment attestation is employee evidence only; provider truth/reconciliation requires an approved server integration and must never become a replayed charge.
5. Device registration/revocation and schema/RLS/RPC changes, if selected, require separate security/SQL approval.
6. Build prerender remains externally blocked by absent `NEXT_PUBLIC_SUPABASE_URL`; Phase 3 does not change environment handling.
7. Dependency integrity is revalidated inside the atomic local write transaction. External storage tampering after commit remains fail-closed on the next local read/plan; dispatch is disabled, so it cannot create a Phase 3 external effect.

## Rollback

- Keep every Phase 3 capability false. Because there is no route integration, this prevents all creation and dispatch in production.
- Remove Phase 3 source/tests and revert database-version/store declarations before release if human review rejects the foundation.
- If a v3 browser database already exists, do not downgrade or delete automatically. Phase 1/2 data and encrypted commands remain intact and locked.
- Exact-scope user-authorized logout purge removes Phase 3 command/dependency/meta records through the approved Phase 1 tombstone/recovery contract.
- A partial v2-to-v3 schema upgrade is retried by IndexedDB atomically. A v2 origin missing any Phase 1/2 store or required index fails as `OFFLINE_SCHEMA_CORRUPT` before Phase 3 creation; no empty repair store is created.
- Synced/failed/conflict retention is never auto-deleted without a future approved policy.

Rollback requires no SQL, Production data mutation or destructive database downgrade.
