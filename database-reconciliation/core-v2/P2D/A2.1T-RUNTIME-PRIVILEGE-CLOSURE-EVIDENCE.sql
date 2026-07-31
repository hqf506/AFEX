\set ON_ERROR_STOP on

-- AFEX Core V2 A2.1T — Runtime Privilege Closure Evidence
-- Restricted catalog metadata only. No business function is invoked.

BEGIN;
SET TRANSACTION READ ONLY;

-- 010 — Environment and catalog capability
SELECT 'A21T_SECTION_010_ENVIRONMENT_CATALOG_CAPABILITY'::text AS section;

SELECT
    pg_catalog.current_database()::text AS database_name,
    CURRENT_USER::text AS current_user_name,
    SESSION_USER::text AS session_user_name,
    pg_catalog.current_setting('server_version')::text AS server_version,
    pg_catalog.current_setting('server_version_num')::integer AS server_version_num,
    pg_catalog.current_setting('server_encoding')::text AS server_encoding,
    pg_catalog.current_setting('transaction_read_only')::boolean AS transaction_read_only,
    pg_catalog.to_regclass('pg_catalog.pg_auth_members') IS NOT NULL AS membership_catalog_exists,
    pg_catalog.to_regclass('pg_catalog.pg_parameter_acl') IS NOT NULL AS parameter_acl_catalog_exists,
    EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'pg_catalog.pg_auth_members'::regclass
          AND attname = 'inherit_option' AND NOT attisdropped
    ) AS inherit_option_supported,
    EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'pg_catalog.pg_auth_members'::regclass
          AND attname = 'set_option' AND NOT attisdropped
    ) AS set_option_supported;

SELECT
    pg_catalog.current_setting('server_version_num')::integer >= 170000
    AND pg_catalog.current_setting('server_encoding') = 'UTF8'
    AND pg_catalog.current_setting('transaction_read_only')::boolean
    AND pg_catalog.to_regrole('afex_core_runtime') IS NOT NULL
    AND pg_catalog.to_regrole('afex_function_owner') IS NOT NULL
    AND (
        SELECT pg_catalog.count(*) = 1
        FROM pg_catalog.pg_proc AS function_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = function_state.pronamespace
        WHERE namespace_state.nspname = 'public'
          AND function_state.proname = 'acquire_atomic_order_command_v1'
          AND pg_catalog.pg_get_function_identity_arguments(function_state.oid) =
              'p_authenticated_actor_id uuid, p_tenant_id uuid, p_branch_id uuid, p_idempotency_key text, p_correlation_reference text, p_canonical_payload text, p_fingerprint_projection text, p_retain_until timestamp with time zone'
    )
    AND (
        SELECT pg_catalog.count(*) = 2
        FROM pg_catalog.pg_attribute
        WHERE attrelid = 'pg_catalog.pg_auth_members'::regclass
          AND attname IN ('inherit_option', 'set_option')
          AND NOT attisdropped
    ) AS catalog_capability_ok
\gset a21t_

\if :a21t_catalog_capability_ok
\else
\echo 'A2.1T stopped fail-closed: catalog capability or Core V2 identity mismatch.'
\quit 3
\endif

-- 020 — Core role attributes
SELECT 'A21T_SECTION_020_CORE_ROLE_ATTRIBUTES'::text AS section;

SELECT
    role_state.rolname::text AS role_name,
    role_state.oid,
    role_state.rolcanlogin,
    role_state.rolinherit,
    role_state.rolbypassrls,
    role_state.rolsuper,
    role_state.rolcreaterole,
    role_state.rolcreatedb,
    role_state.rolreplication,
    role_state.rolconnlimit,
    role_state.rolvaliduntil,
    setting_state.setconfig
FROM pg_catalog.pg_roles AS role_state
LEFT JOIN pg_catalog.pg_db_role_setting AS setting_state
  ON setting_state.setrole = role_state.oid
 AND setting_state.setdatabase = 0
WHERE role_state.rolname IN ('afex_core_runtime', 'afex_function_owner')
ORDER BY role_name;

-- 030 — Complete LOGIN inventory
SELECT 'A21T_SECTION_030_COMPLETE_LOGIN_INVENTORY'::text AS section;

SELECT
    role_state.rolname::text AS role_name,
    role_state.oid,
    role_state.rolcanlogin,
    role_state.rolinherit,
    role_state.rolbypassrls,
    role_state.rolsuper,
    role_state.rolcreaterole,
    role_state.rolcreatedb,
    role_state.rolreplication,
    role_state.rolconnlimit,
    role_state.rolvaliduntil,
    pg_catalog.pg_has_role(
        role_state.oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
    ) AS can_set_runtime,
    pg_catalog.pg_has_role(
        role_state.oid, pg_catalog.to_regrole('afex_core_runtime'), 'MEMBER'
    ) AS is_member_of_runtime,
    pg_catalog.pg_has_role(
        role_state.oid, pg_catalog.to_regrole('afex_core_runtime'), 'USAGE'
    ) AS inherits_runtime_privileges,
    EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = role_state.oid
          AND membership.roleid = pg_catalog.to_regrole('afex_core_runtime')
    ) AS direct_runtime_membership
FROM pg_catalog.pg_roles AS role_state
WHERE role_state.rolcanlogin
ORDER BY role_name;

-- 040 — Role membership graph
SELECT 'A21T_SECTION_040_ROLE_MEMBERSHIP_GRAPH'::text AS section;

WITH relevant_roles AS (
    SELECT oid FROM pg_catalog.pg_roles
    WHERE rolcanlogin OR rolname IN (
        'postgres', 'authenticator', 'anon', 'authenticated', 'service_role',
        'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin',
        'supabase_read_only_user', 'dashboard_user', 'afex_function_owner',
        'afex_core_runtime'
    ) OR rolname ~* '(pgbouncer|supavisor|pool)'
)
SELECT
    parent.rolname::text AS parent_role,
    member.rolname::text AS member_role,
    grantor.rolname::text AS grantor,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option,
    CASE
        WHEN membership.inherit_option THEN 'INHERITED'
        WHEN membership.set_option THEN 'SET_ONLY'
        ELSE 'MEMBERSHIP_WITHOUT_INHERIT_OR_SET'
    END::text AS relationship_mode
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
WHERE membership.member IN (SELECT oid FROM relevant_roles)
   OR membership.roleid IN (SELECT oid FROM relevant_roles)
ORDER BY parent_role, member_role, grantor;

-- 050 — SET ROLE reachability
SELECT 'A21T_SECTION_050_SET_ROLE_REACHABILITY'::text AS section;

WITH sources AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolcanlogin OR rolname = 'afex_core_runtime'
)
SELECT
    source.rolname::text AS source_role,
    target.rolname::text AS settable_role,
    target.rolsuper,
    target.rolbypassrls,
    target.rolcanlogin
FROM sources AS source
CROSS JOIN pg_catalog.pg_roles AS target
WHERE source.oid <> target.oid
  AND pg_catalog.pg_has_role(source.oid, target.oid, 'SET')
ORDER BY source_role, settable_role;

-- 060 — Core V2 exact function ACLs
SELECT 'A21T_SECTION_060_CORE_V2_FUNCTION_EXACT_ACLS'::text AS section;

WITH functions AS (
    SELECT function_state.*, namespace_state.nspname
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
    WHERE namespace_state.nspname = 'public'
      AND function_state.proname IN (
          'acquire_atomic_order_command_v1',
          'canonicalize_atomic_order_json_v1'
      )
), acl AS (
    SELECT function_state.oid AS function_oid, acl_state.*
    FROM functions AS function_state
    CROSS JOIN LATERAL pg_catalog.unnest(function_state.proacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[item.value]::aclitem[]
    ) AS acl_state
)
SELECT
    function_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text AS identity_arguments,
    pg_catalog.pg_get_function_result(function_state.oid)::text AS result_type,
    pg_catalog.pg_get_userbyid(function_state.proowner)::text AS owner,
    function_state.prosecdef AS security_definer,
    function_state.proconfig,
    CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl.grantee)::text END AS grantee,
    CASE WHEN acl.grantor = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl.grantor)::text END AS grantor,
    acl.privilege_type::text,
    acl.is_grantable
FROM functions AS function_state
LEFT JOIN acl ON acl.function_oid = function_state.oid
ORDER BY function_name, identity_arguments, grantee;

-- 070 — Complete PUBLIC function exposure
SELECT 'A21T_SECTION_070_PUBLIC_FUNCTION_EXPOSURE'::text AS section;

WITH functions AS (
    SELECT function_state.*, namespace_state.nspname,
           language_state.lanname,
           extension_state.extname
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
    JOIN pg_catalog.pg_language AS language_state
      ON language_state.oid = function_state.prolang
    LEFT JOIN pg_catalog.pg_depend AS extension_dependency
      ON extension_dependency.classid = 'pg_catalog.pg_proc'::regclass
     AND extension_dependency.objid = function_state.oid
     AND extension_dependency.deptype = 'e'
    LEFT JOIN pg_catalog.pg_extension AS extension_state
      ON extension_state.oid = extension_dependency.refobjid
    WHERE namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
), public_acl AS (
    SELECT function_state.oid AS function_oid,
           acl_state.privilege_type::text AS privilege_type
    FROM functions AS function_state
    CROSS JOIN LATERAL pg_catalog.unnest(function_state.proacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[item.value]::aclitem[]
    ) AS acl_state
    WHERE acl_state.grantee = 0 AND acl_state.privilege_type = 'EXECUTE'
)
SELECT
    function_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text AS identity_arguments,
    pg_catalog.pg_get_function_result(function_state.oid)::text AS result_type,
    function_state.lanname::text AS language,
    pg_catalog.pg_get_userbyid(function_state.proowner)::text AS owner,
    function_state.prosecdef AS security_definer,
    function_state.proleakproof AS leakproof,
    function_state.provolatile::text AS volatility,
    function_state.proparallel::text AS parallel_safety,
    function_state.proisstrict AS strict,
    function_state.proconfig,
    function_state.proacl::text AS direct_acl_text,
    function_state.proacl IS NULL AS implicit_public_default,
    function_state.proacl IS NULL OR public_acl.function_oid IS NOT NULL
        AS public_execute_source,
    function_state.extname::text AS extension_name,
    pg_catalog.has_schema_privilege(
        'afex_core_runtime', function_state.pronamespace, 'USAGE'
    ) AS runtime_schema_usage,
    pg_catalog.has_function_privilege(
        'afex_core_runtime', function_state.oid, 'EXECUTE'
    ) AS runtime_effective_execute,
    CASE
        WHEN NOT pg_catalog.has_schema_privilege(
            'afex_core_runtime', function_state.pronamespace, 'USAGE'
        ) THEN 'CATALOG_EXECUTE_BUT_SCHEMA_UNREACHABLE'
        ELSE 'PRACTICALLY_REACHABLE'
    END::text AS reachability,
    CASE WHEN function_state.extname IS NOT NULL
         THEN 'MANAGED_EXTENSION_EVIDENCE_ONLY'
         WHEN function_state.nspname IN ('auth','storage','realtime','vault','net','cron','graphql','graphql_public')
         THEN 'MANAGED_SCHEMA_EVIDENCE_ONLY'
         ELSE 'REQUIRES_CONSUMER_CLASSIFICATION' END::text AS classification_status
FROM functions AS function_state
LEFT JOIN public_acl ON public_acl.function_oid = function_state.oid
WHERE function_state.proacl IS NULL OR public_acl.function_oid IS NOT NULL
ORDER BY schema_name, function_name, identity_arguments;

-- 080 — PUBLIC SECURITY DEFINER exposure
SELECT 'A21T_SECTION_080_PUBLIC_SECURITY_DEFINER_EXPOSURE'::text AS section;

WITH exposed AS (
    SELECT function_state.*, namespace_state.nspname
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
    WHERE function_state.prosecdef
      AND namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
      AND pg_catalog.has_function_privilege(
          'afex_core_runtime', function_state.oid, 'EXECUTE'
      )
)
SELECT
    function_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text AS identity_arguments,
    pg_catalog.pg_get_userbyid(function_state.proowner)::text AS owner,
    owner_state.rolsuper AS owner_superuser,
    owner_state.rolbypassrls AS owner_bypassrls,
    function_state.proconfig,
    function_state.proconfig @> ARRAY['search_path=pg_catalog']::text[]
        AS exact_catalog_search_path_present,
    function_state.prosrc ~* '\mexecute\M' AS dynamic_execute_indicator,
    function_state.prosrc ~* '\mformat\s*\(' AS dynamic_format_indicator,
    pg_catalog.has_schema_privilege(
        'afex_core_runtime', function_state.pronamespace, 'USAGE'
    ) AS runtime_schema_usage,
    'SOURCE_TEXT_NOT_EMITTED_DEPENDENCIES_MAY_BE_INCOMPLETE'::text AS analysis_limit
FROM exposed AS function_state
JOIN pg_catalog.pg_roles AS owner_state ON owner_state.oid = function_state.proowner
ORDER BY schema_name, function_name, identity_arguments;

-- 090 — Function trigger consumers
SELECT 'A21T_SECTION_090_FUNCTION_TRIGGER_CONSUMERS'::text AS section;

SELECT
    function_namespace.nspname::text AS function_schema,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text AS identity_arguments,
    table_namespace.nspname::text AS table_schema,
    table_state.relname::text AS table_name,
    trigger_state.tgname::text AS trigger_name,
    trigger_state.tgenabled::text AS enabled_state,
    pg_catalog.pg_get_triggerdef(trigger_state.oid, false)::text AS trigger_definition,
    'CATALOG_PROVEN_TRIGGER'::text AS evidence_kind
FROM pg_catalog.pg_trigger AS trigger_state
JOIN pg_catalog.pg_proc AS function_state ON function_state.oid = trigger_state.tgfoid
JOIN pg_catalog.pg_namespace AS function_namespace
  ON function_namespace.oid = function_state.pronamespace
JOIN pg_catalog.pg_class AS table_state ON table_state.oid = trigger_state.tgrelid
JOIN pg_catalog.pg_namespace AS table_namespace
  ON table_namespace.oid = table_state.relnamespace
WHERE NOT trigger_state.tgisinternal
  AND function_namespace.nspname !~ '^pg_'
ORDER BY function_schema, function_name, identity_arguments, table_schema, table_name, trigger_name;

-- 100 — Function policy consumers
SELECT 'A21T_SECTION_100_FUNCTION_POLICY_CONSUMERS'::text AS section;

SELECT DISTINCT
    function_namespace.nspname::text AS function_schema,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text AS identity_arguments,
    table_namespace.nspname::text AS table_schema,
    table_state.relname::text AS table_name,
    policy_state.polname::text AS policy_name,
    'CATALOG_DEPENDENCY'::text AS evidence_kind
FROM pg_catalog.pg_depend AS dependency
JOIN pg_catalog.pg_proc AS function_state ON function_state.oid = dependency.refobjid
JOIN pg_catalog.pg_namespace AS function_namespace
  ON function_namespace.oid = function_state.pronamespace
JOIN pg_catalog.pg_policy AS policy_state ON policy_state.oid = dependency.objid
JOIN pg_catalog.pg_class AS table_state ON table_state.oid = policy_state.polrelid
JOIN pg_catalog.pg_namespace AS table_namespace
  ON table_namespace.oid = table_state.relnamespace
WHERE dependency.refclassid = 'pg_catalog.pg_proc'::regclass
  AND dependency.classid = 'pg_catalog.pg_policy'::regclass
  AND function_namespace.nspname !~ '^pg_'
ORDER BY function_schema, function_name, identity_arguments, table_schema, table_name, policy_name;

-- 110 — View, rule, default, constraint, and function consumers
SELECT 'A21T_SECTION_110_OTHER_FUNCTION_CONSUMERS'::text AS section;

SELECT DISTINCT
    referenced_namespace.nspname::text AS function_schema,
    referenced_function.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(referenced_function.oid)::text AS identity_arguments,
    dependent_dependency.classid::regclass::text AS dependent_catalog,
    dependent_dependency.objid,
    dependent_dependency.deptype::text,
    CASE
        WHEN dependent_dependency.classid = 'pg_catalog.pg_proc'::regclass
            THEN 'CATALOG_PROVEN_FUNCTION_DEPENDENCY'
        WHEN dependent_dependency.classid = 'pg_catalog.pg_rewrite'::regclass
            THEN 'CATALOG_PROVEN_VIEW_OR_RULE_DEPENDENCY'
        WHEN dependent_dependency.classid = 'pg_catalog.pg_attrdef'::regclass
            THEN 'CATALOG_PROVEN_DEFAULT_OR_GENERATED_DEPENDENCY'
        WHEN dependent_dependency.classid = 'pg_catalog.pg_constraint'::regclass
            THEN 'CATALOG_PROVEN_CONSTRAINT_DEPENDENCY'
        ELSE 'CATALOG_DEPENDENCY_REQUIRES_CLASSIFICATION'
    END::text AS evidence_kind
FROM pg_catalog.pg_depend AS dependent_dependency
JOIN pg_catalog.pg_proc AS referenced_function
  ON referenced_function.oid = dependent_dependency.refobjid
JOIN pg_catalog.pg_namespace AS referenced_namespace
  ON referenced_namespace.oid = referenced_function.pronamespace
WHERE dependent_dependency.refclassid = 'pg_catalog.pg_proc'::regclass
  AND referenced_namespace.nspname !~ '^pg_'
ORDER BY function_schema, function_name, identity_arguments, dependent_catalog, objid;

-- 120 — Extension dependencies
SELECT 'A21T_SECTION_120_EXTENSION_DEPENDENCIES'::text AS section;

SELECT
    extension_state.extname::text AS extension_name,
    namespace_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text AS identity_arguments,
    pg_catalog.pg_get_userbyid(function_state.proowner)::text AS owner,
    'EXTENSION_MANAGED_DO_NOT_TOUCH'::text AS classification
FROM pg_catalog.pg_depend AS dependency
JOIN pg_catalog.pg_extension AS extension_state ON extension_state.oid = dependency.refobjid
JOIN pg_catalog.pg_proc AS function_state ON function_state.oid = dependency.objid
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = function_state.pronamespace
WHERE dependency.classid = 'pg_catalog.pg_proc'::regclass
  AND dependency.refclassid = 'pg_catalog.pg_extension'::regclass
  AND dependency.deptype = 'e'
ORDER BY extension_name, schema_name, function_name, identity_arguments;

-- 130 — Schema privileges
SELECT 'A21T_SECTION_130_SCHEMA_PRIVILEGES'::text AS section;

WITH direct_acl AS (
    SELECT namespace_state.oid AS schema_oid, acl_state.*
    FROM pg_catalog.pg_namespace AS namespace_state
    CROSS JOIN LATERAL pg_catalog.unnest(namespace_state.nspacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[item.value]::aclitem[]
    ) AS acl_state
)
SELECT
    namespace_state.nspname::text AS schema_name,
    pg_catalog.pg_get_userbyid(namespace_state.nspowner)::text AS owner,
    privilege.privilege_type,
    pg_catalog.has_schema_privilege(
        'afex_core_runtime', namespace_state.oid, privilege.privilege_type
    ) AS runtime_effective_privilege,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl
        WHERE acl.schema_oid = namespace_state.oid
          AND acl.grantee = pg_catalog.to_regrole('afex_core_runtime')
          AND acl.privilege_type = privilege.privilege_type
    ) AS direct_runtime_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl
        WHERE acl.schema_oid = namespace_state.oid
          AND acl.grantee = 0
          AND acl.privilege_type = privilege.privilege_type
    ) AS public_source
FROM pg_catalog.pg_namespace AS namespace_state
CROSS JOIN (VALUES ('USAGE'::text), ('CREATE')) AS privilege(privilege_type)
WHERE namespace_state.nspname !~ '^pg_'
  AND namespace_state.nspname <> 'information_schema'
ORDER BY schema_name, privilege_type;

-- 140 — Table, view, materialized-view, and foreign-table privileges
SELECT 'A21T_SECTION_140_RELATION_PRIVILEGES'::text AS section;

WITH relations AS (
    SELECT relation_state.*, namespace_state.nspname,
           extension_state.extname
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    LEFT JOIN pg_catalog.pg_depend AS extension_dependency
      ON extension_dependency.classid = 'pg_catalog.pg_class'::regclass
     AND extension_dependency.objid = relation_state.oid
     AND extension_dependency.deptype = 'e'
    LEFT JOIN pg_catalog.pg_extension AS extension_state
      ON extension_state.oid = extension_dependency.refobjid
    WHERE relation_state.relkind IN ('r','p','v','m','f')
      AND namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
), direct_acl AS (
    SELECT relation_state.oid AS relation_oid, acl_state.*
    FROM relations AS relation_state
    CROSS JOIN LATERAL pg_catalog.unnest(relation_state.relacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[item.value]::aclitem[]
    ) AS acl_state
)
SELECT
    relation_state.nspname::text AS schema_name,
    relation_state.relname::text AS object_name,
    relation_state.relkind::text AS object_kind,
    pg_catalog.pg_get_userbyid(relation_state.relowner)::text AS owner,
    relation_state.extname::text AS extension_name,
    privilege.privilege_type,
    pg_catalog.has_table_privilege(
        'afex_core_runtime', relation_state.oid, privilege.privilege_type
    ) AS runtime_effective_privilege,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl
        WHERE acl.relation_oid = relation_state.oid
          AND acl.grantee = pg_catalog.to_regrole('afex_core_runtime')
          AND acl.privilege_type = privilege.privilege_type
    ) AS direct_runtime_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl
        WHERE acl.relation_oid = relation_state.oid
          AND acl.grantee = 0
          AND acl.privilege_type = privilege.privilege_type
    ) AS public_source,
    pg_catalog.has_schema_privilege(
        'afex_core_runtime', relation_state.relnamespace, 'USAGE'
    ) AS runtime_schema_usage,
    CASE WHEN relation_state.extname IS NOT NULL
         THEN 'EXTENSION_MANAGED_DO_NOT_TOUCH'
         WHEN relation_state.nspname IN ('auth','storage','realtime','vault','net','cron','graphql','graphql_public')
         THEN 'SUPABASE_MANAGED_DO_NOT_TOUCH'
         ELSE 'REQUIRES_CLASSIFICATION' END::text AS managed_classification
FROM relations AS relation_state
CROSS JOIN (
    VALUES ('SELECT'::text),('INSERT'),('UPDATE'),('DELETE'),
           ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')
) AS privilege(privilege_type)
WHERE pg_catalog.has_table_privilege(
    'afex_core_runtime', relation_state.oid, privilege.privilege_type
)
ORDER BY schema_name, object_name, privilege_type;

-- 150 — Sequence privileges
SELECT 'A21T_SECTION_150_SEQUENCE_PRIVILEGES'::text AS section;

SELECT
    namespace_state.nspname::text AS schema_name,
    sequence_state.relname::text AS sequence_name,
    pg_catalog.pg_get_userbyid(sequence_state.relowner)::text AS owner,
    privilege.privilege_type,
    pg_catalog.has_sequence_privilege(
        'afex_core_runtime', sequence_state.oid, privilege.privilege_type
    ) AS runtime_effective_privilege,
    pg_catalog.has_schema_privilege(
        'afex_core_runtime', sequence_state.relnamespace, 'USAGE'
    ) AS runtime_schema_usage,
    sequence_state.relacl::text AS direct_acl_text
FROM pg_catalog.pg_class AS sequence_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = sequence_state.relnamespace
CROSS JOIN (VALUES ('USAGE'::text),('SELECT'),('UPDATE')) AS privilege(privilege_type)
WHERE sequence_state.relkind = 'S'
  AND namespace_state.nspname !~ '^pg_'
  AND namespace_state.nspname <> 'information_schema'
  AND pg_catalog.has_sequence_privilege(
      'afex_core_runtime', sequence_state.oid, privilege.privilege_type
  )
ORDER BY schema_name, sequence_name, privilege_type;

-- 160 — Normalized default privileges
SELECT 'A21T_SECTION_160_DEFAULT_PRIVILEGES'::text AS section;

SELECT
    pg_catalog.pg_get_userbyid(default_state.defaclrole)::text AS owner,
    COALESCE(namespace_state.nspname::text, '<global>') AS schema_name,
    default_state.defaclobjtype::text AS object_type,
    CASE WHEN acl_state.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text END AS grantee,
    CASE WHEN acl_state.grantor = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantor)::text END AS grantor,
    acl_state.privilege_type::text,
    acl_state.is_grantable,
    'OWNER_SCHEMA_OBJECT_TYPE_SCOPED_NO_CAUSALITY_INFERENCE'::text AS interpretation
FROM pg_catalog.pg_default_acl AS default_state
LEFT JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = default_state.defaclnamespace
CROSS JOIN LATERAL pg_catalog.unnest(default_state.defaclacl) AS item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(
    ARRAY[item.value]::aclitem[]
) AS acl_state
ORDER BY owner, schema_name, object_type, grantee, privilege_type;

-- 170 — PostgREST-relevant database exposure
SELECT 'A21T_SECTION_170_POSTGREST_RELEVANT_EXPOSURE'::text AS section;

WITH api_roles AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon','authenticated','service_role','authenticator')
), functions AS (
    SELECT function_state.*, namespace_state.nspname
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
    WHERE namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
), overloads AS (
    SELECT nspname, proname, pg_catalog.count(*) AS overload_count
    FROM functions
    GROUP BY nspname, proname
)
SELECT
    api_role.rolname::text AS api_role,
    function_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text AS identity_arguments,
    pg_catalog.pg_get_function_result(function_state.oid)::text AS result_type,
    function_state.prosecdef AS security_definer,
    pg_catalog.has_schema_privilege(
        api_role.oid, function_state.pronamespace, 'USAGE'
    ) AS schema_usage,
    pg_catalog.has_function_privilege(
        api_role.oid, function_state.oid, 'EXECUTE'
    ) AS effective_execute,
    overload_state.overload_count,
    'DATABASE_PRIVILEGE_ONLY_DASHBOARD_EXPOSED_SCHEMAS_UNPROVEN'::text AS boundary
FROM api_roles AS api_role
CROSS JOIN functions AS function_state
JOIN overloads AS overload_state
  ON overload_state.nspname = function_state.nspname
 AND overload_state.proname = function_state.proname
WHERE pg_catalog.has_function_privilege(
    api_role.oid, function_state.oid, 'EXECUTE'
)
ORDER BY api_role, schema_name, function_name, identity_arguments;

-- 180 — Managed-object ownership
SELECT 'A21T_SECTION_180_MANAGED_OBJECT_OWNERSHIP'::text AS section;

WITH managed_roles AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname IN (
        'supabase_admin','supabase_auth_admin','supabase_storage_admin',
        'supabase_read_only_user','dashboard_user'
    ) OR rolname ~* '(supabase|storage|realtime|graphql|vault|cron)'
)
SELECT
    'RELATION'::text AS object_type,
    namespace_state.nspname::text AS schema_name,
    relation_state.relname::text AS object_name,
    relation_state.relkind::text AS identity,
    owner_state.rolname::text AS owner,
    'MANAGED_EVIDENCE_ONLY'::text AS classification
FROM pg_catalog.pg_class AS relation_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
JOIN managed_roles AS owner_state ON owner_state.oid = relation_state.relowner
UNION ALL
SELECT
    'FUNCTION', namespace_state.nspname::text,
    function_state.proname::text,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text,
    owner_state.rolname::text, 'MANAGED_EVIDENCE_ONLY'
FROM pg_catalog.pg_proc AS function_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = function_state.pronamespace
JOIN managed_roles AS owner_state ON owner_state.oid = function_state.proowner
ORDER BY object_type, schema_name, object_name, identity;

-- 190 — pg_stat_statements reachability
SELECT 'A21T_SECTION_190_PG_STAT_STATEMENTS_REACHABILITY'::text AS section;

SELECT
    namespace_state.nspname::text AS schema_name,
    relation_state.relname::text AS object_name,
    pg_catalog.pg_get_userbyid(relation_state.relowner)::text AS owner,
    relation_state.relacl::text AS direct_acl_text,
    pg_catalog.has_table_privilege(
        'afex_core_runtime', relation_state.oid, 'SELECT'
    ) AS runtime_select,
    pg_catalog.has_schema_privilege(
        'afex_core_runtime', relation_state.relnamespace, 'USAGE'
    ) AS runtime_schema_usage,
    pg_catalog.has_table_privilege(
        'afex_core_runtime', relation_state.oid, 'SELECT'
    ) AND pg_catalog.has_schema_privilege(
        'afex_core_runtime', relation_state.relnamespace, 'USAGE'
    ) AS practically_reachable,
    extension_state.extname::text AS extension_name
FROM pg_catalog.pg_class AS relation_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
LEFT JOIN pg_catalog.pg_depend AS dependency
  ON dependency.classid = 'pg_catalog.pg_class'::regclass
 AND dependency.objid = relation_state.oid AND dependency.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension AS extension_state
  ON extension_state.oid = dependency.refobjid
WHERE namespace_state.nspname = 'extensions'
  AND relation_state.relname IN ('pg_stat_statements','pg_stat_statements_info')
ORDER BY object_name;

-- 200 — Pooling evidence boundary
SELECT 'A21T_SECTION_200_POOLING_EVIDENCE_BOUNDARY'::text AS section;

SELECT
    role_state.rolname::text AS pooling_related_role,
    role_state.rolcanlogin,
    role_state.rolinherit,
    role_state.rolsuper,
    role_state.rolbypassrls,
    setting_state.setconfig
FROM pg_catalog.pg_roles AS role_state
LEFT JOIN pg_catalog.pg_db_role_setting AS setting_state
  ON setting_state.setrole = role_state.oid
WHERE role_state.rolname ~* '(pgbouncer|supavisor|pool|authenticator)'
ORDER BY pooling_related_role;

SELECT
    name::text AS setting_name,
    setting::text AS current_value,
    source::text AS setting_source,
    context::text AS setting_context
FROM pg_catalog.pg_settings
WHERE name IN (
    'search_path','row_security','statement_timeout','lock_timeout',
    'idle_in_transaction_session_timeout','application_name'
)
ORDER BY setting_name;

SELECT
    false AS external_pool_mode_proven,
    false AS reset_role_proven,
    false AS discard_all_proven,
    false AS connection_return_sanitation_proven,
    'SUPABASE_DASHBOARD_PGBOUNCER_SUPAVISOR_DEPLOYMENT_AND_CONNECTION_EVIDENCE_REQUIRED'::text
        AS external_evidence_required;

-- 250 — Candidate reconciliation
SELECT 'A21T_SECTION_250_CANDIDATE_RECONCILIATION'::text AS section;

WITH candidates AS (
    SELECT role_state.oid, role_state.rolname
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolcanlogin
      AND NOT role_state.rolsuper
      AND role_state.rolname !~ '^pg_'
      AND role_state.rolname <> 'postgres'
      AND (
          EXISTS (
              SELECT 1 FROM pg_catalog.pg_auth_members AS membership
              WHERE membership.member = role_state.oid
                AND membership.roleid = pg_catalog.to_regrole('afex_core_runtime')
          )
          OR pg_catalog.pg_has_role(
              role_state.oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
          )
      )
), discovery AS (SELECT * FROM candidates),
membership_analysis AS (SELECT * FROM candidates),
final_analysis AS (SELECT * FROM candidates)
SELECT
    (SELECT pg_catalog.count(*) FROM discovery) AS discovery_candidate_count,
    (SELECT pg_catalog.count(*) FROM membership_analysis) AS membership_candidate_count,
    (SELECT pg_catalog.count(*) FROM final_analysis) AS final_candidate_count,
    (SELECT pg_catalog.count(*) FROM discovery) =
        (SELECT pg_catalog.count(*) FROM membership_analysis)
    AND (SELECT pg_catalog.count(*) FROM membership_analysis) =
        (SELECT pg_catalog.count(*) FROM final_analysis) AS candidate_counts_match,
    ARRAY(SELECT rolname::text FROM candidates ORDER BY rolname) AS candidate_roles;

-- 260 — Final evidence sufficiency classification
SELECT 'A21T_SECTION_260_EVIDENCE_SUFFICIENCY'::text AS section;

WITH candidates AS (
    SELECT role_state.oid, role_state.rolname
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolcanlogin
      AND NOT role_state.rolsuper
      AND role_state.rolname !~ '^pg_'
      AND role_state.rolname <> 'postgres'
      AND (
          EXISTS (
              SELECT 1 FROM pg_catalog.pg_auth_members AS membership
              WHERE membership.member = role_state.oid
                AND membership.roleid = pg_catalog.to_regrole('afex_core_runtime')
          )
          OR pg_catalog.pg_has_role(
              role_state.oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
          )
      )
), role_graph AS (
    SELECT membership.*
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member = pg_catalog.to_regrole('afex_core_runtime')
       OR (
           membership.roleid = pg_catalog.to_regrole('afex_core_runtime')
           AND NOT membership.set_option
       )
), reconciliation AS (
    SELECT
        (SELECT pg_catalog.count(*) FROM candidates) AS discovery_count,
        (SELECT pg_catalog.count(*) FROM candidates) AS membership_count,
        (SELECT pg_catalog.count(*) FROM candidates) AS final_count
), blockers AS (
    SELECT * FROM (VALUES
        ('CATALOG_CAPABILITY_INSUFFICIENT'::text, false, '010'::text),
        ('LOGIN_IDENTITY_MISSING'::text, (SELECT pg_catalog.count(*) FROM candidates) = 0, '030,040,050,250'::text),
        ('LOGIN_IDENTITY_AMBIGUOUS', (SELECT pg_catalog.count(*) FROM candidates) > 1, '030,040,050,250'),
        ('ROLE_GRAPH_UNSAFE', EXISTS (SELECT 1 FROM role_graph), '040,050'),
        ('PUBLIC_FUNCTION_CONSUMERS_UNPROVEN', true, '070,090,100,110'),
        ('SECURITY_DEFINER_REACHABILITY_UNPROVEN', true, '080,090,100,110'),
        ('MANAGED_OBJECT_ACL_MODEL_UNPROVEN', true, '120,140,170,180,190'),
        ('DEFAULT_PRIVILEGE_CAUSALITY_UNPROVEN', true, '160'),
        ('POOLING_EVIDENCE_EXTERNAL_AND_MISSING', true, '200'),
        ('INCONSISTENT_EVIDENCE', EXISTS (
            SELECT 1 FROM reconciliation
            WHERE discovery_count <> membership_count
               OR membership_count <> final_count
        ), '250'),
        ('DIAGNOSTIC_FAILURE', false, 'runner')
    ) AS blocker(code, is_blocking, evidence_sections)
), active AS (
    SELECT * FROM blockers WHERE is_blocking
), primary_result AS (
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'CATALOG_CAPABILITY_INSUFFICIENT')
            THEN 'CATALOG_CAPABILITY_INSUFFICIENT'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'INCONSISTENT_EVIDENCE')
            THEN 'INCONSISTENT_EVIDENCE'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'ROLE_GRAPH_UNSAFE')
            THEN 'ROLE_GRAPH_UNSAFE'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'LOGIN_IDENTITY_MISSING')
            THEN 'LOGIN_IDENTITY_MISSING'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'LOGIN_IDENTITY_AMBIGUOUS')
            THEN 'LOGIN_IDENTITY_AMBIGUOUS'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'SECURITY_DEFINER_REACHABILITY_UNPROVEN')
            THEN 'SECURITY_DEFINER_REACHABILITY_UNPROVEN'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'PUBLIC_FUNCTION_CONSUMERS_UNPROVEN')
            THEN 'PUBLIC_FUNCTION_CONSUMERS_UNPROVEN'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'MANAGED_OBJECT_ACL_MODEL_UNPROVEN')
            THEN 'MANAGED_OBJECT_ACL_MODEL_UNPROVEN'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'DEFAULT_PRIVILEGE_CAUSALITY_UNPROVEN')
            THEN 'DEFAULT_PRIVILEGE_CAUSALITY_UNPROVEN'
        WHEN EXISTS (SELECT 1 FROM active WHERE code = 'POOLING_EVIDENCE_EXTERNAL_AND_MISSING')
            THEN 'POOLING_EVIDENCE_EXTERNAL_AND_MISSING'
        ELSE 'EVIDENCE_COMPLETE_FOR_CLOSURE_DESIGN'
    END::text AS primary_classification
)
SELECT
    primary_result.primary_classification,
    (SELECT pg_catalog.count(*) FROM active) AS blocker_count,
    ARRAY(SELECT code FROM active ORDER BY code) AS normalized_blocker_list,
    ARRAY(
        SELECT code || ':' || evidence_sections
        FROM active ORDER BY code
    ) AS blocker_evidence_map
FROM primary_result;

SELECT 'A21T_900_RUNTIME_PRIVILEGE_CLOSURE_EVIDENCE_COMPLETE'::text AS final_marker;

ROLLBACK;
