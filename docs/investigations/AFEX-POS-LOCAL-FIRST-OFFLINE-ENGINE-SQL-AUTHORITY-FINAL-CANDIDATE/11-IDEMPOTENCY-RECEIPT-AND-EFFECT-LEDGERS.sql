/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 4C. Stable receipt lookup is authority-first. The total resolver
revalidates JWT-complementing Auth session identity, POS actor session, tenant,
branch, employee, device, enrollment/key generations and revocation state before
this function performs any receipt/binding lookup.
Function DDL executes under afex_function_owner only.
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
  IF pg_catalog.to_regprocedure(
    'afex_offline_authority.resolve_offline_order_create_authority_batch_v2(uuid,uuid,uuid,jsonb)'
  ) IS NULL THEN RAISE EXCEPTION 'AFEX_WAVE_4C_DEPENDENCY_MISSING'; END IF;
END
$afex$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_WAVE_4C_TEMPORARY_SET_ENABLE_FAILED';
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

-- FWD-11-001
CREATE FUNCTION afex_offline_authority.lookup_offline_order_create_receipts_v2(
  p_sync_authenticated_subject_id uuid,
  p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,
  p_claims jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  authority_results jsonb;
  claim_record record;
  resolution jsonb;
  binding_row afex_offline_authority.offline_command_bindings%ROWTYPE;
  command_row public.atomic_order_commands%ROWTYPE;
  local_command_id uuid;
  snapshot_id uuid;
  payment_command_id uuid;
  idempotency_hash text;
  payment_hash text;
  core_payload_hash text;
  output jsonb := '[]'::jsonb;
  identity_matches boolean;
BEGIN
  -- Mandatory first operation: fresh total authority validation. No binding,
  -- command or response_snapshot is read before this call completes.
  authority_results :=
    afex_offline_authority.resolve_offline_order_create_authority_batch_v2(
      p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
      p_sync_pos_actor_session_id,p_claims);
  IF pg_catalog.jsonb_array_length(authority_results) <>
     pg_catalog.jsonb_array_length(p_claims) THEN
    RAISE EXCEPTION 'AFEX_RECEIPT_AUTHORITY_CARDINALITY_INVALID';
  END IF;
  FOR claim_record IN
    SELECT value,ordinality FROM pg_catalog.jsonb_array_elements(p_claims)
      WITH ORDINALITY ORDER BY ordinality
  LOOP
    resolution := authority_results->(claim_record.ordinality::integer-1);
    IF NOT COALESCE((resolution->>'available')::boolean,false) THEN
      output := output || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'position',claim_record.ordinality-1,
        'claimBindingHash',resolution->'claimBindingHash',
        'classification','AUTHORITY_REJECTED','receipt',NULL));
      CONTINUE;
    END IF;
    local_command_id := afex_offline_authority.try_uuid_v1(
      claim_record.value->>'localCommandId');
    snapshot_id := afex_offline_authority.try_uuid_v1(
      claim_record.value->'inventoryFrontierReference'->>'snapshotId');
    payment_command_id := afex_offline_authority.try_uuid_v1(
      claim_record.value->'offlineCanonicalPayload'->>'paymentAttestationCommandId');
    idempotency_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      claim_record.value->>'idempotencyKey','UTF8')),'hex');
    payment_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      afex_offline_authority.canonical_jsonb_v2(
        claim_record.value->'paymentAttestation'),'UTF8')),'hex');
    core_payload_hash := claim_record.value->'offlineCanonicalPayload'->>'corePayloadCanonicalHash';
    SELECT * INTO binding_row
    FROM afex_offline_authority.offline_command_bindings AS b
    WHERE b.local_command_id = local_command_id;
    IF NOT FOUND THEN
      output := output || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'position',claim_record.ordinality-1,
        'claimBindingHash',claim_record.value->'claimBindingHash',
        'classification','NO_RECEIPT','receipt',NULL));
      CONTINUE;
    END IF;
    identity_matches :=
      binding_row.command_contract_version = 'core-v2-offline-order-create.v2'
      AND binding_row.command_type = 'order.create'
      AND binding_row.origin_primary_authenticated_subject_id =
        afex_offline_authority.try_uuid_v1(
          claim_record.value->>'primaryAuthenticatedUserId')
      AND binding_row.origin_tenant_id =
        afex_offline_authority.try_uuid_v1(
          claim_record.value->'originAuthorityReference'->>'tenantId')
      AND binding_row.origin_branch_id =
        afex_offline_authority.try_uuid_v1(
          claim_record.value->'originAuthorityReference'->>'branchId')
      AND binding_row.origin_device_id =
        afex_offline_authority.try_uuid_v1(
          claim_record.value->'originAuthorityReference'->>'deviceId')
      AND binding_row.origin_device_generation =
        afex_offline_authority.try_bigint_v1(
          claim_record.value->'originAuthorityReference'->>'deviceGeneration')
      AND binding_row.origin_actual_pos_employee_id =
        afex_offline_authority.try_uuid_v1(
          claim_record.value->'originAuthorityReference'->>'actualPosEmployeeId')
      AND binding_row.origin_employee_enrollment_generation =
        afex_offline_authority.try_bigint_v1(
          claim_record.value->'originAuthorityReference'->>'employeeEnrollmentGeneration')
      AND binding_row.origin_command_generation =
        afex_offline_authority.try_bigint_v1(
          claim_record.value->'originAuthorityReference'->>'commandGeneration')
      AND binding_row.origin_key_envelope_id =
        afex_offline_authority.try_uuid_v1(
          claim_record.value->'originAuthorityReference'->>'keyEnvelopeId')
      AND binding_row.origin_key_envelope_version =
        afex_offline_authority.try_bigint_v1(
          claim_record.value->'originAuthorityReference'->>'keyEnvelopeVersion')
      AND binding_row.inventory_snapshot_id = snapshot_id
      AND binding_row.inventory_frontier_version =
        claim_record.value->'inventoryFrontierReference'->>'frontierVersion'
      AND binding_row.payment_attestation_command_id = payment_command_id
      AND binding_row.idempotency_key_hash = pg_catalog.decode(idempotency_hash,'hex')
      AND binding_row.payload_canonical_hash = pg_catalog.decode(
        claim_record.value->>'payloadCanonicalHash','hex')
      AND binding_row.core_payload_canonical_hash = pg_catalog.decode(core_payload_hash,'hex')
      AND binding_row.payment_attestation_hash = pg_catalog.decode(payment_hash,'hex')
      AND binding_row.authority_binding_canonical_hash = pg_catalog.decode(
        claim_record.value->>'authorityBindingCanonicalHash','hex');
    IF NOT identity_matches THEN
      output := output || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'position',claim_record.ordinality-1,
        'claimBindingHash',claim_record.value->'claimBindingHash',
        'classification','IDENTITY_CONFLICT','receipt',NULL));
      CONTINUE;
    END IF;
    SELECT * INTO command_row FROM public.atomic_order_commands AS c
    WHERE c.id = binding_row.server_command_id
      AND c.authorization_context_id = binding_row.authorization_context_id
      AND c.authenticated_actor_id = p_sync_authenticated_subject_id
      AND c.tenant_id = binding_row.origin_tenant_id
      AND c.branch_id = binding_row.origin_branch_id;
    IF NOT FOUND OR command_row.execution_status NOT IN ('succeeded','failed_final') THEN
      output := output || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'position',claim_record.ordinality-1,
        'claimBindingHash',claim_record.value->'claimBindingHash',
        'classification','NO_STABLE_RECEIPT','receipt',NULL));
      CONTINUE;
    END IF;
    output := output || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'position',claim_record.ordinality-1,
      'claimBindingHash',claim_record.value->'claimBindingHash',
      'classification',CASE WHEN command_row.execution_status = 'succeeded'
        THEN 'STABLE_COMPLETED_RECEIPT' ELSE 'STABLE_REJECTED_RECEIPT' END,
      'receipt',pg_catalog.jsonb_build_object(
        'receiptVersion',1,'commandContractVersion',binding_row.command_contract_version,
        'serverCommandId',binding_row.server_command_id,
        'idempotencyKey',claim_record.value->>'idempotencyKey',
        'payloadCanonicalHash',pg_catalog.encode(binding_row.payload_canonical_hash,'hex'),
        'authorityBindingCanonicalHash',
          pg_catalog.encode(binding_row.authority_binding_canonical_hash,'hex'),
        'originAuthorityReference',claim_record.value->'originAuthorityReference',
        'disposition',CASE WHEN command_row.execution_status='succeeded'
          THEN 'completed' ELSE 'rejected' END,
        'resultCode',CASE WHEN command_row.execution_status='succeeded'
          THEN 'ORDER_CREATED' ELSE COALESCE(command_row.error_code,'ORDER_REJECTED') END,
        'completedAt',command_row.completed_at,
        'responseReference',CASE WHEN command_row.execution_status='succeeded'
          THEN command_row.id::text ELSE NULL END,
        'retryable',false,'responseSnapshot',command_row.response_snapshot
      )));
  END LOOP;
  IF pg_catalog.jsonb_array_length(output) <> pg_catalog.jsonb_array_length(p_claims) THEN
    RAISE EXCEPTION 'AFEX_RECEIPT_CARDINALITY_INTERNAL_ERROR';
  END IF;
  RETURN output;
END
$fn$;

REVOKE ALL ON FUNCTION
  afex_offline_authority.lookup_offline_order_create_receipts_v2(
    uuid,uuid,uuid,jsonb
  ) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.lookup_offline_order_create_receipts_v2(
    uuid,uuid,uuid,jsonb
  ) TO afex_offline_acquisition_runtime;

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
    'afex_offline_authority.lookup_offline_order_create_receipts_v2(uuid,uuid,uuid,jsonb)'
  ) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'afex_offline_authority'
      AND p.proname = 'lookup_offline_order_create_receipts_v2'
      AND r.rolname = 'afex_function_owner'
  ) THEN RAISE EXCEPTION 'AFEX_WAVE_4C_POST_ATTESTATION_FAILED'; END IF;
END
$afex$;
COMMIT;
