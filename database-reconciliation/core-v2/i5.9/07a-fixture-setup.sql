/*
 * AFEX Enterprise Platform Core V2 - Package 7.2
 * Isolated Clone/Staging deterministic fixture setup
 *
 * CLASSIFICATION: TEST FIXTURE DDL/DML -- NEVER PRODUCTION
 * EXECUTION POSITION:
 *   07-pre-run-verification.sql -> external approvals -> this file -> 07b..07g
 *
 * This is not a migration. It creates no permanent schema objects. The
 * pg_temp tables are intentionally ON COMMIT PRESERVE ROWS and MUST remain
 * available in the same database session through pre-disposal verification
 * and suite evidence export. Closing the session earlier loses the manifests
 * and is a STOP condition.
 *
 * External blocking attestations (PostgreSQL cannot prove either fact):
 *   1. The target is an explicitly approved disposable Clone/Staging database.
 *   2. Email, WhatsApp, SMS, webhook and every provider delivery are disabled.
 *
 * Approved dependency:
 *   07-pre-run-verification.sql
 *   SHA-256 17fd262abd769cc6553b249625d92e206f75b8603e4d52a11d14842c9c567b45
 */

BEGIN;

-- ============================================================================
-- A. OPERATOR-EDITABLE PARAMETERS
-- ============================================================================
-- Replace every REPLACE_* value. UUID values remain text until validation so
-- the unedited artifact fails with a controlled exception, not an implicit
-- cast error. No UUID is generated at runtime.

CREATE TEMP TABLE pg_temp.package7_fixture_parameters (
  approved_environment text NOT NULL,
  disposable_clone_identifier text NOT NULL,
  database_project_reference text NOT NULL,
  host_identity text NOT NULL,
  baseline_identifier text NOT NULL,
  baseline_schema_sha256 text NOT NULL,
  provider_disabled_attestation_reference text NOT NULL,
  evidence_export_plan_reference text NOT NULL,
  destruction_reset_method text NOT NULL,
  destruction_reset_owner text NOT NULL,
  post_disposal_attestation_identifier text NOT NULL,
  test_executor_login_role text NOT NULL,
  package7_run_identifier text NOT NULL,
  fixture_namespace text NOT NULL,
  before_image_retention_identifier text NOT NULL,
  primary_tenant_id_text text NOT NULL,
  isolation_tenant_id_text text NOT NULL,
  primary_branch_id_text text NOT NULL,
  secondary_branch_id_text text NOT NULL,
  isolation_branch_id_text text NOT NULL,
  primary_customer_id_text text NOT NULL,
  isolation_customer_id_text text NOT NULL,
  category_id_text text NOT NULL,
  tracked_item_id_text text NOT NULL,
  service_item_id_text text NOT NULL,
  isolation_item_id_text text NOT NULL,
  primary_branch_item_id_text text NOT NULL,
  secondary_branch_item_id_text text NOT NULL,
  isolation_branch_item_id_text text NOT NULL,
  primary_vat_id_text text NOT NULL,
  isolation_vat_id_text text NOT NULL,
  primary_discount_id_text text NOT NULL,
  primary_inventory_id_text text NOT NULL,
  secondary_inventory_id_text text NOT NULL,
  isolation_inventory_id_text text NOT NULL,
  operator_profile_id_text text NOT NULL,
  observer_profile_id_text text NOT NULL,
  primary_actor_profile_id_text text NOT NULL,
  isolation_actor_profile_id_text text NOT NULL,
  managed_runtime_identity_id_text text NOT NULL,
  managed_outbox_identity_id_text text NOT NULL,
  sequence_month_text text NOT NULL,
  approved_change_ticket text NOT NULL
) ON COMMIT PRESERVE ROWS;

INSERT INTO pg_temp.package7_fixture_parameters VALUES (
  'REPLACE_WITH_APPROVED_DISPOSABLE_CLONE_ENVIRONMENT',
  'REPLACE_WITH_APPROVED_DISPOSABLE_CLONE_ID',
  'REPLACE_WITH_APPROVED_DATABASE_PROJECT_REFERENCE',
  'REPLACE_WITH_APPROVED_HOST_IDENTITY',
  'REPLACE_WITH_APPROVED_BASELINE_ID',
  'REPLACE_WITH_64_HEX_SHA256',
  'REPLACE_WITH_PROVIDER_DISABLED_ATTESTATION',
  'REPLACE_WITH_EVIDENCE_EXPORT_PLAN',
  'REPLACE_WITH_DESTRUCTION_RESET_METHOD',
  'REPLACE_WITH_DESTRUCTION_RESET_OWNER',
  'REPLACE_WITH_POST_DISPOSAL_ATTESTATION_ID',
  'afex_package7_test_executor',
  'REPLACE_WITH_APPROVED_PACKAGE7_RUN_ID',
  'REPLACE_WITH_APPROVED_PACKAGE7_NAMESPACE',
  'REPLACE_WITH_APPROVED_BEFORE_IMAGE_RETENTION_ID',
  'REPLACE_WITH_PRIMARY_TENANT_UUID',
  'REPLACE_WITH_ISOLATION_TENANT_UUID',
  'REPLACE_WITH_PRIMARY_BRANCH_UUID',
  'REPLACE_WITH_SECONDARY_BRANCH_UUID',
  'REPLACE_WITH_ISOLATION_BRANCH_UUID',
  'REPLACE_WITH_PRIMARY_CUSTOMER_UUID',
  'REPLACE_WITH_ISOLATION_CUSTOMER_UUID',
  'REPLACE_WITH_CATEGORY_UUID',
  'REPLACE_WITH_TRACKED_ITEM_UUID',
  'REPLACE_WITH_SERVICE_ITEM_UUID',
  'REPLACE_WITH_ISOLATION_ITEM_UUID',
  'REPLACE_WITH_PRIMARY_BRANCH_ITEM_UUID',
  'REPLACE_WITH_SECONDARY_BRANCH_ITEM_UUID',
  'REPLACE_WITH_ISOLATION_BRANCH_ITEM_UUID',
  'REPLACE_WITH_PRIMARY_VAT_UUID',
  'REPLACE_WITH_ISOLATION_VAT_UUID',
  'REPLACE_WITH_PRIMARY_DISCOUNT_UUID',
  'REPLACE_WITH_PRIMARY_INVENTORY_UUID',
  'REPLACE_WITH_SECONDARY_INVENTORY_UUID',
  'REPLACE_WITH_ISOLATION_INVENTORY_UUID',
  'REPLACE_WITH_OPERATOR_PROFILE_UUID',
  'REPLACE_WITH_OBSERVER_PROFILE_UUID',
  'REPLACE_WITH_PRIMARY_ACTOR_PROFILE_UUID',
  'REPLACE_WITH_ISOLATION_ACTOR_PROFILE_UUID',
  'REPLACE_WITH_MANAGED_RUNTIME_IDENTITY_UUID',
  'REPLACE_WITH_MANAGED_OUTBOX_IDENTITY_UUID',
  'REPLACE_WITH_SEQUENCE_MONTH_YYYY_MM_01',
  'REPLACE_WITH_APPROVED_CHANGE_TICKET'
);

CREATE TEMP TABLE pg_temp.package7_fixture_context (
  approved_environment text PRIMARY KEY,
  disposable_clone_identifier text NOT NULL UNIQUE,
  database_project_reference text NOT NULL,
  host_identity text NOT NULL,
  baseline_identifier text NOT NULL,
  baseline_schema_sha256 text NOT NULL,
  provider_disabled_attestation_reference text NOT NULL,
  evidence_export_plan_reference text NOT NULL,
  destruction_reset_method text NOT NULL,
  destruction_reset_owner text NOT NULL,
  post_disposal_attestation_identifier text NOT NULL,
  test_executor_login_role name NOT NULL,
  package7_run_identifier text NOT NULL UNIQUE,
  fixture_namespace text NOT NULL UNIQUE,
  before_image_retention_identifier text NOT NULL UNIQUE,
  primary_tenant_id uuid NOT NULL,
  isolation_tenant_id uuid NOT NULL,
  primary_branch_id uuid NOT NULL,
  secondary_branch_id uuid NOT NULL,
  isolation_branch_id uuid NOT NULL,
  primary_customer_id uuid NOT NULL,
  isolation_customer_id uuid NOT NULL,
  category_id uuid NOT NULL,
  tracked_item_id uuid NOT NULL,
  service_item_id uuid NOT NULL,
  isolation_item_id uuid NOT NULL,
  primary_branch_item_id uuid NOT NULL,
  secondary_branch_item_id uuid NOT NULL,
  isolation_branch_item_id uuid NOT NULL,
  primary_vat_id uuid NOT NULL,
  isolation_vat_id uuid NOT NULL,
  primary_discount_id uuid NOT NULL,
  primary_inventory_id uuid NOT NULL,
  secondary_inventory_id uuid NOT NULL,
  isolation_inventory_id uuid NOT NULL,
  operator_profile_id uuid NOT NULL,
  observer_profile_id uuid NOT NULL,
  primary_actor_profile_id uuid NOT NULL,
  isolation_actor_profile_id uuid NOT NULL,
  managed_runtime_identity_id uuid NOT NULL,
  managed_outbox_identity_id uuid NOT NULL,
  sequence_month date NOT NULL,
  approved_change_ticket text NOT NULL,
  setup_transaction_id bigint NOT NULL,
  setup_at timestamptz NOT NULL
) ON COMMIT PRESERVE ROWS;

CREATE TEMP TABLE pg_temp.package7_before_images (
  retention_identifier text NOT NULL,
  package7_run_identifier text NOT NULL,
  object_name text NOT NULL,
  primary_key jsonb NOT NULL,
  row_existed boolean NOT NULL,
  before_row jsonb,
  captured_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (retention_identifier, object_name, primary_key),
  CHECK (
    (row_existed AND before_row IS NOT NULL)
    OR
    (NOT row_existed AND before_row IS NULL)
  )
) ON COMMIT PRESERVE ROWS;

CREATE TEMP TABLE pg_temp.package7_created_rows (
  package7_run_identifier text NOT NULL,
  object_name text NOT NULL,
  primary_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (package7_run_identifier, object_name, primary_key)
) ON COMMIT PRESERVE ROWS;

-- ============================================================================
-- B. PARAMETER AND STATIC CONTRACT VALIDATION
-- ============================================================================

DO $package7_parameters$
DECLARE
  p pg_temp.package7_fixture_parameters%ROWTYPE;
  value_text text;
  uuid_values uuid[];
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_temp.package7_fixture_parameters) <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'PACKAGE7_PARAMETER_ROW_COUNT_INVALID';
  END IF;

  SELECT * INTO STRICT p FROM pg_temp.package7_fixture_parameters;

  FOREACH value_text IN ARRAY ARRAY[
    p.approved_environment,
    p.disposable_clone_identifier,
    p.database_project_reference,
    p.host_identity,
    p.baseline_identifier,
    p.provider_disabled_attestation_reference,
    p.evidence_export_plan_reference,
    p.destruction_reset_method,
    p.destruction_reset_owner,
    p.post_disposal_attestation_identifier,
    p.test_executor_login_role,
    p.package7_run_identifier,
    p.fixture_namespace,
    p.before_image_retention_identifier,
    p.approved_change_ticket
  ] LOOP
    IF value_text LIKE 'REPLACE_%'
       OR value_text !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'PACKAGE7_TEXT_PARAMETER_INVALID',
        DETAIL = 'All text parameters require approved safe values.';
    END IF;
  END LOOP;

  IF p.baseline_schema_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'PACKAGE7_BASELINE_SCHEMA_HASH_INVALID';
  END IF;

  IF p.test_executor_login_role <> 'afex_package7_test_executor' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'PACKAGE7_TEST_EXECUTOR_LOGIN_ROLE_INVALID';
  END IF;

  IF p.approved_environment NOT IN ('development', 'staging') THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_PRODUCTION_TARGET_FORBIDDEN',
      DETAIL = 'Only an externally approved dedicated disposable Clone is allowed.';
  END IF;

  IF p.sequence_month_text LIKE 'REPLACE_%'
     OR p.sequence_month_text !~ '^[0-9]{4}-[0-9]{2}-01$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'PACKAGE7_SEQUENCE_MONTH_INVALID';
  END IF;

  FOREACH value_text IN ARRAY ARRAY[
    p.primary_tenant_id_text, p.isolation_tenant_id_text,
    p.primary_branch_id_text, p.secondary_branch_id_text,
    p.isolation_branch_id_text, p.primary_customer_id_text,
    p.isolation_customer_id_text, p.category_id_text,
    p.tracked_item_id_text, p.service_item_id_text, p.isolation_item_id_text,
    p.primary_branch_item_id_text, p.secondary_branch_item_id_text,
    p.isolation_branch_item_id_text, p.primary_vat_id_text,
    p.isolation_vat_id_text, p.primary_discount_id_text,
    p.primary_inventory_id_text, p.secondary_inventory_id_text,
    p.isolation_inventory_id_text, p.operator_profile_id_text,
    p.observer_profile_id_text, p.primary_actor_profile_id_text,
    p.isolation_actor_profile_id_text,
    p.managed_runtime_identity_id_text,
    p.managed_outbox_identity_id_text
  ] LOOP
    IF value_text LIKE 'REPLACE_%'
       OR value_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR value_text = '00000000-0000-0000-0000-000000000000' THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'PACKAGE7_UUID_PARAMETER_INVALID';
    END IF;
  END LOOP;

  uuid_values := ARRAY[
    p.primary_tenant_id_text::uuid, p.isolation_tenant_id_text::uuid,
    p.primary_branch_id_text::uuid, p.secondary_branch_id_text::uuid,
    p.isolation_branch_id_text::uuid, p.primary_customer_id_text::uuid,
    p.isolation_customer_id_text::uuid, p.category_id_text::uuid,
    p.tracked_item_id_text::uuid, p.service_item_id_text::uuid,
    p.isolation_item_id_text::uuid,
    p.primary_branch_item_id_text::uuid, p.secondary_branch_item_id_text::uuid,
    p.isolation_branch_item_id_text::uuid, p.primary_vat_id_text::uuid,
    p.isolation_vat_id_text::uuid, p.primary_discount_id_text::uuid,
    p.primary_inventory_id_text::uuid, p.secondary_inventory_id_text::uuid,
    p.isolation_inventory_id_text::uuid, p.operator_profile_id_text::uuid,
    p.observer_profile_id_text::uuid, p.primary_actor_profile_id_text::uuid,
    p.isolation_actor_profile_id_text::uuid,
    p.managed_runtime_identity_id_text::uuid,
    p.managed_outbox_identity_id_text::uuid
  ];

  IF (SELECT pg_catalog.count(DISTINCT u) FROM pg_catalog.unnest(uuid_values) AS u)
     <> pg_catalog.array_length(uuid_values, 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'PACKAGE7_UUID_PARAMETERS_NOT_PAIRWISE_DISTINCT';
  END IF;

  INSERT INTO pg_temp.package7_fixture_context
  SELECT
    p.approved_environment,
    p.disposable_clone_identifier,
    p.database_project_reference,
    p.host_identity,
    p.baseline_identifier,
    p.baseline_schema_sha256,
    p.provider_disabled_attestation_reference,
    p.evidence_export_plan_reference,
    p.destruction_reset_method,
    p.destruction_reset_owner,
    p.post_disposal_attestation_identifier,
    p.test_executor_login_role::name,
    p.package7_run_identifier,
    p.fixture_namespace,
    p.before_image_retention_identifier,
    p.primary_tenant_id_text::uuid,
    p.isolation_tenant_id_text::uuid,
    p.primary_branch_id_text::uuid,
    p.secondary_branch_id_text::uuid,
    p.isolation_branch_id_text::uuid,
    p.primary_customer_id_text::uuid,
    p.isolation_customer_id_text::uuid,
    p.category_id_text::uuid,
    p.tracked_item_id_text::uuid,
    p.service_item_id_text::uuid,
    p.isolation_item_id_text::uuid,
    p.primary_branch_item_id_text::uuid,
    p.secondary_branch_item_id_text::uuid,
    p.isolation_branch_item_id_text::uuid,
    p.primary_vat_id_text::uuid,
    p.isolation_vat_id_text::uuid,
    p.primary_discount_id_text::uuid,
    p.primary_inventory_id_text::uuid,
    p.secondary_inventory_id_text::uuid,
    p.isolation_inventory_id_text::uuid,
    p.operator_profile_id_text::uuid,
    p.observer_profile_id_text::uuid,
    p.primary_actor_profile_id_text::uuid,
    p.isolation_actor_profile_id_text::uuid,
    p.managed_runtime_identity_id_text::uuid,
    p.managed_outbox_identity_id_text::uuid,
    p.sequence_month_text::date,
    p.approved_change_ticket,
    pg_catalog.txid_current(),
    pg_catalog.clock_timestamp();
END;
$package7_parameters$;

/* Clone-only execution identity.
 *
 * The externally provisioned, restricted Clone LOGIN
 * afex_package7_test_executor is the single Package 7 executor. Its exact
 * grants and Clone-only RLS policies are verified by preflight. Package 7 does
 * not create or grant this identity. No Production/runtime role or membership
 * is modified, and the identity disappears with Clone destruction.
 */
DO $package7_execution_identity$
DECLARE
  c pg_temp.package7_fixture_context%ROWTYPE;
  login_role pg_catalog.pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
  SELECT * INTO STRICT login_role
  FROM pg_catalog.pg_roles
  WHERE rolname = c.test_executor_login_role;

  IF NOT login_role.rolcanlogin OR login_role.rolsuper
     OR login_role.rolcreatedb OR login_role.rolcreaterole
     OR login_role.rolinherit OR login_role.rolreplication
     OR login_role.rolbypassrls THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='PACKAGE7_TEST_EXECUTOR_LOGIN_CONTRACT_INVALID';
  END IF;

  IF session_user <> c.test_executor_login_role::text
     OR current_user <> session_user THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='PACKAGE7_TEST_EXECUTOR_SESSION_INVALID',
      DETAIL='Run fixture setup directly as the approved restricted Clone LOGIN.';
  END IF;

END;
$package7_execution_identity$;

-- A stable transaction lock prevents concurrent preparation of the same
-- approved environment/run. It is acquired only after placeholder validation.
SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('AFEX_CORE_V2_PACKAGE_7_FIXTURE_V1'),
  pg_catalog.hashtext(
    approved_environment || ':' || package7_run_identifier
  )
)
FROM pg_temp.package7_fixture_context;

DO $package7_contract$
DECLARE
  required_tables constant text[] := ARRAY[
    'tenants','branches','profiles','customers','catalog_categories',
    'catalog_items','branch_catalog_items','discounts','vat_settings',
    'inventory_stock','order_number_sequences',
    'core_v2_activation_control','core_v2_tenant_activation',
    'core_v2_branch_activation','core_v2_managed_identities',
    'core_v2_issuer_rate_limit_config','core_v2_verification_evidence',
    'financial_quotes','atomic_authorization_contexts'
  ];
  required_functions constant text[] := ARRAY[
    'public.register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)',
    'public.issue_atomic_authorization_context_v1(uuid,text,text)',
    'public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)',
    'public.consume_atomic_authorization_context_v1(text,text,uuid)',
    'public.revoke_atomic_authorization_context_v1(uuid,text)',
    'public.issue_authoritative_financial_quote_v1(text,jsonb,text)',
    'public.verify_authoritative_quote_hash_v1(jsonb,text)',
    'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
    'public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'
  ];
  function_signature text;
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION USING ERRCODE = '0A000',
      MESSAGE = 'PACKAGE7_POSTGRESQL_MAJOR_VERSION_MUST_BE_17';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(required_tables) AS required(table_name)
    WHERE pg_catalog.to_regclass('public.' || required.table_name) IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42P01',
      MESSAGE = 'PACKAGE7_REQUIRED_TABLE_MISSING';
  END IF;

  FOREACH function_signature IN ARRAY required_functions LOOP
    IF pg_catalog.to_regprocedure(function_signature) IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42883',
        MESSAGE = 'PACKAGE7_REQUIRED_FUNCTION_SIGNATURE_MISSING',
        DETAIL = function_signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('public.register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)', 'afex_core_activation_operator'),
        ('public.issue_atomic_authorization_context_v1(uuid,text,text)', 'afex_context_issuer'),
        ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)', 'afex_context_issuer'),
        ('public.consume_atomic_authorization_context_v1(text,text,uuid)', 'afex_core_owner'),
        ('public.revoke_atomic_authorization_context_v1(uuid,text)', 'afex_context_issuer'),
        ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)', 'afex_core_owner'),
        ('public.verify_authoritative_quote_hash_v1(jsonb,text)', 'afex_core_owner'),
        ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)', 'afex_core_owner'),
        ('public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)', 'afex_core_activation_owner')
    ) AS required(signature, owner_name)
    JOIN pg_catalog.pg_proc AS proc
      ON proc.oid = pg_catalog.to_regprocedure(required.signature)
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = proc.proowner
    WHERE owner_role.rolname <> required.owner_name
       OR proc.proconfig IS DISTINCT FROM
          ARRAY['search_path=pg_catalog']::text[]
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_FUNCTION_OWNER_OR_SEARCH_PATH_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.financial_quotes'::regclass
      AND tgname = 'trg_financial_quotes_immutable_v1'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_QUOTE_IMMUTABILITY_TRIGGER_MISSING';
  END IF;
END;
$package7_contract$;

-- ============================================================================
-- C. FAIL-CLOSED RUNTIME AND COLLISION PREFLIGHT
-- ============================================================================

DO $package7_preflight$
DECLARE
  c pg_temp.package7_fixture_context%ROWTYPE;
  managed_count integer;
  membership_count integer;
  identity_role name;
  expected_role name;
BEGIN
  SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;

  IF (SELECT pg_catalog.count(*) FROM public.core_v2_activation_control) <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public.core_v2_activation_control
       WHERE singleton_id
         AND NOT global_enabled
         AND kill_switch
         AND NOT pos_enabled
         AND NOT admin_orders_enabled
         AND NOT quote_issuer_enabled
         AND NOT outbox_worker_enabled
         AND deterministic_canary_percentage = 0
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_GLOBAL_ACTIVATION_NOT_FAIL_CLOSED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.core_v2_tenant_activation
    WHERE tenant_id IN (c.primary_tenant_id, c.isolation_tenant_id)
      AND (enabled OR canary_eligible OR pos_enabled
           OR admin_orders_enabled OR quote_enabled)
  ) OR EXISTS (
    SELECT 1 FROM public.core_v2_branch_activation
    WHERE branch_id IN (
      c.primary_branch_id, c.secondary_branch_id, c.isolation_branch_id
    )
      AND (enabled OR canary_eligible OR pos_enabled
           OR admin_orders_enabled OR quote_enabled)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_FIXTURE_SCOPE_ALREADY_ENABLED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.core_v2_verification_evidence
    WHERE test_run_identifier = c.package7_run_identifier
      AND supersedes_evidence_id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'PACKAGE7_RUN_IDENTIFIER_EVIDENCE_CONFLICT';
  END IF;

  -- Package 7 fixture setup does not alter global issuer-rate-limit
  -- configuration. Both frozen issuer kinds must already exist so later tests
  -- can inspect the approved Clone/Staging configuration without fixture DML.
  IF (SELECT pg_catalog.count(*)
      FROM public.core_v2_issuer_rate_limit_config
      WHERE issuer_kind IN ('authenticated_context','pos_pin_context')) <> 2
     OR (SELECT pg_catalog.count(*)
         FROM public.core_v2_issuer_rate_limit_config) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_ISSUER_RATE_LIMIT_CONFIGURATION_INVALID',
      DETAIL = 'Fixture setup requires both approved issuer configurations and never mutates them.';
  END IF;

  -- The two approved Clone/Staging tenant anchors and their actor profiles
  -- must already exist. Creating auth-backed profiles is outside Package 7.
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = c.primary_tenant_id
      AND name = c.fixture_namespace || '-PRIMARY-TENANT'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = c.isolation_tenant_id
      AND name = c.fixture_namespace || '-ISOLATION-TENANT'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_APPROVED_TEST_TENANT_ANCHOR_MISSING',
      DETAIL = 'Create/approve isolated tenant anchors outside this fixture transaction.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.branches
    WHERE id IN (
      c.primary_branch_id, c.secondary_branch_id, c.isolation_branch_id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.customers
    WHERE id IN (c.primary_customer_id, c.isolation_customer_id)
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_categories WHERE id = c.category_id
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_items
    WHERE id IN (c.tracked_item_id, c.service_item_id, c.isolation_item_id)
  ) OR EXISTS (
    SELECT 1 FROM public.branch_catalog_items
    WHERE id IN (
      c.primary_branch_item_id, c.secondary_branch_item_id,
      c.isolation_branch_item_id
    )
  ) OR EXISTS (
    SELECT 1 FROM public.vat_settings
    WHERE id IN (c.primary_vat_id, c.isolation_vat_id)
  ) OR EXISTS (
    SELECT 1 FROM public.discounts WHERE id = c.primary_discount_id
  ) OR EXISTS (
    SELECT 1 FROM public.inventory_stock
    WHERE id IN (
      c.primary_inventory_id, c.secondary_inventory_id,
      c.isolation_inventory_id
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'PACKAGE7_FIXTURE_UUID_COLLIDES_WITH_EXISTING_DATA';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.branches
    WHERE code LIKE c.fixture_namespace || '%'
       OR name LIKE c.fixture_namespace || '%'
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_items
    WHERE code LIKE c.fixture_namespace || '%'
       OR name LIKE c.fixture_namespace || '%'
  ) OR EXISTS (
    SELECT 1 FROM public.customers
    WHERE name LIKE c.fixture_namespace || '%'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'PACKAGE7_STALE_FIXTURE_NAMESPACE_PRESENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = c.operator_profile_id
      AND tenant_id = c.primary_tenant_id
      AND role IN ('owner','admin')
      AND is_active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = c.observer_profile_id
      AND tenant_id = c.primary_tenant_id
      AND is_active
  ) OR c.operator_profile_id = c.observer_profile_id
  OR NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = c.primary_branch_id
      AND tenant_id = c.primary_tenant_id
      AND is_active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = c.primary_actor_profile_id
      AND tenant_id = c.primary_tenant_id AND is_active
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = c.isolation_actor_profile_id
      AND tenant_id = c.isolation_tenant_id AND is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_APPROVED_PROFILE_IDENTITY_MISSING_OR_INACTIVE';
  END IF;

  FOR managed_count, identity_role, expected_role IN
    SELECT pg_catalog.count(*)::integer,
           pg_catalog.min(database_role_name)::name,
           pg_catalog.min(expected_membership_role)::name
    FROM public.core_v2_managed_identities
    WHERE identity_id = c.managed_runtime_identity_id
      AND environment = c.approved_environment
      AND identity_kind = 'runtime'
      AND active
    UNION ALL
    SELECT pg_catalog.count(*)::integer,
           pg_catalog.min(database_role_name)::name,
           pg_catalog.min(expected_membership_role)::name
    FROM public.core_v2_managed_identities
    WHERE identity_id = c.managed_outbox_identity_id
      AND environment = c.approved_environment
      AND identity_kind = 'outbox_worker'
      AND active
  LOOP
    IF managed_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'PACKAGE7_MANAGED_IDENTITY_COUNT_INVALID';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname = identity_role
        AND rolcanlogin
        AND NOT rolsuper
        AND NOT rolcreatedb
        AND NOT rolcreaterole
        AND NOT rolinherit
        AND NOT rolreplication
        AND NOT rolbypassrls
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'PACKAGE7_MANAGED_LOGIN_ATTRIBUTES_INVALID';
    END IF;

    SELECT pg_catalog.count(*) INTO membership_count
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member_role
      ON member_role.oid = membership.member
    WHERE member_role.rolname = identity_role;

    IF membership_count <> 1 OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS member_role
        ON member_role.oid = membership.member
      JOIN pg_catalog.pg_roles AS granted_role
        ON granted_role.oid = membership.roleid
      WHERE member_role.rolname = identity_role
        AND granted_role.rolname = expected_role
        AND NOT membership.admin_option
        AND NOT membership.inherit_option
        AND membership.set_option
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'PACKAGE7_MANAGED_LOGIN_MEMBERSHIP_INVALID',
        DETAIL = 'Managed access must use explicit SET ROLE only.';
    END IF;
  END LOOP;
END;
$package7_preflight$;

-- ============================================================================
-- D. BEFORE-IMAGE CAPTURE
-- ============================================================================
-- Fixture business rows use collision-free UUIDs and therefore have
-- row_existed=false. Mutable singleton/scope rows capture exact JSON before
-- images. Pre-disposal verification must consume these rows in this session.

INSERT INTO pg_temp.package7_before_images (
  retention_identifier, package7_run_identifier, object_name,
  primary_key, row_existed, before_row
)
SELECT c.before_image_retention_identifier, c.package7_run_identifier,
       object_name, primary_key, row_existed, before_row
FROM pg_temp.package7_fixture_context AS c
CROSS JOIN LATERAL (
  VALUES
    ('public.branches', pg_catalog.jsonb_build_object('id', c.primary_branch_id), false, NULL::jsonb),
    ('public.branches', pg_catalog.jsonb_build_object('id', c.secondary_branch_id), false, NULL::jsonb),
    ('public.branches', pg_catalog.jsonb_build_object('id', c.isolation_branch_id), false, NULL::jsonb),
    ('public.customers', pg_catalog.jsonb_build_object('id', c.primary_customer_id), false, NULL::jsonb),
    ('public.customers', pg_catalog.jsonb_build_object('id', c.isolation_customer_id), false, NULL::jsonb),
    ('public.catalog_categories', pg_catalog.jsonb_build_object('id', c.category_id), false, NULL::jsonb),
    ('public.catalog_items', pg_catalog.jsonb_build_object('id', c.tracked_item_id), false, NULL::jsonb),
    ('public.catalog_items', pg_catalog.jsonb_build_object('id', c.service_item_id), false, NULL::jsonb),
    ('public.catalog_items', pg_catalog.jsonb_build_object('id', c.isolation_item_id), false, NULL::jsonb),
    ('public.branch_catalog_items', pg_catalog.jsonb_build_object('id', c.primary_branch_item_id), false, NULL::jsonb),
    ('public.branch_catalog_items', pg_catalog.jsonb_build_object('id', c.secondary_branch_item_id), false, NULL::jsonb),
    ('public.branch_catalog_items', pg_catalog.jsonb_build_object('id', c.isolation_branch_item_id), false, NULL::jsonb),
    ('public.vat_settings', pg_catalog.jsonb_build_object('id', c.primary_vat_id), false, NULL::jsonb),
    ('public.vat_settings', pg_catalog.jsonb_build_object('id', c.isolation_vat_id), false, NULL::jsonb),
    ('public.discounts', pg_catalog.jsonb_build_object('id', c.primary_discount_id), false, NULL::jsonb),
    ('public.inventory_stock', pg_catalog.jsonb_build_object('id', c.primary_inventory_id), false, NULL::jsonb),
    ('public.inventory_stock', pg_catalog.jsonb_build_object('id', c.secondary_inventory_id), false, NULL::jsonb),
    ('public.inventory_stock', pg_catalog.jsonb_build_object('id', c.isolation_inventory_id), false, NULL::jsonb)
) AS fixture_rows(object_name, primary_key, row_existed, before_row);

INSERT INTO pg_temp.package7_before_images (
  retention_identifier, package7_run_identifier, object_name,
  primary_key, row_existed, before_row
)
SELECT c.before_image_retention_identifier, c.package7_run_identifier,
       'public.tenants', pg_catalog.jsonb_build_object('id', tenant_row.id),
       true, pg_catalog.to_jsonb(tenant_row)
FROM pg_temp.package7_fixture_context AS c
JOIN public.tenants AS tenant_row
  ON tenant_row.id IN (c.primary_tenant_id, c.isolation_tenant_id);

INSERT INTO pg_temp.package7_before_images (
  retention_identifier, package7_run_identifier, object_name,
  primary_key, row_existed, before_row
)
SELECT c.before_image_retention_identifier, c.package7_run_identifier,
       'public.core_v2_activation_control',
       '{"singleton_id":true}'::jsonb, true, pg_catalog.to_jsonb(control_row)
FROM pg_temp.package7_fixture_context AS c
CROSS JOIN public.core_v2_activation_control AS control_row;

INSERT INTO pg_temp.package7_before_images (
  retention_identifier, package7_run_identifier, object_name,
  primary_key, row_existed, before_row
)
SELECT c.before_image_retention_identifier, c.package7_run_identifier,
       'public.core_v2_tenant_activation',
       pg_catalog.jsonb_build_object('tenant_id', scope.tenant_id),
       tenant_row.tenant_id IS NOT NULL, pg_catalog.to_jsonb(tenant_row)
FROM pg_temp.package7_fixture_context AS c
CROSS JOIN LATERAL (
  VALUES (c.primary_tenant_id), (c.isolation_tenant_id)
) AS scope(tenant_id)
LEFT JOIN public.core_v2_tenant_activation AS tenant_row
  ON tenant_row.tenant_id = scope.tenant_id;

INSERT INTO pg_temp.package7_before_images (
  retention_identifier, package7_run_identifier, object_name,
  primary_key, row_existed, before_row
)
SELECT c.before_image_retention_identifier, c.package7_run_identifier,
       'public.core_v2_branch_activation',
       pg_catalog.jsonb_build_object(
         'tenant_id', scope.tenant_id, 'branch_id', scope.branch_id
       ),
       branch_row.branch_id IS NOT NULL, pg_catalog.to_jsonb(branch_row)
FROM pg_temp.package7_fixture_context AS c
CROSS JOIN LATERAL (
  VALUES
    (c.primary_tenant_id, c.primary_branch_id),
    (c.primary_tenant_id, c.secondary_branch_id),
    (c.isolation_tenant_id, c.isolation_branch_id)
) AS scope(tenant_id, branch_id)
LEFT JOIN public.core_v2_branch_activation AS branch_row
  ON branch_row.tenant_id = scope.tenant_id
 AND branch_row.branch_id = scope.branch_id;

INSERT INTO pg_temp.package7_before_images (
  retention_identifier, package7_run_identifier, object_name,
  primary_key, row_existed, before_row
)
SELECT c.before_image_retention_identifier, c.package7_run_identifier,
       'public.order_number_sequences',
       pg_catalog.jsonb_build_object(
         'tenant_id', scope.tenant_id,
         'branch_id', scope.branch_id,
         'sequence_month', c.sequence_month
       ),
       sequence_row.tenant_id IS NOT NULL, pg_catalog.to_jsonb(sequence_row)
FROM pg_temp.package7_fixture_context AS c
CROSS JOIN LATERAL (
  VALUES
    (c.primary_tenant_id, c.primary_branch_id),
    (c.primary_tenant_id, c.secondary_branch_id),
    (c.isolation_tenant_id, c.isolation_branch_id)
) AS scope(tenant_id, branch_id)
LEFT JOIN public.order_number_sequences AS sequence_row
  ON sequence_row.tenant_id = scope.tenant_id
 AND sequence_row.branch_id = scope.branch_id
 AND sequence_row.sequence_month = c.sequence_month;

-- ============================================================================
-- E. MINIMAL DETERMINISTIC BUSINESS FIXTURES
-- ============================================================================
-- Financial expectations for one tracked item, quantity 2:
--   branch unit price = 100.00
--   subtotal         = 200.00
--   fixed discount   = 10.00
--   taxable base     = 190.00
--   VAT 15%          = 28.50
--   total            = 218.50
-- Service item (50.00) is available for mixed-cart and non-inventory tests.

INSERT INTO public.branches (
  id, code, name, is_active, tenant_id, order_number_prefix
)
SELECT primary_branch_id, fixture_namespace || '-PB',
       fixture_namespace || '-PRIMARY-BRANCH', true,
       primary_tenant_id, 'P7A'
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT secondary_branch_id, fixture_namespace || '-SB',
       fixture_namespace || '-SECONDARY-BRANCH', true,
       primary_tenant_id, 'P7B'
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_branch_id, fixture_namespace || '-IB',
       fixture_namespace || '-ISOLATION-BRANCH', true,
       isolation_tenant_id, 'P7I'
FROM pg_temp.package7_fixture_context;

INSERT INTO public.catalog_categories (
  id, name, is_active, sort_order, tenant_id
)
SELECT category_id, fixture_namespace || '-CATEGORY', true, 700,
       primary_tenant_id
FROM pg_temp.package7_fixture_context;

INSERT INTO public.catalog_items (
  id, code, name, category, item_type, default_price, cost_price,
  is_active, tenant_id, track_inventory, inventory_enabled_at,
  is_composite
)
SELECT tracked_item_id, fixture_namespace || '-TRACKED',
       fixture_namespace || '-TRACKED-ITEM',
       fixture_namespace || '-CATEGORY', 'product', 100.00::numeric,
       40.00::numeric, true, primary_tenant_id, true,
       pg_catalog.clock_timestamp(), false
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT service_item_id, fixture_namespace || '-SERVICE',
       fixture_namespace || '-SERVICE-ITEM',
       fixture_namespace || '-CATEGORY', 'service', 50.00::numeric,
       0.00::numeric, true, primary_tenant_id, false, NULL, false
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_item_id, fixture_namespace || '-ISOLATION-TRACKED',
       fixture_namespace || '-ISOLATION-TRACKED-ITEM',
       fixture_namespace || '-CATEGORY', 'product', 999.00::numeric,
       400.00::numeric, true, isolation_tenant_id, true,
       pg_catalog.clock_timestamp(), false
FROM pg_temp.package7_fixture_context;

INSERT INTO public.branch_catalog_items (
  id, branch_id, catalog_item_id, price, is_active, display_order, tenant_id
)
SELECT primary_branch_item_id, primary_branch_id, tracked_item_id,
       100.00::numeric, true, 1, primary_tenant_id
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT secondary_branch_item_id, secondary_branch_id, tracked_item_id,
       110.00::numeric, true, 1, primary_tenant_id
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_branch_item_id, isolation_branch_id, isolation_item_id,
       999.00::numeric, false, 1, isolation_tenant_id
FROM pg_temp.package7_fixture_context;

INSERT INTO public.customers (
  id, name, phone, notes, created_by, branch_id, tenant_id, email
)
SELECT primary_customer_id, fixture_namespace || '-PRIMARY-CUSTOMER',
       '966500007001', package7_run_identifier,
       primary_actor_profile_id, primary_branch_id, primary_tenant_id,
       fixture_namespace || '-customer@example.invalid'
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_customer_id, fixture_namespace || '-ISOLATION-CUSTOMER',
       '966500007002', package7_run_identifier,
       isolation_actor_profile_id, isolation_branch_id, isolation_tenant_id,
       fixture_namespace || '-isolation@example.invalid'
FROM pg_temp.package7_fixture_context;

INSERT INTO public.vat_settings (
  id, name, rate, is_active, branch_id, tenant_id
)
SELECT primary_vat_id, fixture_namespace || '-VAT-15',
       15.00::numeric, true, primary_branch_id, primary_tenant_id
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_vat_id, fixture_namespace || '-VAT-15-ISOLATION',
       15.00::numeric, true, isolation_branch_id, isolation_tenant_id
FROM pg_temp.package7_fixture_context;

INSERT INTO public.discounts (
  id, name, type, value, is_active, branch_id, tenant_id
)
SELECT primary_discount_id, fixture_namespace || '-FIXED-10',
       'fixed', 10.00::numeric, true, primary_branch_id, primary_tenant_id
FROM pg_temp.package7_fixture_context;

-- Inventory baselines:
-- primary=10 permits one quantity-2 order and replay without rededuction;
-- secondary=1 supports insufficient-stock testing;
-- isolation=7 supports cross-tenant denial proof.
INSERT INTO public.inventory_stock (
  id, tenant_id, branch_id, catalog_item_id,
  quantity_on_hand, low_stock_threshold
)
SELECT primary_inventory_id, primary_tenant_id, primary_branch_id,
       tracked_item_id, 10.00::numeric, 2.00::numeric
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT secondary_inventory_id, primary_tenant_id, secondary_branch_id,
       tracked_item_id, 1.00::numeric, 2.00::numeric
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_inventory_id, isolation_tenant_id, isolation_branch_id,
       isolation_item_id, 7.00::numeric, 2.00::numeric
FROM pg_temp.package7_fixture_context;

-- Numbering baseline last_sequence=700 yields deterministic next number 701
-- under the Package 4 allocator for each isolated branch/month.
INSERT INTO public.order_number_sequences (
  tenant_id, branch_id, sequence_month, last_sequence
)
SELECT primary_tenant_id, primary_branch_id, sequence_month, 700
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT primary_tenant_id, secondary_branch_id, sequence_month, 700
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_tenant_id, isolation_branch_id, sequence_month, 700
FROM pg_temp.package7_fixture_context;

-- Disabled activation scope is prepared only after its tenant/branch FKs exist.
INSERT INTO public.core_v2_tenant_activation (
  tenant_id, enabled, canary_eligible, pos_enabled, admin_orders_enabled,
  quote_enabled, activation_version, change_ticket, approved_by,
  approved_at, disabled_at, disabled_reason
)
SELECT primary_tenant_id, false, false, false, false, false,
       'package7-fixture-disabled', approved_change_ticket,
       primary_actor_profile_id, pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp(), 'Package 7 fixture starts disabled'
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_tenant_id, false, false, false, false, false,
       'package7-fixture-disabled', approved_change_ticket,
       isolation_actor_profile_id, pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp(), 'Package 7 fixture starts disabled'
FROM pg_temp.package7_fixture_context;

INSERT INTO public.core_v2_branch_activation (
  tenant_id, branch_id, enabled, canary_eligible, pos_enabled,
  admin_orders_enabled, quote_enabled, activation_version, change_ticket,
  approved_by, approved_at, disabled_at, disabled_reason
)
SELECT primary_tenant_id, primary_branch_id, false, false, false, false, false,
       'package7-fixture-disabled', approved_change_ticket,
       primary_actor_profile_id, pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp(), 'Package 7 fixture starts disabled'
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT primary_tenant_id, secondary_branch_id, false, false, false, false, false,
       'package7-fixture-disabled', approved_change_ticket,
       primary_actor_profile_id, pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp(), 'Package 7 fixture starts disabled'
FROM pg_temp.package7_fixture_context
UNION ALL
SELECT isolation_tenant_id, isolation_branch_id, false, false, false, false, false,
       'package7-fixture-disabled', approved_change_ticket,
       isolation_actor_profile_id, pg_catalog.clock_timestamp(),
       pg_catalog.clock_timestamp(), 'Package 7 fixture starts disabled'
FROM pg_temp.package7_fixture_context;

-- Global issuer-rate-limit configuration is intentionally read-only here.
-- Rate-limit behavior tests must use the existing approved Clone/Staging
-- configuration. If that configuration is unsuitable, those tests must report
-- REVIEW_REQUIRED or NOT_RUN; fixture setup must never rewrite it.

-- Record exact fixture ownership and contamination evidence without names.
INSERT INTO pg_temp.package7_created_rows (
  package7_run_identifier, object_name, primary_key
)
SELECT c.package7_run_identifier, rows.object_name, rows.primary_key
FROM pg_temp.package7_fixture_context AS c
CROSS JOIN LATERAL (
  VALUES
    ('public.branches', pg_catalog.jsonb_build_object('id', c.primary_branch_id)),
    ('public.branches', pg_catalog.jsonb_build_object('id', c.secondary_branch_id)),
    ('public.branches', pg_catalog.jsonb_build_object('id', c.isolation_branch_id)),
    ('public.customers', pg_catalog.jsonb_build_object('id', c.primary_customer_id)),
    ('public.customers', pg_catalog.jsonb_build_object('id', c.isolation_customer_id)),
    ('public.catalog_categories', pg_catalog.jsonb_build_object('id', c.category_id)),
    ('public.catalog_items', pg_catalog.jsonb_build_object('id', c.tracked_item_id)),
    ('public.catalog_items', pg_catalog.jsonb_build_object('id', c.service_item_id)),
    ('public.catalog_items', pg_catalog.jsonb_build_object('id', c.isolation_item_id)),
    ('public.branch_catalog_items', pg_catalog.jsonb_build_object('id', c.primary_branch_item_id)),
    ('public.branch_catalog_items', pg_catalog.jsonb_build_object('id', c.secondary_branch_item_id)),
    ('public.branch_catalog_items', pg_catalog.jsonb_build_object('id', c.isolation_branch_item_id)),
    ('public.vat_settings', pg_catalog.jsonb_build_object('id', c.primary_vat_id)),
    ('public.vat_settings', pg_catalog.jsonb_build_object('id', c.isolation_vat_id)),
    ('public.discounts', pg_catalog.jsonb_build_object('id', c.primary_discount_id)),
    ('public.inventory_stock', pg_catalog.jsonb_build_object('id', c.primary_inventory_id)),
    ('public.inventory_stock', pg_catalog.jsonb_build_object('id', c.secondary_inventory_id)),
    ('public.inventory_stock', pg_catalog.jsonb_build_object('id', c.isolation_inventory_id)),
    ('public.core_v2_tenant_activation', pg_catalog.jsonb_build_object('tenant_id', c.primary_tenant_id)),
    ('public.core_v2_tenant_activation', pg_catalog.jsonb_build_object('tenant_id', c.isolation_tenant_id)),
    ('public.core_v2_branch_activation', pg_catalog.jsonb_build_object('tenant_id', c.primary_tenant_id, 'branch_id', c.primary_branch_id)),
    ('public.core_v2_branch_activation', pg_catalog.jsonb_build_object('tenant_id', c.primary_tenant_id, 'branch_id', c.secondary_branch_id)),
    ('public.core_v2_branch_activation', pg_catalog.jsonb_build_object('tenant_id', c.isolation_tenant_id, 'branch_id', c.isolation_branch_id)),
    ('public.order_number_sequences', pg_catalog.jsonb_build_object('tenant_id', c.primary_tenant_id, 'branch_id', c.primary_branch_id, 'sequence_month', c.sequence_month)),
    ('public.order_number_sequences', pg_catalog.jsonb_build_object('tenant_id', c.primary_tenant_id, 'branch_id', c.secondary_branch_id, 'sequence_month', c.sequence_month)),
    ('public.order_number_sequences', pg_catalog.jsonb_build_object('tenant_id', c.isolation_tenant_id, 'branch_id', c.isolation_branch_id, 'sequence_month', c.sequence_month))
) AS rows(object_name, primary_key);

-- ============================================================================
-- F. POST-MUTATION ASSERTIONS
-- ============================================================================

DO $package7_assertions$
DECLARE
  c pg_temp.package7_fixture_context%ROWTYPE;
BEGIN
  SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;

  IF (SELECT pg_catalog.count(*) FROM public.tenants
      WHERE id IN (c.primary_tenant_id, c.isolation_tenant_id)) <> 2
     OR (SELECT pg_catalog.count(*) FROM public.branches
         WHERE id IN (
           c.primary_branch_id, c.secondary_branch_id, c.isolation_branch_id
         )) <> 3
     OR NOT EXISTS (
       SELECT 1 FROM public.branches
       WHERE id = c.primary_branch_id AND tenant_id = c.primary_tenant_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.branches
       WHERE id = c.secondary_branch_id AND tenant_id = c.primary_tenant_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.branches
       WHERE id = c.isolation_branch_id AND tenant_id = c.isolation_tenant_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_TENANT_BRANCH_FIXTURE_ASSERTION_FAILED';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM public.customers
      WHERE id IN (c.primary_customer_id, c.isolation_customer_id)) <> 2
     OR (SELECT pg_catalog.count(*) FROM public.catalog_items
         WHERE id IN (
           c.tracked_item_id, c.service_item_id, c.isolation_item_id
         )) <> 3
     OR (SELECT pg_catalog.count(*) FROM public.branch_catalog_items
         WHERE id IN (
           c.primary_branch_item_id, c.secondary_branch_item_id,
           c.isolation_branch_item_id
         )) <> 3
     OR (SELECT pg_catalog.count(*) FROM public.inventory_stock
         WHERE id IN (
           c.primary_inventory_id, c.secondary_inventory_id,
           c.isolation_inventory_id
         )) <> 3 THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_BUSINESS_FIXTURE_ASSERTION_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_stock
    WHERE id = c.primary_inventory_id
      AND tenant_id = c.primary_tenant_id
      AND branch_id = c.primary_branch_id
      AND catalog_item_id = c.tracked_item_id
      AND quantity_on_hand = 10.00::numeric
  ) OR NOT EXISTS (
    SELECT 1 FROM public.order_number_sequences
    WHERE tenant_id = c.primary_tenant_id
      AND branch_id = c.primary_branch_id
      AND sequence_month = c.sequence_month
      AND last_sequence = 700
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_INVENTORY_OR_NUMBERING_BASELINE_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.core_v2_activation_control
    WHERE singleton_id
      AND NOT global_enabled
      AND kill_switch
      AND NOT pos_enabled
      AND NOT admin_orders_enabled
      AND NOT quote_issuer_enabled
      AND NOT outbox_worker_enabled
      AND deterministic_canary_percentage = 0
  ) OR EXISTS (
    SELECT 1 FROM public.core_v2_tenant_activation
    WHERE tenant_id IN (c.primary_tenant_id, c.isolation_tenant_id)
      AND (enabled OR canary_eligible OR pos_enabled
           OR admin_orders_enabled OR quote_enabled)
  ) OR EXISTS (
    SELECT 1 FROM public.core_v2_branch_activation
    WHERE branch_id IN (
      c.primary_branch_id, c.secondary_branch_id, c.isolation_branch_id
    )
      AND (enabled OR canary_eligible OR pos_enabled
           OR admin_orders_enabled OR quote_enabled)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_ACTIVATION_SAFETY_ASSERTION_FAILED';
  END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_temp.package7_before_images) <> 29
     OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_created_rows) <> 26
     OR EXISTS (
       SELECT 1 FROM pg_temp.package7_before_images
       WHERE object_name = 'public.core_v2_issuer_rate_limit_config'
     )
     OR EXISTS (
       SELECT 1 FROM pg_temp.package7_created_rows
       WHERE object_name = 'public.core_v2_issuer_rate_limit_config'
     )
     OR EXISTS (
       SELECT 1 FROM pg_temp.package7_before_images
       WHERE retention_identifier <> c.before_image_retention_identifier
          OR package7_run_identifier <> c.package7_run_identifier
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PACKAGE7_RUNTIME_OWNERSHIP_MANIFEST_ASSERTION_FAILED';
  END IF;
END;
$package7_assertions$;

-- Bounded, non-sensitive manifest. This is operational output, not immutable
-- verification evidence and does not call an evidence-recording function.
SELECT
  c.approved_environment AS environment,
  c.disposable_clone_identifier,
  c.database_project_reference,
  c.host_identity,
  c.baseline_identifier,
  c.baseline_schema_sha256,
  c.test_executor_login_role,
  c.package7_run_identifier AS run_identifier,
  c.fixture_namespace,
  c.primary_tenant_id,
  c.isolation_tenant_id,
  ARRAY[
    c.primary_branch_id, c.secondary_branch_id, c.isolation_branch_id
  ] AS branch_ids,
  2::integer AS fixture_customer_count,
  3::integer AS fixture_catalog_item_count,
  3::integer AS fixture_inventory_row_count,
  3::integer AS fixture_numbering_row_count,
  (
    SELECT pg_catalog.jsonb_object_agg(grouped.object_name, grouped.row_count)
    FROM (
      SELECT object_name, pg_catalog.count(*) AS row_count
      FROM pg_temp.package7_before_images
      GROUP BY object_name
      ORDER BY object_name
    ) AS grouped
  ) AS before_image_count_by_object,
  false AS global_activation_enabled,
  true AS kill_switch_enabled,
  c.managed_runtime_identity_id AS managed_runtime_identity_reference,
  c.managed_outbox_identity_id AS managed_outbox_identity_reference,
  'PASS'::text AS readiness_result
FROM pg_temp.package7_fixture_context AS c;

COMMIT;

/*
 * OPERATOR STOP AFTER COMMIT
 * - Keep this exact database session open.
 * - Retain the parameter/context/before-image/created-row pg_temp tables.
 * - Do not run any provider delivery.
 * - Do not record a suite PASS from this setup artifact.
 * - If any later suite fails, preserve evidence and dispose of the dedicated
 *   Clone externally; never attempt row-level cleanup.
 */
