/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 1E: actor_sessions ACL and RLS policy mutation under its existing owner.
The relation remains owned by afex_pos_session_owner.
*/
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.to_regclass('afex_pos_authority.actor_sessions') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_pos_session_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01E_PRECONDITION_FAILED';
  END IF;
END $afex$;

GRANT afex_pos_session_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_pos_session_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_WAVE_01E_TEMPORARY_SET_ENABLE_FAILED';
  END IF;
END $afex$;
SET LOCAL ROLE afex_pos_session_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_pos_session_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_01E_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-04B-001
GRANT USAGE ON SCHEMA afex_pos_authority
  TO afex_function_owner,afex_offline_authority_owner;
-- FWD-04B-002
GRANT SELECT(session_id,authenticated_subject_id,authenticated_session_id,
  tenant_id,branch_id,actor_id,actor_role,session_version,issued_at,expires_at,revoked_at)
ON afex_pos_authority.actor_sessions TO afex_function_owner;
-- FWD-04B-003
GRANT SELECT(session_id,authenticated_subject_id,authenticated_session_id,
  tenant_id,branch_id,actor_id,expires_at,revoked_at)
ON afex_pos_authority.actor_sessions TO afex_offline_authority_owner;
-- FWD-04B-004
CREATE POLICY actor_sessions_offline_function_owner_select
  ON afex_pos_authority.actor_sessions FOR SELECT
  TO afex_function_owner USING(true);
-- FWD-04B-005
CREATE POLICY actor_sessions_offline_authority_owner_select
  ON afex_pos_authority.actor_sessions FOR SELECT
  TO afex_offline_authority_owner USING(true);

RESET ROLE;
REVOKE afex_pos_session_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
       JOIN pg_catalog.pg_roles u ON u.oid=m.member
       WHERE g.rolname='afex_pos_session_owner' AND u.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     )
     OR (SELECT owner_role.rolname
         FROM pg_catalog.pg_class AS c
         JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=c.relowner
         WHERE n.nspname='afex_pos_authority' AND c.relname='actor_sessions')
        IS DISTINCT FROM 'afex_pos_session_owner'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname='afex_pos_authority' AND tablename='actor_sessions'
         AND policyname='actor_sessions_offline_function_owner_select'
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname='afex_pos_authority' AND tablename='actor_sessions'
         AND policyname='actor_sessions_offline_authority_owner_select'
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01E_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_01E_OWNER_CONTEXT_RESTORED';
END $afex$;
COMMIT;
