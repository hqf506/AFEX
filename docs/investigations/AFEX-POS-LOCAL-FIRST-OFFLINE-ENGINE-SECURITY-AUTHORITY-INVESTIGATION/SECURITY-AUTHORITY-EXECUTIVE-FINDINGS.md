# Security Authority Executive Findings

## Primary conclusion

The Production authority model is not uniformly unsafe. The newer Core V2 and POS actor-session domains use dedicated non-login owners, forced RLS, restricted schemas, narrow function entry points, immutable command identity, and server-only execution. The legacy public business domain remains unsafe as an Offline acceptance foundation because broad table ACLs, broad permissive authenticated policies, and broadly executable `SECURITY DEFINER` functions coexist with later tenant-scoped policies.

PostgreSQL combines permissive policies with `OR`. For `customers`, `orders`, `invoices`, and `invoice_items`, a broad policy such as `auth.role() = 'authenticated'` therefore makes the accompanying `tenant_id = current_profile_tenant_id()` policy non-restrictive for the same command. This is a proven direct authenticated Data API isolation defect, not a theoretical concern.

## Causal findings

1. Historical defaults granted broad table and sequence privileges to `anon`, `authenticated`, and `service_role` on many public objects. Table grants provide reachability; RLS must then be correct for every direct client operation.
2. Broad policies target `PUBLIC` and test `auth.role()`, while scoped policies target `authenticated`. Both are permissive, so their result is broad-policy OR scoped-policy.
3. The same legacy domain exposes multiple owner-privileged functions to `anon`/`authenticated`, including invoice creation, inventory adjustment, cancellation restoration, and PIN helpers. Body checks vary, and `SECURITY DEFINER` bypasses caller table limits through the owner.
4. Legacy functions commonly use `search_path=public` or include mutable schemas; one trigger function has no explicit search path. This increases name-resolution risk and makes least-privilege review harder.
5. The trusted order route validates an online POS actor, but Core acquisition receives `auth.user.id`; the actual POS employee is patched onto business/audit data after Core persistence. Device and POS credential generations are not part of Core authority.
6. Exact Core duplicate replay is strong, but replay does not revalidate a POS actor session, device generation, PIN generation, or Offline authorization envelope.
7. No registered device authority, immutable Offline employee authorization object, business-review container, provider-independent payment attestation, or durable external-effect ledger exists.
8. Inventory is safe inside the Core path because stock rows are locked and the invoice-item trigger fails on insufficient stock. Legacy manual adjustment has broad reachability and no database nonnegative constraint. Production cancellation logic is drifted from the repository.

## What is reusable

- Core V2 command/payload ledger, fingerprints, claims, atomic business links, stable response snapshot, numbering, and deterministic inventory lock order.
- POS actor issuance/validation/revocation functions and forced-RLS authority tables for online requests.
- Customer phone identity normalization and tenant-aware lookup/create helpers, subject to retaining their narrow execution ACLs.
- `inventory_movements_view` with `security_invoker=on`.
- Client-side connection/sync presentation, local projection, zero-stock guard, and redacted diagnostics behind disabled flags.

## What is blocked

- Persistent unwrap and any sensitive Offline read until device/employee authority is installed and independently qualified.
- Durable command outbox until immutable device + employee generation + permission binding exists.
- Dispatch/replay until Core acquisition revalidates those bindings and true business conflicts have a review container.
- WhatsApp/outbound effects until a transactional effect intent and claimed dispatcher exist.
- Pilot and Phase 5 until the legacy RLS/ACL/definer surface is separately corrected and re-attested.

## Human review position

The evidence is sufficient to complete the causality investigation and select a minimum dependency order. It is not sufficient to approve a correction implementation: a new current post-correction catalog capture is required after any separately authorized security change.
