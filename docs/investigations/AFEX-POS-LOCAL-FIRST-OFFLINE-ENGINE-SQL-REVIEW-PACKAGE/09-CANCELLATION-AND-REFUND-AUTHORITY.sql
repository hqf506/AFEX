/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 7-cancellation
purpose: Define the reviewed boundary for a versioned Core cancellation/refund command without emitting an unsafe parallel mutation engine.
execution status: NOT AUTHORIZED
prerequisites: Exact Core command-type evolution, status transition, payment/refund, stock-restoration, receipt and effect-intent identities.
expected owner/operator: afex_core_owner and separately approved cancellation/refund route authority.
transaction behavior: Future implementation must be one Core transaction with deterministic lock order.
lock risk: Original command/business link, order, invoice, payment, stock rows and effect intents; high contention if ordered incorrectly.
retry behavior: Receipt lookup first; exact duplicate returns prior receipt; fingerprint conflict is terminal; no blind retry.
rollback reference: SQL-REVIEW-ROLLBACK-CONTRACT.md section Cancellation/refund.
required evidence before execution: Core check constraints/body hashes, legal status matrix, payment provider policy, lock graph and Prompt 9 route compatibility.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / versioned Core command identity
-- The frozen public.atomic_order_commands contract accepts order.create only.
-- The approved evidence does not supply an exact reviewed replacement for its
-- command-type constraint, acquisition body, execution body, receipt schema or
-- caller compatibility. Creating a separate cancellation table without that
-- atomic Core path would reproduce the forbidden parallel mutation engine.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / stock restoration and payment/refund
-- A future reviewed implementation must lock, in deterministic order, the
-- original command/business link, order, invoice, payment attestation and exact
-- affected inventory rows. Restoration derives once from the original committed
-- mutation summary; request quantities are never authority. Payment correction
-- or refund is a new immutable causally linked event and no provider call occurs
-- in replay or Offline execution.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / legacy retirement dependency
-- public.restore_inventory_for_cancelled_invoice(uuid,uuid) remains a retirement
-- candidate only after the Core cancellation command, route compatibility and
-- every dependency are independently proved. No DROP, ALTER or GRANT is emitted.
