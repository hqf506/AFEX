/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 2A.1: trusted managed-device lifecycle writers, created directly by
afex_offline_authority_owner under bounded postgres installer authority.
Dependencies: whole files 01A, 01B, 04C, 05 and 13. One transaction; no subset execution.
Stop on principal, schema, role, signature, ownership or ACL mismatch.
Emergency disablement: revoke the exact EXECUTE grants below; retain all rows/events.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.to_regrole('afex_offline_provisioning_runtime') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_devices') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_offline_authority_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN
    RAISE EXCEPTION 'AFEX_DEVICE_PROVISIONING_PRECONDITION_FAILED';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_2A1_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_2A1_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-05A-001: postgres-owned support grants/policies are installed by whole-file 04C.
-- FWD-05A-002: fail closed unless Wave 2E installed the exact active-device guard.
DO $afex$ BEGIN
  IF pg_catalog.to_regclass(
       'afex_offline_authority.offline_devices_one_active_branch_uidx'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_DEVICE_ACTIVE_UNIQUENESS_GUARD_MISSING';
  END IF;
END $afex$;

-- FWD-05A-003
CREATE FUNCTION afex_offline_authority.register_offline_device_v1(
  p_operation_id uuid,
  p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_device_id uuid,
  p_mode text,
  p_proof_public_key_jwk jsonb,
  p_wrap_public_key_jwk jsonb,
  p_evidence_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  request_hash text;
  prior_hash text;
  result_row afex_offline_authority.offline_devices%ROWTYPE;
BEGIN
  IF p_mode NOT IN ('MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE','MODE_B_NATIVE_OPTIONAL')
     OR pg_catalog.jsonb_typeof(p_proof_public_key_jwk) <> 'object'
     OR pg_catalog.jsonb_typeof(p_wrap_public_key_jwk) <> 'object'
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_proof_public_key_jwk)) <> 5
     OR NOT (p_proof_public_key_jwk ?& ARRAY['kty','crv','x','y','use'])
     OR p_proof_public_key_jwk->>'kty' <> 'EC'
     OR p_proof_public_key_jwk->>'crv' <> 'P-256'
     OR p_proof_public_key_jwk->>'use' <> 'sig'
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(p_wrap_public_key_jwk)) <> 5
     OR NOT (p_wrap_public_key_jwk ?& ARRAY['kty','n','e','alg','use'])
     OR p_wrap_public_key_jwk->>'kty' <> 'RSA'
     OR p_wrap_public_key_jwk->>'alg' <> 'RSA-OAEP-256'
     OR p_wrap_public_key_jwk->>'use' <> 'enc'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_DEVICE_REGISTER_SCHEMA_INVALID';
  END IF;
  request_hash := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operationId',p_operation_id,'subjectId',p_primary_authenticated_subject_id,
      'tenantId',p_tenant_id,'branchId',p_branch_id,'deviceId',p_device_id,
      'mode',p_mode,'proofKey',p_proof_public_key_jwk,
      'wrapKey',p_wrap_public_key_jwk,'evidence',p_evidence_sha256
    )::text,'UTF8'),'sha256'),'hex');
  SELECT e.request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_device_events AS e
  WHERE e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id
    AND e.operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash <> request_hash THEN RAISE EXCEPTION 'AFEX_DEVICE_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT result_row FROM afex_offline_authority.offline_devices AS d
    WHERE d.device_id=p_device_id AND d.tenant_id=p_tenant_id AND d.branch_id=p_branch_id;
    RETURN pg_catalog.jsonb_build_object(
      'contractVersion','offline-device-authority.v1','status','stable_replay',
      'deviceId',result_row.device_id,'deviceGeneration',result_row.device_generation,
      'keyGeneration',result_row.key_envelope_generation,
      'revocationGeneration',result_row.revocation_generation,
      'authorityStatus',result_row.status);
  END IF;
  PERFORM 1 FROM public.branches AS b
  WHERE b.id=p_branch_id AND b.tenant_id=p_tenant_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id=p_primary_authenticated_subject_id AND p.is_active=true
      AND p.tenant_id=p_tenant_id
      AND (p.branch_id IS NULL OR p.branch_id=p_branch_id)
      AND p.role IN ('owner','admin','manager','employee')
  ) THEN RAISE EXCEPTION 'AFEX_DEVICE_REGISTER_SCOPE_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM afex_offline_authority.offline_devices AS d
    WHERE d.device_id=p_device_id) THEN RAISE EXCEPTION 'AFEX_DEVICE_ID_IMMUTABLE_CONFLICT'; END IF;
  INSERT INTO afex_offline_authority.offline_devices(
    device_id,tenant_id,branch_id,device_generation,key_envelope_generation,
    revocation_generation,mode,status,device_proof_public_key_jwk,
    device_wrap_public_key_jwk,device_proof_key_sha256,device_wrap_key_sha256,
    device_proof_algorithm,device_wrap_algorithm,wrap_algorithm,
    registered_by_authenticated_subject_id
  ) VALUES (
    p_device_id,p_tenant_id,p_branch_id,1,1,0,p_mode,'pending',
    p_proof_public_key_jwk,p_wrap_public_key_jwk,
    pg_catalog.encode(public.digest(pg_catalog.convert_to(p_proof_public_key_jwk::text,'UTF8'),'sha256'),'hex'),
    pg_catalog.encode(public.digest(pg_catalog.convert_to(p_wrap_public_key_jwk::text,'UTF8'),'sha256'),'hex'),
    'ECDSA-P256-SHA256','RSA-OAEP-3072-SHA256','RSA-OAEP-3072-SHA256',
    p_primary_authenticated_subject_id
  ) RETURNING * INTO result_row;
  INSERT INTO afex_offline_authority.offline_device_events(
    device_id,tenant_id,branch_id,event_type,operation_id,request_sha256,
    device_generation,revocation_generation,actor_authenticated_subject_id,
    reason_code,evidence_sha256
  ) VALUES (p_device_id,p_tenant_id,p_branch_id,'registered',p_operation_id,
    request_hash,1,0,p_primary_authenticated_subject_id,'trusted_online_registration',
    p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-device-authority.v1','status','registered',
    'deviceId',result_row.device_id,'deviceGeneration',1,
    'keyGeneration',1,'revocationGeneration',0,'authorityStatus','pending');
END
$fn$;

-- FWD-05A-004
CREATE FUNCTION afex_offline_authority.activate_offline_device_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_expected_device_generation bigint,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $fn$
DECLARE d afex_offline_authority.offline_devices%ROWTYPE; request_hash text; prior text;
BEGIN
  IF p_expected_device_generation <= 0 OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_DEVICE_ACTIVATE_SCHEMA_INVALID'; END IF;
  request_hash := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,'subjectId',p_primary_authenticated_subject_id,
      'tenantId',p_tenant_id,'branchId',p_branch_id,'deviceId',p_device_id,
      'expectedGeneration',p_expected_device_generation,'evidence',p_evidence_sha256)::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior FROM afex_offline_authority.offline_device_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior<>request_hash THEN RAISE EXCEPTION 'AFEX_DEVICE_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT d FROM afex_offline_authority.offline_devices
    WHERE device_id=p_device_id AND tenant_id=p_tenant_id AND branch_id=p_branch_id;
    RETURN pg_catalog.jsonb_build_object('contractVersion','offline-device-authority.v1',
      'status','stable_replay','deviceId',d.device_id,'deviceGeneration',d.device_generation,
      'revocationGeneration',d.revocation_generation,'authorityStatus',d.status);
  END IF;
  PERFORM 1 FROM public.branches WHERE id=p_branch_id AND tenant_id=p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AFEX_DEVICE_BRANCH_SCOPE_INVALID'; END IF;
  PERFORM 1 FROM afex_offline_authority.offline_devices
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id ORDER BY device_id FOR UPDATE;
  SELECT * INTO d FROM afex_offline_authority.offline_devices
  WHERE device_id=p_device_id AND tenant_id=p_tenant_id AND branch_id=p_branch_id;
  IF NOT FOUND OR d.status<>'pending' OR d.device_generation<>p_expected_device_generation
     OR d.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id
     OR EXISTS (SELECT 1 FROM afex_offline_authority.offline_devices x
       WHERE x.tenant_id=p_tenant_id AND x.branch_id=p_branch_id AND x.status='active') THEN
    RAISE EXCEPTION 'AFEX_DEVICE_ACTIVATION_AUTHORITY_INVALID';
  END IF;
  UPDATE afex_offline_authority.offline_devices SET status='active',activated_at=transaction_timestamp(),
    updated_at=transaction_timestamp() WHERE device_id=p_device_id RETURNING * INTO d;
  INSERT INTO afex_offline_authority.offline_device_events(
    device_id,tenant_id,branch_id,event_type,operation_id,request_sha256,
    device_generation,revocation_generation,actor_authenticated_subject_id,
    reason_code,evidence_sha256
  ) VALUES(p_device_id,p_tenant_id,p_branch_id,'activated',p_operation_id,request_hash,
    d.device_generation,d.revocation_generation,p_primary_authenticated_subject_id,
    'trusted_online_activation',p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object('contractVersion','offline-device-authority.v1',
    'status','activated','deviceId',d.device_id,'deviceGeneration',d.device_generation,
    'revocationGeneration',d.revocation_generation,'authorityStatus',d.status);
END $fn$;

-- FWD-05A-005
CREATE FUNCTION afex_offline_authority.replace_offline_device_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_old_device_id uuid,p_new_device_id uuid,
  p_expected_old_generation bigint,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $fn$
DECLARE old_d afex_offline_authority.offline_devices%ROWTYPE;
  new_d afex_offline_authority.offline_devices%ROWTYPE; request_hash text; prior text;
BEGIN
  IF p_old_device_id=p_new_device_id OR p_expected_old_generation<=0
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_DEVICE_REPLACEMENT_SCHEMA_INVALID'; END IF;
  request_hash := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,'subjectId',p_primary_authenticated_subject_id,
      'tenantId',p_tenant_id,'branchId',p_branch_id,'oldDeviceId',p_old_device_id,
      'newDeviceId',p_new_device_id,'expectedGeneration',p_expected_old_generation,
      'evidence',p_evidence_sha256)::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior FROM afex_offline_authority.offline_device_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior<>request_hash THEN RAISE EXCEPTION 'AFEX_DEVICE_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT new_d FROM afex_offline_authority.offline_devices WHERE device_id=p_new_device_id;
    RETURN pg_catalog.jsonb_build_object('contractVersion','offline-device-authority.v1',
      'status','stable_replay','activeDeviceId',new_d.device_id,
      'deviceGeneration',new_d.device_generation,'authorityStatus',new_d.status);
  END IF;
  PERFORM 1 FROM public.branches WHERE id=p_branch_id AND tenant_id=p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AFEX_DEVICE_BRANCH_SCOPE_INVALID'; END IF;
  PERFORM 1 FROM afex_offline_authority.offline_devices
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id
    AND device_id IN (p_old_device_id,p_new_device_id) ORDER BY device_id FOR UPDATE;
  SELECT * INTO old_d FROM afex_offline_authority.offline_devices WHERE device_id=p_old_device_id
    AND tenant_id=p_tenant_id AND branch_id=p_branch_id;
  SELECT * INTO new_d FROM afex_offline_authority.offline_devices WHERE device_id=p_new_device_id
    AND tenant_id=p_tenant_id AND branch_id=p_branch_id;
  IF old_d.status<>'active' OR old_d.device_generation<>p_expected_old_generation
     OR new_d.status<>'pending' OR old_d.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id
     OR new_d.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id THEN
    RAISE EXCEPTION 'AFEX_DEVICE_REPLACEMENT_AUTHORITY_INVALID'; END IF;
  UPDATE afex_offline_authority.offline_devices SET status='replaced',
    device_generation=device_generation+1,key_envelope_generation=key_envelope_generation+1,
    revocation_generation=revocation_generation+1,revoked_at=transaction_timestamp(),
    replaced_by_device_id=p_new_device_id,updated_at=transaction_timestamp()
  WHERE device_id=p_old_device_id RETURNING * INTO old_d;
  UPDATE afex_offline_authority.offline_devices SET status='active',activated_at=transaction_timestamp(),
    updated_at=transaction_timestamp() WHERE device_id=p_new_device_id RETURNING * INTO new_d;
  INSERT INTO afex_offline_authority.offline_device_events(
    device_id,tenant_id,branch_id,event_type,operation_id,request_sha256,
    device_generation,revocation_generation,actor_authenticated_subject_id,reason_code,evidence_sha256
  ) VALUES(p_old_device_id,p_tenant_id,p_branch_id,'replaced',p_operation_id,request_hash,
    old_d.device_generation,old_d.revocation_generation,p_primary_authenticated_subject_id,
    'trusted_online_replacement',p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object('contractVersion','offline-device-authority.v1',
    'status','replaced','oldDeviceId',old_d.device_id,'oldDeviceGeneration',old_d.device_generation,
    'activeDeviceId',new_d.device_id,'deviceGeneration',new_d.device_generation);
END $fn$;

-- FWD-05A-006
CREATE FUNCTION afex_offline_authority.transition_offline_device_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_expected_device_generation bigint,p_transition text,p_reason_code text,
  p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $fn$
DECLARE d afex_offline_authority.offline_devices%ROWTYPE; request_hash text; prior text;
BEGIN
  IF p_transition NOT IN ('revoked','lost','local_locked')
     OR char_length(p_reason_code) NOT BETWEEN 1 AND 64
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_DEVICE_TRANSITION_SCHEMA_INVALID'; END IF;
  request_hash := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,'subjectId',p_primary_authenticated_subject_id,
      'tenantId',p_tenant_id,'branchId',p_branch_id,'deviceId',p_device_id,
      'expectedGeneration',p_expected_device_generation,'transition',p_transition,
      'reason',p_reason_code,'evidence',p_evidence_sha256)::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior FROM afex_offline_authority.offline_device_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior<>request_hash THEN RAISE EXCEPTION 'AFEX_DEVICE_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT d FROM afex_offline_authority.offline_devices WHERE device_id=p_device_id;
    RETURN pg_catalog.jsonb_build_object('contractVersion','offline-device-authority.v1',
      'status','stable_replay','deviceId',d.device_id,'deviceGeneration',d.device_generation,
      'revocationGeneration',d.revocation_generation,'authorityStatus',d.status);
  END IF;
  PERFORM 1 FROM public.branches WHERE id=p_branch_id AND tenant_id=p_tenant_id;
  SELECT * INTO d FROM afex_offline_authority.offline_devices WHERE device_id=p_device_id
    AND tenant_id=p_tenant_id AND branch_id=p_branch_id FOR UPDATE;
  IF NOT FOUND OR d.device_generation<>p_expected_device_generation
     OR d.status NOT IN ('active','local_locked') THEN
    RAISE EXCEPTION 'AFEX_DEVICE_TRANSITION_AUTHORITY_INVALID'; END IF;
  UPDATE afex_offline_authority.offline_devices SET status=p_transition,
    device_generation=device_generation+1,
    revocation_generation=revocation_generation + CASE WHEN p_transition IN ('revoked','lost') THEN 1 ELSE 0 END,
    local_lock_generation=local_lock_generation + CASE WHEN p_transition='local_locked' THEN 1 ELSE 0 END,
    local_locked_at=CASE WHEN p_transition='local_locked' THEN transaction_timestamp() ELSE local_locked_at END,
    revoked_at=CASE WHEN p_transition IN ('revoked','lost') THEN transaction_timestamp() ELSE NULL END,
    updated_at=transaction_timestamp()
  WHERE device_id=p_device_id RETURNING * INTO d;
  INSERT INTO afex_offline_authority.offline_device_events(
    device_id,tenant_id,branch_id,event_type,operation_id,request_sha256,
    device_generation,revocation_generation,actor_authenticated_subject_id,reason_code,evidence_sha256
  ) VALUES(p_device_id,p_tenant_id,p_branch_id,p_transition,p_operation_id,request_hash,
    d.device_generation,d.revocation_generation,p_primary_authenticated_subject_id,
    p_reason_code,p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object('contractVersion','offline-device-authority.v1',
    'status',p_transition,'deviceId',d.device_id,'deviceGeneration',d.device_generation,
    'keyGeneration',d.key_envelope_generation,'revocationGeneration',d.revocation_generation,
    'localLockGeneration',d.local_lock_generation,'authorityStatus',d.status);
END $fn$;

-- FWD-05A-007
CREATE FUNCTION afex_offline_authority.read_current_offline_device_authority_v1(
  p_primary_authenticated_subject_id uuid,p_tenant_id uuid,p_branch_id uuid,p_device_id uuid
)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = pg_catalog AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'contractVersion','offline-device-authority.v1','deviceId',d.device_id,
    'primaryAuthenticatedSubjectId',d.registered_by_authenticated_subject_id,
    'tenantId',d.tenant_id,'branchId',d.branch_id,'deviceGeneration',d.device_generation,
    'keyGeneration',d.key_envelope_generation,'revocationGeneration',d.revocation_generation,
    'localLockGeneration',d.local_lock_generation,'mode',d.mode,'status',d.status,
    'proofKeySha256',d.device_proof_key_sha256,'wrapKeySha256',d.device_wrap_key_sha256)
  FROM afex_offline_authority.offline_devices AS d
  WHERE d.device_id=p_device_id AND d.tenant_id=p_tenant_id AND d.branch_id=p_branch_id
    AND d.registered_by_authenticated_subject_id=p_primary_authenticated_subject_id
$fn$;

-- FWD-05A-008
REVOKE ALL ON FUNCTION
  afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text),
  afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text),
  afex_offline_authority.read_current_offline_device_authority_v1(uuid,uuid,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime;
-- FWD-05A-009
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text),
  afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text),
  afex_offline_authority.read_current_offline_device_authority_v1(uuid,uuid,uuid,uuid)
TO afex_offline_provisioning_runtime;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR pg_catalog.to_regprocedure('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.read_current_offline_device_authority_v1(uuid,uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'AFEX_DEVICE_PROVISIONING_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_2A1_OWNER_CONTEXT_RESTORED';
END $afex$;

COMMIT;
