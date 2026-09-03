# Core V2 Replay Security Assessment

## Classification

`PRESENT_BUT_INSUFFICIENT_FOR_OFFLINE_AUTHORITY`

## Safe and reusable

Core V2 persists an immutable canonical payload and fingerprint, unique tenant/branch/type/idempotency identity, authorization context, bounded claim lease, attempts, business and line links, audit stream, diagnostics, and stable success response. Execution serializes duplicate commands and locks catalog/inventory rows deterministically. Official numbers and inventory changes commit with the business transaction. Exact replay returns the stored response and does not reissue a number.

Production evidence recorded 12 commands, 12 successes, 12 claims, 12 business links, 13 line links, and 12 stable receipts, with no diagnostics or retry authorizations. This proves deployment and use, not Offline load safety.

## Security insufficiency

`app/api/orders/route.ts:1311-1321` passes `auth.user.id` as `authenticated_actor_id`. The trusted POS actor resolved earlier is optional attribution and is patched onto order/inventory/audit records after the Core transaction (`app/api/orders/route.ts:1519-1615`). The Core authorization context has no registered device ID/generation, Offline employee credential/PIN generation, permission generation, signed allowlist, or offline envelope hash.

`replay_atomic_order_command_v1(uuid)` is service-role reachable and command-ID based. It classifies succeeded/in-progress/reconciliation/failure states, but does not revalidate POS actor revocation, a device, or Offline generations. The five-state command machine is not a business-review state machine.

## Offline requirements before reuse

1. Acquisition must bind Primary Auth audit subject and actual POS employee, tenant, branch, registered device/generation, credential/PIN/permission generations, signed package/version, and command envelope hash.
2. Trusted reconnect and acquisition must revalidate revocation/generation without trusting client identity fields.
3. Exact duplicate replay must remain automatic and return the original response; a generation change must not rewrite attribution.
4. True business conflicts must enter a separate review container, not `failed_retryable` or `failed_final`.
5. Payment attestation and effect intent must be written atomically with acceptance; providers must not be invoked inside Core replay.
6. The eight payment representations require one approved canonical mapping before acquisition.

## Decision

Core V2 is the correct durable idempotency substrate. It is not yet an Offline command authority. Core completion is mandatory before dispatch, replay, review workflow, or pilot.
