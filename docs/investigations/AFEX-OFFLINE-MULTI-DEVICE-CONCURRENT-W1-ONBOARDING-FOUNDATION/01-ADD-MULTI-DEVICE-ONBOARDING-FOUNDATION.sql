/*
AFEX multi-device concurrent authority — W1 onboarding foundation.
REVIEW ONLY. NOT AUTHORIZED FOR EXECUTION.

Installs versioned device lifecycle and Pre-PIN v3 facades, then removes only
the branch-singleton active-device index. Existing V1/V2 functions and every
existing device/bootstrap/envelope row are transactionally fingerprinted and
must remain byte-identical before COMMIT.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL idle_in_transaction_session_timeout = '180s';

DO $afex$
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.current_setting('server_version_num')<>'170006'
     OR pg_catalog.to_regrole('afex_offline_authority_owner') IS NULL
     OR pg_catalog.to_regrole('afex_function_owner') IS NULL
     OR pg_catalog.to_regrole('service_role') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_devices') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_device_events') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_key_envelopes') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_events_v2') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_employee_authorities') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_command_bindings') IS NULL
     OR pg_catalog.to_regclass('afex_offline_authority.offline_devices_one_active_branch_uidx') IS NULL
     OR pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)') IS NULL
  THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_PRECONDITION_IDENTITY_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('afex_offline_authority.register_offline_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)'),
      ('afex_offline_authority.activate_offline_device_v2(uuid,uuid,uuid,uuid,uuid,bigint,text)'),
      ('afex_offline_authority.provision_pre_pin_device_v3(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
      ('public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
      ('public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid)'),
      ('public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'),
      ('public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
    ) AS target(identity)
    WHERE pg_catalog.to_regprocedure(target.identity) IS NOT NULL
  ) OR pg_catalog.to_regclass(
    'afex_offline_authority.offline_devices_active_device_identity_v2_uidx'
  ) IS NOT NULL OR pg_catalog.to_regclass(
    'afex_offline_authority.offline_devices_active_branch_lookup_v2_idx'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_TARGET_IDENTITY_ALREADY_EXISTS';
  END IF;
END
$afex$;

/* Independent fail-before-change binding to the accepted live W0 identities. */
SELECT pg_catalog.set_config('afex.w1.live_w0_identity_gate','false',true);
DO $afex$
DECLARE
  functions_ok boolean;
  function_acls_ok boolean;
  relations_ok boolean;
  relation_acls_ok boolean;
  policies_ok boolean;
  foreign_keys_ok boolean;
  triggers_ok boolean;
  singleton_ok boolean;
  memberships_ok boolean;
  live_data_shape_ok boolean;
BEGIN
  WITH expected(identity,expected_owner,language_name,volatility,parallel_mode,
      expected_return_type,body_md5,body_octets,grantees) AS (VALUES
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
  ), facts AS (
    SELECT e.*,p.oid,pg_catalog.pg_get_userbyid(p.proowner) AS owner,
      l.lanname,p.prokind,p.prosecdef,p.proisstrict,p.provolatile,p.proparallel,
      p.proconfig,p.proacl,p.proowner,p.prorettype::pg_catalog.regtype::text AS return_type,
      pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')) AS actual_md5,
      pg_catalog.octet_length(pg_catalog.convert_to(
        pg_catalog.replace(p.prosrc,E'\r\n',E'\n'),'UTF8')) AS actual_octets
    FROM expected AS e LEFT JOIN pg_catalog.pg_proc AS p
      ON p.oid=pg_catalog.to_regprocedure(e.identity)
    LEFT JOIN pg_catalog.pg_language AS l ON l.oid=p.prolang
  ), acl AS (
    SELECT f.identity,CASE WHEN a.grantee=0 THEN 'PUBLIC'::text ELSE grantee.rolname::text END AS grantee,
      grantor.rolname AS grantor,a.privilege_type,a.is_grantable
    FROM facts AS f CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(f.proacl,pg_catalog.acldefault('f',f.proowner))) AS a
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=a.grantee
    JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=a.grantor
  )
  SELECT pg_catalog.count(*)=13 AND pg_catalog.bool_and(
      oid IS NOT NULL AND owner=expected_owner AND lanname=language_name
      AND prokind='f' AND prosecdef AND proisstrict
      AND provolatile=volatility::char AND proparallel=parallel_mode::char
      AND proconfig=ARRAY['search_path=pg_catalog']::text[]
      AND return_type=expected_return_type AND actual_md5=body_md5 AND actual_octets=body_octets),
    pg_catalog.count(*)=13 AND pg_catalog.bool_and(
      (SELECT ARRAY_AGG(a.grantee::text ORDER BY a.grantee::text) FROM acl AS a
        WHERE a.identity=facts.identity)=facts.grantees
      AND NOT EXISTS (SELECT 1 FROM acl AS a WHERE a.identity=facts.identity
        AND (a.grantor<>facts.expected_owner OR a.privilege_type<>'EXECUTE'
          OR a.is_grantable)))
  INTO functions_ok,function_acls_ok FROM facts;

  WITH expected(identity) AS (VALUES
    ('afex_offline_authority.offline_devices'),
    ('afex_offline_authority.offline_device_events'),
    ('afex_offline_authority.offline_key_envelopes'),
    ('afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2'),
    ('afex_offline_authority.offline_pre_pin_bootstrap_events_v2'),
    ('afex_offline_authority.offline_employee_authorities'),
    ('afex_offline_authority.offline_command_bindings')
  ), facts AS (
    SELECT e.identity,c.oid,c.relowner,c.relacl,c.relkind,c.relpersistence,
      pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity
    FROM expected AS e LEFT JOIN pg_catalog.pg_class AS c ON c.oid=pg_catalog.to_regclass(e.identity)
  ), acl AS (
    SELECT f.identity,CASE WHEN a.grantee=0 THEN 'PUBLIC'::text ELSE grantee.rolname::text END AS grantee,
      grantor.rolname AS grantor,a.privilege_type,a.is_grantable
    FROM facts AS f CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(f.relacl,pg_catalog.acldefault('r',f.relowner))) AS a
    LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=a.grantee
    JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=a.grantor
  )
  SELECT pg_catalog.count(*)=7 AND pg_catalog.bool_and(oid IS NOT NULL
      AND owner='afex_offline_authority_owner' AND relkind='r' AND relpersistence='p'
      AND relrowsecurity AND relforcerowsecurity),
    pg_catalog.count(*)=7 AND pg_catalog.bool_and(
      NOT EXISTS (SELECT 1 FROM acl AS a WHERE a.identity=facts.identity
        AND (a.grantor<>'afex_offline_authority_owner' OR a.is_grantable
          OR a.grantee NOT IN ('afex_offline_authority_owner','afex_function_owner')))
      AND (SELECT ARRAY_AGG(a.privilege_type ORDER BY a.privilege_type) FROM acl AS a
        WHERE a.identity=facts.identity AND a.grantee='afex_offline_authority_owner')=
        ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]
      AND COALESCE((SELECT ARRAY_AGG(a.privilege_type ORDER BY a.privilege_type) FROM acl AS a
        WHERE a.identity=facts.identity AND a.grantee='afex_function_owner'),ARRAY[]::text[])=
        CASE facts.identity
          WHEN 'afex_offline_authority.offline_devices' THEN ARRAY['SELECT']::text[]
          WHEN 'afex_offline_authority.offline_key_envelopes' THEN ARRAY['SELECT']::text[]
          WHEN 'afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2' THEN ARRAY['SELECT']::text[]
          WHEN 'afex_offline_authority.offline_employee_authorities' THEN ARRAY['SELECT']::text[]
          WHEN 'afex_offline_authority.offline_command_bindings' THEN ARRAY['INSERT','SELECT']::text[]
          ELSE ARRAY[]::text[] END)
  INTO relations_ok,relation_acls_ok FROM facts;

  WITH expected(identity,policy_name,command,permissive,role_name,using_expression,check_expression) AS (VALUES
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
  ), actual AS (
    SELECT n.nspname||'.'||c.relname AS identity,p.polname,p.polcmd::text AS command,p.polpermissive AS permissive,
      (SELECT pg_catalog.string_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid) END,',' ORDER BY role_oid)
        FROM pg_catalog.unnest(p.polroles) AS role_oid(role_oid)) AS role_name,
      pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expression,
      pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
    FROM pg_catalog.pg_policy AS p JOIN pg_catalog.pg_class AS c ON c.oid=p.polrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
    WHERE n.nspname||'.'||c.relname IN (SELECT identity FROM expected)
  )
  SELECT NOT EXISTS ((SELECT * FROM expected) EXCEPT (SELECT * FROM actual))
     AND NOT EXISTS ((SELECT * FROM actual) EXCEPT (SELECT * FROM expected)) INTO policies_ok;

  WITH expected(identity,constraint_name,expected_deferrable,expected_initially_deferred,expected_update_action,expected_delete_action) AS (VALUES
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
  )
  SELECT NOT EXISTS (SELECT 1 FROM expected AS e
    LEFT JOIN pg_catalog.pg_constraint AS c ON c.conrelid=pg_catalog.to_regclass(e.identity)
      AND c.conname=e.constraint_name
    WHERE c.oid IS NULL OR c.contype<>'f' OR NOT c.convalidated
      OR c.confupdtype<>e.expected_update_action
      OR c.confdeltype<>e.expected_delete_action
      OR c.condeferrable<>e.expected_deferrable
      OR c.condeferred<>e.expected_initially_deferred) INTO foreign_keys_ok;

  WITH expected(identity,trigger_name,function_identity) AS (VALUES
    ('afex_offline_authority.offline_device_events','offline_device_events_immutable_guard','afex_offline_authority.reject_immutable_offline_evidence_v1()'),
    ('afex_offline_authority.offline_pre_pin_bootstrap_events_v2','offline_pre_pin_bootstrap_events_immutable_v2','afex_offline_authority.reject_immutable_offline_evidence_v1()'),
    ('afex_offline_authority.offline_command_bindings','offline_command_bindings_immutable_guard','afex_offline_authority.reject_offline_command_binding_mutation_v1()'),
    ('afex_offline_authority.offline_employee_authorities','offline_employee_authorities_capacity_guard','afex_offline_authority.enforce_enrollment_capacity_v1()')
  ), actual AS (
    SELECT nrel.nspname||'.'||c.relname AS identity,t.tgname,
      nfn.nspname||'.'||p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')' AS function_identity
    FROM pg_catalog.pg_trigger AS t JOIN pg_catalog.pg_class AS c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace AS nrel ON nrel.oid=c.relnamespace
    JOIN pg_catalog.pg_proc AS p ON p.oid=t.tgfoid
    JOIN pg_catalog.pg_namespace AS nfn ON nfn.oid=p.pronamespace
    WHERE NOT t.tgisinternal AND t.tgenabled='O'
      AND nrel.nspname||'.'||c.relname IN (SELECT identity FROM expected)
  )
  SELECT NOT EXISTS ((SELECT * FROM expected) EXCEPT (SELECT * FROM actual))
    AND NOT EXISTS ((SELECT * FROM actual) EXCEPT (SELECT * FROM expected)) INTO triggers_ok;

  SELECT pg_catalog.count(*)=1 AND pg_catalog.bool_and(i.indisunique AND i.indisvalid
      AND i.indisready AND pg_catalog.pg_get_indexdef(i.indexrelid) LIKE '%(tenant_id, branch_id)%'
      AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) ~* 'status.*active'
      AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) ~* 'revoked_at.*IS NULL')
  INTO singleton_ok FROM pg_catalog.pg_index AS i
  WHERE i.indexrelid=pg_catalog.to_regclass('afex_offline_authority.offline_devices_one_active_branch_uidx');

  SELECT pg_catalog.count(*)=2 AND pg_catalog.bool_and(
      grantor.rolname='supabase_admin' AND m.admin_option
      AND NOT m.inherit_option AND NOT m.set_option)
  INTO memberships_ok FROM pg_catalog.pg_auth_members AS m
  JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
  JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=m.grantor
  WHERE member_role.rolname='postgres'
    AND granted.rolname IN ('afex_offline_authority_owner','afex_function_owner');

  SELECT
    EXISTS (SELECT 1 FROM afex_offline_authority.offline_devices
      WHERE status='active' AND revoked_at IS NULL)
    AND EXISTS (SELECT 1 FROM afex_offline_authority.offline_key_envelopes
      WHERE status='active' AND revoked_at IS NULL)
    AND EXISTS (SELECT 1 FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2
      WHERE status='active')
    AND NOT EXISTS (SELECT 1 FROM afex_offline_authority.offline_devices
      GROUP BY device_id HAVING pg_catalog.count(*)>1)
    AND NOT EXISTS (
      SELECT 1 FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 AS b
      LEFT JOIN afex_offline_authority.offline_devices AS d
        ON d.device_id=b.device_id AND d.tenant_id=b.tenant_id
       AND d.branch_id=b.branch_id AND d.device_generation=b.device_generation
       AND d.status='active' AND d.revoked_at IS NULL
      WHERE b.status='active' AND d.device_id IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM afex_offline_authority.offline_employee_authorities AS e
      LEFT JOIN afex_offline_authority.offline_devices AS d
        ON d.device_id=e.device_id AND d.tenant_id=e.tenant_id
       AND d.branch_id=e.branch_id AND d.device_generation=e.device_generation
       AND d.status='active' AND d.revoked_at IS NULL
      WHERE e.status='active' AND e.revoked_at IS NULL AND d.device_id IS NULL)
    AND NOT EXISTS (SELECT 1 FROM afex_offline_authority.offline_command_bindings)
  INTO live_data_shape_ok;

  IF NOT COALESCE(functions_ok,false) OR NOT COALESCE(function_acls_ok,false)
     OR NOT COALESCE(relations_ok,false) OR NOT COALESCE(relation_acls_ok,false)
     OR NOT COALESCE(policies_ok,false) OR NOT COALESCE(foreign_keys_ok,false)
     OR NOT COALESCE(triggers_ok,false)
     OR NOT COALESCE(singleton_ok,false) OR NOT COALESCE(memberships_ok,false)
     OR NOT COALESCE(live_data_shape_ok,false)
  THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_LIVE_W0_IDENTITY_GATE_FAILED';
  END IF;
  PERFORM pg_catalog.set_config('afex.w1.live_w0_identity_gate','true',true);
END
$afex$;

/* Transaction-local preservation fingerprints; never emitted. */
SELECT pg_catalog.set_config('afex.w1.devices_before',(
  SELECT pg_catalog.jsonb_build_object(
    'count',pg_catalog.count(*),
    'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)
        ORDER BY d.device_id)::text,'[]'),'UTF8')),'hex'))::text
  FROM afex_offline_authority.offline_devices AS d
),true);
SELECT pg_catalog.set_config('afex.w1.envelopes_before',(
  SELECT pg_catalog.jsonb_build_object(
    'count',pg_catalog.count(*),
    'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(k)
        ORDER BY k.key_envelope_id,k.key_envelope_version)::text,'[]'),'UTF8')),'hex'))::text
  FROM afex_offline_authority.offline_key_envelopes AS k
),true);
SELECT pg_catalog.set_config('afex.w1.bootstraps_before',(
  SELECT pg_catalog.jsonb_build_object(
    'count',pg_catalog.count(*),
    'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b)
        ORDER BY b.bootstrap_id)::text,'[]'),'UTF8')),'hex'))::text
  FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 AS b
),true);
SELECT pg_catalog.set_config('afex.w1.legacy_functions_before',(
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'identity',target.identity,'owner',pg_catalog.pg_get_userbyid(p.proowner),
    'securityDefiner',p.prosecdef,'strict',p.proisstrict,'config',p.proconfig,
    'bodyMd5',pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')),
    'bodyOctets',pg_catalog.octet_length(pg_catalog.convert_to(
      pg_catalog.replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'acl',p.proacl::text)
    ORDER BY target.identity),'[]'::jsonb)::text
  FROM (VALUES
    ('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)'),
    ('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)'),
    ('afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)'),
    ('afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)'),
    ('afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid)'),
    ('afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)'),
    ('afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'),
    ('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)'),
    ('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'),
    ('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
  ) AS target(identity)
  JOIN pg_catalog.pg_proc AS p ON p.oid=pg_catalog.to_regprocedure(target.identity)
),true);
SELECT pg_catalog.set_config('afex.w1.memberships_before',(
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'role',g.rolname,'member',mbr.rolname,'grantor',gr.rolname,
    'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
    ORDER BY g.rolname,mbr.rolname,gr.rolname),'[]'::jsonb)::text
  FROM pg_catalog.pg_auth_members AS m
  JOIN pg_catalog.pg_roles AS g ON g.oid=m.roleid
  JOIN pg_catalog.pg_roles AS mbr ON mbr.oid=m.member
  JOIN pg_catalog.pg_roles AS gr ON gr.oid=m.grantor
  WHERE g.rolname IN ('afex_offline_authority_owner','afex_function_owner')
     OR mbr.rolname IN ('afex_offline_authority_owner','afex_function_owner')
),true);
SELECT pg_catalog.set_config('afex.w1.function_owner_create_before',
  pg_catalog.has_schema_privilege(
    'afex_function_owner','public','CREATE')::text,true);

/* PostgreSQL 17 can retain bootstrap-superuser grants with SET FALSE. Add a
   separate transaction-local installer grant only when SET authority is absent;
   the exact baseline is restored before COMMIT. */
SELECT pg_catalog.set_config('afex.w1.temp_authority_membership','false',true);
DO $afex$
BEGIN
  IF NOT pg_catalog.pg_has_role(
    'postgres','afex_offline_authority_owner','SET') THEN
    EXECUTE 'GRANT afex_offline_authority_owner TO postgres '
      'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER';
    PERFORM pg_catalog.set_config(
      'afex.w1.temp_authority_membership','true',true);
  END IF;
  IF NOT pg_catalog.pg_has_role(
    'postgres','afex_offline_authority_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_AUTHORITY_OWNER_SET_UNAVAILABLE';
  END IF;
END
$afex$;
SET LOCAL ROLE afex_offline_authority_owner;

/* Replacement guards exist before singleton removal. */
CREATE UNIQUE INDEX offline_devices_active_device_identity_v2_uidx
  ON afex_offline_authority.offline_devices(tenant_id,branch_id,device_id)
  WHERE status='active' AND revoked_at IS NULL;
CREATE INDEX offline_devices_active_branch_lookup_v2_idx
  ON afex_offline_authority.offline_devices(
    tenant_id,branch_id,status,device_id,device_generation)
  WHERE status='active' AND revoked_at IS NULL;

CREATE FUNCTION afex_offline_authority.register_offline_device_v2(
  p_operation_id uuid,
  p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_device_id uuid,
  p_mode text,
  p_proof_public_key_jwk jsonb,
  p_wrap_public_key_jwk jsonb,
  p_evidence_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  request_hash text;
  prior_hash text;
  result_row afex_offline_authority.offline_devices%ROWTYPE;
BEGIN
  IF p_mode NOT IN ('MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE','MODE_B_NATIVE_OPTIONAL')
     OR pg_catalog.jsonb_typeof(p_proof_public_key_jwk)<>'object'
     OR pg_catalog.jsonb_typeof(p_wrap_public_key_jwk)<>'object'
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(
       p_proof_public_key_jwk))<>5
     OR NOT (p_proof_public_key_jwk ?& ARRAY['kty','crv','x','y','use'])
     OR p_proof_public_key_jwk->>'kty'<>'EC'
     OR p_proof_public_key_jwk->>'crv'<>'P-256'
     OR p_proof_public_key_jwk->>'use'<>'sig'
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(
       p_wrap_public_key_jwk))<>5
     OR NOT (p_wrap_public_key_jwk ?& ARRAY['kty','n','e','alg','use'])
     OR p_wrap_public_key_jwk->>'kty'<>'RSA'
     OR p_wrap_public_key_jwk->>'alg'<>'RSA-OAEP-256'
     OR p_wrap_public_key_jwk->>'use'<>'enc'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_REGISTER_SCHEMA_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'afex-multi-device-register:'||p_device_id::text,0));
  request_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'contractVersion','offline-device-authority.v2',
      'operationId',p_operation_id,'subjectId',p_primary_authenticated_subject_id,
      'tenantId',p_tenant_id,'branchId',p_branch_id,'deviceId',p_device_id,
      'mode',p_mode,'proofKey',p_proof_public_key_jwk,
      'wrapKey',p_wrap_public_key_jwk,'evidence',p_evidence_sha256
    )::text,'UTF8')),'hex');
  SELECT e.request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_device_events AS e
  WHERE e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id
    AND e.operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN
      RAISE EXCEPTION 'AFEX_MULTI_DEVICE_OPERATION_CONFLICT';
    END IF;
    SELECT * INTO STRICT result_row
    FROM afex_offline_authority.offline_devices AS d
    WHERE d.device_id=p_device_id AND d.tenant_id=p_tenant_id
      AND d.branch_id=p_branch_id;
    RETURN pg_catalog.jsonb_build_object(
      'contractVersion','offline-device-authority.v2','status','stable_replay',
      'deviceId',result_row.device_id,
      'deviceGeneration',result_row.device_generation,
      'keyGeneration',result_row.key_envelope_generation,
      'revocationGeneration',result_row.revocation_generation,
      'authorityStatus',result_row.status);
  END IF;
  PERFORM 1 FROM public.branches AS b
  WHERE b.id=p_branch_id AND b.tenant_id=p_tenant_id FOR KEY SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id=p_primary_authenticated_subject_id AND p.is_active=true
      AND p.tenant_id=p_tenant_id
      AND (p.branch_id IS NULL OR p.branch_id=p_branch_id)
      AND p.role IN ('owner','admin','manager','employee')
  ) THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_REGISTER_SCOPE_INVALID';
  END IF;
  SELECT * INTO result_row
  FROM afex_offline_authority.offline_devices AS d
  WHERE d.device_id=p_device_id FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_ID_IMMUTABLE_CONFLICT';
  END IF;
  INSERT INTO afex_offline_authority.offline_devices(
    device_id,tenant_id,branch_id,device_generation,key_envelope_generation,
    revocation_generation,mode,status,device_proof_public_key_jwk,
    device_wrap_public_key_jwk,device_proof_key_sha256,device_wrap_key_sha256,
    device_proof_algorithm,device_wrap_algorithm,wrap_algorithm,
    registered_by_authenticated_subject_id
  ) VALUES(
    p_device_id,p_tenant_id,p_branch_id,1,1,0,p_mode,'pending',
    p_proof_public_key_jwk,p_wrap_public_key_jwk,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      p_proof_public_key_jwk::text,'UTF8')),'hex'),
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      p_wrap_public_key_jwk::text,'UTF8')),'hex'),
    'ECDSA-P256-SHA256','RSA-OAEP-3072-SHA256','RSA-OAEP-3072-SHA256',
    p_primary_authenticated_subject_id
  ) RETURNING * INTO result_row;
  INSERT INTO afex_offline_authority.offline_device_events(
    device_id,tenant_id,branch_id,event_type,operation_id,request_sha256,
    device_generation,revocation_generation,actor_authenticated_subject_id,
    reason_code,evidence_sha256
  ) VALUES(
    p_device_id,p_tenant_id,p_branch_id,'registered',p_operation_id,
    request_hash,1,0,p_primary_authenticated_subject_id,
    'trusted_multi_device_registration',p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-device-authority.v2','status','registered',
    'deviceId',result_row.device_id,'deviceGeneration',1,
    'keyGeneration',1,'revocationGeneration',0,'authorityStatus','pending');
END
$fn$;

CREATE FUNCTION afex_offline_authority.activate_offline_device_v2(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_expected_device_generation bigint,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  d afex_offline_authority.offline_devices%ROWTYPE;
  request_hash text;
  prior_hash text;
BEGIN
  IF p_expected_device_generation<=0
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_ACTIVATE_SCHEMA_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'afex-multi-device-activate:'||p_device_id::text,0));
  request_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'contractVersion','offline-device-authority.v2',
      'operationId',p_operation_id,'subjectId',p_primary_authenticated_subject_id,
      'tenantId',p_tenant_id,'branchId',p_branch_id,'deviceId',p_device_id,
      'expectedGeneration',p_expected_device_generation,
      'evidence',p_evidence_sha256)::text,'UTF8')),'hex');
  SELECT e.request_sha256 INTO prior_hash
  FROM afex_offline_authority.offline_device_events AS e
  WHERE e.tenant_id=p_tenant_id AND e.branch_id=p_branch_id
    AND e.operation_id=p_operation_id FOR KEY SHARE;
  IF FOUND THEN
    IF prior_hash<>request_hash THEN
      RAISE EXCEPTION 'AFEX_MULTI_DEVICE_OPERATION_CONFLICT';
    END IF;
    SELECT * INTO STRICT d
    FROM afex_offline_authority.offline_devices
    WHERE device_id=p_device_id AND tenant_id=p_tenant_id
      AND branch_id=p_branch_id;
    RETURN pg_catalog.jsonb_build_object(
      'contractVersion','offline-device-authority.v2','status','stable_replay',
      'deviceId',d.device_id,'deviceGeneration',d.device_generation,
      'revocationGeneration',d.revocation_generation,'authorityStatus',d.status);
  END IF;
  PERFORM 1 FROM public.branches
  WHERE id=p_branch_id AND tenant_id=p_tenant_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_BRANCH_SCOPE_INVALID';
  END IF;
  SELECT * INTO d FROM afex_offline_authority.offline_devices
  WHERE device_id=p_device_id AND tenant_id=p_tenant_id
    AND branch_id=p_branch_id FOR UPDATE;
  IF NOT FOUND OR d.status<>'pending'
     OR d.device_generation<>p_expected_device_generation
     OR d.registered_by_authenticated_subject_id<>
       p_primary_authenticated_subject_id THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_ACTIVATION_AUTHORITY_INVALID';
  END IF;
  UPDATE afex_offline_authority.offline_devices
  SET status='active',activated_at=pg_catalog.transaction_timestamp(),
    updated_at=pg_catalog.transaction_timestamp()
  WHERE device_id=p_device_id RETURNING * INTO d;
  INSERT INTO afex_offline_authority.offline_device_events(
    device_id,tenant_id,branch_id,event_type,operation_id,request_sha256,
    device_generation,revocation_generation,actor_authenticated_subject_id,
    reason_code,evidence_sha256
  ) VALUES(
    p_device_id,p_tenant_id,p_branch_id,'activated',p_operation_id,request_hash,
    d.device_generation,d.revocation_generation,
    p_primary_authenticated_subject_id,'trusted_multi_device_activation',
    p_evidence_sha256);
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-device-authority.v2','status','activated',
    'deviceId',d.device_id,'deviceGeneration',d.device_generation,
    'revocationGeneration',d.revocation_generation,'authorityStatus',d.status);
END
$fn$;

CREATE FUNCTION afex_offline_authority.provision_pre_pin_device_v3(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_mode text,
  p_proof_public_key_jwk jsonb,p_wrap_public_key_jwk jsonb,
  p_key_envelope_id uuid,p_wrapped_key_sha256 text,p_public_key_sha256 text,
  p_envelope_aad_sha256 text,p_envelope_ciphertext_sha256 text,
  p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE
  d afex_offline_authority.offline_devices%ROWTYPE;
  k afex_offline_authority.offline_key_envelopes%ROWTYPE;
  activation_operation uuid;
  activation_hash text;
  derived_wrap_key_sha256 text;
BEGIN
  IF p_mode<>'MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE'
     OR p_wrapped_key_sha256 !~ '^[0-9a-f]{64}$'
     OR p_public_key_sha256 !~ '^[0-9a-f]{64}$'
     OR p_envelope_aad_sha256 !~ '^[0-9a-f]{64}$'
     OR p_envelope_ciphertext_sha256 !~ '^[0-9a-f]{64}$'
     OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V3_DEVICE_SCHEMA_INVALID';
  END IF;
  derived_wrap_key_sha256:=pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(p_wrap_public_key_jwk->>'n','UTF8')),'hex');
  IF p_public_key_sha256<>derived_wrap_key_sha256 THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V3_DEVICE_PUBLIC_KEY_HASH_MISMATCH';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'afex-pre-pin-device-v3:'||p_device_id::text,0));
  SELECT * INTO d FROM afex_offline_authority.offline_devices
  WHERE device_id=p_device_id FOR UPDATE;
  IF FOUND THEN
    IF d.tenant_id<>p_tenant_id OR d.branch_id<>p_branch_id
       OR d.registered_by_authenticated_subject_id<>
         p_primary_authenticated_subject_id
       OR d.mode<>p_mode
       OR d.device_proof_public_key_jwk<>p_proof_public_key_jwk
       OR d.device_wrap_public_key_jwk<>p_wrap_public_key_jwk
       OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
         d.device_wrap_public_key_jwk->>'n','UTF8')),'hex')<>p_public_key_sha256
       OR d.status<>'active' OR d.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'AFEX_PRE_PIN_V3_DEVICE_STABLE_IDENTITY_CONFLICT';
    END IF;
  ELSE
    PERFORM afex_offline_authority.register_offline_device_v2(
      p_operation_id,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
      p_device_id,p_mode,p_proof_public_key_jwk,p_wrap_public_key_jwk,
      p_evidence_sha256);
    activation_hash:=pg_catalog.md5(
      p_operation_id::text||':afex-pre-pin-activate-v3');
    activation_operation:=(pg_catalog.substr(activation_hash,1,8)||'-'||
      pg_catalog.substr(activation_hash,9,4)||'-4'||
      pg_catalog.substr(activation_hash,14,3)||'-a'||
      pg_catalog.substr(activation_hash,18,3)||'-'||
      pg_catalog.substr(activation_hash,21,12))::uuid;
    PERFORM afex_offline_authority.activate_offline_device_v2(
      activation_operation,p_primary_authenticated_subject_id,p_tenant_id,
      p_branch_id,p_device_id,1,p_evidence_sha256);
    SELECT * INTO STRICT d FROM afex_offline_authority.offline_devices
    WHERE device_id=p_device_id AND tenant_id=p_tenant_id
      AND branch_id=p_branch_id;
  END IF;
  SELECT * INTO k FROM afex_offline_authority.offline_key_envelopes
  WHERE key_envelope_id=p_key_envelope_id AND key_envelope_version=1
  FOR UPDATE;
  IF FOUND THEN
    IF k.primary_authenticated_subject_id<>
         p_primary_authenticated_subject_id
       OR k.tenant_id<>p_tenant_id OR k.branch_id<>p_branch_id
       OR k.device_id<>p_device_id OR k.device_generation<>d.device_generation
       OR k.namespace_generation<>1 OR k.status<>'active'
       OR k.revoked_at IS NOT NULL
       OR k.canonical_aad_sha256<>p_envelope_aad_sha256
       OR k.wrapped_dek_ciphertext_sha256<>p_wrapped_key_sha256
       OR k.encrypted_envelope_sha256<>p_envelope_ciphertext_sha256
       OR k.device_wrap_key_sha256<>d.device_wrap_key_sha256 THEN
      RAISE EXCEPTION 'AFEX_PRE_PIN_V3_KEY_ENVELOPE_STABLE_IDENTITY_CONFLICT';
    END IF;
  ELSE
    INSERT INTO afex_offline_authority.offline_key_envelopes(
      key_envelope_id,key_envelope_version,primary_authenticated_subject_id,
      tenant_id,branch_id,device_id,device_generation,key_generation,
      revocation_generation,namespace_generation,envelope_schema_version,
      wrap_algorithm,content_algorithm,canonical_aad_sha256,
      wrapped_dek_ciphertext_sha256,encrypted_envelope_sha256,
      device_wrap_key_sha256,status
    ) VALUES(
      p_key_envelope_id,1,p_primary_authenticated_subject_id,p_tenant_id,
      p_branch_id,p_device_id,d.device_generation,d.key_envelope_generation,
      d.revocation_generation,1,1,'RSA-OAEP-3072-SHA256','AES-256-GCM',
      p_envelope_aad_sha256,p_wrapped_key_sha256,
      p_envelope_ciphertext_sha256,d.device_wrap_key_sha256,'active'
    ) RETURNING * INTO k;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'contractVersion','offline-pre-pin-device.v3','status','active',
    'deviceId',d.device_id,'deviceGeneration',d.device_generation,
    'keyEnvelopeId',k.key_envelope_id,
    'keyEnvelopeVersion',k.key_envelope_version,
    'namespaceGeneration',k.namespace_generation,
    'siblingDeviceMutationCount',0,'replacementRequired',false,
    'orderAcquisitionAuthorized',false,'selectedEmployeeId',NULL);
END
$fn$;

REVOKE ALL ON FUNCTION
  afex_offline_authority.register_offline_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text),
  afex_offline_authority.activate_offline_device_v2(uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.provision_pre_pin_device_v3(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)
FROM PUBLIC,anon,authenticated,service_role,
  afex_offline_provisioning_runtime,afex_offline_acquisition_runtime;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.register_offline_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text),
  afex_offline_authority.activate_offline_device_v2(uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.provision_pre_pin_device_v3(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)
TO afex_function_owner;

/* Re-prove the live-W0 gate and the new exact-device guards immediately before
   the only singleton removal. No earlier preflight result is trusted here. */
DO $afex$
DECLARE
  guards_ok boolean;
  private_functions_ok boolean;
  legacy_still_exact boolean;
BEGIN
  SELECT pg_catalog.count(*)=2 AND pg_catalog.bool_and(
    i.indisvalid AND i.indisready AND i.indislive
    AND ((c.relname='offline_devices_active_device_identity_v2_uidx'
      AND i.indisunique
      AND pg_catalog.pg_get_indexdef(i.indexrelid)
        LIKE '%(tenant_id, branch_id, device_id)%'
      AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) ~* 'status.*active'
      AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) ~* 'revoked_at.*IS NULL')
    OR (c.relname='offline_devices_active_branch_lookup_v2_idx'
      AND NOT i.indisunique
      AND pg_catalog.pg_get_indexdef(i.indexrelid)
        LIKE '%(tenant_id, branch_id, status, device_id, device_generation)%'
      AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) ~* 'status.*active'
      AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) ~* 'revoked_at.*IS NULL')))
  INTO guards_ok
  FROM pg_catalog.pg_index AS i
  JOIN pg_catalog.pg_class AS c ON c.oid=i.indexrelid
  WHERE c.oid IN (
    pg_catalog.to_regclass('afex_offline_authority.offline_devices_active_device_identity_v2_uidx'),
    pg_catalog.to_regclass('afex_offline_authority.offline_devices_active_branch_lookup_v2_idx'));

  SELECT pg_catalog.count(*)=3 AND pg_catalog.bool_and(
    pg_catalog.pg_get_userbyid(p.proowner)='afex_offline_authority_owner'
    AND p.prosecdef AND p.proisstrict AND p.provolatile='v'
    AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=pg_catalog']::text[])
  INTO private_functions_ok
  FROM (VALUES
    ('afex_offline_authority.register_offline_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)'),
    ('afex_offline_authority.activate_offline_device_v2(uuid,uuid,uuid,uuid,uuid,bigint,text)'),
    ('afex_offline_authority.provision_pre_pin_device_v3(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)')
  ) AS target(identity)
  JOIN pg_catalog.pg_proc AS p ON p.oid=pg_catalog.to_regprocedure(target.identity);

  SELECT pg_catalog.current_setting('afex.w1.legacy_functions_before')::jsonb=(
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'identity',target.identity,'owner',pg_catalog.pg_get_userbyid(p.proowner),
      'securityDefiner',p.prosecdef,'strict',p.proisstrict,'config',p.proconfig,
      'bodyMd5',pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')),
      'bodyOctets',pg_catalog.octet_length(pg_catalog.convert_to(
        pg_catalog.replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'acl',p.proacl::text)
      ORDER BY target.identity),'[]'::jsonb)
    FROM (VALUES
      ('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)'),
      ('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)'),
      ('afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)'),
      ('afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)'),
      ('afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid)'),
      ('afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
      ('afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid)'),
      ('afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)'),
      ('afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'),
      ('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
      ('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)'),
      ('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'),
      ('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
    ) AS target(identity)
    JOIN pg_catalog.pg_proc AS p ON p.oid=pg_catalog.to_regprocedure(target.identity)
  ) INTO legacy_still_exact;

  IF pg_catalog.current_setting('afex.w1.live_w0_identity_gate',true)<>'true'
     OR NOT COALESCE(guards_ok,false)
     OR NOT COALESCE(private_functions_ok,false)
     OR NOT COALESCE(legacy_still_exact,false)
  THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_SINGLETON_DROP_GATE_FAILED';
  END IF;
END
$afex$;

DROP INDEX afex_offline_authority.offline_devices_one_active_branch_uidx;

RESET ROLE;
DO $afex$
BEGIN
  IF pg_catalog.current_setting('afex.w1.temp_authority_membership')='true' THEN
    EXECUTE 'REVOKE afex_offline_authority_owner FROM postgres '
      'GRANTED BY CURRENT_USER RESTRICT';
  END IF;
END
$afex$;

SELECT pg_catalog.set_config('afex.w1.temp_function_membership','false',true);
DO $afex$
BEGIN
  IF pg_catalog.current_setting('afex.w1.function_owner_create_before')='false' THEN
    GRANT CREATE ON SCHEMA public TO afex_function_owner;
  END IF;
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    EXECUTE 'GRANT afex_function_owner TO postgres '
      'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER';
    PERFORM pg_catalog.set_config(
      'afex.w1.temp_function_membership','true',true);
  END IF;
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET')
     OR NOT pg_catalog.has_schema_privilege(
       'afex_function_owner','public','CREATE') THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_FUNCTION_OWNER_SET_UNAVAILABLE';
  END IF;
END
$afex$;
SET LOCAL ROLE afex_function_owner;

CREATE FUNCTION public.afex_offline_server_pre_pin_provision_device_v3(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_operation_id uuid,p_device_id uuid,
  p_mode text,p_proof_public_key_jwk jsonb,p_wrap_public_key_jwk jsonb,
  p_key_envelope_id uuid,p_wrapped_key_sha256 text,p_public_key_sha256 text,
  p_envelope_aad_sha256 text,p_envelope_ciphertext_sha256 text,
  p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
BEGIN
  IF NOT afex_offline_authority.pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,
    p_tenant_id,p_branch_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V3_SERVER_CONTEXT_REJECTED';
  END IF;
  RETURN afex_offline_authority.provision_pre_pin_device_v3(
    p_operation_id,p_authenticated_subject_id,p_tenant_id,p_branch_id,
    p_device_id,p_mode,p_proof_public_key_jwk,p_wrap_public_key_jwk,
    p_key_envelope_id,p_wrapped_key_sha256,p_public_key_sha256,
    p_envelope_aad_sha256,p_envelope_ciphertext_sha256,p_evidence_sha256);
END
$fn$;

CREATE FUNCTION public.afex_offline_server_pre_pin_employee_roster_v3(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
BEGIN
  IF NOT afex_offline_authority.pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,
    p_tenant_id,p_branch_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V3_SERVER_CONTEXT_REJECTED';
  END IF;
  RETURN afex_offline_authority.read_pre_pin_employee_roster_v2(
    p_authenticated_subject_id,p_tenant_id,p_branch_id,p_device_id);
END
$fn$;

CREATE FUNCTION public.afex_offline_server_pre_pin_publish_inventory_v3(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_snapshot_id uuid,
  p_frontier_version text,p_confirmed_at timestamptz,p_items jsonb
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
DECLARE result jsonb;
BEGIN
  IF NOT afex_offline_authority.pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,
    p_tenant_id,p_branch_id)
     OR NOT EXISTS (
       SELECT 1 FROM afex_offline_authority.offline_devices AS d
       WHERE d.device_id=p_device_id AND d.tenant_id=p_tenant_id
         AND d.branch_id=p_branch_id AND d.status='active'
         AND d.revoked_at IS NULL
         AND d.registered_by_authenticated_subject_id=
           p_authenticated_subject_id)
  THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V3_SERVER_DEVICE_CONTEXT_REJECTED';
  END IF;
  result:=afex_offline_authority.publish_branch_inventory_snapshot_v1(
    p_snapshot_id,p_authenticated_subject_id,p_tenant_id,p_branch_id,
    p_frontier_version,p_confirmed_at,p_items);
  RETURN result||pg_catalog.jsonb_build_object(
    'confirmedAt',p_confirmed_at,'items',p_items,'deviceId',p_device_id,
    'orderAcquisitionAuthorized',false);
END
$fn$;

CREATE FUNCTION public.afex_offline_server_pre_pin_bootstrap_v3(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_operation_id uuid,p_device_id uuid,
  p_key_envelope_id uuid,p_key_envelope_version bigint,
  p_namespace_generation bigint,p_inventory_snapshot_id uuid,
  p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path=pg_catalog
AS $fn$
BEGIN
  IF NOT afex_offline_authority.pre_pin_context_matches_v2(
    p_authenticated_subject_id,p_authenticated_session_id,
    p_tenant_id,p_branch_id) THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V3_SERVER_CONTEXT_REJECTED';
  END IF;
  RETURN afex_offline_authority.publish_pre_pin_account_bootstrap_v2(
    p_operation_id,p_authenticated_subject_id,p_authenticated_session_id,
    p_tenant_id,p_branch_id,p_device_id,p_key_envelope_id,
    p_key_envelope_version,p_namespace_generation,p_inventory_snapshot_id,
    p_package_sha256,p_evidence_sha256);
END
$fn$;

REVOKE ALL ON FUNCTION
  public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
TO service_role;

RESET ROLE;
DO $afex$
BEGIN
  IF pg_catalog.current_setting('afex.w1.function_owner_create_before')='false' THEN
    REVOKE CREATE ON SCHEMA public FROM afex_function_owner;
  END IF;
  IF pg_catalog.current_setting('afex.w1.temp_function_membership')='true' THEN
    EXECUTE 'REVOKE afex_function_owner FROM postgres '
      'GRANTED BY CURRENT_USER RESTRICT';
  END IF;
END
$afex$;

DO $afex$
DECLARE
  functions_ok boolean;
  acl_ok boolean;
  data_ok boolean;
  legacy_ok boolean;
  memberships_ok boolean;
  public_create_ok boolean;
BEGIN
  SELECT pg_catalog.count(*)=7 AND pg_catalog.bool_and(
    pg_catalog.pg_get_userbyid(p.proowner)=target.expected_owner
    AND p.prosecdef AND p.proisstrict
    AND p.proconfig=ARRAY['search_path=pg_catalog']::text[])
  INTO functions_ok
  FROM (VALUES
    ('afex_offline_authority.register_offline_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)','afex_offline_authority_owner'),
    ('afex_offline_authority.activate_offline_device_v2(uuid,uuid,uuid,uuid,uuid,bigint,text)','afex_offline_authority_owner'),
    ('afex_offline_authority.provision_pre_pin_device_v3(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)','afex_offline_authority_owner'),
    ('public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)','afex_function_owner'),
    ('public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid)','afex_function_owner'),
    ('public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb)','afex_function_owner'),
    ('public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)','afex_function_owner')
  ) AS target(identity,expected_owner)
  JOIN pg_catalog.pg_proc AS p ON p.oid=pg_catalog.to_regprocedure(target.identity);

  WITH targets(identity,kind) AS (VALUES
    ('afex_offline_authority.register_offline_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)','private'),
    ('afex_offline_authority.activate_offline_device_v2(uuid,uuid,uuid,uuid,uuid,bigint,text)','private'),
    ('afex_offline_authority.provision_pre_pin_device_v3(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)','private'),
    ('public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)','facade'),
    ('public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid)','facade'),
    ('public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb)','facade'),
    ('public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)','facade')
  )
  SELECT pg_catalog.count(*)=7 AND pg_catalog.bool_and(
    NOT EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) AS a
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid=a.grantor
      LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=a.grantee
      WHERE a.privilege_type<>'EXECUTE' OR a.is_grantable
         OR grantor.rolname<>pg_catalog.pg_get_userbyid(p.proowner)
         OR a.grantee=0
         OR (target.kind='private' AND grantee.rolname NOT IN (
              'afex_offline_authority_owner','afex_function_owner'))
         OR (target.kind='facade' AND grantee.rolname NOT IN (
              'afex_function_owner','service_role')))
    AND (SELECT pg_catalog.count(*)
         FROM pg_catalog.aclexplode(
           COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))))=2
    AND NOT pg_catalog.has_function_privilege(
      'anon',p.oid,'EXECUTE')
    AND NOT pg_catalog.has_function_privilege(
      'authenticated',p.oid,'EXECUTE')
    AND ((target.kind='private'
          AND pg_catalog.has_function_privilege(
            'afex_function_owner',p.oid,'EXECUTE'))
      OR (target.kind='facade'
          AND pg_catalog.has_function_privilege(
            'service_role',p.oid,'EXECUTE'))))
  INTO acl_ok
  FROM targets AS target
  JOIN pg_catalog.pg_proc AS p
    ON p.oid=pg_catalog.to_regprocedure(target.identity);

  SELECT
    pg_catalog.current_setting('afex.w1.devices_before')::jsonb=(
      SELECT pg_catalog.jsonb_build_object('count',pg_catalog.count(*),
        'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d)
            ORDER BY d.device_id)::text,'[]'),'UTF8')),'hex'))
      FROM afex_offline_authority.offline_devices AS d)
    AND pg_catalog.current_setting('afex.w1.envelopes_before')::jsonb=(
      SELECT pg_catalog.jsonb_build_object('count',pg_catalog.count(*),
        'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(k)
            ORDER BY k.key_envelope_id,k.key_envelope_version)::text,'[]'),
          'UTF8')),'hex'))
      FROM afex_offline_authority.offline_key_envelopes AS k)
    AND pg_catalog.current_setting('afex.w1.bootstraps_before')::jsonb=(
      SELECT pg_catalog.jsonb_build_object('count',pg_catalog.count(*),
        'sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b)
            ORDER BY b.bootstrap_id)::text,'[]'),'UTF8')),'hex'))
      FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 AS b)
  INTO data_ok;

  SELECT pg_catalog.current_setting('afex.w1.legacy_functions_before')::jsonb=(
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'identity',target.identity,'owner',pg_catalog.pg_get_userbyid(p.proowner),
      'securityDefiner',p.prosecdef,'strict',p.proisstrict,'config',p.proconfig,
      'bodyMd5',pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')),
      'bodyOctets',pg_catalog.octet_length(pg_catalog.convert_to(
        pg_catalog.replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'acl',p.proacl::text)
      ORDER BY target.identity),'[]'::jsonb)
    FROM (VALUES
      ('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)'),
      ('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)'),
      ('afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)'),
      ('afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)'),
      ('afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid)'),
      ('afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
      ('afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid)'),
      ('afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)'),
      ('afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'),
      ('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
      ('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)'),
      ('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb)'),
      ('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
    ) AS target(identity)
    JOIN pg_catalog.pg_proc AS p ON p.oid=pg_catalog.to_regprocedure(target.identity)
  ) INTO legacy_ok;

  SELECT pg_catalog.current_setting('afex.w1.memberships_before')::jsonb=(
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role',g.rolname,'member',mbr.rolname,'grantor',gr.rolname,
      'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
      ORDER BY g.rolname,mbr.rolname,gr.rolname),'[]'::jsonb)
    FROM pg_catalog.pg_auth_members AS m
    JOIN pg_catalog.pg_roles AS g ON g.oid=m.roleid
    JOIN pg_catalog.pg_roles AS mbr ON mbr.oid=m.member
    JOIN pg_catalog.pg_roles AS gr ON gr.oid=m.grantor
    WHERE g.rolname IN ('afex_offline_authority_owner','afex_function_owner')
       OR mbr.rolname IN ('afex_offline_authority_owner','afex_function_owner')
  ) INTO memberships_ok;

  SELECT pg_catalog.current_setting(
    'afex.w1.function_owner_create_before')::boolean=
    pg_catalog.has_schema_privilege(
      'afex_function_owner','public','CREATE')
  INTO public_create_ok;

  IF NOT COALESCE(functions_ok,false) OR NOT COALESCE(acl_ok,false)
     OR NOT COALESCE(data_ok,false) OR NOT COALESCE(legacy_ok,false)
     OR NOT COALESCE(memberships_ok,false)
     OR NOT COALESCE(public_create_ok,false)
     OR pg_catalog.to_regclass(
       'afex_offline_authority.offline_devices_one_active_branch_uidx') IS NOT NULL
     OR pg_catalog.to_regclass(
       'afex_offline_authority.offline_devices_active_device_identity_v2_uidx') IS NULL
     OR pg_catalog.to_regclass(
       'afex_offline_authority.offline_devices_active_branch_lookup_v2_idx') IS NULL
     OR EXISTS (
       SELECT 1 FROM afex_offline_authority.offline_devices AS d
       GROUP BY d.device_id HAVING pg_catalog.count(*)>1)
  THEN
    RAISE EXCEPTION
      'AFEX_MULTI_DEVICE_W1_POST_ATTESTATION_FAILED: functions_ok=%, acl_ok=%, data_ok=%, legacy_ok=%, memberships_ok=%, public_create_ok=%',
      COALESCE(functions_ok,false),COALESCE(acl_ok,false),
      COALESCE(data_ok,false),COALESCE(legacy_ok,false),
      COALESCE(memberships_ok,false),COALESCE(public_create_ok,false);
  END IF;
END
$afex$;

COMMIT;
