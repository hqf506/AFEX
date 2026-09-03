/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Exact Wave 2D: additive immutable branch inventory snapshots. No stock mutation authority.
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
    RAISE EXCEPTION 'AFEX_WAVE_2D_INSTALLER_OR_MEMBERSHIP_MISMATCH';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_2D_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_2D_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-09-001
CREATE TABLE afex_offline_authority.branch_inventory_snapshot_headers (
  snapshot_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  frontier_version text NOT NULL,
  item_set_sha256 text NOT NULL,
  frontier_sha256 text NOT NULL,
  confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT branch_inventory_snapshot_headers_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT branch_inventory_snapshot_headers_branch_scope_fk
    FOREIGN KEY (branch_id, tenant_id) REFERENCES public.branches(id, tenant_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT branch_inventory_snapshot_headers_version
    CHECK (char_length(frontier_version) BETWEEN 1 AND 64
       AND frontier_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  CONSTRAINT branch_inventory_snapshot_headers_hashes
    CHECK (item_set_sha256 ~ '^[0-9a-f]{64}$'
       AND frontier_sha256 ~ '^[0-9a-f]{64}$'),
  UNIQUE (snapshot_id, tenant_id, branch_id)
);
-- FWD-09-002
-- Created directly while CURRENT_USER is afex_offline_authority_owner.

-- FWD-09-003
CREATE TABLE afex_offline_authority.branch_inventory_snapshot_items (
  snapshot_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  catalog_item_id uuid NOT NULL,
  confirmed_stock numeric(18,3) NOT NULL,
  PRIMARY KEY (snapshot_id, catalog_item_id),
  CONSTRAINT branch_inventory_snapshot_items_header_fk
    FOREIGN KEY (snapshot_id, tenant_id, branch_id)
    REFERENCES afex_offline_authority.branch_inventory_snapshot_headers
      (snapshot_id, tenant_id, branch_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT branch_inventory_snapshot_items_catalog_scope_fk
    FOREIGN KEY (catalog_item_id, tenant_id)
    REFERENCES public.catalog_items(id, tenant_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT branch_inventory_snapshot_items_nonnegative
    CHECK (confirmed_stock >= 0)
);
-- FWD-09-004
-- Created directly while CURRENT_USER is afex_offline_authority_owner.

-- FWD-09-005
ALTER TABLE afex_offline_authority.branch_inventory_snapshot_headers ENABLE ROW LEVEL SECURITY;
-- FWD-09-006
ALTER TABLE afex_offline_authority.branch_inventory_snapshot_headers FORCE ROW LEVEL SECURITY;
-- FWD-09-007
ALTER TABLE afex_offline_authority.branch_inventory_snapshot_items ENABLE ROW LEVEL SECURITY;
-- FWD-09-008
ALTER TABLE afex_offline_authority.branch_inventory_snapshot_items FORCE ROW LEVEL SECURITY;
-- FWD-09-009
CREATE POLICY branch_inventory_snapshot_headers_owner_all
  ON afex_offline_authority.branch_inventory_snapshot_headers
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
-- FWD-09-010
CREATE POLICY branch_inventory_snapshot_headers_function_owner_select
  ON afex_offline_authority.branch_inventory_snapshot_headers
  FOR SELECT TO afex_function_owner USING (true);
-- FWD-09-011
CREATE POLICY branch_inventory_snapshot_items_owner_all
  ON afex_offline_authority.branch_inventory_snapshot_items
  FOR ALL TO afex_offline_authority_owner USING (true) WITH CHECK (true);
-- FWD-09-012
CREATE POLICY branch_inventory_snapshot_items_function_owner_select
  ON afex_offline_authority.branch_inventory_snapshot_items
  FOR SELECT TO afex_function_owner USING (true);

-- FWD-09-013
REVOKE ALL ON afex_offline_authority.branch_inventory_snapshot_headers,
  afex_offline_authority.branch_inventory_snapshot_items
  FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime;
-- FWD-09-014
GRANT SELECT ON afex_offline_authority.branch_inventory_snapshot_headers,
  afex_offline_authority.branch_inventory_snapshot_items
  TO afex_function_owner;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR pg_catalog.to_regclass('afex_offline_authority.branch_inventory_snapshot_headers') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.branch_inventory_snapshot_items') IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_2D_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_2D_OWNER_CONTEXT_RESTORED';
END $afex$;

COMMIT;
