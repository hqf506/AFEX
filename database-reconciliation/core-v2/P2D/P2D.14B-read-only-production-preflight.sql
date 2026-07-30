BEGIN;
SET TRANSACTION READ ONLY;

-- SECTION 1 â€” ENVIRONMENT IDENTITY

SELECT
    current_setting('server_version') AS server_version,
    current_setting('server_version_num')::integer AS server_version_num,
    current_database() AS database_name,
    current_user AS current_user_name,
    session_user AS session_user_name,
    current_role AS current_role_name,
    current_schema() AS current_schema_name,
    current_schemas(true) AS current_schema_path,
    current_setting('transaction_read_only')::boolean AS transaction_read_only,
    current_setting('default_transaction_read_only')::boolean AS default_transaction_read_only,
    transaction_timestamp() AS transaction_timestamp,
    statement_timestamp() AS statement_timestamp,
    inet_server_addr() AS server_address,
    inet_server_port() AS server_port;

-- SECTION 2 â€” ROLE INVENTORY

WITH required_roles(role_name) AS (
    VALUES
        ('afex_core_owner'),
        ('afex_core_runtime'),
        ('afex_context_issuer'),
        ('afex_outbox_worker'),
        ('afex_function_owner')
)
SELECT
    required_roles.role_name,
    roles.oid IS NOT NULL AS exists,
    roles.rolcanlogin,
    roles.rolinherit,
    roles.rolsuper,
    roles.rolcreatedb,
    roles.rolcreaterole,
    roles.rolreplication,
    roles.rolbypassrls,
    CASE
        WHEN roles.oid IS NULL THEN 'ROLE_MISSING'
        ELSE 'INSUFFICIENT_PRIVILEGE'
    END AS password_null_evidence,
    roles.rolconfig
FROM required_roles
LEFT JOIN pg_catalog.pg_roles AS roles
  ON roles.rolname = required_roles.role_name
ORDER BY required_roles.role_name;

-- SECTION 3 â€” ROLE MEMBERSHIPS

WITH required_roles(role_name) AS (
    VALUES
        ('afex_core_owner'),
        ('afex_core_runtime'),
        ('afex_context_issuer'),
        ('afex_outbox_worker'),
        ('afex_function_owner')
)
SELECT
    granted_role.rolname AS granted_role,
    member_role.rolname AS member_role,
    grantor_role.rolname AS grantor,
    membership.admin_option,
    CASE
        WHEN to_jsonb(membership) ? 'inherit_option'
        THEN (to_jsonb(membership) ->> 'inherit_option')::boolean
        ELSE NULL
    END AS inherit_option,
    CASE
        WHEN to_jsonb(membership) ? 'set_option'
        THEN (to_jsonb(membership) ->> 'set_option')::boolean
        ELSE NULL
    END AS set_option,
    CASE
        WHEN to_jsonb(membership) ? 'inherit_option'
         AND to_jsonb(membership) ? 'set_option'
        THEN 'CATALOG_SUPPORTS_MEMBERSHIP_OPTIONS'
        ELSE 'MEMBERSHIP_OPTIONS_NOT_EXPOSED_BY_THIS_POSTGRESQL_VERSION'
    END AS catalog_capability
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS granted_role
  ON granted_role.oid = membership.roleid
JOIN pg_catalog.pg_roles AS member_role
  ON member_role.oid = membership.member
LEFT JOIN pg_catalog.pg_roles AS grantor_role
  ON grantor_role.oid = membership.grantor
WHERE granted_role.rolname IN (SELECT role_name FROM required_roles)
   OR member_role.rolname IN (SELECT role_name FROM required_roles)
ORDER BY granted_role.rolname, member_role.rolname, grantor_role.rolname;

-- SECTION 4 â€” CORE V2 OWNED OBJECTS

WITH required_roles(role_name) AS (
    VALUES
        ('afex_core_owner'),
        ('afex_core_runtime'),
        ('afex_context_issuer'),
        ('afex_outbox_worker'),
        ('afex_function_owner')
),
owned_relations AS (
    SELECT
        roles.rolname AS owner_name,
        namespaces.nspname AS object_schema,
        classes.relname AS object_name,
        CASE classes.relkind
            WHEN 'r' THEN 'table'
            WHEN 'p' THEN 'partitioned_table'
            WHEN 'S' THEN 'sequence'
            WHEN 'v' THEN 'view'
            WHEN 'm' THEN 'materialized_view'
            WHEN 'f' THEN 'foreign_table'
            ELSE classes.relkind::text
        END AS object_kind
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    JOIN pg_catalog.pg_roles AS roles
      ON roles.oid = classes.relowner
    WHERE roles.rolname IN (SELECT role_name FROM required_roles)
),
owned_routines AS (
    SELECT
        roles.rolname AS owner_name,
        namespaces.nspname AS object_schema,
        procedures.proname ||
            '(' || pg_catalog.pg_get_function_identity_arguments(procedures.oid) || ')'
            AS object_name,
        CASE procedures.prokind
            WHEN 'p' THEN 'procedure'
            ELSE 'function'
        END AS object_kind
    FROM pg_catalog.pg_proc AS procedures
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = procedures.pronamespace
    JOIN pg_catalog.pg_roles AS roles
      ON roles.oid = procedures.proowner
    WHERE roles.rolname IN (SELECT role_name FROM required_roles)
),
owned_schemas AS (
    SELECT
        roles.rolname AS owner_name,
        namespaces.nspname AS object_schema,
        namespaces.nspname AS object_name,
        'schema'::text AS object_kind
    FROM pg_catalog.pg_namespace AS namespaces
    JOIN pg_catalog.pg_roles AS roles
      ON roles.oid = namespaces.nspowner
    WHERE roles.rolname IN (SELECT role_name FROM required_roles)
),
owned_types AS (
    SELECT
        roles.rolname AS owner_name,
        namespaces.nspname AS object_schema,
        types.typname AS object_name,
        'type'::text AS object_kind
    FROM pg_catalog.pg_type AS types
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = types.typnamespace
    JOIN pg_catalog.pg_roles AS roles
      ON roles.oid = types.typowner
    WHERE roles.rolname IN (SELECT role_name FROM required_roles)
      AND types.typtype IN ('c', 'd', 'e', 'r', 'm')
)
SELECT *
FROM (
    SELECT * FROM owned_relations
    UNION ALL
    SELECT * FROM owned_routines
    UNION ALL
    SELECT * FROM owned_schemas
    UNION ALL
    SELECT * FROM owned_types
) AS owned_objects
ORDER BY owner_name, object_kind, object_schema, object_name;

-- SECTION 5 â€” FOUNDATION OBJECT EXISTENCE

WITH targets(object_schema, object_name) AS (
    VALUES
        ('public', 'atomic_authorization_contexts'),
        ('public', 'atomic_order_commands'),
        ('public', 'idempotency_commands')
),
relations AS (
    SELECT
        targets.object_schema,
        targets.object_name,
        classes.oid,
        classes.relkind,
        classes.relpersistence,
        classes.relrowsecurity,
        classes.relforcerowsecurity,
        classes.reltuples,
        classes.relowner,
        classes.reltablespace
    FROM targets
    LEFT JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.nspname = targets.object_schema
    LEFT JOIN pg_catalog.pg_class AS classes
      ON classes.relnamespace = namespaces.oid
     AND classes.relname = targets.object_name
)
SELECT
    relations.object_schema,
    relations.object_name,
    relations.oid IS NOT NULL AS exists,
    CASE relations.relkind
        WHEN 'r' THEN 'ordinary_table'
        WHEN 'p' THEN 'partitioned_table'
        WHEN 'v' THEN 'view'
        WHEN 'm' THEN 'materialized_view'
        WHEN 'f' THEN 'foreign_table'
        WHEN 'S' THEN 'sequence'
        WHEN NULL THEN NULL
        ELSE relations.relkind::text
    END AS object_kind,
    owner_role.rolname AS owner,
    CASE relations.relpersistence
        WHEN 'p' THEN 'permanent'
        WHEN 'u' THEN 'unlogged'
        WHEN 't' THEN 'temporary'
        ELSE NULL
    END AS persistence,
    tablespace.spcname AS tablespace,
    relations.relrowsecurity AS rls_enabled,
    relations.relforcerowsecurity AS force_rls_enabled,
    CASE
        WHEN relations.oid IS NULL THEN NULL
        ELSE pg_catalog.row_security_active(relations.oid)
    END AS row_security_active_for_current_role,
    relations.reltuples::bigint AS estimated_rows,
    CASE
        WHEN relations.relkind IN ('r', 'p') THEN
            (
                (
                    pg_catalog.xpath(
                        '//row/row_count/text()',
                        pg_catalog.query_to_xml(
                            pg_catalog.format(
                                'SELECT count(*) AS row_count FROM %I.%I',
                                relations.object_schema,
                                relations.object_name
                            ),
                            false,
                            true,
                            ''
                        )
                    )
                )[1]::text
            )::bigint
        ELSE NULL
    END AS exact_row_count,
    CASE
        WHEN relations.oid IS NULL THEN NULL
        ELSE pg_catalog.pg_total_relation_size(relations.oid)
    END AS total_relation_bytes,
    CASE
        WHEN relations.oid IS NULL THEN NULL
        ELSE pg_catalog.pg_relation_size(relations.oid)
    END AS table_bytes,
    CASE
        WHEN relations.oid IS NULL THEN NULL
        ELSE pg_catalog.pg_indexes_size(relations.oid)
    END AS index_bytes,
    CASE
        WHEN relations.oid IS NULL THEN NULL
        ELSE pg_catalog.obj_description(relations.oid, 'pg_class')
    END AS object_comment
FROM relations
LEFT JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = relations.relowner
LEFT JOIN pg_catalog.pg_tablespace AS tablespace
  ON tablespace.oid = relations.reltablespace
ORDER BY relations.object_schema, relations.object_name;

-- SECTION 6 â€” COLUMN CONTRACTS

WITH target_relations AS (
    SELECT classes.oid
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
)
SELECT
    namespaces.nspname AS table_schema,
    classes.relname AS table_name,
    attributes.attnum AS ordinal_position,
    attributes.attname AS column_name,
    pg_catalog.format_type(attributes.atttypid, attributes.atttypmod)
        AS formatted_data_type,
    type_namespace.nspname AS underlying_type_schema,
    types.typname AS underlying_type_name,
    NOT attributes.attnotnull AS nullable,
    attributes.attidentity AS identity_status,
    attributes.attgenerated AS generated_status,
    pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid)
        AS default_expression,
    collation_namespace.nspname AS collation_schema,
    collations.collname AS collation_name
FROM pg_catalog.pg_attribute AS attributes
JOIN pg_catalog.pg_class AS classes
  ON classes.oid = attributes.attrelid
JOIN pg_catalog.pg_namespace AS namespaces
  ON namespaces.oid = classes.relnamespace
JOIN pg_catalog.pg_type AS types
  ON types.oid = attributes.atttypid
JOIN pg_catalog.pg_namespace AS type_namespace
  ON type_namespace.oid = types.typnamespace
LEFT JOIN pg_catalog.pg_attrdef AS defaults
  ON defaults.adrelid = attributes.attrelid
 AND defaults.adnum = attributes.attnum
LEFT JOIN pg_catalog.pg_collation AS collations
  ON collations.oid = attributes.attcollation
LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
  ON collation_namespace.oid = collations.collnamespace
WHERE attributes.attrelid IN (SELECT oid FROM target_relations)
  AND attributes.attnum > 0
  AND NOT attributes.attisdropped
ORDER BY namespaces.nspname, classes.relname, attributes.attnum;

-- SECTION 7 â€” CONSTRAINTS

WITH target_relations AS (
    SELECT classes.oid
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
)
SELECT
    source_namespace.nspname AS table_schema,
    source_class.relname AS table_name,
    constraints.conname AS constraint_name,
    CASE constraints.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'c' THEN 'CHECK'
        WHEN 'x' THEN 'EXCLUSION'
        ELSE constraints.contype::text
    END AS constraint_type,
    constraints.convalidated AS validated,
    constraints.condeferrable AS deferrable,
    constraints.condeferred AS initially_deferred,
    (
        SELECT array_agg(attribute.attname ORDER BY key_position.ordinality)
        FROM unnest(constraints.conkey)
             WITH ORDINALITY AS key_position(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraints.conrelid
         AND attribute.attnum = key_position.attnum
    ) AS source_columns,
    referenced_namespace.nspname AS referenced_schema,
    referenced_class.relname AS referenced_table,
    (
        SELECT array_agg(attribute.attname ORDER BY key_position.ordinality)
        FROM unnest(constraints.confkey)
             WITH ORDINALITY AS key_position(attnum, ordinality)
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = constraints.confrelid
         AND attribute.attnum = key_position.attnum
    ) AS referenced_columns,
    CASE constraints.confupdtype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE NULL
    END AS update_action,
    CASE constraints.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE NULL
    END AS delete_action,
    pg_catalog.pg_get_constraintdef(constraints.oid, true)
        AS constraint_definition
FROM pg_catalog.pg_constraint AS constraints
JOIN pg_catalog.pg_class AS source_class
  ON source_class.oid = constraints.conrelid
JOIN pg_catalog.pg_namespace AS source_namespace
  ON source_namespace.oid = source_class.relnamespace
LEFT JOIN pg_catalog.pg_class AS referenced_class
  ON referenced_class.oid = constraints.confrelid
LEFT JOIN pg_catalog.pg_namespace AS referenced_namespace
  ON referenced_namespace.oid = referenced_class.relnamespace
WHERE constraints.conrelid IN (SELECT oid FROM target_relations)
  AND constraints.contype IN ('p', 'u', 'f', 'c', 'x')
ORDER BY source_namespace.nspname, source_class.relname,
         constraints.contype, constraints.conname;

-- SECTION 8 â€” INDEXES

WITH target_relations AS (
    SELECT classes.oid
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
)
SELECT
    table_namespace.nspname AS table_schema,
    table_class.relname AS table_name,
    index_namespace.nspname AS index_schema,
    index_class.relname AS index_name,
    indexes.indisunique AS is_unique,
    indexes.indisprimary AS is_primary,
    indexes.indisvalid AS is_valid,
    indexes.indisready AS is_ready,
    indexes.indislive AS is_live,
    indexes.indisclustered AS is_clustered,
    access_method.amname AS access_method,
    (
        SELECT array_agg(
            pg_catalog.pg_get_indexdef(indexes.indexrelid, position, true)
            ORDER BY position
        )
        FROM generate_series(1, indexes.indnkeyatts) AS position
    ) AS indexed_columns_or_expressions,
    (
        SELECT array_agg(
            pg_catalog.pg_get_indexdef(indexes.indexrelid, position, true)
            ORDER BY position
        )
        FROM generate_series(
            indexes.indnkeyatts + 1,
            indexes.indnatts
        ) AS position
        WHERE indexes.indnatts > indexes.indnkeyatts
    ) AS included_columns,
    pg_catalog.pg_get_expr(
        indexes.indpred,
        indexes.indrelid,
        true
    ) AS predicate,
    pg_catalog.pg_get_expr(
        indexes.indexprs,
        indexes.indrelid,
        true
    ) AS expression,
    pg_catalog.pg_get_indexdef(indexes.indexrelid)
        AS index_definition
FROM pg_catalog.pg_index AS indexes
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid = indexes.indrelid
JOIN pg_catalog.pg_namespace AS table_namespace
  ON table_namespace.oid = table_class.relnamespace
JOIN pg_catalog.pg_class AS index_class
  ON index_class.oid = indexes.indexrelid
JOIN pg_catalog.pg_namespace AS index_namespace
  ON index_namespace.oid = index_class.relnamespace
JOIN pg_catalog.pg_am AS access_method
  ON access_method.oid = index_class.relam
WHERE indexes.indrelid IN (SELECT oid FROM target_relations)
ORDER BY table_namespace.nspname, table_class.relname,
         index_namespace.nspname, index_class.relname;

-- SECTION 8B â€” IDEMPOTENCY CLASSIFICATION

WITH target_relations AS (
    SELECT classes.oid, classes.relname
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
),
unique_indexes AS (
    SELECT
        target_relations.relname AS table_name,
        index_class.relname AS index_name,
        (
            SELECT array_agg(
                pg_catalog.pg_get_indexdef(indexes.indexrelid, position, true)
                ORDER BY position
            )
            FROM generate_series(1, indexes.indnkeyatts) AS position
        ) AS key_columns,
        indexes.indisvalid,
        indexes.indisready
    FROM target_relations
    JOIN pg_catalog.pg_index AS indexes
      ON indexes.indrelid = target_relations.oid
     AND indexes.indisunique
    JOIN pg_catalog.pg_class AS index_class
      ON index_class.oid = indexes.indexrelid
)
SELECT
    table_name,
    index_name,
    key_columns,
    CASE
        WHEN key_columns = ARRAY['idempotency_key_hash']
            THEN 'GLOBAL_KEY_HASH'
        WHEN key_columns = ARRAY[
            'tenant_id',
            'branch_id',
            'command_type',
            'idempotency_key_hash'
        ] THEN 'TENANT_BRANCH_COMMAND_KEY_HASH'
        WHEN key_columns = ARRAY[
            'tenant_id',
            'branch_id',
            'command_type',
            'key_hash'
        ] THEN 'OLD_TENANT_BRANCH_COMMAND_KEY_HASH'
        ELSE 'OTHER_UNIQUE_SCOPE'
    END AS uniqueness_classification,
    indisvalid,
    indisready
FROM unique_indexes
ORDER BY table_name, index_name;

-- SECTION 9 â€” RLS POLICIES

WITH target_relations AS (
    SELECT classes.oid
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
)
SELECT
    namespaces.nspname AS table_schema,
    classes.relname AS table_name,
    policies.polname AS policy_name,
    CASE
        WHEN policies.polpermissive THEN 'PERMISSIVE'
        ELSE 'RESTRICTIVE'
    END AS policy_mode,
    CASE policies.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
        ELSE policies.polcmd::text
    END AS policy_command,
    (
        SELECT array_agg(
            CASE
                WHEN role_oid = 0 THEN 'PUBLIC'
                ELSE role_state.rolname
            END
            ORDER BY role_position
        )
        FROM unnest(policies.polroles)
             WITH ORDINALITY AS policy_role(role_oid, role_position)
        LEFT JOIN pg_catalog.pg_roles AS role_state
          ON role_state.oid = policy_role.role_oid
    ) AS policy_roles,
    pg_catalog.pg_get_expr(
        policies.polqual,
        policies.polrelid,
        true
    ) AS using_expression,
    pg_catalog.pg_get_expr(
        policies.polwithcheck,
        policies.polrelid,
        true
    ) AS with_check_expression
FROM pg_catalog.pg_policy AS policies
JOIN pg_catalog.pg_class AS classes
  ON classes.oid = policies.polrelid
JOIN pg_catalog.pg_namespace AS namespaces
  ON namespaces.oid = classes.relnamespace
WHERE policies.polrelid IN (SELECT oid FROM target_relations)
ORDER BY namespaces.nspname, classes.relname, policies.polname;

-- SECTION 10A â€” DIRECT ACL

WITH target_relations AS (
    SELECT
        classes.oid,
        classes.relname,
        classes.relacl
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
)
SELECT
    'public'::text AS table_schema,
    target_relations.relname AS table_name,
    CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE grantee_role.rolname
    END AS grantee,
    acl.privilege_type,
    grantor_role.rolname AS grantor,
    acl.is_grantable,
    'DIRECT_ACL'::text AS evidence_type
FROM target_relations
CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(target_relations.relacl, '{}'::pg_catalog.aclitem[])
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role
  ON grantee_role.oid = acl.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role
  ON grantor_role.oid = acl.grantor
ORDER BY target_relations.relname, grantee, acl.privilege_type;

-- SECTION 10B â€” EFFECTIVE PRIVILEGES

WITH target_relations AS (
    SELECT classes.oid, classes.relname
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
),
checked_roles(role_name) AS (
    VALUES
        ('anon'),
        ('authenticated'),
        ('service_role'),
        ('afex_core_owner'),
        ('afex_core_runtime'),
        ('afex_context_issuer'),
        ('afex_outbox_worker'),
        ('afex_function_owner')
),
checked_privileges(privilege_name) AS (
    VALUES
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
)
SELECT
    'public'::text AS table_schema,
    target_relations.relname AS table_name,
    checked_roles.role_name,
    role_state.oid IS NOT NULL AS role_exists,
    checked_privileges.privilege_name,
    CASE
        WHEN role_state.oid IS NULL THEN NULL
        ELSE pg_catalog.has_table_privilege(
            role_state.oid,
            target_relations.oid,
            checked_privileges.privilege_name
        )
    END AS has_effective_privilege,
    'EFFECTIVE_OR_INHERITED'::text AS evidence_type
FROM target_relations
CROSS JOIN checked_roles
CROSS JOIN checked_privileges
LEFT JOIN pg_catalog.pg_roles AS role_state
  ON role_state.rolname = checked_roles.role_name
ORDER BY target_relations.relname, checked_roles.role_name,
         checked_privileges.privilege_name;

-- SECTION 10C â€” PUBLIC PRIVILEGES

WITH target_relations AS (
    SELECT
        classes.oid,
        classes.relname,
        classes.relacl,
        classes.relowner
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
),
checked_privileges(privilege_name) AS (
    VALUES
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
)
SELECT
    'public'::text AS table_schema,
    target_relations.relname AS table_name,
    'PUBLIC'::text AS grantee,
    checked_privileges.privilege_name,
    EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
            COALESCE(
                target_relations.relacl,
                pg_catalog.acldefault('r', target_relations.relowner)
            )
        ) AS acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = checked_privileges.privilege_name
    ) AS has_public_privilege,
    'PUBLIC_ACL_EFFECT'::text AS evidence_type
FROM target_relations
CROSS JOIN checked_privileges
ORDER BY target_relations.relname, checked_privileges.privilege_name;

-- SECTION 11A â€” PUBLIC SCHEMA OWNER

SELECT
    namespaces.nspname AS schema_name,
    owner_role.rolname AS schema_owner,
    namespaces.nspacl AS raw_acl
FROM pg_catalog.pg_namespace AS namespaces
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = namespaces.nspowner
WHERE namespaces.nspname = 'public';

-- SECTION 11B â€” PUBLIC SCHEMA GRANTS

SELECT
    namespaces.nspname AS schema_name,
    CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE grantee_role.rolname
    END AS grantee,
    acl.privilege_type,
    grantor_role.rolname AS grantor,
    acl.is_grantable
FROM pg_catalog.pg_namespace AS namespaces
CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
        namespaces.nspacl,
        pg_catalog.acldefault('n', namespaces.nspowner)
    )
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role
  ON grantee_role.oid = acl.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role
  ON grantor_role.oid = acl.grantor
WHERE namespaces.nspname = 'public'
ORDER BY grantee, acl.privilege_type;

-- SECTION 11C â€” PUBLIC SCHEMA EFFECTIVE PRIVILEGES

WITH checked_roles(role_name) AS (
    VALUES
        ('anon'),
        ('authenticated'),
        ('service_role'),
        ('afex_core_owner'),
        ('afex_core_runtime'),
        ('afex_context_issuer'),
        ('afex_outbox_worker'),
        ('afex_function_owner')
),
checked_privileges(privilege_name) AS (
    VALUES ('USAGE'), ('CREATE')
)
SELECT
    checked_roles.role_name,
    role_state.oid IS NOT NULL AS role_exists,
    checked_privileges.privilege_name,
    CASE
        WHEN role_state.oid IS NULL THEN NULL
        ELSE pg_catalog.has_schema_privilege(
            role_state.oid,
            'public',
            checked_privileges.privilege_name
        )
    END AS has_effective_privilege
FROM checked_roles
CROSS JOIN checked_privileges
LEFT JOIN pg_catalog.pg_roles AS role_state
  ON role_state.rolname = checked_roles.role_name
UNION ALL
SELECT
    'PUBLIC',
    true,
    checked_privileges.privilege_name,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS namespaces
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(
                namespaces.nspacl,
                pg_catalog.acldefault('n', namespaces.nspowner)
            )
        ) AS acl
        WHERE namespaces.nspname = 'public'
          AND acl.grantee = 0
          AND acl.privilege_type = checked_privileges.privilege_name
    )
FROM checked_privileges
ORDER BY role_name, privilege_name;

-- SECTION 12 â€” DEFAULT PRIVILEGES

WITH core_roles(role_name) AS (
    VALUES
        ('afex_core_owner'),
        ('afex_core_runtime'),
        ('afex_context_issuer'),
        ('afex_outbox_worker'),
        ('afex_function_owner')
),
reviewed_external_roles(role_name) AS (
    VALUES ('anon'), ('authenticated'), ('service_role')
)
SELECT
    owner_role.rolname AS default_acl_owner,
    namespaces.nspname AS schema_name,
    CASE default_acl.defaclobjtype
        WHEN 'r' THEN 'TABLE'
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'f' THEN 'FUNCTION'
        WHEN 'T' THEN 'TYPE'
        WHEN 'n' THEN 'SCHEMA'
        ELSE default_acl.defaclobjtype::text
    END AS object_type,
    CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE grantee_role.rolname
    END AS grantee,
    acl.privilege_type,
    acl.is_grantable
FROM pg_catalog.pg_default_acl AS default_acl
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = default_acl.defaclrole
LEFT JOIN pg_catalog.pg_namespace AS namespaces
  ON namespaces.oid = default_acl.defaclnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role
  ON grantee_role.oid = acl.grantee
WHERE owner_role.rolname IN (SELECT role_name FROM core_roles)
   OR grantee_role.rolname IN (SELECT role_name FROM core_roles)
   OR (
        owner_role.rolname IN (SELECT role_name FROM core_roles)
        AND (
            acl.grantee = 0
            OR grantee_role.rolname IN (
                SELECT role_name FROM reviewed_external_roles
            )
        )
   )
ORDER BY owner_role.rolname, namespaces.nspname,
         default_acl.defaclobjtype, grantee, acl.privilege_type;

-- SECTION 13A â€” FUNCTIONS

WITH matching_routines AS (
    SELECT
        procedures.oid,
        ARRAY_REMOVE(ARRAY[
            CASE
                WHEN pg_catalog.pg_get_functiondef(procedures.oid)
                     ~* '\matomic_authorization_contexts\M'
                THEN 'atomic_authorization_contexts'
            END,
            CASE
                WHEN pg_catalog.pg_get_functiondef(procedures.oid)
                     ~* '\matomic_order_commands\M'
                THEN 'atomic_order_commands'
            END,
            CASE
                WHEN pg_catalog.pg_get_functiondef(procedures.oid)
                     ~* '\midempotency_commands\M'
                THEN 'idempotency_commands'
            END
        ], NULL) AS matching_object_names
    FROM pg_catalog.pg_proc AS procedures
    WHERE procedures.prokind IN ('f', 'p')
      AND (
          pg_catalog.pg_get_functiondef(procedures.oid)
              ~* '\matomic_authorization_contexts\M'
          OR pg_catalog.pg_get_functiondef(procedures.oid)
              ~* '\matomic_order_commands\M'
          OR pg_catalog.pg_get_functiondef(procedures.oid)
              ~* '\midempotency_commands\M'
      )
)
SELECT
    namespaces.nspname AS routine_schema,
    procedures.proname AS routine_name,
    pg_catalog.pg_get_function_identity_arguments(procedures.oid)
        AS identity_arguments,
    pg_catalog.pg_get_function_result(procedures.oid) AS return_type,
    owner_role.rolname AS owner,
    languages.lanname AS language,
    CASE procedures.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        WHEN 'v' THEN 'VOLATILE'
    END AS volatility,
    CASE
        WHEN procedures.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END AS security_mode,
    CASE procedures.proparallel
        WHEN 's' THEN 'SAFE'
        WHEN 'r' THEN 'RESTRICTED'
        WHEN 'u' THEN 'UNSAFE'
    END AS parallel_safety,
    procedures.proconfig,
    matching_routines.matching_object_names
FROM matching_routines
JOIN pg_catalog.pg_proc AS procedures
  ON procedures.oid = matching_routines.oid
JOIN pg_catalog.pg_namespace AS namespaces
  ON namespaces.oid = procedures.pronamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = procedures.proowner
JOIN pg_catalog.pg_language AS languages
  ON languages.oid = procedures.prolang
ORDER BY namespaces.nspname, procedures.proname,
         pg_catalog.pg_get_function_identity_arguments(procedures.oid);

-- SECTION 13B â€” FUNCTION EXECUTE ACL

WITH matching_routines AS (
    SELECT procedures.oid
    FROM pg_catalog.pg_proc AS procedures
    WHERE procedures.prokind IN ('f', 'p')
      AND (
          pg_catalog.pg_get_functiondef(procedures.oid)
              ~* '\matomic_authorization_contexts\M'
          OR pg_catalog.pg_get_functiondef(procedures.oid)
              ~* '\matomic_order_commands\M'
          OR pg_catalog.pg_get_functiondef(procedures.oid)
              ~* '\midempotency_commands\M'
      )
)
SELECT
    namespaces.nspname AS routine_schema,
    procedures.proname AS routine_name,
    pg_catalog.pg_get_function_identity_arguments(procedures.oid)
        AS identity_arguments,
    CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE grantee_role.rolname
    END AS grantee,
    acl.privilege_type,
    grantor_role.rolname AS grantor,
    acl.is_grantable
FROM matching_routines
JOIN pg_catalog.pg_proc AS procedures
  ON procedures.oid = matching_routines.oid
JOIN pg_catalog.pg_namespace AS namespaces
  ON namespaces.oid = procedures.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
        procedures.proacl,
        pg_catalog.acldefault('f', procedures.proowner)
    )
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role
  ON grantee_role.oid = acl.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role
  ON grantor_role.oid = acl.grantor
ORDER BY namespaces.nspname, procedures.proname,
         identity_arguments, grantee;

-- SECTION 14 â€” DEPENDENCIES

WITH targets AS (
    SELECT classes.oid
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
),
dependency_rows AS (
    SELECT
        dependencies.classid AS dependent_classid,
        dependencies.objid AS dependent_objid,
        dependencies.objsubid AS dependent_objsubid,
        dependencies.refclassid AS referenced_classid,
        dependencies.refobjid AS referenced_objid,
        dependencies.refobjsubid AS referenced_objsubid,
        dependencies.deptype
    FROM pg_catalog.pg_depend AS dependencies
    WHERE dependencies.objid IN (SELECT oid FROM targets)
       OR dependencies.refobjid IN (SELECT oid FROM targets)
)
SELECT
    pg_catalog.pg_describe_object(
        dependent_classid,
        dependent_objid,
        dependent_objsubid
    ) AS dependent_object,
    CASE deptype
        WHEN 'n' THEN 'NORMAL'
        WHEN 'a' THEN 'AUTO'
        WHEN 'i' THEN 'INTERNAL'
        WHEN 'e' THEN 'EXTENSION'
        WHEN 'p' THEN 'PIN'
        ELSE deptype::text
    END AS dependency_type,
    pg_catalog.pg_describe_object(
        referenced_classid,
        referenced_objid,
        referenced_objsubid
    ) AS referenced_object
FROM dependency_rows
ORDER BY dependent_object, referenced_object, dependency_type;

-- SECTION 14B â€” FOREIGN KEYS

WITH targets AS (
    SELECT classes.oid
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
)
SELECT
    source_namespace.nspname AS dependent_schema,
    source_class.relname AS dependent_table,
    constraints.conname AS foreign_key_name,
    referenced_namespace.nspname AS referenced_schema,
    referenced_class.relname AS referenced_table,
    pg_catalog.pg_get_constraintdef(constraints.oid, true)
        AS foreign_key_definition
FROM pg_catalog.pg_constraint AS constraints
JOIN pg_catalog.pg_class AS source_class
  ON source_class.oid = constraints.conrelid
JOIN pg_catalog.pg_namespace AS source_namespace
  ON source_namespace.oid = source_class.relnamespace
JOIN pg_catalog.pg_class AS referenced_class
  ON referenced_class.oid = constraints.confrelid
JOIN pg_catalog.pg_namespace AS referenced_namespace
  ON referenced_namespace.oid = referenced_class.relnamespace
WHERE constraints.contype = 'f'
  AND (
      constraints.conrelid IN (SELECT oid FROM targets)
      OR constraints.confrelid IN (SELECT oid FROM targets)
  )
ORDER BY source_namespace.nspname, source_class.relname,
         constraints.conname;

-- SECTION 15 â€” TRIGGERS

WITH target_relations AS (
    SELECT classes.oid
    FROM pg_catalog.pg_class AS classes
    JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.oid = classes.relnamespace
    WHERE namespaces.nspname = 'public'
      AND classes.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands',
          'idempotency_commands'
      )
      AND classes.relkind IN ('r', 'p')
)
SELECT
    table_namespace.nspname AS table_schema,
    table_class.relname AS table_name,
    triggers.tgname AS trigger_name,
    triggers.tgenabled AS enabled_state,
    triggers.tgisinternal AS is_internal,
    pg_catalog.pg_get_triggerdef(triggers.oid, true)
        AS trigger_definition,
    function_namespace.nspname AS function_schema,
    procedures.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(procedures.oid)
        AS function_signature,
    owner_role.rolname AS function_owner,
    CASE
        WHEN procedures.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END AS function_security_mode,
    procedures.proconfig AS function_configuration
FROM pg_catalog.pg_trigger AS triggers
JOIN pg_catalog.pg_class AS table_class
  ON table_class.oid = triggers.tgrelid
JOIN pg_catalog.pg_namespace AS table_namespace
  ON table_namespace.oid = table_class.relnamespace
JOIN pg_catalog.pg_proc AS procedures
  ON procedures.oid = triggers.tgfoid
JOIN pg_catalog.pg_namespace AS function_namespace
  ON function_namespace.oid = procedures.pronamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = procedures.proowner
WHERE triggers.tgrelid IN (SELECT oid FROM target_relations)
ORDER BY table_namespace.nspname, table_class.relname, triggers.tgname;

-- SECTION 16A â€” UUID/DIGEST FUNCTIONS

WITH candidates(function_name, identity_arguments) AS (
    VALUES
        ('gen_random_uuid', ''),
        ('uuid_generate_v4', ''),
        ('digest', 'bytea, text'),
        ('digest', 'text, text'),
        ('gen_random_bytes', 'integer')
)
SELECT
    candidates.function_name AS requested_name,
    candidates.identity_arguments AS requested_identity_arguments,
    procedures.oid IS NOT NULL AS available,
    namespaces.nspname AS function_schema,
    procedures.proname AS function_name,
    CASE
        WHEN procedures.oid IS NULL THEN NULL
        ELSE pg_catalog.pg_get_function_identity_arguments(procedures.oid)
    END AS identity_arguments,
    owner_role.rolname AS owner,
    CASE
        WHEN procedures.oid IS NULL THEN NULL
        WHEN procedures.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END AS security_mode,
    procedures.proconfig,
    extension_state.extname AS owning_extension
FROM candidates
LEFT JOIN pg_catalog.pg_proc AS procedures
  ON procedures.proname = candidates.function_name
 AND pg_catalog.pg_get_function_identity_arguments(procedures.oid)
     = candidates.identity_arguments
LEFT JOIN pg_catalog.pg_namespace AS namespaces
  ON namespaces.oid = procedures.pronamespace
LEFT JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = procedures.proowner
LEFT JOIN pg_catalog.pg_depend AS extension_dependency
  ON extension_dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
 AND extension_dependency.objid = procedures.oid
 AND extension_dependency.deptype = 'e'
LEFT JOIN pg_catalog.pg_extension AS extension_state
  ON extension_state.oid = extension_dependency.refobjid
ORDER BY candidates.function_name, candidates.identity_arguments,
         namespaces.nspname;

-- SECTION 16B â€” UUID/DIGEST ACL

WITH candidate_functions AS (
    SELECT procedures.oid
    FROM pg_catalog.pg_proc AS procedures
    WHERE (
            procedures.proname = 'gen_random_uuid'
            AND pg_catalog.pg_get_function_identity_arguments(procedures.oid) = ''
          )
       OR (
            procedures.proname = 'uuid_generate_v4'
            AND pg_catalog.pg_get_function_identity_arguments(procedures.oid) = ''
          )
       OR (
            procedures.proname = 'digest'
            AND pg_catalog.pg_get_function_identity_arguments(procedures.oid)
                IN ('bytea, text', 'text, text')
          )
       OR (
            procedures.proname = 'gen_random_bytes'
            AND pg_catalog.pg_get_function_identity_arguments(procedures.oid)
                = 'integer'
          )
)
SELECT
    namespaces.nspname AS function_schema,
    procedures.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(procedures.oid)
        AS identity_arguments,
    CASE
        WHEN acl.grantee = 0 THEN 'PUBLIC'
        ELSE grantee_role.rolname
    END AS grantee,
    acl.privilege_type,
    grantor_role.rolname AS grantor,
    acl.is_grantable
FROM candidate_functions
JOIN pg_catalog.pg_proc AS procedures
  ON procedures.oid = candidate_functions.oid
JOIN pg_catalog.pg_namespace AS namespaces
  ON namespaces.oid = procedures.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
        procedures.proacl,
        pg_catalog.acldefault('f', procedures.proowner)
    )
) AS acl
LEFT JOIN pg_catalog.pg_roles AS grantee_role
  ON grantee_role.oid = acl.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role
  ON grantor_role.oid = acl.grantor
ORDER BY namespaces.nspname, procedures.proname,
         identity_arguments, grantee;

-- SECTION 16C â€” EXTENSIONS

SELECT
    extensions.extname AS extension_name,
    extensions.extversion AS extension_version,
    namespaces.nspname AS extension_schema,
    owner_role.rolname AS extension_owner
FROM pg_catalog.pg_extension AS extensions
JOIN pg_catalog.pg_namespace AS namespaces
  ON namespaces.oid = extensions.extnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = extensions.extowner
WHERE extensions.extname IN ('pgcrypto', 'uuid-ossp')
ORDER BY extensions.extname;

-- SECTION 17 â€” BUSINESS FK PREFLIGHT

WITH targets(table_schema, table_name, column_name) AS (
    VALUES
        ('public', 'tenants', 'id'),
        ('public', 'branches', 'id'),
        ('public', 'profiles', 'id'),
        ('public', 'orders', 'id'),
        ('public', 'invoices', 'id')
),
resolved AS (
    SELECT
        targets.table_schema,
        targets.table_name,
        targets.column_name,
        classes.oid AS table_oid,
        classes.relkind,
        attributes.attnum,
        attributes.atttypid,
        attributes.atttypmod
    FROM targets
    LEFT JOIN pg_catalog.pg_namespace AS namespaces
      ON namespaces.nspname = targets.table_schema
    LEFT JOIN pg_catalog.pg_class AS classes
      ON classes.relnamespace = namespaces.oid
     AND classes.relname = targets.table_name
     AND classes.relkind IN ('r', 'p')
    LEFT JOIN pg_catalog.pg_attribute AS attributes
      ON attributes.attrelid = classes.oid
     AND attributes.attname = targets.column_name
     AND attributes.attnum > 0
     AND NOT attributes.attisdropped
)
SELECT
    resolved.table_schema,
    resolved.table_name,
    resolved.column_name,
    resolved.table_oid IS NOT NULL AS table_exists,
    resolved.attnum IS NOT NULL AS column_exists,
    CASE
        WHEN resolved.attnum IS NULL THEN NULL
        ELSE pg_catalog.format_type(
            resolved.atttypid,
            resolved.atttypmod
        )
    END AS formatted_type,
    resolved.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
        AS uuid_compatible,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraints
        WHERE constraints.conrelid = resolved.table_oid
          AND constraints.contype IN ('p', 'u')
          AND constraints.conkey = ARRAY[resolved.attnum]::smallint[]
    ) AS primary_or_unique_single_column,
    (
        SELECT count(*)
        FROM pg_catalog.pg_constraint AS constraints
        WHERE constraints.contype = 'f'
          AND constraints.confrelid = resolved.table_oid
          AND constraints.confkey @> ARRAY[resolved.attnum]::smallint[]
    ) AS referencing_foreign_key_count,
    CASE resolved.table_name
        WHEN 'tenants' THEN (SELECT count(*) FROM public.tenants)
        WHEN 'branches' THEN (SELECT count(*) FROM public.branches)
        WHEN 'profiles' THEN (SELECT count(*) FROM public.profiles)
        WHEN 'orders' THEN (SELECT count(*) FROM public.orders)
        WHEN 'invoices' THEN (SELECT count(*) FROM public.invoices)
        ELSE NULL
    END AS exact_row_count,
    (
        resolved.table_oid IS NOT NULL
        AND resolved.attnum IS NOT NULL
        AND resolved.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
        AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint AS constraints
            WHERE constraints.conrelid = resolved.table_oid
              AND constraints.contype IN ('p', 'u')
              AND constraints.conkey = ARRAY[resolved.attnum]::smallint[]
        )
    ) AS future_fk_structurally_possible
FROM resolved
ORDER BY resolved.table_schema, resolved.table_name;

-- SECTION 18 â€” DETERMINISTIC FOUNDATION STATE CLASSIFICATION

WITH
required_roles(role_name) AS (
    VALUES
        ('afex_core_owner'),
        ('afex_core_runtime'),
        ('afex_context_issuer'),
        ('afex_outbox_worker'),
        ('afex_function_owner')
),
role_state AS (
    SELECT
        count(*) FILTER (
            WHERE roles.oid IS NOT NULL
        )::integer AS required_roles_present_count,
        count(*) FILTER (
            WHERE roles.oid IS NOT NULL
              AND roles.rolcanlogin = false
              AND roles.rolinherit = false
              AND roles.rolsuper = false
              AND roles.rolcreatedb = false
              AND roles.rolcreaterole = false
              AND roles.rolreplication = false
              AND roles.rolbypassrls = false
        )::integer AS roles_with_expected_attributes
    FROM required_roles
    LEFT JOIN pg_catalog.pg_roles AS roles
      ON roles.rolname = required_roles.role_name
),
objects AS (
    SELECT
        pg_catalog.to_regclass(
            'public.atomic_authorization_contexts'
        ) AS context_oid,
        pg_catalog.to_regclass(
            'public.atomic_order_commands'
        ) AS command_oid,
        pg_catalog.to_regclass(
            'public.idempotency_commands'
        ) AS old_command_oid
),
object_flags AS (
    SELECT
        context_oid IS NOT NULL AS context_exists,
        command_oid IS NOT NULL AS command_exists,
        old_command_oid IS NOT NULL AS old_command_exists,
        context_oid,
        command_oid,
        old_command_oid,
        COALESCE(
            (
                SELECT classes.relkind IN ('r', 'p')
                FROM pg_catalog.pg_class AS classes
                WHERE classes.oid = context_oid
            ),
            false
        ) AS context_is_table,
        COALESCE(
            (
                SELECT classes.relkind IN ('r', 'p')
                FROM pg_catalog.pg_class AS classes
                WHERE classes.oid = command_oid
            ),
            false
        ) AS command_is_table,
        COALESCE(
            (
                SELECT classes.relkind IN ('r', 'p')
                FROM pg_catalog.pg_class AS classes
                WHERE classes.oid = old_command_oid
            ),
            false
        ) AS old_command_is_table
    FROM objects
),
row_counts AS (
    SELECT
        CASE
            WHEN context_is_table THEN
                (
                    (
                        pg_catalog.xpath(
                            '//row/row_count/text()',
                            pg_catalog.query_to_xml(
                                'SELECT count(*) AS row_count FROM public.atomic_authorization_contexts',
                                false,
                                true,
                                ''
                            )
                        )
                    )[1]::text
                )::bigint
            ELSE NULL
        END AS context_rows,
        CASE
            WHEN command_is_table THEN
                (
                    (
                        pg_catalog.xpath(
                            '//row/row_count/text()',
                            pg_catalog.query_to_xml(
                                'SELECT count(*) AS row_count FROM public.atomic_order_commands',
                                false,
                                true,
                                ''
                            )
                        )
                    )[1]::text
                )::bigint
            ELSE NULL
        END AS command_rows,
        CASE
            WHEN old_command_is_table THEN
                (
                    (
                        pg_catalog.xpath(
                            '//row/row_count/text()',
                            pg_catalog.query_to_xml(
                                'SELECT count(*) AS row_count FROM public.idempotency_commands',
                                false,
                                true,
                                ''
                            )
                        )
                    )[1]::text
                )::bigint
            ELSE NULL
        END AS old_command_rows
    FROM object_flags
),
routine_references AS (
    SELECT
        count(*) FILTER (
            WHERE definition
                ~* '\matomic_authorization_contexts\M'
        )::integer AS context_dependency_count,
        count(*) FILTER (
            WHERE definition
                ~* '\matomic_order_commands\M'
        )::integer AS command_dependency_count,
        count(*) FILTER (
            WHERE definition
                ~* '\midempotency_commands\M'
        )::integer AS old_command_dependency_count,
        count(*) FILTER (
            WHERE definition
                ~* '\m(atomic_authorization_contexts|atomic_order_commands)\M'
              AND definition
                ~* '\midempotency_commands\M'
        )::integer AS mixed_routine_dependency_count
    FROM (
        SELECT pg_catalog.pg_get_functiondef(procedures.oid) AS definition
        FROM pg_catalog.pg_proc AS procedures
        WHERE procedures.prokind IN ('f', 'p')
    ) AS definitions
),
context_draft_shape AS (
    SELECT
        object_flags.context_exists
        AND object_flags.context_is_table
        AND NOT EXISTS (
            SELECT 1
            FROM (
                VALUES
                    ('id', 'uuid'),
                    ('capability_version', 'text'),
                    ('employee_source', 'text'),
                    ('employee_source_id', 'uuid'),
                    ('reference_hash', 'bytea'),
                    ('idempotency_key_hash', 'bytea'),
                    ('request_fingerprint', 'bytea'),
                    ('consumed_command_id', 'uuid')
            ) AS expected(column_name, formatted_type)
            WHERE NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute AS attributes
                WHERE attributes.attrelid = object_flags.context_oid
                  AND attributes.attname = expected.column_name
                  AND attributes.attnum > 0
                  AND NOT attributes.attisdropped
                  AND pg_catalog.format_type(
                      attributes.atttypid,
                      attributes.atttypmod
                  ) = expected.formatted_type
            )
        ) AS matches
    FROM object_flags
),
command_draft_shape AS (
    SELECT
        object_flags.command_exists
        AND object_flags.command_is_table
        AND NOT EXISTS (
            SELECT 1
            FROM (
                VALUES
                    ('id', 'uuid'),
                    ('command_version', 'smallint'),
                    ('command_type', 'text'),
                    ('idempotency_key_hash', 'bytea'),
                    ('request_fingerprint', 'bytea'),
                    ('fingerprint_version', 'smallint'),
                    ('authorization_context_id', 'uuid'),
                    ('authenticated_actor_id', 'uuid'),
                    ('tenant_id', 'uuid'),
                    ('branch_id', 'uuid'),
                    ('correlation_reference', 'text'),
                    ('execution_status', 'text'),
                    ('attempt_count', 'integer'),
                    ('response_snapshot', 'jsonb'),
                    ('created_by_identity', 'text')
            ) AS expected(column_name, formatted_type)
            WHERE NOT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_attribute AS attributes
                WHERE attributes.attrelid = object_flags.command_oid
                  AND attributes.attname = expected.column_name
                  AND attributes.attnum > 0
                  AND NOT attributes.attisdropped
                  AND pg_catalog.format_type(
                      attributes.atttypid,
                      attributes.atttypmod
                  ) = expected.formatted_type
            )
        )
        AND EXISTS (
            SELECT 1
            FROM pg_catalog.pg_index AS indexes
            JOIN pg_catalog.pg_attribute AS key_attribute
              ON key_attribute.attrelid = indexes.indrelid
             AND key_attribute.attnum = indexes.indkey[0]
            WHERE indexes.indrelid = object_flags.command_oid
              AND indexes.indisunique
              AND indexes.indnkeyatts = 1
              AND key_attribute.attname = 'idempotency_key_hash'
        ) AS matches
    FROM object_flags
),
membership_drift AS (
    SELECT count(*)::integer AS membership_count
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role
      ON granted_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    WHERE granted_role.rolname IN (
              SELECT role_name FROM required_roles
          )
       OR member_role.rolname IN (
              SELECT role_name FROM required_roles
          )
),
classification_inputs AS (
    SELECT
        object_flags.*,
        row_counts.context_rows,
        row_counts.command_rows,
        row_counts.old_command_rows,
        role_state.required_roles_present_count,
        role_state.roles_with_expected_attributes,
        routine_references.context_dependency_count,
        routine_references.command_dependency_count,
        routine_references.old_command_dependency_count,
        routine_references.mixed_routine_dependency_count,
        context_draft_shape.matches AS context_matches_p2d_draft,
        command_draft_shape.matches AS command_matches_p2d_draft,
        membership_drift.membership_count,
        (
            routine_references.mixed_routine_dependency_count
            + CASE
                WHEN object_flags.old_command_exists
                 AND (
                     object_flags.context_exists
                     OR object_flags.command_exists
                 )
                THEN 1
                ELSE 0
              END
            + CASE
                WHEN (
                    object_flags.context_exists
                    OR object_flags.command_exists
                )
                AND routine_references.old_command_dependency_count > 0
                THEN routine_references.old_command_dependency_count
                ELSE 0
              END
        )::integer AS mixed_dependency_count
    FROM object_flags
    CROSS JOIN row_counts
    CROSS JOIN role_state
    CROSS JOIN routine_references
    CROSS JOIN context_draft_shape
    CROSS JOIN command_draft_shape
    CROSS JOIN membership_drift
)
SELECT
    CASE
        WHEN mixed_dependency_count > 0
            THEN 'MIXED_CONTRACT'
        WHEN NOT context_exists
         AND NOT command_exists
         AND NOT old_command_exists
         AND context_dependency_count = 0
         AND command_dependency_count = 0
         AND old_command_dependency_count = 0
         AND required_roles_present_count = 0
         AND membership_count = 0
            THEN 'NOT_INSTALLED'
        WHEN context_exists
         AND command_exists
         AND NOT old_command_exists
         AND context_matches_p2d_draft
         AND command_matches_p2d_draft
         AND context_is_table
         AND command_is_table
            THEN 'P2D_DRAFT_INSTALLED'
        WHEN old_command_exists
         AND old_command_is_table
         AND NOT context_exists
         AND NOT command_exists
            THEN 'OLD_CORE_V2_INSTALLED'
        ELSE 'UNKNOWN_DRIFT'
    END AS classification,
    CASE
        WHEN mixed_dependency_count > 0
            THEN 'Old and new command-ledger contracts or their active dependencies coexist.'
        WHEN NOT context_exists
         AND NOT command_exists
         AND NOT old_command_exists
         AND required_roles_present_count = 0
            THEN 'No target tables, target-dependent routines, or Core V2 roles were found.'
        WHEN context_exists
         AND command_exists
         AND NOT old_command_exists
         AND context_matches_p2d_draft
         AND command_matches_p2d_draft
            THEN 'Both P2D draft tables exist and match the defining draft structural markers.'
        WHEN old_command_exists
         AND NOT context_exists
         AND NOT command_exists
            THEN 'The superseded command ledger exists while both new atomic tables are absent.'
        ELSE 'The deployed state is partial, structurally incompatible, or insufficiently explained.'
    END AS reason_summary,
    context_exists AS atomic_authorization_contexts_exists,
    command_exists AS atomic_order_commands_exists,
    old_command_exists AS idempotency_commands_exists,
    required_roles_present_count,
    pg_catalog.format(
        'atomic_authorization_contexts=%s; atomic_order_commands=%s; idempotency_commands=%s',
        COALESCE(context_rows::text, 'ABSENT_OR_NOT_A_TABLE'),
        COALESCE(command_rows::text, 'ABSENT_OR_NOT_A_TABLE'),
        COALESCE(old_command_rows::text, 'ABSENT_OR_NOT_A_TABLE')
    ) AS foundation_row_count_summary,
    mixed_dependency_count,
    CASE
        WHEN mixed_dependency_count > 0
            THEN 'STOP-MIXED-CONTRACT'
        WHEN NOT context_exists
         AND NOT command_exists
         AND NOT old_command_exists
         AND context_dependency_count = 0
         AND command_dependency_count = 0
         AND old_command_dependency_count = 0
         AND required_roles_present_count = 0
         AND membership_count = 0
            THEN 'P2D.15-FRESH'
        WHEN (
                context_exists
                AND command_exists
                AND NOT old_command_exists
                AND context_matches_p2d_draft
                AND command_matches_p2d_draft
             )
          OR (
                old_command_exists
                AND old_command_is_table
                AND NOT context_exists
                AND NOT command_exists
             )
            THEN 'P2D.15-FORWARD'
        ELSE 'STOP-UNKNOWN-DRIFT'
    END AS safe_next_path,
    context_matches_p2d_draft,
    command_matches_p2d_draft,
    roles_with_expected_attributes,
    membership_count,
    context_dependency_count,
    command_dependency_count,
    old_command_dependency_count
FROM classification_inputs;

ROLLBACK;

-- END OF P2D.14B READ-ONLY PRODUCTION PREFLIGHT