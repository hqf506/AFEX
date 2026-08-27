/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 3A, created directly by afex_offline_authority_owner under a bounded
postgres installer transaction.
Stop: any dependency/identity mismatch. Emergency: no runtime grant exists in
this wave. Rollback: DROP only when the relation is empty; otherwise retain as
security evidence. See SQL-AUTHORITY-FORWARD-DISABLEMENT-MATRIX.json.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $afex$
BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_offline_authority_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN RAISE EXCEPTION 'AFEX_WAVE_3A_INSTALLER_OR_MEMBERSHIP_MISMATCH'; END IF;
  IF pg_catalog.to_regclass('public.atomic_authorization_contexts') IS NULL
     OR pg_catalog.to_regclass('public.atomic_order_commands') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_devices') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_employee_authorities') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_key_envelopes') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_account_bootstrap_authorities') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.branch_inventory_snapshot_headers') IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_3A_DEPENDENCY_MISSING';
  END IF;
END
$afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_3A_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_3A_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-08A-001
CREATE TABLE afex_offline_authority.offline_command_bindings (
  authorization_context_id uuid PRIMARY KEY,
  server_command_id uuid NOT NULL UNIQUE,
  provenance_version text NOT NULL,
  current_uploader_authenticated_subject_id uuid NOT NULL,
  current_uploader_authenticated_session_id uuid NOT NULL,
  current_uploader_pos_actor_session_id uuid NOT NULL,
  origin_primary_authenticated_subject_id uuid NOT NULL,
  origin_bootstrap_id uuid NOT NULL,
  origin_bootstrap_generation bigint NOT NULL,
  origin_tenant_id uuid NOT NULL,
  origin_branch_id uuid NOT NULL,
  origin_device_id uuid NOT NULL,
  origin_device_generation bigint NOT NULL,
  origin_actual_pos_employee_id uuid NOT NULL,
  origin_enrollment_id uuid NOT NULL,
  origin_employee_enrollment_generation bigint NOT NULL,
  origin_command_generation bigint NOT NULL,
  origin_key_envelope_id uuid NOT NULL,
  origin_key_envelope_version bigint NOT NULL,
  origin_namespace_generation bigint NOT NULL,
  origin_authority_version text NOT NULL,
  inventory_snapshot_id uuid NOT NULL,
  inventory_frontier_version text NOT NULL,
  payment_attestation_command_id uuid NOT NULL,
  command_contract_version text NOT NULL,
  command_type text NOT NULL,
  local_command_id uuid NOT NULL UNIQUE,
  idempotency_key_hash bytea NOT NULL,
  payload_canonical_hash bytea NOT NULL,
  core_payload_canonical_hash bytea NOT NULL,
  payment_attestation_hash bytea NOT NULL,
  authority_binding_canonical_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT offline_command_bindings_context_scope_fk
    FOREIGN KEY (authorization_context_id,
                 current_uploader_authenticated_subject_id,
                 origin_tenant_id, origin_branch_id,
                 origin_actual_pos_employee_id)
    REFERENCES public.atomic_authorization_contexts
      (id, authenticated_actor_id, tenant_id, branch_id, employee_source_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_command_bindings_command_scope_fk
    FOREIGN KEY (server_command_id, authorization_context_id,
                 current_uploader_authenticated_subject_id,
                 origin_tenant_id, origin_branch_id)
    REFERENCES public.atomic_order_commands
      (id, authorization_context_id, authenticated_actor_id, tenant_id, branch_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_command_bindings_origin_device_fk
    FOREIGN KEY (origin_device_id)
    REFERENCES afex_offline_authority.offline_devices (device_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_command_bindings_origin_bootstrap_fk
    FOREIGN KEY (origin_bootstrap_id,origin_primary_authenticated_subject_id,
                 origin_tenant_id,origin_branch_id,origin_device_id)
    REFERENCES afex_offline_authority.offline_account_bootstrap_authorities
      (bootstrap_id,primary_authenticated_subject_id,tenant_id,branch_id,device_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_command_bindings_origin_enrollment_fk
    FOREIGN KEY (origin_enrollment_id)
    REFERENCES afex_offline_authority.offline_employee_authorities (enrollment_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_command_bindings_origin_key_fk
    FOREIGN KEY (origin_key_envelope_id, origin_key_envelope_version)
    REFERENCES afex_offline_authority.offline_key_envelopes
      (key_envelope_id,key_envelope_version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_command_bindings_snapshot_scope_fk
    FOREIGN KEY (inventory_snapshot_id, origin_tenant_id, origin_branch_id)
    REFERENCES afex_offline_authority.branch_inventory_snapshot_headers
      (snapshot_id, tenant_id, branch_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT offline_command_bindings_versions
    CHECK (provenance_version = 'afex-atomic-authorization-provenance.v2'
       AND command_contract_version = 'core-v2-offline-order-create.v2'
       AND origin_authority_version = 'afex-offline-origin-authority.v2'
       AND command_type = 'order.create'),
  CONSTRAINT offline_command_bindings_generations
    CHECK (origin_device_generation > 0
       AND origin_bootstrap_generation > 0
       AND origin_employee_enrollment_generation > 0
       AND origin_command_generation > 0
       AND origin_key_envelope_version > 0
       AND origin_namespace_generation > 0),
  CONSTRAINT offline_command_bindings_hashes
    CHECK (octet_length(idempotency_key_hash) = 32
       AND octet_length(payload_canonical_hash) = 32
       AND octet_length(core_payload_canonical_hash) = 32
       AND octet_length(payment_attestation_hash) = 32
       AND octet_length(authority_binding_canonical_hash) = 32)
);

-- FWD-08A-002
-- Created directly while CURRENT_USER is afex_offline_authority_owner.
-- FWD-08A-003
CREATE INDEX offline_command_bindings_origin_lookup_idx
  ON afex_offline_authority.offline_command_bindings
    (origin_tenant_id,origin_branch_id,origin_device_id,
     origin_bootstrap_id,origin_bootstrap_generation,
     origin_actual_pos_employee_id,origin_enrollment_id,origin_device_generation,
     origin_employee_enrollment_generation,origin_command_generation,
     origin_key_envelope_id,origin_key_envelope_version,
     origin_namespace_generation,server_command_id);
-- FWD-08A-004
CREATE INDEX offline_command_bindings_uploader_audit_idx
  ON afex_offline_authority.offline_command_bindings
    (current_uploader_authenticated_subject_id,
     current_uploader_authenticated_session_id,
     current_uploader_pos_actor_session_id,created_at DESC);
-- FWD-08A-005
ALTER TABLE afex_offline_authority.offline_command_bindings ENABLE ROW LEVEL SECURITY;
-- FWD-08A-006
ALTER TABLE afex_offline_authority.offline_command_bindings FORCE ROW LEVEL SECURITY;
-- FWD-08A-007
CREATE POLICY offline_command_bindings_owner_all
  ON afex_offline_authority.offline_command_bindings
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
-- FWD-08A-008
CREATE POLICY offline_command_bindings_function_owner_all
  ON afex_offline_authority.offline_command_bindings
  FOR ALL TO afex_function_owner USING (true) WITH CHECK (true);
-- FWD-08A-009
REVOKE ALL ON afex_offline_authority.offline_command_bindings
  FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime;
-- FWD-08A-010
GRANT SELECT, INSERT ON afex_offline_authority.offline_command_bindings
  TO afex_function_owner;

-- FWD-08A-011
CREATE FUNCTION afex_offline_authority.reject_offline_command_binding_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'AFEX_OFFLINE_COMMAND_BINDING_IMMUTABLE';
END
$fn$;
-- FWD-08A-012
-- Created directly while CURRENT_USER is afex_offline_authority_owner.
-- FWD-08A-013
REVOKE ALL ON FUNCTION
  afex_offline_authority.reject_offline_command_binding_mutation_v1()
  FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime;
-- FWD-08A-014
CREATE TRIGGER offline_command_bindings_immutable_guard
  BEFORE UPDATE OR DELETE ON afex_offline_authority.offline_command_bindings
  FOR EACH ROW EXECUTE FUNCTION
    afex_offline_authority.reject_offline_command_binding_mutation_v1();

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR pg_catalog.to_regclass('afex_offline_authority.offline_command_bindings') IS NULL
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.reject_offline_command_binding_mutation_v1()'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_3A_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_3A_OWNER_CONTEXT_RESTORED';
END
$afex$;
COMMIT;
