# Authority Correction Executive Design

## Selected architecture

AFEX will converge on one mutation engine: Core V2. Legacy business tables remain the committed business projection where required, but direct browser writes and legacy invoice/inventory/cancellation entry points are retired or made server-only. Modern Core and POS actor owners remain intact; new Offline device, employee, review and effect domains receive distinct non-login owners and narrow runtime callers.

The target has five explicit planes:

1. **Direct authenticated read plane:** only scoped catalog/branch-price/VAT reads and the narrow customer phone lookup RPC. It contains no direct `profiles`, `inventory_movements`, or `inventory_movements_view` access.
2. **Trusted Next.js server plane:** the shared profile-presentation/account context, inventory-movement history, customer creation, business history, order status, cancellation, inventory administration, enrollment, unwrap package retrieval, acquisition, receipt lookup and reconciliation.
3. **Core transaction plane:** immutable acquisition, actor/device/generation validation, order/invoice/numbering/stock/audit persistence, receipt snapshot and effect-intent creation.
4. **Offline authority plane:** one active registered device per branch, event-governed employee packages, key-envelope metadata, generation validation and no time expiry.
5. **Review/effect plane:** a dedicated immutable business-review container plus a separately claimed transactional effect ledger.

## Direct access decision

Direct authenticated table writes are removed. Direct authenticated table reads remain only for the scoped catalog, branch-price and VAT projections where both exact object/column grants and independently authoritative row predicates are proved. Customer phone lookup remains a narrow authenticated RPC because it returns a bounded identity projection and avoids an unnecessary server hop. Customer creation remains behind the existing trusted server route: duplicate identity resolution, branch attribution and audit are mutations whose authority must not depend on caller-supplied tenant data. The added server hop is bounded and does not affect catalog browsing.

### Profiles access model: selected option C

The design compared (A) column-level `profiles` grants, (B) a browser-readable view, and (C) a trusted server route. Option A was rejected because the captured application uses authority-bearing columns and no complete, reviewed browser column grant exists. Option B was rejected because a security-invoker view would still require underlying relation privileges, while an owner-executed view would need a separately proved non-bypass design. **Option C is selected:** authenticated receives no table-level or column-level `SELECT` on `profiles` and no browser-readable profile view. The existing trusted authorization/account route boundary performs the full server-side authority lookup once and emits one shared presentation projection; pages must reuse that projection rather than add per-page profile lookups. Before revocation, the route's database lookup must move from any user-bound authenticated Supabase client to the exact server-only gateway/wrapper, because executing code on the server does not make an authenticated database role privileged.

The shared browser presentation allowlist is exactly `username`, `full_name`, `contact_email`, `phone`, `tenant_name`, `branch_name`, and `ui_capabilities`. `ui_capabilities` is limited to the existing presentation keys `admin:full`, `orders:read`, `orders:write`, `pos:access`, `reports:read`, and `support:access`; it controls presentation only and is never accepted as request authority. Raw `id` from the profile row, `tenant_id`, `branch_id`, `role`, `is_active`, scope/assignment relations, credential state, security generations and internal metadata are excluded. The authenticated subject identifier remains available from the verified Auth session, not from this projection. Authorization routes continue to read the full trusted profile server-side, and profile self-service writes remain denied.

### Inventory-movement access model: selected option D

The design compared (A) a security-invoker view plus browser base privileges, (B) a server-owned/security-barrier projection, (C) a direct authenticated RPC, and (D) the existing trusted Next.js route. Option A was rejected because it would restore underlying browser `SELECT` and make the base Data API surface part of the security contract. Option B was not selected because a server-owned view alone does not prove row authorization and must not be treated as an RLS substitute. Option C is implementable but would create a second direct browser database entry point when the existing inventory-history page already uses a trusted route. **Option D is selected:** `/api/admin/inventory-movements` is the only browser entry point; `PUBLIC`, `anon`, and `authenticated` receive no privilege on `inventory_movements` or `inventory_movements_view`.

The route caller is a verified active admin authorization context. The server database caller is the trusted server gateway with only the exact server-side read reachability required for the view and its underlying columns; the gateway is never exposed to the browser. The response allowlist is exactly `id`, `branch_id`, `catalog_item_id`, `movement_type`, `quantity_delta`, `source_type`, `notes`, `created_at`, `item_name`, `branch_name`, `resolved_employee_name`, `created_by_name`, `actor_name`, and `actor_type`. Tenant is always constrained by the server-derived profile tenant. An assigned-branch context is pinned to its server-derived branch; a tenant-wide admin may request a branch only within the already constrained tenant. Requests use page numbers with default 10 and maximum 50 rows, require a server-normalized UTC date window, default to the most recent 30 days, reject windows over 366 days, and order by `created_at DESC, id DESC`.

The server gateway may bypass RLS, so this design does not claim RLS as its route authorization. The route must apply the trusted tenant and authorized-branch predicates before execution. Base-table RLS remains forced/closed to browser roles as defense in depth; the server-only view is not a Data API capability for browser roles. Required indexes are `(tenant_id, branch_id, created_at DESC, id DESC)` and `(tenant_id, branch_id, catalog_item_id, created_at DESC, id DESC)`. Cross-tenant, cross-branch, oversized-page, overlong-window and direct Data API negative tests are mandatory. Rollback disables the inventory-history route or returns the last safely cached page; it never restores browser view/base privileges. The existing history page keeps its response fields and filters, but it must initialize a 30-day window and page through bounded windows before Wave 1 may revoke current access.

## Policy model

Every retained direct-access operation has one scoped permissive policy and no broad companion. Tenant and branch derive from a database-trusted profile/branch-membership lookup tied to the authenticated subject. `profiles` and inventory-movement relations have no authenticated browser policy or object privilege in the target. RLS constrains rows and is never cited as column secrecy; response allowlists are enforced by trusted server serialization. Sensitive tables have no browser grants and use forced RLS as defense in depth behind owner functions.

## Privileged routine model

Every retained definer has one purpose, a non-login owner, fixed trusted path, qualified references, narrow caller, bounded inputs/outputs, internal tenant/branch/actor/device validation, immutable audit identity and hostile/concurrency tests. Sensitive routines receive no PUBLIC, anon or general authenticated execution. Trigger functions are trigger-only. The customer lookup RPC is the only retained direct authenticated privileged business helper; it derives authority internally and returns minimal fields.

## Offline authority and replay

Device and employee packages are event-governed, not time-limited. Core acquisition atomically records both the Primary Auth audit subject and the actual POS employee, plus tenant, branch, device and all credential/permission/package generations. Exact duplicates return the original receipt; fingerprint conflicts never rewrite payload; generation/revocation conflicts enter review without actor rebinding.

## Business conflicts and effects

A dedicated review container is selected instead of overloading the technical Core execution state. It preserves the original command and actor, supports payment/inventory/authority evidence, and records authorized resolution as a new causally linked action. External calls are represented by a unique transactional intent `(serverCommandId, effectType, effectVersion)` and executed only by trusted workers after commit.

## Migration posture

Correction proceeds in ten dependency-ordered waves: prove and deploy compatible trusted replacements before any revocation, close legacy ACL/defaults; replace RLS; retire/harden definers; add device/employee authority; add persistent unwrap metadata; bridge Core actor/device authority; add review/payment/inventory/effect authority; capture and hostile-test the effective catalog; integrate clients behind disabled flags; qualify a one-branch pilot. Wave 1 stops if the actual caller inventory shows any removed read or write without a compatible tested replacement. No wave may skip its proof or rollback gate, and rollback never restores broad privileges.

## Phase gate

The architecture is implementable but not implementation-authorized. SQL design may begin only after human approval of this package and in a separate review. Prompt 8 may begin only after the same approval. Phase 5 remains blocked until the database, Core, device, employee, replay, review, payment, inventory and effect prerequisites are implemented and qualified.
