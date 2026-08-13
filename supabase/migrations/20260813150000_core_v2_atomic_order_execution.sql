BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(506,22503);
CREATE SCHEMA afex_core_private AUTHORIZATION afex_function_owner;
REVOKE ALL ON SCHEMA afex_core_private FROM PUBLIC,anon,authenticated,service_role,afex_core_runtime;
GRANT USAGE ON SCHEMA afex_core_private TO afex_function_owner;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.atomic_order_commands,public.atomic_authorization_contexts,public.atomic_order_command_payloads,public.profiles,public.branches,public.customers,public.catalog_items,public.inventory_stock,public.inventory_movements,public.orders,public.invoices,public.invoice_items TO afex_function_owner;
GRANT UPDATE ON public.atomic_authorization_contexts,public.atomic_order_commands,public.profiles,public.catalog_items,public.inventory_stock TO afex_function_owner;
GRANT INSERT ON public.atomic_authorization_contexts,public.atomic_order_commands,public.atomic_order_command_payloads TO afex_function_owner;
GRANT INSERT ON public.orders,public.invoices,public.invoice_items TO afex_function_owner;
DO $business_policies$ DECLARE z record;BEGIN FOR z IN SELECT * FROM(VALUES('atomic_authorization_contexts','INSERT'),('atomic_authorization_contexts','UPDATE'),('atomic_order_commands','INSERT'),('atomic_order_commands','UPDATE'),('atomic_order_command_payloads','INSERT'),('customers','SELECT'),('catalog_items','SELECT'),('catalog_items','UPDATE'),('inventory_stock','SELECT'),('inventory_stock','UPDATE'),('inventory_movements','SELECT'),('profiles','SELECT'),('profiles','UPDATE'),('branches','SELECT'),('orders','SELECT'),('orders','INSERT'),('invoices','SELECT'),('invoices','INSERT'),('invoice_items','SELECT'),('invoice_items','INSERT'))v(rel,cmd) LOOP IF(SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||z.rel))THEN EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO afex_function_owner %s','p2d22_function_owner_'||z.rel||'_'||lower(z.cmd),z.rel,z.cmd,CASE WHEN z.cmd='INSERT'THEN'WITH CHECK(true)'ELSE'USING(true)'END);END IF;END LOOP;END $business_policies$;
SET LOCAL ROLE afex_function_owner;
CREATE FUNCTION afex_core_private.acquire_atomic_order_command_internal_v1(
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
ALTER FUNCTION afex_core_private.acquire_atomic_order_command_internal_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone) OWNER TO afex_function_owner;
REVOKE ALL ON FUNCTION afex_core_private.acquire_atomic_order_command_internal_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role,afex_core_runtime;
RESET ROLE;



CREATE OR REPLACE FUNCTION public.acquire_atomic_order_command_v1(
  p_authenticated_actor_id uuid,p_tenant_id uuid,p_branch_id uuid,
  p_idempotency_key text,p_correlation_reference text,
  p_canonical_payload text,p_fingerprint_projection text,
  p_retain_until timestamptz)
RETURNS TABLE(acquisition_result text,authorization_context_id uuid,
  atomic_command_id uuid,correlation_reference text,command_status text,
  response_version text,response_snapshot jsonb,completed_at timestamptz,
  error_code text,error_detail text,last_failure_stage text,
  stored_request_fingerprint bytea)
LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE SECURITY DEFINER
SET search_path=pg_catalog AS $wrapper$
DECLARE s oid; r oid;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'afex_core_runtime' THEN
   RAISE EXCEPTION USING errcode='42501',message='RUNTIME_IDENTITY_INVALID';
 END IF;
 SELECT oid INTO s FROM pg_roles WHERE rolname=session_user AND rolcanlogin
   AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
   AND NOT rolreplication AND NOT rolbypassrls;
 SELECT oid INTO r FROM pg_roles WHERE rolname='afex_core_runtime';
 IF s IS NULL OR r IS NULL OR
   (SELECT count(*) FROM pg_auth_members WHERE member=s)<>1 OR
   (SELECT count(*) FROM pg_auth_members WHERE member=s AND roleid=r
      AND NOT admin_option AND NOT inherit_option AND set_option)<>1 THEN
   RAISE EXCEPTION USING errcode='42501',message='RUNTIME_IDENTITY_INVALID';
 END IF;
 RETURN QUERY SELECT * FROM afex_core_private.acquire_atomic_order_command_internal_v1(
   p_authenticated_actor_id,p_tenant_id,p_branch_id,p_idempotency_key,
   p_correlation_reference,p_canonical_payload,p_fingerprint_projection,p_retain_until);
END $wrapper$;
ALTER FUNCTION public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamptz) OWNER TO afex_function_owner;
REVOKE ALL ON FUNCTION public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamptz) TO afex_core_runtime;

CREATE OR REPLACE FUNCTION public.acquire_atomic_order_command_result_v1(
  p_authenticated_actor_id uuid,p_tenant_id uuid,p_branch_id uuid,
  p_idempotency_key text,p_correlation_reference text,
  p_canonical_payload text,p_fingerprint_projection text,p_retain_until timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE SECURITY DEFINER
SET search_path=pg_catalog AS $facade$
DECLARE x record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.branches b
   ON b.id=p_branch_id AND b.tenant_id=p_tenant_id AND b.is_active
   AND b.deleted_at IS NULL WHERE p.id=p_authenticated_actor_id
   AND p.tenant_id=p_tenant_id AND p.is_active
   AND p.role IN('owner','admin','manager','employee','cashier')
   AND(p.branch_id IS NULL OR p.branch_id=p_branch_id)) THEN
   RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','UNAUTHORIZED');
 END IF;
 SELECT * INTO x FROM afex_core_private.acquire_atomic_order_command_internal_v1(
   p_authenticated_actor_id,p_tenant_id,p_branch_id,p_idempotency_key,
   p_correlation_reference,p_canonical_payload,p_fingerprint_projection,p_retain_until);
 IF x.acquisition_result='created' AND x.command_status='reserved' AND x.error_code IS NULL THEN
  RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','created','commandId',x.atomic_command_id);
 ELSIF x.acquisition_result='in_progress' AND x.command_status IN('reserved','processing') AND x.error_code IS NULL THEN
  RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','in_progress','commandId',x.atomic_command_id);
 ELSIF x.acquisition_result='replay' AND x.command_status='succeeded'
   AND x.response_version='atomic-order-result-v1' AND x.response_snapshot IS NOT NULL
   AND x.completed_at IS NOT NULL AND x.error_code IS NULL THEN
  RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','replay','commandId',x.atomic_command_id,'responseSnapshot',x.response_snapshot);
 ELSIF x.acquisition_result='fingerprint_conflict' THEN
  RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','fingerprint_conflict','errorCode','FINGERPRINT_CONFLICT');
 END IF;
 RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','INTERNAL_ERROR');
EXCEPTION WHEN OTHERS THEN
 RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','INTERNAL_ERROR');
END $facade$;
ALTER FUNCTION public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamptz) OWNER TO afex_function_owner;
REVOKE ALL ON FUNCTION public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamptz) TO service_role;

GRANT USAGE,CREATE ON SCHEMA public TO afex_core_owner;
GRANT REFERENCES ON public.atomic_order_commands,public.orders,public.invoices,public.invoice_items,public.catalog_items,public.inventory_movements TO afex_core_owner;
SET LOCAL ROLE afex_core_owner;
CREATE TABLE public.atomic_order_claims(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), command_id uuid NOT NULL REFERENCES public.atomic_order_commands(id),
 claim_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), actor_id uuid NOT NULL,tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 attempt_number integer NOT NULL CHECK(attempt_number BETWEEN 1 AND 3),issued_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 expires_at timestamptz NOT NULL,consumed_at timestamptz,consumption_kind text,
 CHECK(expires_at=issued_at+interval '5 minutes'),CHECK((consumed_at IS NULL)=(consumption_kind IS NULL)),
 UNIQUE(command_id,attempt_number));
CREATE UNIQUE INDEX atomic_order_claims_one_active ON public.atomic_order_claims(command_id) WHERE consumed_at IS NULL;
CREATE TABLE public.atomic_order_retry_authorizations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),command_id uuid NOT NULL REFERENCES public.atomic_order_commands(id),
 prior_claim_token uuid NOT NULL,evidence_digest bytea NOT NULL CHECK(octet_length(evidence_digest)=32),
 next_attempt integer NOT NULL CHECK(next_attempt BETWEEN 2 AND 3),issued_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT(transaction_timestamp()+interval '2 minutes'),consumed_at timestamptz,
 consumed_claim_id uuid REFERENCES public.atomic_order_claims(id),UNIQUE(command_id,next_attempt));
CREATE TABLE public.atomic_order_business_links(
 command_id uuid PRIMARY KEY REFERENCES public.atomic_order_commands(id),order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
 invoice_id uuid NOT NULL UNIQUE REFERENCES public.invoices(id),tenant_id uuid NOT NULL,branch_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT transaction_timestamp());
CREATE TABLE public.atomic_order_line_links(
 command_id uuid NOT NULL REFERENCES public.atomic_order_commands(id),line_number integer NOT NULL,
 invoice_item_id uuid NOT NULL UNIQUE REFERENCES public.invoice_items(id),catalog_item_id uuid NOT NULL REFERENCES public.catalog_items(id),
 inventory_movement_id uuid UNIQUE REFERENCES public.inventory_movements(id),quantity integer NOT NULL CHECK(quantity>0),
 PRIMARY KEY(command_id,line_number));
CREATE TABLE public.atomic_order_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,command_id uuid NOT NULL REFERENCES public.atomic_order_commands(id),
 event_code text NOT NULL CHECK(event_code IN('CLAIMED','EXECUTION_STARTED','SUCCEEDED','FAILED','RECONCILIATION_REQUIRED','MANUAL_HOLD','RETRY_AUTHORIZED','RESOLVED_SUCCESS','RESOLVED_FAILURE')),
 attempt_number integer NOT NULL CHECK(attempt_number BETWEEN 0 AND 3),actor_id uuid NOT NULL,tenant_id uuid NOT NULL,branch_id uuid NOT NULL,
 public_error_code text,occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),metadata jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX atomic_order_audit_command_idx ON public.atomic_order_audit(command_id,id);
CREATE TABLE public.atomic_order_diagnostics(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,command_id uuid NOT NULL REFERENCES public.atomic_order_commands(id),
 attempt_number integer NOT NULL CHECK(attempt_number BETWEEN 0 AND 3),failure_stage text NOT NULL,
 diagnostic_class text NOT NULL CHECK(diagnostic_class IN('VALIDATION','AUTHORIZATION','CONFLICT','INVENTORY','PERSISTENCE','UNKNOWN')),
 sqlstate_code text CHECK(sqlstate_code IS NULL OR length(sqlstate_code)=5),occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp());
CREATE INDEX atomic_order_diagnostics_command_idx ON public.atomic_order_diagnostics(command_id,id);
ALTER TABLE public.atomic_order_claims ENABLE ROW LEVEL SECURITY; ALTER TABLE public.atomic_order_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE public.atomic_order_retry_authorizations ENABLE ROW LEVEL SECURITY; ALTER TABLE public.atomic_order_retry_authorizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.atomic_order_business_links ENABLE ROW LEVEL SECURITY; ALTER TABLE public.atomic_order_business_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.atomic_order_line_links ENABLE ROW LEVEL SECURITY; ALTER TABLE public.atomic_order_line_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.atomic_order_audit ENABLE ROW LEVEL SECURITY; ALTER TABLE public.atomic_order_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE public.atomic_order_diagnostics ENABLE ROW LEVEL SECURITY; ALTER TABLE public.atomic_order_diagnostics FORCE ROW LEVEL SECURITY;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM afex_core_owner;
REVOKE ALL ON public.atomic_order_claims,public.atomic_order_retry_authorizations,public.atomic_order_business_links,
 public.atomic_order_line_links,public.atomic_order_audit,public.atomic_order_diagnostics FROM PUBLIC,anon,authenticated,service_role,afex_core_runtime;

GRANT SELECT,INSERT,UPDATE ON public.atomic_order_claims,public.atomic_order_retry_authorizations TO afex_function_owner;
GRANT SELECT,INSERT ON public.atomic_order_business_links,public.atomic_order_line_links,public.atomic_order_audit,public.atomic_order_diagnostics TO afex_function_owner;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO afex_function_owner;
CREATE POLICY claims_owner ON public.atomic_order_claims FOR ALL TO afex_function_owner USING(true) WITH CHECK(true);
CREATE POLICY retry_owner ON public.atomic_order_retry_authorizations FOR ALL TO afex_function_owner USING(true) WITH CHECK(true);
CREATE POLICY links_owner ON public.atomic_order_business_links FOR ALL TO afex_function_owner USING(true) WITH CHECK(true);
CREATE POLICY line_links_owner ON public.atomic_order_line_links FOR ALL TO afex_function_owner USING(true) WITH CHECK(true);
CREATE POLICY audit_owner ON public.atomic_order_audit FOR ALL TO afex_function_owner USING(true) WITH CHECK(true);
CREATE POLICY diagnostics_owner ON public.atomic_order_diagnostics FOR ALL TO afex_function_owner USING(true) WITH CHECK(true);

SET LOCAL ROLE afex_function_owner;
CREATE FUNCTION afex_core_private.atomic_order_evidence_digest_v1(c public.atomic_order_commands,q public.atomic_order_claims DEFAULT NULL)
RETURNS bytea LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT sha256(convert_to(jsonb_build_object('actorId',c.authenticated_actor_id,'authorizationContextId',c.authorization_context_id,'branchId',c.branch_id,'claimId',q.id,'commandId',c.id,'expiresAt',q.expires_at,'fingerprint',encode(c.request_fingerprint,'hex'),'issuedAt',q.issued_at,'operation','order.create','payloadDigest',encode(c.request_fingerprint,'hex'),'tenantId',c.tenant_id)::text,'UTF8'))$$;
CREATE FUNCTION afex_core_private.valid_atomic_order_result_v1(op text,r text,e text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$SELECT op IN('acquire','claim','execute','replay','reconciliation') AND ((r IN('created','in_progress','replay','claimed','succeeded','retry_authorized') AND e IS NULL) OR (r='fingerprint_conflict' AND e='FINGERPRINT_CONFLICT') OR (r='reconciliation_required' AND e IN('CLAIM_EXPIRED','RECONCILIATION_REQUIRED')) OR (r='manual_hold' AND e IN('RECONCILIATION_MANUAL_HOLD','BUSINESS_EVIDENCE_CONFLICT','MAX_ATTEMPTS_REACHED')) OR (r='failed' AND e IS NOT NULL AND e NOT IN('CLAIM_EXPIRED','RECONCILIATION_REQUIRED','RECONCILIATION_MANUAL_HOLD','BUSINESS_EVIDENCE_CONFLICT','MAX_ATTEMPTS_REACHED','FINGERPRINT_CONFLICT')))$$;
CREATE FUNCTION afex_core_private.valid_atomic_order_success_snapshot_v1(s jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE
 l jsonb;
 gross numeric(20,2):=0; discount numeric(20,2):=0; net numeric(20,2):=0;
 vat numeric(20,2):=0; line_total numeric(20,2):=0;
BEGIN
 IF jsonb_typeof(s)<>'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s) k)<>ARRAY['branchId','commandId','customerId','discount','invoiceId','invoiceNumber','lines','orderId','orderNumber','responseVersion','result','subtotal','tax','tenantId','total']
    OR s->>'responseVersion'<>'atomic-order-result-v1' OR s->>'result'<>'succeeded'
    OR jsonb_typeof(s->'lines')<>'array' OR jsonb_array_length(s->'lines') NOT BETWEEN 1 AND 100
    OR (s->>'commandId')::uuid IS NULL OR (s->>'tenantId')::uuid IS NULL
    OR (s->>'branchId')::uuid IS NULL OR (s->>'customerId')::uuid IS NULL
    OR (s->>'orderId')::uuid IS NULL OR (s->>'invoiceId')::uuid IS NULL
    OR nullif(s->>'orderNumber','') IS NULL OR nullif(s->>'invoiceNumber','') IS NULL
    OR s->>'subtotal'!~'^([0-9]+)\.[0-9]{2}$' OR s->>'discount'!~'^([0-9]+)\.[0-9]{2}$'
    OR s->>'tax'!~'^([0-9]+)\.[0-9]{2}$' OR s->>'total'!~'^([0-9]+)\.[0-9]{2}$'
 THEN RETURN false; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(s->'lines') LOOP
  IF jsonb_typeof(l)<>'object'
     OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(l) k)<>ARRAY['catalogItemId','discountAllocation','grossAmount','inventoryMovementId','invoiceItemId','lineNumber','lineTotal','netAmount','quantity','unitPrice','vatAmount','vatCategory','vatRate']
     OR (l->>'catalogItemId')::uuid IS NULL OR (l->>'invoiceItemId')::uuid IS NULL
     OR (l->>'lineNumber')::integer<=0 OR jsonb_typeof(l->'lineNumber')<>'number'
     OR (l->>'quantity')::integer<=0 OR jsonb_typeof(l->'quantity')<>'number'
     OR l->>'unitPrice'!~'^([0-9]+)\.[0-9]{2}$' OR l->>'grossAmount'!~'^([0-9]+)\.[0-9]{2}$'
     OR l->>'discountAllocation'!~'^([0-9]+)\.[0-9]{2}$' OR l->>'netAmount'!~'^([0-9]+)\.[0-9]{2}$'
     OR l->>'vatAmount'!~'^([0-9]+)\.[0-9]{2}$' OR l->>'lineTotal'!~'^([0-9]+)\.[0-9]{2}$'
     OR l->>'vatRate'!~'^([0-9]+)(\.[0-9]{1,6})?$' OR l->>'vatCategory' NOT IN('standard','exempt','zero_rated')
     OR (l->'inventoryMovementId'<>'null'::jsonb AND (l->>'inventoryMovementId')::uuid IS NULL)
     OR (l->>'grossAmount')::numeric<>(l->>'unitPrice')::numeric*(l->>'quantity')::integer
     OR (l->>'netAmount')::numeric<>(l->>'grossAmount')::numeric-(l->>'discountAllocation')::numeric
     OR (l->>'lineTotal')::numeric<>(l->>'netAmount')::numeric+(l->>'vatAmount')::numeric
  THEN RETURN false; END IF;
  gross:=gross+(l->>'grossAmount')::numeric; discount:=discount+(l->>'discountAllocation')::numeric;
  net:=net+(l->>'netAmount')::numeric; vat:=vat+(l->>'vatAmount')::numeric;
  line_total:=line_total+(l->>'lineTotal')::numeric;
 END LOOP;
 RETURN gross=(s->>'subtotal')::numeric AND discount=(s->>'discount')::numeric
    AND vat=(s->>'tax')::numeric AND line_total=(s->>'total')::numeric
    AND line_total=net+vat;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END$$;

CREATE FUNCTION public.claim_atomic_order_command_v1(p uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE c public.atomic_order_commands%rowtype;q public.atomic_order_claims%rowtype;BEGIN SELECT * INTO c FROM public.atomic_order_commands WHERE id=p FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','COMMAND_NOT_FOUND');END IF;IF c.attempt_count>=3 THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','manual_hold','errorCode','MAX_ATTEMPTS_REACHED');END IF;IF c.execution_status<>'reserved' AND NOT(c.execution_status='failed_retryable' AND c.error_code='RETRY_AUTHORIZED') THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','COMMAND_STATE_INVALID');END IF;INSERT INTO public.atomic_order_claims(command_id,actor_id,tenant_id,branch_id,attempt_number,expires_at) VALUES(c.id,c.authenticated_actor_id,c.tenant_id,c.branch_id,c.attempt_count+1,transaction_timestamp()+interval '5 minutes') RETURNING * INTO q;UPDATE public.atomic_order_commands SET execution_status='processing',lease_owner=q.claim_token,lease_expires_at=q.expires_at,attempt_count=q.attempt_number,first_started_at=coalesce(first_started_at,transaction_timestamp()),last_started_at=transaction_timestamp(),updated_at=transaction_timestamp() WHERE id=c.id;INSERT INTO public.atomic_order_audit(command_id,event_code,attempt_number,actor_id,tenant_id,branch_id)VALUES(c.id,'CLAIMED',q.attempt_number,c.authenticated_actor_id,c.tenant_id,c.branch_id);RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','claimed','commandId',c.id,'claimToken',q.claim_token,'expiresAt',q.expires_at);END$$;
CREATE FUNCTION public.replay_atomic_order_command_v1(p uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE c public.atomic_order_commands%rowtype;BEGIN SELECT * INTO c FROM public.atomic_order_commands WHERE id=p;IF NOT FOUND THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','COMMAND_NOT_FOUND');ELSIF c.execution_status='succeeded' AND afex_core_private.valid_atomic_order_success_snapshot_v1(c.response_snapshot) THEN RETURN c.response_snapshot;ELSIF c.execution_status='processing' AND c.lease_expires_at<=transaction_timestamp() THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','reconciliation_required','errorCode','CLAIM_EXPIRED','commandId',c.id);ELSIF c.execution_status='processing' THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','in_progress','commandId',c.id);ELSIF c.execution_status='failed_retryable' THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','reconciliation_required','errorCode','RECONCILIATION_REQUIRED','commandId',c.id);ELSE RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode',coalesce(c.error_code,'INTERNAL_ERROR'),'commandId',c.id);END IF;END$$;
RESET ROLE;

DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='afex_reconciliation_authority') THEN CREATE ROLE afex_reconciliation_authority NOLOGIN; END IF;
END $roles$;
GRANT USAGE ON SCHEMA afex_core_private TO afex_function_owner;
SET LOCAL ROLE afex_function_owner;
CREATE FUNCTION afex_core_private.transition_atomic_order_v1(p uuid,from_states text[],to_state text,code text,event text,digest bytea DEFAULT NULL)
RETURNS public.atomic_order_commands LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE c public.atomic_order_commands%rowtype;BEGIN SELECT * INTO c FROM public.atomic_order_commands WHERE id=p FOR UPDATE;IF NOT FOUND OR NOT(c.execution_status=ANY(from_states)) THEN RAISE EXCEPTION USING errcode='55000',message='ILLEGAL_STATE_TRANSITION';END IF;IF digest IS NOT NULL AND digest<>afex_core_private.atomic_order_evidence_digest_v1(c,NULL) THEN RAISE EXCEPTION USING errcode='22023',message='EVIDENCE_DIGEST_MISMATCH';END IF;UPDATE public.atomic_order_commands SET execution_status=to_state,error_code=code,error_detail=NULL,updated_at=transaction_timestamp(),failed_at=CASE WHEN to_state='failed_final' THEN transaction_timestamp() ELSE failed_at END WHERE id=p RETURNING * INTO c;INSERT INTO public.atomic_order_audit(command_id,event_code,attempt_number,actor_id,tenant_id,branch_id,public_error_code)VALUES(c.id,event,c.attempt_count,c.authenticated_actor_id,c.tenant_id,c.branch_id,code);RETURN c;END$$;
CREATE FUNCTION afex_core_private.persist_atomic_order_business_v1(p uuid,t uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.atomic_order_commands%rowtype; x public.atomic_authorization_contexts%rowtype;
 d public.atomic_order_command_payloads%rowtype; b jsonb; customer uuid; oid uuid;iid uuid;onum text;inum text;
 sub numeric(20,2);disc numeric(20,2);taxable numeric(20,2);tax numeric(20,2);total numeric(20,2);
 rate numeric(12,6); line jsonb; price jsonb; item public.catalog_items%rowtype; ii uuid; mov uuid;
BEGIN
 SELECT * INTO c FROM public.atomic_order_commands WHERE id=p FOR UPDATE;
 SELECT * INTO x FROM public.atomic_authorization_contexts WHERE id=c.authorization_context_id FOR SHARE;
 SELECT * INTO d FROM public.atomic_order_command_payloads WHERE command_id=p;
 IF c.execution_status<>'processing' OR c.lease_owner IS DISTINCT FROM t OR c.tenant_id<>x.tenant_id OR c.branch_id<>x.branch_id OR c.authenticated_actor_id<>x.authenticated_actor_id OR d.request_fingerprint<>c.request_fingerprint THEN RAISE EXCEPTION USING errcode='42501',message='EXECUTION_BINDING_INVALID';END IF;
 b:=d.canonical_payload;
 IF (b->>'tenant_id')::uuid<>c.tenant_id OR (b->>'branch_id')::uuid<>c.branch_id OR (b->>'authenticated_actor_id')::uuid<>c.authenticated_actor_id THEN RAISE EXCEPTION USING errcode='42501',message='PAYLOAD_SCOPE_MISMATCH';END IF;
 customer:=NULLIF(b->'customer'->>'customer_id','')::uuid;
 IF customer IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers u WHERE u.id=customer AND u.tenant_id=c.tenant_id AND (b->'customer'->>'expected_record_version' IS NULL OR u.xmin::text=(b->'customer'->>'expected_record_version'))) THEN RAISE EXCEPTION USING errcode='40001',message='CUSTOMER_VERSION_OR_SCOPE_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(b->'items') z WHERE (z->>'quantity')::numeric<=0 OR (z->>'quantity')::numeric<>trunc((z->>'quantity')::numeric)) THEN RAISE EXCEPTION USING errcode='22023',message='FRACTIONAL_QUANTITY_UNSUPPORTED';END IF;
 SELECT round(coalesce(sum((z->>'gross_amount')::numeric),0),2),round(coalesce(sum((z->>'discount_allocation')::numeric),0),2),round(coalesce(sum((z->>'taxable_amount')::numeric),0),2),round(coalesce(sum((z->>'vat_amount')::numeric),0),2) INTO sub,disc,taxable,tax FROM jsonb_array_elements(b->'pricing'->'lines') z;
 rate:=(b->'vat'->>'rate')::numeric; total:=round(taxable+tax,2);
 IF b->'vat'->>'mode' NOT IN('exclusive','exempt','zero_rated') THEN RAISE EXCEPTION USING errcode='22023',message='UNSUPPORTED_FINANCIAL_MODE';END IF;
 IF b->'vat'->>'mode'='exclusive' AND tax<>round(taxable*rate/100,2) THEN RAISE EXCEPTION USING errcode='22023',message='FINANCIAL_MISMATCH';END IF;
 IF b->'vat'->>'mode' IN('exempt','zero_rated') AND tax<>0 THEN RAISE EXCEPTION USING errcode='22023',message='VAT_SCOPE_MISMATCH';END IF;
 IF sub<>(b->'pricing'->>'subtotal')::numeric OR disc<>(b->'discount'->>'amount')::numeric OR taxable<>(b->'pricing'->>'taxable_subtotal')::numeric OR total<>(b->'pricing'->>'total')::numeric THEN RAISE EXCEPTION USING errcode='22023',message='FINANCIAL_TOTAL_MISMATCH';END IF;
 PERFORM 1 FROM public.catalog_items ci JOIN (SELECT (z->>'catalog_item_id')::uuid id FROM jsonb_array_elements(b->'items')z ORDER BY 1)q ON q.id=ci.id WHERE ci.tenant_id=c.tenant_id AND ci.is_active AND ci.deleted_at IS NULL FOR SHARE OF ci;
 IF (SELECT count(*) FROM jsonb_array_elements(b->'items'))<>(SELECT count(*) FROM jsonb_array_elements(b->'items')z JOIN jsonb_array_elements(b->'pricing'->'lines')pl ON pl->>'line_id'=z->>'line_id' JOIN public.catalog_items ci ON ci.id=(z->>'catalog_item_id')::uuid AND ci.tenant_id=c.tenant_id AND ci.is_active AND ci.deleted_at IS NULL AND pl->>'source_catalog_version'=to_char(ci.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) THEN RAISE EXCEPTION USING errcode='22023',message='CATALOG_SNAPSHOT_MISMATCH';END IF;
 PERFORM 1 FROM public.inventory_stock s JOIN(SELECT (z->>'catalog_item_id')::uuid id,sum((z->>'quantity')::integer)qty FROM jsonb_array_elements(b->'items')z WHERE z->>'inventory_tracking_mode'='tracked_product' GROUP BY 1 ORDER BY 1)q ON q.id=s.catalog_item_id WHERE s.tenant_id=c.tenant_id AND s.branch_id=c.branch_id AND s.quantity_on_hand>=q.qty FOR UPDATE OF s;
 IF EXISTS(SELECT 1 FROM(SELECT (z->>'catalog_item_id')::uuid id,sum((z->>'quantity')::integer)qty FROM jsonb_array_elements(b->'items')z WHERE z->>'inventory_tracking_mode'='tracked_product' GROUP BY 1)q LEFT JOIN public.inventory_stock s ON s.catalog_item_id=q.id AND s.tenant_id=c.tenant_id AND s.branch_id=c.branch_id WHERE s.id IS NULL OR s.quantity_on_hand<q.qty) THEN RAISE EXCEPTION USING errcode='P0001',message='INSUFFICIENT_STOCK';END IF;
 INSERT INTO public.orders(customer_id,status,created_by,created_by_employee_id,notes,branch_id,tenant_id,client_idempotency_key)VALUES(customer,'in_progress',c.authenticated_actor_id,CASE WHEN x.employee_source IN('profile','pos_profile')THEN x.employee_source_id END,b->'order'->>'note',c.branch_id,c.tenant_id,c.id::text)RETURNING id,order_number INTO oid,onum;
 INSERT INTO public.invoices(order_id,customer_id,payment_method,payment_status,subtotal,discount,tax,total,note,created_by,branch_id,tenant_id,cash_received,remaining_from_customer,cash_change)VALUES(oid,customer,b->'payment'->>'method',b->'payment'->>'expected_status',sub,disc,tax,total,b->'order'->>'note',c.authenticated_actor_id,c.branch_id,c.tenant_id,(b->'payment'->>'cash_received')::numeric,(b->'payment'->>'remaining_from_customer')::numeric,(b->'payment'->>'cash_change')::numeric)RETURNING id,invoice_number INTO iid,inum;
 IF inum IS DISTINCT FROM onum THEN RAISE EXCEPTION USING errcode='23514',message='NUMBERING_CONTRACT_VIOLATION';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(b->'items') LOOP SELECT value INTO price FROM jsonb_array_elements(b->'pricing'->'lines') WHERE value->>'line_id'=line->>'line_id';SELECT * INTO item FROM public.catalog_items WHERE id=(line->>'catalog_item_id')::uuid AND tenant_id=c.tenant_id FOR SHARE;INSERT INTO public.invoice_items(invoice_id,item_id,item_name_snapshot,item_type_snapshot,item_category_snapshot,quantity,unit_price,line_total,cost_price,tenant_id)VALUES(iid,item.id,line->>'name_snapshot',line->>'item_type_snapshot',line->>'category_snapshot',(line->>'quantity')::integer,(price->>'unit_price')::numeric,(price->>'taxable_amount')::numeric+(price->>'vat_amount')::numeric,item.cost_price,c.tenant_id)RETURNING id INTO ii;SELECT id INTO mov FROM public.inventory_movements WHERE source_type='invoice_item' AND source_id=ii;INSERT INTO public.atomic_order_line_links(command_id,line_number,invoice_item_id,catalog_item_id,inventory_movement_id,quantity)VALUES(p,(line->>'line_number')::integer,ii,item.id,mov,(line->>'quantity')::integer);END LOOP;
 INSERT INTO public.atomic_order_business_links(command_id,order_id,invoice_id,tenant_id,branch_id)VALUES(p,oid,iid,c.tenant_id,c.branch_id);
 RETURN jsonb_build_object('branchId',c.branch_id,'commandId',c.id,'customerId',customer,'discount',to_char(disc,'FM9999999990.00'),'invoiceId',iid,'invoiceNumber',inum,'lines',(SELECT jsonb_agg(jsonb_build_object('catalogItemId',l.catalog_item_id,'discountAllocation',to_char((pl.value->>'discount_allocation')::numeric,'FM9999999990.00'),'grossAmount',to_char((pl.value->>'gross_amount')::numeric,'FM9999999990.00'),'inventoryMovementId',l.inventory_movement_id,'invoiceItemId',l.invoice_item_id,'lineNumber',l.line_number,'lineTotal',to_char((pl.value->>'taxable_amount')::numeric+(pl.value->>'vat_amount')::numeric,'FM9999999990.00'),'netAmount',to_char((pl.value->>'taxable_amount')::numeric,'FM9999999990.00'),'quantity',l.quantity,'unitPrice',to_char((pl.value->>'unit_price')::numeric,'FM9999999990.00'),'vatAmount',to_char((pl.value->>'vat_amount')::numeric,'FM9999999990.00'),'vatCategory',CASE b->'vat'->>'mode' WHEN 'exclusive' THEN 'standard' ELSE b->'vat'->>'mode' END,'vatRate',to_char((b->'vat'->>'rate')::numeric,'FM9999999990.000000')) ORDER BY l.line_number) FROM public.atomic_order_line_links l JOIN LATERAL(SELECT value FROM jsonb_array_elements(b->'pricing'->'lines') WHERE (value->>'line_id')::uuid=(SELECT (i->>'line_id')::uuid FROM jsonb_array_elements(b->'items') i WHERE (i->>'line_number')::integer=l.line_number))pl ON true WHERE l.command_id=p),'orderId',oid,'orderNumber',onum,'responseVersion','atomic-order-result-v1','result','succeeded','subtotal',to_char(sub,'FM9999999990.00'),'tax',to_char(tax,'FM9999999990.00'),'tenantId',c.tenant_id,'total',to_char(total,'FM9999999990.00'));
END$$;

CREATE FUNCTION public.mark_atomic_order_reconciliation_required_v1(p uuid,prior uuid,digest bytea) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE c public.atomic_order_commands%rowtype;q public.atomic_order_claims%rowtype;BEGIN SELECT * INTO c FROM public.atomic_order_commands WHERE id=p FOR UPDATE;SELECT * INTO q FROM public.atomic_order_claims WHERE command_id=p AND claim_token=prior ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE;IF q.id IS NULL OR q.expires_at>transaction_timestamp() OR q.consumed_at IS NOT NULL OR digest<>afex_core_private.atomic_order_evidence_digest_v1(c,q) THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','RECONCILIATION_EVIDENCE_INVALID');END IF;UPDATE public.atomic_order_claims SET consumed_at=transaction_timestamp(),consumption_kind='reconciliation' WHERE id=q.id;PERFORM afex_core_private.transition_atomic_order_v1(p,ARRAY['processing'],'failed_retryable','RECONCILIATION_REQUIRED','RECONCILIATION_REQUIRED',NULL);RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','reconciliation_required','errorCode','RECONCILIATION_REQUIRED','commandId',p);END$$;
CREATE FUNCTION public.inspect_atomic_order_reconciliation_v1(p uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT CASE WHEN c.id IS NULL THEN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','COMMAND_NOT_FOUND') ELSE jsonb_build_object('responseVersion','atomic-order-result-v1','result',CASE WHEN c.execution_status='failed_retryable' THEN 'reconciliation_required' ELSE 'in_progress' END,'errorCode',CASE WHEN c.execution_status='failed_retryable' THEN 'RECONCILIATION_REQUIRED' ELSE NULL END,'commandId',c.id,'attemptNumber',c.attempt_count,'hasBusinessLink',b.command_id IS NOT NULL) END FROM (SELECT 1)z LEFT JOIN public.atomic_order_commands c ON c.id=p LEFT JOIN public.atomic_order_business_links b ON b.command_id=c.id$$;
CREATE FUNCTION public.place_atomic_order_manual_hold_v1(p uuid,digest bytea) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN PERFORM afex_core_private.transition_atomic_order_v1(p,ARRAY['failed_retryable'],'failed_final','RECONCILIATION_MANUAL_HOLD','MANUAL_HOLD',digest);RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','manual_hold','errorCode','RECONCILIATION_MANUAL_HOLD','commandId',p);END$$;
CREATE FUNCTION public.authorize_atomic_order_retry_v1(p uuid,prior uuid,digest bytea) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE c public.atomic_order_commands%rowtype;a public.atomic_order_retry_authorizations%rowtype;BEGIN SELECT * INTO c FROM public.atomic_order_commands WHERE id=p FOR UPDATE;IF c.execution_status<>'failed_retryable' OR c.attempt_count>=3 OR EXISTS(SELECT 1 FROM public.atomic_order_business_links WHERE command_id=p) OR digest<>afex_core_private.atomic_order_evidence_digest_v1(c,NULL) THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','RETRY_NOT_AUTHORIZED');END IF;INSERT INTO public.atomic_order_retry_authorizations(command_id,prior_claim_token,evidence_digest,next_attempt)VALUES(p,prior,digest,c.attempt_count+1)RETURNING * INTO a;UPDATE public.atomic_order_commands SET error_code='RETRY_AUTHORIZED',updated_at=transaction_timestamp() WHERE id=p;INSERT INTO public.atomic_order_audit(command_id,event_code,attempt_number,actor_id,tenant_id,branch_id)VALUES(p,'RETRY_AUTHORIZED',c.attempt_count,c.authenticated_actor_id,c.tenant_id,c.branch_id);RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','retry_authorized','commandId',p,'expiresAt',a.expires_at);END$$;
CREATE FUNCTION public.resolve_atomic_order_reconciliation_hold_v1(p uuid,prior uuid,digest bytea,succeeded boolean) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$DECLARE c public.atomic_order_commands%rowtype;BEGIN SELECT * INTO c FROM public.atomic_order_commands WHERE id=p FOR UPDATE;IF c.execution_status NOT IN('failed_retryable','failed_final') OR digest<>afex_core_private.atomic_order_evidence_digest_v1(c,NULL) THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','RECONCILIATION_EVIDENCE_INVALID');END IF;IF succeeded AND NOT EXISTS(SELECT 1 FROM public.atomic_order_business_links WHERE command_id=p) THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','BUSINESS_EVIDENCE_CONFLICT');END IF;PERFORM afex_core_private.transition_atomic_order_v1(p,ARRAY[c.execution_status],CASE WHEN succeeded THEN 'succeeded' ELSE 'failed_final' END,CASE WHEN succeeded THEN NULL ELSE 'RECONCILIATION_MANUAL_HOLD' END,CASE WHEN succeeded THEN 'RESOLVED_SUCCESS' ELSE 'RESOLVED_FAILURE' END,NULL);RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result',CASE WHEN succeeded THEN 'succeeded' ELSE 'manual_hold' END,'errorCode',CASE WHEN succeeded THEN NULL ELSE 'RECONCILIATION_MANUAL_HOLD' END,'commandId',p);END$$;

CREATE FUNCTION public.execute_atomic_order_command_v1(p uuid,t uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.atomic_order_commands%rowtype;q public.atomic_order_claims%rowtype;s jsonb;st text;msg text;code text;klass text;
BEGIN
 SELECT * INTO c FROM public.atomic_order_commands WHERE id=p FOR UPDATE;
 SELECT * INTO q FROM public.atomic_order_claims WHERE command_id=p AND claim_token=t AND consumed_at IS NULL ORDER BY attempt_number DESC LIMIT 1 FOR UPDATE;
 IF q.id IS NULL THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','CLAIM_TOKEN_INVALID');
 ELSIF q.expires_at<=transaction_timestamp() THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','reconciliation_required','errorCode','CLAIM_EXPIRED','commandId',p);
 ELSIF c.execution_status<>'processing' OR c.attempt_count<>q.attempt_number OR c.attempt_count>3 OR c.authenticated_actor_id<>q.actor_id OR c.tenant_id<>q.tenant_id OR c.branch_id<>q.branch_id THEN RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','errorCode','CLAIM_BINDING_INVALID');END IF;
 BEGIN
 s:=afex_core_private.persist_atomic_order_business_v1(p,t);
 IF NOT afex_core_private.valid_atomic_order_success_snapshot_v1(s) THEN RAISE EXCEPTION USING errcode='22023',message='SUCCESS_SNAPSHOT_INVALID';END IF;
  UPDATE public.atomic_order_claims SET consumed_at=transaction_timestamp(),consumption_kind='execution' WHERE id=q.id;
  UPDATE public.atomic_order_retry_authorizations SET consumed_at=transaction_timestamp(),consumed_claim_id=q.id WHERE command_id=p AND next_attempt=q.attempt_number AND consumed_at IS NULL;
  UPDATE public.atomic_order_commands SET execution_status='succeeded',lease_owner=NULL,lease_expires_at=NULL,order_id=(s->>'orderId')::uuid,invoice_id=(s->>'invoiceId')::uuid,order_number=s->>'orderNumber',response_version='atomic-order-result-v1',response_snapshot=s,completed_at=transaction_timestamp(),updated_at=transaction_timestamp() WHERE id=p;
  INSERT INTO public.atomic_order_audit(command_id,event_code,attempt_number,actor_id,tenant_id,branch_id)VALUES(p,'SUCCEEDED',q.attempt_number,c.authenticated_actor_id,c.tenant_id,c.branch_id);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
  code:=CASE msg WHEN 'FRACTIONAL_QUANTITY_UNSUPPORTED' THEN msg WHEN 'UNSUPPORTED_FINANCIAL_MODE' THEN msg WHEN 'FINANCIAL_MISMATCH' THEN msg WHEN 'CATALOG_SNAPSHOT_MISMATCH' THEN msg WHEN 'CUSTOMER_VERSION_OR_SCOPE_INVALID' THEN CASE WHEN st='40001' THEN 'CUSTOMER_SCOPE_CONFLICT' ELSE 'CUSTOMER_VERSION_CONFLICT' END WHEN 'PAYLOAD_SCOPE_MISMATCH' THEN 'AUTHORITY_BINDING_INVALID' WHEN 'INSUFFICIENT_STOCK' THEN msg ELSE 'BUSINESS_PERSISTENCE_FAILED' END;
  klass:=CASE WHEN st='42501' THEN 'AUTHORIZATION' WHEN st='40001' THEN 'CONFLICT' WHEN msg='INSUFFICIENT_STOCK' THEN 'INVENTORY' WHEN st='22023' THEN 'VALIDATION' ELSE 'PERSISTENCE' END;
  UPDATE public.atomic_order_claims SET consumed_at=transaction_timestamp(),consumption_kind='failure' WHERE id=q.id;
  UPDATE public.atomic_order_commands SET execution_status='failed_final',lease_owner=NULL,lease_expires_at=NULL,error_code=code,error_detail=NULL,last_failure_stage='DIRECT_SQL_PERSISTENCE',failed_at=transaction_timestamp(),updated_at=transaction_timestamp() WHERE id=p;
  INSERT INTO public.atomic_order_diagnostics(command_id,attempt_number,failure_stage,diagnostic_class,sqlstate_code)VALUES(p,q.attempt_number,'DIRECT_SQL_PERSISTENCE',klass,st);
  INSERT INTO public.atomic_order_audit(command_id,event_code,attempt_number,actor_id,tenant_id,branch_id,public_error_code)VALUES(p,'FAILED',q.attempt_number,c.authenticated_actor_id,c.tenant_id,c.branch_id,code);
  RETURN jsonb_build_object('responseVersion','atomic-order-result-v1','result','failed','commandId',p,'errorCode',code);
 END;
 RETURN s;
END$$;
RESET ROLE;

DO $acl$ DECLARE f regprocedure;BEGIN FOREACH f IN ARRAY ARRAY['public.claim_atomic_order_command_v1(uuid)'::regprocedure,'public.execute_atomic_order_command_v1(uuid,uuid)'::regprocedure,'public.replay_atomic_order_command_v1(uuid)'::regprocedure,'public.inspect_atomic_order_reconciliation_v1(uuid)'::regprocedure,'public.mark_atomic_order_reconciliation_required_v1(uuid,uuid,bytea)'::regprocedure,'public.place_atomic_order_manual_hold_v1(uuid,bytea)'::regprocedure,'public.authorize_atomic_order_retry_v1(uuid,uuid,bytea)'::regprocedure,'public.resolve_atomic_order_reconciliation_hold_v1(uuid,uuid,bytea,boolean)'::regprocedure] LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO afex_function_owner',f);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION public.claim_atomic_order_command_v1(uuid),public.execute_atomic_order_command_v1(uuid,uuid),public.replay_atomic_order_command_v1(uuid),public.inspect_atomic_order_reconciliation_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_atomic_order_reconciliation_required_v1(uuid,uuid,bytea),public.place_atomic_order_manual_hold_v1(uuid,bytea),public.authorize_atomic_order_retry_v1(uuid,uuid,bytea),public.resolve_atomic_order_reconciliation_hold_v1(uuid,uuid,bytea,boolean) TO afex_reconciliation_authority;

DO $post_install$
DECLARE n integer;
BEGIN
 IF to_regprocedure('public.execute_atomic_order_command_v1(uuid,uuid)') IS NULL OR to_regprocedure('public.execute_atomic_order_command_v1(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'P2D22_EXECUTE_SIGNATURE_INVALID';END IF;
 IF to_regprocedure('afex_core_private.persist_atomic_order_business_v1(uuid,uuid)') IS NULL OR to_regprocedure('public.replay_atomic_order_command_v1(uuid)') IS NULL THEN RAISE EXCEPTION 'P2D22_FUNCTION_SET_INCOMPLETE';END IF;
 SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname IN('public','afex_core_private') AND p.proname LIKE '%atomic_order%' AND p.prosecdef AND NOT(p.proconfig@>ARRAY['search_path=pg_catalog']);IF n<>0 THEN RAISE EXCEPTION 'P2D22_INSECURE_SEARCH_PATH';END IF;
 IF has_function_privilege('service_role','public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamptz)','EXECUTE') OR has_schema_privilege('service_role','afex_core_private','USAGE') OR has_function_privilege('service_role','public.authorize_atomic_order_retry_v1(uuid,uuid,bytea)','EXECUTE') THEN RAISE EXCEPTION 'P2D22_SERVICE_ROLE_OVERGRANT';END IF;
 IF NOT has_function_privilege('service_role','public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamptz)','EXECUTE') OR NOT has_function_privilege('service_role','public.claim_atomic_order_command_v1(uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.execute_atomic_order_command_v1(uuid,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.replay_atomic_order_command_v1(uuid)','EXECUTE') THEN RAISE EXCEPTION 'P2D22_SERVICE_ROLE_UNDERGRANT';END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='afex_reconciliation_authority' AND rolcanlogin) THEN RAISE EXCEPTION 'P2D22_RECONCILIATION_ROLE_LOGIN';END IF;
END $post_install$;
