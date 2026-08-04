\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset pager off

BEGIN TRANSACTION READ ONLY;

SELECT pg_catalog.set_config('a24e.disposable_role_name', :'disposable_role_name', true),
       pg_catalog.set_config('a24e.expected_database_name', :'expected_database_name', true),
       pg_catalog.set_config('a24e.expected_postgres_major', :'expected_postgres_major', true),
       pg_catalog.set_config('a24e.expected_runtime_role_name', :'expected_runtime_role_name', true),
       pg_catalog.set_config('a24e.expected_runtime_role_oid', :'expected_runtime_role_oid', true),
       pg_catalog.set_config('a24e.expected_target_regprocedure', :'expected_target_regprocedure', true),
       pg_catalog.set_config('a24e.expected_target_oid', :'expected_target_oid', true),
       pg_catalog.set_config('a24e.expected_function_owner', :'expected_function_owner', true);

DO $a24e5a$
DECLARE
    v_role_oid oid;
    v_runtime_oid oid;
    v_target_oid oid;
BEGIN
    IF pg_catalog.current_setting('a24e.expected_postgres_major') <> '17'
       OR pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POSTGRES_MAJOR_MISMATCH';
    END IF;
    IF pg_catalog.current_database() <> pg_catalog.current_setting('a24e.expected_database_name') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'DATABASE_IDENTITY_MISMATCH';
    END IF;
    IF pg_catalog.current_setting('a24e.disposable_role_name') !~ '^afex_core_test_login_[0-9]{14}_[0-9a-f]{8}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROLE_NAME_INVALID';
    END IF;

    SELECT r.oid INTO STRICT v_role_oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = pg_catalog.current_setting('a24e.disposable_role_name');

    SELECT r.oid INTO STRICT v_runtime_oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = pg_catalog.current_setting('a24e.expected_runtime_role_name')
      AND r.oid = pg_catalog.current_setting('a24e.expected_runtime_role_oid')::oid;

    SELECT p.oid INTO STRICT v_target_oid
    FROM pg_catalog.pg_proc AS p
    WHERE p.oid = pg_catalog.current_setting('a24e.expected_target_regprocedure')::pg_catalog.regprocedure::oid
      AND p.oid = pg_catalog.current_setting('a24e.expected_target_oid')::oid
      AND pg_catalog.pg_get_userbyid(p.proowner) = pg_catalog.current_setting('a24e.expected_function_owner');

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS r
        WHERE r.oid = v_role_oid
          AND r.rolname = pg_catalog.current_setting('a24e.disposable_role_name')
          AND r.rolcanlogin
          AND NOT r.rolinherit
          AND NOT r.rolsuper
          AND NOT r.rolcreatedb
          AND NOT r.rolcreaterole
          AND NOT r.rolreplication
          AND NOT r.rolbypassrls
          AND r.rolconnlimit = 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ROLE_ATTRIBUTE_CONTRACT_FAILED';
    END IF;

    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members AS m
        WHERE m.member = v_role_oid OR m.roleid = v_role_oid) <> 1
       OR NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members AS m
           WHERE m.member = v_role_oid
             AND m.roleid = v_runtime_oid
             AND NOT m.admin_option
             AND NOT m.inherit_option
             AND m.set_option
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ROLE_MEMBERSHIP_CONTRACT_FAILED';
    END IF;

    IF pg_catalog.has_function_privilege(v_role_oid, v_target_oid, 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege(v_runtime_oid, v_target_oid, 'EXECUTE') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'DIRECT_EXECUTE_BOUNDARY_FAILED';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting AS s WHERE s.setrole = v_role_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl AS d WHERE d.defaclrole = v_role_oid) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ROLE_RESIDUE_PRESENT';
    END IF;
END
$a24e5a$;

SELECT 'A24E4A_ROLE_IDENTITY|' || :'run_id' || '|' || r.rolname || '|' || r.oid::text || '|PASS'
FROM pg_catalog.pg_roles AS r
WHERE r.rolname = :'disposable_role_name';

ROLLBACK;

SELECT 'A24E5A_900_DISPOSABLE_LOGIN_ROLE_ATTESTATION_COMPLETE';
