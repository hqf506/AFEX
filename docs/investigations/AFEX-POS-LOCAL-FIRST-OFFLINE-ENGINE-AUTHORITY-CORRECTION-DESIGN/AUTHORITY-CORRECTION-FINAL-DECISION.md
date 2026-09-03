# Authority Correction Final Decision

## Decision

`AFEX_POS_LOCAL_FIRST_OFFLINE_ENGINE_AUTHORITY_CORRECTION_DESIGN_ACCESS_MODEL_CORRECTION_COMPLETE_READY_FOR_HUMAN_REVIEW`

The architecture resolves the causal defects without weakening isolation or creating a second mutation engine. It is a reviewable design, not SQL, implementation, deployment or Production approval.

## Exact retained and retired boundaries

Retain and harden the business projection tables, scoped catalog/branch-price/VAT read paths, trusted profile-presentation and inventory-history routes, customer phone identity subsystem, Core V2 ledger/claim/receipt boundary, POS actor-session subsystem, the server-only inventory projection and trigger behavior required by Core. Retire every legacy invoice-creation overload and the drifted cancellation restoration path. Manual inventory and PIN administration become server-only. Legacy numbering and trigger helpers become internal/trigger-only or retire after parity.

Direct authenticated access retained: tenant-scoped active catalog; authorized-branch catalog pricing; current tenant VAT; exact customer phone lookup RPC. Direct authenticated writes retained: none. Authenticated has no `profiles`, `inventory_movements`, or `inventory_movements_view` object privilege.

**Profiles selected model C:** one shared trusted Next.js authorization/account route uses an exact server-only database gateway—not the user-bound authenticated client—and serializes exactly `username`, `full_name`, `contact_email`, `phone`, `tenant_name`, `branch_name`, and the six enumerated UI capability keys. It excludes raw profile identity, tenant/branch identifiers, role/status, assignments, credential/security/generation state and internal metadata. Full authority remains server-side, protected routes re-resolve it, and profile self-service writes remain denied.

**Inventory selected model D:** verified active admins use only `GET /api/admin/inventory-movements`. The route returns the existing 14-column allowlist, applies server-derived tenant and authorized-branch predicates, defaults to 10 and caps at 50 rows, defaults to a 30-day UTC window and rejects spans over 366 days, and orders by `created_at DESC, id DESC`. The security-invoker view is only a server-side implementation detail: the trusted gateway has exact required underlying reachability, while browser roles have neither view nor base privilege. Therefore the design does not contradict security-invoker semantics.

RLS is not used for column secrecy in either model. Column visibility is enforced by trusted server serialization, while base-table RLS remains defense in depth for non-bypass callers. All customer/order/invoice/status/other inventory/audit/config/sequence/Core/Offline/review/effect base-table access is removed from browser roles.

## Implementation classification

- **Without DB changes:** disabled connectivity/sync UI, local projection, exact inventory messages, redacted diagnostics and client adapters may be prepared only behind disabled flags after later authorization.
- **Requires independently reviewed database correction:** legacy ACL/default privilege closure, removal of browser profile/inventory relation reachability, RLS replacement, exact trusted-gateway view/base reachability, definer retirement/hardening, owners/runtime roles, device/employee/envelope authority, review/payment/snapshot/effect/cancellation objects and effective catalog proof.
- **Requires Core V2 changes:** actual POS employee/device/generation acquisition, immutable Offline binding, generation-aware replay, atomic actor/audit/effect intent, complete payment vocabulary, inventory frontier and cancellation receipt.
- **Requires fresh evidence:** post-change role/ACL/RLS/function/view/trigger identities, hostile Data API/RPC tests, concurrency/load/lock behavior and provider idempotency qualification.

## Order and impact

Ten migration waves proceed from privilege closure to RLS, definers, device/employee authority, unwrap metadata, Core bridge, business authority, independent qualification, disabled client integration and pilot readiness. Before Wave 1 revokes anything, the actual caller inventory must prove that every removed read/write has a deployed and tested compatible trusted replacement; any remaining dependency stops the wave. Existing Online Core/POS behavior remains the compatibility path. Rollback disables the affected capability or uses an already qualified trusted route and retains evidence; it never restores broad privileges or legacy Offline mutation.

Security-preserving performance uses one authority lookup per request, indexed predicates, receipt-first replay, bounded batches and deterministic locks. Any budget miss blocks pilot rather than removing authorization.

## Gates

- SQL design may begin: **NO until human approval of this package; afterward only as a separate independently reviewed phase.**
- Prompt 8 may begin: **NO until human approval of this package.**
- Persistent unwrap: **BLOCKED** pending database/device/employee authority and qualification.
- Durable outbox and dispatch/replay: **BLOCKED** pending Core bridge, review, payment, inventory and effect authority.
- First `order.create` pilot: **BLOCKED** pending all ten-wave prerequisites and separate Production approval.
- Phase 5: **BLOCKED**.

## Safety accounting

Application/Core/test/config/package/lock changes: 0. Existing migrations or SQL drafts: 0. Database/Production/network/SQL/business executions: 0. Historical package changes: 0. R8N files inspected or modified: 0. Git writes: 0. Deployments: 0. Phase 5 work: 0.
