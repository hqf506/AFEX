/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 2C: device-bound Offline storage-envelope metadata.
Employee PIN verification is not part of this key hierarchy and never derives,
wraps or unwraps the business-data DEK. The exact client ciphertext
representation remains a later disabled client-runtime implementation contract.
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
    RAISE EXCEPTION 'AFEX_WAVE_2C_INSTALLER_OR_MEMBERSHIP_MISMATCH';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_2C_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_2C_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-07-001
CREATE TABLE afex_offline_authority.offline_key_envelopes (
  key_envelope_id uuid NOT NULL,
  key_envelope_version bigint NOT NULL,
  primary_authenticated_subject_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  device_id uuid NOT NULL,
  device_generation bigint NOT NULL,
  key_generation bigint NOT NULL,
  revocation_generation bigint NOT NULL,
  namespace_generation bigint NOT NULL,
  envelope_schema_version smallint NOT NULL,
  wrap_algorithm text NOT NULL,
  content_algorithm text NOT NULL,
  canonical_aad_sha256 text NOT NULL,
  wrapped_dek_ciphertext_sha256 text NOT NULL,
  encrypted_envelope_sha256 text NOT NULL,
  device_wrap_key_sha256 text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  revoked_at timestamptz,
  replaced_by_key_envelope_id uuid,
  replaced_by_key_envelope_version bigint,
  PRIMARY KEY (key_envelope_id, key_envelope_version),
  CONSTRAINT offline_key_envelopes_device_scope_fk
    FOREIGN KEY (device_id)
    REFERENCES afex_offline_authority.offline_devices (device_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_key_envelopes_subject_fk
    FOREIGN KEY (primary_authenticated_subject_id) REFERENCES public.profiles(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_key_envelopes_generations
    CHECK (key_envelope_version > 0 AND device_generation > 0
       AND key_generation > 0 AND revocation_generation >= 0
       AND namespace_generation > 0 AND envelope_schema_version = 1),
  CONSTRAINT offline_key_envelopes_algorithms
    CHECK (wrap_algorithm = 'RSA-OAEP-3072-SHA256'
       AND content_algorithm = 'AES-256-GCM'),
  CONSTRAINT offline_key_envelopes_hashes
    CHECK (canonical_aad_sha256 ~ '^[0-9a-f]{64}$'
       AND wrapped_dek_ciphertext_sha256 ~ '^[0-9a-f]{64}$'
       AND encrypted_envelope_sha256 ~ '^[0-9a-f]{64}$'
       AND device_wrap_key_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT offline_key_envelopes_status
    CHECK (status IN ('active','revoked','replaced','purged')),
  CONSTRAINT offline_key_envelopes_state_time
    CHECK ((status = 'active' AND revoked_at IS NULL)
        OR (status IN ('revoked','replaced','purged') AND revoked_at IS NOT NULL)),
  CONSTRAINT offline_key_envelopes_replacement
    CHECK ((status = 'replaced') =
      (replaced_by_key_envelope_id IS NOT NULL
       AND replaced_by_key_envelope_version IS NOT NULL)),
  UNIQUE (key_envelope_id, key_envelope_version, primary_authenticated_subject_id,
          tenant_id, branch_id, device_id, device_generation,
          namespace_generation),
  UNIQUE (key_envelope_id, key_envelope_version, primary_authenticated_subject_id,
          tenant_id, branch_id, device_id, device_generation,
          key_generation, revocation_generation, namespace_generation)
);
-- FWD-07-002
-- Created directly while CURRENT_USER is afex_offline_authority_owner.

-- FWD-07-003
ALTER TABLE afex_offline_authority.offline_employee_authorities
  ADD CONSTRAINT offline_employee_authorities_device_envelope_scope_fk
  FOREIGN KEY (key_envelope_id, key_envelope_version, primary_authenticated_subject_id,
               tenant_id, branch_id, device_id, device_generation,
               namespace_generation)
  REFERENCES afex_offline_authority.offline_key_envelopes
    (key_envelope_id, key_envelope_version, primary_authenticated_subject_id,
     tenant_id, branch_id, device_id, device_generation,
     namespace_generation)
  DEFERRABLE INITIALLY DEFERRED;

-- FWD-07-004
ALTER TABLE afex_offline_authority.offline_key_envelopes ENABLE ROW LEVEL SECURITY;
-- FWD-07-005
ALTER TABLE afex_offline_authority.offline_key_envelopes FORCE ROW LEVEL SECURITY;
-- FWD-07-006
CREATE POLICY offline_key_envelopes_owner_all
  ON afex_offline_authority.offline_key_envelopes
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
-- FWD-07-007
CREATE POLICY offline_key_envelopes_function_owner_select
  ON afex_offline_authority.offline_key_envelopes
  FOR SELECT TO afex_function_owner USING (true);

-- FWD-07-008
REVOKE ALL ON afex_offline_authority.offline_key_envelopes
  FROM PUBLIC, anon, authenticated, service_role,
       afex_offline_acquisition_runtime, afex_offline_provisioning_runtime;
-- FWD-07-009
GRANT SELECT ON afex_offline_authority.offline_key_envelopes TO afex_function_owner;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR pg_catalog.to_regclass('afex_offline_authority.offline_key_envelopes') IS NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_attribute AS a
       WHERE a.attrelid = 'afex_offline_authority.offline_key_envelopes'::regclass
         AND a.attname LIKE 'pin_%' AND NOT a.attisdropped
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_2C_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_2C_OWNER_CONTEXT_RESTORED';
END $afex$;

COMMIT;
