/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 4A. Total bounded resolver and exact-set inventory reader.
Every array element yields one result at server-derived zero-based ordinality.
No runtime grant is given to browser, PUBLIC, anon, authenticated or service_role.
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
       'afex_offline_authority.validate_offline_provenance_v2(uuid,uuid,uuid,jsonb,text)'
     ) IS NULL OR pg_catalog.to_regprocedure(
       'afex_offline_authority.validate_inventory_frontier_v2(uuid,uuid,jsonb,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_4A_DEPENDENCY_MISSING';
  END IF;
END
$afex$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_WAVE_4A_TEMPORARY_SET_ENABLE_FAILED';
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

-- FWD-08C-001
CREATE FUNCTION afex_offline_authority.resolve_one_offline_order_create_claim_v2(
  p_sync_authenticated_subject_id uuid,
  p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,
  p_claim jsonb,
  p_server_position integer,
  p_duplicate_caller_position boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  claim_hash text;
  local_command_id uuid;
  tenant_id uuid;
  branch_id uuid;
  device_id uuid;
  employee_id uuid;
  key_id uuid;
  device_generation bigint;
  enrollment_generation bigint;
  command_generation bigint;
  key_version bigint;
  payment_command_id uuid;
  caller_position integer;
  payload jsonb;
  origin jsonb;
  frontier_reference jsonb;
  trusted_frontier jsonb;
  provenance jsonb;
  expected_claim_hash text;
  expected_payload_hash text;
  expected_authority_hash text;
  idempotency_hash text;
  binding_value jsonb;
BEGIN
  claim_hash := COALESCE(
    CASE WHEN pg_catalog.jsonb_typeof(p_claim) = 'object'
      THEN p_claim->>'claimBindingHash' ELSE NULL END,
    pg_catalog.repeat('0',64)
  );
  IF NOT afex_offline_authority.jsonb_has_exact_keys_v1(p_claim, ARRAY[
       'actualPosEmployeeId','aggregateId','aggregateType',
       'authorityBindingCanonicalHash','branchId','claimBindingHash',
       'commandContractVersion','commandGeneration','commandType',
       'deviceGeneration','deviceId','employeeEnrollmentGeneration',
       'idempotencyKey','inventoryFrontierReference','keyEnvelopeId',
       'keyEnvelopeVersion','localAggregateReference','localCommandId',
       'offlineCanonicalPayload','originAuthorityReference','payloadCanonicalHash',
       'paymentAttestation','position','primaryAuthenticatedUserId','schemaVersion','tenantId'
     ]::text[]) THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','CLAIM_SCHEMA_INVALID','retryable',false);
  END IF;
  caller_position := afex_offline_authority.try_integer_v1(p_claim->>'position');
  IF caller_position IS NULL OR caller_position <> p_server_position THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','CLAIM_POSITION_INVALID','retryable',false);
  END IF;
  IF p_duplicate_caller_position THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','CLAIM_POSITION_DUPLICATE','retryable',false);
  END IF;
  IF claim_hash !~ '^[0-9a-f]{64}$'
     OR p_claim->>'payloadCanonicalHash' !~ '^[0-9a-f]{64}$'
     OR p_claim->>'authorityBindingCanonicalHash' !~ '^[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','CLAIM_HASH_FORMAT_INVALID','retryable',false);
  END IF;
  expected_claim_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    afex_offline_authority.canonical_jsonb_v2(p_claim - 'claimBindingHash'),'UTF8'
  )),'hex');
  IF expected_claim_hash <> claim_hash THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','CLAIM_BINDING_HASH_MISMATCH','retryable',false);
  END IF;

  local_command_id := afex_offline_authority.try_uuid_v1(p_claim->>'localCommandId');
  tenant_id := afex_offline_authority.try_uuid_v1(p_claim->>'tenantId');
  branch_id := afex_offline_authority.try_uuid_v1(p_claim->>'branchId');
  device_id := afex_offline_authority.try_uuid_v1(p_claim->>'deviceId');
  employee_id := afex_offline_authority.try_uuid_v1(p_claim->>'actualPosEmployeeId');
  key_id := afex_offline_authority.try_uuid_v1(p_claim->>'keyEnvelopeId');
  payment_command_id := afex_offline_authority.try_uuid_v1(
    p_claim->'offlineCanonicalPayload'->>'paymentAttestationCommandId');
  device_generation := afex_offline_authority.try_bigint_v1(p_claim->>'deviceGeneration');
  enrollment_generation := afex_offline_authority.try_bigint_v1(
    p_claim->>'employeeEnrollmentGeneration');
  command_generation := afex_offline_authority.try_bigint_v1(p_claim->>'commandGeneration');
  key_version := afex_offline_authority.try_bigint_v1(p_claim->>'keyEnvelopeVersion');
  payload := p_claim->'offlineCanonicalPayload';
  origin := p_claim->'originAuthorityReference';
  frontier_reference := p_claim->'inventoryFrontierReference';
  IF local_command_id IS NULL OR tenant_id IS NULL OR branch_id IS NULL
     OR device_id IS NULL OR employee_id IS NULL OR key_id IS NULL
     OR payment_command_id IS NULL OR device_generation IS NULL
     OR enrollment_generation IS NULL OR command_generation IS NULL OR key_version IS NULL
     OR device_generation <= 0 OR enrollment_generation <= 0
     OR command_generation <= 0 OR key_version <= 0
     OR p_claim->>'commandContractVersion' <> 'core-v2-offline-order-create.v2'
     OR p_claim->>'commandType' <> 'order.create'
     OR afex_offline_authority.try_integer_v1(p_claim->>'schemaVersion') <> 1
     OR p_claim->>'aggregateType' <> 'order'
     OR p_claim->'aggregateId' <> 'null'::jsonb
     OR p_claim->'localAggregateReference' = 'null'::jsonb THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','CLAIM_VALUE_INVALID','retryable',false);
  END IF;
  expected_payload_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    afex_offline_authority.canonical_jsonb_v2(payload),'UTF8'
  )),'hex');
  IF expected_payload_hash <> p_claim->>'payloadCanonicalHash' THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','PAYLOAD_HASH_MISMATCH','retryable',false);
  END IF;
  binding_value := pg_catalog.jsonb_build_object(
    'commandContractVersion',p_claim->'commandContractVersion',
    'commandType',p_claim->'commandType','schemaVersion',p_claim->'schemaVersion',
    'localCommandId',p_claim->'localCommandId','idempotencyKey',p_claim->'idempotencyKey',
    'primaryAuthenticatedUserId',p_claim->'primaryAuthenticatedUserId',
    'actualPosEmployeeId',p_claim->'actualPosEmployeeId','tenantId',p_claim->'tenantId',
    'branchId',p_claim->'branchId','deviceId',p_claim->'deviceId',
    'deviceGeneration',p_claim->'deviceGeneration',
    'employeeEnrollmentGeneration',p_claim->'employeeEnrollmentGeneration',
    'commandGeneration',p_claim->'commandGeneration','keyEnvelopeId',p_claim->'keyEnvelopeId',
    'keyEnvelopeVersion',p_claim->'keyEnvelopeVersion','aggregateType',p_claim->'aggregateType',
    'aggregateId',p_claim->'aggregateId','localAggregateReference',p_claim->'localAggregateReference',
    'payloadCanonicalHash',p_claim->'payloadCanonicalHash',
    'paymentAttestation',p_claim->'paymentAttestation',
    'inventoryFrontierReference',frontier_reference,'originAuthorityReference',origin
  );
  expected_authority_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    afex_offline_authority.canonical_jsonb_v2(binding_value),'UTF8'
  )),'hex');
  IF expected_authority_hash <> p_claim->>'authorityBindingCanonicalHash' THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','AUTHORITY_BINDING_HASH_MISMATCH','retryable',false);
  END IF;
  IF tenant_id::text <> origin->>'tenantId' OR branch_id::text <> origin->>'branchId'
     OR device_id::text <> origin->>'deviceId'
     OR employee_id::text <> origin->>'actualPosEmployeeId'
     OR device_generation::text <> origin->>'deviceGeneration'
     OR enrollment_generation::text <> origin->>'employeeEnrollmentGeneration'
     OR command_generation::text <> origin->>'commandGeneration'
     OR key_id::text <> origin->>'keyEnvelopeId'
     OR key_version::text <> origin->>'keyEnvelopeVersion' THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','ORIGIN_SCOPE_MISMATCH','retryable',false);
  END IF;
  provenance := afex_offline_authority.validate_offline_provenance_v2(
    p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
    p_sync_pos_actor_session_id,origin,'order.create');
  IF provenance->>'originPrimaryAuthenticatedSubjectId' <>
     p_claim->>'primaryAuthenticatedUserId' THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','ORIGIN_ACCOUNT_MISMATCH','retryable',false);
  END IF;
  idempotency_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_claim->>'idempotencyKey','UTF8')),'hex');
  IF NOT afex_offline_authority.validate_payment_attestation_v2(
    p_claim->'paymentAttestation',payload->>'totalAmount',local_command_id,
    idempotency_hash,payment_command_id,p_claim->>'localAggregateReference',
    afex_offline_authority.try_uuid_v1(p_claim->>'primaryAuthenticatedUserId'),
    employee_id,tenant_id,branch_id,device_id,device_generation,
    enrollment_generation,command_generation
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','PAYMENT_ATTESTATION_INVALID','retryable',false);
  END IF;
  trusted_frontier := afex_offline_authority.validate_inventory_frontier_v2(
    tenant_id,branch_id,payload,frontier_reference);
  IF trusted_frontier IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
      'code','INVENTORY_FRONTIER_INVALID','retryable',false);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'position',p_server_position,'claimBindingHash',claim_hash,'available',true,
    'authority',pg_catalog.jsonb_build_object(
      'source','trusted_server','authorityVersion','afex-database-provenance.v2',
      'primaryAuthenticatedUserId',provenance->>'originPrimaryAuthenticatedSubjectId',
      'tenantId',tenant_id,'branchId',branch_id,'actualPosEmployeeId',employee_id,
      'deviceId',device_id,'deviceGeneration',device_generation,
      'employeeEnrollmentGeneration',enrollment_generation,
      'commandGeneration',command_generation,'keyEnvelopeId',key_id,
      'keyEnvelopeVersion',key_version,'originAuthorityReference',origin,
      'keyEnvelopeValidated',true,'employeeRevoked',false,'deviceRevoked',false,
      'supportedCommandTypes',pg_catalog.jsonb_build_array('order.create'),
      'inventoryFrontier',trusted_frontier,'coreV2Available',true,
      'resolvedAtServer',pg_catalog.statement_timestamp()
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN pg_catalog.jsonb_build_object(
    'position',p_server_position,'claimBindingHash',claim_hash,'available',false,
    'code',CASE
      WHEN SQLERRM LIKE 'AFEX_SYNC_AUTH_SESSION_INVALID%' THEN 'UPLOADER_AUTH_SESSION_INVALID'
      WHEN SQLERRM LIKE 'AFEX_SYNC_POS_ACTOR_SESSION_INVALID%' THEN 'UPLOADER_POS_ACTOR_INVALID'
      WHEN SQLERRM LIKE 'AFEX_OFFLINE_DEVICE_AUTHORITY_INVALID%' THEN 'DEVICE_AUTHORITY_INVALID'
      WHEN SQLERRM LIKE 'AFEX_OFFLINE_EMPLOYEE_AUTHORITY_INVALID%' THEN 'EMPLOYEE_AUTHORITY_INVALID'
      WHEN SQLERRM LIKE 'AFEX_OFFLINE_KEY_ENVELOPE_AUTHORITY_INVALID%' THEN 'KEY_AUTHORITY_INVALID'
      ELSE 'CLAIM_MALFORMED'
    END,'retryable',false);
END
$fn$;

-- FWD-08C-002
CREATE FUNCTION afex_offline_authority.resolve_offline_order_create_authority_batch_v2(
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
  raw_claim record;
  claim_count integer;
  caller_position integer;
  duplicate_position boolean;
  result_value jsonb := '[]'::jsonb;
BEGIN
  IF pg_catalog.jsonb_typeof(p_claims) <> 'array' THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_BATCH_MALFORMED';
  END IF;
  claim_count := pg_catalog.jsonb_array_length(p_claims);
  IF claim_count < 1 OR claim_count > 1000 THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_BATCH_LIMIT_EXCEEDED';
  END IF;
  FOR raw_claim IN
    SELECT value,ordinality FROM pg_catalog.jsonb_array_elements(p_claims)
      WITH ORDINALITY
    ORDER BY ordinality
  LOOP
    caller_position := CASE WHEN pg_catalog.jsonb_typeof(raw_claim.value) = 'object'
      THEN afex_offline_authority.try_integer_v1(raw_claim.value->>'position')
      ELSE NULL END;
    duplicate_position := caller_position IS NOT NULL AND (
      SELECT pg_catalog.count(*) > 1
      FROM pg_catalog.jsonb_array_elements(p_claims) AS x(value)
      WHERE afex_offline_authority.try_integer_v1(x.value->>'position') = caller_position
    );
    result_value := result_value || pg_catalog.jsonb_build_array(
      afex_offline_authority.resolve_one_offline_order_create_claim_v2(
        p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
        p_sync_pos_actor_session_id,raw_claim.value,
        (raw_claim.ordinality-1)::integer,duplicate_position
      )
    );
  END LOOP;
  IF pg_catalog.jsonb_array_length(result_value) <> claim_count THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_RESOLVER_CARDINALITY_INTERNAL_ERROR';
  END IF;
  RETURN result_value;
END
$fn$;

-- FWD-08C-003
CREATE FUNCTION afex_offline_authority.read_branch_inventory_frontier_v2(
  p_sync_authenticated_subject_id uuid,
  p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,
  p_claim jsonb,
  p_catalog_item_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE result_value jsonb; trusted_frontier jsonb; requested_count integer;
BEGIN
  requested_count := pg_catalog.cardinality(p_catalog_item_ids);
  IF requested_count < 1 OR requested_count > 200
     OR requested_count <> (
       SELECT pg_catalog.count(DISTINCT x) FROM pg_catalog.unnest(p_catalog_item_ids) AS x
     ) OR EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_catalog_item_ids) WITH ORDINALITY AS x(id,n)
       WHERE x.n > 1 AND x.id::text <= p_catalog_item_ids[x.n::integer-1]::text
     ) THEN
    RAISE EXCEPTION 'AFEX_INVENTORY_FRONTIER_ITEM_SET_INVALID';
  END IF;
  result_value := afex_offline_authority.resolve_offline_order_create_authority_batch_v2(
    p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
    p_sync_pos_actor_session_id,pg_catalog.jsonb_build_array(p_claim));
  IF pg_catalog.jsonb_array_length(result_value) <> 1
     OR NOT COALESCE((result_value->0->>'available')::boolean,false) THEN
    RAISE EXCEPTION 'AFEX_INVENTORY_FRONTIER_AUTHORITY_REJECTED';
  END IF;
  trusted_frontier := result_value->0->'authority'->'inventoryFrontier';
  IF pg_catalog.jsonb_array_length(trusted_frontier->'items') <> requested_count
     OR EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_catalog_item_ids) WITH ORDINALITY AS r(id,n)
       WHERE trusted_frontier->'items'->(r.n::integer-1)->>'catalogItemId' <> r.id::text
     ) THEN
    RAISE EXCEPTION 'TRUSTED_INVENTORY_FRONTIER_INCOMPLETE_OR_EXTRA';
  END IF;
  RETURN trusted_frontier;
END
$fn$;

DO $afex$
DECLARE f pg_catalog.regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'afex_offline_authority.resolve_one_offline_order_create_claim_v2(uuid,uuid,uuid,jsonb,integer,boolean)'::pg_catalog.regprocedure,
    'afex_offline_authority.resolve_offline_order_create_authority_batch_v2(uuid,uuid,uuid,jsonb)'::pg_catalog.regprocedure,
    'afex_offline_authority.read_branch_inventory_frontier_v2(uuid,uuid,uuid,jsonb,uuid[])'::pg_catalog.regprocedure
  ] LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',f
    );
  END LOOP;
END
$afex$;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.resolve_offline_order_create_authority_batch_v2(
    uuid,uuid,uuid,jsonb
  ) TO afex_offline_acquisition_runtime;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.read_branch_inventory_frontier_v2(
    uuid,uuid,uuid,jsonb,uuid[]
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
       'afex_offline_authority.resolve_offline_order_create_authority_batch_v2(uuid,uuid,uuid,jsonb)'
     ) IS NULL OR pg_catalog.to_regprocedure(
       'afex_offline_authority.read_branch_inventory_frontier_v2(uuid,uuid,uuid,jsonb,uuid[])'
     ) IS NULL OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
       WHERE n.nspname = 'afex_offline_authority'
         AND p.proname IN (
           'resolve_one_offline_order_create_claim_v2',
           'resolve_offline_order_create_authority_batch_v2',
           'read_branch_inventory_frontier_v2'
         )
         AND r.rolname <> 'afex_function_owner'
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_4A_POST_ATTESTATION_FAILED';
  END IF;
END
$afex$;
COMMIT;
