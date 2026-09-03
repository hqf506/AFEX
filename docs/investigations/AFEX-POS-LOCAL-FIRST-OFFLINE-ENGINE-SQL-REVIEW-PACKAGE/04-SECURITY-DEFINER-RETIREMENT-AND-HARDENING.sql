/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 3
purpose: Review exact retained/retired routine dispositions without changing a body whose dependency closure is not frozen.
execution status: NOT AUTHORIZED
prerequisites: Waves 1-2; Prompt 9 caller proof; exact pg_proc, pg_depend, trigger and body-hash evidence.
expected owner/operator: Exact routine owner or independently approved migration principal.
transaction behavior: Routine replacements/retirements must be split by dependency-compatible signature groups.
lock risk: Function catalog locks and dependent-plan invalidation; drops can break triggers and routes.
retry behavior: Stop on any body hash, overload, dependency, owner or path mismatch.
rollback reference: SQL-REVIEW-ROLLBACK-CONTRACT.md; route disablement, never broad EXECUTE restoration.
required evidence before execution: Fresh body hashes, exact overload set, call graph, trigger graph, hostile-path tests and Prompt 9 compatibility.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / retained Core and POS routines
-- Existing Core and POS routine bodies are frozen by signature and MD5 in
-- SQL-REVIEW-OBJECT-IDENTITY-MATRIX.json. The approved design preserves their
-- identities while adding a versioned Offline bridge. No ALTER FUNCTION or
-- CREATE OR REPLACE FUNCTION is included because body-level dependencies were
-- not captured with enough detail to prove that a path/owner change is neutral.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / customer routines
-- Retain authenticated execution only for
-- public.lookup_customer_phone_identity_v1(uuid,text,uuid).
-- Keep public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)
-- server-only. Normalization and trigger-helper signatures were not frozen in
-- the approved Production capture, so their executable hardening is excluded.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / PIN routines
-- public.verify_pos_pin_for_actor(text,uuid,uuid) remains internal to the POS
-- session/enrollment owners. public.set_pos_pin(text,uuid) is governed
-- server-only. public.hash_pos_pin(text) loses direct reachability. Exact body
-- and dependency evidence for set/hash is incomplete, so no replacement or
-- ownership mutation is emitted.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / legacy business retirement
-- Retirement candidates are the four exact invoice-creation signatures,
-- public.restore_inventory_for_cancelled_invoice(uuid,uuid), and direct legacy
-- numbering/inventory helpers listed in file 02. Dependency closure and Prompt 9
-- route compatibility are required before any DROP FUNCTION statement.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / manual inventory replacement
-- The approved replacement must validate trusted tenant, branch, item, actor,
-- operation identity, bounded reason and a nonnegative result in one stock-row
-- lock plus append transaction. The exact inventory-administration subject and
-- permission resolver is not frozen, so an executable SECURITY DEFINER body is
-- intentionally excluded rather than trusting caller-selected identifiers.
