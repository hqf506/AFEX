# Phase 0 Rollout, Rollback and Kill Switches

## Rollout principles

- Every capability is separately gated by environment, tenant, branch, device cohort and application/schema compatibility.
- Preview and synthetic/local qualification precede any Production enablement.
- Phase 3 shadow outbox performs zero business dispatch.
- Phase 4 begins with one reviewed branch/device cohort and the approved cash-only limits.
- Rollout does not expand automatically on elapsed time; human review of metrics/conflicts is required.

## Conceptual kill switches

Names are proposed configuration contracts, not implemented variables.

| Switch | Default before phase | Effect when disabled | Must preserve |
|---|---|---|---|
| `offline.local_store` | off | no new encrypted persistence | existing encrypted evidence readable/quarantined by compatible recovery |
| `offline.cache_reads` | off | online reads only; lock cached views | drafts/outbox/receipts |
| `offline.shell` | off | no offline navigation shell activation | local database |
| `offline.outbox_shadow` | off | stop shadow capture | existing shadow evidence until reviewed |
| `offline.order_enqueue` | off | block new offline orders | active drafts and existing commands |
| `offline.order_dispatch` | off | stop command dispatch | receipt lookup/reconciliation and pending commands |
| `offline.external_effect_worker` | off until reviewed | stop new effect claims | claimed/pending effect evidence |
| `offline.logout_purge` | off until Phase 1 passes | retain locked data; do not pretend purge | lock state and tombstones |
| `offline.device_authority` | off | require normal online POS flow | encrypted retained namespaces locked |

Kill-switch ownership and emergency access require explicit human assignment.

## Cohort sequence

1. local synthetic test only;
2. authenticated Preview with synthetic/non-business fixtures;
3. internal non-production managed devices;
4. Production read-cache cohort, no command enqueue;
5. outbox shadow cohort, zero dispatch;
6. one branch/device cash-only command pilot;
7. staged branch expansion after reconciliation/duplicate/security metrics remain within zero-tolerance gates.

## Rollback contract

- Disabling new behavior never deletes drafts, pending commands, receipts, conflicts, tombstones or wrapped keys.
- `offline.order_dispatch=off` stops new dispatch but leaves safe terminal receipt lookup and manual reconciliation available.
- Application rollback must be able to open or quarantine the newest local schema before release approval.
- Forward database migrations are never automatically rolled back.
- Server Core/API compatibility remains available for already issued command versions through the documented retention window.
- A rollback cannot restore plaintext sensitive writes.

## Legacy plaintext policy

1. After encrypted storage activation, no new PII/financial draft is written to `localStorage`.
2. Legacy importer binds a record only to a verified namespace or quarantines it.
3. Ambiguous records are never assigned to the current tenant/branch by convenience.
4. Successfully imported plaintext is deleted only after encrypted commit/hash verification.
5. A disabled feature may preserve encrypted/quarantined records; it may not fall back to new plaintext writes.

## Application/service-worker upgrade and rollback

- A new service worker cannot activate destructively before schema/build compatibility checks.
- Keep the previous compatible shell through the rollback window.
- Never delete all caches indiscriminately when a namespace has unresolved evidence.
- Upgrade/rollback tests cover pending commands, purge tombstones, key rotation and two-tab worker ownership.
- If the previous application cannot safely interpret the new schema, rollout stops.

## Stop/rollback triggers

Immediate disable and incident review for:

- cross-account/tenant/branch disclosure;
- command/effect duplicate;
- wrong employee attribution;
- official number/device-generated number leakage;
- pending command/receipt loss;
- plaintext PII/secret finding;
- unexplained integrity/key/namespace failure;
- logout purge affecting unrelated namespace;
- Core reconciliation/manual-hold rate above approved threshold;
- provider ambiguity without safe outbox evidence.

Performance regression >20% over an approved p95 budget pauses expansion and may disable the affected nonessential capability without deleting evidence.

## Monitoring contract

Metrics contain no PII/payload:

- namespace/schema/build versions;
- cache bytes/records/freshness;
- command states/age/attempt counts;
- conflict/error safe classifications;
- actor lease expiry/revocation classifications;
- claim/replay/reconciliation/manual-hold counts;
- effect claim/delivery/reconciliation counts;
- sync latency, duplicate request count, quota and purge result.

## Rollback verification

- before/after command/receipt/conflict hashes;
- exact namespace counts;
- no plaintext localStorage writes;
- old/new client compatibility matrix;
- service worker and app shell version;
- zero business dispatch when dispatch switch is off;
- no deletion of user-owned untracked/history files.

## Human approvals

- kill-switch owners and emergency procedure;
- Production cohort and expansion criteria;
- reconciliation/manual-hold thresholds;
- minimum client/Core compatibility duration;
- incident retention and privacy classification.

