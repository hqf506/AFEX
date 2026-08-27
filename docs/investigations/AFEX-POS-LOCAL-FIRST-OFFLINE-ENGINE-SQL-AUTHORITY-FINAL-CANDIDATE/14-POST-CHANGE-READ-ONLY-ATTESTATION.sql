/*
READ-ONLY REVIEW ATTESTATION. NOT AUTHORIZED FOR EXECUTION BY THIS PACKAGE.
Wave 5 proves the human-approved Online-account bootstrap, managed-device,
employee-selection, inventory-publication and order.create-only authority.
It begins READ ONLY and always ends ROLLBACK.
*/
BEGIN TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- SQL14-Q01: private roles are NOLOGIN. Runtime roles have no memberships;
-- postgres owner memberships are restored to ADMIN true/INHERIT false/SET false.
SELECT r.rolname,r.rolcanlogin,r.rolsuper,r.rolinherit,r.rolcreaterole,
       r.rolcreatedb,r.rolreplication,r.rolbypassrls
FROM pg_catalog.pg_roles AS r
WHERE r.rolname IN (
  'afex_offline_authority_owner','afex_offline_acquisition_runtime',
  'afex_offline_provisioning_runtime'
)
ORDER BY r.rolname;

SELECT member_role.rolname AS member_name,granted_role.rolname AS granted_role,
       grantor_role.rolname AS grantor_name,m.admin_option,m.inherit_option,m.set_option
FROM pg_catalog.pg_auth_members AS m
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid=m.roleid
JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid=m.grantor
WHERE member_role.rolname IN (
        'postgres','anon','authenticated','service_role','afex_offline_acquisition_runtime',
        'afex_offline_provisioning_runtime'
      )
   OR granted_role.rolname IN (
        'afex_offline_authority_owner','afex_offline_acquisition_runtime',
        'afex_offline_provisioning_runtime'
      )
ORDER BY member_name,granted_role,grantor_name;

-- SQL14-Q02: relation owners, RLS and raw ACLs for every new private relation.
SELECT n.nspname,c.relname,c.relkind,owner_role.rolname AS owner_name,
       c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=c.relowner
WHERE n.nspname='afex_offline_authority'
  AND c.relname IN (
    'offline_devices','offline_device_events','offline_employee_authorities',
    'offline_employee_authority_events','offline_key_envelopes',
    'branch_inventory_snapshot_headers','branch_inventory_snapshot_items',
    'offline_account_bootstrap_authorities','offline_bootstrap_employee_roster',
    'offline_account_bootstrap_events','offline_command_bindings'
  )
ORDER BY c.relname;

-- SQL14-Q03: structured verifier columns are exact; key envelopes contain no PIN fields.
SELECT c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
       a.attnotnull
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
WHERE n.nspname='afex_offline_authority'
  AND c.relname IN ('offline_employee_authorities','offline_key_envelopes')
  AND a.attnum>0 AND NOT a.attisdropped
ORDER BY c.relname,a.attnum;

-- SQL14-Q04: exact constraints, including order.create-only and verifier parameters.
SELECT n.nspname,c.relname,con.conname,con.contype,con.convalidated,
       pg_catalog.pg_get_constraintdef(con.oid,true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid=con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
WHERE n.nspname='afex_offline_authority'
ORDER BY c.relname,con.conname;

-- SQL14-Q05: all versioned routines, owners, properties, exact signatures and ACLs.
SELECT n.nspname,p.proname,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       owner_role.rolname AS owner_name,p.prosecdef,p.provolatile,p.proparallel,
       p.prokind,p.procost,p.prorows,p.proconfig,p.proacl,
       pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')) AS body_md5
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=p.proowner
WHERE (n.nspname='afex_offline_authority' AND p.proname LIKE '%\_v_' ESCAPE '\')
ORDER BY n.nspname,p.proname,identity_arguments;

SELECT n.nspname,p.proname,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       owner_role.rolname AS owner_name,p.prosecdef,p.provolatile,p.proconfig,
       pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')) AS body_md5,
       pg_catalog.octet_length(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')) AS body_bytes
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=p.proowner
WHERE n.nspname='afex_offline_authority'
  AND p.proname='afex_current_auth_session_matches_v1';

-- SQL14-Q06: exact effective EXECUTE matrix for all provisioning/runtime surfaces.
WITH principals(role_name) AS (
  VALUES ('PUBLIC'::text),('anon'),('authenticated'),('service_role'),
         ('afex_offline_provisioning_runtime'),('afex_offline_acquisition_runtime')
), functions(signature) AS (
  VALUES
    ('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)'),
    ('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)'),
    ('afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)'),
    ('afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)'),
    ('afex_offline_authority.read_current_offline_device_authority_v1(uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.enroll_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text)'),
    ('afex_offline_authority.replace_offline_employee_pin_verifier_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bytea,bytea,text,text)'),
    ('afex_offline_authority.replace_offline_employee_permissions_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text[],text,text)'),
    ('afex_offline_authority.transition_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)'),
    ('afex_offline_authority.read_current_offline_employee_authority_v1(uuid,uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'),
    ('afex_offline_authority.publish_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)'),
    ('afex_offline_authority.explicit_logout_offline_account_v1(uuid,uuid,uuid,uuid,uuid,uuid,text)'),
    ('afex_offline_authority.revoke_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,text,text)'),
    ('afex_offline_authority.read_current_offline_bootstrap_authority_v1(uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.acquire_offline_order_create_v2(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamptz,timestamptz,text)'),
    ('afex_offline_authority.resolve_offline_order_create_authority_batch_v2(uuid,uuid,uuid,jsonb)'),
    ('afex_offline_authority.lookup_offline_order_create_receipts_v2(uuid,uuid,uuid,jsonb)'),
    ('afex_offline_authority.read_branch_inventory_frontier_v2(uuid,uuid,uuid,jsonb,uuid[])')
)
SELECT p.role_name,f.signature,
       pg_catalog.has_function_privilege(p.role_name,f.signature,'EXECUTE') AS can_execute
FROM principals AS p CROSS JOIN functions AS f
ORDER BY p.role_name,f.signature;

-- SQL14-Q07: no direct private-table reachability for browser/service/runtime roles.
WITH principals(role_name) AS (
  VALUES ('PUBLIC'::text),('anon'),('authenticated'),('service_role'),
         ('afex_offline_provisioning_runtime'),('afex_offline_acquisition_runtime')
), relations(relation_name) AS (
  VALUES ('offline_devices'),('offline_device_events'),('offline_employee_authorities'),
    ('offline_employee_authority_events'),('offline_key_envelopes'),
    ('branch_inventory_snapshot_headers'),('branch_inventory_snapshot_items'),
    ('offline_account_bootstrap_authorities'),('offline_bootstrap_employee_roster'),
    ('offline_account_bootstrap_events'),('offline_command_bindings')
)
SELECT p.role_name,r.relation_name,
       pg_catalog.has_table_privilege(
         p.role_name,'afex_offline_authority.'||r.relation_name,
         'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
       ) AS has_direct_table_privilege
FROM principals AS p CROSS JOIN relations AS r
ORDER BY p.role_name,r.relation_name;

-- SQL14-Q08: policies, indexes and immutable/capacity triggers.
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies
WHERE schemaname IN ('afex_offline_authority','afex_pos_authority','public')
  AND (schemaname='afex_offline_authority' OR policyname LIKE '%offline%owner%select')
ORDER BY schemaname,tablename,policyname;

SELECT schemaname,tablename,indexname,indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname='afex_offline_authority'
ORDER BY tablename,indexname;

SELECT n.nspname,c.relname,t.tgname,t.tgenabled,
       pg_catalog.pg_get_triggerdef(t.oid,true) AS definition
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname='afex_offline_authority'
ORDER BY c.relname,t.tgname;

SELECT 'ACCOUNT_BOOTSTRAP_EMPLOYEE_SELECTION_PROVISIONING_POST_WAVE_ATTESTATION'::text
       AS attestation_contract,
       false AS activation_authorized,false AS business_caller_integration_authorized,
       false AS legacy_closure_authorized;

-- SQL14-Q09: the separately classified service-transport activation is absent
-- from the foundation result and every temporary SET option is restored.
SELECT
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'afex_offline_server_%_v1') = 0
    AS inactive_service_facades_absent,
  NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles member_role ON member_role.oid=m.member
    JOIN pg_catalog.pg_roles granted_role ON granted_role.oid=m.roleid
    WHERE member_role.rolname='postgres'
      AND granted_role.rolname IN (
        'afex_context_issuer','afex_core_owner','afex_function_owner',
        'afex_pos_session_owner','afex_offline_authority_owner'
      )
      AND (NOT m.admin_option OR m.inherit_option OR m.set_option)
  ) AS owner_memberships_restored,
  NOT pg_catalog.has_schema_privilege('postgres','auth','CREATE')
    AS postgres_auth_create_remains_absent;

ROLLBACK;
