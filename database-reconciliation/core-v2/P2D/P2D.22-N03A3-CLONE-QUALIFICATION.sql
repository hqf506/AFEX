\set ON_ERROR_STOP on
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TEMP TABLE n03a4_baseline AS
SELECT (SELECT count(*) FROM public.customers) customers,
       (SELECT count(*) FROM public.orders) orders,
       (SELECT count(*) FROM public.invoices) invoices,
       (SELECT count(*) FROM public.customer_phone_identity_members) phone_members,
       (SELECT count(*) FROM public.orders o JOIN public.customers c ON c.id=o.customer_id WHERE c.phone NOT LIKE 'P2D22_N03A4_TEST%') historical_order_links,
       (SELECT md5(string_agg(id::text||':'||phone,',' ORDER BY id)) FROM public.customers) customer_phone_digest;

DO $structure$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
 WHERE s.nspname='public' AND c.relname IN('atomic_order_claims','atomic_order_retry_authorizations','atomic_order_business_links','atomic_order_line_links','atomic_order_audit','atomic_order_diagnostics');
 IF n<>6 THEN RAISE EXCEPTION 'QUALIFICATION_TABLE_INVENTORY_FAILED';END IF;
 IF to_regprocedure('public.execute_atomic_order_command_v1(uuid,uuid)') IS NULL
    OR to_regprocedure('afex_core_private.persist_atomic_order_business_v1(uuid,uuid)') IS NULL
    OR to_regprocedure('public.execute_atomic_order_command_v1(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'QUALIFICATION_FUNCTION_INVENTORY_FAILED';END IF;
 IF has_function_privilege('service_role','public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamptz)','EXECUTE')
    OR has_schema_privilege('service_role','afex_core_private','USAGE')
    OR has_function_privilege('service_role','public.authorize_atomic_order_retry_v1(uuid,uuid,bytea)','EXECUTE') THEN RAISE EXCEPTION 'QUALIFICATION_PRIVATE_EXPOSURE';END IF;
 IF NOT has_function_privilege('service_role','public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamptz)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.claim_atomic_order_command_v1(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.execute_atomic_order_command_v1(uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.replay_atomic_order_command_v1(uuid)','EXECUTE') THEN RAISE EXCEPTION 'QUALIFICATION_SERVICE_ACL_FAILED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname IN('public','afex_core_private') AND p.proname LIKE '%atomic_order%' AND p.prosecdef AND NOT(p.proconfig@>ARRAY['search_path=pg_catalog'])) THEN RAISE EXCEPTION 'QUALIFICATION_SEARCH_PATH_FAILED';END IF;
 IF afex_core_private.valid_atomic_order_success_snapshot_v1('{}'::jsonb)
    OR afex_core_private.valid_atomic_order_success_snapshot_v1('{"responseVersion":"atomic-order-result-v1","result":"succeeded"}'::jsonb) THEN RAISE EXCEPTION 'QUALIFICATION_M01_NEGATIVE_FAILED';END IF;
END $structure$;

INSERT INTO public.tenants(id,name) VALUES('a4000000-0000-4000-8000-000000000001','P2D22_N03A4_TEST');
INSERT INTO public.branches(id,code,name,tenant_id,order_number_prefix)
VALUES('a4000000-0000-4000-8000-000000000002','N03A4','P2D22_N03A4_TEST','a4000000-0000-4000-8000-000000000001','N4');
INSERT INTO public.branches(id,code,name,tenant_id,order_number_prefix)
VALUES('a4000000-0000-4000-8000-000000000012','N03B4','P2D22_N03A4_TEST_OTHER_BRANCH','a4000000-0000-4000-8000-000000000001','NB');
INSERT INTO auth.users(id) VALUES('a4000000-0000-4000-8000-000000000003');
INSERT INTO public.profiles(id,full_name,username,role,branch_id,tenant_id)
VALUES('a4000000-0000-4000-8000-000000000003','P2D22 N03A4 Test','p2d22_n03a4_test','cashier','a4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000001');
INSERT INTO public.customers(id,name,phone,created_by,branch_id,tenant_id)
VALUES('a4000000-0000-4000-8000-000000000004','P2D22_N03A4_TEST_CUSTOMER','+966599999904','a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000001');
INSERT INTO public.tenants(id,name) VALUES('a4000000-0000-4000-8000-000000000021','P2D22_N03A4_TEST_OTHER_TENANT');
INSERT INTO public.branches(id,code,name,tenant_id,order_number_prefix) VALUES('a4000000-0000-4000-8000-000000000022','N03T4','P2D22_N03A4_TEST_OTHER_TENANT_BRANCH','a4000000-0000-4000-8000-000000000021','NT');
INSERT INTO public.customers(id,name,phone,branch_id,tenant_id) VALUES('a4000000-0000-4000-8000-000000000024','P2D22_N03A4_TEST_OTHER_CUSTOMER','+966599999924','a4000000-0000-4000-8000-000000000022','a4000000-0000-4000-8000-000000000021');
INSERT INTO public.catalog_items(id,code,name,category,item_type,default_price,cost_price,tenant_id,track_inventory,inventory_enabled_at)
VALUES('a4000000-0000-4000-8000-000000000005','P2D22_N03A4_TEST_ITEM','P2D22_N03A4_TEST_ITEM','test','product',999.99,1.00,'a4000000-0000-4000-8000-000000000001',true,now());
INSERT INTO public.inventory_stock(id,tenant_id,branch_id,catalog_item_id,quantity_on_hand)
VALUES('a4000000-0000-4000-8000-000000000006','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000005',1000);

CREATE SCHEMA p2d22_n03a4;
CREATE FUNCTION p2d22_n03a4.payload(gross numeric,discount numeric,vat numeric,mode text,suffix integer,qty integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE line_id uuid:=('a4'||lpad(suffix::text,6,'0')||'-0000-4000-8000-000000000010')::uuid;
 net numeric(20,2):=gross-discount; total numeric(20,2):=gross-discount+vat; xmin_value text;catalog_version text;
BEGIN
 SELECT xmin::text INTO xmin_value FROM public.customers WHERE id='a4000000-0000-4000-8000-000000000004';
 SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') INTO catalog_version FROM public.catalog_items WHERE id='a4000000-0000-4000-8000-000000000005';
 RETURN jsonb_build_object(
  'payload_version','order-command-payload-v1','fingerprint_version','order-request-fingerprint-v1','command_type','order.create',
  'tenant_id','a4000000-0000-4000-8000-000000000001','branch_id','a4000000-0000-4000-8000-000000000002','authenticated_actor_id','a4000000-0000-4000-8000-000000000003',
  'customer',jsonb_build_object('mode','existing','customer_id','a4000000-0000-4000-8000-000000000004','expected_record_version',xmin_value::bigint,'normalized_phone',NULL,'display_phone',NULL,'name',NULL,'email',NULL,'address',NULL,'notes',NULL,'allowed_update_fields','[]'::jsonb,'conflict_behavior','reject'),
  'items',jsonb_build_array(jsonb_build_object('line_id',line_id,'line_number',1,'catalog_item_id','a4000000-0000-4000-8000-000000000005','name_snapshot','P2D22_N03A4_TEST_ITEM','sku_snapshot','P2D22_N03A4_TEST_ITEM','category_snapshot','test','item_type_snapshot','product','quantity',qty::text,'unit_snapshot','item','inventory_tracking_mode','tracked_product','fulfillment_class','immediate','line_note',NULL,'modifiers','[]'::jsonb)),
  'pricing',jsonb_build_object('currency','SAR','currency_precision',2,'subtotal',to_char(gross,'FM9999999990.00'),'taxable_subtotal',to_char(net,'FM9999999990.00'),'total',to_char(total,'FM9999999990.00'),'rounding_strategy','invoice-half-up-v1','price_version','P2D22_N03A4_TEST','branch_pricing_version',NULL,'quote_reference','P2D22_N03A4_TEST','quote_version','financial-quote-v1','quote_fingerprint',repeat('a',64),'financial_engine_version','financial-engine-v2-r1','lines',jsonb_build_array(jsonb_build_object('line_id',line_id,'unit_price',to_char(gross/qty,'FM9999999990.00'),'pricing_source','catalog_default','source_catalog_id','a4000000-0000-4000-8000-000000000005','source_branch_price_id',NULL,'source_catalog_version',catalog_version,'source_branch_price_version',NULL,'gross_amount',to_char(gross,'FM9999999990.00'),'discount_allocation',to_char(discount,'FM9999999990.00'),'taxable_amount',to_char(net,'FM9999999990.00'),'vat_amount',to_char(vat,'FM9999999990.00'),'net_amount',to_char(net,'FM9999999990.00')))),
  'vat',jsonb_build_object('mode',mode,'tax_inclusive',false,'setting_id',CASE WHEN mode IN('exclusive','zero_rated') THEN 'a4000000-0000-4000-8000-000000000007'::uuid ELSE NULL END,'rate',CASE WHEN mode='exclusive' THEN '15' ELSE '0' END,'amount',to_char(vat,'FM9999999990.00'),'rule_version','P2D22_N03A4_TEST','effective_at','2026-01-01T00:00:00.000000Z'),
  'discount',CASE WHEN discount=0 THEN jsonb_build_object('id',NULL,'source','none','name_snapshot',NULL,'type',NULL,'value',NULL,'amount','0.00','eligibility_version',NULL,'rule_version',NULL) ELSE jsonb_build_object('id',NULL,'source','manual','name_snapshot','P2D22_N03A4_TEST','type','fixed','value',to_char(discount,'FM9999999990.00'),'amount',to_char(discount,'FM9999999990.00'),'eligibility_version',NULL,'rule_version','P2D22_N03A4_TEST') END,
  'payment',jsonb_build_object('method','cash','amount_tendered',to_char(total,'FM9999999990.00'),'expected_status','paid','cash_received',to_char(total,'FM9999999990.00'),'remaining_from_customer','0.00','cash_change','0.00','rule_version','P2D22_N03A4_TEST','provider_reference',NULL),
  'fulfillment',jsonb_build_object('method','immediate','branch_id','a4000000-0000-4000-8000-000000000002','requested_at',NULL,'address',NULL,'instructions',NULL),
  'order',jsonb_build_object('note','P2D22_N03A4_TEST'),'metadata',jsonb_build_object('source_channel','pos','request_reference',NULL,'offline_draft_id',NULL,'correlation_id','P2D22_N03A4_TEST_'||suffix,'device_id',NULL,'pos_terminal_id',NULL,'client_version',NULL),
  'versions',jsonb_build_object('customer_engine','P2D22_N03A4_TEST','financial_engine','financial-engine-v2-r1','inventory_engine','P2D22_N03A4_TEST','numbering_engine','P2D22_N03A4_TEST','authorization_contract','P2D22_N03A4_TEST','payload_contract','order-command-payload-v1'));
END$$;

CREATE FUNCTION p2d22_n03a4.projection(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
WITH x AS(SELECT coalesce(jsonb_agg(value-'net_amount' ORDER BY ordinality),'[]'::jsonb)v FROM jsonb_array_elements(p->'pricing'->'lines')WITH ORDINALITY)
SELECT jsonb_set(jsonb_set(jsonb_set(jsonb_set(p-'fingerprint_version'-'issuance'-'retention'-'archive','{metadata}',jsonb_build_object('source_channel',p->'metadata'->'source_channel'),false),'{payment}',(p->'payment')-'masked_instrument'-'provider_reference',false),'{versions}',(p->'versions')-'payload_contract',false),'{pricing,lines}',x.v,false)FROM x$$;

CREATE TEMP TABLE n03a4_results(vector integer PRIMARY KEY,command_id uuid,claim_token uuid,snapshot jsonb,replay jsonb,stock_before numeric,stock_after numeric);
CREATE FUNCTION p2d22_n03a4.run_vector(v integer,g numeric,d numeric,t numeric,m text,q integer DEFAULT 1) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p jsonb;a jsonb;a2 jsonb;cl jsonb;s jsonb;r jsonb;cid uuid;tok uuid;before_stock numeric;after_stock numeric;
BEGIN
 p:=p2d22_n03a4.payload(g,d,t,m,v,q); SELECT quantity_on_hand INTO before_stock FROM public.inventory_stock WHERE id='a4000000-0000-4000-8000-000000000006';
 a:=public.acquire_atomic_order_command_result_v1('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','P2D22_N03A4_TEST_'||v,'P2D22_N03A4_TEST_'||v,public.canonicalize_atomic_order_json_v1(p),public.canonicalize_atomic_order_json_v1(p2d22_n03a4.projection(p)),now()+interval '1 day');
 IF a->>'result'<>'created' THEN RAISE EXCEPTION 'VECTOR_%_ACQUIRE_CREATED_FAILED: %',v,a;END IF; cid:=(a->>'commandId')::uuid;
 a2:=public.acquire_atomic_order_command_result_v1('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','P2D22_N03A4_TEST_'||v,'P2D22_N03A4_TEST_'||v,public.canonicalize_atomic_order_json_v1(p),public.canonicalize_atomic_order_json_v1(p2d22_n03a4.projection(p)),now()+interval '1 day');
 IF a2->>'result'<>'in_progress' THEN RAISE EXCEPTION 'VECTOR_%_ACQUIRE_REPEAT_FAILED: %',v,a2;END IF;
 IF public.replay_atomic_order_command_v1(cid)->>'result'<>'failed' THEN RAISE EXCEPTION 'VECTOR_%_PRE_REPLAY_FAILED',v;END IF;
 cl:=public.claim_atomic_order_command_v1(cid); IF cl->>'result'<>'claimed' THEN RAISE EXCEPTION 'VECTOR_%_CLAIM_FAILED: %',v,cl;END IF;tok:=(cl->>'claimToken')::uuid;
 IF public.execute_atomic_order_command_v1(cid,gen_random_uuid())->>'errorCode'<>'CLAIM_TOKEN_INVALID' THEN RAISE EXCEPTION 'VECTOR_%_WRONG_TOKEN_FAILED',v;END IF;
 s:=public.execute_atomic_order_command_v1(cid,tok); IF s->>'result'<>'succeeded' OR NOT afex_core_private.valid_atomic_order_success_snapshot_v1(s) THEN RAISE EXCEPTION 'VECTOR_%_EXECUTE_FAILED: %',v,s;END IF;
 r:=public.replay_atomic_order_command_v1(cid); IF r<>s THEN RAISE EXCEPTION 'VECTOR_%_REPLAY_MISMATCH',v;END IF;
 IF public.execute_atomic_order_command_v1(cid,tok)->>'errorCode'<>'CLAIM_TOKEN_INVALID' THEN RAISE EXCEPTION 'VECTOR_%_DUPLICATE_EXECUTE_FAILED',v;END IF;
 SELECT quantity_on_hand INTO after_stock FROM public.inventory_stock WHERE id='a4000000-0000-4000-8000-000000000006';
 INSERT INTO n03a4_results VALUES(v,cid,tok,s,r,before_stock,after_stock);
END$$;

SELECT p2d22_n03a4.run_vector(1,100.00,0.00,15.00,'exclusive');
SELECT p2d22_n03a4.run_vector(2,100.00,10.00,13.50,'exclusive');
SELECT p2d22_n03a4.run_vector(3,0.01,0.00,0.00,'exempt');
SELECT p2d22_n03a4.run_vector(4,999.99,99.99,135.00,'exclusive');
SELECT p2d22_n03a4.run_vector(5,25.55,5.55,3.00,'exclusive');

DO $e2e$
DECLARE z record;s jsonb;bad jsonb;
BEGIN
 FOR z IN SELECT * FROM n03a4_results LOOP
  s:=z.snapshot;
  IF z.stock_after<>z.stock_before-1 OR (s->>'subtotal')::numeric<>(ARRAY[100.00,100.00,0.01,999.99,25.55])[z.vector]
     OR (SELECT count(*) FROM public.atomic_order_business_links WHERE command_id=z.command_id)<>1
     OR (SELECT count(*) FROM public.atomic_order_line_links WHERE command_id=z.command_id)<>1
     OR (SELECT count(*) FROM public.orders WHERE id=(s->>'orderId')::uuid)<>1
     OR (SELECT count(*) FROM public.invoices WHERE id=(s->>'invoiceId')::uuid)<>1
     OR (SELECT count(*) FROM public.invoice_items WHERE invoice_id=(s->>'invoiceId')::uuid)<>1
     OR (SELECT count(*) FROM public.inventory_movements WHERE source_type='invoice_item' AND source_id=(s->'lines'->0->>'invoiceItemId')::uuid)<>1
     OR (SELECT count(*) FROM public.atomic_order_claims WHERE command_id=z.command_id AND consumed_at IS NOT NULL AND consumption_kind='execution')<>1
     OR (SELECT execution_status FROM public.atomic_order_commands WHERE id=z.command_id)<>'succeeded' THEN RAISE EXCEPTION 'VECTOR_%_E2E_DELTA_FAILED',z.vector;END IF;
 END LOOP;
 s:=(SELECT snapshot FROM n03a4_results WHERE vector=1);bad:=jsonb_set(s,'{lines,0,unexpected}','true'::jsonb,true);
 IF afex_core_private.valid_atomic_order_success_snapshot_v1(bad) OR afex_core_private.valid_atomic_order_success_snapshot_v1(s-'total') OR afex_core_private.valid_atomic_order_success_snapshot_v1(jsonb_set(s,'{lines,0,quantity}','"wrong"'::jsonb)) THEN RAISE EXCEPTION 'M01_NESTED_NEGATIVE_FAILED';END IF;
 IF EXISTS(SELECT 1 FROM n03a4_results WHERE replay<>snapshot) THEN RAISE EXCEPTION 'REPLAY_WRITE_OR_SNAPSHOT_MISMATCH';END IF;
END $e2e$;

DO $conflict_and_rejections$
DECLARE p jsonb;a jsonb;cid uuid;cl jsonb;tok uuid;
BEGIN
 p:=p2d22_n03a4.payload(10,0,0,'exempt',90,1);a:=public.acquire_atomic_order_command_result_v1('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','P2D22_N03A4_TEST_CONFLICT','P2D22_N03A4_TEST_90',public.canonicalize_atomic_order_json_v1(p),public.canonicalize_atomic_order_json_v1(p2d22_n03a4.projection(p)),now()+interval '1 day');cid:=(a->>'commandId')::uuid;
 p:=p2d22_n03a4.payload(11,0,0,'exempt',90,1);a:=public.acquire_atomic_order_command_result_v1('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','P2D22_N03A4_TEST_CONFLICT','P2D22_N03A4_TEST_90',public.canonicalize_atomic_order_json_v1(p),public.canonicalize_atomic_order_json_v1(p2d22_n03a4.projection(p)),now()+interval '1 day');IF a->>'result'<>'fingerprint_conflict' OR a->>'errorCode'<>'FINGERPRINT_CONFLICT' THEN RAISE EXCEPTION 'FINGERPRINT_CONFLICT_FAILED: %',a;END IF;
 cl:=public.claim_atomic_order_command_v1(cid);tok:=(cl->>'claimToken')::uuid;UPDATE public.atomic_order_claims SET issued_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute' WHERE claim_token=tok;
 IF public.execute_atomic_order_command_v1(cid,tok)->>'errorCode'<>'CLAIM_EXPIRED' THEN RAISE EXCEPTION 'EXPIRED_CLAIM_FAILED';END IF;
 p:=p2d22_n03a4.payload(10,0,0,'exempt',92,1);p:=jsonb_set(p,'{pricing,total}','"999.00"');BEGIN PERFORM public.acquire_atomic_order_command_result_v1('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','P2D22_N03A4_TEST_BAD_TOTAL','x',p::text,p2d22_n03a4.projection(p)::text,now()+interval '1 day');EXCEPTION WHEN OTHERS THEN NULL;END;
END $conflict_and_rejections$;

CREATE FUNCTION p2d22_n03a4.inject_failure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF current_setting('p2d22_n03a4.failure_phase',true)=TG_NAME THEN RAISE EXCEPTION USING errcode='P0001',message='P2D22_N03A4_INJECTED_FAILURE_'||TG_NAME;END IF;RETURN NEW;END$$;
CREATE TRIGGER n03a4_before_order BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION p2d22_n03a4.inject_failure();
CREATE TRIGGER n03a4_after_order AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION p2d22_n03a4.inject_failure();
CREATE TRIGGER n03a4_after_invoice AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION p2d22_n03a4.inject_failure();
CREATE TRIGGER n03a4_during_items BEFORE INSERT ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION p2d22_n03a4.inject_failure();
CREATE TRIGGER n03a4_during_inventory BEFORE INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION p2d22_n03a4.inject_failure();
CREATE TRIGGER n03a4_before_links BEFORE INSERT ON public.atomic_order_business_links FOR EACH ROW EXECUTE FUNCTION p2d22_n03a4.inject_failure();
CREATE TRIGGER n03a4_before_snapshot BEFORE UPDATE ON public.atomic_order_commands FOR EACH ROW WHEN(NEW.response_snapshot IS NOT NULL AND OLD.response_snapshot IS NULL) EXECUTE FUNCTION p2d22_n03a4.inject_failure();
CREATE TRIGGER n03a4_before_claim_consumption BEFORE UPDATE ON public.atomic_order_claims FOR EACH ROW WHEN(NEW.consumed_at IS NOT NULL AND OLD.consumed_at IS NULL AND NEW.consumption_kind='execution') EXECUTE FUNCTION p2d22_n03a4.inject_failure();
CREATE TRIGGER n03a4_before_terminal_success BEFORE INSERT ON public.atomic_order_audit FOR EACH ROW WHEN(NEW.event_code='SUCCEEDED') EXECUTE FUNCTION p2d22_n03a4.inject_failure();

DO $rollback_injection$
DECLARE phases text[]:=ARRAY['n03a4_before_order','n03a4_after_order','n03a4_after_invoice','n03a4_during_items','n03a4_during_inventory','n03a4_before_links','n03a4_before_snapshot','n03a4_before_claim_consumption','n03a4_before_terminal_success'];phase text;v integer:=100;p jsonb;a jsonb;cl jsonb;result jsonb;cid uuid;tok uuid;before_stock numeric;
BEGIN
 FOREACH phase IN ARRAY phases LOOP
  v:=v+1;p:=p2d22_n03a4.payload(10,0,0,'exempt',v,1);before_stock:=(SELECT quantity_on_hand FROM public.inventory_stock WHERE id='a4000000-0000-4000-8000-000000000006');
  a:=public.acquire_atomic_order_command_result_v1('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','P2D22_N03A4_TEST_INJECT_'||v,'P2D22_N03A4_TEST_'||v,public.canonicalize_atomic_order_json_v1(p),public.canonicalize_atomic_order_json_v1(p2d22_n03a4.projection(p)),now()+interval '1 day');cid:=(a->>'commandId')::uuid;cl:=public.claim_atomic_order_command_v1(cid);tok:=(cl->>'claimToken')::uuid;
  PERFORM set_config('p2d22_n03a4.failure_phase',phase,true);result:=public.execute_atomic_order_command_v1(cid,tok);
  PERFORM set_config('p2d22_n03a4.failure_phase','',true);
  IF result->>'result'<>'failed' OR result->>'errorCode'<>'BUSINESS_PERSISTENCE_FAILED' OR EXISTS(SELECT 1 FROM public.atomic_order_business_links WHERE command_id=cid)
     OR EXISTS(SELECT 1 FROM public.orders WHERE client_idempotency_key=cid::text)
     OR EXISTS(SELECT 1 FROM public.invoices i JOIN public.orders o ON o.id=i.order_id WHERE o.client_idempotency_key=cid::text)
     OR EXISTS(SELECT 1 FROM public.atomic_order_line_links WHERE command_id=cid)
     OR (SELECT quantity_on_hand FROM public.inventory_stock WHERE id='a4000000-0000-4000-8000-000000000006')<>before_stock
     OR (SELECT consumption_kind IS DISTINCT FROM 'failure' FROM public.atomic_order_claims WHERE claim_token=tok)
     OR (SELECT execution_status FROM public.atomic_order_commands WHERE id=cid)<>'failed_final' THEN RAISE EXCEPTION 'ROLLBACK_INJECTION_FAILED_%',phase;END IF;
 END LOOP;
END $rollback_injection$;

DO $insufficient_stock$
DECLARE p jsonb;a jsonb;cl jsonb;result jsonb;cid uuid;tok uuid;before_stock numeric;
BEGIN p:=p2d22_n03a4.payload(20000,0,0,'exempt',120,2000);before_stock:=(SELECT quantity_on_hand FROM public.inventory_stock WHERE id='a4000000-0000-4000-8000-000000000006');
 a:=public.acquire_atomic_order_command_result_v1('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','P2D22_N03A4_TEST_STOCK','P2D22_N03A4_TEST_120',public.canonicalize_atomic_order_json_v1(p),public.canonicalize_atomic_order_json_v1(p2d22_n03a4.projection(p)),now()+interval '1 day');cid:=(a->>'commandId')::uuid;cl:=public.claim_atomic_order_command_v1(cid);tok:=(cl->>'claimToken')::uuid;
 result:=public.execute_atomic_order_command_v1(cid,tok);
 IF result->>'result'<>'failed' OR result->>'errorCode'<>'INSUFFICIENT_STOCK' OR EXISTS(SELECT 1 FROM public.atomic_order_business_links WHERE command_id=cid) OR EXISTS(SELECT 1 FROM public.orders WHERE client_idempotency_key=cid::text) OR (SELECT quantity_on_hand FROM public.inventory_stock WHERE id='a4000000-0000-4000-8000-000000000006')<>before_stock THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK_FAIL_CLOSED_FAILED';END IF;
END $insufficient_stock$;

CREATE TEMP TABLE n03a4_negative_results(vector text PRIMARY KEY,result text,error_code text,
 orders_delta bigint,invoices_delta bigint,invoice_items_delta bigint,movements_delta bigint,business_links_delta bigint,line_links_delta bigint,stock_delta numeric);
CREATE FUNCTION p2d22_n03a4.run_negative(kind text,v integer,expected text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p jsonb;a jsonb;cl jsonb;r jsonb;cid uuid;tok uuid;before_orders bigint;before_invoices bigint;before_items bigint;before_movements bigint;before_business bigint;before_lines bigint;before_stock numeric;other_xmin text;
BEGIN
 p:=p2d22_n03a4.payload(10,0,0,'exempt',v,1);
 IF kind='customer_tenant_mismatch' THEN
  SELECT xmin::text INTO other_xmin FROM public.customers WHERE id='a4000000-0000-4000-8000-000000000024';
  p:=jsonb_set(jsonb_set(p,'{customer,customer_id}','"a4000000-0000-4000-8000-000000000024"'),'{customer,expected_record_version}',to_jsonb(other_xmin::bigint));
 END IF;
 a:=public.acquire_atomic_order_command_result_v1('a4000000-0000-4000-8000-000000000003','a4000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000002','P2D22_N03A4_NEG_'||v,'P2D22_N03A4_TEST_'||v,public.canonicalize_atomic_order_json_v1(p),public.canonicalize_atomic_order_json_v1(p2d22_n03a4.projection(p)),now()+interval '1 day');
 IF a->>'result'<>'created' THEN RAISE EXCEPTION 'NEGATIVE_%_ACQUIRE_FAILED_%',kind,a;END IF;cid:=(a->>'commandId')::uuid;
 IF kind='fractional_quantity' THEN UPDATE public.atomic_order_command_payloads SET canonical_payload=jsonb_set(canonical_payload,'{items,0,quantity}','"1.5"'),canonical_size_bytes=octet_length(convert_to(public.canonicalize_atomic_order_json_v1(jsonb_set(canonical_payload,'{items,0,quantity}','"1.5"')),'UTF8')) WHERE command_id=cid;
 ELSIF kind='invalid_vat_category' THEN UPDATE public.atomic_order_command_payloads SET canonical_payload=jsonb_set(canonical_payload,'{vat,mode}','"invalid_category"'),canonical_size_bytes=octet_length(convert_to(public.canonicalize_atomic_order_json_v1(jsonb_set(canonical_payload,'{vat,mode}','"invalid_category"')),'UTF8')) WHERE command_id=cid;
 ELSIF kind='branch_mismatch' THEN UPDATE public.atomic_order_command_payloads SET canonical_payload=jsonb_set(canonical_payload,'{branch_id}','"a4000000-0000-4000-8000-000000000012"'),canonical_size_bytes=octet_length(convert_to(public.canonicalize_atomic_order_json_v1(jsonb_set(canonical_payload,'{branch_id}','"a4000000-0000-4000-8000-000000000012"')),'UTF8')) WHERE command_id=cid;
 ELSIF kind='stale_catalog_xmin' THEN UPDATE public.catalog_items SET updated_at=updated_at+interval '1 microsecond' WHERE id='a4000000-0000-4000-8000-000000000005';END IF;
 cl:=public.claim_atomic_order_command_v1(cid);IF cl->>'result'<>'claimed' THEN RAISE EXCEPTION 'NEGATIVE_%_CLAIM_FAILED_%',kind,cl;END IF;tok:=(cl->>'claimToken')::uuid;
 SELECT count(*) INTO before_orders FROM public.orders;SELECT count(*) INTO before_invoices FROM public.invoices;SELECT count(*) INTO before_items FROM public.invoice_items;SELECT count(*) INTO before_movements FROM public.inventory_movements;SELECT count(*) INTO before_business FROM public.atomic_order_business_links;SELECT count(*) INTO before_lines FROM public.atomic_order_line_links;SELECT quantity_on_hand INTO before_stock FROM public.inventory_stock WHERE id='a4000000-0000-4000-8000-000000000006';
 r:=public.execute_atomic_order_command_v1(cid,tok);
 INSERT INTO n03a4_negative_results SELECT kind,r->>'result',r->>'errorCode',(SELECT count(*) FROM public.orders)-before_orders,(SELECT count(*) FROM public.invoices)-before_invoices,(SELECT count(*) FROM public.invoice_items)-before_items,(SELECT count(*) FROM public.inventory_movements)-before_movements,(SELECT count(*) FROM public.atomic_order_business_links)-before_business,(SELECT count(*) FROM public.atomic_order_line_links)-before_lines,(SELECT quantity_on_hand FROM public.inventory_stock WHERE id='a4000000-0000-4000-8000-000000000006')-before_stock;
 IF r->>'result'<>'failed' OR r->>'errorCode'<>expected
 OR EXISTS(SELECT 1 FROM n03a4_negative_results WHERE vector=kind AND (orders_delta<>0 OR invoices_delta<>0 OR invoice_items_delta<>0 OR movements_delta<>0 OR business_links_delta<>0 OR line_links_delta<>0 OR stock_delta<>0))
 OR (SELECT response_snapshot IS NOT NULL OR execution_status='succeeded' FROM public.atomic_order_commands WHERE id=cid)
 OR (SELECT consumption_kind='execution' FROM public.atomic_order_claims WHERE claim_token=tok)
 OR (SELECT count(*) FROM public.atomic_order_audit WHERE command_id=cid AND event_code='FAILED')<>1
 OR (SELECT count(*) FROM public.atomic_order_diagnostics WHERE command_id=cid)<>1 THEN RAISE EXCEPTION 'NEGATIVE_%_FAIL_CLOSED_ASSERTION_FAILED_%',kind,r;END IF;
END$$;

SELECT p2d22_n03a4.run_negative('fractional_quantity',301,'FRACTIONAL_QUANTITY_UNSUPPORTED');
SELECT p2d22_n03a4.run_negative('invalid_vat_category',302,'UNSUPPORTED_FINANCIAL_MODE');
SELECT p2d22_n03a4.run_negative('stale_catalog_xmin',303,'CATALOG_SNAPSHOT_MISMATCH');
SELECT p2d22_n03a4.run_negative('customer_tenant_mismatch',304,'CUSTOMER_SCOPE_CONFLICT');
SELECT p2d22_n03a4.run_negative('branch_mismatch',305,'AUTHORITY_BINDING_INVALID');

DO $negative_complete$ BEGIN IF (SELECT count(*) FROM n03a4_negative_results)<>5 OR EXISTS(SELECT 1 FROM n03a4_negative_results WHERE result<>'failed' OR error_code IS NULL) THEN RAISE EXCEPTION 'FIVE_NEGATIVE_VECTORS_INCOMPLETE';END IF;END $negative_complete$;

DO $historical$
DECLARE b n03a4_baseline%rowtype;
BEGIN SELECT * INTO b FROM n03a4_baseline;
 IF (SELECT count(*) FROM public.customers WHERE name NOT LIKE 'P2D22_N03A4_TEST%')<>b.customers
 OR (SELECT count(*) FROM public.orders o WHERE NOT EXISTS(SELECT 1 FROM public.atomic_order_business_links l WHERE l.order_id=o.id))<>b.orders
 OR (SELECT count(*) FROM public.invoices i WHERE NOT EXISTS(SELECT 1 FROM public.atomic_order_business_links l WHERE l.invoice_id=i.id))<>b.invoices
 OR (SELECT count(*) FROM public.customer_phone_identity_members m JOIN public.customers c ON c.id=m.customer_id WHERE c.name NOT LIKE 'P2D22_N03A4_TEST%')<>b.phone_members
 OR (SELECT md5(string_agg(id::text||':'||phone,',' ORDER BY id)) FROM public.customers WHERE name NOT LIKE 'P2D22_N03A4_TEST%')<>b.customer_phone_digest
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.customers'::regclass AND conname='customers_phone_key') THEN RAISE EXCEPTION 'HISTORICAL_PRESERVATION_FAILED';END IF;
END $historical$;

SELECT * FROM n03a4_negative_results ORDER BY vector;
SELECT 'P2D22_N03A4_CLONE_BUSINESS_E2E_PASS' AS marker,
       5 AS financial_vectors, 5 AS negative_vectors, 9 AS rollback_injection_boundaries,
       (SELECT count(*) FROM n03a4_results) AS succeeded_vectors,
       (SELECT count(*) FROM public.atomic_order_business_links) AS fixture_orders,
       (SELECT count(*) FROM public.atomic_order_business_links) AS fixture_business_links;
ROLLBACK;
