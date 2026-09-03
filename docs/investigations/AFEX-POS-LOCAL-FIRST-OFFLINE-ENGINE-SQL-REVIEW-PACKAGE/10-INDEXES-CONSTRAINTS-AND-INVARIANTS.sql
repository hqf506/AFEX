/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 7-indexes-blocked
purpose: Record required indexes and invariants without referencing authority relations whose composite identities are not yet proven.
execution status: NOT AUTHORIZED
prerequisites: Corrected executable files 05-08; exact composite keys; zero-duplicate prechecks; measured cardinality and size.
expected owner/operator: No operator; this file contains no executable statement.
transaction behavior: None. Future CREATE INDEX CONCURRENTLY statements must remain separate and non-transactional.
lock risk: None while blocked; future concurrent scans and catalog locks require independent approval.
retry behavior: Produce a new reviewed draft only after relation identity and duplicate evidence is frozen.
rollback reference: No index or constraint mutation exists to roll back.
required evidence before execution: Exact corrected table definitions, query plans, duplicate counts, relation sizes, write rate and maintenance strategy.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / device and employee authority indexes
-- One-active-device, employee roster, generation and envelope indexes depend on
-- the missing branch and employee-authority composite keys in files 05 and 06.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / command review payment snapshot and effect indexes
-- Binding uniqueness, review CAS, payment reconciliation, snapshot frontier/item
-- lookup and effect claim indexes depend on the blocked relations in files 07 and
-- 08. No index name is presented as executable against an unproven table shape.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / legacy-table invariants
-- Nonnegative inventory, customer normalized-phone identity, catalog/VAT reads,
-- official numbering and cancellation identity still require fresh duplicate
-- counts plus exact current constraint/index/caller compatibility evidence.
