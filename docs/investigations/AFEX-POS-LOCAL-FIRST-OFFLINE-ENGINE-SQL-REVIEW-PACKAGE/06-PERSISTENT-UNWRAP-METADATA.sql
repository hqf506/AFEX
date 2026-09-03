/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 5-blocked
purpose: Record the composite employee/device/generation binding required for persistent unwrap metadata without emitting unsafe DDL.
execution status: NOT AUTHORIZED
prerequisites: File 05 composite identities; canonical encoding; signer identity; envelope and purge contracts.
expected owner/operator: No operator; this file contains no executable statement.
transaction behavior: None; all blocks are evidence requirements.
lock risk: None while blocked.
retry behavior: Produce a new reviewed draft only after exact composite identity and cryptographic metadata evidence exists.
rollback reference: No mutation exists to roll back.
required evidence before execution: Employee-authority unique key, subject mapping, generation set, canonical vectors, AAD and exact-purge qualification.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / envelope-to-authority composite binding
-- A future offline_key_envelopes row must bind employee_authority_id, device_id,
-- employee_id, the trusted Primary Auth audit subject, tenant_id, branch_id and
-- every authority generation stored on the envelope through one exact composite
-- foreign key to offline_employee_authorities. The current evidence does not
-- prove the target column order/types/unique constraint or whether the approved
-- account audit subject maps exactly to primary_auth_subject_id.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / immutable envelope state
-- A trigger that only rejects UPDATE cannot repair an incomplete INSERT-time
-- authority link. Table, policy, guard trigger and generation/hash indexes remain
-- absent until mismatched device, employee, subject, scope or generation tuples
-- are rejected by a declarative database key.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / issuance rotation and purge
-- SQL never receives plaintext PIN, DEK, private key or PIN-derived key. Exact
-- signer, issuance, rotation, revocation and governed purge writers are not
-- frozen. No callable path or time-based authority-expiry column is emitted.
