# Authority Correction Review Container Decision

## Options compared

| Criterion | Dedicated business review container | Extend technical Core reconciliation state |
| --- | --- | --- |
| Coupling | Companion relation linked to immutable command/receipt | Couples business cases to executor recovery states |
| Authority | Dedicated owner/runtime and operator permissions | Reuses technical reconciliation authority too broadly |
| Lifecycle | Multiple evidence/resolution events without command rewrite | Five-state machine becomes overloaded |
| Auditability | Explicit reason, evidence hashes, operator and causation | Business and technical recovery become ambiguous |
| Performance | One optional indexed lookup for reviewed commands | Fewer objects but wider hot state and policy complexity |
| Rollback | Disable review UI/runtime without changing Core command | State rollback risks Core executor behavior |
| Compatibility | Existing Core states remain unchanged | Existing consumers must learn new meanings |

## Selected target

Select a **dedicated business review container** owned by `afex_review_owner`. It is linked to the immutable Core command and optional terminal receipt. Opening a review never edits the original payload, fingerprint, employee, device or payment attestation.

Minimum review identity includes review ID/version, server command, tenant/branch, classification, original actor/device/generations, immutable evidence hashes, payment and inventory commitment state, opened-by system classification, operator assignment, resolution authority, causation, timestamps and status. Evidence payloads are minimal/redacted; large diagnostics remain referenced by hash.

## Cases

The container supports payment collected with stock conflict, stale price/VAT, employee revoked, device replaced/lost, customer duplication/version mismatch, invalid status transition, ambiguous result, malformed command, idempotency conflict and cancellation/refund requirement.

Technical transport failure without a business conflict stays in Core technical reconciliation. A business review may reference technical diagnostics but does not grant retry authority implicitly.

## Resolution

Resolution is an immutable event with exact operator role, tenant/branch scope, expected review version, selected allowed outcome, reason and causation. Outcomes are limited to acknowledge existing receipt, authorize same-command technical retry where safe, request a new corrective/cancellation/refund command, or terminally reject/quarantine. No resolution mutates the original command or rebinds the actor.

Employee-attested payment and stock commitment remain visible until a specific authorized outcome releases or transfers them. Device/employee revocation cannot be bypassed by assigning the review to another employee.

## Performance and rollback

Normal successful commands do not join review details; receipts carry only optional review ID/state. Operator queues use tenant/branch/status/created indexes and bounded pagination. Concurrent resolution is compare-and-set by review version.

Rollback disables new review creation/resolution and returns affected commands to manual hold; existing review evidence remains immutable. It never restores legacy mutation functions.
