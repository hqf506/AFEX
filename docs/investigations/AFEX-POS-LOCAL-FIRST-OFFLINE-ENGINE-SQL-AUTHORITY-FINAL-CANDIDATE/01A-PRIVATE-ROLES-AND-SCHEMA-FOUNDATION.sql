/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 1A: postgres-owned installer bootstrap for exact NOLOGIN Offline roles and
the private afex_offline_authority schema. Any temporary SET capability is
transactional and is restored before COMMIT.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $afex$
BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.current_database() <> 'postgres'
     OR pg_catalog.current_setting('server_version_num') <> '170006'
     OR NOT pg_catalog.has_database_privilege('postgres','postgres','CREATE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname='postgres' AND NOT rolsuper AND rolcreaterole
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01A_INSTALLER_IDENTITY_MISMATCH';
  END IF;

  -- FWD-01A-001
  IF pg_catalog.to_regrole('afex_offline_authority_owner') IS NULL THEN
    EXECUTE 'CREATE ROLE afex_offline_authority_owner NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  END IF;
  -- FWD-01A-002
  IF pg_catalog.to_regrole('afex_offline_acquisition_runtime') IS NULL THEN
    EXECUTE 'CREATE ROLE afex_offline_acquisition_runtime NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  END IF;
  -- FWD-01A-003
  IF pg_catalog.to_regrole('afex_offline_provisioning_runtime') IS NULL THEN
    EXECUTE 'CREATE ROLE afex_offline_provisioning_runtime NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS r
    WHERE r.rolname IN (
      'afex_offline_authority_owner','afex_offline_acquisition_runtime',
      'afex_offline_provisioning_runtime'
    ) AND (r.rolcanlogin OR r.rolsuper OR r.rolinherit OR r.rolcreatedb
           OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01A_ROLE_ATTRIBUTE_MISMATCH';
  END IF;

  IF (SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_auth_members AS m
    JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
    WHERE granted.rolname IN (
            'afex_offline_authority_owner','afex_offline_acquisition_runtime',
            'afex_offline_provisioning_runtime'
          )
      AND member_role.rolname='postgres'
      AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
  ) <> 3 OR (SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_auth_members AS m
    JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
    WHERE granted.rolname IN (
            'afex_offline_authority_owner','afex_offline_acquisition_runtime',
            'afex_offline_provisioning_runtime'
          )
      AND member_role.rolname='postgres'
  ) <> 3 THEN
    RAISE EXCEPTION 'AFEX_WAVE_01A_OWNER_MEMBERSHIP_BASELINE_MISMATCH';
  END IF;
END
$afex$;

GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;

DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_WAVE_01A_TEMPORARY_SET_ENABLE_FAILED';
  END IF;
END $afex$;

-- FWD-01A-004
CREATE SCHEMA IF NOT EXISTS afex_offline_authority
  AUTHORIZATION afex_offline_authority_owner;

SET LOCAL ROLE afex_offline_authority_owner;

DO $afex$ BEGIN
  IF CURRENT_USER <> 'afex_offline_authority_owner' OR SESSION_USER <> 'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_01A_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

REVOKE ALL ON SCHEMA afex_offline_authority
  FROM PUBLIC,anon,authenticated,service_role,
       afex_offline_acquisition_runtime,afex_offline_provisioning_runtime;
GRANT USAGE,CREATE ON SCHEMA afex_offline_authority TO afex_function_owner;
GRANT USAGE ON SCHEMA afex_offline_authority
  TO afex_offline_acquisition_runtime,afex_offline_provisioning_runtime;

-- FWD-01A-005
ALTER DEFAULT PRIVILEGES FOR ROLE afex_offline_authority_owner
  IN SCHEMA afex_offline_authority REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE afex_offline_authority_owner
  IN SCHEMA afex_offline_authority REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE afex_offline_authority_owner
  IN SCHEMA afex_offline_authority REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE afex_offline_authority_owner
  IN SCHEMA afex_offline_authority REVOKE ALL ON TYPES FROM PUBLIC;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$
DECLARE schema_owner text;
BEGIN
  SELECT r.rolname INTO schema_owner
  FROM pg_catalog.pg_namespace AS n
  JOIN pg_catalog.pg_roles AS r ON r.oid=n.nspowner
  WHERE n.nspname='afex_offline_authority';
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR schema_owner IS DISTINCT FROM 'afex_offline_authority_owner'
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
       JOIN pg_catalog.pg_roles u ON u.oid=m.member
       WHERE g.rolname IN (
               'afex_offline_authority_owner','afex_offline_acquisition_runtime',
               'afex_offline_provisioning_runtime'
             ) AND u.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) <> 3
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles g ON g.oid=m.roleid
       JOIN pg_catalog.pg_roles u ON u.oid=m.member
       WHERE g.rolname IN (
               'afex_offline_authority_owner','afex_offline_acquisition_runtime',
               'afex_offline_provisioning_runtime'
             ) AND u.rolname='postgres'
     ) <> 3
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
      WHERE granted.rolname IN (
              'afex_offline_authority_owner','afex_offline_acquisition_runtime',
              'afex_offline_provisioning_runtime'
            )
         AND member_role.rolname='postgres'
         AND (NOT m.admin_option OR m.inherit_option OR m.set_option)
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01A_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_01A_OWNER_CONTEXT_RESTORED';
END
$afex$;
COMMIT;
