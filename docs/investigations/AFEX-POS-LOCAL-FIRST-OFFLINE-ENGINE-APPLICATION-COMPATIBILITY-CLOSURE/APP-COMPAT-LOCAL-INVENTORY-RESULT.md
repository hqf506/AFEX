# Local inventory projection result

The pure projection implements:

`localAvailable = max(0, lastConfirmedBranchStock - localPendingQuantity - localSyncingQuantity)`

It requires exact namespace and catalog-item matches plus a trusted snapshot ID, timestamp, and non-negative integer stock. Missing or mismatched snapshots fail closed. Restored Phase 3 records are reconstructed only from `order.create` commands in `pending` or `syncing` state. Other namespaces, command types, and states are ignored. Idempotency keys deduplicate retries and repeated item rows are aggregated before projection.

The two outcomes remain distinct:

- `localAvailable === 0`: `نفدت الكمية المتاحة وفق آخر تحديث للمخزون. يرجى الاتصال بالإنترنت لتحديث المخزون والتحقق من الرصيد.`
- `localAvailable > 0 && requestedQuantity > localAvailable`: `الكمية المتاحة غير كافية. المتاح حاليًا: {localAvailable}`

The function never returns negative availability, never mutates server stock, and treats snapshot age as informational only. Business enforcement is hard-disabled because a trusted server snapshot/frontier and persistent unwrap authority remain unavailable in this phase.
