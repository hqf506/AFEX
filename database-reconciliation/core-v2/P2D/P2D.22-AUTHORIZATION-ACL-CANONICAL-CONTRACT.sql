-- AFEX Core V2 P2D.22 - Authorization ACL Canonical Contract
-- CONTRACT/REFERENCE ARTIFACT - DO NOT EXECUTE AS A MIGRATION.
-- VALUES, CTEs, and SELECTs only. No database object is created or changed.

-- SECTION: DIRECT_COLUMN_ACL
WITH expected_column_acl(
    contract_section, schema_name, table_name, column_name, grantor, grantee,
    privilege_type, is_grantable, classification, management_boundary
) AS (
    VALUES
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'id',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'tenant_id',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'branch_id',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'role',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'is_active',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'updated_at',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'tenants', 'id',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'branches', 'id',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'branches', 'tenant_id',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'branches', 'is_active',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'branches', 'deleted_at',
         'postgres', 'afex_function_owner', 'SELECT', false,
         'CORE_V2_AUTHORIZATION_EVIDENCE', 'CORE_V2'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'branch_id',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'contact_email',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'contact_email',
         'postgres', 'authenticated', 'UPDATE', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'full_name',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'full_name',
         'postgres', 'authenticated', 'UPDATE', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'id',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'is_active',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'phone',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'phone',
         'postgres', 'authenticated', 'UPDATE', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'role',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'tenant_id',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'tenant_name',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'updated_at',
         'postgres', 'authenticated', 'UPDATE', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION'),
        ('DIRECT_COLUMN_ACL', 'public', 'profiles', 'username',
         'postgres', 'authenticated', 'SELECT', false,
         'AUTHENTICATED_APPLICATION', 'APPLICATION')
)
SELECT *
FROM expected_column_acl
ORDER BY schema_name, table_name, column_name, grantee, privilege_type;

-- SECTION: DIRECT_TABLE_ACL
WITH tables(table_name) AS (
    VALUES ('profiles'::text), ('tenants'), ('branches')
),
grantees(grantee) AS (
    VALUES ('postgres'::text), ('anon'), ('authenticated'), ('service_role')
),
privileges(privilege_type) AS (
    VALUES ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
           ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
)
SELECT
    'DIRECT_TABLE_ACL'::text AS contract_section,
    'public'::text AS schema_name,
    tables.table_name,
    NULL::text AS column_name,
    'postgres'::text AS grantor,
    grantees.grantee,
    privileges.privilege_type,
    false AS is_grantable,
    'SUPABASE_BASELINE_EXACT'::text AS classification,
    'SUPABASE_MANAGED_BASELINE'::text AS management_boundary
FROM tables
CROSS JOIN grantees
CROSS JOIN privileges
ORDER BY table_name, grantee, privilege_type;

-- SECTION: RLS_STATE
WITH expected_rls(table_name, rls_enabled, force_rls) AS (
    VALUES
        ('profiles'::text, true, false),
        ('tenants', true, false),
        ('branches', true, false)
)
SELECT
    'RLS_STATE'::text AS contract_section,
    'public'::text AS schema_name,
    table_name,
    NULL::text AS column_name,
    NULL::text AS grantor,
    NULL::text AS grantee,
    NULL::text AS privilege_type,
    NULL::boolean AS is_grantable,
    'AUTHORIZATION_ROW_BOUNDARY'::text AS classification,
    'SHARED_APPLICATION_AND_CORE_V2'::text AS management_boundary,
    rls_enabled,
    force_rls
FROM expected_rls
ORDER BY table_name;

-- SECTION: POLICY
WITH expected_policy(
    table_name, policy_name, command_code, permissive, role_name,
    using_expression, with_check_expression, classification
) AS (
    VALUES
        ('branches'::text, 'branches_insert_same_tenant', 'a', true,
         'authenticated', NULL::text,
         'tenant_id = current_profile_tenant_id()',
         'AUTHENTICATED_APPLICATION'),
        ('branches', 'branches_select_same_tenant', 'r', true,
         'authenticated', 'tenant_id = current_profile_tenant_id()', NULL,
         'AUTHENTICATED_APPLICATION'),
        ('branches', 'branches_update_same_tenant', 'w', true,
         'authenticated', 'tenant_id = current_profile_tenant_id()',
         'tenant_id = current_profile_tenant_id()',
         'AUTHENTICATED_APPLICATION'),
        ('branches',
         'core_v2_function_owner_branches_authorization_read', 'r', true,
         'afex_function_owner', 'true', NULL,
         'CORE_V2_AUTHORIZATION_EVIDENCE'),
        ('profiles',
         'core_v2_function_owner_profiles_authorization_read', 'r', true,
         'afex_function_owner', 'true', NULL,
         'CORE_V2_AUTHORIZATION_EVIDENCE'),
        ('profiles', 'profiles_select_admin_override', 'r', true,
         'authenticated',
         'tenant_id = current_profile_tenant_id() AND current_profile_role() = ''admin''::text',
         NULL, 'AUTHENTICATED_APPLICATION'),
        ('profiles', 'profiles_select_own', 'r', true, 'authenticated',
         'auth.uid() = id', NULL, 'AUTHENTICATED_APPLICATION'),
        ('profiles', 'profiles_select_same_tenant', 'r', true,
         'authenticated', 'tenant_id = current_profile_tenant_id()', NULL,
         'AUTHENTICATED_APPLICATION'),
        ('profiles', 'profiles_select_self', 'r', true, 'authenticated',
         'id = auth.uid()', NULL, 'AUTHENTICATED_APPLICATION'),
        ('profiles', 'profiles_update_own', 'w', true, 'authenticated',
         'auth.uid() = id', 'auth.uid() = id',
         'AUTHENTICATED_APPLICATION'),
        ('profiles', 'profiles_update_self', 'w', true, 'authenticated',
         'id = auth.uid()', 'id = auth.uid()',
         'AUTHENTICATED_APPLICATION'),
        ('tenants',
         'core_v2_function_owner_tenants_authorization_read', 'r', true,
         'afex_function_owner', 'true', NULL,
         'CORE_V2_AUTHORIZATION_EVIDENCE')
)
SELECT
    'POLICY'::text AS contract_section,
    'public'::text AS schema_name,
    table_name,
    NULL::text AS column_name,
    NULL::text AS grantor,
    role_name AS grantee,
    command_code AS privilege_type,
    NULL::boolean AS is_grantable,
    classification,
    'SHARED_APPLICATION_AND_CORE_V2'::text AS management_boundary,
    policy_name,
    permissive,
    using_expression,
    with_check_expression
FROM expected_policy
ORDER BY table_name, policy_name;
