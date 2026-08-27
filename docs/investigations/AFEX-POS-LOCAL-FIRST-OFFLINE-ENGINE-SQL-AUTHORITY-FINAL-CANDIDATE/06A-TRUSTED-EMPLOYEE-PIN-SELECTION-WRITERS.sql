/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 2B.1: trusted employee enrollment and PIN-selection authority writers,
created directly by afex_offline_authority_owner.
Dependencies: whole files 01A, 04C, 05, 05A, 06 and 07. One transaction; no subset execution.

The PIN verifier selects a pre-enrolled employee under an already bootstrapped
establishment account. It is never an Auth credential, device authority, DEK,
DEK wrapping key, tenant/branch authority or synchronization credential.
Emergency disablement: revoke the exact EXECUTE grants below; retain all
authority and audit rows for same-account recovery.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.to_regrole('afex_offline_provisioning_runtime') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_employee_authorities') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_key_envelopes') IS NULL
     OR pg_catalog.to_regclass('public.pos_profiles') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_offline_authority_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_PROVISIONING_PRECONDITION_FAILED';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_2B1_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_2B1_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-06A-001: at most one active enrollment for an employee on a device.
CREATE UNIQUE INDEX offline_employee_authorities_one_active_employee_uk
  ON afex_offline_authority.offline_employee_authorities
    (tenant_id, branch_id, device_id, actual_pos_employee_id)
  WHERE status = 'active';

-- FWD-06A-002: bounded support policy is installed by whole-file Wave 04C.

-- FWD-06A-003
CREATE FUNCTION afex_offline_authority.enroll_offline_employee_v1(
  p_operation_id uuid,
  p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_device_id uuid,
  p_actual_pos_employee_id uuid,
  p_key_envelope_id uuid,
  p_key_envelope_version bigint,
  p_namespace_generation bigint,
  p_pin_verifier_salt bytea,
  p_pin_verifier_bytes bytea,
  p_package_sha256 text,
  p_evidence_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  d afex_offline_authority.offline_devices%ROWTYPE;
  e afex_offline_authority.offline_employee_authorities%ROWTYPE;
  request_hash text;
  prior_hash text;
BEGIN
  IF pg_catalog.octet_length(p_pin_verifier_salt) <> 32
     OR pg_catalog.octet_length(p_pin_verifier_bytes) <> 32
     OR p_key_envelope_version <= 0 OR p_namespace_generation <= 0
     OR p_package_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_ENROLL_SCHEMA_INVALID';
  END IF;
  request_hash := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operationId',p_operation_id,'subjectId',p_primary_authenticated_subject_id,
      'tenantId',p_tenant_id,'branchId',p_branch_id,'deviceId',p_device_id,
      'employeeId',p_actual_pos_employee_id,'keyEnvelopeId',p_key_envelope_id,
      'keyEnvelopeVersion',p_key_envelope_version,
      'namespaceGeneration',p_namespace_generation,
      'saltSha256',pg_catalog.encode(public.digest(p_pin_verifier_salt,'sha256'),'hex'),
      'verifierSha256',pg_catalog.encode(public.digest(p_pin_verifier_bytes,'sha256'),'hex'),
      'packageSha256',p_package_sha256,'evidenceSha256',p_evidence_sha256
    )::text,'UTF8'),'sha256'),'hex');
  SELECT x.request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_employee_authority_events AS x
  WHERE x.tenant_id=p_tenant_id AND x.branch_id=p_branch_id
    AND x.device_id=p_device_id AND x.operation_id=p_operation_id
  FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash <> request_hash THEN RAISE EXCEPTION 'AFEX_EMPLOYEE_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT e
    FROM afex_offline_authority.offline_employee_authorities AS a
    WHERE a.tenant_id=p_tenant_id AND a.branch_id=p_branch_id
      AND a.device_id=p_device_id AND a.actual_pos_employee_id=p_actual_pos_employee_id
      AND a.status='active';
    RETURN pg_catalog.jsonb_build_object(
      'contractVersion','offline-employee-selection.v1','status','stable_replay',
      'enrollmentId',e.enrollment_id,'actualPosEmployeeId',e.actual_pos_employee_id,
      'employeeEnrollmentGeneration',e.employee_enrollment_generation,
      'credentialGeneration',e.credential_generation,
      'permissionGeneration',e.permission_generation,
      'commandGeneration',e.command_generation);
  END IF;
  SELECT * INTO d FROM afex_offline_authority.offline_devices AS x
  WHERE x.device_id=p_device_id AND x.tenant_id=p_tenant_id
    AND x.branch_id=p_branch_id FOR UPDATE;
  IF NOT FOUND OR d.status<>'active' OR d.revoked_at IS NOT NULL
     OR d.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_DEVICE_AUTHORITY_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pos_profiles AS p
    WHERE p.id=p_actual_pos_employee_id AND p.tenant_id=p_tenant_id
      AND p.branch_id=p_branch_id AND p.is_active=true
      AND p.role IN ('admin','manager','employee','cashier')
  ) THEN RAISE EXCEPTION 'AFEX_EMPLOYEE_SCOPE_OR_STATUS_INVALID'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM afex_offline_authority.offline_key_envelopes AS k
    WHERE k.key_envelope_id=p_key_envelope_id
      AND k.key_envelope_version=p_key_envelope_version
      AND k.primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND k.tenant_id=p_tenant_id AND k.branch_id=p_branch_id
      AND k.device_id=p_device_id AND k.device_generation=d.device_generation
      AND k.namespace_generation=p_namespace_generation
      AND k.status='active' AND k.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'AFEX_EMPLOYEE_DEVICE_ENVELOPE_INVALID'; END IF;
  IF (SELECT pg_catalog.count(*)
      FROM afex_offline_authority.offline_employee_authorities AS x
      WHERE x.tenant_id=p_tenant_id AND x.branch_id=p_branch_id
        AND x.device_id=p_device_id AND x.status='active') >= 25 THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_ACTIVE_ROSTER_LIMIT_25';
  END IF;
  IF EXISTS (
    SELECT 1 FROM afex_offline_authority.offline_employee_authorities AS x
    WHERE x.tenant_id=p_tenant_id AND x.branch_id=p_branch_id
      AND x.device_id=p_device_id AND x.actual_pos_employee_id=p_actual_pos_employee_id
      AND x.status='active'
  ) THEN RAISE EXCEPTION 'AFEX_EMPLOYEE_ALREADY_ACTIVE'; END IF;
  INSERT INTO afex_offline_authority.offline_employee_authorities(
    enrollment_id,device_id,device_generation,tenant_id,branch_id,
    primary_authenticated_subject_id,actual_pos_employee_id,
    employee_enrollment_generation,credential_generation,permission_generation,
    revocation_generation,command_generation,key_envelope_id,key_envelope_version,
    namespace_generation,status,allowed_command_types,allowed_dataset_ids,
    pin_verifier_algorithm,pin_verifier_iterations,pin_verifier_salt,
    pin_verifier_bytes,pin_verifier_version,package_sha256
  ) VALUES (
    pg_catalog.gen_random_uuid(),p_device_id,d.device_generation,p_tenant_id,p_branch_id,
    p_primary_authenticated_subject_id,p_actual_pos_employee_id,
    1,1,1,0,1,p_key_envelope_id,p_key_envelope_version,
    p_namespace_generation,'active',ARRAY['order.create']::text[],ARRAY[]::text[],
    'PBKDF2-HMAC-SHA256',600000,p_pin_verifier_salt,
    p_pin_verifier_bytes,1,p_package_sha256
  ) RETURNING * INTO e;
  INSERT INTO afex_offline_authority.offline_employee_authority_events(
    enrollment_id,device_id,device_generation,tenant_id,branch_id,
    actual_pos_employee_id,event_type,operation_id,request_sha256,
    employee_enrollment_generation,command_generation,
    actor_authenticated_subject_id,reason_code,evidence_sha256
  ) VALUES (e.enrollment_id,e.device_id,e.device_generation,e.tenant_id,e.branch_id,
    e.actual_pos_employee_id,'enrolled',p_operation_id,request_hash,
    e.employee_enrollment_generation,e.command_generation,
    p_primary_authenticated_subject_id,'trusted_online_enrollment',p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-employee-selection.v1','status','enrolled',
    'enrollmentId',e.enrollment_id,'actualPosEmployeeId',e.actual_pos_employee_id,
    'employeeEnrollmentGeneration',e.employee_enrollment_generation,
    'credentialGeneration',e.credential_generation,
    'permissionGeneration',e.permission_generation,
    'commandGeneration',e.command_generation,
    'allowedCommandTypes',e.allowed_command_types);
END $fn$;

-- FWD-06A-004
CREATE FUNCTION afex_offline_authority.replace_offline_employee_pin_verifier_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_actual_pos_employee_id uuid,p_expected_enrollment_generation bigint,
  p_pin_verifier_salt bytea,p_pin_verifier_bytes bytea,
  p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE old_e afex_offline_authority.offline_employee_authorities%ROWTYPE;
  new_e afex_offline_authority.offline_employee_authorities%ROWTYPE;
  request_hash text; prior_hash text;
BEGIN
  IF p_expected_enrollment_generation<=0
     OR pg_catalog.octet_length(p_pin_verifier_salt)<>32
     OR pg_catalog.octet_length(p_pin_verifier_bytes)<>32
     OR p_package_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_PIN_REPLACEMENT_SCHEMA_INVALID'; END IF;
  request_hash:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,
      'subjectId',p_primary_authenticated_subject_id,'tenantId',p_tenant_id,
      'branchId',p_branch_id,'deviceId',p_device_id,'employeeId',p_actual_pos_employee_id,
      'expectedEnrollmentGeneration',p_expected_enrollment_generation,
      'saltSha256',pg_catalog.encode(public.digest(p_pin_verifier_salt,'sha256'),'hex'),
      'verifierSha256',pg_catalog.encode(public.digest(p_pin_verifier_bytes,'sha256'),'hex'),
      'packageSha256',p_package_sha256,'evidenceSha256',p_evidence_sha256)::text,
    'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_employee_authority_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN RAISE EXCEPTION 'AFEX_EMPLOYEE_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT new_e FROM afex_offline_authority.offline_employee_authorities
    WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
      AND actual_pos_employee_id=p_actual_pos_employee_id AND status='active';
    RETURN pg_catalog.jsonb_build_object('contractVersion','offline-employee-selection.v1',
      'status','stable_replay','enrollmentId',new_e.enrollment_id,
      'credentialGeneration',new_e.credential_generation,
      'commandGeneration',new_e.command_generation);
  END IF;
  SELECT * INTO old_e FROM afex_offline_authority.offline_employee_authorities
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND actual_pos_employee_id=p_actual_pos_employee_id AND status='active' FOR UPDATE;
  IF NOT FOUND OR old_e.primary_authenticated_subject_id<>p_primary_authenticated_subject_id
     OR old_e.employee_enrollment_generation<>p_expected_enrollment_generation THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_PIN_REPLACEMENT_AUTHORITY_INVALID'; END IF;
  new_e:=old_e;
  new_e.enrollment_id:=pg_catalog.gen_random_uuid();
  new_e.employee_enrollment_generation:=old_e.employee_enrollment_generation+1;
  new_e.credential_generation:=old_e.credential_generation+1;
  new_e.command_generation:=old_e.command_generation+1;
  new_e.pin_verifier_salt:=p_pin_verifier_salt;
  new_e.pin_verifier_bytes:=p_pin_verifier_bytes;
  new_e.failed_attempt_count:=0;
  new_e.local_lock_generation:=old_e.local_lock_generation+1;
  new_e.local_lock_state:='unlocked'; new_e.local_locked_at:=NULL;
  new_e.package_sha256:=p_package_sha256; new_e.enrolled_at:=transaction_timestamp();
  new_e.revoked_at:=NULL; new_e.replaced_by_enrollment_id:=NULL;
  UPDATE afex_offline_authority.offline_employee_authorities
  SET status='replaced',revoked_at=transaction_timestamp(),
      replaced_by_enrollment_id=new_e.enrollment_id
  WHERE enrollment_id=old_e.enrollment_id;
  INSERT INTO afex_offline_authority.offline_employee_authorities SELECT new_e.*;
  INSERT INTO afex_offline_authority.offline_employee_authority_events(
    enrollment_id,device_id,device_generation,tenant_id,branch_id,actual_pos_employee_id,
    event_type,operation_id,request_sha256,employee_enrollment_generation,
    command_generation,actor_authenticated_subject_id,reason_code,evidence_sha256
  ) VALUES(new_e.enrollment_id,new_e.device_id,new_e.device_generation,new_e.tenant_id,
    new_e.branch_id,new_e.actual_pos_employee_id,'credential_changed',p_operation_id,
    request_hash,new_e.employee_enrollment_generation,new_e.command_generation,
    p_primary_authenticated_subject_id,'trusted_online_pin_replacement',p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object('contractVersion','offline-employee-selection.v1',
    'status','credential_replaced','enrollmentId',new_e.enrollment_id,
    'employeeEnrollmentGeneration',new_e.employee_enrollment_generation,
    'credentialGeneration',new_e.credential_generation,
    'commandGeneration',new_e.command_generation);
END $fn$;

-- FWD-06A-005: exact Pilot permission replacement; no broader array is accepted.
CREATE FUNCTION afex_offline_authority.replace_offline_employee_permissions_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_actual_pos_employee_id uuid,p_expected_enrollment_generation bigint,
  p_allowed_command_types text[],p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE old_e afex_offline_authority.offline_employee_authorities%ROWTYPE;
  new_e afex_offline_authority.offline_employee_authorities%ROWTYPE;
  request_hash text; prior_hash text;
BEGIN
  IF p_allowed_command_types IS DISTINCT FROM ARRAY['order.create']::text[]
     OR p_expected_enrollment_generation<=0
     OR p_package_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_PERMISSION_ALLOWLIST_INVALID'; END IF;
  request_hash:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,
      'subjectId',p_primary_authenticated_subject_id,'tenantId',p_tenant_id,
      'branchId',p_branch_id,'deviceId',p_device_id,'employeeId',p_actual_pos_employee_id,
      'expectedEnrollmentGeneration',p_expected_enrollment_generation,
      'allowedCommandTypes',p_allowed_command_types,'packageSha256',p_package_sha256,
      'evidenceSha256',p_evidence_sha256)::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_employee_authority_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN RAISE EXCEPTION 'AFEX_EMPLOYEE_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT new_e FROM afex_offline_authority.offline_employee_authorities
    WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
      AND actual_pos_employee_id=p_actual_pos_employee_id AND status='active';
    RETURN pg_catalog.jsonb_build_object('contractVersion','offline-employee-selection.v1',
      'status','stable_replay','enrollmentId',new_e.enrollment_id,
      'permissionGeneration',new_e.permission_generation,
      'commandGeneration',new_e.command_generation);
  END IF;
  SELECT * INTO old_e FROM afex_offline_authority.offline_employee_authorities
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND actual_pos_employee_id=p_actual_pos_employee_id AND status='active' FOR UPDATE;
  IF NOT FOUND OR old_e.primary_authenticated_subject_id<>p_primary_authenticated_subject_id
     OR old_e.employee_enrollment_generation<>p_expected_enrollment_generation THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_PERMISSION_AUTHORITY_INVALID'; END IF;
  new_e:=old_e; new_e.enrollment_id:=pg_catalog.gen_random_uuid();
  new_e.employee_enrollment_generation:=old_e.employee_enrollment_generation+1;
  new_e.permission_generation:=old_e.permission_generation+1;
  new_e.command_generation:=old_e.command_generation+1;
  new_e.allowed_command_types:=ARRAY['order.create']::text[];
  new_e.package_sha256:=p_package_sha256; new_e.enrolled_at:=transaction_timestamp();
  new_e.revoked_at:=NULL; new_e.replaced_by_enrollment_id:=NULL;
  UPDATE afex_offline_authority.offline_employee_authorities
  SET status='replaced',revoked_at=transaction_timestamp(),
      replaced_by_enrollment_id=new_e.enrollment_id
  WHERE enrollment_id=old_e.enrollment_id;
  INSERT INTO afex_offline_authority.offline_employee_authorities SELECT new_e.*;
  INSERT INTO afex_offline_authority.offline_employee_authority_events(
    enrollment_id,device_id,device_generation,tenant_id,branch_id,actual_pos_employee_id,
    event_type,operation_id,request_sha256,employee_enrollment_generation,
    command_generation,actor_authenticated_subject_id,reason_code,evidence_sha256
  ) VALUES(new_e.enrollment_id,new_e.device_id,new_e.device_generation,new_e.tenant_id,
    new_e.branch_id,new_e.actual_pos_employee_id,'permission_changed',p_operation_id,
    request_hash,new_e.employee_enrollment_generation,new_e.command_generation,
    p_primary_authenticated_subject_id,'trusted_online_permission_replacement',p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object('contractVersion','offline-employee-selection.v1',
    'status','permissions_replaced','enrollmentId',new_e.enrollment_id,
    'permissionGeneration',new_e.permission_generation,
    'commandGeneration',new_e.command_generation,
    'allowedCommandTypes',new_e.allowed_command_types);
END $fn$;

-- FWD-06A-006
CREATE FUNCTION afex_offline_authority.transition_offline_employee_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_actual_pos_employee_id uuid,p_expected_enrollment_generation bigint,
  p_transition text,p_reason_code text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE e afex_offline_authority.offline_employee_authorities%ROWTYPE;
  request_hash text; prior_hash text;
BEGIN
  IF p_transition NOT IN ('local_locked','revoked','removed')
     OR char_length(p_reason_code) NOT BETWEEN 1 AND 64
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_TRANSITION_SCHEMA_INVALID'; END IF;
  request_hash:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,
      'subjectId',p_primary_authenticated_subject_id,'tenantId',p_tenant_id,
      'branchId',p_branch_id,'deviceId',p_device_id,'employeeId',p_actual_pos_employee_id,
      'expectedEnrollmentGeneration',p_expected_enrollment_generation,
      'transition',p_transition,'reasonCode',p_reason_code,
      'evidenceSha256',p_evidence_sha256)::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_employee_authority_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN RAISE EXCEPTION 'AFEX_EMPLOYEE_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT e FROM afex_offline_authority.offline_employee_authorities
    WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
      AND actual_pos_employee_id=p_actual_pos_employee_id
    ORDER BY employee_enrollment_generation DESC LIMIT 1;
    RETURN pg_catalog.jsonb_build_object('contractVersion','offline-employee-selection.v1',
      'status','stable_replay','enrollmentId',e.enrollment_id,
      'authorityStatus',e.status,'localLockState',e.local_lock_state,
      'localLockGeneration',e.local_lock_generation);
  END IF;
  SELECT * INTO e FROM afex_offline_authority.offline_employee_authorities
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND actual_pos_employee_id=p_actual_pos_employee_id AND status='active' FOR UPDATE;
  IF NOT FOUND OR e.primary_authenticated_subject_id<>p_primary_authenticated_subject_id
     OR e.employee_enrollment_generation<>p_expected_enrollment_generation THEN
    RAISE EXCEPTION 'AFEX_EMPLOYEE_TRANSITION_AUTHORITY_INVALID'; END IF;
  IF p_transition='local_locked' THEN
    UPDATE afex_offline_authority.offline_employee_authorities
    SET failed_attempt_count=5,local_lock_state='employee_locked',
        local_lock_generation=local_lock_generation+1,
        local_locked_at=transaction_timestamp()
    WHERE enrollment_id=e.enrollment_id RETURNING * INTO e;
  ELSE
    UPDATE afex_offline_authority.offline_employee_authorities
    SET status=p_transition,revocation_generation=revocation_generation+1,
        revoked_at=transaction_timestamp()
    WHERE enrollment_id=e.enrollment_id RETURNING * INTO e;
  END IF;
  INSERT INTO afex_offline_authority.offline_employee_authority_events(
    enrollment_id,device_id,device_generation,tenant_id,branch_id,actual_pos_employee_id,
    event_type,operation_id,request_sha256,employee_enrollment_generation,
    command_generation,actor_authenticated_subject_id,reason_code,evidence_sha256
  ) VALUES(e.enrollment_id,e.device_id,e.device_generation,e.tenant_id,e.branch_id,
    e.actual_pos_employee_id,p_transition,p_operation_id,request_hash,
    e.employee_enrollment_generation,e.command_generation,
    p_primary_authenticated_subject_id,p_reason_code,p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object('contractVersion','offline-employee-selection.v1',
    'status',p_transition,'enrollmentId',e.enrollment_id,
    'authorityStatus',e.status,'localLockState',e.local_lock_state,
    'localLockGeneration',e.local_lock_generation,
    'revocationGeneration',e.revocation_generation,
    'commandGeneration',e.command_generation);
END $fn$;

-- FWD-06A-007: returns a verifier package for local employee selection only.
CREATE FUNCTION afex_offline_authority.read_current_offline_employee_authority_v1(
  p_primary_authenticated_subject_id uuid,p_tenant_id uuid,p_branch_id uuid,
  p_device_id uuid,p_actual_pos_employee_id uuid
)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'contractVersion','offline-employee-selection.v1',
    'classification','EMPLOYEE_SELECTION_ONLY_NOT_ACCOUNT_AUTH_NOT_DEK',
    'primaryAuthenticatedSubjectId',e.primary_authenticated_subject_id,
    'tenantId',e.tenant_id,'branchId',e.branch_id,'deviceId',e.device_id,
    'deviceGeneration',e.device_generation,
    'actualPosEmployeeId',e.actual_pos_employee_id,'enrollmentId',e.enrollment_id,
    'employeeEnrollmentGeneration',e.employee_enrollment_generation,
    'credentialGeneration',e.credential_generation,
    'permissionGeneration',e.permission_generation,
    'revocationGeneration',e.revocation_generation,
    'commandGeneration',e.command_generation,
    'namespaceGeneration',e.namespace_generation,
    'status',e.status,'localLockState',e.local_lock_state,
    'localLockGeneration',e.local_lock_generation,
    'failedAttemptCount',e.failed_attempt_count,
    'allowedCommandTypes',e.allowed_command_types,
    'pinVerifier',pg_catalog.jsonb_build_object(
      'algorithm',e.pin_verifier_algorithm,'iterations',e.pin_verifier_iterations,
      'saltHex',pg_catalog.encode(e.pin_verifier_salt,'hex'),
      'verifierHex',pg_catalog.encode(e.pin_verifier_bytes,'hex'),
      'derivedVerifierLengthBytes',32,'saltLengthBytes',32,
      'memory','NOT_APPLICABLE_TO_PBKDF2',
      'parallelism','NOT_APPLICABLE_TO_PBKDF2',
      'version',e.pin_verifier_version),
    'packageSha256',e.package_sha256)
  FROM afex_offline_authority.offline_employee_authorities AS e
  WHERE e.primary_authenticated_subject_id=p_primary_authenticated_subject_id
    AND e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id
    AND e.device_id=p_device_id AND e.actual_pos_employee_id=p_actual_pos_employee_id
    AND e.status='active'
$fn$;

-- FWD-06A-008
REVOKE ALL ON FUNCTION
  afex_offline_authority.enroll_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text),
  afex_offline_authority.replace_offline_employee_pin_verifier_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bytea,bytea,text,text),
  afex_offline_authority.replace_offline_employee_permissions_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text[],text,text),
  afex_offline_authority.transition_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,text),
  afex_offline_authority.read_current_offline_employee_authority_v1(uuid,uuid,uuid,uuid,uuid)
FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.enroll_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text),
  afex_offline_authority.replace_offline_employee_pin_verifier_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bytea,bytea,text,text),
  afex_offline_authority.replace_offline_employee_permissions_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text[],text,text),
  afex_offline_authority.transition_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,text),
  afex_offline_authority.read_current_offline_employee_authority_v1(uuid,uuid,uuid,uuid,uuid)
TO afex_offline_provisioning_runtime;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.enroll_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text)'
     ) IS NULL OR pg_catalog.to_regprocedure(
       'afex_offline_authority.read_current_offline_employee_authority_v1(uuid,uuid,uuid,uuid,uuid)'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_2B1_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_2B1_OWNER_CONTEXT_RESTORED';
END $afex$;
COMMIT;
