-- A2.4B.5E read-only provider authority audit
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;

SELECT 'A24B5E_100_IDENTITY' AS section,
       current_database() AS database_name,
       current_user AS current_user_name,
       session_user AS session_user_name,
       current_setting('server_version') AS server_version,
       current_setting('server_version_num') AS server_version_num,
       current_setting('server_encoding') AS server_encoding;

SELECT 'A24B5E_200_CURRENT_ROLE_ATTRIBUTES' AS section,
       rolname, rolcanlogin, rolsuper, rolinherit, rolcreaterole,
       rolcreatedb, rolreplication, rolbypassrls, rolconnlimit,
       rolvaliduntil IS NOT NULL AS has_finite_validity
FROM pg_catalog.pg_roles
WHERE rolname IN (current_user, session_user);

SELECT 'A24B5E_300_MANAGED_ROLE_INVENTORY' AS section,
       rolname, rolcanlogin, rolsuper, rolinherit, rolcreaterole,
       rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN ('postgres','supabase_admin','afex_function_owner',
                  'anon','authenticated','service_role')
ORDER BY rolname;

SELECT 'A24B5E_400_MEMBERSHIPS' AS section,
       granted.rolname AS granted_role,
       member.rolname AS member_role,
       grantor.rolname AS grantor_role,
       membership.admin_option,
       membership.inherit_option,
       membership.set_option
FROM pg_catalog.pg_auth_members membership
JOIN pg_catalog.pg_roles granted ON granted.oid=membership.roleid
JOIN pg_catalog.pg_roles member ON member.oid=membership.member
JOIN pg_catalog.pg_roles grantor ON grantor.oid=membership.grantor
WHERE member.rolname IN (current_user,session_user,'afex_function_owner')
   OR granted.rolname='afex_function_owner'
ORDER BY granted_role,member_role,grantor_role;

SELECT 'A24B5E_500_PUBLIC_SCHEMA' AS section,
       owner.rolname AS owner_role,
       pg_catalog.has_schema_privilege(current_user,'public','USAGE') AS effective_usage,
       pg_catalog.has_schema_privilege(current_user,'public','CREATE') AS effective_create
FROM pg_catalog.pg_namespace namespace_state
JOIN pg_catalog.pg_roles owner ON owner.oid=namespace_state.nspowner
WHERE namespace_state.nspname='public';

SELECT 'A24B5E_600_FUNCTION_OWNER_SCOPE' AS section,
       namespace_state.nspname AS schema_name,
       procedure_state.proname AS object_name,
       pg_catalog.pg_get_function_identity_arguments(procedure_state.oid) AS identity_arguments,
       procedure_state.prosecdef,
       procedure_state.proconfig
FROM pg_catalog.pg_proc procedure_state
JOIN pg_catalog.pg_namespace namespace_state ON namespace_state.oid=procedure_state.pronamespace
JOIN pg_catalog.pg_roles owner ON owner.oid=procedure_state.proowner
WHERE owner.rolname='afex_function_owner'
ORDER BY schema_name,object_name,identity_arguments;

SELECT 'A24B5E_700_DEFAULT_ACLS' AS section,
       owner.rolname AS owner_role,
       namespace_state.nspname AS schema_name,
       default_state.defaclobjtype,
       default_state.defaclacl::text AS acl_text
FROM pg_catalog.pg_default_acl default_state
JOIN pg_catalog.pg_roles owner ON owner.oid=default_state.defaclrole
LEFT JOIN pg_catalog.pg_namespace namespace_state ON namespace_state.oid=default_state.defaclnamespace
WHERE owner.rolname IN (current_user,session_user,'afex_function_owner')
ORDER BY owner_role,schema_name,default_state.defaclobjtype;

SELECT 'A24B5E_800_CONNECTION_SETTINGS' AS section,
       name, setting, unit, source
FROM pg_catalog.pg_settings
WHERE name IN ('max_connections','superuser_reserved_connections',
               'statement_timeout','transaction_timeout','lock_timeout',
               'idle_in_transaction_session_timeout')
ORDER BY name;

SELECT 'A24B5E_850_EXTENSION_CONTEXT' AS section,
       extname, extversion, namespace_state.nspname AS schema_name
FROM pg_catalog.pg_extension extension_state
JOIN pg_catalog.pg_namespace namespace_state ON namespace_state.oid=extension_state.extnamespace
ORDER BY extname;

SELECT 'A24B5E_900_PROVIDER_AUTHORITY_AUDIT_COMPLETE' AS marker;
ROLLBACK;
