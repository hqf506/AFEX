# Authority Correction Core V2 Bridge

## Atomic authorization context

Core acquisition must persist two distinct actors in the same transaction:

1. Primary Auth audit subject, representing the organization account/session used at acquisition.
2. Actual POS employee who sealed and performed the command.

The context also binds tenant, branch, device ID and authority generation, employee credential/PIN/permission/revocation generations, package/key-envelope/namespace generations, local command ID, aggregate ID, sequence, dependency projection, command type, payload fingerprint, envelope projection hash, idempotency identity, causation and non-sensitive correlation ID.

Every field is immutable after first acquisition. Browser values are evidence to compare with trusted records, never authority. Replay never substitutes the current employee or falls back to Primary Auth.

## Acquisition outcomes

- **First acquisition:** validate current Primary Auth/tenant/branch; registered active device and proof; employee/package status and generations; command allowlist; local sequence/dependency closure; canonical fingerprint; then atomically create command, payload, authority context, Offline binding and claim eligibility.
- **Exact duplicate:** same scoped idempotency identity and fingerprint returns stored command/state/receipt. The employee and device remain the originals.
- **Fingerprint conflict:** same identity with different semantic fingerprint returns a terminal conflict and never changes stored payload.
- **In progress:** return command ID and bounded retry guidance; no parallel executor.
- **Success:** return the exact persisted canonical receipt without execution.
- **Revoked employee/device or generation mismatch:** preserve original command/attestation, deny normal execution and open or link a review case according to policy.
- **Unknown transport result:** receipt lookup precedes any retry.

## Execution boundary

The Core transaction owns order, invoice, line items, official numbering, authoritative stock mutation, server-derived audit, canonical receipt and transactional effect-intent insertion. Post-success actor patches, best-effort audit and intent creation outside this transaction are removed from the authoritative path.

Customer create/resolve may occur inside the transaction through the hardened identity helper. Price, VAT, customer, branch and inventory state are revalidated from authoritative server records. Employee payment attestation is immutable input evidence but provider state is server-derived.

## Receipt

The stable receipt records schema/version, server/local command IDs, tenant/branch, device and generations, POS employee, Primary Auth audit subject, command identity/fingerprints/dependencies, accepted or review classification, official order/invoice identities when committed, payment attestation/provider/reconciliation state, inventory mutation summary and inclusion frontier, review reference, effect references and result snapshot hash.

It excludes credentials, PIN/key material, provider secrets and avoidable PII. Batch receipt lookup validates current account/tenant/branch/device scope and uses bounded set-based lookup.

## Revocation semantics

Revocation learned before acquisition blocks acquisition. A command sealed before remote change remains attributed to its original actor and may enter review; it is never rewritten. A successful terminal receipt remains replayable to an authorized scoped reader even if later revocation occurs, because lookup reports historical truth rather than authorizing a new effect. New execution/effects still require the original transaction's recorded eligibility.

## Compatibility and rollout

Existing Online signatures remain available only during a bounded compatibility window. The route chooses online-context acquisition for existing online requests and generation-bound acquisition for disabled Offline test traffic. Both converge on the same command ledger and receipt. No legacy mutation fallback is allowed after an Offline command is acquired.

Performance target is one authority join-set per acquisition, receipt-first replay, indexed device/employee/generation lookups, bounded dependency checks and unchanged deterministic business lock order.
