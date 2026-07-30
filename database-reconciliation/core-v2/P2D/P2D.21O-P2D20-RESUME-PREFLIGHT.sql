\if :{?AFEX_EXPECTED_DATABASE}
\else
\echo 'P2D.21O failed: AFEX_EXPECTED_DATABASE is required'
\quit 3
\endif
\if :{?AFEX_EXPECTED_USER}
\else
\echo 'P2D.21O failed: AFEX_EXPECTED_USER is required'
\quit 3
\endif

SELECT
    pg_catalog.current_database() = :'AFEX_EXPECTED_DATABASE'
        AS p2d21o_database_matches,
    CURRENT_USER::text = :'AFEX_EXPECTED_USER'
        AS p2d21o_user_matches
\gset

\if :p2d21o_database_matches
\else
\echo 'P2D.21O failed: database identity mismatch'
\quit 3
\endif
\if :p2d21o_user_matches
\else
\echo 'P2D.21O failed: installer identity mismatch'
\quit 3
\endif

\ir P2D.19-POST-INSTALL-ATTESTATION.sql

BEGIN TRANSACTION READ ONLY;

-- AFEX Core V2 P2D.21O - P2D.20 Resume Preflight
-- READ ONLY. Requires attested P2D.19 and exact absence of P2D.20.

DO $preflight$
BEGIN
    IF pg_catalog.current_setting('server_version_num')::integer <> 170006
       OR pg_catalog.current_setting('server_encoding')
          IS DISTINCT FROM 'UTF8'
       OR CURRENT_USER IS DISTINCT FROM 'postgres'
       OR SESSION_USER IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21O failed: Production environment identity mismatch';
    END IF;
END
$preflight$;

DO $preflight$
DECLARE
    installer_oid oid;
    core_owner_oid oid;
    function_owner_oid oid;
    supabase_admin_oid oid;
BEGIN
    SELECT oid INTO installer_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres'
      AND rolcanlogin
      AND rolcreaterole;
    SELECT oid INTO core_owner_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_owner'
      AND NOT rolcanlogin;
    SELECT oid INTO function_owner_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_function_owner'
      AND NOT rolcanlogin;
    SELECT oid INTO supabase_admin_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'supabase_admin';

    IF installer_oid IS NULL
       OR core_owner_oid IS NULL
       OR function_owner_oid IS NULL
       OR supabase_admin_oid IS NULL
       OR EXISTS (
           SELECT 1
           FROM (VALUES (core_owner_oid), (function_owner_oid))
                AS target(role_oid)
           WHERE (
               SELECT pg_catalog.count(*)
               FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.roleid = target.role_oid
                  OR membership.member = target.role_oid
           ) <> 1
              OR NOT EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target.role_oid
                    AND membership.member = installer_oid
                    AND membership.grantor = supabase_admin_oid
                    AND membership.admin_option
                    AND NOT membership.inherit_option
                    AND NOT membership.set_option
              )
              OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target.role_oid
                    AND membership.member = installer_oid
                    AND membership.grantor = installer_oid
              )
       )
       OR pg_catalog.pg_has_role(
           CURRENT_USER, 'afex_core_owner', 'SET'
       )
       OR pg_catalog.pg_has_role(
           CURRENT_USER, 'afex_function_owner', 'SET'
       )
       OR NOT pg_catalog.has_schema_privilege(
           CURRENT_USER, 'public', 'CREATE'
       )
       OR NOT pg_catalog.has_schema_privilege(
           CURRENT_USER, 'public', 'USAGE'
       )
       OR NOT pg_catalog.has_schema_privilege(
           CURRENT_USER, 'public', 'CREATE WITH GRANT OPTION'
       )
       OR pg_catalog.has_schema_privilege(
           'afex_core_owner', 'public', 'CREATE'
       )
       OR pg_catalog.has_schema_privilege(
           'afex_function_owner', 'public', 'CREATE'
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_namespace AS namespace_state
           CROSS JOIN LATERAL pg_catalog.unnest(
               namespace_state.nspacl
           ) AS acl_item(value)
           CROSS JOIN LATERAL pg_catalog.aclexplode(
               ARRAY[acl_item.value]::aclitem[]
           ) AS acl_state
           WHERE namespace_state.nspname = 'public'
             AND acl_state.grantee IN (
                 core_owner_oid,
                 function_owner_oid
             )
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_default_acl AS default_acl
           WHERE default_acl.defaclrole = function_owner_oid
             AND default_acl.defaclobjtype = 'f'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21O failed: installer bootstrap authority mismatch';
    END IF;
END
$preflight$;

DO $preflight$
DECLARE
    function_owner_oid oid;
BEGIN
    SELECT oid INTO function_owner_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_function_owner';

    IF pg_catalog.to_regprocedure(
           'public.canonicalize_atomic_order_json_v1(jsonb)'
       ) IS NOT NULL
       OR pg_catalog.to_regprocedure(
           'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
       ) IS NOT NULL
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_constraint AS constraint_state
           WHERE constraint_state.conrelid =
                 pg_catalog.to_regclass(
                     'public.atomic_order_command_payloads'
                 )
             AND constraint_state.conname =
                 'atomic_order_command_payloads_canonical_size_binding_check'
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_policy AS policy_state
           WHERE policy_state.polname IN (
               'core_v2_function_owner_profiles_authorization_read',
               'core_v2_function_owner_tenants_authorization_read',
               'core_v2_function_owner_branches_authorization_read'
           )
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_attribute AS attribute_state
           CROSS JOIN LATERAL pg_catalog.unnest(
               attribute_state.attacl
           ) AS acl_item(value)
           CROSS JOIN LATERAL pg_catalog.aclexplode(
               ARRAY[acl_item.value]::aclitem[]
           ) AS acl_state
           WHERE attribute_state.attrelid IN (
               pg_catalog.to_regclass('public.profiles'),
               pg_catalog.to_regclass('public.tenants'),
               pg_catalog.to_regclass('public.branches')
           )
             AND attribute_state.attnum > 0
             AND NOT attribute_state.attisdropped
             AND acl_state.grantee = function_owner_oid
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21O failed: partial P2D.20 state exists';
    END IF;

    IF EXISTS (SELECT 1 FROM public.atomic_order_commands)
       OR EXISTS (
           SELECT 1 FROM public.atomic_order_command_payloads
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21O failed: command or payload ledger is not empty';
    END IF;
END
$preflight$;

DO $preflight$
BEGIN
    RAISE NOTICE 'P2D21O_900_P2D20_RESUME_PREFLIGHT_OK';
END
$preflight$;

SELECT
    'PASS'::text AS preflight_result,
    'P2D21O_900_P2D20_RESUME_PREFLIGHT_OK'::text AS final_marker;

ROLLBACK;

-- END OF P2D.21O P2D.20 RESUME PREFLIGHT
