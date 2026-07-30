-- AFEX Core V2 P2D.20 - Read-Only Post-Install Attestation
-- Source contract: P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql
-- Fail-closed verification only. This artifact invokes no Runtime function.
-- Normative contract: P2D.17 + P2D.18 + P2D.18A.
-- Static attestation cannot prove secrets are absent from permitted prose.

BEGIN TRANSACTION READ ONLY;

DO $attestation$
DECLARE
    function_oid oid;
    canonicalizer_oid oid;
    function_owner_oid oid;
    runtime_role_oid oid;
    function_source text;
    forbidden_role text;
    required_fragment text;
    forbidden_fragment text;
BEGIN
    IF pg_catalog.current_setting('server_version_num')::integer <> 170006 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: unsupported PostgreSQL version';
    END IF;

    IF pg_catalog.current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: server encoding is not UTF8';
    END IF;

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
       OR function_owner_oid IS NULL
       OR runtime_role_oid IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: function or role is absent';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid IN (function_oid, canonicalizer_oid)
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
            message = 'P2D.20 attestation failed: malformed function ACL array';
    END IF;

    IF (
        SELECT procedure_state.proowner = function_owner_oid
               AND NOT procedure_state.prosecdef
               AND procedure_state.provolatile = 'i'
               AND procedure_state.proparallel = 's'
               AND procedure_state.proisstrict
               AND procedure_state.proconfig =
                   ARRAY['search_path=pg_catalog']::text[]
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = canonicalizer_oid
    ) IS DISTINCT FROM true
       OR EXISTS (
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
           WHERE procedure_state.oid = canonicalizer_oid
             AND acl_state.grantee <> function_owner_oid
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: canonicalizer security contract mismatch';
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
            message = 'P2D.20 attestation failed: exact function source contract mismatch';
    END IF;

    IF NOT (
        SELECT procedure_state.prosrc LIKE '%normalize(v_text, NFC)%'
               AND procedure_state.prosrc LIKE
                   '%convert_to(object_member.key, ''UTF8'')%'
               AND procedure_state.prosrc LIKE
                   '%jsonb_array_elements(p_value)%'
               AND procedure_state.prosrc LIKE
                   '%CANONICAL_JSON_NUMBER_INVALID%'
               AND procedure_state.prosrc LIKE '%\u00%'
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = canonicalizer_oid
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: canonicalizer static contract mismatch';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS procedure_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = procedure_state.pronamespace
        WHERE namespace_state.nspname = 'public'
          AND procedure_state.proname =
              'acquire_atomic_order_command_v1'
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: unexpected function overload exists';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS procedure_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = procedure_state.pronamespace
        WHERE namespace_state.nspname = 'public'
          AND procedure_state.proname =
              'canonicalize_atomic_order_json_v1'
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: unexpected canonicalizer overload exists';
    END IF;

    SELECT procedure_state.prosrc
    INTO function_source
    FROM pg_catalog.pg_proc AS procedure_state
    WHERE procedure_state.oid = function_oid
      AND procedure_state.proowner = function_owner_oid
      AND procedure_state.prosecdef
      AND procedure_state.provolatile = 'v'
      AND procedure_state.proparallel = 'u'
      AND procedure_state.prokind = 'f'
      AND procedure_state.proconfig =
          ARRAY['search_path=pg_catalog']::text[];

    IF function_source IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: function security contract mismatch';
    END IF;

    IF pg_catalog.pg_get_function_identity_arguments(function_oid)
       IS DISTINCT FROM
       'p_authenticated_actor_id uuid, p_tenant_id uuid, p_branch_id uuid, p_idempotency_key text, p_correlation_reference text, p_canonical_payload text, p_fingerprint_projection text, p_retain_until timestamp with time zone'
       OR pg_catalog.pg_get_function_result(function_oid)
          IS DISTINCT FROM
          'TABLE(acquisition_result text, authorization_context_id uuid, atomic_command_id uuid, correlation_reference text, command_status text, response_version text, response_snapshot jsonb, completed_at timestamp with time zone, error_code text, error_detail text, last_failure_stage text, stored_request_fingerprint bytea)' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: typed signature contract mismatch';
    END IF;

    IF NOT pg_catalog.has_function_privilege(
        'afex_core_runtime',
        function_oid,
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: runtime EXECUTE is absent';
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
                message = 'P2D.20 attestation failed: forbidden EXECUTE exists',
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
                message = 'P2D.20 attestation failed: forbidden canonicalizer EXECUTE exists',
                detail = forbidden_role;
        END IF;
    END LOOP;

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
            message = 'P2D.20 attestation failed: unexpected direct function ACL';
    END IF;

    FOREACH required_fragment IN ARRAY ARRAY[
        'current_setting(''role'', true)',
        'pg_auth_members',
        'public.profiles',
        'public.tenants',
        'public.branches',
        'PAYLOAD_STRUCTURE_INVALID',
        'PAYLOAD_NESTED_ALLOWLIST_INVALID',
        'PAYLOAD_SENSITIVE_FIELD_FORBIDDEN',
        'PAYLOAD_CANONICAL_BYTES_INVALID',
        'PAYLOAD_STRING_NOT_NFC',
        'PAYLOAD_CUSTOMER_STATE_INVALID',
        'PAYLOAD_MODIFIER_ORDER_INVALID',
        'PAYLOAD_PRICING_SOURCE_INVALID',
        'PAYLOAD_VAT_STATE_INVALID',
        'PAYLOAD_DISCOUNT_STATE_INVALID',
        'PAYLOAD_PAYMENT_STATE_INVALID',
        'PAYLOAD_FULFILLMENT_STATE_INVALID',
        'PAYLOAD_NULLABLE_TYPE_INVALID',
        'PAYLOAD_METADATA_INVALID',
        'PAYLOAD_BOUNDED_VERSION_INVALID',
        'FINGERPRINT_PROJECTION_INVALID',
        'FINGERPRINT_CANONICAL_BYTES_INVALID',
        'canonicalize_atomic_order_json_v1',
        'v_canonical_projection',
        'v_canonical_payload',
        'canonical_size_bytes',
        'v_expected_customer_keys',
        'v_expected_item_keys',
        'v_expected_modifier_keys',
        'v_expected_pricing_keys',
        'v_expected_pricing_line_keys',
        'v_expected_vat_keys',
        'v_expected_discount_keys',
        'v_expected_payment_keys',
        'v_expected_fulfillment_keys',
        'v_expected_metadata_keys',
        'v_expected_version_keys',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"',
        'p_canonical_payload IS NOT JSON OBJECT WITH UNIQUE KEYS',
        'v_expected_projection :=',
        '- ''fingerprint_version''',
        '- ''net_amount''',
        '- ''provider_reference''',
        '- ''payload_contract''',
        '''source_channel''',
        'sha256',
        'pg_advisory_xact_lock',
        'FOR UPDATE',
        'public.atomic_authorization_contexts',
        'public.atomic_order_commands',
        'public.atomic_order_command_payloads',
        '''created''::text',
        '''replay''::text',
        '''in_progress''::text',
        '''fingerprint_conflict''::text'
    ]::text[]
    LOOP
        IF POSITION(required_fragment IN function_source) = 0 THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.20 attestation failed: required function contract fragment is absent',
                detail = required_fragment;
        END IF;
    END LOOP;

    IF (
        pg_catalog.length(function_source) -
        pg_catalog.length(
            pg_catalog.replace(function_source, 'INSERT INTO', '')
        )
    ) / pg_catalog.length('INSERT INTO') <> 3
       OR POSITION(
           'IF FOUND THEN' IN function_source
       ) = 0
       OR POSITION(
           'INSERT INTO public.atomic_authorization_contexts'
           IN function_source
       ) <= POSITION('IF FOUND THEN' IN function_source)
       OR POSITION(
           'INSERT INTO public.atomic_order_commands'
           IN function_source
       ) <= POSITION(
           'INSERT INTO public.atomic_authorization_contexts'
           IN function_source
       )
       OR POSITION(
           'INSERT INTO public.atomic_order_command_payloads'
           IN function_source
       ) <= POSITION(
           'INSERT INTO public.atomic_order_commands'
           IN function_source
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: acquisition branch or atomic insert mapping mismatch';
    END IF;

    IF function_source NOT LIKE
          '%v_payload_size := pg_catalog.octet_length(%v_canonical_payload%'
       OR function_source NOT LIKE
          '%v_expected_projection :=%v_canonical_projection :=%'
       OR function_source NOT LIKE
          '%v_request_fingerprint := pg_catalog.sha256(%v_canonical_projection%'
       OR function_source NOT LIKE
          '%VALUES (%v_command_id,%''order-command-payload-v1''%'
       OR function_source NOT LIKE
          '%v_payload,%v_request_fingerprint,%v_payload_size%' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: canonical mapping or fingerprint binding mismatch';
    END IF;

    FOREACH forbidden_fragment IN ARRAY ARRAY[
        'public.customers',
        'public.catalog_items',
        'public.branch_catalog',
        'public.inventory',
        'public.invoices',
        'create_invoice_with_items_safe',
        'http.',
        'net.'
    ]::text[]
    LOOP
        IF POSITION(
               forbidden_fragment IN function_source
           ) <> 0 THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.20 attestation failed: forbidden dependency exists',
                detail = forbidden_fragment;
        END IF;
    END LOOP;

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
            message = 'P2D.20 attestation failed: canonical size binding mismatch';
    END IF;

    RAISE NOTICE 'P2D20A_200_FUNCTION_SECURITY_CONTRACT_OK';
END
$attestation$;

DO $attestation$
DECLARE
    function_owner_oid oid;
    expected_policy record;
BEGIN
    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    FOR expected_policy IN
        SELECT *
        FROM (
            VALUES
                (
                    'profiles',
                    'core_v2_function_owner_profiles_authorization_read'
                ),
                (
                    'tenants',
                    'core_v2_function_owner_tenants_authorization_read'
                ),
                (
                    'branches',
                    'core_v2_function_owner_branches_authorization_read'
                )
        ) AS policies(table_name, policy_name)
    LOOP
        IF (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid =
                  pg_catalog.to_regclass(
                      'public.' || expected_policy.table_name
                  )
              AND policy_state.polname =
                  expected_policy.policy_name
              AND policy_state.polcmd = 'r'
              AND policy_state.polpermissive
              AND policy_state.polroles =
                  ARRAY[function_owner_oid]::oid[]
              AND pg_catalog.pg_get_expr(
                      policy_state.polqual,
                      policy_state.polrelid
                  ) = 'true'
              AND policy_state.polwithcheck IS NULL
        ) <> 1 THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.20 attestation failed: authorization policy mismatch',
                detail = expected_policy.policy_name;
        END IF;
    END LOOP;

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
       )
       OR pg_catalog.has_column_privilege(
           'afex_function_owner',
           'public.profiles',
           'pos_pin_hash',
           'SELECT'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.20 attestation failed: least-privilege read contract mismatch';
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
            message = 'P2D.20 attestation failed: malformed authorization-evidence column ACL array';
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
            message = 'P2D.20 attestation failed: authorization column ACL inventory mismatch';
    END IF;

    RAISE NOTICE 'P2D20A_300_AUTHORIZATION_DEPENDENCY_CONTRACT_OK';
END
$attestation$;

SELECT
    namespace_state.nspname AS function_schema,
    procedure_state.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(
        procedure_state.oid
    ) AS identity_arguments,
    owner_role.rolname AS owner,
    procedure_state.prosecdef AS security_definer,
    procedure_state.provolatile AS volatility,
    procedure_state.proparallel AS parallel_safety,
    procedure_state.proconfig AS configuration,
    pg_catalog.pg_get_function_result(
        procedure_state.oid
    ) AS result_contract
FROM pg_catalog.pg_proc AS procedure_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = procedure_state.pronamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = procedure_state.proowner
WHERE procedure_state.oid = pg_catalog.to_regprocedure(
    'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
);

SELECT
    CASE acl_state.grantee
        WHEN 0 THEN 'PUBLIC'
        ELSE acl_state.grantee::regrole::text
    END AS grantee,
    acl_state.privilege_type,
    acl_state.is_grantable
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
WHERE procedure_state.oid = pg_catalog.to_regprocedure(
    'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
)
ORDER BY grantee, acl_state.privilege_type;

SELECT
    relation_state.relname AS table_name,
    policy_state.polname AS policy_name,
    policy_state.polcmd AS command_scope,
    policy_state.polpermissive AS permissive,
    (
        SELECT pg_catalog.array_agg(
            role_state.rolname
            ORDER BY role_state.rolname
        )
        FROM unnest(policy_state.polroles)
             AS policy_role(role_oid)
        JOIN pg_catalog.pg_roles AS role_state
          ON role_state.oid = policy_role.role_oid
    ) AS policy_roles,
    pg_catalog.pg_get_expr(
        policy_state.polqual,
        policy_state.polrelid
    ) AS using_expression
FROM pg_catalog.pg_policy AS policy_state
JOIN pg_catalog.pg_class AS relation_state
  ON relation_state.oid = policy_state.polrelid
WHERE (
    relation_state.relname = 'profiles'
    AND policy_state.polname =
        'core_v2_function_owner_profiles_authorization_read'
)
OR (
    relation_state.relname = 'tenants'
    AND policy_state.polname =
        'core_v2_function_owner_tenants_authorization_read'
)
OR (
    relation_state.relname = 'branches'
    AND policy_state.polname =
        'core_v2_function_owner_branches_authorization_read'
)
ORDER BY relation_state.relname;

DO $attestation$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('afex_core_owner'::text),
            ('afex_function_owner'::text)
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
            message = 'P2D.20 attestation failed: bootstrap authority residue exists';
    END IF;

    RAISE NOTICE 'P2D20A_900_POST_INSTALL_ATTESTATION_OK';
END
$attestation$;

SELECT
    'PASS'::text AS attestation_result,
    'P2D20A_900_POST_INSTALL_ATTESTATION_OK'::text
        AS final_marker,
    'acquire_atomic_order_command_v1'::text
        AS verified_entrypoint;

ROLLBACK;

-- END OF P2D.20 READ-ONLY POST-INSTALL ATTESTATION
