/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 6-blocked
purpose: Record the immutable Core command, device, employee and generation closure required before an Offline binding relation can exist.
execution status: NOT AUTHORIZED
prerequisites: Proven Core command composite scope identity; proven file 05 employee-authority composite identity; Prompt 9 integration proof.
expected owner/operator: No operator; this file contains no executable statement.
transaction behavior: None; all blocks are evidence requirements.
lock risk: None while blocked.
retry behavior: Produce a new reviewed draft only after exact Core and employee authority identities are frozen.
rollback reference: No mutation exists to roll back.
required evidence before execution: Core unique constraints/columns/owners/lifecycle, authority key, acquisition bodies, receipt contract and mismatch vectors.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / Core command scope identity
-- public.atomic_order_commands(id) alone does not prove tenant or branch scope.
-- A future binding requires an exact immutable Core V2 unique identity that binds
-- command_id to its trusted tenant_id and branch_id. The approved evidence does
-- not freeze the target columns, column order, unique constraint or lifecycle.
-- Historical Core tables are not altered speculatively.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / employee actor device and generation closure
-- The binding must reference one employee-authority composite tuple proving the
-- same employee, Primary Auth subject, device, tenant, branch and credential/PIN/
-- permission/revocation/package/key-envelope/namespace/device generations used
-- at acquisition. Separate single-column foreign keys and an immutable-update
-- trigger are insufficient to validate the inserted tuple.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / versioned acquisition and receipt integration
-- First acquisition, duplicate/fingerprint conflict, in-progress state, unknown
-- result and receipt-first retry require a trusted Core mutation transaction.
-- No binding table, guard trigger, acquisition wrapper or historical actor update
-- is emitted until the two composite identities and Prompt 9 adapter are proven.
