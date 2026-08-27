/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 4B. One atomic order.create acquisition surface. Core V2 remains the
sole order/invoice authority. Payment attestation, full Core projection equality,
fresh uploader/origin authority and exact inventory frontier are validated before
the existing Core acquisition function is invoked.
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
       'afex_offline_authority.validate_payment_attestation_v2(jsonb,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint)'
     ) IS NULL OR pg_catalog.to_regprocedure(
       'public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_4B_DEPENDENCY_MISSING';
  END IF;
END
$afex$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_WAVE_4B_TEMPORARY_SET_ENABLE_FAILED';
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

-- FWD-08D-001
CREATE FUNCTION afex_offline_authority.acquire_offline_order_create_v2(
  p_sync_authenticated_subject_id uuid,
  p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,
  p_command_contract_version text,
  p_command_type text,
  p_schema_version integer,
  p_local_command_id uuid,
  p_idempotency_key text,
  p_primary_authenticated_user_id uuid,
  p_actual_pos_employee_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_device_id uuid,
  p_device_generation bigint,
  p_employee_enrollment_generation bigint,
  p_command_generation bigint,
  p_key_envelope_id uuid,
  p_key_envelope_version bigint,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_local_aggregate_reference text,
  p_payload_canonical_hash text,
  p_payment_attestation jsonb,
  p_inventory_frontier_reference jsonb,
  p_origin_authority_reference jsonb,
  p_authority_binding_canonical_hash text,
  p_offline_canonical_payload jsonb,
  p_core_canonical_payload text,
  p_core_fingerprint_projection text,
  p_correlation_reference text,
  p_retain_until timestamptz,
  p_local_created_at timestamptz,
  p_client_application_version text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  provenance jsonb;
  trusted_frontier jsonb;
  binding_value jsonb;
  recomputed_binding_hash text;
  recomputed_payload_hash text;
  idempotency_hash text;
  core_payload_hash text;
  payment_hash text;
  core_payload jsonb;
  core_projection jsonb;
  core_result jsonb;
  command_id uuid;
  context_id uuid;
  payment_command_id uuid;
  snapshot_id uuid;
  existing_binding afex_offline_authority.offline_command_bindings%ROWTYPE;
BEGIN
  IF p_command_contract_version <> 'core-v2-offline-order-create.v2'
     OR p_command_type <> 'order.create' OR p_schema_version <> 1
     OR p_aggregate_type <> 'order' OR p_aggregate_id IS NOT NULL
     OR p_local_aggregate_reference IS NULL
     OR p_client_application_version !~ '^[0-9]+[.][0-9]+[.][0-9]+'
     OR p_retain_until <= pg_catalog.statement_timestamp()
     OR p_local_created_at > pg_catalog.statement_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_ORDER_CONTRACT_INVALID';
  END IF;
  IF p_payload_canonical_hash !~ '^[0-9a-f]{64}$'
     OR p_authority_binding_canonical_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_HASH_FORMAT_INVALID';
  END IF;
  payment_command_id := afex_offline_authority.try_uuid_v1(
    p_offline_canonical_payload->>'paymentAttestationCommandId');
  snapshot_id := afex_offline_authority.try_uuid_v1(
    p_inventory_frontier_reference->>'snapshotId');
  IF payment_command_id IS NULL OR snapshot_id IS NULL THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_REFERENCE_INVALID';
  END IF;
  IF p_tenant_id::text <> p_origin_authority_reference->>'tenantId'
     OR p_primary_authenticated_user_id::text <>
        p_origin_authority_reference->>'primaryAuthenticatedSubjectId'
     OR p_branch_id::text <> p_origin_authority_reference->>'branchId'
     OR p_device_id::text <> p_origin_authority_reference->>'deviceId'
     OR p_actual_pos_employee_id::text <> p_origin_authority_reference->>'actualPosEmployeeId'
     OR afex_offline_authority.try_uuid_v1(
          p_origin_authority_reference->>'enrollmentId') IS NULL
     OR p_device_generation::text <> p_origin_authority_reference->>'deviceGeneration'
     OR p_employee_enrollment_generation::text <>
        p_origin_authority_reference->>'employeeEnrollmentGeneration'
     OR p_command_generation::text <> p_origin_authority_reference->>'commandGeneration'
     OR p_key_envelope_id::text <> p_origin_authority_reference->>'keyEnvelopeId'
     OR p_key_envelope_version::text <> p_origin_authority_reference->>'keyEnvelopeVersion'
     OR afex_offline_authority.try_bigint_v1(
          p_origin_authority_reference->>'namespaceGeneration') IS NULL THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_ORIGIN_CORRESPONDENCE_MISMATCH';
  END IF;
  provenance := afex_offline_authority.validate_offline_provenance_v2(
    p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
    p_sync_pos_actor_session_id,p_origin_authority_reference,p_command_type);
  IF provenance->>'originPrimaryAuthenticatedSubjectId' <>
     p_primary_authenticated_user_id::text THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_ORIGIN_ACCOUNT_MISMATCH';
  END IF;
  recomputed_payload_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    afex_offline_authority.canonical_jsonb_v2(p_offline_canonical_payload),'UTF8'
  )),'hex');
  IF recomputed_payload_hash <> p_payload_canonical_hash THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_PAYLOAD_HASH_MISMATCH';
  END IF;
  binding_value := pg_catalog.jsonb_build_object(
    'commandContractVersion',p_command_contract_version,'commandType',p_command_type,
    'schemaVersion',p_schema_version,'localCommandId',p_local_command_id,
    'idempotencyKey',p_idempotency_key,
    'primaryAuthenticatedUserId',p_primary_authenticated_user_id,
    'actualPosEmployeeId',p_actual_pos_employee_id,'tenantId',p_tenant_id,
    'branchId',p_branch_id,'deviceId',p_device_id,
    'deviceGeneration',p_device_generation,
    'employeeEnrollmentGeneration',p_employee_enrollment_generation,
    'commandGeneration',p_command_generation,'keyEnvelopeId',p_key_envelope_id,
    'keyEnvelopeVersion',p_key_envelope_version,'aggregateType',p_aggregate_type,
    'aggregateId',p_aggregate_id,'localAggregateReference',p_local_aggregate_reference,
    'payloadCanonicalHash',p_payload_canonical_hash,
    'paymentAttestation',p_payment_attestation,
    'inventoryFrontierReference',p_inventory_frontier_reference,
    'originAuthorityReference',p_origin_authority_reference
  );
  recomputed_binding_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    afex_offline_authority.canonical_jsonb_v2(binding_value),'UTF8'
  )),'hex');
  IF recomputed_binding_hash <> p_authority_binding_canonical_hash THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_AUTHORITY_BINDING_HASH_MISMATCH';
  END IF;
  idempotency_hash := pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(p_idempotency_key,'UTF8')),'hex');
  IF NOT afex_offline_authority.validate_payment_attestation_v2(
    p_payment_attestation,p_offline_canonical_payload->>'totalAmount',
    p_local_command_id,idempotency_hash,payment_command_id,
    p_local_aggregate_reference,p_primary_authenticated_user_id,
    p_actual_pos_employee_id,p_tenant_id,p_branch_id,p_device_id,
    p_device_generation,p_employee_enrollment_generation,p_command_generation
  ) THEN
    RAISE EXCEPTION 'AFEX_PAYMENT_ATTESTATION_INVALID';
  END IF;
  trusted_frontier := afex_offline_authority.validate_inventory_frontier_v2(
    p_tenant_id,p_branch_id,p_offline_canonical_payload,
    p_inventory_frontier_reference);
  IF trusted_frontier IS NULL THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_INVENTORY_FRONTIER_MISMATCH';
  END IF;
  BEGIN
    core_payload := p_core_canonical_payload::jsonb;
    core_projection := p_core_fingerprint_projection::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'AFEX_CORE_CANONICAL_JSON_INVALID';
  END;
  core_payload_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    afex_offline_authority.canonical_jsonb_v2(core_payload),'UTF8')),'hex');
  IF NOT afex_offline_authority.assert_offline_core_order_mapping_v2(
    p_offline_canonical_payload,core_payload,core_projection,
    p_sync_authenticated_subject_id,p_tenant_id,p_branch_id,p_idempotency_key,
    core_payload_hash,snapshot_id,p_inventory_frontier_reference->>'frontierVersion'
  ) THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_TO_CORE_MAPPING_MISMATCH';
  END IF;
  payment_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    afex_offline_authority.canonical_jsonb_v2(p_payment_attestation),'UTF8')),'hex');

  core_result := public.acquire_atomic_order_command_result_v1(
    p_sync_authenticated_subject_id,p_tenant_id,p_branch_id,p_idempotency_key,
    p_correlation_reference,p_core_canonical_payload,p_core_fingerprint_projection,
    p_retain_until);
  IF core_result->>'result' NOT IN (
    'created','in_progress','replay','fingerprint_conflict','failed'
  ) THEN
    RAISE EXCEPTION 'AFEX_CORE_ACQUISITION_RESULT_INVALID';
  END IF;
  IF core_result->>'result' IN ('fingerprint_conflict','failed') THEN
    RETURN core_result;
  END IF;
  command_id := afex_offline_authority.try_uuid_v1(core_result->>'commandId');
  IF command_id IS NULL THEN RAISE EXCEPTION 'AFEX_CORE_COMMAND_ID_INVALID'; END IF;
  SELECT c.authorization_context_id INTO context_id
  FROM public.atomic_order_commands AS c
  JOIN public.atomic_authorization_contexts AS a
    ON a.id = c.authorization_context_id
   AND a.authenticated_actor_id = p_sync_authenticated_subject_id
   AND a.tenant_id = p_tenant_id AND a.branch_id = p_branch_id
   AND a.employee_source_id = p_actual_pos_employee_id
  WHERE c.id = command_id AND c.authenticated_actor_id = p_sync_authenticated_subject_id
    AND c.tenant_id = p_tenant_id AND c.branch_id = p_branch_id;
  IF context_id IS NULL THEN RAISE EXCEPTION 'AFEX_CORE_AUTHORIZATION_CONTEXT_MISSING'; END IF;

  IF core_result->>'result' = 'created' THEN
    INSERT INTO afex_offline_authority.offline_command_bindings (
      authorization_context_id,server_command_id,provenance_version,
      current_uploader_authenticated_subject_id,
      current_uploader_authenticated_session_id,current_uploader_pos_actor_session_id,
      origin_primary_authenticated_subject_id,origin_bootstrap_id,
      origin_bootstrap_generation,origin_tenant_id,origin_branch_id,
      origin_device_id,origin_device_generation,origin_actual_pos_employee_id,
      origin_enrollment_id,
      origin_employee_enrollment_generation,origin_command_generation,
      origin_key_envelope_id,origin_key_envelope_version,origin_namespace_generation,
      origin_authority_version,
      inventory_snapshot_id,inventory_frontier_version,payment_attestation_command_id,
      command_contract_version,command_type,local_command_id,idempotency_key_hash,
      payload_canonical_hash,core_payload_canonical_hash,payment_attestation_hash,
      authority_binding_canonical_hash
    ) VALUES (
      context_id,command_id,'afex-atomic-authorization-provenance.v2',
      p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
      p_sync_pos_actor_session_id,p_primary_authenticated_user_id,
      afex_offline_authority.try_uuid_v1(p_origin_authority_reference->>'bootstrapId'),
      afex_offline_authority.try_bigint_v1(p_origin_authority_reference->>'bootstrapGeneration'),
      p_tenant_id,p_branch_id,
      p_device_id,p_device_generation,p_actual_pos_employee_id,
      afex_offline_authority.try_uuid_v1(p_origin_authority_reference->>'enrollmentId'),
      p_employee_enrollment_generation,p_command_generation,p_key_envelope_id,
      p_key_envelope_version,
      afex_offline_authority.try_bigint_v1(p_origin_authority_reference->>'namespaceGeneration'),
      'afex-offline-origin-authority.v2',snapshot_id,
      p_inventory_frontier_reference->>'frontierVersion',payment_command_id,
      p_command_contract_version,p_command_type,p_local_command_id,
      pg_catalog.decode(idempotency_hash,'hex'),
      pg_catalog.decode(p_payload_canonical_hash,'hex'),
      pg_catalog.decode(core_payload_hash,'hex'),pg_catalog.decode(payment_hash,'hex'),
      pg_catalog.decode(p_authority_binding_canonical_hash,'hex')
    );
  ELSE
    SELECT * INTO existing_binding
    FROM afex_offline_authority.offline_command_bindings AS b
    WHERE b.server_command_id = command_id;
    IF NOT FOUND
       OR existing_binding.current_uploader_authenticated_subject_id <>
          p_sync_authenticated_subject_id
       OR existing_binding.origin_primary_authenticated_subject_id <>
          p_primary_authenticated_user_id
       OR existing_binding.origin_bootstrap_id <>
          afex_offline_authority.try_uuid_v1(p_origin_authority_reference->>'bootstrapId')
       OR existing_binding.origin_bootstrap_generation <>
          afex_offline_authority.try_bigint_v1(p_origin_authority_reference->>'bootstrapGeneration')
       OR existing_binding.origin_tenant_id <> p_tenant_id
       OR existing_binding.origin_branch_id <> p_branch_id
       OR existing_binding.origin_device_id <> p_device_id
       OR existing_binding.origin_device_generation <> p_device_generation
       OR existing_binding.origin_actual_pos_employee_id <> p_actual_pos_employee_id
       OR existing_binding.origin_enrollment_id <>
          afex_offline_authority.try_uuid_v1(p_origin_authority_reference->>'enrollmentId')
       OR existing_binding.origin_employee_enrollment_generation <>
          p_employee_enrollment_generation
       OR existing_binding.origin_command_generation <> p_command_generation
       OR existing_binding.origin_key_envelope_id <> p_key_envelope_id
       OR existing_binding.origin_key_envelope_version <> p_key_envelope_version
       OR existing_binding.origin_namespace_generation <>
          afex_offline_authority.try_bigint_v1(p_origin_authority_reference->>'namespaceGeneration')
       OR existing_binding.inventory_snapshot_id <> snapshot_id
       OR existing_binding.inventory_frontier_version <>
          p_inventory_frontier_reference->>'frontierVersion'
       OR existing_binding.payment_attestation_command_id <> payment_command_id
       OR existing_binding.idempotency_key_hash <> pg_catalog.decode(idempotency_hash,'hex')
       OR existing_binding.payload_canonical_hash <>
          pg_catalog.decode(p_payload_canonical_hash,'hex')
       OR existing_binding.core_payload_canonical_hash <> pg_catalog.decode(core_payload_hash,'hex')
       OR existing_binding.payment_attestation_hash <> pg_catalog.decode(payment_hash,'hex')
       OR existing_binding.authority_binding_canonical_hash <>
          pg_catalog.decode(p_authority_binding_canonical_hash,'hex') THEN
      RAISE EXCEPTION 'AFEX_OFFLINE_EXISTING_COMMAND_PROVENANCE_CONFLICT';
    END IF;
  END IF;
  RETURN core_result || pg_catalog.jsonb_build_object(
    'provenanceVersion','afex-atomic-authorization-provenance.v2',
    'originAuthorityReference',p_origin_authority_reference);
END
$fn$;

REVOKE ALL ON FUNCTION afex_offline_authority.acquire_offline_order_create_v2(
  uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,
  bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,
  text,jsonb,text,text,text,timestamptz,timestamptz,text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION afex_offline_authority.acquire_offline_order_create_v2(
  uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,
  bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,
  text,jsonb,text,text,text,timestamptz,timestamptz,text
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
    'afex_offline_authority.acquire_offline_order_create_v2(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)'
  ) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'afex_offline_authority'
      AND p.proname = 'acquire_offline_order_create_v2'
      AND r.rolname = 'afex_function_owner'
  ) THEN RAISE EXCEPTION 'AFEX_WAVE_4B_POST_ATTESTATION_FAILED'; END IF;
END
$afex$;
COMMIT;
