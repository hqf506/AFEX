-- AFEX Core V2 P2D.16 - Read-Only Post-Install Production Attestation
-- Source contract: P2D.15-FRESH.sql
-- This artifact verifies committed state only. It performs no repair.

DO $attestation$
BEGIN
    RAISE NOTICE 'P2D16_000_BEGIN';
END
$attestation$;

DO $attestation$
BEGIN
    IF CURRENT_USER IS NULL
       OR pg_catalog.current_database() IS NULL
       OR pg_catalog.current_setting('server_version_num')::integer < 180000 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 server identity contract mismatch';
    END IF;

    RAISE NOTICE 'P2D16_100_SERVER_IDENTITY_OK';
END
$attestation$;

DO $attestation$
DECLARE
    target_role_oids oid[];
    invalid_role_count integer;
BEGIN
    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_authid AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    IF pg_catalog.cardinality(target_role_oids) <> 5 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 role contract mismatch',
            detail = 'Expected exactly five Core V2 roles';
    END IF;

    SELECT pg_catalog.count(*)
    INTO invalid_role_count
    FROM pg_catalog.pg_authid AS role_state
    WHERE role_state.oid = ANY (target_role_oids)
      AND (
          role_state.rolcanlogin
          OR role_state.rolinherit
          OR role_state.rolsuper
          OR role_state.rolcreatedb
          OR role_state.rolcreaterole
          OR role_state.rolreplication
          OR role_state.rolbypassrls
          OR role_state.rolpassword IS NOT NULL
      );

    IF invalid_role_count <> 0 OR EXISTS (
        SELECT 1
        FROM unnest(target_role_oids) AS target_role(role_oid)
        WHERE (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_db_role_setting AS setting_state
            WHERE setting_state.setrole = target_role.role_oid
              AND setting_state.setdatabase = 0
              AND setting_state.setconfig =
                  ARRAY['search_path=pg_catalog, public']::text[]
        ) <> 1
           OR EXISTS (
               SELECT 1
               FROM pg_catalog.pg_db_role_setting AS setting_state
               WHERE setting_state.setrole = target_role.role_oid
                 AND setting_state.setdatabase <> 0
           )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 role attribute or configuration contract mismatch';
    END IF;

    RAISE NOTICE 'P2D16_200_ROLE_CONTRACT_OK';
END
$attestation$;

DO $attestation$
DECLARE
    installation_role_oid oid;
    target_role_oids oid[];
    automatic_grantor_oid oid;
    automatic_grantor_count integer;
BEGIN
    SELECT role_state.oid
    INTO installation_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = CURRENT_USER;

    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    SELECT
        (pg_catalog.array_agg(
            DISTINCT membership.grantor
            ORDER BY membership.grantor
        ))[1],
        pg_catalog.count(DISTINCT membership.grantor)
    INTO automatic_grantor_oid, automatic_grantor_count
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
      AND membership.member = installation_role_oid
      AND membership.grantor <> installation_role_oid
      AND membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option;

    IF installation_role_oid IS NULL
       OR pg_catalog.cardinality(target_role_oids) <> 5
       OR automatic_grantor_oid IS NULL
       OR automatic_grantor_count <> 1
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
               OR membership.member = ANY (target_role_oids)
       ) <> 5
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 5
       OR EXISTS (
            SELECT 1
            FROM unnest(target_role_oids) AS target_role(role_oid)
            WHERE (
                SELECT pg_catalog.count(*)
                FROM pg_catalog.pg_auth_members AS membership
                WHERE membership.roleid = target_role.role_oid
                  AND membership.member = installation_role_oid
            ) <> 1
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.member = ANY (target_role_oids)
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
              AND membership.grantor = installation_role_oid
       )
       OR EXISTS (
            SELECT 1
            FROM unnest(target_role_oids) AS target_role(role_oid)
            WHERE pg_catalog.pg_has_role(
                installation_role_oid,
                target_role.role_oid,
                'SET'
            )
               OR pg_catalog.pg_has_role(
                installation_role_oid,
                target_role.role_oid,
                'USAGE'
            )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 automatic membership contract mismatch';
    END IF;

    RAISE NOTICE 'P2D16_300_MEMBERSHIP_CONTRACT_OK';
END
$attestation$;

DO $attestation$
DECLARE
    core_owner_oid oid;
    target_role_oids oid[];
    public_schema_oid oid;
BEGIN
    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    SELECT namespace_state.oid
    INTO public_schema_oid
    FROM pg_catalog.pg_namespace AS namespace_state
    WHERE namespace_state.nspname = 'public';

    IF public_schema_oid IS NULL
       OR pg_catalog.has_schema_privilege(
            core_owner_oid,
            public_schema_oid,
            'CREATE'
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(
                        (
                            SELECT namespace_state.nspacl
                            FROM pg_catalog.pg_namespace AS namespace_state
                            WHERE namespace_state.oid = public_schema_oid
                        )
                    ) = 1 THEN (
                        SELECT namespace_state.nspacl
                        FROM pg_catalog.pg_namespace AS namespace_state
                        WHERE namespace_state.oid = public_schema_oid
                    )
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee = ANY (target_role_oids)
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 public schema privilege contract mismatch';
    END IF;

    RAISE NOTICE 'P2D16_400_SCHEMA_PRIVILEGE_CONTRACT_OK';
END
$attestation$;

DO $attestation$
DECLARE
    context_relation oid;
    failure_count integer;
BEGIN
    SELECT relation_state.oid
    INTO context_relation
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_state.relowner
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname = 'atomic_authorization_contexts'
      AND relation_state.relkind = 'r'
      AND owner_role.rolname = 'afex_core_owner'
      AND relation_state.relrowsecurity
      AND relation_state.relforcerowsecurity;

    IF context_relation IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 authorization context relation contract mismatch';
    END IF;

    SELECT pg_catalog.count(*)
    INTO failure_count
    FROM (
        VALUES
            (1, 'id', 'uuid', true, NULL::text),
            (2, 'context_version', 'smallint', true, NULL::text),
            (3, 'authenticated_actor_id', 'uuid', true, NULL::text),
            (4, 'tenant_id', 'uuid', true, NULL::text),
            (5, 'branch_id', 'uuid', true, NULL::text),
            (6, 'role_snapshot', 'text', true, NULL::text),
            (7, 'capability_version', 'bigint', true, NULL::text),
            (8, 'employee_source', 'text', true, NULL::text),
            (9, 'employee_source_id', 'uuid', false, NULL::text),
            (10, 'command_type', 'text', true, NULL::text),
            (11, 'idempotency_key_hash', 'bytea', true, NULL::text),
            (12, 'request_fingerprint', 'bytea', true, NULL::text),
            (13, 'fingerprint_version', 'smallint', true, NULL::text),
            (14, 'reference_hash', 'bytea', true, NULL::text),
            (15, 'correlation_reference', 'text', true, NULL::text),
            (
                16,
                'issued_at',
                'timestamp with time zone',
                true,
                'transaction_timestamp()'
            ),
            (17, 'expires_at', 'timestamp with time zone', true, NULL::text),
            (18, 'revoked_at', 'timestamp with time zone', false, NULL::text),
            (19, 'revocation_code', 'text', false, NULL::text),
            (20, 'consumed_at', 'timestamp with time zone', false, NULL::text),
            (21, 'consumed_command_id', 'uuid', false, NULL::text),
            (22, 'consumption_kind', 'text', false, NULL::text),
            (23, 'created_by_identity', 'text', true, NULL::text)
    ) AS expected_column(
        ordinal_position,
        column_name,
        formatted_type,
        required_not_null,
        default_expression
    )
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        LEFT JOIN pg_catalog.pg_attrdef AS default_state
          ON default_state.adrelid = attribute_state.attrelid
         AND default_state.adnum = attribute_state.attnum
        WHERE attribute_state.attrelid = context_relation
          AND attribute_state.attnum = expected_column.ordinal_position
          AND attribute_state.attname::text = expected_column.column_name
          AND NOT attribute_state.attisdropped
          AND pg_catalog.format_type(
              attribute_state.atttypid,
              attribute_state.atttypmod
          ) = expected_column.formatted_type
          AND attribute_state.attnotnull =
              expected_column.required_not_null
          AND pg_catalog.pg_get_expr(
              default_state.adbin,
              default_state.adrelid
          ) IS NOT DISTINCT FROM expected_column.default_expression
    );

    IF failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid = context_relation
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
    ) <> 23 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 authorization context column contract mismatch',
            detail = pg_catalog.format('Invalid expected columns: %s', failure_count);
    END IF;

    SELECT pg_catalog.count(*)
    INTO failure_count
    FROM (
        VALUES
            ('atomic_authorization_contexts_pkey', 'p'::"char"),
            ('atomic_authorization_contexts_reference_hash_key', 'u'::"char"),
            ('atomic_authorization_contexts_actor_fk', 'f'::"char"),
            ('atomic_authorization_contexts_tenant_fk', 'f'::"char"),
            ('atomic_authorization_contexts_branch_fk', 'f'::"char"),
            ('atomic_authorization_contexts_consumed_command_fk', 'f'::"char"),
            ('atomic_authorization_contexts_context_version_check', 'c'::"char"),
            ('atomic_authorization_contexts_command_type_check', 'c'::"char"),
            ('atomic_authorization_contexts_role_snapshot_check', 'c'::"char"),
            ('atomic_authorization_contexts_capability_version_check', 'c'::"char"),
            ('atomic_authorization_contexts_employee_source_check', 'c'::"char"),
            ('atomic_authorization_contexts_employee_identity_check', 'c'::"char"),
            ('atomic_authorization_contexts_idempotency_hash_check', 'c'::"char"),
            ('atomic_authorization_contexts_request_fingerprint_check', 'c'::"char"),
            ('atomic_authorization_contexts_fingerprint_version_check', 'c'::"char"),
            ('atomic_authorization_contexts_reference_hash_check', 'c'::"char"),
            ('atomic_authorization_contexts_correlation_reference_check', 'c'::"char"),
            ('atomic_authorization_contexts_created_by_identity_check', 'c'::"char"),
            ('atomic_authorization_contexts_ttl_check', 'c'::"char"),
            ('atomic_authorization_contexts_revocation_check', 'c'::"char"),
            ('atomic_authorization_contexts_consumption_check', 'c'::"char"),
            ('atomic_authorization_contexts_terminal_state_check', 'c'::"char")
    ) AS expected_constraint(constraint_name, constraint_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = context_relation
          AND constraint_state.conname = expected_constraint.constraint_name
          AND constraint_state.contype = expected_constraint.constraint_type
          AND constraint_state.convalidated
    );

    IF failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = context_relation
    ) <> 22 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 authorization context constraint contract mismatch',
            detail = pg_catalog.format('Invalid expected constraints: %s', failure_count);
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = context_relation
          AND constraint_state.conname =
              'atomic_authorization_contexts_consumed_command_fk'
          AND constraint_state.contype = 'f'
          AND constraint_state.confrelid =
              pg_catalog.to_regclass('public.atomic_order_commands')
          AND constraint_state.condeferrable
          AND constraint_state.condeferred
          AND constraint_state.confupdtype = 'r'
          AND constraint_state.confdeltype = 'r'
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 authorization context cross-link contract mismatch';
    END IF;

    SELECT pg_catalog.count(*)
    INTO failure_count
    FROM (
        VALUES
            (
                'atomic_authorization_contexts_pkey',
                ARRAY['id']::text[],
                true,
                true,
                NULL::text
            ),
            (
                'atomic_authorization_contexts_reference_hash_key',
                ARRAY['reference_hash']::text[],
                true,
                false,
                NULL::text
            ),
            (
                'atomic_authorization_contexts_expiry_idx',
                ARRAY['expires_at', 'id']::text[],
                false,
                false,
                '((consumed_at IS NULL) AND (revoked_at IS NULL))'
            ),
            (
                'atomic_authorization_contexts_actor_scope_idx',
                ARRAY[
                    'authenticated_actor_id',
                    'tenant_id',
                    'branch_id',
                    'issued_at'
                ]::text[],
                false,
                false,
                NULL::text
            ),
            (
                'atomic_authorization_contexts_employee_identity_idx',
                ARRAY[
                    'tenant_id',
                    'branch_id',
                    'employee_source',
                    'employee_source_id'
                ]::text[],
                false,
                false,
                '(employee_source_id IS NOT NULL)'
            ),
            (
                'atomic_authorization_contexts_consumed_command_idx',
                ARRAY['consumed_command_id']::text[],
                false,
                false,
                '(consumed_command_id IS NOT NULL)'
            ),
            (
                'atomic_authorization_contexts_execution_command_uidx',
                ARRAY['consumed_command_id']::text[],
                true,
                false,
                '(consumption_kind = ''execution''::text)'
            )
    ) AS expected_index(
        index_name,
        key_columns,
        is_unique,
        is_primary,
        predicate_expression
    )
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_state.indexrelid
        WHERE index_state.indrelid = context_relation
          AND index_relation.relname = expected_index.index_name
          AND index_state.indisunique = expected_index.is_unique
          AND index_state.indisprimary = expected_index.is_primary
          AND index_state.indisvalid
          AND index_state.indisready
          AND index_state.indislive
          AND (
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
                ON attribute_state.attrelid = index_state.indrelid
               AND attribute_state.attnum = key_position.attribute_number
              WHERE key_position.ordinality <= index_state.indnkeyatts
          ) = expected_index.key_columns
          AND pg_catalog.pg_get_expr(
              index_state.indpred,
              index_state.indrelid
          ) IS NOT DISTINCT FROM expected_index.predicate_expression
    );

    IF failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_index AS index_state
        WHERE index_state.indrelid = context_relation
    ) <> 7 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 authorization context index contract mismatch',
            detail = pg_catalog.format('Invalid expected indexes: %s', failure_count);
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.atomic_authorization_contexts
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 authorization context table is not empty';
    END IF;

    RAISE NOTICE 'P2D16_500_CONTEXT_TABLE_CONTRACT_OK';
END
$attestation$;

DO $attestation$
DECLARE
    command_relation oid;
    context_relation oid;
    failure_count integer;
BEGIN
    SELECT relation_state.oid
    INTO command_relation
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_state.relowner
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname = 'atomic_order_commands'
      AND relation_state.relkind = 'r'
      AND owner_role.rolname = 'afex_core_owner'
      AND relation_state.relrowsecurity
      AND relation_state.relforcerowsecurity;

    context_relation :=
        pg_catalog.to_regclass('public.atomic_authorization_contexts');

    IF command_relation IS NULL OR context_relation IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 atomic command relation contract mismatch';
    END IF;

    SELECT pg_catalog.count(*)
    INTO failure_count
    FROM (
        VALUES
            (1, 'id', 'uuid', true, NULL::text),
            (2, 'command_version', 'smallint', true, NULL::text),
            (3, 'command_type', 'text', true, NULL::text),
            (4, 'tenant_id', 'uuid', true, NULL::text),
            (5, 'branch_id', 'uuid', true, NULL::text),
            (6, 'idempotency_key_hash', 'bytea', true, NULL::text),
            (7, 'request_fingerprint', 'bytea', true, NULL::text),
            (8, 'fingerprint_version', 'smallint', true, NULL::text),
            (9, 'authorization_context_id', 'uuid', true, NULL::text),
            (10, 'authenticated_actor_id', 'uuid', true, NULL::text),
            (11, 'correlation_reference', 'text', true, NULL::text),
            (12, 'engine_version', 'smallint', true, NULL::text),
            (13, 'execution_status', 'text', true, NULL::text),
            (14, 'lease_owner', 'uuid', false, NULL::text),
            (
                15,
                'lease_expires_at',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            (16, 'attempt_count', 'integer', true, '0'),
            (17, 'order_id', 'uuid', false, NULL::text),
            (18, 'invoice_id', 'uuid', false, NULL::text),
            (19, 'order_number', 'text', false, NULL::text),
            (20, 'response_version', 'text', false, NULL::text),
            (21, 'response_snapshot', 'jsonb', false, NULL::text),
            (22, 'error_code', 'text', false, NULL::text),
            (23, 'error_detail', 'text', false, NULL::text),
            (24, 'last_failure_stage', 'text', false, NULL::text),
            (
                25,
                'first_started_at',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            (
                26,
                'last_started_at',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            (
                27,
                'completed_at',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            (28, 'failed_at', 'timestamp with time zone', false, NULL::text),
            (
                29,
                'created_at',
                'timestamp with time zone',
                true,
                'transaction_timestamp()'
            ),
            (
                30,
                'updated_at',
                'timestamp with time zone',
                true,
                'transaction_timestamp()'
            ),
            (31, 'created_by_identity', 'text', true, NULL::text),
            (
                32,
                'command_retain_until',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            (
                33,
                'response_retain_until',
                'timestamp with time zone',
                false,
                NULL::text
            )
    ) AS expected_column(
        ordinal_position,
        column_name,
        formatted_type,
        required_not_null,
        default_expression
    )
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        LEFT JOIN pg_catalog.pg_attrdef AS default_state
          ON default_state.adrelid = attribute_state.attrelid
         AND default_state.adnum = attribute_state.attnum
        WHERE attribute_state.attrelid = command_relation
          AND attribute_state.attnum = expected_column.ordinal_position
          AND attribute_state.attname::text = expected_column.column_name
          AND NOT attribute_state.attisdropped
          AND pg_catalog.format_type(
              attribute_state.atttypid,
              attribute_state.atttypmod
          ) = expected_column.formatted_type
          AND attribute_state.attnotnull =
              expected_column.required_not_null
          AND pg_catalog.pg_get_expr(
              default_state.adbin,
              default_state.adrelid
          ) IS NOT DISTINCT FROM expected_column.default_expression
    );

    IF failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid = command_relation
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
    ) <> 33 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 atomic command column contract mismatch',
            detail = pg_catalog.format('Invalid expected columns: %s', failure_count);
    END IF;

    SELECT pg_catalog.count(*)
    INTO failure_count
    FROM (
        VALUES
            ('atomic_order_commands_pkey', 'p'::"char"),
            ('atomic_order_commands_scoped_idempotency_key', 'u'::"char"),
            ('atomic_order_commands_authorization_context_key', 'u'::"char"),
            ('atomic_order_commands_tenant_fk', 'f'::"char"),
            ('atomic_order_commands_branch_fk', 'f'::"char"),
            ('atomic_order_commands_actor_fk', 'f'::"char"),
            ('atomic_order_commands_authorization_context_fk', 'f'::"char"),
            ('atomic_order_commands_order_fk', 'f'::"char"),
            ('atomic_order_commands_invoice_fk', 'f'::"char"),
            ('atomic_order_commands_command_version_check', 'c'::"char"),
            ('atomic_order_commands_command_type_check', 'c'::"char"),
            ('atomic_order_commands_idempotency_hash_check', 'c'::"char"),
            ('atomic_order_commands_request_fingerprint_check', 'c'::"char"),
            ('atomic_order_commands_fingerprint_version_check', 'c'::"char"),
            ('atomic_order_commands_engine_version_check', 'c'::"char"),
            ('atomic_order_commands_execution_status_check', 'c'::"char"),
            ('atomic_order_commands_correlation_reference_check', 'c'::"char"),
            ('atomic_order_commands_created_by_identity_check', 'c'::"char"),
            ('atomic_order_commands_attempt_count_check', 'c'::"char"),
            ('atomic_order_commands_response_snapshot_check', 'c'::"char"),
            ('atomic_order_commands_response_version_check', 'c'::"char"),
            ('atomic_order_commands_order_number_check', 'c'::"char"),
            ('atomic_order_commands_error_code_check', 'c'::"char"),
            ('atomic_order_commands_error_detail_check', 'c'::"char"),
            ('atomic_order_commands_last_failure_stage_check', 'c'::"char"),
            ('atomic_order_commands_command_retention_check', 'c'::"char"),
            ('atomic_order_commands_response_retention_check', 'c'::"char"),
            ('atomic_order_commands_retention_order_check', 'c'::"char"),
            ('atomic_order_commands_last_started_at_check', 'c'::"char"),
            ('atomic_order_commands_completed_at_check', 'c'::"char"),
            ('atomic_order_commands_failed_at_check', 'c'::"char"),
            ('atomic_order_commands_lease_expiry_check', 'c'::"char"),
            ('atomic_order_commands_reserved_state_check', 'c'::"char"),
            ('atomic_order_commands_processing_state_check', 'c'::"char"),
            ('atomic_order_commands_succeeded_state_check', 'c'::"char"),
            ('atomic_order_commands_failed_retryable_state_check', 'c'::"char"),
            ('atomic_order_commands_failed_final_state_check', 'c'::"char"),
            ('atomic_order_commands_updated_at_check', 'c'::"char")
    ) AS expected_constraint(constraint_name, constraint_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
          AND constraint_state.conname = expected_constraint.constraint_name
          AND constraint_state.contype = expected_constraint.constraint_type
          AND constraint_state.convalidated
    );

    IF failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
    ) <> 38 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
          AND constraint_state.contype = 'f'
    ) <> 6 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 atomic command constraint contract mismatch',
            detail = pg_catalog.format('Invalid expected constraints: %s', failure_count);
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
          AND constraint_state.conname =
              'atomic_order_commands_authorization_context_fk'
          AND constraint_state.confrelid = context_relation
          AND constraint_state.condeferrable
          AND constraint_state.condeferred
          AND constraint_state.confupdtype = 'r'
          AND constraint_state.confdeltype = 'r'
    ) <> 1 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
          AND constraint_state.conname = 'atomic_order_commands_order_fk'
          AND constraint_state.confrelid =
              pg_catalog.to_regclass('public.orders')
          AND constraint_state.confupdtype = 'r'
          AND constraint_state.confdeltype = 'r'
    ) <> 1 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
          AND constraint_state.conname = 'atomic_order_commands_invoice_fk'
          AND constraint_state.confrelid =
              pg_catalog.to_regclass('public.invoices')
          AND constraint_state.confupdtype = 'r'
          AND constraint_state.confdeltype = 'r'
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 atomic command foreign-key contract mismatch';
    END IF;

    SELECT pg_catalog.count(*)
    INTO failure_count
    FROM (
        VALUES
            (
                'atomic_order_commands_pkey',
                ARRAY['id']::text[],
                true,
                true,
                NULL::text
            ),
            (
                'atomic_order_commands_scoped_idempotency_key',
                ARRAY[
                    'tenant_id',
                    'branch_id',
                    'command_type',
                    'idempotency_key_hash'
                ]::text[],
                true,
                false,
                NULL::text
            ),
            (
                'atomic_order_commands_authorization_context_key',
                ARRAY['authorization_context_id']::text[],
                true,
                false,
                NULL::text
            ),
            (
                'atomic_order_commands_processing_lease_idx',
                ARRAY['execution_status', 'lease_expires_at', 'id']::text[],
                false,
                false,
                '(execution_status = ''processing''::text)'
            ),
            (
                'atomic_order_commands_retryable_recovery_idx',
                ARRAY['execution_status', 'failed_at', 'id']::text[],
                false,
                false,
                '(execution_status = ''failed_retryable''::text)'
            ),
            (
                'atomic_order_commands_tenant_branch_history_idx',
                ARRAY['tenant_id', 'branch_id', 'created_at', 'id']::text[],
                false,
                false,
                NULL::text
            ),
            (
                'atomic_order_commands_actor_history_idx',
                ARRAY['authenticated_actor_id', 'created_at', 'id']::text[],
                false,
                false,
                NULL::text
            ),
            (
                'atomic_order_commands_order_lookup_idx',
                ARRAY['order_id']::text[],
                false,
                false,
                '(order_id IS NOT NULL)'
            ),
            (
                'atomic_order_commands_invoice_lookup_idx',
                ARRAY['invoice_id']::text[],
                false,
                false,
                '(invoice_id IS NOT NULL)'
            ),
            (
                'atomic_order_commands_successful_completion_idx',
                ARRAY['completed_at', 'id']::text[],
                false,
                false,
                '(execution_status = ''succeeded''::text)'
            ),
            (
                'atomic_order_commands_command_retention_idx',
                ARRAY['command_retain_until', 'id']::text[],
                false,
                false,
                NULL::text
            ),
            (
                'atomic_order_commands_response_retention_idx',
                ARRAY['response_retain_until', 'id']::text[],
                false,
                false,
                '(response_retain_until IS NOT NULL)'
            )
    ) AS expected_index(
        index_name,
        key_columns,
        is_unique,
        is_primary,
        predicate_expression
    )
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_state.indexrelid
        WHERE index_state.indrelid = command_relation
          AND index_relation.relname = expected_index.index_name
          AND index_state.indisunique = expected_index.is_unique
          AND index_state.indisprimary = expected_index.is_primary
          AND index_state.indisvalid
          AND index_state.indisready
          AND index_state.indislive
          AND (
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
                ON attribute_state.attrelid = index_state.indrelid
               AND attribute_state.attnum = key_position.attribute_number
              WHERE key_position.ordinality <= index_state.indnkeyatts
          ) = expected_index.key_columns
          AND pg_catalog.pg_get_expr(
              index_state.indpred,
              index_state.indrelid
          ) IS NOT DISTINCT FROM expected_index.predicate_expression
    );

    IF failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_index AS index_state
        WHERE index_state.indrelid = command_relation
    ) <> 12 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 atomic command index contract mismatch',
            detail = pg_catalog.format('Invalid expected indexes: %s', failure_count);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_attribute AS attribute_state
          ON attribute_state.attrelid = index_state.indrelid
         AND attribute_state.attnum = index_state.indkey[0]
        WHERE index_state.indrelid = command_relation
          AND index_state.indisunique
          AND index_state.indnkeyatts = 1
          AND attribute_state.attname = 'idempotency_key_hash'
    ) OR EXISTS (
        SELECT 1 FROM public.atomic_order_commands
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 atomic command uniqueness or row-state mismatch';
    END IF;

    RAISE NOTICE 'P2D16_600_COMMAND_TABLE_CONTRACT_OK';
END
$attestation$;

DO $attestation$
DECLARE
    target_relation record;
    core_owner_oid oid;
    function_owner_oid oid;
    actual_privileges text[];
BEGIN
    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    FOR target_relation IN
        SELECT
            expected.table_name,
            expected.policy_name,
            relation_state.oid AS relation_oid,
            relation_state.relacl
        FROM (
            VALUES
                (
                    'atomic_authorization_contexts',
                    'atomic_authorization_contexts_function_owner_all'
                ),
                (
                    'atomic_order_commands',
                    'atomic_order_commands_function_owner_all'
                )
        ) AS expected(table_name, policy_name)
        JOIN pg_catalog.pg_class AS relation_state
          ON relation_state.oid =
             pg_catalog.to_regclass('public.' || expected.table_name)
    LOOP
        IF (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid = target_relation.relation_oid
              AND policy_state.polname = target_relation.policy_name
              AND policy_state.polcmd = '*'
              AND policy_state.polpermissive
              AND policy_state.polroles = ARRAY[function_owner_oid]::oid[]
              AND pg_catalog.pg_get_expr(
                  policy_state.polqual,
                  policy_state.polrelid
              ) = 'true'
              AND pg_catalog.pg_get_expr(
                  policy_state.polwithcheck,
                  policy_state.polrelid
              ) = 'true'
        ) <> 1 OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid = target_relation.relation_oid
        ) <> 1 THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.16 production policy contract mismatch',
                detail = 'public.' || target_relation.table_name;
        END IF;

        SELECT pg_catalog.array_agg(
            acl_state.privilege_type
            ORDER BY acl_state.privilege_type
        )
        INTO actual_privileges
        FROM pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(target_relation.relacl) = 1
                    THEN target_relation.relacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_state
        WHERE acl_state.grantee = function_owner_oid
          AND acl_state.grantor = core_owner_oid
          AND NOT acl_state.is_grantable;

        IF actual_privileges IS DISTINCT FROM
           ARRAY['INSERT', 'SELECT', 'UPDATE']::text[] THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.16 function-owner table ACL mismatch',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(target_relation.relacl) = 1
                        THEN target_relation.relacl
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee NOT IN (
                core_owner_oid,
                function_owner_oid
            )
               OR (
                   acl_state.grantee = function_owner_oid
                   AND (
                       acl_state.grantor <> core_owner_oid
                       OR acl_state.is_grantable
                       OR acl_state.privilege_type NOT IN (
                           'SELECT',
                           'INSERT',
                           'UPDATE'
                       )
                   )
               )
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.16 unexpected direct table ACL',
                detail = 'public.' || target_relation.table_name;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policy AS policy_state
        WHERE policy_state.polname IN (
            'atomic_authorization_contexts_owner_all',
            'atomic_order_commands_owner_all'
        )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 bootstrap policy residue exists';
    END IF;

    RAISE NOTICE 'P2D16_700_POLICY_ACL_CONTRACT_OK';
END
$attestation$;

DO $attestation$
DECLARE
    target_role_oids oid[];
    core_owner_oid oid;
    context_relation oid;
    command_relation oid;
BEGIN
    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    context_relation :=
        pg_catalog.to_regclass('public.atomic_authorization_contexts');
    command_relation :=
        pg_catalog.to_regclass('public.atomic_order_commands');

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_default_acl AS default_acl
        WHERE default_acl.defaclrole = ANY (target_role_oids)
           OR EXISTS (
               SELECT 1
               FROM pg_catalog.aclexplode(
                   CASE
                       WHEN pg_catalog.array_ndims(default_acl.defaclacl) = 1
                           THEN default_acl.defaclacl
                       ELSE NULL::pg_catalog.aclitem[]
                   END
               ) AS acl_state
               WHERE acl_state.grantee = ANY (target_role_oids)
           )
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS namespace_state
        WHERE namespace_state.nspowner = ANY (target_role_oids)
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS routine_state
        WHERE routine_state.proowner = ANY (target_role_oids)
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.relowner = ANY (target_role_oids)
          AND relation_state.oid NOT IN (
              context_relation,
              command_relation
          )
          AND relation_state.oid NOT IN (
              SELECT index_state.indexrelid
              FROM pg_catalog.pg_index AS index_state
              WHERE index_state.indrelid IN (
                  context_relation,
                  command_relation
              )
          )
          AND relation_state.oid NOT IN (
              SELECT table_state.reltoastrelid
              FROM pg_catalog.pg_class AS table_state
              WHERE table_state.oid IN (
                  context_relation,
                  command_relation
              )
                AND table_state.reltoastrelid <> 0
          )
          AND relation_state.oid NOT IN (
              SELECT toast_index.indexrelid
              FROM pg_catalog.pg_index AS toast_index
              WHERE toast_index.indrelid IN (
                  SELECT table_state.reltoastrelid
                  FROM pg_catalog.pg_class AS table_state
                  WHERE table_state.oid IN (
                      context_relation,
                      command_relation
                  )
                    AND table_state.reltoastrelid <> 0
              )
          )
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_type AS type_state
        WHERE type_state.typowner = ANY (target_role_oids)
          AND type_state.typrelid NOT IN (
              context_relation,
              command_relation
          )
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger AS trigger_state
        WHERE trigger_state.tgrelid IN (
            context_relation,
            command_relation
        )
          AND NOT trigger_state.tgisinternal
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 bootstrap residue or unexpected object contract mismatch';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.oid IN (context_relation, command_relation)
          AND relation_state.relowner = core_owner_oid
    ) <> 2 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.16 expected owner object contract mismatch';
    END IF;

    RAISE NOTICE 'P2D16_800_NO_BOOTSTRAP_RESIDUE_OK';
END
$attestation$;

SELECT
    CURRENT_USER AS installation_identity,
    pg_catalog.current_database() AS database_name,
    pg_catalog.current_setting('server_version') AS server_version,
    pg_catalog.current_setting('server_version_num') AS server_version_number;

SELECT
    role_state.rolname AS role_name,
    role_state.rolcanlogin AS can_login,
    role_state.rolinherit AS inherits,
    role_state.rolsuper AS superuser,
    role_state.rolcreatedb AS can_create_database,
    role_state.rolcreaterole AS can_create_role,
    role_state.rolreplication AS replication,
    role_state.rolbypassrls AS bypass_rls,
    role_state.rolpassword IS NULL AS password_is_null,
    setting_state.setconfig AS role_configuration
FROM pg_catalog.pg_authid AS role_state
LEFT JOIN pg_catalog.pg_db_role_setting AS setting_state
  ON setting_state.setrole = role_state.oid
 AND setting_state.setdatabase = 0
WHERE role_state.rolname = ANY (ARRAY[
    'afex_core_owner',
    'afex_core_runtime',
    'afex_context_issuer',
    'afex_outbox_worker',
    'afex_function_owner'
])
ORDER BY role_state.rolname;

SELECT
    granted_role.rolname AS granted_role,
    member_role.rolname AS member_role,
    grantor_role.rolname AS grantor_role,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS granted_role
  ON granted_role.oid = membership.roleid
JOIN pg_catalog.pg_roles AS member_role
  ON member_role.oid = membership.member
JOIN pg_catalog.pg_roles AS grantor_role
  ON grantor_role.oid = membership.grantor
WHERE granted_role.rolname = ANY (ARRAY[
    'afex_core_owner',
    'afex_core_runtime',
    'afex_context_issuer',
    'afex_outbox_worker',
    'afex_function_owner'
])
   OR member_role.rolname = ANY (ARRAY[
       'afex_core_owner',
       'afex_core_runtime',
       'afex_context_issuer',
       'afex_outbox_worker',
       'afex_function_owner'
   ])
ORDER BY granted_role.rolname, member_role.rolname, grantor_role.rolname;

SELECT
    namespace_state.nspname AS schema_name,
    grantee_role.rolname AS grantee,
    acl_state.privilege_type,
    acl_state.is_grantable
FROM pg_catalog.pg_namespace AS namespace_state
CROSS JOIN LATERAL pg_catalog.aclexplode(
    CASE
        WHEN pg_catalog.array_ndims(namespace_state.nspacl) = 1
            THEN namespace_state.nspacl
        ELSE NULL::pg_catalog.aclitem[]
    END
) AS acl_state
LEFT JOIN pg_catalog.pg_roles AS grantee_role
  ON grantee_role.oid = acl_state.grantee
WHERE namespace_state.nspname = 'public'
ORDER BY acl_state.grantee, acl_state.privilege_type;

SELECT
    relation_state.relname AS table_name,
    owner_role.rolname AS owner_role,
    relation_state.relrowsecurity AS rls_enabled,
    relation_state.relforcerowsecurity AS force_rls_enabled
FROM pg_catalog.pg_class AS relation_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = relation_state.relowner
WHERE namespace_state.nspname = 'public'
  AND relation_state.relname IN (
      'atomic_authorization_contexts',
      'atomic_order_commands'
  )
ORDER BY relation_state.relname;

SELECT
    relation_state.relname AS table_name,
    policy_state.polname AS policy_name,
    policy_state.polcmd AS command,
    policy_state.polpermissive AS permissive,
    policy_role.rolname AS policy_role,
    pg_catalog.pg_get_expr(
        policy_state.polqual,
        policy_state.polrelid
    ) AS using_expression,
    pg_catalog.pg_get_expr(
        policy_state.polwithcheck,
        policy_state.polrelid
    ) AS check_expression
FROM pg_catalog.pg_policy AS policy_state
JOIN pg_catalog.pg_class AS relation_state
  ON relation_state.oid = policy_state.polrelid
JOIN LATERAL unnest(policy_state.polroles)
     AS policy_role_oid(role_oid) ON true
JOIN pg_catalog.pg_roles AS policy_role
  ON policy_role.oid = policy_role_oid.role_oid
WHERE policy_state.polrelid IN (
    pg_catalog.to_regclass('public.atomic_authorization_contexts'),
    pg_catalog.to_regclass('public.atomic_order_commands')
)
ORDER BY relation_state.relname, policy_state.polname, policy_role.rolname;

SELECT
    relation_state.relname AS table_name,
    COALESCE(grantee_role.rolname, 'PUBLIC') AS grantee,
    grantor_role.rolname AS grantor,
    acl_state.privilege_type,
    acl_state.is_grantable
FROM pg_catalog.pg_class AS relation_state
CROSS JOIN LATERAL pg_catalog.aclexplode(
    CASE
        WHEN pg_catalog.array_ndims(relation_state.relacl) = 1
            THEN relation_state.relacl
        ELSE NULL::pg_catalog.aclitem[]
    END
) AS acl_state
LEFT JOIN pg_catalog.pg_roles AS grantee_role
  ON grantee_role.oid = acl_state.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role
  ON grantor_role.oid = acl_state.grantor
WHERE relation_state.oid IN (
    pg_catalog.to_regclass('public.atomic_authorization_contexts'),
    pg_catalog.to_regclass('public.atomic_order_commands')
)
ORDER BY relation_state.relname, acl_state.grantee, acl_state.privilege_type;

SELECT
    relation_state.relname AS table_name,
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
JOIN pg_catalog.pg_class AS relation_state
  ON relation_state.oid = constraint_state.conrelid
WHERE constraint_state.conrelid IN (
    pg_catalog.to_regclass('public.atomic_authorization_contexts'),
    pg_catalog.to_regclass('public.atomic_order_commands')
)
ORDER BY relation_state.relname, constraint_state.conname;

SELECT
    table_relation.relname AS table_name,
    index_relation.relname AS index_name,
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
          ON attribute_state.attrelid = index_state.indrelid
         AND attribute_state.attnum = key_position.attribute_number
        WHERE key_position.ordinality <= index_state.indnkeyatts
    ) AS key_columns,
    pg_catalog.pg_get_expr(
        index_state.indpred,
        index_state.indrelid
    ) AS predicate
FROM pg_catalog.pg_index AS index_state
JOIN pg_catalog.pg_class AS table_relation
  ON table_relation.oid = index_state.indrelid
JOIN pg_catalog.pg_class AS index_relation
  ON index_relation.oid = index_state.indexrelid
WHERE index_state.indrelid IN (
    pg_catalog.to_regclass('public.atomic_authorization_contexts'),
    pg_catalog.to_regclass('public.atomic_order_commands')
)
ORDER BY table_relation.relname, index_relation.relname;

SELECT
    'atomic_authorization_contexts'::text AS table_name,
    (
        SELECT pg_catalog.count(*)
        FROM public.atomic_authorization_contexts
    ) AS row_count
UNION ALL
SELECT
    'atomic_order_commands'::text,
    (
        SELECT pg_catalog.count(*)
        FROM public.atomic_order_commands
    )
ORDER BY table_name;

SELECT
    owner_role.rolname AS owner_role,
    namespace_state.nspname AS schema_name,
    relation_state.relname AS object_name,
    relation_state.relkind AS object_kind
FROM pg_catalog.pg_class AS relation_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = relation_state.relowner
WHERE owner_role.rolname = ANY (ARRAY[
    'afex_core_owner',
    'afex_core_runtime',
    'afex_context_issuer',
    'afex_outbox_worker',
    'afex_function_owner'
])
ORDER BY owner_role.rolname, namespace_state.nspname, relation_state.relname;

DO $attestation$
BEGIN
    RAISE NOTICE 'P2D16_900_POST_INSTALL_ATTESTATION_OK';
END
$attestation$;

SELECT
    'PASS'::text AS attestation_result,
    'P2D16_900_POST_INSTALL_ATTESTATION_OK'::text AS final_marker,
    5::integer AS verified_roles,
    2::integer AS verified_foundation_tables;

-- END OF P2D.16 READ-ONLY POST-INSTALL PRODUCTION ATTESTATION
