# Phase 4 Idempotency and Receipt Contract

## Guarantee

Networks can deliver zero, one, or many attempts. The achievable guarantee is **at-least-once delivery with an idempotent exactly-once server effect**, and only after Core V2 proves a single transaction controls acquisition, order/invoice creation, numbering, stock mutation, audit attribution, receipt persistence, and effect-ledger insertion.

It is incorrect to claim exactly-once network delivery.

## Acquisition identity

The server uniqueness scope remains `(tenant_id, branch_id, command_type, idempotency_key_hash)`. A new one-to-one Offline binding extends—not replaces—the current command ledger with local command ID, local aggregate, registered device, actor employee, event-governed authority generations/allowlists, local sequence, dependency graph, and envelope projection hash.

The canonical semantic payload and its fingerprint are immutable. Encryption nonce/ciphertext layout, retry time, transport headers, and connection metadata do not alter the semantic fingerprint.

## Outcomes

1. **First valid acquisition:** create command, immutable payload, offline binding, and execution claim atomically.
2. **Same key and same fingerprint:** return the existing state or terminal receipt. Never create a second effect.
3. **Same key and different fingerprint:** return `IDEMPOTENCY_FINGERPRINT_CONFLICT`; do not update the stored payload.
4. **In-progress attempt:** return the existing command ID and retry guidance; do not run a parallel executor.
5. **Terminal success:** return the exact persisted canonical receipt.
6. **Terminal conflict/failure:** return the persisted terminal classification and stock/payment commitment policy.

## Canonical server receipt

The terminal receipt must include:

- receipt schema/version and server command ID;
- local command/aggregate references;
- tenant, branch, registered device, POS employee, and primary-account audit references;
- command type, canonical payload fingerprint, envelope projection hash, local sequence, dependencies;
- accepted/rejected state and stable conflict code;
- official order and invoice IDs/numbers only when committed;
- immutable payment acknowledgement and employee attestation;
- inventory mutation summary and stock reconciliation frontier;
- effect ledger references and eligibility states;
- server timestamps and authoritative result snapshot hash.

The receipt must not contain service credentials, PIN material, card secrets, provider tokens, or avoidable PII.

## Atomicity boundary

The present route performs some employee and inventory/audit follow-up after Core success. These must move into the idempotent server transaction or become uniquely keyed server effects before replay is allowed. WhatsApp and other external effects require a semantic key such as `(server_command_id, effect_type, effect_version)` and a durable status machine.

## Receipt lookup

Lookup is authorized by the current account/tenant/branch/device context and exact local command or server command identity. It returns the stored receipt without re-executing. Batch receipt lookup must avoid N+1 queries and preserve per-command authorization.

## Failure semantics

Transport timeout is `unknown`, not `failed`. The client queries receipt state before retry. A stored successful receipt releases the local pending command and reconciles stock exactly once. A terminal conflict retains immutable forensic evidence until an explicit employee/manager resolution; no client rewrite changes actor or payload identity.
