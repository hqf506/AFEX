-- P2D.21B — PostgreSQL 17.6 security, catalog and ledger-integrity tests
-- TEST ONLY. The PowerShell runner supplies TEST_PHASE.
\set ON_ERROR_STOP on
\if :{?TEST_PHASE}
\else
\set TEST_PHASE security
\endif

SELECT :'TEST_PHASE' = 'security' AS p2d21b_run_security \gset
SELECT :'TEST_PHASE' = 'fixture' AS p2d21b_run_fixture \gset
SELECT :'TEST_PHASE' = 'integrity' AS p2d21b_run_integrity \gset

\if :p2d21b_run_security
BEGIN;

DO $security$
DECLARE
    forbidden_role text;
BEGIN
    IF current_setting('server_version_num')::integer <> 170006
       OR current_setting('server_encoding') <> 'UTF8' THEN
        RAISE EXCEPTION 'P2D21B wrong server identity';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_roles r ON r.oid = p.proowner
        WHERE n.nspname = 'public'
          AND p.proname = 'acquire_atomic_order_command_v1'
          AND p.prosecdef
          AND p.proconfig = ARRAY['search_path=pg_catalog']::text[]
          AND r.rolname = 'afex_function_owner'
    ) THEN
        RAISE EXCEPTION 'P2D21B function security contract mismatch';
    END IF;

    IF NOT has_function_privilege(
        'afex_core_runtime',
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'P2D21B runtime EXECUTE missing';
    END IF;

    FOREACH forbidden_role IN ARRAY ARRAY[
        'PUBLIC',
        'anon',
        'authenticated',
        'service_role',
        'afex_context_issuer',
        'afex_outbox_worker'
    ]::text[]
    LOOP
        IF forbidden_role <> 'PUBLIC'
           AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = forbidden_role) THEN
            CONTINUE;
        END IF;
        IF has_function_privilege(
            forbidden_role,
            'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)',
            'EXECUTE'
        ) THEN
            RAISE EXCEPTION 'P2D21B forbidden EXECUTE: %', forbidden_role;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
            'atomic_authorization_contexts',
            'atomic_order_commands',
            'atomic_order_command_payloads'
        ]) AS relation_name
        CROSS JOIN unnest(ARRAY[
            'PUBLIC',
            'afex_core_runtime',
            'afex_context_issuer',
            'afex_outbox_worker'
        ]) AS role_name
        WHERE has_table_privilege(
            role_name,
            'public.' || relation_name,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
    ) THEN
        RAISE EXCEPTION 'P2D21B forbidden direct table privilege';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
              'atomic_authorization_contexts',
              'atomic_order_commands',
              'atomic_order_command_payloads'
          )
          AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
    ) THEN
        RAISE EXCEPTION 'P2D21B RLS/FORCE RLS mismatch';
    END IF;
END
$security$;

DO $acl_array_validation$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        JOIN pg_catalog.pg_class AS relation_state
          ON relation_state.oid = attribute_state.attrelid
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE namespace_state.nspname = 'public'
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
            message = 'P2D.21B failed: malformed column ACL array';
    END IF;
END
$acl_array_validation$;

SELECT
    pg_get_function_result(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'::regprocedure
    ) AS function_result,
    encode(
        sha256(
            convert_to(
                (
                    SELECT prosrc
                    FROM pg_proc
                    WHERE oid =
                        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'::regprocedure
                ),
                'UTF8'
            )
        ),
        'hex'
    ) AS function_source_sha256,
    current_setting('lc_collate') AS lc_collate,
    current_setting('lc_ctype') AS lc_ctype,
    'P2D21B_500_SECURITY_CATALOG_OK'::text AS marker;

SELECT
    c.relname,
    a.attname,
    acl.grantor::regrole AS grantor,
    acl.grantee::regrole AS grantee,
    acl.privilege_type,
    acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
CROSS JOIN LATERAL pg_catalog.unnest(a.attacl) AS acl_item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(
    ARRAY[acl_item.value]::aclitem[]
) AS acl
WHERE n.nspname = 'public'
ORDER BY c.relname, a.attnum, acl.grantee, acl.privilege_type;

SELECT
    roleid::regrole AS granted_role,
    member::regrole AS member,
    grantor::regrole AS grantor,
    admin_option,
    inherit_option,
    set_option
FROM pg_auth_members
ORDER BY roleid, member, grantor;

ROLLBACK;
\endif

\if :p2d21b_run_fixture
BEGIN;

CREATE ROLE p2d21b_runtime_a
    LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE p2d21b_runtime_b
    LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOREPLICATION NOBYPASSRLS PASSWORD NULL;
GRANT afex_core_runtime TO p2d21b_runtime_a
    WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT afex_core_runtime TO p2d21b_runtime_b
    WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

CREATE SCHEMA p2d21b;
REVOKE ALL ON SCHEMA p2d21b FROM PUBLIC;

CREATE FUNCTION p2d21b.valid_payload(p_source_channel text DEFAULT 'pos')
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fixture$
SELECT jsonb_build_object(
    'payload_version', 'order-command-payload-v1',
    'fingerprint_version', 'order-request-fingerprint-v1',
    'command_type', 'order.create',
    'tenant_id', '10000000-0000-4000-8000-000000000001',
    'branch_id', '20000000-0000-4000-8000-000000000001',
    'authenticated_actor_id', '30000000-0000-4000-8000-000000000001',
    'customer', jsonb_build_object(
        'mode', 'none', 'customer_id', NULL,
        'expected_record_version', NULL, 'normalized_phone', NULL,
        'display_phone', NULL, 'name', NULL, 'email', NULL,
        'address', NULL, 'notes', NULL,
        'allowed_update_fields', '[]'::jsonb,
        'conflict_behavior', 'reject'
    ),
    'items', jsonb_build_array(jsonb_build_object(
        'line_id', '40000000-0000-4000-8000-000000000001',
        'line_number', 1,
        'catalog_item_id', '50000000-0000-4000-8000-000000000001',
        'name_snapshot', 'Synthetic service',
        'sku_snapshot', NULL, 'category_snapshot', NULL,
        'item_type_snapshot', 'service', 'quantity', '1',
        'unit_snapshot', 'service',
        'inventory_tracking_mode', 'service',
        'fulfillment_class', 'service',
        'line_note', NULL, 'modifiers', '[]'::jsonb
    )),
    'pricing', jsonb_build_object(
        'currency', 'SAR', 'currency_precision', 2,
        'subtotal', '0.00', 'taxable_subtotal', '0.00', 'total', '0.00',
        'rounding_strategy', 'invoice-half-up-v1',
        'price_version', 'synthetic-v1',
        'branch_pricing_version', NULL,
        'quote_reference', 'synthetic-quote',
        'quote_version', 'financial-quote-v1',
        'quote_fingerprint', repeat('0', 64),
        'financial_engine_version', 'financial-engine-v2-r1',
        'lines', jsonb_build_array(jsonb_build_object(
            'line_id', '40000000-0000-4000-8000-000000000001',
            'unit_price', '0.00', 'pricing_source', 'catalog_default',
            'source_catalog_id', '50000000-0000-4000-8000-000000000001',
            'source_branch_price_id', NULL,
            'source_catalog_version', 'synthetic-v1',
            'source_branch_price_version', NULL,
            'gross_amount', '0.00', 'discount_allocation', '0.00',
            'taxable_amount', '0.00', 'vat_amount', '0.00',
            'net_amount', '0.00'
        ))
    ),
    'vat', jsonb_build_object(
        'mode', 'exempt', 'tax_inclusive', false, 'setting_id', NULL,
        'rate', '0', 'amount', '0.00', 'rule_version', 'synthetic-v1',
        'effective_at', '2026-01-01T00:00:00.000000Z'
    ),
    'discount', jsonb_build_object(
        'id', NULL, 'source', 'none', 'name_snapshot', NULL,
        'type', NULL, 'value', NULL, 'amount', '0.00',
        'eligibility_version', NULL, 'rule_version', NULL
    ),
    'payment', jsonb_build_object(
        'method', 'cash', 'amount_tendered', '0.00',
        'expected_status', 'paid', 'cash_received', '0.00',
        'remaining_from_customer', '0.00', 'cash_change', '0.00',
        'rule_version', 'synthetic-v1', 'provider_reference', NULL
    ),
    'fulfillment', jsonb_build_object(
        'method', 'service',
        'branch_id', '20000000-0000-4000-8000-000000000001',
        'requested_at', NULL, 'address', NULL, 'instructions', NULL
    ),
    'order', jsonb_build_object('note', NULL),
    'metadata', jsonb_build_object(
        'source_channel', p_source_channel,
        'request_reference', NULL, 'offline_draft_id', NULL,
        'correlation_id', 'p2d21b-synthetic',
        'device_id', NULL, 'pos_terminal_id', NULL, 'client_version', NULL
    ),
    'versions', jsonb_build_object(
        'customer_engine', 'synthetic-v1',
        'financial_engine', 'financial-engine-v2-r1',
        'inventory_engine', 'synthetic-v1',
        'numbering_engine', 'synthetic-v1',
        'authorization_contract', 'synthetic-v1',
        'payload_contract', 'order-command-payload-v1'
    )
)
$fixture$;

CREATE FUNCTION p2d21b.fingerprint_projection(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $projection$
WITH pricing_lines AS (
    SELECT COALESCE(
        jsonb_agg(value - 'net_amount' ORDER BY ordinality),
        '[]'::jsonb
    ) AS value
    FROM jsonb_array_elements(p_payload->'pricing'->'lines')
         WITH ORDINALITY
)
SELECT jsonb_set(
    jsonb_set(
        jsonb_set(
            jsonb_set(
                p_payload - 'fingerprint_version' - 'issuance'
                          - 'retention' - 'archive',
                '{metadata}',
                jsonb_build_object(
                    'source_channel',
                    p_payload->'metadata'->'source_channel'
                ),
                false
            ),
            '{payment}',
            (p_payload->'payment') - 'masked_instrument'
                                   - 'provider_reference',
            false
        ),
        '{versions}',
        (p_payload->'versions') - 'payload_contract',
        false
    ),
    '{pricing,lines}',
    pricing_lines.value,
    false
)
FROM pricing_lines
$projection$;

REVOKE ALL ON FUNCTION p2d21b.valid_payload(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION p2d21b.fingerprint_projection(jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA p2d21b TO p2d21b_runtime_a, p2d21b_runtime_b;
GRANT EXECUTE ON FUNCTION p2d21b.valid_payload(text)
    TO p2d21b_runtime_a, p2d21b_runtime_b;
GRANT EXECUTE ON FUNCTION p2d21b.fingerprint_projection(jsonb)
    TO p2d21b_runtime_a, p2d21b_runtime_b;

COMMIT;

SELECT 'P2D21B_600_CONCURRENCY_FIXTURE_OK'::text AS marker;
\endif

\if :p2d21b_run_integrity
BEGIN;

DO $integrity$
DECLARE
    orphan_contexts bigint;
    orphan_commands bigint;
    orphan_payloads bigint;
BEGIN
    SELECT count(*) INTO orphan_contexts
    FROM public.atomic_authorization_contexts c
    LEFT JOIN public.atomic_order_commands o
      ON o.authorization_context_id = c.id
    WHERE o.id IS NULL;

    SELECT count(*) INTO orphan_commands
    FROM public.atomic_order_commands c
    LEFT JOIN public.atomic_order_command_payloads p
      ON p.command_id = c.id
    WHERE p.command_id IS NULL;

    SELECT count(*) INTO orphan_payloads
    FROM public.atomic_order_command_payloads p
    LEFT JOIN public.atomic_order_commands c
      ON c.id = p.command_id
    WHERE c.id IS NULL;

    IF orphan_contexts <> 0 OR orphan_commands <> 0 OR orphan_payloads <> 0 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D21B orphan ledger record detected',
            detail = format(
                'contexts=%s commands=%s payloads=%s',
                orphan_contexts,
                orphan_commands,
                orphan_payloads
            );
    END IF;
END
$integrity$;

SELECT
    count(*) FILTER (WHERE execution_status = 'reserved') AS reserved,
    count(*) AS commands,
    (SELECT count(*) FROM public.atomic_authorization_contexts) AS contexts,
    (SELECT count(*) FROM public.atomic_order_command_payloads) AS payloads,
    'P2D21B_800_CONCURRENCY_INTEGRITY_OK'::text AS marker
FROM public.atomic_order_commands;

ROLLBACK;
\endif

-- Concurrency calls are launched as distinct psql sessions by the runner.
-- It asserts: same key/same fingerprint yields one created and one
-- in_progress/replay; same key/different fingerprint yields
-- fingerprint_conflict; a deliberately invalid payload leaves all ledgers
-- unchanged. Advisory-lock serialization is demonstrated by elapsed session
-- evidence and the final orphan/row-count assertions above.
-- END OF P2D.21B SECURITY AND CONCURRENCY TESTS
