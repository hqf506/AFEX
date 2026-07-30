-- AFEX Core V2 P2D.19 - Read-Only Post-Install Attestation
-- Source contract: P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql
-- This artifact is fail-closed and performs no repair.
-- Normative contract: P2D.17 + P2D.18 + P2D.18A.

BEGIN TRANSACTION READ ONLY;

DO $attestation$
BEGIN
    IF pg_catalog.current_setting('server_version_num')::integer <> 170006 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: unsupported PostgreSQL version';
    END IF;

    IF pg_catalog.current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: server encoding is not UTF8';
    END IF;

    RAISE NOTICE 'P2D19A_100_SERVER_IDENTITY_OK';
END
$attestation$;

DO $attestation$
DECLARE
    payload_relation oid;
    command_relation oid;
    core_owner_oid oid;
    function_owner_oid oid;
    missing_roles text[];
    column_differences text[];
    constraint_differences text[];
    index_differences text[];
    forbidden_role text;
BEGIN
    SELECT pg_catalog.array_agg(expected_role.role_name ORDER BY expected_role.role_name)
    INTO missing_roles
    FROM (
        VALUES
            ('afex_core_owner'::text),
            ('afex_function_owner'::text),
            ('afex_core_runtime'::text),
            ('afex_context_issuer'::text),
            ('afex_outbox_worker'::text),
            ('anon'::text),
            ('authenticated'::text),
            ('service_role'::text)
    ) AS expected_role(role_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS role_state
        WHERE role_state.rolname = expected_role.role_name
    );

    IF missing_roles IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: required roles are missing',
            detail = pg_catalog.array_to_string(missing_roles, ', ');
    END IF;

    payload_relation :=
        pg_catalog.to_regclass(
            'public.atomic_order_command_payloads'
        );
    command_relation :=
        pg_catalog.to_regclass('public.atomic_order_commands');

    IF payload_relation IS NULL OR command_relation IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: required relation is absent';
    END IF;

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    IF (
        SELECT relation_state.relowner = core_owner_oid
               AND relation_state.relkind = 'r'
               AND relation_state.relpersistence = 'p'
               AND relation_state.relrowsecurity
               AND relation_state.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.oid = payload_relation
    ) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: ownership, persistence, or RLS mismatch';
    END IF;

    WITH expected_columns AS (
        SELECT *
        FROM (
            VALUES
                (1, 'command_id', 'uuid', true, NULL::text),
                (2, 'payload_version', 'text', true, NULL::text),
                (3, 'fingerprint_version', 'text', true, NULL::text),
                (4, 'canonical_payload', 'jsonb', true, NULL::text),
                (5, 'request_fingerprint', 'bytea', true, NULL::text),
                (6, 'canonical_size_bytes', 'integer', true, NULL::text),
                (
                    7,
                    'created_at',
                    'timestamp with time zone',
                    true,
                    'transaction_timestamp()'
                ),
                (8, 'created_by_identity', 'text', true, NULL::text),
                (
                    9,
                    'retain_until',
                    'timestamp with time zone',
                    true,
                    NULL::text
                ),
                (
                    10,
                    'archived_at',
                    'timestamp with time zone',
                    false,
                    NULL::text
                ),
                (11, 'archive_reference', 'text', false, NULL::text),
                (12, 'archive_hash', 'bytea', false, NULL::text)
        ) AS columns(
            ordinal_position,
            column_name,
            data_type,
            not_null,
            default_expression
        )
    ),
    actual_columns AS (
        SELECT
            attribute_state.attnum::integer AS ordinal_position,
            attribute_state.attname::text AS column_name,
            pg_catalog.format_type(
                attribute_state.atttypid,
                attribute_state.atttypmod
            ) AS data_type,
            attribute_state.attnotnull AS not_null,
            pg_catalog.pg_get_expr(
                default_state.adbin,
                default_state.adrelid
            ) AS default_expression
        FROM pg_catalog.pg_attribute AS attribute_state
        LEFT JOIN pg_catalog.pg_attrdef AS default_state
          ON default_state.adrelid = attribute_state.attrelid
         AND default_state.adnum = attribute_state.attnum
        WHERE attribute_state.attrelid = payload_relation
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
    ),
    differences AS (
        (
            SELECT * FROM expected_columns
            EXCEPT
            SELECT * FROM actual_columns
        )
        UNION ALL
        (
            SELECT * FROM actual_columns
            EXCEPT
            SELECT * FROM expected_columns
        )
    )
    SELECT pg_catalog.array_agg(
        differences.column_name
        ORDER BY differences.ordinal_position
    )
    INTO column_differences
    FROM differences;

    IF column_differences IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: column contract mismatch',
            detail = pg_catalog.array_to_string(
                column_differences,
                ', '
            );
    END IF;

    WITH expected_constraints AS (
        SELECT *
        FROM (
            VALUES
                ('atomic_order_command_payloads_pkey', 'p'::"char"),
                ('atomic_order_command_payloads_command_fk', 'f'::"char"),
                (
                    'atomic_order_command_payloads_payload_version_check',
                    'c'::"char"
                ),
                (
                    'atomic_order_command_payloads_fingerprint_version_check',
                    'c'::"char"
                ),
                (
                    'atomic_order_command_payloads_payload_type_check',
                    'c'::"char"
                ),
                (
                    'atomic_order_command_payloads_payload_contract_check',
                    'c'::"char"
                ),
                (
                    'atomic_order_command_payloads_fingerprint_check',
                    'c'::"char"
                ),
                (
                    'atomic_order_command_payloads_size_check',
                    'c'::"char"
                ),
                (
                    'atomic_order_command_payloads_creator_check',
                    'c'::"char"
                ),
                (
                    'atomic_order_command_payloads_retention_check',
                    'c'::"char"
                ),
                (
                    'atomic_order_command_payloads_archive_check',
                    'c'::"char"
                )
        ) AS constraints(constraint_name, constraint_type)
    ),
    actual_constraints AS (
        SELECT
            constraint_state.conname::text AS constraint_name,
            constraint_state.contype AS constraint_type
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = payload_relation
    ),
    differences AS (
        (
            SELECT * FROM expected_constraints
            EXCEPT
            SELECT * FROM actual_constraints
        )
        UNION ALL
        (
            SELECT * FROM actual_constraints
            EXCEPT
            SELECT * FROM expected_constraints
        )
    )
    SELECT pg_catalog.array_agg(
        differences.constraint_name
        ORDER BY differences.constraint_name
    )
    INTO constraint_differences
    FROM differences;

    IF constraint_differences IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: constraint inventory mismatch',
            detail = pg_catalog.array_to_string(
                constraint_differences,
                ', '
            );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.oid = payload_relation
          AND relation_state.relacl IS NOT NULL
          AND (CASE
              WHEN pg_catalog.cardinality(relation_state.relacl) > 0
                   AND pg_catalog.array_ndims(relation_state.relacl)
                       IS DISTINCT FROM 1
                  THEN true
              WHEN pg_catalog.array_ndims(relation_state.relacl) = 1
                  THEN pg_catalog.array_position(
                      relation_state.relacl,
                      NULL::aclitem
                  ) IS NOT NULL
              ELSE false
          END)
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: malformed table ACL array';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = payload_relation
          AND constraint_state.convalidated
    ) <> 11
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_constraint AS constraint_state
           WHERE constraint_state.conrelid = payload_relation
             AND constraint_state.conname =
                 'atomic_order_command_payloads_command_fk'
             AND constraint_state.confrelid = command_relation
             AND constraint_state.condeferrable
             AND constraint_state.condeferred
             AND constraint_state.confupdtype = 'r'
             AND constraint_state.confdeltype = 'r'
       ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: one-to-one FK behavior mismatch';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = payload_relation
          AND constraint_state.conname =
              'atomic_order_command_payloads_payload_contract_check'
          AND pg_catalog.pg_get_constraintdef(
                  constraint_state.oid,
                  true
              ) LIKE '%canonical_payload - ARRAY%'
          AND pg_catalog.pg_get_constraintdef(
                  constraint_state.oid,
                  true
              ) LIKE '%discount%'
          AND pg_catalog.pg_get_constraintdef(
                  constraint_state.oid,
                  true
              ) LIKE '%object%'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: exact root allowlist contract mismatch';
    END IF;

    WITH expected_indexes AS (
        SELECT *
        FROM (
            VALUES
                (
                    'atomic_order_command_payloads_pkey',
                    true,
                    true,
                    ARRAY['command_id']::text[],
                    NULL::text
                ),
                (
                    'atomic_order_command_payloads_fingerprint_idx',
                    false,
                    false,
                    ARRAY[
                        'request_fingerprint',
                        'command_id'
                    ]::text[],
                    NULL::text
                ),
                (
                    'atomic_order_command_payloads_retention_idx',
                    false,
                    false,
                    ARRAY[
                        'retain_until',
                        'command_id'
                    ]::text[],
                    '(archived_at IS NULL)'::text
                )
        ) AS indexes(
            index_name,
            unique_index,
            primary_index,
            key_columns,
            predicate
        )
    ),
    actual_indexes AS (
        SELECT
            index_relation.relname::text AS index_name,
            index_state.indisunique AS unique_index,
            index_state.indisprimary AS primary_index,
            (
                SELECT pg_catalog.array_agg(
                    attribute_state.attname::text
                    ORDER BY key_position.ordinality
                )
                FROM unnest(index_state.indkey::smallint[])
                     WITH ORDINALITY AS key_position(
                         attribute_number,
                         ordinality
                     )
                JOIN pg_catalog.pg_attribute AS attribute_state
                  ON attribute_state.attrelid =
                     index_state.indrelid
                 AND attribute_state.attnum =
                     key_position.attribute_number
                WHERE key_position.ordinality <=
                      index_state.indnkeyatts
            ) AS key_columns,
            pg_catalog.pg_get_expr(
                index_state.indpred,
                index_state.indrelid
            ) AS predicate
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_state.indexrelid
        WHERE index_state.indrelid = payload_relation
    ),
    differences AS (
        (
            SELECT * FROM expected_indexes
            EXCEPT
            SELECT * FROM actual_indexes
        )
        UNION ALL
        (
            SELECT * FROM actual_indexes
            EXCEPT
            SELECT * FROM expected_indexes
        )
    )
    SELECT pg_catalog.array_agg(
        differences.index_name
        ORDER BY differences.index_name
    )
    INTO index_differences
    FROM differences;

    IF index_differences IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: index contract mismatch',
            detail = pg_catalog.array_to_string(
                index_differences,
                ', '
            );
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_policy AS policy_state
        WHERE policy_state.polrelid = payload_relation
          AND policy_state.polname =
              'atomic_order_command_payloads_function_owner_all'
          AND policy_state.polcmd = '*'
          AND policy_state.polpermissive
          AND policy_state.polroles =
              ARRAY[function_owner_oid]::oid[]
          AND pg_catalog.pg_get_expr(
                  policy_state.polqual,
                  policy_state.polrelid
              ) = 'true'
          AND pg_catalog.pg_get_expr(
                  policy_state.polwithcheck,
                  policy_state.polrelid
              ) = 'true'
    ) <> 1
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_policy AS policy_state
           WHERE policy_state.polrelid = payload_relation
       ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: policy contract mismatch';
    END IF;

    IF NOT pg_catalog.has_table_privilege(
        'afex_function_owner',
        payload_relation,
        'SELECT'
    )
       OR NOT pg_catalog.has_table_privilege(
           'afex_function_owner',
           payload_relation,
           'INSERT'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           payload_relation,
           'UPDATE'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           payload_relation,
           'DELETE'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           payload_relation,
           'TRUNCATE'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           payload_relation,
           'REFERENCES'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           payload_relation,
           'TRIGGER'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: function-owner ACL mismatch';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_class AS relation_state
        CROSS JOIN LATERAL pg_catalog.unnest(
            relation_state.relacl
        ) AS acl_item(value)
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            ARRAY[acl_item.value]::aclitem[]
        ) AS acl_state
        WHERE relation_state.oid = payload_relation
          AND acl_state.grantee = function_owner_oid
          AND acl_state.privilege_type = ANY (
              ARRAY['SELECT', 'INSERT']::text[]
          )
          AND NOT acl_state.is_grantable
    ) <> 2
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_class AS relation_state
           CROSS JOIN LATERAL pg_catalog.unnest(
               relation_state.relacl
           ) AS acl_item(value)
           CROSS JOIN LATERAL pg_catalog.aclexplode(
               ARRAY[acl_item.value]::aclitem[]
           ) AS acl_state
           WHERE relation_state.oid = payload_relation
             AND acl_state.grantee = function_owner_oid
       ) <> 2 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: direct function-owner ACL mismatch';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        CROSS JOIN LATERAL pg_catalog.unnest(
            relation_state.relacl
        ) AS acl_item(value)
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            ARRAY[acl_item.value]::aclitem[]
        ) AS acl_state
        WHERE relation_state.oid = payload_relation
          AND acl_state.grantee NOT IN (
              core_owner_oid,
              function_owner_oid
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: unexpected direct ACL grantee';
    END IF;

    FOREACH forbidden_role IN ARRAY ARRAY[
        'anon',
        'authenticated',
        'service_role',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker'
    ]::text[]
    LOOP
        IF pg_catalog.has_table_privilege(
               forbidden_role,
               payload_relation,
               'SELECT'
           )
           OR pg_catalog.has_table_privilege(
               forbidden_role,
               payload_relation,
               'INSERT'
           )
           OR pg_catalog.has_table_privilege(
               forbidden_role,
               payload_relation,
               'UPDATE'
           )
           OR pg_catalog.has_table_privilege(
               forbidden_role,
               payload_relation,
               'DELETE'
           )
           OR pg_catalog.has_table_privilege(
               forbidden_role,
               payload_relation,
               'TRUNCATE'
           )
           OR pg_catalog.has_table_privilege(
               forbidden_role,
               payload_relation,
               'REFERENCES'
           )
           OR pg_catalog.has_table_privilege(
               forbidden_role,
               payload_relation,
               'TRIGGER'
           ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.19 attestation failed: forbidden effective privilege',
                detail = forbidden_role;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        CROSS JOIN LATERAL pg_catalog.unnest(
            relation_state.relacl
        ) AS acl_item(value)
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            ARRAY[acl_item.value]::aclitem[]
        ) AS acl_state
        WHERE relation_state.oid = payload_relation
          AND acl_state.grantee = 0
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: PUBLIC privilege exists';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger AS trigger_state
        WHERE trigger_state.tgrelid = payload_relation
          AND NOT trigger_state.tgisinternal
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: user trigger exists';
    END IF;

    RAISE NOTICE 'P2D19A_200_SCHEMA_SECURITY_CONTRACT_OK';
END
$attestation$;

DO $attestation$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.atomic_order_command_payloads AS payload_state
        LEFT JOIN public.atomic_order_commands AS command_state
          ON command_state.id = payload_state.command_id
        WHERE command_state.id IS NULL
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: orphan payload exists';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.atomic_order_commands AS command_state
        LEFT JOIN public.atomic_order_command_payloads AS payload_state
          ON payload_state.command_id = command_state.id
        WHERE payload_state.command_id IS NULL
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: command lacks immutable payload';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.atomic_order_command_payloads AS payload_state
        JOIN public.atomic_order_commands AS command_state
          ON command_state.id = payload_state.command_id
        WHERE payload_state.request_fingerprint IS DISTINCT FROM
              command_state.request_fingerprint
           OR payload_state.fingerprint_version IS DISTINCT FROM
              CASE command_state.fingerprint_version
                  WHEN 1 THEN 'order-request-fingerprint-v1'
                  ELSE NULL
              END
           OR payload_state.canonical_payload ->> 'payload_version'
              IS DISTINCT FROM payload_state.payload_version
           OR payload_state.canonical_payload ->> 'fingerprint_version'
              IS DISTINCT FROM payload_state.fingerprint_version
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: command-payload binding mismatch';
    END IF;

    RAISE NOTICE 'P2D19A_300_ONE_TO_ONE_DATA_CONTRACT_OK';
END
$attestation$;

SELECT
    owner_role.rolname AS owner_role,
    namespace_state.nspname AS schema_name,
    relation_state.relname AS relation_name,
    relation_state.relrowsecurity AS rls_enabled,
    relation_state.relforcerowsecurity AS force_rls_enabled
FROM pg_catalog.pg_class AS relation_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = relation_state.relowner
WHERE relation_state.oid =
      pg_catalog.to_regclass(
          'public.atomic_order_command_payloads'
      );

SELECT
    attribute_state.attnum AS ordinal_position,
    attribute_state.attname AS column_name,
    pg_catalog.format_type(
        attribute_state.atttypid,
        attribute_state.atttypmod
    ) AS data_type,
    attribute_state.attnotnull AS not_null,
    pg_catalog.pg_get_expr(
        default_state.adbin,
        default_state.adrelid
    ) AS default_expression
FROM pg_catalog.pg_attribute AS attribute_state
LEFT JOIN pg_catalog.pg_attrdef AS default_state
  ON default_state.adrelid = attribute_state.attrelid
 AND default_state.adnum = attribute_state.attnum
WHERE attribute_state.attrelid =
      pg_catalog.to_regclass(
          'public.atomic_order_command_payloads'
      )
  AND attribute_state.attnum > 0
  AND NOT attribute_state.attisdropped
ORDER BY attribute_state.attnum;

SELECT
    constraint_state.conname AS constraint_name,
    constraint_state.contype AS constraint_type,
    constraint_state.convalidated AS validated,
    constraint_state.condeferrable AS deferrable,
    constraint_state.condeferred AS initially_deferred,
    pg_catalog.pg_get_constraintdef(
        constraint_state.oid,
        true
    ) AS definition
FROM pg_catalog.pg_constraint AS constraint_state
WHERE constraint_state.conrelid =
      pg_catalog.to_regclass(
          'public.atomic_order_command_payloads'
      )
ORDER BY constraint_state.conname;

SELECT
    index_relation.relname AS index_name,
    index_state.indisunique AS unique_index,
    index_state.indisprimary AS primary_index,
    pg_catalog.pg_get_indexdef(index_state.indexrelid) AS definition
FROM pg_catalog.pg_index AS index_state
JOIN pg_catalog.pg_class AS index_relation
  ON index_relation.oid = index_state.indexrelid
WHERE index_state.indrelid =
      pg_catalog.to_regclass(
          'public.atomic_order_command_payloads'
      )
ORDER BY index_relation.relname;

SELECT
    policy_state.polname AS policy_name,
    policy_state.polcmd AS command_scope,
    policy_state.polpermissive AS permissive,
    (
        SELECT pg_catalog.array_agg(
            role_state.rolname
            ORDER BY role_state.rolname
        )
        FROM unnest(policy_state.polroles) AS policy_role(role_oid)
        JOIN pg_catalog.pg_roles AS role_state
          ON role_state.oid = policy_role.role_oid
    ) AS policy_roles,
    pg_catalog.pg_get_expr(
        policy_state.polqual,
        policy_state.polrelid
    ) AS using_expression,
    pg_catalog.pg_get_expr(
        policy_state.polwithcheck,
        policy_state.polrelid
    ) AS check_expression
FROM pg_catalog.pg_policy AS policy_state
WHERE policy_state.polrelid =
      pg_catalog.to_regclass(
          'public.atomic_order_command_payloads'
      )
ORDER BY policy_state.polname;

SELECT
    acl_state.grantor::regrole::text AS grantor,
    CASE acl_state.grantee
        WHEN 0 THEN 'PUBLIC'
        ELSE acl_state.grantee::regrole::text
    END AS grantee,
    acl_state.privilege_type,
    acl_state.is_grantable
FROM pg_catalog.pg_class AS relation_state
CROSS JOIN LATERAL pg_catalog.unnest(
    relation_state.relacl
) AS acl_item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(
    ARRAY[acl_item.value]::aclitem[]
) AS acl_state
WHERE relation_state.oid =
      pg_catalog.to_regclass(
          'public.atomic_order_command_payloads'
      )
ORDER BY grantee, acl_state.privilege_type;

SELECT
    (
        SELECT pg_catalog.count(*)
        FROM public.atomic_order_commands
    ) AS command_count,
    (
        SELECT pg_catalog.count(*)
        FROM public.atomic_order_command_payloads
    ) AS payload_count,
    (
        SELECT pg_catalog.count(*)
        FROM public.atomic_order_commands AS command_state
        JOIN public.atomic_order_command_payloads AS payload_state
          ON payload_state.command_id = command_state.id
    ) AS bound_pair_count;

DO $attestation$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('afex_core_owner'::text)
        ) AS expected(role_name)
        JOIN pg_catalog.pg_roles AS target_role
          ON target_role.rolname = expected.role_name
        CROSS JOIN pg_catalog.pg_roles AS installer
        CROSS JOIN pg_catalog.pg_roles AS baseline_grantor
        WHERE installer.rolname = 'postgres'
          AND baseline_grantor.rolname = 'supabase_admin'
          AND (
              (
                  SELECT pg_catalog.count(*)
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target_role.oid
                    AND membership.member = installer.oid
              ) <> 1
              OR (
                  SELECT pg_catalog.count(*)
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target_role.oid
                     OR membership.member = target_role.oid
              ) <> 1
              OR NOT EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target_role.oid
                    AND membership.member = installer.oid
                    AND membership.grantor = baseline_grantor.oid
                    AND membership.admin_option
                    AND NOT membership.inherit_option
                    AND NOT membership.set_option
              )
              OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target_role.oid
                    AND membership.member = installer.oid
                    AND membership.grantor = installer.oid
              )
              OR pg_catalog.has_schema_privilege(
                  expected.role_name, 'public', 'CREATE'
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
                    AND acl_state.grantee = target_role.oid
              )
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 attestation failed: bootstrap authority residue exists';
    END IF;

    RAISE NOTICE 'P2D19A_900_POST_INSTALL_ATTESTATION_OK';
END
$attestation$;

SELECT
    'PASS'::text AS attestation_result,
    'P2D19A_900_POST_INSTALL_ATTESTATION_OK'::text AS final_marker,
    'atomic_order_command_payloads'::text AS verified_relation;

ROLLBACK;

-- END OF P2D.19 READ-ONLY POST-INSTALL ATTESTATION
