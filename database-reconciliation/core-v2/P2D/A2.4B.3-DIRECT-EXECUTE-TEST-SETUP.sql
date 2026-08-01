-- A2.4B.3 disposable direct-EXECUTE test setup
\set ON_ERROR_STOP on
\if :{?A24B3_EXECUTION_AUTHORIZED}
\else
\echo 'STOP: explicit A24B3_EXECUTION_AUTHORIZED variable is required.'
\quit 3
\endif
\if :{?A24B3_TEST_PASSWORD}
\else
\echo 'STOP: test password must be supplied outside Git.'
\quit 3
\endif
\if :{?A24B3_VALID_UNTIL}
\else
\echo 'STOP: finite validity timestamp is required.'
\quit 3
\endif

BEGIN;

DO $preflight$
BEGIN
    IF current_setting('server_encoding') <> 'UTF8' THEN
        RAISE EXCEPTION 'A2.4B.3 requires UTF8';
    END IF;
    IF current_setting('server_version_num')::integer < 170000 THEN
        RAISE EXCEPTION 'A2.4B.3 requires PostgreSQL 17 or later';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'afex_core_direct_execute_test_login') THEN
        RAISE EXCEPTION 'A2.4B.3 disposable LOGIN already exists';
    END IF;
    IF pg_catalog.to_regprocedure('public.afex_core_direct_execute_probe_v1()') IS NOT NULL THEN
        RAISE EXCEPTION 'A2.4B.3 disposable function already exists';
    END IF;
    IF pg_catalog.to_regclass('public.afex_core_direct_execute_denied_table_v1') IS NOT NULL
       OR pg_catalog.to_regclass('public.afex_core_direct_execute_denied_sequence_v1') IS NOT NULL THEN
        RAISE EXCEPTION 'A2.4B.3 disposable denial object already exists';
    END IF;
    IF NOT pg_catalog.pg_has_role(current_user, 'afex_function_owner', 'SET') THEN
        RAISE EXCEPTION 'installer cannot transfer function ownership';
    END IF;
END
$preflight$;

CREATE ROLE afex_core_direct_execute_test_login
    LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
    NOREPLICATION CONNECTION LIMIT 2
    PASSWORD :'A24B3_TEST_PASSWORD'
    VALID UNTIL :'A24B3_VALID_UNTIL';

CREATE TABLE public.afex_core_direct_execute_denied_table_v1 (marker integer NOT NULL);
ALTER TABLE public.afex_core_direct_execute_denied_table_v1 OWNER TO afex_function_owner;
REVOKE ALL ON TABLE public.afex_core_direct_execute_denied_table_v1 FROM PUBLIC;

CREATE SEQUENCE public.afex_core_direct_execute_denied_sequence_v1;
ALTER SEQUENCE public.afex_core_direct_execute_denied_sequence_v1 OWNER TO afex_function_owner;
REVOKE ALL ON SEQUENCE public.afex_core_direct_execute_denied_sequence_v1 FROM PUBLIC;

CREATE FUNCTION public.afex_core_direct_execute_probe_v1()
RETURNS TABLE (
    caller_session_user name,
    effective_function_user name,
    backend_pid integer,
    transaction_id bigint,
    probe_value text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
    SELECT
        session_user,
        current_user,
        pg_catalog.pg_backend_pid(),
        pg_catalog.txid_current_if_assigned(),
        'A24B3_DIRECT_EXECUTE_OK'::text
$function$;

ALTER FUNCTION public.afex_core_direct_execute_probe_v1() OWNER TO afex_function_owner;
REVOKE ALL ON FUNCTION public.afex_core_direct_execute_probe_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.afex_core_direct_execute_probe_v1() FROM anon;
REVOKE ALL ON FUNCTION public.afex_core_direct_execute_probe_v1() FROM authenticated;
REVOKE ALL ON FUNCTION public.afex_core_direct_execute_probe_v1() FROM service_role;
GRANT EXECUTE ON FUNCTION public.afex_core_direct_execute_probe_v1()
    TO afex_core_direct_execute_test_login;

DO $verify$
DECLARE
    login_oid oid;
    function_oid oid := pg_catalog.to_regprocedure('public.afex_core_direct_execute_probe_v1()');
BEGIN
    SELECT oid INTO login_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_direct_execute_test_login';
    IF login_oid IS NULL OR function_oid IS NULL THEN
        RAISE EXCEPTION 'A2.4B.3 setup object missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members
        WHERE roleid = login_oid OR member = login_oid
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN unexpectedly participates in membership';
    END IF;
    IF NOT pg_catalog.has_function_privilege(
        'afex_core_direct_execute_test_login', function_oid, 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 exact EXECUTE grant missing';
    END IF;
    IF pg_catalog.has_function_privilege(
        'afex_core_direct_execute_test_login',
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamptz)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 test LOGIN must not execute P2D.20';
    END IF;
    IF pg_catalog.has_table_privilege(login_oid,
        'public.afex_core_direct_execute_denied_table_v1','SELECT,INSERT,UPDATE,DELETE')
       OR pg_catalog.has_sequence_privilege(login_oid,
        'public.afex_core_direct_execute_denied_sequence_v1','USAGE,SELECT,UPDATE') THEN
        RAISE EXCEPTION 'A2.4B.3 disposable denial object is reachable';
    END IF;
END
$verify$;

COMMIT;
\echo 'A24B3_100_DISPOSABLE_DIRECT_EXECUTE_SETUP_OK'
