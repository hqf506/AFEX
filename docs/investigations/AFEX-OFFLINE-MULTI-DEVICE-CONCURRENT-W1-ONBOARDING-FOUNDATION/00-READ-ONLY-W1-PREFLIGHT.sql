/*
AFEX multi-device concurrent onboarding foundation W1.
READ-ONLY LIVE-W0-ALIGNED PRODUCTION PREFLIGHT. REVIEW ONLY. CODEX MUST NOT EXECUTE.

The result contains catalog identities, counts, booleans and aggregate hashes
only. It returns no UUID, key, payload, PIN, token or PII. The frozen function
body identities below are the accepted live W0 identities after the installed
native-SHA256 Foundation and Pre-PIN V2 waves.
*/
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL idle_in_transaction_session_timeout='120s';

WITH
required_roles(role_name) AS (VALUES
  ('postgres'),('supabase_admin'),('afex_offline_authority_owner'),
  ('afex_function_owner'),('afex_offline_provisioning_runtime'),
  ('afex_offline_acquisition_runtime'),('service_role'),('anon'),('authenticated')
),
expected_memberships(role_name,member_name,grantor_name,admin_option,inherit_option,set_option) AS (VALUES
  ('afex_function_owner','postgres','supabase_admin',true,false,false),
  ('afex_offline_authority_owner','postgres','supabase_admin',true,false,false)
),
required_relations(identity,expected_owner,rls,force_rls) AS (VALUES
  ('afex_offline_authority.offline_devices','afex_offline_authority_owner',true,true),
  ('afex_offline_authority.offline_device_events','afex_offline_authority_owner',true,true),
  ('afex_offline_authority.offline_key_envelopes','afex_offline_authority_owner',true,true),
  ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2','afex_offline_authority_owner',true,true),
  ('afex_offline_authority.offline_pre_pin_bootstrap_events_v2','afex_offline_authority_owner',true,true),
  ('afex_offline_authority.offline_employee_authorities','afex_offline_authority_owner',true,true),
  ('afex_offline_authority.offline_command_bindings','afex_offline_authority_owner',true,true)
),
expected_policies(identity,policy_name,command,permissive,role_name,using_expression,check_expression) AS (VALUES
  ('afex_offline_authority.offline_devices','offline_devices_owner_all','*',true,'afex_offline_authority_owner','true','true'),
  ('afex_offline_authority.offline_devices','offline_devices_function_owner_select','r',true,'afex_function_owner','true',NULL),
  ('afex_offline_authority.offline_device_events','offline_device_events_owner_all','*',true,'afex_offline_authority_owner','true','true'),
  ('afex_offline_authority.offline_key_envelopes','offline_key_envelopes_owner_all','*',true,'afex_offline_authority_owner','true','true'),
  ('afex_offline_authority.offline_key_envelopes','offline_key_envelopes_function_owner_select','r',true,'afex_function_owner','true',NULL),
  ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2','offline_pre_pin_bootstrap_owner_all_v2','*',true,'afex_offline_authority_owner','true','true'),
  ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2','offline_pre_pin_bootstrap_function_select_v2','r',true,'afex_function_owner','true',NULL),
  ('afex_offline_authority.offline_pre_pin_bootstrap_events_v2','offline_pre_pin_bootstrap_events_owner_all_v2','*',true,'afex_offline_authority_owner','true','true'),
  ('afex_offline_authority.offline_employee_authorities','offline_employee_authorities_owner_all','*',true,'afex_offline_authority_owner','true','true'),
  ('afex_offline_authority.offline_employee_authorities','offline_employee_authorities_function_owner_select','r',true,'afex_function_owner','true',NULL),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_owner_all','*',true,'afex_offline_authority_owner','true','true'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_function_owner_all','*',true,'afex_function_owner','true','true')
),
expected_foreign_keys(identity,constraint_name,expected_deferrable,expected_initially_deferred,expected_update_action,expected_delete_action) AS (VALUES
  ('afex_offline_authority.offline_devices','offline_devices_branch_scope_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_devices','offline_devices_tenant_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_devices','offline_devices_subject_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_device_events','offline_device_events_device_scope_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_key_envelopes','offline_key_envelopes_device_scope_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_key_envelopes','offline_key_envelopes_subject_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2','offline_pre_pin_bootstrap_subject_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2','offline_pre_pin_bootstrap_device_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2','offline_pre_pin_bootstrap_envelope_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2','offline_pre_pin_bootstrap_inventory_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_pre_pin_bootstrap_events_v2','offline_pre_pin_bootstrap_event_authority_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_employee_authorities','offline_employee_authorities_device_scope_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_employee_authorities','offline_employee_authorities_subject_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_employee_authorities','offline_employee_authorities_device_envelope_scope_fk',true,true,'a','a'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_context_scope_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_command_scope_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_origin_device_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_origin_bootstrap_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_origin_enrollment_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_origin_key_fk',false,false,'r','r'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_snapshot_scope_fk',false,false,'r','r')
),
expected_triggers(identity,trigger_name,function_identity) AS (VALUES
  ('afex_offline_authority.offline_device_events','offline_device_events_immutable_guard','afex_offline_authority.reject_immutable_offline_evidence_v1()'),
  ('afex_offline_authority.offline_pre_pin_bootstrap_events_v2','offline_pre_pin_bootstrap_events_immutable_v2','afex_offline_authority.reject_immutable_offline_evidence_v1()'),
  ('afex_offline_authority.offline_command_bindings','offline_command_bindings_immutable_guard','afex_offline_authority.reject_offline_command_binding_mutation_v1()'),
  ('afex_offline_authority.offline_employee_authorities','offline_employee_authorities_capacity_guard','afex_offline_authority.enforce_enrollment_capacity_v1()')
),
expected_functions(identity,expected_owner,language_name,volatility,parallel_mode,expected_return_type,body_md5,body_octets,expected_execute_grantees) AS (VALUES
  ('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)','afex_offline_authority_owner','plpgsql','v','u','jsonb','2d70f2fb4a7f1eeb165eb26db0b5913c',4596,ARRAY['afex_function_owner','afex_offline_authority_owner','afex_offline_provisioning_runtime']::text[]),
  ('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)','afex_offline_authority_owner','plpgsql','v','u','jsonb','b4bcb6995834452b08278c4bfc1a00e7',3140,ARRAY['afex_function_owner','afex_offline_authority_owner','afex_offline_provisioning_runtime']::text[]),
  ('afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)','afex_offline_authority_owner','plpgsql','v','u','jsonb','68748a011e0faffff40b4d2e14c8b401',3788,ARRAY['afex_offline_authority_owner','afex_offline_provisioning_runtime']::text[]),
  ('afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)','afex_offline_authority_owner','plpgsql','v','u','jsonb','7c5fdbab14c6b50fb6d0702de2637ce9',3320,ARRAY['afex_offline_authority_owner','afex_offline_provisioning_runtime']::text[]),
  ('afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid)','afex_offline_authority_owner','sql','s','u','boolean','d77ed7ac6872ef688030703d047e4842',515,ARRAY['afex_function_owner','afex_offline_authority_owner']::text[]),
  ('afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)','afex_offline_authority_owner','plpgsql','v','u','jsonb','e5bfbd02831e2b5ffe45fd9a6f676592',4921,ARRAY['afex_function_owner','afex_offline_authority_owner']::text[]),
  ('afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid)','afex_offline_authority_owner','plpgsql','s','u','jsonb','cfa803fca6d0acddcb7ebb510d0dbcc2',3535,ARRAY['afex_function_owner','afex_offline_authority_owner']::text[]),
  ('afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)','afex_offline_authority_owner','plpgsql','v','u','jsonb','56ed9074b3774d5316de0696bd76c1ff',7038,ARRAY['afex_function_owner','afex_offline_authority_owner']::text[]),
  ('afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)','afex_offline_authority_owner','plpgsql','v','u','jsonb','70ab26e8e7da135ce15ae9440e8120c4',5660,ARRAY['afex_function_owner','afex_offline_authority_owner','afex_offline_provisioning_runtime']::text[]),
  ('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)','afex_function_owner','plpgsql','v','u','jsonb','c4560e06cccf2be80fc6a10b81f5229e',569,ARRAY['afex_function_owner','service_role']::text[]),
  ('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)','afex_function_owner','plpgsql','s','u','jsonb','708f4885bcf9b398535ef54938bd9788',363,ARRAY['afex_function_owner','service_role']::text[]),
  ('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)','afex_function_owner','plpgsql','v','u','jsonb','c822bd17379dbd73196e3eecb19ead4a',922,ARRAY['afex_function_owner','service_role']::text[]),
  ('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)','afex_function_owner','plpgsql','v','u','jsonb','89f5a7d95b85e41bf9a0a4ec2b6f533c',543,ARRAY['afex_function_owner','service_role']::text[])
),
relation_facts AS (
  SELECT expected.*,c.oid,c.relkind,c.relpersistence,pg_catalog.pg_get_userbyid(c.relowner) AS owner,
    c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.relowner
  FROM required_relations AS expected LEFT JOIN pg_catalog.pg_class AS c
    ON c.oid=pg_catalog.to_regclass(expected.identity)
),
relation_acl_rows AS (
  SELECT r.identity,CASE WHEN a.grantee=0 THEN 'PUBLIC'::text ELSE grantee.rolname::text END AS grantee,
    grantor.rolname AS grantor,a.privilege_type,a.is_grantable
  FROM relation_facts AS r
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(r.relacl,pg_catalog.acldefault('r',r.relowner))) AS a
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=a.grantee
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=a.grantor WHERE r.oid IS NOT NULL
),
relation_acl_checks AS (
  SELECT r.identity,
    NOT EXISTS (SELECT 1 FROM relation_acl_rows AS a WHERE a.identity=r.identity
      AND (a.grantor<>'afex_offline_authority_owner' OR a.is_grantable
        OR a.grantee NOT IN ('afex_offline_authority_owner','afex_function_owner')))
    AND (SELECT ARRAY_AGG(a.privilege_type ORDER BY a.privilege_type) FROM relation_acl_rows AS a
      WHERE a.identity=r.identity AND a.grantee='afex_offline_authority_owner')=
      ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]
    AND COALESCE((SELECT ARRAY_AGG(a.privilege_type ORDER BY a.privilege_type) FROM relation_acl_rows AS a
      WHERE a.identity=r.identity AND a.grantee='afex_function_owner'),ARRAY[]::text[])=
      CASE r.identity
        WHEN 'afex_offline_authority.offline_devices' THEN ARRAY['SELECT']::text[]
        WHEN 'afex_offline_authority.offline_key_envelopes' THEN ARRAY['SELECT']::text[]
        WHEN 'afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2' THEN ARRAY['SELECT']::text[]
        WHEN 'afex_offline_authority.offline_employee_authorities' THEN ARRAY['SELECT']::text[]
        WHEN 'afex_offline_authority.offline_command_bindings' THEN ARRAY['INSERT','SELECT']::text[]
        ELSE ARRAY[]::text[] END AS exact
  FROM relation_facts AS r
),
policy_rows AS (
  SELECT r.identity,p.polname,p.polcmd::text AS command,p.polpermissive,
    (SELECT pg_catalog.string_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END,',' ORDER BY role_oid)
      FROM pg_catalog.unnest(p.polroles) AS policy_role(role_oid)) AS role_name,
    pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expression,
    pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
  FROM relation_facts AS r JOIN pg_catalog.pg_policy AS p ON p.polrelid=r.oid
),
policy_exact AS (
  SELECT NOT EXISTS ((SELECT * FROM expected_policies) EXCEPT (SELECT * FROM policy_rows))
     AND NOT EXISTS ((SELECT * FROM policy_rows) EXCEPT (SELECT * FROM expected_policies)) AS exact
),
column_inventory AS (
  SELECT r.identity,pg_catalog.count(*)::bigint AS column_count,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('ordinal',a.attnum,'column',a.attname,
        'type',pg_catalog.format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
        'identity',a.attidentity,'generated',a.attgenerated,
        'default',pg_catalog.pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY a.attnum)::text,'UTF8')),'hex') AS catalog_sha256
  FROM relation_facts AS r JOIN pg_catalog.pg_attribute AS a ON a.attrelid=r.oid
    AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum GROUP BY r.identity
),
constraint_rows AS (
  SELECT r.identity,c.conname,c.contype,c.convalidated,c.condeferrable,c.condeferred,
    c.confupdtype,c.confdeltype,pg_catalog.pg_get_constraintdef(c.oid,false) AS definition
  FROM relation_facts AS r JOIN pg_catalog.pg_constraint AS c ON c.conrelid=r.oid
),
foreign_key_exact AS (
  SELECT NOT EXISTS (SELECT 1 FROM expected_foreign_keys AS e LEFT JOIN constraint_rows AS c
    ON c.identity=e.identity AND c.conname=e.constraint_name
    WHERE c.conname IS NULL OR c.contype<>'f' OR NOT c.convalidated
      OR c.confupdtype<>e.expected_update_action
      OR c.confdeltype<>e.expected_delete_action OR c.condeferrable<>e.expected_deferrable
      OR c.condeferred<>e.expected_initially_deferred) AS exact
),
index_rows AS (
  SELECT r.identity,ni.nspname||'.'||ic.relname AS index_identity,i.indisunique,
    i.indisvalid,i.indisready,i.indislive,pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicate,
    pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
  FROM relation_facts AS r JOIN pg_catalog.pg_index AS i ON i.indrelid=r.oid
  JOIN pg_catalog.pg_class AS ic ON ic.oid=i.indexrelid
  JOIN pg_catalog.pg_namespace AS ni ON ni.oid=ic.relnamespace
),
trigger_rows AS (
  SELECT r.identity,t.tgname,t.tgenabled,
    n.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')' AS function_identity,
    pg_catalog.pg_get_triggerdef(t.oid,false) AS definition
  FROM relation_facts AS r JOIN pg_catalog.pg_trigger AS t ON t.tgrelid=r.oid
  JOIN pg_catalog.pg_proc AS p ON p.oid=t.tgfoid
  JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  WHERE NOT t.tgisinternal
),
function_facts AS (
  SELECT expected.*,p.oid,pg_catalog.pg_get_userbyid(p.proowner) AS owner,l.lanname,p.prokind,
    p.prosecdef,p.proisstrict,p.provolatile,p.proparallel,p.proconfig,p.proacl,p.proowner,
    p.prorettype::pg_catalog.regtype::text AS return_type,
    pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')) AS actual_body_md5,
    pg_catalog.octet_length(pg_catalog.convert_to(pg_catalog.replace(p.prosrc,E'\r\n',E'\n'),'UTF8')) AS actual_body_octets
  FROM expected_functions AS expected LEFT JOIN pg_catalog.pg_proc AS p
    ON p.oid=pg_catalog.to_regprocedure(expected.identity)
  LEFT JOIN pg_catalog.pg_language AS l ON l.oid=p.prolang
),
function_acl_rows AS (
  SELECT f.identity,CASE WHEN a.grantee=0 THEN 'PUBLIC'::text ELSE grantee.rolname::text END AS grantee,
    grantor.rolname AS grantor,a.privilege_type,a.is_grantable
  FROM function_facts AS f CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(f.proacl,pg_catalog.acldefault('f',f.proowner))) AS a
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=a.grantee
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=a.grantor WHERE f.oid IS NOT NULL
),
function_acl_checks AS (
  SELECT f.identity,(SELECT ARRAY_AGG(a.grantee::text ORDER BY a.grantee::text) FROM function_acl_rows AS a
      WHERE a.identity=f.identity)=f.expected_execute_grantees
    AND NOT EXISTS (SELECT 1 FROM function_acl_rows AS a WHERE a.identity=f.identity
      AND (a.grantor<>f.expected_owner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) AS exact
  FROM function_facts AS f
),
membership_rows AS (
  SELECT granted.rolname AS role_name,member_role.rolname AS member_name,
    grantor.rolname AS grantor_name,m.admin_option,m.inherit_option,m.set_option
  FROM pg_catalog.pg_auth_members AS m JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=m.grantor
  WHERE member_role.rolname='postgres'
    AND granted.rolname IN ('afex_offline_authority_owner','afex_function_owner')
),
membership_exact AS (
  SELECT NOT EXISTS (
    SELECT role_name,member_name,grantor_name,admin_option,inherit_option,set_option FROM expected_memberships
    EXCEPT
    SELECT role_name,member_name,grantor_name,admin_option,inherit_option,set_option FROM membership_rows)
  AND NOT EXISTS (
    SELECT role_name,member_name,grantor_name,admin_option,inherit_option,set_option FROM membership_rows
    EXCEPT
    SELECT role_name,member_name,grantor_name,admin_option,inherit_option,set_option FROM expected_memberships) AS exact
),
singleton_index AS (
  SELECT i.indexrelid,i.indisunique,i.indisvalid,i.indisready,
    ARRAY(SELECT a.attname FROM pg_catalog.unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
      JOIN pg_catalog.pg_attribute AS a ON a.attrelid=i.indrelid AND a.attnum=k.attnum ORDER BY k.ord) AS keys,
    pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicate
  FROM pg_catalog.pg_index AS i WHERE i.indexrelid=pg_catalog.to_regclass(
    'afex_offline_authority.offline_devices_one_active_branch_uidx')
),
target_absence AS (
  SELECT pg_catalog.bool_and(pg_catalog.to_regprocedure(identity) IS NULL) AS exact
  FROM (VALUES
    ('afex_offline_authority.register_offline_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)'),
    ('afex_offline_authority.activate_offline_device_v2(uuid,uuid,uuid,uuid,uuid,bigint,text)'),
    ('afex_offline_authority.provision_pre_pin_device_v3(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid)'),
    ('public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)'),
    ('public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
  ) AS target(identity)
),
data_facts AS (
  SELECT
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_devices) AS device_count,
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_devices WHERE status='active' AND revoked_at IS NULL) AS active_device_count,
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_key_envelopes WHERE status='active' AND revoked_at IS NULL) AS active_envelope_count,
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 WHERE status='active') AS active_v2_bootstrap_count,
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_employee_authorities WHERE status='active' AND revoked_at IS NULL) AS active_employee_authority_count,
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_command_bindings) AS command_binding_count,
    (SELECT pg_catalog.count(*) FROM (SELECT device_id FROM afex_offline_authority.offline_devices GROUP BY device_id HAVING pg_catalog.count(*)>1) AS duplicate) AS duplicate_device_id_count,
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_key_envelopes AS k
      LEFT JOIN afex_offline_authority.offline_devices AS d ON d.device_id=k.device_id AND d.tenant_id=k.tenant_id
       AND d.branch_id=k.branch_id AND d.device_generation=k.device_generation AND d.status='active' AND d.revoked_at IS NULL
      WHERE k.status='active' AND k.revoked_at IS NULL AND d.device_id IS NULL) AS orphan_active_envelope_count,
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 AS b
      LEFT JOIN afex_offline_authority.offline_devices AS d ON d.device_id=b.device_id AND d.tenant_id=b.tenant_id
       AND d.branch_id=b.branch_id AND d.device_generation=b.device_generation AND d.status='active' AND d.revoked_at IS NULL
      WHERE b.status='active' AND d.device_id IS NULL) AS orphan_active_v2_bootstrap_count,
    (SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_employee_authorities AS e
      LEFT JOIN afex_offline_authority.offline_devices AS d ON d.device_id=e.device_id AND d.tenant_id=e.tenant_id
       AND d.branch_id=e.branch_id AND d.device_generation=e.device_generation AND d.status='active' AND d.revoked_at IS NULL
      WHERE e.status='active' AND e.revoked_at IS NULL AND d.device_id IS NULL) AS orphan_active_employee_authority_count
),
data_identity AS (
  SELECT pg_catalog.jsonb_build_object(
    'devices',pg_catalog.jsonb_build_object('count',(SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_devices),'sha256',(SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.device_id)::text,'[]'),'UTF8')),'hex') FROM afex_offline_authority.offline_devices AS d)),
    'envelopes',pg_catalog.jsonb_build_object('count',(SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_key_envelopes),'sha256',(SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(k) ORDER BY k.key_envelope_id,k.key_envelope_version)::text,'[]'),'UTF8')),'hex') FROM afex_offline_authority.offline_key_envelopes AS k)),
    'v2Bootstraps',pg_catalog.jsonb_build_object('count',(SELECT pg_catalog.count(*) FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2),'sha256',(SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b) ORDER BY b.bootstrap_id)::text,'[]'),'UTF8')),'hex') FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 AS b))
  ) AS value
),
checks AS (
  SELECT * FROM (VALUES
    ('installer_identity_exact',CURRENT_USER='postgres' AND SESSION_USER='postgres'),
    ('postgres_version_exact',pg_catalog.current_setting('server_version_num')='170006'),
    ('required_roles_present',(SELECT pg_catalog.count(*)=9 FROM required_roles r JOIN pg_catalog.pg_roles p ON p.rolname=r.role_name)),
    ('postgres17_membership_rows_exact',(SELECT exact FROM membership_exact)),
    ('required_relations_exact',(SELECT pg_catalog.count(*)=7 AND pg_catalog.bool_and(oid IS NOT NULL AND relkind='r' AND relpersistence='p' AND owner=expected_owner AND relrowsecurity=rls AND relforcerowsecurity=force_rls) FROM relation_facts)),
    ('relation_columns_catalog_complete',(SELECT pg_catalog.count(*)=7 AND pg_catalog.bool_and(column_count>0 AND catalog_sha256 ~ '^[0-9a-f]{64}$') FROM column_inventory)),
    ('relation_constraints_validated',NOT EXISTS(SELECT 1 FROM constraint_rows WHERE NOT convalidated)),
    ('relevant_foreign_keys_exact',(SELECT exact FROM foreign_key_exact)),
    ('relation_indexes_valid_ready',NOT EXISTS(SELECT 1 FROM index_rows WHERE NOT indisvalid OR NOT indisready OR NOT indislive)),
    ('relation_policies_exact',(SELECT exact FROM policy_exact)),
    ('relation_acls_exact',(SELECT pg_catalog.count(*)=7 AND pg_catalog.bool_and(exact) FROM relation_acl_checks)),
    ('required_triggers_exact',NOT EXISTS((SELECT identity,trigger_name,function_identity FROM expected_triggers) EXCEPT (SELECT identity,tgname,function_identity FROM trigger_rows WHERE tgenabled='O')) AND NOT EXISTS((SELECT identity,tgname,function_identity FROM trigger_rows) EXCEPT (SELECT identity,trigger_name,function_identity FROM expected_triggers))),
    ('legacy_function_identities_exact',(SELECT pg_catalog.count(*)=13 AND pg_catalog.bool_and(oid IS NOT NULL AND owner=expected_owner AND lanname=language_name AND prokind='f' AND prosecdef AND proisstrict AND provolatile=volatility::char AND proparallel=parallel_mode::char AND proconfig=ARRAY['search_path=pg_catalog']::text[] AND return_type=expected_return_type AND actual_body_md5=body_md5 AND actual_body_octets=body_octets) FROM function_facts)),
    ('legacy_function_acls_exact',(SELECT pg_catalog.count(*)=13 AND pg_catalog.bool_and(exact) FROM function_acl_checks)),
    ('legacy_browser_execute_closed',NOT EXISTS(SELECT 1 FROM function_acl_rows WHERE grantee IN ('PUBLIC','anon','authenticated'))),
    ('native_sha256_available',pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL),
    ('singleton_index_exact',(SELECT pg_catalog.count(*)=1 AND pg_catalog.bool_and(indisunique AND indisvalid AND indisready AND keys=ARRAY['tenant_id','branch_id']::name[] AND predicate LIKE '%status%active%' AND predicate LIKE '%revoked_at IS NULL%') FROM singleton_index)),
    ('w1_targets_absent',(SELECT exact FROM target_absence) AND pg_catalog.to_regclass('afex_offline_authority.offline_devices_active_device_identity_v2_uidx') IS NULL AND pg_catalog.to_regclass('afex_offline_authority.offline_devices_active_branch_lookup_v2_idx') IS NULL),
    ('device_identity_conflicts_zero',(SELECT duplicate_device_id_count=0 FROM data_facts)),
    ('orphan_active_envelopes_zero',(SELECT orphan_active_envelope_count=0 FROM data_facts)),
    ('orphan_active_v2_bootstraps_zero',(SELECT orphan_active_v2_bootstrap_count=0 FROM data_facts)),
    ('orphan_active_employee_authorities_zero',(SELECT orphan_active_employee_authority_count=0 FROM data_facts)),
    ('existing_active_device_present',(SELECT active_device_count>=1 FROM data_facts)),
    ('existing_active_v2_bootstrap_present',(SELECT active_v2_bootstrap_count>=1 FROM data_facts)),
    ('existing_active_envelope_present',(SELECT active_envelope_count>=1 FROM data_facts)),
    ('migration_conflicts_zero',(SELECT duplicate_device_id_count+orphan_active_envelope_count+orphan_active_v2_bootstrap_count+orphan_active_employee_authority_count=0 FROM data_facts))
  ) AS c(name,pass)
),
summary AS (
  SELECT pg_catalog.bool_and(pass) AS ready,pg_catalog.jsonb_object_agg(name,pass ORDER BY name) AS checks,
    COALESCE(pg_catalog.jsonb_agg(('AFEX_MULTI_DEVICE_W1_PREFLIGHT_'||pg_catalog.upper(name)) ORDER BY name) FILTER (WHERE NOT pass),'[]'::jsonb) AS failure_classifications
  FROM checks
)
SELECT pg_catalog.jsonb_build_object(
  'contractVersion','afex-multi-device-concurrent-w1-preflight.v2-live-w0',
  'decision',CASE WHEN summary.ready THEN 'AFEX_MULTI_DEVICE_W1_PREFLIGHT_PASS' ELSE 'AFEX_MULTI_DEVICE_W1_PREFLIGHT_FAIL' END,
  'ready',summary.ready,'checks',summary.checks,'failureClassifications',summary.failure_classifications,
  'membershipRows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role',role_name,'grantor',grantor_name,'admin',admin_option,'inherit',inherit_option,'set',set_option) ORDER BY role_name),'[]'::jsonb) FROM membership_rows),
  'relationCatalogIdentities',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('identity',r.identity,'owner',r.owner,'kind',r.relkind,'persistence',r.relpersistence,'rls',r.relrowsecurity,'forceRls',r.relforcerowsecurity,'columnCount',c.column_count,'columnCatalogSha256',c.catalog_sha256) ORDER BY r.identity),'[]'::jsonb) FROM relation_facts AS r JOIN column_inventory AS c ON c.identity=r.identity),
  'relationAclRows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('identity',identity,'grantee',grantee,'grantor',grantor,'privilege',privilege_type,'grantable',is_grantable) ORDER BY identity,grantee,privilege_type),'[]'::jsonb) FROM relation_acl_rows),
  'constraintIdentities',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('identity',identity,'name',conname,'type',contype,'validated',convalidated,'deferrable',condeferrable,'deferred',condeferred,'updateAction',confupdtype,'deleteAction',confdeltype,'definition',definition) ORDER BY identity,conname),'[]'::jsonb) FROM constraint_rows),
  'indexIdentities',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('identity',identity,'index',index_identity,'unique',indisunique,'valid',indisvalid,'ready',indisready,'live',indislive,'predicate',predicate,'definition',definition) ORDER BY identity,index_identity),'[]'::jsonb) FROM index_rows),
  'policyIdentities',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('identity',identity,'policy',polname,'command',command,'permissive',polpermissive,'role',role_name,'using',using_expression,'withCheck',check_expression) ORDER BY identity,polname),'[]'::jsonb) FROM policy_rows),
  'triggerIdentities',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('identity',identity,'trigger',tgname,'enabled',tgenabled,'function',function_identity,'definition',definition) ORDER BY identity,tgname),'[]'::jsonb) FROM trigger_rows),
  'legacyFunctionIdentities',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('identity',identity,'owner',owner,'language',lanname,'securityDefiner',prosecdef,'strict',proisstrict,'volatility',provolatile,'parallel',proparallel,'searchPath',proconfig,'normalizedBodyMd5',actual_body_md5,'normalizedBodyOctets',actual_body_octets) ORDER BY identity),'[]'::jsonb) FROM function_facts),
  'legacyFunctionAclRows',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('identity',identity,'grantee',grantee,'grantor',grantor,'privilege',privilege_type,'grantable',is_grantable) ORDER BY identity,grantee),'[]'::jsonb) FROM function_acl_rows),
  'dataCounts',pg_catalog.to_jsonb(data_facts),'existingDataIdentity',data_identity.value,
  'effectLedgerRequiredForW1',false,'externalEffectsEnabled',false
)
FROM summary CROSS JOIN data_facts CROSS JOIN data_identity;

ROLLBACK;
