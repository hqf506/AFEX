# Inventory Authority Assessment

## Current authoritative path

`inventory_stock` is keyed uniquely by tenant, branch, and catalog item. `invoice_items` has an insert trigger that deducts tracked stock, locks the relevant stock row, rejects insufficient stock, and writes an inventory movement. Core V2 pre-locks tracked inventory rows in sorted item order before persisting the order and invoice, so the authoritative order, invoice items, decrement, movements, and Core links commit atomically.

The one-device-per-branch assumption reduces offline coordination but does not eliminate concurrent online sales, administrator adjustments, cancellation, or another service path.

## Cancellation and manual adjustment

The repository cancellation route updates invoice payment state and then invokes `restore_inventory_for_cancelled_invoice`. The repository migration uses a tenant/invoice advisory transaction lock and an existing `sale_void` movement test to make restoration retryable. Production is materially drifted: the deployed function returns `void` with MD5 `71ca89c7e85e976071f4ae8a3aae96c8`, while the repository's later migration declares a JSON result and SHA-256 `58cd9cb60355d52589c57c285de59f9532edc85b9b904205d44ef4350f004452`.

The legacy `adjust_inventory_stock` function is broadly executable under current ACLs and the table has no database check that quantity-on-hand remains nonnegative. Core V2 prevents oversell in its own path, but this does not prove every legacy/manual path is safe. This surface requires an independent privilege and body review before Offline rollout.

## Offline reconciliation evidence

The server must receive and verify:

- last confirmed stock version or authoritative frontier per tenant/branch/item;
- local pending/syncing quantities in deterministic item order;
- immutable catalog and tracking-mode versions;
- device and POS employee authority generations;
- command and payload hashes;
- authoritative current stock under server locks.

The server must recompute availability. A device assertion that local stock never went below zero is evidence, not authoritative stock. A conflict after payment attestation must be retained for management review and must not be silently discarded.

## Conclusion

Core V2 inventory locking is reusable. Offline inventory acceptance, cancellation parity, and the legacy manual adjustment surface are not approved. Production ACL hardening and the cancellation drift decision precede Phase 5.
