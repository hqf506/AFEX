/* AFEX Core V2 Package 7 / package7.financial_quote
Actual disposable-Clone quote tests. Run after 07c in the same session.
Immutable quote rows remain until external Clone disposal. */
BEGIN;
DO $guard$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE;
BEGIN
 IF pg_catalog.to_regclass('pg_temp.package7_fixture_context') IS NULL
 OR pg_catalog.to_regclass('pg_temp.package7_before_images') IS NULL
 OR pg_catalog.to_regclass('pg_temp.package7_created_rows') IS NULL
 OR pg_catalog.to_regclass('pg_temp.package7_authorization_results') IS NULL
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_CONTEXT_MISSING'; END IF;
 IF pg_catalog.to_regclass('pg_temp.package7_quote_results') IS NOT NULL
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_STALE_RESULTS_PRESENT'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_temp.package7_fixture_context)<>1
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_before_images)<>29
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_created_rows)<>26
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_MANIFEST_COUNT_INVALID'; END IF;
 SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
 IF current_user <> 'afex_package7_test_executor'
 OR c.test_executor_login_role <> current_user::name
 THEN RAISE EXCEPTION USING ERRCODE='42501',
 MESSAGE='PACKAGE7_TEST_EXECUTOR_REQUIRED'; END IF;
 IF c.package7_run_identifier IS NULL OR pg_catalog.btrim(c.package7_run_identifier)=''
 OR pg_catalog.length(c.package7_run_identifier)>90
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

CREATE TEMP TABLE pg_temp.package7_quote_results(
 suite_name text NOT NULL DEFAULT 'package7.financial_quote',test_name text NOT NULL,
 result text NOT NULL CHECK(result IN('PASS','FAIL','NOT_RUN')),blocking boolean NOT NULL,
 expected text NOT NULL,observed text NOT NULL,required_action text,run_identifier text NOT NULL,
 PRIMARY KEY(run_identifier,test_name)) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE pg_temp.package7_quote_runtime(
 run_identifier text PRIMARY KEY,context_id uuid NOT NULL,quote_id uuid NOT NULL,
 idempotency_key_hash text NOT NULL,request_fingerprint text NOT NULL,
 quote_fingerprint text NOT NULL,quote_hash text NOT NULL,
 canonical_customer_intent jsonb NOT NULL,canonical_note jsonb,
 canonical_financial_intent jsonb NOT NULL,financial_snapshot jsonb NOT NULL
) ON COMMIT PRESERVE ROWS;
CREATE PROCEDURE pg_temp.package7_quote_put(n text,r text,e text,o text)
LANGUAGE plpgsql AS $p$
BEGIN
 INSERT INTO pg_temp.package7_quote_results
 (test_name,result,blocking,expected,observed,run_identifier)
 SELECT n,r,true,e,o,package7_run_identifier FROM pg_temp.package7_fixture_context;
END $p$;

DO $tests$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE; cust public.customers%ROWTYPE;
 token text; ctx uuid; key_hash text; intent jsonb; q jsonb; rowq public.financial_quotes%ROWTYPE;
 s jsonb; st text; msg text; ok boolean;
BEGIN
 SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
 SELECT * INTO STRICT cust FROM public.customers WHERE id=c.primary_customer_id AND tenant_id=c.primary_tenant_id;
 key_hash:=pg_catalog.encode(extensions.digest(c.package7_run_identifier||':quote:primary','sha256'),'hex');
 SELECT context_id,context_token INTO STRICT ctx,token
 FROM public.issue_atomic_authorization_context_v1(c.primary_branch_id,key_hash,
  'package7:'||c.package7_run_identifier||':quote-primary');
 intent:=pg_catalog.jsonb_build_object(
  'customer',pg_catalog.jsonb_build_object('intent','reuse_existing','id',cust.id,
   'phone',cust.phone,'name',cust.name),
  'note','package7:'||c.package7_run_identifier,
  'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
   'catalog_item_id',c.tracked_item_id,'quantity',2)),
  'discount_id',c.primary_discount_id,'payment_method','cash','cash_received',218.50);
 q:=public.issue_authoritative_financial_quote_v1(token,intent,
  'package7:'||c.package7_run_identifier||':quote-primary');
 SELECT * INTO STRICT rowq FROM public.financial_quotes WHERE id=(q->>'quote_id')::uuid;
 s:=q->'financial_snapshot';
 CALL pg_temp.package7_quote_put('authoritative_quote_issuance',CASE WHEN rowq.authorization_context_id=ctx
  AND rowq.tenant_id=c.primary_tenant_id AND rowq.branch_id=c.primary_branch_id
  AND rowq.customer_id=c.primary_customer_id AND rowq.expires_at>pg_catalog.clock_timestamp()
  THEN 'PASS' ELSE 'FAIL' END,'persisted scoped unexpired quote','quote_id='||rowq.id);
 CALL pg_temp.package7_quote_put('exact_financial_snapshot',CASE WHEN
  (s->>'subtotal')::numeric=200.00 AND (s->>'discount_amount')::numeric=10.00
  AND (s->>'taxable_subtotal')::numeric=190.00 AND (s->>'vat_rate')::numeric=15.00
  AND (s->>'vat_amount')::numeric=28.50 AND (s->>'total')::numeric=218.50
  AND (s->'items'->0->>'unit_price')::numeric=100.00
  AND (s->'items'->0->>'quantity')::numeric=2 THEN 'PASS' ELSE 'FAIL' END,
  '100.00/2/200.00/10.00/190.00/15.00/28.50/218.50 exact numeric',s::text);
 CALL pg_temp.package7_quote_put('version_contract',CASE WHEN rowq.quote_version='financial-quote-v1'
  AND rowq.financial_engine_version='financial-engine-v2-r1'
  AND rowq.request_fingerprint_version='atomic-request-fingerprint-v2'
  AND rowq.quote_snapshot_version='authoritative-quote-payload-v1'
  AND rowq.issuer_context_version='atomic-auth-context-v1' THEN 'PASS' ELSE 'FAIL' END,
  'all frozen engine/rule versions',pg_catalog.jsonb_build_object(
  'quote',rowq.quote_version,'engine',rowq.financial_engine_version,
  'pricing',rowq.pricing_rule_version,'vat',rowq.vat_rule_version,
  'discount',rowq.discount_rule_version,'rounding',rowq.rounding_version)::text);
 ok:=public.verify_authoritative_quote_hash_v1(rowq.quote_payload,rowq.quote_hash);
 CALL pg_temp.package7_quote_put('hash_verification',CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END,'true','verified='||ok);
 CALL pg_temp.package7_quote_put('tampered_hash',CASE WHEN NOT public.verify_authoritative_quote_hash_v1(
  rowq.quote_payload||'{"tampered":true}'::jsonb,rowq.quote_hash) THEN 'PASS' ELSE 'FAIL' END,
  'false for changed payload','tamper rejected');

 INSERT INTO pg_temp.package7_quote_runtime VALUES(
  c.package7_run_identifier,ctx,rowq.id,key_hash,rowq.request_fingerprint,
  rowq.quote_fingerprint,rowq.quote_hash,q->'canonical_customer_intent',
  q->'canonical_note',q->'canonical_financial_intent',s);

 /* The actual trigger rejects mutation. Package 7 deliberately exercises only
    UPDATE; it contains no quote-deletion path. The unconditional trigger
    definition is verified statically for both UPDATE and DELETE events. */
 BEGIN
  UPDATE public.financial_quotes SET correlation_id=correlation_id WHERE id=rowq.id;
  CALL pg_temp.package7_quote_put('immutable_update','FAIL','55000 FINANCIAL_QUOTE_IMMUTABLE','unexpected success');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
  CALL pg_temp.package7_quote_put('immutable_update',CASE WHEN st='55000' AND msg='FINANCIAL_QUOTE_IMMUTABLE' THEN 'PASS' ELSE 'FAIL' END,
   '55000 FINANCIAL_QUOTE_IMMUTABLE',st||' '||msg); END;
 /* Actual invalid item scope test; issuer context remains issued on failure. */
 key_hash:=pg_catalog.encode(extensions.digest(c.package7_run_identifier||':quote:cross','sha256'),'hex');
 SELECT context_token INTO STRICT token FROM public.issue_atomic_authorization_context_v1(
  c.primary_branch_id,key_hash,'package7:'||c.package7_run_identifier||':quote-cross');
 intent:=pg_catalog.jsonb_set(intent,'{items}',pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('catalog_item_id',c.isolation_item_id,'quantity',2)));
 BEGIN
  PERFORM public.issue_authoritative_financial_quote_v1(token,intent,
   'package7:'||c.package7_run_identifier||':quote-cross');
  CALL pg_temp.package7_quote_put('cross_tenant_item','FAIL','42501 QUOTE_SCOPE_INVALID','unexpected success');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
  CALL pg_temp.package7_quote_put('cross_tenant_item',CASE WHEN st='42501' AND msg='QUOTE_SCOPE_INVALID' THEN 'PASS' ELSE 'FAIL' END,
   '42501 QUOTE_SCOPE_INVALID',st||' '||msg); END;

 /* Wrong customer is likewise checked through the issuer. */
 key_hash:=pg_catalog.encode(extensions.digest(c.package7_run_identifier||':quote:customer','sha256'),'hex');
 SELECT context_token INTO STRICT token FROM public.issue_atomic_authorization_context_v1(
  c.primary_branch_id,key_hash,'package7:'||c.package7_run_identifier||':quote-customer');
 intent:=pg_catalog.jsonb_set(intent,'{items}',pg_catalog.jsonb_build_array(
  pg_catalog.jsonb_build_object('catalog_item_id',c.tracked_item_id,'quantity',2)));
 intent:=pg_catalog.jsonb_set(intent,'{customer,id}',pg_catalog.to_jsonb(c.isolation_customer_id));
 BEGIN
  PERFORM public.issue_authoritative_financial_quote_v1(token,intent,
   'package7:'||c.package7_run_identifier||':quote-customer');
  CALL pg_temp.package7_quote_put('wrong_customer','FAIL','42501 QUOTE_SCOPE_INVALID','unexpected success');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
  CALL pg_temp.package7_quote_put('wrong_customer',CASE WHEN st='42501' AND msg='QUOTE_SCOPE_INVALID' THEN 'PASS' ELSE 'FAIL' END,
   '42501 QUOTE_SCOPE_INVALID',st||' '||msg); END;

 CALL pg_temp.package7_quote_put('disabled_activation',CASE WHEN NOT EXISTS(SELECT 1 FROM public.core_v2_activation_control
  WHERE global_enabled OR deterministic_canary_percentage<>0
     OR pos_enabled OR admin_orders_enabled OR quote_issuer_enabled
     OR outbox_worker_enabled OR NOT kill_switch) THEN 'PASS' ELSE 'FAIL' END,
  'Core V2 remains disabled','database state checked');
END $tests$;
SELECT * FROM pg_temp.package7_quote_results ORDER BY test_name;
COMMIT;
