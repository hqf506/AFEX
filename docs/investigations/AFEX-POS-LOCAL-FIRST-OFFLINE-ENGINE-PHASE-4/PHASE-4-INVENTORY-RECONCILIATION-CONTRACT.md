# Phase 4 Inventory Reconciliation Contract

## Local availability

For each branch catalog item:

`localAvailable = max(0, lastConfirmedBranchStock - pendingAndSyncingLocalCommitments)`.

The last confirmed snapshot and every local commitment are encrypted and durable only after persistent-cache and outbox gates are approved. Sealing an order decrements local availability. Restart reconstructs commitments from immutable pending commands. The client never permits the calculated value below zero.

When `localAvailable === 0`, the UI must block the quantity increase and show exactly:

> نفدت الكمية المتاحة وفق آخر تحديث للمخزون. يرجى الاتصال بالإنترنت لتحديث المخزون والتحقق من الرصيد.

When `localAvailable > 0` but the requested quantity exceeds `localAvailable`, the UI must block the quantity increase and show:

> الكمية المتاحة غير كافية. المتاح حاليًا: {localAvailable}

These are distinct outcomes. The positive-balance message never replaces the zero-balance message, and the zero-balance message never hides the exact remaining positive quantity.

## Snapshot authority

A snapshot is a server receipt, not a loose quantity list. It requires:

- tenant and branch;
- server-issued snapshot ID/version and generated-at timestamp;
- item ID, authoritative quantity, item/version state;
- a monotonic branch inventory frontier or equivalent immutable base token;
- the latest included server command/sequence frontier;
- hash/signature or authenticated server response identity;
- exact synchronization date/time and age for visibility only; neither disables reads nor commands.

Current `inventory_stock.quantity_on_hand` and `updated_at` do not by themselves prove a consistent multi-item snapshot or which local commands are already included.

## Sync algorithm

1. Acquire/execute commands in local sequence and dependency order.
2. For each result, persist the canonical server receipt before changing local commitments.
3. Mark a commitment acknowledged only if the receipt identifies the exact local/server command and inventory mutation.
4. Fetch a new branch snapshot with an inclusion frontier.
5. Remove from local subtraction only commands proven included in that snapshot; retain later pending commitments.
6. Recompute local availability. Never add a quantity merely because a network call succeeded.

This frontier prevents double deduction when refreshed stock already includes a synchronized sale. Restart rebuilds `pendingAndSyncingLocalCommitments` from immutable command/receipt states before allowing a new quantity change.

## Cancellation

An unsynced locally cancelled order may release its commitment only if it has never been acquired by the server, no receipt/effect exists, and all dependent commands are also cancelled/blocked. Once acquired or synchronized, inventory is released only by an authorized server cancel/refund command and receipt.

## Concurrent server activity

The one-device rule reduces local concurrency but does not stop administrators, integrations, online tills, returns, or stock adjustments while the device is offline. Server execution performs authoritative stock validation and may reject an offline command for insufficient inventory. The client cannot auto-adjust quantities or payment attestation; employee action is required. Negative inventory and silent quantity adjustment are forbidden.

## Visibility and old snapshots

The UI exposes the local snapshot marker, snapshot time, inventory frontier, exact last-sync date/time and age, and a warning that remote changes may be unknown. Old snapshot or synchronization age is never a lockout condition. Manual “Sync now” and automatic synchronization on trusted return update the frontier only after verified server receipts.

## Conflict and commitment policy

- Retryable transport/Core unavailability: retain commitment.
- Successful receipt: reconcile by inclusion frontier.
- Insufficient inventory or stale catalog/VAT conflict: retain as blocked until employee resolves; do not silently release a payment-attested command.
- Explicit local cancellation before acquisition: release.
- Terminal malformed/authority rejection: quarantine; release only under the conflict matrix and recorded employee/manager action.

## Required server work

Before a pilot, Core V2 needs a consistent branch snapshot endpoint/function, immutable snapshot token/frontier, item-level version information, receipt inventory mutation summary, batch reconciliation lookup, and indexes for branch/item/frontier hot paths.
