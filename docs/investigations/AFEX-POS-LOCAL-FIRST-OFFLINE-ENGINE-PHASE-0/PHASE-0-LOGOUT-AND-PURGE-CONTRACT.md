# Phase 0 Logout and Purge Contract

## Exact user contract

Every POS logout/switch dialog includes this checkbox:

`حذف البيانات المحفوظة من هذا الجهاز`

- It is unchecked every time the dialog opens.
- Unchecked retains encrypted data for the exact namespace.
- Checked deletes only the exact account/tenant/branch/device namespace.
- Deletion starts only after successful authoritative logout.
- Plaintext access locks immediately when logout starts.
- Primary Auth alone cannot unlock retained POS data.
- Later access requires renewed authorized Primary Auth plus valid POS actor/PIN authority for the same scope.
- Another account, tenant or branch never sees the retained namespace.
- Logout never silently dispatches pending business commands.

## State machine

```text
unlocked
 -> logout_locking
 -> logout_authoritative_pending
 -> locked_retained                     (unchecked + logout success)
 -> purge_confirmation_required         (checked + unresolved evidence)
 -> purge_tombstoned
 -> purging
 -> purged                              (verified zero residue)
 -> purge_failed_locked                 (retryable)
```

Any logout failure remains locked and retryable. The UI does not claim successful logout/purge while authoritative outcome is ambiguous.

## Pending-command warning

When unresolved drafts/commands/conflicts exist and the checkbox is checked, show the exact count and a second destructive confirmation. Proposed text:

`يوجد {count} عمليات غير متزامنة على هذا الجهاز. حذف البيانات سيزيل هذه العمليات نهائيًا ولن يرسلها إلى الخادم. هل تريد المتابعة؟`

Buttons:

- `العودة دون حذف`
- `حذف البيانات غير المتزامنة`

The destructive action does not mean “cancel order”; a server order may not exist. It does not upload, replay or compensate the commands.

## Purge scope and order

1. Persist a purge tombstone containing only opaque namespace ID, schema/key versions, counts/hashes and step cursor.
2. Stop page/worker claims and destroy in-memory DEK references.
3. Delete exact-namespace datasets, drafts, commands, command events, receipts, conflicts and local leases.
4. Delete exact-namespace wrapped DEKs/device grants.
5. Remove media references; remove media bytes only when no approved namespace references them.
6. Remove exact scoped service-worker/cache entries; retain public build shell only.
7. Verify zero records/keys/references/leases for the namespace.
8. Verify unrelated namespaces remain byte-identical.
9. Mark tombstone complete and remove it only after the verification receipt is committed.

## Crash safety

- Startup detects an incomplete purge tombstone before any unlock.
- Purge resumes idempotently from the last committed step.
- A failed step enters `purge_failed_locked` and exposes a safe retry, not plaintext access.
- Zero-residue verification is repeated after restart.

## Legacy plaintext tightening

- After encrypted storage is enabled, no new sensitive draft is written to `localStorage`.
- The importer binds legacy data only after verified namespace evidence.
- Ambiguous legacy records are quarantined; they are never silently assigned to the current tenant/branch.
- Successfully imported plaintext is removed safely after encrypted transaction/hash verification.
- Rollback never resumes plaintext PII/financial draft writes.
- Pending encrypted commands are never deleted by feature-flag rollback.

## Acceptance matrix

- checked/unchecked defaults and exact Arabic label;
- logout success/failure/timeout;
- zero, one and many unresolved commands;
- crash at every purge step;
- two tabs and page/service-worker race;
- exact namespace versus account/tenant/branch/device mismatch;
- media shared-reference behavior;
- byte-identical unrelated namespaces;
- zero plaintext/keys/PII in logs;
- no business dispatch during logout/purge;
- application rollback with new encrypted schema.

## Human decisions

- Approve proposed destructive-warning wording.
- Approve whether purge of unresolved commands is permitted after second confirmation or must require support authorization.
- Approve retention of a non-sensitive local purge receipt.

