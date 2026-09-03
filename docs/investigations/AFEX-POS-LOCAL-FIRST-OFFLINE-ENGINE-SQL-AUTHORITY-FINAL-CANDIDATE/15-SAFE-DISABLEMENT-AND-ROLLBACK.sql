/*
REVIEW-ONLY INACTIVE EMERGENCY DISABLEMENT. NOT AUTHORIZED FOR EXECUTION.
This whole file removes runtime reachability without deleting authority evidence.
If the separately classified service facades were ever activated, execute the exact
90Z emergency revoke first. Empty-object removal is isolated in whole file 15A.
*/
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_DISABLEMENT_PRECONDITION_FAILED';
  END IF;
END $afex$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN RAISE EXCEPTION 'AFEX_DISABLEMENT_FUNCTION_OWNER_SET_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_function_owner;
DO $afex$ BEGIN IF CURRENT_USER<>'afex_function_owner' OR SESSION_USER<>'postgres' THEN RAISE EXCEPTION 'AFEX_DISABLEMENT_FUNCTION_OWNER_CONTEXT_FAILED'; END IF; END $afex$;
REVOKE EXECUTE ON FUNCTION
  afex_offline_authority.acquire_offline_order_create_v2(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamptz,timestamptz,text),
  afex_offline_authority.resolve_offline_order_create_authority_batch_v2(uuid,uuid,uuid,jsonb),
  afex_offline_authority.lookup_offline_order_create_receipts_v2(uuid,uuid,uuid,jsonb),
  afex_offline_authority.read_branch_inventory_frontier_v2(uuid,uuid,uuid,jsonb,uuid[])
FROM afex_offline_acquisition_runtime;
RESET ROLE;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;

GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_DISABLEMENT_OFFLINE_OWNER_SET_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN RAISE EXCEPTION 'AFEX_DISABLEMENT_OFFLINE_OWNER_CONTEXT_FAILED'; END IF; END $afex$;
REVOKE EXECUTE ON FUNCTION
  afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text),
  afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text),
  afex_offline_authority.read_current_offline_device_authority_v1(uuid,uuid,uuid,uuid),
  afex_offline_authority.enroll_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text),
  afex_offline_authority.replace_offline_employee_pin_verifier_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bytea,bytea,text,text),
  afex_offline_authority.replace_offline_employee_permissions_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text[],text,text),
  afex_offline_authority.transition_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,text),
  afex_offline_authority.read_current_offline_employee_authority_v1(uuid,uuid,uuid,uuid,uuid),
  afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  afex_offline_authority.publish_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text),
  afex_offline_authority.explicit_logout_offline_account_v1(uuid,uuid,uuid,uuid,uuid,uuid,text),
  afex_offline_authority.revoke_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,text,text),
  afex_offline_authority.read_current_offline_bootstrap_authority_v1(uuid,uuid,uuid,uuid)
FROM afex_offline_provisioning_runtime;
RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

GRANT afex_pos_session_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_pos_session_owner','SET') THEN RAISE EXCEPTION 'AFEX_DISABLEMENT_POS_OWNER_SET_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_pos_session_owner;
DO $afex$ BEGIN IF CURRENT_USER<>'afex_pos_session_owner' OR SESSION_USER<>'postgres' THEN RAISE EXCEPTION 'AFEX_DISABLEMENT_POS_OWNER_CONTEXT_FAILED'; END IF; END $afex$;
DROP POLICY actor_sessions_offline_authority_owner_select
  ON afex_pos_authority.actor_sessions;
DROP POLICY actor_sessions_offline_function_owner_select
  ON afex_pos_authority.actor_sessions;
REVOKE SELECT(session_id,authenticated_subject_id,authenticated_session_id,
  tenant_id,branch_id,actor_id,expires_at,revoked_at)
  ON afex_pos_authority.actor_sessions FROM afex_offline_authority_owner;
REVOKE SELECT(session_id,authenticated_subject_id,authenticated_session_id,
  tenant_id,branch_id,actor_id,actor_role,session_version,issued_at,expires_at,revoked_at)
  ON afex_pos_authority.actor_sessions FROM afex_function_owner;
RESET ROLE;
REVOKE afex_pos_session_owner FROM postgres GRANTED BY CURRENT_USER;

DROP POLICY inventory_stock_offline_authority_owner_select ON public.inventory_stock;
REVOKE SELECT(tenant_id,branch_id,catalog_item_id,quantity_on_hand,updated_at)
  ON public.inventory_stock FROM afex_offline_authority_owner;
DROP POLICY pos_profiles_offline_authority_owner_select ON public.pos_profiles;
REVOKE SELECT(id,tenant_id,branch_id,role,is_active,updated_at)
  ON public.pos_profiles FROM afex_offline_authority_owner;
DROP POLICY branches_offline_authority_owner_select ON public.branches;
REVOKE SELECT(id,tenant_id,is_active) ON public.branches FROM afex_offline_authority_owner;
DROP POLICY profiles_offline_authority_owner_select ON public.profiles;
REVOKE SELECT(id,tenant_id,branch_id,is_active,role)
  ON public.profiles FROM afex_offline_authority_owner;
DROP POLICY profiles_offline_function_owner_select ON public.profiles;
REVOKE SELECT(id,is_active) ON public.profiles FROM afex_function_owner;
REVOKE EXECUTE ON FUNCTION
  afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)
FROM afex_function_owner,afex_offline_authority_owner;

DO $afex$
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_auth_members m
         JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
         JOIN pg_catalog.pg_roles u ON u.oid=m.member
         WHERE u.rolname='postgres'
           AND g.rolname IN ('afex_function_owner','afex_offline_authority_owner','afex_pos_session_owner')) <> 3
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
       JOIN pg_catalog.pg_roles u ON u.oid=m.member
       WHERE u.rolname='postgres'
         AND g.rolname IN ('afex_function_owner','afex_offline_authority_owner','afex_pos_session_owner')
         AND (NOT m.admin_option OR m.inherit_option OR m.set_option)
     )
     OR pg_catalog.has_function_privilege('afex_offline_acquisition_runtime',
       'afex_offline_authority.acquire_offline_order_create_v2(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)','EXECUTE')
     OR pg_catalog.has_function_privilege('afex_offline_provisioning_runtime',
       'afex_offline_authority.publish_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'AFEX_DISABLEMENT_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_DISABLEMENT_COMPLETE_EVIDENCE_RETAINED';
END
$afex$;
COMMIT;
