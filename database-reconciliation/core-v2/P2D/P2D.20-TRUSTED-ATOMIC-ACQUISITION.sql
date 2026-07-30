-- AFEX Core V2 P2D.20 - Trusted Atomic Acquisition Entrypoint
-- STATUS: DRAFT - NOT EXECUTED
-- Creates acquisition only. It performs no order, invoice, inventory,
-- numbering, payment, audit, outbox, replay delivery, or Executor work.
-- Normative contract: P2D.17 + P2D.18 + P2D.18A.
-- Runtime rejects secrets embedded in permitted prose and produces
-- duplicate-aware NFC canonical input. PostgreSQL independently revalidates
-- each deterministic structural, canonical-byte and fingerprint invariant.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT pg_catalog.pg_advisory_xact_lock(219020001::bigint);

DO $bootstrap_preflight$
DECLARE
    installer_oid oid;
    core_owner_oid oid;
    function_owner_oid oid;
    supabase_admin_oid oid;
BEGIN
    IF CURRENT_USER IS DISTINCT FROM 'postgres'
       OR SESSION_USER IS DISTINCT FROM 'postgres' THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'P2D.20 bootstrap failed: installer identity must be postgres';
    END IF;

    SELECT oid INTO installer_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres' AND rolcanlogin AND rolcreaterole;
    SELECT oid INTO core_owner_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_owner' AND NOT rolcanlogin;
    SELECT oid INTO function_owner_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_function_owner' AND NOT rolcanlogin;
    SELECT oid INTO supabase_admin_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'supabase_admin';

    IF installer_oid IS NULL
       OR core_owner_oid IS NULL
       OR function_owner_oid IS NULL
       OR supabase_admin_oid IS NULL
       OR EXISTS (
           SELECT 1
           FROM (VALUES (core_owner_oid), (function_owner_oid))
                AS target(role_oid)
           WHERE (
               SELECT pg_catalog.count(*)
               FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.roleid = target.role_oid
                 AND membership.member = installer_oid
           ) <> 1
              OR (
                  SELECT pg_catalog.count(*)
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target.role_oid
                     OR membership.member = target.role_oid
              ) <> 1
              OR NOT EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target.role_oid
                    AND membership.member = installer_oid
                    AND membership.grantor = supabase_admin_oid
                    AND membership.admin_option
                    AND NOT membership.inherit_option
                    AND NOT membership.set_option
              )
              OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target.role_oid
                    AND membership.member = installer_oid
                    AND membership.grantor = installer_oid
              )
       )
       OR pg_catalog.has_schema_privilege(
           'afex_function_owner', 'public', 'CREATE'
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
             AND acl_state.grantee IN (
                 core_owner_oid,
                 function_owner_oid
             )
       )
       OR NOT pg_catalog.has_schema_privilege(
           CURRENT_USER, 'public', 'CREATE WITH GRANT OPTION'
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_default_acl AS default_acl
           WHERE default_acl.defaclrole = function_owner_oid
             AND default_acl.defaclobjtype = 'f'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 bootstrap failed: frozen before-state mismatch';
    END IF;
END
$bootstrap_preflight$;

GRANT afex_core_owner TO postgres
    WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
    GRANTED BY postgres;

GRANT afex_function_owner TO postgres
    WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
    GRANTED BY postgres;

DO $temporary_membership_verification$
DECLARE
    installer_oid oid;
    core_owner_oid oid;
    function_owner_oid oid;
    supabase_admin_oid oid;
BEGIN
    SELECT oid INTO installer_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres';
    SELECT oid INTO core_owner_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_owner';
    SELECT oid INTO function_owner_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_function_owner';
    SELECT oid INTO supabase_admin_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'supabase_admin';

    IF EXISTS (
        SELECT 1
        FROM (VALUES (core_owner_oid), (function_owner_oid))
             AS target(role_oid)
        WHERE (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = target.role_oid
              AND membership.member = installer_oid
        ) <> 2
           OR (
               SELECT pg_catalog.count(*)
               FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.roleid = target.role_oid
                  OR membership.member = target.role_oid
           ) <> 2
           OR NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.roleid = target.role_oid
                 AND membership.member = installer_oid
                 AND membership.grantor = supabase_admin_oid
                 AND membership.admin_option
                 AND NOT membership.inherit_option
                 AND NOT membership.set_option
           )
           OR NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.roleid = target.role_oid
                 AND membership.member = installer_oid
                 AND membership.grantor = installer_oid
                 AND NOT membership.admin_option
                 AND NOT membership.inherit_option
                 AND membership.set_option
           )
    )
       OR NOT pg_catalog.pg_has_role(
           CURRENT_USER, 'afex_core_owner', 'SET'
       )
       OR NOT pg_catalog.pg_has_role(
           CURRENT_USER, 'afex_function_owner', 'SET'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 bootstrap failed: temporary membership mismatch';
    END IF;
END
$temporary_membership_verification$;

GRANT CREATE ON SCHEMA public TO afex_function_owner;

DO $preflight$
DECLARE
    required_relation text;
    required_column record;
    function_owner_oid oid;
    relation_authority record;
BEGIN
    IF pg_catalog.current_setting('server_version_num')::integer <> 170006 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 requires exact approved PostgreSQL 17.6 (170006)';
    END IF;

    IF pg_catalog.current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 preflight failed: server encoding must be UTF8';
    END IF;

    FOREACH required_relation IN ARRAY ARRAY[
        'public.atomic_authorization_contexts',
        'public.atomic_order_commands',
        'public.atomic_order_command_payloads',
        'public.profiles',
        'public.tenants',
        'public.branches'
    ]::text[]
    LOOP
        IF pg_catalog.to_regclass(required_relation) IS NULL THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.20 preflight failed: dependency relation is missing',
                detail = required_relation;
        END IF;
    END LOOP;

    IF pg_catalog.to_regprocedure(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
    ) IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 preflight failed: acquisition entrypoint already exists';
    END IF;

    IF pg_catalog.to_regprocedure(
           'public.canonicalize_atomic_order_json_v1(jsonb)'
       ) IS NOT NULL
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_constraint AS constraint_state
           WHERE constraint_state.conrelid =
                 pg_catalog.to_regclass(
                     'public.atomic_order_command_payloads'
                 )
             AND constraint_state.conname =
                 'atomic_order_command_payloads_canonical_size_binding_check'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 preflight failed: canonicalization object already exists';
    END IF;

    IF NOT pg_catalog.pg_has_role(
        CURRENT_USER,
        'afex_function_owner',
        'SET'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'P2D.20 preflight failed: installer cannot transfer function ownership';
    END IF;

    IF NOT pg_catalog.has_schema_privilege(
        CURRENT_USER,
        'public',
        'CREATE'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'P2D.20 preflight failed: installer lacks public schema CREATE';
    END IF;

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    IF function_owner_oid IS NULL
       OR NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_roles AS role_state
           WHERE role_state.rolname = 'afex_core_runtime'
             AND NOT role_state.rolcanlogin
             AND NOT role_state.rolinherit
             AND NOT role_state.rolsuper
             AND NOT role_state.rolcreatedb
             AND NOT role_state.rolcreaterole
             AND NOT role_state.rolreplication
             AND NOT role_state.rolbypassrls
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 preflight failed: execution-role contract mismatch';
    END IF;

    FOR relation_authority IN
        SELECT
            namespace_state.nspname || '.' ||
                relation_state.relname AS relation_name,
            relation_state.relowner AS owner_oid
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE relation_state.oid IN (
            pg_catalog.to_regclass(
                'public.atomic_order_command_payloads'
            ),
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.tenants'),
            pg_catalog.to_regclass('public.branches')
        )
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_roles AS installer_role
            WHERE installer_role.rolname = CURRENT_USER
              AND (
                  installer_role.rolsuper
                  OR pg_catalog.pg_has_role(
                      CURRENT_USER,
                       relation_authority.owner_oid,
                       'SET'
                  )
              )
        ) THEN
            RAISE EXCEPTION USING
                errcode = '42501',
                message = 'P2D.20 preflight failed: installer lacks relation-owner authority',
                detail = relation_authority.relation_name;
        END IF;
    END LOOP;

    FOR required_column IN
        SELECT *
        FROM (
            VALUES
                ('profiles', 'id', 'uuid'),
                ('profiles', 'tenant_id', 'uuid'),
                ('profiles', 'branch_id', 'uuid'),
                ('profiles', 'role', 'text'),
                ('profiles', 'is_active', 'boolean'),
                (
                    'profiles',
                    'updated_at',
                    'timestamp with time zone'
                ),
                ('tenants', 'id', 'uuid'),
                ('branches', 'id', 'uuid'),
                ('branches', 'tenant_id', 'uuid'),
                ('branches', 'is_active', 'boolean'),
                (
                    'branches',
                    'deleted_at',
                    'timestamp with time zone'
                )
        ) AS expected(table_name, column_name, data_type)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_attribute AS attribute_state
            WHERE attribute_state.attrelid =
                  pg_catalog.to_regclass(
                      'public.' || required_column.table_name
                  )
              AND attribute_state.attname =
                  required_column.column_name
              AND pg_catalog.format_type(
                      attribute_state.atttypid,
                      attribute_state.atttypmod
                  ) = required_column.data_type
              AND attribute_state.attnum > 0
              AND NOT attribute_state.attisdropped
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.20 preflight failed: authorization column contract mismatch',
                detail = required_column.table_name || '.' ||
                         required_column.column_name;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_policy AS policy_state
        WHERE (
            policy_state.polrelid =
                pg_catalog.to_regclass('public.profiles')
            AND policy_state.polname =
                'core_v2_function_owner_profiles_authorization_read'
        )
        OR (
            policy_state.polrelid =
                pg_catalog.to_regclass('public.tenants')
            AND policy_state.polname =
                'core_v2_function_owner_tenants_authorization_read'
        )
        OR (
            policy_state.polrelid =
                pg_catalog.to_regclass('public.branches')
            AND policy_state.polname =
                'core_v2_function_owner_branches_authorization_read'
        )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 preflight failed: authorization-read policy already exists';
    END IF;

    IF pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.profiles',
           'SELECT'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.tenants',
           'SELECT'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.branches',
           'SELECT'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 preflight failed: unexpected table-wide authorization read grant';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.pos_profiles'),
            pg_catalog.to_regclass('public.branches')
        )
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND attribute_state.attacl IS NOT NULL
          AND (CASE
              WHEN pg_catalog.cardinality(attribute_state.attacl) > 0
                   AND pg_catalog.array_ndims(attribute_state.attacl)
                       IS DISTINCT FROM 1
                  THEN true
              WHEN pg_catalog.array_ndims(attribute_state.attacl) = 1
                  THEN pg_catalog.array_position(
                      attribute_state.attacl,
                      NULL::aclitem
                  ) IS NOT NULL
              ELSE false
          END)
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 preflight failed: malformed authorization-evidence column ACL array';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        CROSS JOIN LATERAL pg_catalog.unnest(
            attribute_state.attacl
        ) AS acl_item(value)
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            ARRAY[acl_item.value]::aclitem[]
        ) AS acl_state
        WHERE attribute_state.attrelid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.tenants'),
            pg_catalog.to_regclass('public.branches')
        )
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND acl_state.grantee = function_owner_oid
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 preflight failed: pre-existing authorization column ACL exists';
    END IF;
END
$preflight$;

GRANT SELECT (
    id,
    tenant_id,
    branch_id,
    role,
    is_active,
    updated_at
)
ON TABLE public.profiles
TO afex_function_owner;

GRANT SELECT (id)
ON TABLE public.tenants
TO afex_function_owner;

GRANT SELECT (
    id,
    tenant_id,
    is_active,
    deleted_at
)
ON TABLE public.branches
TO afex_function_owner;

CREATE POLICY core_v2_function_owner_profiles_authorization_read
    ON public.profiles
    AS PERMISSIVE
    FOR SELECT
    TO afex_function_owner
    USING (true);

CREATE POLICY core_v2_function_owner_tenants_authorization_read
    ON public.tenants
    AS PERMISSIVE
    FOR SELECT
    TO afex_function_owner
    USING (true);

CREATE POLICY core_v2_function_owner_branches_authorization_read
    ON public.branches
    AS PERMISSIVE
    FOR SELECT
    TO afex_function_owner
    USING (true);

SET LOCAL ROLE afex_function_owner;

CREATE FUNCTION public.canonicalize_atomic_order_json_v1(
    p_value jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_type text;
    v_result text;
    v_text text;
    v_character text;
    v_codepoint integer;
    v_index integer;
BEGIN
    v_type := pg_catalog.jsonb_typeof(p_value);

    IF v_type = 'null' THEN
        RETURN 'null';
    ELSIF v_type = 'boolean' THEN
        RETURN CASE WHEN p_value = 'true'::jsonb
                    THEN 'true' ELSE 'false' END;
    ELSIF v_type = 'number' THEN
        IF (p_value #>> '{}') !~ '^(0|[1-9][0-9]*)$' THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'CANONICAL_JSON_NUMBER_INVALID';
        END IF;
        RETURN p_value #>> '{}';
    ELSIF v_type = 'string' THEN
        v_text := p_value #>> '{}';
        IF v_text IS DISTINCT FROM normalize(v_text, NFC) THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'CANONICAL_JSON_STRING_NOT_NFC';
        END IF;

        v_result := '"';
        FOR v_index IN 1..pg_catalog.char_length(v_text)
        LOOP
            v_character := pg_catalog.substr(v_text, v_index, 1);
            v_codepoint := pg_catalog.ascii(v_character);
            IF v_character = '"' THEN
                v_result := v_result || '\"';
            ELSIF v_character = E'\\' THEN
                v_result := v_result || '\\';
            ELSIF v_codepoint BETWEEN 0 AND 31 THEN
                v_result := v_result || '\u00' ||
                    pg_catalog.upper(
                        pg_catalog.lpad(
                            pg_catalog.to_hex(v_codepoint),
                            2,
                            '0'
                        )
                    );
            ELSE
                v_result := v_result || v_character;
            END IF;
        END LOOP;
        RETURN v_result || '"';
    ELSIF v_type = 'array' THEN
        SELECT '[' || COALESCE(
            pg_catalog.string_agg(
                public.canonicalize_atomic_order_json_v1(
                    array_element.value
                ),
                ',' ORDER BY array_element.ordinality
            ),
            ''
        ) || ']'
        INTO v_result
        FROM pg_catalog.jsonb_array_elements(p_value)
             WITH ORDINALITY AS array_element(value, ordinality);
        RETURN v_result;
    ELSIF v_type = 'object' THEN
        SELECT '{' || COALESCE(
            pg_catalog.string_agg(
                public.canonicalize_atomic_order_json_v1(
                    pg_catalog.to_jsonb(object_member.key)
                ) || ':' ||
                public.canonicalize_atomic_order_json_v1(
                    object_member.value
                ),
                ',' ORDER BY
                    pg_catalog.convert_to(object_member.key, 'UTF8')
            ),
            ''
        ) || '}'
        INTO v_result
        FROM pg_catalog.jsonb_each(p_value)
             AS object_member(key, value);
        RETURN v_result;
    END IF;

    RAISE EXCEPTION USING
        errcode = '22023',
        message = 'CANONICAL_JSON_TYPE_INVALID';
END
$function$;

REVOKE ALL
    ON FUNCTION public.canonicalize_atomic_order_json_v1(jsonb)
    FROM PUBLIC;

GRANT EXECUTE
    ON FUNCTION public.canonicalize_atomic_order_json_v1(jsonb)
    TO afex_core_owner;

RESET ROLE;

SET LOCAL ROLE afex_core_owner;

ALTER TABLE public.atomic_order_command_payloads
    ADD CONSTRAINT atomic_order_command_payloads_canonical_size_binding_check
    CHECK (
        canonical_size_bytes = pg_catalog.octet_length(
            pg_catalog.convert_to(
                public.canonicalize_atomic_order_json_v1(
                    canonical_payload
                ),
                'UTF8'
            )
        )
    );

RESET ROLE;

SET LOCAL ROLE afex_function_owner;

REVOKE EXECUTE
    ON FUNCTION public.canonicalize_atomic_order_json_v1(jsonb)
    FROM afex_core_owner;

CREATE FUNCTION public.acquire_atomic_order_command_v1(
    p_authenticated_actor_id uuid,
    p_tenant_id uuid,
    p_branch_id uuid,
    p_idempotency_key text,
    p_correlation_reference text,
    p_canonical_payload text,
    p_fingerprint_projection text,
    p_retain_until timestamp with time zone
)
RETURNS TABLE (
    acquisition_result text,
    authorization_context_id uuid,
    atomic_command_id uuid,
    correlation_reference text,
    command_status text,
    response_version text,
    response_snapshot jsonb,
    completed_at timestamp with time zone,
    error_code text,
    error_detail text,
    last_failure_stage text,
    stored_request_fingerprint bytea
)
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_invoker_role text;
    v_session_role_oid oid;
    v_runtime_role_oid oid;
    v_payload jsonb;
    v_projection jsonb;
    v_expected_projection jsonb;
    v_canonical_payload text;
    v_canonical_projection text;
    v_pricing_lines jsonb;
    v_payload_size integer;
    v_metadata_size integer;
    v_idempotency_key text;
    v_idempotency_hash bytea;
    v_request_fingerprint bytea;
    v_now timestamp with time zone;
    v_context_id uuid;
    v_command_id uuid;
    v_reference_hash bytea;
    v_profile_role text;
    v_profile_branch_id uuid;
    v_profile_updated_at timestamp with time zone;
    v_role_snapshot text;
    v_capability_version bigint;
    v_employee_source text;
    v_employee_source_id uuid;
    v_existing record;
    v_item record;
    v_modifier record;
    v_item_keys text[];
    v_modifier_keys text[];
    v_expected_item_keys constant text[] := ARRAY[
        'catalog_item_id',
        'category_snapshot',
        'fulfillment_class',
        'inventory_tracking_mode',
        'item_type_snapshot',
        'line_id',
        'line_note',
        'line_number',
        'modifiers',
        'name_snapshot',
        'quantity',
        'sku_snapshot',
        'unit_snapshot'
    ]::text[];
    v_expected_modifier_keys constant text[] := ARRAY[
        'modifier_id',
        'modifier_type',
        'option_id',
        'price_adjustment',
        'quantity',
        'value'
    ]::text[];
    v_expected_customer_keys constant text[] := ARRAY[
        'address', 'allowed_update_fields', 'conflict_behavior',
        'customer_id', 'display_phone', 'email',
        'expected_record_version', 'mode', 'name',
        'normalized_phone', 'notes'
    ]::text[];
    v_expected_pricing_keys constant text[] := ARRAY[
        'branch_pricing_version', 'currency', 'currency_precision',
        'financial_engine_version', 'lines', 'price_version',
        'quote_fingerprint', 'quote_reference', 'quote_version',
        'rounding_strategy', 'subtotal', 'taxable_subtotal', 'total'
    ]::text[];
    v_expected_pricing_line_keys constant text[] := ARRAY[
        'discount_allocation', 'gross_amount', 'line_id', 'net_amount',
        'pricing_source', 'source_branch_price_id',
        'source_branch_price_version', 'source_catalog_id',
        'source_catalog_version', 'taxable_amount', 'unit_price',
        'vat_amount'
    ]::text[];
    v_expected_vat_keys constant text[] := ARRAY[
        'amount', 'effective_at', 'mode', 'rate', 'rule_version',
        'setting_id', 'tax_inclusive'
    ]::text[];
    v_expected_discount_keys constant text[] := ARRAY[
        'amount', 'eligibility_version', 'id', 'name_snapshot',
        'rule_version', 'source', 'type', 'value'
    ]::text[];
    v_expected_payment_keys constant text[] := ARRAY[
        'amount_tendered', 'cash_change', 'cash_received',
        'expected_status', 'method', 'provider_reference',
        'remaining_from_customer', 'rule_version'
    ]::text[];
    v_expected_fulfillment_keys constant text[] := ARRAY[
        'address', 'branch_id', 'instructions', 'method', 'requested_at'
    ]::text[];
    v_expected_order_keys constant text[] := ARRAY['note']::text[];
    v_expected_metadata_keys constant text[] := ARRAY[
        'client_version', 'correlation_id', 'device_id',
        'offline_draft_id', 'pos_terminal_id',
        'request_reference', 'source_channel'
    ]::text[];
    v_expected_version_keys constant text[] := ARRAY[
        'authorization_contract', 'customer_engine',
        'financial_engine', 'inventory_engine',
        'numbering_engine', 'payload_contract'
    ]::text[];
    v_pricing_line record;
    v_customer_mode text;
    v_discount_source text;
    v_payment_method text;
    v_fulfillment_method text;
    v_has_branch_override boolean := false;
    v_allowed_update_fields text[];
BEGIN
    v_invoker_role :=
        pg_catalog.current_setting('role', true);

    IF v_invoker_role IS DISTINCT FROM 'afex_core_runtime' THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'RUNTIME_IDENTITY_INVALID';
    END IF;

    SELECT role_state.oid
    INTO v_session_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = SESSION_USER
      AND role_state.rolcanlogin
      AND NOT role_state.rolinherit
      AND NOT role_state.rolsuper
      AND NOT role_state.rolcreatedb
      AND NOT role_state.rolcreaterole
      AND NOT role_state.rolreplication
      AND NOT role_state.rolbypassrls;

    SELECT role_state.oid
    INTO v_runtime_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_runtime';

    IF v_session_role_oid IS NULL
       OR v_runtime_role_oid IS NULL
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.member = v_session_role_oid
       ) <> 1
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.member = v_session_role_oid
             AND membership.roleid = v_runtime_role_oid
             AND NOT membership.admin_option
             AND NOT membership.inherit_option
             AND membership.set_option
       ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'RUNTIME_IDENTITY_INVALID';
    END IF;

    IF p_authenticated_actor_id IS NULL
       OR p_tenant_id IS NULL
       OR p_branch_id IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'AUTHORIZATION_SCOPE_INVALID';
    END IF;

    SELECT
        profile_state.role,
        profile_state.branch_id,
        profile_state.updated_at
    INTO
        v_profile_role,
        v_profile_branch_id,
        v_profile_updated_at
    FROM public.profiles AS profile_state
    WHERE profile_state.id = p_authenticated_actor_id
      AND profile_state.tenant_id = p_tenant_id
      AND profile_state.is_active
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'ACTOR_INVALID_OR_INACTIVE';
    END IF;

    IF v_profile_role NOT IN (
        'owner',
        'admin',
        'manager',
        'employee',
        'cashier'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'ACTOR_ROLE_FORBIDDEN';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.tenants AS tenant_state
        WHERE tenant_state.id = p_tenant_id
    ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'TENANT_INVALID';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.branches AS branch_state
        WHERE branch_state.id = p_branch_id
          AND branch_state.tenant_id = p_tenant_id
          AND branch_state.is_active
          AND branch_state.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'BRANCH_INVALID_OR_INACTIVE';
    END IF;

    IF v_profile_role IN ('employee', 'cashier')
       AND v_profile_branch_id IS DISTINCT FROM p_branch_id THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'BRANCH_FORBIDDEN';
    END IF;

    v_role_snapshot :=
        CASE v_profile_role
            WHEN 'owner' THEN 'admin'
            ELSE v_profile_role
        END;

    v_capability_version := GREATEST(
        1::bigint,
        pg_catalog.floor(
            EXTRACT(
                epoch FROM v_profile_updated_at
            ) * 1000000
        )::bigint
    );

    IF v_profile_role IN ('employee', 'cashier') THEN
        v_employee_source := 'profile';
        v_employee_source_id := p_authenticated_actor_id;
    ELSE
        v_employee_source := 'none';
        v_employee_source_id := NULL;
    END IF;

    IF p_correlation_reference IS NULL
       OR pg_catalog.char_length(p_correlation_reference)
          NOT BETWEEN 1 AND 128
       OR p_correlation_reference !~
          '^[A-Za-z0-9._:-]+$' THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'CORRELATION_REFERENCE_INVALID';
    END IF;

    IF p_retain_until IS NULL
       OR p_retain_until <
          pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'RETENTION_BOUNDARY_INVALID';
    END IF;

    v_idempotency_key := pg_catalog.btrim(p_idempotency_key);

    IF v_idempotency_key IS NULL
       OR pg_catalog.char_length(v_idempotency_key)
          NOT BETWEEN 1 AND 512 THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'IDEMPOTENCY_KEY_INVALID';
    END IF;

    BEGIN
        IF p_canonical_payload IS NOT JSON OBJECT WITH UNIQUE KEYS
           OR p_fingerprint_projection IS NOT JSON OBJECT
              WITH UNIQUE KEYS THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_INVALID';
        END IF;
        v_payload := p_canonical_payload::jsonb;
        v_projection := p_fingerprint_projection::jsonb;
    EXCEPTION
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_INVALID';
    END;

    IF pg_catalog.jsonb_typeof(v_payload) IS DISTINCT FROM
       'object'
       OR pg_catalog.jsonb_typeof(v_projection) IS DISTINCT FROM
          'object' THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_INVALID';
    END IF;

    v_canonical_payload :=
        public.canonicalize_atomic_order_json_v1(v_payload);

    IF p_canonical_payload IS DISTINCT FROM v_canonical_payload THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_CANONICAL_BYTES_INVALID';
    END IF;

    v_payload_size := pg_catalog.octet_length(
        pg_catalog.convert_to(v_canonical_payload, 'UTF8')
    );

    IF v_payload_size NOT BETWEEN 2 AND 262144 THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_TOO_LARGE';
    END IF;

    IF (
        SELECT pg_catalog.array_agg(payload_key ORDER BY payload_key)
        FROM pg_catalog.jsonb_object_keys(v_payload)
             AS payload_key
    ) IS DISTINCT FROM ARRAY[
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
    ]::text[] THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_STRUCTURE_INVALID';
    END IF;

    IF v_payload ->> 'payload_version' IS DISTINCT FROM
       'order-command-payload-v1'
       OR v_payload ->> 'fingerprint_version' IS DISTINCT FROM
          'order-request-fingerprint-v1'
       OR v_payload ->> 'command_type' IS DISTINCT FROM
          'order.create'
       OR v_payload ->> 'tenant_id' IS DISTINCT FROM
          p_tenant_id::text
       OR v_payload ->> 'branch_id' IS DISTINCT FROM
          p_branch_id::text
       OR v_payload ->> 'authenticated_actor_id'
          IS DISTINCT FROM p_authenticated_actor_id::text THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_SCOPE_OR_VERSION_INVALID';
    END IF;

    IF pg_catalog.jsonb_typeof(v_payload -> 'customer')
       IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_payload -> 'items')
          IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(v_payload -> 'items')
          NOT BETWEEN 1 AND 100
       OR pg_catalog.jsonb_typeof(v_payload -> 'pricing')
          IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_payload -> 'vat')
          IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_payload -> 'discount')
          NOT IN ('object', 'null')
       OR pg_catalog.jsonb_typeof(v_payload -> 'payment')
          IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_payload -> 'fulfillment')
          IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_payload -> 'order')
          IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_payload -> 'metadata')
          IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_payload -> 'versions')
          IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_STRUCTURE_INVALID';
    END IF;

    v_metadata_size := pg_catalog.octet_length(
        pg_catalog.convert_to(
            public.canonicalize_atomic_order_json_v1(
                v_payload -> 'metadata'
            ),
            'UTF8'
        )
    );

    IF v_metadata_size > 4096 THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_METADATA_TOO_LARGE';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_path_query(
            v_payload,
            'strict $.** ? (@.type() == "string")'
        ) AS string_state(value)
        WHERE string_state.value #>> '{}' IS DISTINCT FROM
              normalize(string_state.value #>> '{}', NFC)
    ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_STRING_NOT_NFC';
    END IF;

    IF pg_catalog.lower(p_canonical_payload) ~
       '"(card_number|cardnumber|pan|cvv|cvc|pin|password|passwd|bearer_token|access_token|refresh_token|session_token|provider_secret|client_secret|authorization|authentication_material|masked_instrument|trace_id|feature_flags)"[[:space:]]*:' THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_SENSITIVE_FIELD_FORBIDDEN';
    END IF;

    IF (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'customer')
             AS key_name
    ) IS DISTINCT FROM v_expected_customer_keys
       OR (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'pricing')
             AS key_name
       ) IS DISTINCT FROM v_expected_pricing_keys
       OR (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'vat')
             AS key_name
       ) IS DISTINCT FROM v_expected_vat_keys
       OR (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'discount')
             AS key_name
       ) IS DISTINCT FROM v_expected_discount_keys
       OR (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'payment')
             AS key_name
       ) IS DISTINCT FROM v_expected_payment_keys
       OR (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'fulfillment')
             AS key_name
       ) IS DISTINCT FROM v_expected_fulfillment_keys
       OR (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'order')
             AS key_name
       ) IS DISTINCT FROM v_expected_order_keys
       OR (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'metadata')
             AS key_name
       ) IS DISTINCT FROM v_expected_metadata_keys
       OR (
        SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
        FROM pg_catalog.jsonb_object_keys(v_payload -> 'versions')
             AS key_name
       ) IS DISTINCT FROM v_expected_version_keys THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_NESTED_ALLOWLIST_INVALID';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
            'payload_version', 'fingerprint_version', 'command_type',
            'tenant_id', 'branch_id', 'authenticated_actor_id'
        ]::text[]) AS root_state(root_key)
        WHERE pg_catalog.jsonb_typeof(v_payload -> root_key)
              IS DISTINCT FROM 'string'
    )
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'currency', 'subtotal', 'taxable_subtotal', 'total',
               'rounding_strategy', 'price_version',
               'quote_reference', 'quote_version',
               'quote_fingerprint', 'financial_engine_version'
           ]::text[]) AS pricing_state(pricing_key)
           WHERE pg_catalog.jsonb_typeof(
                     v_payload -> 'pricing' -> pricing_key
                 ) IS DISTINCT FROM 'string'
       )
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'pricing' -> 'currency_precision'
          ) IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'pricing' -> 'lines'
          ) IS DISTINCT FROM 'array'
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'mode', 'rate', 'amount', 'rule_version', 'effective_at'
           ]::text[]) AS vat_state(vat_key)
           WHERE pg_catalog.jsonb_typeof(
                     v_payload -> 'vat' -> vat_key
                 ) IS DISTINCT FROM 'string'
       )
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'vat' -> 'tax_inclusive'
          ) IS DISTINCT FROM 'boolean'
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'source', 'amount'
           ]::text[]) AS discount_state(discount_key)
           WHERE pg_catalog.jsonb_typeof(
                     v_payload -> 'discount' -> discount_key
                 ) IS DISTINCT FROM 'string'
       )
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'method', 'amount_tendered', 'expected_status',
               'remaining_from_customer', 'cash_change', 'rule_version'
           ]::text[]) AS payment_state(payment_key)
           WHERE pg_catalog.jsonb_typeof(
                     v_payload -> 'payment' -> payment_key
                 ) IS DISTINCT FROM 'string'
       )
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'fulfillment' -> 'method'
          ) IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'fulfillment' -> 'branch_id'
          ) IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'metadata' -> 'source_channel'
          ) IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'metadata' -> 'correlation_id'
          ) IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'customer' -> 'mode'
          ) IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'customer' -> 'conflict_behavior'
          ) IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'customer' -> 'allowed_update_fields'
          ) IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'customer' -> 'customer_id'
          ) NOT IN ('string', 'null')
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'customer' -> 'expected_record_version'
          ) NOT IN ('number', 'null') THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_NESTED_TYPE_INVALID';
    END IF;

    IF pg_catalog.jsonb_typeof(
           v_payload -> 'pricing' -> 'branch_pricing_version'
       ) NOT IN ('string', 'null')
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'vat' -> 'setting_id'
          ) NOT IN ('string', 'null')
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'id', 'name_snapshot', 'type', 'value',
               'eligibility_version', 'rule_version'
           ]::text[]) AS discount_nullable(discount_key)
           WHERE pg_catalog.jsonb_typeof(
                     v_payload -> 'discount' -> discount_key
                 ) NOT IN ('string', 'null')
       )
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'cash_received', 'provider_reference'
           ]::text[]) AS payment_nullable(payment_key)
           WHERE pg_catalog.jsonb_typeof(
                     v_payload -> 'payment' -> payment_key
                 ) NOT IN ('string', 'null')
       )
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'requested_at', 'address', 'instructions'
           ]::text[]) AS fulfillment_nullable(fulfillment_key)
           WHERE pg_catalog.jsonb_typeof(
                     v_payload -> 'fulfillment' -> fulfillment_key
                 ) NOT IN ('string', 'null')
       )
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'order' -> 'note'
          ) NOT IN ('string', 'null')
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'request_reference', 'offline_draft_id', 'device_id',
               'pos_terminal_id', 'client_version'
           ]::text[]) AS metadata_nullable(metadata_key)
           WHERE pg_catalog.jsonb_typeof(
                     v_payload -> 'metadata' -> metadata_key
                 ) NOT IN ('string', 'null')
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_NULLABLE_TYPE_INVALID';
    END IF;

    IF v_payload ->> 'tenant_id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR v_payload ->> 'branch_id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR v_payload ->> 'authenticated_actor_id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_UUID_CANONICAL_FORM_INVALID';
    END IF;

    v_customer_mode := v_payload -> 'customer' ->> 'mode';
    SELECT COALESCE(
        pg_catalog.array_agg(field_name ORDER BY ordinality),
        ARRAY[]::text[]
    )
    INTO v_allowed_update_fields
    FROM pg_catalog.jsonb_array_elements_text(
        v_payload -> 'customer' -> 'allowed_update_fields'
    ) WITH ORDINALITY AS allowed_field(field_name, ordinality);

    IF pg_catalog.jsonb_typeof(
           v_payload -> 'customer' -> 'allowed_update_fields'
       ) IS DISTINCT FROM 'array'
       OR v_allowed_update_fields <> (
           SELECT COALESCE(
               pg_catalog.array_agg(
                   DISTINCT field_name
                   ORDER BY field_name
               ),
               ARRAY[]::text[]
           )
           FROM pg_catalog.jsonb_array_elements_text(
               v_payload -> 'customer' -> 'allowed_update_fields'
           ) AS allowed_field(field_name)
       )
       OR NOT v_allowed_update_fields <@
          ARRAY['address','display_phone','email','name','notes']::text[]
       OR pg_catalog.cardinality(v_allowed_update_fields) > 5
       OR v_customer_mode NOT IN ('existing', 'create', 'none') THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_CUSTOMER_STATE_INVALID';
    END IF;

    IF v_customer_mode = 'existing' THEN
        IF pg_catalog.jsonb_typeof(v_payload -> 'customer' -> 'customer_id')
              IS DISTINCT FROM 'string'
           OR (v_payload -> 'customer' ->> 'customer_id') !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR pg_catalog.jsonb_typeof(
                  v_payload -> 'customer' -> 'expected_record_version'
              ) IS DISTINCT FROM 'number'
           OR (v_payload -> 'customer' ->> 'expected_record_version')
              !~ '^[1-9][0-9]{0,18}$'
           OR (
               v_payload -> 'customer' ->>
               'expected_record_version'
           )::numeric > 9223372036854775807
           OR (
               v_payload -> 'customer' ->> 'conflict_behavior' =
                   'apply_allowed_updates'
               AND pg_catalog.cardinality(v_allowed_update_fields) = 0
           )
           OR (
               v_payload -> 'customer' ->> 'conflict_behavior' <>
                   'apply_allowed_updates'
               AND pg_catalog.cardinality(v_allowed_update_fields) <> 0
           )
           OR v_payload -> 'customer' ->> 'conflict_behavior'
              NOT IN (
                  'reject',
                  'reuse_without_update',
                  'apply_allowed_updates'
              ) THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_CUSTOMER_STATE_INVALID';
        END IF;
    ELSIF v_customer_mode = 'create' THEN
        IF v_payload -> 'customer' -> 'customer_id' <> 'null'::jsonb
           OR v_payload -> 'customer' -> 'expected_record_version' <>
              'null'::jsonb
           OR COALESCE(v_payload -> 'customer' ->> 'normalized_phone', '')
              !~ '^\+?[0-9]{8,32}$'
           OR COALESCE(v_payload -> 'customer' ->> 'name', '') = ''
           OR pg_catalog.cardinality(v_allowed_update_fields) <> 0
           OR v_payload -> 'customer' ->> 'conflict_behavior' <>
              'reject' THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_CUSTOMER_STATE_INVALID';
        END IF;
    ELSE
        IF EXISTS (
            SELECT 1
            FROM unnest(ARRAY[
                'customer_id', 'expected_record_version',
                'normalized_phone', 'display_phone', 'name',
                'email', 'address', 'notes'
            ]::text[]) AS nullable_state(nullable_key)
            WHERE v_payload -> 'customer' -> nullable_key <>
                  'null'::jsonb
        )
           OR pg_catalog.cardinality(v_allowed_update_fields) <> 0
           OR v_payload -> 'customer' ->> 'conflict_behavior' <>
              'reject' THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_CUSTOMER_STATE_INVALID';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
            'normalized_phone', 'display_phone', 'name', 'email',
            'address', 'notes'
        ]::text[]) AS nullable_state(nullable_key)
        WHERE v_payload -> 'customer' -> nullable_key <> 'null'::jsonb
          AND (
              pg_catalog.jsonb_typeof(
                  v_payload -> 'customer' -> nullable_key
              ) IS DISTINCT FROM 'string'
              OR v_payload -> 'customer' ->> nullable_key = ''
          )
    )
       OR (
           v_payload -> 'customer' -> 'normalized_phone' <> 'null'::jsonb
           AND v_payload -> 'customer' ->> 'normalized_phone'
               !~ '^\+?[0-9]{8,32}$'
       )
       OR (
           v_payload -> 'customer' -> 'display_phone' <> 'null'::jsonb
           AND (
               pg_catalog.char_length(
                   v_payload -> 'customer' ->> 'display_phone'
               ) > 64
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_payload -> 'customer' ->> 'display_phone',
                   'UTF8'
               )) > 256
           )
       )
       OR (
           v_payload -> 'customer' -> 'name' <> 'null'::jsonb
           AND (
               pg_catalog.char_length(
                   v_payload -> 'customer' ->> 'name'
               ) > 200
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_payload -> 'customer' ->> 'name',
                   'UTF8'
               )) > 800
           )
       )
       OR (
           v_payload -> 'customer' -> 'email' <> 'null'::jsonb
           AND (
               pg_catalog.char_length(
                   v_payload -> 'customer' ->> 'email'
               ) NOT BETWEEN 3 AND 320
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_payload -> 'customer' ->> 'email',
                   'UTF8'
               )) > 1280
           )
       )
       OR (
           v_payload -> 'customer' -> 'address' <> 'null'::jsonb
           AND (
               pg_catalog.char_length(
                   v_payload -> 'customer' ->> 'address'
               ) > 1000
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_payload -> 'customer' ->> 'address',
                   'UTF8'
               )) > 4096
           )
       )
       OR (
           v_payload -> 'customer' -> 'notes' <> 'null'::jsonb
           AND (
               pg_catalog.char_length(
                   v_payload -> 'customer' ->> 'notes'
               ) > 2000
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_payload -> 'customer' ->> 'notes',
                   'UTF8'
               )) > 8192
           )
       )
       OR EXISTS (
           SELECT 1
           FROM unnest(v_allowed_update_fields)
                AS update_state(update_field)
           WHERE v_payload -> 'customer' -> update_field = 'null'::jsonb
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_CUSTOMER_FIELD_INVALID';
    END IF;

    FOR v_item IN
        SELECT item_state.value, item_state.ordinality
        FROM pg_catalog.jsonb_array_elements(
                 v_payload -> 'items'
             ) WITH ORDINALITY AS item_state(value, ordinality)
        ORDER BY item_state.ordinality
    LOOP
        IF pg_catalog.jsonb_typeof(v_item.value)
           IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_ITEM_INVALID';
        END IF;

        SELECT pg_catalog.array_agg(item_key ORDER BY item_key)
        INTO v_item_keys
        FROM pg_catalog.jsonb_object_keys(v_item.value)
             AS item_key;

        IF v_item_keys IS DISTINCT FROM v_expected_item_keys
           OR pg_catalog.jsonb_typeof(v_item.value -> 'line_id')
              IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_item.value -> 'line_number')
              IS DISTINCT FROM 'number'
           OR pg_catalog.jsonb_typeof(v_item.value -> 'catalog_item_id')
              IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_item.value -> 'name_snapshot')
              IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_item.value -> 'quantity')
              IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(v_item.value -> 'unit_snapshot')
              IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(
                  v_item.value -> 'item_type_snapshot'
              ) IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(
                  v_item.value -> 'inventory_tracking_mode'
              ) IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(
                  v_item.value -> 'fulfillment_class'
              ) IS DISTINCT FROM 'string'
           OR v_item.value ->> 'line_number'
              IS DISTINCT FROM v_item.ordinality::text
           OR COALESCE(
                  v_item.value ->> 'quantity',
                  ''
              )
              !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$'
           OR pg_catalog.jsonb_typeof(
                  v_item.value -> 'modifiers'
              ) IS DISTINCT FROM 'array'
           OR pg_catalog.jsonb_array_length(
                  v_item.value -> 'modifiers'
               ) > 20 THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_ITEM_INVALID';
        END IF;

        IF v_item.value ->> 'line_id' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR v_item.value ->> 'catalog_item_id' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR v_item.value ->> 'item_type_snapshot'
              NOT IN ('product', 'service')
           OR v_item.value ->> 'inventory_tracking_mode'
              NOT IN (
                  'tracked_product',
                  'untracked_product',
                  'service'
              )
           OR v_item.value ->> 'fulfillment_class'
              NOT IN ('immediate', 'pickup', 'delivery', 'service')
           OR pg_catalog.char_length(v_item.value ->> 'name_snapshot')
              NOT BETWEEN 1 AND 300
           OR pg_catalog.octet_length(
                  pg_catalog.convert_to(
                      v_item.value ->> 'name_snapshot',
                      'UTF8'
                  )
              ) > 1200
           OR pg_catalog.char_length(v_item.value ->> 'unit_snapshot')
              NOT BETWEEN 1 AND 64
           OR pg_catalog.octet_length(
                  pg_catalog.convert_to(
                      v_item.value ->> 'unit_snapshot',
                      'UTF8'
                  )
              ) > 256
           OR (
               v_item.value -> 'line_note' <> 'null'::jsonb
               AND (
                   pg_catalog.jsonb_typeof(
                       v_item.value -> 'line_note'
                   ) IS DISTINCT FROM 'string'
                   OR pg_catalog.char_length(
                       v_item.value ->> 'line_note'
                   ) > 500
                   OR pg_catalog.octet_length(
                       pg_catalog.convert_to(
                           v_item.value ->> 'line_note',
                           'UTF8'
                       )
                   ) > 2048
               )
           )
           OR (
               v_item.value -> 'sku_snapshot' <> 'null'::jsonb
               AND (
                   pg_catalog.jsonb_typeof(
                       v_item.value -> 'sku_snapshot'
                   ) IS DISTINCT FROM 'string'
                   OR pg_catalog.char_length(
                       v_item.value ->> 'sku_snapshot'
                   ) NOT BETWEEN 1 AND 128
                   OR pg_catalog.octet_length(
                       pg_catalog.convert_to(
                           v_item.value ->> 'sku_snapshot',
                           'UTF8'
                       )
                   ) > 512
               )
           )
           OR (
               v_item.value -> 'category_snapshot' <> 'null'::jsonb
               AND (
                   pg_catalog.jsonb_typeof(
                       v_item.value -> 'category_snapshot'
                   ) IS DISTINCT FROM 'string'
                   OR pg_catalog.char_length(
                       v_item.value ->> 'category_snapshot'
                   ) NOT BETWEEN 1 AND 200
                   OR pg_catalog.octet_length(
                       pg_catalog.convert_to(
                           v_item.value ->> 'category_snapshot',
                           'UTF8'
                       )
                   ) > 800
               )
           ) THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_ITEM_INVALID';
        END IF;

        IF (v_item.value ->> 'quantity')::numeric <= 0 THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_ITEM_INVALID';
        END IF;

        BEGIN
            PERFORM (v_item.value ->> 'line_id')::uuid;
            PERFORM (v_item.value ->> 'catalog_item_id')::uuid;
        EXCEPTION
            WHEN invalid_text_representation THEN
                RAISE EXCEPTION USING
                    errcode = '22023',
                    message = 'PAYLOAD_ITEM_INVALID';
        END;

        FOR v_modifier IN
            SELECT modifier_state.value,
                   modifier_state.ordinality
            FROM pg_catalog.jsonb_array_elements(
                     v_item.value -> 'modifiers'
                 ) WITH ORDINALITY
                 AS modifier_state(value, ordinality)
            ORDER BY modifier_state.ordinality
        LOOP
            IF pg_catalog.jsonb_typeof(v_modifier.value)
               IS DISTINCT FROM 'object' THEN
                RAISE EXCEPTION USING
                    errcode = '22023',
                    message = 'PAYLOAD_MODIFIER_INVALID';
            END IF;

            SELECT pg_catalog.array_agg(
                modifier_key
                ORDER BY modifier_key
            )
            INTO v_modifier_keys
            FROM pg_catalog.jsonb_object_keys(v_modifier.value)
                 AS modifier_key;

            IF v_modifier_keys IS DISTINCT FROM
                  v_expected_modifier_keys
               OR pg_catalog.jsonb_typeof(
                      v_modifier.value -> 'modifier_id'
                  ) IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(
                      v_modifier.value -> 'modifier_type'
                  ) IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(
                      v_modifier.value -> 'value'
                  ) IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(
                      v_modifier.value -> 'quantity'
                  ) IS DISTINCT FROM 'string'
               OR pg_catalog.jsonb_typeof(
                      v_modifier.value -> 'price_adjustment'
                  ) IS DISTINCT FROM 'string'
               OR COALESCE(
                      v_modifier.value ->> 'quantity',
                      ''
                  )
                  !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$'
               OR COALESCE(
                      v_modifier.value ->> 'price_adjustment',
                      ''
                  )
                  !~ '^-?(0|[1-9][0-9]*)\.[0-9]{2}$'
               OR v_modifier.value ->> 'price_adjustment' =
                  '-0.00' THEN
                RAISE EXCEPTION USING
                    errcode = '22023',
                    message = 'PAYLOAD_MODIFIER_INVALID';
            END IF;

            IF v_modifier.value ->> 'modifier_id' !~
                  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               OR (
                   v_modifier.value -> 'option_id' <> 'null'::jsonb
                   AND (
                       pg_catalog.jsonb_typeof(
                           v_modifier.value -> 'option_id'
                       ) IS DISTINCT FROM 'string'
                       OR v_modifier.value ->> 'option_id' !~
                          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   )
               )
               OR pg_catalog.char_length(
                      v_modifier.value ->> 'modifier_type'
                  ) NOT BETWEEN 1 AND 64
               OR pg_catalog.octet_length(
                      pg_catalog.convert_to(
                          v_modifier.value ->> 'modifier_type',
                          'UTF8'
                      )
                  ) > 256
               OR pg_catalog.char_length(
                      v_modifier.value ->> 'value'
                  ) NOT BETWEEN 1 AND 256
               OR pg_catalog.octet_length(
                      pg_catalog.convert_to(
                          v_modifier.value ->> 'value',
                          'UTF8'
                      )
                  ) > 1024 THEN
                RAISE EXCEPTION USING
                    errcode = '22023',
                    message = 'PAYLOAD_MODIFIER_INVALID';
            END IF;

            IF (v_modifier.value ->> 'quantity')::numeric <= 0 THEN
                RAISE EXCEPTION USING
                    errcode = '22023',
                    message = 'PAYLOAD_MODIFIER_INVALID';
            END IF;

            BEGIN
                PERFORM
                    (v_modifier.value ->> 'modifier_id')::uuid;
                IF v_modifier.value -> 'option_id' <>
                   'null'::jsonb THEN
                    PERFORM
                        (v_modifier.value ->> 'option_id')::uuid;
                END IF;
            EXCEPTION
                WHEN invalid_text_representation THEN
                    RAISE EXCEPTION USING
                        errcode = '22023',
                        message = 'PAYLOAD_MODIFIER_INVALID';
            END;
        END LOOP;

        IF v_item.value -> 'modifiers' IS DISTINCT FROM (
            SELECT COALESCE(
                pg_catalog.jsonb_agg(
                    modifier_state.value
                    ORDER BY
                        pg_catalog.convert_to(
                            modifier_state.value ->> 'modifier_type',
                            'UTF8'
                        ),
                        modifier_state.value ->> 'modifier_id',
                        (
                            modifier_state.value -> 'option_id' =
                            'null'::jsonb
                        ) DESC,
                        modifier_state.value ->> 'option_id',
                        pg_catalog.convert_to(
                            modifier_state.value ->> 'value',
                            'UTF8'
                        ),
                        (modifier_state.value ->> 'quantity')::numeric,
                        modifier_state.value ->> 'quantity',
                        (
                            modifier_state.value ->>
                            'price_adjustment'
                        )::numeric,
                        modifier_state.value ->> 'price_adjustment'
                ),
                '[]'::jsonb
            )
            FROM pg_catalog.jsonb_array_elements(
                v_item.value -> 'modifiers'
            ) AS modifier_state(value)
        ) THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_MODIFIER_ORDER_INVALID';
        END IF;

        IF (
            SELECT pg_catalog.count(*)
            FROM (
                SELECT
                    modifier_state.value ->> 'modifier_id'
                        AS modifier_id
                FROM pg_catalog.jsonb_array_elements(
                         v_item.value -> 'modifiers'
                     ) AS modifier_state(value)
                GROUP BY
                    modifier_state.value ->> 'modifier_id'
                HAVING pg_catalog.count(*) > 1
            ) AS duplicate_modifier
        ) <> 0 THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_MODIFIER_DUPLICATE';
        END IF;
    END LOOP;

    IF (
        SELECT pg_catalog.count(*)
        FROM (
            SELECT item_state.value ->> 'line_id' AS line_id
            FROM pg_catalog.jsonb_array_elements(
                     v_payload -> 'items'
                 ) AS item_state(value)
            GROUP BY item_state.value ->> 'line_id'
            HAVING pg_catalog.count(*) > 1
        ) AS duplicate_line
    ) <> 0 THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_LINE_DUPLICATE';
    END IF;

    IF v_payload -> 'pricing' ->> 'currency'
       IS DISTINCT FROM 'SAR'
       OR v_payload -> 'pricing' ->> 'currency_precision'
          IS DISTINCT FROM '2'
       OR v_payload -> 'pricing' ->> 'rounding_strategy'
          IS DISTINCT FROM 'invoice-half-up-v1'
       OR v_payload -> 'pricing' ->> 'quote_version'
          IS DISTINCT FROM 'financial-quote-v1'
       OR v_payload -> 'pricing' ->> 'financial_engine_version'
          IS DISTINCT FROM 'financial-engine-v2-r1'
       OR COALESCE(
              v_payload -> 'pricing' ->> 'subtotal',
              ''
          )
          !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
       OR COALESCE(
              v_payload -> 'pricing' ->> 'taxable_subtotal',
              ''
          )
          !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
       OR COALESCE(
              v_payload -> 'pricing' ->> 'total',
              ''
          )
          !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'pricing' -> 'lines'
          ) IS DISTINCT FROM 'array'
       OR pg_catalog.jsonb_array_length(
              v_payload -> 'pricing' -> 'lines'
          ) IS DISTINCT FROM
          pg_catalog.jsonb_array_length(
              v_payload -> 'items'
          )
       OR COALESCE(
              v_payload -> 'metadata' ->> 'source_channel',
              ''
          )
          NOT IN ('pos', 'admin', 'api') THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_PRICING_INVALID';
    END IF;

    IF COALESCE(v_payload -> 'pricing' ->> 'price_version', '') = ''
       OR COALESCE(v_payload -> 'pricing' ->> 'quote_reference', '') = ''
       OR pg_catalog.char_length(
              v_payload -> 'pricing' ->> 'quote_reference'
          ) > 256
       OR pg_catalog.octet_length(pg_catalog.convert_to(
              v_payload -> 'pricing' ->> 'quote_reference',
              'UTF8'
          )) > 1024
       OR COALESCE(v_payload -> 'pricing' ->> 'quote_fingerprint', '')
          !~ '^[0-9a-f]{64}$'
       OR COALESCE(
              v_payload -> 'versions' ->> 'financial_engine',
              ''
          ) <> 'financial-engine-v2-r1'
       OR v_payload -> 'versions' ->> 'payload_contract' <>
          'order-command-payload-v1' THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_PRICING_OR_VERSION_INVALID';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            VALUES
                (v_payload -> 'pricing' ->> 'price_version'),
                (
                    v_payload -> 'pricing' ->>
                    'branch_pricing_version'
                ),
                (v_payload -> 'vat' ->> 'rule_version'),
                (
                    v_payload -> 'discount' ->>
                    'eligibility_version'
                ),
                (v_payload -> 'discount' ->> 'rule_version'),
                (v_payload -> 'payment' ->> 'rule_version')
        ) AS bounded_version(version_value)
        WHERE bounded_version.version_value IS NOT NULL
          AND (
              pg_catalog.char_length(
                  bounded_version.version_value
              ) NOT BETWEEN 1 AND 128
              OR pg_catalog.octet_length(pg_catalog.convert_to(
                  bounded_version.version_value,
                  'UTF8'
              )) > 512
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_BOUNDED_VERSION_INVALID';
    END IF;

    FOR v_pricing_line IN
        SELECT pricing_line.value, pricing_line.ordinality
        FROM pg_catalog.jsonb_array_elements(
                 v_payload -> 'pricing' -> 'lines'
             ) WITH ORDINALITY AS pricing_line(value, ordinality)
        ORDER BY pricing_line.ordinality
    LOOP
        IF pg_catalog.jsonb_typeof(v_pricing_line.value)
              IS DISTINCT FROM 'object'
           OR (
               SELECT pg_catalog.array_agg(key_name ORDER BY key_name)
               FROM pg_catalog.jsonb_object_keys(v_pricing_line.value)
                    AS key_name
           ) IS DISTINCT FROM v_expected_pricing_line_keys
           OR EXISTS (
               SELECT 1
               FROM unnest(ARRAY[
                   'line_id', 'unit_price', 'pricing_source',
                   'source_catalog_id', 'source_catalog_version',
                   'gross_amount', 'discount_allocation',
                   'taxable_amount', 'vat_amount', 'net_amount'
               ]::text[]) AS required_string(field_name)
               WHERE pg_catalog.jsonb_typeof(
                         v_pricing_line.value -> field_name
                     ) IS DISTINCT FROM 'string'
           )
           OR EXISTS (
               SELECT 1
               FROM unnest(ARRAY[
                   'source_branch_price_id',
                   'source_branch_price_version'
               ]::text[]) AS nullable_string(field_name)
               WHERE pg_catalog.jsonb_typeof(
                         v_pricing_line.value -> field_name
                     ) NOT IN ('string', 'null')
           )
           OR v_pricing_line.value ->> 'line_id' IS DISTINCT FROM
              v_payload -> 'items' ->
                  (v_pricing_line.ordinality::integer - 1) ->> 'line_id'
           OR v_pricing_line.value ->> 'source_catalog_id'
              IS DISTINCT FROM
              v_payload -> 'items' ->
                  (v_pricing_line.ordinality::integer - 1) ->>
                  'catalog_item_id'
           OR v_pricing_line.value ->> 'source_catalog_id' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR COALESCE(
                  v_pricing_line.value ->> 'source_catalog_version',
                  ''
              ) = ''
           OR pg_catalog.char_length(
                  v_pricing_line.value ->> 'source_catalog_version'
              ) > 128
           OR pg_catalog.octet_length(pg_catalog.convert_to(
                  v_pricing_line.value ->> 'source_catalog_version',
                  'UTF8'
              )) > 512
           OR v_pricing_line.value ->> 'pricing_source'
              NOT IN ('catalog_default', 'branch_override')
           OR EXISTS (
               SELECT 1
               FROM unnest(ARRAY[
                   'unit_price', 'gross_amount',
                   'discount_allocation', 'taxable_amount',
                   'vat_amount', 'net_amount'
               ]::text[]) AS money_state(money_key)
               WHERE COALESCE(
                   v_pricing_line.value ->> money_key,
                   ''
               ) !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
           ) THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_PRICING_LINE_INVALID';
        END IF;

        IF v_pricing_line.value ->> 'pricing_source' =
           'catalog_default' THEN
            IF v_pricing_line.value -> 'source_branch_price_id' <>
                  'null'::jsonb
               OR v_pricing_line.value ->
                  'source_branch_price_version' <> 'null'::jsonb THEN
                RAISE EXCEPTION USING
                    errcode = '22023',
                    message = 'PAYLOAD_PRICING_SOURCE_INVALID';
            END IF;
        ELSE
            v_has_branch_override := true;
            IF COALESCE(
                   v_pricing_line.value ->> 'source_branch_price_id',
                   ''
               ) !~
               '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               OR COALESCE(
                   v_pricing_line.value ->>
                   'source_branch_price_version',
                   ''
               ) = ''
               OR pg_catalog.char_length(
                   v_pricing_line.value ->>
                   'source_branch_price_version'
               ) > 128
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_pricing_line.value ->>
                   'source_branch_price_version',
                   'UTF8'
               )) > 512 THEN
                RAISE EXCEPTION USING
                    errcode = '22023',
                    message = 'PAYLOAD_PRICING_SOURCE_INVALID';
            END IF;
        END IF;
    END LOOP;

    IF (
        v_has_branch_override
        AND pg_catalog.jsonb_typeof(
            v_payload -> 'pricing' -> 'branch_pricing_version'
        ) IS DISTINCT FROM 'string'
    )
       OR (
           NOT v_has_branch_override
           AND v_payload -> 'pricing' -> 'branch_pricing_version' <>
               'null'::jsonb
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_BRANCH_PRICING_VERSION_INVALID';
    END IF;

    IF v_payload -> 'vat' ->> 'mode'
          NOT IN ('exclusive', 'inclusive', 'exempt', 'zero_rated')
       OR pg_catalog.jsonb_typeof(
              v_payload -> 'vat' -> 'tax_inclusive'
          ) IS DISTINCT FROM 'boolean'
       OR COALESCE(v_payload -> 'vat' ->> 'rate', '')
          !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$'
       OR COALESCE(v_payload -> 'vat' ->> 'amount', '')
          !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
       OR COALESCE(v_payload -> 'vat' ->> 'effective_at', '')
          !~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{6}Z$'
       OR pg_catalog.to_char(
              (v_payload -> 'vat' ->> 'effective_at')::
                  timestamp with time zone AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ) IS DISTINCT FROM
          v_payload -> 'vat' ->> 'effective_at'
       OR (
           v_payload -> 'vat' -> 'setting_id' <> 'null'::jsonb
           AND v_payload -> 'vat' ->> 'setting_id' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_VAT_INVALID';
    END IF;

    IF (
        v_payload -> 'vat' ->> 'mode' = 'inclusive'
    ) IS DISTINCT FROM (
        v_payload -> 'vat' ->> 'tax_inclusive'
    )::boolean
       OR (
           v_payload -> 'vat' ->> 'mode' IN ('exclusive', 'inclusive')
           AND (
               (v_payload -> 'vat' ->> 'rate')::numeric <= 0
               OR v_payload -> 'vat' -> 'setting_id' = 'null'::jsonb
           )
       )
       OR (
           v_payload -> 'vat' ->> 'mode' IN ('exempt', 'zero_rated')
           AND (v_payload -> 'vat' ->> 'rate')::numeric <> 0
       )
       OR (
           v_payload -> 'vat' ->> 'mode' = 'zero_rated'
           AND v_payload -> 'vat' -> 'setting_id' = 'null'::jsonb
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_VAT_STATE_INVALID';
    END IF;

    v_discount_source := v_payload -> 'discount' ->> 'source';
    IF v_discount_source NOT IN ('none', 'rule', 'manual')
       OR COALESCE(v_payload -> 'discount' ->> 'amount', '')
          !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$' THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_DISCOUNT_INVALID';
    ELSIF v_discount_source = 'none' THEN
        IF EXISTS (
            SELECT 1
            FROM unnest(ARRAY[
                'id', 'name_snapshot', 'type', 'value',
                'eligibility_version', 'rule_version'
            ]::text[]) AS nullable_state(nullable_key)
            WHERE v_payload -> 'discount' -> nullable_key <>
                  'null'::jsonb
        )
           OR v_payload -> 'discount' ->> 'amount' <> '0.00' THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_DISCOUNT_STATE_INVALID';
        END IF;
    ELSIF v_discount_source = 'rule' THEN
        IF COALESCE(v_payload -> 'discount' ->> 'id', '') !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR COALESCE(
                  v_payload -> 'discount' ->> 'name_snapshot',
                  ''
              ) = ''
           OR v_payload -> 'discount' ->> 'type'
              NOT IN ('percentage', 'fixed')
           OR v_payload -> 'discount' -> 'eligibility_version' =
              'null'::jsonb
           OR v_payload -> 'discount' -> 'rule_version' =
              'null'::jsonb THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_DISCOUNT_STATE_INVALID';
        END IF;
    ELSE
        IF v_payload -> 'discount' -> 'id' <> 'null'::jsonb
           OR COALESCE(
                  v_payload -> 'discount' ->> 'name_snapshot',
                  ''
              ) = ''
           OR v_payload -> 'discount' ->> 'type'
              NOT IN ('percentage', 'fixed')
           OR v_payload -> 'discount' -> 'eligibility_version' <>
              'null'::jsonb
           OR v_payload -> 'discount' -> 'rule_version' =
              'null'::jsonb THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_DISCOUNT_STATE_INVALID';
        END IF;
    END IF;

    IF v_payload -> 'discount' -> 'name_snapshot' <> 'null'::jsonb
       AND (
           pg_catalog.char_length(
               v_payload -> 'discount' ->> 'name_snapshot'
           ) NOT BETWEEN 1 AND 200
           OR pg_catalog.octet_length(pg_catalog.convert_to(
               v_payload -> 'discount' ->> 'name_snapshot',
               'UTF8'
           )) > 800
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_DISCOUNT_NAME_INVALID';
    END IF;

    IF v_discount_source <> 'none'
       AND (
           (
               v_payload -> 'discount' ->> 'type' = 'percentage'
               AND (
                   COALESCE(v_payload -> 'discount' ->> 'value', '')
                      !~ '^(0|[1-9][0-9]*)(\.[0-9]{0,2}[1-9])?$'
                   OR (v_payload -> 'discount' ->> 'value')::numeric
                      NOT BETWEEN 0 AND 100
               )
           )
           OR (
               v_payload -> 'discount' ->> 'type' = 'fixed'
               AND COALESCE(
                   v_payload -> 'discount' ->> 'value',
                   ''
               ) !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
           )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_DISCOUNT_VALUE_INVALID';
    END IF;

    v_payment_method := v_payload -> 'payment' ->> 'method';
    IF v_payment_method NOT IN ('mada', 'cash', 'visa', 'cod')
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'amount_tendered', 'remaining_from_customer',
               'cash_change'
           ]::text[]) AS money_state(money_key)
           WHERE COALESCE(v_payload -> 'payment' ->> money_key, '')
                 !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_PAYMENT_INVALID';
    END IF;

    IF (
        v_payload -> 'payment' -> 'cash_received' <> 'null'::jsonb
        AND (
            pg_catalog.jsonb_typeof(
                v_payload -> 'payment' -> 'cash_received'
            ) IS DISTINCT FROM 'string'
            OR COALESCE(
                v_payload -> 'payment' ->> 'cash_received',
                ''
            ) !~ '^(0|[1-9][0-9]*)\.[0-9]{2}$'
        )
    )
       OR (
           v_payload -> 'payment' -> 'provider_reference' <>
           'null'::jsonb
           AND (
               pg_catalog.jsonb_typeof(
                   v_payload -> 'payment' -> 'provider_reference'
               ) IS DISTINCT FROM 'string'
               OR pg_catalog.char_length(
                   v_payload -> 'payment' ->> 'provider_reference'
               ) NOT BETWEEN 1 AND 256
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_payload -> 'payment' ->> 'provider_reference',
                   'UTF8'
               )) > 1024
           )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_PAYMENT_EVIDENCE_INVALID';
    END IF;

    IF v_payment_method = 'cash' THEN
        IF v_payload -> 'payment' ->> 'expected_status' <> 'paid'
           OR v_payload -> 'payment' -> 'cash_received' = 'null'::jsonb
           OR v_payload -> 'payment' ->> 'remaining_from_customer' <>
              '0.00'
           OR v_payload -> 'payment' -> 'provider_reference' <>
              'null'::jsonb
           OR (v_payload -> 'payment' ->> 'cash_received')::numeric <
              (v_payload -> 'pricing' ->> 'total')::numeric THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_PAYMENT_STATE_INVALID';
        END IF;
    ELSIF v_payment_method IN ('mada', 'visa') THEN
        IF v_payload -> 'payment' ->> 'expected_status' <> 'paid'
           OR v_payload -> 'payment' -> 'cash_received' <> 'null'::jsonb
           OR v_payload -> 'payment' ->> 'remaining_from_customer' <>
              '0.00'
           OR v_payload -> 'payment' ->> 'cash_change' <> '0.00'
           OR v_payload -> 'payment' ->> 'amount_tendered' <>
              v_payload -> 'pricing' ->> 'total' THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_PAYMENT_STATE_INVALID';
        END IF;
    ELSE
        IF v_payload -> 'payment' ->> 'expected_status' <> 'pending'
           OR v_payload -> 'payment' -> 'cash_received' = 'null'::jsonb
           OR v_payload -> 'payment' ->> 'cash_change' <> '0.00'
           OR v_payload -> 'payment' -> 'provider_reference' <>
              'null'::jsonb THEN
            RAISE EXCEPTION USING
                errcode = '22023',
                message = 'PAYLOAD_PAYMENT_STATE_INVALID';
        END IF;
    END IF;

    v_fulfillment_method :=
        v_payload -> 'fulfillment' ->> 'method';
    IF v_fulfillment_method
          NOT IN ('immediate', 'pickup', 'delivery', 'service')
       OR v_payload -> 'fulfillment' ->> 'branch_id'
          IS DISTINCT FROM p_branch_id::text
       OR (
           v_payload -> 'fulfillment' -> 'requested_at' <>
           'null'::jsonb
           AND (
               v_payload -> 'fulfillment' ->> 'requested_at' !~
               '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{6}Z$'
               OR pg_catalog.to_char(
                   (v_payload -> 'fulfillment' ->> 'requested_at')::
                       timestamp with time zone AT TIME ZONE 'UTC',
                   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
               ) IS DISTINCT FROM
               v_payload -> 'fulfillment' ->> 'requested_at'
           )
       )
       OR (
           v_fulfillment_method = 'immediate'
           AND v_payload -> 'fulfillment' -> 'requested_at' <>
               'null'::jsonb
       )
       OR (
           v_fulfillment_method = 'delivery'
           AND COALESCE(
               v_payload -> 'fulfillment' ->> 'address',
               ''
           ) = ''
       )
       OR (
           v_fulfillment_method <> 'delivery'
           AND v_payload -> 'fulfillment' -> 'address' <>
               'null'::jsonb
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_FULFILLMENT_STATE_INVALID';
    END IF;

    IF (
        v_payload -> 'fulfillment' -> 'instructions' <> 'null'::jsonb
        AND (
            pg_catalog.jsonb_typeof(
                v_payload -> 'fulfillment' -> 'instructions'
            ) IS DISTINCT FROM 'string'
            OR pg_catalog.char_length(
                v_payload -> 'fulfillment' ->> 'instructions'
            ) > 1000
            OR pg_catalog.octet_length(pg_catalog.convert_to(
                v_payload -> 'fulfillment' ->> 'instructions',
                'UTF8'
            )) > 4096
        )
    )
       OR (
           v_payload -> 'fulfillment' -> 'address' <> 'null'::jsonb
           AND (
               pg_catalog.char_length(
                   v_payload -> 'fulfillment' ->> 'address'
               ) > 1000
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_payload -> 'fulfillment' ->> 'address',
                   'UTF8'
               )) > 4096
           )
       )
       OR (
           v_payload -> 'order' -> 'note' <> 'null'::jsonb
           AND (
               pg_catalog.jsonb_typeof(
                   v_payload -> 'order' -> 'note'
               ) IS DISTINCT FROM 'string'
               OR pg_catalog.char_length(
                   v_payload -> 'order' ->> 'note'
               ) > 2000
               OR pg_catalog.octet_length(pg_catalog.convert_to(
                   v_payload -> 'order' ->> 'note',
                   'UTF8'
               )) > 8192
           )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_TEXT_LIMIT_INVALID';
    END IF;

    IF v_payload -> 'metadata' ->> 'source_channel'
          NOT IN ('pos', 'admin', 'api')
       OR COALESCE(
              v_payload -> 'metadata' ->> 'correlation_id',
              ''
          ) !~ '^[A-Za-z0-9._:-]{1,128}$'
       OR v_payload -> 'metadata' ->> 'correlation_id'
          IS DISTINCT FROM p_correlation_reference
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'request_reference', 'offline_draft_id', 'device_id',
               'pos_terminal_id', 'client_version'
           ]::text[]) AS metadata_state(metadata_key)
           WHERE v_payload -> 'metadata' -> metadata_key <>
                 'null'::jsonb
             AND (
                 pg_catalog.jsonb_typeof(
                     v_payload -> 'metadata' -> metadata_key
                 ) IS DISTINCT FROM 'string'
                 OR pg_catalog.octet_length(pg_catalog.convert_to(
                     v_payload -> 'metadata' ->> metadata_key,
                     'UTF8'
                 )) > 512
             )
       )
       OR (
           v_payload -> 'metadata' -> 'offline_draft_id' <>
           'null'::jsonb
           AND COALESCE(
               v_payload -> 'metadata' ->> 'offline_draft_id',
               ''
           ) !~
           '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|pos-draft-[A-Za-z0-9._:-]+)$'
       )
       OR (
           v_payload -> 'metadata' -> 'offline_draft_id' <>
           'null'::jsonb
           AND pg_catalog.octet_length(pg_catalog.convert_to(
               v_payload -> 'metadata' ->> 'offline_draft_id',
               'UTF8'
           )) > 128
       )
       OR EXISTS (
           SELECT 1
           FROM unnest(ARRAY[
               'device_id', 'pos_terminal_id'
           ]::text[]) AS identity_state(identity_key)
           WHERE v_payload -> 'metadata' -> identity_key <>
                 'null'::jsonb
             AND COALESCE(
                 v_payload -> 'metadata' ->> identity_key,
                 ''
             ) !~ '^[A-Za-z0-9._:-]{1,128}$'
       )
       OR (
           v_payload -> 'metadata' -> 'client_version' <>
           'null'::jsonb
           AND COALESCE(
               v_payload -> 'metadata' ->> 'client_version',
               ''
           ) !~ '^[A-Za-z0-9._:+-]{1,64}$'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_METADATA_INVALID';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
            'customer_engine', 'financial_engine',
            'inventory_engine', 'numbering_engine',
            'authorization_contract', 'payload_contract'
        ]::text[]) AS version_state(version_key)
        WHERE pg_catalog.jsonb_typeof(
                  v_payload -> 'versions' -> version_key
              ) IS DISTINCT FROM 'string'
           OR pg_catalog.char_length(
                  v_payload -> 'versions' ->> version_key
              ) NOT BETWEEN 1 AND 128
           OR pg_catalog.octet_length(pg_catalog.convert_to(
                  v_payload -> 'versions' ->> version_key,
                  'UTF8'
              )) > 512
    ) THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'PAYLOAD_VERSION_FIELD_INVALID';
    END IF;

    SELECT COALESCE(
        pg_catalog.jsonb_agg(
            pricing_line.value - 'net_amount'
            ORDER BY pricing_line.ordinality
        ),
        '[]'::jsonb
    )
    INTO v_pricing_lines
    FROM pg_catalog.jsonb_array_elements(
             v_payload -> 'pricing' -> 'lines'
         ) WITH ORDINALITY AS pricing_line(value, ordinality);

    v_expected_projection :=
        v_payload
        - 'fingerprint_version'
        - 'issuance'
        - 'retention'
        - 'archive';

    v_expected_projection := pg_catalog.jsonb_set(
        v_expected_projection,
        '{metadata}',
        pg_catalog.jsonb_build_object(
            'source_channel',
            v_payload -> 'metadata' -> 'source_channel'
        ),
        false
    );

    v_expected_projection := pg_catalog.jsonb_set(
        v_expected_projection,
        '{payment}',
        (v_payload -> 'payment')
            - 'masked_instrument'
            - 'provider_reference',
        false
    );

    v_expected_projection := pg_catalog.jsonb_set(
        v_expected_projection,
        '{versions}',
        (v_payload -> 'versions') - 'payload_contract',
        false
    );

    v_expected_projection := pg_catalog.jsonb_set(
        v_expected_projection,
        '{pricing,lines}',
        v_pricing_lines,
        false
    );

    IF v_projection IS DISTINCT FROM v_expected_projection THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'FINGERPRINT_PROJECTION_INVALID';
    END IF;

    v_canonical_projection :=
        public.canonicalize_atomic_order_json_v1(
            v_expected_projection
        );

    IF p_fingerprint_projection IS DISTINCT FROM
       v_canonical_projection THEN
        RAISE EXCEPTION USING
            errcode = '22023',
            message = 'FINGERPRINT_CANONICAL_BYTES_INVALID';
    END IF;

    v_request_fingerprint := pg_catalog.sha256(
        pg_catalog.convert_to(
            v_canonical_projection,
            'UTF8'
        )
    );

    v_idempotency_hash := pg_catalog.sha256(
        pg_catalog.convert_to(v_idempotency_key, 'UTF8')
    );

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            p_tenant_id::text || '|' ||
            p_branch_id::text || '|order.create|' ||
            pg_catalog.encode(v_idempotency_hash, 'hex'),
            0
        )
    );

    SELECT
        command_state.id,
        command_state.authorization_context_id,
        command_state.correlation_reference,
        command_state.execution_status,
        command_state.response_version,
        command_state.response_snapshot,
        command_state.completed_at,
        command_state.error_code,
        command_state.error_detail,
        command_state.last_failure_stage,
        command_state.request_fingerprint,
        command_state.fingerprint_version
    INTO v_existing
    FROM public.atomic_order_commands AS command_state
    WHERE command_state.tenant_id = p_tenant_id
      AND command_state.branch_id = p_branch_id
      AND command_state.command_type = 'order.create'
      AND command_state.idempotency_key_hash =
          v_idempotency_hash
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.fingerprint_version IS DISTINCT FROM 1
           OR v_existing.request_fingerprint IS DISTINCT FROM
              v_request_fingerprint THEN
            RETURN QUERY
            SELECT
                'fingerprint_conflict'::text,
                NULL::uuid,
                v_existing.id::uuid,
                v_existing.correlation_reference::text,
                v_existing.execution_status::text,
                NULL::text,
                NULL::jsonb,
                NULL::timestamp with time zone,
                NULL::text,
                NULL::text,
                NULL::text,
                v_existing.request_fingerprint::bytea;
            RETURN;
        END IF;

        IF v_existing.execution_status IN (
            'succeeded',
            'failed_final'
        ) THEN
            RETURN QUERY
            SELECT
                'replay'::text,
                v_existing.authorization_context_id::uuid,
                v_existing.id::uuid,
                v_existing.correlation_reference::text,
                v_existing.execution_status::text,
                v_existing.response_version::text,
                v_existing.response_snapshot::jsonb,
                v_existing.completed_at::
                    timestamp with time zone,
                v_existing.error_code::text,
                v_existing.error_detail::text,
                v_existing.last_failure_stage::text,
                v_existing.request_fingerprint::bytea;
            RETURN;
        END IF;

        RETURN QUERY
        SELECT
            'in_progress'::text,
            v_existing.authorization_context_id::uuid,
            v_existing.id::uuid,
            v_existing.correlation_reference::text,
            v_existing.execution_status::text,
            NULL::text,
            NULL::jsonb,
            NULL::timestamp with time zone,
            NULL::text,
            NULL::text,
            NULL::text,
            v_existing.request_fingerprint::bytea;
        RETURN;
    END IF;

    v_now := pg_catalog.transaction_timestamp();
    v_context_id := pg_catalog.gen_random_uuid();
    v_command_id := pg_catalog.gen_random_uuid();

    v_reference_hash := pg_catalog.sha256(
        pg_catalog.convert_to(
            v_context_id::text || '|' ||
            p_authenticated_actor_id::text || '|' ||
            p_tenant_id::text || '|' ||
            p_branch_id::text || '|order.create|' ||
            pg_catalog.encode(v_idempotency_hash, 'hex') || '|' ||
            pg_catalog.encode(v_request_fingerprint, 'hex') || '|' ||
            p_correlation_reference || '|' ||
            v_now::text,
            'UTF8'
        )
    );

    INSERT INTO public.atomic_authorization_contexts (
        id,
        context_version,
        authenticated_actor_id,
        tenant_id,
        branch_id,
        role_snapshot,
        capability_version,
        employee_source,
        employee_source_id,
        command_type,
        idempotency_key_hash,
        request_fingerprint,
        fingerprint_version,
        reference_hash,
        correlation_reference,
        issued_at,
        expires_at,
        revoked_at,
        revocation_code,
        consumed_at,
        consumed_command_id,
        consumption_kind,
        created_by_identity
    )
    VALUES (
        v_context_id,
        1,
        p_authenticated_actor_id,
        p_tenant_id,
        p_branch_id,
        v_role_snapshot,
        v_capability_version,
        v_employee_source,
        v_employee_source_id,
        'order.create',
        v_idempotency_hash,
        v_request_fingerprint,
        1,
        v_reference_hash,
        p_correlation_reference,
        v_now,
        v_now + interval '120 seconds',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        SESSION_USER
    );

    INSERT INTO public.atomic_order_commands (
        id,
        command_version,
        command_type,
        tenant_id,
        branch_id,
        idempotency_key_hash,
        request_fingerprint,
        fingerprint_version,
        authorization_context_id,
        authenticated_actor_id,
        correlation_reference,
        engine_version,
        execution_status,
        lease_owner,
        lease_expires_at,
        attempt_count,
        order_id,
        invoice_id,
        order_number,
        response_version,
        response_snapshot,
        error_code,
        error_detail,
        last_failure_stage,
        first_started_at,
        last_started_at,
        completed_at,
        failed_at,
        created_at,
        updated_at,
        created_by_identity,
        command_retain_until,
        response_retain_until
    )
    VALUES (
        v_command_id,
        1,
        'order.create',
        p_tenant_id,
        p_branch_id,
        v_idempotency_hash,
        v_request_fingerprint,
        1,
        v_context_id,
        p_authenticated_actor_id,
        p_correlation_reference,
        1,
        'reserved',
        NULL,
        NULL,
        0,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        v_now,
        v_now,
        SESSION_USER,
        p_retain_until,
        p_retain_until
    );

    INSERT INTO public.atomic_order_command_payloads (
        command_id,
        payload_version,
        fingerprint_version,
        canonical_payload,
        request_fingerprint,
        canonical_size_bytes,
        created_at,
        created_by_identity,
        retain_until,
        archived_at,
        archive_reference,
        archive_hash
    )
    VALUES (
        v_command_id,
        'order-command-payload-v1',
        'order-request-fingerprint-v1',
        v_payload,
        v_request_fingerprint,
        v_payload_size,
        v_now,
        SESSION_USER,
        p_retain_until,
        NULL,
        NULL,
        NULL
    );

    RETURN QUERY
    SELECT
        'created'::text,
        v_context_id,
        v_command_id,
        p_correlation_reference,
        'reserved'::text,
        NULL::text,
        NULL::jsonb,
        NULL::timestamp with time zone,
        NULL::text,
        NULL::text,
        NULL::text,
        v_request_fingerprint;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'PERSISTENCE_CONTRACT_VIOLATION';
END
$function$;

REVOKE ALL
ON FUNCTION public.acquire_atomic_order_command_v1(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    timestamp with time zone
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.acquire_atomic_order_command_v1(
    uuid,
    uuid,
    uuid,
    text,
    text,
    text,
    text,
    timestamp with time zone
)
TO afex_core_runtime;

RESET ROLE;

DO $verification$
DECLARE
    function_oid oid;
    canonicalizer_oid oid;
    function_owner_oid oid;
    runtime_role_oid oid;
    forbidden_role text;
BEGIN
    function_oid := pg_catalog.to_regprocedure(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
    );
    canonicalizer_oid := pg_catalog.to_regprocedure(
        'public.canonicalize_atomic_order_json_v1(jsonb)'
    );

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    SELECT role_state.oid
    INTO runtime_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_runtime';

    IF function_oid IS NULL
       OR canonicalizer_oid IS NULL
       OR (
           SELECT procedure_state.proowner =
                      function_owner_oid
                  AND procedure_state.prosecdef
                  AND procedure_state.provolatile = 'v'
                  AND procedure_state.proparallel = 'u'
                  AND procedure_state.prokind = 'f'
                  AND procedure_state.proconfig =
                      ARRAY['search_path=pg_catalog']::text[]
           FROM pg_catalog.pg_proc AS procedure_state
           WHERE procedure_state.oid = function_oid
       ) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: function security contract mismatch';
    END IF;

    IF (
        SELECT procedure_state.proowner =
                   function_owner_oid
               AND NOT procedure_state.prosecdef
               AND procedure_state.provolatile = 'i'
               AND procedure_state.proparallel = 's'
               AND procedure_state.proisstrict
               AND procedure_state.proconfig =
                   ARRAY['search_path=pg_catalog']::text[]
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = canonicalizer_oid
    ) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: canonicalizer contract mismatch';
    END IF;

    IF (
        SELECT pg_catalog.encode(
            pg_catalog.sha256(
                pg_catalog.convert_to(
                    pg_catalog.btrim(
                        pg_catalog.regexp_replace(
                            procedure_state.prosrc,
                            E'\\s+',
                            ' ',
                            'g'
                        )
                    ),
                    'UTF8'
                )
            ),
            'hex'
        )
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = canonicalizer_oid
    ) IS DISTINCT FROM
      'e3f5d8c53f673254e5529ceaf54c8e18640e550109db230ddc902a1e8584c2da'
       OR (
           SELECT pg_catalog.encode(
               pg_catalog.sha256(
                   pg_catalog.convert_to(
                       pg_catalog.btrim(
                           pg_catalog.regexp_replace(
                               procedure_state.prosrc,
                               E'\\s+',
                               ' ',
                               'g'
                           )
                       ),
                       'UTF8'
                   )
               ),
               'hex'
           )
           FROM pg_catalog.pg_proc AS procedure_state
           WHERE procedure_state.oid = function_oid
       ) IS DISTINCT FROM
         '721dc8d635a1fc7682073c1ec70cad71759367ce3bc21ad15b63803974c756d6'
    THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: exact function source contract mismatch';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid =
              pg_catalog.to_regclass(
                  'public.atomic_order_command_payloads'
              )
          AND constraint_state.conname =
              'atomic_order_command_payloads_canonical_size_binding_check'
          AND constraint_state.convalidated
          AND pg_catalog.pg_get_constraintdef(
                  constraint_state.oid,
                  true
              ) LIKE '%canonicalize_atomic_order_json_v1%'
          AND pg_catalog.pg_get_constraintdef(
                  constraint_state.oid,
                  true
              ) LIKE '%canonical_size_bytes%'
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: canonical size binding mismatch';
    END IF;

    IF pg_catalog.pg_get_function_result(function_oid)
       IS DISTINCT FROM
       'TABLE(acquisition_result text, authorization_context_id uuid, atomic_command_id uuid, correlation_reference text, command_status text, response_version text, response_snapshot jsonb, completed_at timestamp with time zone, error_code text, error_detail text, last_failure_stage text, stored_request_fingerprint bytea)' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: typed result contract mismatch';
    END IF;

    IF NOT pg_catalog.has_function_privilege(
        'afex_core_runtime',
        function_oid,
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: runtime EXECUTE is absent';
    END IF;

    FOREACH forbidden_role IN ARRAY ARRAY[
        'anon',
        'authenticated',
        'service_role',
        'afex_context_issuer',
        'afex_outbox_worker'
    ]::text[]
    LOOP
        IF pg_catalog.has_function_privilege(
            forbidden_role,
            function_oid,
            'EXECUTE'
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.20 verification failed: forbidden EXECUTE exists',
                detail = forbidden_role;
        END IF;
    END LOOP;

    FOREACH forbidden_role IN ARRAY ARRAY[
        'public',
        'anon',
        'authenticated',
        'service_role',
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker'
    ]::text[]
    LOOP
        IF pg_catalog.has_function_privilege(
            forbidden_role,
            canonicalizer_oid,
            'EXECUTE'
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.20 verification failed: forbidden canonicalizer EXECUTE exists',
                detail = forbidden_role;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = function_oid
          AND procedure_state.proacl IS NOT NULL
          AND (CASE
              WHEN pg_catalog.cardinality(procedure_state.proacl) > 0
                   AND pg_catalog.array_ndims(procedure_state.proacl)
                       IS DISTINCT FROM 1
                  THEN true
              WHEN pg_catalog.array_ndims(procedure_state.proacl) = 1
                  THEN pg_catalog.array_position(
                      procedure_state.proacl,
                      NULL::aclitem
                  ) IS NOT NULL
              ELSE false
          END)
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: malformed function ACL array';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure_state
        CROSS JOIN LATERAL pg_catalog.unnest(
            COALESCE(
                procedure_state.proacl,
                pg_catalog.acldefault(
                    'f',
                    procedure_state.proowner
                )
            )
        ) AS acl_item(value)
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            ARRAY[acl_item.value]::aclitem[]
        ) AS acl_state
        WHERE procedure_state.oid = function_oid
          AND acl_state.grantee NOT IN (
              function_owner_oid,
              runtime_role_oid
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: unexpected function ACL grantee';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_policy AS policy_state
        WHERE (
            policy_state.polrelid =
                pg_catalog.to_regclass('public.profiles')
            AND policy_state.polname =
                'core_v2_function_owner_profiles_authorization_read'
        )
        OR (
            policy_state.polrelid =
                pg_catalog.to_regclass('public.tenants')
            AND policy_state.polname =
                'core_v2_function_owner_tenants_authorization_read'
        )
        OR (
            policy_state.polrelid =
                pg_catalog.to_regclass('public.branches')
            AND policy_state.polname =
                'core_v2_function_owner_branches_authorization_read'
        )
    ) <> 3 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: authorization policy inventory mismatch';
    END IF;

    IF pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.profiles',
           'SELECT'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.tenants',
           'SELECT'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.branches',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.profiles',
           'id',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.profiles',
           'tenant_id',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.profiles',
           'branch_id',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.profiles',
           'role',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.profiles',
           'is_active',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.profiles',
           'updated_at',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.tenants',
           'id',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.branches',
           'id',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.branches',
           'tenant_id',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.branches',
           'is_active',
           'SELECT'
       )
       OR NOT pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.branches',
           'deleted_at',
           'SELECT'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: authorization read privilege mismatch';
    END IF;

    IF pg_catalog.has_column_privilege(
        'afex_function_owner',
        'public.profiles',
        'pos_pin_hash',
        'SELECT'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: sensitive profile privilege exists';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.pos_profiles'),
            pg_catalog.to_regclass('public.branches')
        )
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND attribute_state.attacl IS NOT NULL
          AND (CASE
              WHEN pg_catalog.cardinality(attribute_state.attacl) > 0
                   AND pg_catalog.array_ndims(attribute_state.attacl)
                       IS DISTINCT FROM 1
                  THEN true
              WHEN pg_catalog.array_ndims(attribute_state.attacl) = 1
                  THEN pg_catalog.array_position(
                      attribute_state.attacl,
                      NULL::aclitem
                  ) IS NOT NULL
              ELSE false
          END)
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: malformed authorization-evidence column ACL array';
    END IF;

    IF EXISTS (
        WITH expected_acl(table_name, column_name, privilege_type) AS (
            VALUES
                ('profiles'::text, 'id'::text, 'SELECT'::text),
                ('profiles', 'tenant_id', 'SELECT'),
                ('profiles', 'branch_id', 'SELECT'),
                ('profiles', 'role', 'SELECT'),
                ('profiles', 'is_active', 'SELECT'),
                ('profiles', 'updated_at', 'SELECT'),
                ('tenants', 'id', 'SELECT'),
                ('branches', 'id', 'SELECT'),
                ('branches', 'tenant_id', 'SELECT'),
                ('branches', 'is_active', 'SELECT'),
                ('branches', 'deleted_at', 'SELECT')
        ),
        actual_acl AS (
            SELECT
                relation_state.relname::text,
                attribute_state.attname::text,
                acl_state.privilege_type::text
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
              AND relation_state.relname IN (
                  'profiles',
                  'tenants',
                  'branches'
              )
              AND attribute_state.attnum > 0
              AND NOT attribute_state.attisdropped
              AND acl_state.grantee = function_owner_oid
              AND NOT acl_state.is_grantable
        ),
        differences AS (
            (SELECT * FROM expected_acl EXCEPT SELECT * FROM actual_acl)
            UNION ALL
            (SELECT * FROM actual_acl EXCEPT SELECT * FROM expected_acl)
        )
        SELECT 1 FROM differences
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        CROSS JOIN LATERAL pg_catalog.unnest(
            attribute_state.attacl
        ) AS acl_item(value)
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            ARRAY[acl_item.value]::aclitem[]
        ) AS acl_state
        WHERE attribute_state.attrelid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.tenants'),
            pg_catalog.to_regclass('public.branches')
        )
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND acl_state.grantee = function_owner_oid
          AND acl_state.is_grantable
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 verification failed: authorization column ACL inventory mismatch';
    END IF;
END
$verification$;

REVOKE CREATE ON SCHEMA public FROM afex_function_owner;

REVOKE afex_function_owner FROM postgres
    GRANTED BY postgres;

REVOKE afex_core_owner FROM postgres
    GRANTED BY postgres;

DO $bootstrap_restoration_verification$
DECLARE
    installer_oid oid;
    core_owner_oid oid;
    function_owner_oid oid;
    supabase_admin_oid oid;
BEGIN
    SELECT oid INTO installer_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'postgres';
    SELECT oid INTO core_owner_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_owner';
    SELECT oid INTO function_owner_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_function_owner';
    SELECT oid INTO supabase_admin_oid FROM pg_catalog.pg_roles
    WHERE rolname = 'supabase_admin';

    IF EXISTS (
        SELECT 1
        FROM (VALUES (core_owner_oid), (function_owner_oid))
             AS target(role_oid)
        WHERE (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = target.role_oid
              AND membership.member = installer_oid
        ) <> 1
           OR (
               SELECT pg_catalog.count(*)
               FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.roleid = target.role_oid
                  OR membership.member = target.role_oid
           ) <> 1
           OR NOT EXISTS (
               SELECT 1 FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.roleid = target.role_oid
                 AND membership.member = installer_oid
                 AND membership.grantor = supabase_admin_oid
                 AND membership.admin_option
                 AND NOT membership.inherit_option
                 AND NOT membership.set_option
           )
           OR EXISTS (
               SELECT 1 FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.roleid = target.role_oid
                 AND membership.member = installer_oid
                 AND membership.grantor = installer_oid
           )
    )
       OR pg_catalog.pg_has_role(
           CURRENT_USER, 'afex_core_owner', 'SET'
       )
       OR pg_catalog.pg_has_role(
           CURRENT_USER, 'afex_function_owner', 'SET'
       )
       OR pg_catalog.has_schema_privilege(
           'afex_function_owner', 'public', 'CREATE'
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
             AND acl_state.grantee IN (
                 core_owner_oid,
                 function_owner_oid
             )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 failed: bootstrap authority was not restored';
    END IF;
END
$bootstrap_restoration_verification$;

COMMIT;

-- END OF P2D.20 TRUSTED ATOMIC ACQUISITION ENTRYPOINT
