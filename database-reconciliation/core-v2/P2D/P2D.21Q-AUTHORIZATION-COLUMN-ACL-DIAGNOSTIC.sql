\if :{?AFEX_EXPECTED_DATABASE}
\else
\echo 'P2D.21Q failed: AFEX_EXPECTED_DATABASE is required'
\quit 3
\endif
\if :{?AFEX_EXPECTED_USER}
\else
\echo 'P2D.21Q failed: AFEX_EXPECTED_USER is required'
\quit 3
\endif

SELECT
    pg_catalog.current_database() = :'AFEX_EXPECTED_DATABASE'
        AS p2d21q_database_matches,
    CURRENT_USER::text = :'AFEX_EXPECTED_USER'
        AS p2d21q_user_matches
\gset

\if :p2d21q_database_matches
\else
\echo 'P2D.21Q failed: database identity mismatch'
\quit 3
\endif
\if :p2d21q_user_matches
\else
\echo 'P2D.21Q failed: installer identity mismatch'
\quit 3
\endif

BEGIN TRANSACTION READ ONLY;

-- AFEX Core V2 P2D.21Q - Authorization Column ACL Diagnostic
-- READ ONLY. No repair, privilege mutation, or persistent object creation.

DO $safety$
BEGIN
    IF pg_catalog.current_setting('transaction_read_only')
       IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21Q failed: transaction is not read only';
    END IF;

    IF pg_catalog.current_setting('server_version_num')::integer
       IS DISTINCT FROM 170006
       OR pg_catalog.current_setting('server_encoding')
          IS DISTINCT FROM 'UTF8' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21Q failed: Production platform contract mismatch';
    END IF;

    IF pg_catalog.to_regrole('afex_function_owner') IS NULL
       OR pg_catalog.to_regclass('public.profiles') IS NULL
       OR pg_catalog.to_regclass('public.tenants') IS NULL
       OR pg_catalog.to_regclass('public.branches') IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21Q failed: required role or relation is absent';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.tenants'),
            pg_catalog.to_regclass('public.branches')
        )
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND attribute_state.attacl IS NOT NULL
          AND (
              pg_catalog.cardinality(attribute_state.attacl) > 0
              AND pg_catalog.array_ndims(attribute_state.attacl)
                  IS DISTINCT FROM 1
              OR pg_catalog.array_ndims(attribute_state.attacl) = 1
                 AND pg_catalog.array_position(
                     attribute_state.attacl,
                     NULL::aclitem
                 ) IS NOT NULL
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21Q failed: malformed authorization column ACL array';
    END IF;
END
$safety$;

-- Exact expected inventories encoded by the three reviewed artifacts.
WITH expected_contract(
    schema_name,
    table_name,
    column_name,
    grantee,
    privilege_type,
    is_grantable
) AS (
    VALUES
        ('public'::text, 'profiles'::text, 'id'::text,
         'afex_function_owner'::text, 'SELECT'::text, false),
        ('public', 'profiles', 'tenant_id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'profiles', 'branch_id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'profiles', 'role',
         'afex_function_owner', 'SELECT', false),
        ('public', 'profiles', 'is_active',
         'afex_function_owner', 'SELECT', false),
        ('public', 'profiles', 'updated_at',
         'afex_function_owner', 'SELECT', false),
        ('public', 'tenants', 'id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'branches', 'id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'branches', 'tenant_id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'branches', 'is_active',
         'afex_function_owner', 'SELECT', false),
        ('public', 'branches', 'deleted_at',
         'afex_function_owner', 'SELECT', false)
)
SELECT
    schema_name,
    table_name,
    column_name,
    grantee,
    privilege_type,
    is_grantable,
    true AS expected_by_migration,
    true AS expected_by_attestation,
    true AS expected_by_final_verification
FROM expected_contract
ORDER BY table_name, column_name;

-- Every direct column ACL, including PUBLIC as grantee OID zero.
WITH actual_acl AS (
    SELECT
        namespace_state.nspname::text AS schema_name,
        relation_state.relname::text AS table_name,
        attribute_state.attname::text AS column_name,
        pg_catalog.pg_get_userbyid(acl_state.grantor)::text AS grantor,
        CASE
            WHEN acl_state.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text
        END AS grantee,
        acl_state.privilege_type::text AS privilege_type,
        acl_state.is_grantable
    FROM pg_catalog.pg_attribute AS attribute_state
    JOIN pg_catalog.pg_class AS relation_state
      ON relation_state.oid = attribute_state.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    CROSS JOIN LATERAL pg_catalog.unnest(
        attribute_state.attacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname IN ('profiles', 'tenants', 'branches')
      AND attribute_state.attnum > 0
      AND NOT attribute_state.attisdropped
)
SELECT
    schema_name,
    table_name,
    column_name,
    grantor,
    grantee,
    privilege_type,
    is_grantable
FROM actual_acl
ORDER BY table_name, column_name, grantee, privilege_type, grantor;

-- Reconcile actual rows and missing expected rows against all three verifiers.
WITH expected_contract(
    schema_name,
    table_name,
    column_name,
    grantee,
    privilege_type,
    is_grantable
) AS (
    VALUES
        ('public'::text, 'profiles'::text, 'id'::text,
         'afex_function_owner'::text, 'SELECT'::text, false),
        ('public', 'profiles', 'tenant_id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'profiles', 'branch_id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'profiles', 'role',
         'afex_function_owner', 'SELECT', false),
        ('public', 'profiles', 'is_active',
         'afex_function_owner', 'SELECT', false),
        ('public', 'profiles', 'updated_at',
         'afex_function_owner', 'SELECT', false),
        ('public', 'tenants', 'id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'branches', 'id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'branches', 'tenant_id',
         'afex_function_owner', 'SELECT', false),
        ('public', 'branches', 'is_active',
         'afex_function_owner', 'SELECT', false),
        ('public', 'branches', 'deleted_at',
         'afex_function_owner', 'SELECT', false)
),
actual_acl AS (
    SELECT
        namespace_state.nspname::text AS schema_name,
        relation_state.relname::text AS table_name,
        attribute_state.attname::text AS column_name,
        pg_catalog.pg_get_userbyid(acl_state.grantor)::text AS grantor,
        CASE
            WHEN acl_state.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text
        END AS grantee,
        acl_state.privilege_type::text AS privilege_type,
        acl_state.is_grantable
    FROM pg_catalog.pg_attribute AS attribute_state
    JOIN pg_catalog.pg_class AS relation_state
      ON relation_state.oid = attribute_state.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    CROSS JOIN LATERAL pg_catalog.unnest(
        attribute_state.attacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname IN ('profiles', 'tenants', 'branches')
      AND attribute_state.attnum > 0
      AND NOT attribute_state.attisdropped
),
actual_classified AS (
    SELECT
        actual_acl.*,
        EXISTS (
            SELECT 1
            FROM expected_contract
            WHERE expected_contract.schema_name = actual_acl.schema_name
              AND expected_contract.table_name = actual_acl.table_name
              AND expected_contract.column_name = actual_acl.column_name
              AND expected_contract.grantee = actual_acl.grantee
              AND expected_contract.privilege_type =
                  actual_acl.privilege_type
              AND expected_contract.is_grantable =
                  actual_acl.is_grantable
        ) AS expected_by_migration,
        EXISTS (
            SELECT 1
            FROM expected_contract
            WHERE expected_contract.schema_name = actual_acl.schema_name
              AND expected_contract.table_name = actual_acl.table_name
              AND expected_contract.column_name = actual_acl.column_name
              AND expected_contract.grantee = actual_acl.grantee
              AND expected_contract.privilege_type =
                  actual_acl.privilege_type
              AND expected_contract.is_grantable =
                  actual_acl.is_grantable
        ) AS expected_by_attestation,
        actual_acl.grantee = 'afex_function_owner'
            AS accepted_by_final_verification,
        actual_acl.grantee <> 'afex_function_owner'
            AS triggers_final_verification_line_415
    FROM actual_acl
),
classified_rows AS (
    SELECT
        actual_classified.schema_name,
        actual_classified.table_name,
        actual_classified.column_name,
        actual_classified.grantor,
        actual_classified.grantee,
        actual_classified.privilege_type,
        actual_classified.is_grantable,
        actual_classified.expected_by_migration,
        actual_classified.expected_by_attestation,
        actual_classified.accepted_by_final_verification,
        actual_classified.triggers_final_verification_line_415,
        CASE
            WHEN expected_by_migration
             AND expected_by_attestation
             AND accepted_by_final_verification
                THEN 'EXPECTED_ALL'
            WHEN expected_by_migration
             AND expected_by_attestation
             AND NOT accepted_by_final_verification
                THEN 'EXPECTED_MIGRATION_ATTESTATION_ONLY'
            WHEN NOT expected_by_migration
             AND NOT expected_by_attestation
             AND accepted_by_final_verification
                THEN 'EXPECTED_FINAL_ONLY'
            ELSE 'UNEXPECTED_ALL'
        END AS classification
    FROM actual_classified
),
missing_rows AS (
    SELECT
        expected_contract.schema_name,
        expected_contract.table_name,
        expected_contract.column_name,
        NULL::text AS grantor,
        expected_contract.grantee,
        expected_contract.privilege_type,
        expected_contract.is_grantable,
        true AS expected_by_migration,
        true AS expected_by_attestation,
        true AS accepted_by_final_verification,
        false AS triggers_final_verification_line_415,
        'MISSING_EXPECTED'::text AS classification
    FROM expected_contract
    WHERE NOT EXISTS (
        SELECT 1
        FROM actual_acl
        WHERE actual_acl.schema_name = expected_contract.schema_name
          AND actual_acl.table_name = expected_contract.table_name
          AND actual_acl.column_name = expected_contract.column_name
          AND actual_acl.grantee = expected_contract.grantee
          AND actual_acl.privilege_type =
              expected_contract.privilege_type
          AND actual_acl.is_grantable =
              expected_contract.is_grantable
    )
)
SELECT * FROM classified_rows
UNION ALL
SELECT * FROM missing_rows
ORDER BY table_name, column_name, classification, grantee, privilege_type;

-- Exact direct ACL row or rows satisfying the failed line-415 predicate.
WITH actual_acl AS (
    SELECT
        namespace_state.nspname::text AS schema_name,
        relation_state.relname::text AS table_name,
        attribute_state.attname::text AS column_name,
        pg_catalog.pg_get_userbyid(acl_state.grantor)::text AS grantor,
        CASE
            WHEN acl_state.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text
        END AS grantee,
        acl_state.privilege_type::text AS privilege_type,
        acl_state.is_grantable
    FROM pg_catalog.pg_attribute AS attribute_state
    JOIN pg_catalog.pg_class AS relation_state
      ON relation_state.oid = attribute_state.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    CROSS JOIN LATERAL pg_catalog.unnest(
        attribute_state.attacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname IN ('profiles', 'tenants', 'branches')
      AND attribute_state.attnum > 0
      AND NOT attribute_state.attisdropped
)
SELECT
    schema_name,
    table_name,
    column_name,
    grantor,
    grantee,
    privilege_type,
    is_grantable,
    true AS triggered_p2d21d_line_415
FROM actual_acl
WHERE grantee <> 'afex_function_owner'
ORDER BY table_name, column_name, grantee, privilege_type, grantor;

-- Effective privileges are reported separately and are not direct ACL rows.
WITH target_columns AS (
    SELECT
        namespace_state.nspname::text AS schema_name,
        relation_state.relname::text AS table_name,
        attribute_state.attname::text AS column_name
    FROM pg_catalog.pg_attribute AS attribute_state
    JOIN pg_catalog.pg_class AS relation_state
      ON relation_state.oid = attribute_state.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname IN ('profiles', 'tenants', 'branches')
      AND attribute_state.attnum > 0
      AND NOT attribute_state.attisdropped
),
roles_to_report(role_name) AS (
    SELECT role_state.rolname::text
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname IN (
        'anon',
        'authenticated',
        'service_role',
        'afex_function_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker'
    )
    UNION ALL
    SELECT 'public'::text
),
privileges_to_report(privilege_type) AS (
    VALUES
        ('SELECT'::text),
        ('INSERT'::text),
        ('UPDATE'::text),
        ('REFERENCES'::text)
)
SELECT
    target_columns.schema_name,
    target_columns.table_name,
    target_columns.column_name,
    roles_to_report.role_name AS grantee,
    privileges_to_report.privilege_type,
    pg_catalog.has_column_privilege(
        roles_to_report.role_name,
        pg_catalog.format(
            '%I.%I',
            target_columns.schema_name,
            target_columns.table_name
        ),
        target_columns.column_name,
        privileges_to_report.privilege_type
    ) AS has_effective_privilege
FROM target_columns
CROSS JOIN roles_to_report
CROSS JOIN privileges_to_report
ORDER BY
    target_columns.table_name,
    target_columns.column_name,
    roles_to_report.role_name,
    privileges_to_report.privilege_type;

SELECT
    'D. MIXED CONTRACT DEFECT — Migration, attestation, and final verification disagree.'::text
        AS diagnostic_classification,
    'P2D21Q_900_AUTHORIZATION_COLUMN_ACL_DIAGNOSTIC_COMPLETE'::text
        AS final_marker;

ROLLBACK;
