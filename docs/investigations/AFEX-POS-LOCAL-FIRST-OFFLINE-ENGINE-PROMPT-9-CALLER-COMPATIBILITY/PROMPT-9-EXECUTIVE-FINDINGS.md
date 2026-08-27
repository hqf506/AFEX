# Prompt 9 executive findings

## Decision summary

Prompt 9 produced a repository-wide static caller and authority compatibility map. It does **not** authorize SQL, Prompt 10, Wave 1, Phase 5, deployment, or any database connection.

What is proven from source:

- The browser/server/service-role Supabase client boundaries are identifiable.
- A complete literal caller scan plus the statically resolved Core/legacy RPC dispatch set produced **437 caller records**: **432 live** and **5 tests/operational tools explicitly marked non-live**.
- Direct browser profile reads remain in `lib/auth.ts` and other UI surfaces.
- `GET /api/admin/inventory-movements` is the live browser path for inventory history, but its contract is incomplete.
- Customer phone lookup and creation already travel through a trusted server route; customer creation is not a browser RPC.
- Core V2 binds the primary authenticated subject, tenant, branch, idempotency key, and payload fingerprint, but it does not atomically bind the actual POS employee, device, or Offline generations.
- Existing role/schema/function/migration evidence is sufficient to enumerate compatibility dependencies, not to revoke privileges or mutate authority.

What remains unproven:

- Current Production ACL/RLS reachability, object ownership, complete policy catalog, external platform callers, and `public` schema CREATE dependencies.
- A validated composite `(branch_id, tenant_id)` identity.
- The full immutable employee/device/generation authority identity.
- A Core command scope closed over actual employee/device/generations.
- Snapshot, review-CAS, payment writer, and effect-ledger identities.
- Runtime response parity, latency, contention, deadlock behavior, and rollback drills.

## Primary compatibility findings

### Profile

The approved target is one trusted route returning exactly:

`username, full_name, contact_email, phone, tenant_name, branch_name, ui_capabilities`.

The existing `/api/account` response is not that contract: it is wrapped, includes `id`, and lacks `ui_capabilities`. Existing browser consumers also use internal role, tenant, branch, and scope fields. Those consumers must move authorization/data access server-side rather than expanding the seven-field presentation response.

### Inventory history

The existing route already enforces trusted server auth and uses a service-role client with tenant/branch filters. It already enforces page size 10 by default and 50 maximum. It does **not** enforce a 30-day default/366-day maximum UTC window; it orders only by `created_at DESC`; and it uses offset pagination rather than a deterministic `created_at,id` cursor. Its response and UI types also drift.

### Customer

Phone normalization, tenant-bound identity lookup, duplicate rejection, and server-side creation are statically present. Browser requests use cancellation/request identity guards. Direct customer update remains an inline server action using the cookie/RLS client. Offline customer creation/update remains blocked because no authoritative Offline identity allocation/reconciliation contract exists.

### Core V2

The route invokes Core with the organization-auth user ID as actor. The POS employee ID is applied later in best-effort patches, outside Core's atomic command. Device and all Offline generation/frontier fields are absent. Existing replay and receipt semantics must be preserved while future Core changes close those authority gaps.

## Prompt 8 disposition

All 13 Prompt 8 SQL files remain non-executable. `CG-01` is statically proven and the repository browser route for `CG-05` is compatibility-mapped, but deployed replacement, runtime denial, Production authority, composite identities, Core changes, rollback qualification, and independent SQL review remain outstanding.

## Safety accounting

- SQL generated: 0
- SQL executed: 0
- Database connections: 0
- Network/Production contacts: 0
- Business writes: 0
- Application/Core/package changes: 0
- Historical package changes: 0
- R8N files opened: 0
- Prompt 10 started: NO
- Phase 5 started: NO


