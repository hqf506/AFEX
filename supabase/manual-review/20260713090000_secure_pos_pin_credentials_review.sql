-- MANUAL REVIEW QUERIES ONLY.
-- This file is not a migration. Run sections individually in a reviewed,
-- read-only session. It never returns plaintext PINs or PIN hash values.

-- ================================================================
-- PRE-MIGRATION READ-ONLY CHECKS
-- ================================================================

-- 1. Count legacy plaintext rows without returning any PIN value.
select count(*)::bigint as pos_profiles_with_plaintext_pin
from public.pos_profiles
where pos_pin_plain is not null;

-- 2. List catalog dependencies on the plaintext column.
select distinct
  pg_describe_object(d.classid, d.objid, d.objsubid) as dependent_object
from pg_catalog.pg_depend as d
join pg_catalog.pg_class as referenced_table
  on referenced_table.oid = d.refobjid
join pg_catalog.pg_namespace as referenced_schema
  on referenced_schema.oid = referenced_table.relnamespace
join pg_catalog.pg_attribute as referenced_column
  on referenced_column.attrelid = referenced_table.oid
 and referenced_column.attnum = d.refobjsubid
where referenced_schema.nspname = 'public'
  and referenced_table.relname = 'pos_profiles'
  and referenced_column.attname = 'pos_pin_plain'
order by dependent_object;

-- 3. Find views, functions, triggers, and policies whose stored definitions
-- mention the plaintext column. Definitions themselves are not returned.
select 'view'::text as object_type, schemaname as schema_name, viewname as object_name
from pg_catalog.pg_views
where definition ilike '%pos_pin_plain%'
union all
select
  'function',
  n.nspname,
  p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where p.prosrc ilike '%pos_pin_plain%'
union all
select 'trigger', event_object_schema, trigger_name
from information_schema.triggers
where action_statement ilike '%pos_pin_plain%'
union all
select 'policy', schemaname, policyname
from pg_catalog.pg_policies
where coalesce(qual, '') ilike '%pos_pin_plain%'
   or coalesce(with_check, '') ilike '%pos_pin_plain%'
order by object_type, schema_name, object_name;

-- 4. Current table and column grants for both profile tables.
select grantee, table_schema, table_name, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles', 'pos_profiles')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select grantee, table_schema, table_name, column_name, privilege_type, is_grantable
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('profiles', 'pos_profiles')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, column_name, grantee, privilege_type;

-- 5. Current SELECT/INSERT/UPDATE/DELETE policies.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'pos_profiles')
order by tablename, cmd, policyname;

-- 6. Functions referencing PIN columns. Bodies and secrets are not returned.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.prosrc ilike '%pos_pin_hash%'
    or p.prosrc ilike '%pos_pin_plain%'
    or p.proname ilike '%pos_pin%'
  )
order by function_name, identity_arguments;

-- 7. Current verification function signatures and EXECUTE access.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('verify_pos_pin', 'verify_pos_pin_for_actor')
order by function_name, identity_arguments;

-- 8. Detect byte-for-byte duplicate active hashes without returning hashes.
-- Because bcrypt salts normally differ, this cannot detect two independently
-- hashed records that share the same raw four-digit PIN.
select
  tenant_id,
  branch_id,
  count(*)::bigint as records_sharing_identical_hash
from public.pos_profiles
where is_active = true
  and pos_pin_hash is not null
group by tenant_id, branch_id, pos_pin_hash
having count(*) > 1
order by tenant_id, branch_id, records_sharing_identical_hash desc;

-- ================================================================
-- POST-MIGRATION READ-ONLY CHECKS
-- ================================================================

-- 9. The plaintext column must no longer exist.
select count(*)::bigint as remaining_pos_pin_plain_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pos_profiles'
  and column_name = 'pos_pin_plain';

-- 10. Review effective table and column privileges after migration.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profiles', 'pos_profiles')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('profiles', 'pos_profiles')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_name, column_name, grantee, privilege_type;

-- 11. Boolean credential and administrative mutation checks. Expected values
-- for anon/authenticated secret access are all false.
select
  role_name,
  has_column_privilege(role_name, 'public.profiles', 'pos_pin_hash', 'SELECT')
    as can_select_profiles_pin_hash,
  has_column_privilege(role_name, 'public.profiles', 'pos_pin_hash', 'UPDATE')
    as can_update_profiles_pin_hash,
  has_column_privilege(role_name, 'public.profiles', 'role', 'UPDATE')
    as can_update_profiles_role,
  has_column_privilege(role_name, 'public.profiles', 'branch_id', 'UPDATE')
    as can_update_profiles_branch,
  has_column_privilege(role_name, 'public.profiles', 'is_active', 'UPDATE')
    as can_update_profiles_active,
  has_column_privilege(role_name, 'public.pos_profiles', 'pos_pin_hash', 'SELECT')
    as can_select_pos_profiles_pin_hash,
  has_column_privilege(role_name, 'public.pos_profiles', 'pos_pin_hash', 'UPDATE')
    as can_update_pos_profiles_pin_hash
from unnest(array['anon', 'authenticated']) as role_name;

-- 12. Compare authenticated profiles SELECT columns with the exact allowlist.
-- Expected result: zero rows.
with expected(column_name) as (
  values
    ('id'),
    ('username'),
    ('full_name'),
    ('role'),
    ('is_active'),
    ('branch_id'),
    ('tenant_id'),
    ('tenant_name'),
    ('contact_email'),
    ('phone')
),
actual(column_name) as (
  select column_name::text
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee = 'authenticated'
    and privilege_type = 'SELECT'
)
select 'missing'::text as difference, column_name from expected
except
select 'missing', column_name from actual
union all
select 'unexpected', column_name from actual
except
select 'unexpected', column_name from expected
order by difference, column_name;

-- 13. Compare authenticated pos_profiles SELECT columns with the exact allowlist.
-- Expected result: zero rows.
with expected(column_name) as (
  values ('id'), ('tenant_id'), ('username'), ('full_name'), ('role')
),
actual(column_name) as (
  select column_name::text
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'pos_profiles'
    and grantee = 'authenticated'
    and privilege_type = 'SELECT'
)
select 'missing'::text as difference, column_name from expected
except
select 'missing', column_name from actual
union all
select 'unexpected', column_name from actual
except
select 'unexpected', column_name from expected
order by difference, column_name;

-- 14. Compare authenticated profiles UPDATE columns with the exact allowlist.
-- Expected result: zero rows.
with expected(column_name) as (
  values ('full_name'), ('phone'), ('contact_email'), ('updated_at')
),
actual(column_name) as (
  select column_name::text
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
)
select 'missing'::text as difference, column_name from expected
except
select 'missing', column_name from actual
union all
select 'unexpected', column_name from actual
except
select 'unexpected', column_name from expected
order by difference, column_name;

-- 15. Confirm no browser role has any pos_profiles mutation privilege.
-- Expected values: all false.
select
  role_name,
  has_any_column_privilege(role_name, 'public.pos_profiles', 'INSERT')
    as can_insert_any_column,
  has_any_column_privilege(role_name, 'public.pos_profiles', 'UPDATE')
    as can_update_any_column,
  has_table_privilege(role_name, 'public.pos_profiles', 'DELETE')
    as can_delete_rows
from unnest(array['anon', 'authenticated']) as role_name;

-- 16. Confirm the new function exists and only service_role can execute it.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('verify_pos_pin', 'verify_pos_pin_for_actor')
order by function_name, identity_arguments;

-- 17. Legacy verification signatures must no longer exist.
-- Expected value: zero.
select count(*)::bigint as remaining_legacy_verify_pos_pin_functions
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'verify_pos_pin'
  and pg_get_function_identity_arguments(p.oid) in (
    'text, uuid',
    'text, uuid, uuid'
  );

-- 18. Inspect the final tenant/branch SELECT policy definition.
select tablename, policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'pos_profiles'
  and policyname = 'pos_profiles_select_same_tenant_system_user';
