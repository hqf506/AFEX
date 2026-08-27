/*
AFEX POS Offline pre-PIN provisioning v2.
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION BY CODEX.

Purpose: add verified primary-Auth, pre-employee-selection provisioning without
weakening or replacing any v1 POS-actor contract. This wave cannot acquire,
dispatch, replay, cancel or refund an order. It exposes exactly four server-only
service_role facades. PostgreSQL 17.6; one transaction; no subset execution.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $afex$
BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.current_database() <> 'postgres'
     OR pg_catalog.current_setting('server_version_num') <> '170006'
     OR pg_catalog.to_regrole('afex_offline_authority_owner') IS NULL
     OR pg_catalog.to_regrole('afex_function_owner') IS NULL
     OR pg_catalog.to_regrole('service_role') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_devices') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_employee_authorities') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_key_envelopes') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.branch_inventory_snapshot_headers') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)') IS NULL
     OR NOT pg_catalog.has_schema_privilege('afex_function_owner','public','CREATE')
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2') IS NOT NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_events_v2') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc AS p
       JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
       WHERE (n.nspname='public' AND p.proname LIKE 'afex_offline_server_pre_pin_%_v2')
          OR (n.nspname='afex_offline_authority' AND p.proname LIKE '%pre_pin%_v2')
     )
  THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_INSTALL_PRECONDITION_FAILED';
  END IF;
END
$afex$;

GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_TEMP_OWNER_SET_FAILED';
  END IF;
END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;

CREATE TABLE afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 (
  bootstrap_id uuid PRIMARY KEY,
  primary_authenticated_subject_id uuid NOT NULL,
  authenticated_session_id uuid NOT NULL,
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
  status text NOT NULL,
  package_sha256 text NOT NULL,
  online_verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.transaction_timestamp(),
  CONSTRAINT offline_pre_pin_bootstrap_subject_fk
    FOREIGN KEY (primary_authenticated_subject_id) REFERENCES public.profiles(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_pre_pin_bootstrap_device_fk
    FOREIGN KEY (device_id,tenant_id,branch_id,device_generation)
    REFERENCES afex_offline_authority.offline_devices
      (device_id,tenant_id,branch_id,device_generation)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_pre_pin_bootstrap_envelope_fk
    FOREIGN KEY (key_envelope_id,key_envelope_version,
                 primary_authenticated_subject_id,tenant_id,branch_id,
                 device_id,device_generation,namespace_generation)
    REFERENCES afex_offline_authority.offline_key_envelopes
      (key_envelope_id,key_envelope_version,
       primary_authenticated_subject_id,tenant_id,branch_id,
       device_id,device_generation,namespace_generation)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_pre_pin_bootstrap_inventory_fk
    FOREIGN KEY (inventory_snapshot_id,tenant_id,branch_id)
    REFERENCES afex_offline_authority.branch_inventory_snapshot_headers
      (snapshot_id,tenant_id,branch_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_pre_pin_bootstrap_generations
    CHECK (device_generation>0 AND key_envelope_version>0
       AND namespace_generation>0 AND bootstrap_generation>0),
  CONSTRAINT offline_pre_pin_bootstrap_status
    CHECK (status IN ('active','logged_out','revoked')),
  CONSTRAINT offline_pre_pin_bootstrap_hash
    CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (primary_authenticated_subject_id,tenant_id,branch_id,device_id)
);

CREATE TABLE afex_offline_authority.offline_pre_pin_bootstrap_events_v2 (
  event_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  bootstrap_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_sha256 text NOT NULL,
  primary_authenticated_subject_id uuid NOT NULL,
  authenticated_session_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  device_id uuid NOT NULL,
  bootstrap_generation bigint NOT NULL,
  event_type text NOT NULL,
  evidence_sha256 text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT pg_catalog.transaction_timestamp(),
  CONSTRAINT offline_pre_pin_bootstrap_event_authority_fk
    FOREIGN KEY (bootstrap_id)
    REFERENCES afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2(bootstrap_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_pre_pin_bootstrap_event_generation
    CHECK (bootstrap_generation>0),
  CONSTRAINT offline_pre_pin_bootstrap_event_type
    CHECK (event_type IN ('pre_pin_online_bootstrap','pre_pin_online_refresh')),
  CONSTRAINT offline_pre_pin_bootstrap_event_hashes
    CHECK (request_sha256 ~ '^[0-9a-f]{64}$'
       AND evidence_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (tenant_id,branch_id,device_id,operation_id)
);

ALTER TABLE afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 FORCE ROW LEVEL SECURITY;
ALTER TABLE afex_offline_authority.offline_pre_pin_bootstrap_events_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE afex_offline_authority.offline_pre_pin_bootstrap_events_v2 FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_pre_pin_bootstrap_owner_all_v2
  ON afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
CREATE POLICY offline_pre_pin_bootstrap_function_select_v2
  ON afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
  FOR SELECT TO afex_function_owner USING (true);
CREATE POLICY offline_pre_pin_bootstrap_events_owner_all_v2
  ON afex_offline_authority.offline_pre_pin_bootstrap_events_v2
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
REVOKE ALL ON afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2,
  afex_offline_authority.offline_pre_pin_bootstrap_events_v2
  FROM PUBLIC,anon,authenticated,service_role,
       afex_offline_acquisition_runtime,afex_offline_provisioning_runtime;
GRANT SELECT ON afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
  TO afex_function_owner;

CREATE TRIGGER offline_pre_pin_bootstrap_events_immutable_v2
  BEFORE UPDATE OR DELETE
  ON afex_offline_authority.offline_pre_pin_bootstrap_events_v2
  FOR EACH ROW EXECUTE FUNCTION
    afex_offline_authority.reject_immutable_offline_evidence_v1();

CREATE FUNCTION afex_offline_authority.provision_pre_pin_device_v2(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_mode text,
  p_proof_public_key_jwk jsonb,p_wrap_public_key_jwk jsonb,
  p_key_envelope_id uuid,p_wrapped_key_sha256 text,p_public_key_sha256 text,
  p_envelope_aad_sha256 text,p_envelope_ciphertext_sha256 text,
  p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  d afex_offline_authority.offline_devices%ROWTYPE;
  k afex_offline_authority.offline_key_envelopes%ROWTYPE;
  activation_operation uuid;
  activation_hash text;
BEGIN
  IF p_mode<>'MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE'
     OR p_wrapped_key_sha256 !~ '^[0-9a-f]{64}$'
     OR p_public_key_sha256 !~ '^[0-9a-f]{64}$'
     OR p_envelope_aad_sha256 !~ '^[0-9a-f]{64}$'
     OR p_envelope_ciphertext_sha256 !~ '^[0-9a-f]{64}$'
     OR p_package_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_DEVICE_SCHEMA_INVALID';
  END IF;
  SELECT * INTO d FROM afex_offline_authority.offline_devices
  WHERE device_id=p_device_id FOR UPDATE;
  IF FOUND THEN
    IF d.tenant_id<>p_tenant_id OR d.branch_id<>p_branch_id
       OR d.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id
       OR d.mode<>p_mode
       OR d.device_proof_public_key_jwk<>p_proof_public_key_jwk
       OR d.device_wrap_public_key_jwk<>p_wrap_public_key_jwk
       OR d.status<>'active' OR d.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'AFEX_PRE_PIN_DEVICE_STABLE_IDENTITY_CONFLICT';
    END IF;
  ELSE
    PERFORM afex_offline_authority.register_offline_device_v1(
      p_operation_id,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
      p_device_id,p_mode,p_proof_public_key_jwk,p_wrap_public_key_jwk,p_evidence_sha256);
    activation_hash:=pg_catalog.md5(p_operation_id::text||':afex-pre-pin-activate-v2');
    activation_operation:=(pg_catalog.substr(activation_hash,1,8)||'-'||
      pg_catalog.substr(activation_hash,9,4)||'-4'||pg_catalog.substr(activation_hash,14,3)||
      '-a'||pg_catalog.substr(activation_hash,18,3)||'-'||
      pg_catalog.substr(activation_hash,21,12))::uuid;
    PERFORM afex_offline_authority.activate_offline_device_v1(
      activation_operation,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
      p_device_id,1,p_evidence_sha256);
    SELECT * INTO STRICT d FROM afex_offline_authority.offline_devices
    WHERE device_id=p_device_id AND tenant_id=p_tenant_id AND branch_id=p_branch_id;
  END IF;
  SELECT * INTO k FROM afex_offline_authority.offline_key_envelopes
  WHERE key_envelope_id=p_key_envelope_id AND key_envelope_version=1 FOR UPDATE;
  IF FOUND THEN
    IF k.primary_authenticated_subject_id<>p_primary_authenticated_subject_id
       OR k.tenant_id<>p_tenant_id OR k.branch_id<>p_branch_id
       OR k.device_id<>p_device_id OR k.device_generation<>d.device_generation
       OR k.namespace_generation<>1 OR k.status<>'active'
       OR k.canonical_aad_sha256<>p_envelope_aad_sha256
       OR k.wrapped_dek_ciphertext_sha256<>p_wrapped_key_sha256
       OR k.encrypted_envelope_sha256<>p_envelope_ciphertext_sha256
       OR k.device_wrap_key_sha256<>d.device_wrap_key_sha256 THEN
      RAISE EXCEPTION 'AFEX_PRE_PIN_KEY_ENVELOPE_STABLE_IDENTITY_CONFLICT';
    END IF;
  ELSE
    INSERT INTO afex_offline_authority.offline_key_envelopes(
      key_envelope_id,key_envelope_version,primary_authenticated_subject_id,
      tenant_id,branch_id,device_id,device_generation,key_generation,
      revocation_generation,namespace_generation,envelope_schema_version,
      wrap_algorithm,content_algorithm,canonical_aad_sha256,
      wrapped_dek_ciphertext_sha256,encrypted_envelope_sha256,
      device_wrap_key_sha256,status
    ) VALUES(
      p_key_envelope_id,1,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
      p_device_id,d.device_generation,d.key_envelope_generation,d.revocation_generation,
      1,1,'RSA-OAEP-3072-SHA256','AES-256-GCM',p_envelope_aad_sha256,
      p_wrapped_key_sha256,p_envelope_ciphertext_sha256,d.device_wrap_key_sha256,'active'
    ) RETURNING * INTO k;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-pre-pin-device.v2','status','active',
    'deviceId',d.device_id,'deviceGeneration',d.device_generation,
    'keyEnvelopeId',k.key_envelope_id,'keyEnvelopeVersion',k.key_envelope_version,
    'namespaceGeneration',k.namespace_generation,
    'orderAcquisitionAuthorized',false,'selectedEmployeeId',NULL);
END
$fn$;

CREATE FUNCTION afex_offline_authority.read_pre_pin_employee_roster_v2(
  p_primary_authenticated_subject_id uuid,p_tenant_id uuid,
  p_branch_id uuid,p_device_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE d afex_offline_authority.offline_devices%ROWTYPE; employee_count integer; roster jsonb;
BEGIN
  SELECT * INTO d FROM afex_offline_authority.offline_devices
  WHERE device_id=p_device_id AND tenant_id=p_tenant_id AND branch_id=p_branch_id;
  IF NOT FOUND OR d.status<>'active' OR d.revoked_at IS NOT NULL
     OR d.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_ROSTER_DEVICE_AUTHORITY_INVALID';
  END IF;
  SELECT pg_catalog.count(*) INTO employee_count
  FROM public.pos_profiles AS p
  WHERE p.tenant_id=p_tenant_id AND p.branch_id=p_branch_id AND p.is_active=true
    AND p.role IN ('admin','manager','employee','cashier');
  IF employee_count<1 OR employee_count>25 THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_ROSTER_COUNT_OUTSIDE_1_25';
  END IF;
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'employeeId',p.id,'username',p.username,'fullName',p.full_name,
    'role',p.role,'branchId',p.branch_id,'enrolled',(e.enrollment_id IS NOT NULL),
    'enrollmentId',e.enrollment_id,
    'enrollmentGeneration',e.employee_enrollment_generation,
    'commandGeneration',e.command_generation,
    'pinVerifierSaltHex',CASE WHEN e.enrollment_id IS NULL THEN NULL ELSE pg_catalog.encode(e.pin_verifier_salt,'hex') END,
    'pinVerifierHex',CASE WHEN e.enrollment_id IS NULL THEN NULL ELSE pg_catalog.encode(e.pin_verifier_bytes,'hex') END
  ) ORDER BY p.full_name,p.id) INTO roster
  FROM public.pos_profiles AS p
  LEFT JOIN LATERAL (
    SELECT a.* FROM afex_offline_authority.offline_employee_authorities AS a
    WHERE a.primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND a.tenant_id=p_tenant_id AND a.branch_id=p_branch_id
      AND a.device_id=p_device_id AND a.device_generation=d.device_generation
      AND a.actual_pos_employee_id=p.id AND a.status='active'
      AND a.local_lock_state='unlocked'
      AND a.allowed_command_types=ARRAY['order.create']::text[]
    ORDER BY a.employee_enrollment_generation DESC LIMIT 1
  ) AS e ON true
  WHERE p.tenant_id=p_tenant_id AND p.branch_id=p_branch_id AND p.is_active=true
    AND p.role IN ('admin','manager','employee','cashier');
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-pre-pin-roster.v2','employees',roster,
    'employeeCount',employee_count,'maximumEmployees',25,
    'containsOperationalPosPinHash',false,'orderAcquisitionAuthorized',false);
END
$fn$;

CREATE FUNCTION afex_offline_authority.publish_pre_pin_account_bootstrap_v2(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_tenant_id uuid,p_branch_id uuid,
  p_device_id uuid,p_key_envelope_id uuid,p_key_envelope_version bigint,
  p_namespace_generation bigint,p_inventory_snapshot_id uuid,
  p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
  d afex_offline_authority.offline_devices%ROWTYPE;
  h afex_offline_authority.branch_inventory_snapshot_headers%ROWTYPE;
  b afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2%ROWTYPE;
  prior_hash text; request_hash text; event_kind text:='pre_pin_online_bootstrap';
BEGIN
  IF p_key_envelope_version<=0 OR p_namespace_generation<=0
     OR p_package_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_SCHEMA_INVALID';
  END IF;
  IF NOT afex_offline_authority.afex_current_auth_session_matches_v1(
    p_primary_authenticated_subject_id,p_authenticated_session_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_AUTH_SESSION_INVALID';
  END IF;
  SELECT * INTO d FROM afex_offline_authority.offline_devices
  WHERE device_id=p_device_id AND tenant_id=p_tenant_id AND branch_id=p_branch_id FOR UPDATE;
  IF NOT FOUND OR d.status<>'active' OR d.revoked_at IS NOT NULL
     OR d.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_DEVICE_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM afex_offline_authority.offline_key_envelopes AS k
    WHERE k.key_envelope_id=p_key_envelope_id
      AND k.key_envelope_version=p_key_envelope_version
      AND k.primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND k.tenant_id=p_tenant_id AND k.branch_id=p_branch_id
      AND k.device_id=p_device_id AND k.device_generation=d.device_generation
      AND k.namespace_generation=p_namespace_generation
      AND k.status='active' AND k.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_ENVELOPE_INVALID'; END IF;
  SELECT * INTO h FROM afex_offline_authority.branch_inventory_snapshot_headers
  WHERE snapshot_id=p_inventory_snapshot_id AND tenant_id=p_tenant_id
    AND branch_id=p_branch_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_INVENTORY_INVALID'; END IF;
  request_hash:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operationId',p_operation_id,'subjectId',p_primary_authenticated_subject_id,
      'authenticatedSessionId',p_authenticated_session_id,'tenantId',p_tenant_id,
      'branchId',p_branch_id,'deviceId',p_device_id,
      'deviceGeneration',d.device_generation,'keyEnvelopeId',p_key_envelope_id,
      'keyEnvelopeVersion',p_key_envelope_version,
      'namespaceGeneration',p_namespace_generation,
      'inventorySnapshotId',p_inventory_snapshot_id,
      'packageSha256',p_package_sha256,'evidenceSha256',p_evidence_sha256
    )::text,'UTF8'),'sha256'),'hex');
  SELECT request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_pre_pin_bootstrap_events_v2
  WHERE tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id
    AND operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN
      RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_OPERATION_CONFLICT';
    END IF;
    SELECT * INTO STRICT b
    FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
    WHERE primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id;
  ELSE
    SELECT * INTO b FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
    WHERE primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND tenant_id=p_tenant_id AND branch_id=p_branch_id AND device_id=p_device_id FOR UPDATE;
    IF FOUND THEN
      IF b.status='revoked' THEN RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_REVOKED'; END IF;
      event_kind:='pre_pin_online_refresh';
      UPDATE afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 SET
        authenticated_session_id=p_authenticated_session_id,
        device_generation=d.device_generation,key_envelope_id=p_key_envelope_id,
        key_envelope_version=p_key_envelope_version,
        namespace_generation=p_namespace_generation,
        inventory_snapshot_id=p_inventory_snapshot_id,
        inventory_frontier_version=h.frontier_version,
        bootstrap_generation=bootstrap_generation+1,status='active',
        package_sha256=p_package_sha256,online_verified_at=pg_catalog.transaction_timestamp(),
        updated_at=pg_catalog.transaction_timestamp()
      WHERE bootstrap_id=b.bootstrap_id RETURNING * INTO b;
    ELSE
      INSERT INTO afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2(
        bootstrap_id,primary_authenticated_subject_id,authenticated_session_id,
        tenant_id,branch_id,device_id,device_generation,key_envelope_id,
        key_envelope_version,namespace_generation,inventory_snapshot_id,
        inventory_frontier_version,bootstrap_generation,status,package_sha256,
        online_verified_at
      ) VALUES(
        pg_catalog.gen_random_uuid(),p_primary_authenticated_subject_id,
        p_authenticated_session_id,p_tenant_id,p_branch_id,p_device_id,d.device_generation,
        p_key_envelope_id,p_key_envelope_version,p_namespace_generation,
        p_inventory_snapshot_id,h.frontier_version,1,'active',p_package_sha256,
        pg_catalog.transaction_timestamp()
      ) RETURNING * INTO b;
    END IF;
    INSERT INTO afex_offline_authority.offline_pre_pin_bootstrap_events_v2(
      bootstrap_id,operation_id,request_sha256,primary_authenticated_subject_id,
      authenticated_session_id,tenant_id,branch_id,device_id,bootstrap_generation,
      event_type,evidence_sha256
    ) VALUES(
      b.bootstrap_id,p_operation_id,request_hash,p_primary_authenticated_subject_id,
      p_authenticated_session_id,p_tenant_id,p_branch_id,p_device_id,
      b.bootstrap_generation,event_kind,p_evidence_sha256
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-pre-pin-bootstrap.v2','status',b.status,
    'classification','VERIFIED_PRIMARY_AUTH_PRE_PIN_NO_EMPLOYEE_AUTHORITY',
    'bootstrapId',b.bootstrap_id,'bootstrapGeneration',b.bootstrap_generation,
    'primaryAuthenticatedSubjectId',b.primary_authenticated_subject_id,
    'tenantId',b.tenant_id,'branchId',b.branch_id,'deviceId',b.device_id,
    'deviceGeneration',b.device_generation,'keyEnvelopeId',b.key_envelope_id,
    'keyEnvelopeVersion',b.key_envelope_version,
    'namespaceGeneration',b.namespace_generation,
    'inventorySnapshotId',b.inventory_snapshot_id,
    'inventoryFrontierVersion',b.inventory_frontier_version,
    'preparedAt',b.online_verified_at,'selectedEmployeeId',NULL,
    'posActorSessionId',NULL,'allowedCommandTypes','[]'::jsonb,
    'orderAcquisitionAuthorized',false);
END
$fn$;

REVOKE ALL ON FUNCTION
  afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text,text),
  afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid),
  afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
FROM PUBLIC,anon,authenticated,service_role,
  afex_offline_acquisition_runtime,afex_offline_provisioning_runtime;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text,text),
  afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid),
  afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
TO afex_function_owner;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_TEMP_FUNCTION_OWNER_SET_FAILED';
  END IF;
END $afex$;
SET LOCAL ROLE afex_function_owner;

CREATE FUNCTION public.afex_offline_server_pre_pin_context_matches_v2(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid
)
RETURNS boolean LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT afex_offline_authority.afex_current_auth_session_matches_v1(
    p_authenticated_subject_id,p_authenticated_session_id
  ) AND EXISTS (
    SELECT 1 FROM public.profiles AS p
    JOIN public.branches AS b ON b.id=p_branch_id AND b.tenant_id=p_tenant_id
    WHERE p.id=p_authenticated_subject_id AND p.tenant_id=p_tenant_id
      AND p.is_active=true
      AND p.role IN ('owner','admin','manager','employee','cashier')
      AND (p.branch_id IS NULL OR p.branch_id=p_branch_id)
      AND b.is_active=true
  )
$fn$;

CREATE FUNCTION public.afex_offline_server_pre_pin_provision_device_v2(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_operation_id uuid,p_device_id uuid,
  p_mode text,p_proof_public_key_jwk jsonb,p_wrap_public_key_jwk jsonb,
  p_key_envelope_id uuid,p_wrapped_key_sha256 text,p_public_key_sha256 text,
  p_envelope_aad_sha256 text,p_envelope_ciphertext_sha256 text,
  p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,p_tenant_id,p_branch_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_SERVER_CONTEXT_REJECTED';
  END IF;
  RETURN afex_offline_authority.provision_pre_pin_device_v2(
    p_operation_id,p_authenticated_subject_id,p_tenant_id,p_branch_id,p_device_id,
    p_mode,p_proof_public_key_jwk,p_wrap_public_key_jwk,p_key_envelope_id,
    p_wrapped_key_sha256,p_public_key_sha256,p_envelope_aad_sha256,
    p_envelope_ciphertext_sha256,p_package_sha256,p_evidence_sha256);
END $fn$;

CREATE FUNCTION public.afex_offline_server_pre_pin_employee_roster_v2(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,p_tenant_id,p_branch_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_SERVER_CONTEXT_REJECTED';
  END IF;
  RETURN afex_offline_authority.read_pre_pin_employee_roster_v2(
    p_authenticated_subject_id,p_tenant_id,p_branch_id,p_device_id);
END $fn$;

CREATE FUNCTION public.afex_offline_server_pre_pin_publish_inventory_v2(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_snapshot_id uuid,
  p_frontier_version text,p_confirmed_at timestamptz,p_items jsonb
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ DECLARE result jsonb; BEGIN
  IF NOT public.afex_offline_server_pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,p_tenant_id,p_branch_id)
     OR NOT EXISTS (
       SELECT 1 FROM afex_offline_authority.offline_devices AS d
       WHERE d.device_id=p_device_id AND d.tenant_id=p_tenant_id
         AND d.branch_id=p_branch_id AND d.status='active' AND d.revoked_at IS NULL
         AND d.registered_by_authenticated_subject_id=p_authenticated_subject_id
     ) THEN RAISE EXCEPTION 'AFEX_PRE_PIN_SERVER_DEVICE_CONTEXT_REJECTED';
  END IF;
  result:=afex_offline_authority.publish_branch_inventory_snapshot_v1(
    p_snapshot_id,p_authenticated_subject_id,p_tenant_id,p_branch_id,
    p_frontier_version,p_confirmed_at,p_items);
  RETURN result||pg_catalog.jsonb_build_object(
    'confirmedAt',p_confirmed_at,'items',p_items,'deviceId',p_device_id,
    'orderAcquisitionAuthorized',false);
END $fn$;

CREATE FUNCTION public.afex_offline_server_pre_pin_bootstrap_v2(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_operation_id uuid,p_device_id uuid,
  p_key_envelope_id uuid,p_key_envelope_version bigint,
  p_namespace_generation bigint,p_inventory_snapshot_id uuid,
  p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,p_tenant_id,p_branch_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_SERVER_CONTEXT_REJECTED';
  END IF;
  RETURN afex_offline_authority.publish_pre_pin_account_bootstrap_v2(
    p_operation_id,p_authenticated_subject_id,p_authenticated_session_id,
    p_tenant_id,p_branch_id,p_device_id,p_key_envelope_id,p_key_envelope_version,
    p_namespace_generation,p_inventory_snapshot_id,p_package_sha256,p_evidence_sha256);
END $fn$;

REVOKE ALL ON FUNCTION
  public.afex_offline_server_pre_pin_context_matches_v2(uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
TO service_role;

RESET ROLE;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$
DECLARE facade_count integer; service_grants integer; browser_grants integer;
BEGIN
  SELECT pg_catalog.count(*) INTO facade_count
  FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'afex_offline_server_pre_pin_provision_device_v2',
    'afex_offline_server_pre_pin_employee_roster_v2',
    'afex_offline_server_pre_pin_publish_inventory_v2',
    'afex_offline_server_pre_pin_bootstrap_v2')
    AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
    AND pg_catalog.pg_get_userbyid(p.proowner)='afex_function_owner';
  SELECT pg_catalog.count(*) INTO service_grants
  FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
    'afex_offline_server_pre_pin_provision_device_v2',
    'afex_offline_server_pre_pin_employee_roster_v2',
    'afex_offline_server_pre_pin_publish_inventory_v2',
    'afex_offline_server_pre_pin_bootstrap_v2')
    AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE');
  SELECT pg_catalog.count(*) INTO browser_grants
  FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'afex_offline_server_pre_pin_%_v2'
    AND (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      OR pg_catalog.coalesce(pg_catalog.array_to_string(p.proacl,','),'') ~ '(^|,)=[^,]*X');
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR facade_count<>4 OR service_grants<>4 OR browser_grants<>0
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_events_v2') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)') IS NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS r ON r.oid=m.roleid
       JOIN pg_catalog.pg_roles AS u ON u.oid=m.member
       WHERE r.rolname IN ('afex_offline_authority_owner','afex_function_owner')
         AND u.rolname='postgres' AND m.set_option
     ) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_PRE_PIN_V2_POST_ATTESTATION_PASS: facades=4 service_role=4 browser=0 order_acquisition_v1_unchanged=true';
END
$afex$;

COMMIT;
