/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 1D: bounded Auth-session lookup in the private Offline schema.
The helper is the sole postgres-owned privileged Offline function and does not
change auth schema ownership, ACL or data.
*/
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.current_database()<>'postgres'
     OR pg_catalog.current_setting('server_version_num')<>'170006'
     OR pg_catalog.to_regclass('auth.sessions') IS NULL
     OR pg_catalog.to_regnamespace('afex_offline_authority') IS NULL
     OR NOT pg_catalog.has_schema_privilege('postgres','auth','USAGE')
     OR pg_catalog.has_schema_privilege('postgres','auth','CREATE')
     OR NOT pg_catalog.has_table_privilege('postgres','auth.sessions','SELECT')
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_offline_authority_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN
    RAISE EXCEPTION 'AFEX_AUTH_SESSION_BRIDGE_PRECONDITION_FAILED';
  END IF;
END $afex$;

GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_WAVE_01D_TEMPORARY_SET_ENABLE_FAILED';
  END IF;
END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_01D_SCHEMA_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;
-- FWD-04A-001
GRANT CREATE ON SCHEMA afex_offline_authority TO postgres;
RESET ROLE;

-- FWD-04A-002
CREATE FUNCTION afex_offline_authority.afex_current_auth_session_matches_v1(
  p_authenticated_subject_id uuid,
  p_authenticated_session_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM auth.sessions AS s
    WHERE s.user_id=p_authenticated_subject_id
      AND s.id=p_authenticated_session_id
  )
$fn$;

-- FWD-04A-003
REVOKE ALL ON FUNCTION
  afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role,
     afex_offline_provisioning_runtime,afex_offline_acquisition_runtime;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)
TO afex_function_owner,afex_offline_authority_owner;

SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_01D_SCHEMA_RESTORE_CONTEXT_MISMATCH';
  END IF;
END $afex$;
-- FWD-04A-004
REVOKE CREATE ON SCHEMA afex_offline_authority FROM postgres;
RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$
DECLARE
  helper_owner text;
  helper_source text;
BEGIN
  SELECT owner_role.rolname,p.prosrc
  INTO helper_owner,helper_source
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=p.proowner
  WHERE n.nspname='afex_offline_authority'
    AND p.proname='afex_current_auth_session_matches_v1'
    AND pg_catalog.pg_get_function_identity_arguments(p.oid)='p_authenticated_subject_id uuid, p_authenticated_session_id uuid';

  IF helper_owner IS DISTINCT FROM 'postgres'
     OR helper_source IS NULL
     OR pg_catalog.md5(pg_catalog.replace(helper_source,E'\r\n',E'\n')) <>
        'cc67bd0f9c1828a833b868c48f1f65fb'
     OR pg_catalog.octet_length(
          pg_catalog.replace(helper_source,E'\r\n',E'\n')
        ) <> 153
     OR pg_catalog.has_schema_privilege('postgres','afex_offline_authority','CREATE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
       JOIN pg_catalog.pg_roles u ON u.oid=m.member
       WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS public_target
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         pg_catalog.coalesce(
           public_target.proacl,
           pg_catalog.acldefault('f',public_target.proowner)
         )
       ) AS acl
       WHERE public_target.oid=pg_catalog.to_regprocedure(
         'afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)'
       )
         AND acl.grantee=0
         AND acl.privilege_type='EXECUTE'
     )
     OR pg_catalog.has_function_privilege('anon',
          'afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated',
          'afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)','EXECUTE')
     OR pg_catalog.has_function_privilege('service_role',
          'afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'AFEX_AUTH_SESSION_BRIDGE_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_01D_POSTGRES_HELPER_EXCEPTION_BOUNDED';
END
$afex$;
COMMIT;
