# Server Review Container Assessment

## Existing objects

The atomic command ledger can retain an immutable command identity, request fingerprint, canonical payload, tenant, branch, Primary Auth actor, result snapshot, failure code, and order/invoice link. The reconciliation functions can place a technical manual hold, authorize a retry, resolve a hold, and record bounded audit events.

## Why reuse is incomplete

The existing state machine has no business-review states. No deployed atomic table has columns for device identity, POS employee credential generation, payment attestation semantics, stock frontier evidence, pricing/VAT review projection, resolution actor, resolution timestamp, refund requirement, or external-effect state. The inspect function is command-id based and service-role scoped, not a complete tenant/branch management queue.

Technical retries and exact duplicates should continue to resolve automatically in the Core ledger. Overloading `failed_retryable` or `failed_final` to mean human business conflict would collapse unrelated semantics and would not meet the approved product contract.

## Decision

A separately reviewed migration is required for either:

- a dedicated review container linked one-to-one to the Core command; or
- a rigorously versioned extension of Core tables and functions with explicit state transitions and management ACLs.

The first option is safer because it keeps the current successful idempotency and execution state machine closed. No schema choice is approved by this attestation.

Required immutable fields are local command id, idempotency hash, payload hash/version, tenant, branch, device generation, POS employee generation, offline/sync timestamps, payment attestation, financial snapshot hash, stock frontier hash, conflict classification, original/resulting official references, resolution authority/timestamp, refund requirement, and external-effect disposition.
