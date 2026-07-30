-- AFEX Core V2 P2D.19 - Durable Immutable Payload Storage
-- STATUS: DRAFT - NOT EXECUTED
-- Forward-only additive foundation for order-command payload evidence.
-- This artifact creates no acquisition, Runtime, Executor, replay, or business logic.
-- Normative contract: P2D.17 + P2D.18 + P2D.18A.
-- Nested validation and canonical-byte binding are installed by P2D.20;
-- this package establishes the closed immutable relation first.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_catalog.pg_advisory_xact_lock(219019001::bigint);

DO $bootstrap_preflight$
DECLARE
    installer_oid oid;
    core_owner_oid oid;
    supabase_admin_oid oid;
BEGIN
    IF CURRENT_USER IS DISTINCT FROM 'postgres'
       OR SESSION_USER IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'P2D.19 bootstrap failed: installer identity must be postgres';
    END IF;

    SELECT oid INTO installer_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres' AND rolcanlogin AND rolcreaterole;
    SELECT oid INTO core_owner_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_owner' AND NOT rolcanlogin;
    SELECT oid INTO supabase_admin_oid
    FROM pg_catalog.pg_roles
    WHERE rolname = 'supabase_admin';

    IF installer_oid IS NULL
       OR core_owner_oid IS NULL
       OR supabase_admin_oid IS NULL
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
             AND membership.member = installer_oid
       ) <> 1
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
              OR membership.member = core_owner_oid
       ) <> 1
       OR NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
             AND membership.member = installer_oid
             AND membership.grantor = supabase_admin_oid
             AND membership.admin_option
             AND NOT membership.inherit_option
             AND NOT membership.set_option
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
             AND membership.member = installer_oid
             AND membership.grantor = installer_oid
       )
       OR pg_catalog.has_schema_privilege(
           'afex_core_owner', 'public', 'CREATE'
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
             AND acl_state.grantee = core_owner_oid
       )
       OR NOT pg_catalog.has_schema_privilege(
           CURRENT_USER, 'public', 'CREATE WITH GRANT OPTION'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 bootstrap failed: frozen before-state mismatch';
    END IF;
END
$bootstrap_preflight$;

GRANT afex_core_owner TO postgres
    WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
    GRANTED BY postgres;

DO $temporary_membership_verification$
DECLARE
    installer_oid oid;
    core_owner_oid oid;
    supabase_admin_oid oid;
BEGIN
    SELECT oid INTO installer_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres';
    SELECT oid INTO core_owner_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_owner';
    SELECT oid INTO supabase_admin_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'supabase_admin';

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.roleid = core_owner_oid
          AND membership.member = installer_oid
    ) <> 2
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
              OR membership.member = core_owner_oid
       ) <> 2
       OR NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
             AND membership.member = installer_oid
             AND membership.grantor = supabase_admin_oid
             AND membership.admin_option
             AND NOT membership.inherit_option
             AND NOT membership.set_option
       )
       OR NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
             AND membership.member = installer_oid
             AND membership.grantor = installer_oid
             AND NOT membership.admin_option
             AND NOT membership.inherit_option
             AND membership.set_option
       )
       OR NOT pg_catalog.pg_has_role(
           CURRENT_USER, 'afex_core_owner', 'SET'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 bootstrap failed: temporary membership mismatch';
    END IF;
END
$temporary_membership_verification$;

GRANT CREATE ON SCHEMA public TO afex_core_owner;

DO $temporary_schema_verification$
BEGIN
    IF NOT pg_catalog.has_schema_privilege(
        'afex_core_owner', 'public', 'CREATE'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 bootstrap failed: temporary schema CREATE missing';
    END IF;
END
$temporary_schema_verification$;

DO $preflight$
DECLARE
    command_relation oid;
    command_owner text;
    function_owner_oid oid;
    missing_roles text[];
BEGIN
    IF pg_catalog.current_setting('server_version_num')::integer <> 170006 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 requires exact approved PostgreSQL 17.6 (170006)';
    END IF;

    IF pg_catalog.current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 preflight failed: server encoding must be UTF8';
    END IF;

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
            message = 'P2D.19 preflight failed: required roles are missing',
            detail = pg_catalog.array_to_string(missing_roles, ', ');
    END IF;

    command_relation :=
        pg_catalog.to_regclass('public.atomic_order_commands');

    IF command_relation IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 preflight failed: command Foundation is absent';
    END IF;

    SELECT owner_role.rolname
    INTO command_owner
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = relation_state.relowner
    WHERE relation_state.oid = command_relation;

    IF command_owner IS DISTINCT FROM 'afex_core_owner'
       OR NOT (
           SELECT relation_state.relrowsecurity
                  AND relation_state.relforcerowsecurity
           FROM pg_catalog.pg_class AS relation_state
           WHERE relation_state.oid = command_relation
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 preflight failed: command Foundation security mismatch';
    END IF;

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_policy AS policy_state
        WHERE policy_state.polrelid = command_relation
          AND policy_state.polname =
              'atomic_order_commands_function_owner_all'
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
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 preflight failed: command RLS policy mismatch';
    END IF;

    IF pg_catalog.to_regclass(
           'public.atomic_order_command_payloads'
       ) IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 preflight failed: payload relation already exists';
    END IF;

    IF NOT pg_catalog.has_schema_privilege(
        CURRENT_USER,
        'public',
        'CREATE'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'P2D.19 preflight failed: installer lacks public schema CREATE';
    END IF;

    IF NOT pg_catalog.pg_has_role(
        CURRENT_USER,
        'afex_core_owner',
        'SET'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'P2D.19 preflight failed: installer cannot transfer ownership',
            hint = 'Use the externally approved installation identity; do not add a permanent role membership.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.atomic_order_commands
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 preflight failed: existing commands require separate reconciliation',
            hint = 'Do not synthesize immutable payloads from mutable business data.';
    END IF;
END
$preflight$;

SET LOCAL ROLE afex_core_owner;

CREATE TABLE public.atomic_order_command_payloads (
    command_id uuid NOT NULL,
    payload_version text NOT NULL,
    fingerprint_version text NOT NULL,
    canonical_payload jsonb NOT NULL,
    request_fingerprint bytea NOT NULL,
    canonical_size_bytes integer NOT NULL,
    created_at timestamp with time zone NOT NULL
        DEFAULT pg_catalog.transaction_timestamp(),
    created_by_identity text NOT NULL,
    retain_until timestamp with time zone NOT NULL,
    archived_at timestamp with time zone,
    archive_reference text,
    archive_hash bytea,
    CONSTRAINT atomic_order_command_payloads_pkey
        PRIMARY KEY (command_id),
    CONSTRAINT atomic_order_command_payloads_command_fk
        FOREIGN KEY (command_id)
        REFERENCES public.atomic_order_commands (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT atomic_order_command_payloads_payload_version_check
        CHECK (payload_version = 'order-command-payload-v1'),
    CONSTRAINT atomic_order_command_payloads_fingerprint_version_check
        CHECK (
            fingerprint_version = 'order-request-fingerprint-v1'
        ),
    CONSTRAINT atomic_order_command_payloads_payload_type_check
        CHECK (
            pg_catalog.jsonb_typeof(canonical_payload) = 'object'
        ),
    CONSTRAINT atomic_order_command_payloads_payload_contract_check
        CHECK (
            canonical_payload ?& ARRAY[
                'authenticated_actor_id',
                'branch_id',
                'command_type',
                'customer',
                'discount',
                'fingerprint_version',
                'fulfillment',
                'items',
                'metadata',
                'order',
                'payload_version',
                'payment',
                'pricing',
                'tenant_id',
                'vat',
                'versions'
            ]::text[]
            AND (
                canonical_payload - ARRAY[
                    'authenticated_actor_id',
                    'branch_id',
                    'command_type',
                    'customer',
                    'discount',
                    'fingerprint_version',
                    'fulfillment',
                    'items',
                    'metadata',
                    'order',
                    'payload_version',
                    'payment',
                    'pricing',
                    'tenant_id',
                    'vat',
                    'versions'
                ]::text[]
            ) = '{}'::jsonb
            AND canonical_payload ->> 'payload_version' =
                payload_version
            AND canonical_payload ->> 'fingerprint_version' =
                fingerprint_version
            AND canonical_payload ->> 'command_type' =
                'order.create'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'customer'
                ) = 'object'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'items'
                ) = 'array'
            AND pg_catalog.jsonb_array_length(
                    canonical_payload -> 'items'
                ) BETWEEN 1 AND 100
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'pricing'
                ) = 'object'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'vat'
                ) = 'object'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'discount'
                ) = 'object'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'payment'
                ) = 'object'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'fulfillment'
                ) = 'object'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'order'
                ) = 'object'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'metadata'
                ) = 'object'
            AND pg_catalog.jsonb_typeof(
                    canonical_payload -> 'versions'
                ) = 'object'
        ),
    CONSTRAINT atomic_order_command_payloads_fingerprint_check
        CHECK (
            pg_catalog.octet_length(request_fingerprint) = 32
        ),
    CONSTRAINT atomic_order_command_payloads_size_check
        CHECK (
            canonical_size_bytes BETWEEN 2 AND 262144
        ),
    CONSTRAINT atomic_order_command_payloads_creator_check
        CHECK (
            pg_catalog.char_length(created_by_identity)
            BETWEEN 1 AND 128
        ),
    CONSTRAINT atomic_order_command_payloads_retention_check
        CHECK (retain_until >= created_at),
    CONSTRAINT atomic_order_command_payloads_archive_check
        CHECK (
            (
                archived_at IS NULL
                AND archive_reference IS NULL
                AND archive_hash IS NULL
            )
            OR
            (
                archived_at IS NOT NULL
                AND archived_at >= created_at
                AND pg_catalog.char_length(archive_reference)
                    BETWEEN 1 AND 512
                AND pg_catalog.octet_length(archive_hash) = 32
            )
        )
);

CREATE INDEX atomic_order_command_payloads_fingerprint_idx
    ON public.atomic_order_command_payloads (
        request_fingerprint,
        command_id
    );

CREATE INDEX atomic_order_command_payloads_retention_idx
    ON public.atomic_order_command_payloads (
        retain_until,
        command_id
    )
    WHERE archived_at IS NULL;

ALTER TABLE public.atomic_order_command_payloads
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.atomic_order_command_payloads
    FORCE ROW LEVEL SECURITY;

CREATE POLICY atomic_order_command_payloads_function_owner_all
    ON public.atomic_order_command_payloads
    AS PERMISSIVE
    FOR ALL
    TO afex_function_owner
    USING (true)
    WITH CHECK (true);

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_command_payloads
    FROM PUBLIC;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_command_payloads
    FROM anon;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_command_payloads
    FROM authenticated;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_command_payloads
    FROM service_role;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_command_payloads
    FROM afex_core_runtime;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_command_payloads
    FROM afex_context_issuer;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_command_payloads
    FROM afex_outbox_worker;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_command_payloads
    FROM afex_function_owner;

GRANT SELECT, INSERT
    ON TABLE public.atomic_order_command_payloads
    TO afex_function_owner;

ALTER TABLE public.atomic_order_command_payloads
    OWNER TO afex_core_owner;

RESET ROLE;

DO $verification$
DECLARE
    payload_relation oid;
    command_relation oid;
    core_owner_oid oid;
    function_owner_oid oid;
    unexpected_columns text[];
    unexpected_constraints text[];
    unexpected_indexes text[];
    forbidden_role text;
BEGIN
    payload_relation :=
        pg_catalog.to_regclass(
            'public.atomic_order_command_payloads'
        );
    command_relation :=
        pg_catalog.to_regclass('public.atomic_order_commands');

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    IF payload_relation IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 verification failed: payload relation absent';
    END IF;

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
            message = 'P2D.19 verification failed: relation security or ownership mismatch';
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
    INTO unexpected_columns
    FROM differences;

    IF unexpected_columns IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 verification failed: column contract mismatch',
            detail = pg_catalog.array_to_string(
                unexpected_columns,
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
    INTO unexpected_constraints
    FROM differences;

    IF unexpected_constraints IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 verification failed: constraint inventory mismatch',
            detail = pg_catalog.array_to_string(
                unexpected_constraints,
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
            message = 'P2D.19 verification failed: malformed table ACL array';
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
            message = 'P2D.19 verification failed: constraint behavior mismatch';
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
            message = 'P2D.19 verification failed: exact root allowlist contract mismatch';
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
    INTO unexpected_indexes
    FROM differences;

    IF unexpected_indexes IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 verification failed: index contract mismatch',
            detail = pg_catalog.array_to_string(
                unexpected_indexes,
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
            message = 'P2D.19 verification failed: RLS policy mismatch';
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
            message = 'P2D.19 verification failed: function-owner ACL mismatch';
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
            message = 'P2D.19 verification failed: direct function-owner ACL mismatch';
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
            message = 'P2D.19 verification failed: unexpected direct ACL grantee';
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
                message = 'P2D.19 verification failed: forbidden effective table privilege',
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
            message = 'P2D.19 verification failed: PUBLIC table privilege exists';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger AS trigger_state
        WHERE trigger_state.tgrelid = payload_relation
          AND NOT trigger_state.tgisinternal
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 verification failed: unexpected user trigger exists';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.atomic_order_command_payloads
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 verification failed: migration inserted payload data';
    END IF;
END
$verification$;

REVOKE CREATE ON SCHEMA public FROM afex_core_owner;

REVOKE afex_core_owner FROM postgres
    GRANTED BY postgres;

DO $bootstrap_restoration_verification$
DECLARE
    installer_oid oid;
    core_owner_oid oid;
    supabase_admin_oid oid;
BEGIN
    SELECT oid INTO installer_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres';
    SELECT oid INTO core_owner_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_owner';
    SELECT oid INTO supabase_admin_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'supabase_admin';

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.roleid = core_owner_oid
          AND membership.member = installer_oid
    ) <> 1
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
              OR membership.member = core_owner_oid
       ) <> 1
       OR NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
             AND membership.member = installer_oid
             AND membership.grantor = supabase_admin_oid
             AND membership.admin_option
             AND NOT membership.inherit_option
             AND NOT membership.set_option
       )
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = core_owner_oid
             AND membership.member = installer_oid
             AND membership.grantor = installer_oid
       )
       OR pg_catalog.pg_has_role(
           CURRENT_USER, 'afex_core_owner', 'SET'
       )
       OR pg_catalog.has_schema_privilege(
           'afex_core_owner', 'public', 'CREATE'
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
             AND acl_state.grantee = core_owner_oid
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.19 failed: bootstrap authority was not restored';
    END IF;
END
$bootstrap_restoration_verification$;

COMMIT;

-- END OF P2D.19 DURABLE IMMUTABLE PAYLOAD STORAGE
