/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 3B. Installer: CURRENT_USER = SESSION_USER = postgres. Function DDL
executes only while SET LOCAL ROLE afex_function_owner is active.
This wave creates private validators only and grants no runtime EXECUTE.
Server-side requireVerifiedAuthContext verifies the JWT before the trusted server
calls PostgreSQL. The bounded Auth-session helper from whole file 04A complements
that verification; it is not JWT signature verification.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $afex$
BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres' THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_INSTALLER_PRINCIPAL_MISMATCH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid
    JOIN pg_catalog.pg_roles member_role ON member_role.oid=m.member
    WHERE member_role.rolname='postgres' AND granted.rolname='afex_function_owner'
      AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
  ) THEN
    RAISE EXCEPTION 'AFEX_FUNCTION_OWNER_BASELINE_MEMBERSHIP_MISMATCH';
  END IF;
  IF pg_catalog.to_regclass('auth.sessions') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('afex_pos_authority.actor_sessions') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_command_bindings') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_account_bootstrap_authorities') IS NULL
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_3B_DEPENDENCY_MISSING';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policies
    WHERE (schemaname, policyname) IN (
      ('afex_pos_authority','actor_sessions_offline_function_owner_select'),
      ('public','profiles_offline_function_owner_select')
    )
  ) <> 2 THEN
    RAISE EXCEPTION 'AFEX_WAVE_3B_SUPPORT_POLICY_MISSING';
  END IF;
END
$afex$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_WAVE_3B_TEMPORARY_SET_ENABLE_FAILED';
  END IF;
END $afex$;
SET LOCAL ROLE afex_function_owner;

DO $afex$
BEGIN
  IF CURRENT_USER <> 'afex_function_owner' OR SESSION_USER <> 'postgres' THEN
    RAISE EXCEPTION 'AFEX_FUNCTION_OWNER_ROLE_SWITCH_FAILED';
  END IF;
END
$afex$;

-- FWD-08B-001
CREATE FUNCTION afex_offline_authority.try_uuid_v1(p_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN p_value::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END
$fn$;

-- FWD-08B-002
CREATE FUNCTION afex_offline_authority.try_bigint_v1(p_value text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN p_value::bigint;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END
$fn$;

-- FWD-08B-003
CREATE FUNCTION afex_offline_authority.try_integer_v1(p_value text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN p_value::integer;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END
$fn$;

-- FWD-08B-004
CREATE FUNCTION afex_offline_authority.try_numeric_v1(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
BEGIN
  RETURN p_value::numeric;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END
$fn$;

-- FWD-08B-005
CREATE FUNCTION afex_offline_authority.jsonb_has_exact_keys_v1(
  p_value jsonb,
  p_expected text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
  SELECT pg_catalog.jsonb_typeof(p_value) = 'object'
    AND COALESCE((
      SELECT pg_catalog.array_agg(k ORDER BY k)
      FROM pg_catalog.jsonb_object_keys(p_value) AS k
    ), ARRAY[]::text[]) = (
      SELECT pg_catalog.array_agg(k ORDER BY k)
      FROM pg_catalog.unnest(p_expected) AS k
    )
$fn$;

-- FWD-08B-006
CREATE FUNCTION afex_offline_authority.canonical_jsonb_v2(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
DECLARE kind text := pg_catalog.jsonb_typeof(p_value); result text;
BEGIN
  IF kind = 'object' THEN
    SELECT '{' || COALESCE(pg_catalog.string_agg(
      pg_catalog.to_jsonb(normalize(e.key))::text || ':' ||
      afex_offline_authority.canonical_jsonb_v2(e.value),
      ',' ORDER BY pg_catalog.convert_to(e.key, 'UTF8')
    ), '') || '}' INTO result
    FROM pg_catalog.jsonb_each(p_value) AS e(key,value);
    RETURN result;
  ELSIF kind = 'array' THEN
    SELECT '[' || COALESCE(pg_catalog.string_agg(
      afex_offline_authority.canonical_jsonb_v2(a.value),
      ',' ORDER BY a.ordinality
    ), '') || ']' INTO result
    FROM pg_catalog.jsonb_array_elements(p_value)
      WITH ORDINALITY AS a(value,ordinality);
    RETURN result;
  ELSIF kind = 'string' THEN
    RETURN pg_catalog.to_jsonb(normalize(p_value #>> '{}'))::text;
  ELSIF kind IN ('number','boolean','null') THEN
    RETURN p_value::text;
  END IF;
  RAISE EXCEPTION 'AFEX_OFFLINE_CANONICAL_JSON_TYPE_INVALID';
END
$fn$;

-- FWD-08B-010
CREATE FUNCTION afex_offline_authority.validate_offline_provenance_v2(
  p_sync_authenticated_subject_id uuid,
  p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,
  p_origin_authority_reference jsonb,
  p_required_command_type text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  actor_row afex_pos_authority.actor_sessions%ROWTYPE;
  device_row afex_offline_authority.offline_devices%ROWTYPE;
  employee_row afex_offline_authority.offline_employee_authorities%ROWTYPE;
  key_row afex_offline_authority.offline_key_envelopes%ROWTYPE;
  bootstrap_row record;
  origin_tenant uuid;
  origin_branch uuid;
  origin_device uuid;
  origin_employee uuid;
  origin_enrollment uuid;
  origin_key uuid;
  origin_subject uuid;
  origin_bootstrap uuid;
  origin_bootstrap_generation bigint;
  origin_namespace_generation bigint;
  origin_device_generation bigint;
  origin_enrollment_generation bigint;
  origin_command_generation bigint;
  origin_key_version bigint;
BEGIN
  IF p_required_command_type <> 'order.create'
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(
       p_origin_authority_reference, ARRAY[
         'actualPosEmployeeId','bootstrapGeneration','bootstrapId','branchId',
         'commandGeneration','deviceGeneration',
         'deviceId','employeeEnrollmentGeneration','enrollmentId','keyEnvelopeId',
         'keyEnvelopeVersion','namespaceGeneration','originAuthorityVersion',
         'primaryAuthenticatedSubjectId','tenantId'
       ]::text[]
     )
     OR p_origin_authority_reference->>'originAuthorityVersion'
        <> 'afex-offline-origin-authority.v2' THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_ORIGIN_SCHEMA_MISMATCH';
  END IF;
  origin_tenant := afex_offline_authority.try_uuid_v1(
    p_origin_authority_reference->>'tenantId');
  origin_branch := afex_offline_authority.try_uuid_v1(
    p_origin_authority_reference->>'branchId');
  origin_device := afex_offline_authority.try_uuid_v1(
    p_origin_authority_reference->>'deviceId');
  origin_employee := afex_offline_authority.try_uuid_v1(
    p_origin_authority_reference->>'actualPosEmployeeId');
  origin_enrollment := afex_offline_authority.try_uuid_v1(
    p_origin_authority_reference->>'enrollmentId');
  origin_key := afex_offline_authority.try_uuid_v1(
    p_origin_authority_reference->>'keyEnvelopeId');
  origin_subject := afex_offline_authority.try_uuid_v1(
    p_origin_authority_reference->>'primaryAuthenticatedSubjectId');
  origin_bootstrap := afex_offline_authority.try_uuid_v1(
    p_origin_authority_reference->>'bootstrapId');
  origin_bootstrap_generation := afex_offline_authority.try_bigint_v1(
    p_origin_authority_reference->>'bootstrapGeneration');
  origin_namespace_generation := afex_offline_authority.try_bigint_v1(
    p_origin_authority_reference->>'namespaceGeneration');
  origin_device_generation := afex_offline_authority.try_bigint_v1(
    p_origin_authority_reference->>'deviceGeneration');
  origin_enrollment_generation := afex_offline_authority.try_bigint_v1(
    p_origin_authority_reference->>'employeeEnrollmentGeneration');
  origin_command_generation := afex_offline_authority.try_bigint_v1(
    p_origin_authority_reference->>'commandGeneration');
  origin_key_version := afex_offline_authority.try_bigint_v1(
    p_origin_authority_reference->>'keyEnvelopeVersion');
  IF origin_tenant IS NULL OR origin_branch IS NULL OR origin_device IS NULL
     OR origin_employee IS NULL OR origin_enrollment IS NULL
     OR origin_key IS NULL OR origin_subject IS NULL
     OR origin_bootstrap IS NULL OR origin_bootstrap_generation IS NULL
     OR origin_bootstrap_generation <= 0
     OR origin_namespace_generation IS NULL OR origin_namespace_generation <= 0
     OR origin_device_generation IS NULL OR origin_device_generation <= 0
     OR origin_enrollment_generation IS NULL OR origin_enrollment_generation <= 0
     OR origin_command_generation IS NULL OR origin_command_generation <= 0
     OR origin_key_version IS NULL OR origin_key_version <= 0 THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_ORIGIN_IDENTIFIER_INVALID';
  END IF;

  -- JWT signature verification occurred in requireVerifiedAuthContext before
  -- this call. This check revalidates the immutable Auth session reference.
  IF NOT afex_offline_authority.afex_current_auth_session_matches_v1(
    p_sync_authenticated_subject_id,p_sync_authenticated_session_id
  ) OR origin_subject <> p_sync_authenticated_subject_id OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = p_sync_authenticated_subject_id AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'AFEX_SYNC_AUTH_SESSION_INVALID_OR_EXPIRED';
  END IF;
  SELECT * INTO actor_row FROM afex_pos_authority.actor_sessions AS s
  WHERE s.session_id = p_sync_pos_actor_session_id
    AND s.authenticated_subject_id = p_sync_authenticated_subject_id
    AND s.authenticated_session_id = p_sync_authenticated_session_id;
  IF NOT FOUND OR actor_row.revoked_at IS NOT NULL
     OR actor_row.expires_at <= pg_catalog.statement_timestamp()
     OR actor_row.tenant_id <> origin_tenant
     OR actor_row.branch_id <> origin_branch
     OR actor_row.actor_id <> origin_employee THEN
    RAISE EXCEPTION 'AFEX_SYNC_POS_ACTOR_SESSION_INVALID_OR_SCOPE_MISMATCH';
  END IF;
  SELECT * INTO device_row
  FROM afex_offline_authority.offline_devices AS d
  WHERE d.device_id = origin_device AND d.tenant_id = origin_tenant
    AND d.branch_id = origin_branch
    AND d.device_generation = origin_device_generation;
  IF NOT FOUND OR device_row.status <> 'active' OR device_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_DEVICE_AUTHORITY_INVALID';
  END IF;
  SELECT * INTO employee_row
  FROM afex_offline_authority.offline_employee_authorities AS e
  WHERE e.device_id = origin_device AND e.tenant_id = origin_tenant
    AND e.branch_id = origin_branch
    AND e.device_generation = origin_device_generation
    AND e.actual_pos_employee_id = origin_employee
    AND e.enrollment_id = origin_enrollment
    AND e.employee_enrollment_generation = origin_enrollment_generation
    AND e.command_generation = origin_command_generation;
  IF NOT FOUND OR employee_row.status <> 'active' OR employee_row.revoked_at IS NOT NULL
     OR employee_row.primary_authenticated_subject_id <> p_sync_authenticated_subject_id
     OR employee_row.key_envelope_id <> origin_key
     OR employee_row.key_envelope_version <> origin_key_version
     OR employee_row.allowed_command_types IS DISTINCT FROM ARRAY['order.create']::text[] THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_EMPLOYEE_AUTHORITY_INVALID';
  END IF;
  SELECT * INTO key_row
  FROM afex_offline_authority.offline_key_envelopes AS k
  WHERE k.key_envelope_id = origin_key AND k.key_envelope_version = origin_key_version
    AND k.tenant_id = origin_tenant AND k.branch_id = origin_branch
    AND k.device_id = origin_device AND k.device_generation = origin_device_generation
    AND k.primary_authenticated_subject_id = origin_subject
    AND k.namespace_generation = origin_namespace_generation;
  IF NOT FOUND OR key_row.status <> 'active' OR key_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_KEY_ENVELOPE_AUTHORITY_INVALID';
  END IF;
  -- Installed after this validator and before its first permitted runtime use.
  -- A logged-out bootstrap is unusable. Same-account Online recovery reactivates
  -- the same stable bootstrap_id at a higher generation, preserving old command
  -- attribution without permitting cross-account reassignment.
  SELECT b.bootstrap_id,b.primary_authenticated_subject_id,b.tenant_id,b.branch_id,
         b.device_id,b.bootstrap_generation,b.status
  INTO bootstrap_row
  FROM afex_offline_authority.offline_account_bootstrap_authorities AS b
  WHERE b.bootstrap_id=origin_bootstrap
    AND b.primary_authenticated_subject_id=origin_subject
    AND b.tenant_id=origin_tenant AND b.branch_id=origin_branch
    AND b.device_id=origin_device;
  IF NOT FOUND OR bootstrap_row.status<>'active'
     OR bootstrap_row.bootstrap_generation<origin_bootstrap_generation THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_ACCOUNT_BOOTSTRAP_INACTIVE_OR_SCOPE_MISMATCH';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'syncAuthenticatedSubjectId',p_sync_authenticated_subject_id,
    'syncAuthenticatedSessionId',p_sync_authenticated_session_id,
    'syncPosActorSessionId',p_sync_pos_actor_session_id,
    'syncPosEmployeeId',actor_row.actor_id,
    'originPrimaryAuthenticatedSubjectId',employee_row.primary_authenticated_subject_id,
    'originAuthorityReference',p_origin_authority_reference
  );
END
$fn$;

-- FWD-08B-011
CREATE FUNCTION afex_offline_authority.validate_payment_attestation_v2(
  p_payment jsonb,
  p_order_total text,
  p_local_command_id uuid,
  p_idempotency_key_hash text,
  p_payment_attestation_command_id uuid,
  p_local_aggregate_reference text,
  p_subject_id uuid,
  p_employee_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_device_id uuid,
  p_device_generation bigint,
  p_enrollment_generation bigint,
  p_command_generation bigint
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
  SELECT
    afex_offline_authority.jsonb_has_exact_keys_v1(p_payment, ARRAY[
      'actualPosEmployeeId','amount','attestationCommandId','attestedAtLocal',
      'bankSettlement','branchId','cardAuthorization','commandGeneration','currency',
      'deviceGeneration','deviceId','employeeAttestedExternalStep',
      'employeeEnrollmentGeneration','method','orderAggregateReference',
      'orderCreateIdempotencyKeyHash','orderCreateLocalCommandId',
      'paymentProviderActionRequested','primaryAuthenticatedUserId',
      'providerConfirmation','providerSettlement','providerStatus',
      'refundCompletion','tenantId'
    ]::text[])
    AND p_payment->>'method' = ANY(ARRAY[
      'mada','cash','visa','cod','card','bank_transfer','transfer','on_delivery'
    ]::text[])
    AND p_payment->>'amount' ~ '^(0|[1-9][0-9]*)[.][0-9]{2}$'
    AND p_payment->>'amount' = p_order_total
    AND p_payment->>'currency' = 'SAR'
    AND p_payment->>'providerStatus' = 'unverified'
    AND p_payment->>'providerConfirmation' = 'not_claimed'
    AND p_payment->>'providerSettlement' = 'not_claimed'
    AND p_payment->>'bankSettlement' = 'not_claimed'
    AND p_payment->>'cardAuthorization' = 'not_claimed'
    AND p_payment->>'refundCompletion' = 'not_claimed'
    AND p_payment->'employeeAttestedExternalStep' = 'true'::jsonb
    AND p_payment->'paymentProviderActionRequested' = 'false'::jsonb
    AND afex_offline_authority.try_uuid_v1(p_payment->>'attestationCommandId')
        = p_payment_attestation_command_id
    AND afex_offline_authority.try_uuid_v1(p_payment->>'orderCreateLocalCommandId')
        = p_local_command_id
    AND p_payment->>'orderCreateIdempotencyKeyHash' = p_idempotency_key_hash
    AND p_payment->>'orderAggregateReference' = p_local_aggregate_reference
    AND afex_offline_authority.try_uuid_v1(p_payment->>'primaryAuthenticatedUserId') = p_subject_id
    AND afex_offline_authority.try_uuid_v1(p_payment->>'actualPosEmployeeId') = p_employee_id
    AND afex_offline_authority.try_uuid_v1(p_payment->>'tenantId') = p_tenant_id
    AND afex_offline_authority.try_uuid_v1(p_payment->>'branchId') = p_branch_id
    AND afex_offline_authority.try_uuid_v1(p_payment->>'deviceId') = p_device_id
    AND afex_offline_authority.try_bigint_v1(p_payment->>'deviceGeneration') = p_device_generation
    AND afex_offline_authority.try_bigint_v1(p_payment->>'employeeEnrollmentGeneration') = p_enrollment_generation
    AND afex_offline_authority.try_bigint_v1(p_payment->>'commandGeneration') = p_command_generation
$fn$;

-- FWD-08B-012. Exact set, order, quantity and nonnegative availability proof.
CREATE FUNCTION afex_offline_authority.validate_inventory_frontier_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_offline_payload jsonb,
  p_frontier jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  snapshot_id uuid;
  header_row afex_offline_authority.branch_inventory_snapshot_headers%ROWTYPE;
  expected_count integer;
  valid_count integer;
  result_items jsonb;
BEGIN
  IF NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_frontier, ARRAY[
       'branchId','contractVersion','frontierVersion','items',
       'localCommitmentFrontier','snapshotId','tenantId'
     ]::text[])
     OR p_frontier->>'contractVersion' <> 'branch-inventory-frontier.v1'
     OR afex_offline_authority.try_uuid_v1(p_frontier->>'tenantId') <> p_tenant_id
     OR afex_offline_authority.try_uuid_v1(p_frontier->>'branchId') <> p_branch_id
     OR pg_catalog.jsonb_typeof(p_frontier->'items') <> 'array'
     OR pg_catalog.jsonb_typeof(p_offline_payload->'itemReferences') <> 'array' THEN
    RETURN NULL;
  END IF;
  snapshot_id := afex_offline_authority.try_uuid_v1(p_frontier->>'snapshotId');
  IF snapshot_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO header_row
  FROM afex_offline_authority.branch_inventory_snapshot_headers AS h
  WHERE h.snapshot_id = snapshot_id AND h.tenant_id = p_tenant_id
    AND h.branch_id = p_branch_id
    AND h.frontier_version = p_frontier->>'frontierVersion';
  IF NOT FOUND THEN RETURN NULL; END IF;
  expected_count := pg_catalog.jsonb_array_length(p_offline_payload->'itemReferences');
  IF expected_count < 1 OR expected_count > 200
     OR pg_catalog.jsonb_array_length(p_frontier->'items') <> expected_count THEN
    RETURN NULL;
  END IF;
  WITH payload_items AS (
    SELECT value AS item, ordinality
    FROM pg_catalog.jsonb_array_elements(p_offline_payload->'itemReferences')
      WITH ORDINALITY
  ), frontier_items AS (
    SELECT value AS item, ordinality
    FROM pg_catalog.jsonb_array_elements(p_frontier->'items') WITH ORDINALITY
  ), validated AS (
    SELECT p.ordinality,p.item AS payload_item,f.item AS frontier_item,
      afex_offline_authority.try_uuid_v1(p.item->>'catalogItemReference') AS item_id,
      afex_offline_authority.try_integer_v1(p.item->>'quantity') AS payload_quantity,
      afex_offline_authority.try_integer_v1(f.item->>'requestedQuantity') AS requested_quantity,
      afex_offline_authority.try_integer_v1(f.item->>'pendingLocalCommitments') AS pending_quantity,
      afex_offline_authority.try_integer_v1(f.item->>'syncingLocalCommitments') AS syncing_quantity
    FROM payload_items AS p JOIN frontier_items AS f USING (ordinality)
  ), exact_rows AS (
    SELECT v.*,i.confirmed_stock,
      GREATEST(0::numeric,
        i.confirmed_stock-v.pending_quantity-v.syncing_quantity) AS local_available
    FROM validated AS v
    JOIN afex_offline_authority.branch_inventory_snapshot_items AS i
      ON i.snapshot_id = snapshot_id AND i.tenant_id = p_tenant_id
     AND i.branch_id = p_branch_id AND i.catalog_item_id = v.item_id
    WHERE afex_offline_authority.jsonb_has_exact_keys_v1(v.payload_item, ARRAY[
            'catalogItemReference','discountAllocation','grossAmount','lineSubtotal',
            'lineTotal','quantity','taxableAmount','unitPrice','vatAmount','vatBasis','vatRate'
          ]::text[])
      AND afex_offline_authority.jsonb_has_exact_keys_v1(v.frontier_item, ARRAY[
            'catalogItemId','pendingLocalCommitments','requestedQuantity','syncingLocalCommitments'
          ]::text[])
      AND afex_offline_authority.try_uuid_v1(v.frontier_item->>'catalogItemId') = v.item_id
      AND v.payload_quantity = v.requested_quantity AND v.requested_quantity > 0
      AND v.pending_quantity >= 0 AND v.syncing_quantity >= 0
      AND v.requested_quantity <= GREATEST(0::numeric,
            i.confirmed_stock-v.pending_quantity-v.syncing_quantity)
  )
  SELECT pg_catalog.count(*),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'catalogItemId',item_id,'confirmedStock',confirmed_stock,
      'pendingLocalCommitments',pending_quantity,
      'syncingLocalCommitments',syncing_quantity,
      'localAvailable',local_available
    ) ORDER BY item_id::text)
  INTO valid_count,result_items FROM exact_rows;
  IF valid_count <> expected_count
     OR (SELECT pg_catalog.count(DISTINCT item->>'catalogItemReference')
         FROM pg_catalog.jsonb_array_elements(p_offline_payload->'itemReferences') AS item)
        <> expected_count
     OR (SELECT pg_catalog.count(DISTINCT item->>'catalogItemId')
         FROM pg_catalog.jsonb_array_elements(p_frontier->'items') AS item)
        <> expected_count
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_offline_payload->'itemReferences')
         WITH ORDINALITY AS x(item,ordinality)
       WHERE x.ordinality > 1 AND x.item->>'catalogItemReference' <=
         (p_offline_payload->'itemReferences'->(x.ordinality::integer-2))->>'catalogItemReference'
     ) OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_frontier->'items')
         WITH ORDINALITY AS x(item,ordinality)
       WHERE x.ordinality > 1 AND x.item->>'catalogItemId' <=
         (p_frontier->'items'->(x.ordinality::integer-2))->>'catalogItemId'
     ) THEN
    RETURN NULL;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'source','trusted_server','tenantId',p_tenant_id,'branchId',p_branch_id,
    'snapshotId',header_row.snapshot_id,'serverConfirmedAt',header_row.confirmed_at,
    'frontierVersion',header_row.frontier_version,
    'localCommitmentFrontier',p_frontier->>'localCommitmentFrontier',
    'items',result_items
  );
END
$fn$;

-- FWD-08B-013. Full frozen Core payload shape plus byte-equivalent projection.
CREATE FUNCTION afex_offline_authority.assert_offline_core_order_mapping_v2(
  p_offline_payload jsonb,
  p_core_payload jsonb,
  p_core_projection jsonb,
  p_subject_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_idempotency_key text,
  p_payload_hash text,
  p_snapshot_id uuid,
  p_frontier_version text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
DECLARE item_count integer;
BEGIN
  IF NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_offline_payload, ARRAY[
       'aggregateReference','canonicalPayloadVersion','coreFingerprintProjection',
       'coreOrderCanonicalPayload','corePayloadCanonicalHash','currency',
       'customerReference','discountAmount','idempotencyKey','inventoryFrontierVersion',
       'inventorySnapshotId','itemReferences','paymentAttestationCommandId',
       'paymentMethod','subtotalAmount','taxAmount','totalAmount'
     ]::text[])
     OR p_offline_payload->>'canonicalPayloadVersion' <> 'order-command-payload-v1'
     OR p_offline_payload->'coreOrderCanonicalPayload' IS DISTINCT FROM p_core_payload
     OR p_offline_payload->'coreFingerprintProjection' IS DISTINCT FROM p_core_projection
     OR p_offline_payload->>'corePayloadCanonicalHash' <> p_payload_hash
     OR p_offline_payload->>'idempotencyKey' <> p_idempotency_key
     OR afex_offline_authority.try_uuid_v1(p_offline_payload->>'inventorySnapshotId') <> p_snapshot_id
     OR p_offline_payload->>'inventoryFrontierVersion' <> p_frontier_version
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload, ARRAY[
       'authenticated_actor_id','branch_id','command_type','customer','discount',
       'fingerprint_version','fulfillment','items','metadata','order','payment',
       'payload_version','pricing','tenant_id','vat','versions'
     ]::text[])
     OR p_core_payload->>'payload_version' <> 'order-command-payload-v1'
     OR p_core_payload->>'fingerprint_version' <> 'order-request-fingerprint-v1'
     OR p_core_payload->>'command_type' <> 'order.create'
     OR afex_offline_authority.try_uuid_v1(p_core_payload->>'authenticated_actor_id') <> p_subject_id
     OR afex_offline_authority.try_uuid_v1(p_core_payload->>'tenant_id') <> p_tenant_id
     OR afex_offline_authority.try_uuid_v1(p_core_payload->>'branch_id') <> p_branch_id
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload->'customer', ARRAY[
       'address','allowed_update_fields','conflict_behavior','customer_id','display_phone',
       'email','expected_record_version','mode','name','normalized_phone','notes'
     ]::text[])
     OR p_core_payload->'customer'->>'mode' <> 'existing'
     OR p_core_payload->'customer'->'customer_id' IS NULL
     OR p_core_payload->'customer'->'customer_id' = 'null'::jsonb
     OR p_core_payload->'customer'->'normalized_phone' <> 'null'::jsonb
     OR p_core_payload->'customer'->'display_phone' <> 'null'::jsonb
     OR p_core_payload->'customer'->'name' <> 'null'::jsonb
     OR p_core_payload->'customer'->'email' <> 'null'::jsonb
     OR p_core_payload->'customer'->'address' <> 'null'::jsonb
     OR p_core_payload->'customer'->'notes' <> 'null'::jsonb
     OR p_core_payload->'customer'->'allowed_update_fields' <> '[]'::jsonb
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(
       p_offline_payload->'customerReference',ARRAY['id','kind']::text[])
     OR p_offline_payload->'customerReference'->>'kind' <> 'server'
     OR p_offline_payload->'customerReference'->>'id' <>
        p_core_payload->'customer'->>'customer_id'
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload->'pricing', ARRAY[
       'branch_pricing_version','currency','currency_precision','financial_engine_version',
       'lines','price_version','quote_fingerprint','quote_reference','quote_version',
       'rounding_strategy','subtotal','taxable_subtotal','total'
     ]::text[])
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload->'vat', ARRAY[
       'amount','effective_at','mode','rate','rule_version','setting_id','tax_inclusive'
     ]::text[])
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload->'discount', ARRAY[
       'amount','eligibility_version','id','name_snapshot','rule_version','source','type','value'
     ]::text[])
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload->'payment', ARRAY[
       'amount_tendered','cash_change','cash_received','expected_status','method',
       'provider_reference','remaining_from_customer','rule_version'
     ]::text[])
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload->'fulfillment', ARRAY[
       'address','branch_id','instructions','method','requested_at'
     ]::text[])
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(
       p_core_payload->'order',ARRAY['note']::text[])
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload->'metadata', ARRAY[
       'client_version','correlation_id','device_id','offline_draft_id',
       'pos_terminal_id','request_reference','source_channel'
     ]::text[])
     OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_core_payload->'versions', ARRAY[
       'authorization_contract','customer_engine','financial_engine','inventory_engine',
       'numbering_engine','payload_contract'
     ]::text[])
     OR p_core_payload->'pricing'->>'currency' <> 'SAR'
     OR p_offline_payload->>'currency' <> 'SAR'
     OR p_core_payload->'payment'->>'method' <> p_offline_payload->>'paymentMethod'
     OR p_core_payload->'pricing'->>'subtotal' <> p_offline_payload->>'subtotalAmount'
     OR p_core_payload->'discount'->>'amount' <> p_offline_payload->>'discountAmount'
     OR p_core_payload->'vat'->>'amount' <> p_offline_payload->>'taxAmount'
     OR p_core_payload->'pricing'->>'total' <> p_offline_payload->>'totalAmount'
     OR pg_catalog.jsonb_typeof(p_core_payload->'items') <> 'array'
     OR pg_catalog.jsonb_typeof(p_core_payload->'pricing'->'lines') <> 'array'
     OR pg_catalog.jsonb_typeof(p_offline_payload->'itemReferences') <> 'array' THEN
    RETURN false;
  END IF;
  item_count := pg_catalog.jsonb_array_length(p_offline_payload->'itemReferences');
  IF item_count < 1 OR item_count <> pg_catalog.jsonb_array_length(p_core_payload->'items')
     OR item_count <> pg_catalog.jsonb_array_length(p_core_payload->'pricing'->'lines')
     OR (SELECT pg_catalog.count(DISTINCT x->>'catalogItemReference')
         FROM pg_catalog.jsonb_array_elements(p_offline_payload->'itemReferences') AS x)
        <> item_count THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_offline_payload->'itemReferences')
      WITH ORDINALITY AS o(item,position)
    JOIN pg_catalog.jsonb_array_elements(p_core_payload->'items')
      WITH ORDINALITY AS c(item,position) USING (position)
    JOIN pg_catalog.jsonb_array_elements(p_core_payload->'pricing'->'lines')
      WITH ORDINALITY AS p(item,position) USING (position)
    WHERE NOT afex_offline_authority.jsonb_has_exact_keys_v1(o.item, ARRAY[
            'catalogItemReference','discountAllocation','grossAmount','lineSubtotal',
            'lineTotal','quantity','taxableAmount','unitPrice','vatAmount','vatBasis','vatRate'
          ]::text[])
       OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(c.item, ARRAY[
            'catalog_item_id','category_snapshot','fulfillment_class','inventory_tracking_mode',
            'item_type_snapshot','line_id','line_note','line_number','modifiers',
            'name_snapshot','quantity','sku_snapshot','unit_snapshot'
          ]::text[])
       OR NOT afex_offline_authority.jsonb_has_exact_keys_v1(p.item, ARRAY[
            'discount_allocation','gross_amount','line_id','net_amount','pricing_source',
            'source_branch_price_id','source_branch_price_version','source_catalog_id',
            'source_catalog_version','taxable_amount','unit_price','vat_amount'
          ]::text[])
       OR c.item->'modifiers' <> '[]'::jsonb OR c.item->'line_note' <> 'null'::jsonb
       OR c.item->>'catalog_item_id' <> o.item->>'catalogItemReference'
       OR p.item->>'source_catalog_id' <> o.item->>'catalogItemReference'
       OR c.item->>'line_id' <> p.item->>'line_id'
       OR afex_offline_authority.try_integer_v1(c.item->>'line_number') <> o.position
       OR afex_offline_authority.try_numeric_v1(c.item->>'quantity') <>
          afex_offline_authority.try_numeric_v1(o.item->>'quantity')
       OR p.item->>'unit_price' <> o.item->>'unitPrice'
       OR p.item->>'gross_amount' <> o.item->>'grossAmount'
       OR p.item->>'discount_allocation' <> o.item->>'discountAllocation'
       OR p.item->>'taxable_amount' <> o.item->>'taxableAmount'
       OR p.item->>'vat_amount' <> o.item->>'vatAmount'
       OR p.item->>'net_amount' <> o.item->>'lineSubtotal'
       OR o.item->>'vatBasis' <> o.item->>'taxableAmount'
       OR o.item->>'vatRate' <> p_core_payload->'vat'->>'rate'
       OR afex_offline_authority.try_numeric_v1(o.item->>'lineTotal') <>
          afex_offline_authority.try_numeric_v1(o.item->>'taxableAmount') +
          afex_offline_authority.try_numeric_v1(o.item->>'vatAmount')
  ) THEN RETURN false; END IF;
  RETURN true;
END
$fn$;

DO $afex$
DECLARE f pg_catalog.regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'afex_offline_authority.try_uuid_v1(text)'::pg_catalog.regprocedure,
    'afex_offline_authority.try_bigint_v1(text)'::pg_catalog.regprocedure,
    'afex_offline_authority.try_integer_v1(text)'::pg_catalog.regprocedure,
    'afex_offline_authority.try_numeric_v1(text)'::pg_catalog.regprocedure,
    'afex_offline_authority.jsonb_has_exact_keys_v1(jsonb,text[])'::pg_catalog.regprocedure,
    'afex_offline_authority.canonical_jsonb_v2(jsonb)'::pg_catalog.regprocedure,
    'afex_offline_authority.validate_offline_provenance_v2(uuid,uuid,uuid,jsonb,text)'::pg_catalog.regprocedure,
    'afex_offline_authority.validate_payment_attestation_v2(jsonb,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint)'::pg_catalog.regprocedure,
    'afex_offline_authority.validate_inventory_frontier_v2(uuid,uuid,jsonb,jsonb)'::pg_catalog.regprocedure,
    'afex_offline_authority.assert_offline_core_order_mapping_v2(jsonb,jsonb,jsonb,uuid,uuid,uuid,text,text,uuid,text)'::pg_catalog.regprocedure
  ] LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime',f
    );
  END LOOP;
END
$afex$;

RESET ROLE;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$
BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members m
       JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles member_role ON member_role.oid=m.member
       WHERE member_role.rolname='postgres' AND granted.rolname='afex_function_owner'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     )
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.validate_payment_attestation_v2(jsonb,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint)'
     ) IS NULL OR pg_catalog.to_regprocedure(
       'afex_offline_authority.assert_offline_core_order_mapping_v2(jsonb,jsonb,jsonb,uuid,uuid,uuid,text,text,uuid,text)'
     ) IS NULL OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
       WHERE n.nspname = 'afex_offline_authority'
         AND p.proname IN (
           'try_uuid_v1','try_bigint_v1','try_integer_v1','try_numeric_v1',
           'jsonb_has_exact_keys_v1','canonical_jsonb_v2',
           'validate_offline_provenance_v2','validate_payment_attestation_v2',
           'validate_inventory_frontier_v2','assert_offline_core_order_mapping_v2'
         )
         AND r.rolname <> 'afex_function_owner'
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_3B_POST_ATTESTATION_FAILED';
  END IF;
END
$afex$;
COMMIT;
