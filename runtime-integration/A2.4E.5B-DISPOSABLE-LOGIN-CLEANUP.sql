\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset pager off

BEGIN;

SELECT pg_catalog.set_config('a24e.disposable_role_name', :'disposable_role_name', true),
       pg_catalog.set_config('a24e.expected_database_name', :'expected_database_name', true),
       pg_catalog.set_config('a24e.expected_postgres_major', :'expected_postgres_major', true),
       pg_catalog.set_config('a24e.expected_runtime_role_name', :'expected_runtime_role_name', true),
       pg_catalog.set_config('a24e.expected_runtime_role_oid', :'expected_runtime_role_oid', true),
       pg_catalog.set_config('a24e.expected_disposable_role_oid', :'expected_disposable_role_oid', true),
       pg_catalog.set_config('a24e.advisory_lock_identity', :'advisory_lock_identity', true);

DO $a24e5b$
DECLARE
    v_role_oid oid;
    v_runtime_oid oid;
    v_terminated integer := 0;
    v_cleanup_pid integer := pg_catalog.pg_backend_pid();
    v_target_pids integer[];
    v_target_pid integer;
    v_termination_succeeded boolean;
    v_installer_oid oid;
    v_installer_is_superuser boolean;
    v_self_grant_setting text;
    v_expected_creator_membership_count integer;
BEGIN
    IF pg_catalog.current_setting('a24e.expected_postgres_major') <> '17'
       OR pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POSTGRES_MAJOR_MISMATCH';
    END IF;
    IF pg_catalog.current_database() <> pg_catalog.current_setting('a24e.expected_database_name')
       OR pg_catalog.current_setting('a24e.disposable_role_name') !~ '^afex_core_test_login_[0-9]{14}_[0-9a-f]{8}$'
       OR pg_catalog.current_setting('a24e.expected_disposable_role_oid') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CLEANUP_IDENTITY_INPUT_INVALID';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(pg_catalog.current_setting('a24e.advisory_lock_identity'), 0)
    );

    SELECT r.oid INTO v_role_oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = pg_catalog.current_setting('a24e.disposable_role_name');

    IF v_role_oid IS NULL THEN
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS r
                   WHERE r.oid = pg_catalog.current_setting('a24e.expected_disposable_role_oid')::oid) THEN
            RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ROLE_OID_REUSED';
        END IF;
        RETURN;
    END IF;
    IF v_role_oid <> pg_catalog.current_setting('a24e.expected_disposable_role_oid')::oid THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ROLE_NAME_OID_MISMATCH';
    END IF;

    SELECT r.oid INTO STRICT v_runtime_oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = pg_catalog.current_setting('a24e.expected_runtime_role_name')
      AND r.oid = pg_catalog.current_setting('a24e.expected_runtime_role_oid')::oid;

    SELECT r.oid, r.rolsuper INTO STRICT v_installer_oid, v_installer_is_superuser
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = CURRENT_USER;
    v_self_grant_setting := pg_catalog.current_setting('createrole_self_grant');
    IF v_self_grant_setting NOT IN ('', 'set', 'inherit', 'set, inherit', 'inherit, set') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CREATOR_MEMBERSHIP_SETTING_INVALID';
    END IF;
    v_expected_creator_membership_count :=
        CASE WHEN NOT v_installer_is_superuser AND v_self_grant_setting <> '' THEN 1 ELSE 0 END;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS m
        WHERE (m.member = v_role_oid OR m.roleid = v_role_oid)
          AND NOT (m.member = v_role_oid AND m.roleid = v_runtime_oid
                   AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option)
          AND NOT (v_expected_creator_membership_count = 1
                   AND m.roleid = v_role_oid AND m.member = v_installer_oid
                   AND m.admin_option
                   AND m.inherit_option = (pg_catalog.position('inherit', v_self_grant_setting) > 0)
                   AND m.set_option = (pg_catalog.position('set', v_self_grant_setting) > 0))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'UNRELATED_MEMBERSHIP_PRESENT';
    END IF;

    SELECT coalesce(
        pg_catalog.array_agg(a.pid ORDER BY a.pid),
        ARRAY[]::integer[]
    ) INTO v_target_pids
    FROM pg_catalog.pg_stat_activity AS a
    WHERE a.usesysid = v_role_oid
      AND a.pid <> v_cleanup_pid;

    FOREACH v_target_pid IN ARRAY v_target_pids LOOP
        IF v_target_pid = v_cleanup_pid THEN
            RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CLEANUP_BACKEND_SELECTION_INVALID';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM pg_catalog.pg_stat_activity AS a
            WHERE a.pid = v_target_pid
              AND a.usesysid = v_role_oid
        ) THEN
            SELECT pg_catalog.pg_terminate_backend(v_target_pid, 5000)
            INTO v_termination_succeeded;
            IF NOT coalesce(v_termination_succeeded, false) THEN
                RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SESSION_TERMINATION_FAILED';
            END IF;
            v_terminated := v_terminated + 1;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_stat_activity AS a
        WHERE a.usesysid = v_role_oid
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'DISPOSABLE_SESSIONS_REMAIN';
    END IF;

    EXECUTE pg_catalog.format(
        'REVOKE %I FROM %I',
        pg_catalog.current_setting('a24e.expected_runtime_role_name'),
        pg_catalog.current_setting('a24e.disposable_role_name')
    );

    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members AS m
        WHERE m.member = v_role_oid OR m.roleid = v_role_oid) <> v_expected_creator_membership_count
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members AS m
           WHERE m.roleid = v_role_oid AND m.member = v_installer_oid
             AND m.admin_option
             AND m.inherit_option = (pg_catalog.position('inherit', v_self_grant_setting) > 0)
             AND m.set_option = (pg_catalog.position('set', v_self_grant_setting) > 0)) <> v_expected_creator_membership_count
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity AS a WHERE a.usesysid = v_role_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c WHERE c.relowner = v_role_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.proowner = v_role_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace AS n WHERE n.nspowner = v_role_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type AS t WHERE t.typowner = v_role_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl AS d WHERE d.defaclrole = v_role_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting AS s WHERE s.setrole = v_role_oid) THEN
        RAISE EXCEPTION USING ERRCODE = '2BP01', MESSAGE = 'ROLE_DEPENDENCIES_REMAIN';
    END IF;

    EXECUTE pg_catalog.format('DROP ROLE %I', pg_catalog.current_setting('a24e.disposable_role_name'));
END
$a24e5b$;

COMMIT;

SELECT 'A24E5B_RESULT|' || :'run_id' || '|' || :'disposable_role_name' || '|' || :'expected_disposable_role_oid' || '|PASS';
SELECT 'A24E5B_900_DISPOSABLE_LOGIN_CLEANUP_COMPLETE';
