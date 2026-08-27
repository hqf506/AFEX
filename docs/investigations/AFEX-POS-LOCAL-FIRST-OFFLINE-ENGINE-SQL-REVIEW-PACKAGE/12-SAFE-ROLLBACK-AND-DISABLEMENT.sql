/*
classification: MANUAL_ROLLBACK_ONLY
wave: rollback
purpose: Remove runtime reachability to newly introduced private authority domains while retaining immutable evidence and never restoring legacy browser privileges.
execution status: NOT AUTHORIZED
prerequisites: Independent incident approval; exact affected runtime/function inventory; application feature flags already disabled.
expected owner/operator: Exact schema/function owners through an approved incident migration operator.
transaction behavior: One DCL-only transaction; no row mutation or object deletion.
lock risk: Short ACL catalog locks; active sessions may retain already checked privileges until transaction boundaries.
retry behavior: Stop on unexpected owner, grant or function identity; do not broaden access to recover.
rollback reference: This is the SQL disablement boundary; application rollback steps are documented in SQL-REVIEW-ROLLBACK-CONTRACT.md.
required evidence before execution: Incident scope, runtime-role reachability, active worker/route shutdown and evidence-retention confirmation.
*/

-- block: MANUAL_ROLLBACK_ONLY / remove new runtime schema and routine reachability
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('afex_offline_authority_review_package_v1', 0));

REVOKE USAGE ON SCHEMA afex_offline_authority
FROM afex_offline_enrollment_runtime, afex_offline_acquisition_runtime;
REVOKE USAGE ON SCHEMA afex_review_private FROM afex_business_review_runtime;
REVOKE USAGE ON SCHEMA afex_effect_private FROM afex_effect_dispatcher;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA afex_offline_authority
FROM afex_offline_enrollment_runtime, afex_offline_acquisition_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA afex_review_private
FROM afex_business_review_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA afex_effect_private
FROM afex_effect_dispatcher;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA afex_offline_authority
FROM afex_offline_enrollment_runtime, afex_offline_acquisition_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA afex_review_private
FROM afex_business_review_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA afex_effect_private
FROM afex_effect_dispatcher;

COMMIT;

-- block: MANUAL_ROLLBACK_ONLY / mandatory non-SQL controls
-- The future operator must also disable enrollment, package issuance, Offline
-- acquisition, dispatcher claims, review resolution and cancellation/refund in
-- application configuration. SQL does not fabricate that application state.
-- Existing commands, receipts, reviews, effects, events and envelopes are kept.
-- No broad authenticated write, PUBLIC execution, anon access, role-only policy,
-- legacy invoice mutation or actor reassignment is restored by this file.
