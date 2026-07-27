/* AFEX Core V2 Package 7 pre-disposal database verification.
Strictly read-only. Dedicated disposable Clone only. Run in the same session
as 07a-07g before evidence export and external Clone disposal.
No correlation format, wildcard, display name, tenant-only, or time-only
predicate establishes ownership. No row cleanup is authorized or attempted. */
BEGIN;
CREATE TEMP TABLE pg_temp.package7_pre_disposal_results
ON COMMIT PRESERVE ROWS AS
WITH
c AS (
 SELECT * FROM pg_temp.package7_fixture_context
),
m AS (
 SELECT * FROM pg_temp.package7_runtime_ownership
),
resolved AS (
 SELECT m.object_type,m.object_id,
  CASE m.object_type
   WHEN 'authorization_context' THEN
    (SELECT pg_catalog.count(*) FROM public.atomic_authorization_contexts x
     WHERE x.context_id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.branch_id=m.branch_id)
   WHEN 'financial_quote' THEN
    (SELECT pg_catalog.count(*) FROM public.financial_quotes x
     WHERE x.id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.branch_id=m.branch_id
       AND x.request_fingerprint=m.request_fingerprint)
   WHEN 'idempotency_command' THEN
    (SELECT pg_catalog.count(*) FROM public.idempotency_commands x
     WHERE x.id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.branch_id=m.branch_id
       AND x.key_hash=m.idempotency_key_hash
       AND x.request_fingerprint=m.request_fingerprint
       AND x.correlation_id=m.correlation_id)
   WHEN 'order' THEN
    (SELECT pg_catalog.count(*) FROM public.orders x
     WHERE x.id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.branch_id=m.branch_id AND x.correlation_id=m.correlation_id)
   WHEN 'invoice' THEN
    (SELECT pg_catalog.count(*) FROM public.invoices x
     WHERE x.id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.branch_id=m.branch_id AND x.correlation_id=m.correlation_id)
   WHEN 'invoice_item' THEN
    (SELECT pg_catalog.count(*) FROM public.invoice_items x
     WHERE x.id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.invoice_id=m.parent_object_id)
   WHEN 'inventory_movement' THEN
    (SELECT pg_catalog.count(*) FROM public.inventory_movements x
     WHERE x.id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.branch_id=m.branch_id AND x.order_id=m.parent_object_id
       AND x.correlation_id=m.correlation_id)
   WHEN 'audit_log' THEN
    (SELECT pg_catalog.count(*) FROM public.audit_logs x
     WHERE x.id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.branch_id=m.branch_id AND x.order_id=m.parent_object_id
       AND x.correlation_id=m.correlation_id)
   WHEN 'outbox_event' THEN
    (SELECT pg_catalog.count(*) FROM public.atomic_outbox x
     WHERE x.id=m.object_id AND x.tenant_id=m.tenant_id
       AND x.branch_id=m.branch_id AND x.aggregate_id=m.parent_object_id
       AND x.correlation_id=m.correlation_id)
   ELSE 0
  END resolved_count
 FROM m
),
checks(test_name,result,blocking,expected,observed,required_action) AS (
 SELECT 'fixture_context',
  CASE WHEN (SELECT pg_catalog.count(*) FROM c)=1 THEN 'PASS' ELSE 'FAIL' END,
  true,'one fixture context',(SELECT pg_catalog.count(*) FROM c)::text,
  'same approved session required'
 UNION ALL SELECT 'before_image_manifest',
  CASE WHEN (SELECT pg_catalog.count(*) FROM pg_temp.package7_before_images)=29
  THEN 'PASS' ELSE 'FAIL' END,true,'29',
  (SELECT pg_catalog.count(*) FROM pg_temp.package7_before_images)::text,
  'STOP on fixture drift'
 UNION ALL SELECT 'created_fixture_manifest',
  CASE WHEN (SELECT pg_catalog.count(*) FROM pg_temp.package7_created_rows)=26
  THEN 'PASS' ELSE 'FAIL' END,true,'26',
  (SELECT pg_catalog.count(*) FROM pg_temp.package7_created_rows)::text,
  'STOP on fixture drift'
 UNION ALL SELECT 'tenant_profile_contamination',
  CASE WHEN (SELECT count(*) FROM public.tenants t CROSS JOIN c
    WHERE t.id IN(c.primary_tenant_id,c.isolation_tenant_id))=2
   AND (SELECT count(*) FROM public.profiles p CROSS JOIN c
    WHERE p.id IN(c.operator_profile_id,c.observer_profile_id,
      c.primary_actor_profile_id,c.isolation_actor_profile_id)
      AND p.is_active
      AND p.tenant_id IN(c.primary_tenant_id,c.isolation_tenant_id))=4
  THEN 'PASS' ELSE 'FAIL' END,true,
  'two exact tenants and four exact active scoped profiles',
  'exact UUID and tenant scope inspected','STOP on tenant/profile contamination'
 UNION ALL SELECT 'business_fixture_contamination',
  CASE WHEN
    (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.branches')=3
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.customers')=2
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.catalog_categories')=1
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.catalog_items')=3
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.branch_catalog_items')=3
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.inventory_stock')=3
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.vat_settings')=2
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.discounts')=1
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.order_number_sequences')=3
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.core_v2_tenant_activation')=2
    AND (SELECT count(*) FROM pg_temp.package7_created_rows
      WHERE object_name='public.core_v2_branch_activation')=3
  THEN 'PASS' ELSE 'FAIL' END,true,
  'exact manifest distribution for branch/customer/category/catalog/branch catalog/inventory/VAT/discount/numbering/activation',
  'created-row manifest grouped by exact object name',
  'STOP on fixture ownership contamination'
 UNION ALL SELECT 'runtime_manifest_run_binding',
  CASE WHEN (SELECT pg_catalog.count(*) FROM m)>0
    AND NOT EXISTS(SELECT 1 FROM m CROSS JOIN c
      WHERE m.package7_run_identifier<>c.package7_run_identifier)
  THEN 'PASS' ELSE 'FAIL' END,true,'nonempty and one exact approved run',
  pg_catalog.jsonb_build_object('rows',(SELECT pg_catalog.count(*) FROM m),
   'runs',(SELECT pg_catalog.count(DISTINCT package7_run_identifier) FROM m))::text,
  'STOP on missing or mixed ownership'
 UNION ALL SELECT 'runtime_identifier_resolution',
  CASE WHEN NOT EXISTS(SELECT 1 FROM resolved WHERE resolved_count<>1)
  THEN 'PASS' ELSE 'FAIL' END,true,'every manifest UUID resolves exactly once',
  pg_catalog.coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(resolved)
   ORDER BY object_type,object_id) FROM resolved WHERE resolved_count<>1),
   '[]'::jsonb)::text,'STOP on missing or ambiguous row'
 UNION ALL SELECT 'order_invoice_parent',
  CASE WHEN NOT EXISTS(
   SELECT 1 FROM m i JOIN m o ON o.object_type='order'
    AND o.object_id=i.parent_object_id
   LEFT JOIN public.invoices x ON x.id=i.object_id AND x.order_id=o.object_id
   WHERE i.object_type='invoice' AND x.id IS NULL)
   AND (SELECT pg_catalog.count(*) FROM m WHERE object_type='invoice')=1
  THEN 'PASS' ELSE 'FAIL' END,true,'one exact order -> invoice relationship',
  'manifest and invoices.order_id inspected','STOP on relationship drift'
 UNION ALL SELECT 'invoice_item_parent_and_completeness',
  CASE WHEN NOT EXISTS(
   SELECT 1 FROM m i LEFT JOIN public.invoice_items x ON x.id=i.object_id
    AND x.invoice_id=i.parent_object_id WHERE i.object_type='invoice_item'
    AND x.id IS NULL)
   AND (SELECT pg_catalog.count(*) FROM public.invoice_items x
    JOIN m i ON i.object_type='invoice' AND x.invoice_id=i.object_id)
    =(SELECT pg_catalog.count(*) FROM m WHERE object_type='invoice_item')
  THEN 'PASS' ELSE 'FAIL' END,true,'all and only exact invoice children owned',
  'parent and descendant cardinality inspected','STOP on extra/missing item'
 UNION ALL SELECT 'quote_context_parent',
  CASE WHEN NOT EXISTS(
   SELECT 1 FROM m q LEFT JOIN public.financial_quotes x ON x.id=q.object_id
    AND x.authorization_context_id=q.parent_object_id
   LEFT JOIN m a ON a.object_type='authorization_context'
    AND a.object_id=q.parent_object_id
   WHERE q.object_type='financial_quote'
    AND (x.id IS NULL OR a.object_id IS NULL))
  THEN 'PASS' ELSE 'FAIL' END,true,'every quote -> owned authorization context',
  'exact quote/context UUIDs inspected','STOP on linkage drift'
 UNION ALL SELECT 'quote_descendant_completeness',
  CASE WHEN NOT EXISTS(
   SELECT 1 FROM public.financial_quotes q
   JOIN m a ON a.object_type='authorization_context'
    AND a.object_id=q.authorization_context_id
   LEFT JOIN m own ON own.object_type='financial_quote' AND own.object_id=q.id
   WHERE own.object_id IS NULL)
  THEN 'PASS' ELSE 'FAIL' END,true,
  'all quotes attached to owned contexts are exactly manifested',
  'authorization_context_id descendant set inspected','STOP on extra quote'
 UNION ALL SELECT 'idempotency_order_quote_linkage',
  CASE WHEN (SELECT pg_catalog.count(*) FROM m
    WHERE object_type='idempotency_command')=1
   AND NOT EXISTS(
    SELECT 1 FROM m d LEFT JOIN public.idempotency_commands x
     ON x.id=d.object_id AND x.order_id=d.parent_object_id
    LEFT JOIN m o ON o.object_type='order' AND o.object_id=x.order_id
    LEFT JOIN public.invoices i ON i.id=x.invoice_id
    LEFT JOIN m q ON q.object_type='financial_quote'
     AND q.object_id=i.financial_quote_id
    WHERE d.object_type='idempotency_command'
     AND (x.id IS NULL OR o.object_id IS NULL OR q.object_id IS NULL))
  THEN 'PASS' ELSE 'FAIL' END,true,
  'one exact idempotency -> order -> invoice -> quote chain',
  'exact UUID chain inspected','STOP on linkage drift'
 UNION ALL SELECT 'inventory_descendant_completeness',
  CASE WHEN (SELECT pg_catalog.count(*) FROM public.inventory_movements x
    JOIN m o ON o.object_type='order' AND x.order_id=o.object_id)
    =(SELECT pg_catalog.count(*) FROM m WHERE object_type='inventory_movement')
   AND NOT EXISTS(SELECT 1 FROM public.inventory_movements x
    JOIN m o ON o.object_type='order' AND x.order_id=o.object_id
    LEFT JOIN m own ON own.object_type='inventory_movement'
     AND own.object_id=x.id WHERE own.object_id IS NULL)
  THEN 'PASS' ELSE 'FAIL' END,true,'all and only exact order movements owned',
  'order_id descendant set compared to manifest','STOP on extra movement'
 UNION ALL SELECT 'audit_descendant_completeness',
  CASE WHEN (SELECT pg_catalog.count(*) FROM public.audit_logs x
    JOIN m o ON o.object_type='order' AND x.order_id=o.object_id)
    =(SELECT pg_catalog.count(*) FROM m WHERE object_type='audit_log')
   AND NOT EXISTS(SELECT 1 FROM public.audit_logs x
    JOIN m o ON o.object_type='order' AND x.order_id=o.object_id
    LEFT JOIN m own ON own.object_type='audit_log'
     AND own.object_id=x.id WHERE own.object_id IS NULL)
  THEN 'PASS' ELSE 'FAIL' END,true,'all and only exact order audit rows owned',
  'order_id descendant set compared to manifest','STOP on extra audit row'
 UNION ALL SELECT 'order_status_log_absence',
  CASE WHEN NOT EXISTS(SELECT 1 FROM public.order_status_logs x
   JOIN m o ON o.object_type='order' AND o.object_id=x.order_id)
  THEN 'PASS' ELSE 'FAIL' END,true,
  'zero unowned status-log descendants','exact order UUID inspected',
  'STOP; 07e does not own status-log rows'
 UNION ALL SELECT 'outbox_descendant_completeness',
  CASE WHEN NOT EXISTS(
   SELECT 1 FROM public.atomic_outbox x
   JOIN m d ON d.object_type='idempotency_command'
    AND x.correlation_id=d.correlation_id
   LEFT JOIN m own ON own.object_type='outbox_event' AND own.object_id=x.id
   WHERE own.object_id IS NULL)
   AND (SELECT pg_catalog.count(*) FROM public.atomic_outbox x
    JOIN m d ON d.object_type='idempotency_command'
     AND x.correlation_id=d.correlation_id)
    =(SELECT pg_catalog.count(*) FROM m WHERE object_type='outbox_event')
  THEN 'PASS' ELSE 'FAIL' END,true,'all and only exact outbox UUIDs owned',
  'exact persisted correlation value used only as completeness guard',
  'STOP on extra outbox row'
 UNION ALL SELECT 'provider_delivery_absent',
  CASE WHEN NOT EXISTS(SELECT 1 FROM public.atomic_outbox x
   JOIN m own ON own.object_type='outbox_event' AND own.object_id=x.id
   WHERE x.delivered_at IS NOT NULL) THEN 'PASS' ELSE 'FAIL' END,
  true,'zero delivered owned events','exact outbox UUIDs inspected','STOP'
 UNION ALL SELECT 'global_activation_disabled',
  CASE WHEN (SELECT pg_catalog.count(*) FROM public.core_v2_activation_control
    WHERE global_enabled=false AND kill_switch=true
      AND pos_enabled=false AND admin_orders_enabled=false
      AND quote_issuer_enabled=false AND outbox_worker_enabled=false
      AND deterministic_canary_percentage=0)=1
  THEN 'PASS' ELSE 'FAIL' END,true,
  'singleton globally disabled with kill switch enabled',
  'activation singleton inspected','STOP and restore safe disabled state'
 UNION ALL SELECT 'fixture_scopes_disabled',
  CASE WHEN NOT EXISTS(
    SELECT 1 FROM public.core_v2_tenant_activation t CROSS JOIN c
    WHERE t.tenant_id IN(c.primary_tenant_id,c.isolation_tenant_id)
      AND (t.enabled OR t.canary_eligible OR t.pos_enabled
        OR t.admin_orders_enabled OR t.quote_enabled))
    AND NOT EXISTS(
    SELECT 1 FROM public.core_v2_branch_activation b CROSS JOIN c
    WHERE b.branch_id IN(c.primary_branch_id,c.secondary_branch_id,
      c.isolation_branch_id)
      AND (b.enabled OR b.canary_eligible OR b.pos_enabled
        OR b.admin_orders_enabled OR b.quote_enabled))
  THEN 'PASS' ELSE 'FAIL' END,true,
  'all fixture tenant/branch activation scopes disabled',
  'exact fixture scopes inspected','STOP and restore disabled state'
 UNION ALL SELECT 'unrelated_before_images_unchanged',
  CASE WHEN NOT EXISTS(
    SELECT 1 FROM pg_temp.package7_before_images b
    WHERE b.row_existed AND b.object_name='public.core_v2_activation_control'
      AND NOT EXISTS(
        SELECT 1 FROM public.core_v2_activation_control a
        WHERE pg_catalog.to_jsonb(a)=b.before_row))
  THEN 'PASS' ELSE 'FAIL' END,true,
  'captured global configuration before-images remain exact',
  'retained before-images compared','STOP on unrelated mutation'
 UNION ALL SELECT 'rate_limit_not_owned',
  CASE WHEN NOT EXISTS(SELECT 1 FROM pg_temp.package7_before_images
   WHERE object_name='public.core_v2_issuer_rate_limit_config')
   AND NOT EXISTS(SELECT 1 FROM pg_temp.package7_created_rows
   WHERE object_name='public.core_v2_issuer_rate_limit_config')
  THEN 'PASS' ELSE 'FAIL' END,true,'zero owned rate-limit rows',
  'fixture manifests inspected','never mutate global configuration'
),
rows AS (
 SELECT 'package7.pre_disposal' suite_name,checks.*,
  c.package7_run_identifier run_identifier FROM checks CROSS JOIN c
)
SELECT * FROM rows
UNION ALL
SELECT 'package7.pre_disposal','PRE_DISPOSAL_DATABASE_GATE_PASS',
 CASE WHEN pg_catalog.bool_and(result='PASS') THEN 'PASS' ELSE 'FAIL' END,
 true,'every database-verifiable ownership and contamination check exactly PASS',
 'strict fail-closed pre-disposal contract',
 'export evidence and obtain external disposal authorization',
 run_identifier
FROM rows GROUP BY run_identifier;

CREATE TEMP TABLE pg_temp.package7_pre_disposal_contract
ON COMMIT PRESERVE ROWS AS
SELECT
  c.package7_run_identifier AS run_identifier,
  c.disposable_clone_identifier AS clone_identifier,
  c.baseline_snapshot_identifier AS baseline_identifier,
  c.primary_tenant_id AS tenant_id,
  c.operator_profile_id,
  c.observer_profile_id,
  encode(extensions.digest(
    coalesce((
      SELECT string_agg(
        concat_ws('|',m.object_type,m.object_id::text,
          coalesce(m.parent_object_id::text,''),
          coalesce(m.tenant_id::text,''),coalesce(m.branch_id::text,''),
          coalesce(m.correlation_id::text,''),
          coalesce(m.idempotency_key_hash,''),
          coalesce(m.request_fingerprint,'')),
        E'\n' ORDER BY m.object_type,m.object_id
      )
      FROM pg_temp.package7_runtime_ownership m
    ),''),
    'sha256'
  ),'hex') AS ownership_manifest_sha256,
  CASE WHEN NOT EXISTS(
    SELECT 1 FROM pg_temp.package7_pre_disposal_results
    WHERE blocking AND result<>'PASS'
  ) THEN 'PASS' ELSE 'FAIL' END AS database_gate_result
FROM pg_temp.package7_fixture_context c;

SELECT * FROM pg_temp.package7_pre_disposal_results
ORDER BY test_name;
SELECT * FROM pg_temp.package7_pre_disposal_contract;
COMMIT;
