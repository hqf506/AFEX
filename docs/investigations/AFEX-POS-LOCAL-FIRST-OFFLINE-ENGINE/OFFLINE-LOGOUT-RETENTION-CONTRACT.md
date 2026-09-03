# Logout Retention Contract

## User contract

Every POS logout/switch flow displays an AFEX confirmation dialog containing the unchecked checkbox:

`حذف البيانات المحفوظة من هذا الجهاز`

- Unchecked (default): scoped ciphertext remains on this device; it stays locked until the same authorized account/tenant/branch and POS actor unlock it.
- Checked: the exact scoped dataset, drafts, commands, receipts, media references and wrapped keys are deleted only after successful authoritative logout.

The user is never forced to delete retained data, and no other namespace is deleted as a side effect.

## Required flow

### Phase 1 — freeze and lock

1. Set namespace state to `logout_pending` in a local transaction.
2. Stop new writes and sync claims.
3. Terminate page/worker access to the unwrapped DEK.
4. Flush only already committed local transactions; do not dispatch new business commands.

### Phase 2 — authoritative logout

1. Revoke the POS actor session through `/api/pos/end-actor-session`.
2. Complete the intended primary Supabase logout scope.
3. Treat network/5xx/ambiguous results as logout failure or pending revocation, not success.
4. Keep the cache locked during retry.

### Phase 3A — retain (unchecked)

1. Retain encrypted namespace stores, signed manifests and wrapped key envelope.
2. Remove in-memory keys, ephemeral decrypted views, auth profile snapshots and UI employee state.
3. Mark `locked_retained` with safe last-authorized scope metadata.
4. The login page may show only non-sensitive storage presence/size, not names, customers, totals or order identifiers.

### Phase 3B — purge (checked)

1. Write an exact namespace purge tombstone.
2. Delete namespace IndexedDB records and any namespace database.
3. Delete wrapped keys/device grants for that namespace.
4. Decrement/remove media references; delete media only when no other authorized namespace references it and classification permits sharing.
5. Delete service-worker/cache entries keyed to that namespace; static public shell may remain.
6. Verify zero rows/keys/receipts/outbox/drafts/conflicts and no active local lease.
7. Mark purge complete; failure remains `purge_failed_locked` with a safe retry action.

## Pending-command warning

If checked while unresolved commands exist, the dialog must disclose the count and irreversible loss risk. Default remains unchecked. Product/security must decide whether purge is allowed immediately or requires a second destructive confirmation. Purge must never silently upload commands during logout.

Recommended contract:

- permit the device owner to delete, but require exact second confirmation;
- record no server audit claiming the unsynced business action occurred;
- locally generate a non-sensitive purge receipt (counts and hashes only, no PII) when feasible;
- do not call the action “cancel order” because no server order may exist.

## Account and branch switching

- Switching employee within the same primary/tenant/branch locks and re-unlocks the same read dataset but preserves per-command effective actor attribution.
- Switching branch selects a different namespace and DEK.
- Switching primary account or tenant locks the previous namespace before rendering the new POS shell.
- A system administrator with broad online authority does not automatically gain offline decryption of every branch namespace.

## Failure behavior

| Failure | Required result |
|---|---|
| actor revocation fails | remain locked; show retry; no purge completion claim |
| primary logout fails | remain locked; no plaintext access; no purge completion claim |
| purge transaction fails | `purge_failed_locked`; retry exact namespace only |
| browser closes mid-purge | resume from tombstone on next origin startup before any unlock |
| media cleanup fails | keep reference tombstone and retry; no data from namespace may render |
| namespace mismatch | abort purge and raise security classification |

## UI changes required in a future phase

Existing files likely to change:

- `app/pos/settings/page.tsx`
- `components/pos-shell/pos-responsive-shell.tsx`
- `lib/pos-employee-session.ts`
- `components/auth-state-provider.tsx`

Proposed new components/modules:

- `components/pos-logout-retention-dialog.tsx`
- `lib/offline/namespace.ts`
- `lib/offline/lock.ts`
- `lib/offline/purge.ts`
- `lib/offline/key-manager.ts`

## Acceptance matrix

- checkbox label exact and unchecked on every open;
- retain preserves ciphertext but plaintext enumeration/decryption is denied;
- purge occurs after successful logout, not before;
- exact account/tenant/branch/device namespace only;
- zero-residue proof covers datasets, drafts, outbox, receipts, conflicts, leases, wrapped keys and scoped media;
- browser crash at every step is restart-safe;
- two tabs converge on locked/purged state;
- unrelated namespaces remain byte-identical;
- no PIN, key, PII or command payload appears in logs.

