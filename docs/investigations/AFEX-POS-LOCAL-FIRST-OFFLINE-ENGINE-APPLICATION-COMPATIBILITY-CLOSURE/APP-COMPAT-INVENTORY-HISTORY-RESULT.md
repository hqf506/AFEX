# Inventory history result

## V2 contract

The disabled-by-default dedicated `GET /api/admin/inventory-movements/v2` route implements:

- default page size `10`, maximum `50`;
- default UTC window `30` days, maximum `366` days;
- strict parameter allowlist with duplicate/alias rejection;
- deterministic `created_at DESC, id DESC` ordering;
- a stable base64url cursor containing `created_at`, `id`, and a SHA-256 query-scope binding;
- equal-timestamp continuation using `created_at < cursor.created_at OR (created_at = cursor.created_at AND id < cursor.id)`;
- rejection when a cursor is reused with a different tenant, resolved branch, UTC window, movement type, or search value;
- maximum input lengths of `120` for search, `64` for movement type, and `128` for a requested branch ID;
- explicit success response typing;
- bounded Arabic errors and a safe empty row array;
- trusted tenant filtering and assigned-branch denial;
- at most one movements query plus two parallel enrichment queries, matching the existing maximum query count.

The view exposes `id`; therefore the stable cursor subtask was possible. No index or view change was made.

## Compatibility

The current page-number route is restored to its baseline Git blob (`e27dd89a2572f2bbf0c8d6e6f137932c4f6ec1d8`) and the current page still calls only `/api/admin/inventory-movements`. Enabling `AFEX_INVENTORY_HISTORY_CONTRACT_V2=true` exposes only the separate v2 route and therefore cannot feed a cursor response into the legacy parser. Existing admin/system branch filtering remains available, while assigned users cannot select another branch and every movements and enrichment query remains tenant-filtered server-side.

The current UI aborts its prior request and retains its sequence guard, so cancelled or stale responses cannot replace the newest result. The v2 server query also binds the incoming request abort signal.
