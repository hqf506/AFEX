# Legacy Plaintext Migration Result

## Discovery

Known legacy keys are enumerated by key and byte count only; values are not logged. Discovery includes the existing customer, sale-items, checkout, and offline-draft keys.

## Implemented gated flow

1. Require a server-verified namespace and an unlocked key.
2. Hash the legacy value in memory.
3. Import an explicitly verified binding into encrypted drafts.
4. Put an ambiguous binding into encrypted quarantine.
5. Read back and verify the content hash.
6. Remove plaintext only after the encrypted commit and read-back verification.

The flow is idempotent by deterministic legacy record key. It never silently assigns an ambiguous record to the active tenant/branch and never logs the value.

## Logout discovery and explicit cleanup

Logout assessment scans only the four known sensitive AFEX keys and records classification, count, byte size and content hash; it never records values. Because the repository contains no authoritative historical scope binding for these keys, populated records are classified as `ambiguous-unscoped`, never silently assigned to the current account.

Checked scoped purge therefore cannot claim complete device cleanup while these records remain. Broader deletion requires the separate exact confirmation `DELETE_UNSCOPED_AFEX_LEGACY_DRAFTS`, removes only the allowlisted keys and proves each key absent. Theme and unrelated localStorage entries are preserved byte-identically.

## Runtime result

`legacyMigration` is OFF by default because persistent unwrap authority is absent. Therefore no recoverable legacy data was destructively removed during implementation. Synthetic browser tests proved verified import, ambiguous quarantine, read-back verification, explicit allowlisted cleanup, post-cleanup absence and unrelated-key preservation without business dispatch.

Rollback disables new encrypted writes but does not resume plaintext sensitive writes or delete ambiguous evidence.
