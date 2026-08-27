# Inventory-history compatibility

## Approved target

- Route: `GET /api/admin/inventory-movements`
- Browser direct relation/view access: none
- Page size: default 10, maximum 50
- UTC window: default 30 days, maximum 366 days
- Order: `created_at DESC, id DESC`
- Tenant and branch: trusted server authority
- Pagination: deterministic across equal timestamps and concurrent inserts

## Current implementation

The existing route is `app/api/admin/inventory-movements/route.ts`.

Statically proven behavior:

- It calls `requireApiAuth` and restricts the role.
- It derives tenant identity from the trusted profile.
- It restricts branch selection according to trusted branch access.
- It uses `lib/supabase/admin.ts`; therefore RLS is bypassed and those route guards are mandatory.
- It queries `inventory_movements_view`.
- Default page size is 10 and maximum page size is 50.
- It orders by `created_at DESC`.
- It additionally queries `catalog_items` and `branches` for enrichment.

Contract gaps:

- No default 30-day UTC window.
- No validated maximum 366-day UTC window.
- No secondary `id DESC` order.
- Offset/page pagination, not a stable `created_at,id` cursor.
- Route fields and `app/admin/inventory/movements/page.tsx` consumer fields differ; the UI normalizer tolerates missing/aliased properties and can silently render nulls.
- The UI guards stale writes with a request sequence, but does not cancel the prior network request with `AbortController`.
- The current query fan-out is three relation requests per page.
- Existing indexes cover tenant/created time and tenant/branch/catalog/created time, but repository migration evidence does not prove an index ending in `id DESC` for the target deterministic order.

## Browser caller result

The live inventory-history page fetches the trusted route. No live direct browser caller of `inventory_movements` or `inventory_movements_view` was identified. Tests and scripts, where present, are marked non-live in the inventory. This is static repository proof, not a runtime route trace.

## Target response mapping

The route should define one explicit stable response schema rather than preserve a permissive UI alias matrix. Fields currently selected include movement and scope IDs, movement type, quantity delta, source/notes, created time, item/branch names, and resolved actor labels. The consumer additionally expects tenant/source/creator/actor-role/position/resolved-invoice fields. Human review must choose and freeze the minimum supported response before any view/table access removal.

## Pagination and race constraints

A stable cursor must carry both `created_at` and `id`. A next page must be strictly older than the last tuple in descending order. The route must compute the default and maximum window in UTC. Page size parsing must fail safely or clamp under a documented contract. Browser requests must either abort prior requests or preserve the existing request-sequence stale-result guard; removing both would reintroduce stale UI.

## Compatibility verdict

- Trusted route identity: **present**.
- Browser-only route access: **statically proven**.
- Page 10/default and 50/max: **compatible**.
- UTC 30/default and 366/max: **missing**.
- Deterministic `created_at,id` order: **missing**.
- Response schema and cursor: **not frozen**.
- Required work class: `BLOCKED_REPOSITORY_GAP`.
- SQL/view privilege changes remain blocked until route and consumer contract tests pass.


