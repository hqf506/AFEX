# Phase 1 Risk and Rollback

## Open risks

1. **Persistent unwrap authority absent (blocking enablement, not static implementation):** retained ciphertext cannot be claimed recoverable across restart. Encrypted ingestion and legacy migration remain off.
2. **Mode A compromised-runtime limitation:** a compromised live runtime can access plaintext while legitimately unlocked. No hardware-backed claim is made.
3. **Authenticated runtime unproven:** logout failure, cross-tab behavior, storage persistence, and UX require a non-Production authenticated review.
4. **External build environment:** full prerender requires `NEXT_PUBLIC_SUPABASE_URL`.
5. **Historical unrelated regressions:** the repository-wide Node sweep reports two static CSS expectation failures (mobile customer layout and order-history fixed controls), both outside Phase 1 and untouched.
6. **Local compromise boundary:** immutable authorization and descriptor-bound tombstones reject stale/mutable metadata, but cannot defeat arbitrary code execution in a fully compromised same-origin runtime while a valid in-memory capability is live.
7. **Unscoped historical data:** current repository evidence cannot bind populated legacy keys to an account/tenant/branch. They remain locked and require a distinct device-wide AFEX legacy confirmation; scoped purge alone never claims to remove them.
8. **Deployed restart recovery unproven:** the corrected cold-start/PIN-gated recovery sequence is functionally covered in real Chromium IndexedDB, but an authenticated deployed non-Production restart remains a human-review item.

## Rollback

- disable encrypted local store and legacy migration flags;
- business dispatch and Service Worker data caching remain permanently false in Phase 1;
- do not restore plaintext sensitive writes;
- do not delete encrypted/quarantined/tombstone evidence;
- keep online POS usable if IndexedDB is unavailable;
- recover only with a compatible reviewed authority;
- scoped purge remains explicit and exact; no origin-wide deletion exists.
- rollback must preserve the split employee-switch/full-logout lifecycle and must not reintroduce Primary sign-out during employee switching;
- never replace explicit allowlisted legacy cleanup with `localStorage.clear()`.
- never move authorized tombstone recovery back into the cached cold-initialization promise or iterate tombstones globally.

No package, lockfile, SQL, migration, RPC, RLS, Core V2, R8N, or historical investigation artifact changed.
