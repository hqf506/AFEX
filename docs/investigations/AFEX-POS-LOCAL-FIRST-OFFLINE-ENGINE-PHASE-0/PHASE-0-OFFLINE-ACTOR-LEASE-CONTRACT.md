# Phase 0 Offline Actor Lease Contract

## Status

`PROPOSED_PENDING_HUMAN_SECURITY_AND_PRODUCT_APPROVAL`

This contract defines required claims and policy. It does not invent or authorize a server implementation.

## Proposed default durations

- **Read lease:** 24 hours absolute from server issuance.
- **Business-command lease:** 2 hours absolute from server issuance.
- **Disconnected business duration:** maximum 2 hours and never beyond the command lease.
- **Offline refresh:** prohibited. A disconnected device cannot extend either lease.

These are conservative initial values and remain subject to human approval.

## Issuance

The future lease is:

- server-issued and cryptographically signed;
- bound to an approved device cache identity;
- scoped to explicit command types/capabilities;
- bound to tenant and branch;
- bound to distinct `primarySubjectId` and `effectivePosEmployeeId` claims;
- linked to primary session lineage and POS actor authority without exposing raw session tokens;
- versioned and assigned a unique lease ID;
- issued only after current Primary Auth and POS actor/PIN validation.

No browser-supplied employee, tenant, branch, role, capability or expiry becomes authority.

## Required claim set

```text
leaseVersion
leaseId
deviceCacheId
primarySubjectId
primarySessionLineage
tenantId
branchId
effectivePosEmployeeId
effectivePosActorSource
capabilities[]
issuedAtServer
notBeforeServer
readExpiresAtServer
commandExpiresAtServer
revocationEpoch
keyVersion
maximumOrderAmountSar
maximumUnsyncedValueSar
maximumPendingOrders
```

The exact encoding/signature mechanism is deferred to the reviewed server/device authority design.

## Time validation

1. Store the server issuance time and local monotonic timestamp at receipt.
2. Compute elapsed lease time from monotonic elapsed time where available.
3. Treat wall-clock rollback, impossible forward jump, monotonic reset without online confirmation, or missing time anchor as `TIME_AUTHORITY_UNCERTAIN`.
4. Uncertain time blocks new financial commands.
5. It may preserve encrypted evidence and, only while a separately provable read lease remains valid, read-only cached views.
6. Riyadh business date and month remain server-authoritative.

## Revocation

- The lease contains the last observed server revocation epoch.
- Every connectivity return performs an authenticated preflight before dispatch or dataset unlock extension.
- A newer epoch, revoked POS actor, reassigned employee/branch/tenant or disabled device locks the namespace and sets unsubmitted commands to `blocked` pending review.
- No disconnected client can know immediate revocation. Human risk acceptance is mandatory for the residual exposure window.

## Capabilities

Initial pilot capability list:

```text
cache.read.catalog
cache.read.customers
cache.read.orders
cache.read.invoices
draft.write
command.enqueue.order.create.cash
```

Not included:

```text
customer.create
customer.update
order.status.transition
payment.capture
payment.refund
inventory.write
settings.write
provider.whatsapp
provider.payment
official.number.allocate
```

## Expiry behavior

- Expired command lease: block new commands; preserve drafts, pending commands and evidence.
- Commands immutably created before expiry may be dispatched only if the reviewed server policy validates creation-time authority and current revocation state. Otherwise they become `blocked` for reauthorization/replacement.
- Expired read lease: destroy in-memory DEK references and lock plaintext; retain ciphertext.
- Lease renewal requires online Primary Auth plus valid POS actor/PIN authority. It is not automatic while disconnected.

## PIN prohibition

- No local PIN verifier, hash, salt, derived key, brute-force oracle or offline PIN authentication database.
- PIN is never an encryption key or key-encryption input.
- Existing online PIN validation remains the authority that may lead to server lease issuance.

## Audit and evidence

Local command evidence records lease ID/version, actor/subject IDs, scope, capability, issuance/expiry and payload fingerprint. It never records PIN, raw token, signature private material or customer payload in logs. Server command authority must preserve primary and effective actor identities separately.

## Acceptance tests

- valid/expired/not-yet-valid lease;
- device, tenant, branch, primary subject and employee mismatch;
- missing capability and command limit exceeded;
- clock rollback/advance/monotonic reset;
- revocation epoch increase on reconnect;
- actor reassignment and device disable;
- read lease valid while command lease expired;
- no local PIN material or browser employee-authority path;
- lease cannot be refreshed offline.

