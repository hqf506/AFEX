-- A2.4B.3 disposable direct-EXECUTE cleanup and revocation
\set ON_ERROR_STOP on
\if :{?A24B3_CLEANUP_AUTHORIZED}
\else
\echo 'STOP: explicit A24B3_CLEANUP_AUTHORIZED variable is required.'
\quit 3
\endif

BEGIN;
DO $preflight$
DECLARE
    login_oid oid;
BEGIN
    SELECT oid INTO login_oid FROM pg_catalog.pg_roles
    WHERE rolname='afex_core_direct_execute_test_login';
    IF login_oid IS NULL THEN
        RAISE EXCEPTION 'A2.4B.3 disposable LOGIN is absent';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members
               WHERE roleid=login_oid OR member=login_oid) THEN
        RAISE EXCEPTION 'unexpected membership blocks cleanup';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner=login_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner=login_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner=login_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba=login_oid) THEN
        RAISE EXCEPTION 'unexpected ownership blocks cleanup';
    END IF;
END
$preflight$;

REVOKE EXECUTE ON FUNCTION public.afex_core_direct_execute_probe_v1()
    FROM afex_core_direct_execute_test_login;
ALTER ROLE afex_core_direct_execute_test_login NOLOGIN PASSWORD NULL;
DROP FUNCTION public.afex_core_direct_execute_probe_v1();
DROP TABLE public.afex_core_direct_execute_denied_table_v1;
DROP SEQUENCE public.afex_core_direct_execute_denied_sequence_v1;
DROP ROLE afex_core_direct_execute_test_login;

DO $verify$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
               WHERE rolname='afex_core_direct_execute_test_login')
       OR pg_catalog.to_regprocedure('public.afex_core_direct_execute_probe_v1()') IS NOT NULL
       OR pg_catalog.to_regclass('public.afex_core_direct_execute_denied_table_v1') IS NOT NULL
       OR pg_catalog.to_regclass('public.afex_core_direct_execute_denied_sequence_v1') IS NOT NULL THEN
        RAISE EXCEPTION 'A2.4B.3 cleanup absence verification failed';
    END IF;
END
$verify$;
COMMIT;
\echo 'A24B3_900_DISPOSABLE_DIRECT_EXECUTE_CLEANUP_OK'
