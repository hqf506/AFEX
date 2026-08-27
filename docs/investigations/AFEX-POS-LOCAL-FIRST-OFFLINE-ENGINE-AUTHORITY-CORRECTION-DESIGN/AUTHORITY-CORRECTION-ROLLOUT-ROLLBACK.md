# Authority Correction Rollout and Rollback

## Rollout order

The ten migration waves in the structured plan are mandatory dependencies, not parallel feature work. Database reachability closes before new authority is introduced. Device/employee authority is installed before persistent unwrap metadata. Core binding precedes review/payment/inventory/effect integration. Independent attestation and hostile qualification precede disabled client integration. Pilot readiness is last.

Every wave records pre-change catalog identities, application callers, performance baseline, lock estimate, monitoring owner, rollback owner and human approval. Compatibility is explicit and time-bounded. No compatibility path restores broad ACL, permissive role-only policies, PUBLIC execution or legacy Offline mutation.

## Kill switches

Required switches are global Offline, tenant, branch, device, employee package issuance, persistent unwrap, command type, acquisition, dispatcher, review resolution, inventory snapshot and cancellation/refund. Defaults remain disabled. Switches stop new activity but do not delete immutable commands, receipts, reviews, effects or audit evidence.

`order.create` is the only first-pilot command candidate. Status changes, cancellations/refunds and provider-confirmed payment are separately gated even when their server designs exist.

## Rollback by domain

- **ACL/RLS/definer correction:** fall back to trusted server routes/read projections; never restore broad direct mutation.
- **Device/employee authority:** stop enrollment/acquisition, revoke test authority under governance and preserve lifecycle evidence.
- **Persistent unwrap:** stop package issuance; lock clients; retain or exact-purge ciphertext according to operator decision.
- **Core bridge:** disable Offline acquisition and use the existing Online Core context; companion evidence remains.
- **Review/payment/inventory/effect:** stop new cases/snapshots/intents/workers, preserve existing immutable states and use manual governed handling.
- **Client integration:** disable flags and return to Online-only UI without touching server evidence.

Unknown transport outcomes always undergo receipt lookup before operator rollback. Rollback cannot rewrite the original command, actor, payment attestation or inventory receipt.

## Monitoring

Monitor authorization denial classes, cross-scope attempts, device/package generation mismatch, acquisition/replay outcomes, claim duplication, inventory conflicts and lock waits, review backlog, effect backlog/ambiguity, cancellation conflicts, route errors and latency percentiles. Logs use opaque identities and classifications only.

Stop conditions include any tenant/branch leak, unexpected direct write/execute, dual-active device, actor rebinding, negative stock, duplicate business/effect result, secret exposure, unexplained deadlock, receipt mismatch or inability to prove zero residual privilege.

## Pilot boundary

Pilot selection requires named branch/device/operators, pre-shift roster, managed-device controls, complete evidence retention, rehearsal of loss/replacement/purge/rollback, current Production read-only attestation after separately authorized changes and explicit Production approval. This design does not provide that approval and does not start Phase 5.
