\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL ROLE postgres;
GRANT afex_core_owner TO postgres WITH SET TRUE, INHERIT FALSE GRANTED BY postgres;
GRANT afex_function_owner TO postgres WITH SET TRUE, INHERIT FALSE GRANTED BY postgres;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.profiles,public.branches,public.customers,public.catalog_items,public.inventory_stock,public.inventory_movements,public.orders,public.invoices,public.invoice_items TO afex_function_owner;
GRANT UPDATE ON public.profiles,public.catalog_items,public.inventory_stock TO afex_function_owner;
GRANT INSERT ON public.orders,public.invoices,public.invoice_items TO afex_function_owner;

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customers WHERE name='P2D22_N03B_PRODUCTION_E2E_R4')
     OR EXISTS (SELECT 1 FROM public.catalog_items WHERE code='P2D22_N03B_E2E_R4') THEN
    RAISE EXCEPTION 'P2D22_N03B_E2E_IDENTITY_ALREADY_EXISTS';
  END IF;
END $preflight$;

SET LOCAL ROLE afex_core_owner;
DO $core_preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.atomic_order_commands WHERE correlation_reference='P2D22_N03B_E2E_R4') THEN
    RAISE EXCEPTION 'P2D22_N03B_E2E_IDENTITY_ALREADY_EXISTS';
  END IF;
END $core_preflight$;
SET LOCAL ROLE postgres;

CREATE TEMP TABLE p2d22_n03b_e2e_context (
  actor_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  catalog_item_id uuid NOT NULL,
  inventory_stock_id uuid NOT NULL,
  line_id uuid NOT NULL,
  phone text NOT NULL,
  orders_before bigint NOT NULL,
  invoices_before bigint NOT NULL,
  invoice_items_before bigint NOT NULL,
  movements_before bigint NOT NULL,
  business_links_before bigint NOT NULL,
  line_links_before bigint NOT NULL,
  ambiguous_groups_before bigint NOT NULL,
  ambiguous_members_before bigint NOT NULL,
  major_orders_before bigint NOT NULL,
  major_invoices_before bigint NOT NULL,
  stock_before numeric NOT NULL,
  canonical_payload text,
  canonical_projection text,
  conflict_payload text,
  conflict_projection text,
  command_id uuid,
  claim_token uuid,
  success_snapshot jsonb,
  replay_snapshot jsonb
);
DO $temp_acl$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO afex_core_owner',(SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END $temp_acl$;
GRANT SELECT,UPDATE ON p2d22_n03b_e2e_context TO afex_core_owner,afex_function_owner;

WITH eligible AS (
  SELECT p.id actor_id,p.tenant_id,b.id branch_id
  FROM public.profiles p
  JOIN LATERAL (
    SELECT x.id FROM public.branches x
    WHERE x.tenant_id=p.tenant_id AND x.is_active AND x.deleted_at IS NULL
      AND (p.branch_id IS NULL OR p.branch_id=x.id)
    ORDER BY x.created_at,x.id LIMIT 1
  ) b ON true
  WHERE p.is_active AND p.tenant_id IS NOT NULL
    AND p.role IN('owner','admin','manager','employee','cashier')
  ORDER BY p.created_at,p.id LIMIT 1
), candidate_phone AS (
  SELECT '+9665'||lpad(g::text,8,'0') phone
  FROM generate_series(97000000,97000099) g
  WHERE NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.phone='+9665'||lpad(g::text,8,'0'))
  ORDER BY g LIMIT 1
), major AS (
  SELECT tenant_id,normalized_phone
  FROM public.customer_phone_identities
  WHERE resolution_status='AMBIGUOUS'
  ORDER BY member_count DESC,tenant_id,normalized_phone LIMIT 1
), major_members AS (
  SELECT m.customer_id FROM public.customer_phone_identity_members m JOIN major x USING(tenant_id,normalized_phone)
)
INSERT INTO p2d22_n03b_e2e_context
SELECT e.actor_id,e.tenant_id,e.branch_id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),cp.phone,
 (SELECT count(*) FROM public.orders),(SELECT count(*) FROM public.invoices),(SELECT count(*) FROM public.invoice_items),
 (SELECT count(*) FROM public.inventory_movements),0,0,
 (SELECT count(*) FROM public.customer_phone_identities WHERE resolution_status='AMBIGUOUS'),
 (SELECT coalesce(sum(member_count),0) FROM public.customer_phone_identities WHERE resolution_status='AMBIGUOUS'),
 (SELECT count(*) FROM public.orders WHERE customer_id IN(SELECT customer_id FROM major_members)),
 (SELECT count(*) FROM public.invoices WHERE customer_id IN(SELECT customer_id FROM major_members)),1000::numeric,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
FROM eligible e CROSS JOIN candidate_phone cp;

SET LOCAL ROLE afex_core_owner;
UPDATE pg_temp.p2d22_n03b_e2e_context
SET business_links_before=(SELECT count(*) FROM public.atomic_order_business_links),
    line_links_before=(SELECT count(*) FROM public.atomic_order_line_links);
SET LOCAL ROLE postgres;

DO $context$
BEGIN
  IF (SELECT count(*) FROM p2d22_n03b_e2e_context)<>1 THEN
    RAISE EXCEPTION 'P2D22_N03B_E2E_CONTEXT_UNAVAILABLE';
  END IF;
  IF (SELECT major_orders_before<>218 OR major_invoices_before<>218 OR ambiguous_groups_before<>2 OR ambiguous_members_before<>5 FROM p2d22_n03b_e2e_context) THEN
    RAISE EXCEPTION 'P2D22_N03B_HISTORICAL_BASELINE_CHANGED';
  END IF;
END $context$;

INSERT INTO public.customers(id,name,phone,created_by,branch_id,tenant_id)
SELECT customer_id,'P2D22_N03B_PRODUCTION_E2E_R4',phone,actor_id,branch_id,tenant_id
FROM p2d22_n03b_e2e_context;

INSERT INTO public.catalog_items(id,code,name,category,item_type,default_price,cost_price,tenant_id,track_inventory,inventory_enabled_at)
SELECT catalog_item_id,'P2D22_N03B_E2E_R4','P2D22_N03B_PRODUCTION_E2E_R4','test','product',100.00,1.00,tenant_id,true,now()
FROM p2d22_n03b_e2e_context;

INSERT INTO public.inventory_stock(id,tenant_id,branch_id,catalog_item_id,quantity_on_hand)
SELECT inventory_stock_id,tenant_id,branch_id,catalog_item_id,stock_before
FROM p2d22_n03b_e2e_context;

CREATE FUNCTION pg_temp.p2d22_n03b_payload(gross numeric,vat_amount numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $payload$
DECLARE c record;xmin_value text;catalog_version text;total numeric(20,2):=gross+vat_amount;
BEGIN
 SELECT * INTO c FROM pg_temp.p2d22_n03b_e2e_context;
 SELECT xmin::text INTO xmin_value FROM public.customers WHERE id=c.customer_id;
 SELECT to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') INTO catalog_version FROM public.catalog_items WHERE id=c.catalog_item_id;
 RETURN jsonb_build_object(
  'payload_version','order-command-payload-v1','fingerprint_version','order-request-fingerprint-v1','command_type','order.create',
  'tenant_id',c.tenant_id,'branch_id',c.branch_id,'authenticated_actor_id',c.actor_id,
  'customer',jsonb_build_object('mode','existing','customer_id',c.customer_id,'expected_record_version',xmin_value::bigint,'normalized_phone',NULL,'display_phone',NULL,'name',NULL,'email',NULL,'address',NULL,'notes',NULL,'allowed_update_fields','[]'::jsonb,'conflict_behavior','reject'),
  'items',jsonb_build_array(jsonb_build_object('line_id',c.line_id,'line_number',1,'catalog_item_id',c.catalog_item_id,'name_snapshot','P2D22_N03B_PRODUCTION_E2E_R4','sku_snapshot','P2D22_N03B_E2E_R4','category_snapshot','test','item_type_snapshot','product','quantity','1','unit_snapshot','item','inventory_tracking_mode','tracked_product','fulfillment_class','immediate','line_note',NULL,'modifiers','[]'::jsonb)),
  'pricing',jsonb_build_object('currency','SAR','currency_precision',2,'subtotal',to_char(gross,'FM9999999990.00'),'taxable_subtotal',to_char(gross,'FM9999999990.00'),'total',to_char(total,'FM9999999990.00'),'rounding_strategy','invoice-half-up-v1','price_version','P2D22_N03B_E2E_R4','branch_pricing_version',NULL,'quote_reference','P2D22_N03B_E2E_R4','quote_version','financial-quote-v1','quote_fingerprint',repeat('b',64),'financial_engine_version','financial-engine-v2-r1','lines',jsonb_build_array(jsonb_build_object('line_id',c.line_id,'unit_price',to_char(gross,'FM9999999990.00'),'pricing_source','catalog_default','source_catalog_id',c.catalog_item_id,'source_branch_price_id',NULL,'source_catalog_version',catalog_version,'source_branch_price_version',NULL,'gross_amount',to_char(gross,'FM9999999990.00'),'discount_allocation','0.00','taxable_amount',to_char(gross,'FM9999999990.00'),'vat_amount',to_char(vat_amount,'FM9999999990.00'),'net_amount',to_char(gross,'FM9999999990.00')))),
  'vat',jsonb_build_object('mode','exclusive','tax_inclusive',false,'setting_id','b4000000-0000-4000-8000-000000000007'::uuid,'rate','15','amount',to_char(vat_amount,'FM9999999990.00'),'rule_version','P2D22_N03B_E2E_R4','effective_at','2026-01-01T00:00:00.000000Z'),
  'discount',jsonb_build_object('id',NULL,'source','none','name_snapshot',NULL,'type',NULL,'value',NULL,'amount','0.00','eligibility_version',NULL,'rule_version',NULL),
  'payment',jsonb_build_object('method','cash','amount_tendered',to_char(total,'FM9999999990.00'),'expected_status','paid','cash_received',to_char(total,'FM9999999990.00'),'remaining_from_customer','0.00','cash_change','0.00','rule_version','P2D22_N03B_E2E_R4','provider_reference',NULL),
  'fulfillment',jsonb_build_object('method','immediate','branch_id',c.branch_id,'requested_at',NULL,'address',NULL,'instructions',NULL),
  'order',jsonb_build_object('note','P2D22_N03B_PRODUCTION_E2E_R4'),
  'metadata',jsonb_build_object('source_channel','pos','request_reference',NULL,'offline_draft_id',NULL,'correlation_id','P2D22_N03B_E2E_R4','device_id',NULL,'pos_terminal_id',NULL,'client_version',NULL),
  'versions',jsonb_build_object('customer_engine','P2D22_N03B_E2E_R4','financial_engine','financial-engine-v2-r1','inventory_engine','P2D22_N03B_E2E_R4','numbering_engine','P2D22_N03B_E2E_R4','authorization_contract','P2D22_N03B_E2E_R4','payload_contract','order-command-payload-v1'));
END $payload$;

CREATE FUNCTION pg_temp.p2d22_n03b_projection(p jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $projection$
WITH x AS(SELECT coalesce(jsonb_agg(value-'net_amount' ORDER BY ordinality),'[]'::jsonb)v FROM jsonb_array_elements(p->'pricing'->'lines')WITH ORDINALITY)
SELECT jsonb_set(jsonb_set(jsonb_set(jsonb_set(p-'fingerprint_version'-'issuance'-'retention'-'archive','{metadata}',jsonb_build_object('source_channel',p->'metadata'->'source_channel'),false),'{payment}',(p->'payment')-'masked_instrument'-'provider_reference',false),'{versions}',(p->'versions')-'payload_contract',false),'{pricing,lines}',x.v,false)FROM x
$projection$;

SET LOCAL ROLE afex_function_owner;
UPDATE pg_temp.p2d22_n03b_e2e_context
SET canonical_payload=public.canonicalize_atomic_order_json_v1(v.good),
    canonical_projection=public.canonicalize_atomic_order_json_v1(pg_temp.p2d22_n03b_projection(v.good)),
    conflict_payload=public.canonicalize_atomic_order_json_v1(v.conflict),
    conflict_projection=public.canonicalize_atomic_order_json_v1(pg_temp.p2d22_n03b_projection(v.conflict))
FROM (SELECT pg_temp.p2d22_n03b_payload(100.00,15.00) good,pg_temp.p2d22_n03b_payload(110.00,16.50) conflict) v;
SET LOCAL ROLE postgres;
DO $projection_check$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.p2d22_n03b_e2e_context WHERE canonical_projection::jsonb IS DISTINCT FROM pg_temp.p2d22_n03b_projection(canonical_payload::jsonb) OR conflict_projection::jsonb IS DISTINCT FROM pg_temp.p2d22_n03b_projection(conflict_payload::jsonb)) THEN
   RAISE EXCEPTION 'P2D22_N03B_LOCAL_PROJECTION_MISMATCH';
 END IF;
END $projection_check$;

DO $temp_service_acl$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO service_role',(SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END $temp_service_acl$;
GRANT SELECT,UPDATE ON p2d22_n03b_e2e_context TO service_role;
GRANT EXECUTE ON FUNCTION pg_temp.p2d22_n03b_payload(numeric,numeric),pg_temp.p2d22_n03b_projection(jsonb) TO service_role,afex_function_owner;
SET LOCAL ROLE service_role;

DO $execute$
DECLARE c record;p jsonb;p2 jsonb;a jsonb;a2 jsonb;fc jsonb;cl jsonb;s jsonb;r jsonb;cid uuid;tok uuid;
BEGIN
 SELECT * INTO c FROM pg_temp.p2d22_n03b_e2e_context;
 p:=pg_temp.p2d22_n03b_payload(100.00,15.00);
 a:=public.acquire_atomic_order_command_result_v1(c.actor_id,c.tenant_id,c.branch_id,'P2D22_N03B_E2E_R4','P2D22_N03B_E2E_R4',c.canonical_payload,c.canonical_projection,now()+interval '1 day');
 IF a->>'result'<>'created' THEN RAISE EXCEPTION 'P2D22_N03B_ACQUIRE_FAILED: %',a; END IF;
 cid:=(a->>'commandId')::uuid;
 a2:=public.acquire_atomic_order_command_result_v1(c.actor_id,c.tenant_id,c.branch_id,'P2D22_N03B_E2E_R4','P2D22_N03B_E2E_R4',c.canonical_payload,c.canonical_projection,now()+interval '1 day');
 IF a2->>'result'<>'in_progress' THEN RAISE EXCEPTION 'P2D22_N03B_REPEAT_ACQUIRE_FAILED: %',a2; END IF;
 p2:=pg_temp.p2d22_n03b_payload(110.00,16.50);
 fc:=public.acquire_atomic_order_command_result_v1(c.actor_id,c.tenant_id,c.branch_id,'P2D22_N03B_E2E_R4','P2D22_N03B_E2E_R4',c.conflict_payload,c.conflict_projection,now()+interval '1 day');
 IF fc->>'result'<>'fingerprint_conflict' OR fc->>'errorCode'<>'FINGERPRINT_CONFLICT' THEN RAISE EXCEPTION 'P2D22_N03B_FINGERPRINT_CONFLICT_FAILED: %',fc; END IF;
 cl:=public.claim_atomic_order_command_v1(cid);
 IF cl->>'result'<>'claimed' THEN RAISE EXCEPTION 'P2D22_N03B_CLAIM_FAILED: %',cl; END IF;
 tok:=(cl->>'claimToken')::uuid;
 IF public.execute_atomic_order_command_v1(cid,gen_random_uuid())->>'errorCode'<>'CLAIM_TOKEN_INVALID' THEN RAISE EXCEPTION 'P2D22_N03B_TOKEN_REJECTION_FAILED'; END IF;
 s:=public.execute_atomic_order_command_v1(cid,tok);
 IF s->>'result'<>'succeeded' THEN RAISE EXCEPTION 'P2D22_N03B_EXECUTE_FAILED: %',s; END IF;
 r:=public.replay_atomic_order_command_v1(cid);
 IF r<>s THEN RAISE EXCEPTION 'P2D22_N03B_REPLAY_FAILED'; END IF;
 IF public.execute_atomic_order_command_v1(cid,tok)->>'errorCode'<>'CLAIM_TOKEN_INVALID' THEN RAISE EXCEPTION 'P2D22_N03B_DUPLICATE_EXECUTE_FAILED'; END IF;
 UPDATE pg_temp.p2d22_n03b_e2e_context SET command_id=cid,claim_token=tok,success_snapshot=s,replay_snapshot=r;
END $execute$;

SET LOCAL ROLE postgres;
DO $verify$
DECLARE c record;s jsonb;
BEGIN
 SELECT * INTO c FROM pg_temp.p2d22_n03b_e2e_context;s:=c.success_snapshot;
 IF (SELECT count(*) FROM public.orders)<>c.orders_before+1
 OR (SELECT count(*) FROM public.invoices)<>c.invoices_before+1
 OR (SELECT count(*) FROM public.invoice_items)<>c.invoice_items_before+1
 OR (SELECT count(*) FROM public.inventory_movements)<>c.movements_before+1
 OR (SELECT quantity_on_hand FROM public.inventory_stock WHERE id=c.inventory_stock_id)<>c.stock_before-1
 OR (SELECT count(*) FROM public.orders WHERE id=(s->>'orderId')::uuid)<>1
 OR (SELECT count(*) FROM public.invoices WHERE id=(s->>'invoiceId')::uuid)<>1
 OR (SELECT count(*) FROM public.invoice_items WHERE invoice_id=(s->>'invoiceId')::uuid)<>1
 OR (SELECT count(*) FROM public.inventory_movements WHERE source_type='invoice_item' AND source_id=(s->'lines'->0->>'invoiceItemId')::uuid)<>1
 OR (SELECT order_number IS NULL FROM public.orders WHERE id=(s->>'orderId')::uuid)
 OR (SELECT invoice_number IS DISTINCT FROM s->>'orderNumber' FROM public.invoices WHERE id=(s->>'invoiceId')::uuid)
 THEN RAISE EXCEPTION 'P2D22_N03B_EXACTLY_ONCE_VERIFICATION_FAILED'; END IF;

 IF (SELECT count(*) FROM public.customer_phone_identities WHERE resolution_status='AMBIGUOUS')<>c.ambiguous_groups_before
 OR (SELECT coalesce(sum(member_count),0) FROM public.customer_phone_identities WHERE resolution_status='AMBIGUOUS')<>c.ambiguous_members_before
 OR (WITH major AS(SELECT tenant_id,normalized_phone FROM public.customer_phone_identities WHERE resolution_status='AMBIGUOUS' ORDER BY member_count DESC,tenant_id,normalized_phone LIMIT 1),members AS(SELECT m.customer_id FROM public.customer_phone_identity_members m JOIN major x USING(tenant_id,normalized_phone)) SELECT count(*) FROM public.orders WHERE customer_id IN(SELECT customer_id FROM members))<>c.major_orders_before
 OR (WITH major AS(SELECT tenant_id,normalized_phone FROM public.customer_phone_identities WHERE resolution_status='AMBIGUOUS' ORDER BY member_count DESC,tenant_id,normalized_phone LIMIT 1),members AS(SELECT m.customer_id FROM public.customer_phone_identity_members m JOIN major x USING(tenant_id,normalized_phone)) SELECT count(*) FROM public.invoices WHERE customer_id IN(SELECT customer_id FROM members))<>c.major_invoices_before
 THEN RAISE EXCEPTION 'P2D22_N03B_HISTORICAL_PHONE_LINKS_CHANGED'; END IF;

 IF to_regclass('public.atomic_outbox') IS NOT NULL THEN RAISE EXCEPTION 'P2D22_N03B_OUTBOX_UNEXPECTEDLY_PRESENT'; END IF;
END $verify$;

SET LOCAL ROLE afex_function_owner;
DO $core_verify$
DECLARE c record;
BEGIN
 SELECT * INTO c FROM pg_temp.p2d22_n03b_e2e_context;
 IF (SELECT count(*) FROM public.atomic_order_business_links WHERE command_id=c.command_id)<>1 THEN RAISE EXCEPTION 'P2D22_N03B_BUSINESS_LINK_DELTA_FAILED'; END IF;
 IF (SELECT count(*) FROM public.atomic_order_line_links WHERE command_id=c.command_id)<>1 THEN RAISE EXCEPTION 'P2D22_N03B_LINE_LINK_DELTA_FAILED'; END IF;
 IF (SELECT execution_status FROM public.atomic_order_commands WHERE id=c.command_id)<>'succeeded' THEN RAISE EXCEPTION 'P2D22_N03B_COMMAND_STATUS_FAILED'; END IF;
 IF (SELECT count(*) FROM public.atomic_order_claims WHERE command_id=c.command_id AND claim_token=c.claim_token AND consumed_at IS NOT NULL AND consumption_kind='execution')<>1 THEN RAISE EXCEPTION 'P2D22_N03B_CLAIM_CONSUMPTION_FAILED'; END IF;
 IF c.replay_snapshot<>c.success_snapshot THEN RAISE EXCEPTION 'P2D22_N03B_REPLAY_SNAPSHOT_FAILED'; END IF;
END $core_verify$;

SET LOCAL ROLE postgres;

SELECT 'P2D22_N03B_PRODUCTION_E2E_PASS' marker,
       (SELECT success_snapshot->>'result' FROM p2d22_n03b_e2e_context) result,
       1 orders_delta,1 invoices_delta,1 invoice_items_delta,1 movements_delta,1 business_links_delta,1 line_links_delta,
       218 historical_order_links,218 historical_invoice_links,0 events_delta,0 outbox_delta;
REVOKE afex_core_owner FROM postgres GRANTED BY postgres;
REVOKE afex_function_owner FROM postgres GRANTED BY postgres;
DO $membership_cleanup$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member JOIN pg_roles g ON g.oid=m.grantor WHERE r.rolname IN('afex_core_owner','afex_function_owner') AND u.rolname='postgres' AND g.rolname='postgres') THEN
   RAISE EXCEPTION 'P2D22_N03B_TEMPORARY_MEMBERSHIP_REMAINS';
 END IF;
END $membership_cleanup$;
COMMIT;
