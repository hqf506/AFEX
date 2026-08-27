/*
classification: READ_ONLY_ATTESTATION_ONLY
purpose: Catalog-only preflight template for the later human-selected Production target.
execution authorization: NONE. Human review and separate manual approval remain required.
transaction: explicit READ ONLY transaction ending in ROLLBACK.
lock level: ACCESS SHARE on catalogs and named relations only.
statement timeout: 60 seconds; lock timeout: 5 seconds.
source authority: Prompt 10 corrected Production read-only attestation (P10-Q007R).
expected identity: database postgres; PostgreSQL 17.6 / server_version_num 170006;
installation login/current role postgres. Owner-aware forward waves temporarily enable
SET for an exact AFEX owner role, use SET LOCAL ROLE, RESET ROLE, and revoke the
transaction-bounded membership GRANTED BY CURRENT_USER
inside the same transaction before COMMIT.
stop conditions: wrong database target, server major version other than 17, identity drift,
missing caller qualification, missing dependency, or any unreviewed role/object.
*/

BEGIN TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- SQL00-Q01: the later human operator must stop unless the exact corrected Prompt 10
-- Production identity is observed. This read-only template does not authorize that access.
SELECT
  pg_catalog.current_database() AS database_name,
  CURRENT_USER AS current_user_name,
  SESSION_USER AS session_user_name,
  pg_catalog.current_setting('server_version') AS server_version,
  pg_catalog.current_setting('server_version_num') AS server_version_number,
  pg_catalog.current_setting('transaction_read_only') AS transaction_read_only;

SELECT
  pg_catalog.current_database() = 'postgres' AS expected_database,
  pg_catalog.current_setting('server_version_num') = '170006' AS expected_server_version_num,
  pg_catalog.current_setting('transaction_read_only') = 'on' AS read_only_proven,
  CURRENT_USER = 'postgres' AS expected_installer_current_role,
  SESSION_USER = 'postgres' AS expected_installer_login_role;

-- SQL00-Q02: exact relevant role attributes.
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
       rolreplication, rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname = ANY (ARRAY[
  'postgres','supabase_admin','authenticator','anon','authenticated','service_role',
  'afex_context_issuer','afex_core_owner','afex_core_runtime','afex_function_owner',
  'afex_outbox_worker','afex_pos_session_owner','afex_pos_session_maintenance',
  'afex_reconciliation_authority','afex_identity_owner','afex_business_owner',
  'afex_inventory_owner','afex_audit_owner','afex_offline_authority_owner',
  'afex_review_owner','afex_effect_owner','afex_offline_enrollment_runtime',
  'afex_offline_acquisition_runtime','afex_business_review_runtime',
  'afex_effect_dispatcher'
]::pg_catalog.name[])
ORDER BY rolname;

SELECT rolname='postgres' AND NOT rolsuper AND rolcreaterole
       AS expected_bounded_role_installer
FROM pg_catalog.pg_roles
WHERE rolname='postgres';

-- SQL00-Q03: grantor and SET/INHERIT/ADMIN reachability.
SELECT member_role.rolname AS member_name, granted_role.rolname AS granted_role,
       grantor_role.rolname AS grantor_name, m.admin_option,
       m.inherit_option, m.set_option
FROM pg_catalog.pg_auth_members AS m
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = m.member
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = m.roleid
JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = m.grantor
WHERE member_role.rolname IN ('authenticator','postgres','anon','authenticated','service_role')
   OR member_role.rolname LIKE 'afex\_%' ESCAPE '\'
   OR granted_role.rolname LIKE 'afex\_%' ESCAPE '\'
ORDER BY member_name, granted_role, grantor_name;

-- SQL00-Q04: database/schema owner and raw/effective ACL evidence.
SELECT d.datname,owner_role.rolname AS owner_name,d.datacl,
       pg_catalog.has_database_privilege('postgres',d.datname,'CONNECT') AS postgres_connect,
       pg_catalog.has_database_privilege('postgres',d.datname,'CREATE') AS postgres_create
FROM pg_catalog.pg_database d
JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=d.datdba
WHERE d.datname=pg_catalog.current_database();

SELECT n.nspname, owner_role.rolname AS owner_name, n.nspacl
FROM pg_catalog.pg_namespace AS n
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = n.nspowner
WHERE n.nspname IN ('public','auth','afex_core_private','afex_pos_authority',
                    'afex_offline_authority','afex_review_private','afex_effect_private')
ORDER BY n.nspname;

-- SQL00-Q05: default privileges by exact grantor/schema/object type.
SELECT owner_role.rolname AS owner_name, n.nspname, d.defaclobjtype, d.defaclacl
FROM pg_catalog.pg_default_acl AS d
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = d.defaclrole
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
WHERE owner_role.rolname LIKE 'afex\_%' ESCAPE '\'
   OR owner_role.rolname IN ('postgres','supabase_admin')
ORDER BY owner_name, n.nspname NULLS FIRST, d.defaclobjtype;

-- SQL00-Q06: relation owner, RLS flags, columns, constraints, indexes and triggers.
SELECT n.nspname, c.relname, c.relkind, owner_role.rolname AS owner_name,
       c.relrowsecurity, c.relforcerowsecurity, c.relacl
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
WHERE (n.nspname = 'public' AND c.relname IN (
  'profiles','pos_profiles','tenants','branches','customers','customer_phone_identities',
  'customer_phone_identity_members','catalog_items','branch_catalog_items','inventory_stock',
  'inventory_movements','inventory_movements_view','orders','invoices','invoice_items',
  'order_status_logs','audit_logs','vat_settings','branch_whatsapp_configs',
  'atomic_authorization_contexts','atomic_order_commands','atomic_order_command_payloads',
  'atomic_order_claims','atomic_order_retry_authorizations','atomic_order_business_links',
  'atomic_order_line_links','atomic_order_audit','atomic_order_diagnostics','order_number_sequences'))
   OR (n.nspname = 'afex_pos_authority' AND c.relname IN ('actor_sessions','auth_session_locks'))
   OR n.nspname IN ('afex_offline_authority','afex_review_private','afex_effect_private')
ORDER BY n.nspname, c.relname;

SELECT n.nspname, c.relname, a.attnum, a.attname,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull, pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS default_expression
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE a.attnum > 0 AND NOT a.attisdropped
  AND (n.nspname IN ('afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private')
       OR (n.nspname = 'public' AND c.relname IN ('branches','profiles','pos_profiles','inventory_stock',
           'inventory_movements','atomic_authorization_contexts','atomic_order_commands','invoices')))
ORDER BY n.nspname, c.relname, a.attnum;

SELECT n.nspname, c.relname, con.conname, con.contype, con.convalidated,
       pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private')
ORDER BY n.nspname, c.relname, con.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname IN ('public','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private')
ORDER BY schemaname, tablename, indexname;

SELECT n.nspname, c.relname, t.tgname, t.tgenabled,
       pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname IN ('public','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private')
ORDER BY n.nspname, c.relname, t.tgname;

-- SQL00-Q07: exact policies and expressions. RLS is row authority only.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname IN ('public','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private')
ORDER BY schemaname, tablename, policyname;

-- SQL00-Q08: routine identities, owners, ACL, fixed configuration and body identity.
SELECT n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       owner_role.rolname AS owner_name, p.prosecdef, p.provolatile, p.proparallel,
       p.prokind, p.procost, p.prorows, p.proconfig, p.proacl,
       pg_catalog.md5(p.prosrc) AS body_md5, pg_catalog.length(p.prosrc) AS body_length
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
WHERE n.nspname IN ('public','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private')
  AND (p.proname LIKE '%atomic_order%' OR p.proname LIKE '%pos_actor%'
       OR p.proname LIKE '%offline%' OR p.proname LIKE '%inventory%'
       OR p.proname LIKE '%customer_phone%' OR p.proname LIKE '%pos_pin%'
       OR p.proname LIKE '%review%' OR p.proname LIKE '%effect%')
ORDER BY n.nspname, p.proname, identity_arguments;

-- SQL00-Q09: PARTIAL catalog dependency evidence for the selected routines.
-- pg_depend does not reliably record every relation/function reference embedded in SQL
-- or PL/pgSQL bodies. This result must never be treated as complete routine-body closure.
SELECT source_ns.nspname AS source_schema, source_p.proname AS source_name,
       pg_catalog.pg_get_function_identity_arguments(source_p.oid) AS source_arguments,
       d.deptype, target_ns.nspname AS target_schema, target_c.relname AS target_relation
FROM pg_catalog.pg_depend AS d
JOIN pg_catalog.pg_proc AS source_p ON source_p.oid = d.objid AND d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
JOIN pg_catalog.pg_namespace AS source_ns ON source_ns.oid = source_p.pronamespace
LEFT JOIN pg_catalog.pg_class AS target_c ON target_c.oid = d.refobjid AND d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
LEFT JOIN pg_catalog.pg_namespace AS target_ns ON target_ns.oid = target_c.relnamespace
WHERE source_ns.nspname IN ('public','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private')
ORDER BY source_schema, source_name, source_arguments, target_schema, target_relation;

-- SQL00-Q10: explicit static-body gate. The package matrix binds exact Prompt 10 body
-- identities to repository source and records lexically extracted dependencies. Every
-- unqualified/dynamic/unresolved reference remains blocked pending independent review.
SELECT 'STATIC_ROUTINE_BODY_DEPENDENCY_REVIEW_REQUIRED'::text AS dependency_status,
       'SQL-AUTHORITY-STATIC-ROUTINE-DEPENDENCY-MATRIX.json'::text AS required_evidence,
       'pg_depend is partial catalog evidence only'::text AS catalog_limitation;

-- SQL00-Q11: auth.sessions is a platform-owned reference only. The approved helper
-- is postgres-owned in afex_offline_authority and neither changes auth ACL nor owns
-- an auth object. These exact minimum columns and read reachability must remain.
SELECT
  pg_catalog.to_regclass('auth.sessions') IS NOT NULL AS auth_sessions_exists,
  (SELECT r.rolname
   FROM pg_catalog.pg_namespace AS n
   JOIN pg_catalog.pg_roles AS r ON r.oid = n.nspowner
   WHERE n.nspname = 'auth') = 'supabase_auth_admin'
    AS auth_schema_owner_valid,
  NOT pg_catalog.has_schema_privilege('postgres','auth','CREATE')
    AS postgres_auth_create_remains_absent,
  pg_catalog.has_table_privilege('postgres','auth.sessions','SELECT')
    AS postgres_can_read_auth_sessions,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('auth.sessions')
      AND a.attname = 'id' AND a.atttypid = 'uuid'::pg_catalog.regtype
      AND a.attnotnull AND NOT a.attisdropped
  ) AS auth_sessions_id_valid,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = pg_catalog.to_regclass('auth.sessions')
      AND a.attname = 'user_id' AND a.atttypid = 'uuid'::pg_catalog.regtype
      AND a.attnotnull AND NOT a.attisdropped
  ) AS auth_sessions_user_id_valid;

-- SQL00-Q11A: exact installer membership baseline. Each row must be present once
-- with ADMIN true, INHERIT false and SET false before the first forward wave.
SELECT granted_role.rolname AS granted_role,grantor_role.rolname AS grantor_name,
       m.admin_option,m.inherit_option,m.set_option
FROM pg_catalog.pg_auth_members m
JOIN pg_catalog.pg_roles member_role ON member_role.oid=m.member
JOIN pg_catalog.pg_roles granted_role ON granted_role.oid=m.roleid
JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid=m.grantor
WHERE member_role.rolname='postgres'
  AND granted_role.rolname IN (
    'afex_context_issuer','afex_core_owner','afex_function_owner',
    'afex_pos_session_owner','afex_offline_authority_owner'
  )
ORDER BY granted_role.rolname,grantor_role.rolname;

-- SQL00-Q11B: direct ACL closure needed by owner-aware creation. Every boolean is
-- a precondition, not an instruction to grant broader privileges.
SELECT
  pg_catalog.has_schema_privilege('afex_core_owner','afex_core_private','USAGE,CREATE')
    AS core_owner_private_schema_access,
  pg_catalog.has_schema_privilege('afex_pos_session_owner','afex_pos_authority','USAGE,CREATE')
    AS pos_owner_authority_schema_access,
  pg_catalog.has_schema_privilege('afex_function_owner','public','USAGE')
    AS function_owner_public_schema_usage,
  pg_catalog.has_table_privilege('afex_function_owner','auth.sessions','SELECT')
    AS function_owner_has_no_required_direct_auth_select,
  pg_catalog.has_table_privilege('afex_offline_authority_owner','public.tenants','REFERENCES')
    AS offline_owner_tenants_references,
  pg_catalog.has_table_privilege('afex_offline_authority_owner','public.branches','REFERENCES')
    AS offline_owner_branches_references,
  pg_catalog.has_table_privilege('afex_offline_authority_owner','public.profiles','REFERENCES')
    AS offline_owner_profiles_references,
  pg_catalog.has_table_privilege('afex_offline_authority_owner','public.catalog_items','REFERENCES')
    AS offline_owner_catalog_references;

-- SQL00-Q12: this package closes the four finite provenance definitions but still
-- does not authorize execution or application activation.
SELECT 'PROVENANCE_V2_COMPLETE_REVIEW_CANDIDATE'::text AS candidate_status,
       'PROVENANCE-CLOSURE-FINAL-DECISION.md'::text AS authority_decision,
       'execution and activation require separate human approvals'::text AS stop_gate;

-- SQL00-Q13: composite-target and pre-existing drift gate. Every count must be zero.
SELECT
  (SELECT pg_catalog.count(*) FROM public.branches WHERE tenant_id IS NULL)
    AS branches_missing_tenant,
  (SELECT pg_catalog.count(*) FROM public.catalog_items WHERE tenant_id IS NULL)
    AS catalog_items_missing_tenant,
  (SELECT pg_catalog.count(*) FROM public.atomic_authorization_contexts AS a
   WHERE a.tenant_id IS NULL OR a.branch_id IS NULL
      OR a.authenticated_actor_id IS NULL)
    AS authorization_context_scope_drift,
  (SELECT pg_catalog.count(*) FROM public.atomic_order_commands AS c
   LEFT JOIN public.atomic_authorization_contexts AS a
     ON a.id = c.authorization_context_id
    AND a.authenticated_actor_id = c.authenticated_actor_id
    AND a.tenant_id = c.tenant_id AND a.branch_id = c.branch_id
   WHERE a.id IS NULL)
    AS command_context_scope_drift;

SELECT conrelid::pg_catalog.regclass::text AS relation_name,conname,contype,convalidated
FROM pg_catalog.pg_constraint
WHERE (conrelid,conname) IN (
  (pg_catalog.to_regclass('public.branches'),'afex_branches_id_tenant_scope_uk'),
  (pg_catalog.to_regclass('public.catalog_items'),'afex_catalog_items_id_tenant_scope_uk'),
  (pg_catalog.to_regclass('public.atomic_authorization_contexts'),
    'afex_atomic_context_offline_scope_uk'),
  (pg_catalog.to_regclass('public.atomic_order_commands'),
    'afex_atomic_command_offline_scope_uk')
)
ORDER BY relation_name,conname;

ROLLBACK;
