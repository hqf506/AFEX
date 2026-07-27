/* AFEX Core V2 Package 7 / package7.security_identity
Executable catalog/privilege tests for a fresh dedicated disposable Clone.
Production and shared Staging are prohibited; providers are disabled externally.
No provider call, final evidence recording, or activation is performed. */
BEGIN;
DO $guard$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE;
BEGIN
 IF pg_catalog.to_regclass('pg_temp.package7_fixture_context') IS NULL
 OR pg_catalog.to_regclass('pg_temp.package7_before_images') IS NULL
 OR pg_catalog.to_regclass('pg_temp.package7_created_rows') IS NULL
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_CONTEXT_MISSING'; END IF;
 IF pg_catalog.to_regclass('pg_temp.package7_security_results') IS NOT NULL
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_STALE_RESULTS_PRESENT'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_temp.package7_fixture_context)<>1
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_before_images)<>29
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_created_rows)<>26
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_MANIFEST_COUNT_INVALID'; END IF;
 SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
 IF c.package7_run_identifier IS NULL OR pg_catalog.btrim(c.package7_run_identifier)=''
 OR c.approved_environment NOT IN('development','staging')
 OR c.before_image_retention_identifier IS NULL OR c.setup_transaction_id IS NULL
 OR c.primary_tenant_id IS NULL OR c.isolation_tenant_id IS NULL
 OR c.primary_branch_id IS NULL OR c.secondary_branch_id IS NULL OR c.isolation_branch_id IS NULL
 OR c.primary_customer_id IS NULL OR c.isolation_customer_id IS NULL
 OR c.tracked_item_id IS NULL OR c.service_item_id IS NULL OR c.isolation_item_id IS NULL
 OR c.primary_branch_item_id IS NULL OR c.secondary_branch_item_id IS NULL
 OR c.isolation_branch_item_id IS NULL OR c.primary_vat_id IS NULL
 OR c.isolation_vat_id IS NULL OR c.primary_discount_id IS NULL
 OR c.primary_inventory_id IS NULL OR c.secondary_inventory_id IS NULL
 OR c.isolation_inventory_id IS NULL OR c.operator_profile_id IS NULL
 OR c.observer_profile_id IS NULL OR c.primary_actor_profile_id IS NULL
 OR c.isolation_actor_profile_id IS NULL OR c.managed_runtime_identity_id IS NULL
 OR c.managed_outbox_identity_id IS NULL OR c.sequence_month IS NULL
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_CONTEXT_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM pg_temp.package7_before_images WHERE object_name='public.core_v2_issuer_rate_limit_config')
 OR EXISTS(SELECT 1 FROM pg_temp.package7_created_rows WHERE object_name='public.core_v2_issuer_rate_limit_config')
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_RATE_LIMIT_OWNERSHIP_FORBIDDEN'; END IF;
END $guard$;
CREATE TEMP TABLE pg_temp.package7_security_results(
 suite_name text NOT NULL DEFAULT 'package7.security_identity',test_name text NOT NULL,
 result text NOT NULL CHECK(result IN('PASS','FAIL')),blocking boolean NOT NULL,
 expected text NOT NULL,observed text NOT NULL,required_action text,run_identifier text NOT NULL,
 PRIMARY KEY(run_identifier,test_name)) ON COMMIT PRESERVE ROWS;
CREATE PROCEDURE pg_temp.package7_security_put(
 n text,r text,e text,o text,a text DEFAULT NULL,b boolean DEFAULT true)
LANGUAGE plpgsql AS $p$
BEGIN
 INSERT INTO pg_temp.package7_security_results
 (test_name,result,blocking,expected,observed,required_action,run_identifier)
 SELECT n,r,b,e,o,a,package7_run_identifier FROM pg_temp.package7_fixture_context;
END $p$;

WITH required(role_name) AS (VALUES
 ('afex_core_owner'),('afex_context_issuer'),('afex_core_runtime'),
 ('afex_outbox_worker'),('afex_core_activation_owner'),('afex_core_activation_operator')),
x AS(
 SELECT q.role_name,r.oid,r.rolname IS NOT NULL AND NOT r.rolcanlogin
 AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
 AND NOT r.rolinherit AND NOT r.rolreplication AND NOT r.rolbypassrls ok
 FROM required q LEFT JOIN pg_catalog.pg_roles r ON r.rolname=q.role_name)
INSERT INTO pg_temp.package7_security_results
SELECT 'package7.security_identity','dedicated_role_attributes',
 CASE WHEN pg_catalog.count(*)=6 AND pg_catalog.bool_and(pg_catalog.coalesce(ok,false))
 THEN 'PASS' ELSE 'FAIL' END,true,
 'six exact NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOREPLICATION/NOBYPASSRLS roles',
 pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY role_name)::text,
 'repair role attributes',c.package7_run_identifier FROM x
CROSS JOIN pg_temp.package7_fixture_context c GROUP BY c.package7_run_identifier;

WITH expected(identity_id,kind,membership) AS(
 SELECT managed_runtime_identity_id,'runtime','afex_core_runtime'
 FROM pg_temp.package7_fixture_context UNION ALL
 SELECT managed_outbox_identity_id,'outbox_worker','afex_outbox_worker'
 FROM pg_temp.package7_fixture_context),
x AS(
 SELECT e.kind,m.identity_id,m.identity_kind,m.database_role_name,
  m.expected_membership_role,r.oid IS NOT NULL role_exists,
  pg_catalog.coalesce(r.rolcanlogin,false) AND NOT pg_catalog.coalesce(r.rolsuper,true)
  AND NOT pg_catalog.coalesce(r.rolcreatedb,true)
  AND NOT pg_catalog.coalesce(r.rolcreaterole,true)
  AND NOT pg_catalog.coalesce(r.rolinherit,true)
  AND NOT pg_catalog.coalesce(r.rolreplication,true)
  AND NOT pg_catalog.coalesce(r.rolbypassrls,true) attributes_ok,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members am WHERE am.member=r.oid) membership_count,
  pg_catalog.coalesce((SELECT pg_catalog.bool_and(
   gr.rolname=e.membership AND NOT am.admin_option
   AND NOT am.inherit_option AND am.set_option)
   FROM pg_catalog.pg_auth_members am JOIN pg_catalog.pg_roles gr ON gr.oid=am.roleid
   WHERE am.member=r.oid),false) membership_ok
 FROM expected e LEFT JOIN public.core_v2_managed_identities m
 ON m.identity_id=e.identity_id AND m.identity_kind=e.kind AND m.active
 LEFT JOIN pg_catalog.pg_roles r ON r.rolname=m.database_role_name)
INSERT INTO pg_temp.package7_security_results
SELECT 'package7.security_identity','managed_identity_contract',
 CASE WHEN pg_catalog.count(*)=2 AND pg_catalog.count(*) FILTER(WHERE kind='runtime')=1
 AND pg_catalog.count(*) FILTER(WHERE kind='outbox_worker')=1
 AND pg_catalog.bool_and(pg_catalog.coalesce(role_exists,false)
 AND pg_catalog.coalesce(attributes_ok,false) AND membership_count=1
 AND pg_catalog.coalesce(membership_ok,false)) THEN 'PASS' ELSE 'FAIL' END,true,
 'exactly one runtime and outbox_worker LOGIN; exact one SET-only membership',
 pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY kind)::text,
 'repair managed identity registration or database role',c.package7_run_identifier
FROM x CROSS JOIN pg_temp.package7_fixture_context c GROUP BY c.package7_run_identifier;

WITH expected(signature,owner_name,definer) AS(VALUES
 ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)','afex_core_owner',true),
 ('public.issue_atomic_authorization_context_v1(uuid,text,text)','afex_context_issuer',true),
 ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)','afex_context_issuer',true),
 ('public.consume_atomic_authorization_context_v1(text,text,uuid)','afex_core_owner',true),
 ('public.revoke_atomic_authorization_context_v1(uuid,text)','afex_context_issuer',true),
 ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)','afex_core_owner',true),
 ('public.validate_atomic_authorization_context_for_quote_v1(text)','afex_core_owner',true),
 ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)','afex_core_owner',true),
 ('public.verify_authoritative_quote_hash_v1(jsonb,text)','afex_core_owner',false),
 ('public.reject_financial_quote_mutation_v1()','afex_core_owner',false),
 ('public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)','afex_core_activation_owner',true)),
x AS(
 SELECT e.*,p.oid,o.rolname actual_owner,p.prosecdef,
 p.proconfig,pg_catalog.pg_get_function_identity_arguments(p.oid) identity_arguments,
 p.oid IS NOT NULL AND o.rolname=e.owner_name AND p.prosecdef=e.definer
 AND p.proconfig=ARRAY['search_path=pg_catalog']::text[] ok
 FROM expected e LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(e.signature)
 LEFT JOIN pg_catalog.pg_roles o ON o.oid=p.proowner)
INSERT INTO pg_temp.package7_security_results
SELECT 'package7.security_identity','function_signature_owner_security',
 CASE WHEN pg_catalog.count(*)=11 AND pg_catalog.bool_and(pg_catalog.coalesce(ok,false))
 THEN 'PASS' ELSE 'FAIL' END,true,'11 exact signatures, owners, definer flags and exact search_path',
 pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY signature)::text,
 'repair executable drift',c.package7_run_identifier FROM x
CROSS JOIN pg_temp.package7_fixture_context c GROUP BY c.package7_run_identifier;

WITH roles(role_name) AS(VALUES('PUBLIC'),('anon'),('authenticated'),('service_role'),
 ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
 ('afex_core_activation_operator')),
functions(signature) AS(VALUES
 ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
 ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
 ('public.consume_atomic_authorization_context_v1(text,text,uuid)'),
 ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)')),
x AS(SELECT role_name,signature,CASE WHEN role_name='PUBLIC'
 THEN EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
  CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.coalesce(
   p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
  WHERE p.oid=pg_catalog.to_regprocedure(signature)
  AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
 ELSE pg_catalog.has_function_privilege(role_name,signature,'EXECUTE') END allowed
 FROM roles CROSS JOIN functions)
INSERT INTO pg_temp.package7_security_results
SELECT 'package7.security_identity','protected_execute_closure',
 CASE WHEN NOT pg_catalog.bool_or(pg_catalog.coalesce(allowed,false)) THEN 'PASS' ELSE 'FAIL' END,
 true,'no effective EXECUTE for reviewed browser/runtime roles',
 pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY signature,role_name)::text,
 'revoke unexpected effective privilege',c.package7_run_identifier FROM x
CROSS JOIN pg_temp.package7_fixture_context c GROUP BY c.package7_run_identifier;

WITH roles(role_name) AS(VALUES('anon'),('authenticated'),('service_role'),
 ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker')),
tables(table_name) AS(VALUES('atomic_authorization_contexts'),('financial_quotes'),
 ('idempotency_commands'),('atomic_outbox')),
x AS(SELECT role_name,table_name,
 pg_catalog.has_table_privilege(role_name,'public.'||table_name,
 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') direct_access
 FROM roles CROSS JOIN tables)
INSERT INTO pg_temp.package7_security_results
SELECT 'package7.security_identity','internal_table_privilege_closure',
 CASE WHEN NOT pg_catalog.bool_or(pg_catalog.coalesce(direct_access,false)) THEN 'PASS' ELSE 'FAIL' END,
 true,'no direct broad table privilege',pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
 ORDER BY table_name,role_name)::text,'revoke drift',c.package7_run_identifier
FROM x CROSS JOIN pg_temp.package7_fixture_context c GROUP BY c.package7_run_identifier;

WITH roles(role_name) AS(VALUES('anon'),('authenticated'),('service_role'),
 ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker')),
x AS(SELECT role_name,pg_catalog.has_schema_privilege(role_name,'public','USAGE') usage_ok,
 pg_catalog.has_schema_privilege(role_name,'public','CREATE') create_bad FROM roles)
INSERT INTO pg_temp.package7_security_results
SELECT 'package7.security_identity','schema_privilege_contract',
 CASE WHEN pg_catalog.bool_and(pg_catalog.coalesce(usage_ok,false))
 AND NOT pg_catalog.bool_or(pg_catalog.coalesce(create_bad,false)) THEN 'PASS' ELSE 'FAIL' END,
 true,'USAGE present; CREATE absent',pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
 ORDER BY role_name)::text,'repair schema ACL',c.package7_run_identifier
FROM x CROSS JOIN pg_temp.package7_fixture_context c GROUP BY c.package7_run_identifier;

WITH expected(table_name) AS(VALUES('atomic_authorization_contexts'),
 ('financial_quotes'),('idempotency_commands'),('atomic_outbox')),
x AS(SELECT e.table_name,cl.relrowsecurity,cl.relforcerowsecurity
 FROM expected e LEFT JOIN pg_catalog.pg_class cl ON cl.oid=
 pg_catalog.to_regclass('public.'||e.table_name))
INSERT INTO pg_temp.package7_security_results
SELECT 'package7.security_identity','internal_table_rls_force',
 CASE WHEN pg_catalog.count(*)=4 AND pg_catalog.bool_and(
 pg_catalog.coalesce(relrowsecurity,false))
 THEN 'PASS' ELSE 'FAIL' END,true,'RLS enabled on four internal tables; FORCE RLS is not required by frozen Package 5',
 pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY table_name)::text,
 'repair RLS drift',c.package7_run_identifier FROM x
CROSS JOIN pg_temp.package7_fixture_context c GROUP BY c.package7_run_identifier;

/* Actual unauthorized mutation attempts are made with a role that has no
internal-table DML. Narrow blocks accept only insufficient_privilege. */
DO $negative$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE; s text; m text;
BEGIN
 SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.core_v2_activation_control SET global_enabled=true WHERE false;
  EXECUTE 'RESET ROLE';
  CALL pg_temp.package7_security_put('unauthorized_activation_mutation','FAIL','42501 insufficient_privilege','unexpected success');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,m=MESSAGE_TEXT;
  BEGIN EXECUTE 'RESET ROLE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  CALL pg_temp.package7_security_put('unauthorized_activation_mutation',CASE WHEN s='42501' THEN 'PASS' ELSE 'FAIL' END,
   '42501 insufficient_privilege',s||' '||m);
 END;
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.core_v2_verification_evidence DEFAULT VALUES;
  EXECUTE 'RESET ROLE';
  CALL pg_temp.package7_security_put('unauthorized_evidence_mutation','FAIL','42501 insufficient_privilege','unexpected success');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,m=MESSAGE_TEXT;
  BEGIN EXECUTE 'RESET ROLE'; EXCEPTION WHEN OTHERS THEN NULL; END;
  CALL pg_temp.package7_security_put('unauthorized_evidence_mutation',CASE WHEN s='42501' THEN 'PASS' ELSE 'FAIL' END,
   '42501 insufficient_privilege',s||' '||m);
 END;
 CALL pg_temp.package7_security_put('cross_tenant_direct_access_denial',
  CASE WHEN NOT pg_catalog.has_table_privilege('authenticated','public.customers',
   'INSERT,UPDATE,DELETE,TRUNCATE') THEN 'PASS' ELSE 'FAIL' END,
  'managed/browser path cannot mutate cross-tenant fixture directly',
  'effective customer mutation privilege checked; RLS remains tenant-scoped');
END $negative$;
SELECT * FROM pg_temp.package7_security_results ORDER BY test_name;
COMMIT;
