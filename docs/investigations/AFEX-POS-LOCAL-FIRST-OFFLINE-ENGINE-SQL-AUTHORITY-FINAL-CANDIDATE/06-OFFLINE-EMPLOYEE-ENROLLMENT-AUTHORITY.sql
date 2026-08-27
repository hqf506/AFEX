/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 2B: additive pre-enrolled employee-selection authority and immutable events.
The PIN verifier selects an employee only. It never unwraps or derives a business-data DEK.
No plaintext/reversible PIN or unsalted SHA-256 verifier is stored. There is no time-based expiry.
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
    RAISE EXCEPTION 'AFEX_WAVE_2B_INSTALLER_OR_MEMBERSHIP_MISMATCH';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_2B_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_2B_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-06-001
CREATE TABLE afex_offline_authority.offline_employee_authorities (
  enrollment_id uuid PRIMARY KEY,
  device_id uuid NOT NULL,
  device_generation bigint NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  primary_authenticated_subject_id uuid NOT NULL,
  actual_pos_employee_id uuid NOT NULL,
  employee_enrollment_generation bigint NOT NULL,
  credential_generation bigint NOT NULL,
  permission_generation bigint NOT NULL,
  revocation_generation bigint NOT NULL,
  command_generation bigint NOT NULL,
  key_envelope_id uuid NOT NULL,
  key_envelope_version bigint NOT NULL,
  namespace_generation bigint NOT NULL,
  status text NOT NULL,
  allowed_command_types text[] NOT NULL,
  allowed_dataset_ids text[] NOT NULL,
  pin_verifier_algorithm text NOT NULL,
  pin_verifier_iterations integer NOT NULL,
  pin_verifier_salt bytea NOT NULL,
  pin_verifier_bytes bytea NOT NULL,
  pin_verifier_version smallint NOT NULL,
  failed_attempt_count smallint NOT NULL DEFAULT 0,
  local_lock_generation bigint NOT NULL DEFAULT 0,
  local_lock_state text NOT NULL DEFAULT 'unlocked',
  local_locked_at timestamptz,
  package_sha256 text NOT NULL,
  enrolled_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  revoked_at timestamptz,
  replaced_by_enrollment_id uuid,
  CONSTRAINT offline_employee_authorities_device_scope_fk
    FOREIGN KEY (device_id)
    REFERENCES afex_offline_authority.offline_devices (device_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_employee_authorities_subject_fk
    FOREIGN KEY (primary_authenticated_subject_id) REFERENCES public.profiles(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_employee_authorities_generations
    CHECK (device_generation > 0 AND employee_enrollment_generation > 0
       AND credential_generation > 0
       AND permission_generation > 0
       AND revocation_generation >= 0
       AND command_generation > 0
       AND key_envelope_version > 0
       AND namespace_generation > 0),
  CONSTRAINT offline_employee_authorities_status
    CHECK (status IN ('active','revoked','replaced','removed')),
  CONSTRAINT offline_employee_authorities_state_time
    CHECK ((status = 'active' AND revoked_at IS NULL)
        OR (status IN ('revoked','replaced','removed') AND revoked_at IS NOT NULL)),
  CONSTRAINT offline_employee_authorities_replacement
    CHECK ((status = 'replaced') = (replaced_by_enrollment_id IS NOT NULL)),
  CONSTRAINT offline_employee_authorities_command_allowlist
    CHECK (allowed_command_types = ARRAY['order.create']::text[]),
  CONSTRAINT offline_employee_authorities_pin_verifier
    CHECK (pin_verifier_algorithm = 'PBKDF2-HMAC-SHA256'
       AND pin_verifier_iterations = 600000
       AND pg_catalog.octet_length(pin_verifier_salt) = 32
       AND pg_catalog.octet_length(pin_verifier_bytes) = 32
       AND pin_verifier_version = 1),
  CONSTRAINT offline_employee_authorities_attempt_state
    CHECK (failed_attempt_count BETWEEN 0 AND 5
       AND local_lock_generation >= 0
       AND local_lock_state IN ('unlocked','employee_locked','device_locked')
       AND ((local_lock_state = 'unlocked' AND local_locked_at IS NULL)
         OR (local_lock_state <> 'unlocked' AND local_locked_at IS NOT NULL))),
  CONSTRAINT offline_employee_authorities_hashes
    CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (device_id, device_generation, actual_pos_employee_id,
          employee_enrollment_generation),
  UNIQUE (device_id, tenant_id, branch_id, device_generation, actual_pos_employee_id,
          employee_enrollment_generation, command_generation),
  UNIQUE (enrollment_id, device_id, tenant_id, branch_id, device_generation,
          actual_pos_employee_id, employee_enrollment_generation,
          command_generation),
  UNIQUE (pin_verifier_salt)
);
-- FWD-06-002
-- Created directly while CURRENT_USER is afex_offline_authority_owner.

-- FWD-06-003
CREATE TABLE afex_offline_authority.offline_employee_authority_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL,
  device_id uuid NOT NULL,
  device_generation bigint NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  actual_pos_employee_id uuid NOT NULL,
  event_type text NOT NULL,
  operation_id uuid NOT NULL,
  request_sha256 text NOT NULL,
  employee_enrollment_generation bigint NOT NULL,
  command_generation bigint NOT NULL,
  actor_authenticated_subject_id uuid NOT NULL,
  reason_code text NOT NULL,
  evidence_sha256 text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT offline_employee_events_enrollment_scope_fk
    FOREIGN KEY (enrollment_id)
    REFERENCES afex_offline_authority.offline_employee_authorities (enrollment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_employee_events_type
    CHECK (event_type IN ('enrolled','selected','selection_failed','local_locked',
                         'permission_changed','credential_changed',
                         'revoked','replaced','removed')),
  CONSTRAINT offline_employee_events_generations
    CHECK (device_generation > 0 AND employee_enrollment_generation > 0
       AND command_generation > 0),
  CONSTRAINT offline_employee_events_reason
    CHECK (char_length(reason_code) BETWEEN 1 AND 64),
  CONSTRAINT offline_employee_events_hash
    CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'
       AND request_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (tenant_id, branch_id, device_id, operation_id)
);
-- FWD-06-004
-- Created directly while CURRENT_USER is afex_offline_authority_owner.

-- FWD-06-005
ALTER TABLE afex_offline_authority.offline_employee_authorities ENABLE ROW LEVEL SECURITY;
-- FWD-06-006
ALTER TABLE afex_offline_authority.offline_employee_authorities FORCE ROW LEVEL SECURITY;
-- FWD-06-007
ALTER TABLE afex_offline_authority.offline_employee_authority_events ENABLE ROW LEVEL SECURITY;
-- FWD-06-008
ALTER TABLE afex_offline_authority.offline_employee_authority_events FORCE ROW LEVEL SECURITY;

-- FWD-06-009
CREATE POLICY offline_employee_authorities_owner_all
  ON afex_offline_authority.offline_employee_authorities
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
-- FWD-06-010
CREATE POLICY offline_employee_authorities_function_owner_select
  ON afex_offline_authority.offline_employee_authorities
  FOR SELECT TO afex_function_owner USING (true);
-- FWD-06-011
CREATE POLICY offline_employee_events_owner_all
  ON afex_offline_authority.offline_employee_authority_events
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);

-- FWD-06-012
REVOKE ALL ON afex_offline_authority.offline_employee_authorities,
  afex_offline_authority.offline_employee_authority_events
  FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime;
-- FWD-06-013
GRANT SELECT ON afex_offline_authority.offline_employee_authorities TO afex_function_owner;

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
         AND c.relname IN ('offline_employee_authorities','offline_employee_authority_events')
         AND owner_role.rolname<>'afex_offline_authority_owner'
     ) OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class AS c
           JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
           WHERE n.nspname='afex_offline_authority'
             AND c.relname IN ('offline_employee_authorities','offline_employee_authority_events'))<>2 THEN
    RAISE EXCEPTION 'AFEX_WAVE_2B_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_2B_OWNER_CONTEXT_RESTORED';
END $afex$;
COMMIT;
