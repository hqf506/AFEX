/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 7-blocked
purpose: Record the composite command, review, payment, snapshot and effect invariants required before new authority relations are drafted.
execution status: NOT AUTHORIZED
prerequisites: Proven Core command scope; proven branch authority; review CAS; separated payment writers; complete effect state machine.
expected owner/operator: No operator; this file contains no executable statement.
transaction behavior: None; all blocks are evidence requirements.
lock risk: None while blocked; future command/review/stock/effect locks require a measured graph.
retry behavior: Produce a new reviewed draft only after exact composite identities and trusted writer contracts are frozen.
rollback reference: No mutation exists to roll back.
required evidence before execution: Core/branch keys, review writer, provider writer, effect routines, inventory snapshot contract and hostile concurrency tests.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / review command scope and event versioning
-- A review must bind command_id, tenant_id and branch_id through the proven Core
-- command composite identity. Review events must derive or bind the same scope,
-- reference the correct review and serialize expected_review_version against the
-- current review row. A CHECK of resulting = expected + 1 and a unique event
-- version do not by themselves implement compare-and-set. Review tables and the
-- transition routine remain absent until the trusted operator and CAS transaction
-- are frozen.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / payment command scope and writer separation
-- A payment attestation must bind command_id, tenant_id and branch_id to the Core
-- command and bind its employee/device authority where applicable. Every employee
-- path, for each distinct method mada, cash, visa, cod, card, bank_transfer,
-- transfer and on_delivery, must force attestation_state = employee_attested and
-- provider_state = unverified. Provider confirmed, rejected or ambiguous results
-- require a separate future server/provider reconciliation writer and authority.
-- No table or callable path is emitted until those writer roles/functions and the
-- composite command identity are proven. Card PAN, CVV, PIN, tokens and provider
-- credentials remain forbidden.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / snapshot branch and item scope closure
-- A snapshot header requires a proven (branch_id, tenant_id) branch-authority
-- foreign key. Each item must bind (snapshot_id, tenant_id, branch_id) to one
-- validated unique header identity, unless a later complete design removes the
-- duplicated scope and proves all access, hash, purge and query contracts derive
-- scope exclusively from the header. Neither identity is frozen, so no snapshot
-- relation or index is emitted.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / effect command scope and state invariants
-- The effect ledger must bind server_command_id, tenant_id and branch_id to Core.
-- Its immutable semantic identity remains serverCommandId + effectType +
-- effectVersion. A future state machine must enforce: positive claim_version;
-- complete claim fields only while claimed; no active claim fields otherwise;
-- succeeded_at exactly for succeeded; terminal_at for terminal/suppressed;
-- retry timestamps only for retryable/ambiguous states; coherent attempt counts;
-- and bounded provider receipt/result shape. Exact claim/complete/fail routines,
-- provider idempotency and atomic Core effect-intent insertion are not proven.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / external dispatch prohibition
-- This package never dispatches WhatsApp, printing, notification or audit export.
-- No replay-safety claim is made and no worker callable path is emitted.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / inventory authority integration
-- Snapshot frontier creation, deterministic stock locking, no-negative inventory,
-- receipt mutation summaries and batch reconciliation require the exact Core and
-- branch composite identities plus measured lock and duplicate evidence.
