/*
AFEX POS Offline pre-PIN provisioning v2.
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION BY CODEX.

One PostgreSQL 17.6 transaction. The installer starts and ends as postgres.
Owner memberships and public-schema CREATE are elevated only inside this
transaction and restored before the fail-before-COMMIT attestation.
This wave cannot acquire, dispatch, replay, cancel or refund an order.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $afex$
DECLARE membership_snapshot jsonb; acquisition_snapshot jsonb;
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.current_database()<>'postgres'
     OR pg_catalog.current_setting('server_version_num')<>'170006'
     OR NOT pg_catalog.has_schema_privilege('postgres','public','CREATE')
     OR NOT pg_catalog.pg_has_role('postgres','pg_database_owner','USAGE')
     OR pg_catalog.has_schema_privilege('afex_function_owner','public','CREATE')
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2') IS NOT NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_events_v2') IS NOT NULL
     OR pg_catalog.to_regprocedure('afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)') IS NOT NULL
     OR NOT pg_catalog.has_function_privilege('afex_offline_authority_owner','public.digest(bytea,text)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('afex_offline_authority_owner','afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'AFEX_PRE_PIN_V2_INSTALL_PRECONDITION_FAILED'; END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'role',owner_role.rolname,'member',member_role.rolname,
    'grantor',pg_catalog.pg_get_userbyid(m.grantor),
    'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
    ORDER BY owner_role.rolname,pg_catalog.pg_get_userbyid(m.grantor)),'[]'::jsonb)
  INTO membership_snapshot
  FROM pg_catalog.pg_auth_members AS m
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=m.roleid
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
  WHERE member_role.rolname='postgres'
    AND owner_role.rolname IN ('afex_offline_authority_owner','afex_function_owner');

  SELECT pg_catalog.jsonb_build_object(
    'oid',p.oid,'owner',pg_catalog.pg_get_userbyid(p.proowner),
    'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,
    'definitionMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)))
  INTO STRICT acquisition_snapshot FROM pg_catalog.pg_proc AS p
  WHERE p.oid=pg_catalog.to_regprocedure(
    'public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)');
  PERFORM pg_catalog.set_config('afex.pre_pin_v2_memberships',membership_snapshot::text,true);
  PERFORM pg_catalog.set_config('afex.pre_pin_v2_acquisition',acquisition_snapshot::text,true);
END
$afex$;

/* Only the private owner receives the two roster display columns omitted from
   the frozen support grant. Browser and service roles receive neither. */
GRANT SELECT (username,full_name) ON public.pos_profiles TO afex_offline_authority_owner;

GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_TEMP_AUTHORITY_OWNER_SET_FAILED';
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
  CONSTRAINT offline_pre_pin_bootstrap_generations CHECK (
    device_generation>0 AND key_envelope_version>0
    AND namespace_generation>0 AND bootstrap_generation>0),
  CONSTRAINT offline_pre_pin_bootstrap_status CHECK (
    status IN ('active','logged_out','revoked')),
  CONSTRAINT offline_pre_pin_bootstrap_hash CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
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
  result_disposition jsonb NOT NULL,
  event_at timestamptz NOT NULL DEFAULT pg_catalog.transaction_timestamp(),
  CONSTRAINT offline_pre_pin_bootstrap_event_authority_fk
    FOREIGN KEY (bootstrap_id)
    REFERENCES afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2(bootstrap_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_pre_pin_bootstrap_event_generation CHECK (bootstrap_generation>0),
  CONSTRAINT offline_pre_pin_bootstrap_event_type CHECK (
    event_type IN ('pre_pin_online_bootstrap','pre_pin_online_refresh')),
  CONSTRAINT offline_pre_pin_bootstrap_event_hashes CHECK (
    request_sha256 ~ '^[0-9a-f]{64}$' AND evidence_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT offline_pre_pin_bootstrap_event_result CHECK (
    pg_catalog.jsonb_typeof(result_disposition)='object'),
  CONSTRAINT offline_pre_pin_bootstrap_operation_unique UNIQUE (operation_id)
);

CREATE INDEX offline_pre_pin_bootstrap_device_scope_idx
  ON afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
  (device_id,tenant_id,branch_id,device_generation);
CREATE INDEX offline_pre_pin_bootstrap_envelope_scope_idx
  ON afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
  (key_envelope_id,key_envelope_version,primary_authenticated_subject_id,
   tenant_id,branch_id,device_id,device_generation,namespace_generation);
CREATE INDEX offline_pre_pin_bootstrap_inventory_scope_idx
  ON afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
  (inventory_snapshot_id,tenant_id,branch_id);
CREATE INDEX offline_pre_pin_bootstrap_active_lookup_idx
  ON afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
  (primary_authenticated_subject_id,tenant_id,branch_id,device_id,status);
CREATE INDEX offline_pre_pin_bootstrap_event_bootstrap_idx
  ON afex_offline_authority.offline_pre_pin_bootstrap_events_v2(bootstrap_id);
CREATE INDEX offline_pre_pin_bootstrap_event_scope_time_idx
  ON afex_offline_authority.offline_pre_pin_bootstrap_events_v2
  (tenant_id,branch_id,device_id,event_at DESC);

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
  BEFORE UPDATE OR DELETE ON afex_offline_authority.offline_pre_pin_bootstrap_events_v2
  FOR EACH ROW EXECUTE FUNCTION afex_offline_authority.reject_immutable_offline_evidence_v1();

CREATE FUNCTION afex_offline_authority.pre_pin_context_matches_v2(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid
)
RETURNS boolean LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT afex_offline_authority.afex_current_auth_session_matches_v1(
    p_authenticated_subject_id,p_authenticated_session_id)
  AND EXISTS (
    SELECT 1 FROM public.profiles AS p
    JOIN public.branches AS b ON b.id=p_branch_id AND b.tenant_id=p_tenant_id
    WHERE p.id=p_authenticated_subject_id AND p.tenant_id=p_tenant_id
      AND p.is_active=true
      AND p.role IN ('owner','admin','manager','employee','cashier')
      AND (p.branch_id IS NULL OR p.branch_id=p_branch_id)
      AND b.is_active=true)
$fn$;

CREATE FUNCTION afex_offline_authority.provision_pre_pin_device_v2(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_mode text,
  p_proof_public_key_jwk jsonb,p_wrap_public_key_jwk jsonb,
  p_key_envelope_id uuid,p_wrapped_key_sha256 text,p_public_key_sha256 text,
  p_envelope_aad_sha256 text,p_envelope_ciphertext_sha256 text,
  p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
DECLARE
  d afex_offline_authority.offline_devices%ROWTYPE;
  k afex_offline_authority.offline_key_envelopes%ROWTYPE;
  activation_operation uuid;
  activation_hash text;
  derived_wrap_key_sha256 text;
BEGIN
  IF p_mode<>'MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE'
     OR p_wrapped_key_sha256 !~ '^[0-9a-f]{64}$'
     OR p_public_key_sha256 !~ '^[0-9a-f]{64}$'
     OR p_envelope_aad_sha256 !~ '^[0-9a-f]{64}$'
     OR p_envelope_ciphertext_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_DEVICE_SCHEMA_INVALID';
  END IF;
  derived_wrap_key_sha256:=pg_catalog.encode(public.digest(
    pg_catalog.convert_to(p_wrap_public_key_jwk->>'n','UTF8'),'sha256'),'hex');
  IF p_public_key_sha256<>derived_wrap_key_sha256 THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_DEVICE_PUBLIC_KEY_HASH_MISMATCH';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('afex-pre-pin-device:'||p_device_id::text,0));
  SELECT * INTO d FROM afex_offline_authority.offline_devices
  WHERE device_id=p_device_id FOR UPDATE;
  IF FOUND THEN
    IF d.tenant_id<>p_tenant_id OR d.branch_id<>p_branch_id
       OR d.registered_by_authenticated_subject_id<>p_primary_authenticated_subject_id
       OR d.mode<>p_mode
       OR d.device_proof_public_key_jwk<>p_proof_public_key_jwk
       OR d.device_wrap_public_key_jwk<>p_wrap_public_key_jwk
       OR pg_catalog.encode(public.digest(pg_catalog.convert_to(
            d.device_wrap_public_key_jwk->>'n','UTF8'),'sha256'),'hex')<>p_public_key_sha256
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
  IF pg_catalog.encode(public.digest(pg_catalog.convert_to(
       d.device_wrap_public_key_jwk->>'n','UTF8'),'sha256'),'hex')<>p_public_key_sha256 THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_DEVICE_STORED_PUBLIC_KEY_HASH_MISMATCH';
  END IF;

  SELECT * INTO k FROM afex_offline_authority.offline_key_envelopes
  WHERE key_envelope_id=p_key_envelope_id AND key_envelope_version=1 FOR UPDATE;
  IF FOUND THEN
    IF k.primary_authenticated_subject_id<>p_primary_authenticated_subject_id
       OR k.tenant_id<>p_tenant_id OR k.branch_id<>p_branch_id
       OR k.device_id<>p_device_id OR k.device_generation<>d.device_generation
       OR k.namespace_generation<>1 OR k.status<>'active' OR k.revoked_at IS NOT NULL
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
  WITH ranked AS (
    SELECT e.*,p.username,p.full_name,p.role,
      pg_catalog.row_number() OVER (PARTITION BY e.actual_pos_employee_id
        ORDER BY e.employee_enrollment_generation DESC,e.enrollment_id) AS enrollment_rank
    FROM afex_offline_authority.offline_employee_authorities AS e
    JOIN public.pos_profiles AS p ON p.id=e.actual_pos_employee_id
      AND p.tenant_id=e.tenant_id AND p.branch_id=e.branch_id
      AND p.is_active=true AND p.role IN ('admin','manager','employee','cashier')
    JOIN afex_offline_authority.offline_key_envelopes AS k
      ON k.key_envelope_id=e.key_envelope_id
      AND k.key_envelope_version=e.key_envelope_version
      AND k.primary_authenticated_subject_id=e.primary_authenticated_subject_id
      AND k.tenant_id=e.tenant_id AND k.branch_id=e.branch_id
      AND k.device_id=e.device_id AND k.device_generation=e.device_generation
      AND k.namespace_generation=e.namespace_generation
      AND k.status='active' AND k.revoked_at IS NULL
    WHERE e.primary_authenticated_subject_id=p_primary_authenticated_subject_id
      AND e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id
      AND e.device_id=p_device_id AND e.device_generation=d.device_generation
      AND e.status='active' AND e.revoked_at IS NULL
      AND e.revocation_generation=d.revocation_generation
      AND e.local_lock_state='unlocked' AND e.local_locked_at IS NULL
      AND e.failed_attempt_count BETWEEN 0 AND 5
      AND e.allowed_command_types=ARRAY['order.create']::text[]
  ), eligible AS (SELECT * FROM ranked WHERE enrollment_rank=1)
  SELECT pg_catalog.count(*)::integer,
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'employeeId',actual_pos_employee_id,'username',username,'fullName',full_name,
      'role',role,'branchId',branch_id,'enrolled',true,
      'enrollmentId',enrollment_id,'enrollmentGeneration',employee_enrollment_generation,
      'credentialGeneration',credential_generation,'permissionGeneration',permission_generation,
      'revocationGeneration',revocation_generation,'commandGeneration',command_generation,
      'pinVerifierAlgorithm',pin_verifier_algorithm,'pinVerifierVersion',pin_verifier_version,
      'pinVerifierIterations',pin_verifier_iterations,
      'pinVerifierSaltLength',pg_catalog.octet_length(pin_verifier_salt),
      'pinVerifierLength',pg_catalog.octet_length(pin_verifier_bytes),
      'pinVerifierSaltHex',pg_catalog.encode(pin_verifier_salt,'hex'),
      'pinVerifierHex',pg_catalog.encode(pin_verifier_bytes,'hex'))
      ORDER BY full_name,actual_pos_employee_id),'[]'::jsonb)
  INTO employee_count,roster FROM eligible;
  IF employee_count>25 THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_ROSTER_COUNT_EXCEEDS_25';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-pre-pin-roster.v2','employees',roster,
    'employeeCount',employee_count,'enrolledEmployeeCount',employee_count,
    'maximumEmployees',25,'containsPlaintextPin',false,
    'containsOfflinePinVerifier',true,'orderAcquisitionAuthorized',false);
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
  k afex_offline_authority.offline_key_envelopes%ROWTYPE;
  h afex_offline_authority.branch_inventory_snapshot_headers%ROWTYPE;
  b afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2%ROWTYPE;
  prior_event afex_offline_authority.offline_pre_pin_bootstrap_events_v2%ROWTYPE;
  request_hash text;
  event_kind text:='pre_pin_online_bootstrap';
  disposition jsonb;
BEGIN
  IF p_key_envelope_version<=0 OR p_namespace_generation<=0
     OR p_package_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_SCHEMA_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('afex-pre-pin-bootstrap:'||p_operation_id::text,0));

  /* Fresh authority is mandatory before replay; a stable receipt cannot revive
     a revoked session, device, envelope, or inventory authority. */
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
  SELECT * INTO k FROM afex_offline_authority.offline_key_envelopes
  WHERE key_envelope_id=p_key_envelope_id
    AND key_envelope_version=p_key_envelope_version
    AND primary_authenticated_subject_id=p_primary_authenticated_subject_id
    AND tenant_id=p_tenant_id AND branch_id=p_branch_id
    AND device_id=p_device_id AND device_generation=d.device_generation
    AND namespace_generation=p_namespace_generation
    AND status='active' AND revoked_at IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_ENVELOPE_INVALID'; END IF;
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

  SELECT * INTO prior_event
  FROM afex_offline_authority.offline_pre_pin_bootstrap_events_v2
  WHERE operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_event.request_sha256<>request_hash
       OR prior_event.primary_authenticated_subject_id<>p_primary_authenticated_subject_id
       OR prior_event.authenticated_session_id<>p_authenticated_session_id
       OR prior_event.tenant_id<>p_tenant_id OR prior_event.branch_id<>p_branch_id
       OR prior_event.device_id<>p_device_id THEN
      RAISE EXCEPTION 'AFEX_PRE_PIN_BOOTSTRAP_OPERATION_CONFLICT';
    END IF;
    RETURN prior_event.result_disposition;
  END IF;

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
      inventory_frontier_version,bootstrap_generation,status,package_sha256,online_verified_at
    ) VALUES(
      pg_catalog.gen_random_uuid(),p_primary_authenticated_subject_id,
      p_authenticated_session_id,p_tenant_id,p_branch_id,p_device_id,d.device_generation,
      p_key_envelope_id,p_key_envelope_version,p_namespace_generation,
      p_inventory_snapshot_id,h.frontier_version,1,'active',p_package_sha256,
      pg_catalog.transaction_timestamp()) RETURNING * INTO b;
  END IF;

  disposition:=pg_catalog.jsonb_build_object(
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
  INSERT INTO afex_offline_authority.offline_pre_pin_bootstrap_events_v2(
    bootstrap_id,operation_id,request_sha256,primary_authenticated_subject_id,
    authenticated_session_id,tenant_id,branch_id,device_id,bootstrap_generation,
    event_type,evidence_sha256,result_disposition
  ) VALUES(
    b.bootstrap_id,p_operation_id,request_hash,p_primary_authenticated_subject_id,
    p_authenticated_session_id,p_tenant_id,p_branch_id,p_device_id,
    b.bootstrap_generation,event_kind,p_evidence_sha256,disposition);
  RETURN disposition;
END
$fn$;

REVOKE ALL ON FUNCTION
  afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid),
  afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text),
  afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid),
  afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
FROM PUBLIC,anon,authenticated,service_role,
  afex_offline_acquisition_runtime,afex_offline_provisioning_runtime;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid),
  afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text),
  afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid),
  afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
TO afex_function_owner;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

/* CREATE is present only while afex_function_owner creates the public facades. */
GRANT CREATE ON SCHEMA public TO afex_function_owner;
GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET')
     OR NOT pg_catalog.has_schema_privilege('afex_function_owner','public','CREATE') THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_TEMP_FUNCTION_OWNER_AUTHORITY_FAILED';
  END IF;
END $afex$;
SET LOCAL ROLE afex_function_owner;

CREATE FUNCTION public.afex_offline_server_pre_pin_provision_device_v2(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_operation_id uuid,p_device_id uuid,
  p_mode text,p_proof_public_key_jwk jsonb,p_wrap_public_key_jwk jsonb,
  p_key_envelope_id uuid,p_wrapped_key_sha256 text,p_public_key_sha256 text,
  p_envelope_aad_sha256 text,p_envelope_ciphertext_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT afex_offline_authority.pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,p_tenant_id,p_branch_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_SERVER_CONTEXT_REJECTED';
  END IF;
  RETURN afex_offline_authority.provision_pre_pin_device_v2(
    p_operation_id,p_authenticated_subject_id,p_tenant_id,p_branch_id,p_device_id,
    p_mode,p_proof_public_key_jwk,p_wrap_public_key_jwk,p_key_envelope_id,
    p_wrapped_key_sha256,p_public_key_sha256,p_envelope_aad_sha256,
    p_envelope_ciphertext_sha256,p_evidence_sha256);
END $fn$;

CREATE FUNCTION public.afex_offline_server_pre_pin_employee_roster_v2(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT afex_offline_authority.pre_pin_context_matches_v2(
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
  IF NOT afex_offline_authority.pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,p_tenant_id,p_branch_id)
     OR NOT EXISTS (
       SELECT 1 FROM afex_offline_authority.offline_devices AS d
       WHERE d.device_id=p_device_id AND d.tenant_id=p_tenant_id
         AND d.branch_id=p_branch_id AND d.status='active' AND d.revoked_at IS NULL
         AND d.registered_by_authenticated_subject_id=p_authenticated_subject_id)
  THEN RAISE EXCEPTION 'AFEX_PRE_PIN_SERVER_DEVICE_CONTEXT_REJECTED'; END IF;
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
  IF NOT afex_offline_authority.pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,p_tenant_id,p_branch_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_SERVER_CONTEXT_REJECTED';
  END IF;
  RETURN afex_offline_authority.publish_pre_pin_account_bootstrap_v2(
    p_operation_id,p_authenticated_subject_id,p_authenticated_session_id,
    p_tenant_id,p_branch_id,p_device_id,p_key_envelope_id,p_key_envelope_version,
    p_namespace_generation,p_inventory_snapshot_id,p_package_sha256,p_evidence_sha256);
END $fn$;

REVOKE ALL ON FUNCTION
  public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
TO service_role;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM afex_function_owner;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$
DECLARE facts jsonb;
BEGIN
  WITH
  facade_functions(identity) AS (VALUES
    ('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)'),
    ('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)'),
    ('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
  ), private_functions(identity) AS (VALUES
    ('afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
  ), expected_indexes(name) AS (VALUES
    ('offline_pre_pin_bootstrap_device_scope_idx'),
    ('offline_pre_pin_bootstrap_envelope_scope_idx'),
    ('offline_pre_pin_bootstrap_inventory_scope_idx'),
    ('offline_pre_pin_bootstrap_active_lookup_idx'),
    ('offline_pre_pin_bootstrap_event_bootstrap_idx'),
    ('offline_pre_pin_bootstrap_event_scope_time_idx')
  ), current_memberships AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role',owner_role.rolname,'member',member_role.rolname,
      'grantor',pg_catalog.pg_get_userbyid(m.grantor),
      'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
      ORDER BY owner_role.rolname,pg_catalog.pg_get_userbyid(m.grantor)),'[]'::jsonb) AS value
    FROM pg_catalog.pg_auth_members AS m
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=m.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
    WHERE member_role.rolname='postgres'
      AND owner_role.rolname IN ('afex_offline_authority_owner','afex_function_owner')
  ), current_acquisition AS (
    SELECT pg_catalog.jsonb_build_object(
      'oid',p.oid,'owner',pg_catalog.pg_get_userbyid(p.proowner),
      'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,
      'definitionMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))) AS value
    FROM pg_catalog.pg_proc AS p WHERE p.oid=pg_catalog.to_regprocedure(
      'public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)')
  ), checks AS (
    SELECT
      CURRENT_USER='postgres' AND SESSION_USER='postgres' AS installer_restored,
      NOT pg_catalog.has_schema_privilege('afex_function_owner','public','CREATE') AS public_create_false_at_rest,
      (SELECT value FROM current_memberships)=pg_catalog.current_setting('afex.pre_pin_v2_memberships')::jsonb AS membership_topology_restored,
      (SELECT value FROM current_acquisition)=pg_catalog.current_setting('afex.pre_pin_v2_acquisition')::jsonb AS v1_acquisition_identity_unchanged,
      (SELECT pg_catalog.count(*)=4 FROM facade_functions
        WHERE pg_catalog.to_regprocedure(identity) IS NOT NULL) AS facade_count_exact,
      NOT EXISTS (SELECT 1 FROM facade_functions AS f
        JOIN pg_catalog.pg_proc AS p ON p.oid=pg_catalog.to_regprocedure(f.identity)
        WHERE pg_catalog.pg_get_userbyid(p.proowner)<>'afex_function_owner'
          OR NOT p.prosecdef OR p.proconfig<>ARRAY['search_path=pg_catalog']::text[]
          OR NOT pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
          OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
          OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
          OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
            p.proacl,pg_catalog.acldefault('f',p.proowner))) AS acl
            WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) AS facade_acl_exact,
      (SELECT pg_catalog.count(*)=4 FROM private_functions
        WHERE pg_catalog.to_regprocedure(identity) IS NOT NULL) AS private_count_exact,
      NOT EXISTS (SELECT 1 FROM private_functions AS f
        JOIN pg_catalog.pg_proc AS p ON p.oid=pg_catalog.to_regprocedure(f.identity)
        WHERE pg_catalog.pg_get_userbyid(p.proowner)<>'afex_offline_authority_owner'
          OR NOT p.prosecdef OR p.proconfig<>ARRAY['search_path=pg_catalog']::text[]
          OR NOT pg_catalog.has_function_privilege('afex_function_owner',p.oid,'EXECUTE')
          OR pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
          OR pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
          OR pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
          OR pg_catalog.has_function_privilege('afex_offline_acquisition_runtime',p.oid,'EXECUTE')
          OR pg_catalog.has_function_privilege('afex_offline_provisioning_runtime',p.oid,'EXECUTE')
          OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(
            p.proacl,pg_catalog.acldefault('f',p.proowner))) AS acl
            WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) AS private_acl_exact,
      (SELECT pg_catalog.count(*)=2 FROM pg_catalog.pg_class AS c
        WHERE c.oid IN (
          'afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2'::pg_catalog.regclass,
          'afex_offline_authority.offline_pre_pin_bootstrap_events_v2'::pg_catalog.regclass)
          AND pg_catalog.pg_get_userbyid(c.relowner)='afex_offline_authority_owner'
          AND c.relrowsecurity AND c.relforcerowsecurity) AS table_owner_rls_exact,
      NOT EXISTS (
        SELECT 1
        FROM (VALUES
          ('anon'),('authenticated'),('service_role'),
          ('afex_offline_acquisition_runtime'),('afex_offline_provisioning_runtime')
        ) AS role_name(name)
        CROSS JOIN (VALUES
          ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2'),
          ('afex_offline_authority.offline_pre_pin_bootstrap_events_v2')
        ) AS relation_name(name)
        WHERE pg_catalog.has_table_privilege(role_name.name,relation_name.name,'SELECT')
           OR pg_catalog.has_table_privilege(role_name.name,relation_name.name,'INSERT')
           OR pg_catalog.has_table_privilege(role_name.name,relation_name.name,'UPDATE')
           OR pg_catalog.has_table_privilege(role_name.name,relation_name.name,'DELETE')
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS c,
          LATERAL pg_catalog.aclexplode(COALESCE(
            c.relacl,pg_catalog.acldefault('r',c.relowner))) AS acl
        WHERE c.oid IN (
          'afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2'::pg_catalog.regclass,
          'afex_offline_authority.offline_pre_pin_bootstrap_events_v2'::pg_catalog.regclass)
          AND acl.grantee=0
      ) AND pg_catalog.has_table_privilege('afex_function_owner',
        'afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2','SELECT')
        AND NOT pg_catalog.has_table_privilege('afex_function_owner',
          'afex_offline_authority.offline_pre_pin_bootstrap_events_v2','SELECT')
        AS private_table_acl_exact,
      (SELECT pg_catalog.count(*)=3 FROM pg_catalog.pg_policy
        WHERE polrelid IN (
          'afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2'::pg_catalog.regclass,
          'afex_offline_authority.offline_pre_pin_bootstrap_events_v2'::pg_catalog.regclass))
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_policy
          WHERE polrelid='afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2'::pg_catalog.regclass
            AND polname='offline_pre_pin_bootstrap_owner_all_v2' AND polcmd='*'
            AND polroles=ARRAY[pg_catalog.to_regrole('afex_offline_authority_owner')::oid])
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_policy
          WHERE polrelid='afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2'::pg_catalog.regclass
            AND polname='offline_pre_pin_bootstrap_function_select_v2' AND polcmd='r'
            AND polroles=ARRAY[pg_catalog.to_regrole('afex_function_owner')::oid])
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_policy
          WHERE polrelid='afex_offline_authority.offline_pre_pin_bootstrap_events_v2'::pg_catalog.regclass
            AND polname='offline_pre_pin_bootstrap_events_owner_all_v2' AND polcmd='*'
            AND polroles=ARRAY[pg_catalog.to_regrole('afex_offline_authority_owner')::oid])
        AS policy_count_and_roles_exact,
      (SELECT pg_catalog.count(*)=1 FROM pg_catalog.pg_trigger
        WHERE tgrelid IN (
          'afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2'::pg_catalog.regclass,
          'afex_offline_authority.offline_pre_pin_bootstrap_events_v2'::pg_catalog.regclass)
          AND NOT tgisinternal)
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=
          'afex_offline_authority.offline_pre_pin_bootstrap_events_v2'::pg_catalog.regclass
          AND tgname='offline_pre_pin_bootstrap_events_immutable_v2' AND NOT tgisinternal)
        AS immutable_trigger_exact,
      (SELECT pg_catalog.count(*)=6 FROM expected_indexes AS expected
        JOIN pg_catalog.pg_class AS i ON i.relname=expected.name
        JOIN pg_catalog.pg_index AS x ON x.indexrelid=i.oid WHERE x.indisvalid) AS supporting_indexes_exact,
      pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','username','SELECT')
        AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','full_name','SELECT') AS roster_display_acl_exact,
      NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
        JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'afex_offline_server_pre_pin_%_v2'
          AND p.proname NOT IN ('afex_offline_server_pre_pin_provision_device_v2',
            'afex_offline_server_pre_pin_employee_roster_v2',
            'afex_offline_server_pre_pin_publish_inventory_v2',
            'afex_offline_server_pre_pin_bootstrap_v2')) AS no_extra_public_facades,
      NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
        WHERE p.oid IN (SELECT pg_catalog.to_regprocedure(identity) FROM private_functions)
          AND pg_catalog.pg_get_functiondef(p.oid) ~* 'acquire_order|dispatch|replay|cancel|refund') AS no_order_acquisition_path
  ) SELECT pg_catalog.to_jsonb(checks) INTO facts FROM checks;

  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(facts) AS item WHERE item.value='false'::jsonb) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_POST_ATTESTATION_FAILED:%',
      (SELECT pg_catalog.string_agg(item.key,',' ORDER BY item.key)
       FROM pg_catalog.jsonb_each(facts) AS item WHERE item.value='false'::jsonb);
  END IF;
  RAISE NOTICE 'AFEX_PRE_PIN_V2_POST_ATTESTATION_PASS:%',facts;
END
$afex$;

COMMIT;
