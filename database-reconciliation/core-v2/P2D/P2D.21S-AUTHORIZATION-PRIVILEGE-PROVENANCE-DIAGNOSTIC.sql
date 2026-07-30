\if :{?AFEX_EXPECTED_DATABASE}
\else
\echo 'P2D.21S failed: AFEX_EXPECTED_DATABASE is required'
\quit 3
\endif
\if :{?AFEX_EXPECTED_USER}
\else
\echo 'P2D.21S failed: AFEX_EXPECTED_USER is required'
\quit 3
\endif

SELECT
    pg_catalog.current_database() = :'AFEX_EXPECTED_DATABASE' AS database_ok,
    CURRENT_USER::text = :'AFEX_EXPECTED_USER' AS user_ok
\gset
\if :database_ok
\else
\echo 'P2D.21S failed: database identity mismatch'
\quit 3
\endif
\if :user_ok
\else
\echo 'P2D.21S failed: installer identity mismatch'
\quit 3
\endif

BEGIN TRANSACTION READ ONLY;

-- P2D21S_SECTION_100_PREFLIGHT
DO $preflight$
DECLARE
    missing_name text;
BEGIN
    IF pg_catalog.current_setting('transaction_read_only') <> 'on'
       OR pg_catalog.current_setting('server_version_num')::integer <> 170006
       OR pg_catalog.current_setting('server_encoding') <> 'UTF8' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21S failed: platform contract mismatch';
    END IF;

    SELECT required.name INTO missing_name
    FROM (
        VALUES
            ('anon'), ('authenticated'), ('service_role'), ('postgres'),
            ('afex_function_owner'), ('afex_context_issuer'),
            ('afex_core_runtime'), ('afex_outbox_worker')
    ) AS required(name)
    WHERE pg_catalog.to_regrole(required.name) IS NULL
    ORDER BY required.name
    LIMIT 1;
    IF missing_name IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21S failed: target role missing',
            detail = missing_name;
    END IF;

    SELECT required.name INTO missing_name
    FROM (
        VALUES ('profiles'), ('tenants'), ('branches')
    ) AS required(name)
    WHERE pg_catalog.to_regclass('public.' || required.name) IS NULL
    ORDER BY required.name
    LIMIT 1;
    IF missing_name IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21S failed: target table missing',
            detail = 'public.' || missing_name;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS c
        WHERE c.oid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.tenants'),
            pg_catalog.to_regclass('public.branches')
        )
        AND c.relacl IS NOT NULL
        AND (
            pg_catalog.cardinality(c.relacl) > 0
            AND pg_catalog.array_ndims(c.relacl) IS DISTINCT FROM 1
            OR pg_catalog.array_ndims(c.relacl) = 1
            AND pg_catalog.array_position(c.relacl, NULL::aclitem) IS NOT NULL
        )
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.tenants'),
            pg_catalog.to_regclass('public.branches')
        )
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
        AND (
            pg_catalog.cardinality(a.attacl) > 0
            AND pg_catalog.array_ndims(a.attacl) IS DISTINCT FROM 1
            OR pg_catalog.array_ndims(a.attacl) = 1
            AND pg_catalog.array_position(a.attacl, NULL::aclitem) IS NOT NULL
        )
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace AS n
        WHERE n.nspname = 'public' AND n.nspacl IS NOT NULL
        AND (
            pg_catalog.cardinality(n.nspacl) > 0
            AND pg_catalog.array_ndims(n.nspacl) IS DISTINCT FROM 1
            OR pg_catalog.array_ndims(n.nspacl) = 1
            AND pg_catalog.array_position(n.nspacl, NULL::aclitem) IS NOT NULL
        )
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_default_acl AS d
        WHERE d.defaclacl IS NOT NULL
        AND (
            pg_catalog.cardinality(d.defaclacl) > 0
            AND pg_catalog.array_ndims(d.defaclacl) IS DISTINCT FROM 1
            OR pg_catalog.array_ndims(d.defaclacl) = 1
            AND pg_catalog.array_position(d.defaclacl, NULL::aclitem) IS NOT NULL
        )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21S failed: malformed ACL array';
    END IF;
END
$preflight$;

-- P2D21S_SECTION_200_ROLE_INVENTORY_AND_MEMBERSHIP
WITH RECURSIVE target_roles(role_name, role_oid) AS (
    SELECT 'PUBLIC'::text, 0::oid
    UNION ALL
    SELECT r.rolname::text, r.oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname IN (
        'anon', 'authenticated', 'service_role', 'postgres',
        'afex_function_owner', 'afex_context_issuer',
        'afex_core_runtime', 'afex_outbox_worker'
    )
)
SELECT
    role_name,
    role_oid,
    role_oid <> 0 AS exists_in_pg_roles,
    role_oid <> 0 AS membership_applicable,
    CASE WHEN role_oid = 0 THEN 'PUBLIC_OID_ZERO_PSEUDO_ROLE'
         ELSE 'REAL_ROLE' END AS identity_kind
FROM target_roles
ORDER BY role_name;

WITH RECURSIVE target_roles(role_name, role_oid) AS (
    SELECT 'PUBLIC'::text, 0::oid
    UNION ALL
    SELECT r.rolname::text, r.oid
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname IN (
        'anon', 'authenticated', 'service_role', 'postgres',
        'afex_function_owner', 'afex_context_issuer',
        'afex_core_runtime', 'afex_outbox_worker'
    )
),
paths(root_oid, member_oid, granted_oid, grantor_oid, admin_option,
      inherit_option, set_option, depth, membership_path, cycle) AS (
    SELECT
        t.role_oid, m.member, m.roleid, m.grantor, m.admin_option,
        m.inherit_option, m.set_option, 1,
        ARRAY[m.member, m.roleid]::oid[], false
    FROM target_roles AS t
    JOIN pg_catalog.pg_auth_members AS m ON m.member = t.role_oid
    WHERE t.role_oid <> 0
    UNION ALL
    SELECT
        p.root_oid, m.member, m.roleid, m.grantor, m.admin_option,
        m.inherit_option, m.set_option, p.depth + 1,
        p.membership_path || m.roleid,
        m.roleid = ANY(p.membership_path)
    FROM paths AS p
    JOIN pg_catalog.pg_auth_members AS m ON m.member = p.granted_oid
    WHERE NOT p.cycle AND p.depth < 32
)
SELECT
    pg_catalog.pg_get_userbyid(root_oid) AS target_identity,
    pg_catalog.pg_get_userbyid(member_oid) AS member,
    pg_catalog.pg_get_userbyid(granted_oid) AS granted_role,
    pg_catalog.pg_get_userbyid(grantor_oid) AS grantor,
    admin_option,
    inherit_option,
    set_option,
    pg_catalog.pg_has_role(root_oid, granted_oid, 'MEMBER') AS is_member,
    pg_catalog.pg_has_role(root_oid, granted_oid, 'USAGE') AS inherits_now,
    pg_catalog.pg_has_role(root_oid, granted_oid, 'SET') AS can_set_role,
    depth,
    (
        SELECT pg_catalog.string_agg(
            pg_catalog.pg_get_userbyid(path_oid), ' -> ' ORDER BY ordinality
        )
        FROM pg_catalog.unnest(membership_path)
             WITH ORDINALITY AS path_step(path_oid, ordinality)
    ) AS transitive_membership_path,
    cycle
FROM paths
ORDER BY target_identity, depth, transitive_membership_path;

-- P2D21S_SECTION_300_DIRECT_TABLE_ACL
SELECT
    n.nspname::text AS schema_name,
    c.relname::text AS table_name,
    pg_catalog.pg_get_userbyid(c.relowner)::text AS table_owner,
    c.relacl::text AS raw_relacl,
    pg_catalog.pg_get_userbyid(x.grantor)::text AS grantor,
    CASE WHEN x.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(x.grantee)::text END AS grantee,
    x.privilege_type::text,
    x.is_grantable,
    true AS is_direct
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL pg_catalog.unnest(c.relacl) AS item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'tenants', 'branches')
ORDER BY table_name, grantee, privilege_type, grantor;

-- P2D21S_SECTION_400_TABLE_PRIVILEGE_PROVENANCE
WITH target_roles(role_name, role_oid, is_superuser) AS (
    SELECT 'PUBLIC'::text, 0::oid, false
    UNION ALL
    SELECT r.rolname::text, r.oid, r.rolsuper
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname IN (
        'anon', 'authenticated', 'service_role', 'postgres',
        'afex_function_owner', 'afex_context_issuer',
        'afex_core_runtime', 'afex_outbox_worker'
    )
),
tables AS (
    SELECT c.oid, n.nspname::text AS schema_name, c.relname::text AS table_name,
           c.relowner, c.relacl
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('profiles', 'tenants', 'branches')
),
privileges(privilege_type) AS (
    VALUES ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
           ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
),
direct_acl AS (
    SELECT t.oid AS table_oid, x.grantee, x.privilege_type::text
    FROM tables AS t
    CROSS JOIN LATERAL pg_catalog.unnest(t.relacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
),
facts AS (
    SELECT
        t.schema_name, t.table_name, r.role_name, p.privilege_type,
        EXISTS (
            SELECT 1 FROM direct_acl AS d
            WHERE d.table_oid = t.oid AND d.grantee = r.role_oid
              AND d.privilege_type = p.privilege_type
        ) AS direct_table_privilege,
        CASE WHEN r.role_oid = 0 THEN false ELSE EXISTS (
            SELECT 1
            FROM direct_acl AS d
            WHERE d.table_oid = t.oid AND d.grantee NOT IN (0, r.role_oid)
              AND d.privilege_type = p.privilege_type
              AND pg_catalog.pg_has_role(r.role_oid, d.grantee, 'USAGE')
        ) END AS inherited_privilege,
        r.role_oid <> 0 AND EXISTS (
            SELECT 1 FROM direct_acl AS d
            WHERE d.table_oid = t.oid AND d.grantee = 0
              AND d.privilege_type = p.privilege_type
        ) AS public_derived,
        r.role_oid = t.relowner AND r.role_oid <> 0 AS owner_derived,
        r.is_superuser AS superuser_derived,
        CASE WHEN r.role_oid = 0 THEN EXISTS (
            SELECT 1 FROM direct_acl AS d
            WHERE d.table_oid = t.oid AND d.grantee = 0
              AND d.privilege_type = p.privilege_type
        ) ELSE pg_catalog.has_table_privilege(
            r.role_oid,
            t.oid,
            p.privilege_type
        ) END AS effective_privilege
    FROM tables AS t CROSS JOIN target_roles AS r CROSS JOIN privileges AS p
)
SELECT
    *,
    CASE
        WHEN (
            direct_table_privilege::integer + inherited_privilege::integer +
            public_derived::integer + owner_derived::integer +
            superuser_derived::integer
        ) > 1 THEN 'MIXED_PROVENANCE'
        WHEN direct_table_privilege THEN 'DIRECT_TABLE_PRIVILEGE'
        WHEN inherited_privilege THEN 'INHERITED_PRIVILEGE'
        WHEN public_derived THEN 'PUBLIC_DERIVED'
        WHEN owner_derived THEN 'OWNER_DERIVED'
        WHEN superuser_derived THEN 'SUPERUSER_DERIVED'
        ELSE 'NO_EFFECTIVE_PRIVILEGE'
    END AS provenance_classification
FROM facts
ORDER BY table_name, role_name, privilege_type;

-- P2D21S_SECTION_500_DIRECT_COLUMN_ACL
SELECT
    n.nspname::text AS schema_name,
    c.relname::text AS table_name,
    a.attname::text AS column_name,
    a.attacl::text AS raw_attacl,
    pg_catalog.pg_get_userbyid(x.grantor)::text AS grantor,
    CASE WHEN x.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(x.grantee)::text END AS grantee,
    x.privilege_type::text,
    x.is_grantable,
    true AS is_direct
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL pg_catalog.unnest(a.attacl) AS item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'tenants', 'branches')
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY table_name, column_name, grantee, privilege_type, grantor;

-- P2D21S_SECTION_600_COLUMN_PRIVILEGE_PROVENANCE
WITH target_roles(role_name, role_oid, is_superuser) AS (
    SELECT 'PUBLIC'::text, 0::oid, false
    UNION ALL
    SELECT r.rolname::text, r.oid, r.rolsuper
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname IN (
        'anon', 'authenticated', 'service_role', 'postgres',
        'afex_function_owner', 'afex_context_issuer',
        'afex_core_runtime', 'afex_outbox_worker'
    )
),
columns AS (
    SELECT c.oid AS table_oid, c.relowner, c.relacl,
           n.nspname::text AS schema_name, c.relname::text AS table_name,
           a.attname::text AS column_name, a.attacl
    FROM pg_catalog.pg_attribute AS a
    JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('profiles', 'tenants', 'branches')
      AND a.attnum > 0 AND NOT a.attisdropped
),
privileges(privilege_type) AS (
    VALUES ('SELECT'::text), ('INSERT'), ('UPDATE'), ('REFERENCES')
),
column_acl AS (
    SELECT c.table_oid, c.column_name, x.grantee, x.privilege_type::text
    FROM columns AS c
    CROSS JOIN LATERAL pg_catalog.unnest(c.attacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
),
table_acl AS (
    SELECT c.table_oid, x.grantee, x.privilege_type::text
    FROM columns AS c
    CROSS JOIN LATERAL pg_catalog.unnest(c.relacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
    GROUP BY c.table_oid, x.grantee, x.privilege_type
),
facts AS (
    SELECT
        c.schema_name, c.table_name, c.column_name,
        c.attacl::text AS raw_attacl, r.role_name, p.privilege_type,
        EXISTS (
            SELECT 1 FROM column_acl AS d
            WHERE d.table_oid = c.table_oid AND d.column_name = c.column_name
              AND d.grantee = r.role_oid
              AND d.privilege_type = p.privilege_type
        ) AS direct_column_privilege,
        CASE WHEN r.role_oid = 0 THEN false ELSE EXISTS (
            SELECT 1 FROM column_acl AS d
            WHERE d.table_oid = c.table_oid AND d.column_name = c.column_name
              AND d.grantee NOT IN (0, r.role_oid)
              AND d.privilege_type = p.privilege_type
              AND pg_catalog.pg_has_role(r.role_oid, d.grantee, 'USAGE')
        ) END AS inherited_column_privilege,
        EXISTS (
            SELECT 1 FROM table_acl AS d
            WHERE d.table_oid = c.table_oid AND d.grantee = r.role_oid
              AND d.privilege_type = p.privilege_type
        ) AS table_level_fallback,
        r.role_oid <> 0 AND EXISTS (
            SELECT 1 FROM column_acl AS d
            WHERE d.table_oid = c.table_oid AND d.column_name = c.column_name
              AND d.grantee = 0 AND d.privilege_type = p.privilege_type
        ) OR EXISTS (
            SELECT 1 FROM table_acl AS d
            WHERE d.table_oid = c.table_oid AND d.grantee = 0
              AND d.privilege_type = p.privilege_type
        ) AS public_derived,
        r.role_oid = c.relowner AND r.role_oid <> 0 AS owner_derived,
        r.is_superuser AS superuser_derived,
        CASE WHEN r.role_oid = 0 THEN (
            EXISTS (
                SELECT 1 FROM column_acl AS d
                WHERE d.table_oid = c.table_oid
                  AND d.column_name = c.column_name AND d.grantee = 0
                  AND d.privilege_type = p.privilege_type
            ) OR EXISTS (
                SELECT 1 FROM table_acl AS d
                WHERE d.table_oid = c.table_oid AND d.grantee = 0
                  AND d.privilege_type = p.privilege_type
            )
        ) ELSE pg_catalog.has_column_privilege(
            r.role_oid,
            c.table_oid,
            c.column_name,
            p.privilege_type
        ) END AS effective_privilege
    FROM columns AS c CROSS JOIN target_roles AS r CROSS JOIN privileges AS p
)
SELECT
    *,
    CASE
        WHEN (
            direct_column_privilege::integer +
            inherited_column_privilege::integer +
            table_level_fallback::integer + public_derived::integer +
            owner_derived::integer + superuser_derived::integer
        ) > 1 THEN 'MIXED_PROVENANCE'
        WHEN direct_column_privilege THEN 'DIRECT_COLUMN_ONLY'
        WHEN table_level_fallback THEN 'DIRECT_TABLE_PRIVILEGE'
        WHEN inherited_column_privilege THEN 'INHERITED_PRIVILEGE'
        WHEN public_derived THEN 'PUBLIC_DERIVED'
        WHEN owner_derived THEN 'OWNER_DERIVED'
        WHEN superuser_derived THEN 'SUPERUSER_DERIVED'
        ELSE 'NO_EFFECTIVE_PRIVILEGE'
    END AS provenance_classification
FROM facts
ORDER BY table_name, column_name, role_name, privilege_type;

-- P2D21S_SECTION_650_FINAL_IDENTITY_TABLE_CLASSIFICATION
WITH target_roles(role_name, role_oid, is_superuser) AS (
    SELECT 'PUBLIC'::text, 0::oid, false
    UNION ALL
    SELECT r.rolname::text, r.oid, r.rolsuper
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname IN (
        'anon', 'authenticated', 'service_role', 'postgres',
        'afex_function_owner', 'afex_context_issuer',
        'afex_core_runtime', 'afex_outbox_worker'
    )
),
tables AS (
    SELECT c.oid, c.relowner, c.relacl,
           n.nspname::text AS schema_name, c.relname::text AS table_name
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('profiles', 'tenants', 'branches')
),
table_acl AS (
    SELECT t.oid AS table_oid, x.grantee
    FROM tables AS t
    CROSS JOIN LATERAL pg_catalog.unnest(t.relacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
    GROUP BY t.oid, x.grantee
),
column_acl AS (
    SELECT a.attrelid AS table_oid, x.grantee
    FROM pg_catalog.pg_attribute AS a
    CROSS JOIN LATERAL pg_catalog.unnest(a.attacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
    WHERE a.attrelid IN (SELECT oid FROM tables)
      AND a.attnum > 0 AND NOT a.attisdropped
    GROUP BY a.attrelid, x.grantee
),
facts AS (
    SELECT
        t.schema_name, t.table_name, r.role_name,
        EXISTS (
            SELECT 1 FROM table_acl AS d
            WHERE d.table_oid = t.oid AND d.grantee = r.role_oid
        ) AS direct_table,
        EXISTS (
            SELECT 1 FROM column_acl AS d
            WHERE d.table_oid = t.oid AND d.grantee = r.role_oid
        ) AS direct_column,
        CASE WHEN r.role_oid = 0 THEN false ELSE EXISTS (
            SELECT 1 FROM (
                SELECT * FROM table_acl UNION SELECT * FROM column_acl
            ) AS d
            WHERE d.table_oid = t.oid AND d.grantee NOT IN (0, r.role_oid)
              AND pg_catalog.pg_has_role(r.role_oid, d.grantee, 'USAGE')
        ) END AS inherited_source,
        r.role_oid <> 0 AND EXISTS (
            SELECT 1 FROM (
                SELECT * FROM table_acl UNION SELECT * FROM column_acl
            ) AS d
            WHERE d.table_oid = t.oid AND d.grantee = 0
        ) AS public_source,
        r.role_oid = t.relowner AND r.role_oid <> 0 AS owner_source,
        r.is_superuser AS superuser_source,
        CASE WHEN r.role_oid = 0 THEN EXISTS (
            SELECT 1 FROM (
                SELECT * FROM table_acl UNION SELECT * FROM column_acl
            ) AS d
            WHERE d.table_oid = t.oid AND d.grantee = 0
        ) ELSE (
            pg_catalog.has_table_privilege(r.role_oid, t.oid, 'SELECT')
            OR pg_catalog.has_table_privilege(r.role_oid, t.oid, 'INSERT')
            OR pg_catalog.has_table_privilege(r.role_oid, t.oid, 'UPDATE')
            OR pg_catalog.has_table_privilege(r.role_oid, t.oid, 'DELETE')
            OR pg_catalog.has_any_column_privilege(
                r.role_oid, t.oid, 'SELECT'
            )
            OR pg_catalog.has_any_column_privilege(
                r.role_oid, t.oid, 'UPDATE'
            )
        ) END AS any_effective_privilege
    FROM tables AS t CROSS JOIN target_roles AS r
)
SELECT
    *,
    CASE
        WHEN (
            direct_table::integer + direct_column::integer +
            inherited_source::integer + public_source::integer +
            owner_source::integer + superuser_source::integer
        ) > 1 THEN 'MIXED_PROVENANCE'
        WHEN direct_table THEN 'DIRECT_TABLE_PRIVILEGE'
        WHEN direct_column THEN 'DIRECT_COLUMN_ONLY'
        WHEN inherited_source THEN 'INHERITED_PRIVILEGE'
        WHEN public_source THEN 'PUBLIC_DERIVED'
        WHEN owner_source THEN 'OWNER_DERIVED'
        WHEN superuser_source THEN 'SUPERUSER_DERIVED'
        ELSE 'NO_EFFECTIVE_PRIVILEGE'
    END AS final_identity_table_classification
FROM facts
ORDER BY table_name, role_name;

-- P2D21S_SECTION_700_DEFAULT_PRIVILEGES
SELECT
    pg_catalog.pg_get_userbyid(d.defaclrole)::text AS owner,
    COALESCE(n.nspname::text, '<global>') AS schema_name,
    CASE d.defaclobjtype WHEN 'r' THEN 'tables' WHEN 'S' THEN 'sequences'
         WHEN 'f' THEN 'functions' WHEN 'T' THEN 'types'
         WHEN 'n' THEN 'schemas' ELSE d.defaclobjtype::text END AS object_type,
    pg_catalog.pg_get_userbyid(x.grantor)::text AS grantor,
    CASE WHEN x.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(x.grantee)::text END AS grantee,
    x.privilege_type::text,
    x.is_grantable,
    'POSSIBLE_CREATION_TIME_ORIGIN_ONLY'::text AS provenance_limit
FROM pg_catalog.pg_default_acl AS d
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL pg_catalog.unnest(d.defaclacl) AS item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
ORDER BY owner, schema_name, object_type, grantee, privilege_type, grantor;

-- P2D21S_SECTION_800_PUBLIC_SCHEMA_PRIVILEGES
WITH target_roles(role_name, role_oid, is_superuser) AS (
    SELECT 'PUBLIC'::text, 0::oid, false
    UNION ALL
    SELECT r.rolname::text, r.oid, r.rolsuper
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname IN (
        'anon', 'authenticated', 'service_role', 'postgres',
        'afex_function_owner', 'afex_context_issuer',
        'afex_core_runtime', 'afex_outbox_worker'
    )
),
schema_state AS (
    SELECT oid, nspowner, nspacl
    FROM pg_catalog.pg_namespace WHERE nspname = 'public'
),
direct_acl AS (
    SELECT x.grantee, x.privilege_type::text
    FROM schema_state AS s
    CROSS JOIN LATERAL pg_catalog.unnest(s.nspacl) AS item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[item.value]::aclitem[]) AS x
),
privileges(privilege_type) AS (VALUES ('USAGE'::text), ('CREATE'::text))
SELECT
    r.role_name, p.privilege_type,
    EXISTS (
        SELECT 1 FROM direct_acl AS d
        WHERE d.grantee = r.role_oid AND d.privilege_type = p.privilege_type
    ) AS direct_source,
    CASE WHEN r.role_oid = 0 THEN false ELSE EXISTS (
        SELECT 1 FROM direct_acl AS d
        WHERE d.grantee NOT IN (0, r.role_oid)
          AND d.privilege_type = p.privilege_type
          AND pg_catalog.pg_has_role(r.role_oid, d.grantee, 'USAGE')
    ) END AS inherited_source,
    r.role_oid <> 0 AND EXISTS (
        SELECT 1 FROM direct_acl AS d
        WHERE d.grantee = 0 AND d.privilege_type = p.privilege_type
    ) AS public_source,
    r.role_oid = s.nspowner AND r.role_oid <> 0 AS owner_source,
    r.is_superuser AS superuser_source,
    CASE WHEN r.role_oid = 0 THEN EXISTS (
        SELECT 1 FROM direct_acl AS d
        WHERE d.grantee = 0 AND d.privilege_type = p.privilege_type
    ) ELSE pg_catalog.has_schema_privilege(
        r.role_oid,
        s.oid,
        p.privilege_type
    ) END AS effective_privilege
FROM schema_state AS s CROSS JOIN target_roles AS r CROSS JOIN privileges AS p
ORDER BY role_name, privilege_type;

-- P2D21S_SECTION_900_RLS_AND_POLICIES
SELECT
    n.nspname::text AS schema_name,
    c.relname::text AS table_name,
    pg_catalog.pg_get_userbyid(c.relowner)::text AS table_owner,
    c.relrowsecurity,
    c.relforcerowsecurity
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'tenants', 'branches')
ORDER BY table_name;

SELECT
    n.nspname::text AS schema_name,
    c.relname::text AS table_name,
    p.polname::text AS policy_name,
    p.polcmd::text AS command,
    p.polpermissive AS permissive,
    ARRAY(
        SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC'
                    ELSE pg_catalog.pg_get_userbyid(role_oid)::text END
        FROM pg_catalog.unnest(p.polroles) AS role_oid
        ORDER BY 1
    ) AS policy_roles,
    pg_catalog.pg_get_expr(p.polqual, p.polrelid, true) AS using_expression,
    pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, true)
        AS with_check_expression
FROM pg_catalog.pg_policy AS p
JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'tenants', 'branches')
ORDER BY table_name, policy_name;

SELECT
    'P2D21S_900_AUTHORIZATION_PRIVILEGE_PROVENANCE_DIAGNOSTIC_COMPLETE'::text
        AS final_marker;

ROLLBACK;
