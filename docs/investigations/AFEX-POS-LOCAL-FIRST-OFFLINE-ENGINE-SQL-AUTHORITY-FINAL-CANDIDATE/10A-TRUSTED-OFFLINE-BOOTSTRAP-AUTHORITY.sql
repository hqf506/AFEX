/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 3C: verified-Online establishment-account Offline bootstrap authority,
created directly by afex_offline_authority_owner.
Dependencies: whole files 01A-01C, 04A-04C, 05, 05A, 06, 06A, 07, 09, 09A and 13.
One transaction; no subset execution.

This wave cannot authenticate an account. It consumes an already verified Auth
session and active POS actor session, binds one managed device, publishes the
pre-enrolled employee selector roster and one trusted inventory snapshot, and
returns no DEK, private key, provider credential or business write result.
Emergency disablement: revoke the exact provisioning EXECUTE grants in Wave 15;
retain bootstrap, roster, event, and pending-command evidence for recovery.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.to_regrole('afex_offline_provisioning_runtime') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure(
          'afex_offline_authority.reject_immutable_offline_evidence_v1()'
        ) IS NULL
     OR pg_catalog.to_regclass('afex_pos_authority.actor_sessions') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.branch_inventory_snapshot_headers') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_offline_authority_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_PRECONDITION_FAILED';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_3C_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_3C_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-10A-001
CREATE TABLE afex_offline_authority.offline_account_bootstrap_authorities (
  bootstrap_id uuid PRIMARY KEY,
  primary_authenticated_subject_id uuid NOT NULL,
  authenticated_session_id uuid NOT NULL,
  pos_actor_session_id uuid NOT NULL,
  actual_pos_employee_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  device_id uuid NOT NULL,
  device_generation bigint NOT NULL,
  key_envelope_id uuid NOT NULL,
  key_envelope_version bigint NOT NULL,
  namespace_generation bigint NOT NULL,
  inventory_snapshot_id uuid NOT NULL,
  inventory_frontier_version text NOT NULL,
  bootstrap_generation bigint NOT NULL,
  logout_generation bigint NOT NULL DEFAULT 0,
  status text NOT NULL,
  package_sha256 text NOT NULL,
  online_verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  explicitly_logged_out_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT offline_bootstrap_subject_fk FOREIGN KEY (primary_authenticated_subject_id)
    REFERENCES public.profiles(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_bootstrap_device_scope_fk
    FOREIGN KEY (device_id)
    REFERENCES afex_offline_authority.offline_devices (device_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_bootstrap_envelope_scope_fk
    FOREIGN KEY (key_envelope_id,key_envelope_version,primary_authenticated_subject_id,
                 tenant_id,branch_id,device_id,device_generation,namespace_generation)
    REFERENCES afex_offline_authority.offline_key_envelopes
      (key_envelope_id,key_envelope_version,primary_authenticated_subject_id,
       tenant_id,branch_id,device_id,device_generation,namespace_generation)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_bootstrap_snapshot_scope_fk
    FOREIGN KEY (inventory_snapshot_id,tenant_id,branch_id)
    REFERENCES afex_offline_authority.branch_inventory_snapshot_headers
      (snapshot_id,tenant_id,branch_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_bootstrap_generations CHECK (
    device_generation>0 AND key_envelope_version>0 AND namespace_generation>0
    AND bootstrap_generation>0 AND logout_generation>=0),
  CONSTRAINT offline_bootstrap_status CHECK (status IN ('active','logged_out','revoked')),
  CONSTRAINT offline_bootstrap_logout_state CHECK (
    (status='active' AND explicitly_logged_out_at IS NULL AND revoked_at IS NULL)
    OR (status='logged_out' AND explicitly_logged_out_at IS NOT NULL AND revoked_at IS NULL)
    OR (status='revoked' AND revoked_at IS NOT NULL)),
  CONSTRAINT offline_bootstrap_hash CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (bootstrap_id,primary_authenticated_subject_id,tenant_id,branch_id,device_id),
  UNIQUE (primary_authenticated_subject_id,tenant_id,branch_id,device_id)
);
-- Created directly while CURRENT_USER is afex_offline_authority_owner.

-- FWD-10A-002
CREATE TABLE afex_offline_authority.offline_bootstrap_employee_roster (
  bootstrap_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  actual_pos_employee_id uuid NOT NULL,
  employee_enrollment_generation bigint NOT NULL,
  credential_generation bigint NOT NULL,
  permission_generation bigint NOT NULL,
  revocation_generation bigint NOT NULL,
  command_generation bigint NOT NULL,
  package_sha256 text NOT NULL,
  PRIMARY KEY (bootstrap_id,actual_pos_employee_id),
  CONSTRAINT offline_bootstrap_roster_bootstrap_fk FOREIGN KEY (bootstrap_id)
    REFERENCES afex_offline_authority.offline_account_bootstrap_authorities(bootstrap_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_bootstrap_roster_enrollment_fk FOREIGN KEY (enrollment_id)
    REFERENCES afex_offline_authority.offline_employee_authorities(enrollment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_bootstrap_roster_generations CHECK (
    employee_enrollment_generation>0 AND credential_generation>0
    AND permission_generation>0 AND revocation_generation>=0 AND command_generation>0),
  CONSTRAINT offline_bootstrap_roster_hash CHECK (package_sha256 ~ '^[0-9a-f]{64}$')
);
-- Created directly while CURRENT_USER is afex_offline_authority_owner.

-- FWD-10A-003
CREATE TABLE afex_offline_authority.offline_account_bootstrap_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bootstrap_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_sha256 text NOT NULL,
  event_type text NOT NULL,
  primary_authenticated_subject_id uuid NOT NULL,
  authenticated_session_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  device_id uuid NOT NULL,
  bootstrap_generation bigint NOT NULL,
  logout_generation bigint NOT NULL,
  evidence_sha256 text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT offline_bootstrap_events_bootstrap_fk FOREIGN KEY (bootstrap_id)
    REFERENCES afex_offline_authority.offline_account_bootstrap_authorities(bootstrap_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_bootstrap_events_type CHECK (
    event_type IN ('online_bootstrap','same_account_online_recovery','explicit_logout','revoked')),
  CONSTRAINT offline_bootstrap_events_generations CHECK (
    bootstrap_generation>0 AND logout_generation>=0),
  CONSTRAINT offline_bootstrap_events_hashes CHECK (
    request_sha256 ~ '^[0-9a-f]{64}$' AND evidence_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (tenant_id,branch_id,device_id,operation_id)
);
-- Created directly while CURRENT_USER is afex_offline_authority_owner.

-- FWD-10A-004
ALTER TABLE afex_offline_authority.offline_account_bootstrap_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE afex_offline_authority.offline_account_bootstrap_authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE afex_offline_authority.offline_bootstrap_employee_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE afex_offline_authority.offline_bootstrap_employee_roster FORCE ROW LEVEL SECURITY;
ALTER TABLE afex_offline_authority.offline_account_bootstrap_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE afex_offline_authority.offline_account_bootstrap_events FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_bootstrap_owner_all
  ON afex_offline_authority.offline_account_bootstrap_authorities
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
CREATE POLICY offline_bootstrap_function_owner_select
  ON afex_offline_authority.offline_account_bootstrap_authorities
  FOR SELECT TO afex_function_owner USING (true);
CREATE POLICY offline_bootstrap_roster_owner_all
  ON afex_offline_authority.offline_bootstrap_employee_roster
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
CREATE POLICY offline_bootstrap_events_owner_all
  ON afex_offline_authority.offline_account_bootstrap_events
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
CREATE TRIGGER offline_account_bootstrap_events_immutable_guard
  BEFORE UPDATE OR DELETE
  ON afex_offline_authority.offline_account_bootstrap_events
  FOR EACH ROW EXECUTE FUNCTION
    afex_offline_authority.reject_immutable_offline_evidence_v1();

-- FWD-10A-005
CREATE FUNCTION afex_offline_authority.publish_offline_account_bootstrap_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_pos_actor_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_key_envelope_id uuid,p_key_envelope_version bigint,
  p_namespace_generation bigint,p_inventory_snapshot_id uuid,
  p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
  actor_row record;
  device_row afex_offline_authority.offline_devices%ROWTYPE;
  bootstrap_row afex_offline_authority.offline_account_bootstrap_authorities%ROWTYPE;
  snapshot_row afex_offline_authority.branch_inventory_snapshot_headers%ROWTYPE;
  request_hash text; prior_hash text; roster jsonb; roster_count integer;
  event_kind text:='online_bootstrap';
BEGIN
  IF p_key_envelope_version<=0 OR p_namespace_generation<=0
     OR p_package_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_SCHEMA_INVALID'; END IF;
  IF NOT afex_offline_authority.afex_current_auth_session_matches_v1(
       p_primary_authenticated_subject_id,p_authenticated_session_id
     ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_ONLINE_AUTH_REQUIRED'; END IF;
  SELECT s.session_id,s.authenticated_subject_id,s.tenant_id,s.branch_id,s.actor_id,
         s.authenticated_session_id,s.expires_at,s.revoked_at
  INTO actor_row FROM afex_pos_authority.actor_sessions AS s
  WHERE s.session_id=p_pos_actor_session_id
    AND s.authenticated_subject_id=p_primary_authenticated_subject_id
    AND s.authenticated_session_id=p_authenticated_session_id
    AND s.tenant_id=p_tenant_id AND s.branch_id=p_branch_id;
  IF NOT FOUND OR actor_row.revoked_at IS NOT NULL
     OR actor_row.expires_at<=statement_timestamp() THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_POS_ACTOR_SESSION_INVALID'; END IF;
  SELECT * INTO device_row FROM afex_offline_authority.offline_devices AS d
  WHERE d.device_id=p_device_id AND d.tenant_id=p_tenant_id
    AND d.branch_id=p_branch_id FOR UPDATE;
  IF NOT FOUND OR device_row.status<>'active' OR device_row.revoked_at IS NOT NULL
     OR device_row.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_DEVICE_INVALID'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM afex_offline_authority.offline_key_envelopes AS k
    WHERE k.key_envelope_id=p_key_envelope_id
      AND k.key_envelope_version=p_key_envelope_version
      AND k.primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND k.tenant_id=p_tenant_id AND k.branch_id=p_branch_id
      AND k.device_id=p_device_id AND k.device_generation=device_row.device_generation
      AND k.namespace_generation=p_namespace_generation
      AND k.status='active' AND k.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_ENVELOPE_INVALID'; END IF;
  SELECT * INTO snapshot_row
  FROM afex_offline_authority.branch_inventory_snapshot_headers AS h
  WHERE h.snapshot_id=p_inventory_snapshot_id AND h.tenant_id=p_tenant_id
    AND h.branch_id=p_branch_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_SNAPSHOT_INVALID'; END IF;
  SELECT pg_catalog.count(*),pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'actualPosEmployeeId',e.actual_pos_employee_id,'enrollmentId',e.enrollment_id,
      'employeeEnrollmentGeneration',e.employee_enrollment_generation,
      'credentialGeneration',e.credential_generation,
      'permissionGeneration',e.permission_generation,
      'revocationGeneration',e.revocation_generation,
      'commandGeneration',e.command_generation,'allowedCommandTypes',e.allowed_command_types,
      'pinVerifier',pg_catalog.jsonb_build_object(
        'algorithm',e.pin_verifier_algorithm,'iterations',e.pin_verifier_iterations,
        'saltHex',pg_catalog.encode(e.pin_verifier_salt,'hex'),
        'verifierHex',pg_catalog.encode(e.pin_verifier_bytes,'hex'),
        'saltLengthBytes',32,'derivedVerifierLengthBytes',32,
        'memory','NOT_APPLICABLE_TO_PBKDF2','parallelism','NOT_APPLICABLE_TO_PBKDF2',
        'version',e.pin_verifier_version),
      'localLockGeneration',e.local_lock_generation,'packageSha256',e.package_sha256
    ) ORDER BY e.actual_pos_employee_id)
  INTO roster_count,roster
  FROM afex_offline_authority.offline_employee_authorities AS e
  WHERE e.primary_authenticated_subject_id=p_primary_authenticated_subject_id
    AND e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id
    AND e.device_id=p_device_id AND e.device_generation=device_row.device_generation
    AND e.status='active' AND e.local_lock_state='unlocked'
    AND e.allowed_command_types=ARRAY['order.create']::text[];
  IF roster_count<1 OR roster_count>25
     OR NOT EXISTS (
       SELECT 1 FROM afex_offline_authority.offline_employee_authorities AS e
       WHERE e.actual_pos_employee_id=actor_row.actor_id
         AND e.primary_authenticated_subject_id=p_primary_authenticated_subject_id
         AND e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id
         AND e.device_id=p_device_id AND e.status='active'
     ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_EMPLOYEE_ROSTER_INVALID'; END IF;
  request_hash:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,
      'subjectId',p_primary_authenticated_subject_id,'authenticatedSessionId',p_authenticated_session_id,
      'posActorSessionId',p_pos_actor_session_id,'tenantId',p_tenant_id,
      'branchId',p_branch_id,'deviceId',p_device_id,'deviceGeneration',device_row.device_generation,
      'keyEnvelopeId',p_key_envelope_id,'keyEnvelopeVersion',p_key_envelope_version,
      'namespaceGeneration',p_namespace_generation,'inventorySnapshotId',p_inventory_snapshot_id,
      'roster',roster,'packageSha256',p_package_sha256,
      'evidenceSha256',p_evidence_sha256)::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_account_bootstrap_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT bootstrap_row
    FROM afex_offline_authority.offline_account_bootstrap_authorities
    WHERE primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id;
  ELSE
    SELECT * INTO bootstrap_row
    FROM afex_offline_authority.offline_account_bootstrap_authorities
    WHERE primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    FOR UPDATE;
    IF FOUND THEN
      IF bootstrap_row.status='revoked' THEN
        RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_REVOKED'; END IF;
      IF bootstrap_row.status='logged_out' THEN event_kind:='same_account_online_recovery'; END IF;
      UPDATE afex_offline_authority.offline_account_bootstrap_authorities SET
        authenticated_session_id=p_authenticated_session_id,
        pos_actor_session_id=p_pos_actor_session_id,actual_pos_employee_id=actor_row.actor_id,
        device_generation=device_row.device_generation,key_envelope_id=p_key_envelope_id,
        key_envelope_version=p_key_envelope_version,namespace_generation=p_namespace_generation,
        inventory_snapshot_id=p_inventory_snapshot_id,
        inventory_frontier_version=snapshot_row.frontier_version,
        bootstrap_generation=bootstrap_generation+1,status='active',
        package_sha256=p_package_sha256,online_verified_at=transaction_timestamp(),
        updated_at=transaction_timestamp(),explicitly_logged_out_at=NULL
      WHERE bootstrap_id=bootstrap_row.bootstrap_id RETURNING * INTO bootstrap_row;
      DELETE FROM afex_offline_authority.offline_bootstrap_employee_roster
      WHERE bootstrap_id=bootstrap_row.bootstrap_id;
    ELSE
      INSERT INTO afex_offline_authority.offline_account_bootstrap_authorities(
        bootstrap_id,primary_authenticated_subject_id,authenticated_session_id,
        pos_actor_session_id,actual_pos_employee_id,tenant_id,branch_id,device_id,
        device_generation,key_envelope_id,key_envelope_version,namespace_generation,
        inventory_snapshot_id,inventory_frontier_version,bootstrap_generation,
        status,package_sha256,online_verified_at
      ) VALUES(pg_catalog.gen_random_uuid(),p_primary_authenticated_subject_id,
        p_authenticated_session_id,p_pos_actor_session_id,actor_row.actor_id,
        p_tenant_id,p_branch_id,p_device_id,device_row.device_generation,
        p_key_envelope_id,p_key_envelope_version,p_namespace_generation,
        p_inventory_snapshot_id,snapshot_row.frontier_version,1,'active',
        p_package_sha256,transaction_timestamp()) RETURNING * INTO bootstrap_row;
    END IF;
    INSERT INTO afex_offline_authority.offline_bootstrap_employee_roster(
      bootstrap_id,enrollment_id,actual_pos_employee_id,
      employee_enrollment_generation,credential_generation,permission_generation,
      revocation_generation,command_generation,package_sha256
    ) SELECT bootstrap_row.bootstrap_id,e.enrollment_id,e.actual_pos_employee_id,
        e.employee_enrollment_generation,e.credential_generation,e.permission_generation,
        e.revocation_generation,e.command_generation,e.package_sha256
      FROM afex_offline_authority.offline_employee_authorities AS e
      WHERE e.primary_authenticated_subject_id=p_primary_authenticated_subject_id
        AND e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id
        AND e.device_id=p_device_id AND e.device_generation=device_row.device_generation
        AND e.status='active' AND e.local_lock_state='unlocked'
        AND e.allowed_command_types=ARRAY['order.create']::text[];
    INSERT INTO afex_offline_authority.offline_account_bootstrap_events(
      bootstrap_id,operation_id,request_sha256,event_type,
      primary_authenticated_subject_id,authenticated_session_id,
      tenant_id,branch_id,device_id,bootstrap_generation,logout_generation,evidence_sha256
    ) VALUES(bootstrap_row.bootstrap_id,p_operation_id,request_hash,event_kind,
      p_primary_authenticated_subject_id,p_authenticated_session_id,
      p_tenant_id,p_branch_id,p_device_id,bootstrap_row.bootstrap_generation,
      bootstrap_row.logout_generation,p_evidence_sha256);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-account-bootstrap.v1','status',bootstrap_row.status,
    'classification','VERIFIED_ONLINE_ACCOUNT_BOOTSTRAP_EMPLOYEE_PIN_SELECTION_ONLY',
    'bootstrapId',bootstrap_row.bootstrap_id,
    'bootstrapGeneration',bootstrap_row.bootstrap_generation,
    'primaryAuthenticatedSubjectId',bootstrap_row.primary_authenticated_subject_id,
    'tenantId',bootstrap_row.tenant_id,'branchId',bootstrap_row.branch_id,
    'deviceId',bootstrap_row.device_id,'deviceGeneration',bootstrap_row.device_generation,
    'namespaceGeneration',bootstrap_row.namespace_generation,
    'inventorySnapshotId',bootstrap_row.inventory_snapshot_id,
    'inventoryFrontierVersion',bootstrap_row.inventory_frontier_version,
    'employeeRoster',roster,'allowedCommandTypes',ARRAY['order.create']::text[],
    'containsSecretKeyMaterial',false,'timeBasedOfflineExpiry',false);
END $fn$;

-- FWD-10A-006
CREATE FUNCTION afex_offline_authority.explicit_logout_offline_account_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_tenant_id uuid,p_branch_id uuid,
  p_device_id uuid,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE b afex_offline_authority.offline_account_bootstrap_authorities%ROWTYPE;
  request_hash text; prior_hash text;
BEGIN
  IF p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_LOGOUT_SCHEMA_INVALID'; END IF;
  IF NOT afex_offline_authority.afex_current_auth_session_matches_v1(
       p_primary_authenticated_subject_id,p_authenticated_session_id
     ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_LOGOUT_CURRENT_ONLINE_AUTH_REQUIRED'; END IF;
  request_hash:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,
      'subjectId',p_primary_authenticated_subject_id,
      'authenticatedSessionId',p_authenticated_session_id,'tenantId',p_tenant_id,
      'branchId',p_branch_id,'deviceId',p_device_id,
      'evidenceSha256',p_evidence_sha256)::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior_hash FROM afex_offline_authority.offline_account_bootstrap_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT b FROM afex_offline_authority.offline_account_bootstrap_authorities
    WHERE primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id;
  ELSE
    SELECT * INTO b FROM afex_offline_authority.offline_account_bootstrap_authorities
    WHERE primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND authenticated_session_id=p_authenticated_session_id
      AND tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    FOR UPDATE;
    IF NOT FOUND OR b.status<>'active' THEN
      RAISE EXCEPTION 'AFEX_OFFLINE_LOGOUT_ACTIVE_BOOTSTRAP_REQUIRED'; END IF;
    UPDATE afex_offline_authority.offline_account_bootstrap_authorities
    SET status='logged_out',logout_generation=logout_generation+1,
        explicitly_logged_out_at=transaction_timestamp(),updated_at=transaction_timestamp()
    WHERE bootstrap_id=b.bootstrap_id RETURNING * INTO b;
    INSERT INTO afex_offline_authority.offline_account_bootstrap_events(
      bootstrap_id,operation_id,request_sha256,event_type,
      primary_authenticated_subject_id,authenticated_session_id,
      tenant_id,branch_id,device_id,bootstrap_generation,logout_generation,evidence_sha256
    ) VALUES(b.bootstrap_id,p_operation_id,request_hash,'explicit_logout',
      p_primary_authenticated_subject_id,p_authenticated_session_id,p_tenant_id,
      p_branch_id,p_device_id,b.bootstrap_generation,b.logout_generation,p_evidence_sha256);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-account-bootstrap.v1','status',b.status,
    'bootstrapId',b.bootstrap_id,'bootstrapGeneration',b.bootstrap_generation,
    'logoutGeneration',b.logout_generation,'offlinePinEntryEnabled',false,
    'offlineOrderCreationEnabled',false,'offlineEmployeeSwitchEnabled',false,
    'pendingCommandsDisposition','RETAIN_ENCRYPTED_INACCESSIBLE_SAME_ACCOUNT_ONLINE_RECOVERY_ONLY');
END $fn$;

-- FWD-10A-007
CREATE FUNCTION afex_offline_authority.revoke_offline_account_bootstrap_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_reason_code text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE b afex_offline_authority.offline_account_bootstrap_authorities%ROWTYPE;
  request_hash text; prior_hash text;
BEGIN
  IF char_length(p_reason_code) NOT BETWEEN 1 AND 64
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_REVOCATION_SCHEMA_INVALID'; END IF;
  request_hash:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationId',p_operation_id,
      'subjectId',p_primary_authenticated_subject_id,'tenantId',p_tenant_id,
      'branchId',p_branch_id,'deviceId',p_device_id,'reasonCode',p_reason_code,
      'evidenceSha256',p_evidence_sha256)::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_account_bootstrap_events
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN
      RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_OPERATION_CONFLICT'; END IF;
    SELECT * INTO STRICT b
    FROM afex_offline_authority.offline_account_bootstrap_authorities
    WHERE primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id;
  ELSE
    SELECT * INTO b
    FROM afex_offline_authority.offline_account_bootstrap_authorities
    WHERE primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    FOR UPDATE;
    IF NOT FOUND OR b.status='revoked' THEN
      RAISE EXCEPTION 'AFEX_OFFLINE_BOOTSTRAP_REVOCATION_AUTHORITY_INVALID'; END IF;
    UPDATE afex_offline_authority.offline_account_bootstrap_authorities
    SET status='revoked',bootstrap_generation=bootstrap_generation+1,
        revoked_at=transaction_timestamp(),updated_at=transaction_timestamp()
    WHERE bootstrap_id=b.bootstrap_id RETURNING * INTO b;
    INSERT INTO afex_offline_authority.offline_account_bootstrap_events(
      bootstrap_id,operation_id,request_sha256,event_type,
      primary_authenticated_subject_id,authenticated_session_id,
      tenant_id,branch_id,device_id,bootstrap_generation,logout_generation,evidence_sha256
    ) VALUES(b.bootstrap_id,p_operation_id,request_hash,'revoked',
      p_primary_authenticated_subject_id,b.authenticated_session_id,
      p_tenant_id,p_branch_id,p_device_id,b.bootstrap_generation,
      b.logout_generation,p_evidence_sha256);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-account-bootstrap.v1','status',b.status,
    'bootstrapId',b.bootstrap_id,'bootstrapGeneration',b.bootstrap_generation,
    'logoutGeneration',b.logout_generation,'offlinePinEntryEnabled',false,
    'offlineOrderCreationEnabled',false,'offlineEmployeeSwitchEnabled',false,
    'revocationReasonCode',p_reason_code);
END $fn$;

-- FWD-10A-008
CREATE FUNCTION afex_offline_authority.read_current_offline_bootstrap_authority_v1(
  p_primary_authenticated_subject_id uuid,p_tenant_id uuid,p_branch_id uuid,p_device_id uuid
)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'contractVersion','offline-account-bootstrap.v1','bootstrapId',b.bootstrap_id,
    'primaryAuthenticatedSubjectId',b.primary_authenticated_subject_id,
    'tenantId',b.tenant_id,'branchId',b.branch_id,'deviceId',b.device_id,
    'deviceGeneration',b.device_generation,'namespaceGeneration',b.namespace_generation,
    'bootstrapGeneration',b.bootstrap_generation,'logoutGeneration',b.logout_generation,
    'status',b.status,'inventorySnapshotId',b.inventory_snapshot_id,
    'inventoryFrontierVersion',b.inventory_frontier_version,
    'timeBasedOfflineExpiry',false,'pinCanRestoreLoggedOutAccount',false,
    'sameAccountOnlineRecoveryRequired',b.status='logged_out')
  FROM afex_offline_authority.offline_account_bootstrap_authorities AS b
  WHERE b.primary_authenticated_subject_id=p_primary_authenticated_subject_id
    AND b.tenant_id=p_tenant_id AND b.branch_id=p_branch_id AND b.device_id=p_device_id
$fn$;

-- FWD-10A-009
REVOKE ALL ON afex_offline_authority.offline_account_bootstrap_authorities,
  afex_offline_authority.offline_bootstrap_employee_roster,
  afex_offline_authority.offline_account_bootstrap_events
FROM PUBLIC,anon,authenticated,service_role,afex_offline_acquisition_runtime,
  afex_offline_provisioning_runtime;
GRANT SELECT ON afex_offline_authority.offline_account_bootstrap_authorities
  TO afex_function_owner;
REVOKE ALL ON FUNCTION
  afex_offline_authority.publish_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text),
  afex_offline_authority.explicit_logout_offline_account_v1(uuid,uuid,uuid,uuid,uuid,uuid,text),
  afex_offline_authority.revoke_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,text,text),
  afex_offline_authority.read_current_offline_bootstrap_authority_v1(uuid,uuid,uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role,afex_offline_acquisition_runtime;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.publish_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text),
  afex_offline_authority.explicit_logout_offline_account_v1(uuid,uuid,uuid,uuid,uuid,uuid,text),
  afex_offline_authority.revoke_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,text,text),
  afex_offline_authority.read_current_offline_bootstrap_authority_v1(uuid,uuid,uuid,uuid)
TO afex_offline_provisioning_runtime;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.publish_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)'
     ) IS NULL OR pg_catalog.to_regprocedure(
       'afex_offline_authority.explicit_logout_offline_account_v1(uuid,uuid,uuid,uuid,uuid,uuid,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_3C_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_3C_OWNER_CONTEXT_RESTORED';
END $afex$;
COMMIT;
