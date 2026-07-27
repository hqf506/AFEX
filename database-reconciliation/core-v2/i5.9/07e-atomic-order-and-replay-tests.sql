/* AFEX Core V2 Package 7 / package7.atomic_order_replay
Actual atomic order/replay suite. Run after 07d in the same dedicated
disposable Clone. Provider delivery remains externally disabled; committed
runtime rows remain until external Clone disposal. */
BEGIN;
DO $guard$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE;
BEGIN
 IF pg_catalog.to_regclass('pg_temp.package7_fixture_context') IS NULL
 OR pg_catalog.to_regclass('pg_temp.package7_before_images') IS NULL
 OR pg_catalog.to_regclass('pg_temp.package7_created_rows') IS NULL
 OR pg_catalog.to_regclass('pg_temp.package7_quote_runtime') IS NULL
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_CONTEXT_MISSING'; END IF;
 IF pg_catalog.to_regclass('pg_temp.package7_atomic_results') IS NOT NULL
 THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_STALE_RESULTS_PRESENT'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pg_temp.package7_fixture_context)<>1
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_quote_runtime)<>1
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
CREATE TEMP TABLE pg_temp.package7_atomic_results(
 suite_name text NOT NULL DEFAULT 'package7.atomic_order_replay',test_name text NOT NULL,
 result text NOT NULL CHECK(result IN('PASS','FAIL','NOT_RUN')),blocking boolean NOT NULL,
 expected text NOT NULL,observed text NOT NULL,required_action text,run_identifier text NOT NULL,
 PRIMARY KEY(run_identifier,test_name)) ON COMMIT PRESERVE ROWS;
/* Canonical cross-file ownership contract. One row owns one exact UUID.
Secrets are excluded. Parent columns encode exact runtime ownership and
contamination-verification relationships before disposable Clone disposal. */
CREATE TEMP TABLE pg_temp.package7_runtime_ownership(
 package7_run_identifier text NOT NULL,
 test_case_identifier text NOT NULL,
 object_type text NOT NULL CHECK(object_type IN(
  'authorization_context','financial_quote','idempotency_command','order',
  'invoice','invoice_item','inventory_movement','audit_log','outbox_event')),
 object_id uuid NOT NULL,
 parent_object_type text,
 parent_object_id uuid,
 tenant_id uuid NOT NULL,
 branch_id uuid NOT NULL,
 idempotency_key_hash text,
 request_fingerprint text,
 correlation_id text,
 created_at timestamptz NOT NULL,
 PRIMARY KEY(package7_run_identifier,object_type,object_id),
 CHECK((parent_object_type IS NULL)=(parent_object_id IS NULL)),
 CHECK(idempotency_key_hash IS NULL
  OR idempotency_key_hash~'^[0-9a-f]{64}$'),
 CHECK(request_fingerprint IS NULL
  OR request_fingerprint~'^[0-9a-f]{64}$')
) ON COMMIT PRESERVE ROWS;
CREATE PROCEDURE pg_temp.package7_atomic_put(
 n text,r text,e text,o text,b boolean DEFAULT true)
LANGUAGE plpgsql AS $p$
BEGIN
 INSERT INTO pg_temp.package7_atomic_results
 (test_name,result,blocking,expected,observed,run_identifier)
 SELECT n,r,b,e,o,package7_run_identifier FROM pg_temp.package7_fixture_context;
END $p$;

DO $tests$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE; qr pg_temp.package7_quote_runtime%ROWTYPE;
 token text; command jsonb; result1 jsonb; result2 jsonb; changed jsonb;
 v_order_id uuid; v_invoice_id uuid; idem public.idempotency_commands%ROWTYPE;
 v_atomic_context_id uuid; v_atomic_quote_id uuid;
 v_replay_context_id uuid; v_conflict_context_id uuid;
 before_stock numeric; after_stock numeric; before_seq integer; after_seq integer;
 n bigint; expected_outbox bigint; st text; msg text; replay_hash text;
BEGIN
 SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
 SELECT * INTO STRICT qr FROM pg_temp.package7_quote_runtime
 WHERE run_identifier=c.package7_run_identifier;
 SELECT quantity_on_hand INTO STRICT before_stock FROM public.inventory_stock
 WHERE id=c.primary_inventory_id;
 SELECT last_sequence INTO STRICT before_seq FROM public.order_number_sequences
 WHERE tenant_id=c.primary_tenant_id AND branch_id=c.primary_branch_id
 AND sequence_month=c.sequence_month;
 IF before_stock<>10.00 OR before_seq<>700 THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_ATOMIC_BASELINE_INVALID';
 END IF;
 command:=pg_catalog.jsonb_build_object(
  'command_type','create_order','branch_id',c.primary_branch_id,
  'idempotency_key_hash',qr.idempotency_key_hash,
  'request_fingerprint',qr.request_fingerprint,'quote_id',qr.quote_id,
  'quote_fingerprint',qr.quote_fingerprint,'quote_hash',qr.quote_hash,
  'customer',qr.canonical_customer_intent,'note',qr.canonical_note);
 /* We cannot recover qr's raw token (by design). Issue a fresh quote bound to
 the atomic key and use its context, preserving no raw token after this block. */
 DECLARE fresh_quote jsonb; intent jsonb;
 BEGIN
  SELECT context_id,context_token INTO STRICT v_atomic_context_id,token
  FROM public.issue_atomic_authorization_context_v1(c.primary_branch_id,
   qr.idempotency_key_hash,'package7:'||c.package7_run_identifier||':atomic');
  intent:=pg_catalog.jsonb_build_object('customer',qr.canonical_customer_intent,
   'note',qr.canonical_note,'items',qr.canonical_financial_intent->'items',
   'discount_id',qr.canonical_financial_intent->'discount_id',
   'payment_method',qr.canonical_financial_intent->'payment_method',
   'cash_received',qr.canonical_financial_intent->'cash_received');
  fresh_quote:=public.issue_authoritative_financial_quote_v1(token,intent,
   'package7:'||c.package7_run_identifier||':atomic');
  v_atomic_quote_id:=(fresh_quote->>'quote_id')::uuid;
  command:=command||pg_catalog.jsonb_build_object(
   'request_fingerprint',fresh_quote->>'request_fingerprint',
   'quote_id',fresh_quote->>'quote_id','quote_fingerprint',fresh_quote->>'quote_fingerprint',
   'quote_hash',fresh_quote->>'quote_hash','customer',fresh_quote->'canonical_customer_intent',
   'note',fresh_quote->'canonical_note');
  result1:=public.create_order_atomic_v2(
   pg_catalog.jsonb_build_object('authorization_context_token',token),
   command,fresh_quote->'canonical_financial_intent','[]'::jsonb);
 END;
 v_order_id:=(result1->>'order_id')::uuid; v_invoice_id:=(result1->>'invoice_id')::uuid;
 SELECT d.* INTO STRICT idem FROM public.idempotency_commands d
 WHERE d.order_id=v_order_id AND d.invoice_id=v_invoice_id;
 SELECT quantity_on_hand INTO STRICT after_stock FROM public.inventory_stock WHERE id=c.primary_inventory_id;
 SELECT last_sequence INTO STRICT after_seq FROM public.order_number_sequences
 WHERE tenant_id=c.primary_tenant_id AND branch_id=c.primary_branch_id
 AND sequence_month=c.sequence_month;
 CALL pg_temp.package7_atomic_put('atomic_success',CASE WHEN result1->>'response_version'='atomic-order-response-v1'
  AND (result1->>'total')::numeric=218.50 THEN 'PASS' ELSE 'FAIL' END,
  'one 218.50 atomic response',result1::text);
 SELECT pg_catalog.count(*) INTO n FROM public.orders o WHERE o.id=v_order_id
 AND tenant_id=c.primary_tenant_id AND branch_id=c.primary_branch_id
 AND customer_id=c.primary_customer_id AND atomic_engine_version='atomic-order-v2-r1';
 CALL pg_temp.package7_atomic_put('order_persistence',CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END,'one order',n::text);
 SELECT pg_catalog.count(*) INTO n FROM public.invoices i WHERE i.id=v_invoice_id
 AND i.order_id=v_order_id AND i.tenant_id=c.primary_tenant_id AND i.branch_id=c.primary_branch_id
 AND i.total=218.50 AND i.subtotal=200.00 AND i.discount=10.00 AND i.taxable_subtotal=190.00
 AND i.vat_rate_snapshot=15.00 AND i.vat_amount=28.50
 AND i.financial_quote_id=(command->>'quote_id')::uuid;
 CALL pg_temp.package7_atomic_put('invoice_snapshot_and_quote_link',CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END,
  'one exact invoice and quote link',n::text);
 SELECT pg_catalog.count(*) INTO n FROM public.invoice_items ii WHERE ii.invoice_id=v_invoice_id
 AND ii.item_id=c.tracked_item_id AND ii.quantity=2 AND ii.unit_price=100.00 AND ii.line_total=200.00;
 CALL pg_temp.package7_atomic_put('invoice_items',CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END,'one exact line',n::text);
 CALL pg_temp.package7_atomic_put('number_allocation',CASE WHEN after_seq=701 AND result1->>'order_number'=
  result1->>'invoice_number' THEN 'PASS' ELSE 'FAIL' END,
  'sequence 701 and equal numbers','sequence='||after_seq||';number='||(result1->>'order_number'));
 CALL pg_temp.package7_atomic_put('inventory_deduction',CASE WHEN after_stock=8.00 THEN 'PASS' ELSE 'FAIL' END,
  '10.00 to 8.00','before='||before_stock||';after='||after_stock);
 SELECT pg_catalog.count(*) INTO n FROM public.inventory_movements m
 WHERE m.source_id IN(v_order_id,v_invoice_id) AND m.catalog_item_id=c.tracked_item_id
 AND m.tenant_id=c.primary_tenant_id AND m.branch_id=c.primary_branch_id;
 CALL pg_temp.package7_atomic_put('inventory_movement',CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END,'one exact movement',n::text);
 SELECT pg_catalog.count(*) INTO n FROM public.audit_logs a WHERE a.order_id=v_order_id
 AND a.invoice_id=v_invoice_id AND a.action='order.created.atomic_v2';
 CALL pg_temp.package7_atomic_put('audit',CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END,'one atomic audit',n::text);
 SELECT pg_catalog.count(*) INTO n FROM public.atomic_outbox WHERE correlation_id=idem.correlation_id;
 expected_outbox:=2; /* order-created plus inventory-mutated; existing customer */
 CALL pg_temp.package7_atomic_put('outbox',CASE WHEN n=expected_outbox AND NOT EXISTS(
  SELECT 1 FROM public.atomic_outbox WHERE correlation_id=idem.correlation_id
  AND execution_status<>'pending_commit') THEN 'PASS' ELSE 'FAIL' END,
  expected_outbox||' pending events',n::text);
 CALL pg_temp.package7_atomic_put('idempotency_commit',CASE WHEN idem.state='committed'
  AND idem.response_version='atomic-order-response-v1' AND idem.response_hash~'^[0-9a-f]{64}$'
  THEN 'PASS' ELSE 'FAIL' END,'one committed command','id='||idem.id||';state='||idem.state);
 replay_hash:=pg_catalog.encode(extensions.digest(result1::text,'sha256'),'hex');
 /* Fresh context, same key and request: committed replay before quote checks. */
 SELECT context_id,context_token INTO STRICT v_replay_context_id,token
 FROM public.issue_atomic_authorization_context_v1(
  c.primary_branch_id,qr.idempotency_key_hash,
  'package7:'||c.package7_run_identifier||':replay');
 result2:=public.create_order_atomic_v2(pg_catalog.jsonb_build_object(
  'authorization_context_token',token),command,qr.canonical_financial_intent,'[]'::jsonb);
 SELECT quantity_on_hand INTO STRICT after_stock FROM public.inventory_stock WHERE id=c.primary_inventory_id;
 SELECT last_sequence INTO STRICT after_seq FROM public.order_number_sequences
 WHERE tenant_id=c.primary_tenant_id AND branch_id=c.primary_branch_id AND sequence_month=c.sequence_month;
 CALL pg_temp.package7_atomic_put('committed_replay',CASE WHEN result2=result1 AND after_stock=8.00 AND after_seq=701
  THEN 'PASS' ELSE 'FAIL' END,'identical result; no stock/number change',
  'same='||(result2=result1)||';stock='||after_stock||';sequence='||after_seq);
 SELECT (SELECT pg_catalog.count(*) FROM public.orders o WHERE o.id=v_order_id)
  +(SELECT pg_catalog.count(*) FROM public.invoices i WHERE i.id=v_invoice_id)
  +(SELECT pg_catalog.count(*) FROM public.invoice_items ii WHERE ii.invoice_id=v_invoice_id)
 INTO n;
 CALL pg_temp.package7_atomic_put('replay_no_duplicate_persistence',CASE WHEN n=3 THEN 'PASS' ELSE 'FAIL' END,
  'one order + one invoice + one item',n::text);
 SELECT pg_catalog.count(*) INTO n FROM public.atomic_outbox WHERE correlation_id=idem.correlation_id;
 CALL pg_temp.package7_atomic_put('replay_no_duplicate_outbox',CASE WHEN n=expected_outbox THEN 'PASS' ELSE 'FAIL' END,
  expected_outbox::text,n::text);

 /* Same key, changed payload produces exact fingerprint conflict. */
 SELECT context_id,context_token INTO STRICT v_conflict_context_id,token
 FROM public.issue_atomic_authorization_context_v1(
  c.primary_branch_id,qr.idempotency_key_hash,
  'package7:'||c.package7_run_identifier||':conflict');
 changed:=pg_catalog.jsonb_set(command,'{note}',pg_catalog.to_jsonb('changed'));
 changed:=pg_catalog.jsonb_set(changed,'{request_fingerprint}',pg_catalog.to_jsonb(
  public.build_atomic_request_fingerprint_v2(changed,qr.canonical_financial_intent)));
 BEGIN
  PERFORM public.create_order_atomic_v2(pg_catalog.jsonb_build_object(
   'authorization_context_token',token),changed,qr.canonical_financial_intent,'[]'::jsonb);
  CALL pg_temp.package7_atomic_put('fingerprint_conflict','FAIL','23505 IDEMPOTENCY_FINGERPRINT_CONFLICT','unexpected success');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
  CALL pg_temp.package7_atomic_put('fingerprint_conflict',CASE WHEN st='23505' AND msg='IDEMPOTENCY_FINGERPRINT_CONFLICT'
   THEN 'PASS' ELSE 'FAIL' END,'23505 IDEMPOTENCY_FINGERPRINT_CONFLICT',st||' '||msg); END;

 /* No frozen cancellation API exists in Package 4T/6. */
 CALL pg_temp.package7_atomic_put('cancellation_restoration','NOT_RUN','approved cancellation transaction path',
  'no approved cancellation function in frozen contract',false);
 CALL pg_temp.package7_atomic_put('provider_delivery',CASE WHEN NOT EXISTS(SELECT 1 FROM public.atomic_outbox
  WHERE correlation_id=idem.correlation_id AND delivered_at IS NOT NULL) THEN 'PASS' ELSE 'FAIL' END,
  'zero delivered provider events','database outbox inspected');

 /* Capture exact ownership only after every runtime assertion. Exact equality
 is used for the finite pre-07e context list; no wildcard owns a row. */
 INSERT INTO pg_temp.package7_runtime_ownership(
  package7_run_identifier,test_case_identifier,object_type,object_id,
  tenant_id,branch_id,idempotency_key_hash,correlation_id,created_at)
 SELECT c.package7_run_identifier,a.server_request_id,'authorization_context',
  a.context_id,a.tenant_id,a.branch_id,a.idempotency_key_hash,
  a.consumed_correlation_id::text,a.issued_at
 FROM public.atomic_authorization_contexts a
 WHERE a.server_request_id=ANY(ARRAY[
  'package7:'||c.package7_run_identifier||':auth-base',
  'package7:'||c.package7_run_identifier||':auth-revoke',
  'package7:'||c.package7_run_identifier||':auth-purpose',
  'package7:'||c.package7_run_identifier||':auth-actor',
  'package7:'||c.package7_run_identifier||':auth-expiry',
  'package7:'||c.package7_run_identifier||':auth-pos',
  'package7:'||c.package7_run_identifier||':quote-primary',
  'package7:'||c.package7_run_identifier||':quote-cross',
  'package7:'||c.package7_run_identifier||':quote-customer',
  'package7:'||c.package7_run_identifier||':atomic',
  'package7:'||c.package7_run_identifier||':replay',
  'package7:'||c.package7_run_identifier||':conflict'
 ]);

 INSERT INTO pg_temp.package7_runtime_ownership(
  package7_run_identifier,test_case_identifier,object_type,object_id,
  parent_object_type,parent_object_id,tenant_id,branch_id,
  request_fingerprint,correlation_id,created_at)
 SELECT c.package7_run_identifier,'quote-primary','financial_quote',q.id,
  'authorization_context',q.authorization_context_id,q.tenant_id,q.branch_id,
  q.request_fingerprint,q.correlation_id,q.created_at
 FROM public.financial_quotes q WHERE q.id=qr.quote_id
 UNION ALL
 SELECT c.package7_run_identifier,'atomic','financial_quote',q.id,
  'authorization_context',q.authorization_context_id,q.tenant_id,q.branch_id,
  q.request_fingerprint,q.correlation_id,q.created_at
 FROM public.financial_quotes q WHERE q.id=v_atomic_quote_id;

 INSERT INTO pg_temp.package7_runtime_ownership VALUES
 (c.package7_run_identifier,'atomic','idempotency_command',idem.id,
  'order',v_order_id,c.primary_tenant_id,c.primary_branch_id,
  idem.key_hash,idem.request_fingerprint,idem.correlation_id,idem.started_at),
 (c.package7_run_identifier,'atomic','order',v_order_id,NULL,NULL,
  c.primary_tenant_id,c.primary_branch_id,idem.key_hash,
  idem.request_fingerprint,idem.correlation_id,
  (SELECT o.created_at FROM public.orders o WHERE o.id=v_order_id)),
 (c.package7_run_identifier,'atomic','invoice',v_invoice_id,'order',v_order_id,
  c.primary_tenant_id,c.primary_branch_id,NULL,idem.request_fingerprint,
  idem.correlation_id,
  (SELECT i.created_at FROM public.invoices i WHERE i.id=v_invoice_id));

 INSERT INTO pg_temp.package7_runtime_ownership(
  package7_run_identifier,test_case_identifier,object_type,object_id,
  parent_object_type,parent_object_id,tenant_id,branch_id,
  request_fingerprint,correlation_id,created_at)
 SELECT c.package7_run_identifier,'atomic','invoice_item',i.id,'invoice',
  v_invoice_id,c.primary_tenant_id,c.primary_branch_id,
  idem.request_fingerprint,i.inventory_movement_correlation_id,i.created_at
 FROM public.invoice_items i WHERE i.invoice_id=v_invoice_id;

 INSERT INTO pg_temp.package7_runtime_ownership(
  package7_run_identifier,test_case_identifier,object_type,object_id,
  parent_object_type,parent_object_id,tenant_id,branch_id,
  request_fingerprint,correlation_id,created_at)
 SELECT c.package7_run_identifier,'atomic','inventory_movement',m.id,'order',
  v_order_id,m.tenant_id,m.branch_id,idem.request_fingerprint,
  m.correlation_id,m.created_at
 FROM public.inventory_movements m
 WHERE m.order_id=v_order_id AND m.invoice_id=v_invoice_id
 UNION ALL
 SELECT c.package7_run_identifier,'atomic','audit_log',a.id,'order',
  v_order_id,a.tenant_id,a.branch_id,a.request_fingerprint,
  a.correlation_id,a.created_at
 FROM public.audit_logs a
 WHERE a.order_id=v_order_id AND a.invoice_id=v_invoice_id
 UNION ALL
 SELECT c.package7_run_identifier,'atomic','outbox_event',o.id,
  CASE o.aggregate_type WHEN 'invoice' THEN 'invoice'
   WHEN 'inventory' THEN 'order' ELSE o.aggregate_type END,
  o.aggregate_id,o.tenant_id,o.branch_id,idem.request_fingerprint,
  o.correlation_id,o.created_at
 FROM public.atomic_outbox o WHERE o.correlation_id=idem.correlation_id;

 IF (SELECT pg_catalog.count(*) FROM pg_temp.package7_runtime_ownership
     WHERE object_type='order')<>1
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_runtime_ownership
     WHERE object_type='invoice')<>1
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_runtime_ownership
     WHERE object_type='invoice_item')<>1
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_runtime_ownership
     WHERE object_type='inventory_movement')<>1
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_runtime_ownership
     WHERE object_type='audit_log')<>1
 OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_runtime_ownership
     WHERE object_type='outbox_event')<>expected_outbox
 OR NOT EXISTS(SELECT 1 FROM pg_temp.package7_runtime_ownership
     WHERE object_type='authorization_context' AND object_id=v_atomic_context_id)
 OR NOT EXISTS(SELECT 1 FROM pg_temp.package7_runtime_ownership
     WHERE object_type='authorization_context' AND object_id=v_replay_context_id)
 OR NOT EXISTS(SELECT 1 FROM pg_temp.package7_runtime_ownership
     WHERE object_type='authorization_context' AND object_id=v_conflict_context_id)
 THEN
  RAISE EXCEPTION USING ERRCODE='55000',
   MESSAGE='PACKAGE7_RUNTIME_OWNERSHIP_INCOMPLETE';
 END IF;
END $tests$;
SELECT * FROM pg_temp.package7_atomic_results ORDER BY test_name;
COMMIT;
