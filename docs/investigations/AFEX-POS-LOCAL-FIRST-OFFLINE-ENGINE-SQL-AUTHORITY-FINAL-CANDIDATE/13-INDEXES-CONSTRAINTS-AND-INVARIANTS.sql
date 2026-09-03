/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 2E: bounded equality-first indexes and fail-closed immutable/capacity guards.
No CONCURRENTLY statement appears inside this transaction; every index targets a new,
empty-at-install relation and is built before runtime activation.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_offline_authority_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN RAISE EXCEPTION 'AFEX_WAVE_2E_INSTALLER_OR_MEMBERSHIP_MISMATCH'; END IF;
  IF pg_catalog.to_regclass('afex_offline_authority.offline_devices') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_employee_authorities') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_key_envelopes') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.branch_inventory_snapshot_headers') IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_2E_DEPENDENCY_MISSING';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_2E_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_2E_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-13-001
CREATE UNIQUE INDEX offline_devices_one_active_branch_uidx
  ON afex_offline_authority.offline_devices (tenant_id,branch_id)
  WHERE status = 'active' AND revoked_at IS NULL;
-- FWD-13-002
CREATE INDEX offline_devices_authority_lookup_idx
  ON afex_offline_authority.offline_devices
    (tenant_id,branch_id,device_id,device_generation,status);
-- FWD-13-003
CREATE INDEX offline_devices_revocation_idx
  ON afex_offline_authority.offline_devices
    (tenant_id,branch_id,status,revoked_at,device_id)
  WHERE status <> 'active';

-- FWD-13-004
CREATE UNIQUE INDEX offline_employee_one_active_generation_uidx
  ON afex_offline_authority.offline_employee_authorities
    (device_id,device_generation,actual_pos_employee_id,
     employee_enrollment_generation)
  WHERE status = 'active' AND revoked_at IS NULL;
-- FWD-13-005
CREATE INDEX offline_employee_authority_lookup_idx
  ON afex_offline_authority.offline_employee_authorities
    (tenant_id,branch_id,device_id,device_generation,actual_pos_employee_id,
     employee_enrollment_generation,command_generation,status);
-- FWD-13-006
CREATE INDEX offline_employee_revocation_idx
  ON afex_offline_authority.offline_employee_authorities
    (tenant_id,branch_id,status,revoked_at,enrollment_id)
  WHERE status <> 'active';

-- FWD-13-007
CREATE UNIQUE INDEX offline_key_one_active_version_uidx
  ON afex_offline_authority.offline_key_envelopes
    (primary_authenticated_subject_id,tenant_id,branch_id,device_id,
     namespace_generation)
  WHERE status = 'active' AND revoked_at IS NULL;
-- FWD-13-008
CREATE INDEX offline_key_authority_lookup_idx
  ON afex_offline_authority.offline_key_envelopes
    (primary_authenticated_subject_id,tenant_id,branch_id,device_id,
     device_generation,key_generation,revocation_generation,
     namespace_generation,key_envelope_id,key_envelope_version,status);

-- FWD-13-009
CREATE INDEX branch_inventory_snapshot_latest_idx
  ON afex_offline_authority.branch_inventory_snapshot_headers
    (tenant_id,branch_id,confirmed_at DESC,snapshot_id);
-- FWD-13-010
CREATE INDEX branch_inventory_snapshot_items_scope_idx
  ON afex_offline_authority.branch_inventory_snapshot_items
    (tenant_id,branch_id,catalog_item_id,snapshot_id);

-- FWD-13-011
CREATE INDEX offline_device_events_device_time_idx
  ON afex_offline_authority.offline_device_events
    (tenant_id,branch_id,device_id,event_at,event_id);
-- FWD-13-012
CREATE INDEX offline_employee_events_enrollment_time_idx
  ON afex_offline_authority.offline_employee_authority_events
    (tenant_id,branch_id,device_id,enrollment_id,event_at,event_id);

-- FWD-13-013
CREATE FUNCTION afex_offline_authority.reject_immutable_offline_evidence_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION 'AFEX_OFFLINE_EVIDENCE_IMMUTABLE:%', TG_TABLE_NAME;
END
$fn$;
-- Created directly while CURRENT_USER is afex_offline_authority_owner.
REVOKE ALL ON FUNCTION
  afex_offline_authority.reject_immutable_offline_evidence_v1()
  FROM PUBLIC, anon, authenticated, service_role,
       afex_offline_acquisition_runtime, afex_function_owner;

-- FWD-13-014
CREATE TRIGGER offline_device_events_immutable_guard
  BEFORE UPDATE OR DELETE ON afex_offline_authority.offline_device_events
  FOR EACH ROW EXECUTE FUNCTION
    afex_offline_authority.reject_immutable_offline_evidence_v1();
-- FWD-13-015
CREATE TRIGGER offline_employee_events_immutable_guard
  BEFORE UPDATE OR DELETE
  ON afex_offline_authority.offline_employee_authority_events
  FOR EACH ROW EXECUTE FUNCTION
    afex_offline_authority.reject_immutable_offline_evidence_v1();
-- FWD-13-016
CREATE TRIGGER branch_inventory_snapshot_headers_immutable_guard
  BEFORE UPDATE OR DELETE
  ON afex_offline_authority.branch_inventory_snapshot_headers
  FOR EACH ROW EXECUTE FUNCTION
    afex_offline_authority.reject_immutable_offline_evidence_v1();
-- FWD-13-017
CREATE TRIGGER branch_inventory_snapshot_items_immutable_guard
  BEFORE UPDATE OR DELETE
  ON afex_offline_authority.branch_inventory_snapshot_items
  FOR EACH ROW EXECUTE FUNCTION
    afex_offline_authority.reject_immutable_offline_evidence_v1();

-- FWD-13-018
CREATE FUNCTION afex_offline_authority.enforce_enrollment_capacity_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE active_count integer;
BEGIN
  PERFORM 1 FROM afex_offline_authority.offline_devices AS d
  WHERE d.device_id = NEW.device_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AFEX_OFFLINE_DEVICE_NOT_FOUND';
  END IF;
  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' THEN
      SELECT pg_catalog.count(*) INTO active_count
      FROM afex_offline_authority.offline_employee_authorities AS e
      WHERE e.device_id = NEW.device_id
        AND e.status = 'active' AND e.revoked_at IS NULL;
    ELSE
      SELECT pg_catalog.count(*) INTO active_count
      FROM afex_offline_authority.offline_employee_authorities AS e
      WHERE e.device_id = NEW.device_id
        AND e.status = 'active' AND e.revoked_at IS NULL
        AND e.enrollment_id <> OLD.enrollment_id;
    END IF;
    IF active_count >= 25 THEN
      RAISE EXCEPTION 'AFEX_OFFLINE_ENROLLMENT_CAPACITY_EXCEEDED';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
-- Created directly while CURRENT_USER is afex_offline_authority_owner.
REVOKE ALL ON FUNCTION
  afex_offline_authority.enforce_enrollment_capacity_v1()
  FROM PUBLIC, anon, authenticated, service_role,
       afex_offline_acquisition_runtime, afex_function_owner;
-- FWD-13-019
CREATE TRIGGER offline_employee_authorities_capacity_guard
  BEFORE INSERT OR UPDATE OF status,device_id
  ON afex_offline_authority.offline_employee_authorities
  FOR EACH ROW EXECUTE FUNCTION
    afex_offline_authority.enforce_enrollment_capacity_v1();

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.reject_immutable_offline_evidence_v1()'
     ) IS NULL OR pg_catalog.to_regprocedure(
       'afex_offline_authority.enforce_enrollment_capacity_v1()'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_2E_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_2E_OWNER_CONTEXT_RESTORED';
END $afex$;

COMMIT;
