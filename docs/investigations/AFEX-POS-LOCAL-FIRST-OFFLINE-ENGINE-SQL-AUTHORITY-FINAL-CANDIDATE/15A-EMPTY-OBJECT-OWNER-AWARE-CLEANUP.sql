/*
REVIEW-ONLY OPTIONAL EMPTY-OBJECT CLEANUP. NOT AUTHORIZED FOR EXECUTION.
Run only after whole-file 15. Every data-bearing Offline relation must be empty.
Only exact RESTRICT drops are used. Existing business/Core/POS objects are never dropped.
*/
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $afex$
DECLARE evidence_rows bigint;
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_PRINCIPAL_MISMATCH';
  END IF;
  SELECT
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_command_bindings)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_account_bootstrap_events)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_bootstrap_employee_roster)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_account_bootstrap_authorities)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_key_envelopes)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_employee_authority_events)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_employee_authorities)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_device_events)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_devices)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.branch_inventory_snapshot_items)+
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.branch_inventory_snapshot_headers)
  INTO evidence_rows;
  IF evidence_rows<>0 THEN
    RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_REFUSED_NONZERO_EVIDENCE:%',evidence_rows;
  END IF;
END $afex$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_FUNCTION_OWNER_SET_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_function_owner;
DO $afex$ BEGIN IF CURRENT_USER<>'afex_function_owner' OR SESSION_USER<>'postgres' THEN RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_FUNCTION_OWNER_CONTEXT_FAILED'; END IF; END $afex$;
DROP FUNCTION afex_offline_authority.lookup_offline_order_create_receipts_v2(uuid,uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION afex_offline_authority.acquire_offline_order_create_v2(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamptz,timestamptz,text) RESTRICT;
DROP FUNCTION afex_offline_authority.resolve_offline_order_create_authority_batch_v2(uuid,uuid,uuid,jsonb) RESTRICT;
DROP FUNCTION afex_offline_authority.resolve_one_offline_order_create_claim_v2(uuid,uuid,uuid,jsonb,integer,boolean) RESTRICT;
DROP FUNCTION afex_offline_authority.read_branch_inventory_frontier_v2(uuid,uuid,uuid,jsonb,uuid[]) RESTRICT;
DROP FUNCTION afex_offline_authority.assert_offline_core_order_mapping_v2(jsonb,jsonb,jsonb,uuid,uuid,uuid,text,text,uuid,text) RESTRICT;
DROP FUNCTION afex_offline_authority.validate_inventory_frontier_v2(uuid,uuid,jsonb,jsonb) RESTRICT;
DROP FUNCTION afex_offline_authority.validate_payment_attestation_v2(jsonb,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint) RESTRICT;
DROP FUNCTION afex_offline_authority.validate_offline_provenance_v2(uuid,uuid,uuid,jsonb,text) RESTRICT;
DROP FUNCTION afex_offline_authority.canonical_jsonb_v2(jsonb) RESTRICT;
DROP FUNCTION afex_offline_authority.jsonb_has_exact_keys_v1(jsonb,text[]) RESTRICT;
DROP FUNCTION afex_offline_authority.try_numeric_v1(text) RESTRICT;
DROP FUNCTION afex_offline_authority.try_integer_v1(text) RESTRICT;
DROP FUNCTION afex_offline_authority.try_bigint_v1(text) RESTRICT;
DROP FUNCTION afex_offline_authority.try_uuid_v1(text) RESTRICT;
RESET ROLE;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;

GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_OFFLINE_OWNER_SET_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_OFFLINE_OWNER_CONTEXT_FAILED'; END IF; END $afex$;
DROP FUNCTION afex_offline_authority.read_current_offline_bootstrap_authority_v1(uuid,uuid,uuid,uuid) RESTRICT;
DROP FUNCTION afex_offline_authority.revoke_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,text,text) RESTRICT;
DROP FUNCTION afex_offline_authority.explicit_logout_offline_account_v1(uuid,uuid,uuid,uuid,uuid,uuid,text) RESTRICT;
DROP FUNCTION afex_offline_authority.publish_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text) RESTRICT;
DROP FUNCTION afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb) RESTRICT;
DROP FUNCTION afex_offline_authority.read_current_offline_employee_authority_v1(uuid,uuid,uuid,uuid,uuid) RESTRICT;
DROP FUNCTION afex_offline_authority.transition_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) RESTRICT;
DROP FUNCTION afex_offline_authority.replace_offline_employee_permissions_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text[],text,text) RESTRICT;
DROP FUNCTION afex_offline_authority.replace_offline_employee_pin_verifier_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bytea,bytea,text,text) RESTRICT;
DROP FUNCTION afex_offline_authority.enroll_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text) RESTRICT;
DROP FUNCTION afex_offline_authority.read_current_offline_device_authority_v1(uuid,uuid,uuid,uuid) RESTRICT;
DROP FUNCTION afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text) RESTRICT;
DROP FUNCTION afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text) RESTRICT;
DROP FUNCTION afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text) RESTRICT;
DROP FUNCTION afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text) RESTRICT;
DROP TABLE afex_offline_authority.offline_account_bootstrap_events RESTRICT;
DROP TABLE afex_offline_authority.offline_bootstrap_employee_roster RESTRICT;
DROP TABLE afex_offline_authority.offline_account_bootstrap_authorities RESTRICT;
DROP TABLE afex_offline_authority.offline_command_bindings RESTRICT;
DROP TABLE afex_offline_authority.offline_employee_authority_events RESTRICT;
DROP TABLE afex_offline_authority.offline_employee_authorities RESTRICT;
DROP TABLE afex_offline_authority.offline_key_envelopes RESTRICT;
DROP TABLE afex_offline_authority.offline_device_events RESTRICT;
DROP TABLE afex_offline_authority.offline_devices RESTRICT;
DROP TABLE afex_offline_authority.branch_inventory_snapshot_items RESTRICT;
DROP TABLE afex_offline_authority.branch_inventory_snapshot_headers RESTRICT;
DROP FUNCTION afex_offline_authority.reject_offline_command_binding_mutation_v1() RESTRICT;
DROP FUNCTION afex_offline_authority.enforce_enrollment_capacity_v1() RESTRICT;
DROP FUNCTION afex_offline_authority.reject_immutable_offline_evidence_v1() RESTRICT;
RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

DROP FUNCTION afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid) RESTRICT;

GRANT afex_core_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_core_owner','SET') THEN RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_CORE_OWNER_SET_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_core_owner;
DO $afex$ BEGIN IF CURRENT_USER<>'afex_core_owner' OR SESSION_USER<>'postgres' THEN RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_CORE_OWNER_CONTEXT_FAILED'; END IF; END $afex$;
ALTER TABLE public.atomic_order_commands DROP CONSTRAINT afex_atomic_command_offline_scope_uk;
ALTER TABLE public.atomic_authorization_contexts DROP CONSTRAINT afex_atomic_context_offline_scope_uk;
RESET ROLE;
REVOKE afex_core_owner FROM postgres GRANTED BY CURRENT_USER;

ALTER TABLE public.catalog_items DROP CONSTRAINT afex_catalog_items_id_tenant_scope_uk;
ALTER TABLE public.branches DROP CONSTRAINT afex_branches_id_tenant_scope_uk;

GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_SCHEMA_OWNER_SET_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_SCHEMA_OWNER_CONTEXT_FAILED'; END IF; END $afex$;
DROP SCHEMA afex_offline_authority RESTRICT;
RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_auth_members m
         JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
         JOIN pg_catalog.pg_roles u ON u.oid=m.member
         WHERE u.rolname='postgres'
           AND g.rolname IN ('afex_function_owner','afex_core_owner','afex_offline_authority_owner')) <> 3
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
       JOIN pg_catalog.pg_roles u ON u.oid=m.member
       WHERE u.rolname='postgres'
         AND g.rolname IN ('afex_function_owner','afex_core_owner','afex_offline_authority_owner')
         AND (NOT m.admin_option OR m.inherit_option OR m.set_option)
     ) THEN
    RAISE EXCEPTION 'AFEX_EMPTY_CLEANUP_MEMBERSHIP_RESTORE_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_EMPTY_OWNER_AWARE_CLEANUP_COMPLETE';
END $afex$;
COMMIT;
