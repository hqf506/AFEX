/*
AFEX POS Offline pre-PIN provisioning v2 — read-only Production preflight.
REVIEWED FOR MANUAL EXECUTION ONLY. This file performs no writes and ends in ROLLBACK.
Run as the bounded postgres installer before 01-ADD-PRE-PIN-PROVISIONING-V2.sql.
*/
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH expected_relations(identity,expected_owner) AS (
  VALUES
    ('public.profiles','postgres'),
    ('public.pos_profiles','postgres'),
    ('public.branches','postgres'),
    ('afex_offline_authority.offline_devices','afex_offline_authority_owner'),
    ('afex_offline_authority.offline_employee_authorities','afex_offline_authority_owner'),
    ('afex_offline_authority.offline_key_envelopes','afex_offline_authority_owner'),
    ('afex_offline_authority.branch_inventory_snapshot_headers','afex_offline_authority_owner')
),
expected_functions(identity,expected_owner) AS (
  VALUES
    ('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)','afex_offline_authority_owner'),
    ('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)','afex_offline_authority_owner'),
    ('afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)','afex_offline_authority_owner'),
    ('afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)','postgres'),
    ('public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)','afex_function_owner')
),
new_functions(identity) AS (
  VALUES
    ('afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)'),
    ('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)'),
    ('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)'),
    ('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
),
installer_memberships AS (
  SELECT owner_role.rolname AS role_name,
         pg_catalog.pg_get_userbyid(m.grantor) AS grantor,
         m.admin_option,m.inherit_option,m.set_option
  FROM pg_catalog.pg_auth_members AS m
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=m.roleid
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
  WHERE member_role.rolname='postgres'
    AND owner_role.rolname IN ('afex_offline_authority_owner','afex_function_owner')
),
facts AS (
  SELECT
    pg_catalog.current_database()='postgres' AS exact_database,
    CURRENT_USER='postgres' AND SESSION_USER='postgres' AS exact_installer_identity,
    pg_catalog.current_setting('server_version_num')='170006' AS exact_postgresql_17_6,
    (SELECT pg_catalog.count(*)=5 FROM pg_catalog.pg_roles
      WHERE rolname IN ('afex_offline_authority_owner','afex_function_owner',
        'afex_offline_provisioning_runtime','afex_offline_acquisition_runtime','service_role')) AS exact_roles_exist,
    (SELECT pg_catalog.count(*)=1 AND pg_catalog.bool_and(admin_option AND NOT inherit_option AND NOT set_option)
      FROM installer_memberships WHERE role_name='afex_offline_authority_owner') AS authority_owner_membership_at_rest,
    (SELECT pg_catalog.count(*)=1 AND pg_catalog.bool_and(admin_option AND NOT inherit_option AND NOT set_option)
      FROM installer_memberships WHERE role_name='afex_function_owner') AS function_owner_membership_at_rest,
    pg_catalog.has_schema_privilege('postgres','public','CREATE')
      AND pg_catalog.pg_has_role('postgres','pg_database_owner','USAGE') AS postgres_can_grant_public_create,
    NOT pg_catalog.has_schema_privilege('afex_function_owner','public','CREATE') AS function_owner_public_create_is_false,
    (SELECT pg_catalog.pg_get_userbyid(nspowner)='pg_database_owner'
      FROM pg_catalog.pg_namespace WHERE nspname='public') AS public_schema_owner_exact,
    (SELECT pg_catalog.pg_get_userbyid(nspowner)='afex_offline_authority_owner'
      FROM pg_catalog.pg_namespace WHERE nspname='afex_offline_authority') AS private_schema_owner_exact,
    NOT EXISTS (
      SELECT 1 FROM expected_relations AS expected
      LEFT JOIN pg_catalog.pg_class AS c ON c.oid=pg_catalog.to_regclass(expected.identity)
      WHERE c.oid IS NULL OR pg_catalog.pg_get_userbyid(c.relowner)<>expected.expected_owner
    ) AS prerequisite_relation_owners_exact,
    NOT EXISTS (
      SELECT 1 FROM expected_functions AS expected
      LEFT JOIN pg_catalog.pg_proc AS p ON p.oid=pg_catalog.to_regprocedure(expected.identity)
      WHERE p.oid IS NULL OR pg_catalog.pg_get_userbyid(p.proowner)<>expected.expected_owner
    ) AS prerequisite_function_owners_exact,
    pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL
      AND pg_catalog.has_function_privilege(
        'afex_offline_authority_owner','pg_catalog.sha256(bytea)','EXECUTE') AS sha256_identity_and_execute_exact,
    pg_catalog.has_function_privilege(
      'afex_offline_authority_owner',
      'afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)',
      'EXECUTE') AS private_auth_helper_execute_exact,
    pg_catalog.has_column_privilege('afex_offline_authority_owner','public.profiles','id','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.profiles','id','REFERENCES')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.profiles','tenant_id','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.profiles','branch_id','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.profiles','is_active','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.profiles','role','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.branches','id','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.branches','tenant_id','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.branches','is_active','SELECT') AS private_context_source_privileges_exact,
    pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','id','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','tenant_id','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','branch_id','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','role','SELECT')
      AND pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','is_active','SELECT') AS roster_source_privileges_exact,
    NOT pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','username','SELECT')
      AND NOT pg_catalog.has_column_privilege('afex_offline_authority_owner','public.pos_profiles','full_name','SELECT') AS roster_display_grants_absent_before_wave,
    pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2') IS NULL
      AND pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_events_v2') IS NULL
      AND NOT EXISTS (SELECT 1 FROM new_functions WHERE pg_catalog.to_regprocedure(identity) IS NOT NULL) AS all_v2_objects_absent,
    pg_catalog.to_regprocedure('public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)') IS NOT NULL AS v1_order_acquisition_present,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS con
      WHERE con.conrelid='public.branches'::pg_catalog.regclass
        AND con.conname='afex_branches_id_tenant_scope_uk' AND con.convalidated
    ) AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS idx
      JOIN pg_catalog.pg_index AS i ON i.indexrelid=idx.oid
      WHERE idx.relname='offline_devices_one_active_branch_uidx'
        AND i.indrelid='afex_offline_authority.offline_devices'::pg_catalog.regclass
        AND i.indisvalid AND i.indisunique
    ) AS required_scope_invariants_present
),
checks AS (SELECT pg_catalog.to_jsonb(facts) AS value FROM facts)
SELECT pg_catalog.jsonb_build_object(
  'decision',CASE WHEN NOT EXISTS (
    SELECT 1 FROM checks, LATERAL pg_catalog.jsonb_each(checks.value) AS item
    WHERE item.value='false'::jsonb
  ) THEN 'AFEX_PRE_PIN_V2_PREFLIGHT_PASS'
    ELSE 'AFEX_PRE_PIN_V2_PREFLIGHT_FAIL' END,
  'failureClassifications',COALESCE((
    SELECT pg_catalog.jsonb_agg(
      'AFEX_PRE_PIN_V2_PREFLIGHT_'||pg_catalog.upper(item.key) ORDER BY item.key)
    FROM checks, LATERAL pg_catalog.jsonb_each(checks.value) AS item
    WHERE item.value='false'::jsonb
  ),'[]'::jsonb),
  'checks',(SELECT value FROM checks),
  'membershipRows',COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role',role_name,'grantor',grantor,'admin',admin_option,
      'inherit',inherit_option,'set',set_option) ORDER BY role_name,grantor)
    FROM installer_memberships
  ),'[]'::jsonb),
  'newV2ObjectCount',(
    SELECT pg_catalog.count(*) FROM new_functions
    WHERE pg_catalog.to_regprocedure(identity) IS NOT NULL
  ) + CASE WHEN pg_catalog.to_regclass(
    'afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2') IS NULL THEN 0 ELSE 1 END
    + CASE WHEN pg_catalog.to_regclass(
    'afex_offline_authority.offline_pre_pin_bootstrap_events_v2') IS NULL THEN 0 ELSE 1 END
);

ROLLBACK;
