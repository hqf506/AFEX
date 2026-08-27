# Authority Correction Inventory Contract

## Local authority

The required calculation remains:

`localAvailable = max(0, lastConfirmedBranchStock - pendingAndSyncingLocalCommitments)`

The server-confirmed branch snapshot and every sealed local commitment are encrypted and durable. Restart reconstructs commitments from immutable pending/syncing command state before quantity changes are allowed. Neither client calculation nor reconciliation may produce negative availability or silently reduce a requested quantity.

When `localAvailable === 0`, block the increase and display exactly:

> نفدت الكمية المتاحة وفق آخر تحديث للمخزون. يرجى الاتصال بالإنترنت لتحديث المخزون والتحقق من الرصيد.

When `localAvailable > 0 && requestedQuantity > localAvailable`, block the increase and display:

> الكمية المتاحة غير كافية. المتاح حاليًا: {localAvailable}

These conditions and messages remain distinct.

## Snapshot and frontier

A consistent branch snapshot contains snapshot ID/version, tenant, branch, generated-at evidence, branch frontier, included server-command frontier, canonical snapshot hash and item rows with item ID/version, authoritative quantity and item state. Generated time and synchronization age are visibility only.

The snapshot service reads a consistent database view and returns a bounded projection through a trusted route. It does not expose base-table mutation. The branch frontier is monotonic and proves which acquired commands are included; updated timestamps alone are insufficient.

## Command and receipt

Sealing `order.create` creates a durable commitment by item and quantity. Core validates authoritative catalog/version/price/VAT and locks stock rows in deterministic item order. Success records the exact before/after mutation summary and server frontier in the canonical receipt. Insufficient stock creates a business review conflict; Core never allows negative stock.

Reconciliation persists the receipt before changing local command/commitment state, fetches a new snapshot/frontier, removes only commitments proven included, and keeps later pending commitments. Set-based batch receipt and snapshot operations avoid N+1 calls.

## Cancellation

An unsynced local cancellation may release its commitment only when the command was never server-acquired, no receipt/effect exists and no live dependent command remains. Once acquired, stock changes only through an authorized server cancellation/refund command and receipt. A payment-attested conflict retains its commitment until explicit adjudication; no automatic release hides business exposure.

Concurrent server sales, adjustments, returns and other tills remain possible despite the one-device rule. Server stock is always authoritative at execution.

## Performance and locks

Required access paths are unique tenant/branch/item stock, branch/frontier snapshot, command/item commitment and receipt command identity. Acquisition validates snapshots without locking all branch rows; execution locks only command items in deterministic order. Snapshot pages and reconciliation batches are bounded, and contention/latency thresholds are measured before pilot.

Tests cover zero/partial availability messages, restart reconstruction, repeated receipts, frontier double-deduction prevention, concurrent server mutation, lock ordering, insufficient stock review, local pre-acquisition cancel, acquired cancel and snapshot rollback/corruption.
