/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 2D.1: trusted immutable inventory snapshot publisher, created directly by
afex_offline_authority_owner. Dependencies: whole files 01A, 04C, 05A and 09.
The publisher reads authoritative inventory_stock rows and never mutates stock.
Emergency disablement: revoke EXECUTE from afex_offline_provisioning_runtime.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.to_regrole('afex_offline_provisioning_runtime') IS NULL
     OR pg_catalog.to_regclass('public.inventory_stock') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.branch_inventory_snapshot_headers') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_offline_authority_owner'
         AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) THEN
    RAISE EXCEPTION 'AFEX_INVENTORY_PUBLISHER_PRECONDITION_FAILED';
  END IF;
END $afex$;
GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN IF NOT pg_catalog.pg_has_role('postgres','afex_offline_authority_owner','SET') THEN RAISE EXCEPTION 'AFEX_WAVE_2D1_TEMPORARY_SET_ENABLE_FAILED'; END IF; END $afex$;
SET LOCAL ROLE afex_offline_authority_owner;
DO $afex$ BEGIN
  IF CURRENT_USER<>'afex_offline_authority_owner' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_2D1_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-09A-001: exact support policy is installed by whole-file Wave 04C.

-- FWD-09A-002
CREATE FUNCTION afex_offline_authority.publish_branch_inventory_snapshot_v1(
  p_snapshot_id uuid,
  p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_frontier_version text,
  p_confirmed_at timestamptz,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  canonical_items jsonb;
  expected_items jsonb;
  item_set_hash text;
  frontier_hash text;
  input_count integer;
  source_count integer;
  existing_header afex_offline_authority.branch_inventory_snapshot_headers%ROWTYPE;
BEGIN
  IF char_length(p_frontier_version) NOT BETWEEN 1 AND 64
     OR p_frontier_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
     OR pg_catalog.jsonb_typeof(p_items)<>'array' THEN
    RAISE EXCEPTION 'AFEX_INVENTORY_SNAPSHOT_SCHEMA_INVALID';
  END IF;
  input_count:=pg_catalog.jsonb_array_length(p_items);
  IF input_count<1 OR input_count>1000 THEN
    RAISE EXCEPTION 'AFEX_INVENTORY_SNAPSHOT_ITEM_COUNT_INVALID'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_items) AS x(item)
    WHERE pg_catalog.jsonb_typeof(x.item)<>'object'
       OR (SELECT pg_catalog.array_agg(k ORDER BY k)
           FROM pg_catalog.jsonb_object_keys(x.item) AS k)
          IS DISTINCT FROM ARRAY['catalogItemId','confirmedStock','stockUpdatedAt']::text[]
       OR (x.item->>'catalogItemId') !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR (x.item->>'confirmedStock') !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$'
       OR (x.item->>'stockUpdatedAt') IS NULL
  ) OR (SELECT pg_catalog.count(DISTINCT x.item->>'catalogItemId')
        FROM pg_catalog.jsonb_array_elements(p_items) AS x(item))<>input_count THEN
    RAISE EXCEPTION 'AFEX_INVENTORY_SNAPSHOT_ITEM_SCHEMA_OR_DUPLICATE_INVALID';
  END IF;
  PERFORM 1 FROM public.branches AS b
  WHERE b.id=p_branch_id AND b.tenant_id=p_tenant_id AND b.is_active=true;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id=p_primary_authenticated_subject_id AND p.tenant_id=p_tenant_id
      AND p.is_active=true AND (p.branch_id IS NULL OR p.branch_id=p_branch_id)
  ) THEN RAISE EXCEPTION 'AFEX_INVENTORY_SNAPSHOT_SCOPE_INVALID'; END IF;
  WITH source_rows AS (
    SELECT s.catalog_item_id,s.quantity_on_hand,s.updated_at
    FROM public.inventory_stock AS s
    WHERE s.tenant_id=p_tenant_id AND s.branch_id=p_branch_id
    ORDER BY s.catalog_item_id
  )
  SELECT pg_catalog.count(*),
    pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'catalogItemId',catalog_item_id,'confirmedStock',quantity_on_hand,
      'stockUpdatedAt',updated_at) ORDER BY catalog_item_id),'[]'::jsonb)
  INTO source_count,expected_items FROM source_rows;
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'catalogItemId',x.item->>'catalogItemId',
    'confirmedStock',(x.item->>'confirmedStock')::numeric,
    'stockUpdatedAt',(x.item->>'stockUpdatedAt')::timestamptz) ORDER BY x.item->>'catalogItemId')
  INTO canonical_items FROM pg_catalog.jsonb_array_elements(p_items) AS x(item);
  IF source_count<>input_count OR canonical_items IS DISTINCT FROM expected_items THEN
    RAISE EXCEPTION 'AFEX_INVENTORY_SNAPSHOT_MISSING_EXTRA_OR_CROSS_SCOPE_ITEM';
  END IF;
  item_set_hash:=pg_catalog.encode(public.digest(
    pg_catalog.convert_to(canonical_items::text,'UTF8'),'sha256'),'hex');
  frontier_hash:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('tenantId',p_tenant_id,'branchId',p_branch_id,
      'frontierVersion',p_frontier_version,'confirmedAt',p_confirmed_at,
      'itemSetSha256',item_set_hash)::text,'UTF8'),'sha256'),'hex');
  SELECT * INTO existing_header
  FROM afex_offline_authority.branch_inventory_snapshot_headers AS h
  WHERE h.snapshot_id=p_snapshot_id FOR KEY SHARE;
  IF FOUND THEN
    IF existing_header.tenant_id<>p_tenant_id OR existing_header.branch_id<>p_branch_id
       OR existing_header.frontier_version<>p_frontier_version
       OR existing_header.confirmed_at<>p_confirmed_at
       OR existing_header.item_set_sha256<>item_set_hash
       OR existing_header.frontier_sha256<>frontier_hash
       OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'catalogItemId',i.catalog_item_id,'confirmedStock',i.confirmed_stock,
             'stockUpdatedAt',(x.item->>'stockUpdatedAt')::timestamptz) ORDER BY i.catalog_item_id)
           FROM afex_offline_authority.branch_inventory_snapshot_items AS i
           JOIN pg_catalog.jsonb_array_elements(canonical_items) AS x(item)
             ON x.item->>'catalogItemId'=i.catalog_item_id::text
           WHERE i.snapshot_id=p_snapshot_id) IS DISTINCT FROM canonical_items THEN
      RAISE EXCEPTION 'AFEX_INVENTORY_SNAPSHOT_CONFLICTING_REPLAY';
    END IF;
    RETURN pg_catalog.jsonb_build_object('contractVersion','inventory-snapshot.v1',
      'status','stable_replay','snapshotId',p_snapshot_id,
      'frontierVersion',p_frontier_version,'itemCount',input_count,
      'itemSetSha256',item_set_hash,'frontierSha256',frontier_hash);
  END IF;
  INSERT INTO afex_offline_authority.branch_inventory_snapshot_headers(
    snapshot_id,tenant_id,branch_id,frontier_version,item_set_sha256,
    frontier_sha256,confirmed_at
  ) VALUES(p_snapshot_id,p_tenant_id,p_branch_id,p_frontier_version,
    item_set_hash,frontier_hash,p_confirmed_at);
  INSERT INTO afex_offline_authority.branch_inventory_snapshot_items(
    snapshot_id,tenant_id,branch_id,catalog_item_id,confirmed_stock
  ) SELECT p_snapshot_id,p_tenant_id,p_branch_id,
      (x.item->>'catalogItemId')::uuid,(x.item->>'confirmedStock')::numeric
    FROM pg_catalog.jsonb_array_elements(canonical_items) AS x(item);
  RETURN pg_catalog.jsonb_build_object('contractVersion','inventory-snapshot.v1',
    'status','published','snapshotId',p_snapshot_id,
    'frontierVersion',p_frontier_version,'itemCount',input_count,
    'itemSetSha256',item_set_hash,'frontierSha256',frontier_hash);
END $fn$;

-- FWD-09A-003
REVOKE ALL ON FUNCTION
  afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)
FROM PUBLIC, anon, authenticated, service_role, afex_offline_acquisition_runtime;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)
TO afex_offline_provisioning_runtime;

RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles g ON g.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE g.rolname='afex_offline_authority_owner' AND u.rolname='postgres' AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option)
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_WAVE_2D1_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_2D1_OWNER_CONTEXT_RESTORED';
END $afex$;
COMMIT;
