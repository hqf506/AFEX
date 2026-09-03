/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 2A: additive managed-device authority and immutable events.
No private key, PIN, access token, provider token or plaintext DEK is stored.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_offline_authority_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_2A_INSTALLER_OR_MEMBERSHIP_MISMATCH';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_2A_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_2A_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- Stop condition: any existing target identity or branch/tenant drift aborts this transaction.

-- FWD-05-001
CREATE TABLE afex_offline_authority.offline_devices (
  device_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  device_generation bigint NOT NULL,
  key_envelope_generation bigint NOT NULL,
  revocation_generation bigint NOT NULL,
  mode text NOT NULL,
  status text NOT NULL,
  device_proof_public_key_jwk jsonb NOT NULL,
  device_wrap_public_key_jwk jsonb NOT NULL,
  device_proof_key_sha256 text NOT NULL,
  device_wrap_key_sha256 text NOT NULL,
  device_proof_algorithm text NOT NULL,
  device_wrap_algorithm text NOT NULL,
  wrap_algorithm text NOT NULL,
  registered_by_authenticated_subject_id uuid NOT NULL,
  local_lock_generation bigint NOT NULL DEFAULT 0,
  local_locked_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  replaced_by_device_id uuid,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT offline_devices_branch_scope_fk
    FOREIGN KEY (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_devices_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_devices_subject_fk
    FOREIGN KEY (registered_by_authenticated_subject_id) REFERENCES public.profiles(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_devices_generation_positive
    CHECK (device_generation > 0 AND key_envelope_generation > 0 AND revocation_generation >= 0),
  CONSTRAINT offline_devices_mode_closed
    CHECK (mode IN ('MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE','MODE_B_NATIVE_OPTIONAL')),
  CONSTRAINT offline_devices_status_closed
    CHECK (status IN ('pending','active','local_locked','revoked','replaced','lost','purged')),
  CONSTRAINT offline_devices_key_hash_format
    CHECK (device_proof_key_sha256 ~ '^[0-9a-f]{64}$'
       AND device_wrap_key_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT offline_devices_key_algorithms
    CHECK (device_proof_algorithm = 'ECDSA-P256-SHA256'
       AND device_wrap_algorithm = 'RSA-OAEP-3072-SHA256'
       AND wrap_algorithm = 'RSA-OAEP-3072-SHA256'),
  CONSTRAINT offline_devices_public_key_shapes
    CHECK (pg_catalog.jsonb_typeof(device_proof_public_key_jwk) = 'object'
       AND pg_catalog.jsonb_typeof(device_wrap_public_key_jwk) = 'object'),
  CONSTRAINT offline_devices_local_lock_generation
    CHECK (local_lock_generation >= 0),
  CONSTRAINT offline_devices_state_times
    CHECK ((status = 'active' AND activated_at IS NOT NULL AND revoked_at IS NULL)
        OR (status = 'pending' AND activated_at IS NULL AND revoked_at IS NULL)
        OR (status = 'local_locked' AND activated_at IS NOT NULL
            AND revoked_at IS NULL AND local_locked_at IS NOT NULL)
        OR (status IN ('revoked','replaced','lost','purged') AND revoked_at IS NOT NULL)),
  CONSTRAINT offline_devices_replacement
    CHECK ((status = 'replaced') = (replaced_by_device_id IS NOT NULL)),
  CONSTRAINT offline_devices_self_replacement
    CHECK (replaced_by_device_id IS NULL OR replaced_by_device_id <> device_id),
  UNIQUE (device_id, tenant_id, branch_id),
  UNIQUE (device_id, tenant_id, branch_id, device_generation)
);
-- FWD-05-002: offline_devices is created directly by its final owner.
-- FWD-05-003
CREATE TABLE afex_offline_authority.offline_device_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  event_type text NOT NULL,
  operation_id uuid NOT NULL,
  request_sha256 text NOT NULL,
  device_generation bigint NOT NULL,
  revocation_generation bigint NOT NULL,
  actor_authenticated_subject_id uuid NOT NULL,
  reason_code text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  evidence_sha256 text NOT NULL,
  CONSTRAINT offline_device_events_device_scope_fk
    FOREIGN KEY (device_id)
    REFERENCES afex_offline_authority.offline_devices (device_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_device_events_generation_positive
    CHECK (device_generation > 0 AND revocation_generation >= 0),
  CONSTRAINT offline_device_events_type_closed
    CHECK (event_type IN ('registered','activated','local_locked','revoked','replaced','lost','purged')),
  CONSTRAINT offline_device_events_reason_bounded
    CHECK (char_length(reason_code) BETWEEN 1 AND 64),
  CONSTRAINT offline_device_events_evidence_hash
    CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'
       AND request_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (tenant_id, branch_id, operation_id)
);
-- FWD-05-004: offline_device_events is created directly by its final owner.
-- FWD-05-005
ALTER TABLE afex_offline_authority.offline_devices ENABLE ROW LEVEL SECURITY;
-- FWD-05-006
ALTER TABLE afex_offline_authority.offline_devices FORCE ROW LEVEL SECURITY;
-- FWD-05-007
ALTER TABLE afex_offline_authority.offline_device_events ENABLE ROW LEVEL SECURITY;
-- FWD-05-008
ALTER TABLE afex_offline_authority.offline_device_events FORCE ROW LEVEL SECURITY;

-- FWD-05-009
CREATE POLICY offline_devices_owner_all
  ON afex_offline_authority.offline_devices
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
-- FWD-05-010
CREATE POLICY offline_devices_function_owner_select
  ON afex_offline_authority.offline_devices
  FOR SELECT TO afex_function_owner USING (true);
-- FWD-05-011
CREATE POLICY offline_device_events_owner_all
  ON afex_offline_authority.offline_device_events
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);

-- FWD-05-012
REVOKE ALL ON afex_offline_authority.offline_devices,
  afex_offline_authority.offline_device_events
  FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime;
-- FWD-05-013
GRANT SELECT ON afex_offline_authority.offline_devices TO afex_function_owner;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_class AS c
       JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
       JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=c.relowner
       WHERE n.nspname='afex_offline_authority'
         AND c.relname IN ('offline_devices','offline_device_events')
         AND owner_role.rolname<>'afex_offline_authority_owner'
     ) OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class AS c
           JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
           WHERE n.nspname='afex_offline_authority'
             AND c.relname IN ('offline_devices','offline_device_events'))<>2 THEN
    RAISE EXCEPTION 'AFEX_WAVE_2A_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_2A_OWNER_CONTEXT_RESTORED';
END $afex$;
COMMIT;
