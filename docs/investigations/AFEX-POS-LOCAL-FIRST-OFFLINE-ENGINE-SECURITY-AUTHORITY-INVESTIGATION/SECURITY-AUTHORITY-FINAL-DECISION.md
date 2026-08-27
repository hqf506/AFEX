# Security Authority Final Decision

## Decision

`AFEX_POS_LOCAL_FIRST_OFFLINE_ENGINE_SECURITY_AUTHORITY_INVESTIGATION_COMPLETE_READY_FOR_HUMAN_REVIEW`

The trusted evidence is sufficient to reconstruct the effective authority failure, distinguish the restricted modern domains from the broad legacy domain, and select a minimum dependency order. It is not an implementation or Production approval.

## Classification

| Category | Objects/capability | Result |
| --- | --- | --- |
| Safe and reusable | Core ledger/fingerprint/claim/atomic persistence/stable receipt; POS actor online session functions and forced-RLS tables; tenant-aware phone helpers with existing narrow ACL; security-invoker inventory view | preserve, do not broaden |
| Application-only before DB work | connectivity/sync UI, local projection, zero-stock guard, redacted diagnostics, disabled scheduling | may be designed/tested only behind disabled flags |
| Requires separate database authority | legacy ACL/RLS/definer closure; device/employee generations; review container; payment attestation; effect ledger; cancellation/inventory invariants | blocks sensitive Offline authority |
| Requires Core completion first | actual POS employee + device/generation binding; replay revocation validation; true-conflict routing; atomic effect intent | blocks dispatch/replay |
| Missing or needs fresh evidence | exact post-correction effective catalog, hostile-body qualification for every retained legacy function, provider idempotency, final view/storage grants, plans/load/lock behavior | must be captured after approved correction |
| Unsafe as-is | direct authenticated legacy business Data API, broad owner-function surface, client employee attribution, payment-status-as-attestation, best-effort WhatsApp/audit as durable ledger | must not underpin Offline acceptance |

## Gates

- Persistent unwrap: BLOCKED by absent installed device/employee authority and independent security qualification.
- Durable outbox: BLOCKED by absent continuous immutable command authority.
- Dispatch/replay: BLOCKED by Core actor/device/revocation bridge and review/effect authority.
- Pilot: BLOCKED by RLS/ACL/definer correction, payment/inventory/effect completion, isolated qualification, and human approval.
- Phase 5: BLOCKED.

## Minimum safe sequence

1. Human approval of this causality report and the retained Mode A decisions.
2. Separately authorized legacy RLS/table/sequence/function ACL correction design and hostile-path review.
3. Fresh read-only catalog attestation proving effective policy and execute reachability.
4. Device + Offline employee generation authority and persistent unwrap qualification.
5. Review/payment/effect database authority design.
6. Core V2 actual actor/device/replay/effect bridge and isolated concurrency qualification.
7. Disabled-by-default client synchronization integration.
8. Preview qualification, then separately approved one-branch managed-device pilot.

## Safety accounting

Application/Core/package/config/test changes: 0. SQL/migration drafts or executions: 0. Database/Production/network connections: 0. Business writes/effects: 0. Historical evidence changes: 0. R8N files inspected or modified: 0. Git writes: 0. Deployments: 0. Phase 5 work: 0.
