# CA-004 — Inventory snapshot/frontier authority

**Final classification:** `BLOCKED_SQL_DESIGN_REQUIRED`.

No snapshot or frontier relation/function exists in the bounded Production catalog. Current authority is:

- `inventory_stock(tenant_id,branch_id,catalog_item_id)` with a validated unique constraint and matching indexes.
- `inventory_movements` with tenant/branch/item/time indexes and lifecycle types including sale/sale_void.
- `catalog_items` and `branch_catalog_items`.
- legacy SECURITY DEFINER adjustment/restoration/deduction paths that require separate retirement/hardening review.

**Recommended future scope:** store `tenant_id` and `branch_id` on snapshot items and bind them through a composite FK to an immutable snapshot header. This keeps exported encrypted rows self-describing, allows exact-scope purge and reconstruction, and prevents a detached item from being reattached to a different branch. The extra index width is preferable to mandatory header joins in every Offline reader. This is an evidence-backed design recommendation, not executable SQL.

The approved local projection remains:

`localAvailable = max(0, lastConfirmedBranchStock - pendingAndSyncingLocalCommitments)`

At `localAvailable === 0`:

نفدت الكمية المتاحة وفق آخر تحديث للمخزون. يرجى الاتصال بالإنترنت لتحديث المخزون والتحقق من الرصيد.

At `localAvailable > 0` and requested quantity exceeds it:

الكمية المتاحة غير كافية. المتاح حاليًا: {localAvailable}

Connectivity remains opportunistic, and snapshot age is informational only.

